"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const s1 = s / 100, l1 = l / 100;
  const a = s1 * Math.min(l1, 1 - l1);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l1 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function PrismColorPicker({ label, value, swatches, onChange }: { label: string; value: string; swatches: string[]; onChange: (color: string) => void }) {
  const [hsl, setHsl] = React.useState(() => hexToHsl(value));
  const spectrumRef = React.useRef<HTMLDivElement>(null);
  const satLightRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState<"spectrum" | "satlight" | null>(null);
  const [hexInput, setHexInput] = React.useState(value);

  React.useEffect(() => { setHsl(hexToHsl(value)); setHexInput(value); }, [value]);

  const commit = React.useCallback((h: number, s: number, l: number) => {
    setHsl([h, s, l]);
    const hex = hslToHex(h, s, l);
    setHexInput(hex);
    onChange(hex);
  }, [onChange]);

  const handleSpectrumMove = React.useCallback((clientX: number) => {
    const rect = spectrumRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const h = Math.round((x / rect.width) * 360);
    commit(h, hsl[1], hsl[2]);
  }, [commit, hsl]);

  const handleSatLightMove = React.useCallback((clientX: number, clientY: number) => {
    const rect = satLightRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    const s = Math.round((x / rect.width) * 100);
    const l = Math.round(100 - (y / rect.height) * 100);
    commit(hsl[0], s, l);
  }, [commit, hsl]);

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      if (dragging === "spectrum") handleSpectrumMove(e.clientX);
      else handleSatLightMove(e.clientX, e.clientY);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [dragging, handleSpectrumMove, handleSatLightMove]);

  return (
    <div>
      <p className="mb-2.5 text-[11px] font-medium text-muted-foreground">{label}</p>

      {/* Saturation–Lightness field */}
      <div
        ref={satLightRef}
        className="relative h-[140px] w-full cursor-crosshair overflow-hidden rounded-lg border border-border"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsl[0]}, 100%, 50%))` }}
        onPointerDown={(e) => { setDragging("satlight"); handleSatLightMove(e.clientX, e.clientY); }}
      >
        <div
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(0,0,0,0.1)]"
          style={{ left: `${hsl[1]}%`, top: `${100 - hsl[2]}%`, backgroundColor: value }}
        />
      </div>

      {/* Hue spectrum strip */}
      <div
        ref={spectrumRef}
        className="relative mt-2.5 h-3.5 w-full cursor-pointer rounded-full border border-border"
        style={{ background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
        onPointerDown={(e) => { setDragging("spectrum"); handleSpectrumMove(e.clientX); }}
      >
        <div
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{ left: `${(hsl[0] / 360) * 100}%`, backgroundColor: `hsl(${hsl[0]}, 100%, 50%)` }}
        />
      </div>

      {/* Swatches + hex input */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {swatches.map((color) => <button key={color} type="button" onClick={() => onChange(color)} className={`size-5 rounded-md border transition-all hover:scale-110 ${value === color ? "border-foreground ring-2 ring-foreground/20 scale-110" : "border-border/60"}`} style={{ backgroundColor: color }} />)}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="size-7 shrink-0 rounded-md border border-border shadow-sm" style={{ backgroundColor: value }} />
          <Input value={hexInput} onChange={(e) => { setHexInput(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value); }} className="w-[76px] text-xs font-mono" maxLength={7} placeholder="#2563eb" />
        </div>
      </div>
    </div>
  );
}
