"""One local check for generated secrets and the actual Compose service boundaries."""

import json
import runpy
import stat
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
configure = runpy.run_path(str(root / "deploy/configure.py"))
with tempfile.TemporaryDirectory(prefix="janus-pilot-config-") as directory:
    path = Path(directory) / ".env"
    configure["init"](path)
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    original = path.read_bytes()
    try:
        configure["init"](path)
        raise AssertionError("Existing credentials must not be overwritten")
    except FileExistsError:
        assert path.read_bytes() == original
    values = {
        "APP_DOMAIN": "app.janus-pilot.in",
        "API_DOMAIN": "api.janus-pilot.in",
        "TLS_EMAIL": "ops@janus-pilot.in",
        "JANUS_EMAIL_FROM": "Janus <hello@janus-pilot.in>",
        "JANUS_SMTP_HOST": "smtp.janus-pilot.in",
        "JANUS_SMTP_USERNAME": "test-user",
        "JANUS_SMTP_PASSWORD": "'literal-$-password'",
        "JANUS_META_GRAPH_VERSION": "v99.0",
    }
    content = path.read_text()
    for key, value in values.items():
        content = content.replace(f"{key}=\n", f"{key}={value}\n")
    path.write_text(content)
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(path),
            "-f",
            str(root / "deploy/compose.yml"),
            "config",
            "--format",
            "json",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    config = json.loads(result.stdout)
    assert not configure["validate"](config)
    api = config["services"]["api"]["environment"]
    # Compose escapes dollar signs when serializing reusable configuration.
    assert api["JANUS_SMTP_PASSWORD"].replace("$$", "$") == "literal-$-password"
    assert set(config["services"]["web"]["environment"]) == {
        "JANUS_API_URL",
        "JANUS_APP_ORIGIN",
        "JANUS_PUBLIC_API_URL",
    }
    assert "JANUS_SMTP_PASSWORD" not in config["services"]["worker"]["environment"]
    assert {s for s, v in config["services"].items() if v.get("ports")} == {"proxy"}
    config["services"]["proxy"]["environment"]["APP_DOMAIN"] = "https://bad.example/path"
    api["JANUS_ENCRYPTION_KEY"] = "invalid"
    api["POSTGRES_PASSWORD"] = "must-not-reach-api"
    assert len(configure["validate"](config)) >= 3
print(
    "Passed: secret generation, no overwrite, literal SMTP password, "
    "config validation and private service boundaries."
)
