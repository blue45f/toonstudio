/**
 * 브러시·팔레트 프리셋 공유 코드 — ibisPaint식 "코드 한 장으로 주고받기"를 ToonStudio 자료형에
 * 맞춘 순수 코덱. 서버·비용 없이 클라이언트에서만 돈다.
 *
 * 와이어 형식 (v1): `TSB1.<base64url(canonical JSON 페이로드)>.<fnv1a32 8자리 hex>`
 * - canonical JSON: 객체 키 사전순 고정, 숫자 -0·비유한수 거부 → 같은 프리셋은 항상 같은 코드.
 * - 체크섬이 본문보다 먼저 어긋나면 그 사유로 거부한다(오타·잘림을 페이로드 오류와 구분).
 * - 디코드는 임의 텍스트에서 코드 토큰만 추출한다 — 공유 카드 이미지의 설명 문구나 채팅
 *   메시지에 코드가 섞여 붙여넣어져도 설치할 수 있다.
 * - 무손실 원칙: 정규화가 값을 바꾸는 경우(예: 팔레트 hex 대문자)만 허용하고, 절단·대체·
 *   기본값 주입은 절대 하지 않는다. 수용할 수 없으면 사유 코드와 함께 거부한다.
 */

import {
  parseBrushLabRecipe,
  type BrushLabRecipe,
} from "./brush-lab-recipe";
import type { BrushStudioV6ProgramPatch } from "./brush-studio-v6-engine";
import type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";
import type { StudioNamedPalette } from "../studio-palette-library";

export const BRUSH_PRESET_SHARE_CODE_PREFIX = "TSB1" as const;
export const BRUSH_PRESET_SHARE_CODE_VERSION = 1 as const;
/** 페이로드 canonical JSON 상한 — 일반적인 QR(바이너리 모드 ~2.9KB)·붙여넣기 양쪽에 들어가는 크기. */
export const BRUSH_PRESET_SHARE_MAX_PAYLOAD_BYTES = 4096;
/** 팔레트 색 상한(공유 코드 전용) — 라이브러리 상한(1000)보다 작게 잡아 코드 길이를 통제한다. 초과는 절단이 아니라 거부. */
export const BRUSH_PRESET_SHARE_MAX_PALETTE_COLORS = 256;
export const BRUSH_PRESET_SHARE_MAX_NAME_CHARS = 80;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u;
const SLOT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
/** slots·tuning 키는 v6 엔진의 camelCase 필드명(primaryColor·surfaceTooth 등)을 허용한다. */
const PATCH_KEY_PATTERN = /^[a-z][a-zA-Z0-9-]*$/u;
const CODE_TOKEN_PATTERN = /TSB(\d+)\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})/u;
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export type BrushPresetShareCodeErrorCode =
  | "empty"
  | "not-a-share-code"
  | "unsupported-version"
  | "checksum-mismatch"
  | "invalid-encoding"
  | "invalid-payload"
  | "invalid-recipe"
  | "too-large"
  | "no-content"
  | "missing-sink";

const ERROR_MESSAGES: Readonly<Record<BrushPresetShareCodeErrorCode, string>> =
  Object.freeze({
    empty: "공유 코드가 비어 있습니다.",
    "not-a-share-code": "공유 코드 형식이 아닙니다. TSB1. 으로 시작하는 코드 전체를 붙여넣어 주세요.",
    "unsupported-version": "아직 지원하지 않는 공유 코드 버전입니다. 앱을 업데이트한 뒤 다시 시도해 주세요.",
    "checksum-mismatch": "공유 코드가 손상됐거나 일부가 누락됐습니다. 코드 전체를 다시 복사해 주세요.",
    "invalid-encoding": "공유 코드 본문을 읽을 수 없습니다. 원본 코드를 그대로 붙여넣어 주세요.",
    "invalid-payload": "공유 코드의 프리셋 내용이 올바르지 않습니다.",
    "invalid-recipe": "공유 코드의 브러시 레시피가 올바르지 않습니다.",
    "too-large": "공유 코드로 담기에는 프리셋이 너무 큽니다. 팔레트 색 수를 줄이거나 브러시를 나누어 공유해 주세요.",
    "no-content": "공유할 브러시나 팔레트가 없습니다.",
    "missing-sink": "설치할 곳이 준비되지 않아 공유 코드를 적용할 수 없습니다.",
  });

export class BrushPresetShareCodeError extends Error {
  readonly code: BrushPresetShareCodeErrorCode;
  readonly path?: string;

  constructor(
    code: BrushPresetShareCodeErrorCode,
    options: Readonly<{ path?: string; cause?: unknown }> = {},
  ) {
    super(
      ERROR_MESSAGES[code],
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "BrushPresetShareCodeError";
    this.code = code;
    this.path = options.path;
  }
}

function fail(
  code: BrushPresetShareCodeErrorCode,
  path?: string,
  cause?: unknown,
): never {
  throw new BrushPresetShareCodeError(code, { path, cause });
}

// ── 페이로드 자료형 ──────────────────────────────────────────────────────

export interface BrushPresetShareBrush {
  readonly name: string;
  /** 브러시 랩 레시피(슬롯 조합) — parseBrushLabRecipe 검증을 그대로 통과해야 한다. */
  readonly recipe: BrushLabRecipe;
  /** v6 프로그램 패치(slots·tuning) — 레시피 시드의 delta와 같은 모양. */
  readonly delta: BrushStudioV6ProgramPatch;
}

export interface BrushPresetSharePalette {
  readonly name: string;
  /** 정규화된 소문자 #rrggbb — 순서와 중복을 그대로 보존한다(GPL 가져오기와 같은 규율). */
  readonly colors: readonly string[];
}

export interface BrushPresetSharePayload {
  readonly brush?: BrushPresetShareBrush;
  readonly palette?: BrushPresetSharePalette;
}

// ── canonical JSON ───────────────────────────────────────────────────────

function canonicalJsonStringify(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("invalid-payload", path);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalJsonStringify(item, `${path}/${index}`)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key], `${path}/${key}`)}`)
      .join(",")}}`;
  }
  return fail("invalid-payload", path);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) fail("invalid-payload", path);
  return value;
}

function assertKnownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail("invalid-payload", `${path}/${key}`);
  }
}

function normalizeShareName(value: unknown, path: string): string {
  if (typeof value !== "string") fail("invalid-payload", path);
  const name = value.trim();
  if (name.length === 0 || name.length > BRUSH_PRESET_SHARE_MAX_NAME_CHARS) {
    fail("invalid-payload", path);
  }
  return name;
}

// ── delta(slots·tuning) 검증 — 알 수 없는 구조는 조용히 버리지 않고 거부 ──

function normalizeShareDelta(
  value: unknown,
  path: string,
): BrushStudioV6ProgramPatch {
  const record = requiredRecord(value, path);
  assertKnownKeys(record, ["slots", "tuning"], path);
  const delta: { slots?: Record<string, string | string[]>; tuning?: Record<string, number | string> } = {};

  if (record.slots !== undefined) {
    const slots = requiredRecord(record.slots, `${path}/slots`);
    const normalizedSlots: Record<string, string | string[]> = {};
    for (const [key, slotValue] of Object.entries(slots)) {
      const slotPath = `${path}/slots/${key}`;
      if (!PATCH_KEY_PATTERN.test(key)) fail("invalid-payload", slotPath);
      if (typeof slotValue === "string") {
        if (!SLOT_ID_PATTERN.test(slotValue)) fail("invalid-payload", slotPath);
        normalizedSlots[key] = slotValue;
      } else if (Array.isArray(slotValue)) {
        if (slotValue.length === 0 || slotValue.length > 16) {
          fail("invalid-payload", slotPath);
        }
        for (const entry of slotValue) {
          if (typeof entry !== "string" || !SLOT_ID_PATTERN.test(entry)) {
            fail("invalid-payload", slotPath);
          }
        }
        normalizedSlots[key] = [...slotValue];
      } else {
        fail("invalid-payload", slotPath);
      }
    }
    delta.slots = normalizedSlots;
  }

  if (record.tuning !== undefined) {
    const tuning = requiredRecord(record.tuning, `${path}/tuning`);
    const entries = Object.entries(tuning);
    if (entries.length > 64) fail("invalid-payload", `${path}/tuning`);
    const normalizedTuning: Record<string, number | string> = {};
    for (const [key, tuningValue] of entries) {
      const tuningPath = `${path}/tuning/${key}`;
      if (!PATCH_KEY_PATTERN.test(key)) fail("invalid-payload", tuningPath);
      if (typeof tuningValue === "number") {
        if (!Number.isFinite(tuningValue) || Object.is(tuningValue, -0)) {
          fail("invalid-payload", tuningPath);
        }
        normalizedTuning[key] = tuningValue;
      } else if (typeof tuningValue === "string" && HEX_COLOR_PATTERN.test(tuningValue)) {
        normalizedTuning[key] = tuningValue.toLowerCase();
      } else {
        fail("invalid-payload", tuningPath);
      }
    }
    delta.tuning = normalizedTuning;
  }

  return delta as BrushStudioV6ProgramPatch;
}

function normalizeShareBrush(
  value: unknown,
  path: string,
): BrushPresetShareBrush {
  const record = requiredRecord(value, path);
  assertKnownKeys(record, ["name", "recipe", "delta"], path);
  let recipe: BrushLabRecipe;
  try {
    recipe = parseBrushLabRecipe(JSON.stringify(record.recipe));
  } catch (error) {
    return fail("invalid-recipe", `${path}/recipe`, error);
  }
  return {
    name: normalizeShareName(record.name, `${path}/name`),
    recipe,
    delta: normalizeShareDelta(record.delta ?? {}, `${path}/delta`),
  };
}

function normalizeSharePalette(
  value: unknown,
  path: string,
): BrushPresetSharePalette {
  const record = requiredRecord(value, path);
  assertKnownKeys(record, ["name", "colors"], path);
  if (!Array.isArray(record.colors) || record.colors.length === 0) {
    fail("invalid-payload", `${path}/colors`);
  }
  if (record.colors.length > BRUSH_PRESET_SHARE_MAX_PALETTE_COLORS) {
    fail("too-large", `${path}/colors`);
  }
  const colors = record.colors.map((color, index) => {
    if (typeof color !== "string" || !HEX_COLOR_PATTERN.test(color)) {
      fail("invalid-payload", `${path}/colors/${index}`);
    }
    return color.toLowerCase();
  });
  return { name: normalizeShareName(record.name, `${path}/name`), colors };
}

/** 인코딩·디코딩 양쪽이 거치는 단일 검증 지점 — 통과한 페이로드만 설치 단계로 간다. */
export function normalizeBrushPresetSharePayload(
  value: unknown,
): BrushPresetSharePayload {
  const record = requiredRecord(value, "");
  assertKnownKeys(record, ["brush", "palette"], "");
  const payload: { brush?: BrushPresetShareBrush; palette?: BrushPresetSharePalette } = {};
  if (record.brush !== undefined) {
    payload.brush = normalizeShareBrush(record.brush, "/brush");
  }
  if (record.palette !== undefined) {
    payload.palette = normalizeSharePalette(record.palette, "/palette");
  }
  if (!payload.brush && !payload.palette) fail("no-content");
  return payload;
}

// ── base64url · 체크섬 ────────────────────────────────────────────────────

function fnv1a32Hex(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function encodeBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64URL_ALPHABET[first >> 2];
    output += BASE64URL_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      output += BASE64URL_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      output += BASE64URL_ALPHABET[third & 0x3f];
    }
  }
  return output;
}

function decodeBase64Url(text: string): Uint8Array {
  if (text.length % 4 === 1) fail("invalid-encoding");
  const bytes: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const character of text) {
    const value = BASE64URL_ALPHABET.indexOf(character);
    if (value < 0) fail("invalid-encoding");
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// ── 인코드 / 디코드 ───────────────────────────────────────────────────────

function payloadCanonicalJson(payload: BrushPresetSharePayload): string {
  const plain: Record<string, unknown> = {};
  if (payload.brush) {
    plain.brush = {
      name: payload.brush.name,
      recipe: payload.brush.recipe,
      delta: payload.brush.delta,
    };
  }
  if (payload.palette) {
    plain.palette = {
      name: payload.palette.name,
      colors: [...payload.palette.colors],
    };
  }
  return canonicalJsonStringify(plain, "");
}

/** 프리셋 → 공유 코드. 결정적: 같은 프리셋은 바이트 단위로 같은 코드를 만든다. */
export function encodeBrushPresetShareCode(
  input: BrushPresetSharePayload,
): string {
  const payload = normalizeBrushPresetSharePayload(input);
  const canonical = payloadCanonicalJson(payload);
  const bytes = TEXT_ENCODER.encode(canonical);
  if (bytes.byteLength > BRUSH_PRESET_SHARE_MAX_PAYLOAD_BYTES) {
    fail("too-large");
  }
  return `${BRUSH_PRESET_SHARE_CODE_PREFIX}.${encodeBase64Url(bytes)}.${fnv1a32Hex(bytes)}`;
}

/** 붙여넣은 텍스트(설명 문구·공백·줄바꿈 섞임 허용)에서 코드 토큰만 뽑는다. 없으면 null. */
export function extractBrushPresetShareCode(
  text: string,
): { readonly version: number; readonly body: string; readonly checksum: string } | null {
  if (typeof text !== "string") return null;
  const match = CODE_TOKEN_PATTERN.exec(text.replace(/\s+/gu, ""));
  if (!match) return null;
  return {
    version: Number(match[1]),
    body: match[2]!,
    checksum: match[3]!,
  };
}

/** 공유 코드 → 검증된 페이로드. 잘못된 코드는 사유 코드와 함께 거부한다(부분 설치 없음). */
export function decodeBrushPresetShareCode(
  text: string,
): BrushPresetSharePayload {
  if (typeof text !== "string" || text.trim().length === 0) fail("empty");
  const token = extractBrushPresetShareCode(text);
  if (!token) fail("not-a-share-code");
  if (token.version !== BRUSH_PRESET_SHARE_CODE_VERSION) {
    fail("unsupported-version");
  }
  const bytes = decodeBase64Url(token.body);
  if (bytes.byteLength > BRUSH_PRESET_SHARE_MAX_PAYLOAD_BYTES) {
    fail("too-large");
  }
  if (fnv1a32Hex(bytes) !== token.checksum) fail("checksum-mismatch");
  let parsed: unknown;
  try {
    parsed = JSON.parse(TEXT_DECODER.decode(bytes));
  } catch (error) {
    return fail("invalid-encoding", undefined, error);
  }
  const payload = normalizeBrushPresetSharePayload(parsed);
  // canonical 왕복 대조: 인코더가 만들 수 없는 바이트열(키 순서·숫자 표기 변형)은 거부한다.
  if (payloadCanonicalJson(payload) !== TEXT_DECODER.decode(bytes)) {
    fail("invalid-payload");
  }
  return payload;
}

// ── 공유 카드(이미지 한 장) ──────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function wrapCodeLines(code: string, lineLength = 42): string[] {
  const lines: string[] = [];
  for (let index = 0; index < code.length; index += lineLength) {
    lines.push(code.slice(index, index + lineLength));
  }
  return lines;
}

/**
 * 코드를 텍스트로 실은 공유 카드 SVG. QR 라이브러리 없이도 "이미지 한 장"으로 주고받고,
 * 받는 쪽은 카드의 코드 문자열을 붙여넣거나 OCR로 읽어 같은 디코더에 넣으면 된다.
 */
export function createBrushPresetShareCardSvg(
  input: BrushPresetSharePayload,
): string {
  const payload = normalizeBrushPresetSharePayload(input);
  const code = encodeBrushPresetShareCode(payload);
  const title = payload.brush?.name ?? payload.palette?.name ?? "프리셋";
  const kindLabel = payload.brush && payload.palette
    ? "브러시 + 팔레트 프리셋"
    : payload.brush
      ? "브러시 프리셋"
      : "팔레트 프리셋";
  const lines = wrapCodeLines(code);
  const height = 168 + lines.length * 26;
  const codeLines = lines
    .map(
      (line, index) =>
        `<text x="40" y="${150 + index * 26}" font-family="monospace" font-size="17" fill="#e5e7eb">${escapeXml(line)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}"><rect width="720" height="${height}" rx="20" fill="#111827"/><text x="40" y="58" font-family="sans-serif" font-size="28" font-weight="700" fill="#f9fafb">${escapeXml(title)}</text><text x="40" y="90" font-family="sans-serif" font-size="16" fill="#9ca3af">ToonStudio ${escapeXml(kindLabel)} 공유 코드 — 앱에서 붙여넣으면 바로 설치됩니다</text>${codeLines}</svg>`;
}

// ── 설치 — 설치 직후 목록에서 바로 쓰는 형태(시드·명명 팔레트)로 변환 ────

function slugifyShareName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32);
  return slug.length > 0 ? slug : "preset";
}

function payloadChecksum(payload: BrushPresetSharePayload): string {
  return fnv1a32Hex(TEXT_ENCODER.encode(payloadCanonicalJson(payload)));
}

/** 브러시 → 카탈로그에 그대로 꽂히는 레시피 시드. 코드 체크섬 기반 id라 같은 코드 재설치는 같은 id(중복 방지). */
export function brushPresetSharePayloadToRecipeSeed(
  input: BrushPresetSharePayload,
  existingIds: ReadonlySet<string> = new Set(),
): BrushStudioV6RecipeSeed {
  const payload = normalizeBrushPresetSharePayload(input);
  if (!payload.brush) fail("no-content");
  const base = `shared-${slugifyShareName(payload.brush.name)}-${payloadChecksum(payload)}`;
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return Object.freeze({
    id,
    label: payload.brush.name,
    group: "공유 프리셋",
    description: "공유 코드로 설치한 브러시 프리셋",
    delta: payload.brush.delta,
  });
}

/** 팔레트 → 팔레트 라이브러리에 그대로 저장되는 명명 팔레트(색 순서·값 무손실). */
export function brushPresetSharePayloadToNamedPalette(
  input: BrushPresetSharePayload,
  now: number,
): StudioNamedPalette {
  const payload = normalizeBrushPresetSharePayload(input);
  if (!payload.palette) fail("no-content");
  if (!Number.isSafeInteger(now) || now < 0) fail("invalid-payload", "/now");
  return {
    id: `shared-palette-${payloadChecksum(payload)}`,
    name: payload.palette.name,
    createdAt: now,
    updatedAt: now,
    colors: [...payload.palette.colors],
  };
}

export interface BrushPresetShareInstallSinks {
  /** 셸프가 구독하는 브러시 목록에 시드를 넣는 콜백(레시피 카탈로그 확장 지점). */
  readonly addBrushSeed?: (seed: BrushStudioV6RecipeSeed) => void;
  /** 팔레트 라이브러리 저장 콜백(studio-palette-library savePalette 결선 지점). */
  readonly savePalette?: (palette: StudioNamedPalette) => void;
  readonly existingBrushIds?: ReadonlySet<string>;
  readonly now?: number;
}

export interface BrushPresetShareInstallResult {
  readonly brushSeedId?: string;
  readonly paletteId?: string;
}

/**
 * 검증된 페이로드를 실제 목록에 설치한다. 필요한 싱크가 없으면 부분 설치 없이 거부하므로,
 * 성공 반환 = 브러시 목록·팔레트 라이브러리에서 즉시 사용 가능을 뜻한다.
 */
export function installBrushPresetSharePayload(
  payload: BrushPresetSharePayload,
  sinks: BrushPresetShareInstallSinks,
): BrushPresetShareInstallResult {
  const normalized = normalizeBrushPresetSharePayload(payload);
  if (normalized.brush && !sinks.addBrushSeed) fail("missing-sink");
  if (normalized.palette && !sinks.savePalette) fail("missing-sink");

  const result: { brushSeedId?: string; paletteId?: string } = {};
  if (normalized.brush) {
    const seed = brushPresetSharePayloadToRecipeSeed(
      normalized,
      sinks.existingBrushIds ?? new Set(),
    );
    sinks.addBrushSeed!(seed);
    result.brushSeedId = seed.id;
  }
  if (normalized.palette) {
    const palette = brushPresetSharePayloadToNamedPalette(
      normalized,
      sinks.now ?? Date.now(),
    );
    sinks.savePalette!(palette);
    result.paletteId = palette.id;
  }
  return result;
}

/** 받은 코드 문자열을 설치까지 한 번에 — 디코드 실패 시 싱크는 전혀 호출되지 않는다. */
export function installBrushPresetShareCode(
  text: string,
  sinks: BrushPresetShareInstallSinks,
): BrushPresetShareInstallResult {
  return installBrushPresetSharePayload(
    decodeBrushPresetShareCode(text),
    sinks,
  );
}
