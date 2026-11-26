/**
 * 클라이언트 WebCrypto Rights BOM · C2PA 출처 봉인/검증기 및
 * 로컬 제로-토큰(₩0) 한국어 웹툰 스타일 키워드·구도 어시스턴트.
 *
 * - `sealRightsBomProvenance` / `verifyRightsBomProvenance`: 브라우저 WebCrypto
 *   ECDSA P-256 또는 Ed25519(자동 감지) 서명 + SHA-256 해시 체인으로 원고 타일,
 *   3D·폰트 라이선스, AI 보조 이력을 봉인하고 단 1바이트 위변조도 탐지한다.
 * - `LocalStyleKeywordAssistant`: 오프라인 한/영 웹툰 어휘사전 BM25 + 256차원
 *   코사인 벡터 점수 + 선택적 Chrome 내장 AI(`window.ai`) 어댑터로 클라우드 토큰
 *   0회 소비 상태에서 스타일·조명·OKLCH 팔레트·구도·브러시를 추천한다.
 */

export const PROVENANCE_SCHEMA_VERSION = "toonstudio.c2pa-rights-bom.v1" as const;
export const GENESIS_CHAIN_HASH = "0".repeat(64);
export const STYLE_EMBEDDING_DIM = 256;

const UTF8_ENCODER = new TextEncoder();
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/* -------------------------------------------------------------------------- */
/* 1. Client-Side WebCrypto Rights BOM & C2PA Provenance Sealer               */
/* -------------------------------------------------------------------------- */

export type ProvenanceSigningAlgorithm = "ECDSA-P256" | "Ed25519";
export type RightsAssetKind = "3d-model" | "font" | "brush" | "screentone" | "audio" | "texture";
export type AiAssistScope = "none" | "line-cleanup" | "flat-color" | "style-keyword" | "layout-guide";
export type ProvenanceChainSection = "manuscript-tiles" | "rights-bom-licenses" | "ai-assist-ledger";

export interface ProvenanceKeyPair {
  readonly algorithm: ProvenanceSigningAlgorithm;
  readonly privateKey: CryptoKey; readonly publicKey: CryptoKey;
  readonly publicKeyJwk: JsonWebKey;
}

export interface ManuscriptTileInput {
  readonly tileId: string; readonly bytes?: Uint8Array;
  readonly sha256Hex?: string; readonly byteLength?: number;
}

export interface SealedTileDigest {
  readonly tileId: string; readonly sha256Hex: string; readonly byteLength: number;
}

export interface RightsBomLicenseRecord {
  readonly assetId: string; readonly assetKind: RightsAssetKind; readonly title: string;
  readonly licenseCode: string; readonly commercialAllowed: boolean;
  readonly attribution: string; readonly sourceHash: string;
}

export interface AiAssistProvenanceRecord {
  readonly stepId: string; readonly tool: string; readonly scope: AiAssistScope;
  readonly modelId: string; readonly humanEditedRatio: number; readonly recordedAtIso: string;
}

export interface ProvenanceChainEntry {
  readonly index: number; readonly section: ProvenanceChainSection;
  readonly prevHash: string; readonly payloadHash: string;
  readonly entryHash: string; readonly timestampIso: string;
}

export interface RightsBomSealInput {
  readonly workId: string; readonly episodeId: string; readonly creatorId: string;
  readonly tiles: readonly ManuscriptTileInput[];
  readonly licenses: readonly RightsBomLicenseRecord[];
  readonly aiAssistRecords: readonly AiAssistProvenanceRecord[];
  readonly keyPair: ProvenanceKeyPair;
  readonly parentManifestHash?: string | null;
  readonly createdAtIso?: string; readonly subtle?: SubtleCrypto;
}

export interface RightsBomManifestBody {
  readonly schemaVersion: typeof PROVENANCE_SCHEMA_VERSION;
  readonly manifestId: string; readonly workId: string; readonly episodeId: string;
  readonly creatorId: string; readonly createdAtIso: string;
  readonly parentManifestHash: string | null;
  readonly algorithm: ProvenanceSigningAlgorithm; readonly publicKeyJwk: JsonWebKey;
  readonly tiles: readonly SealedTileDigest[];
  readonly licenses: readonly RightsBomLicenseRecord[];
  readonly aiAssistRecords: readonly AiAssistProvenanceRecord[];
  readonly hashChain: readonly ProvenanceChainEntry[];
}

export interface RightsBomProvenanceManifest extends RightsBomManifestBody {
  readonly manifestDigestHex: string;
  readonly signatureBase64Url: string;
}

export interface ProvenanceVerifyOptions {
  readonly rawTiles?: Readonly<Record<string, Uint8Array>>;
  readonly expectedParentManifestHash?: string | null;
  readonly subtle?: SubtleCrypto;
}

export interface ProvenanceVerificationResult {
  readonly valid: boolean; readonly signatureValid: boolean;
  readonly hashChainValid: boolean; readonly tileDigestsValid: boolean;
  readonly commercialExportClear: boolean; readonly algorithm: ProvenanceSigningAlgorithm;
  readonly computedManifestDigestHex: string; readonly failureReasons: readonly string[];
}

function resolveSubtleCrypto(override?: SubtleCrypto): SubtleCrypto {
  const subtle = override ?? globalThis.crypto?.subtle;
  if (!subtle) throw new Error("현재 런타임에서 WebCrypto SubtleCrypto를 사용할 수 없습니다.");
  return subtle;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], has1 = i + 1 < bytes.length, has2 = i + 2 < bytes.length;
    const triple = (b0 << 16) | ((has1 ? bytes[i + 1] : 0) << 8) | (has2 ? bytes[i + 2] : 0);
    out += BASE64URL_ALPHABET[(triple >>> 18) & 63] + BASE64URL_ALPHABET[(triple >>> 12) & 63];
    if (has1) out += BASE64URL_ALPHABET[(triple >>> 6) & 63];
    if (has2) out += BASE64URL_ALPHABET[triple & 63];
  }
  return out;
}

export function decodeBase64Url(encoded: string): Uint8Array {
  const clean = encoded.replace(/=+$/g, "");
  if (clean.length % 4 === 1) throw new Error("유효하지 않은 Base64URL 서명 길이입니다.");
  const outLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64URL_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64URL_ALPHABET.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? BASE64URL_ALPHABET.indexOf(clean[i + 2]) : 0;
    const c3 = i + 3 < clean.length ? BASE64URL_ALPHABET.indexOf(clean[i + 3]) : 0;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error("유효하지 않은 Base64URL 문자입니다.");
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triple >>> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (triple >>> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = triple & 0xff;
  }
  return out;
}

/** 키 정렬을 강제한 결정론적 JSON 직렬화. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(rec[k])}`).join(",")}}`;
}

function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

export async function sha256Hex(data: Uint8Array | string, subtleOverride?: SubtleCrypto): Promise<string> {
  const subtle = resolveSubtleCrypto(subtleOverride);
  const raw = typeof data === "string" ? UTF8_ENCODER.encode(data) : data;
  return bytesToHex(new Uint8Array(await subtle.digest("SHA-256", toArrayBufferView(raw))));
}

function isCryptoKeyPair(val: CryptoKeyPair | CryptoKey): val is CryptoKeyPair {
  return "privateKey" in val && "publicKey" in val;
}

/** 런타임 WebCrypto가 Ed25519를 지원하면 Ed25519를, 아니면 ECDSA P-256을 자동 선택한다. */
export async function detectPreferredSigningAlgorithm(
  subtleOverride?: SubtleCrypto,
): Promise<ProvenanceSigningAlgorithm> {
  const subtle = resolveSubtleCrypto(subtleOverride);
  try {
    const probed = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    if (isCryptoKeyPair(probed)) return "Ed25519";
  } catch { /* Ed25519 미지원 런타임은 ECDSA P-256으로 폴백한다. */ }
  return "ECDSA-P256";
}

export async function generateProvenanceKeyPair(options: {
  readonly preferAlgorithm?: "auto" | ProvenanceSigningAlgorithm;
  readonly subtle?: SubtleCrypto;
} = {}): Promise<ProvenanceKeyPair> {
  const subtle = resolveSubtleCrypto(options.subtle);
  const chosen = options.preferAlgorithm && options.preferAlgorithm !== "auto"
    ? options.preferAlgorithm
    : await detectPreferredSigningAlgorithm(subtle);
  const keyGenParams: AlgorithmIdentifier | EcKeyGenParams =
    chosen === "Ed25519" ? { name: "Ed25519" } : { name: "ECDSA", namedCurve: "P-256" };
  const generated = await subtle.generateKey(keyGenParams, true, ["sign", "verify"]);
  if (!isCryptoKeyPair(generated)) throw new Error(`키 쌍 생성 실패: ${chosen}`);
  const publicKeyJwk = await subtle.exportKey("jwk", generated.publicKey);
  return { algorithm: chosen, privateKey: generated.privateKey, publicKey: generated.publicKey, publicKeyJwk };
}

async function buildProvenanceHashChain(
  tiles: readonly SealedTileDigest[],
  licenses: readonly RightsBomLicenseRecord[],
  aiAssistRecords: readonly AiAssistProvenanceRecord[],
  anchorHash: string,
  timestampIso: string,
  subtle: SubtleCrypto,
): Promise<readonly ProvenanceChainEntry[]> {
  const sections: readonly { readonly section: ProvenanceChainSection; readonly payload: unknown }[] = [
    { section: "manuscript-tiles", payload: tiles },
    { section: "rights-bom-licenses", payload: licenses },
    { section: "ai-assist-ledger", payload: aiAssistRecords },
  ];
  const entries: ProvenanceChainEntry[] = [];
  let prevHash = anchorHash;
  for (let i = 0; i < sections.length; i += 1) {
    const { section, payload } = sections[i];
    const payloadHash = await sha256Hex(canonicalizeJson(payload), subtle);
    const entryHash = await sha256Hex(`${prevHash}|${i}|${section}|${payloadHash}|${timestampIso}`, subtle);
    entries.push({ index: i, section, prevHash, payloadHash, entryHash, timestampIso });
    prevHash = entryHash;
  }
  return entries;
}

function extractManifestBody(m: RightsBomProvenanceManifest): RightsBomManifestBody {
  return {
    schemaVersion: m.schemaVersion, manifestId: m.manifestId, workId: m.workId,
    episodeId: m.episodeId, creatorId: m.creatorId, createdAtIso: m.createdAtIso,
    parentManifestHash: m.parentManifestHash, algorithm: m.algorithm, publicKeyJwk: m.publicKeyJwk,
    tiles: m.tiles, licenses: m.licenses, aiAssistRecords: m.aiAssistRecords, hashChain: m.hashChain,
  };
}

export async function sealRightsBomProvenance(input: RightsBomSealInput): Promise<RightsBomProvenanceManifest> {
  const subtle = resolveSubtleCrypto(input.subtle);
  const createdAtIso = input.createdAtIso ?? new Date().toISOString();
  const parentManifestHash = input.parentManifestHash ?? null;

  const sealedTiles: SealedTileDigest[] = [];
  for (const tile of input.tiles) {
    if (tile.bytes) {
      sealedTiles.push({ tileId: tile.tileId, sha256Hex: await sha256Hex(tile.bytes, subtle), byteLength: tile.bytes.byteLength });
    } else if (tile.sha256Hex) {
      sealedTiles.push({ tileId: tile.tileId, sha256Hex: tile.sha256Hex.toLowerCase(), byteLength: tile.byteLength ?? 0 });
    } else {
      throw new Error(`타일(${tile.tileId})에 bytes 또는 sha256Hex가 필요합니다.`);
    }
  }
  sealedTiles.sort((a, b) => a.tileId.localeCompare(b.tileId));

  const sortedLicenses = [...input.licenses].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const sortedAi = [...input.aiAssistRecords].sort((a, b) => a.stepId.localeCompare(b.stepId));
  const hashChain = await buildProvenanceHashChain(
    sealedTiles, sortedLicenses, sortedAi, parentManifestHash ?? GENESIS_CHAIN_HASH, createdAtIso, subtle,
  );
  const manifestId = `c2pa-${(await sha256Hex(`${input.workId}|${input.episodeId}|${hashChain[hashChain.length - 1].entryHash}`, subtle)).slice(0, 16)}`;

  const body: RightsBomManifestBody = {
    schemaVersion: PROVENANCE_SCHEMA_VERSION, manifestId, workId: input.workId,
    episodeId: input.episodeId, creatorId: input.creatorId, createdAtIso, parentManifestHash,
    algorithm: input.keyPair.algorithm, publicKeyJwk: input.keyPair.publicKeyJwk,
    tiles: sealedTiles, licenses: sortedLicenses, aiAssistRecords: sortedAi, hashChain,
  };
  const canonicalBytes = UTF8_ENCODER.encode(canonicalizeJson(body));
  const manifestDigestHex = await sha256Hex(canonicalBytes, subtle);
  const signParams: AlgorithmIdentifier | EcdsaParams =
    input.keyPair.algorithm === "Ed25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: "SHA-256" };
  const sigBuf = await subtle.sign(signParams, input.keyPair.privateKey, toArrayBufferView(canonicalBytes));
  return { ...body, manifestDigestHex, signatureBase64Url: encodeBase64Url(new Uint8Array(sigBuf)) };
}

export async function verifyRightsBomProvenance(
  manifest: RightsBomProvenanceManifest,
  options: ProvenanceVerifyOptions = {},
): Promise<ProvenanceVerificationResult> {
  const subtle = resolveSubtleCrypto(options.subtle);
  const failureReasons: string[] = [];

  if (manifest.schemaVersion !== PROVENANCE_SCHEMA_VERSION) {
    failureReasons.push(`지원하지 않는 스키마 버전입니다: ${String(manifest.schemaVersion)}`);
  }
  if (options.expectedParentManifestHash !== undefined && manifest.parentManifestHash !== options.expectedParentManifestHash) {
    failureReasons.push("상위 매니페스트 해시 앵커가 기대값과 일치하지 않습니다.");
  }

  let tileDigestsValid = true;
  if (options.rawTiles) {
    for (const tile of manifest.tiles) {
      const raw = options.rawTiles[tile.tileId];
      if (!raw) {
        tileDigestsValid = false;
        failureReasons.push(`원고 타일 바이트 누락: ${tile.tileId}`);
        continue;
      }
      const actualHash = await sha256Hex(raw, subtle);
      if (actualHash !== tile.sha256Hex || raw.byteLength !== tile.byteLength) {
        tileDigestsValid = false;
        failureReasons.push(`원고 타일 무결성 불일치(위변조 감지): ${tile.tileId}`);
      }
    }
  }

  const expectedChain = await buildProvenanceHashChain(
    manifest.tiles, manifest.licenses, manifest.aiAssistRecords,
    manifest.parentManifestHash ?? GENESIS_CHAIN_HASH, manifest.createdAtIso, subtle,
  );
  let hashChainValid = manifest.hashChain.length === expectedChain.length;
  if (!hashChainValid) {
    failureReasons.push("해시 체인 엔트리 개수가 일치하지 않습니다.");
  } else {
    for (let i = 0; i < expectedChain.length; i += 1) {
      const actual = manifest.hashChain[i], exp = expectedChain[i];
      if (actual.section !== exp.section || actual.prevHash !== exp.prevHash || actual.payloadHash !== exp.payloadHash || actual.entryHash !== exp.entryHash) {
        hashChainValid = false;
        failureReasons.push(`해시 체인 불일치(${exp.section}): 위변조가 감지되었습니다.`);
      }
    }
  }

  const canonicalBytes = UTF8_ENCODER.encode(canonicalizeJson(extractManifestBody(manifest)));
  const computedManifestDigestHex = await sha256Hex(canonicalBytes, subtle);
  if (computedManifestDigestHex !== manifest.manifestDigestHex) {
    hashChainValid = false;
    failureReasons.push("매니페스트 루트 SHA-256 다이제스트가 일치하지 않습니다.");
  }

  let signatureValid: boolean;
  try {
    const importParams: AlgorithmIdentifier | EcKeyImportParams =
      manifest.algorithm === "Ed25519" ? { name: "Ed25519" } : { name: "ECDSA", namedCurve: "P-256" };
    const verifyParams: AlgorithmIdentifier | EcdsaParams =
      manifest.algorithm === "Ed25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: "SHA-256" };
    const pubKey = await subtle.importKey("jwk", manifest.publicKeyJwk, importParams, false, ["verify"]);
    signatureValid = await subtle.verify(
      verifyParams, pubKey, toArrayBufferView(decodeBase64Url(manifest.signatureBase64Url)), toArrayBufferView(canonicalBytes),
    );
    if (!signatureValid) failureReasons.push("WebCrypto 디지털 서명 검증에 실패했습니다.");
  } catch (error) {
    signatureValid = false;
    failureReasons.push(`서명 검증 오류: ${error instanceof Error ? error.message : String(error)}`);
  }

  const valid = failureReasons.length === 0 && signatureValid && hashChainValid && tileDigestsValid;
  return {
    valid, signatureValid, hashChainValid, tileDigestsValid,
    commercialExportClear: valid && manifest.licenses.every((lic) => lic.commercialAllowed),
    algorithm: manifest.algorithm, computedManifestDigestHex, failureReasons,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. Local Zero-Token Korean Style Keyword & Composition Assistant           */
/* -------------------------------------------------------------------------- */

export interface OklchColorSwatch {
  readonly role: "dominant" | "midtone" | "accent" | "shadow";
  readonly labelKo: string;
  /** OKLCH 좌표 `[L(0..1), C(0..0.4), H(0..360)]`. */
  readonly oklch: readonly [number, number, number];
}

export interface StyleLightingPreset {
  readonly nameKo: string; readonly keyAngleDeg: number; readonly rimIntensity: number;
  readonly contrastRatio: number; readonly colorTempK: number;
}

export interface StyleCompositionGuide {
  readonly framingKo: string; readonly cameraAngleKo: string;
  readonly focalLengthMm: number; readonly layoutPrincipleKo: string;
}

export interface WebtoonStyleArchetype {
  readonly id: string; readonly titleKo: string;
  readonly genreTagsKo: readonly string[]; readonly keywordsKo: readonly string[];
  readonly keywordsEn: readonly string[]; readonly lighting: StyleLightingPreset;
  readonly palette: readonly OklchColorSwatch[]; readonly composition: StyleCompositionGuide;
  readonly recommendedBrushes: readonly string[];
}

export interface StyleRecommendationItem {
  readonly archetype: WebtoonStyleArchetype; readonly totalScore: number;
  readonly bm25Score: number; readonly vectorCosineScore: number;
  readonly matchedTokens: readonly string[];
}

export interface StyleAssistResponse {
  readonly query: string;
  readonly engine: "offline-bm25-vec256" | "chrome-builtin-ai-augmented";
  readonly cloudTokensUsed: 0; readonly elapsedMs: number;
  readonly directorNoteKo: string; readonly recommendations: readonly StyleRecommendationItem[];
}

export interface ChromeBuiltinAiSessionLike { prompt(input: string): Promise<string>; destroy?(): void; }
export interface ChromeBuiltinAiAdapter {
  availability?(): Promise<string>;
  create(options?: { readonly systemPrompt?: string }): Promise<ChromeBuiltinAiSessionLike>;
}

export interface LocalStyleKeywordAssistantOptions {
  readonly customArchetypes?: readonly WebtoonStyleArchetype[];
  readonly embedText256?: (text: string) => Float32Array;
  readonly chromeAiAdapter?: ChromeBuiltinAiAdapter | null;
  readonly useChromeBuiltinAi?: boolean;
  readonly bm25Weight?: number; readonly vectorWeight?: number;
}

export const WEBTOON_STYLE_LEXICON: readonly WebtoonStyleArchetype[] = [
  {
    id: "rofan-palace-sunset", titleKo: "로맨스 판타지 황궁 석양",
    genreTagsKo: ["로판", "로맨스판타지", "황궁", "귀족"],
    keywordsKo: ["로판", "황궁", "석양", "노을", "드레스", "무도회", "샹들리에", "금빛", "로맨틱", "영애"],
    keywordsEn: ["rofan", "romance", "fantasy", "palace", "sunset", "golden", "ballroom"],
    lighting: { nameKo: "황금 역광 석양", keyAngleDeg: 28, rimIntensity: 0.85, contrastRatio: 2.6, colorTempK: 3400 },
    palette: [
      { role: "dominant", labelKo: "따뜻한 아이보리 석조", oklch: [0.94, 0.025, 78] },
      { role: "midtone", labelKo: "살구 로즈 광채", oklch: [0.76, 0.11, 24] },
      { role: "accent", labelKo: "황실 샴페인 골드", oklch: [0.81, 0.14, 84] },
      { role: "shadow", labelKo: "자주빛 벨벳 그림자", oklch: [0.31, 0.08, 336] },
    ],
    composition: { framingKo: "발코니 아치 프레임 인 프레임", cameraAngleKo: "약한 로우 앵글", focalLengthMm: 50, layoutPrincipleKo: "삼분할 시선 유도 + 역광 실루엣 분리" },
    recommendedBrushes: ["gpen-silky-line", "watercolor-petal-glaze", "soft-rim-airbrush"],
  },
  {
    id: "cyberpunk-rain-noir", titleKo: "사이버펑크 빗속 네온 누아르",
    genreTagsKo: ["사이버펑크", "사펑", "SF", "누아르"],
    keywordsKo: ["사이버펑크", "사펑", "네온", "빗속", "야경", "홀로그램", "디스토피아", "골목", "미래도시"],
    keywordsEn: ["cyberpunk", "neon", "noir", "rain", "hologram", "dystopia", "alley", "futuristic"],
    lighting: { nameKo: "이중 네온 림라이트", keyAngleDeg: 135, rimIntensity: 0.95, contrastRatio: 5.2, colorTempK: 7600 },
    palette: [
      { role: "dominant", labelKo: "젖은 아스팔트 딥네이비", oklch: [0.19, 0.04, 255] },
      { role: "midtone", labelKo: "스틸 블루 반사광", oklch: [0.46, 0.09, 232] },
      { role: "accent", labelKo: "시안 홀로그램 사인", oklch: [0.79, 0.16, 198] },
      { role: "shadow", labelKo: "심야 흑요석 음영", oklch: [0.12, 0.02, 265] },
    ],
    composition: { framingKo: "고층 간판 1점 소실점 광각", cameraAngleKo: "더치 틸트 12°", focalLengthMm: 24, layoutPrincipleKo: "빗물 반사 대칭 + 대각선 네온 리딩라인" },
    recommendedBrushes: ["tech-liner-sharp", "rain-streak-scatter", "halftone-dot-45"],
  },
  {
    id: "youth-campus-afternoon", titleKo: "청춘 학원물 맑은 오후",
    genreTagsKo: ["학원물", "청춘", "순정", "일상"],
    keywordsKo: ["학원", "학교", "교실", "창가", "오후", "햇살", "청춘", "교복", "여름", "구름", "맑은"],
    keywordsEn: ["school", "campus", "youth", "classroom", "sunlight", "afternoon", "slice-of-life"],
    lighting: { nameKo: "창가 자연광 사광", keyAngleDeg: 42, rimIntensity: 0.55, contrastRatio: 1.9, colorTempK: 5600 },
    palette: [
      { role: "dominant", labelKo: "청량한 하늘빛 크림", oklch: [0.96, 0.02, 210] },
      { role: "midtone", labelKo: "오후 햇살 세룰리안", oklch: [0.74, 0.1, 224] },
      { role: "accent", labelKo: "교실 우드 앰버", oklch: [0.77, 0.11, 68] },
      { role: "shadow", labelKo: "투명 라벤더 그레이", oklch: [0.58, 0.05, 260] },
    ],
    composition: { framingKo: "창문 격자 3분할 원근", cameraAngleKo: "눈높이 아이레벨", focalLengthMm: 35, layoutPrincipleKo: "전경 책상 블러 + 인물 시선 여백 확보" },
    recommendedBrushes: ["pencil-soft-grain", "cel-flat-fill", "dust-mote-sparkle"],
  },
  {
    id: "wuxia-ink-duel", titleKo: "무협 수묵 검극 대결",
    genreTagsKo: ["무협", "동양판타지", "액션", "수묵"],
    keywordsKo: ["무협", "수묵", "수묵화", "먹선", "검극", "비무", "대나무", "기공", "강호", "동양풍", "붓터치"],
    keywordsEn: ["wuxia", "martial", "ink", "sumi", "sword", "duel", "bamboo", "calligraphy"],
    lighting: { nameKo: "고대비 운무 역광", keyAngleDeg: 15, rimIntensity: 0.9, contrastRatio: 6.4, colorTempK: 4900 },
    palette: [
      { role: "dominant", labelKo: "한지 미색 여백", oklch: [0.93, 0.02, 92] },
      { role: "midtone", labelKo: "담묵 안개 회색", oklch: [0.62, 0.015, 110] },
      { role: "accent", labelKo: "주사 인장 붉은빛", oklch: [0.55, 0.2, 26] },
      { role: "shadow", labelKo: "농묵 갈필 먹색", oklch: [0.16, 0.01, 240] },
    ],
    composition: { framingKo: "여백의 미 + 수직 낙하 검선", cameraAngleKo: "극단적 로우 앵글", focalLengthMm: 28, layoutPrincipleKo: "대각선 S자 동선과 먹 번짐 속도선 집중" },
    recommendedBrushes: ["calligraphy-dry-ink", "sumi-splatter-wash", "speedline-radial-pro"],
  },
  {
    id: "occult-horror-mansion", titleKo: "오컬트 호러 폐가 서스펜스",
    genreTagsKo: ["호러", "공포", "오컬트", "괴담"],
    keywordsKo: ["호러", "공포", "폐가", "괴담", "오컬트", "귀신", "어둠", "복도", "서늘한", "음산한"],
    keywordsEn: ["horror", "occult", "haunted", "creepy", "dark", "corridor", "suspense"],
    lighting: { nameKo: "하방 손전등 언더라이트", keyAngleDeg: -65, rimIntensity: 0.25, contrastRatio: 7.5, colorTempK: 6800 },
    palette: [
      { role: "dominant", labelKo: "습기 찬 차콜 암흑", oklch: [0.17, 0.015, 165] },
      { role: "midtone", labelKo: "곰팡이 세이지 그레이", oklch: [0.39, 0.04, 148] },
      { role: "accent", labelKo: "창백한 인광 그린", oklch: [0.76, 0.09, 138] },
      { role: "shadow", labelKo: "칠흑 공허 그림자", oklch: [0.09, 0.005, 220] },
    ],
    composition: { framingKo: "좁은 문틈 엿보기 프레이밍", cameraAngleKo: "불안정한 하이 앵글", focalLengthMm: 21, layoutPrincipleKo: "화면 70% 암부 압박 + 비대칭 시선 정지" },
    recommendedBrushes: ["scratch-hatch-pen", "charcoal-grit-shadow", "stipple-noise-tone"],
  },
  {
    id: "dungeon-boss-action", titleKo: "헌터 던전 보스전 클라이맥스",
    genreTagsKo: ["헌터물", "액션", "판타지", "배틀"],
    keywordsKo: ["던전", "보스전", "헌터", "액션", "배틀", "마법진", "폭발", "검기", "각성", "임팩트"],
    keywordsEn: ["dungeon", "boss", "hunter", "action", "battle", "magic", "impact", "awakening"],
    lighting: { nameKo: "마력 코어 강렬한 역광", keyAngleDeg: 170, rimIntensity: 1.0, contrastRatio: 6.0, colorTempK: 4200 },
    palette: [
      { role: "dominant", labelKo: "현무암 동굴 슬레이트", oklch: [0.24, 0.03, 250] },
      { role: "midtone", labelKo: "화염 분진 브론즈", oklch: [0.54, 0.11, 52] },
      { role: "accent", labelKo: "마력 각성 코발트 스파크", oklch: [0.72, 0.19, 252] },
      { role: "shadow", labelKo: "심연 암반 섀도우", oklch: [0.13, 0.02, 260] },
    ],
    composition: { framingKo: "초광각 원근 왜곡 피쉬아이", cameraAngleKo: "다이나믹 웜즈아이", focalLengthMm: 18, layoutPrincipleKo: "중앙 소실점 방사형 집중선 + 전경 파편 레이어" },
    recommendedBrushes: ["impact-ink-heavy", "energy-spark-glow", "debris-silhouette-stamp"],
  },
  {
    id: "joseon-palace-night", titleKo: "조선 사극 궁중 달빛 야경",
    genreTagsKo: ["사극", "시대극", "동양", "궁중"],
    keywordsKo: ["사극", "조선", "한옥", "기와", "궁궐", "달빛", "초롱불", "등불", "한복", "야경"],
    keywordsEn: ["historical", "joseon", "hanok", "palace", "moonlight", "lantern", "traditional"],
    lighting: { nameKo: "청백 달빛 + 난색 초롱 대비", keyAngleDeg: 58, rimIntensity: 0.72, contrastRatio: 3.8, colorTempK: 3900 },
    palette: [
      { role: "dominant", labelKo: "쪽빛 밤하늘 남색", oklch: [0.23, 0.055, 258] },
      { role: "midtone", labelKo: "단청 청록 기와", oklch: [0.48, 0.07, 186] },
      { role: "accent", labelKo: "한지 초롱 호박빛", oklch: [0.82, 0.14, 72] },
      { role: "shadow", labelKo: "처마 밑 먹남색", oklch: [0.15, 0.03, 252] },
    ],
    composition: { framingKo: "회랑 기둥 반복 리듬 구도", cameraAngleKo: "정갈한 아이레벨", focalLengthMm: 50, layoutPrincipleKo: "창호지 격자 실루엣 + 온냉 광원 대비" },
    recommendedBrushes: ["fine-ink-contour", "hanji-paper-wash", "soft-lantern-halo"],
  },
  {
    id: "botanical-atelier-healing", titleKo: "보태니컬 숲속 아틀리에 힐링",
    genreTagsKo: ["힐링", "일상", "자연", "아틀리에"],
    keywordsKo: ["힐링", "숲", "아틀리에", "카페", "정원", "식물", "수채화", "평온", "따뜻한", "감성"],
    keywordsEn: ["healing", "botanical", "forest", "atelier", "cafe", "watercolor", "cozy", "calm"],
    lighting: { nameKo: "나뭇잎 사이 확산광(코모레비)", keyAngleDeg: 50, rimIntensity: 0.45, contrastRatio: 1.7, colorTempK: 5200 },
    palette: [
      { role: "dominant", labelKo: "알라바스터 린넨", oklch: [0.97, 0.012, 92] },
      { role: "midtone", labelKo: "세이지 보태니컬 그린", oklch: [0.64, 0.075, 152] },
      { role: "accent", labelKo: "테라코타 따뜻한 점토", oklch: [0.66, 0.11, 44] },
      { role: "shadow", labelKo: "포레스트 딥그린", oklch: [0.33, 0.06, 156] },
    ],
    composition: { framingKo: "창가 테이블 여유로운 중경", cameraAngleKo: "완만한 3/4 버드아이", focalLengthMm: 40, layoutPrincipleKo: "황금비 여백 + 유기적 식물 프레임" },
    recommendedBrushes: ["pencil-warm-sketch", "watercolor-bleed-soft", "linen-paper-grain"],
  },
  {
    id: "thriller-rain-chase", titleKo: "범죄 스릴러 빗길 추격전",
    genreTagsKo: ["스릴러", "범죄", "미스터리", "추격"],
    keywordsKo: ["스릴러", "추격", "빗길", "형사", "범인", "헤드라이트", "긴장감", "지하주차장", "서스펜스"],
    keywordsEn: ["thriller", "chase", "crime", "detective", "headlight", "tension", "suspense"],
    lighting: { nameKo: "차량 헤드라이트 측광", keyAngleDeg: 112, rimIntensity: 0.88, contrastRatio: 5.8, colorTempK: 6100 },
    palette: [
      { role: "dominant", labelKo: "콘크리트 젖은 회청색", oklch: [0.27, 0.025, 235] },
      { role: "midtone", labelKo: "나트륨 가로등 머스터드", oklch: [0.63, 0.09, 86] },
      { role: "accent", labelKo: "경광등 크림슨 경고색", oklch: [0.58, 0.21, 24] },
      { role: "shadow", labelKo: "지하 기둥 딥블랙", oklch: [0.13, 0.01, 245] },
    ],
    composition: { framingKo: "어깨 너머 오버더숄더", cameraAngleKo: "긴박한 핸드헬드 틸트", focalLengthMm: 32, layoutPrincipleKo: "강한 명암 대각선 분할 + 모션 블러 전경" },
    recommendedBrushes: ["gritty-ink-marker", "motion-streak-pen", "concrete-grunge-tone"],
  },
  {
    id: "starlight-cosmic-fantasy", titleKo: "성좌 몽환 별빛 판타지",
    genreTagsKo: ["판타지", "성좌", "몽환", "마법"],
    keywordsKo: ["성좌", "별빛", "우주", "은하수", "몽환", "성운", "마법", "천체", "신비로운", "밤하늘"],
    keywordsEn: ["starlight", "cosmic", "constellation", "nebula", "dreamy", "magic", "ethereal"],
    lighting: { nameKo: "천체 성운 확산 역광", keyAngleDeg: 85, rimIntensity: 0.92, contrastRatio: 3.4, colorTempK: 7200 },
    palette: [
      { role: "dominant", labelKo: "심우주 인디고", oklch: [0.21, 0.075, 272] },
      { role: "midtone", labelKo: "성운 아메시스트", oklch: [0.53, 0.13, 294] },
      { role: "accent", labelKo: "별빛 샴페인 실버", oklch: [0.91, 0.06, 95] },
      { role: "shadow", labelKo: "자정 성좌 섀도우", oklch: [0.14, 0.04, 275] },
    ],
    composition: { framingKo: "광활한 천체 와이드 숏", cameraAngleKo: "하늘을 올려다보는 하이 틸트", focalLengthMm: 24, layoutPrincipleKo: "인물 하단 1/5 배치로 우주 스케일 극대화" },
    recommendedBrushes: ["starlight-scatter-fine", "nebula-soft-cloud", "delicate-hair-liner"],
  },
];

const KO_SUFFIX_RE = /(에서는|으로는|으로서|에서|으로|에게|까지|부터|처럼|보다|하고|느낌|분위기|스타일|연출|은|는|이|가|을|를|의|에|로|와|과|도|만|한|적|풍)$/;

/** 한국어 조사·어미 정규화 + 2음절 바이그램을 결합한 경량 로컬 토크나이저. */
export function tokenizeKoreanEnglishQuery(text: string): readonly string[] {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").trim();
  if (!normalized) return [];
  const tokens: string[] = [];
  for (const raw of normalized.split(/\s+/)) {
    if (!raw) continue;
    tokens.push(raw);
    const stemmed = raw.length >= 3 ? raw.replace(KO_SUFFIX_RE, "") : raw;
    if (stemmed && stemmed !== raw) tokens.push(stemmed);
    if (/^[\uac00-\ud7a3]{3,}$/.test(stemmed)) {
      for (let i = 0; i <= stemmed.length - 2; i += 1) tokens.push(stemmed.slice(i, i + 2));
    }
  }
  return tokens;
}

function hashToken32(token: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < token.length; i += 1) h = Math.imul(h ^ token.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** 결정론적 256차원 부호화 피처 해싱(feature hashing) L2 정규화 임베딩 벡터. */
export function embedStyleText256(text: string): Float32Array {
  const vec = new Float32Array(STYLE_EMBEDDING_DIM);
  for (const tok of tokenizeKoreanEnglishQuery(text)) {
    const h1 = hashToken32(tok, 0x811c9dc5), h2 = hashToken32(tok, 0x9e3779b9);
    vec[h1 & (STYLE_EMBEDDING_DIM - 1)] += (h1 & 0x100) === 0 ? 1 : -1;
    vec[h2 & (STYLE_EMBEDDING_DIM - 1)] += (h2 & 0x200) === 0 ? 0.5 : -0.5;
  }
  let normSq = 0;
  for (let i = 0; i < STYLE_EMBEDDING_DIM; i += 1) normSq += vec[i] * vec[i];
  if (normSq > 1e-12) {
    const inv = 1 / Math.sqrt(normSq);
    for (let i = 0; i < STYLE_EMBEDDING_DIM; i += 1) vec[i] *= inv;
  }
  return vec;
}

export function cosineSimilarity256(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  return normA <= 1e-12 || normB <= 1e-12 ? 0 : dot / Math.sqrt(normA * normB);
}

interface IndexedArchetypeDoc {
  readonly archetype: WebtoonStyleArchetype;
  readonly termFreq: ReadonlyMap<string, number>;
  readonly docLength: number;
  readonly vector: Float32Array;
}

function detectGlobalChromeAiAdapter(): ChromeBuiltinAiAdapter | null {
  const g = globalThis as typeof globalThis & { readonly ai?: { readonly languageModel?: ChromeBuiltinAiAdapter } };
  const lm = g.ai?.languageModel;
  return lm && typeof lm.create === "function" ? lm : null;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

/** 클라우드 토큰 0회 소비(₩0) 로컬 한국어 웹툰 스타일·조명·구도 추천 어시스턴트. */
export class LocalStyleKeywordAssistant {
  private readonly docs: readonly IndexedArchetypeDoc[];
  private readonly idfMap = new Map<string, number>();
  private readonly avgDocLength: number;
  private readonly embedFn: (text: string) => Float32Array;
  private readonly chromeAiAdapter: ChromeBuiltinAiAdapter | null;
  private readonly useChromeBuiltinAi: boolean;
  private readonly bm25Weight: number;
  private readonly vectorWeight: number;

  constructor(options: LocalStyleKeywordAssistantOptions = {}) {
    const archetypes = options.customArchetypes?.length ? options.customArchetypes : WEBTOON_STYLE_LEXICON;
    this.embedFn = options.embedText256 ?? embedStyleText256;
    this.chromeAiAdapter = options.chromeAiAdapter !== undefined ? options.chromeAiAdapter : detectGlobalChromeAiAdapter();
    this.useChromeBuiltinAi = options.useChromeBuiltinAi ?? true;
    this.bm25Weight = options.bm25Weight ?? 0.68;
    this.vectorWeight = options.vectorWeight ?? 0.32;

    const dfMap = new Map<string, number>();
    const indexed: IndexedArchetypeDoc[] = [];
    let totalLen = 0;
    for (const archetype of archetypes) {
      const corpus = [
        archetype.titleKo, ...archetype.genreTagsKo, ...archetype.genreTagsKo,
        ...archetype.keywordsKo, ...archetype.keywordsEn,
        archetype.lighting.nameKo, archetype.composition.framingKo, archetype.composition.cameraAngleKo,
      ].join(" ");
      const tokens = tokenizeKoreanEnglishQuery(corpus);
      const tf = new Map<string, number>();
      for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
      for (const uniqueTok of tf.keys()) dfMap.set(uniqueTok, (dfMap.get(uniqueTok) ?? 0) + 1);
      totalLen += tokens.length;
      indexed.push({ archetype, termFreq: tf, docLength: Math.max(1, tokens.length), vector: this.embedFn(corpus) });
    }
    this.docs = indexed;
    this.avgDocLength = indexed.length > 0 ? totalLen / indexed.length : 1;
    for (const [tok, df] of dfMap.entries()) {
      this.idfMap.set(tok, Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5)));
    }
  }

  /** 완전 동기 오프라인 BM25 + 256차원 코사인 벡터 추천(네트워크 0회). */
  recommendOffline(query: string, topK = 3): StyleAssistResponse {
    const t0 = nowMs();
    const uniqueQueryTokens = Array.from(new Set(tokenizeKoreanEnglishQuery(query)));
    const queryVec = this.embedFn(query);
    const k1 = 1.5, b = 0.75;
    const scored: StyleRecommendationItem[] = [];

    for (const doc of this.docs) {
      let bm25 = 0;
      const matched: string[] = [];
      for (const tok of uniqueQueryTokens) {
        const tf = doc.termFreq.get(tok) ?? 0;
        if (tf <= 0) continue;
        matched.push(tok);
        const idf = this.idfMap.get(tok) ?? 0.5;
        bm25 += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.docLength / this.avgDocLength))));
      }
      const cosine = Math.max(0, cosineSimilarity256(queryVec, doc.vector));
      const normBm25 = bm25 > 0 ? bm25 / (bm25 + 3.0) : 0;
      scored.push({
        archetype: doc.archetype,
        totalScore: this.bm25Weight * normBm25 + this.vectorWeight * cosine,
        bm25Score: bm25, vectorCosineScore: cosine, matchedTokens: matched,
      });
    }

    scored.sort((a, bItem) => bItem.totalScore - a.totalScore || a.archetype.id.localeCompare(bItem.archetype.id));
    const topItems = scored.slice(0, Math.max(1, Math.min(topK, scored.length)));
    const lead = topItems[0]?.archetype;
    const directorNoteKo = lead
      ? `${lead.titleKo} 기준으로 ${lead.lighting.nameKo}(${lead.lighting.colorTempK}K) 조명과 ${lead.composition.focalLengthMm}mm ${lead.composition.cameraAngleKo} 구도를 적용해 보세요.`
      : "입력한 키워드를 기준으로 기본 중립 스튜디오 조명과 35mm 아이레벨 구도를 제안합니다.";

    return {
      query, engine: "offline-bm25-vec256", cloudTokensUsed: 0,
      elapsedMs: Math.max(0, nowMs() - t0), directorNoteKo, recommendations: topItems,
    };
  }

  /** Chrome 내장 AI(`window.ai`) 가용 시 연출 노트를 보강하고, 미지원·오류 시 오프라인 폴백한다. */
  async recommend(query: string, topK = 3): Promise<StyleAssistResponse> {
    const offline = this.recommendOffline(query, topK);
    if (!this.useChromeBuiltinAi || !this.chromeAiAdapter || offline.recommendations.length === 0) return offline;
    const t0 = nowMs();
    let session: ChromeBuiltinAiSessionLike | null = null;
    try {
      if (typeof this.chromeAiAdapter.availability === "function") {
        const state = await this.chromeAiAdapter.availability();
        if (state === "unavailable" || state === "no") return offline;
      }
      session = await this.chromeAiAdapter.create({
        systemPrompt: "웹툰 연출 디렉터로서 한 문장의 간결한 한국어 조명·구도 조언을 작성한다.",
      });
      const lead = offline.recommendations[0].archetype;
      const aiText = (
        await session.prompt(`질의: ${query}\n추천 스타일: ${lead.titleKo}\n조명: ${lead.lighting.nameKo}\n구도: ${lead.composition.framingKo}`)
      ).trim();
      if (!aiText) return offline;
      return {
        ...offline, engine: "chrome-builtin-ai-augmented", cloudTokensUsed: 0,
        elapsedMs: offline.elapsedMs + Math.max(0, nowMs() - t0), directorNoteKo: aiText,
      };
    } catch {
      return offline;
    } finally {
      session?.destroy?.();
    }
  }
}
