import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { initialEpisode, initialPreset } from "./artwork.ts";
import type { Draft, Episode, SeasonPreset } from "./artwork.ts";
import { loadDraft, loadStoredPresets, nextPresetVersion, queueDraftSave, saveDraft, savePresets } from "./browser-storage.ts";
import type { SaveResult } from "./browser-storage.ts";

export type SavePresetResult = { status: string; presetId: string; version: number } | SaveResult;

export function useCoverDraft(onNotice: (message: string) => void) {
  const [episode, setEpisode] = useState<Episode>(initialEpisode);
  const [preset, setPreset] = useState<SeasonPreset>(initialPreset);
  const [presets, setPresets] = useState<SeasonPreset[]>([initialPreset]);
  const [saveStatus, setSaveStatus] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const draftRef = useRef<Draft>({ episode: initialEpisode, preset: initialPreset });
  const presetsRef = useRef<SeasonPreset[]>([initialPreset]);
  const versionRef = useRef(0);
  const noticeRef = useRef(onNotice);
  const userEdited = useRef(false);

  useEffect(() => { noticeRef.current = onNotice; }, [onNotice]);

  useEffect(() => {
    const restored = loadDraft(localStorage);
    const stored = loadStoredPresets(localStorage);
    const available = stored.some((item) => item.id === restored.preset.id && item.version === restored.preset.version)
      ? stored
      : [...stored, restored.preset];
    startTransition(() => {
      // A user who typed before hydration finished owns the session: never
      // overwrite their edits with the restored draft.
      if (!userEdited.current) {
        draftRef.current = { episode: restored.episode, preset: restored.preset };
        setEpisode(restored.episode);
        setPreset(restored.preset);
      }
      presetsRef.current = available;
      setPresets(available);
      setHydrated(true);
    });
    if (restored.warning) noticeRef.current(restored.warning);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    draftRef.current = { episode, preset };
    presetsRef.current = presets;
    const version = ++versionRef.current;
    const timer = setTimeout(() => {
      setSaveStatus("Saving locally…");
      queueDraftSave({ episode, preset }, (result) => {
        if (version !== versionRef.current) return;
        setSaveStatus(result.ok ? "Draft + preset saved locally" : result.message);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [episode, preset, presets, hydrated]);

  const savePresetVersion = useCallback((): SavePresetResult => {
    const current = draftRef.current;
    const next = nextPresetVersion(presetsRef.current, current.preset);
    const result = savePresets(localStorage, next.presets);
    if (!result.ok) { setSaveStatus(result.message); noticeRef.current(result.message); return result; }
    const draftResult = saveDraft(localStorage, { episode: current.episode, preset: next.preset });
    if (!draftResult.ok) { setSaveStatus(draftResult.message); noticeRef.current(draftResult.message); return draftResult; }
    draftRef.current = { episode: current.episode, preset: next.preset };
    presetsRef.current = next.presets;
    setPreset(next.preset);
    setPresets(next.presets);
    setSaveStatus("Preset and draft saved locally");
    noticeRef.current(`${next.preset.name} saved as v${next.preset.version}`);
    return { status: "saved", presetId: next.preset.id, version: next.preset.version };
  }, []);

  const setEpisodeField = <K extends keyof Episode>(key: K, value: Episode[K]) => {
    userEdited.current = true;
    setEpisode((current) => ({ ...current, [key]: value }));
  };
  const updatePreset = <K extends keyof SeasonPreset>(key: K, value: SeasonPreset[K]) => {
    userEdited.current = true;
    setPreset((current) => ({ ...current, [key]: value }));
  };
  const selectPreset = (value: string) => {
    const [id, version] = value.split(":");
    const found = presetsRef.current.find((item) => item.id === id && item.version === Number(version));
    if (found) {
      userEdited.current = true;
      setPreset(found);
    }
  };

  return { episode, setEpisode, setEpisodeField, preset, setPreset, presets, updatePreset, selectPreset, savePresetVersion, saveStatus };
}
