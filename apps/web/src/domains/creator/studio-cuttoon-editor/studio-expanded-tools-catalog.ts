/**
 * 확장 전문 도구 서랍(StudioExpandedToolsDrawer) 6대 카테고리 분류·별칭 검색·키캡 포매팅 어댑터.
 *
 * - `STUDIO_EXPANDED_ECOSYSTEM_COMMANDS`의 모든 명령을 6개 창작 카테고리에 100% 귀속한다.
 * - 정적 무거운 import 없이 지연 로더 레지스트리 메타데이터만 조회해 `studio-eager-graph` 영향 0바이트를 유지한다.
 */
import {
  STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
  searchExpandedEcosystemCommands,
  type StudioCompetitorProduct,
  type StudioExpandedCommandSearchHit,
  type StudioExpandedEcosystemCommand,
} from "../shortcuts/studio-expanded-ecosystem-commands";
import {
  getEcosystemLazyEntry,
  getEcosystemLoaderStatusBadge,
  type StudioEcosystemAvailabilityStatus,
  type StudioEcosystemLoaderId,
  type StudioEcosystemSurfaceKind,
} from "./studio-ecosystem-lazy-registry";

export type StudioExpandedToolCategoryId =
  | "2d-painting"
  | "vector-layout"
  | "bg3d-dcc"
  | "character-3d"
  | "story-planning"
  | "motion-production";

export interface StudioExpandedToolCategorySpec {
  readonly id: StudioExpandedToolCategoryId;
  readonly labelKo: string;
  readonly aliasChipKo: string;
  readonly descriptionKo: string;
  readonly searchAliases: readonly string[];
}

export const STUDIO_EXPANDED_TOOL_CATEGORIES: readonly StudioExpandedToolCategorySpec[] = Object.freeze([
  Object.freeze({
    id: "2d-painting",
    labelKo: "2D 채색·보정",
    aliasChipKo: "2D/포토샵·크리타",
    descriptionKo: "딥펜·임파스토·조정 레이어·스마트 오브젝트·AI 채색",
    searchAliases: Object.freeze(["2d", "photoshop", "krita", "procreate", "heavypaint", "csp", "포토샵", "크리타", "프로크리에이트", "클립스튜디오"]),
  }),
  Object.freeze({
    id: "vector-layout",
    labelKo: "벡터·레이아웃",
    aliasChipKo: "벡터/피그마·일러스트",
    descriptionKo: "벡터 수술·가변 폭·벡터 네트워크·자동 레이아웃·재배색",
    searchAliases: Object.freeze(["vector", "figma", "illustrator", "피그마", "일러스트", "일러스트레이터", "벡터"]),
  }),
  Object.freeze({
    id: "bg3d-dcc",
    labelKo: "3D 배경·건축",
    aliasChipKo: "3D 배경·ABLER·블렌더",
    descriptionKo: "배경 컷어웨이·조명·수면 반사·CAD 제스처·선화 아틀라스",
    searchAliases: Object.freeze(["bg3d", "abler", "blender", "sketchup", "snaptoon", "plasticity", "substance", "에이블러", "블렌더", "스케치업", "스냅툰"]),
  }),
  Object.freeze({
    id: "character-3d",
    labelKo: "3D 캐릭터·포즈",
    aliasChipKo: "3D 캐릭터·SHAPER·VRoid",
    descriptionKo: "두상 믹서·체형·손 포즈·Swing-Twist IK·턴테이블·의상",
    searchAliases: Object.freeze(["shaper", "vroid", "designdoll", "cascadeur", "clo 3d", "셰이퍼", "브이로이드", "디자인돌", "캐릭터"]),
  }),
  Object.freeze({
    id: "story-planning",
    labelKo: "스토리·무드보드",
    aliasChipKo: "스토리/Plotr·Manyfast",
    descriptionKo: "스토리 3뷰·샷 그래머·무드보드 Style DNA·6관점 검토",
    searchAliases: Object.freeze(["plotr", "manyfast", "tooning plus", "notion", "storyboarder", "pureref", "eagle", "플로터", "매니패스트", "튜닝플러스", "스토리"]),
  }),
  Object.freeze({
    id: "motion-production",
    labelKo: "모션·보이스·제작",
    aliasChipKo: "모션/보이스·프로덕션",
    descriptionKo: "애니매틱·라이브 퍼포밍·립싱크·지역 AI·키보드 트리아지",
    searchAliases: Object.freeze(["motion", "live2d", "rive", "toon boom", "typecast", "comfyui", "raycast", "linear", "모션", "보이스", "프로덕션", "타입캐스트"]),
  }),
]);

export interface StudioExpandedToolCardModel {
  readonly command: StudioExpandedEcosystemCommand;
  readonly categoryId: StudioExpandedToolCategoryId;
  readonly status: StudioEcosystemAvailabilityStatus;
  readonly statusBadgeKo: string;
  readonly surfaceKind: StudioEcosystemSurfaceKind;
  readonly primaryProduct: StudioCompetitorProduct;
  readonly aliasPreviewTerms: readonly string[];
  readonly shortcutKeycaps: readonly string[];
  readonly matchedField: StudioExpandedCommandSearchHit["matchedField"] | "category" | null;
}

const LOADER_CATEGORY_OVERRIDES: Readonly<Partial<Record<StudioEcosystemLoaderId, StudioExpandedToolCategoryId>>> = {
  "vector-surgery-engine": "vector-layout",
  "panel-knife-section": "vector-layout",
  "parametric-emotion-bubble-panel": "vector-layout",
  "vector-mask-engine": "vector-layout",
  "auto-layout-grid-engine": "vector-layout",
  "planar-shape-builder-engine": "vector-layout",
  "variable-width-tool-engine": "vector-layout",
  "vector-network-graph-engine": "vector-layout",
  "live-component-token-engine": "vector-layout",
  "recolor-artwork-engine": "vector-layout",
  "head-mixer-3d-panel": "character-3d",
  "body-ratio-matrix-pad": "character-3d",
  "hand-pose-triangle-pad": "character-3d",
  "surface-bound-stroke-controls": "character-3d",
  "twist-swing-ik-engine": "character-3d",
  "false-perspective-3d-engine": "character-3d",
  "multi-actor-ensemble-engine": "character-3d",
  "mannequin-screen-pose-engine": "character-3d",
  "anchor-3d-auto-capture-engine": "character-3d",
  "character-inline-quick-bar": "character-3d",
  "groom-guide-cage-engine": "character-3d",
  "autophysics-trajectory-engine": "character-3d",
  "vrm-video-mocap-engine": "character-3d",
  "vrm-garment-conform-engine": "character-3d",
  "shaper-15-slot-package": "character-3d",
  "vrm-pattern-sewing-drape-engine": "character-3d",
  "bg3d-wall-cutaway-toggle": "bg3d-dcc",
  "bg3d-180-axis-engine": "bg3d-dcc",
  "bg3d-ground-snap-engine": "bg3d-dcc",
  "bg3d-spatial-grease-loft-engine": "bg3d-dcc",
  "bg3d-light-switchboard-engine": "bg3d-dcc",
  "lt-vector-brush-engine": "bg3d-dcc",
  "lt-style-builder-edge-engine": "bg3d-dcc",
  "radial-pie-3d-menu": "bg3d-dcc",
  "unified-3d-stage-shell": "bg3d-dcc",
  "hybrid-cad-gestures-engine": "bg3d-dcc",
  "hybrid-sdf-clay-engine": "bg3d-dcc",
  "smart-mask-triplanar-engine": "bg3d-dcc",
  "story-find-replace-panel": "story-planning",
  "shot-grammar-floorplan-engine": "story-planning",
  "consistency-asset-strip": "story-planning",
  "story-three-view-workspace": "story-planning",
  "ai-proposal-diff-gate": "story-planning",
  "six-perspective-review-drawer": "story-planning",
  "spatial-moodboard-dna-engine": "story-planning",
  "reference-pro-overlay-engine": "story-planning",
  "asset-color-smart-folder-engine": "story-planning",
  "slash-script-director-engine": "story-planning",
  "anim-canvas-overlay": "motion-production",
  "timelapse-export-engine": "motion-production",
  "remote-companion-pairing-engine": "motion-production",
  "live-performing-recorder-engine": "motion-production",
  "neural-voice-lipsync-engine": "motion-production",
  "regional-control-stack-engine": "motion-production",
  "animatic-pacing-shotlist-engine": "motion-production",
  "dynamic-snippets-engine": "motion-production",
  "keyboard-triage-cycle-engine": "motion-production",
  "planned-live2d-artmesh-rig": "motion-production",
  "planned-rive-state-machine": "motion-production",
  "planned-multiplane-z-camera": "motion-production",
  "planned-ai-node-graph": "motion-production",
};

const PRODUCT_TO_CATEGORY: Readonly<Record<StudioCompetitorProduct, StudioExpandedToolCategoryId>> = {
  CSP: "2d-painting",
  Photoshop: "2d-painting",
  Krita: "2d-painting",
  HeavyPaint: "2d-painting",
  Procreate: "2d-painting",
  Figma: "vector-layout",
  Illustrator: "vector-layout",
  Blender: "bg3d-dcc",
  SketchUp: "bg3d-dcc",
  ABLER: "bg3d-dcc",
  Snaptoon: "bg3d-dcc",
  Plasticity: "bg3d-dcc",
  "Substance 3D": "bg3d-dcc",
  Shaper: "character-3d",
  DesignDoll: "character-3d",
  VRoid: "character-3d",
  Cascadeur: "character-3d",
  "CLO 3D": "character-3d",
  Plotr: "story-planning",
  Manyfast: "story-planning",
  "Tooning Plus": "story-planning",
  PureRef: "story-planning",
  Eagle: "story-planning",
  Notion: "story-planning",
  Storyboarder: "story-planning",
  Live2D: "motion-production",
  Rive: "motion-production",
  "Toon Boom": "motion-production",
  Typecast: "motion-production",
  ComfyUI: "motion-production",
  Raycast: "motion-production",
  Linear: "motion-production",
};

/** 단축키 문자열(예: "Shift+Alt+P")을 키캡 토큰 배열로 분해한다. */
export function formatShortcutKeycaps(shortcut?: string): readonly string[] {
  if (!shortcut) return [];
  return shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** 확장 생태계 명령을 6개 서랍 카테고리 중 하나로 결정론적 매핑한다. */
export function resolveExpandedToolCategory(
  command: StudioExpandedEcosystemCommand,
): StudioExpandedToolCategoryId {
  const byLoader = LOADER_CATEGORY_OVERRIDES[command.panelLoaderId];
  if (byLoader) return byLoader;
  const firstProduct = command.competitorAliases[0]?.product;
  if (firstProduct) return PRODUCT_TO_CATEGORY[firstProduct];
  return "2d-painting";
}

function buildToolCardModel(
  command: StudioExpandedEcosystemCommand,
  matchedField: StudioExpandedToolCardModel["matchedField"],
): StudioExpandedToolCardModel {
  const entry = getEcosystemLazyEntry(command.panelLoaderId);
  const badge = getEcosystemLoaderStatusBadge(command.panelLoaderId);
  const aliasPreviewTerms = command.competitorAliases
    .flatMap((a) => [a.product, ...a.terms.slice(0, 2)])
    .slice(0, 4);

  return {
    command,
    categoryId: resolveExpandedToolCategory(command),
    status: badge?.status ?? "planned",
    statusBadgeKo: badge?.badgeKo ?? "준비 예정",
    surfaceKind: entry?.surfaceKind ?? "engine",
    primaryProduct: command.competitorAliases[0]?.product ?? "CSP",
    aliasPreviewTerms,
    shortcutKeycaps: formatShortcutKeycaps(command.shortcut),
    matchedField,
  };
}

/** 6개 카테고리별 등록 도구 개수를 집계한다. */
export function countExpandedToolsByCategory(
  commands: readonly StudioExpandedEcosystemCommand[] = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
): Readonly<Record<StudioExpandedToolCategoryId, number>> {
  const counts: Record<StudioExpandedToolCategoryId, number> = {
    "2d-painting": 0,
    "vector-layout": 0,
    "bg3d-dcc": 0,
    "character-3d": 0,
    "story-planning": 0,
    "motion-production": 0,
  };
  for (const command of commands) {
    counts[resolveExpandedToolCategory(command)] += 1;
  }
  return counts;
}

/**
 * 선택된 카테고리("all" 또는 6종 ID)와 한국어·단축키·경쟁 툴 별칭 검색어로 도구 목록을 필터링한다.
 */
export function filterExpandedTools(options: {
  readonly categoryId: StudioExpandedToolCategoryId | "all";
  readonly query: string;
  readonly commands?: readonly StudioExpandedEcosystemCommand[];
}): readonly StudioExpandedToolCardModel[] {
  const source = options.commands ?? STUDIO_EXPANDED_ECOSYSTEM_COMMANDS;
  const trimmed = options.query.trim();

  if (!trimmed) {
    return source
      .filter((cmd) => options.categoryId === "all" || resolveExpandedToolCategory(cmd) === options.categoryId)
      .map((cmd) => buildToolCardModel(cmd, null));
  }

  const normalized = trimmed.toLowerCase();
  const hits = searchExpandedEcosystemCommands(trimmed, source);
  const matchedIds = new Map<string, StudioExpandedCommandSearchHit["matchedField"]>();
  for (const hit of hits) {
    matchedIds.set(hit.command.id, hit.matchedField);
  }

  const matchedCategoryIds = new Set<StudioExpandedToolCategoryId>(
    STUDIO_EXPANDED_TOOL_CATEGORIES.filter(
      (cat) =>
        cat.labelKo.toLowerCase().includes(normalized) ||
        cat.aliasChipKo.toLowerCase().includes(normalized) ||
        cat.searchAliases.some((a) => a.toLowerCase().includes(normalized)),
    ).map((cat) => cat.id),
  );

  const cards: StudioExpandedToolCardModel[] = [];
  for (const hit of hits) {
    const catId = resolveExpandedToolCategory(hit.command);
    if (options.categoryId !== "all" && catId !== options.categoryId) continue;
    cards.push(buildToolCardModel(hit.command, hit.matchedField));
  }

  if (matchedCategoryIds.size > 0) {
    for (const cmd of source) {
      if (matchedIds.has(cmd.id)) continue;
      const catId = resolveExpandedToolCategory(cmd);
      if (!matchedCategoryIds.has(catId)) continue;
      if (options.categoryId !== "all" && catId !== options.categoryId) continue;
      cards.push(buildToolCardModel(cmd, "category"));
    }
  }

  return cards;
}
