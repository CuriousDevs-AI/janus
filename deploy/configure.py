"""Generate pilot secrets and validate Compose configuration without printing them."""

import argparse
import base64
import json
import os
import re
import secrets
import stat
import subprocess
import sys
from email.utils import parseaddr
from pathlib import Path

HERE = Path(__file__).resolve().parent


def init(path: Path) -> None:
    contents = (HERE / ".env.example").read_text()
    for key in (
        "POSTGRES_PASSWORD",
        "APP_DB_PASSWORD",
        "WORKER_DB_PASSWORD",
        "JANUS_JWT_SECRET",
        "JANUS_TURN_SECRET",
    ):
        contents = contents.replace(f"GENERATE_{key}", secrets.token_hex(32))
    contents = contents.replace(
        "GENERATE_JANUS_ENCRYPTION_KEY",
        base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
    )
    # Exclusive create protects an existing database's credentials and encryption key.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(contents)
    print("Created private configuration. Fill in domains, SMTP and Meta version on the server.")


def validate(config: dict) -> list[str]:
    services = config["services"]
    pg = services["postgres"]["environment"]
    api = services["api"]["environment"]
    web = services["web"]["environment"]
    proxy = services["proxy"]["environment"]
    errors = []
    passwords = [pg[key] for key in ("POSTGRES_PASSWORD", "APP_DB_PASSWORD", "WORKER_DB_PASSWORD")]
    for key in ("POSTGRES_PASSWORD", "APP_DB_PASSWORD", "WORKER_DB_PASSWORD"):
        if not re.fullmatch(r"[a-f0-9]{64}", pg[key]):
            errors.append(f"{key}: use the generated 64-character hexadecimal password.")
    if len(set(passwords)) != 3:
        errors.append("Database roles must have different passwords.")
    if not re.fullmatch(r"[a-f0-9]{64}", api["JANUS_JWT_SECRET"]):
        errors.append("JANUS_JWT_SECRET: use the generated secret.")
    if not re.fullmatch(r"[a-f0-9]{64}", api.get("JANUS_TURN_SECRET", "")):
        errors.append("JANUS_TURN_SECRET: use a generated 64-character hexadecimal secret.")
    if api.get("JANUS_TURN_SECRET") == api["JANUS_JWT_SECRET"]:
        errors.append("JANUS_TURN_SECRET must differ from JANUS_JWT_SECRET.")
    try:
        key = base64.b64decode(api["JANUS_ENCRYPTION_KEY"], altchars=b"-_", validate=True)
        if len(key) != 32:
            raise ValueError
    except (ValueError, TypeError):
        errors.append("JANUS_ENCRYPTION_KEY: use the generated Fernet key.")
    domains = [proxy["APP_DOMAIN"], proxy["API_DOMAIN"]]
    for domain in domains:
        labels = domain.split(".")
        if (
            len(domain) > 253
            or len(labels) < 2
            or any(
                not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels
            )
            or labels[-1].isdigit()
            or labels[-1] in {"test", "example", "invalid", "localhost", "local"}
            or domain in {"example.com", "example.net", "example.org"}
            or domain.endswith((".example.com", ".example.net", ".example.org"))
        ):
            errors.append(
                "APP_DOMAIN / API_DOMAIN: use real lowercase DNS hostnames, "
                "without a scheme, path or port."
            )
    if domains[0] == domains[1]:
        errors.append("APP_DOMAIN and API_DOMAIN must differ.")
    if (
        web["JANUS_APP_ORIGIN"] != api["JANUS_FRONTEND_URL"]
        or web["JANUS_PUBLIC_API_URL"] != api["JANUS_PUBLIC_API_URL"]
    ):
        errors.append("Frontend and API public origins must match.")
    for key in ("TLS_EMAIL", "JANUS_EMAIL_FROM"):
        value = proxy[key] if key == "TLS_EMAIL" else api[key]
        address = parseaddr(value)[1]
        if (
            "@" not in address
            or "." not in address.rsplit("@", 1)[-1]
            or any(ch in value for ch in "\r\n")
        ):
            errors.append(f"{key}: enter a valid address.")
    if api["JANUS_SMTP_HOST"] in {"localhost", "127.0.0.1", ""}:
        errors.append("JANUS_SMTP_HOST: configure the production SMTP server.")
    if str(api["JANUS_SMTP_STARTTLS"]).lower() != "true":
        errors.append("JANUS_SMTP_STARTTLS must be true for this pilot deployment.")
    try:
        if int(api["JANUS_SMTP_PORT"]) != 587:
            errors.append("JANUS_SMTP_PORT: this setup uses submission port 587 with STARTTLS.")
    except (TypeError, ValueError):
        errors.append("JANUS_SMTP_PORT must be 587.")
    if not api["JANUS_SMTP_USERNAME"] or not api["JANUS_SMTP_PASSWORD"]:
        errors.append("Set JANUS_SMTP_USERNAME and JANUS_SMTP_PASSWORD.")
    if not re.fullmatch(r"v[0-9]{1,3}\.0", api["JANUS_META_GRAPH_VERSION"]):
        errors.append("JANUS_META_GRAPH_VERSION: select a supported version in your Meta app.")
    for service in ("api", "worker", "web"):
        environment = services[service]["environment"]
        if any(
            environment.get(name)
            for name in (
                "JANUS_MIGRATION_DATABASE_URL",
                "POSTGRES_PASSWORD",
                "APP_DB_PASSWORD",
                "WORKER_DB_PASSWORD",
            )
        ):
            errors.append(
                f"{service}: migration/admin credentials must not reach runtime services."
            )
        if services[service].get("ports"):
            errors.append(f"{service}: publish through the HTTPS proxy only.")
    if services["postgres"].get("ports"):
        errors.append("Postgres must not publish a host port.")
    return errors


def check(path: Path) -> None:
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError("Configuration is readable by other users. Run chmod 600 on it.")
    # Let Compose parse quoting/interpolation instead of maintaining another dotenv parser.
    # Never echo config output: it contains database, SMTP and encryption secrets.
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(path),
            "-f",
            str(HERE / "compose.yml"),
            "config",
            "--format",
            "json",
        ],
        capture_output=True,
        check=False,
        text=True,
        timeout=30,
    )
    if result.returncode:
        raise ValueError(
            "Compose configuration is incomplete. Fill every required field in deploy/.env; "
            "details are withheld to protect secrets."
        )
    errors = validate(json.loads(result.stdout))
    if errors:
        raise ValueError("\n".join(dict.fromkeys(errors)))
    print(
        "Configuration passed. DNS, certificates, SMTP delivery and Meta credentials "
        "still need live verification."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "check"])
    parser.add_argument("--env-file", type=Path, default=HERE / ".env")
    args = parser.parse_args()
    try:
        (init if args.action == "init" else check)(args.env_file.resolve())
    except FileExistsError:
        print("Configuration already exists; it was not overwritten.", file=sys.stderr)
        return 1
    except FileNotFoundError:
        print(
            "Configuration or Docker command is missing. "
            "Run init and install Docker Compose first.",
            file=sys.stderr,
        )
        return 1
    except (ValueError, subprocess.TimeoutExpired) as error:
        print(
            str(error) if isinstance(error, ValueError) else "Compose configuration timed out.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
