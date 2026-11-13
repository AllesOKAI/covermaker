export type ResourceCache = {
  fetchAsDataUrl(url: string): Promise<string>;
};

export function createResourceCache(fetchTextOrBlob: (url: string) => Promise<string>): ResourceCache {
  const cache = new Map<string, Promise<string>>();
  return {
    fetchAsDataUrl(url: string) {
      const existing = cache.get(url);
      if (existing) return existing;
      const pending = fetchTextOrBlob(url).catch((error) => {
        cache.delete(url);
        throw error;
      });
      cache.set(url, pending);
      return pending;
    },
  };
}

export function describeExportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "Der Browser-Speicher reichte für den Export nicht aus. Bitte andere Tabs schließen und erneut versuchen.";
  if (/Could not load/.test(message)) return `Eine eingebettete Datei fehlte beim Export (${message}). Bitte die Seite neu laden und erneut exportieren.`;
  if (/PNG export failed/.test(message)) return "Das PNG konnte nicht erzeugt werden. Bitte erneut versuchen.";
  if (/Canvas unavailable/.test(message)) return "Canvas ist in diesem Browser nicht verfügbar.";
  if (/fonts/i.test(message)) return `Schriften konnten nicht geladen werden (${message}). Bitte die Seite neu laden.`;
  return `Export fehlgeschlagen: ${message}`;
}

export type ExportResult = { width: number; height: number; bytes: number };
export type ExportOutcome = { ok: true; result: ExportResult } | { ok: false; message: string };

export async function exportCover(
  svg: SVGSVGElement,
  width: number,
  height: number,
  filename: string,
  cache?: ResourceCache,
): Promise<ExportResult> {
  const sessionCache = cache ?? createResourceCache(defaultFetchAsDataUrl);
  await document.fonts.ready;
  // Let text wrapping commit after the fonts have loaded before cloning the SVG.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const images = Array.from(clone.querySelectorAll("image"));
  await Promise.all(images.map(async (node) => {
    const href = node.getAttribute("href") || "";
    if (href.startsWith("/")) node.setAttribute("href", await sessionCache.fetchAsDataUrl(href));
  }));
  const [regular, bold, essentials, black] = await Promise.all([
    sessionCache.fetchAsDataUrl("/assets/fonts/SpockPro-Regular.woff2"),
    sessionCache.fetchAsDataUrl("/assets/fonts/SpockPro-Bold.woff2"),
    sessionCache.fetchAsDataUrl("/assets/fonts/SpockEssAlt1-Regular.woff2"),
    sessionCache.fetchAsDataUrl("/assets/fonts/SpockEssAlt2-Black.woff2"),
  ]);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `@font-face{font-family:SpockPro;src:url(${regular})} @font-face{font-family:SpockPro;src:url(${bold});font-weight:700} @font-face{font-family:SpockEss;src:url(${essentials})} @font-face{font-family:SpockEssBlack;src:url(${black});font-weight:900}`;
  clone.prepend(style);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const source = new XMLSerializer().serializeToString(clone);
  const objectUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("PNG export failed: SVG could not be rendered")); image.src = objectUrl; });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("PNG export failed");
    const downloadUrl = URL.createObjectURL(png);
    try {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      link.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    }
    return { width: canvas.width, height: canvas.height, bytes: png.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function defaultFetchAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return blobToDataUrl(await response.blob());
}

export async function exportArtwork(
  svg: SVGSVGElement | null,
  width: number,
  height: number,
  filename: string,
  cache?: ResourceCache,
): Promise<ExportOutcome> {
  if (!svg) return { ok: false, message: "Die Vorschau für dieses Format ist noch nicht bereit." };
  try {
    return { ok: true, result: await exportCover(svg, width, height, filename, cache) };
  } catch (error) {
    return { ok: false, message: describeExportError(error) };
  }
}

export async function exportAllFormats(
  targets: Array<{ svg: SVGSVGElement | null; width: number; height: number; filename: string; label: string }>,
  cache?: ResourceCache,
): Promise<Array<{ label: string; outcome: ExportOutcome }>> {
  const sessionCache = cache ?? createResourceCache(defaultFetchAsDataUrl);
  const results: Array<{ label: string; outcome: ExportOutcome }> = [];
  // Sequential on purpose: parallel PNG downloads would open five save
  // dialogs at once and browsers may block or interleave them.
  for (const target of targets) {
    results.push({ label: target.label, outcome: await exportArtwork(target.svg, target.width, target.height, target.filename, sessionCache) });
  }
  return results;
}
