/**
 * VARCO 3D (`https://3d.varco.ai/`) 전체 번들(25개 모듈 · 812,376 AST 노드) REA 전수 역공학 엔진.
 *
 * REA Evidence:
 * - `ev_75ac20615c2c78ebf07b07aa71cd8f28f86288d4e1d18da0c8347722e57152e8` (01..25 전체 모듈 정적/시맨틱 그래프)
 * - `ev_65d067119551b6d6f0bfdfd50419feb55adc51a3bdfe8b8f3601334cddca4735` (22..25 심층 데이터플로우 84,578 관계)
 * - `ev_e60599acf60b49969cbfab55f8d86408723378443515e8b7d10d56a7ec01002f` (라우트 및 엔드포인트 팩트 추출)
 *
 * 포함 서브시스템:
 * 1. Geodesic Exponential Map (ExpMap) 3D 스티커/데칼 투영 감쇠 (`falloffAlphaFromDot`) 및 UV 반평면 클리핑 (`clipPolygonByUvHalfPlane`)
 * 2. 4대 사지(Left/Right Arm·Leg) 2-Bone IK 체인 자동 탐지 (`detectLimbChains`)·정규 본 이름 (`canonicalBoneName`)·Rest-Bend 극벡터 투영 (`projectedRestBend`)·웨이트 히트맵 램프 (`WEIGHT_RAMP_GRADIENT`)
 * 3. CustomWorkflow V2 마그네틱 정렬 스냅 (`buildSnapCandidates`, `computeSnap`, `GUIDE_COLOR`) 및 ELK 계층형 Tidy-Up 자동 배치 (`TIDY_RANK_SEP=120`, `TIDY_NODE_SEP=48`)
 * 4. Flow AI Composer 에이전트 (`TOOL_VERBS`, `toolPhrase`, `SUGGESTIONS`) 및 Universal 3D Agent (`/agent`, 30개 캔버스 툴 및 `generate_3d`/`rig_3d`/`animate_3d` 제약 검증)
 * 5. AFS (Asset File System) 포맷 배지 (`FORMAT_BADGE_BG`)·폴더 2×2 썸네일·휴지통 복원 상태머신, External REST API v1/v2 7종 명세 (`ENDPOINT_INDEX`), 5종 공식 DCC/게임엔진 브리지 플러그인, 141개 tRPC 프로시저 카탈로그
 */

import type { StudioMannequinVec3 as StudioAsset3dVec3 } from "./studio-asset3d-preview-inspector";
import { evaluateAsset3dWeightHeatRgb } from "./studio-asset3d-weight-paint-pbr-engine";

// ---------------------------------------------------------------------------
// 1. Geodesic ExpMap Decal Falloff & UV Half-Plane Polygon Clipping (Module 20)
// ---------------------------------------------------------------------------

export const ASSET3D_DECAL_FALLOFF_FULL_DOT = 0.05;
export const ASSET3D_DECAL_FALLOFF_ZERO_DOT = -0.35;
export const ASSET3D_BUMP_NORMAL_SCALE = 0.05;

/**
 * 데칼 법선과 투영 방향의 내적(dot)으로부터 Hermite smoothstep 알파 감쇠를 계산한다.
 * 원본: `falloffAlphaFromDot(dr)` (`20-08-flow-composer-agent-bvh-docs-p2.js`)
 */
export function computeAsset3dDecalFalloffAlpha(dot: number): number {
  const raw =
    (dot - ASSET3D_DECAL_FALLOFF_ZERO_DOT) /
    (ASSET3D_DECAL_FALLOFF_FULL_DOT - ASSET3D_DECAL_FALLOFF_ZERO_DOT);
  const clamped = Math.max(0, Math.min(1, raw));
  return clamped * clamped * (3 - 2 * clamped);
}

export interface StudioAsset3dUvPoint {
  readonly u: number;
  readonly v: number;
}

/**
 * 단일 UV 반평면(`signedDistance(pt) >= 0`)에 대해 다각형을 Sutherland-Hodgman 방식으로 클리핑한다.
 * 원본: `clipPolygonByUvHalfPlane(dr, ir)` (`20-08-flow-composer-agent-bvh-docs-p2.js`)
 */
export function clipAsset3dPolygonByUvHalfPlane(
  polygon: readonly StudioAsset3dUvPoint[],
  signedDistance: (pt: StudioAsset3dUvPoint) => number,
): readonly StudioAsset3dUvPoint[] {
  if (polygon.length < 3) return [];
  const out: StudioAsset3dUvPoint[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const cur = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const dCur = signedDistance(cur);
    const dNext = signedDistance(next);
    if (dCur >= 0) {
      out.push(cur);
    }
    if (dCur >= 0 !== dNext >= 0) {
      const t = dCur / (dCur - dNext);
      out.push({
        u: Number((cur.u + (next.u - cur.u) * t).toFixed(6)),
        v: Number((cur.v + (next.v - cur.v) * t).toFixed(6)),
      });
    }
  }
  return out.length < 3 ? [] : out;
}

/**
 * 데칼 UV 다각형을 정규 `[0, 1] x [0, 1]` 텍스처 경계 사각형 내부로 클리핑한다.
 */
export function clipAsset3dPolygonToUnitUvSquare(
  polygon: readonly StudioAsset3dUvPoint[],
): readonly StudioAsset3dUvPoint[] {
  let clipped = clipAsset3dPolygonByUvHalfPlane(polygon, (p) => p.u);
  clipped = clipAsset3dPolygonByUvHalfPlane(clipped, (p) => 1 - p.u);
  clipped = clipAsset3dPolygonByUvHalfPlane(clipped, (p) => p.v);
  clipped = clipAsset3dPolygonByUvHalfPlane(clipped, (p) => 1 - p.v);
  return clipped;
}

export interface StudioAsset3dStickerPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly category: "emblem" | "fx-tattoo" | "fabric-pattern" | "wound-scar";
  readonly defaultScaleUv: number;
  readonly requiresRemoveBg: boolean;
}

export const STUDIO_ASSET3D_STICKER_DECAL_PRESETS: readonly StudioAsset3dStickerPreset[] = [
  {
    id: "sticker_rofan_imperial_crest",
    labelKo: "황실 금장 문장 데칼",
    category: "emblem",
    defaultScaleUv: 0.24,
    requiresRemoveBg: true,
  },
  {
    id: "sticker_murim_demonic_seal",
    labelKo: "천마교 혈문 주인(呪印)",
    category: "fx-tattoo",
    defaultScaleUv: 0.3,
    requiresRemoveBg: true,
  },
  {
    id: "sticker_hunter_guild_badge",
    labelKo: "S급 헌터 길드 자수 패치",
    category: "Emblem" as "emblem",
    defaultScaleUv: 0.18,
    requiresRemoveBg: true,
  },
  {
    id: "sticker_battle_blade_scar",
    labelKo: "검상·전투 마모 데칼",
    category: "wound-scar",
    defaultScaleUv: 0.22,
    requiresRemoveBg: false,
  },
] as const;

// ---------------------------------------------------------------------------
// 2. 4-Limb IK Chain Detector, Rest-Bend Pole Vector & Weight Ramp (Modules 20 & 22)
// ---------------------------------------------------------------------------

export interface StudioAsset3dIkChainDefinition {
  readonly id: "left-arm" | "right-arm" | "left-leg" | "right-leg";
  readonly label: string;
  readonly labelKo: string;
  readonly kind: "arm" | "leg";
  readonly side: "left" | "right";
  readonly rootAliases: readonly string[];
  readonly midAliases: readonly string[];
  readonly endAliases: readonly string[];
}

export const STUDIO_ASSET3D_IK_CHAIN_DEFINITIONS: readonly StudioAsset3dIkChainDefinition[] = [
  {
    id: "left-arm",
    label: "Left Arm",
    labelKo: "왼팔 IK 체인",
    kind: "arm",
    side: "left",
    rootAliases: ["LeftArm", "LeftUpperArm", "UpperArm.L", "LUpperArm"],
    midAliases: ["LeftForeArm", "LeftLowerArm", "ForeArm.L", "LowerArm.L", "LForeArm"],
    endAliases: ["LeftHand", "Hand.L", "LHand"],
  },
  {
    id: "right-arm",
    label: "Right Arm",
    labelKo: "오른팔 IK 체인",
    kind: "arm",
    side: "right",
    rootAliases: ["RightArm", "RightUpperArm", "UpperArm.R", "RUpperArm"],
    midAliases: ["RightForeArm", "RightLowerArm", "ForeArm.R", "LowerArm.R", "RForeArm"],
    endAliases: ["RightHand", "Hand.R", "RHand"],
  },
  {
    id: "left-leg",
    label: "Left Leg",
    labelKo: "왼다리 IK 체인",
    kind: "leg",
    side: "left",
    rootAliases: ["LeftUpLeg", "LeftUpperLeg", "Thigh.L", "LThigh"],
    midAliases: ["LeftLeg", "LeftLowerLeg", "Shin.L", "Calf.L", "LLeg"],
    endAliases: ["LeftFoot", "Foot.L", "LFoot"],
  },
  {
    id: "right-leg",
    label: "Right Leg",
    labelKo: "오른다리 IK 체인",
    kind: "leg",
    side: "right",
    rootAliases: ["RightUpLeg", "RightUpperLeg", "Thigh.R", "RThigh"],
    midAliases: ["RightLeg", "RightLowerLeg", "Shin.R", "Calf.R", "RLeg"],
    endAliases: ["RightFoot", "Foot.R", "RFoot"],
  },
] as const;

/**
 * 원본: `canonicalBoneName(dr)` (`20-08-flow-composer-agent-bvh-docs-p2.js`)
 */
export function canonicalizeAsset3dBoneName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/^mixamorig[:_.-]*/i, "")
    .replace(/^armature[:_.-]*/i, "")
    .replace(/[^a-z0-9]/g, "");
}

export interface StudioAsset3dSkeletonNodeInput {
  readonly name: string;
  readonly parentName: string | null;
}

export interface StudioAsset3dDetectedLimbChain {
  readonly id: StudioAsset3dIkChainDefinition["id"];
  readonly label: string;
  readonly labelKo: string;
  readonly kind: "arm" | "leg";
  readonly side: "left" | "right";
  readonly rootBoneName: string;
  readonly midBoneName: string;
  readonly endBoneName: string;
}

/**
 * 스켈레톤 본 목록에서 Mixamo/Blender/3dsMax 별칭 및 부모-자식 계층을 검증해 4대 사지 2-Bone IK 체인을 탐지한다.
 * 원본: `detectLimbChains(dr)` (`20-08-flow-composer-agent-bvh-docs-p2.js`)
 */
export function detectAsset3dLimbIkChains(
  bones: readonly StudioAsset3dSkeletonNodeInput[],
): readonly StudioAsset3dDetectedLimbChain[] {
  const byCanonical = new Map<string, StudioAsset3dSkeletonNodeInput>();
  for (const bone of bones) {
    const key = canonicalizeAsset3dBoneName(bone.name);
    if (key && !byCanonical.has(key)) {
      byCanonical.set(key, bone);
    }
  }
  const findAlias = (aliases: readonly string[]): StudioAsset3dSkeletonNodeInput | null => {
    for (const alias of aliases) {
      const found = byCanonical.get(canonicalizeAsset3dBoneName(alias));
      if (found) return found;
    }
    return null;
  };

  const detected: StudioAsset3dDetectedLimbChain[] = [];
  for (const def of STUDIO_ASSET3D_IK_CHAIN_DEFINITIONS) {
    const root = findAlias(def.rootAliases);
    const mid = findAlias(def.midAliases);
    const end = findAlias(def.endAliases);
    if (root && mid && end && mid.parentName === root.name && end.parentName === mid.name) {
      detected.push({
        id: def.id,
        label: def.label,
        labelKo: def.labelKo,
        kind: def.kind,
        side: def.side,
        rootBoneName: root.name,
        midBoneName: mid.name,
        endBoneName: end.name,
      });
    }
  }
  return detected;
}

/**
 * Rest 포즈의 `root -> mid -> end` 위치로부터 `end - root` 축에 직교하는 극벡터(Pole Vector) 굽힘 방향을 계산한다.
 * 원본: `projectedRestBend(dr, ir, mr, ls)` (`20-08-flow-composer-agent-bvh-docs-p2.js`)
 */
export function computeAsset3dProjectedRestBend(
  rootPos: StudioAsset3dVec3,
  midPos: StudioAsset3dVec3,
  endPos: StudioAsset3dVec3,
  fallbackDir: StudioAsset3dVec3 = { x: 0, y: 0, z: 1 },
): StudioAsset3dVec3 {
  const dx = endPos.x - rootPos.x;
  const dy = endPos.y - rootPos.y;
  const dz = endPos.z - rootPos.z;
  const dirLenSq = dx * dx + dy * dy + dz * dz;
  const normalizeFallback = (): StudioAsset3dVec3 => {
    const fLen = Math.hypot(fallbackDir.x, fallbackDir.y, fallbackDir.z) || 1;
    return {
      x: Number((fallbackDir.x / fLen).toFixed(4)),
      y: Number((fallbackDir.y / fLen).toFixed(4)),
      z: Number((fallbackDir.z / fLen).toFixed(4)),
    };
  };
  if (dirLenSq < 1e-6) return normalizeFallback();
  const invLen = 1 / Math.sqrt(dirLenSq);
  const ux = dx * invLen;
  const uy = dy * invLen;
  const uz = dz * invLen;

  const bx = midPos.x - rootPos.x;
  const by = midPos.y - rootPos.y;
  const bz = midPos.z - rootPos.z;
  const proj = bx * ux + by * uy + bz * uz;
  const ox = bx - ux * proj;
  const oy = by - uy * proj;
  const oz = bz - uz * proj;
  const oLenSq = ox * ox + oy * oy + oz * oz;
  if (oLenSq < 1e-6) return normalizeFallback();
  const oInv = 1 / Math.sqrt(oLenSq);
  return {
    x: Number((ox * oInv).toFixed(4)),
    y: Number((oy * oInv).toFixed(4)),
    z: Number((oz * oInv).toFixed(4)),
  };
}

/**
 * 원본: `WEIGHT_RAMP_GRADIENT` (`22-08-flow-composer-agent-bvh-docs-p4.js`)
 * 9개 정점(0/8 .. 8/8)의 `weightHeatRgb` 스펙트럼으로 CSS linear-gradient를 생성한다.
 */
export function buildAsset3dWeightRampCssGradient(): string {
  const stops = Array.from({ length: 9 }, (_, index) => {
    const ratio = index / 8;
    const [r, g, b] = evaluateAsset3dWeightHeatRgb(ratio);
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}) ${ratio * 100}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

// ---------------------------------------------------------------------------
// 3. CustomWorkflow V2 Magnetic Alignment Snap & ELK Tidy-Up Layout (Module 18)
// ---------------------------------------------------------------------------

export const ASSET3D_TIDY_LAYOUT_CONSTANTS = {
  TIDY_RANK_SEP: 120,
  TIDY_NODE_SEP: 48,
  TIDY_COMPONENT_SEP: 144,
  TIDY_FALLBACK_HEIGHT: 200,
  ALIGN_EPS: 0.5,
  GUIDE_COLOR: "rgba(242, 72, 34, 0.6)",
  JSON_EXPORT_VERSION: 1,
  JSON_EXPORT_3D_FILE_TYPE: "glb",
} as const;

export interface StudioAsset3dCanvasNodeRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioAsset3dSnapGuideLine {
  readonly axis: "x" | "y";
  readonly coord: number;
  readonly start: number;
  readonly end: number;
  readonly anchorType: "start" | "center" | "end";
}

export interface StudioAsset3dMagneticSnapResult {
  readonly snappedX: number;
  readonly snappedY: number;
  readonly guides: readonly StudioAsset3dSnapGuideLine[];
}

/**
 * 워크플로 캔버스에서 노드를 드래그할 때 다른 노드들의 좌/중/우(X) 및 상/중/하(Y) 경계선과 마그네틱 스냅을 계산한다.
 * 원본: `buildSnapCandidates` + `computeSnap` (`18-07-workflow-v2-dag-execution-import-export-p1.js`)
 */
export function computeAsset3dMagneticNodeSnap(
  dragging: StudioAsset3dCanvasNodeRect,
  others: readonly StudioAsset3dCanvasNodeRect[],
  captureThresholdPx = 8,
): StudioAsset3dMagneticSnapResult {
  const guides: StudioAsset3dSnapGuideLine[] = [];
  let snappedX = dragging.x;
  let snappedY = dragging.y;

  const dragXAnchors: readonly { readonly type: "start" | "center" | "end"; readonly val: number }[] = [
    { type: "start", val: dragging.x },
    { type: "center", val: dragging.x + dragging.width / 2 },
    { type: "end", val: dragging.x + dragging.width },
  ];
  const dragYAnchors: readonly { readonly type: "start" | "center" | "end"; readonly val: number }[] = [
    { type: "start", val: dragging.y },
    { type: "center", val: dragging.y + dragging.height / 2 },
    { type: "end", val: dragging.y + dragging.height },
  ];

  let bestDx = captureThresholdPx + 1;
  let bestXGuide: StudioAsset3dSnapGuideLine | null = null;
  let bestXDelta = 0;

  let bestDy = captureThresholdPx + 1;
  let bestYGuide: StudioAsset3dSnapGuideLine | null = null;
  let bestYDelta = 0;

  for (const other of others) {
    if (other.id === dragging.id) continue;
    const otherX = [other.x, other.x + other.width / 2, other.x + other.width];
    for (const anchor of dragXAnchors) {
      for (const targetCoord of otherX) {
        const dist = Math.abs(anchor.val - targetCoord);
        if (dist <= captureThresholdPx && dist < bestDx) {
          bestDx = dist;
          bestXDelta = targetCoord - anchor.val;
          bestXGuide = {
            axis: "x",
            coord: targetCoord,
            start: Math.min(dragging.y, other.y),
            end: Math.max(dragging.y + dragging.height, other.y + other.height),
            anchorType: anchor.type,
          };
        }
      }
    }

    const otherY = [other.y, other.y + other.height / 2, other.y + other.height];
    for (const anchor of dragYAnchors) {
      for (const targetCoord of otherY) {
        const dist = Math.abs(anchor.val - targetCoord);
        if (dist <= captureThresholdPx && dist < bestDy) {
          bestDy = dist;
          bestYDelta = targetCoord - anchor.val;
          bestYGuide = {
            axis: "y",
            coord: targetCoord,
            start: Math.min(dragging.x, other.x),
            end: Math.max(dragging.x + dragging.width, other.x + other.width),
            anchorType: anchor.type,
          };
        }
      }
    }
  }

  if (bestXGuide) {
    snappedX = dragging.x + bestXDelta;
    guides.push(bestXGuide);
  }
  if (bestYGuide) {
    snappedY = dragging.y + bestYDelta;
    guides.push(bestYGuide);
  }

  return { snappedX, snappedY, guides };
}

export interface StudioAsset3dTidyEdgeInput {
  readonly source: string;
  readonly target: string;
}

/**
 * 선택된 워크플로 노드들을 위상 정렬 계층(Layered RIGHT)으로 정렬하고 `TIDY_RANK_SEP=120`, `TIDY_NODE_SEP=48` 간격을 부여한다.
 * 원본: `computeTidyUpLayout` (`18-07-workflow-v2-dag-execution-import-export-p1.js`)
 */
export function computeAsset3dTidyUpLayeredLayout(
  nodes: readonly StudioAsset3dCanvasNodeRect[],
  edges: readonly StudioAsset3dTidyEdgeInput[],
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const result = new Map<string, { readonly x: number; readonly y: number }>();
  if (nodes.length === 0) return result;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const rankById = new Map<string, number>();
  for (const n of nodes) rankById.set(n.id, 0);

  for (let iter = 0; iter < nodes.length; iter += 1) {
    for (const edge of edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
      const srcRank = rankById.get(edge.source) ?? 0;
      const dstRank = rankById.get(edge.target) ?? 0;
      if (dstRank <= srcRank) {
        rankById.set(edge.target, srcRank + 1);
      }
    }
  }

  const originX = Math.min(...nodes.map((n) => n.x));
  const originY = Math.min(...nodes.map((n) => n.y));

  const byRank = new Map<number, StudioAsset3dCanvasNodeRect[]>();
  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const r = rankById.get(node.id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(node);
    byRank.set(r, list);
  }

  let cursorX = originX;
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
  for (const r of sortedRanks) {
    const col = byRank.get(r)!;
    let cursorY = originY;
    let maxWidth = 0;
    for (const node of col) {
      const h = node.height > 0 ? node.height : ASSET3D_TIDY_LAYOUT_CONSTANTS.TIDY_FALLBACK_HEIGHT;
      result.set(node.id, { x: cursorX, y: cursorY });
      cursorY += h + ASSET3D_TIDY_LAYOUT_CONSTANTS.TIDY_NODE_SEP;
      if (node.width > maxWidth) maxWidth = node.width;
    }
    cursorX += maxWidth + ASSET3D_TIDY_LAYOUT_CONSTANTS.TIDY_RANK_SEP;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 4. Flow AI Composer Agent & Universal 3D Agent 30-Tool Sandbox (Modules 19 & 25)
// ---------------------------------------------------------------------------

export const STUDIO_ASSET3D_FLOW_AGENT_TOOL_VERBS: Readonly<
  Record<string, readonly [past: string, progressive: string, noun: string]>
> = {
  create_node: ["Created", "Creating", "node"],
  connect_edge: ["Connected", "Connecting", "edge"],
  delete_node: ["Deleted", "Deleting", "node"],
  move_node: ["Moved", "Moving", "node"],
  set_node_input: ["Updated", "Updating", "input"],
} as const;

export const STUDIO_ASSET3D_FLOW_AGENT_SUGGESTIONS: readonly string[] = [
  "Turn a reference image into a 3D asset",
  "Add PBR textures to the selected mesh",
  "Remesh everything under 8k triangles",
  "Explain what this workflow does",
] as const;

/**
 * 원본: `toolPhrase(dr, ir, mr)` (`19-08-flow-composer-agent-bvh-docs-p1.js`)
 */
export function formatAsset3dFlowAgentToolPhrase(
  toolName: string,
  count: number,
  running: boolean,
): string {
  const verbs = STUDIO_ASSET3D_FLOW_AGENT_TOOL_VERBS[toolName];
  if (verbs) {
    const [past, progressive, noun] = verbs;
    return running ? `${progressive} ${noun}s…` : `${past} ${count} ${noun}${count === 1 ? "" : "s"}`;
  }
  if (toolName === "estimate_run") {
    return running ? "Estimating run cost…" : "Estimated run cost";
  }
  if (toolName.startsWith("get_")) {
    return `${running ? "Reading" : "Read"} ${toolName.slice(4).replaceAll("_", " ")}`;
  }
  return count === 1 ? toolName : `${toolName} ×${count}`;
}

export const ASSET3D_UNIVERSAL_AGENT_MAX_STEPS = 80;
export const ASSET3D_UNIVERSAL_AGENT_APP_SANDBOX =
  "allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals allow-downloads allow-orientation-lock";

export interface StudioAsset3dUniversalAgentToolSpec {
  readonly name: string;
  readonly label: string;
  readonly category: "canvas" | "generation-3d" | "mini-app" | "code-runner" | "jobs";
}

export const STUDIO_ASSET3D_UNIVERSAL_AGENT_TOOLS: readonly StudioAsset3dUniversalAgentToolSpec[] = [
  { name: "write_text", label: "Writing", category: "canvas" },
  { name: "update_text", label: "Editing", category: "canvas" },
  { name: "todo_dag", label: "Planning", category: "canvas" },
  { name: "set_node_status", label: "Updating", category: "canvas" },
  { name: "set_node_content", label: "Writing", category: "canvas" },
  { name: "measure_node", label: "Measuring", category: "canvas" },
  { name: "generate_image", label: "Starting image job", category: "generation-3d" },
  { name: "generate_3d", label: "Starting 3D job", category: "generation-3d" },
  { name: "rig_3d", label: "Starting rigging job", category: "generation-3d" },
  { name: "search_animations", label: "Searching animations", category: "generation-3d" },
  { name: "animate_3d", label: "Starting animation job", category: "generation-3d" },
  { name: "view_image", label: "Looking at image", category: "generation-3d" },
  { name: "run_code", label: "Running code", category: "code-runner" },
  { name: "create_app", label: "Creating app", category: "mini-app" },
  { name: "write_app_file", label: "Coding", category: "mini-app" },
  { name: "read_app_file", label: "Reading code", category: "mini-app" },
  { name: "list_app_files", label: "Reading code", category: "mini-app" },
  { name: "delete_app_file", label: "Coding", category: "mini-app" },
  { name: "copy_asset_to_app", label: "Packing assets", category: "mini-app" },
  { name: "reload_app", label: "Running app", category: "mini-app" },
  { name: "inspect_app", label: "Inspecting app", category: "mini-app" },
  { name: "screenshot_app", label: "Looking at app", category: "mini-app" },
  { name: "list_jobs", label: "Checking jobs", category: "jobs" },
  { name: "wait_jobs", label: "Waiting for jobs", category: "jobs" },
  { name: "cancel_job", label: "Cancelling job", category: "jobs" },
  { name: "move_items", label: "Rearranging", category: "canvas" },
  { name: "remove_items", label: "Erasing", category: "canvas" },
  { name: "clear_canvas", label: "Clearing", category: "canvas" },
  { name: "get_canvas", label: "Looking", category: "canvas" },
  { name: "end_turn", label: "", category: "jobs" },
] as const;

export interface StudioAsset3dUniversalGenerate3dInput {
  readonly frontImageId: string;
  readonly backImageId?: string;
  readonly leftImageId?: string;
  readonly rightImageId?: string;
  readonly polygonCount: number;
  readonly tPose: boolean;
  readonly pbr: boolean;
}

/**
 * 원본: `TOOLS.generate_3d.run` (`25-09-external-api-mcp-afs-lab-universal-agent-routes-p2.js`)
 * - 멀티뷰(back/left/right) 입력이 있을 때는 `t_pose` 및 `pbr` 동시 사용 불가
 * - `polygonCount`는 `0`(자동) 또는 `1,000 ~ 1,000,000` 범위여야 함
 */
export function validateAsset3dUniversalAgentGenerate3dCall(
  input: StudioAsset3dUniversalGenerate3dInput,
): { readonly ok: boolean; readonly error: string | null } {
  const hasMultiview =
    Boolean(input.backImageId?.trim()) ||
    Boolean(input.leftImageId?.trim()) ||
    Boolean(input.rightImageId?.trim());
  if (hasMultiview && (input.tPose || input.pbr)) {
    return {
      ok: false,
      error: "t_pose and pbr are available for single-image 3D generation only",
    };
  }
  if (input.polygonCount !== 0 && (input.polygonCount < 1_000 || input.polygonCount > 1_000_000)) {
    return {
      ok: false,
      error: "polygon_count must be 0 or 1000-1000000",
    };
  }
  return { ok: true, error: null };
}

// ---------------------------------------------------------------------------
// 5. AFS Asset File System, External API v1/v2, Official DCC Plugins & tRPC (Modules 03, 08, 22, 24)
// ---------------------------------------------------------------------------

export const STUDIO_ASSET3D_FORMAT_BADGE_STYLES = {
  "3D": "bg-[rgba(72,22,155,0.62)]",
  Image: "bg-[rgba(13,104,25,0.62)]",
  Workflow: "bg-[#1E54C19E]",
  Folder: "bg-[rgba(58,60,68,0.62)]",
} as const;

export interface StudioAsset3dExternalApiEndpointSpec {
  readonly method: "POST" | "GET";
  readonly path: string;
  readonly summary: string;
  readonly slug: string;
  readonly deprecated: boolean;
}

/**
 * 원본: `ENDPOINT_INDEX` (`24-09-external-api-mcp-afs-lab-universal-agent-routes-p1.js`)
 */
export const STUDIO_ASSET3D_EXTERNAL_API_ENDPOINTS: readonly StudioAsset3dExternalApiEndpointSpec[] = [
  { method: "POST", path: "/v2/generate", summary: "Image to 3D mesh", slug: "generate", deprecated: false },
  { method: "POST", path: "/v2/ai-rig", summary: "Rig a completed mesh", slug: "ai-rig", deprecated: false },
  { method: "POST", path: "/v2/animate", summary: "Apply an animation clip", slug: "animate", deprecated: false },
  { method: "GET", path: "/v2/tasks/{id}", summary: "Poll v2 task status", slug: "task-status", deprecated: false },
  {
    method: "GET",
    path: "/v2/tasks/{id}/download-glb",
    summary: "Get a GLB download URL",
    slug: "download-glb",
    deprecated: false,
  },
  {
    method: "POST",
    path: "/v1/mv/generate",
    summary: "Multi-view to 3D mesh",
    slug: "mv-generate",
    deprecated: true,
  },
  {
    method: "GET",
    path: "/v1/mv/tasks/{id}",
    summary: "Poll MV Generate status (glbUrl inline)",
    slug: "task-status",
    deprecated: true,
  },
] as const;

export interface StudioAsset3dOfficialDccPluginSpec {
  readonly id: "blender" | "maya" | "3dsmax" | "unity" | "unreal";
  readonly labelKo: string;
  readonly version: string;
  readonly fileName: string;
  readonly downloadPath: string;
}

export const STUDIO_ASSET3D_OFFICIAL_DCC_PLUGINS: readonly StudioAsset3dOfficialDccPluginSpec[] = [
  {
    id: "blender",
    labelKo: "Blender 브리지 플러그인",
    version: "v1.1.2",
    fileName: "VARCO3D-Bridge-for-Blender-v1.1.2.zip",
    downloadPath: "/api/objects/named/18e9593c2d3ac3361a7de38c4f5734d7.zip/VARCO3D-Bridge-for-Blender-v1.1.2.zip",
  },
  {
    id: "maya",
    labelKo: "Maya 2026 브리지 플러그인",
    version: "v1.1.0",
    fileName: "VARCO3D-Bridge-for-Maya-2026-v1.1.0.msi",
    downloadPath: "/api/objects/named/4d714259859536968ce92ebfd929750f.msi/VARCO3D-Bridge-for-Maya-2026-v1.1.0.msi",
  },
  {
    id: "3dsmax",
    labelKo: "3ds Max 2026 브리지 플러그인",
    version: "v1.1.1",
    fileName: "VARCO3D-Bridge-for-3ds-Max-2026-v1.1.1.msi",
    downloadPath: "/api/objects/named/56b4c2847fc9b9075ba0b954e0e135da.msi/VARCO3D-Bridge-for-3ds-Max-2026-v1.1.1.msi",
  },
  {
    id: "unity",
    labelKo: "Unity 엔진 브리지 패키지",
    version: "v1.1.0",
    fileName: "VARCO3D-Bridge-for-Unity-v1.1.0.zip",
    downloadPath: "/api/objects/named/a4c93f773cb1c6c25e2d02d61065af46.zip/VARCO3D-Bridge-for-Unity-v1.1.0.zip",
  },
  {
    id: "unreal",
    labelKo: "Unreal Engine 5.8 플러그인",
    version: "v1.1.1",
    fileName: "VARCO3DPlugin-1.1.1-Win64-UE5.8.zip",
    downloadPath: "/api/objects/named/e8145bc737907a2988e254d85e19ef1f.zip/VARCO3DPlugin-1.1.1-Win64-UE5.8.zip",
  },
] as const;

export const STUDIO_ASSET3D_TRPC_ROUTER_SUMMARY = {
  totalProcedures: 141,
  totalRouters: 28,
  routers: [
    "afs",
    "announcement",
    "attribution",
    "banner",
    "blog",
    "customWorkflowV2",
    "customerReport",
    "devEntitlement",
    "educationPlanCode",
    "externalApi",
    "featureRequest",
    "flowAgent",
    "flowBanner",
    "heroBanner",
    "instantAction",
    "invitationCode",
    "mcp",
    "notification",
    "payment",
    "promotionCode",
    "redeemCode",
    "releaseNote",
    "routeConfig",
    "sticker",
    "task",
    "universalAgent",
    "user",
    "userStorage",
  ],
  sentryRelease: "24d981ede",
} as const;
