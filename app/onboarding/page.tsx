"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Globe,
  Mail,
  Webhook,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Handshake,
  LifeBuoy,
  UserRoundPlus,
  MessageSquare,
  Workflow,
  UploadCloud,
  Bot,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 6;

const managementOptions = [
  { key: "sales", label: "Sales", icon: Handshake },
  { key: "support", label: "Customer Support", icon: LifeBuoy },
  { key: "leads", label: "Lead Management", icon: UserRoundPlus },
  { key: "comms", label: "Communication", icon: MessageSquare },
  { key: "automation", label: "Automation", icon: Workflow },
];

const sourceOptions = [
  { key: "website", label: "Website", icon: Globe, active: true },
  { key: "email", label: "Email", icon: Mail, active: true },
  { key: "webhook", label: "Webhook", icon: Webhook, active: false },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, active: false },
  { key: "facebook", label: "Facebook", icon: Share2, active: false },
  { key: "other", label: "Other", icon: MoreHorizontal, active: false },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("CuriousDevs");
  const [industry, setIndustry] = useState("B2B SaaS");
  const [size, setSize] = useState("11-50");
  const [managed, setManaged] = useState<string[]>(["sales", "support", "comms"]);
  const [connected, setConnected] = useState<string[]>(["website", "email"]);
  const [channels, setChannels] = useState<string[]>(["website_chat", "email"]);

  function toggle(list: string[], set: (v: string[]) => void, key: string) {
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  }

  function next() {
    if (step < TOTAL_STEPS) setStep(step + 1);
  }
  function back() {
    if (step > 1) setStep(step - 1);
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center bg-background px-4 py-10">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black,transparent)]" />
      <div className="relative z-10 flex w-full max-w-xl flex-col gap-8">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-sm bg-foreground text-[13px] font-bold text-background">
            C
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[14px] font-semibold text-foreground">
              Curious<span className="text-accent">Devs</span>
            </span>
            <span className="text-[10px] text-muted-foreground">Janus onboarding</span>
          </span>
        </div>

        {/* progress */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={cn("h-1 flex-1 transition-colors", i < step ? "bg-accent" : "bg-surface-3")} />
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-7 min-h-[380px] flex flex-col">
          {step === 1 && (
            <StepWrap
              eyebrow="Welcome"
              title="Let's configure your customer operation."
              description="In a few steps we'll connect your lead sources, knowledge and AI agents — so your team can run sales, communication and support from one system."
            >
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Lead capture", icon: UserRoundPlus },
                  { label: "Communication", icon: MessageSquare },
                  { label: "AI + Automation", icon: Bot },
                ].map((f) => (
                  <div key={f.label} className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-4">
                    <f.icon className="size-4 text-accent" />
                    <span className="text-[11px] text-muted-foreground">{f.label}</span>
                  </div>
                ))}
              </div>
            </StepWrap>
          )}

          {step === 2 && (
            <StepWrap eyebrow="Company" title="Tell us about your company">
              <div className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="company-name">Company name</Label>
                  <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["B2B SaaS", "E-commerce", "Healthtech", "Fintech", "Manufacturing", "Other"].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Company size</Label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["1-10", "11-50", "51-200", "201-500", "500+"].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v} employees
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </StepWrap>
          )}

          {step === 3 && (
            <StepWrap eyebrow="Scope" title="What do you want CuriousDevs to manage?">
              <div className="mt-5 flex flex-col gap-2">
                {managementOptions.map((opt) => {
                  const checked = managed.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggle(managed, setManaged, opt.key)}
                      className={cn(
                        "flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                        checked ? "border-accent-border bg-accent-muted" : "border-border bg-surface-2 hover:border-border-strong"
                      )}
                    >
                      <opt.icon className={cn("size-4", checked ? "text-accent" : "text-muted-foreground")} />
                      <span className="flex-1 text-[13px] text-foreground">{opt.label}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-none border",
                          checked ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface-2"
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </StepWrap>
          )}

          {step === 4 && (
            <StepWrap eyebrow="Connect" title="Connect your lead sources" description="You can add more sources anytime from Settings → Integrations.">
              <div className="mt-5 grid grid-cols-2 gap-3">
                {sourceOptions.map((s) => {
                  const isConnected = connected.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      disabled={!s.active}
                      onClick={() => s.active && toggle(connected, setConnected, s.key)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                        !s.active && "opacity-40 cursor-not-allowed",
                        isConnected ? "border-accent-border bg-accent-muted" : "border-border bg-surface-2 hover:border-border-strong"
                      )}
                    >
                      <s.icon className={cn("size-4", isConnected ? "text-accent" : "text-muted-foreground")} />
                      <span className="flex-1 text-[13px] text-foreground">{s.label}</span>
                      {isConnected ? (
                        <Check className="size-3.5 text-accent" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{s.active ? "" : "Soon"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </StepWrap>
          )}

          {step === 5 && (
            <StepWrap eyebrow="AI setup" title="Configure your AI agent">
              <div className="mt-5 flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => toast.success("Pricing 2026.pdf uploaded — indexing started.")}
                  className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 px-3 py-6 text-center hover:border-accent-border"
                >
                  <UploadCloud className="size-4.5 text-muted-foreground" />
                  <span className="text-[12px] text-foreground">Upload your first knowledge document</span>
                  <span className="text-[11px] text-muted-foreground">PDF, DOCX or a link to your docs site</span>
                </button>

                <div className="flex flex-col gap-1.5">
                  <Label>Choose communication channels for AI</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "website_chat", label: "Website Chat" },
                      { key: "email", label: "Email" },
                      { key: "whatsapp", label: "WhatsApp" },
                    ].map((c) => {
                      const checked = channels.includes(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => toggle(channels, setChannels, c.key)}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                            checked ? "border-accent-border bg-accent-muted text-foreground" : "border-border bg-surface-2 text-muted-foreground"
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[12px] text-muted-foreground">
                  Default agent: <span className="text-foreground">Sales Agent</span> · Model:{" "}
                  <span className="text-foreground">Claude Sonnet 5</span> · Human handoff:{" "}
                  <span className="text-success">Enabled</span>
                </div>
              </div>
            </StepWrap>
          )}

          {step === 6 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full border border-accent-border bg-accent-muted">
                <PartyPopper className="size-5 text-accent" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-[20px] font-semibold text-foreground">Your workspace is ready.</h2>
                <p className="max-w-sm text-[13px] text-muted-foreground">
                  {companyName} is connected — lead capture, communication and your AI agents are live in demo mode.
                </p>
              </div>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between pt-6">
            {step > 1 && step < 6 ? (
              <Button variant="ghost" size="sm" onClick={back}>
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < TOTAL_STEPS ? (
              <Button size="sm" onClick={next}>
                Continue
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button size="sm" className="w-full" onClick={() => router.push("/dashboard")}>
                Enter CuriousDevs
                <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Step {step} of {TOTAL_STEPS}</p>
      </div>
    </div>
  );
}

function StepWrap({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <span className="text-[11px] font-medium uppercase tracking-wide text-accent">{eyebrow}</span>
      <h2 className="mt-1 text-[19px] font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
