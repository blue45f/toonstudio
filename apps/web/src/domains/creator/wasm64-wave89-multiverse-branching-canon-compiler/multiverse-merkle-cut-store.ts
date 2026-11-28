/**
 * Wave 89: 콘텐츠 주소 지정 중복 제거 멀티버스 분기 에피소드 Merkle DAG 저장소 및 구조 감사기.
 *
 * - 외부 의존성 없는 순수 동기 FIPS 180-4 SHA-256(`sha256MultiverseHex`)으로 배경·캐릭터·대사
 *   레이어를 콘텐츠 주소로 중복 제거 저장하고, 분기·다이아몬드 재합류·멀티 엔딩 Merkle DAG와
 *   구조 결함(고아 컷·막다른 컷·무한 순환·누락 자산 해시)을 결정론적으로 컴파일·감사한다.
 */

export type CharacterAvailabilityStatus = "alive" | "injured" | "unconscious" | "absent";
export type CostumeCondition = "intact" | "wet" | "torn" | "bloodstained" | "changed";
export type AssetLayerKind = "background" | "character" | "prop" | "dialogue" | "sfx" | "lighting";
export type CutNodeKind = "start" | "scene" | "choice" | "merge" | "ending";
export type EndingCategoryTag = "true" | "good" | "bad" | "secret" | "neutral";

export interface CharacterWorldState {
  readonly characterId: string;
  readonly displayNameKo: string;
  readonly status: CharacterAvailabilityStatus;
  readonly costume: CostumeCondition;
  readonly costumeLabelKo?: string;
}

export interface WorldStateBounds {
  readonly minRelationship: number;
  readonly maxRelationship: number;
}

export const DEFAULT_WORLD_STATE_BOUNDS: WorldStateBounds = Object.freeze({ minRelationship: -100, maxRelationship: 100 });

export type WorldStateGuardCondition =
  | { readonly kind: "item-has"; readonly itemId: string; readonly expected: boolean }
  | { readonly kind: "character-status"; readonly characterId: string; readonly allowed: readonly CharacterAvailabilityStatus[] }
  | { readonly kind: "costume-is"; readonly characterId: string; readonly allowed: readonly CostumeCondition[] }
  | { readonly kind: "relationship-range"; readonly targetId: string; readonly min?: number; readonly max?: number }
  | { readonly kind: "secret-known"; readonly secretId: string; readonly expected: boolean }
  | { readonly kind: "all"; readonly conditions: readonly WorldStateGuardCondition[] }
  | { readonly kind: "any"; readonly conditions: readonly WorldStateGuardCondition[] }
  | { readonly kind: "not"; readonly condition: WorldStateGuardCondition };

export type WorldStateEffect =
  | { readonly kind: "set-item"; readonly itemId: string; readonly value: boolean; readonly labelKo?: string }
  | { readonly kind: "set-character-status"; readonly characterId: string; readonly status: CharacterAvailabilityStatus; readonly reasonKo?: string }
  | { readonly kind: "set-costume"; readonly characterId: string; readonly costume: CostumeCondition; readonly explicitChange?: boolean; readonly reasonKo?: string }
  | { readonly kind: "adjust-relationship"; readonly targetId: string; readonly delta: number }
  | { readonly kind: "set-relationship"; readonly targetId: string; readonly value: number }
  | { readonly kind: "reveal-secret"; readonly secretId: string; readonly labelKo?: string }
  | { readonly kind: "forget-secret"; readonly secretId: string };

export interface ItemUsageRequirement {
  readonly itemId: string;
  readonly itemLabelKo: string;
  readonly expectedValue?: boolean;
  readonly forbiddenBrokenFlagId?: string;
  readonly characterId?: string;
  readonly actionKo?: string;
}
export interface DepictedCostumeAssertion {
  readonly characterId: string;
  readonly expectedCostume: CostumeCondition;
  readonly layerHash?: string;
  readonly noteKo?: string;
}
export interface SpeakingCharacterAssertion {
  readonly characterId: string;
  readonly dialogueExcerptKo?: string;
  readonly allowedStatuses?: readonly CharacterAvailabilityStatus[];
}
export interface SecretReferenceAssertion {
  readonly secretId: string;
  readonly secretLabelKo: string;
  readonly speakerCharacterId?: string;
  readonly dialogueExcerptKo?: string;
}
export interface CutCanonRequirement {
  readonly requiredItems?: readonly ItemUsageRequirement[];
  readonly depictedCostumes?: readonly DepictedCostumeAssertion[];
  readonly speakingCharacters?: readonly SpeakingCharacterAssertion[];
  readonly referencedSecrets?: readonly SecretReferenceAssertion[];
}
export interface MultiverseAssetBlob {
  readonly hash: string;
  readonly kind: AssetLayerKind;
  readonly labelKo: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly canonicalTag?: string;
}
export interface RegisterAssetBlobInput {
  readonly kind: AssetLayerKind;
  readonly labelKo: string;
  readonly mimeType: string;
  readonly payload: string | Uint8Array;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly canonicalTag?: string;
}
export interface PanelLayerRef {
  readonly layerId: string;
  readonly kind: AssetLayerKind;
  readonly assetHash: string;
  readonly zIndex: number;
  readonly opacity?: number;
  readonly characterId?: string;
  readonly depictedCostume?: CostumeCondition;
}
export interface DialogueLine {
  readonly lineId: string;
  readonly speakerCharacterId: string;
  readonly speakerNameKo: string;
  readonly textKo: string;
  readonly referencedSecretIds?: readonly string[];
}
export interface ConditionalLayerVariant {
  readonly variantId: string;
  readonly labelKo: string;
  readonly priority: number;
  readonly when: WorldStateGuardCondition;
  readonly overrideLayers?: readonly PanelLayerRef[];
  readonly overrideDialogueKo?: readonly DialogueLine[];
  readonly overrideRequirements?: Partial<CutCanonRequirement>;
}
export interface ChoiceEdge {
  readonly edgeId: string;
  readonly fromCutId: string;
  readonly toCutId: string;
  readonly choiceLabelKo: string;
  readonly branchTag?: string;
  readonly guard?: WorldStateGuardCondition;
  readonly effects?: readonly WorldStateEffect[];
  readonly isAutoAdvance?: boolean;
}
export interface EndingMetadata {
  readonly endingId: string;
  readonly endingTitleKo: string;
  readonly endingTag: EndingCategoryTag | string;
  readonly summaryKo?: string;
}
export interface MultiverseCutNodeInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly titleKo: string;
  readonly nodeKind: CutNodeKind;
  readonly baseLayers: readonly PanelLayerRef[];
  readonly dialogue?: readonly DialogueLine[];
  readonly onEnterEffects?: readonly WorldStateEffect[];
  readonly onExitEffects?: readonly WorldStateEffect[];
  readonly requirements?: CutCanonRequirement;
  readonly conditionalVariants?: readonly ConditionalLayerVariant[];
  readonly ending?: EndingMetadata;
}
export interface MultiverseCutNode extends MultiverseCutNodeInput {
  readonly contentMerkleHash: string;
}
export interface InitialWorldStateConfig {
  readonly characters: readonly CharacterWorldState[];
  readonly inventory?: Readonly<Record<string, boolean>>;
  readonly relationships?: Readonly<Record<string, number>>;
  readonly knownSecrets?: readonly string[];
  readonly relationshipBounds?: WorldStateBounds;
  readonly itemLabelsKo?: Readonly<Record<string, string>>;
  readonly secretLabelsKo?: Readonly<Record<string, string>>;
}
export interface AssetDeduplicationMetrics {
  readonly totalLayerReferences: number;
  readonly uniqueBlobCount: number;
  readonly sharedBlobCount: number;
  readonly logicalTotalBytes: number;
  readonly deduplicatedStoredBytes: number;
  readonly savedBytes: number;
  readonly sharedAssetDeduplicationRatio: number;
  readonly deduplicationSavingsRatio: number;
  readonly layerReferenceReuseRatio: number;
}
export interface MultiverseEpisodeDag {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly startCutId: string;
  readonly initialWorldState: InitialWorldStateConfig;
  readonly blobs: Readonly<Record<string, MultiverseAssetBlob>>;
  readonly cuts: Readonly<Record<string, MultiverseCutNode>>;
  readonly edges: readonly ChoiceEdge[];
  readonly cutMerkleHashes: Readonly<Record<string, string>>;
  readonly episodeMerkleRoot: string;
  readonly deduplicationMetrics: AssetDeduplicationMetrics;
}
export type StructuralDefectCode =
  | "missing-start-cut"
  | "unreachable-orphan-cut"
  | "dead-end-non-ending-cut"
  | "unguarded-infinite-cycle"
  | "missing-asset-hash"
  | "dangling-edge-target";
export interface StructuralDagDefect {
  readonly code: StructuralDefectCode;
  readonly severity: "error";
  readonly cutId?: string;
  readonly edgeId?: string;
  readonly assetHash?: string;
  readonly cycleNodeIds?: readonly string[];
  readonly messageKo: string;
}
export interface StructuralDagAuditReport {
  readonly episodeId: string;
  readonly episodeMerkleRoot: string;
  readonly valid: boolean;
  readonly reachableCutIds: readonly string[];
  readonly orphanCutIds: readonly string[];
  readonly reconvergenceCutIds: readonly string[];
  readonly declaredEndingCutIds: readonly string[];
  readonly defects: readonly StructuralDagDefect[];
  readonly defectCountsByCode: Readonly<Record<StructuralDefectCode, number>>;
  readonly summaryKo: string;
}
export interface MultiverseEpisodeStoreOptions {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly startCutId: string;
  readonly initialWorldState: InitialWorldStateConfig;
}

// ============================================================================
// 1. 순수 동기 FIPS 180-4 SHA-256 및 정규 직렬화 (외부 의존성 없음, ES2017)
// ============================================================================

const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
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

/** 문자열을 표준 UTF-8 바이트 배열로 인코딩한다. */
export function utf8EncodeMultiverse(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(bytes);
}

/** 바이트 배열을 소문자 16진수 문자열로 변환한다. */
export function bytesToHexMultiverse(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const v = bytes[i] ?? 0;
    out.push((v < 16 ? "0" : "") + v.toString(16));
  }
  return out.join("");
}

function rotr32(v: number, bits: number): number {
  return ((v >>> bits) | (v << (32 - bits))) >>> 0;
}

/** FIPS 180-4 SHA-256 32바이트 원시 다이제스트를 동기 계산한다. */
export function sha256MultiverseBytes(data: Uint8Array): Uint8Array {
  const len = data.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(total);
  padded.set(data, 0);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(total - 8, Math.floor(len / 0x20000000) >>> 0, false);
  view.setUint32(total - 4, (len << 3) >>> 0, false);

  const st = new Uint32Array(SHA256_H0);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [st[0] ?? 0, st[1] ?? 0, st[2] ?? 0, st[3] ?? 0, st[4] ?? 0, st[5] ?? 0, st[6] ?? 0, st[7] ?? 0];
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const delta = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) st[i] = ((st[i] ?? 0) + (delta[i] ?? 0)) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, st[i] ?? 0, false);
  return out;
}

/** 문자열 또는 바이트 배열의 FIPS 180-4 SHA-256 64자리 16진수 해시를 계산한다. */
export function sha256MultiverseHex(input: string | Uint8Array): string {
  return bytesToHexMultiverse(sha256MultiverseBytes(typeof input === "string" ? utf8EncodeMultiverse(input) : input));
}

/** 키 순서에 무관한 결정론적 정규 직렬화 문자열을 생성한다. */
export function canonicalSerializeMultiverse(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return !Number.isFinite(value) ? "null" : Object.is(value, -0) ? "0" : String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Uint8Array) return JSON.stringify({ $bytesHex: bytesToHexMultiverse(value) });
  if (value instanceof Set) return `[${Array.from(value.values()).map((v) => canonicalSerializeMultiverse(v)).sort().join(",")}]`;
  if (Array.isArray(value)) return `[${value.map((v) => canonicalSerializeMultiverse(v)).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(rec).sort()) {
      if (rec[key] !== undefined) parts.push(`${JSON.stringify(key)}:${canonicalSerializeMultiverse(rec[key])}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

// ============================================================================
// 2. Merkle 해시 계산 및 자산 중복 제거 지표
// ============================================================================

/** 개별 컷 노드의 정규 콘텐츠 Merkle 해시를 계산한다. */
export function computeCutContentMerkleHash(cut: MultiverseCutNodeInput): string {
  return sha256MultiverseHex(
    canonicalSerializeMultiverse({
      schema: "toonstudio-multiverse-cut/v1",
      cutId: cut.cutId,
      cutNumber: cut.cutNumber,
      titleKo: cut.titleKo,
      nodeKind: cut.nodeKind,
      baseLayers: cut.baseLayers,
      dialogue: cut.dialogue ?? [],
      onEnterEffects: cut.onEnterEffects ?? [],
      onExitEffects: cut.onExitEffects ?? [],
      requirements: cut.requirements ?? null,
      conditionalVariants: cut.conditionalVariants ?? [],
      ending: cut.ending ?? null,
    }),
  );
}

function computeBinaryMerkleRoot(leafHashes: readonly string[]): string {
  if (leafHashes.length === 0) return sha256MultiverseHex("toonstudio-multiverse-empty-merkle-root");
  let level = leafHashes.slice().sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] ?? "";
      next.push(sha256MultiverseHex(`node:${left}:${level[i + 1] ?? left}`));
    }
    level = next;
  }
  return level[0] ?? sha256MultiverseHex("toonstudio-multiverse-empty-merkle-root");
}

/** 에피소드 전체(블롭·컷·분기 엣지·초기 세계관)를 묶는 단일 Merkle 루트 해시를 계산한다. */
export function computeEpisodeDagMerkleRoot(params: {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly startCutId: string;
  readonly initialWorldState: InitialWorldStateConfig;
  readonly blobs: Readonly<Record<string, MultiverseAssetBlob>>;
  readonly cutMerkleHashes: Readonly<Record<string, string>>;
  readonly edges: readonly ChoiceEdge[];
}): string {
  const blobLeaves = Object.keys(params.blobs).sort().map((h) => sha256MultiverseHex(canonicalSerializeMultiverse({ kind: "blob", hash: h, blob: params.blobs[h] })));
  const cutLeaves = Object.keys(params.cutMerkleHashes).sort().map((id) => sha256MultiverseHex(`cut:${id}:${params.cutMerkleHashes[id] ?? ""}`));
  const edgeLeaves = params.edges.slice().sort((a, b) => a.edgeId.localeCompare(b.edgeId)).map((e) => sha256MultiverseHex(canonicalSerializeMultiverse({ kind: "edge", edge: e })));
  return sha256MultiverseHex(
    canonicalSerializeMultiverse({
      schema: "toonstudio-multiverse-dag/v1",
      episodeId: params.episodeId,
      episodeTitleKo: params.episodeTitleKo,
      startCutId: params.startCutId,
      initialWorldStateHash: sha256MultiverseHex(canonicalSerializeMultiverse(params.initialWorldState)),
      blobsMerkleRoot: computeBinaryMerkleRoot(blobLeaves),
      cutsMerkleRoot: computeBinaryMerkleRoot(cutLeaves),
      edgesMerkleRoot: computeBinaryMerkleRoot(edgeLeaves),
    }),
  );
}

function collectCutLayerRefs(cut: MultiverseCutNode): PanelLayerRef[] {
  const refs = cut.baseLayers.slice();
  for (const variant of cut.conditionalVariants ?? []) {
    if (variant.overrideLayers) refs.push(...variant.overrideLayers);
  }
  return refs;
}

/** 컷 전반의 레이어 참조 대비 콘텐츠 주소 중복 제거 절감률을 계산한다. */
export function computeAssetDeduplicationMetrics(
  cuts: Readonly<Record<string, MultiverseCutNode>>,
  blobs: Readonly<Record<string, MultiverseAssetBlob>>,
): AssetDeduplicationMetrics {
  const refCountByHash = new Map<string, number>();
  let totalLayerReferences = 0;
  let logicalTotalBytes = 0;
  for (const cutId of Object.keys(cuts).sort()) {
    const cut = cuts[cutId];
    if (!cut) continue;
    for (const ref of collectCutLayerRefs(cut)) {
      totalLayerReferences += 1;
      refCountByHash.set(ref.assetHash, (refCountByHash.get(ref.assetHash) ?? 0) + 1);
      const blob = blobs[ref.assetHash];
      if (blob) logicalTotalBytes += blob.byteLength;
    }
  }
  let deduplicatedStoredBytes = 0;
  let uniqueBlobCount = 0;
  let sharedBlobCount = 0;
  refCountByHash.forEach((count, hash) => {
    const blob = blobs[hash];
    if (!blob) return;
    uniqueBlobCount += 1;
    deduplicatedStoredBytes += blob.byteLength;
    if (count >= 2) sharedBlobCount += 1;
  });
  const savedBytes = Math.max(0, logicalTotalBytes - deduplicatedStoredBytes);
  const byteRatio = Math.round((logicalTotalBytes > 0 ? savedBytes / logicalTotalBytes : 0) * 10000) / 10000;
  const reuseRatio = Math.round((totalLayerReferences > 0 ? Math.max(0, totalLayerReferences - uniqueBlobCount) / totalLayerReferences : 0) * 10000) / 10000;
  return {
    totalLayerReferences, uniqueBlobCount, sharedBlobCount, logicalTotalBytes,
    deduplicatedStoredBytes, savedBytes,
    sharedAssetDeduplicationRatio: byteRatio,
    deduplicationSavingsRatio: byteRatio,
    layerReferenceReuseRatio: reuseRatio,
  };
}

// 3. 멀티버스 콘텐츠 주소 지정 Merkle DAG 저장소
/** 분기 웹툰의 공유 레이어 블롭·컷·선택지 엣지를 관리하는 콘텐츠 주소 지정 Merkle DAG 저장소. */
export class MultiverseEpisodeDagStore {
  private readonly opts: MultiverseEpisodeStoreOptions;
  private readonly blobMap = new Map<string, MultiverseAssetBlob>();
  private readonly cutMap = new Map<string, MultiverseCutNode>();
  private readonly edgeList: ChoiceEdge[] = [];
  private readonly edgeIdSet = new Set<string>();

  public constructor(options: MultiverseEpisodeStoreOptions) { this.opts = options; }

  /** 레이어 페이로드를 SHA-256으로 해싱해 중복 없이 저장하고 블롭 메타데이터를 반환한다. */
  public registerLayerBlob(input: RegisterAssetBlobInput): MultiverseAssetBlob {
    const payloadBytes = typeof input.payload === "string" ? utf8EncodeMultiverse(input.payload) : input.payload;
    const contentHash = sha256MultiverseHex(canonicalSerializeMultiverse({
      kind: input.kind, mimeType: input.mimeType,
      widthPx: input.widthPx ?? null, heightPx: input.heightPx ?? null,
      payloadHash: sha256MultiverseHex(payloadBytes),
    }));
    const existing = this.blobMap.get(contentHash);
    if (existing) return existing;
    const blob: MultiverseAssetBlob = {
      hash: contentHash, kind: input.kind, labelKo: input.labelKo, mimeType: input.mimeType,
      byteLength: payloadBytes.byteLength,
      ...(input.widthPx !== undefined ? { widthPx: input.widthPx } : {}),
      ...(input.heightPx !== undefined ? { heightPx: input.heightPx } : {}),
      ...(input.canonicalTag !== undefined ? { canonicalTag: input.canonicalTag } : {}),
    };
    this.blobMap.set(contentHash, blob);
    return blob;
  }

  /** 컷 노드를 등록하고 정규 콘텐츠 Merkle 해시를 부여한다. */
  public addCut(input: MultiverseCutNodeInput): MultiverseCutNode {
    const node: MultiverseCutNode = { ...input, contentMerkleHash: computeCutContentMerkleHash(input) };
    this.cutMap.set(node.cutId, node);
    return node;
  }

  /** 분기 선택지 또는 자동 진행/재합류 엣지를 추가한다. */
  public addEdge(edge: ChoiceEdge): ChoiceEdge {
    if (this.edgeIdSet.has(edge.edgeId)) throw new Error(`이미 등록된 분기 엣지 ID입니다: ${edge.edgeId}`);
    this.edgeIdSet.add(edge.edgeId);
    this.edgeList.push(edge);
    return edge;
  }

  /** 등록된 블롭·컷·엣지를 불변 멀티버스 Merkle DAG 스냅샷으로 컴파일한다. */
  public buildEpisodeDag(): MultiverseEpisodeDag {
    const blobs: Record<string, MultiverseAssetBlob> = {};
    for (const key of Array.from(this.blobMap.keys()).sort()) {
      const blob = this.blobMap.get(key);
      if (blob) blobs[key] = blob;
    }
    const cuts: Record<string, MultiverseCutNode> = {};
    const cutMerkleHashes: Record<string, string> = {};
    for (const cutId of Array.from(this.cutMap.keys()).sort()) {
      const cut = this.cutMap.get(cutId);
      if (!cut) continue;
      cuts[cutId] = cut;
      cutMerkleHashes[cutId] = cut.contentMerkleHash;
    }
    const edges = this.edgeList.slice();
    const episodeMerkleRoot = computeEpisodeDagMerkleRoot({
      episodeId: this.opts.episodeId,
      episodeTitleKo: this.opts.episodeTitleKo,
      startCutId: this.opts.startCutId,
      initialWorldState: this.opts.initialWorldState,
      blobs,
      cutMerkleHashes,
      edges,
    });
    return {
      episodeId: this.opts.episodeId,
      episodeTitleKo: this.opts.episodeTitleKo,
      startCutId: this.opts.startCutId,
      initialWorldState: this.opts.initialWorldState,
      blobs,
      cuts,
      edges,
      cutMerkleHashes,
      episodeMerkleRoot,
      deduplicationMetrics: computeAssetDeduplicationMetrics(cuts, blobs),
    };
  }
}

// ============================================================================
// 4. 구조적 그래프 결함 감사기 (고아 컷·막다른 컷·무한 루프·누락 해시)
// ============================================================================

function collectGuardVariableKeys(guard: WorldStateGuardCondition | undefined, out: Set<string>): void {
  if (!guard) return;
  if (guard.kind === "item-has") out.add(`item:${guard.itemId}`);
  else if (guard.kind === "character-status") out.add(`status:${guard.characterId}`);
  else if (guard.kind === "costume-is") out.add(`costume:${guard.characterId}`);
  else if (guard.kind === "relationship-range") out.add(`rel:${guard.targetId}`);
  else if (guard.kind === "secret-known") out.add(`secret:${guard.secretId}`);
  else if (guard.kind === "not") collectGuardVariableKeys(guard.condition, out);
  else for (const sub of guard.conditions) collectGuardVariableKeys(sub, out);
}

function collectEffectVariableKeys(effects: readonly WorldStateEffect[] | undefined, out: Set<string>): void {
  for (const ef of effects ?? []) {
    if (ef.kind === "set-item") out.add(`item:${ef.itemId}`);
    else if (ef.kind === "set-character-status") out.add(`status:${ef.characterId}`);
    else if (ef.kind === "set-costume") out.add(`costume:${ef.characterId}`);
    else if (ef.kind === "adjust-relationship" || ef.kind === "set-relationship") out.add(`rel:${ef.targetId}`);
    else out.add(`secret:${ef.secretId}`);
  }
}

function isCycleGuardedWithProgress(
  cycleNodeIds: readonly string[],
  cycleEdges: readonly ChoiceEdge[],
  cuts: Readonly<Record<string, MultiverseCutNode>>,
): boolean {
  const guardVars = new Set<string>();
  const mutatedVars = new Set<string>();
  for (const edge of cycleEdges) {
    collectGuardVariableKeys(edge.guard, guardVars);
    collectEffectVariableKeys(edge.effects, mutatedVars);
  }
  if (guardVars.size === 0) return false;
  for (const cutId of cycleNodeIds) {
    const cut = cuts[cutId];
    if (cut) {
      collectEffectVariableKeys(cut.onEnterEffects, mutatedVars);
      collectEffectVariableKeys(cut.onExitEffects, mutatedVars);
    }
  }
  let hasProgress = false;
  guardVars.forEach((k) => { if (mutatedVars.has(k)) hasProgress = true; });
  return hasProgress;
}

/** 멀티버스 에피소드 Merkle DAG의 고아 컷·막다른 컷·무한 순환·누락 해시 결함을 결정론적으로 감사한다. */
export function auditMultiverseDagStructure(dag: MultiverseEpisodeDag): StructuralDagAuditReport {
  const defects: StructuralDagDefect[] = [];
  const allCutIds = Object.keys(dag.cuts).sort();
  const outgoingByCut = new Map<string, ChoiceEdge[]>(allCutIds.map((id) => [id, []]));
  const incomingReachableCount = new Map<string, number>();

  for (const edge of dag.edges) {
    const hasFrom = Object.prototype.hasOwnProperty.call(dag.cuts, edge.fromCutId);
    const hasTo = Object.prototype.hasOwnProperty.call(dag.cuts, edge.toCutId);
    if (!hasFrom || !hasTo) {
      defects.push({
        code: "dangling-edge-target",
        severity: "error",
        edgeId: edge.edgeId,
        cutId: hasFrom ? edge.toCutId : edge.fromCutId,
        messageKo: `분기 엣지 '${edge.edgeId}'가 존재하지 않는 컷(${edge.fromCutId} -> ${edge.toCutId})을 참조합니다.`,
      });
      continue;
    }
    outgoingByCut.get(edge.fromCutId)?.push(edge);
  }

  const reachableSet = new Set<string>();
  if (!Object.prototype.hasOwnProperty.call(dag.cuts, dag.startCutId)) {
    defects.push({ code: "missing-start-cut", severity: "error", cutId: dag.startCutId, messageKo: `에피소드 시작 컷 '${dag.startCutId}'을 찾을 수 없습니다.` });
  } else {
    const queue = [dag.startCutId];
    reachableSet.add(dag.startCutId);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (current === undefined) break;
      for (const edge of outgoingByCut.get(current) ?? []) {
        incomingReachableCount.set(edge.toCutId, (incomingReachableCount.get(edge.toCutId) ?? 0) + 1);
        if (!reachableSet.has(edge.toCutId)) {
          reachableSet.add(edge.toCutId);
          queue.push(edge.toCutId);
        }
      }
    }
  }

  const reachableCutIds = Array.from(reachableSet).sort();
  const orphanCutIds: string[] = [];
  const reconvergenceCutIds: string[] = [];
  const declaredEndingCutIds: string[] = [];

  for (const cutId of allCutIds) {
    const cut = dag.cuts[cutId];
    if (!cut) continue;
    const isEnding = cut.ending !== undefined || cut.nodeKind === "ending";
    if (isEnding) declaredEndingCutIds.push(cutId);
    if (!reachableSet.has(cutId)) {
      orphanCutIds.push(cutId);
      defects.push({ code: "unreachable-orphan-cut", severity: "error", cutId, messageKo: `${cut.cutNumber}컷('${cut.titleKo}', ${cutId})이 시작 컷에서 도달할 수 없는 고아 컷입니다.` });
    } else {
      if ((incomingReachableCount.get(cutId) ?? 0) >= 2) reconvergenceCutIds.push(cutId);
      if ((outgoingByCut.get(cutId) ?? []).length === 0 && !isEnding) {
        defects.push({ code: "dead-end-non-ending-cut", severity: "error", cutId, messageKo: `${cut.cutNumber}컷('${cut.titleKo}', ${cutId})에 진출 엣지도 없고 엔딩 태그도 없는 막다른 컷입니다.` });
      }
    }
    for (const ref of collectCutLayerRefs(cut)) {
      const blob = dag.blobs[ref.assetHash];
      if (!blob || blob.hash !== ref.assetHash) {
        defects.push({
          code: "missing-asset-hash",
          severity: "error",
          cutId,
          assetHash: ref.assetHash,
          messageKo: `${cut.cutNumber}컷('${cut.titleKo}')의 '${ref.layerId}' 레이어가 누락·손상된 자산 해시(${ref.assetHash.slice(0, 12)})를 참조합니다.`,
        });
      }
    }
  }

  const color = new Map<string, number>();
  const stackNodes: string[] = [];
  const stackEdges: ChoiceEdge[] = [];
  const reportedCycles = new Set<string>();
  const dfsCycle = (nodeId: string): void => {
    color.set(nodeId, 1);
    stackNodes.push(nodeId);
    for (const edge of outgoingByCut.get(nodeId) ?? []) {
      const targetColor = color.get(edge.toCutId) ?? 0;
      if (targetColor === 1) {
        const startIdx = stackNodes.indexOf(edge.toCutId);
        if (startIdx >= 0) {
          const cycleNodes = stackNodes.slice(startIdx);
          const cycleEdges = stackEdges.slice(startIdx).concat([edge]);
          if (!isCycleGuardedWithProgress(cycleNodes, cycleEdges, dag.cuts)) {
            const key = cycleNodes.slice().sort().join("->");
            if (!reportedCycles.has(key)) {
              reportedCycles.add(key);
              const closedPath = cycleNodes.concat([edge.toCutId]);
              defects.push({
                code: "unguarded-infinite-cycle",
                severity: "error",
                cutId: edge.toCutId,
                edgeId: edge.edgeId,
                cycleNodeIds: closedPath,
                messageKo: `종료 조건 없는 무한 순환 루프가 감지되었습니다: ${closedPath.join(" → ")}.`,
              });
            }
          }
        }
      } else if (targetColor === 0) {
        stackEdges.push(edge);
        dfsCycle(edge.toCutId);
        stackEdges.pop();
      }
    }
    stackNodes.pop();
    color.set(nodeId, 2);
  };
  if (reachableSet.has(dag.startCutId)) dfsCycle(dag.startCutId);

  const defectCountsByCode: Record<StructuralDefectCode, number> = {
    "missing-start-cut": 0,
    "unreachable-orphan-cut": 0,
    "dead-end-non-ending-cut": 0,
    "unguarded-infinite-cycle": 0,
    "missing-asset-hash": 0,
    "dangling-edge-target": 0,
  };
  for (const defect of defects) defectCountsByCode[defect.code] += 1;

  const valid = defects.length === 0;
  return {
    episodeId: dag.episodeId,
    episodeMerkleRoot: dag.episodeMerkleRoot,
    valid,
    reachableCutIds,
    orphanCutIds,
    reconvergenceCutIds,
    declaredEndingCutIds,
    defects,
    defectCountsByCode,
    summaryKo: valid
      ? `구조 감사 통과: 도달 가능 컷 ${reachableCutIds.length}개, 재합류 ${reconvergenceCutIds.length}개, 엔딩 ${declaredEndingCutIds.length}개.`
      : `구조 감사 결함 ${defects.length}건 발견 (고아 컷 ${defectCountsByCode["unreachable-orphan-cut"]}, 막다른 컷 ${defectCountsByCode["dead-end-non-ending-cut"]}, 무한 순환 ${defectCountsByCode["unguarded-infinite-cycle"]}, 누락 해시 ${defectCountsByCode["missing-asset-hash"]}).`,
  };
}
