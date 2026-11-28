/**
 * Wave 80 — 100% 온디바이스 연재 작화 연속성 로컬 캐논 인덱스 (`OnDeviceSeriesCanonIndex`).
 *
 * - 제로 업로드 프라이버시 계약(`networkEgressBytes: 0`, `executionLocality: "on-device-only"`,
 *   `externalModelUpload: false`)을 런타임 및 스냅샷 경계에서 강제한다.
 * - 캐릭터 영구 특징 타임라인 진화, OKLCH/CIELAB 지각 팔레트(CIEDE2000 ΔE00), 작가 고유 화풍
 *   인체 비례 이력, 장면 내 소품·의상 상태를 로컬 메모리에 색인하고 SHA-256 검증 스냅샷으로 입출력한다.
 */

// 1. 온디바이스 제로 업로드 프라이버시 계약
export interface OnDevicePrivacyContract {
  readonly executionLocality: "on-device-only";
  readonly networkEgressBytes: 0;
  readonly externalModelUpload: false;
  readonly telemetryUpload: false;
  readonly storageBackend: "opfs-sqlite-local";
}

export const ON_DEVICE_PRIVACY_CONTRACT: OnDevicePrivacyContract = Object.freeze({
  executionLocality: "on-device-only",
  networkEgressBytes: 0,
  externalModelUpload: false,
  telemetryUpload: false,
  storageBackend: "opfs-sqlite-local",
});

/** 프라이버시 계약이 온디바이스 제로 유출 불변식을 만족하는지 런타임에서 검증한다. */
export function assertOnDevicePrivacyContract(
  contract: unknown,
): asserts contract is OnDevicePrivacyContract {
  if (typeof contract !== "object" || contract === null) {
    throw new Error("온디바이스 프라이버시 계약 객체가 비어 있습니다.");
  }
  const c = contract as Record<string, unknown>;
  if (
    c.executionLocality !== "on-device-only" ||
    c.networkEgressBytes !== 0 ||
    c.externalModelUpload !== false ||
    c.telemetryUpload !== false ||
    c.storageBackend !== "opfs-sqlite-local"
  ) {
    throw new Error(
      "온디바이스 제로 업로드 계약 위반: 외부 전송이나 원격 모델 업로드 설정은 허용되지 않습니다.",
    );
  }
}

// 2. 외부 무의존 순수 동기 FIPS 180-4 SHA-256 & 정규 직렬화
const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 0x3f), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(bytes);
}

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** FIPS 180-4 SHA-256 해시를 순수 동기로 계산해 64자리 소문자 16진수 문자열로 반환한다. */
export function computeLocalSha256Hex(input: Uint8Array | string): string {
  const data = typeof input === "string" ? utf8Encode(input) : input;
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = SHA256_H0[0] ?? 0; let h1 = SHA256_H0[1] ?? 0;
  let h2 = SHA256_H0[2] ?? 0; let h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0; let h5 = SHA256_H0[5] ?? 0;
  let h6 = SHA256_H0[6] ?? 0; let h7 = SHA256_H0[7] ?? 0;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const bigS1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + bigS1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const bigS0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (bigS0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, "0")).join("");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 객체 키를 재귀적으로 사전순 정렬한 결정론적 정규 JSON 문자열을 생성한다. */
export function canonicalSerializeCanon(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerializeCanon(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const entries: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const entryVal = record[key];
    if (entryVal !== undefined) entries.push(`${JSON.stringify(key)}:${canonicalSerializeCanon(entryVal)}`);
  }
  return `{${entries.join(",")}}`;
}

// 3. OKLCH → CIE L*a*b* (D65) → CIEDE2000 (ΔE00) 지각 색차 수학
export interface OklchColor { readonly l: number; readonly c: number; readonly h: number }
export interface CieLabColor { readonly l: number; readonly a: number; readonly b: number }

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const LAB_DELTA = 6 / 29;
const LAB_DELTA_CUBED = LAB_DELTA ** 3;
const LAB_LINEAR_SLOPE = 1 / (3 * LAB_DELTA * LAB_DELTA);
const POW25_7 = 25 ** 7;

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod === 0 ? 0 : mod;
}

function labTransfer(t: number): number {
  return t > LAB_DELTA_CUBED ? Math.cbrt(t) : LAB_LINEAR_SLOPE * t + 4 / 29;
}

/** Oklab 역변환과 D65 XYZ 변환을 거쳐 OKLCH를 CIE L*a*b*로 변환한다. */
export function oklchToCieLab(color: OklchColor): CieLabColor {
  const L = clamp01(color.l);
  const C = Math.max(0, Number.isFinite(color.c) ? color.c : 0);
  const hRad = normalizeAngleDeg(color.h) * DEG_TO_RAD;
  const aOk = C * Math.cos(hRad);
  const bOk = C * Math.sin(hRad);

  const l = (L + 0.3963377774 * aOk + 0.2158037573 * bOk) ** 3;
  const m = (L - 0.1055613458 * aOk - 0.0638541728 * bOk) ** 3;
  const s = (L - 0.0894841775 * aOk - 1.291485548 * bOk) ** 3;

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const fx = labTransfer((0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin) / 0.95047);
  const fy = labTransfer(0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin);
  const fz = labTransfer((0.0193339 * rLin + 0.119192 * gLin + 0.9503041 * bLin) / 1.08883);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Sharma-Wu-Dalal(2005) 표준 CIEDE2000 색차(ΔE00)를 계산한다. */
export function computeCiede2000(lab1: CieLabColor, lab2: CieLabColor): number {
  const cBar = 0.5 * (Math.hypot(lab1.a, lab1.b) + Math.hypot(lab2.a, lab2.b));
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW25_7)));
  const a1p = (1 + g) * lab1.a;
  const a2p = (1 + g) * lab2.a;
  const c1p = Math.hypot(a1p, lab1.b);
  const c2p = Math.hypot(a2p, lab2.b);
  const h1p = c1p === 0 ? 0 : normalizeAngleDeg(Math.atan2(lab1.b, a1p) * RAD_TO_DEG);
  const h2p = c2p === 0 ? 0 : normalizeAngleDeg(Math.atan2(lab2.b, a2p) * RAD_TO_DEG);

  const dLp = lab2.l - lab1.l;
  const dCp = c2p - c1p;
  const cpProd = c1p * c2p;
  let dhp = 0;
  if (cpProd !== 0) {
    const raw = h2p - h1p;
    dhp = Math.abs(raw) <= 180 ? raw : raw > 180 ? raw - 360 : raw + 360;
  }
  const dHp = 2 * Math.sqrt(cpProd) * Math.sin(dhp * 0.5 * DEG_TO_RAD);
  const lBarP = 0.5 * (lab1.l + lab2.l);
  const cBarP = 0.5 * (c1p + c2p);
  let hBarP = h1p + h2p;
  if (cpProd !== 0) {
    hBarP = Math.abs(h1p - h2p) <= 180
      ? 0.5 * (h1p + h2p)
      : h1p + h2p < 360
        ? 0.5 * (h1p + h2p + 360)
        : 0.5 * (h1p + h2p - 360);
  }
  const t =
    1 - 0.17 * Math.cos((hBarP - 30) * DEG_TO_RAD) + 0.24 * Math.cos(2 * hBarP * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hBarP + 6) * DEG_TO_RAD) - 0.2 * Math.cos((4 * hBarP - 63) * DEG_TO_RAD);
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + POW25_7));
  const lTerm = (lBarP - 50) ** 2;
  const lR = dLp / (1 + (0.015 * lTerm) / Math.sqrt(20 + lTerm));
  const cR = dCp / (1 + 0.045 * cBarP);
  const hR = dHp / (1 + 0.015 * cBarP * t);
  const sum = lR * lR + cR * cR + hR * hR - Math.sin(2 * dTheta * DEG_TO_RAD) * rC * cR * hR;
  return sum <= 0 ? 0 : Math.sqrt(sum);
}

/** 두 OKLCH 색상 간의 지각 색차(CIEDE2000 ΔE00)를 반환한다. */
export function computeOklchDeltaE00(a: OklchColor, b: OklchColor): number {
  return computeCiede2000(oklchToCieLab(a), oklchToCieLab(b));
}

/** CSS 표준 `oklch(...)` 문자열로 포맷한다(원시 hex/rgb 금지 규칙 준수). */
export function formatOklchCss(color: OklchColor): string {
  const l = clamp01(color.l).toFixed(3);
  const c = Math.max(0, Math.min(0.45, Number.isFinite(color.c) ? color.c : 0)).toFixed(3);
  return `oklch(${l} ${c} ${normalizeAngleDeg(color.h).toFixed(1)})`;
}

// 4. 연재 캐논 타임라인·캐릭터·장면·소품 도메인 계약
export interface EpisodeCutRef { readonly episodeNumber: number; readonly cutNumber: number }

export function compareEpisodeCutRef(a: EpisodeCutRef, b: EpisodeCutRef): number {
  return a.episodeNumber !== b.episodeNumber
    ? a.episodeNumber - b.episodeNumber
    : a.cutNumber - b.cutNumber;
}

export type AnatomicalSide = "left" | "right" | "center";
export type TraitCategory =
  | "scar" | "mole" | "earring" | "eyepatch" | "prosthetic"
  | "dominant-hand" | "tattoo" | "injury" | "accessory";
export type BodyRegion =
  | "cheek" | "forehead" | "eye" | "ear" | "neck"
  | "shoulder" | "arm" | "hand" | "torso" | "back" | "leg";
export type TraitLifecycleStatus = "active" | "healed" | "concealed" | "removed";
export type ResolvedTraitLifecycle = TraitLifecycleStatus | "not-yet-introduced";
export type PaletteSlotKey =
  | "hair" | "eye" | "skin" | "outfit-primary" | "outfit-secondary" | "accent";
export type ProportionMetricKey =
  | "headToShoulderRatio" | "eyeSpacingRatio" | "jawRatio" | "neckLengthRatio";
export type PropIntegrityState = "intact" | "cracked" | "torn" | "missing";
export type SceneLightingMood =
  | "neutral-daylight" | "indoor-soft" | "golden-sunset"
  | "night-neon" | "rainy-night-neon" | "monochrome-flashback" | "dramatic-rim";

export interface TraitStatusTransition {
  readonly at: EpisodeCutRef;
  readonly status: TraitLifecycleStatus;
  readonly reason?: string;
}

export interface CanonicalCharacterTrait {
  readonly traitId: string;
  readonly label: string;
  readonly category: TraitCategory;
  readonly region: BodyRegion;
  readonly anatomicalSide: AnatomicalSide;
  readonly introducedAt: EpisodeCutRef;
  readonly initialStatus?: TraitLifecycleStatus;
  readonly transitions?: readonly TraitStatusTransition[];
  readonly permanent: boolean;
}

export interface CanonicalPaletteEntry {
  readonly slot: PaletteSlotKey;
  readonly label: string;
  readonly oklch: OklchColor;
  readonly maxDeltaE00?: number;
  readonly effectiveFrom?: EpisodeCutRef;
}

export interface AnthropometricSample {
  readonly at: EpisodeCutRef;
  readonly headToShoulderRatio?: number;
  readonly eyeSpacingRatio?: number;
  readonly jawRatio?: number;
  readonly neckLengthRatio?: number;
  readonly relativeHeightCm?: number;
}

export interface ProportionMetricBaseline {
  readonly metric: ProportionMetricKey;
  readonly sampleCount: number;
  readonly mean: number;
  readonly stdDev: number;
  readonly effectiveStdDev: number;
  readonly min: number;
  readonly max: number;
}

export interface CharacterCanonProfile {
  readonly characterId: string;
  readonly displayName: string;
  readonly dominantHand: "left" | "right" | "ambidextrous";
  readonly canonicalHeightCm?: number;
  readonly traits: readonly CanonicalCharacterTrait[];
  readonly palette: readonly CanonicalPaletteEntry[];
  readonly proportionHistory: readonly AnthropometricSample[];
}

export interface PropStateRecord {
  readonly propId: string;
  readonly label: string;
  readonly ownerCharacterId?: string;
  readonly state: PropIntegrityState;
  readonly repaired?: boolean;
  readonly note?: string;
}

export interface CharacterCostumeState {
  readonly characterId: string;
  readonly outfitId: string;
  readonly outfitLabel: string;
  readonly equippedAccessories: readonly string[];
  readonly accessoryLabels?: Readonly<Record<string, string>>;
}

export interface EpisodeCutStateRecord {
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly lightingMood: SceneLightingMood;
  readonly props: readonly PropStateRecord[];
  readonly costumes: readonly CharacterCostumeState[];
  readonly anthropometricSamples?: Readonly<Record<string, Omit<AnthropometricSample, "at">>>;
}

export interface ScenePropStateSnapshot { readonly at: EpisodeCutRef; readonly record: PropStateRecord }
export interface SceneCostumeStateSnapshot { readonly at: EpisodeCutRef; readonly costume: CharacterCostumeState }

export interface SeriesCanonSnapshotPayload {
  readonly schemaVersion: 1;
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly updatedAtIso: string;
  readonly privacyContract: OnDevicePrivacyContract;
  readonly characters: readonly CharacterCanonProfile[];
  readonly cutHistory: readonly EpisodeCutStateRecord[];
  readonly dismissedFindingKeys: readonly string[];
}

export interface SignedSeriesCanonSnapshot {
  readonly payload: SeriesCanonSnapshotPayload;
  readonly checksumAlgorithm: "SHA-256";
  readonly checksumHex: string;
  readonly byteLength: number;
}

export interface OnDeviceSeriesCanonIndexInit {
  readonly seriesId: string;
  readonly seriesTitle: string;
}

const MIN_RELATIVE_PROPORTION_STD_FLOOR = 0.04;

/** 특정 회차·컷 시점에 해당 특징이 활성인지, 발생 전인지, 치유·은폐되었는지 판정한다. */
export function resolveTraitLifecycleAt(
  trait: CanonicalCharacterTrait,
  at: EpisodeCutRef,
): ResolvedTraitLifecycle {
  if (compareEpisodeCutRef(at, trait.introducedAt) < 0) return "not-yet-introduced";
  let current: TraitLifecycleStatus = trait.initialStatus ?? "active";
  if (!trait.transitions || trait.transitions.length === 0) return current;
  const ordered = [...trait.transitions].sort((a, b) => compareEpisodeCutRef(a.at, b.at));
  for (let i = 0; i < ordered.length; i += 1) {
    const tr = ordered[i];
    if (tr && compareEpisodeCutRef(tr.at, at) <= 0) current = tr.status;
  }
  return current;
}

/** 스냅샷의 온디바이스 프라이버시 계약과 SHA-256 체크섬 무결성을 검증한다. */
export function verifySeriesCanonSnapshot(snapshot: SignedSeriesCanonSnapshot): {
  readonly valid: boolean;
  readonly reason?: string;
} {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.payload) {
    return { valid: false, reason: "스냅샷 구조가 올바르지 않습니다." };
  }
  if (snapshot.checksumAlgorithm !== "SHA-256") {
    return { valid: false, reason: "지원하지 않는 체크섬 알고리즘입니다." };
  }
  try {
    assertOnDevicePrivacyContract(snapshot.payload.privacyContract);
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const serialized = canonicalSerializeCanon(snapshot.payload);
  if (!constantTimeEqualHex(computeLocalSha256Hex(serialized), snapshot.checksumHex)) {
    return { valid: false, reason: "SHA-256 체크섬이 일치하지 않아 스냅샷 손상·변조가 감지되었습니다." };
  }
  if (snapshot.byteLength !== utf8Encode(serialized).length) {
    return { valid: false, reason: "스냅샷 바이트 길이가 직렬화 본문과 일치하지 않습니다." };
  }
  return { valid: true };
}

// 5. 100% 온디바이스 연재 캐논 메모리 인덱스 클래스
export class OnDeviceSeriesCanonIndex {
  public readonly seriesId: string;
  public readonly seriesTitle: string;
  public readonly privacyContract: OnDevicePrivacyContract = ON_DEVICE_PRIVACY_CONTRACT;

  private readonly characters = new Map<string, CharacterCanonProfile>();
  private readonly cutHistory = new Map<string, EpisodeCutStateRecord>();
  private readonly dismissedFindingKeys = new Set<string>();

  public constructor(init: OnDeviceSeriesCanonIndexInit) {
    if (!init.seriesId.trim()) throw new Error("연재 작품 식별자(seriesId)는 비워 둘 수 없습니다.");
    this.seriesId = init.seriesId.trim();
    this.seriesTitle = init.seriesTitle.trim() || init.seriesId.trim();
  }

  /** 캐릭터 캐논 프로필을 등록하거나 갱신한다. */
  public upsertCharacter(profile: CharacterCanonProfile): void {
    this.characters.set(profile.characterId, {
      ...profile,
      traits: [...profile.traits].sort((a, b) => a.traitId.localeCompare(b.traitId)),
      palette: [...profile.palette].sort((a, b) =>
        a.slot !== b.slot
          ? a.slot.localeCompare(b.slot)
          : compareEpisodeCutRef(
              a.effectiveFrom ?? { episodeNumber: 0, cutNumber: 0 },
              b.effectiveFrom ?? { episodeNumber: 0, cutNumber: 0 },
            ),
      ),
      proportionHistory: [...profile.proportionHistory].sort((a, b) => compareEpisodeCutRef(a.at, b.at)),
    });
  }

  public getCharacter(characterId: string): CharacterCanonProfile | undefined {
    return this.characters.get(characterId);
  }

  public listCharacters(): readonly CharacterCanonProfile[] {
    return [...this.characters.values()].sort((a, b) => a.characterId.localeCompare(b.characterId));
  }

  /** 기존 캐릭터에 영구/아크 특징을 추가하거나 갱신한다. */
  public upsertCharacterTrait(characterId: string, trait: CanonicalCharacterTrait): void {
    const existing = this.characters.get(characterId);
    if (!existing) throw new Error(`캐릭터 '${characterId}'가 로컬 캐논 인덱스에 없습니다.`);
    const nextTraits = existing.traits.filter((item) => item.traitId !== trait.traitId);
    nextTraits.push(trait);
    this.upsertCharacter({ ...existing, traits: nextTraits });
  }

  /** 캐릭터 특징의 타임라인 상태 전이(치유·은폐·제거)를 기록한다. */
  public recordTraitTransition(
    characterId: string,
    traitId: string,
    transition: TraitStatusTransition,
  ): void {
    const existing = this.characters.get(characterId);
    if (!existing) throw new Error(`캐릭터 '${characterId}'가 로컬 캐논 인덱스에 없습니다.`);
    let found = false;
    const updatedTraits = existing.traits.map((trait) => {
      if (trait.traitId !== traitId) return trait;
      found = true;
      return {
        ...trait,
        transitions: [...(trait.transitions ?? []), transition].sort((a, b) =>
          compareEpisodeCutRef(a.at, b.at),
        ),
      };
    });
    if (!found) throw new Error(`캐릭터 '${characterId}'에서 특징 '${traitId}'를 찾을 수 없습니다.`);
    this.upsertCharacter({ ...existing, traits: updatedTraits });
  }

  /** 과거 회차·컷의 장면·소품·의상·인체 비례 표본을 로컬 인덱스에 색인한다. */
  public indexEpisodeCutState(record: EpisodeCutStateRecord): void {
    this.cutHistory.set(`${record.episodeNumber}:${record.cutNumber}`, {
      ...record,
      props: [...record.props].sort((a, b) => a.propId.localeCompare(b.propId)),
      costumes: [...record.costumes]
        .map((c) => ({ ...c, equippedAccessories: [...new Set(c.equippedAccessories)].sort() }))
        .sort((a, b) => a.characterId.localeCompare(b.characterId)),
    });
    if (!record.anthropometricSamples) return;
    const ref: EpisodeCutRef = { episodeNumber: record.episodeNumber, cutNumber: record.cutNumber };
    for (const characterId of Object.keys(record.anthropometricSamples)) {
      const sample = record.anthropometricSamples[characterId];
      const character = this.characters.get(characterId);
      if (!sample || !character) continue;
      const nextHistory = character.proportionHistory.filter((h) => compareEpisodeCutRef(h.at, ref) !== 0);
      nextHistory.push({ at: ref, ...sample });
      this.upsertCharacter({ ...character, proportionHistory: nextHistory });
    }
  }

  /** 특정 시점(`at`)에서 캐릭터에게 적용되는 최신 팔레트 슬롯 맵을 반환한다. */
  public resolvePaletteAt(
    characterId: string,
    at: EpisodeCutRef,
  ): ReadonlyMap<PaletteSlotKey, CanonicalPaletteEntry> {
    const map = new Map<PaletteSlotKey, CanonicalPaletteEntry>();
    const character = this.characters.get(characterId);
    if (!character) return map;
    for (let i = 0; i < character.palette.length; i += 1) {
      const entry = character.palette[i];
      if (!entry) continue;
      if (entry.effectiveFrom && compareEpisodeCutRef(at, entry.effectiveFrom) < 0) continue;
      map.set(entry.slot, entry);
    }
    return map;
  }

  /** 현재 컷 이전 회차에서 수집된 작가 고유 화풍 비례 기준선(평균·표준편차)을 계산한다. */
  public computeProportionBaseline(
    characterId: string,
    metric: ProportionMetricKey,
    beforeRef: EpisodeCutRef,
  ): ProportionMetricBaseline | null {
    const character = this.characters.get(characterId);
    if (!character) return null;
    const values: number[] = [];
    for (let i = 0; i < character.proportionHistory.length; i += 1) {
      const sample = character.proportionHistory[i];
      if (!sample || compareEpisodeCutRef(sample.at, beforeRef) >= 0) continue;
      const val = sample[metric];
      if (typeof val === "number" && Number.isFinite(val) && val > 0) values.push(val);
    }
    if (values.length === 0) return null;
    let sum = 0; let min = values[0] ?? 0; let max = values[0] ?? 0;
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i] ?? 0;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const mean = sum / values.length;
    let varianceSum = 0;
    for (let i = 0; i < values.length; i += 1) varianceSum += ((values[i] ?? mean) - mean) ** 2;
    const stdDev = values.length > 1 ? Math.sqrt(varianceSum / (values.length - 1)) : 0;
    return {
      metric,
      sampleCount: values.length,
      mean,
      stdDev,
      effectiveStdDev: Math.max(stdDev, Math.abs(mean) * MIN_RELATIVE_PROPORTION_STD_FLOOR),
      min,
      max,
    };
  }

  /** 같은 `sceneId` 내부에서 현재 컷 직전까지 기록된 특정 소품의 최신 상태를 반환한다. */
  public getLatestPropStateInScene(
    sceneId: string,
    propId: string,
    beforeRef: EpisodeCutRef,
  ): ScenePropStateSnapshot | null {
    const ordered = this.listCutHistoryOrdered();
    let latest: ScenePropStateSnapshot | null = null;
    for (let i = 0; i < ordered.length; i += 1) {
      const cut = ordered[i];
      if (!cut || cut.sceneId !== sceneId) continue;
      const cutRef: EpisodeCutRef = { episodeNumber: cut.episodeNumber, cutNumber: cut.cutNumber };
      if (compareEpisodeCutRef(cutRef, beforeRef) >= 0) continue;
      const match = cut.props.find((p) => p.propId === propId);
      if (match) latest = { at: cutRef, record: match };
    }
    return latest;
  }

  /** 같은 `sceneId` 내부에서 현재 컷 직전까지 기록된 캐릭터 의상·소품 상태를 반환한다. */
  public getLatestCostumeInScene(
    sceneId: string,
    characterId: string,
    beforeRef: EpisodeCutRef,
  ): SceneCostumeStateSnapshot | null {
    const ordered = this.listCutHistoryOrdered();
    let latest: SceneCostumeStateSnapshot | null = null;
    for (let i = 0; i < ordered.length; i += 1) {
      const cut = ordered[i];
      if (!cut || cut.sceneId !== sceneId) continue;
      const cutRef: EpisodeCutRef = { episodeNumber: cut.episodeNumber, cutNumber: cut.cutNumber };
      if (compareEpisodeCutRef(cutRef, beforeRef) >= 0) continue;
      const match = cut.costumes.find((c) => c.characterId === characterId);
      if (match) latest = { at: cutRef, costume: match };
    }
    return latest;
  }

  public listCutHistoryOrdered(): readonly EpisodeCutStateRecord[] {
    return [...this.cutHistory.values()].sort((a, b) =>
      compareEpisodeCutRef(
        { episodeNumber: a.episodeNumber, cutNumber: a.cutNumber },
        { episodeNumber: b.episodeNumber, cutNumber: b.cutNumber },
      ),
    );
  }

  public dismissFinding(findingKey: string): void {
    const trimmed = findingKey.trim();
    if (trimmed) this.dismissedFindingKeys.add(trimmed);
  }

  public restoreFinding(findingKey: string): boolean {
    return this.dismissedFindingKeys.delete(findingKey.trim());
  }

  public isFindingDismissed(findingKey: string): boolean {
    return this.dismissedFindingKeys.has(findingKey.trim());
  }

  public listDismissedFindings(): readonly string[] {
    return [...this.dismissedFindingKeys].sort();
  }

  /** OPFS/SQLite 저장용 결정론적 SHA-256 서명 스냅샷을 생성한다. */
  public exportSnapshot(updatedAtIso = "2026-11-28T00:00:00.000Z"): SignedSeriesCanonSnapshot {
    const payload: SeriesCanonSnapshotPayload = {
      schemaVersion: 1,
      seriesId: this.seriesId,
      seriesTitle: this.seriesTitle,
      updatedAtIso,
      privacyContract: this.privacyContract,
      characters: this.listCharacters(),
      cutHistory: this.listCutHistoryOrdered(),
      dismissedFindingKeys: this.listDismissedFindings(),
    };
    const serialized = canonicalSerializeCanon(payload);
    return {
      payload,
      checksumAlgorithm: "SHA-256",
      checksumHex: computeLocalSha256Hex(serialized),
      byteLength: utf8Encode(serialized).length,
    };
  }

  /** SHA-256 체크섬과 온디바이스 계약을 검증한 뒤 로컬 캐논 인덱스를 복원한다. */
  public static importSnapshot(snapshot: SignedSeriesCanonSnapshot): OnDeviceSeriesCanonIndex {
    const verification = verifySeriesCanonSnapshot(snapshot);
    if (!verification.valid) {
      throw new Error(`로컬 캐논 스냅샷 복원 실패: ${verification.reason ?? "알 수 없는 오류"}`);
    }
    const { payload } = snapshot;
    const index = new OnDeviceSeriesCanonIndex({
      seriesId: payload.seriesId,
      seriesTitle: payload.seriesTitle,
    });
    for (let i = 0; i < payload.characters.length; i += 1) {
      const ch = payload.characters[i];
      if (ch) index.upsertCharacter(ch);
    }
    for (let i = 0; i < payload.cutHistory.length; i += 1) {
      const cut = payload.cutHistory[i];
      if (cut) index.indexEpisodeCutState(cut);
    }
    for (let i = 0; i < payload.dismissedFindingKeys.length; i += 1) {
      const key = payload.dismissedFindingKeys[i];
      if (key) index.dismissFinding(key);
    }
    return index;
  }
}
