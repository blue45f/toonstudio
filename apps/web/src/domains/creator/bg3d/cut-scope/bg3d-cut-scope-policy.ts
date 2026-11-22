/**
 * 3D 배경 편집 적용 범위 분류 및 다중 컷 공유 배경 확인 정책.
 *
 * - `cut-only`: 카메라·벽 컷어웨이·컷별 조명·컷별 숨김 태그 등 현재 컷에만 국한된 조작.
 *   공유 배경에 연결된 다른 컷을 건드리지 않으므로 잠금·팝업 없이 즉시 통과한다.
 * - `shared-background`: 가구 이동·소품 변형·재질 교체·모델 추가/삭제·건축 구조 변경 등
 *   배경 씬 자체를 바꾸는 조작. 1컷 단독 사용 시에는 즉시 통과하고, 2컷 이상이 같은 배경을
 *   공유할 때만 `detach-cut-only`(이 컷만 분리 적용) / `apply-all-linked`(연동 N컷 전체 반영)
 *   선택 정책을 산출한다.
 */

import { asSceneLinkedStoryboardCut } from "../studio-bg3d-storyboard-cut-link";
import type { StoryboardCut } from "../../scene-3d/studio-3d-storyboard-cut-strip";

export type Bg3dEditScope = "cut-only" | "shared-background";

export type Bg3dCutOnlyActionKind =
  | "camera-orbit"
  | "camera-fov"
  | "camera-projection"
  | "wall-cutaway"
  | "cut-lighting"
  | "cut-hidden-tags";

export type Bg3dSharedBackgroundActionKind =
  | "move-furniture"
  | "rotate-scale-prop"
  | "replace-material"
  | "delete-model"
  | "insert-model"
  | "edit-architecture"
  | "replace-shared-hdri";

export type Bg3dEditActionKind =
  | Bg3dCutOnlyActionKind
  | Bg3dSharedBackgroundActionKind;

export type Bg3dMultiCutResolutionMode =
  | "detach-cut-only"
  | "apply-all-linked";

export type Bg3dCutScopeBadgeMode = "cut-only" | "shared-linked";

export type Bg3dImmediatePassReason =
  | "cut-only-action"
  | "single-cut-standalone";

export interface Bg3dEditActionSpec {
  readonly kind: Bg3dEditActionKind;
  readonly scope: Bg3dEditScope;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly affectsGeometryOrAssets: boolean;
}

export const BG3D_EDIT_ACTION_CATALOG: Readonly<
  Record<Bg3dEditActionKind, Bg3dEditActionSpec>
> = Object.freeze({
  "camera-orbit": Object.freeze({
    kind: "camera-orbit",
    scope: "cut-only",
    labelKo: "카메라 구도 이동",
    summaryKo: "현재 컷의 카메라 위치와 시선만 바뀝니다.",
    affectsGeometryOrAssets: false,
  }),
  "camera-fov": Object.freeze({
    kind: "camera-fov",
    scope: "cut-only",
    labelKo: "카메라 화각 변경",
    summaryKo: "현재 컷의 렌즈 화각만 조정합니다.",
    affectsGeometryOrAssets: false,
  }),
  "camera-projection": Object.freeze({
    kind: "camera-projection",
    scope: "cut-only",
    labelKo: "원근·직교 투영 전환",
    summaryKo: "현재 컷의 카메라 투영 방식만 전환합니다.",
    affectsGeometryOrAssets: false,
  }),
  "wall-cutaway": Object.freeze({
    kind: "wall-cutaway",
    scope: "cut-only",
    labelKo: "벽 컷어웨이 조정",
    summaryKo: "현재 컷 시야를 가리는 벽만 임시로 가립니다.",
    affectsGeometryOrAssets: false,
  }),
  "cut-lighting": Object.freeze({
    kind: "cut-lighting",
    scope: "cut-only",
    labelKo: "컷별 조명·노출 조정",
    summaryKo: "현재 컷의 조명 각도와 노출값만 바뀝니다.",
    affectsGeometryOrAssets: false,
  }),
  "cut-hidden-tags": Object.freeze({
    kind: "cut-hidden-tags",
    scope: "cut-only",
    labelKo: "컷별 숨김 태그 조정",
    summaryKo: "현재 컷에서만 선택한 태그 오브젝트를 숨깁니다.",
    affectsGeometryOrAssets: false,
  }),
  "move-furniture": Object.freeze({
    kind: "move-furniture",
    scope: "shared-background",
    labelKo: "가구 위치 이동",
    summaryKo: "공유 배경의 가구 배치가 연동된 컷 전체에 영향을 줍니다.",
    affectsGeometryOrAssets: true,
  }),
  "rotate-scale-prop": Object.freeze({
    kind: "rotate-scale-prop",
    scope: "shared-background",
    labelKo: "소품 회전·크기 변경",
    summaryKo: "공유 배경의 소품 형태 변경이 연동된 컷 전체에 반영됩니다.",
    affectsGeometryOrAssets: true,
  }),
  "replace-material": Object.freeze({
    kind: "replace-material",
    scope: "shared-background",
    labelKo: "재질·텍스처 교체",
    summaryKo: "공유 배경의 재질 교체가 연동된 컷 전체에 반영됩니다.",
    affectsGeometryOrAssets: true,
  }),
  "delete-model": Object.freeze({
    kind: "delete-model",
    scope: "shared-background",
    labelKo: "모델 삭제",
    summaryKo: "공유 배경에서 모델을 지우면 연동된 다른 컷에서도 사라집니다.",
    affectsGeometryOrAssets: true,
  }),
  "insert-model": Object.freeze({
    kind: "insert-model",
    scope: "shared-background",
    labelKo: "모델 배치 추가",
    summaryKo: "공유 배경에 추가한 모델이 연동된 컷 전체에 함께 나타납니다.",
    affectsGeometryOrAssets: true,
  }),
  "edit-architecture": Object.freeze({
    kind: "edit-architecture",
    scope: "shared-background",
    labelKo: "벽·바닥 구조 수정",
    summaryKo: "공유 배경 건축 구조 변경이 연동된 컷 전체에 반영됩니다.",
    affectsGeometryOrAssets: true,
  }),
  "replace-shared-hdri": Object.freeze({
    kind: "replace-shared-hdri",
    scope: "shared-background",
    labelKo: "공유 환경광 교체",
    summaryKo: "배경 공용 환경광이 연동된 컷 전체에 함께 바뀝니다.",
    affectsGeometryOrAssets: false,
  }),
});

export interface Bg3dCutLinkRef {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly title: string;
  readonly backgroundSceneId: string;
  readonly detachedFromSceneId?: string | null;
}

export interface Bg3dCutScopeEvaluationInput {
  readonly actionKind: Bg3dEditActionKind;
  readonly activeCutId: string;
  readonly activeCutNumber: number;
  readonly backgroundSceneId: string;
  readonly linkedCuts: readonly Bg3dCutLinkRef[];
  readonly targetLabelKo?: string;
}

export interface Bg3dCutScopeDecision {
  readonly actionKind: Bg3dEditActionKind;
  readonly actionSpec: Bg3dEditActionSpec;
  readonly scope: Bg3dEditScope;
  readonly activeCutId: string;
  readonly activeCutNumber: number;
  readonly backgroundSceneId: string;
  readonly linkedCutCount: number;
  readonly linkedCutIds: readonly string[];
  readonly otherAffectedCutIds: readonly string[];
  readonly otherAffectedCutNumbers: readonly number[];
  readonly requiresConfirmation: boolean;
  readonly immediatePassReason: Bg3dImmediatePassReason | null;
  readonly availableResolutions: readonly Bg3dMultiCutResolutionMode[];
  readonly defaultResolution: Bg3dMultiCutResolutionMode | null;
  readonly badgeMode: Bg3dCutScopeBadgeMode;
  readonly badgeLabelKo: string;
  readonly confirmationMessageKo: string | null;
}

export interface ApplyBg3dMultiCutResolutionInput {
  readonly decision: Bg3dCutScopeDecision;
  readonly resolution: Bg3dMultiCutResolutionMode;
  readonly linkedCuts: readonly Bg3dCutLinkRef[];
  readonly detachedSceneIdFactory?: (
    baseSceneId: string,
    cutId: string,
    cutNumber: number,
  ) => string;
}

export interface Bg3dMultiCutResolutionResult {
  readonly resolution: Bg3dMultiCutResolutionMode;
  readonly sourceSceneId: string;
  readonly targetSceneId: string;
  readonly activeCutId: string;
  readonly activeCutNumber: number;
  readonly affectedCutIds: readonly string[];
  readonly unaffectedCutIds: readonly string[];
  readonly remainingSharedLinkCount: number;
  readonly updatedCutLinks: readonly Bg3dCutLinkRef[];
  readonly summaryKo: string;
}

export function classifyBg3dEditAction(
  actionKind: Bg3dEditActionKind,
): Bg3dEditActionSpec {
  return BG3D_EDIT_ACTION_CATALOG[actionKind];
}

export function isCutOnlyBg3dAction(
  actionKind: Bg3dEditActionKind,
): actionKind is Bg3dCutOnlyActionKind {
  return BG3D_EDIT_ACTION_CATALOG[actionKind].scope === "cut-only";
}

export function isSharedBackgroundBg3dAction(
  actionKind: Bg3dEditActionKind,
): actionKind is Bg3dSharedBackgroundActionKind {
  return BG3D_EDIT_ACTION_CATALOG[actionKind].scope === "shared-background";
}

function normalizePositiveCutNumber(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

function formatCutNumberListKo(cutNumbers: readonly number[]): string {
  if (cutNumbers.length === 0) return "";
  if (cutNumbers.length <= 4) {
    return cutNumbers.map((num) => `#${num}`).join(", ");
  }
  const head = cutNumbers
    .slice(0, 3)
    .map((num) => `#${num}`)
    .join(", ");
  return `${head} 외 ${cutNumbers.length - 3}컷`;
}

/**
 * 컷 스트립의 `StoryboardCut[]`에서 공유 배경 씬 연결 목록을 뽑는다.
 * `sceneMeta`가 없는 수동 컷은 `fallbackSceneId`가 명시된 경우에만 그 씬에 묶고,
 * 그렇지 않으면 컷별 독립 식별자로 분리해 거짓 연동 표시를 막는다.
 */
export function extractCutLinksFromStoryboardCuts(
  cuts: readonly StoryboardCut[],
  fallbackSceneId?: string,
): readonly Bg3dCutLinkRef[] {
  const normalizedFallback = fallbackSceneId?.trim() || null;
  const links: Bg3dCutLinkRef[] = [];
  const seen = new Set<string>();

  for (const cut of cuts) {
    if (seen.has(cut.id)) continue;
    seen.add(cut.id);
    const linked = asSceneLinkedStoryboardCut(cut);
    const backgroundSceneId =
      linked?.sceneMeta.sceneId ??
      normalizedFallback ??
      `isolated-cut:${cut.id}`;
    links.push(
      Object.freeze({
        cutId: cut.id,
        cutNumber: normalizePositiveCutNumber(cut.cutNumber),
        title: cut.title,
        backgroundSceneId,
        detachedFromSceneId: null,
      }),
    );
  }

  return Object.freeze(links);
}

/**
 * 3D 배경 편집 액션의 적용 범위와 다중 컷 확인 필요 여부를 산출한다.
 * - `cut-only` 액션: 연동 컷이 몇 개든 잠금·확인 없이 즉시 통과.
 * - `shared-background` 액션 + 1컷 단독: 잠금·확인 없이 즉시 통과.
 * - `shared-background` 액션 + 2컷 이상 공유: 확인 바 표시 및 분리/전체 반영 선택지 산출.
 */
export function evaluateBg3dCutScope(
  input: Bg3dCutScopeEvaluationInput,
): Bg3dCutScopeDecision {
  const actionSpec = classifyBg3dEditAction(input.actionKind);
  const activeCutId = input.activeCutId.trim() || "cut-active";
  const activeCutNumber = normalizePositiveCutNumber(input.activeCutNumber);
  const backgroundSceneId = input.backgroundSceneId.trim() || "scene-default";

  const byCutId = new Map<string, Bg3dCutLinkRef>();
  for (const link of input.linkedCuts) {
    if (link.backgroundSceneId !== backgroundSceneId) continue;
    if (!byCutId.has(link.cutId)) {
      byCutId.set(link.cutId, link);
    }
  }

  if (!byCutId.has(activeCutId)) {
    byCutId.set(
      activeCutId,
      Object.freeze({
        cutId: activeCutId,
        cutNumber: activeCutNumber,
        title: `컷 ${activeCutNumber}`,
        backgroundSceneId,
        detachedFromSceneId: null,
      }),
    );
  }

  const sameSceneCuts = [...byCutId.values()].sort(
    (a, b) => a.cutNumber - b.cutNumber || a.cutId.localeCompare(b.cutId),
  );
  const otherCuts = sameSceneCuts.filter((cut) => cut.cutId !== activeCutId);
  const linkedCutCount = sameSceneCuts.length;
  const isMultiCutShared =
    actionSpec.scope === "shared-background" && linkedCutCount >= 2;

  const immediatePassReason: Bg3dImmediatePassReason | null =
    actionSpec.scope === "cut-only"
      ? "cut-only-action"
      : linkedCutCount <= 1
        ? "single-cut-standalone"
        : null;

  const badgeMode: Bg3dCutScopeBadgeMode = isMultiCutShared
    ? "shared-linked"
    : "cut-only";

  const badgeLabelKo = isMultiCutShared
    ? `공유 배경 · ${linkedCutCount}컷 연동`
    : actionSpec.scope === "cut-only"
      ? `현재 컷 #${activeCutNumber} 카메라만`
      : `현재 컷 #${activeCutNumber} 단독 배경`;

  const otherAffectedCutNumbers = Object.freeze(
    otherCuts.map((cut) => normalizePositiveCutNumber(cut.cutNumber)),
  );
  const otherAffectedCutIds = Object.freeze(otherCuts.map((cut) => cut.cutId));
  const linkedCutIds = Object.freeze(sameSceneCuts.map((cut) => cut.cutId));

  const targetPrefix = input.targetLabelKo?.trim()
    ? `‘${input.targetLabelKo.trim()}’ `
    : "";
  const confirmationMessageKo = isMultiCutShared
    ? `${targetPrefix}${actionSpec.labelKo} 변경이 연동된 ${linkedCutCount}컷(컷 #${activeCutNumber} 외 ${formatCutNumberListKo(otherAffectedCutNumbers)})에 반영됩니다.`
    : null;

  return Object.freeze({
    actionKind: input.actionKind,
    actionSpec,
    scope: actionSpec.scope,
    activeCutId,
    activeCutNumber,
    backgroundSceneId,
    linkedCutCount,
    linkedCutIds,
    otherAffectedCutIds,
    otherAffectedCutNumbers,
    requiresConfirmation: isMultiCutShared,
    immediatePassReason,
    availableResolutions: isMultiCutShared
      ? Object.freeze<readonly Bg3dMultiCutResolutionMode[]>([
          "detach-cut-only",
          "apply-all-linked",
        ])
      : Object.freeze<readonly Bg3dMultiCutResolutionMode[]>([]),
    defaultResolution: isMultiCutShared ? "detach-cut-only" : null,
    badgeMode,
    badgeLabelKo,
    confirmationMessageKo,
  });
}

function buildUniqueDetachedSceneId(
  baseSceneId: string,
  cutId: string,
  cutNumber: number,
  existingSceneIds: ReadonlySet<string>,
  factory?: (
    baseSceneId: string,
    cutId: string,
    cutNumber: number,
  ) => string,
): string {
  const safeCutId = cutId.replace(/[^A-Za-z0-9_-]/g, "-") || "cut";
  const candidate = factory
    ? factory(baseSceneId, cutId, cutNumber)
    : `${baseSceneId}__cut-${cutNumber}-${safeCutId}`;

  if (!existingSceneIds.has(candidate)) {
    return candidate;
  }

  let suffix = 2;
  while (existingSceneIds.has(`${candidate}-${suffix}`)) {
    suffix += 1;
  }
  return `${candidate}-${suffix}`;
}

/**
 * 다중 컷 공유 배경 변경 확인 선택(`detach-cut-only` vs `apply-all-linked`)을
 * 불변 링크 상태로 반영한다.
 *
 * - `detach-cut-only`: 현재 컷만 새 분리 씬 ID로 분기하고, 나머지 연동 컷들은
 *   원본 공유 배경 ID를 그대로 유지한다.
 * - `apply-all-linked`: 연동된 모든 컷이 공유 배경 ID를 유지한 채 변경을 공유한다.
 */
export function applyBg3dMultiCutResolution(
  input: ApplyBg3dMultiCutResolutionInput,
): Bg3dMultiCutResolutionResult {
  const { decision, resolution, linkedCuts } = input;
  const sourceSceneId = decision.backgroundSceneId;

  if (resolution === "detach-cut-only") {
    const existingSceneIds = new Set<string>([
      sourceSceneId,
      ...linkedCuts.map((link) => link.backgroundSceneId),
    ]);
    const detachedSceneId = buildUniqueDetachedSceneId(
      sourceSceneId,
      decision.activeCutId,
      decision.activeCutNumber,
      existingSceneIds,
      input.detachedSceneIdFactory,
    );

    let activeFound = false;
    const updatedLinks = linkedCuts.map((link) => {
      if (link.cutId !== decision.activeCutId) {
        return link;
      }
      activeFound = true;
      return Object.freeze({
        ...link,
        backgroundSceneId: detachedSceneId,
        detachedFromSceneId: sourceSceneId,
      });
    });

    if (!activeFound) {
      updatedLinks.push(
        Object.freeze({
          cutId: decision.activeCutId,
          cutNumber: decision.activeCutNumber,
          title: `컷 ${decision.activeCutNumber}`,
          backgroundSceneId: detachedSceneId,
          detachedFromSceneId: sourceSceneId,
        }),
      );
    }

    const remainingSharedLinkCount = updatedLinks.filter(
      (link) => link.backgroundSceneId === sourceSceneId,
    ).length;

    return Object.freeze({
      resolution,
      sourceSceneId,
      targetSceneId: detachedSceneId,
      activeCutId: decision.activeCutId,
      activeCutNumber: decision.activeCutNumber,
      affectedCutIds: Object.freeze([decision.activeCutId]),
      unaffectedCutIds: decision.otherAffectedCutIds,
      remainingSharedLinkCount,
      updatedCutLinks: Object.freeze(updatedLinks),
      summaryKo: `컷 #${decision.activeCutNumber}만 별도 배경으로 분리해 적용했습니다. 나머지 ${decision.otherAffectedCutIds.length}컷은 원본 공유 배경을 유지합니다.`,
    });
  }

  return Object.freeze({
    resolution: "apply-all-linked",
    sourceSceneId,
    targetSceneId: sourceSceneId,
    activeCutId: decision.activeCutId,
    activeCutNumber: decision.activeCutNumber,
    affectedCutIds: decision.linkedCutIds,
    unaffectedCutIds: Object.freeze([]),
    remainingSharedLinkCount: decision.linkedCutCount,
    updatedCutLinks: Object.freeze([...linkedCuts]),
    summaryKo: `연동된 ${decision.linkedCutCount}컷 전체의 공유 배경에 변경을 반영했습니다.`,
  });
}

/**
 * `StoryboardCut[]` 배열에서 지정한 컷 1개의 `sceneMeta.sceneId`만 불변으로 분리한다.
 * 다른 컷의 객체 참조와 카메라·조명·포즈 메타는 손대지 않는다.
 */
export function detachStoryboardCutBackground(
  cuts: readonly StoryboardCut[],
  targetCutId: string,
  detachedSceneId: string,
): readonly StoryboardCut[] {
  const nextSceneId = detachedSceneId.trim();
  if (!nextSceneId) {
    throw new Error("분리할 배경 씬 ID가 비어 있습니다.");
  }

  return Object.freeze(
    cuts.map((cut) => {
      if (cut.id !== targetCutId || !cut.sceneMeta) {
        return cut;
      }
      return Object.freeze({
        ...cut,
        sceneMeta: Object.freeze({
          ...cut.sceneMeta,
          sceneId: nextSceneId,
        }),
      });
    }),
  );
}
