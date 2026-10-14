/**
 * Studio Cut Pose — 컷(페이지) 단위 포즈 추천 적용의 순수 로직.
 *
 * 포즈 추천 엔진(`scene-3d/studio-pose-suggestion`)과 추천 패널은 포저 표면을 전제로
 * 만들어졌지만, 작가의 실제 동선은 콘티·컷 편집에서 "이 컷에 맞는 포즈"를 정하는 것이다.
 * 이 모듈은 그 연결층이다:
 *
 * - 포즈는 `studio-panel-shot-tags` 의 샷 태그와 같은 방식으로 페이지 객체의 옵셔널 필드
 *   `posePresetId` 로 실려 pagesList JSON 직렬화에 그대로 편승한다. 과거 문서(필드 없음)는
 *   포즈 미적용으로 자연 호환하고, 포즈를 지우면 키 자체를 제거해 직렬화 형태가 레거시와
 *   동일하게 유지된다.
 * - `withCutPose` 는 withShotTag/withPageMeta 와 동일 계약: 불변, 대상 없음/실질 변화
 *   없음이면 원본 배열 참조를 그대로 반환(호출측이 `next !== pages` 로 undo 히스토리
 *   커밋 여부를 판단 가능).
 * - 적용은 `CutPoseChange`(before/after) 기록을 함께 돌려주고, 되돌리기는 현재 값이
 *   그 적용의 after 와 같을 때만 before 로 되돌린다 — 적용 뒤 작가가 포즈를 또 바꿨으면
 *   되돌리기가 그 변경을 덮지 않는다.
 * - 추천 맥락은 컷이 이미 가진 정보(메모=장면 설명, 투샷 태그=2인)에서 도출한다.
 *   컷에 없는 정보(대사 등)는 지어내지 않고 패널 입력으로 남긴다.
 *
 * 전부 불변 · 부수효과 없음. DOM/Konva/React 의존 없음.
 */

import type {
  PoseCatalogEntry,
  PoseSuggestionContext,
} from "./scene-3d/studio-pose-suggestion";

/** 포즈를 실을 수 있는 컷(페이지) 최소 형태(외부 문서는 타입 보장이 없어 unknown 허용). */
export interface CutPoseCarrier {
  id: string;
  posePresetId?: unknown;
  name?: unknown;
  note?: unknown;
  shotType?: unknown;
}

/** 정규화된 포즈 id — 빈 문자열·비문자열·공백뿐인 값은 "포즈 없음"이다. */
export function cleanCutPoseId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** 컷에 현재 적용된 포즈 id(정규화). 없으면 undefined. */
export function readCutPoseId(page: Pick<CutPoseCarrier, "posePresetId">): string | undefined {
  return cleanCutPoseId(page.posePresetId);
}

/**
 * 컷 포즈 설정/제거 — 불변. presetId 가 null/빈 값이면 키를 통째로 제거한다.
 * 대상 컷이 없거나 실질 변화가 없으면 원본 배열 참조를 그대로 반환한다.
 */
export function withCutPose<P extends CutPoseCarrier>(
  pages: readonly P[],
  pageId: string,
  presetId: string | null,
): P[] {
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return pages as P[];
  const page = pages[idx]!;

  const next = cleanCutPoseId(presetId);
  if (next === readCutPoseId(page)) return pages as P[];

  const nextPage = { ...page } as P & { posePresetId?: unknown };
  if (next === undefined) delete nextPage.posePresetId;
  else nextPage.posePresetId = next;
  return pages.map((p, i) => (i === idx ? (nextPage as P) : p));
}

/** 한 번의 포즈 적용 기록 — 되돌리기의 근거. before 가 null 이면 적용 전 포즈 없음. */
export interface CutPoseChange {
  readonly pageId: string;
  readonly before: string | null;
  readonly after: string | null;
}

/**
 * 추천 적용 — 새 페이지 배열과 되돌리기용 변경 기록을 함께 돌려준다.
 * 대상이 없거나 이미 같은 포즈면 change 는 null 이고 배열 참조도 그대로다.
 */
export function applyCutPoseRecommendation<P extends CutPoseCarrier>(
  pages: readonly P[],
  pageId: string,
  presetId: string,
): { readonly pages: P[]; readonly change: CutPoseChange | null } {
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { pages: pages as P[], change: null };
  const after = cleanCutPoseId(presetId);
  if (after === undefined) return { pages: pages as P[], change: null };
  const before = readCutPoseId(page) ?? null;
  if (before === after) return { pages: pages as P[], change: null };
  return {
    pages: withCutPose(pages, pageId, after),
    change: Object.freeze({ pageId, before, after }),
  };
}

/**
 * 적용 되돌리기 — 현재 포즈가 변경 기록의 after 와 같을 때만 before 로 되돌린다.
 * 적용 이후 다른 포즈로 바뀐 컷은 건드리지 않고 원본 참조를 반환한다(덮어쓰기 방지).
 */
export function undoCutPoseChange<P extends CutPoseCarrier>(
  pages: readonly P[],
  change: CutPoseChange,
): P[] {
  const page = pages.find((p) => p.id === change.pageId);
  if (!page) return pages as P[];
  if ((readCutPoseId(page) ?? null) !== change.after) return pages as P[];
  return withCutPose(pages, change.pageId, change.before);
}

/**
 * 컷이 이미 가진 정보로 추천 맥락을 도출한다.
 * - 장면 설명: 메모(note) 우선, 없으면 컷 이름(name).
 * - 인원: 샷 태그가 투샷(two-shot)이면 2인, 그 외에는 단정하지 않는다(undefined).
 */
export function buildCutPoseContext(page: CutPoseCarrier): PoseSuggestionContext {
  const note = typeof page.note === "string" ? page.note.trim() : "";
  const name = typeof page.name === "string" ? page.name.trim() : "";
  const sceneDescription = note || name;
  const context: { sceneDescription?: string; figures?: 1 | 2 } = {};
  if (sceneDescription) context.sceneDescription = sceneDescription;
  if (page.shotType === "two-shot") context.figures = 2;
  return Object.freeze(context);
}

/** 고급 포즈 라이브러리 프리셋의 메타 부분집합(구조 호환 — 라이브러리 모듈을 직접 import 하지 않는다). */
export interface AdvancedPosePresetMeta {
  readonly id: string;
  readonly name: string;
  readonly category: PoseCatalogEntry["category"];
  readonly gender: PoseCatalogEntry["gender"];
  readonly figures: PoseCatalogEntry["figures"];
  readonly tags: readonly string[];
  readonly description: string;
}

/** 고급 포즈 라이브러리 프리셋 목록을 추천 엔진 카탈로그로 변환한다. */
export function poseCatalogFromAdvancedPresets(
  presets: readonly AdvancedPosePresetMeta[],
): PoseCatalogEntry[] {
  return presets.map((preset) =>
    Object.freeze({
      id: preset.id,
      name: preset.name,
      category: preset.category,
      gender: preset.gender,
      figures: preset.figures,
      tags: preset.tags,
      description: preset.description,
    }),
  );
}

/** 적용된 포즈의 표시 이름 — 카탈로그에 없으면 id 자체를 돌려준다(오래된 문서의 잔존 id 포함). */
export function cutPoseName(
  page: Pick<CutPoseCarrier, "posePresetId">,
  catalog: readonly PoseCatalogEntry[],
): string | null {
  const id = readCutPoseId(page);
  if (id === undefined) return null;
  return catalog.find((entry) => entry.id === id)?.name ?? id;
}
