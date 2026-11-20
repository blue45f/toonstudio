/**
 * BG3D 8노드 컷어웨이 계층(`BG_Wall_North/South/East/West/Ceiling`)을 Three.js 런타임에
 * 연결하는 실시간 Shadow-Preserving Wall Cutaway 엔진.
 *
 * 카메라 전방을 가리는 벽·천장을 화면에서만 숨기되(`colorWrite=false`, `depthWrite=false`
 * 또는 그림자 전용 레이어 분리), 외부 태양광·창살 그림자 캐스팅(`castShadow=true`)은
 * 유지해 실내 채광 분위기를 보존한다.
 *
 * 순수 구조 타입을 사용해 WebGL 컨텍스트 없는 Node/Vitest 환경에서도 결정적으로 검증한다.
 */

import {
  evaluateStudioBg3dRoomAutoCutaway,
  STUDIO_BG3D_ROOM_WALL_IDS,
} from "./studio-bg3d-room-builder";
import {
  computeShadowPreservingRoomCutawayPlan,
  type RoomWallId,
  type ShadowPreservingRoomCutawayPlan,
} from "./studio-bg3d-sketchup-webtoon-staging-bridge";

export type Bg3dVec3 = readonly [number, number, number];

export type Bg3dCutawayWallRole = RoomWallId;

export type Bg3dCutawayRenderMode = "shadow-preserving-material" | "shadow-only-layer" | "visibility-only";

export const BG3D_CUTAWAY_NODE_NAMES = Object.freeze({
  floor: "BG_Floor",
  north: "BG_Wall_North",
  south: "BG_Wall_South",
  west: "BG_Wall_West",
  east: "BG_Wall_East",
  ceiling: "BG_Ceiling",
  ceilingFixtures: "BG_Ceiling_Fixtures",
  furnitureHero: "BG_Furniture_Hero",
  propsClutter: "BG_Props_Clutter",
  mobileCutawayFront: "BG_Cutaway_Front",
} as const);

export const BG3D_CUTAWAY_CONTROLLABLE_ROLES: readonly Bg3dCutawayWallRole[] = Object.freeze([
  "north",
  "south",
  "west",
  "east",
  "ceiling",
]);

export const BG3D_CUTAWAY_ROLE_LABELS_KO: Readonly<Record<Bg3dCutawayWallRole, string>> = Object.freeze({
  north: "북벽",
  south: "남벽",
  west: "서벽",
  east: "동벽",
  ceiling: "천장",
  floor: "바닥",
});

/** Three.js Material의 최소 런타임 표면(실제 THREE.Material과 구조 호환). */
export interface Bg3dCutawayMaterialLike {
  colorWrite: boolean;
  depthWrite: boolean;
  needsUpdate?: boolean;
}

/** Three.js Layers의 최소 런타임 표면(실제 THREE.Layers와 구조 호환). */
export interface Bg3dCutawayLayersLike {
  mask: number;
  set?: (channel: number) => void;
}

/** Three.js Object3D / Mesh의 최소 런타임 표면(실제 THREE.Object3D와 구조 호환). */
export interface Bg3dCutawayObjectLike {
  readonly name: string;
  visible: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  readonly isMesh?: boolean;
  material?: Bg3dCutawayMaterialLike | Bg3dCutawayMaterialLike[] | null;
  readonly layers?: Bg3dCutawayLayersLike;
  readonly userData?: Record<string, unknown>;
  readonly children?: readonly Bg3dCutawayObjectLike[];
}

export interface Bg3dCutawayCameraInput {
  readonly position: Bg3dVec3;
  readonly target: Bg3dVec3;
}

export interface Bg3dCutawayRoomBounds {
  readonly center: Bg3dVec3;
  readonly size: Bg3dVec3;
}

export interface Bg3dWallCutawayConfig {
  /** 자동 컷어웨이 활성화 여부. 기본값 true. */
  readonly enabled: boolean;
  /** 가려진 벽을 카메라에서만 숨기고 외부 태양광 그림자 캐스터를 유지할지 여부. 기본값 true. */
  readonly preserveExteriorShadows: boolean;
  /** 부감 카메라에서 천장·천장등을 함께 숨길지 여부. 기본값 true. */
  readonly autoHideCeiling: boolean;
  /** 숨김 렌더링 구현 방식. 기본값 "shadow-preserving-material". */
  readonly renderMode?: Bg3dCutawayRenderMode;
  /** `shadow-only-layer` 모드에서 사용할 그림자 전용 Three.js 레이어 채널(1~31). 기본값 2. */
  readonly shadowOnlyLayer?: number;
  /** 사용자가 항상 보이도록 고정한 벽 목록. */
  readonly lockedVisibleWalls?: readonly Bg3dCutawayWallRole[];
  /** 사용자가 강제로 숨긴 벽 목록. */
  readonly forcedHiddenWalls?: readonly Bg3dCutawayWallRole[];
}

export const DEFAULT_BG3D_WALL_CUTAWAY_CONFIG: Bg3dWallCutawayConfig = Object.freeze({
  enabled: true,
  preserveExteriorShadows: true,
  autoHideCeiling: true,
  renderMode: "shadow-preserving-material",
  shadowOnlyLayer: 2,
  lockedVisibleWalls: Object.freeze([]),
  forcedHiddenWalls: Object.freeze([]),
});

export interface Bg3dWallCutawayEvaluation {
  readonly enabled: boolean;
  readonly hiddenWalls: readonly Bg3dCutawayWallRole[];
  readonly shadowPreservedWalls: readonly Bg3dCutawayWallRole[];
  readonly visibleWalls: readonly Bg3dCutawayWallRole[];
  readonly plan: ShadowPreservingRoomCutawayPlan;
  readonly summaryKo: string;
}

export interface Bg3dCutawayIndexedTarget {
  readonly role: Bg3dCutawayWallRole;
  readonly object: Bg3dCutawayObjectLike;
}

export interface Bg3dWallCutawayApplyResult {
  readonly evaluation: Bg3dWallCutawayEvaluation;
  readonly updatedMeshCount: number;
  readonly hiddenMeshCount: number;
  readonly shadowCasterPreservedMeshCount: number;
  readonly matchedRoles: readonly Bg3dCutawayWallRole[];
}

interface MaterialOriginalState {
  readonly colorWrite: boolean;
  readonly depthWrite: boolean;
}

interface ObjectOriginalState {
  readonly visible: boolean;
  readonly castShadow: boolean | undefined;
  readonly receiveShadow: boolean | undefined;
  readonly layersMask: number | undefined;
  readonly materials: ReadonlyMap<Bg3dCutawayMaterialLike, MaterialOriginalState>;
}

const VALID_WALL_ROLES: ReadonlySet<string> = new Set<Bg3dCutawayWallRole>([
  "north",
  "south",
  "west",
  "east",
  "ceiling",
  "floor",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRoleFromUserData(userData: Record<string, unknown> | undefined): Bg3dCutawayWallRole | null {
  if (!userData) return null;
  const direct = userData.toonstudio_wall_id ?? userData.wallId;
  if (typeof direct === "string" && VALID_WALL_ROLES.has(direct.toLowerCase())) {
    return direct.toLowerCase() as Bg3dCutawayWallRole;
  }
  const extras = isRecord(userData.extras) ? userData.extras : null;
  const extraWall = extras?.toonstudio_wall_id;
  if (typeof extraWall === "string" && VALID_WALL_ROLES.has(extraWall.toLowerCase())) {
    return extraWall.toLowerCase() as Bg3dCutawayWallRole;
  }
  return null;
}

/**
 * 노드 이름·메타데이터(`toonstudio_wall_id`)에서 컷어웨이 벽/천장 역할을 판별한다.
 * Canonical 8노드 계약(`BG_Wall_North/South/East/West`, `BG_Ceiling`, `BG_Floor`)과
 * 한국어 룸 빌더 명명(`앞벽`, `뒷벽`, `왼벽`, `오른벽`, `천장`)을 모두 인식한다.
 */
export function classifyBg3dCutawayWallRole(
  object: Pick<Bg3dCutawayObjectLike, "name" | "userData">,
): Bg3dCutawayWallRole | null {
  const fromMeta = readRoleFromUserData(object.userData);
  if (fromMeta) return fromMeta;

  const rawName = (object.name ?? "").trim();
  if (!rawName) return null;
  const lower = rawName.toLowerCase();

  if (/^bg_wall_north(?:$|[_\-.])/u.test(lower) || lower.includes("wall_north") || rawName.startsWith("뒷벽")) {
    return "north";
  }
  if (
    /^bg_wall_south(?:$|[_\-.])/u.test(lower)
    || lower.includes("wall_south")
    || /^bg_cutaway_front(?:$|[_\-.])/u.test(lower)
    || rawName.startsWith("앞벽")
  ) {
    return "south";
  }
  if (/^bg_wall_west(?:$|[_\-.])/u.test(lower) || lower.includes("wall_west") || rawName.startsWith("왼벽")) {
    return "west";
  }
  if (/^bg_wall_east(?:$|[_\-.])/u.test(lower) || lower.includes("wall_east") || rawName.startsWith("오른벽")) {
    return "east";
  }
  if (
    /^bg_ceiling(?:$|[_\-.])/u.test(lower)
    || lower.includes("ceiling_fixture")
    || rawName.startsWith("천장")
  ) {
    return "ceiling";
  }
  if (/^bg_floor(?:$|[_\-.])/u.test(lower) || rawName.startsWith("바닥")) {
    return "floor";
  }
  return null;
}

/**
 * 씬 트리를 순회해 컷어웨이 대상 노드와 하위 메시를 역할별로 색인한다.
 * 부모 벽(`BG_Wall_North`)에 붙은 창틀·몰딩·벽장식 자식 메시도 부모 벽 역할을 상속한다.
 */
export function indexBg3dCutawayTargets(
  root: Bg3dCutawayObjectLike,
): readonly Bg3dCutawayIndexedTarget[] {
  const indexed: Bg3dCutawayIndexedTarget[] = [];

  const visit = (node: Bg3dCutawayObjectLike, inheritedRole: Bg3dCutawayWallRole | null) => {
    const ownRole = classifyBg3dCutawayWallRole(node);
    const role = ownRole ?? inheritedRole;
    if (role !== null && role !== "floor") {
      indexed.push({ role, object: node });
    }
    const children = node.children;
    if (children && children.length > 0) {
      for (const child of children) {
        visit(child, role);
      }
    }
  };

  visit(root, null);
  return indexed;
}

/**
 * 카메라 위치·시선·방 경계와 사용자 수동 오버라이드를 합쳐
 * 어떤 벽·천장을 숨기고 외부 태양 그림자 캐스터로 유지할지 계산한다.
 */
export function evaluateCameraWallCutaway(input: {
  readonly camera: Bg3dCutawayCameraInput;
  readonly room: Bg3dCutawayRoomBounds;
  readonly config?: Partial<Bg3dWallCutawayConfig>;
}): Bg3dWallCutawayEvaluation {
  const cfg: Bg3dWallCutawayConfig = {
    ...DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
    ...input.config,
  };
  const { center, size } = input.room;
  const plan = computeShadowPreservingRoomCutawayPlan({
    cameraPosition: input.camera.position,
    roomCenter: center,
    roomSize: size,
    autoHideCeilingAboveEyeY: center[1] + size[1] * 0.35,
    preserveExteriorShadows: cfg.preserveExteriorShadows,
  });

  const localCamera: Bg3dVec3 = [
    input.camera.position[0] - center[0],
    input.camera.position[1],
    input.camera.position[2] - center[2],
  ];
  const localFocus: Bg3dVec3 = [
    input.camera.target[0] - center[0],
    input.camera.target[1],
    input.camera.target[2] - center[2],
  ];

  // 시선 선분이 낮은 난간 위로 지나는지 확인해 옥상 난간 등을 과잉 숨김하지 않는다.
  const sightlineWalls = evaluateStudioBg3dRoomAutoCutaway({
    cameraPosition: localCamera,
    focusPoint: localFocus,
    roomWidth: size[0],
    roomDepth: size[2],
    wallHeight: size[1],
  });

  const lockedVisible = new Set<Bg3dCutawayWallRole>(cfg.lockedVisibleWalls ?? []);
  const forcedHidden = new Set<Bg3dCutawayWallRole>(cfg.forcedHiddenWalls ?? []);

  const hiddenSet = new Set<Bg3dCutawayWallRole>();
  if (cfg.enabled) {
    for (const wallId of STUDIO_BG3D_ROOM_WALL_IDS) {
      const inPlan = plan.hiddenFromCameraWalls.includes(wallId);
      const inSight = sightlineWalls.has(wallId);
      // 카메라가 방 바깥에 있으면 시선 높이 검사를 우선하고, 실내 가장자리에서는 계획 판정을 따른다.
      const cameraOutsideX = Math.abs(localCamera[0]) > size[0] / 2;
      const cameraOutsideZ = Math.abs(localCamera[2]) > size[2] / 2;
      const axisOutside = (wallId === "north" || wallId === "south") ? cameraOutsideZ : cameraOutsideX;
      const shouldHide = axisOutside ? inSight : inPlan;
      if (shouldHide) {
        hiddenSet.add(wallId);
      }
    }
    if (cfg.autoHideCeiling && plan.hiddenFromCameraWalls.includes("ceiling")) {
      hiddenSet.add("ceiling");
    }
  }

  for (const forced of forcedHidden) {
    if (forced !== "floor") hiddenSet.add(forced);
  }
  for (const locked of lockedVisible) {
    hiddenSet.delete(locked);
  }

  const hiddenWalls = BG3D_CUTAWAY_CONTROLLABLE_ROLES.filter((role) => hiddenSet.has(role));
  const visibleWalls = BG3D_CUTAWAY_CONTROLLABLE_ROLES.filter((role) => !hiddenSet.has(role));
  const shadowPreservedWalls = cfg.preserveExteriorShadows ? [...hiddenWalls] : [];

  const summaryKo = hiddenWalls.length === 0
    ? "모든 벽·천장 표시 중"
    : `${hiddenWalls.map((role) => BG3D_CUTAWAY_ROLE_LABELS_KO[role]).join("·")} 자동 숨김${
      cfg.preserveExteriorShadows ? " · 외부 채광 그림자 유지" : ""
    }`;

  return {
    enabled: cfg.enabled,
    hiddenWalls,
    shadowPreservedWalls,
    visibleWalls,
    plan,
    summaryKo,
  };
}

function listMaterials(
  material: Bg3dCutawayObjectLike["material"],
): Bg3dCutawayMaterialLike[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function isMeshObject(node: Bg3dCutawayObjectLike): boolean {
  return node.isMesh === true || node.material !== undefined;
}

function captureOriginalState(node: Bg3dCutawayObjectLike): ObjectOriginalState {
  const materials = new Map<Bg3dCutawayMaterialLike, MaterialOriginalState>();
  for (const mat of listMaterials(node.material)) {
    materials.set(mat, {
      colorWrite: mat.colorWrite,
      depthWrite: mat.depthWrite,
    });
  }
  return {
    visible: node.visible,
    castShadow: node.castShadow,
    receiveShadow: node.receiveShadow,
    layersMask: node.layers?.mask,
    materials,
  };
}

function restoreObjectState(node: Bg3dCutawayObjectLike, original: ObjectOriginalState): void {
  node.visible = original.visible;
  if (original.castShadow !== undefined) node.castShadow = original.castShadow;
  if (original.receiveShadow !== undefined) node.receiveShadow = original.receiveShadow;
  if (node.layers && original.layersMask !== undefined) {
    node.layers.mask = original.layersMask;
  }
  for (const mat of listMaterials(node.material)) {
    const saved = original.materials.get(mat);
    if (!saved) continue;
    const changed = mat.colorWrite !== saved.colorWrite || mat.depthWrite !== saved.depthWrite;
    mat.colorWrite = saved.colorWrite;
    mat.depthWrite = saved.depthWrite;
    if (changed) mat.needsUpdate = true;
  }
}

function hideObjectWithShadowPolicy(
  node: Bg3dCutawayObjectLike,
  original: ObjectOriginalState,
  config: Bg3dWallCutawayConfig,
): { readonly shadowPreserved: boolean } {
  const renderMode = config.renderMode ?? "shadow-preserving-material";
  const preserveShadow = config.preserveExteriorShadows && renderMode !== "visibility-only";

  if (!isMeshObject(node)) {
    // 그룹 노드는 그림자 캐스터 자식 메시를 유지해야 하므로 preserveShadow일 때 visible=true를 지킨다.
    node.visible = preserveShadow ? original.visible : false;
    return { shadowPreserved: false };
  }

  if (!preserveShadow) {
    node.visible = false;
    node.castShadow = false;
    return { shadowPreserved: false };
  }

  if (renderMode === "shadow-only-layer" && node.layers) {
    const layer = Math.max(1, Math.min(31, Math.trunc(config.shadowOnlyLayer ?? 2)));
    node.visible = original.visible;
    node.castShadow = true;
    node.receiveShadow = false;
    if (typeof node.layers.set === "function") {
      node.layers.set(layer);
    } else {
      node.layers.mask = 1 << layer;
    }
    return { shadowPreserved: true };
  }

  // 기본 전략: 카메라 컬러·깊이 버퍼에는 그리지 않되 Three.js 그림자 맵 패스에는 그대로 제출한다.
  node.visible = original.visible;
  node.castShadow = true;
  node.receiveShadow = false;
  for (const mat of listMaterials(node.material)) {
    const changed = mat.colorWrite || mat.depthWrite;
    mat.colorWrite = false;
    mat.depthWrite = false;
    if (changed) mat.needsUpdate = true;
  }
  return { shadowPreserved: true };
}

export interface Bg3dWallCutawayRuntimeController {
  readonly targets: readonly Bg3dCutawayIndexedTarget[];
  readonly update: (
    camera: Bg3dCutawayCameraInput,
    room: Bg3dCutawayRoomBounds,
    config?: Partial<Bg3dWallCutawayConfig>,
  ) => Bg3dWallCutawayApplyResult;
  readonly restoreAll: () => void;
  readonly getLastEvaluation: () => Bg3dWallCutawayEvaluation | null;
}

/**
 * Three.js 씬 루트에 바인딩되는 Shadow-Preserving Cutaway 런타임 컨트롤러를 생성한다.
 * 원본 메시·재질 상태를 스냅샷으로 보존하므로 `restoreAll()` 호출 시 100% 원복된다.
 */
export function createBg3dWallCutawayRuntime(
  root: Bg3dCutawayObjectLike,
): Bg3dWallCutawayRuntimeController {
  const targets = indexBg3dCutawayTargets(root);
  const originals = new Map<Bg3dCutawayObjectLike, ObjectOriginalState>();
  for (const target of targets) {
    if (!originals.has(target.object)) {
      originals.set(target.object, captureOriginalState(target.object));
    }
  }

  let lastEvaluation: Bg3dWallCutawayEvaluation | null = null;

  const restoreAll = () => {
    for (const [node, original] of originals) {
      restoreObjectState(node, original);
    }
  };

  const update = (
    camera: Bg3dCutawayCameraInput,
    room: Bg3dCutawayRoomBounds,
    config?: Partial<Bg3dWallCutawayConfig>,
  ): Bg3dWallCutawayApplyResult => {
    const resolvedConfig: Bg3dWallCutawayConfig = {
      ...DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
      ...config,
    };
    const evaluation = evaluateCameraWallCutaway({ camera, room, config: resolvedConfig });
    const hiddenRoles = new Set<Bg3dCutawayWallRole>(evaluation.hiddenWalls);

    let updatedMeshCount = 0;
    let hiddenMeshCount = 0;
    let shadowCasterPreservedMeshCount = 0;
    const matchedRoleSet = new Set<Bg3dCutawayWallRole>();
    const visitedNodes = new Set<Bg3dCutawayObjectLike>();

    for (const target of targets) {
      matchedRoleSet.add(target.role);
      if (visitedNodes.has(target.object)) continue;
      visitedNodes.add(target.object);

      const original = originals.get(target.object);
      if (!original) continue;

      const meshFlag = isMeshObject(target.object);
      if (meshFlag) updatedMeshCount += 1;

      if (hiddenRoles.has(target.role)) {
        const result = hideObjectWithShadowPolicy(target.object, original, resolvedConfig);
        if (meshFlag) {
          hiddenMeshCount += 1;
          if (result.shadowPreserved) shadowCasterPreservedMeshCount += 1;
        }
      } else {
        restoreObjectState(target.object, original);
      }
    }

    lastEvaluation = evaluation;
    return {
      evaluation,
      updatedMeshCount,
      hiddenMeshCount,
      shadowCasterPreservedMeshCount,
      matchedRoles: BG3D_CUTAWAY_CONTROLLABLE_ROLES.filter((role) => matchedRoleSet.has(role)),
    };
  };

  return {
    targets,
    update,
    restoreAll,
    getLastEvaluation: () => lastEvaluation,
  };
}

/** 단발성 적용 도우미(컨트롤러를 즉시 만들어 1회 평가·적용한다). */
export function applyShadowPreservingWallCutaway(
  root: Bg3dCutawayObjectLike,
  camera: Bg3dCutawayCameraInput,
  room: Bg3dCutawayRoomBounds,
  config?: Partial<Bg3dWallCutawayConfig>,
): Bg3dWallCutawayApplyResult {
  return createBg3dWallCutawayRuntime(root).update(camera, room, config);
}
