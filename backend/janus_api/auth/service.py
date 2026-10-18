from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth import schemas
from janus_api.auth.models import (
    EmailChange,
    EmailVerification,
    LoginAttempt,
    PasswordReset,
    Session,
    User,
)
from janus_api.core import email, storage
from janus_api.core.errors import ApiError
from janus_api.core.security import (
    DUMMY_HASH,
    access_token,
    decode_access,
    digest,
    hash_password,
    now,
    random_token,
    verify_password,
)
from janus_api.core.tenancy import set_context
from janus_api.org import service as org
from janus_api.org.schemas import InvitationOut


@dataclass
class Actor:
    user: User
    session: Session
    role: str
    permissions: list[str]


def user_out(user: User) -> schemas.UserOut:
    return schemas.UserOut(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        avatar_url=user.avatar_url,
        timezone=user.timezone,
        language=user.language,
        email_verified_at=user.email_verified_at,
    )


async def email_lock(db: AsyncSession, address: str) -> None:
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"email:{address}"}
    )


async def active_user(db: AsyncSession, user_id: int, *, lock: bool = False) -> User:
    statement = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    # Acquire the user lock before flushing session writes (consistent lock order).
    with db.no_autoflush:
        user = await db.scalar(statement)
    if user is None:
        raise ApiError("unauthorized", "Invalid or expired session.", 401)
    return user


async def create_user(
    db: AsyncSession, name: str, address: str, password: str, *, verified: bool = False
) -> User:
    await email_lock(db, address)
    if await db.scalar(select(User.id).where(User.email == address)):
        raise ApiError("account_unavailable", "Unable to create this account. Try signing in.", 409)
    user = User(
        name=name.strip(),
        email=address,
        password_hash=await hash_password(password),
        email_verified_at=now() if verified else None,
    )
    db.add(user)
    await db.flush()
    await set_context(db, user_id=user.id)
    return user


async def verification_email(db: AsyncSession, user: User, *, resend: bool = False) -> None:
    token = random_token()
    db.add(
        EmailVerification(
            user_id=user.id,
            token_hash=digest(token),
            expires_at=now() + timedelta(hours=24),
            is_resend=resend,
        )
    )
    await db.flush()
    await email.send_token(user.email, "verify-email", token)


async def signup(db: AsyncSession, data: schemas.Signup, ip: str) -> schemas.Message:
    user = await create_user(db, data.name, str(data.email).casefold(), data.password)
    tenant_id = await org.create_workspace(db, user.id, data.business_name.strip())
    await verification_email(db, user)
    record(db, "auth.signup", user_id=user.id, tenant_id=tenant_id, ip=ip)
    return schemas.Message(message="Account created. Check your email to verify it.")


async def issue_session(
    db: AsyncSession, user: User, tenant_id: int, ip: str, device: str
) -> schemas.TokenPair:
    await set_context(db, user_id=user.id, tenant_id=tenant_id)
    await org.membership(db, user.id, tenant_id)
    refresh = random_token()
    session = Session(
        user_id=user.id,
        tenant_id=tenant_id,
        refresh_hash=digest(refresh),
        ip=ip,
        device=device[:512],
        expires_at=now() + timedelta(days=30),
    )
    db.add(session)
    await db.flush()
    return schemas.TokenPair(
        access_token=access_token(user.id, tenant_id, session.id), refresh_token=refresh
    )


async def login(db: AsyncSession, data: schemas.Login, ip: str, device: str) -> schemas.TokenPair:
    address = str(data.email).casefold()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"login:{address}:{ip}"},
    )
    attempt = await db.scalar(
        select(LoginAttempt).where(
            LoginAttempt.email_hash == digest(address), LoginAttempt.ip == ip
        )
    )
    if attempt is None:
        attempt = LoginAttempt(email_hash=digest(address), ip=ip, failed_count=0)
        db.add(attempt)
    user = await db.scalar(
        select(User).where(User.email == address, User.deleted_at.is_(None)).with_for_update()
    )
    await set_context(db, user_id=user.id if user else None)
    valid = await verify_password(user.password_hash if user else DUMMY_HASH, data.password)
    locked = attempt.locked_until is not None and attempt.locked_until > now()
    if locked or not valid or user is None:
        if not locked:
            if attempt.locked_until is not None:
                attempt.failed_count = 0
            attempt.failed_count += 1
            attempt.locked_until = (
                now() + timedelta(minutes=15) if attempt.failed_count >= 5 else None
            )
        attempt.updated_at = now()
        if user:
            user.failed_login_count, user.locked_until = attempt.failed_count, attempt.locked_until
        record(
            db,
            "auth.login_failed",
            user_id=user.id if user else None,
            ip=ip,
            details={"email_hash": digest(address)},
        )
        raise ApiError("invalid_credentials", "Invalid email or password.", 401, commit=True)
    attempt.failed_count, attempt.locked_until = 0, None
    user.failed_login_count, user.locked_until = 0, None
    try:
        tenant_id = await org.first_workspace(db, user.id)
    except ApiError as error:
        record(
            db,
            "auth.login_failed",
            user_id=user.id,
            ip=ip,
            details={"reason": "membership_inactive"},
        )
        error.commit = True
        raise
    pair = await issue_session(db, user, tenant_id, ip, device)
    record(db, "auth.login", user_id=user.id, tenant_id=tenant_id, ip=ip)
    return pair


async def authenticate(db: AsyncSession, token: str) -> Actor:
    user_id, tenant_id, session_id = decode_access(token)
    await set_context(db, user_id=user_id, tenant_id=tenant_id)
    # Lock account before session writes, including concurrent revoke/refresh requests.
    user = await active_user(db, user_id, lock=True)
    session = await db.scalar(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == user_id,
            Session.tenant_id == tenant_id,
            Session.revoked_at.is_(None),
            Session.expires_at > now(),
        )
    )
    if session is None:
        raise ApiError("unauthorized", "Invalid or expired session.", 401)
    _, role = await org.membership(db, user_id, tenant_id)
    session.last_used_at = now()
    return Actor(user, session, role.name, role.permissions)


async def refresh(db: AsyncSession, token: str, ip: str) -> schemas.TokenPair:
    token_hash = digest(token)
    user_id = await db.scalar(text("SELECT refresh_user(:hash)"), {"hash": token_hash})
    if user_id is None:
        record(db, "auth.refresh_rejected", ip=ip)
        raise ApiError("unauthorized", "Invalid or expired refresh token.", 401, commit=True)
    await set_context(db, user_id=int(user_id))
    user = await active_user(db, int(user_id), lock=True)
    session = await db.scalar(
        select(Session)
        .where(
            Session.refresh_hash == token_hash,
            Session.revoked_at.is_(None),
            Session.expires_at > now(),
        )
        .with_for_update()
    )
    if session is None:
        raise ApiError("unauthorized", "Invalid or expired refresh token.", 401)
    await set_context(db, user_id=user.id, tenant_id=session.tenant_id)
    await org.membership(db, user.id, session.tenant_id)
    new_refresh = random_token()
    session.refresh_hash, session.last_used_at = digest(new_refresh), now()
    record(db, "auth.refresh", user_id=user.id, tenant_id=session.tenant_id, ip=ip)
    return schemas.TokenPair(
        access_token=access_token(user.id, session.tenant_id, session.id), refresh_token=new_refresh
    )


async def revoke_sessions(db: AsyncSession, user_id: int, *, except_id: int | None = None) -> None:
    statement = update(Session).where(Session.user_id == user_id, Session.revoked_at.is_(None))
    if except_id is not None:
        statement = statement.where(Session.id != except_id)
    await db.execute(statement.values(revoked_at=now()))


async def logout(
    db: AsyncSession, actor: Actor, ip: str, *, all_sessions: bool = False
) -> schemas.Message:
    await active_user(db, actor.user.id, lock=True)
    if all_sessions:
        await revoke_sessions(db, actor.user.id)
    else:
        actor.session.revoked_at = now()
    record(
        db,
        "auth.logout_all" if all_sessions else "auth.logout",
        user_id=actor.user.id,
        tenant_id=actor.session.tenant_id,
        ip=ip,
    )
    return schemas.Message(message="Logged out.")


async def list_sessions(db: AsyncSession, actor: Actor) -> list[schemas.SessionOut]:
    sessions = (
        await db.scalars(
            select(Session)
            .where(
                Session.user_id == actor.user.id,
                Session.revoked_at.is_(None),
                Session.expires_at > now(),
            )
            .order_by(Session.last_used_at.desc())
        )
    ).all()
    return [
        schemas.SessionOut(
            id=str(s.id),
            tenant_id=str(s.tenant_id),
            device=s.device,
            ip=s.ip,
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            current=s.id == actor.session.id,
        )
        for s in sessions
    ]


async def revoke_device(
    db: AsyncSession, actor: Actor, session_id: int, ip: str
) -> schemas.Message:
    await active_user(db, actor.user.id, lock=True)
    session = await db.scalar(
        select(Session).where(Session.id == session_id, Session.user_id == actor.user.id)
    )
    if not session:
        raise ApiError("not_found", "Session not found.", 404)
    session.revoked_at = now()
    record(
        db,
        "auth.session_revoked",
        user_id=actor.user.id,
        tenant_id=actor.session.tenant_id,
        ip=ip,
        details={"session_id": session_id},
    )
    return schemas.Message(message="Session revoked.")


async def forgot_password(db: AsyncSession, address: str, ip: str) -> schemas.Message:
    user = await db.scalar(
        select(User)
        .where(User.email == address.casefold(), User.deleted_at.is_(None))
        .with_for_update()
    )
    if user:
        await set_context(db, user_id=user.id)
        count = await db.scalar(
            select(func.count())
            .select_from(PasswordReset)
            .where(
                PasswordReset.user_id == user.id,
                PasswordReset.created_at > now() - timedelta(hours=1),
            )
        )
        if (count or 0) < 3:
            token = random_token()
            db.add(
                PasswordReset(
                    user_id=user.id,
                    token_hash=digest(token),
                    expires_at=now() + timedelta(minutes=30),
                )
            )
            await db.flush()
            try:
                await email.send_token(user.email, "reset-password", token)
            except ApiError:
                record(db, "auth.reset_email_failed", user_id=user.id, ip=ip)
        record(db, "auth.password_reset_requested", user_id=user.id, ip=ip)
    return schemas.Message(message="If the account exists, a reset link will be sent.")


async def invalidate_email_tokens(db: AsyncSession, user_id: int) -> None:
    for model in (PasswordReset, EmailVerification, EmailChange):
        await db.execute(
            update(model)
            .where(model.user_id == user_id, model.used_at.is_(None))
            .values(used_at=now())
        )


async def reset_password(db: AsyncSession, data: schemas.ResetPassword, ip: str) -> schemas.Message:
    row = await db.scalar(
        select(PasswordReset).where(PasswordReset.token_hash == digest(data.token))
    )
    if row is None:
        raise ApiError("invalid_token", "Invalid or expired reset link.")
    user = await active_user(db, row.user_id, lock=True)
    await db.refresh(row)
    if row.used_at is not None or row.expires_at <= now():
        raise ApiError("invalid_token", "Invalid or expired reset link.")
    await set_context(db, user_id=user.id)
    user.password_hash = await hash_password(data.new_password)
    await invalidate_email_tokens(db, user.id)
    await revoke_sessions(db, user.id)
    record(db, "auth.password_reset", user_id=user.id, ip=ip)
    return schemas.Message(message="Password reset. Sign in again.")


async def resend_verification(db: AsyncSession, address: str, ip: str) -> schemas.Message:
    # Unknown addresses get the same receipt; only actual sends consume quota.
    user = await db.scalar(
        select(User)
        .where(User.email == address.casefold(), User.deleted_at.is_(None))
        .with_for_update()
    )
    if user and not user.email_verified_at:
        await set_context(db, user_id=user.id)
        count = await db.scalar(
            select(func.count())
            .select_from(EmailVerification)
            .where(
                EmailVerification.user_id == user.id,
                EmailVerification.is_resend.is_(True),
                EmailVerification.created_at > now() - timedelta(hours=1),
            )
        )
        if (count or 0) >= 3:
            raise ApiError("rate_limited", "Try again after one hour.", 429)
        await verification_email(db, user, resend=True)
        record(db, "auth.verification_resent", user_id=user.id, ip=ip)
    return schemas.Message(message="If verification is needed, an email will be sent.")


async def verify_email(db: AsyncSession, token: str, ip: str) -> schemas.Message:
    token_hash = digest(token)
    verification = await db.scalar(
        select(EmailVerification).where(EmailVerification.token_hash == token_hash)
    )
    change = (
        None
        if verification
        else await db.scalar(select(EmailChange).where(EmailChange.token_hash == token_hash))
    )
    row = verification or change
    if row is None:
        raise ApiError("invalid_token", "Invalid or expired verification link.")
    user = await active_user(db, row.user_id, lock=True)
    await db.refresh(row)
    if row.used_at is not None or row.expires_at <= now():
        raise ApiError("invalid_token", "Invalid or expired verification link.")
    await set_context(db, user_id=user.id)
    if change:
        await email_lock(db, change.new_email)
        if await db.scalar(
            select(User.id).where(User.email == change.new_email, User.id != user.id)
        ):
            raise ApiError("email_unavailable", "That email address cannot be used.", 409)
        user.email = change.new_email
        await invalidate_email_tokens(db, user.id)
        await revoke_sessions(db, user.id)
    else:
        await db.execute(
            update(EmailVerification)
            .where(EmailVerification.user_id == user.id, EmailVerification.used_at.is_(None))
            .values(used_at=now())
        )
    user.email_verified_at, row.used_at = now(), now()
    record(db, "auth.email_changed" if change else "auth.email_verified", user_id=user.id, ip=ip)
    return schemas.Message(message="Email verified.")


async def me(db: AsyncSession, actor: Actor) -> schemas.Me:
    tenants = await org.list_workspaces(db, actor.user.id, actor.session.tenant_id)
    current = next(tenant for tenant in tenants if tenant.id == str(actor.session.tenant_id))
    return schemas.Me(
        user=user_out(actor.user),
        tenant=current,
        role=actor.role,
        permissions=actor.permissions,
        tenants=tenants,
    )


async def update_profile(
    db: AsyncSession, actor: Actor, data: schemas.ProfileUpdate, ip: str
) -> schemas.UserOut:
    user = await active_user(db, actor.user.id, lock=True)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None and key not in {"phone", "avatar_url"}:
            raise ApiError("validation_error", f"{key} cannot be null.", 422)
        setattr(user, key, str(value) if value is not None else None)
    record(db, "auth.profile_updated", user_id=user.id, tenant_id=actor.session.tenant_id, ip=ip)
    return user_out(user)


async def avatar(db: AsyncSession, actor: Actor, data: bytes, ip: str) -> schemas.UserOut:
    user = await active_user(db, actor.user.id, lock=True)
    user.avatar_url = await storage.upload_avatar(user.id, data)
    record(db, "auth.avatar_updated", user_id=user.id, tenant_id=actor.session.tenant_id, ip=ip)
    return user_out(user)


async def change_password(
    db: AsyncSession, actor: Actor, data: schemas.ChangePassword, ip: str
) -> schemas.Message:
    user = await active_user(db, actor.user.id, lock=True)
    if not await verify_password(user.password_hash, data.current_password):
        raise ApiError("invalid_password", "Current password is incorrect.", 400)
    user.password_hash = await hash_password(data.new_password)
    await invalidate_email_tokens(db, user.id)
    await revoke_sessions(db, user.id, except_id=actor.session.id)
    record(db, "auth.password_changed", user_id=user.id, tenant_id=actor.session.tenant_id, ip=ip)
    return schemas.Message(message="Password changed. Other sessions revoked.")


async def change_email(
    db: AsyncSession, actor: Actor, data: schemas.ChangeEmail, ip: str
) -> schemas.Message:
    user = await active_user(db, actor.user.id, lock=True)
    if not await verify_password(user.password_hash, data.password):
        raise ApiError("invalid_password", "Password is incorrect.", 400)
    address = str(data.new_email).casefold()
    await email_lock(db, address)
    if await db.scalar(select(User.id).where(User.email == address)):
        raise ApiError("email_unavailable", "That email address cannot be used.", 409)
    await db.execute(
        update(EmailChange)
        .where(EmailChange.user_id == user.id, EmailChange.used_at.is_(None))
        .values(used_at=now())
    )
    token = random_token()
    db.add(
        EmailChange(
            user_id=user.id,
            new_email=address,
            token_hash=digest(token),
            expires_at=now() + timedelta(minutes=30),
        )
    )
    await db.flush()
    await email.send_token(address, "change-email", token)
    record(
        db, "auth.email_change_requested", user_id=user.id, tenant_id=actor.session.tenant_id, ip=ip
    )
    return schemas.Message(message="Verification sent to your new email address.")


async def switch_tenant(
    db: AsyncSession, actor: Actor, tenant_id: int, ip: str, device: str
) -> schemas.TokenPair:
    user = await active_user(db, actor.user.id, lock=True)
    await set_context(db, user_id=user.id, tenant_id=tenant_id)
    await org.membership(db, user.id, tenant_id)
    actor.session.revoked_at = now()
    pair = await issue_session(db, user, tenant_id, ip, device)
    record(db, "auth.tenant_switched", user_id=user.id, tenant_id=tenant_id, ip=ip)
    return pair


async def delete_account(db: AsyncSession, actor: Actor, password: str, ip: str) -> schemas.Message:
    user = await active_user(db, actor.user.id, lock=True)
    if not await verify_password(user.password_hash, password):
        raise ApiError("invalid_password", "Password is incorrect.")
    await org.disable_memberships_for_deletion(db, user.id)
    await revoke_sessions(db, user.id)
    await invalidate_email_tokens(db, user.id)
    user.deleted_at = now()
    record(db, "auth.account_deleted", user_id=user.id, ip=ip)
    return schemas.Message(message="Account deleted.")


async def invitation_details(db: AsyncSession, token: str) -> InvitationOut:
    invite = await org.find_invitation(db, token)
    tenant_name, role_name = await org.invitation_labels(db, invite)
    inviter = await db.get(User, invite.inviter_id)
    return InvitationOut(
        tenant=tenant_name,
        role=role_name,
        inviter=inviter.name if inviter else "Workspace administrator",
    )


async def accept_invitation(
    db: AsyncSession,
    token: str,
    data: schemas.AcceptInvitation,
    access: str | None,
    ip: str,
    device: str,
) -> schemas.TokenPair:
    actor = await authenticate(db, access) if access else None
    invite = await org.find_invitation(db, token, lock=True)
    await email_lock(db, invite.email)
    existing = await db.scalar(select(User).where(User.email == invite.email))
    if existing:
        if not actor or actor.user.id != existing.id:
            raise ApiError("sign_in_required", "Sign in with the invited email to accept.", 401)
        user = await active_user(db, existing.id, lock=True)
    else:
        if actor:
            raise ApiError("email_mismatch", "Sign out to create the invited account.", 403)
        if not data.name or not data.password:
            raise ApiError(
                "validation_error", "Name and password are required for a new account.", 422
            )
        user = await create_user(db, data.name, invite.email, data.password, verified=True)
    user.email_verified_at = user.email_verified_at or now()
    await org.accept_membership(db, invite, user.id)
    pair = await issue_session(db, user, invite.tenant_id, ip, device)
    record(db, "auth.invitation_accepted", user_id=user.id, tenant_id=invite.tenant_id, ip=ip)
    return pair


async def user_directory(db: AsyncSession, user_ids: list[int]) -> dict[int, schemas.UserOut]:
    users = (await db.scalars(select(User).where(User.id.in_(user_ids)))).all()
    return {user.id: user_out(user) for user in users}


async def user_id_for_email(db: AsyncSession, address: str) -> int | None:
    user_id = await db.scalar(select(User.id).where(User.email == address))
    return int(user_id) if user_id is not None else None


async def account_is_active(db: AsyncSession, user_id: int) -> bool:
    return (
        await db.scalar(select(User.id).where(User.id == user_id, User.deleted_at.is_(None)))
        is not None
    )
