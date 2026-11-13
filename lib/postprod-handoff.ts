import type { Episode, SeasonPreset } from "./artwork.ts";
import { normalizeEpisode } from "./artwork.ts";

const EPISODE_LIMITS = { title: 160, subtitle: 160, tag: 80, seedOverride: 160 };

export type EpisodeUpdate = Partial<Pick<Episode, "number" | "title" | "subtitle" | "tag" | "accent">>;

// Guest injection from query params: a data URL for the guest portrait plus
// an optional name. Used by the headless renderer (render-headless.mjs) to
// pass a local file into the artwork without touching localStorage.
export type GuestUpdate = { image: string; name?: string };

export function readGuestQuery(params: URLSearchParams): GuestUpdate | null {
  const rawImage = params.get("gast") ?? params.get("guest");
  if (rawImage === null || rawImage.trim() === "") return null;
  const image = rawImage.trim();
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return null;
  const rawName = params.get("gastname") ?? params.get("guestname");
  const name = rawName !== null && rawName.trim() !== "" ? Array.from(rawName.trim()).slice(0, 100).join("") : undefined;
  return { image, name };
}

export function guestToPerson(guest: GuestUpdate, fallbackNumber: number): { id: string; name: string; role: "guest"; image: string } {
  return {
    id: "guest-query-" + fallbackNumber,
    name: guest.name ?? "Gast",
    role: "guest",
    image: guest.image,
  };
}

// Query parameters prefill the editor: ep/episode for the number and
// titel/title for the title (German first, English as alias). Blank or
// invalid values never override the restored draft.
export function readEpisodeQuery(params: URLSearchParams): EpisodeUpdate {
  const update: EpisodeUpdate = {};
  const rawNumber = params.get("ep") ?? params.get("episode");
  if (rawNumber !== null && rawNumber.trim() !== "") {
    const parsed = Number(rawNumber);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 9999) update.number = parsed;
  }
  const rawTitle = params.get("titel") ?? params.get("title");
  if (rawTitle !== null && rawTitle.trim() !== "") {
    update.title = Array.from(rawTitle.trim()).slice(0, EPISODE_LIMITS.title).join("");
  }
  const rawSubtitle = params.get("subtitel") ?? params.get("subtitle");
  if (rawSubtitle !== null && rawSubtitle.trim() !== "") {
    update.subtitle = Array.from(rawSubtitle.trim()).slice(0, EPISODE_LIMITS.subtitle).join("");
  }
  return update;
}

export function createCovermakerQuery(episode: Episode): URLSearchParams {
  const params = new URLSearchParams();
  params.set("ep", String(episode.number));
  if (episode.title) params.set("titel", episode.title);
  if (episode.subtitle) params.set("subtitel", episode.subtitle);
  return params;
}

// Strict single-quote escaping for POSIX shells: wrap in '…', replace
// embedded quotes with '\'' — the only safe way to pass arbitrary text
// (including newlines and semicolons) as one argument.
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export type PostprodCommandInput = {
  episode: Episode;
  presetVersion: number;
  videoPath: string;
  coverDir: string;
  postprodPath?: string;
};

export function coverFileName(episode: Episode, presetVersion: number): string {
  return `allesokai-ep${String(episode.number).padStart(3, "0")}-square-preset-v${presetVersion}.png`;
}

export function createPostprodCommand({ episode, presetVersion, videoPath, coverDir, postprodPath = "./postprod.sh" }: PostprodCommandInput): string {
  const parts = [
    postprodPath,
    String(episode.number),
    videoPath,
    ...(episode.title ? ["--titel", shellQuote(episode.title)] : []),
    "--cover",
    `${coverDir.replace(/\/+$/, "")}/${coverFileName(episode, presetVersion)}`,
  ];
  return parts.join(" ");
}

export function applyQueryToEpisode(episode: Episode, update: EpisodeUpdate): Episode {
  const candidate = { ...episode, ...update };
  const normalized = normalizeEpisode(candidate);
  return normalized ?? episode;
}

export type SeasonPresetVersion = Pick<SeasonPreset, "version">;
