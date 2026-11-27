import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

export const POSER_CUT_QUERY = "poserCut";
export const LEGACY_POSER_CUT_KEY = "toonstudio:poser:pending-cut-layer";
const keyFor = (id: string) => `toonstudio:poser:cut:v1:${id}`;
const validId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id);

export interface PoserCutRaster { readonly pngDataUrl: string; readonly width: number; readonly height: number; readonly displayWidth?: number; readonly displayHeight?: number }
interface PoserCut extends PoserCutRaster { readonly owner: string | null; readonly path: string }

function isRaster(value: unknown): value is PoserCutRaster {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PoserCutRaster>;
  const validSize = (size: unknown): size is number => typeof size === "number" && Number.isSafeInteger(size) && size > 0;
  const displayValid = (display: unknown, original: number) => display === undefined || (validSize(display) && display <= original);
  return typeof row.pngDataUrl === "string" && /^data:image\/png;base64,[a-z\d+/]+=*$/iu.test(row.pngDataUrl)
    && validSize(row.width) && validSize(row.height) && displayValid(row.displayWidth, row.width) && displayValid(row.displayHeight, row.height);
}

export function readLegacyPoserCut(storage: Storage): PoserCutRaster | null {
  const raw = storage.getItem(LEGACY_POSER_CUT_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRaster(value) ? value : null;
  } catch { return null; }
}

export function stagePoserCut(target: string, owner: string | null, raster: PoserCutRaster): string {
  if (!isRaster(raster)) throw new Error("포즈 PNG를 읽지 못했습니다. 다시 캡처해 주세요.");
  const url = new URL(target, window.location.origin);
  const id = createSecureRandomUuid("포즈 컷 전달 ID를 만들 수 없습니다.");
  const cut: PoserCut = { pngDataUrl: raster.pngDataUrl, width: raster.width, height: raster.height,
    displayWidth: raster.displayWidth, displayHeight: raster.displayHeight, owner, path: url.pathname };
  window.sessionStorage.setItem(keyFor(id), JSON.stringify(cut));
  url.searchParams.set(POSER_CUT_QUERY, id);
  return url.pathname + url.search;
}

export function readPoserCut(storage: Storage, id: string, owner: string | null, path: string): PoserCutRaster | null {
  if (!validId(id)) return null;
  const raw = storage.getItem(keyFor(id));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!isRaster(value) || !("path" in value) || value.path !== path || !("owner" in value) || value.owner !== owner) return null;
  return value;
}

export function finishPoserCut(storage: Storage, id: string) {
  if (validId(id)) storage.removeItem(keyFor(id));
}
