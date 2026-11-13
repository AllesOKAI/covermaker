import { loadDraft, saveDraft, savePresets, STORAGE_PRESETS } from "./draft-storage.ts";
import type { Draft, SaveResult } from "./draft-storage.ts";
import type { SeasonPreset } from "./artwork.ts";
import { initialPreset, normalizePreset } from "./artwork.ts";
export function nextPresetVersion(presets: SeasonPreset[], preset: SeasonPreset): { presets: SeasonPreset[]; preset: SeasonPreset } {
  const version = Math.max(0, ...presets.filter((item) => item.id === preset.id).map((item) => item.version)) + 1;
  const saved = { ...preset, version };
  return { presets: [...presets, saved], preset: saved };
}

export type ImageEnvironment = {
  decode(file: Blob): Promise<{ width: number; height: number; close?: () => void }>;
  createCanvas(): {
    width: number;
    height: number;
    getContext(): { drawImage(...args: unknown[]): void } | null;
    toDataURL(type: string, quality: number): string;
  };
};

export async function prepareGuestImage(file: Blob, environment?: ImageEnvironment): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswählen.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Das Bild ist größer als 20 MB. Bitte eine kleinere Datei auswählen.");
  const env = environment ?? {
    decode: (blob: Blob) => createImageBitmap(blob),
    createCanvas: () => {
      const canvas = document.createElement("canvas");
      return canvas as unknown as ReturnType<ImageEnvironment["createCanvas"]>;
    },
  };
  let source: Awaited<ReturnType<ImageEnvironment["decode"]>>;
  try { source = await env.decode(file); }
  catch { throw new Error("Das Bild konnte nicht gelesen werden. Bitte ein JPEG, PNG oder WebP verwenden."); }
  try {
    if (!source.width || !source.height) throw new Error("Das Bild hat keine verwertbaren Abmessungen.");
    const scale = Math.min(1, 1024 / Math.max(source.width, source.height));
    const canvas = env.createCanvas();
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext();
    if (!context) throw new Error("Das Bild konnte nicht vorbereitet werden.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.86);
    if (!data.startsWith("data:image/jpeg;base64,")) throw new Error("Das Bild konnte nicht komprimiert werden.");
    return data;
  } finally { source.close?.(); }
}

async function normalizeDataImages(draft: Draft): Promise<Draft> {
  const people = await Promise.all(draft.episode.people.map(async (person: typeof draft.episode.people[number]) => {
    if (!person.image.startsWith("data:") || person.image.length < 1_000_000) return person;
    try {
      const blob = await (await fetch(person.image)).blob();
      return { ...person, image: await prepareGuestImage(blob) };
    } catch { return person; }
  }));
  return { ...draft, episode: { ...draft.episode, people } };
}

export function loadStoredPresets(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_PRESETS) || "[]");
    return Array.isArray(value)
      ? [initialPreset, ...value.map(normalizePreset).filter((item): item is SeasonPreset => item !== null && item.version > initialPreset.version)]
      : [initialPreset];
  } catch { return [initialPreset]; }
}

export function createDraftQueue(
  write: (draft: Draft) => SaveResult,
  normalize: (draft: Draft) => Promise<Draft> = (draft) => Promise.resolve(draft),
) {
  let queue = Promise.resolve();
  return (draft: Draft, onResult: (result: SaveResult) => void, onNormalized?: (draft: Draft) => void) => {
    queue = queue.then(async () => {
      const normalized = await normalize(draft);
      onNormalized?.(normalized);
      onResult(write(normalized));
    }).catch(() => onResult({ ok: false, message: "Der Entwurf konnte nicht gespeichert werden. Bitte erneut versuchen." }));
  };
}

export const queueDraftSave = createDraftQueue((draft) => saveDraft(localStorage, draft), normalizeDataImages);

export { loadDraft, saveDraft, savePresets };
export type { SaveResult };
