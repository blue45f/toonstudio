/**
 * 통합 키워드(소재·관계·전개·분위기) 포함 + 트리거워닝 안전 제외 파인더 모델 (AC-015 / F06).
 *
 * 18개 플랫폼에 흩어진 코드·클리셰 태그를 단일 파인더 조건으로 조합하고,
 * 독자가 회피하고 싶은 트리거워닝 요소를 제외 쿼리(`/explore?...`)로 직렬화 및 실제 카탈로그 필터링한다.
 */

export type TagFinderAxis = "trope" | "relationship" | "pacing" | "mood" | "trigger-exclude";

export interface TagFinderChip {
  readonly id: string;
  readonly axis: TagFinderAxis;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly matchKeywords: readonly string[];
}

export const DISCOVER_TAG_FINDER_CHIPS: readonly TagFinderChip[] = Object.freeze([
  { id: "regression", axis: "trope", labelKo: "회귀·환생", labelEn: "Regression", matchKeywords: ["회귀", "환생", "빙의", "전생"] },
  { id: "academy", axis: "trope", labelKo: "아카데미·성장", labelEn: "Academy", matchKeywords: ["아카데미", "학교", "학원", "성장"] },
  { id: "contract-marriage", axis: "relationship", labelKo: "계약관계·혐관", labelEn: "Contract / Rivals", matchKeywords: ["계약", "혐관", "원수", "정략"] },
  { id: "found-family", axis: "relationship", labelKo: "유사가족·구원", labelEn: "Found family", matchKeywords: ["가족", "육아", "구원", "입양"] },
  { id: "fast-catharsis", axis: "pacing", labelKo: "빠른 사이다", labelEn: "Fast catharsis", matchKeywords: ["사이다", "먼치킨", "통쾌", "복수"] },
  { id: "healing-warm", axis: "mood", labelKo: "힐링·다정", labelEn: "Warm healing", matchKeywords: ["힐링", "다정", "일상", "치유"] },
  // 트리거워닝 안전 제외 칩
  { id: "tw-gore", axis: "trigger-exclude", labelKo: "고어·유혈 제외", labelEn: "No gore", matchKeywords: ["고어", "유혈", "잔혹", "스플래터", "신체훼손"] },
  { id: "tw-ntr", axis: "trigger-exclude", labelKo: "배신·불륜 제외", labelEn: "No betrayal", matchKeywords: ["불륜", "배신", "외도", "ntr", "양다리"] },
  { id: "tw-cliffhanger-abuse", axis: "trigger-exclude", labelKo: "고구마·피폐 제외", labelEn: "No heavy angst", matchKeywords: ["피폐", "고구마", "비극", "배드엔딩", "학대"] },
]);

const CHIP_BY_ID = new Map(DISCOVER_TAG_FINDER_CHIPS.map((chip) => [chip.id, chip] as const));

export interface TagTriggerFilterState {
  readonly includeTagIds: readonly string[];
  readonly excludeTriggerIds: readonly string[];
}

export function toggleTagTriggerFilterChip(
  state: TagTriggerFilterState,
  chip: TagFinderChip,
): TagTriggerFilterState {
  if (chip.axis === "trigger-exclude") {
    const exists = state.excludeTriggerIds.includes(chip.id);
    return Object.freeze({
      includeTagIds: state.includeTagIds,
      excludeTriggerIds: exists
        ? state.excludeTriggerIds.filter((id) => id !== chip.id)
        : [...state.excludeTriggerIds, chip.id],
    });
  }
  const exists = state.includeTagIds.includes(chip.id);
  return Object.freeze({
    includeTagIds: exists
      ? state.includeTagIds.filter((id) => id !== chip.id)
      : [...state.includeTagIds, chip.id],
    excludeTriggerIds: state.excludeTriggerIds,
  });
}

export function buildTagTriggerExploreHref(state: TagTriggerFilterState): string {
  const params = new URLSearchParams();
  if (state.includeTagIds.length > 0) {
    params.set("finderTags", state.includeTagIds.join(","));
  }
  if (state.excludeTriggerIds.length > 0) {
    params.set("excludeTriggers", state.excludeTriggerIds.join(","));
  }
  const qs = params.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export function parseTagTriggerSearchParams(searchParams: URLSearchParams): TagTriggerFilterState {
  const rawInclude = searchParams.get("finderTags") ?? "";
  const rawExclude = searchParams.get("excludeTriggers") ?? "";
  const includeTagIds = rawInclude
    .split(",")
    .map((s) => s.trim())
    .filter((id) => CHIP_BY_ID.has(id) && CHIP_BY_ID.get(id)!.axis !== "trigger-exclude");
  const excludeTriggerIds = rawExclude
    .split(",")
    .map((s) => s.trim())
    .filter((id) => CHIP_BY_ID.get(id)?.axis === "trigger-exclude");
  return Object.freeze({ includeTagIds, excludeTriggerIds });
}

/**
 * `/explore`에서 `finderTags`(포함 키워드) 및 `excludeTriggers`(트리거워닝 안전 제외) 쿼리를
 * 작품 태그·장르·소개문 기준으로 실제 필터링한다.
 */
export function filterTitlesByTagTriggerFinder<
  TTitle extends {
    readonly title: string;
    readonly synopsis?: string;
    readonly tags?: readonly string[];
    readonly genres?: readonly string[];
  },
>(titles: readonly TTitle[], state: TagTriggerFilterState): TTitle[] {
  if (state.includeTagIds.length === 0 && state.excludeTriggerIds.length === 0) {
    return [...titles];
  }

  return titles.filter((item) => {
    const haystack = [
      item.title,
      item.synopsis ?? "",
      ...(item.tags ?? []),
      ...(item.genres ?? []),
    ]
      .join(" ")
      .toLowerCase();

    for (const exId of state.excludeTriggerIds) {
      const chip = CHIP_BY_ID.get(exId);
      if (chip && chip.matchKeywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
        return false;
      }
    }

    for (const incId of state.includeTagIds) {
      const chip = CHIP_BY_ID.get(incId);
      if (chip && !chip.matchKeywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
        return false;
      }
    }

    return true;
  });
}
