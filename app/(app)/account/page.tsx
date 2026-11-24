"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell, Eye, Globe, Loader2, LockKeyhole, Monitor, Moon, Palette, PanelLeft, Sparkles, Sun, Type, UserRound } from "lucide-react";
import { PrismColorPicker } from "@/components/shared/prism-color-picker";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileCard } from "@/components/settings/profile-card";
import { SecuritySection } from "@/components/settings/security-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { SettingRow } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/layout/workspace-context";
import { scoped } from "@/lib/company";
import { applyAppearance, clearAppearance } from "@/lib/appearance";

const tabDefs = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "security", label: "Security & sessions", icon: LockKeyhole },
] as const;
type Tab = (typeof tabDefs)[number]["value"];

export default function AccountPage() {
  return <React.Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}><Account /></React.Suspense>;
}

function Account() {
  const params = useSearchParams();
  const { workspaceId } = useWorkspace();
  const tab: Tab = tabDefs.find((item) => item.value === params.get("tab"))?.value ?? "profile";
  const href = (value: Tab) => `/account?tab=${value}${workspaceId ? `&workspace=${workspaceId}` : ""}`;
  return <div className="mx-auto flex w-full max-w-[960px] flex-col pb-10">
    <PageHeader title="My account" description="You, across every company and workspace: your details, how you sign in, and what Janus sends you." />
    <nav aria-label="My account" className="janus-tab-strip mx-6 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">
      {tabDefs.map((item) => { const Icon = item.icon; return <Link key={item.value} href={href(item.value)} replace scroll={false} aria-current={item.value === tab ? "page" : undefined}
        className={`flex items-center gap-1.5 shrink-0 rounded-sm px-3 py-2 text-xs transition-all ${item.value === tab ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"}`}><Icon className="size-3.5" />{item.label}</Link>; })}
    </nav>
    <div className="mt-5 px-6">
      {tab === "profile" && <div className="flex flex-col gap-5"><ProfileCard /></div>}
      {tab === "appearance" && <AccountAppearanceTab />}
      {tab === "security" && <SecuritySection />}
      {tab === "notifications" && <NotificationsSection />}
    </div>
  </div>;
}

type AccountPrefs = {
  accentColor?: string;
  colorTheme?: string;
  themeMode?: string;
  fontFamily?: string;
  fontScale?: string;
  contentDensity?: string;
  borderRadius?: string;
  reduceMotion?: boolean;
  highContrast?: boolean;
  focusIndicators?: string;
  dateFormat?: string;
  timeFormat?: string;
  numberFormat?: string;
  firstDayOfWeek?: string;
  currencyDisplay?: string;
  language?: string;
};

function readAccountPrefs(): AccountPrefs { try { return JSON.parse(window.localStorage.getItem(scoped("janus.account.appearance")) ?? "{}"); } catch { return {}; } }
function saveAccountPrefs(prefs: AccountPrefs) { try { window.localStorage.setItem(scoped("janus.account.appearance"), JSON.stringify(prefs)); } catch {} }

const THEMES: Array<{ id: string; name: string; accent: string; desc: string }> = [
  { id: "default", name: "Janus Default", accent: "#2563eb", desc: "Clean blue — the standard Janus look." },
  { id: "ocean", name: "Ocean", accent: "#0ea5e9", desc: "Light sky tones for a calm, airy feel." },
  { id: "forest", name: "Forest", accent: "#16a34a", desc: "Green accents for growth-focused teams." },
  { id: "sunset", name: "Sunset", accent: "#ea580c", desc: "Warm orange for energy and urgency." },
  { id: "violet", name: "Violet", accent: "#7c3aed", desc: "Purple tones for creative workspaces." },
  { id: "rose", name: "Rose", accent: "#e11d48", desc: "Bold pink for HR and people teams." },
  { id: "slate", name: "Slate", accent: "#475569", desc: "Neutral grey for a professional look." },
  { id: "midnight", name: "Midnight", accent: "#6366f1", desc: "Indigo accent — enterprise feel." },
  { id: "charcoal", name: "Charcoal", accent: "#2563eb", desc: "Blue accents — developer-friendly." },
  { id: "custom", name: "Custom", accent: "", desc: "Pick your own accent color." },
];

const SWATCHES = ["#2563eb", "#0ea5e9", "#16a34a", "#ea580c", "#7c3aed", "#e11d48", "#475569", "#6366f1", "#0d9488", "#d97706", "#db2777", "#4f46e5"];

function AccountAppearanceTab() {
  const [prefs, setPrefs] = React.useState(() => readAccountPrefs());
  const selectedTheme = THEMES.find((t) => t.id === (prefs.colorTheme ?? "default")) ?? THEMES[0];

  function update(patch: Partial<AccountPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveAccountPrefs(next);
    applyAppearance(next);
  }

  function selectTheme(id: string) {
    const theme = THEMES.find((t) => t.id === id);
    if (!theme || id === "custom") { update({ colorTheme: "custom" }); return; }
    update({ colorTheme: id, accentColor: theme.accent });
  }

  function resetAll() {
    try { window.localStorage.removeItem(scoped("janus.account.appearance")); } catch {}
    setPrefs({});
    clearAppearance();
    toast.success("Appearance reset to defaults");
  }

  return <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">Appearance</p>
        <p className="mt-1 text-xs text-muted-foreground">Your default look across the Portfolio, account pages and any area that doesn&apos;t have its own workspace settings. Workspace-level appearance overrides these when inside that workspace.</p>
      </div>
      <Button size="sm" variant="outline" onClick={resetAll} className="shrink-0 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">Reset defaults</Button>
    </div>

    {/* Theme mode */}
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><Monitor className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Theme mode</p></div>
      <p className="mb-3 text-[11px] text-muted-foreground">Choose light, dark or match your system preference.</p>
      <div className="grid grid-cols-3 gap-2">
        {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const).map(([mode, label, Icon]) => <button key={mode} type="button" onClick={() => update({ themeMode: mode })} className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-all hover:shadow-sm ${(prefs.themeMode ?? "light") === mode ? "border-accent-border bg-accent-muted shadow-sm" : "border-border bg-surface hover:bg-surface-2"}`}>
          <Icon className="size-5 text-foreground" />
          <span className="text-xs font-medium">{label}</span>
        </button>)}
      </div>
    </div>

    {/* Color theme */}
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><Palette className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Color theme</p></div>
      <p className="mb-3 text-[11px] text-muted-foreground">Choose a preset or define a custom accent color. This applies wherever workspace settings don&apos;t override.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {THEMES.map((theme) => <button key={theme.id} type="button" onClick={() => selectTheme(theme.id)} className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:shadow-sm ${selectedTheme.id === theme.id ? "border-accent-border bg-accent-muted shadow-sm" : "border-border bg-surface hover:bg-surface-2"}`}>
          {theme.id !== "custom"
            ? <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border" style={{ backgroundColor: theme.accent }}><span className="size-2.5 rounded-full bg-white/50" /></span>
            : <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-surface"><Sparkles className="size-3 text-muted-foreground" /></span>}
          <span className="min-w-0"><span className="block text-xs font-medium">{theme.name}</span><span className="block text-[10px] text-muted-foreground">{theme.desc}</span></span>
        </button>)}
      </div>

      {selectedTheme.id === "custom" && <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4">
        <PrismColorPicker label="Accent color" value={prefs.accentColor ?? "#2563eb"} swatches={SWATCHES} onChange={(color) => update({ accentColor: color })} />
      </div>}
    </div>

    {/* Typography */}
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><Type className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Typography</p></div>
      <div className="flex flex-col gap-1">
        <SettingRow label="Font family" description="The typeface used across Janus.">
          <Select value={prefs.fontFamily ?? "inter"} onValueChange={(v) => update({ fontFamily: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inter">Inter (default)</SelectItem>
              <SelectItem value="system">System font</SelectItem>
              <SelectItem value="mono">JetBrains Mono</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Font scale" description="Adjust the base font size.">
          <Select value={prefs.fontScale ?? "100"} onValueChange={(v) => update({ fontScale: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="85">Small (85%)</SelectItem>
              <SelectItem value="90">Compact (90%)</SelectItem>
              <SelectItem value="100">Default (100%)</SelectItem>
              <SelectItem value="110">Large (110%)</SelectItem>
              <SelectItem value="120">Extra large (120%)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </div>

    {/* Layout & density */}
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><PanelLeft className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Layout & density</p></div>
      <div className="flex flex-col gap-1">
        <SettingRow label="Content density" description="How tight the UI feels — more content or more breathing room.">
          <Select value={prefs.contentDensity ?? "comfortable"} onValueChange={(v) => update({ contentDensity: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="comfortable">Comfortable</SelectItem>
              <SelectItem value="spacious">Spacious</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Corner roundness" description="Border radius on cards, buttons and inputs.">
          <Select value={prefs.borderRadius ?? "0px"} onValueChange={(v) => update({ borderRadius: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0px">Sharp (0px)</SelectItem>
              <SelectItem value="4px">Subtle (4px)</SelectItem>
              <SelectItem value="8px">Rounded (8px)</SelectItem>
              <SelectItem value="12px">Soft (12px)</SelectItem>
              <SelectItem value="16px">Pill (16px)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </div>

    {/* Accessibility */}
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><Eye className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Accessibility</p></div>
      <div className="flex flex-col gap-1">
        <SettingRow label="Reduce motion" description="Minimize animations and transitions for motion sensitivity.">
          <Switch checked={prefs.reduceMotion ?? false} onCheckedChange={(checked) => update({ reduceMotion: checked })} />
        </SettingRow>
        <SettingRow label="High contrast" description="Increase contrast between text and backgrounds.">
          <Switch checked={prefs.highContrast ?? false} onCheckedChange={(checked) => update({ highContrast: checked })} />
        </SettingRow>
        <SettingRow label="Focus indicators" description="How visible keyboard focus outlines are.">
          <Select value={prefs.focusIndicators ?? "default"} onValueChange={(v) => update({ focusIndicators: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="enhanced">Enhanced</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </div>

    {/* Regional display */}
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><Globe className="size-3.5 text-accent" /><p className="text-xs font-medium text-foreground">Regional display</p></div>
      <div className="flex flex-col gap-1">
        <SettingRow label="Language" description="Display language across Janus.">
          <Select value="en" onValueChange={() => {}}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="hi" disabled>Hindi (coming soon)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Date format" description="How dates appear in tables, forms and reports.">
          <Select value={prefs.dateFormat ?? "DD/MM/YYYY"} onValueChange={(v) => update({ dateFormat: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              <SelectItem value="DD-MMM-YYYY">DD-MMM-YYYY</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Time format" description="12-hour with AM/PM or 24-hour clock.">
          <Select value={prefs.timeFormat ?? "12h"} onValueChange={(v) => update({ timeFormat: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
              <SelectItem value="24h">24-hour (14:30)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Number format" description="How large numbers are grouped.">
          <Select value={prefs.numberFormat ?? "indian"} onValueChange={(v) => update({ numberFormat: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="indian">Indian (1,00,000)</SelectItem>
              <SelectItem value="international">Intl (100,000)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Currency display" description="Show the symbol or the ISO code.">
          <Select value={prefs.currencyDisplay ?? "symbol"} onValueChange={(v) => update({ currencyDisplay: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="symbol">Symbol (&#x20b9;)</SelectItem>
              <SelectItem value="code">Code (INR)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="First day of week" description="Which day calendars and week views start on.">
          <Select value={prefs.firstDayOfWeek ?? "monday"} onValueChange={(v) => update({ firstDayOfWeek: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monday">Monday</SelectItem>
              <SelectItem value="sunday">Sunday</SelectItem>
              <SelectItem value="saturday">Saturday</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </div>

    {/* Live preview */}
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
      <div className="flex gap-3 overflow-hidden rounded-lg border border-border" style={{ fontSize: `${Number(prefs.fontScale ?? 100) / 100}em` }}>
        <div className="w-14 shrink-0 border-r border-border bg-surface-2 p-2">
          {[0, 1, 2].map((i) => <div key={i} className="mb-1.5 h-2 rounded bg-muted-foreground/10" style={{ width: i === 0 ? "80%" : "60%" }} />)}
        </div>
        <div className="flex-1 p-3">
          <div className="mb-2 h-3 rounded bg-muted-foreground/10" style={{ width: "35%" }} />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded border border-border bg-surface" style={{ borderRadius: prefs.borderRadius ?? "0px" }} />)}
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-7 flex-1 rounded border border-border bg-surface" style={{ borderRadius: prefs.borderRadius ?? "0px" }} />
            <div className="flex h-7 items-center justify-center rounded px-4 text-[10px] font-medium text-white" style={{ backgroundColor: prefs.accentColor ?? "#2563eb", borderRadius: prefs.borderRadius ?? "0px" }}>Save</div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
