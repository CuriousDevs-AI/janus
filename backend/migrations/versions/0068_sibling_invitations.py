"""Accepting one Portfolio invitation accepts the others sent with it.

Sharing the Portfolio with someone across several companies sends one invitation per company, each
with its own link. Following one link joined one company and left the rest waiting. This function
gives, for a valid invitation token, the companies of the other open invitations to the same email,
from the same person, with the same role: only company ids, and only to someone holding the token,
which proves they own that email. A second function says whether a token's invitation was already
accepted, so a person who follows another of those links is told they are in, not that it is
invalid.
"""

from alembic import op

revision = "0068"
down_revision = "0067"


def upgrade() -> None:
    op.execute("""CREATE FUNCTION public.sibling_invitation_tenants(hashed_token text)
        RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public AS $$
        SELECT other.tenant_id FROM public.invitations given
        JOIN public.invitations other
          ON other.email = given.email AND other.inviter_id = given.inviter_id
         AND other.role_id = given.role_id AND other.id <> given.id
        WHERE given.token_hash = hashed_token
          AND given.revoked_at IS NULL AND given.expires_at > now()
          AND other.used_at IS NULL AND other.revoked_at IS NULL AND other.expires_at > now()
        $$""")
    op.execute("REVOKE ALL ON FUNCTION public.sibling_invitation_tenants(text) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.sibling_invitation_tenants(text) TO janus_app")
    op.execute("""CREATE FUNCTION public.invitation_used(hashed_token text)
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public AS $$
        SELECT EXISTS (SELECT 1 FROM public.invitations
          WHERE token_hash = hashed_token AND used_at IS NOT NULL AND revoked_at IS NULL)
        $$""")
    op.execute("REVOKE ALL ON FUNCTION public.invitation_used(text) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.invitation_used(text) TO janus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.invitation_used(text)")
    op.execute("DROP FUNCTION public.sibling_invitation_tenants(text)")
