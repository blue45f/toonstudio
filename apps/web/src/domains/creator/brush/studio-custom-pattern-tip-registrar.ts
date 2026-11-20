/**
 * 선택 영역/레이어 1클릭 커스텀 리본·스탬프 패턴 브러시 팁 등록·직렬화 엔진.
 *
 * CSP의 `소재 등록 > 브러시 끝 모양으로 사용` 및 리본/스탬프 패턴 브러시 등록 동선을
 * 웹 캔버스에서 즉시 실행할 수 있도록 RGBA 픽셀 버퍼 정규화, 알파/휘도 추출,
 * 리본 심리스 이음새 블렌딩, 직렬화·역직렬화 및 로컬 레지스트리를 순수 함수로 제공한다.
 */
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";

export type CustomPatternTipMode = "stamp" | "ribbon";
export type CustomPatternTipColorMode = "alpha-mask" | "full-color-rgba";
export type CustomPatternTipSize = 32 | 64 | 128 | 256;

export interface CustomPatternSourcePixels {
  readonly width: number;
  readonly height: number;
  /** RGBA8 interleaved buffer (`width * height * 4`). */
  readonly rgba: Uint8ClampedArray;
  /** 선택 영역 마스크(`width * height`, 0..255). 생략 시 전체 레이어 사용. */
  readonly selectionMask?: Uint8Array;
}

export interface CustomPatternTipRegisterOptions {
  readonly name: string;
  readonly mode: CustomPatternTipMode;
  readonly colorMode?: CustomPatternTipColorMode;
  readonly targetSize?: CustomPatternTipSize;
  /** 리본 모드 시 좌우 이음새 심리스 블렌드 폭(px, 0..32). 기본 6. */
  readonly ribbonSeamlessOverlapPx?: number;
  /** 스탬프 간격 비율(0.05..2.0). 리본은 1.0 권장. */
  readonly spacingRatio?: number;
  readonly tags?: readonly string[];
  readonly createdAtIso?: string;
}

export interface CustomPatternSourceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioCustomPatternTipRecord {
  readonly schemaVersion: 1;
  readonly tipId: string;
  readonly contentHash: string;
  readonly name: string;
  readonly mode: CustomPatternTipMode;
  readonly colorMode: CustomPatternTipColorMode;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly spacingRatio: number;
  readonly ribbonSeamlessOverlapPx: number;
  readonly alphaMapBase64: string;
  /** `colorMode === "full-color-rgba"`일 때만 포함되는 정규화 RGBA8 base64. */
  readonly rgbaBase64?: string;
  readonly sourceBounds: CustomPatternSourceBounds;
  readonly tags: readonly string[];
  readonly createdAtIso: string;
}

export class CustomPatternTipRegistrationError extends Error {
  constructor(
    readonly code: "invalid-buffer" | "blank-selection" | "invalid-serialized",
    message: string,
  ) {
    super(message);
    this.name = "CustomPatternTipRegistrationError";
  }
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function fnv1a64Hex(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((b + i) & 0xff), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1]! : 0;
    const b2 = has2 ? bytes[i + 2]! : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(n >>> 18) & 63];
    out += BASE64_ALPHABET[(n >>> 12) & 63];
    out += has1 ? BASE64_ALPHABET[(n >>> 6) & 63] : "=";
    out += has2 ? BASE64_ALPHABET[n & 63] : "=";
  }
  return out;
}

function base64ToBytes(encoded: string): Uint8Array {
  const clean = encoded.replace(/[^A-Za-z0-9+/=]/gu, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(clean[i] ?? "A");
    const c1 = BASE64_ALPHABET.indexOf(clean[i + 1] ?? "A");
    const ch2 = clean[i + 2] ?? "=";
    const ch3 = clean[i + 3] ?? "=";
    const c2 = ch2 === "=" ? 0 : BASE64_ALPHABET.indexOf(ch2);
    const c3 = ch3 === "=" ? 0 : BASE64_ALPHABET.indexOf(ch3);
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((n >>> 16) & 0xff);
    if (ch2 !== "=") out.push((n >>> 8) & 0xff);
    if (ch3 !== "=") out.push(n & 0xff);
  }
  return Uint8Array.from(out);
}

/** 선택 마스크를 적용해 유효 콘텐츠의 타이트 바운딩 박스를 계산한다. */
export function computeSelectionContentBounds(
  source: CustomPatternSourcePixels,
): CustomPatternSourceBounds | null {
  const { width, height, rgba, selectionMask } = source;
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    throw new CustomPatternTipRegistrationError(
      "invalid-buffer",
      "RGBA 버퍼 크기와 가로·세로 해상도가 일치하지 않습니다.",
    );
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const maskAlpha = selectionMask ? (selectionMask[idx] ?? 0) : 255;
      if (maskAlpha === 0) continue;
      const a = rgba[idx * 4 + 3] ?? 0;
      if (a === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function sampleSourceRgba(
  source: CustomPatternSourcePixels,
  bounds: CustomPatternSourceBounds,
  u: number,
  v: number,
): [number, number, number, number] {
  const sx = bounds.x + Math.min(bounds.width - 1, Math.max(0, u * (bounds.width - 1)));
  const sy = bounds.y + Math.min(bounds.height - 1, Math.max(0, v * (bounds.height - 1)));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(source.width - 1, x0 + 1);
  const y1 = Math.min(source.height - 1, y0 + 1);
  const fx = sx - x0;
  const fy = sy - y0;

  const read = (px: number, py: number): [number, number, number, number] => {
    const idx = py * source.width + px;
    const m = source.selectionMask ? (source.selectionMask[idx] ?? 0) / 255 : 1;
    const o = idx * 4;
    return [
      source.rgba[o] ?? 0,
      source.rgba[o + 1] ?? 0,
      source.rgba[o + 2] ?? 0,
      (source.rgba[o + 3] ?? 0) * m,
    ];
  };

  const c00 = read(x0, y0);
  const c10 = read(x1, y0);
  const c01 = read(x0, y1);
  const c11 = read(x1, y1);

  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let ch = 0; ch < 4; ch += 1) {
    const top = c00[ch]! * (1 - fx) + c10[ch]! * fx;
    const bot = c01[ch]! * (1 - fx) + c11[ch]! * fx;
    out[ch] = Math.round(top * (1 - fy) + bot * fy);
  }
  return out;
}

/** 리본 타일링 시 왼쪽·오른쪽 끝단을 부드럽게 블렌드해 끊김 없는 연속 패턴을 만든다. */
function applyHorizontalSeamlessRibbonBlend(
  rgba: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  overlapPx: number,
): void {
  const overlap = Math.min(Math.floor(width / 4), Math.max(0, Math.floor(overlapPx)));
  if (overlap <= 0) return;

  for (let y = 0; y < height; y += 1) {
    for (let dx = 0; dx < overlap; dx += 1) {
      const t = (dx + 0.5) / overlap; // 0(끝단) -> 1(내부)
      const leftIdx = y * width + dx;
      const rightIdx = y * width + (width - 1 - dx);
      const avgA = Math.round((alpha[leftIdx]! + alpha[rightIdx]!) * 0.5);
      alpha[leftIdx] = Math.round(avgA * (1 - t) + alpha[leftIdx]! * t);
      alpha[rightIdx] = Math.round(avgA * (1 - t) + alpha[rightIdx]! * t);

      const lo = leftIdx * 4;
      const ro = rightIdx * 4;
      for (let ch = 0; ch < 4; ch += 1) {
        const avg = Math.round((rgba[lo + ch]! + rgba[ro + ch]!) * 0.5);
        rgba[lo + ch] = Math.round(avg * (1 - t) + rgba[lo + ch]! * t);
        rgba[ro + ch] = Math.round(avg * (1 - t) + rgba[ro + ch]! * t);
      }
    }
  }
}

/**
 * 선택 영역 또는 레이어 픽셀을 1클릭으로 커스텀 리본·스탬프 패턴 브러시 팁으로 등록한다.
 */
export function registerCustomPatternTipFromPixels(
  source: CustomPatternSourcePixels,
  options: CustomPatternTipRegisterOptions,
): StudioCustomPatternTipRecord {
  const bounds = computeSelectionContentBounds(source);
  if (!bounds) {
    throw new CustomPatternTipRegistrationError(
      "blank-selection",
      "선택 영역이 비어 있어 브러시 팁을 등록할 수 없습니다.",
    );
  }

  const targetSize: CustomPatternTipSize = options.targetSize ?? 64;
  const colorMode: CustomPatternTipColorMode = options.colorMode ?? "alpha-mask";
  const aspectRatio = Number((bounds.width / Math.max(1, bounds.height)).toFixed(4));

  // 스탬프는 정사각(targetSize × targetSize) 중앙 배치, 리본은 종횡비 유지 스트립
  const outW =
    options.mode === "ribbon"
      ? Math.max(16, Math.min(256, Math.round(targetSize * Math.min(4, Math.max(0.5, aspectRatio)))))
      : targetSize;
  const outH = targetSize;

  const rgbaOut = new Uint8Array(outW * outH * 4);
  const alphaOut = new Uint8Array(outW * outH);
  let maxAlpha = 0;

  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      let u: number;
      let v: number;
      if (options.mode === "stamp") {
        // 정사각 캔버스 중앙에 비율을 유지해 축소·배치
        const maxDim = Math.max(bounds.width, bounds.height);
        const padX = (maxDim - bounds.width) * 0.5;
        const padY = (maxDim - bounds.height) * 0.5;
        const gx = ((x + 0.5) / outW) * maxDim - padX;
        const gy = ((y + 0.5) / outH) * maxDim - padY;
        if (gx < 0 || gy < 0 || gx > bounds.width || gy > bounds.height) continue;
        u = gx / Math.max(1, bounds.width);
        v = gy / Math.max(1, bounds.height);
      } else {
        u = (x + 0.5) / outW;
        v = (y + 0.5) / outH;
      }

      const [r, g, b, a] = sampleSourceRgba(source, bounds, u, v);
      const idx = y * outW + x;
      const o = idx * 4;
      rgbaOut[o] = r;
      rgbaOut[o + 1] = g;
      rgbaOut[o + 2] = b;
      rgbaOut[o + 3] = a;

      // 불투명 흑백 그림(종이 위 잉크)도 감지할 수 있도록 알파와 어두운 잉크 강도를 결합한다.
      const lumaDarkness = 255 - Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const maskVal = colorMode === "alpha-mask" && a === 255 && lumaDarkness < 255
        ? Math.max(lumaDarkness, Math.round(a * (lumaDarkness / 255)))
        : a;
      alphaOut[idx] = maskVal;
      if (maskVal > maxAlpha) maxAlpha = maskVal;
    }
  }

  if (maxAlpha === 0) {
    throw new CustomPatternTipRegistrationError(
      "blank-selection",
      "유효한 픽셀 대비를 찾지 못해 패턴 브러시 팁을 생성할 수 없습니다.",
    );
  }

  // 알파 맵 정규화(최대값을 255로 스케일)
  if (maxAlpha < 255) {
    const scale = 255 / maxAlpha;
    for (let i = 0; i < alphaOut.length; i += 1) {
      alphaOut[i] = Math.min(255, Math.round(alphaOut[i]! * scale));
    }
  }

  const overlapPx = options.mode === "ribbon" ? Math.max(0, Math.min(32, options.ribbonSeamlessOverlapPx ?? 6)) : 0;
  if (options.mode === "ribbon" && overlapPx > 0) {
    applyHorizontalSeamlessRibbonBlend(rgbaOut, alphaOut, outW, outH, overlapPx);
  }

  const hashBytes = colorMode === "full-color-rgba" ? rgbaOut : alphaOut;
  const contentHash = fnv1a64Hex(hashBytes);
  const alphaMapBase64 = encodeStudioBrushTipAlphaMapBase64(alphaOut);

  return {
    schemaVersion: 1,
    tipId: `custom-${options.mode}-${contentHash.slice(0, 12)}`,
    contentHash,
    name: options.name.trim() || (options.mode === "ribbon" ? "커스텀 리본 팁" : "커스텀 스탬프 팁"),
    mode: options.mode,
    colorMode,
    width: outW,
    height: outH,
    aspectRatio,
    spacingRatio: Math.max(0.05, Math.min(2, options.spacingRatio ?? (options.mode === "ribbon" ? 1 : 0.22))),
    ribbonSeamlessOverlapPx: overlapPx,
    alphaMapBase64,
    ...(colorMode === "full-color-rgba" ? { rgbaBase64: bytesToBase64(rgbaOut) } : {}),
    sourceBounds: bounds,
    tags: Object.freeze([...new Set((options.tags ?? []).map((t) => t.trim()).filter(Boolean))]),
    createdAtIso: options.createdAtIso ?? new Date().toISOString(),
  };
}

export function serializeCustomPatternTip(record: StudioCustomPatternTipRecord): string {
  return JSON.stringify(record);
}

export function deserializeCustomPatternTip(json: string): StudioCustomPatternTipRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new CustomPatternTipRegistrationError("invalid-serialized", "브러시 팁 JSON 파싱에 실패했습니다.");
  }
  if (!raw || typeof raw !== "object") {
    throw new CustomPatternTipRegistrationError("invalid-serialized", "브러시 팁 객체가 올바르지 않습니다.");
  }
  const obj = raw as Record<string, unknown>;
  if (
    obj["schemaVersion"] !== 1
    || typeof obj["tipId"] !== "string"
    || typeof obj["contentHash"] !== "string"
    || typeof obj["name"] !== "string"
    || (obj["mode"] !== "stamp" && obj["mode"] !== "ribbon")
    || (obj["colorMode"] !== "alpha-mask" && obj["colorMode"] !== "full-color-rgba")
    || typeof obj["width"] !== "number"
    || typeof obj["height"] !== "number"
    || typeof obj["alphaMapBase64"] !== "string"
  ) {
    throw new CustomPatternTipRegistrationError("invalid-serialized", "필수 브러시 팁 필드가 누락되었거나 형식이 틀립니다.");
  }
  const decodedAlpha = base64ToBytes(obj["alphaMapBase64"]);
  if (decodedAlpha.length !== obj["width"] * obj["height"]) {
    throw new CustomPatternTipRegistrationError("invalid-serialized", "알파 맵 바이트 길이가 해상도와 일치하지 않습니다.");
  }
  return obj as unknown as StudioCustomPatternTipRecord;
}

export interface PatternTipStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const REGISTRY_STORAGE_KEY = "toonstudio:custom-pattern-tips:v1";

/** 커스텀 리본·스탬프 패턴 팁 레지스트리(콘텐츠 해시 중복 제거 · 최대 용량 관리). */
export class StudioCustomPatternTipRegistry {
  private readonly records = new Map<string, StudioCustomPatternTipRecord>();
  private readonly maxEntries: number;
  private readonly storage: PatternTipStorageLike | null;

  constructor(options: { readonly maxEntries?: number; readonly storage?: PatternTipStorageLike | null } = {}) {
    this.maxEntries = Math.max(4, options.maxEntries ?? 128);
    this.storage = options.storage ?? null;
    this.hydrate();
  }

  register(record: StudioCustomPatternTipRecord): StudioCustomPatternTipRecord {
    // 동일 콘텐츠 해시 + 모드가 이미 있으면 기존 ID를 갱신(중복 방지)
    for (const existing of this.records.values()) {
      if (existing.contentHash === record.contentHash && existing.mode === record.mode) {
        const merged: StudioCustomPatternTipRecord = { ...existing, name: record.name, tags: record.tags };
        this.records.set(existing.tipId, merged);
        this.persist();
        return merged;
      }
    }
    if (this.records.size >= this.maxEntries) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey !== undefined) this.records.delete(oldestKey);
    }
    this.records.set(record.tipId, record);
    this.persist();
    return record;
  }

  get(tipId: string): StudioCustomPatternTipRecord | undefined {
    return this.records.get(tipId);
  }

  remove(tipId: string): boolean {
    const removed = this.records.delete(tipId);
    if (removed) this.persist();
    return removed;
  }

  list(filter?: { readonly mode?: CustomPatternTipMode; readonly tag?: string }): readonly StudioCustomPatternTipRecord[] {
    const all = [...this.records.values()];
    return all.filter((entry) => {
      if (filter?.mode && entry.mode !== filter.mode) return false;
      if (filter?.tag && !entry.tags.includes(filter.tag)) return false;
      return true;
    });
  }

  private hydrate(): void {
    if (!this.storage) return;
    const raw = this.storage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        try {
          const valid = deserializeCustomPatternTip(JSON.stringify(item));
          this.records.set(valid.tipId, valid);
        } catch {
          // 손상된 개별 항목은 건너뛰어 전체 레지스트리를 보호한다.
        }
      }
    } catch {
      // 파싱 불가 저장본은 무시한다.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    this.storage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify([...this.records.values()]));
  }
}
