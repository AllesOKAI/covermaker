export type Wave = "sine" | "triangle" | "saw";
export type RenderMode = "lines" | "dots";
export type WidthCurve = "linear" | "ease-in" | "ease-out";
export type ArtworkFormat = "square" | "story" | "story-clean" | "linkedin" | "youtube";
export type Person = { id: string; name: string; role: "host" | "guest"; image: string };
export type SeasonPreset = {
  id: string;
  name: string;
  version: number;
  generatorVersion: string;
  carrier: { wave: Wave; frequency: number; amplitude: number };
  modulator: { wave: Wave; ratio: number; depth: number; phase: number };
  field: {
    lineCount: number; rotation: number; warp: number; mode: RenderMode;
    firstWidth: number; lastWidth: number; widthCurve: WidthCurve;
    dotDensity: number; depthTint: number; perspective: number; phaseSpread: number;
  };
  variation: { phase: number; ratio: number; warp: number };
};
export type Episode = {
  number: number;
  title: string;
  subtitle: string;
  tag: string;
  accent: string;
  people: Person[];
  seedOverride: string;
};
export type Draft = { episode: Episode; preset: SeasonPreset };

export const PURPLE = "#29022F";
export const LIME = "#94F20D";

export const initialPreset: SeasonPreset = {
  id: "season-01", name: "Season 01 / Contour Field", version: 2, generatorVersion: "contour-3.0",
  carrier: { wave: "triangle", frequency: 1.55, amplitude: 0.055 },
  modulator: { wave: "sine", ratio: 1.3, depth: 0.26, phase: 0.31 },
  field: {
    lineCount: 49, rotation: 4, warp: 0.21, mode: "lines",
    firstWidth: 2, lastWidth: 9.5, widthCurve: "ease-in",
    dotDensity: 56, depthTint: 0.72, perspective: 0.73, phaseSpread: 0.42,
  },
  variation: { phase: 0.45, ratio: 0.2, warp: 0.12 },
};

export const initialEpisode: Episode = {
  number: 216, title: "Wenn Maschinen plötzlich mitdenken",
  subtitle: "mit einem Blick hinter die Modelle", tag: "Interview", accent: LIME, seedOverride: "",
  people: [
    { id: "dennis", name: "Dennis", role: "host", image: "/assets/hosts/dennis.webp" },
    { id: "jan", name: "Jan", role: "host", image: "/assets/hosts/jan.webp" },
  ],
};

export const guestSamples = [
  "/assets/guests/random-person1.webp",
  "/assets/guests/random-person2.webp",
  "/assets/guests/random-person3.webp",
];

export function normalizePreset(value: unknown): SeasonPreset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SeasonPreset>;
  if (!candidate.carrier || !candidate.modulator || !candidate.field || !candidate.variation) return null;
  const field = candidate.field as SeasonPreset["field"] & { relief?: number };
  const normalized: SeasonPreset = {
    ...initialPreset,
    ...candidate,
    id: typeof candidate.id === "string" ? candidate.id.slice(0, 80) : initialPreset.id,
    name: typeof candidate.name === "string" ? candidate.name.slice(0, 100) : initialPreset.name,
    version: Number.isInteger(candidate.version) && Number(candidate.version) >= 1 ? Number(candidate.version) : initialPreset.version,
    generatorVersion: "contour-3.0",
    carrier: { ...initialPreset.carrier, ...candidate.carrier },
    modulator: { ...initialPreset.modulator, ...candidate.modulator },
    field: { ...initialPreset.field, ...field },
    variation: { ...initialPreset.variation, ...candidate.variation },
  };
  delete (normalized.field as SeasonPreset["field"] & { relief?: number }).relief;
  if (!["sine", "triangle", "saw"].includes(normalized.carrier.wave)) return null;
  if (!["sine", "triangle", "saw"].includes(normalized.modulator.wave)) return null;
  if (!["lines", "dots"].includes(normalized.field.mode)) return null;
  if (!["linear", "ease-in", "ease-out"].includes(normalized.field.widthCurve)) return null;
  const numbers = [
    normalized.carrier.frequency, normalized.carrier.amplitude,
    normalized.modulator.ratio, normalized.modulator.depth, normalized.modulator.phase,
    normalized.field.lineCount, normalized.field.rotation, normalized.field.warp,
    normalized.field.firstWidth, normalized.field.lastWidth, normalized.field.dotDensity,
    normalized.field.depthTint, normalized.field.perspective, normalized.field.phaseSpread,
    normalized.variation.phase, normalized.variation.ratio, normalized.variation.warp,
  ];
  return numbers.every((number) => Number.isFinite(number)) ? normalized : null;
}

export function normalizeEpisode(value: unknown): Episode | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Episode>;
  if (!Number.isInteger(candidate.number) || Number(candidate.number) < 0 || Number(candidate.number) > 9999) return null;
  if (typeof candidate.title !== "string" || typeof candidate.subtitle !== "string" || typeof candidate.tag !== "string") return null;
  if (candidate.title.length > 160 || candidate.subtitle.length > 160 || candidate.tag.length > 80) return null;
  if (typeof candidate.accent !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(candidate.accent)) return null;
  if (!Array.isArray(candidate.people) || candidate.people.length > 3) return null;
  const people: Person[] = [];
  const ids = new Set<string>();
  for (const person of candidate.people) {
    if (!person || typeof person.id !== "string" || person.id.length > 100 || ids.has(person.id)) return null;
    if (typeof person.name !== "string" || person.name.length > 100 || !["host", "guest"].includes(person.role)) return null;
    if (typeof person.image !== "string" || person.image.length > 8_000_000) return null;
    if (!(person.image.startsWith("/assets/") || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(person.image))) return null;
    ids.add(person.id);
    // Migrate pre-webp asset paths so old drafts keep rendering after the
    // .jpg/.jpeg originals were replaced by .webp files.
    const image = person.image
      .replace(/^\/assets\/hosts\/(dennis|jan)\.jpg$/, "/assets/hosts/$1.webp")
      .replace(/^\/assets\/guests\/(random-person[123])\.jpeg$/, "/assets/guests/$1.webp");
    people.push({ id: person.id, name: person.name, role: person.role, image });
  }
  return {
    number: Number(candidate.number), title: candidate.title, subtitle: candidate.subtitle,
    tag: candidate.tag, accent: candidate.accent.toUpperCase(), people,
    seedOverride: typeof candidate.seedOverride === "string" ? candidate.seedOverride.slice(0, 160) : "",
  };
}
