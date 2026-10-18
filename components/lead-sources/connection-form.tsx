"use client";
import { useState } from "react";
import { api, message } from "@/lib/api/client";
import type {
  FieldMapping,
  MappingTarget,
  Preset,
  Source,
  SourceKind,
} from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const targets: MappingTarget[] = [
  "name",
  "phone",
  "email",
  "company",
  "requirement",
  "campaign",
  "recording_url",
  "recording_reference",
];
const defaults: FieldMapping[] = [
  "name",
  "phone",
  "email",
  "company",
  "requirement",
].map((field) => ({ rawField: field, mapsTo: field as MappingTarget }));
export const selectClass =
  "h-8 w-full rounded-md border border-input bg-surface-2 px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ConnectionForm({
  kind,
  presets,
  initial,
  callsOnly = false,
  initialPreset,
  onSaved,
}: {
  kind: Exclude<SourceKind, "oauth">;
  presets: Preset[];
  initial?: Source;
  callsOnly?: boolean;
  initialPreset?: string;
  onSaved: (source: Source) => void;
}) {
  const [preset, setPreset] = useState(
    initial?.preset || initialPreset || (callsOnly ? "exotel" : "custom"),
  );
  const [mapping, setMapping] = useState<FieldMapping[]>(
    initial?.fieldMapping || defaults,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = presets.find((p) => p.value === preset);
  const showMapping =
    kind === "csv" || (kind === "webhook" && preset === "custom");
  return (
    <form
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const values = new FormData(event.currentTarget);
        try {
          const body = {
            name: values.get("name"),
            description: values.get("description"),
            connectionKind: kind,
            preset: kind === "webhook" ? preset : "custom",
            ...(showMapping
              ? { fieldMapping: mapping }
              : initial?.preset === preset
                ? { fieldMapping: initial.fieldMapping }
                : {}),
            ...(initial?.preset === preset
              ? { eventIdField: initial.eventIdField }
              : {}),
            allowedOrigins:
              kind === "embed"
                ? String(values.get("origins")).split(/\s+/).filter(Boolean)
                : [],
            ...(initial ? { status: values.get("status") } : {}),
          };
          const source = await api<Source>(
            initial ? `/sources/${initial.id}` : "/sources",
            { method: initial ? "PUT" : "POST", body: JSON.stringify(body) },
          );
          onSaved(source);
        } catch (error) {
          setError(message(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="source-name">Connection name</Label>
        <Input
          id="source-name"
          name="name"
          required
          maxLength={120}
          defaultValue={
            initial?.name ||
            {
              embed: "Website enquiries",
              webhook: callsOnly ? "Phone enquiries" : "Custom Webhook",
              api_key: "REST API",
              csv: "CSV Import",
            }[kind]
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="source-description">Description</Label>
        <Input
          id="source-description"
          name="description"
          maxLength={1000}
          defaultValue={initial?.description}
        />
      </div>
      {kind === "embed" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source-origins">Allowed website origins</Label>
          <Textarea
            id="source-origins"
            name="origins"
            required
            placeholder="https://yourcompany.in"
            defaultValue={initial?.allowedOrigins.join("\n")}
          />
          <p className="text-xs text-muted-foreground">
            One origin per line, including https://. No paths or wildcards.
          </p>
        </div>
      )}
      {kind === "webhook" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="source-preset">Provider preset</Label>
          <select
            id="source-preset"
            className={selectClass}
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setMapping(
                presets.find((p) => p.value === e.target.value)?.fieldMapping ||
                  defaults,
              );
            }}
          >
            {["Calls", "Forms/ads", "Automation", "Custom"]
              .filter(
                (group) => !callsOnly || ["Calls", "Custom"].includes(group),
              )
              .map((group) => (
                <optgroup key={group} label={group}>
                  {presets
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
          {selected && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {selected.instructions}{" "}
              {selected.documentationUrl && (
                <a
                  href={selected.documentationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent"
                >
                  Provider instructions ↗
                </a>
              )}
            </p>
          )}
        </div>
      )}
      {showMapping && (
        <fieldset className="flex flex-col gap-2 border border-border p-3">
          <legend className="px-1 text-xs font-medium">Field mapping</legend>
          <p className="text-xs text-muted-foreground">
            {kind === "csv"
              ? "Match CSV headers exactly. Include a phone or email column."
              : "Use dotted paths for nested fields, such as caller.phone."}
          </p>
          {mapping.map((row, index) => (
            <div key={index} className="flex gap-2">
              <Input
                aria-label={`Incoming field ${index + 1}`}
                required
                value={row.rawField}
                maxLength={200}
                onChange={(e) =>
                  setMapping((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, rawField: e.target.value } : r,
                    ),
                  )
                }
              />
              <select
                aria-label={`Contact field ${index + 1}`}
                className={selectClass}
                value={row.mapsTo}
                onChange={(e) =>
                  setMapping((rows) =>
                    rows.map((r, i) =>
                      i === index
                        ? { ...r, mapsTo: e.target.value as MappingTarget }
                        : r,
                    ),
                  )
                }
              >
                {targets.map((target) => (
                  <option key={target} value={target}>
                    {target.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                type="button"
                aria-label={`Remove mapping ${index + 1}`}
                disabled={mapping.length === 1}
                onClick={() =>
                  setMapping((rows) => rows.filter((_, i) => i !== index))
                }
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={mapping.length >= targets.length}
            onClick={() =>
              setMapping((rows) => [
                ...rows,
                {
                  rawField: "",
                  mapsTo:
                    targets.find(
                      (target) => !rows.some((r) => r.mapsTo === target),
                    ) || "name",
                },
              ])
            }
          >
            Add field
          </Button>
        </fieldset>
      )}
      {initial && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source-status">Status</Label>
          <select
            id="source-status"
            name="status"
            className={selectClass}
            defaultValue={initial.status}
          >
            <option value="connected">Enabled</option>
            <option value="available">Paused</option>
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button className="self-start" disabled={busy}>
        {busy ? "Saving…" : initial ? "Save connection" : "Create connection"}
      </Button>
    </form>
  );
}
