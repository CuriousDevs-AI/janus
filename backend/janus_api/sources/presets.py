from dataclasses import dataclass

from janus_api.core.errors import ProcessingError

CANONICAL = tuple(
    (key, key)
    for key in ("name", "email", "phone", "company", "requirement", "campaign", "recording_url")
)


@dataclass(frozen=True)
class Preset:
    label: str
    group: str
    mapping: tuple[tuple[str, str], ...]
    event_id_field: str | None
    instructions: str
    documentation_url: str | None = None


PRESETS = {
    "custom": Preset(
        "Custom",
        "Custom",
        CANONICAL,
        None,
        "POST JSON with Janus HMAC headers and Idempotency-Key.",
    ),
    "exotel": Preset(
        "Exotel",
        "Calls",
        (("CallFrom", "phone"), ("RecordingUrl", "recording_url")),
        "CallSid",
        "Use an async Passthru after Connect/Voicemail in the inbound call flow only. "
        "Use the secret callback URL; Exotel sends GET query parameters. Configure one "
        "final callback per call.",
        "https://support.exotel.com/support/solutions/articles/48283-working-with-passthru-applet",
    ),
    "knowlarity": Preset(
        "Knowlarity",
        "Calls",
        (("caller_id", "phone"), ("resource_url", "recording_url")),
        "uuid",
        "Send the documented CDR JSON format to the secret callback URL. "
        "Call_Type must be Incoming. Configure post-call delivery for this account; this is "
        "not a streaming client.",
        "https://developer.knowlarity.com/",
    ),
    "myoperator": Preset(
        "MyOperator",
        "Calls",
        (("customer_identifier", "phone"), ("payload.recording_filename", "recording_reference")),
        "event_id",
        "Use Webhook v2 Call Ended (call.end), with X-Janus-Token set to the signing secret. "
        "Only incoming call events create leads. Recording filenames are retained as "
        "references, not invented URLs.",
        "https://support.myoperator.com/portal/en/kb/articles/what-is-the-exact-payload-structure-for-every-myoperator-webhook-v2-event",
    ),
    "tata_tele": Preset(
        "Tata Tele",
        "Calls",
        CANONICAL,
        "event_id",
        "Configure an inbound Call hangup (Missed or Answered) JSON webhook with "
        "event_id=$call_id, phone=$customer_number_with_prefix, recording_url=$recording_url, "
        "direction=$direction. Set X-Janus-Token to the signing secret.",
        "https://docs.smartflo.tatatelebusiness.com/docs/webhook",
    ),
    "google_ads_lead_form": Preset(
        "Google Ads Lead Form",
        "Forms/ads",
        CANONICAL,
        "lead_id",
        "Set the form webhook URL and use the signing secret as Google Key. Test leads are "
        "acknowledged without creating contacts.",
        "https://developers.google.com/google-ads/webhook/docs/implementation",
    ),
    "zapier": Preset(
        "Zapier",
        "Automation",
        CANONICAL,
        "event_id",
        "POST JSON with stable event_id and mapped contact fields; set X-Janus-Token to the "
        "signing secret.",
    ),
    "make": Preset(
        "Make",
        "Automation",
        CANONICAL,
        "event_id",
        "POST JSON with stable event_id and mapped contact fields; set X-Janus-Token to the "
        "signing secret.",
    ),
}


def source_value(kind: str, preset: str) -> str:
    if kind == "oauth":
        return "whatsapp"
    if kind == "csv":
        return "csv_import"
    if kind == "embed":
        return "website"
    if kind == "api_key":
        return "api"
    return "phone_call" if PRESETS[preset].group == "Calls" else "webhook"


def value_at(payload: dict[str, object], path: str) -> object:
    value: object = payload
    for segment in path.split("."):
        value = value.get(segment) if isinstance(value, dict) else None
    return value


def contact_payload(preset: str, payload: dict[str, object]) -> dict[str, object]:
    if preset != "google_ads_lead_form":
        return payload
    columns = payload.get("user_column_data")
    if not isinstance(columns, list):
        raise ProcessingError("invalid_google_columns")
    values: dict[str, str] = {}
    for column in columns:
        if not isinstance(column, dict):
            raise ProcessingError("invalid_google_columns")
        key, value = column.get("column_id"), column.get("string_value")
        if not isinstance(key, str) or not isinstance(value, str) or key in values:
            raise ProcessingError("invalid_google_columns")
        values[key] = value
    result: dict[str, object] = {
        "name": values.get("FULL_NAME")
        or " ".join(filter(None, (values.get("FIRST_NAME"), values.get("LAST_NAME")))),
        "phone": values.get("PHONE_NUMBER") or values.get("WORK_PHONE"),
        "email": values.get("EMAIL") or values.get("WORK_EMAIL"),
        "company": values.get("COMPANY_NAME"),
    }
    campaign = payload.get("campaign_id")
    if isinstance(campaign, (str, int)) and not isinstance(campaign, bool):
        result["campaign"] = str(campaign)
    return result
