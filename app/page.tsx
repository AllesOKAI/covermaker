"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Plus, RotateCcw, Save, Sparkles, Trash2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { guestSamples, initialEpisode, initialPreset, LIME, PURPLE } from "@/lib/artwork";
import type { ArtworkFormat, Episode, RenderMode, SeasonPreset, Wave, WidthCurve } from "@/lib/artwork";
import { prepareGuestImage } from "@/lib/browser-storage";
import { createCovermakerQuery, createPostprodCommand, coverFileName } from "@/lib/postprod-handoff";
import { useCoverDraft } from "@/lib/use-cover-draft";
import { validateArtwork } from "@/lib/artwork-layout";
import type { MeasureText as LayoutMeasure } from "@/lib/artwork-layout";
import { createResourceCache, exportAllFormats, exportArtwork } from "@/lib/artwork-export";

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
    const pointAt = (step: number, totalSteps: number) => {
      const x = -overscan + (step / totalSteps) * (1 + overscan * 2); const rawDepth = (lineIndex + 0.5) / count;
      const depth = clamp(rawDepth); const baseY = rawDepth < 0 || rawDepth > 1 ? rawDepth : Math.pow(rawDepth, 1 + preset.field.perspective * 1.35);
      const mod = wave(preset.modulator.wave, x * (preset.carrier.frequency * (preset.modulator.ratio + ratioShift)) + preset.modulator.phase + phaseShift + depth * preset.field.phaseSpread);
      const carrier = wave(preset.carrier.wave, x * preset.carrier.frequency + phaseShift + lineIndex * 0.016 + depth * preset.field.phaseSpread + mod * preset.modulator.depth);
      const spatial = Math.sin((x * 1.7 + baseY * 1.25 + phaseShift) * Math.PI * 2);
      const amplitudeDepth = 0.7 + depth * preset.field.perspective * 0.85;
      const y = baseY + carrier * preset.carrier.amplitude * amplitudeDepth + spatial * (preset.field.warp + warpShift) * 0.18;
      return { x: x * width, y: y * height, depth };
    };
    for (let step = 0; step <= 70; step += 1) {
      const { x, y } = pointAt(step, 70);
      points.push([x, y]);
    }
    if (preset.field.mode === "dots") for (let dotIndex = 0; dotIndex < preset.field.dotDensity; dotIndex += 1) dots.push(pointAt(dotIndex, Math.max(1, preset.field.dotDensity - 1)));
    paths.push({ d: points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "), depth: clamp((lineIndex + 0.5) / count) });
  }
  return { paths, dots };
}

function Pattern({ preset, seedKey, width, height, clipId, accent }: { preset: SeasonPreset; seedKey: string; width: number; height: number; clipId: string; accent: string }) {
  const geometry = useMemo(() => patternGeometry(preset, seedKey, width, height), [preset, seedKey, width, height]);
  const scale = Math.min(width / 1000, height / 1000);
  const lineWidth = (depth: number) => (preset.field.firstWidth + (preset.field.lastWidth - preset.field.firstWidth) * curveDepth(depth, preset.field.widthCurve)) * scale;
  const lineColor = (depth: number) => mixHex(accent, "#FFFFFF", 0.14 + preset.field.depthTint * depth);
  return <g clipPath={`url(#${clipId})`}>
    <g transform={`rotate(${preset.field.rotation} ${width / 2} ${height / 2})`}>
      {preset.field.mode === "lines" ? geometry.paths.map((path, index) => {
        const thickness = lineWidth(path.depth);
        return <path key={index} d={path.d} fill="none" stroke={lineColor(path.depth)} strokeOpacity={0.76 + path.depth * 0.2} strokeWidth={thickness} strokeLinecap="round" />;
      }) : geometry.dots.map((dot, index) => {
        const radius = Math.max(2.2 * scale, lineWidth(dot.depth) * 0.48);
        return <circle key={index} cx={dot.x} cy={dot.y} r={radius} fill={lineColor(dot.depth)} opacity={0.76 + dot.depth * 0.2} />;
      })}
    </g>
  </g>;
}

function wrapTextToWidth(text: string, maxWidth: number, measure: (value: string) => number) {
  const lines: string[] = [];
  for (const paragraph of text.trim().split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      // Break unusually long words as well, so they stay within the safe area.
      for (const character of Array.from(word)) {
        if (line && measure(line + character) > maxWidth) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function YouTubeText({ title, subtitle, width, margin, titleSize, titleY, lineHeight }: { title: string; subtitle: string; width: number; margin: number; titleSize: number; titleY: number; lineHeight: number }) {
  const maxWidth = width - margin * 2;
  const subtitleSize = 36 * 1.5; const subtitleLineHeight = subtitleSize * 1.2;
  const key = JSON.stringify([title, subtitle, titleSize, maxWidth]);
  const [measured, setMeasured] = useState<{ key: string; title: string[]; subtitle: string[] } | null>(null);
  const lines = measured?.key === key ? measured : {
    title: wrapTextToWidth(title, maxWidth, (value) => value.length * titleSize * 0.65),
    subtitle: wrapTextToWidth(subtitle, maxWidth, (value) => value.length * subtitleSize * 0.65),
  };

  useEffect(() => {
    let active = true;
    async function measureText() {
      await Promise.all([
        document.fonts.load(`900 ${titleSize}px SpockEssBlack`, title),
        document.fonts.load(`500 ${subtitleSize}px SpockEss`, subtitle),
      ]);
      const context = document.createElement("canvas").getContext("2d");
      if (!active || !context) return;
      context.font = `900 ${titleSize}px SpockEssBlack`;
      const titleLines = wrapTextToWidth(title, maxWidth - 2, (value) => context.measureText(value).width - Math.max(0, Array.from(value).length - 1) * 2.5);
      context.font = `500 ${subtitleSize}px SpockEss`;
      const subtitleLines = wrapTextToWidth(subtitle, maxWidth - 2, (value) => context.measureText(value).width);
      setMeasured({ key, title: titleLines, subtitle: subtitleLines });
    }
    void measureText();
    return () => { active = false; };
  }, [key, title, subtitle, titleSize, subtitleSize, maxWidth]);

  const x = width - margin;
  return <>
    <text x={x} y={titleY} textAnchor="end" fontFamily="SpockEssBlack" fontWeight="900" fontSize={titleSize} letterSpacing="-2.5" fill={PURPLE}>
      {lines.title.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : lineHeight}>{line}</tspan>)}
    </text>
    {subtitle && <text x={x} y={titleY + Math.max(0, lines.title.length - 1) * lineHeight + 90} textAnchor="end" fontFamily="SpockEss" fontWeight="500" fontSize={subtitleSize} fill={PURPLE} stroke={PURPLE} strokeWidth="0.6" paintOrder="stroke">
      {lines.subtitle.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : subtitleLineHeight}>{line}</tspan>)}
    </text>}
  </>;
}

type CoverProps = { episode: Episode; preset: SeasonPreset; format: ArtworkFormat; logoData: string; svgRef?: React.RefObject<SVGSVGElement | null> };
function CoverArt({ episode, preset, format, logoData, svgRef }: CoverProps) {
  const square = format === "square"; const linkedin = format === "linkedin"; const youtube = format === "youtube"; const coverLayout = square || linkedin || youtube; const cleanStory = format === "story-clean";
  const width = youtube ? 1920 : linkedin ? 1914 : square ? 1000 : 1080; const height = youtube ? 1080 : coverLayout ? 1000 : 1920;
  const seedKey = episodeSeed(episode, preset, "shared-pattern"); const clipId = `field-${format}-${hashString(seedKey)}`;
  const title = wrapTitle(episode.title, linkedin ? 32 : square ? 19 : 18, coverLayout ? 3 : 5); const people = cleanStory ? [] : episode.people.slice(0, 3);
  const episodeLabel = String(episode.number).padStart(3, "0");
  const logoHref = logoData ? logoData.replace(/%2394f20d/gi, encodeURIComponent(episode.accent)) : "/assets/logo/allesokai-de-logo.svg";
  const portraitScale = youtube ? 2.1 : 1; const portraitSize = (coverLayout ? 158 : 210) * portraitScale; const portraitRing = 8 * portraitScale;
  const portraitGap = -Math.round(portraitSize * 0.12); const portraitStart = coverLayout ? 104 : 62;
  const portraitY = youtube ? height - (1000 - 708 - 158) - portraitSize : coverLayout ? 708 : 1450; const titleX = coverLayout ? 112 : 92; const titleY = coverLayout ? 320 : 385;
  const lineHeight = coverLayout ? 88 * (youtube ? 1.15 : 1) : 118; const titleSize = coverLayout ? (episode.title.length > 48 ? 68 : 78) * (youtube ? 1.15 : 1) : episode.title.length > 48 ? 90 : 102;
  const field = youtube ? { x: 22, y: 23, w: width - 44, h: height - 240, r: 56 } : linkedin ? { x: 22, y: 23, w: 1870, h: 760, r: 56 } : square ? { x: 22, y: 23, w: 956, h: 760, r: 56 } : { x: 40, y: 42, w: 1000, h: cleanStory ? 1633 : 1545, r: 72 };
  const formatLabel = youtube ? "YouTube" : linkedin ? "LinkedIn" : cleanStory ? "Portrait-free 9 by 16" : square ? "Square" : "9 by 16";
  const logoScale = youtube ? 0.77 : 1;
  const logoX = width - 360 * logoScale; const logoY = height - 380 * logoScale;

  return <svg ref={svgRef} className={`cover-svg cover-svg--${format}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${formatLabel} cover preview for episode ${episodeLabel}`} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id={clipId}><rect x={field.x} y={field.y} width={field.w} height={field.h} rx={field.r} /></clipPath>
      {people.map((person, index) => <clipPath key={person.id} id={`portrait-${format}-${person.id}`}><circle cx={portraitStart + index * (portraitSize + portraitGap) + portraitSize / 2} cy={portraitY + portraitSize / 2} r={portraitSize / 2 - portraitRing} /></clipPath>)}
    </defs>
    <rect width={width} height={height} fill={PURPLE} />
    <rect x={field.x} y={field.y} width={field.w} height={field.h} rx={field.r} fill={episode.accent} />
    <Pattern preset={preset} seedKey={seedKey} width={width} height={height} clipId={clipId} accent={episode.accent} />
    <path d={coverLayout ? "M0 0H450V78Q450 126 402 126H0Z" : "M0 0H650V108Q650 180 578 180H0Z"} fill={PURPLE} />
    <text x={coverLayout ? 45 : 62} y={coverLayout ? 86 : 123} fontFamily="SpockPro" fontSize={coverLayout ? 52 : 72} letterSpacing="1" fill={episode.accent}>EPISODE</text>
    <text x={coverLayout ? 292 : 402} y={coverLayout ? 86 : 123} fontFamily="SpockPro" fontWeight="700" fontSize={coverLayout ? 54 : 76} fill="#FFFFFF">{episodeLabel}</text>
    {youtube ? <YouTubeText title={episode.title} subtitle={episode.subtitle} width={width} margin={titleX} titleSize={titleSize} titleY={titleY} lineHeight={lineHeight} /> : <><text x={titleX} y={titleY} fontFamily="SpockEssBlack" fontWeight="900" fontSize={titleSize} letterSpacing="-2.5" fill={PURPLE}>
      {title.lines.map((line, index) => <tspan key={line + index} x={titleX} dy={index === 0 ? 0 : lineHeight}>{line}</tspan>)}
    </text>
    {episode.subtitle && <text x={titleX + 6} y={titleY + Math.max(0, title.lines.length - 1) * lineHeight + (coverLayout ? 90 : 132)} fontFamily="SpockEss" fontSize={coverLayout ? 36 : 48} fill={PURPLE}>{episode.subtitle}</text>}</>}
    {people.map((person, index) => {
      const cx = portraitStart + index * (portraitSize + portraitGap) + portraitSize / 2; const cy = portraitY + portraitSize / 2;
      return <g key={person.id}><circle cx={cx} cy={cy} r={portraitSize / 2} fill={episode.accent} /><image href={person.image} x={cx - portraitSize / 2 + portraitRing} y={cy - portraitSize / 2 + portraitRing} width={portraitSize - portraitRing * 2} height={portraitSize - portraitRing * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#portrait-${format}-${person.id})`} /></g>;
    })}
    {coverLayout ? <>
      <g transform={`translate(${logoX} ${logoY}) scale(${logoScale})`}>
        <path d="M52 0H360V380H0V52Q0 0 52 0Z" fill="#FFFFFF" />
        <image href={logoHref} x="75" y="52" width="216" height="216" />
        <text x="46" y="346" fontFamily="SpockPro" fontWeight="700" fontSize="46" fill={PURPLE}>allesokai.de</text>
      </g>
      {episode.tag && <text x="112" y={height - 72} fontFamily="SpockEss" fontWeight="700" fontSize="39" fill={episode.accent}>{episode.tag}</text>}
    </> : <>
      <path d="M795 1507H1080V1920H741V1561Q741 1507 795 1507Z" fill="#FFFFFF" />
      <image href={logoHref} x="791" y="1554" width="242" height="242" />
      <text x="791" y="1854" fontFamily="SpockPro" fontWeight="700" fontSize="41" fill={PURPLE}>allesokai.de</text>
      {episode.tag && <text x="72" y="1808" fontFamily="SpockEss" fontWeight="700" fontSize="64" fill={episode.accent}>{episode.tag}</text>}
    </>}
  </svg>;
}

function RangeControl({ label, value, min, max, step = 1, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; suffix?: string }) {
  return <label className="range-control"><span>{label}<output>{value}{suffix}</output></span><Slider min={min} max={max} step={step} value={[value]} onValueChange={(next) => onChange(next[0])} /></label>;
}

function SelectControl({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="field-control"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger className="brand-select"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>;
}

export default function Home() {
  const [exploreSeed, setExploreSeed] = useState(215);
  const [logoData, setLogoData] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(""), 10000);
  }, []);
  const {
    episode, setEpisode, setEpisodeField, preset, setPreset, presets,
    updatePreset, selectPreset, savePresetVersion, saveStatus, queryApplied,
  } = useCoverDraft(showNotice);
  const [videoPath, setVideoPath] = useState("");
  const [coverDir, setCoverDir] = useState("");
  const [handoffCopied, setHandoffCopied] = useState(false);
  const handoffCommand = useMemo(() => createPostprodCommand({
    episode,
    presetVersion: preset.version,
    videoPath: videoPath || "/pfad/zum/video.mp4",
    coverDir: coverDir || "/pfad/zum/downloads",
  }), [episode, preset.version, videoPath, coverDir]);
  const covermakerLink = useMemo(() => {
    const params = createCovermakerQuery(episode);
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, [episode]);
  const copyHandoff = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setHandoffCopied(true);
      setTimeout(() => setHandoffCopied(false), 2400);
    } catch { showNotice("Kopieren fehlgeschlagen — bitte manuell markieren und kopieren."); }
  };
  const squareRef = useRef<SVGSVGElement>(null);
  const storyRef = useRef<SVGSVGElement>(null);
  const cleanStoryRef = useRef<SVGSVGElement>(null);
  const linkedinRef = useRef<SVGSVGElement>(null);
  const youtubeRef = useRef<SVGSVGElement>(null);
  const titleFit = wrapTitle(episode.title, 19, 3);

  // Real text measurement: once the artwork fonts load, measure with canvas
  // so warnings reflect what the exported SVG actually renders.
  const [fontMeasure, setFontMeasure] = useState<LayoutMeasure | null>(null);
  useEffect(() => {
    let active = true;
    const sample = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZzÄäÖöÜüß0123456789";
    const fonts = ["900 100px SpockEssBlack", "500 48px SpockEss", "700 64px SpockEss", "700 54px SpockPro"];
    Promise.all(fonts.map((font) => document.fonts.load(font, sample)))
      .then(() => {
        if (!active) return;
        const context = document.createElement("canvas").getContext("2d");
        if (!context) return;
        const measure: LayoutMeasure = (text, spec) => {
          context.font = `${spec.weight} ${spec.size}px ${spec.family}`;
          return context.measureText(text).width;
        };
        setFontMeasure(() => measure);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const layoutWarnings = useMemo(() => {
    if (!fontMeasure) return {};
    return validateArtwork(episode, fontMeasure);
  }, [episode, fontMeasure]);
  const formatWarnings = (format: ArtworkFormat) => layoutWarnings[format] ?? [];
  const totalWarnings = Object.values(layoutWarnings).reduce((count, list) => count + (list?.length ?? 0), 0);

  useEffect(() => {
    fetch("/assets/logo/allesokai-de-logo.svg").then((response) => response.text()).then((source) => setLogoData("data:image/svg+xml;charset=utf-8," + encodeURIComponent(source))).catch(() => undefined);
  }, []);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const configureTool = context.registerTool({
      name: "configure_episode_artwork", title: "Configure episode artwork", description: "Update the visible episode number, title, subtitle, tag, or accent color in the cover maker.",
      inputSchema: { type: "object", properties: { number: { type: "integer", minimum: 0, maximum: 9999 }, title: { type: "string", maxLength: 160 }, subtitle: { type: "string", maxLength: 120 }, tag: { type: "string", maxLength: 40 }, accent: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: Partial<Episode>) { const next = { ...input }; if (next.title !== undefined && !next.title.trim()) throw new Error("Title cannot be empty"); setEpisode((current) => ({ ...current, ...next })); return { status: "updated", fields: Object.keys(next) }; },
    }, { signal: lifecycle.signal });
    const saveTool = context.registerTool({
      name: "save_season_preset", title: "Save season preset", description: "Save the currently visible pattern settings as the next version of this season preset in browser storage.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: savePresetVersion,
    }, { signal: lifecycle.signal });
    void Promise.all([Promise.resolve(configureTool), Promise.resolve(saveTool)]).catch(() => undefined);
    return () => lifecycle.abort();
  }, [savePresetVersion, setEpisode]);
  const setCarrier = (key: keyof SeasonPreset["carrier"], value: number | Wave) => updatePreset("carrier", { ...preset.carrier, [key]: value });
  const setModulator = (key: keyof SeasonPreset["modulator"], value: number | Wave) => updatePreset("modulator", { ...preset.modulator, [key]: value });
  const setField = (key: keyof SeasonPreset["field"], value: number | RenderMode | WidthCurve) => updatePreset("field", { ...preset.field, [key]: value });
  const addGuest = () => { if (!episode.people.some((person) => person.role === "guest")) setEpisodeField("people", [...episode.people, { id: "guest-" + Date.now(), name: "Guest", role: "guest", image: guestSamples[(episode.number + preset.version) % guestSamples.length] }]); };
  const handleGuestFile = async (file?: File) => {
    if (!file) return;
    try {
      const image = await prepareGuestImage(file);
      const guest = { id: "guest-" + Date.now(), name: file.name.replace(/\.[^.]+$/, ""), role: "guest" as const, image };
      setEpisode((current) => ({ ...current, people: [...current.people.filter((person) => person.role !== "guest"), guest] }));
      showNotice("Guest photo prepared and stored locally.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "Das Bild konnte nicht geladen werden."); }
  };
  const exportCache = useMemo(() => createResourceCache(async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}`);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }), []);
  const [exportingFormat, setExportingFormat] = useState<ArtworkFormat | "all" | null>(null);
  const exportTargets = () => ({
    square: { svg: squareRef.current, width: 3000, height: 3000, label: "Square" },
    story: { svg: storyRef.current, width: 1080, height: 1920, label: "Story 9:16" },
    "story-clean": { svg: cleanStoryRef.current, width: 1080, height: 1920, label: "Story clean 9:16" },
    linkedin: { svg: linkedinRef.current, width: 1200, height: 627, label: "LinkedIn" },
    youtube: { svg: youtubeRef.current, width: 1920, height: 1080, label: "YouTube" },
  });
  const exportFilename = (format: ArtworkFormat) => `allesokai-ep${String(episode.number).padStart(3, "0")}-${format}-preset-v${preset.version}.png`;
  const doExport = async (format: ArtworkFormat) => {
    if (exportingFormat) return;
    const targets = exportTargets();
    const target = targets[format];
    setExportingFormat(format);
    showNotice(`Rendering ${target.label} PNG…`);
    try {
      const outcome = await exportArtwork(target.svg, target.width, target.height, exportFilename(format), exportCache);
      if (outcome.ok) showNotice(`PNG ready · ${outcome.result.width} × ${outcome.result.height} · ${Math.round(outcome.result.bytes / 1024)} KB`);
      else showNotice(outcome.message);
    } finally { setExportingFormat(null); }
  };
  const doExportAll = async () => {
    if (exportingFormat) return;
    const targets = exportTargets();
    setExportingFormat("all");
    showNotice("Rendering all five formats…");
    try {
      const results = await exportAllFormats(
        (Object.keys(targets) as ArtworkFormat[]).map((format) => ({ ...targets[format], filename: exportFilename(format) })),
        exportCache,
      );
      const failed = results.filter((entry) => !entry.outcome.ok);
      if (!failed.length) showNotice(`All ${results.length} PNGs exported`);
      else showNotice(`${results.length - failed.length}/${results.length} exports succeeded — failed: ${failed.map((entry) => entry.label).join(", ")}`);
    } finally { setExportingFormat(null); }
  };
  const sampleEpisode: Episode = { ...initialEpisode, number: exploreSeed, title: "Ein Signal. Viele mögliche Formen.", subtitle: "Season instrument preview", tag: preset.field.mode === "lines" ? "Line study" : "Dot study", accent: LIME, seedOverride: `explore-${exploreSeed}`, people: initialEpisode.people };
  const presetOptions = presets.map((item) => ({ value: `${item.id}:${item.version}`, label: `${item.name} · v${item.version}` }));

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><span className="brand-mark">OK</span><div><strong>Cover Maker</strong><small>Alles OkAI</small></div></div><div className="preset-status"><span className="status-dot" />{preset.name}<b>v{preset.version}</b></div></header>
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
            <RangeControl label="Depth tint" value={preset.field.depthTint} min={0} max={0.8} step={0.01} onChange={(value) => setField("depthTint", value)} />
            <RangeControl label="Perspective" value={preset.field.perspective} min={0} max={1} step={0.01} onChange={(value) => setField("perspective", value)} />
            <RangeControl label="Phase spread" value={preset.field.phaseSpread} min={0} max={0.8} step={0.01} onChange={(value) => setField("phaseSpread", value)} />
            <RangeControl label="Density" value={preset.field.lineCount} min={14} max={54} onChange={(value) => setField("lineCount", value)} />
            {preset.field.mode === "dots" && <RangeControl label="Dot density" value={preset.field.dotDensity} min={20} max={96} onChange={(value) => setField("dotDensity", value)} />}
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
          <section className="control-section"><div className="section-title"><span>01</span><h2>Episode</h2></div><div className="two-fields"><label className="field-control"><span>Number</span><Input type="number" min={0} max={9999} value={episode.number} onChange={(event) => setEpisodeField("number", Number(event.target.value))} /></label><label className="field-control"><span>Accent</span><span className="color-input"><input type="color" value={episode.accent} onChange={(event) => setEpisodeField("accent", event.target.value.toUpperCase())} /><code>{episode.accent}</code></span></label></div><label className="field-control"><span>Title <em>{episode.title.length}/72</em></span><textarea rows={3} value={episode.title} onChange={(event) => setEpisodeField("title", event.target.value)} /></label>{titleFit.overflow && <div className="warning">The square title exceeds the safe three-line box. Shorten it before final export.</div>}{totalWarnings > 0 && fontMeasure && <div className="warning">{totalWarnings} layout {totalWarnings === 1 ? "warning" : "warnings"} across the artboards — see the flagged formats below.</div>}<label className="field-control"><span>Subtitle <em>optional</em></span><Input value={episode.subtitle} onChange={(event) => setEpisodeField("subtitle", event.target.value)} placeholder="with / featuring…" /></label><label className="field-control"><span>Type tag <em>optional</em></span><Input value={episode.tag} onChange={(event) => setEpisodeField("tag", event.target.value)} placeholder="Interview" /></label><label className="field-control"><span>Seed override <em>optional</em></span><Input value={episode.seedOverride} onChange={(event) => setEpisodeField("seedOverride", event.target.value)} placeholder="Uses episode number + title" /></label><p className="field-note">Title changes create a new pattern unless you freeze the identity with a seed override.</p></section>
          <section className="control-section"><div className="section-title"><span>02</span><h2>People</h2></div><div className="people-list">{episode.people.map((person) => <div className="person-row" key={person.id}>{/* eslint-disable @next/next/no-img-element -- src is a static path or a user-upload data URL, which next/image cannot optimize */}<img src={person.image} alt="" />{/* eslint-enable @next/next/no-img-element */}<div><strong>{person.name}</strong><small>{person.role}</small></div>{person.role === "guest" && <button aria-label="Remove guest" onClick={() => setEpisodeField("people", episode.people.filter((item) => item.id !== person.id))}><Trash2 size={16} /></button>}</div>)}</div>{!episode.people.some((person) => person.role === "guest") && <Button variant="outline" className="full-button" onClick={addGuest}><Plus /> Add sample guest</Button>}<label className="upload-button"><Users size={16} /> Use guest photo<input type="file" accept="image/*" onChange={(event) => handleGuestFile(event.target.files?.[0])} /></label></section>
          <section className="control-section compact-section"><div className="section-title"><span>03</span><h2>Season pattern</h2></div><SelectControl label="Preset" value={`${preset.id}:${preset.version}`} onChange={selectPreset} options={presetOptions} /></section>
        </aside>
        <section className="preview-stage artwork-stage"><div className="stage-head"><div><span className="eyebrow">Output preview</span><h2>Same episode, five compositions</h2></div><span className="seed-badge">Seed {hashString(episodeSeed(episode, preset, "shared-pattern")).toString(16).toUpperCase()}</span></div><div className="artboards"><article className="artboard-card artboard-card--square"><div className="artboard-label"><span>Podcast cover</span><small>3000 × 3000 PNG</small></div>{formatWarnings("square").length > 0 && <ul className="artboard-warnings">{formatWarnings("square").map((warning) => <li key={warning}>{warning}</li>)}</ul>}<div className="artboard"><CoverArt svgRef={squareRef} episode={episode} preset={preset} format="square" logoData={logoData} /></div><Button onClick={() => doExport("square")} disabled={exportingFormat !== null}>{exportingFormat === "square" ? "Rendering…" : ""}<Download /> Export square</Button></article><article className="artboard-card artboard-card--story"><div className="artboard-label"><span>Story</span><small>1080 × 1920 PNG</small></div>{formatWarnings("story").length > 0 && <ul className="artboard-warnings">{formatWarnings("story").map((warning) => <li key={warning}>{warning}</li>)}</ul>}<div className="artboard"><CoverArt svgRef={storyRef} episode={episode} preset={preset} format="story" logoData={logoData} /></div><Button onClick={() => doExport("story")} disabled={exportingFormat !== null}>{exportingFormat === "story" ? "Rendering…" : ""}<Download /> Export 9:16</Button></article><article className="artboard-card artboard-card--story"><div className="artboard-label"><span>Story · no portraits</span><small>1080 × 1920 PNG</small></div>{formatWarnings("story-clean").length > 0 && <ul className="artboard-warnings">{formatWarnings("story-clean").map((warning) => <li key={warning}>{warning}</li>)}</ul>}<div className="artboard"><CoverArt svgRef={cleanStoryRef} episode={episode} preset={preset} format="story-clean" logoData={logoData} /></div><Button onClick={() => doExport("story-clean")} disabled={exportingFormat !== null}>{exportingFormat === "story-clean" ? "Rendering…" : ""}<Download /> Export clean 9:16</Button></article><article className="artboard-card artboard-card--linkedin"><div className="artboard-label"><span>LinkedIn</span><small>1200 × 627 PNG · 1.91:1</small></div>{formatWarnings("linkedin").length > 0 && <ul className="artboard-warnings">{formatWarnings("linkedin").map((warning) => <li key={warning}>{warning}</li>)}</ul>}<div className="artboard"><CoverArt svgRef={linkedinRef} episode={episode} preset={preset} format="linkedin" logoData={logoData} /></div><Button onClick={() => doExport("linkedin")} disabled={exportingFormat !== null}>{exportingFormat === "linkedin" ? "Rendering…" : ""}<Download /> Export LinkedIn</Button></article><article className="artboard-card artboard-card--youtube"><div className="artboard-label"><span>YouTube</span><small>1920 × 1080 PNG · 16:9</small></div>{formatWarnings("youtube").length > 0 && <ul className="artboard-warnings">{formatWarnings("youtube").map((warning) => <li key={warning}>{warning}</li>)}</ul>}<div className="artboard"><CoverArt svgRef={youtubeRef} episode={episode} preset={preset} format="youtube" logoData={logoData} /></div><Button onClick={() => doExport("youtube")} disabled={exportingFormat !== null}>{exportingFormat === "youtube" ? "Rendering…" : ""}<Download /> Export YouTube</Button></article></div><div className="export-all"><Button onClick={doExportAll} disabled={exportingFormat !== null}>{exportingFormat === "all" ? "Rendering all…" : "Export all five formats"}</Button></div><div className="fallback-note"><strong>Typography prototype</strong><span>Subtitle uses Spock Essentials Alt 1 Regular; YouTube approximates Medium with a light outline. The tag uses a temporary browser-synthesized bold from that face. The annotated Alt 2 Regular and Alt 1 Bold files are not in the supplied archive.</span></div>{queryApplied && <div className="query-prefill-note">Vorausgefüllt per Link: {Object.entries(queryApplied).map(([key, value]) => `${key === "number" ? "Episode" : "Titel"} ${value}`).join(" · ")}</div>}<section className="postprod-handoff"><div className="section-title"><span>→</span><h2>Post-Production-Handoff</h2></div><p className="field-note">Cover exportieren, dann diesen Befehl im <code>postprod</code>-Ordner ausführen — er bettet das quadratische Cover in die Podcast-MP3 ein.</p><div className="two-fields"><label className="field-control"><span>Videopfad</span><Input value={videoPath} onChange={(event) => setVideoPath(event.target.value)} placeholder="/pfad/zum/video.mp4" /></label><label className="field-control"><span>Cover-Ordner</span><Input value={coverDir} onChange={(event) => setCoverDir(event.target.value)} placeholder="/pfad/zum/downloads" /></label></div><div className="handoff-command"><code>{handoffCommand}</code><Button variant="outline" onClick={() => copyHandoff(handoffCommand)}>{handoffCopied ? "Kopiert ✓" : "Kopieren"}</Button></div><p className="field-note">Erwartetes Cover nach dem Export: <code>{coverFileName(episode, preset.version)}</code></p><div className="handoff-links"><Button variant="outline" onClick={() => copyHandoff(covermakerLink)}>Prefill-Link kopieren</Button></div></section></section>
      </TabsContent>
    </Tabs>
    <p className={`save-status ${saveStatus.includes("nicht") || saveStatus.includes("voll") ? "save-status--error" : ""}`} role="status">{saveStatus}</p>
    {notice && <div className="toast" role="alert">{notice}</div>}
  </main>;
}
