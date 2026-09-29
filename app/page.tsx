"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Plus, RotateCcw, Save, Sparkles, Trash2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Wave = "sine" | "triangle" | "saw";
type RenderMode = "lines" | "dots";
type WidthCurve = "linear" | "ease-in" | "ease-out";
type Person = { id: string; name: string; role: "host" | "guest"; image: string };
type SeasonPreset = {
  id: string; name: string; version: number; generatorVersion: string;
  carrier: { wave: Wave; frequency: number; amplitude: number };
  modulator: { wave: Wave; ratio: number; depth: number; phase: number };
  field: {
    lineCount: number; rotation: number; warp: number; mode: RenderMode;
    firstWidth: number; lastWidth: number; widthCurve: WidthCurve;
    relief: number; depthTint: number; perspective: number; phaseSpread: number;
  };
  variation: { phase: number; ratio: number; warp: number };
};
type Episode = {
  number: number; title: string; subtitle: string; tag: string; accent: string;
  people: Person[]; seedOverride: string;
};

const PURPLE = "#29022F";
const LIME = "#94F20D";
const STORAGE_PRESETS = "allesokai-cover-presets-v4";
const STORAGE_DRAFT = "allesokai-cover-draft-v4";

const initialPreset: SeasonPreset = {
  id: "season-01", name: "Season 01 / Contour Relief", version: 1, generatorVersion: "relief-2.0",
  carrier: { wave: "sine", frequency: 1.45, amplitude: 0.135 },
  modulator: { wave: "sine", ratio: 2.3, depth: 0.42, phase: 0.2 },
  field: {
    lineCount: 34, rotation: -5, warp: 0.18, mode: "lines",
    firstWidth: 4, lastWidth: 12, widthCurve: "ease-in",
    relief: 0.62, depthTint: 0.42, perspective: 0.34, phaseSpread: 0.22,
  },
  variation: { phase: 0.45, ratio: 0.2, warp: 0.12 },
};

const initialEpisode: Episode = {
  number: 216, title: "Wenn Maschinen plötzlich mitdenken",
  subtitle: "mit einem Blick hinter die Modelle", tag: "Interview", accent: LIME, seedOverride: "",
  people: [
    { id: "dennis", name: "Dennis", role: "host", image: "/assets/hosts/dennis.jpg" },
    { id: "jan", name: "Jan", role: "host", image: "/assets/hosts/jan.jpg" },
  ],
};

const guestSamples = ["/assets/guests/random-person1.jpeg", "/assets/guests/random-person2.jpeg", "/assets/guests/random-person3.jpeg"];

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wave(kind: Wave, value: number) {
  const phase = ((value % 1) + 1) % 1;
  if (kind === "triangle") return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
  if (kind === "saw") return phase * 2 - 1;
  return Math.sin(phase * Math.PI * 2);
}

function clamp(value: number, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
function curveDepth(value: number, curve: WidthCurve) {
  if (curve === "ease-in") return value * value;
  if (curve === "ease-out") return 1 - (1 - value) * (1 - value);
  return value;
}
function mixHex(from: string, to: string, amount: number) {
  const parse = (color: string) => color.replace("#", "").match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [0, 0, 0];
  const a = parse(from); const b = parse(to); const t = clamp(amount);
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * t).toString(16).padStart(2, "0")).join("")}`;
}

function normalizedTitle(title: string) { return title.trim().toLowerCase().replace(/\s+/g, " "); }
function episodeSeed(episode: Episode, preset: SeasonPreset, format: string) {
  const identity = episode.seedOverride.trim() || `alles-ok-ai:${episode.number}:${normalizedTitle(episode.title)}`;
  return `${identity}:${preset.id}:v${preset.version}:${format}`;
}

function wrapTitle(text: string, maxCharacters: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean); const lines: string[] = []; let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxCharacters || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  const overflow = lines.length > maxLines || text.length > maxCharacters * maxLines;
  const visible = lines.slice(0, maxLines);
  if (overflow && visible.length) visible[visible.length - 1] = `${visible[visible.length - 1].replace(/[.,;:!?-]*$/, "")}…`;
  return { lines: visible, overflow };
}

function patternGeometry(preset: SeasonPreset, seedKey: string, width: number, height: number) {
  const random = mulberry32(hashString(seedKey));
  const phaseShift = (random() - 0.5) * preset.variation.phase;
  const ratioShift = (random() - 0.5) * preset.variation.ratio;
  const warpShift = (random() - 0.5) * preset.variation.warp;
  const paths: Array<{ d: string; depth: number }> = [];
  const dots: Array<{ x: number; y: number; depth: number }> = [];
  const count = preset.field.lineCount; const marginLines = Math.ceil(count * 0.38); const overscan = 0.28;
  for (let lineIndex = -marginLines; lineIndex < count + marginLines; lineIndex += 1) {
    const points: Array<[number, number]> = [];
    for (let step = 0; step <= 70; step += 1) {
      const x = -overscan + (step / 70) * (1 + overscan * 2); const rawDepth = (lineIndex + 0.5) / count;
      const depth = clamp(rawDepth); const baseY = rawDepth < 0 || rawDepth > 1 ? rawDepth : Math.pow(rawDepth, 1 + preset.field.perspective * 1.35);
      const mod = wave(preset.modulator.wave, x * (preset.carrier.frequency * (preset.modulator.ratio + ratioShift)) + preset.modulator.phase + phaseShift + depth * preset.field.phaseSpread);
      const carrier = wave(preset.carrier.wave, x * preset.carrier.frequency + phaseShift + lineIndex * 0.016 + depth * preset.field.phaseSpread + mod * preset.modulator.depth);
      const spatial = Math.sin((x * 1.7 + baseY * 1.25 + phaseShift) * Math.PI * 2);
      const amplitudeDepth = 0.7 + depth * preset.field.perspective * 0.85;
      const y = baseY + carrier * preset.carrier.amplitude * amplitudeDepth + spatial * (preset.field.warp + warpShift) * 0.18;
      points.push([x * width, y * height]);
      if (preset.field.mode === "dots" && step % 3 === 0) dots.push({ x: x * width, y: y * height, depth });
    }
    paths.push({ d: points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "), depth: clamp((lineIndex + 0.5) / count) });
  }
  return { paths, dots };
}

function Pattern({ preset, seedKey, width, height, clipId, accent }: { preset: SeasonPreset; seedKey: string; width: number; height: number; clipId: string; accent: string }) {
  const geometry = useMemo(() => patternGeometry(preset, seedKey, width, height), [preset, seedKey, width, height]);
  const scale = width / 1000;
  const lineWidth = (depth: number) => (preset.field.firstWidth + (preset.field.lastWidth - preset.field.firstWidth) * curveDepth(depth, preset.field.widthCurve)) * scale;
  const lineColor = (depth: number) => mixHex(accent, "#FFFFFF", 0.14 + preset.field.depthTint * (1 - depth));
  const shadowColor = mixHex(accent, PURPLE, 0.34);
  return <g clipPath={`url(#${clipId})`}>
    <g transform={`rotate(${preset.field.rotation} ${width / 2} ${height / 2})`}>
      {preset.field.mode === "lines" ? geometry.paths.map((path, index) => {
        const thickness = lineWidth(path.depth); const relief = preset.field.relief * 5 * scale;
        return <g key={index}>
          <path d={path.d} fill="none" stroke={shadowColor} strokeOpacity={0.2 + preset.field.relief * 0.22} strokeWidth={thickness + relief * 2.2} strokeLinecap="round" transform={`translate(0 ${relief.toFixed(2)})`} />
          <path d={path.d} fill="none" stroke={accent} strokeOpacity="0.96" strokeWidth={thickness + relief * 1.35} strokeLinecap="round" />
          <path d={path.d} fill="none" stroke={lineColor(path.depth)} strokeOpacity={0.76 + (1 - path.depth) * 0.2} strokeWidth={thickness} strokeLinecap="round" />
        </g>;
      }) : geometry.dots.map((dot, index) => {
        const radius = Math.max(2.2 * scale, lineWidth(dot.depth) * 0.48); const relief = preset.field.relief * 2.4 * scale;
        return <g key={index}><circle cx={dot.x} cy={dot.y + relief} r={radius + relief * 0.45} fill={shadowColor} opacity="0.28" /><circle cx={dot.x} cy={dot.y} r={radius} fill={lineColor(dot.depth)} opacity={0.76 + (1 - dot.depth) * 0.2} /></g>;
      })}
    </g>
  </g>;
}

type CoverProps = { episode: Episode; preset: SeasonPreset; format: "square" | "story"; logoData: string; svgRef?: React.RefObject<SVGSVGElement | null> };
function CoverArt({ episode, preset, format, logoData, svgRef }: CoverProps) {
  const square = format === "square"; const width = square ? 1000 : 1080; const height = square ? 1000 : 1920;
  const seedKey = episodeSeed(episode, preset, "shared-pattern"); const clipId = `field-${format}-${hashString(seedKey)}`;
  const title = wrapTitle(episode.title, square ? 19 : 18, square ? 3 : 5); const people = episode.people.slice(0, 3);
  const episodeLabel = String(episode.number).padStart(3, "0");
  const logoHref = logoData ? logoData.replace(/%2394f20d/gi, encodeURIComponent(episode.accent)) : "/assets/logo/allesokai-de-logo.svg";
  const portraitSize = square ? 158 : 210; const portraitGap = -Math.round(portraitSize * 0.12); const portraitStart = square ? 104 : 62;
  const portraitY = square ? 708 : 1450; const titleX = square ? 112 : 92; const titleY = square ? 320 : 385;
  const lineHeight = square ? 88 : 118; const titleSize = square ? (episode.title.length > 48 ? 68 : 78) : episode.title.length > 48 ? 90 : 102;
  const field = square ? { x: 22, y: 23, w: 956, h: 760, r: 56 } : { x: 40, y: 42, w: 1000, h: 1545, r: 72 };

  return <svg ref={svgRef} className={`cover-svg cover-svg--${format}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${square ? "Square" : "9 by 16"} cover preview for episode ${episodeLabel}`} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id={clipId}><rect x={field.x} y={field.y} width={field.w} height={field.h} rx={field.r} /></clipPath>
      {people.map((person, index) => <clipPath key={person.id} id={`portrait-${format}-${person.id}`}><circle cx={portraitStart + index * (portraitSize + portraitGap) + portraitSize / 2} cy={portraitY + portraitSize / 2} r={portraitSize / 2 - 8} /></clipPath>)}
    </defs>
    <rect width={width} height={height} fill={PURPLE} />
    <rect x={field.x} y={field.y} width={field.w} height={field.h} rx={field.r} fill={episode.accent} />
    <Pattern preset={preset} seedKey={seedKey} width={width} height={height} clipId={clipId} accent={episode.accent} />
    <path d={square ? "M0 0H450V78Q450 126 402 126H0Z" : "M0 0H650V108Q650 180 578 180H0Z"} fill={PURPLE} />
    <text x={square ? 45 : 62} y={square ? 86 : 123} fontFamily="SpockPro" fontSize={square ? 52 : 72} letterSpacing="1" fill={episode.accent}>EPISODE</text>
    <text x={square ? 292 : 402} y={square ? 86 : 123} fontFamily="SpockPro" fontWeight="700" fontSize={square ? 54 : 76} fill="#FFFFFF">{episodeLabel}</text>
    <text x={titleX} y={titleY} fontFamily="SpockEssBlack" fontWeight="900" fontSize={titleSize} letterSpacing="-2.5" fill={PURPLE}>
      {title.lines.map((line, index) => <tspan key={line + index} x={titleX} dy={index === 0 ? 0 : lineHeight}>{line}</tspan>)}
    </text>
    {episode.subtitle && <text x={titleX + 6} y={titleY + Math.max(0, title.lines.length - 1) * lineHeight + (square ? 44 : 58)} fontFamily="SpockEss" fontSize={square ? 36 : 48} fill={PURPLE}>{episode.subtitle}</text>}
    {people.map((person, index) => {
      const cx = portraitStart + index * (portraitSize + portraitGap) + portraitSize / 2; const cy = portraitY + portraitSize / 2;
      return <g key={person.id}><circle cx={cx} cy={cy} r={portraitSize / 2} fill={episode.accent} /><image href={person.image} x={cx - portraitSize / 2 + 8} y={cy - portraitSize / 2 + 8} width={portraitSize - 16} height={portraitSize - 16} preserveAspectRatio="xMidYMid slice" clipPath={`url(#portrait-${format}-${person.id})`} /></g>;
    })}
    {square ? <>
      <path d="M692 620H1000V1000H640V672Q640 620 692 620Z" fill="#FFFFFF" />
      <image href={logoHref} x="688" y="645" width="270" height="270" />
      <text x="686" y="966" fontFamily="SpockPro" fontWeight="700" fontSize="46" fill={PURPLE}>allesokai.de</text>
      {episode.tag && <text x="112" y="972" fontFamily="SpockEss" fontSize="52" fill={episode.accent}>{episode.tag}</text>}
    </> : <>
      <path d="M700 1370H1080V1920H628V1442Q628 1370 700 1370Z" fill="#FFFFFF" />
      <image href={logoHref} x="695" y="1432" width="322" height="322" />
      <text x="693" y="1832" fontFamily="SpockPro" fontWeight="700" fontSize="55" fill={PURPLE}>allesokai.de</text>
      {episode.tag && <text x="72" y="1808" fontFamily="SpockEss" fontSize="64" fill={episode.accent}>{episode.tag}</text>}
    </>}
  </svg>;
}

function RangeControl({ label, value, min, max, step = 1, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; suffix?: string }) {
  return <label className="range-control"><span>{label}<output>{value}{suffix}</output></span><Slider min={min} max={max} step={step} value={[value]} onValueChange={(next) => onChange(next[0])} /></label>;
}

function SelectControl({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="field-control"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger className="brand-select"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>;
}

async function blobToDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); }
async function fetchAsDataUrl(url: string) { const response = await fetch(url); if (!response.ok) throw new Error(`Could not load ${url}`); return blobToDataUrl(await response.blob()); }
async function exportCover(svg: SVGSVGElement, width: number, height: number, filename: string) {
  await document.fonts.ready; const clone = svg.cloneNode(true) as SVGSVGElement; const images = Array.from(clone.querySelectorAll("image"));
  await Promise.all(images.map(async (node) => { const href = node.getAttribute("href") || ""; if (href.startsWith("/")) node.setAttribute("href", await fetchAsDataUrl(href)); }));
  const [regular, bold, essentials, black] = await Promise.all([fetchAsDataUrl("/assets/fonts/SpockPro-Regular.woff2"), fetchAsDataUrl("/assets/fonts/SpockPro-Bold.woff2"), fetchAsDataUrl("/assets/fonts/SpockEssAlt1-Regular.woff2"), fetchAsDataUrl("/assets/fonts/SpockEssAlt2-Black.woff2")]);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `@font-face{font-family:SpockPro;src:url(${regular})} @font-face{font-family:SpockPro;src:url(${bold});font-weight:700} @font-face{font-family:SpockEss;src:url(${essentials})} @font-face{font-family:SpockEssBlack;src:url(${black});font-weight:900}`;
  clone.prepend(style); clone.setAttribute("width", String(width)); clone.setAttribute("height", String(height));
  const source = new XMLSerializer().serializeToString(clone); const objectUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" })); const image = new Image(); image.decoding = "sync";
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = objectUrl; });
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0, width, height); URL.revokeObjectURL(objectUrl); const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")); if (!png) throw new Error("PNG export failed");
  const downloadUrl = URL.createObjectURL(png); const link = document.createElement("a"); link.href = downloadUrl; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  return { width: canvas.width, height: canvas.height, bytes: png.size };
}

export default function Home() {
  const [presets, setPresets] = useState<SeasonPreset[]>([initialPreset]); const [preset, setPreset] = useState<SeasonPreset>(initialPreset);
  const [episode, setEpisode] = useState<Episode>(initialEpisode); const [exploreSeed, setExploreSeed] = useState(215); const [logoData, setLogoData] = useState(""); const [notice, setNotice] = useState("");
  const squareRef = useRef<SVGSVGElement>(null); const storyRef = useRef<SVGSVGElement>(null); const titleFit = wrapTitle(episode.title, 19, 3);

  useEffect(() => {
    try {
      const savedPresets = localStorage.getItem(STORAGE_PRESETS); const savedDraft = localStorage.getItem(STORAGE_DRAFT);
      if (savedPresets) { const parsed = JSON.parse(savedPresets) as SeasonPreset[]; if (parsed.length) { setPresets(parsed); setPreset(parsed[parsed.length - 1]); } }
      if (savedDraft) setEpisode(JSON.parse(savedDraft));
    } catch { /* Safe defaults remain. */ }
    fetch("/assets/logo/allesokai-de-logo.svg").then((response) => response.text()).then((source) => setLogoData(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`)).catch(() => undefined);
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_DRAFT, JSON.stringify(episode)); } catch { /* best effort */ } }, [episode]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return; const lifecycle = new AbortController();
    const configureTool = context.registerTool({
      name: "configure_episode_artwork", title: "Configure episode artwork", description: "Update the visible episode number, title, subtitle, tag, or accent color in the cover maker.",
      inputSchema: { type: "object", properties: { number: { type: "integer", minimum: 0, maximum: 9999 }, title: { type: "string", maxLength: 160 }, subtitle: { type: "string", maxLength: 120 }, tag: { type: "string", maxLength: 40 }, accent: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: Partial<Episode>) { const next = { ...input }; if (next.title !== undefined && !next.title.trim()) throw new Error("Title cannot be empty"); setEpisode((current) => ({ ...current, ...next })); return { status: "updated", fields: Object.keys(next) }; },
    }, { signal: lifecycle.signal });
    const saveTool = context.registerTool({
      name: "save_season_preset", title: "Save season preset", description: "Save the currently visible pattern settings as the next version of this season preset in browser storage.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        const version = Math.max(0, ...presets.filter((item) => item.id === preset.id).map((item) => item.version)) + 1;
        const saved = { ...preset, version }; const next = [...presets, saved]; setPresets(next); setPreset(saved); localStorage.setItem(STORAGE_PRESETS, JSON.stringify(next));
        return { status: "saved", presetId: saved.id, version: saved.version };
      },
    }, { signal: lifecycle.signal });
    void Promise.all([Promise.resolve(configureTool), Promise.resolve(saveTool)]).catch(() => undefined);
    return () => lifecycle.abort();
  }, [preset, presets]);

  const updatePreset = <K extends keyof SeasonPreset>(key: K, value: SeasonPreset[K]) => setPreset((current) => ({ ...current, [key]: value }));
  const setCarrier = (key: keyof SeasonPreset["carrier"], value: number | Wave) => updatePreset("carrier", { ...preset.carrier, [key]: value });
  const setModulator = (key: keyof SeasonPreset["modulator"], value: number | Wave) => updatePreset("modulator", { ...preset.modulator, [key]: value });
  const setField = (key: keyof SeasonPreset["field"], value: number | RenderMode | WidthCurve) => updatePreset("field", { ...preset.field, [key]: value });
  const setEpisodeField = <K extends keyof Episode>(key: K, value: Episode[K]) => setEpisode((current) => ({ ...current, [key]: value }));
  const selectPreset = (value: string) => { const [id, version] = value.split(":"); const found = presets.find((item) => item.id === id && item.version === Number(version)); if (found) setPreset(found); };
  const savePresetVersion = () => {
    const version = Math.max(0, ...presets.filter((item) => item.id === preset.id).map((item) => item.version)) + 1; const saved = { ...preset, version }; const next = [...presets, saved];
    setPresets(next); setPreset(saved); localStorage.setItem(STORAGE_PRESETS, JSON.stringify(next)); setNotice(`${saved.name} saved as v${version}`); setTimeout(() => setNotice(""), 2400);
  };
  const addGuest = () => { if (!episode.people.some((person) => person.role === "guest")) setEpisodeField("people", [...episode.people, { id: `guest-${Date.now()}`, name: "Guest", role: "guest", image: guestSamples[(episode.number + preset.version) % guestSamples.length] }]); };
  const handleGuestFile = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { const guest = { id: `guest-${Date.now()}`, name: file.name.replace(/\.[^.]+$/, ""), role: "guest" as const, image: String(reader.result) }; setEpisodeField("people", [...episode.people.filter((person) => person.role !== "guest"), guest]); }; reader.readAsDataURL(file); };
  const doExport = async (format: "square" | "story") => {
    const svg = format === "square" ? squareRef.current : storyRef.current; if (!svg) return; setNotice(`Rendering ${format === "square" ? "3000 × 3000" : "1080 × 1920"} PNG…`);
    try {
      const result = await exportCover(svg, format === "square" ? 3000 : 1080, format === "square" ? 3000 : 1920, `allesokai-ep${String(episode.number).padStart(3, "0")}-${format}-preset-v${preset.version}.png`);
      setNotice(`PNG ready · ${result.width} × ${result.height} · ${Math.round(result.bytes / 1024)} KB`);
    }
    catch { setNotice("Export failed — please try again"); } setTimeout(() => setNotice(""), 10000);
  };
  const sampleEpisode: Episode = { ...initialEpisode, number: exploreSeed, title: "Ein Signal. Viele mögliche Formen.", subtitle: "Season instrument preview", tag: preset.field.mode === "lines" ? "Line study" : "Dot study", accent: LIME, seedOverride: `explore-${exploreSeed}`, people: initialEpisode.people };
  const presetOptions = presets.map((item) => ({ value: `${item.id}:${item.version}`, label: `${item.name} · v${item.version}` }));

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><span className="brand-mark">OK</span><div><strong>Cover Maker</strong><small>Alles OK AI</small></div></div><div className="preset-status"><span className="status-dot" />{preset.name}<b>v{preset.version}</b></div></header>
    <Tabs defaultValue="artwork" className="workspace-tabs">
      <div className="tabbar"><TabsList className="brand-tabs"><TabsTrigger value="explore">Explore</TabsTrigger><TabsTrigger value="artwork">Artwork</TabsTrigger></TabsList><p>Deterministic in your browser · no uploads</p></div>
      <TabsContent value="explore" className="workspace">
        <aside className="control-panel">
          <div className="panel-heading"><div><span className="eyebrow">Season instrument</span><h1>Shape the pattern</h1></div><Sparkles size={20} /></div>
          <section className="control-section"><div className="section-title"><span>01</span><h2>Preset identity</h2></div><label className="field-control"><span>Name</span><Input value={preset.name} onChange={(event) => updatePreset("name", event.target.value)} /></label><SelectControl label="Saved version" value={`${preset.id}:${preset.version}`} onChange={selectPreset} options={presetOptions} /></section>
          <section className="control-section"><div className="section-title"><span>02</span><h2>Carrier</h2></div><SelectControl label="Waveform" value={preset.carrier.wave} onChange={(value) => setCarrier("wave", value as Wave)} options={["sine", "triangle", "saw"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /><RangeControl label="Frequency" value={preset.carrier.frequency} min={0.5} max={4} step={0.05} onChange={(value) => setCarrier("frequency", value)} /><RangeControl label="Amplitude" value={preset.carrier.amplitude} min={0.02} max={0.3} step={0.005} onChange={(value) => setCarrier("amplitude", value)} /></section>
          <section className="control-section"><div className="section-title"><span>03</span><h2>Modulator</h2></div><SelectControl label="Waveform" value={preset.modulator.wave} onChange={(value) => setModulator("wave", value as Wave)} options={["sine", "triangle", "saw"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /><RangeControl label="Ratio" value={preset.modulator.ratio} min={0.5} max={5} step={0.05} onChange={(value) => setModulator("ratio", value)} /><RangeControl label="Depth" value={preset.modulator.depth} min={0} max={1} step={0.01} onChange={(value) => setModulator("depth", value)} /><RangeControl label="Phase" value={preset.modulator.phase} min={0} max={1} step={0.01} onChange={(value) => setModulator("phase", value)} /></section>
          <section className="control-section">
            <div className="section-title"><span>04</span><h2>Field &amp; depth</h2></div>
            <div className="mode-switch" role="group" aria-label="Pattern rendering mode"><button className={preset.field.mode === "lines" ? "active" : ""} onClick={() => setField("mode", "lines")}>Lines</button><button className={preset.field.mode === "dots" ? "active" : ""} onClick={() => setField("mode", "dots")}>Dots</button></div>
            <RangeControl label="First line" value={preset.field.firstWidth} min={2} max={24} step={0.5} onChange={(value) => setField("firstWidth", value)} suffix=" px" />
            <RangeControl label="Last line" value={preset.field.lastWidth} min={2} max={24} step={0.5} onChange={(value) => setField("lastWidth", value)} suffix=" px" />
            <SelectControl label="Thickness curve" value={preset.field.widthCurve} onChange={(value) => setField("widthCurve", value as WidthCurve)} options={[{ value: "linear", label: "Linear" }, { value: "ease-in", label: "Ease in" }, { value: "ease-out", label: "Ease out" }]} />
            <RangeControl label="Relief" value={preset.field.relief} min={0} max={1} step={0.01} onChange={(value) => setField("relief", value)} />
            <RangeControl label="Depth tint" value={preset.field.depthTint} min={0} max={0.8} step={0.01} onChange={(value) => setField("depthTint", value)} />
            <RangeControl label="Perspective" value={preset.field.perspective} min={0} max={1} step={0.01} onChange={(value) => setField("perspective", value)} />
            <RangeControl label="Phase spread" value={preset.field.phaseSpread} min={0} max={0.8} step={0.01} onChange={(value) => setField("phaseSpread", value)} />
            <RangeControl label="Density" value={preset.field.lineCount} min={14} max={54} onChange={(value) => setField("lineCount", value)} />
            <RangeControl label="Rotation" value={preset.field.rotation} min={-30} max={30} onChange={(value) => setField("rotation", value)} suffix="°" />
            <RangeControl label="Spatial warp" value={preset.field.warp} min={0} max={0.5} step={0.01} onChange={(value) => setField("warp", value)} />
          </section>
          <div className="sticky-actions"><Button variant="outline" onClick={() => setPreset(initialPreset)}><RotateCcw /> Reset</Button><Button onClick={savePresetVersion}><Save /> Save new version</Button></div>
        </aside>
        <section className="preview-stage explore-stage"><div className="stage-head"><div><span className="eyebrow">Live synthesis</span><h2>One family, repeatable variations</h2></div><div className="seed-picker">{[215, 216, 217].map((seed) => <button key={seed} onClick={() => setExploreSeed(seed)} className={seed === exploreSeed ? "active" : ""}>EP {seed}</button>)}</div></div><div className="explore-canvas"><CoverArt episode={sampleEpisode} preset={preset} format="square" logoData={logoData} /></div><div className="signal-readout"><span><b>Seed</b> explore-{exploreSeed}</span><span><b>Generator</b> {preset.generatorVersion}</span><span><b>Mode</b> {preset.field.mode}</span></div></section>
      </TabsContent>
      <TabsContent value="artwork" className="workspace">
        <aside className="control-panel">
          <div className="panel-heading"><div><span className="eyebrow">Episode production</span><h1>Compose artwork</h1></div><ImagePlus size={20} /></div>
          <section className="control-section"><div className="section-title"><span>01</span><h2>Episode</h2></div><div className="two-fields"><label className="field-control"><span>Number</span><Input type="number" min={0} max={9999} value={episode.number} onChange={(event) => setEpisodeField("number", Number(event.target.value))} /></label><label className="field-control"><span>Accent</span><span className="color-input"><input type="color" value={episode.accent} onChange={(event) => setEpisodeField("accent", event.target.value.toUpperCase())} /><code>{episode.accent}</code></span></label></div><label className="field-control"><span>Title <em>{episode.title.length}/72</em></span><textarea rows={3} value={episode.title} onChange={(event) => setEpisodeField("title", event.target.value)} /></label>{titleFit.overflow && <div className="warning">The square title exceeds the safe three-line box. Shorten it before final export.</div>}<label className="field-control"><span>Subtitle <em>optional</em></span><Input value={episode.subtitle} onChange={(event) => setEpisodeField("subtitle", event.target.value)} placeholder="with / featuring…" /></label><label className="field-control"><span>Type tag <em>optional</em></span><Input value={episode.tag} onChange={(event) => setEpisodeField("tag", event.target.value)} placeholder="Interview" /></label><label className="field-control"><span>Seed override <em>optional</em></span><Input value={episode.seedOverride} onChange={(event) => setEpisodeField("seedOverride", event.target.value)} placeholder="Uses episode number + title" /></label><p className="field-note">Title changes create a new pattern unless you freeze the identity with a seed override.</p></section>
          <section className="control-section"><div className="section-title"><span>02</span><h2>People</h2></div><div className="people-list">{episode.people.map((person) => <div className="person-row" key={person.id}><img src={person.image} alt="" /><div><strong>{person.name}</strong><small>{person.role}</small></div>{person.role === "guest" && <button aria-label="Remove guest" onClick={() => setEpisodeField("people", episode.people.filter((item) => item.id !== person.id))}><Trash2 size={16} /></button>}</div>)}</div>{!episode.people.some((person) => person.role === "guest") && <Button variant="outline" className="full-button" onClick={addGuest}><Plus /> Add sample guest</Button>}<label className="upload-button"><Users size={16} /> Use guest photo<input type="file" accept="image/*" onChange={(event) => handleGuestFile(event.target.files?.[0])} /></label></section>
          <section className="control-section compact-section"><div className="section-title"><span>03</span><h2>Season pattern</h2></div><SelectControl label="Preset" value={`${preset.id}:${preset.version}`} onChange={selectPreset} options={presetOptions} /></section>
        </aside>
        <section className="preview-stage artwork-stage"><div className="stage-head"><div><span className="eyebrow">Output preview</span><h2>Same episode, two compositions</h2></div><span className="seed-badge">Seed {hashString(episodeSeed(episode, preset, "shared-pattern")).toString(16).toUpperCase()}</span></div><div className="artboards"><article className="artboard-card artboard-card--square"><div className="artboard-label"><span>Podcast cover</span><small>3000 × 3000 PNG</small></div><div className="artboard"><CoverArt svgRef={squareRef} episode={episode} preset={preset} format="square" logoData={logoData} /></div><Button onClick={() => doExport("square")}><Download /> Export square</Button></article><article className="artboard-card artboard-card--story"><div className="artboard-label"><span>Story</span><small>1080 × 1920 PNG</small></div><div className="artboard"><CoverArt svgRef={storyRef} episode={episode} preset={preset} format="story" logoData={logoData} /></div><Button onClick={() => doExport("story")}><Download /> Export 9:16</Button></article></div><div className="fallback-note"><strong>Typography prototype</strong><span>Subtitle uses Spock Essentials Alt 1 Regular; tag uses the same Regular face. The annotated Alt 2 Regular and Alt 1 Bold files are not in the supplied archive.</span></div></section>
      </TabsContent>
    </Tabs>
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
