/**
 * 탐색(/title/:slug) -> 3컷 창작 리믹스 브리지 (AC-018 / PRODUCT.md · F10).
 *
 * 저작권 경계 준수: 외부 작품의 원고 이미지·대사·줄거리를 복제하지 않고,
 * 장르·연출 리듬 기반의 오리지널 3컷 레이아웃 템플릿과 스튜디오 진입 URL만 생성한다.
 */

export interface ThreeCutPanelBlueprint {
  readonly index: 1 | 2 | 3;
  readonly roleKo: string;
  readonly cameraHintKo: string;
  readonly heightRatio: number;
}

export interface ThreeCutRemixBlueprint {
  readonly sourceSlug: string;
  readonly primaryGenre: string;
  readonly templateId: "action-climax" | "romance-beat" | "mystery-reveal" | "slice-of-life";
  readonly templateNameKo: string;
  readonly canvasWidthPx: 800;
  readonly panels: readonly [ThreeCutPanelBlueprint, ThreeCutPanelBlueprint, ThreeCutPanelBlueprint];
  readonly studioLaunchHref: string;
}

export function buildThreeCutRemixBlueprint(input: {
  readonly slug: string;
  readonly genres: readonly string[];
}): ThreeCutRemixBlueprint {
  const primaryGenre = input.genres[0]?.trim() || "드라마";

  let templateId: ThreeCutRemixBlueprint["templateId"] = "slice-of-life";
  let templateNameKo = "일상·감정 3컷 템플릿";
  let panels: ThreeCutRemixBlueprint["panels"] = [
    { index: 1, roleKo: "도입 (공간·분위기 설정)", cameraHintKo: "미디엄 와이드 샷", heightRatio: 0.3 },
    { index: 2, roleKo: "전환 (인물 반응·대사)", cameraHintKo: "바스트 업 클로즈업", heightRatio: 0.35 },
    { index: 3, roleKo: "여운 (감정 클로징)", cameraHintKo: "아이 레벨 클로즈업", heightRatio: 0.35 },
  ];

  if (/액션|판타지|무협|헌터/u.test(primaryGenre)) {
    templateId = "action-climax";
    templateNameKo = "액션·클라이맥스 3컷 템플릿";
    panels = [
      { index: 1, roleKo: "긴장 축적 (대치 구도)", cameraHintKo: "로우 앵글 투샷", heightRatio: 0.28 },
      { index: 2, roleKo: "임팩트 (동세·효과선)", cameraHintKo: "다이나믹 대각선 컷", heightRatio: 0.44 },
      { index: 3, roleKo: "후폭풍 (시선 고정)", cameraHintKo: "익스트림 클로즈업", heightRatio: 0.28 },
    ];
  } else if (/로맨스|로판|BL|순정/u.test(primaryGenre)) {
    templateId = "romance-beat";
    templateNameKo = "로맨스·설렘 3컷 템플릿";
    panels = [
      { index: 1, roleKo: "시선 교차", cameraHintKo: "오버 더 숄더 샷", heightRatio: 0.32 },
      { index: 2, roleKo: "침묵과 호흡", cameraHintKo: "세로 여백 강조 컷", heightRatio: 0.3 },
      { index: 3, roleKo: "감정 클로즈업", cameraHintKo: "소프트 포커스 클로즈업", heightRatio: 0.38 },
    ];
  } else if (/스릴러|미스터리|공포|추리/u.test(primaryGenre)) {
    templateId = "mystery-reveal";
    templateNameKo = "스릴러·반전 3컷 템플릿";
    panels = [
      { index: 1, roleKo: "단서 포착", cameraHintKo: "인서트 디테일 샷", heightRatio: 0.25 },
      { index: 2, roleKo: "어둠과 침묵", cameraHintKo: "암전 세로 스크롤 여백", heightRatio: 0.35 },
      { index: 3, roleKo: "반전 공개", cameraHintKo: "하이 콘트라스트 컷", heightRatio: 0.4 },
    ];
  }

  const params = new URLSearchParams({
    template: "three-cut-remix",
    preset: templateId,
    genre: primaryGenre,
    refSlug: input.slug,
  });

  return Object.freeze({
    sourceSlug: input.slug,
    primaryGenre,
    templateId,
    templateNameKo,
    canvasWidthPx: 800,
    panels,
    studioLaunchHref: `/studio/new?${params.toString()}`,
  });
}
