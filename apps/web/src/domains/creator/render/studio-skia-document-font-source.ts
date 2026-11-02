import type { SkiaDocumentFontSource } from "@toonstudio/studio-engine-skia";
import { STUDIO_SKIA_PRETENDARD_FONT_URL } from "./studio-skia-document-font-contract";
import {
  getProductStudioCustomFontRepository,
  STUDIO_CUSTOM_FONT_MAX_COMPATIBILITY_ENTRIES,
} from "../studio-custom-font-sqlite-opfs-repository";

const CSS_BYTE_LIMIT = 512 * 1024;
const FONT_BYTE_LIMIT = 64 * 1024 * 1024;
const ALLOWED_FONT_HOSTS = new Set(["cdn.jsdelivr.net", "fonts.gstatic.com"]);
const ALLOWED_FONT_STYLESHEET_HOSTS = new Set(["fonts.googleapis.com"]);

async function readBounded(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`font response failed (${response.status})`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    throw new Error("font response exceeds byte budget");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limit) throw new Error("font response exceeds byte budget");
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) throw new Error("font response exceeds byte budget");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isLocalDefaultFontUrl(url: URL): boolean {
  const origin = globalThis.location?.origin;
  const protocolAllowed = url.protocol === "https:"
    || (url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  return Boolean(origin && origin !== "null"
    && protocolAllowed && url.origin === origin
    && url.pathname === STUDIO_SKIA_PRETENDARD_FONT_URL
    && !url.username && !url.password && !url.search && !url.hash);
}

function resolveFontUrl(value: string): URL {
  if (value === STUDIO_SKIA_PRETENDARD_FONT_URL) {
    const origin = globalThis.location?.origin;
    if (!origin || origin === "null") {
      throw new Error("local GPU font requires a browser origin");
    }
    return assertFontUrl(new URL(value, origin));
  }
  return assertFontUrl(new URL(value));
}

function assertFontUrl(url: URL): URL {
  if (isLocalDefaultFontUrl(url)) return url;
  if (url.protocol !== "https:" || !ALLOWED_FONT_HOSTS.has(url.hostname)) {
    throw new Error(`untrusted GPU font host: ${url.hostname}`);
  }
  return url;
}

function assertFontStylesheetUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:"
    || !ALLOWED_FONT_STYLESHEET_HOSTS.has(url.hostname)) {
    throw new Error(`untrusted GPU font stylesheet host: ${url.hostname}`);
  }
  return url;
}

function stylesheetUrls(css: string, stylesheetUrl: string): URL[] {
  const found = new Map<string, URL>();
  const pattern = /url\((?:["']?)([^)"']+)(?:["']?)\)\s*format\((?:["']?)(?:woff2?(?:-variations)?|truetype|opentype)(?:["']?)\)/giu;
  for (const match of css.matchAll(pattern)) {
    const url = assertFontUrl(new URL(match[1]!, stylesheetUrl));
    found.set(url.href, url);
  }
  return [...found.values()];
}

async function loadCssFont(
  value: string,
  signal: AbortSignal,
): Promise<readonly Uint8Array[]> {
  const stylesheetUrl = assertFontStylesheetUrl(value);
  const cssBytes = await readBounded(
    await fetch(stylesheetUrl, { signal, credentials: "omit" }),
    CSS_BYTE_LIMIT,
    signal,
  );
  const urls = stylesheetUrls(
    new TextDecoder().decode(cssBytes),
    stylesheetUrl.href,
  );
  if (urls.length === 0) {
    throw new Error("font stylesheet contained no supported sources");
  }
  const loaded: Uint8Array[] = [];
  let total = 0;
  for (const source of urls) {
    const bytes = await readBounded(
      await fetch(source, isLocalDefaultFontUrl(source)
        ? { signal, credentials: "omit", redirect: "error" }
        : { signal, credentials: "omit" }),
      FONT_BYTE_LIMIT - total,
      signal,
    );
    total += bytes.byteLength;
    if (total > FONT_BYTE_LIMIT) throw new Error("font family exceeds byte budget");
    loaded.push(bytes);
  }
  return loaded;
}

async function loadCustomFont(
  family: string,
  signal: AbortSignal,
): Promise<readonly Uint8Array[]> {
  const receipt = await getProductStudioCustomFontRepository().materialize({
    maxEntries: STUDIO_CUSTOM_FONT_MAX_COMPATIBILITY_ENTRIES,
    maxHydratedBytes: FONT_BYTE_LIMIT,
    pageSize: 32,
    signal,
  });
  const font = receipt.fonts.find(
    (candidate) => candidate.family.toLowerCase() === family.toLowerCase(),
  );
  if (!font?.verifiedBytes) {
    throw new Error(`verified custom font bytes are unavailable: ${family}`);
  }
  return [Uint8Array.from(font.verifiedBytes)];
}

export async function loadStudioSkiaDocumentFontData(
  font: SkiaDocumentFontSource,
  signal: AbortSignal,
): Promise<readonly Uint8Array[]> {
  signal.throwIfAborted();
  if (font.key.startsWith("font:")) {
    const url = resolveFontUrl(font.key.slice(5));
    return [await readBounded(
      // 로컬 고정 자산의 redirect를 따라가 허용 범위를 넓히지 않는다.
      await fetch(url, isLocalDefaultFontUrl(url)
        ? { signal, credentials: "omit", redirect: "error" }
        : { signal, credentials: "omit" }),
      FONT_BYTE_LIMIT,
      signal,
    )];
  }
  if (font.key.startsWith("css:")) {
    return loadCssFont(font.key.slice(4), signal);
  }
  if (font.key.startsWith("custom:")) {
    return loadCustomFont(font.family, signal);
  }
  throw new Error(`unsupported GPU font source: ${font.family}`);
}
