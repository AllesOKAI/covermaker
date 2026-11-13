import type { ArtworkFormat, Episode } from "./artwork.ts";

export type FontSpec = { family: string; weight: string; size: number };
export type MeasureText = (text: string, spec: FontSpec) => number;

export type LineFit = { lines: string[]; maxWidth: number; maxLines: number; overflow: boolean };
export type FormatFit = {
  title: LineFit;
  subtitle: LineFit;
  tag: LineFit;
  warnings: string[];
};

type FormatGeometry = { width: number; height: number; title: { maxWidth: number; maxLines: number; size: number }; subtitle: { maxWidth: number; maxLines: number; size: number }; tag: { maxWidth: number; size: number } };

// Safe areas and font sizes mirror the rendered CoverArt geometry per format
// (app/page.tsx): titles wrap with the same word-based algorithm the render
// uses, so measured lines match drawn lines and warnings match exports.
function formatGeometry(episode: Episode, format: ArtworkFormat): FormatGeometry {
  const long = episode.title.length > 48;
  switch (format) {
    case "square": return {
      width: 1000, height: 1000,
      title: { maxWidth: 1000 - 112 * 2, maxLines: 3, size: long ? 68 : 78 },
      subtitle: { maxWidth: 1000 - 112 * 2 - 6, maxLines: 1, size: 36 },
      tag: { maxWidth: 1000 - 112 * 2, size: 39 },
    };
    case "story": case "story-clean": return {
      width: 1080, height: 1920,
      title: { maxWidth: 1080 - 92 * 2, maxLines: 5, size: long ? 90 : 102 },
      subtitle: { maxWidth: 1080 - 92 * 2 - 6, maxLines: 2, size: 48 },
      tag: { maxWidth: 1080 - 72 * 2, size: 64 },
    };
    case "linkedin": return {
      width: 1914, height: 1000,
      title: { maxWidth: 1914 - 112 * 2, maxLines: 3, size: long ? 68 : 78 },
      subtitle: { maxWidth: 1914 - 112 * 2 - 6, maxLines: 1, size: 36 * 1.5 },
      tag: { maxWidth: 1914 - 112 * 2, size: 39 },
    };
    case "youtube": return {
      width: 1920, height: 1080,
      title: { maxWidth: 1920 - 112 * 2, maxLines: 3, size: (long ? 68 : 78) * 1.15 },
      subtitle: { maxWidth: 1920 - 112 * 2, maxLines: 2, size: 36 * 1.5 },
      tag: { maxWidth: 1920 - 112 * 2, size: 39 },
    };
  }
}

const TITLE_FONT = { family: "SpockEssBlack", weight: "900" };
const SUBTITLE_FONT = { family: "SpockEss", weight: "500" };
const TAG_FONT = { family: "SpockEss", weight: "700" };

function wrapToWidth(text: string, maxWidth: number, spec: FontSpec, measure: MeasureText): string[] {
  const lines: string[] = [];
  for (const paragraph of text.trim().split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, spec) <= maxWidth) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      // Break unusually long words as well, so they stay within the safe area.
      for (const character of Array.from(word)) {
        if (line && measure(line + character, spec) > maxWidth) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function fitArtworkText(episode: Episode, format: ArtworkFormat, measure: MeasureText): FormatFit {
  const geometry = formatGeometry(episode, format);
  const warnings: string[] = [];

  const titleSpec = { ...TITLE_FONT, size: geometry.title.size };
  const titleLines = wrapToWidth(episode.title, geometry.title.maxWidth, titleSpec, measure);
  const titleOverflow = titleLines.length > geometry.title.maxLines;
  if (titleOverflow) warnings.push(`Title needs ${titleLines.length} lines but only ${geometry.title.maxLines} fit in the ${format} safe area`);

  const subtitleSpec = { ...SUBTITLE_FONT, size: geometry.subtitle.size };
  const subtitleLines = episode.subtitle ? wrapToWidth(episode.subtitle, geometry.subtitle.maxWidth, subtitleSpec, measure) : [];
  const subtitleOverflow = subtitleLines.length > geometry.subtitle.maxLines;
  if (episode.subtitle && subtitleOverflow) warnings.push(`Subtitle needs ${subtitleLines.length} lines but only ${geometry.subtitle.maxLines} fit in the ${format} safe area`);

  const tagSpec = { ...TAG_FONT, size: geometry.tag.size };
  const tagWidth = episode.tag ? measure(episode.tag, tagSpec) : 0;
  const tagOverflow = tagWidth > geometry.tag.maxWidth;
  if (episode.tag && tagOverflow) warnings.push(`Tag is too wide for the ${format} safe area`);

  return {
    title: { lines: titleLines.slice(0, geometry.title.maxLines), maxWidth: geometry.title.maxWidth, maxLines: geometry.title.maxLines, overflow: titleOverflow },
    subtitle: { lines: subtitleLines.slice(0, geometry.subtitle.maxLines), maxWidth: geometry.subtitle.maxWidth, maxLines: geometry.subtitle.maxLines, overflow: subtitleOverflow },
    tag: { lines: episode.tag ? [episode.tag] : [], maxWidth: geometry.tag.maxWidth, maxLines: 1, overflow: tagOverflow },
    warnings,
  };
}

export type ArtworkWarnings = Partial<Record<ArtworkFormat, string[]>>;

export function validateArtwork(episode: Episode, measure: MeasureText): ArtworkWarnings {
  const formats: ArtworkFormat[] = ["square", "story", "story-clean", "linkedin", "youtube"];
  const report: ArtworkWarnings = {};
  for (const format of formats) {
    const fit = fitArtworkText(episode, format, measure);
    if (fit.warnings.length) report[format] = fit.warnings;
  }
  return report;
}
