/**
 * 크로스 플랫폼(Desktop · Mobile · Web) 3D 에셋 메타데이터·리그 프리셋·조명 리그 CRDT 동기화기
 * 및 시선 연동 3D 조명 컨트롤러 통합 파사드.
 *
 * - HLC(Hybrid Logical Clock) + Vector Clock 인과 우세 + LWW 전순서 충돌 해소
 * - 결정적 JSON 및 컴팩트 바이너리(`TS3D` + FNV-1a 무결성 체크섬) 증분 델타 직렬화
 * - ₩0 서버 비용 · 클라우드 벤더 종속 0 (로컬 OPFS / WebRTC / LAN 파일 교환 호환)
 */

import type { HumanoidRestPoseKind, Vec3 } from "./mesh-qem-decimator-retargeter";
import type { BlockCodecMode, RgbTuple } from "./webnn-style-bake-texture-compressor";

export {
  GazePoseLightController,
  type GazeHeadPoseSample,
  type GazePoseLightConfig,
  type GazePoseLightState,
} from "./gaze-pose-light-controller";

export type SyncPlatformKind = "desktop" | "mobile" | "web";

export type CrdtScalarValue =
  | string
  | number
  | boolean
  | null
  | readonly [number, number, number];

export type VectorClock = Readonly<Record<string, number>>;

export interface CrdtVersionStamp {
  readonly replicaId: string;
  readonly platform: SyncPlatformKind;
  readonly authorSeq: number;
  readonly lamport: number;
  readonly wallMs: number;
  readonly vectorClock: VectorClock;
}

export interface CrdtRegisterEntry {
  readonly field: string;
  readonly value: CrdtScalarValue;
  readonly stamp: CrdtVersionStamp;
}

export interface AssetMetadataManifest {
  readonly assetId: string;
  readonly title: string;
  readonly format: "glb" | "vrm" | "fbx" | "usd";
  readonly meshTriangleCount: number;
  readonly compressionProfile: BlockCodecMode | "none";
  readonly schemaVersion: number;
  readonly updatedPlatform: SyncPlatformKind;
}

export interface RigPresetManifest {
  readonly restPose: HumanoidRestPoseKind;
  readonly ikSolverMode: "wave2-rust-ik" | "ts-fallback";
  readonly softExtensionRatio: number;
  readonly floorY: number;
  readonly clothSubstepHz: number;
  readonly hairStiffness: number;
  readonly activePosePresetId: string;
}

export interface LightingRigManifest {
  readonly keyDirection: Vec3;
  readonly keyIntensity: number;
  readonly keyColorRgb: RgbTuple;
  readonly rimDirection: Vec3;
  readonly rimIntensity: number;
  readonly rimColorRgb: RgbTuple;
  readonly ambientIntensity: number;
  readonly celBandCount: 2 | 3 | 4;
  readonly gazeSyncEnabled: boolean;
}

export interface Materialized3dAssetManifest {
  readonly assetMetadata: AssetMetadataManifest;
  readonly rigPreset: RigPresetManifest;
  readonly lightingRig: LightingRigManifest;
  readonly tags: readonly string[];
  readonly custom: Readonly<Record<string, CrdtScalarValue>>;
  readonly vectorClock: VectorClock;
  readonly lamportClock: number;
}

export interface CrdtDeltaPacket {
  readonly schema: "toonstudio-3d-crdt-v1";
  readonly sourceReplicaId: string;
  readonly sourcePlatform: SyncPlatformKind;
  readonly vectorClock: VectorClock;
  readonly entries: readonly CrdtRegisterEntry[];
  readonly checksumHex: string;
}

export interface CrdtMergeSummary {
  readonly appliedEntries: number;
  readonly ignoredStaleEntries: number;
  readonly concurrentConflictsResolved: number;
  readonly causalOverrides: number;
  readonly mergedVectorClock: VectorClock;
}

export type VectorClockOrder = "before" | "after" | "equal" | "concurrent";

const BINARY_MAGIC_0 = 0x54; // 'T'
const BINARY_MAGIC_1 = 0x53; // 'S'
const BINARY_MAGIC_2 = 0x33; // '3'
const BINARY_MAGIC_3 = 0x44; // 'D'
const BINARY_VERSION = 1;
const BINARY_HEADER_BYTES = 16;

function fnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function toHex8(u32: number): string {
  return (u32 >>> 0).toString(16).padStart(8, "0");
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function canonicalSortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalSortValue(item));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = canonicalSortValue(record[key]);
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalSortValue(value));
}

function cloneVectorClock(vc: VectorClock): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(vc).sort()) {
    const v = vc[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[key] = Math.floor(v);
  }
  return out;
}

function mergeVectorClocks(a: VectorClock, b: VectorClock): Record<string, number> {
  const out = cloneVectorClock(a);
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[k] = Math.max(out[k] ?? 0, Math.floor(v));
    }
  }
  return out;
}

/** 두 벡터 시계의 인과 순서(before / after / equal / concurrent)를 판정한다. */
export function compareVectorClocks(a: VectorClock, b: VectorClock): VectorClockOrder {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  let aLess = false;
  let bLess = false;
  for (const k of keys) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    if (va < vb) aLess = true;
    if (va > vb) bLess = true;
    if (aLess && bLess) return "concurrent";
  }
  if (!aLess && !bLess) return "equal";
  return aLess ? "before" : "after";
}

/**
 * Vector Clock 인과 우세 + HLC LWW(`wallMs → lamport → replicaId → authorSeq`) 전역 전순서 비교.
 * HLC 불변량($A \to B \implies (B.\text{wallMs}, B.\text{lamport}) > (A.\text{wallMs}, A.\text{lamport})$)으로
 * 교환·결합·멱등 강한 최종 일관성(SEC)을 수학적으로 보장한다.
 */
export function compareCrdtStamps(
  incoming: CrdtVersionStamp,
  current: CrdtVersionStamp,
): { readonly winner: "incoming" | "current" | "tie"; readonly order: VectorClockOrder } {
  const order = compareVectorClocks(current.vectorClock, incoming.vectorClock);
  if (order === "before") return { winner: "incoming", order };
  if (order === "after") return { winner: "current", order };
  if (incoming.wallMs !== current.wallMs) {
    return { winner: incoming.wallMs > current.wallMs ? "incoming" : "current", order };
  }
  if (incoming.lamport !== current.lamport) {
    return { winner: incoming.lamport > current.lamport ? "incoming" : "current", order };
  }
  if (incoming.replicaId !== current.replicaId) {
    return { winner: incoming.replicaId > current.replicaId ? "incoming" : "current", order };
  }
  if (incoming.authorSeq !== current.authorSeq) {
    return { winner: incoming.authorSeq > current.authorSeq ? "incoming" : "current", order };
  }
  return { winner: "tie", order };
}

function isVec3Tuple(v: CrdtScalarValue | undefined): v is Vec3 {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    typeof v[2] === "number"
  );
}

function readString(map: Map<string, CrdtRegisterEntry>, field: string, fallback: string): string {
  const val = map.get(field)?.value;
  return typeof val === "string" ? val : fallback;
}

function readNumber(map: Map<string, CrdtRegisterEntry>, field: string, fallback: number): number {
  const val = map.get(field)?.value;
  return typeof val === "number" && Number.isFinite(val) ? val : fallback;
}

function readBoolean(map: Map<string, CrdtRegisterEntry>, field: string, fallback: boolean): boolean {
  const val = map.get(field)?.value;
  return typeof val === "boolean" ? val : fallback;
}

function readVec3(map: Map<string, CrdtRegisterEntry>, field: string, fallback: Vec3): Vec3 {
  const val = map.get(field)?.value;
  return isVec3Tuple(val) ? [val[0], val[1], val[2]] : fallback;
}

/**
 * Desktop / Mobile / Web 멀티 디바이스 간 3D 에셋 메타데이터·리그·조명 설정을
 * 강한 최종 일관성(SEC)으로 수렴시키는 무서버 CRDT 매니페스트 동기화기.
 */
export class CrossPlatform3dAssetCrdt {
  readonly replicaId: string;
  readonly platform: SyncPlatformKind;
  private vectorClock: Record<string, number> = {};
  private lamportClock = 0;
  private maxObservedWallMs = 0;
  private readonly registers = new Map<string, CrdtRegisterEntry>();

  constructor(replicaId: string, platform: SyncPlatformKind, assetId = "asset-untitled") {
    this.replicaId = replicaId;
    this.platform = platform;
    this.setField("meta.assetId", assetId, 0);
  }

  getVectorClock(): VectorClock {
    return cloneVectorClock(this.vectorClock);
  }

  getLamportClock(): number {
    return this.lamportClock;
  }

  private nextStamp(wallMs: number): CrdtVersionStamp {
    const nextSeq = (this.vectorClock[this.replicaId] ?? 0) + 1;
    this.vectorClock[this.replicaId] = nextSeq;
    this.lamportClock += 1;
    const safeWall = Number.isFinite(wallMs) ? Math.floor(wallMs) : 0;
    const hlcWallMs = Math.max(safeWall, this.maxObservedWallMs);
    this.maxObservedWallMs = hlcWallMs;
    return {
      replicaId: this.replicaId,
      platform: this.platform,
      authorSeq: nextSeq,
      lamport: this.lamportClock,
      wallMs: hlcWallMs,
      vectorClock: cloneVectorClock(this.vectorClock),
    };
  }

  private applyBatch(updates: readonly (readonly [string, CrdtScalarValue])[], wallMs: number): void {
    if (updates.length === 0) return;
    const stamp = this.nextStamp(wallMs);
    for (const [field, rawVal] of updates) {
      const value: CrdtScalarValue = isVec3Tuple(rawVal) ? [rawVal[0], rawVal[1], rawVal[2]] : rawVal;
      this.registers.set(field, { field, value, stamp });
    }
  }

  setField(field: string, value: CrdtScalarValue, wallMs = Date.now()): CrdtRegisterEntry {
    const stamp = this.nextStamp(wallMs);
    const normalized: CrdtScalarValue = isVec3Tuple(value) ? [value[0], value[1], value[2]] : value;
    const entry: CrdtRegisterEntry = { field, value: normalized, stamp };
    this.registers.set(field, entry);
    return entry;
  }

  updateAssetMetadata(patch: Partial<Omit<AssetMetadataManifest, "updatedPlatform">>, wallMs = Date.now()): void {
    const batch: (readonly [string, CrdtScalarValue])[] = [];
    if (patch.assetId !== undefined) batch.push(["meta.assetId", patch.assetId]);
    if (patch.title !== undefined) batch.push(["meta.title", patch.title]);
    if (patch.format !== undefined) batch.push(["meta.format", patch.format]);
    if (patch.meshTriangleCount !== undefined) batch.push(["meta.meshTriangleCount", patch.meshTriangleCount]);
    if (patch.compressionProfile !== undefined) batch.push(["meta.compressionProfile", patch.compressionProfile]);
    if (patch.schemaVersion !== undefined) batch.push(["meta.schemaVersion", patch.schemaVersion]);
    batch.push(["meta.updatedPlatform", this.platform]);
    this.applyBatch(batch, wallMs);
  }

  updateRigPreset(patch: Partial<RigPresetManifest>, wallMs = Date.now()): void {
    const batch: (readonly [string, CrdtScalarValue])[] = [];
    if (patch.restPose !== undefined) batch.push(["rig.restPose", patch.restPose]);
    if (patch.ikSolverMode !== undefined) batch.push(["rig.ikSolverMode", patch.ikSolverMode]);
    if (patch.softExtensionRatio !== undefined) batch.push(["rig.softExtensionRatio", patch.softExtensionRatio]);
    if (patch.floorY !== undefined) batch.push(["rig.floorY", patch.floorY]);
    if (patch.clothSubstepHz !== undefined) batch.push(["rig.clothSubstepHz", patch.clothSubstepHz]);
    if (patch.hairStiffness !== undefined) batch.push(["rig.hairStiffness", patch.hairStiffness]);
    if (patch.activePosePresetId !== undefined) batch.push(["rig.activePosePresetId", patch.activePosePresetId]);
    this.applyBatch(batch, wallMs);
  }

  updateLightingRig(patch: Partial<LightingRigManifest>, wallMs = Date.now()): void {
    const batch: (readonly [string, CrdtScalarValue])[] = [];
    if (patch.keyDirection !== undefined) batch.push(["light.keyDirection", patch.keyDirection]);
    if (patch.keyIntensity !== undefined) batch.push(["light.keyIntensity", patch.keyIntensity]);
    if (patch.keyColorRgb !== undefined) batch.push(["light.keyColorRgb", patch.keyColorRgb]);
    if (patch.rimDirection !== undefined) batch.push(["light.rimDirection", patch.rimDirection]);
    if (patch.rimIntensity !== undefined) batch.push(["light.rimIntensity", patch.rimIntensity]);
    if (patch.rimColorRgb !== undefined) batch.push(["light.rimColorRgb", patch.rimColorRgb]);
    if (patch.ambientIntensity !== undefined) batch.push(["light.ambientIntensity", patch.ambientIntensity]);
    if (patch.celBandCount !== undefined) batch.push(["light.celBandCount", patch.celBandCount]);
    if (patch.gazeSyncEnabled !== undefined) batch.push(["light.gazeSyncEnabled", patch.gazeSyncEnabled]);
    this.applyBatch(batch, wallMs);
  }

  setTag(tag: string, present: boolean, wallMs = Date.now()): void {
    const clean = tag.trim();
    if (clean) this.setField(`tag.${clean}`, present, wallMs);
  }

  setCustomField(key: string, value: CrdtScalarValue, wallMs = Date.now()): void {
    const clean = key.trim();
    if (clean) this.setField(`custom.${clean}`, value, wallMs);
  }

  /** 원격 벡터 시계 기준 미전파 레지스터만 추려 결정적 델타 패킷을 생성한다. */
  computeDeltaSince(remoteVectorClock: VectorClock = {}): CrdtDeltaPacket {
    const entries: CrdtRegisterEntry[] = [];
    for (const field of Array.from(this.registers.keys()).sort()) {
      const entry = this.registers.get(field);
      if (!entry) continue;
      if (entry.stamp.authorSeq > (remoteVectorClock[entry.stamp.replicaId] ?? 0)) {
        entries.push(entry);
      }
    }
    const body = {
      schema: "toonstudio-3d-crdt-v1" as const,
      sourceReplicaId: this.replicaId,
      sourcePlatform: this.platform,
      vectorClock: cloneVectorClock(this.vectorClock),
      entries,
    };
    return { ...body, checksumHex: toHex8(fnv1a32(encodeUtf8(canonicalJson(body)))) };
  }

  /** 수신한 델타 패킷을 Vector Clock + HLC LWW 규칙으로 병합한다(교환·결합·멱등 보장). */
  mergeDelta(packet: CrdtDeltaPacket): CrdtMergeSummary {
    const body = {
      schema: packet.schema,
      sourceReplicaId: packet.sourceReplicaId,
      sourcePlatform: packet.sourcePlatform,
      vectorClock: cloneVectorClock(packet.vectorClock),
      entries: packet.entries,
    };
    if (toHex8(fnv1a32(encodeUtf8(canonicalJson(body)))) !== packet.checksumHex) {
      throw new Error("CRDT 델타 패킷 무결성 체크섬이 일치하지 않습니다.");
    }

    let appliedEntries = 0;
    let ignoredStaleEntries = 0;
    let concurrentConflictsResolved = 0;
    let causalOverrides = 0;

    for (const incoming of packet.entries) {
      if (incoming.stamp.lamport > this.lamportClock) this.lamportClock = incoming.stamp.lamport;
      if (incoming.stamp.wallMs > this.maxObservedWallMs) this.maxObservedWallMs = incoming.stamp.wallMs;
      const current = this.registers.get(incoming.field);
      if (!current) {
        this.registers.set(incoming.field, incoming);
        appliedEntries += 1;
        continue;
      }
      const cmp = compareCrdtStamps(incoming.stamp, current.stamp);
      if (cmp.order === "concurrent") concurrentConflictsResolved += 1;
      if (cmp.winner === "incoming") {
        if (cmp.order === "before") causalOverrides += 1;
        this.registers.set(incoming.field, incoming);
        appliedEntries += 1;
      } else {
        ignoredStaleEntries += 1;
      }
    }

    this.vectorClock = mergeVectorClocks(this.vectorClock, packet.vectorClock);
    for (const entry of packet.entries) {
      this.vectorClock = mergeVectorClocks(this.vectorClock, entry.stamp.vectorClock);
    }

    return {
      appliedEntries,
      ignoredStaleEntries,
      concurrentConflictsResolved,
      causalOverrides,
      mergedVectorClock: cloneVectorClock(this.vectorClock),
    };
  }

  exportDeltaJson(remoteVectorClock: VectorClock = {}): string {
    return canonicalJson(this.computeDeltaSince(remoteVectorClock));
  }

  importDeltaJson(jsonText: string): CrdtMergeSummary {
    const parsed = JSON.parse(jsonText) as Partial<CrdtDeltaPacket>;
    if (
      parsed.schema !== "toonstudio-3d-crdt-v1" ||
      typeof parsed.sourceReplicaId !== "string" ||
      typeof parsed.checksumHex !== "string" ||
      !Array.isArray(parsed.entries) ||
      !parsed.vectorClock
    ) {
      throw new Error("유효하지 않은 CRDT JSON 델타 형식입니다.");
    }
    return this.mergeDelta(parsed as CrdtDeltaPacket);
  }

  /** 헤더(`TS3D` + 버전 + 길이 + FNV-1a 체크섬)가 포함된 컴팩트 바이너리 델타를 직렬화한다. */
  exportDeltaBinary(remoteVectorClock: VectorClock = {}): Uint8Array {
    const payload = encodeUtf8(this.exportDeltaJson(remoteVectorClock));
    const buf = new Uint8Array(BINARY_HEADER_BYTES + payload.byteLength);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    buf[0] = BINARY_MAGIC_0;
    buf[1] = BINARY_MAGIC_1;
    buf[2] = BINARY_MAGIC_2;
    buf[3] = BINARY_MAGIC_3;
    buf[4] = BINARY_VERSION;
    view.setUint32(8, payload.byteLength, true);
    view.setUint32(12, fnv1a32(payload), true);
    buf.set(payload, BINARY_HEADER_BYTES);
    return buf;
  }

  importDeltaBinary(bytes: Uint8Array): CrdtMergeSummary {
    if (bytes.byteLength < BINARY_HEADER_BYTES) {
      throw new Error("CRDT 바이너리 델타 길이가 헤더보다 짧습니다.");
    }
    if (
      bytes[0] !== BINARY_MAGIC_0 ||
      bytes[1] !== BINARY_MAGIC_1 ||
      bytes[2] !== BINARY_MAGIC_2 ||
      bytes[3] !== BINARY_MAGIC_3
    ) {
      throw new Error("CRDT 바이너리 매직 시그니처(TS3D)가 일치하지 않습니다.");
    }
    if (bytes[4] !== BINARY_VERSION) {
      throw new Error(`지원하지 않는 CRDT 바이너리 버전입니다: ${bytes[4]}`);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payloadLen = view.getUint32(8, true);
    const storedChecksum = view.getUint32(12, true);
    if (BINARY_HEADER_BYTES + payloadLen !== bytes.byteLength) {
      throw new Error("CRDT 바이너리 페이로드 길이가 헤더와 일치하지 않습니다.");
    }
    const payload = bytes.subarray(BINARY_HEADER_BYTES);
    if (fnv1a32(payload) !== storedChecksum) {
      throw new Error("CRDT 바이너리 체크섬 검증에 실패했습니다.");
    }
    return this.importDeltaJson(decodeUtf8(payload));
  }

  /** 현재 레지스터 상태를 타입 안전한 3D 에셋·리그·조명 매니페스트 스냅샷으로 구체화한다. */
  materializeManifest(): Materialized3dAssetManifest {
    const rawFormat = readString(this.registers, "meta.format", "glb");
    const format: AssetMetadataManifest["format"] =
      rawFormat === "vrm" || rawFormat === "fbx" || rawFormat === "usd" ? rawFormat : "glb";
    const rawCodec = readString(this.registers, "meta.compressionProfile", "bc1-rgb565-8to1");
    const compressionProfile: BlockCodecMode | "none" =
      rawCodec === "bc3-rgba-4to1" || rawCodec === "none" ? rawCodec : "bc1-rgb565-8to1";
    const rawPlat = readString(this.registers, "meta.updatedPlatform", this.platform);
    const updatedPlatform: SyncPlatformKind =
      rawPlat === "desktop" || rawPlat === "mobile" || rawPlat === "web" ? rawPlat : this.platform;
    const restPose: HumanoidRestPoseKind = readString(this.registers, "rig.restPose", "T-pose") === "A-pose" ? "A-pose" : "T-pose";
    const ikSolverMode: RigPresetManifest["ikSolverMode"] =
      readString(this.registers, "rig.ikSolverMode", "wave2-rust-ik") === "ts-fallback" ? "ts-fallback" : "wave2-rust-ik";
    const rawBands = readNumber(this.registers, "light.celBandCount", 3);
    const celBandCount: 2 | 3 | 4 = rawBands === 2 ? 2 : rawBands === 4 ? 4 : 3;

    const tags: string[] = [];
    const custom: Record<string, CrdtScalarValue> = {};
    for (const field of Array.from(this.registers.keys()).sort()) {
      const entry = this.registers.get(field);
      if (!entry) continue;
      if (field.startsWith("tag.") && entry.value === true) tags.push(field.slice(4));
      else if (field.startsWith("custom.")) custom[field.slice(7)] = entry.value;
    }

    return {
      assetMetadata: {
        assetId: readString(this.registers, "meta.assetId", "asset-untitled"),
        title: readString(this.registers, "meta.title", "Untitled 3D Asset"),
        format,
        meshTriangleCount: readNumber(this.registers, "meta.meshTriangleCount", 0),
        compressionProfile,
        schemaVersion: readNumber(this.registers, "meta.schemaVersion", 1),
        updatedPlatform,
      },
      rigPreset: {
        restPose,
        ikSolverMode,
        softExtensionRatio: readNumber(this.registers, "rig.softExtensionRatio", 0.995),
        floorY: readNumber(this.registers, "rig.floorY", 0),
        clothSubstepHz: readNumber(this.registers, "rig.clothSubstepHz", 120),
        hairStiffness: readNumber(this.registers, "rig.hairStiffness", 0.72),
        activePosePresetId: readString(this.registers, "rig.activePosePresetId", "neutral-idle"),
      },
      lightingRig: {
        keyDirection: readVec3(this.registers, "light.keyDirection", [0.45, 0.68, 0.58]),
        keyIntensity: readNumber(this.registers, "light.keyIntensity", 1.15),
        keyColorRgb: readVec3(this.registers, "light.keyColorRgb", [1, 0.97, 0.93]),
        rimDirection: readVec3(this.registers, "light.rimDirection", [-0.55, 0.5, -0.67]),
        rimIntensity: readNumber(this.registers, "light.rimIntensity", 0.45),
        rimColorRgb: readVec3(this.registers, "light.rimColorRgb", [0.85, 0.92, 1]),
        ambientIntensity: readNumber(this.registers, "light.ambientIntensity", 0.28),
        celBandCount,
        gazeSyncEnabled: readBoolean(this.registers, "light.gazeSyncEnabled", true),
      },
      tags,
      custom,
      vectorClock: cloneVectorClock(this.vectorClock),
      lamportClock: this.lamportClock,
    };
  }
}
