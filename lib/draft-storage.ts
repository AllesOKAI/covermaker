import { initialEpisode, initialPreset, normalizeEpisode, normalizePreset } from "./artwork.ts";
import type { Draft, Episode, SeasonPreset } from "./artwork.ts";
export type { Draft };

export const STORAGE_PRESETS = "allesokai-cover-presets-v4";
export const STORAGE_DRAFT = "allesokai-cover-draft-v5";
const LEGACY_DRAFT = "allesokai-cover-draft-v4";
export type SaveResult = { ok: true } | { ok: false; message: string };

type DraftStorage = Pick<Storage, "getItem" | "setItem">;

function storageError(error: unknown): SaveResult {
  const full = error instanceof DOMException && error.name === "QuotaExceededError";
  const reason = full ? "Der lokale Browserspeicher ist voll." : "Der lokale Browserspeicher ist nicht verfügbar.";
  return { ok: false, message: `${reason} Der Entwurf konnte nicht gespeichert werden. Ein kleineres Gästefoto oder das Freigeben von Website-Daten kann helfen.` };
}

function parse(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return undefined; }
}

export function loadDraft(storage: DraftStorage): Draft & { legacy: boolean; warning?: string } {
  const fallback = { episode: initialEpisode, preset: initialPreset, legacy: false };
  try {
    const current = parse(storage.getItem(STORAGE_DRAFT));
    const legacyEpisode = parse(storage.getItem(LEGACY_DRAFT));
    let episode: Episode | null = null;
    let savedPreset: SeasonPreset | null = null;
    let legacy = false;
    let invalid = false;
    if (current !== null) {
      if (current === undefined || typeof current !== "object") invalid = true;
      else {
        const record = current as { episode?: unknown; preset?: unknown };
        episode = normalizeEpisode(record.episode);
        savedPreset = normalizePreset(record.preset);
        invalid = !episode || !savedPreset;
      }
    } else if (legacyEpisode !== null) {
      episode = normalizeEpisode(legacyEpisode);
      invalid = !episode;
      legacy = !!episode;
    }
    let presets: SeasonPreset[] = [];
    const rawPresets = parse(storage.getItem(STORAGE_PRESETS));
    if (rawPresets === undefined) invalid = true;
    if (Array.isArray(rawPresets)) presets = rawPresets.map(normalizePreset).filter((item): item is SeasonPreset => item !== null);
    const preset = savedPreset ?? (legacy ? presets[presets.length - 1] : null) ?? initialPreset;
    return {
      episode: episode ?? initialEpisode,
      preset: invalid ? initialPreset : preset,
      legacy,
      warning: invalid ? "Gespeicherte Daten waren ungültig und konnten nicht vollständig wiederhergestellt werden. Die aktuelle Bearbeitung wurde zurückgesetzt." : undefined,
    };
  } catch {
    return { ...fallback, warning: "Der lokale Entwurf ist nicht lesbar. Die Bearbeitung bleibt in diesem Tab möglich." };
  }
}

export function saveDraft(storage: DraftStorage, draft: Draft): SaveResult {
  const episode = normalizeEpisode(draft.episode);
  const preset = normalizePreset(draft.preset);
  if (!episode || !preset) return { ok: false, message: "Der Entwurf enthält ungültige Werte und wurde nicht gespeichert." };
  try {
    storage.setItem(STORAGE_DRAFT, JSON.stringify({ version: 5, savedAt: new Date().toISOString(), episode, preset }));
    return { ok: true };
  } catch (error) { return storageError(error); }
}

export function savePresets(storage: DraftStorage, presets: SeasonPreset[]): SaveResult {
  if (!presets.length || presets.some((preset) => !normalizePreset(preset))) return { ok: false, message: "Das Preset enthält ungültige Werte." };
  try { storage.setItem(STORAGE_PRESETS, JSON.stringify(presets)); return { ok: true }; }
  catch (error) { return storageError(error); }
}
