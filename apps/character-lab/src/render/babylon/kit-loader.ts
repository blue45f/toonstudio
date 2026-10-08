/**
 * 모듈식 캐릭터 키트 로더(계약 4.2~4.7·4.9, KT-03). `KitPlan`의 GLB 묶음(베이스 1 + 선택 파츠)을 받아 하나의 스켈레톤에 바인딩된 리그를 만든다.
 *
 * 1. 파일을 병렬(최대 4)로 받고 `bytes`·SHA-256을 플랜과 대조한다(`kit-file-fetch-failed`·`kit-bytes-mismatch`·`kit-sha-mismatch`).
 * 2. 각 GLB를 AssetContainer로 열고(금지 확장 `kit-unsupported-extension`, 로더 실패 `kit-glb-load-failed`) 플랜의 메시 선언과 대조한다
 *    (`kit-mesh-undeclared`·`kit-mesh-missing`·`kit-outline-shell-forbidden`·`kit-morph-missing`·`kit-material-multiple`).
 *    스킨(`kit-skin-invalid`)·변환 항등(`kit-transform-invalid`)·joint 호환(`kit-joint-mismatch`)을 확인한다.
 * 3. 파츠 메시를 **베이스 스켈레톤에 재바인딩**하고 파츠의 스켈레톤·본 노드는 해제한다(`kit-skeleton-bind.ts`).
 * 4. 메시를 **역할로** 묶어 `RigPart`를 만든다(`partId = rolePartId(role)` — 기본 플래너의 `DEFAULT_PART_LAYOUT`과 같다).
 * 5. morph 타깃을 이름으로 모으고(같은 이름이 몸·머리·의상에 있으면 한 이름이 전부 구동), 체형 관절 오프셋 포트를 연결한다.
 * 6. 파츠가 선언한 영역을 `TS_Body`에서 숨긴다(`kit-region-mask.ts`).
 *
 * 증분 교체(계약 4.11): `KitRigHandle.update(plan)`은 같은 키트·베이스에서 바뀐 파츠만 받아 합치고 빠진 파츠만 해제한다.
 * 어떤 단계든 실패하면 키트 전체를 해제하고 `RigBindError`를 던진다 — 반쯤 바뀐 리그를 남기지 않는다(무음 대체 금지).
 *
 * 한 호출자가 `update`·`dispose`를 직렬로 부른다고 가정한다(엔진의 `runExclusive`). 스킨 메시 노드는 항등 변환이어야 하고 장면은 우수 좌표계여야 한다.
 */
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

import {
  KIT_ALLOWED_EXTENSIONS,
  KIT_BODY_NODE,
  KIT_BUDGET,
  KIT_FORBIDDEN_EXTENSIONS,
  OUTLINE_MESH_SUFFIX,
  PART_ROLES,
  allocatePartIdsByRole,
  failVisible,
  parseAuthoredHairMeshName,
  rolePartId,
} from "../../contracts";
import { sha256Hex } from "../../shared/hash";
import { regionRangeProblems, unionHiddenRegions } from "../kit-region-mask";
import { ROLE_DEFAULT_PRESET, resolvePartColorHex } from "../material-presets";

import { createJointOffsetRig } from "./joint-offset-rig";
import { applyBodyMask } from "./kit-region-mask";
import { buildJointIndexRemap, buildRigBones, describeJointDiff, diffJoints, isIdentityMatrix, jointsCompatible, listSkeletonJoints, rebindMeshes, skinProblem } from "./kit-skeleton-bind";
import { RigBindError, rigMeshMetadata } from "./mesh-binding";
import { chooseHairLod } from "./package-loader";

import type { CharacterRig, RigBone, RigMaterialHooks, RigPart } from "./character-rig";
import type { JointOffsetRig } from "./joint-offset-rig";
import type { BodyMaskReport } from "./kit-region-mask";
import type { HumanoidBoneName, KitHideableRegionId, KitMesh, KitPartPlan, KitPlan, MorphJointOffsets, PartIdPalette, PartRole, RecipeColorKey, SlotCapabilityMap } from "../../contracts";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { MorphTarget } from "@babylonjs/core/Morph/morphTarget.js";
import type { Node } from "@babylonjs/core/node.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 파일 내려받기 병렬도(계약 4.2) */
export const KIT_FETCH_PARALLELISM = 4;

/** `RigPart.tint`(계약 4.9)와 같은 모양. recolor는 레시피 색을 알베도 텍스처에 곱하고, fixed는 항상 이 색이다. */
export type KitPartTint = { readonly mode: "recolor" } | { readonly mode: "fixed"; readonly hex: string };

export interface KitRigPart extends RigPart {
  readonly tint: KitPartTint;
}

/**
 * 키트 리그. `CharacterRig`에서 `kind`(`"kit"`)와 `parts`(틴트를 가진 파츠)만 좁힌 것이다 — 엔진 통합(KT-04)이
 * `CharacterRig.kind`를 `"kit"`까지 넓히면 그대로 `CharacterRig`에 대입된다. 컬렉션(parts·partById·morphs·morphNames·notes)은
 * 증분 교체 때 같은 객체를 제자리에서 갱신하므로 한 번 잡은 참조가 계속 유효하다.
 */
export interface KitRig extends Omit<CharacterRig, "kind" | "parts"> {
  readonly kind: "kit";
  readonly parts: readonly KitRigPart[];
}

export interface KitLoadDeps {
  readonly scene: Scene;
  /** GLB 바이트 로더(엔진이 바이트 캐시를 붙여 준다) */
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  /** 로더 재질을 역할에 맞게 보강(또는 교체) */
  readonly adaptMaterial: (role: PartRole, mesh: Mesh) => PBRMaterial;
  readonly materials: RigMaterialHooks;
  /** 바이트 수·SHA-256 검증(기본 true) */
  readonly verifyIntegrity?: boolean;
  /** 결정적 시각(epoch ms). 생략하면 호출 시점의 `Date.now()` */
  readonly now?: number;
  readonly parallelism?: number;
}

export interface KitUpdateReport {
  /** 이번에 새로 올린 파츠의 플랜 id(프리셋 id) */
  readonly addedPartIds: readonly string[];
  /** 이번에 해제한 파츠의 플랜 id */
  readonly removedPartIds: readonly string[];
  /** 새로 만든 리그 파츠 — 엔진이 그림자 캐스터·페인트·베타 재질을 다시 붙인다 */
  readonly addedRigParts: readonly KitRigPart[];
  /** 해제된 리그 파츠(이미 해제됨, 엔진이 자기 쪽 참조를 정리할 때만 쓴다) */
  readonly removedRigParts: readonly KitRigPart[];
  /** 새 타깃은 influence 0으로 시작한다 — 엔진이 마지막 플랜을 다시 적용해야 한다 */
  readonly needsPlanReapply: boolean;
  readonly bodyMask: BodyMaskReport | null;
}

export interface KitRigHandle {
  readonly rig: KitRig;
  /** 지금 올라가 있는 파츠의 플랜 id(베이스 포함) */
  loadedPartIds(): readonly string[];
  /** 같은 키트·베이스·베이스 파일이라 증분 교체할 수 있는지 */
  compatible(plan: KitPlan): boolean;
  /** 바뀐 파츠만 교체한다. 실패하면 키트 전체를 해제하고 던진다. */
  update(plan: KitPlan): Promise<KitUpdateReport>;
  dispose(): void;
}

// ---------------------------------------------------------------- 내부 타입

interface MatchedMesh {
  readonly mesh: Mesh;
  readonly declared: KitMesh;
  readonly role: PartRole;
  readonly materialName: string;
  readonly declaredMorphs: ReadonlySet<string>;
  readonly lod: number | null;
}

interface RoleGroup {
  readonly role: PartRole;
  readonly materialName: string;
  readonly meshes: Mesh[];
  readonly declaredMorphs: ReadonlySet<string>;
}

interface OpenedFile {
  readonly plan: KitPartPlan;
  readonly key: string;
  readonly container: AssetContainer;
  readonly groups: readonly RoleGroup[];
  readonly notes: readonly string[];
  /** 베이스만: 스켈레톤 */
  readonly skeleton: Skeleton | null;
}

interface LoadedFile {
  readonly plan: KitPartPlan;
  readonly key: string;
  readonly container: AssetContainer;
  readonly rigParts: KitRigPart[];
  readonly morphs: Array<{ readonly name: string; readonly target: MorphTarget }>;
  readonly extraMaterials: PBRMaterial[];
  readonly notes: readonly string[];
}

const PRIMITIVE_PATTERN = /^(.*)_primitive(\d+)$/u;

function fail(code: string, reasonKo: string, detail: unknown, now: number): RigBindError {
  return new RigBindError(failVisible(code, reasonKo, detail, now));
}

function listFew(items: readonly string[], limit = 5): string {
  return items.length <= limit ? items.join(", ") : `${items.slice(0, limit).join(", ")} 외 ${items.length - limit}개`;
}

interface GlbNodeInfo {
  readonly name: string;
  readonly skinned: boolean;
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly matrix?: readonly number[];
}

interface GlbInfo {
  readonly used: readonly string[];
  readonly required: readonly string[];
  readonly nodes: readonly GlbNodeInfo[];
}

/**
 * GLB JSON 청크에서 확장 목록과 노드 변환을 읽는다(형식이 틀리면 null — Babylon 로더가 `kit-glb-load-failed`로 알린다).
 * 스킨 메시 노드의 변환은 glTF 규약상 무시되어 Babylon 월드 행렬에 나타나지 않으므로 JSON에서 직접 확인한다.
 */
function readGlbInfo(bytes: Uint8Array): GlbInfo | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) return null;
  const length = view.getUint32(12, true);
  if (20 + length > bytes.byteLength) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { extensionsUsed?: unknown; extensionsRequired?: unknown; nodes?: unknown };
    const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
    const numbers = (value: unknown): number[] | undefined => (Array.isArray(value) && value.every((item) => typeof item === "number") ? (value as number[]) : undefined);
    const nodes: GlbNodeInfo[] = [];
    if (Array.isArray(json.nodes)) {
      for (const raw of json.nodes as Array<Record<string, unknown>>) {
        const translation = numbers(raw.translation);
        const rotation = numbers(raw.rotation);
        const scale = numbers(raw.scale);
        const matrix = numbers(raw.matrix);
        nodes.push({
          name: typeof raw.name === "string" ? raw.name : "",
          skinned: raw.mesh !== undefined && raw.skin !== undefined,
          ...(translation ? { translation } : {}),
          ...(rotation ? { rotation } : {}),
          ...(scale ? { scale } : {}),
          ...(matrix ? { matrix } : {}),
        });
      }
    }
    return { used: strings(json.extensionsUsed), required: strings(json.extensionsRequired), nodes };
  } catch {
    return null;
  }
}

const NODE_EPSILON = 1e-6;

/** glTF 노드의 TRS/행렬이 항등인지 */
function identityNode(node: GlbNodeInfo): boolean {
  const near = (values: readonly number[] | undefined, expected: readonly number[]): boolean => values === undefined || expected.every((value, index) => Math.abs((values[index] ?? Number.NaN) - value) <= NODE_EPSILON);
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return near(node.translation, [0, 0, 0]) && near(node.rotation, [0, 0, 0, 1]) && near(node.scale, [1, 1, 1]) && near(node.matrix, matrix);
}

/** 작업을 최대 `limit`개씩 동시에 돌린다. 하나가 실패하면 아직 시작하지 않은 항목은 시작하지 않고 첫 실패를 던진다. */
async function mapWithLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (!failed) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await work(items[index] as T);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function meshRoles(mesh: KitMesh): readonly PartRole[] {
  return mesh.role !== undefined ? [mesh.role] : (mesh.primitiveRoles ?? []);
}

function meshMaterialNames(mesh: KitMesh): readonly string[] {
  return mesh.material !== undefined ? [mesh.material] : (mesh.primitiveMaterials ?? []);
}

/** 컨테이너에서 이미 해제된 항목을 배열에서 뺀다(나중의 `container.dispose()`가 이중 해제하지 않도록). */
function pruneDisposed(container: AssetContainer): void {
  const keep = <T extends { isDisposed(): boolean }>(items: T[]): void => {
    for (let i = items.length - 1; i >= 0; i -= 1) if (items[i]?.isDisposed()) items.splice(i, 1);
  };
  keep(container.meshes);
  keep(container.transformNodes);
  keep(container.rootNodes);
}

// ---------------------------------------------------------------- 어셈블러

interface RigState {
  baseSkeleton: Skeleton | null;
  palette: PartIdPalette;
  capabilities: SlotCapabilityMap;
  jointOffsets: JointOffsetRig | null;
}

class KitAssembler implements KitRigHandle {
  readonly rig: KitRig;
  private plan: KitPlan;
  private readonly deps: KitLoadDeps;
  private readonly root: TransformNode;
  private readonly state: RigState;
  private readonly files = new Map<string, LoadedFile>();
  private baseKey = "";
  private baseJointNames: readonly string[] = [];
  private baseNotes: string[] = [];
  private readonly globalNotes = new Set<string>();
  private lastBodyMask: BodyMaskReport | null = null;
  private disposed = false;

  // 리그가 노출하는 컬렉션(증분 교체 때 같은 객체를 제자리에서 갱신한다)
  private readonly partList: KitRigPart[] = [];
  private readonly partIdMap = new Map<number, KitRigPart>();
  private readonly partByRole = new Map<PartRole, KitRigPart>();
  private readonly morphMap = new Map<string, MorphTarget[]>();
  private readonly morphNameList: string[] = [];
  private readonly noteList: string[] = [];
  private readonly boneMap = new Map<string, RigBone>();
  private readonly humanoidMap = new Map<HumanoidBoneName, RigBone>();

  constructor(plan: KitPlan, deps: KitLoadDeps) {
    this.plan = plan;
    this.deps = deps;
    this.root = new TransformNode("character-root", deps.scene);
    const state: RigState = { baseSkeleton: null, palette: {}, capabilities: plan.capabilities, jointOffsets: null };
    this.state = state;
    this.rig = {
      kind: "kit",
      root: this.root,
      parts: this.partList,
      partById: this.partIdMap,
      get skeleton() {
        return state.baseSkeleton;
      },
      bones: this.boneMap,
      humanoid: this.humanoidMap,
      morphs: this.morphMap,
      morphNames: this.morphNameList,
      chains: [],
      colliders: [],
      get partIdPalette() {
        return state.palette;
      },
      get capabilities() {
        return state.capabilities;
      },
      poseConvention: "model-space",
      notes: this.noteList,
      materials: deps.materials,
      get jointOffsets() {
        return state.jointOffsets;
      },
      dispose: () => this.dispose(),
    };
  }

  private get now(): number {
    return this.deps.now ?? Date.now();
  }

  loadedPartIds(): readonly string[] {
    return [...this.files.values()].map((file) => file.plan.id);
  }

  // ---- 최초 로드

  async loadAll(): Promise<void> {
    const { plan } = this;
    const opened: OpenedFile[] = [];
    try {
      const base = plan.parts[0];
      if (!base || base.kind !== "base") throw fail("kit-base-missing", "키트 플랜의 첫 항목이 베이스가 아닙니다.", undefined, this.now);
      if (!this.deps.scene.useRightHandedSystem) {
        throw fail("kit-glb-load-failed", "장면이 우수 좌표계가 아니라 키트 GLB(우수 좌표계, +Z 정면)를 변환 없이 올릴 수 없습니다.", undefined, this.now);
      }
      const bytes = await this.fetchAll(plan.parts);
      this.assertAlive();
      for (const part of plan.parts) opened.push(await this.open(part, bytes.get(part.id) as Uint8Array, plan));
      this.assertAlive();
      this.adoptBase(opened[0] as OpenedFile, plan);
      for (const file of opened) this.attach(file, plan);
      this.refresh(plan);
    } catch (error) {
      this.releaseUnattached(opened);
      this.dispose();
      throw error;
    }
  }

  // ---- 증분 교체

  compatible(plan: KitPlan): boolean {
    const base = plan.parts[0];
    const current = this.files.get(this.baseKey);
    return !this.disposed && base?.kind === "base" && current !== undefined && plan.kitId === this.plan.kitId && plan.kitVersion === this.plan.kitVersion && plan.baseId === this.plan.baseId && base.sha256 === current.plan.sha256;
  }

  async update(plan: KitPlan): Promise<KitUpdateReport> {
    this.assertAlive();
    if (!this.compatible(plan)) {
      throw fail("kit-version-mismatch", "키트·베이스·베이스 파일이 달라 증분 교체할 수 없습니다. 키트를 처음부터 다시 불러오세요.", `${plan.kitId}@${plan.kitVersion}/${plan.baseId}`, this.now);
    }
    const opened: OpenedFile[] = [];
    try {
      const desired = plan.parts.filter((part) => part.kind === "part");
      const wantedKeys = new Map(desired.map((part) => [part.id, this.keyOf(part, plan)] as const));
      const removedIds = [...this.files.entries()].filter(([id, file]) => id !== this.baseKey && wantedKeys.get(id) !== file.key).map(([id]) => id);
      const addedParts = desired.filter((part) => this.files.get(part.id)?.key !== wantedKeys.get(part.id));
      const bytes = await this.fetchAll(addedParts);
      this.assertAlive();
      for (const part of addedParts) opened.push(await this.open(part, bytes.get(part.id) as Uint8Array, plan));
      this.assertAlive();
      // ---- 여기부터는 동기 구간이다(열린 파일이 모두 검증됐다): 해제 → 합치기 → 파생 상태 갱신
      const removedRigParts: KitRigPart[] = [];
      for (const id of removedIds) {
        const file = this.files.get(id);
        if (file) removedRigParts.push(...this.detach(file));
      }
      const addedRigParts: KitRigPart[] = [];
      for (const file of opened) addedRigParts.push(...this.attach(file, plan));
      this.refresh(plan);
      return {
        addedPartIds: opened.map((file) => file.plan.id),
        removedPartIds: removedIds,
        addedRigParts,
        removedRigParts,
        needsPlanReapply: addedRigParts.length > 0,
        bodyMask: this.lastBodyMask,
      };
    } catch (error) {
      this.releaseUnattached(opened);
      this.dispose();
      throw error;
    }
  }

  /** 열렸지만 리그에 합치지 못한 컨테이너를 해제한다(이미 합쳐진 파일은 `dispose()`가 해제한다). */
  private releaseUnattached(opened: readonly OpenedFile[]): void {
    for (const file of opened) if (this.files.get(file.plan.id)?.container !== file.container) file.container.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const file of [...this.files.values()].reverse()) this.releaseFile(file);
    this.files.clear();
    this.partList.length = 0;
    this.partIdMap.clear();
    this.partByRole.clear();
    this.morphMap.clear();
    this.morphNameList.length = 0;
    this.boneMap.clear();
    this.humanoidMap.clear();
    this.state.jointOffsets = null;
    this.state.baseSkeleton = null;
    this.root.dispose(false, false);
  }

  private assertAlive(): void {
    if (this.disposed) throw fail("engine-disposed", "키트를 올리는 도중 리그가 해제됐습니다. 엔진을 다시 확인하세요.", undefined, this.now);
  }

  private keyOf(part: KitPartPlan, plan: KitPlan): string {
    const hasLod = part.meshes.some((mesh) => mesh.lod !== undefined);
    return hasLod ? `${part.sha256}|lod=${plan.hairLodPolicy.preferredLod}` : part.sha256;
  }

  // ---- 받기

  private async fetchAll(parts: readonly KitPartPlan[]): Promise<Map<string, Uint8Array>> {
    const verify = this.deps.verifyIntegrity ?? true;
    const limit = this.deps.parallelism ?? KIT_FETCH_PARALLELISM;
    const results = await mapWithLimit(parts, limit, async (part) => {
      let bytes: Uint8Array;
      try {
        bytes = await this.deps.fetchBytes(part.url);
      } catch (error) {
        throw fail("kit-file-fetch-failed", `키트 파일을 받지 못했습니다: ${part.url}`, error, this.now);
      }
      if (verify) {
        if (bytes.byteLength !== part.bytes) {
          throw fail("kit-bytes-mismatch", `키트 파일의 크기가 플랜과 다릅니다(${bytes.byteLength} B ≠ ${part.bytes} B): ${part.url}. 파일이 바뀌었거나 일부만 받았습니다.`, undefined, this.now);
        }
        const digest = await sha256Hex(bytes);
        if (digest !== part.sha256) {
          throw fail("kit-sha-mismatch", `키트 파일의 SHA-256이 플랜과 다릅니다(${digest.slice(0, 8)}… ≠ ${part.sha256.slice(0, 8)}…): ${part.url}. 파일이 바뀌었거나 손상됐습니다.`, undefined, this.now);
        }
      }
      return [part.id, bytes] as const;
    });
    return new Map(results);
  }

  // ---- 열기(검증 + 재바인딩, 리그는 건드리지 않는다)

  private async open(part: KitPartPlan, bytes: Uint8Array, plan: KitPlan): Promise<OpenedFile> {
    const now = this.now;
    const isBase = part.kind === "base";
    this.checkGlbJson(part, bytes);
    let container: AssetContainer;
    try {
      container = await LoadAssetContainerAsync(bytes, this.deps.scene, {
        pluginExtension: ".glb",
        pluginOptions: {
          gltf: {
            // GLTFLoaderAnimationStartMode.NONE = 0. `@babylonjs/loaders` import는 side-effect 한 곳과 package-loader로 제한돼(import 정책 테스트) 값을 그대로 쓴다.
            animationStartMode: 0,
            loadNodeAnimations: false,
            compileMaterials: false,
            createInstances: false,
            alwaysComputeBoundingBox: true,
            useSRGBBuffers: true,
          },
        },
      });
    } catch (error) {
      throw fail("kit-glb-load-failed", `키트 GLB를 Babylon 로더로 열지 못했습니다: ${part.url}`, error, now);
    }
    try {
      // 로드를 기다리는 동안 리그가 해제됐을 수 있다 — 해제된 리그에는 아무것도 붙이지 않는다.
      this.assertAlive();
      container.addAllToScene();
      return this.inspect(part, container, isBase, plan);
    } catch (error) {
      container.dispose();
      throw error;
    }
  }

  /** GLB JSON만으로 가려낼 수 있는 위반: 금지·미지원 확장, 항등이 아닌 스킨 메시 노드 변환 */
  private checkGlbJson(part: KitPartPlan, bytes: Uint8Array): void {
    const info = readGlbInfo(bytes);
    if (!info) return;
    const forbidden: readonly string[] = KIT_FORBIDDEN_EXTENSIONS;
    const allowed: readonly string[] = KIT_ALLOWED_EXTENSIONS;
    const bad = [...new Set([...info.used, ...info.required])].filter((name) => forbidden.includes(name));
    const unsupported = info.required.filter((name) => !allowed.includes(name));
    const offenders = [...new Set([...bad, ...unsupported])];
    if (offenders.length > 0) {
      throw fail("kit-unsupported-extension", `키트 GLB가 허용되지 않은 glTF 확장을 씁니다: ${offenders.join(", ")} (${part.url}). 압축·외부 디코더 확장은 키트에서 금지입니다.`, undefined, this.now);
    }
    const moved = info.nodes.filter((node) => node.skinned && !identityNode(node)).map((node) => node.name);
    if (moved.length > 0) {
      throw fail("kit-transform-invalid", `키트 GLB의 스킨 메시 노드 변환이 항등이 아닙니다: ${listFew(moved)} (${part.url}). 스킨 메시 노드는 이동·회전 0, 스케일 1이어야 합니다.`, undefined, this.now);
    }
  }

  private inspect(part: KitPartPlan, container: AssetContainer, isBase: boolean, plan: KitPlan): OpenedFile {
    const now = this.now;
    const notes: string[] = [];
    const label = isBase ? `베이스(${part.url})` : `파츠 ${part.id}`;

    // ---- 스켈레톤 호환
    if (container.skeletons.length === 0) throw fail("kit-skin-invalid", `${label}에 스켈레톤(skin)이 없습니다. 키트의 모든 GLB는 68 joint 스켈레톤을 싣습니다.`, undefined, now);
    if (container.skeletons.length > 1) throw fail("kit-joint-mismatch", `${label}에 스켈레톤이 ${container.skeletons.length}개입니다. 키트는 GLB마다 skin 하나입니다.`, undefined, now);
    const skeleton = container.skeletons[0] as Skeleton;
    const joints = listSkeletonJoints(skeleton);
    const reference = isBase ? plan.skeleton.joints : this.baseJointNames;
    const diff = diffJoints(reference, plan.skeleton.parents, joints);
    if (!jointsCompatible(diff)) {
      throw fail("kit-joint-mismatch", `${label}의 joint가 ${isBase ? "키트 manifest" : "베이스"}와 다릅니다: ${describeJointDiff(diff)}`, undefined, now);
    }
    if (joints.length !== KIT_BUDGET.jointCount) {
      throw fail("kit-joint-mismatch", `${label}의 joint가 ${joints.length}개입니다(정확히 ${KIT_BUDGET.jointCount}개여야 합니다).`, undefined, now);
    }
    let remap: Uint16Array | null = null;
    if (!diff.sameOrder) {
      if (isBase) {
        notes.push(`${label}의 joint 순서가 manifest와 다릅니다(이름·부모는 같아 그대로 쓰고, 파츠는 이 순서를 기준으로 맞춥니다).`);
      } else {
        remap = buildJointIndexRemap(reference, joints);
        notes.push(`${label}의 joint 순서가 베이스와 달라 JOINTS 인덱스를 다시 매핑했습니다(키트 빌더는 순서를 같게 내보내야 합니다).`);
      }
    }

    // ---- 메시 선언 대조
    const matched = this.matchMeshes(part, container);
    const boneNodes = new Set<Node>();
    const skeletonNodes = new Set<Node>();
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode();
      if (node) boneNodes.add(node);
      for (let cursor: Node | null = node; cursor; cursor = cursor.parent) skeletonNodes.add(cursor);
    }
    // Armature·`__root__`처럼 본이 아닌 조상은 항등 변환이어야 한다(본 노드는 평행이동을 가진다).
    for (const node of skeletonNodes) {
      if (boneNodes.has(node) || !(node instanceof TransformNode)) continue;
      node.computeWorldMatrix(true);
      if (!isIdentityMatrix(node.getWorldMatrix().asArray())) {
        throw fail("kit-transform-invalid", `${label}의 스켈레톤 루트 노드 '${node.name}'(Armature 포함)의 변환이 항등이 아닙니다. 루트 스케일 1·회전 0이어야 합니다.`, undefined, now);
      }
    }
    for (const item of matched) {
      item.mesh.computeWorldMatrix(true);
      if (!isIdentityMatrix(item.mesh.getWorldMatrix().asArray())) {
        throw fail("kit-transform-invalid", `${label}의 메시 '${item.mesh.name}' 월드 변환이 항등이 아닙니다. 스킨 메시 노드는 항등 변환이어야 합니다.`, undefined, now);
      }
      const problem = skinProblem(item.mesh, KIT_BUDGET.jointCount, KIT_BUDGET.weightSumTolerance);
      if (problem) throw fail("kit-skin-invalid", `${label}의 메시 '${item.mesh.name}': ${problem}`, undefined, now);
      this.checkMorphs(label, item);
      const actualMaterial = item.mesh.material?.name;
      if (actualMaterial !== item.materialName) {
        throw fail("kit-mesh-undeclared", `${label}의 메시 '${item.mesh.name}' 재질이 선언('${item.materialName}')과 다릅니다(GLB: '${actualMaterial ?? "없음"}').`, undefined, now);
      }
    }
    // 한 역할에는 재질 하나(역할 파츠 전체에 재질 하나를 덮어쓰므로)
    const materialOfRole = new Map<PartRole, string>();
    for (const item of matched) {
      const previous = materialOfRole.get(item.role);
      if (previous !== undefined && previous !== item.materialName) {
        throw fail("kit-material-multiple", `${label}의 역할 ${item.role}에 재질이 둘 이상입니다('${previous}', '${item.materialName}'). 한 역할은 재질 하나만 씁니다.`, undefined, now);
      }
      materialOfRole.set(item.role, item.materialName);
    }

    // ---- 베이스: 영역 범위가 몸 인덱스 버퍼를 분할하는지
    if (isBase) {
      const body = matched.find((item) => item.declared.node === KIT_BODY_NODE);
      if (body) {
        const problems = regionRangeProblems(plan.bodyRegions, KIT_BODY_NODE, body.mesh.getTotalIndices());
        if (problems.length > 0) {
          throw fail("kit-region-range-invalid", `몸 영역 범위(bodyRegions)가 ${KIT_BODY_NODE}의 인덱스 버퍼를 분할하지 않습니다: ${problems.slice(0, 3).join(" ")}`, problems.join("\n"), now);
        }
      }
    }

    // ---- 헤어 LOD: 선택 LOD만 남기고 나머지 메시는 즉시 해제
    const lods = matched.flatMap((item) => (item.lod !== null ? [item.lod] : []));
    const chosenLod = chooseHairLod(lods, plan.hairLodPolicy.preferredLod);
    const kept: MatchedMesh[] = [];
    for (const item of matched) {
      if (item.lod !== null && item.lod !== chosenLod) {
        item.mesh.dispose(false, false);
        continue;
      }
      kept.push(item);
    }
    const keptMeshes = kept.map((item) => item.mesh);

    // ---- 바인딩 / 부모 정리
    if (isBase) {
      for (const node of container.rootNodes) if (node instanceof TransformNode) node.parent = this.root;
      this.state.baseSkeleton = skeleton;
      this.baseJointNames = joints.map((joint) => joint.name);
      skeleton.useTextureToStoreBoneMatrices = true;
    } else {
      const baseSkeleton = this.state.baseSkeleton;
      if (!baseSkeleton) throw fail("kit-base-missing", "베이스가 올라오기 전에 파츠를 열었습니다.", undefined, now);
      rebindMeshes(keptMeshes, baseSkeleton, remap);
      this.reparentUnits(keptMeshes, skeletonNodes);
      for (const rootNode of container.rootNodes) rootNode.dispose(false, false);
      skeleton.dispose();
      container.skeletons.length = 0;
      container.rootNodes.length = 0;
    }
    pruneDisposed(container);

    const groups = this.groupByRole(kept);
    return { plan: part, key: this.keyOf(part, plan), container, groups, notes, skeleton: isBase ? skeleton : null };
  }

  /**
   * 메시(또는 다중 프리미티브의 부모 노드)를 리그 루트 아래로 옮긴다. 스켈레톤 노드 트리(Armature·본)의 하위가 아닌 가장 위 노드가 이동 단위다.
   * 모든 메시의 월드 변환이 항등임을 확인한 뒤라 월드 위치가 바뀌지 않는다.
   */
  private reparentUnits(meshes: readonly Mesh[], skeletonNodes: ReadonlySet<Node>): void {
    for (const mesh of meshes) {
      let unit: Node = mesh;
      while (unit.parent && !skeletonNodes.has(unit.parent)) unit = unit.parent;
      if (unit instanceof TransformNode) unit.parent = this.root;
    }
  }

  private matchMeshes(part: KitPartPlan, container: AssetContainer): MatchedMesh[] {
    const now = this.now;
    const label = part.kind === "base" ? "베이스" : `파츠 ${part.id}`;
    const actual = container.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0);
    const declaredByNode = new Map(part.meshes.map((mesh) => [mesh.node, mesh] as const));
    const byNode = new Map<string, Array<{ readonly mesh: Mesh; readonly primitive: number | null }>>();
    for (const mesh of actual) {
      const split = PRIMITIVE_PATTERN.exec(mesh.name);
      const node = split ? (split[1] as string) : mesh.name;
      if (node.endsWith(OUTLINE_MESH_SUFFIX)) {
        throw fail("kit-outline-shell-forbidden", `${label}에 '${OUTLINE_MESH_SUFFIX}' 셸 메시('${mesh.name}')가 있습니다. 키트 v1은 엔진 hull 외곽선만 쓰므로 외곽선 셸을 싣지 않습니다.`, undefined, now);
      }
      const list = byNode.get(node) ?? [];
      list.push({ mesh, primitive: split ? Number(split[2]) : null });
      byNode.set(node, list);
    }
    const undeclared = [...byNode.keys()].filter((node) => !declaredByNode.has(node));
    if (undeclared.length > 0) {
      throw fail("kit-mesh-undeclared", `${label}의 GLB에 플랜에 선언되지 않은 메시가 있습니다: ${listFew(undeclared)}. 규약 밖 메시를 조용히 숨기지 않고 로드를 중단합니다.`, undefined, now);
    }
    const out: MatchedMesh[] = [];
    for (const declared of part.meshes) {
      const found = byNode.get(declared.node) ?? [];
      const roles = meshRoles(declared);
      const materialNames = meshMaterialNames(declared);
      const hair = parseAuthoredHairMeshName(declared.node);
      const lod = declared.lod ?? hair?.lod ?? null;
      const declaredMorphs = new Set(declared.morphs);
      if (declared.primitiveRoles !== undefined) {
        const expected = declared.primitiveRoles.length;
        const present = found.map((entry) => entry.primitive).filter((value): value is number => value !== null);
        const missing = Array.from({ length: expected }, (_unused, index) => index).filter((index) => !present.includes(index));
        if (found.length < expected || missing.length > 0) {
          throw fail("kit-mesh-missing", `${label}의 메시 '${declared.node}'에서 프리미티브 ${missing.join(", ")}번이 없습니다(선언 ${expected}개).`, undefined, now);
        }
        if (found.length > expected || found.some((entry) => entry.primitive === null)) {
          throw fail("kit-mesh-undeclared", `${label}의 메시 '${declared.node}' 프리미티브 수(${found.length})가 선언(${expected}개)과 다릅니다.`, undefined, now);
        }
        for (const entry of found) {
          const index = entry.primitive as number;
          out.push({ mesh: entry.mesh, declared, role: roles[index] as PartRole, materialName: materialNames[index] as string, declaredMorphs, lod });
        }
      } else {
        if (found.length === 0) throw fail("kit-mesh-missing", `${label}의 GLB에 선언된 메시 '${declared.node}'가 없습니다.`, undefined, now);
        if (found.length > 1 || found[0]?.primitive !== null) {
          throw fail("kit-mesh-undeclared", `${label}의 메시 '${declared.node}'가 프리미티브 ${found.length}개로 나뉘었지만 단일 메시로 선언됐습니다(primitiveRoles로 선언해야 합니다).`, undefined, now);
        }
        out.push({ mesh: (found[0] as { mesh: Mesh }).mesh, declared, role: roles[0] as PartRole, materialName: materialNames[0] as string, declaredMorphs, lod });
      }
    }
    return out;
  }

  private checkMorphs(label: string, item: MatchedMesh): void {
    const manager = item.mesh.morphTargetManager;
    const present = new Set<string>();
    for (let i = 0; manager && i < manager.numTargets; i += 1) present.add(manager.getTarget(i).name);
    const missing = [...item.declaredMorphs].filter((name) => !present.has(name));
    if (missing.length > 0) {
      throw fail("kit-morph-missing", `${label}의 메시 '${item.mesh.name}'에 선언된 morph ${missing.length}개가 GLB에 없습니다: ${listFew(missing)}.`, undefined, this.now);
    }
  }

  private groupByRole(items: readonly MatchedMesh[]): RoleGroup[] {
    const groups = new Map<PartRole, RoleGroup>();
    for (const item of items) {
      const group = groups.get(item.role);
      if (group) {
        group.meshes.push(item.mesh);
        for (const name of item.declaredMorphs) (group.declaredMorphs as Set<string>).add(name);
      } else {
        groups.set(item.role, { role: item.role, materialName: item.materialName, meshes: [item.mesh], declaredMorphs: new Set(item.declaredMorphs) });
      }
    }
    return [...groups.values()].sort((a, b) => rolePartId(a.role) - rolePartId(b.role));
  }

  // ---- 리그에 합치기 / 떼기

  private adoptBase(file: OpenedFile, plan: KitPlan): void {
    const skeleton = file.skeleton;
    if (!skeleton) return;
    const built = buildRigBones(skeleton, plan.skeleton.boneMap);
    for (const [name, bone] of built.bones) this.boneMap.set(name, bone);
    for (const [name, bone] of built.humanoid) this.humanoidMap.set(name, bone);
    this.baseKey = file.plan.id;
    this.baseNotes = built.skippedBones.map((name) => `본 '${name}'에 링크된 TransformNode가 없어 포즈를 적용할 수 없습니다.`);
    this.state.jointOffsets = createJointOffsetRig({
      table: plan.jointOffsets as MorphJointOffsets,
      bones: this.boneMap,
      skeleton,
      morphAvailable: (name) => (this.morphMap.get(name)?.length ?? 0) > 0,
    });
  }

  private attach(file: OpenedFile, plan: KitPlan): KitRigPart[] {
    const now = this.now;
    const rigParts: KitRigPart[] = [];
    const morphs: Array<{ readonly name: string; readonly target: MorphTarget }> = [];
    const extraMaterials: PBRMaterial[] = [];
    const notes = [...file.notes];
    const loaded: LoadedFile = { plan: file.plan, key: file.key, container: file.container, rigParts, morphs, extraMaterials, notes };
    try {
      for (const group of file.groups) {
        const owner = this.partByRole.get(group.role);
        if (owner) throw fail("kit-mesh-undeclared", `역할 ${group.role}이(가) 두 파일에 중복되었습니다(${owner.id}가 이미 있고 ${file.plan.id}도 선언).`, undefined, now);
        const material = plan.materials[group.materialName];
        if (!material) throw fail("kit-manifest-invalid", `재질 '${group.materialName}'이 키트 재질 선언(materials)에 없습니다.`, undefined, now);
        const first = group.meshes[0] as Mesh;
        const original = first.material;
        const pbr = this.deps.adaptMaterial(group.role, first);
        if (original !== pbr) extraMaterials.push(pbr);
        const partId = rolePartId(group.role);
        const materialId = Math.min(255, PART_ROLES.indexOf(group.role));
        for (const mesh of group.meshes) {
          mesh.material = pbr;
          mesh.metadata = rigMeshMetadata(partId, group.role, materialId, false);
          mesh.receiveShadows = true;
          const manager = mesh.morphTargetManager;
          if (!manager) continue;
          manager.useTextureToStoreTargets = true;
          const unknown: string[] = [];
          for (let i = 0; i < manager.numTargets; i += 1) {
            const target = manager.getTarget(i);
            if (group.declaredMorphs.has(target.name)) morphs.push({ name: target.name, target });
            else unknown.push(target.name);
          }
          if (unknown.length > 0) notes.push(`메시 '${mesh.name}'의 선언되지 않은 morph ${unknown.length}개(${listFew(unknown, 3)})는 구동하지 않습니다.`);
        }
        const materialPreset = ROLE_DEFAULT_PRESET[group.role];
        const tint: KitPartTint = material.tint.mode === "fixed" ? { mode: "fixed", hex: material.tint.hex } : { mode: "recolor" };
        const colorKey: RecipeColorKey | undefined = material.tint.mode === "recolor" ? material.tint.colorKey : undefined;
        const part: KitRigPart = {
          id: group.role,
          partId,
          materialId,
          role: group.role,
          materialPreset,
          ...(colorKey !== undefined ? { colorKey } : {}),
          meshes: group.meshes,
          outlineMeshes: [],
          pbr,
          hasAlbedoTexture: pbr.albedoTexture !== null,
          toon: null,
          colorHex: tint.mode === "fixed" ? tint.hex : resolvePartColorHex({ materialPreset, ...(colorKey !== undefined ? { colorKey } : {}) }, null),
          visible: true,
          forceHidden: false,
          tint,
        };
        rigParts.push(part);
      }
    } catch (error) {
      file.container.dispose();
      for (const pbr of extraMaterials) pbr.dispose();
      throw error;
    }
    this.files.set(file.plan.id, loaded);
    for (const part of rigParts) {
      this.partByRole.set(part.role, part);
      this.partIdMap.set(part.partId, part);
    }
    for (const { name, target } of morphs) {
      const list = this.morphMap.get(name) ?? [];
      list.push(target);
      this.morphMap.set(name, list);
    }
    return rigParts;
  }

  private detach(file: LoadedFile): KitRigPart[] {
    this.files.delete(file.plan.id);
    for (const part of file.rigParts) {
      if (this.partByRole.get(part.role) === part) this.partByRole.delete(part.role);
      if (this.partIdMap.get(part.partId) === part) this.partIdMap.delete(part.partId);
    }
    for (const { name, target } of file.morphs) {
      const list = this.morphMap.get(name);
      if (!list) continue;
      const next = list.filter((candidate) => candidate !== target);
      if (next.length > 0) this.morphMap.set(name, next);
      else this.morphMap.delete(name);
    }
    this.releaseFile(file);
    return file.rigParts;
  }

  private releaseFile(file: LoadedFile): void {
    // 툰 재질의 공유 텍스처는 엔진 소유 — 재질만 해제한다. 알베도 텍스처는 container.dispose()가 정리한다.
    for (const part of file.rigParts) {
      part.toon?.dispose(true, false);
      part.toon = null;
    }
    for (const pbr of file.extraMaterials) pbr.dispose();
    file.container.dispose();
  }

  // ---- 파생 상태

  private refresh(plan: KitPlan): void {
    this.plan = plan;
    this.state.capabilities = plan.capabilities;
    const sorted = [...this.partByRole.values()].sort((a, b) => a.partId - b.partId);
    this.partList.splice(0, this.partList.length, ...sorted);
    this.state.palette = allocatePartIdsByRole(sorted);

    const planOrder = new Map(plan.morphNames.map((name, index) => [name, index] as const));
    const names = [...this.morphMap.keys()].sort((a, b) => (planOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (planOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
    this.morphNameList.splice(0, this.morphNameList.length, ...names);

    // 몸 가림: 선택된 파츠 파일이 선언한 영역의 합집합
    const hides = [...this.files.values()].filter((file) => file.plan.kind === "part").map((file) => file.plan.hides);
    const hidden: ReadonlySet<KitHideableRegionId> = unionHiddenRegions(hides);
    this.globalNotes.clear();
    const body = this.partByRole.get("skin")?.meshes.find((mesh) => mesh.name === KIT_BODY_NODE) ?? null;
    if (body) {
      if (plan.bodyRegions.length === 0 && hidden.size > 0) {
        this.globalNotes.add(`몸 영역 범위(bodyRegions)가 없어 의상이 선언한 영역(${listFew([...hidden])})을 숨기지 못했습니다. 몸이 의상 아래로 비칠 수 있습니다.`);
      }
      this.lastBodyMask = applyBodyMask(body, plan.bodyRegions, hidden);
    } else {
      this.lastBodyMask = null;
    }

    this.noteList.splice(0, this.noteList.length, ...this.baseNotes, ...[...this.files.values()].flatMap((file) => file.notes), ...this.globalNotes);
  }
}

/**
 * 키트 플랜의 GLB들을 받아 하나의 리그로 조립한다. 실패하면 이미 만든 노드·메시·텍스처를 모두 해제하고 `RigBindError`(LabFailure)를 던진다.
 */
export async function loadKitRig(plan: KitPlan, deps: KitLoadDeps): Promise<KitRigHandle> {
  const assembler = new KitAssembler(plan, deps);
  await assembler.loadAll();
  return assembler;
}
