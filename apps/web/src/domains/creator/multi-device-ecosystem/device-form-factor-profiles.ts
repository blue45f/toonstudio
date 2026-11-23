/**
 * 멀티 디바이스 10단계 반응형 폼팩터 정본 프로필 카탈로그 및 6종 스프라이트 경로.
 */

export const MULTI_DEVICE_SPRITE_PATHS = Object.freeze({
  watch: "/assets/studio/vibrant-sprites/device-watch.webp",
  tv: "/assets/studio/vibrant-sprites/device-tv.webp",
  digitizer: "/assets/studio/vibrant-sprites/device-digitizer.webp",
  dialPad: "/assets/studio/vibrant-sprites/device-dial-pad.webp",
  arGlasses: "/assets/studio/vibrant-sprites/device-ar-glasses.webp",
  vrHeadset: "/assets/studio/vibrant-sprites/device-vr-headset.webp",
} as const);

export type MultiDeviceSpriteKey = keyof typeof MULTI_DEVICE_SPRITE_PATHS;

export type DeviceFormFactorId =
  | "watch-round"
  | "watch-rect"
  | "mobile-xs"
  | "mobile-lg"
  | "tablet-portrait"
  | "tablet-landscape"
  | "foldable-dual"
  | "desktop"
  | "ultrawide"
  | "tv-10ft";

export type DeviceFormFactorCategory =
  | "wearable"
  | "handheld"
  | "tablet"
  | "foldable"
  | "desktop"
  | "tv";

export type DeviceChromeDensity = "micro" | "compact" | "balanced" | "expanded" | "ten-foot";
export type DeviceHandedness = "right" | "left";
export type DevicePointerClass = "fine" | "coarse" | "none";
export type FoldablePosture = "continuous" | "folded-book" | "folded-tabletop";
export type HingeAxis = "none" | "vertical" | "horizontal";

export interface DeviceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DeviceFormFactorProfile {
  readonly id: DeviceFormFactorId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly category: DeviceFormFactorCategory;
  readonly chromeDensity: DeviceChromeDensity;
  readonly canvasBudgetPercent: number;
  readonly minTouchTargetPx: number;
  readonly recommendedLayoutKo: string;
  readonly primaryInputKo: string;
  readonly spritePath: string;
  readonly previewViewport: { readonly width: number; readonly height: number };
}

export const DEVICE_FORM_FACTOR_PROFILES: Readonly<
  Record<DeviceFormFactorId, DeviceFormFactorProfile>
> = Object.freeze({
  "watch-round": Object.freeze({
    id: "watch-round",
    labelKo: "원형 스마트워치 (200–260px)",
    shortLabelKo: "원형 워치",
    category: "wearable",
    chromeDensity: "micro",
    canvasBudgetPercent: 78,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "베젤 크라운 다이얼 + 중앙 3초 썸네일 패드 + 1탭 실행취소",
    primaryInputKo: "회전 크라운 · 단일 탭 · 음성 대사",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.watch,
    previewViewport: Object.freeze({ width: 224, height: 224 }),
  }),
  "watch-rect": Object.freeze({
    id: "watch-rect",
    labelKo: "사각 스마트워치 (200–260px)",
    shortLabelKo: "사각 워치",
    category: "wearable",
    chromeDensity: "micro",
    canvasBudgetPercent: 80,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "측면 크라운 다이얼 + 4원색 도크 + 3초 콘티 스케치",
    primaryInputKo: "디지털 크라운 · 터치 · 음성 캡처",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.watch,
    previewViewport: Object.freeze({ width: 212, height: 256 }),
  }),
  "mobile-xs": Object.freeze({
    id: "mobile-xs",
    labelKo: "초소형 스마트폰 (< 375px)",
    shortLabelKo: "소형 모바일",
    category: "handheld",
    chromeDensity: "compact",
    canvasBudgetPercent: 88,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "하단 엄지 아크 4버튼 독 · 상단 플로팅 알약 최소화",
    primaryInputKo: "한손 엄지 터치 · 멀티터치 제스처",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.dialPad,
    previewViewport: Object.freeze({ width: 320, height: 640 }),
  }),
  "mobile-lg": Object.freeze({
    id: "mobile-lg",
    labelKo: "대화면 스마트폰 (375–639px)",
    shortLabelKo: "대화면 모바일",
    category: "handheld",
    chromeDensity: "compact",
    canvasBudgetPercent: 88,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "하단 엄지 6도구 독 · 스와이프 레이어 바텀시트",
    primaryInputKo: "터치 · 스타일러스 · 2지/3지 제스처",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.dialPad,
    previewViewport: Object.freeze({ width: 430, height: 932 }),
  }),
  "tablet-portrait": Object.freeze({
    id: "tablet-portrait",
    labelKo: "태블릿 세로 (아이패드·갤럭시탭)",
    shortLabelKo: "태블릿 세로",
    category: "tablet",
    chromeDensity: "balanced",
    canvasBudgetPercent: 85,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "세로 원고 특화 캔버스 + 하단 접이식 팔레트 + 팜 리젝션",
    primaryInputKo: "Apple Pencil · S펜 · 2지 Undo · 3지 Redo",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.digitizer,
    previewViewport: Object.freeze({ width: 820, height: 1180 }),
  }),
  "tablet-landscape": Object.freeze({
    id: "tablet-landscape",
    labelKo: "태블릿 가로 (아이패드 프로·액정 태블릿)",
    shortLabelKo: "태블릿 가로",
    category: "tablet",
    chromeDensity: "balanced",
    canvasBudgetPercent: 84,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "측면 48px 도구 레일 + 우측 접이식 인스펙터 + 래디얼 휠",
    primaryInputKo: "필압·기울기·회전 펜슬 · 멀티터치",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.digitizer,
    previewViewport: Object.freeze({ width: 1180, height: 820 }),
  }),
  "foldable-dual": Object.freeze({
    id: "foldable-dual",
    labelKo: "폴더블 듀얼 스크린 (힌지 안전 회피)",
    shortLabelKo: "폴더블 듀얼",
    category: "foldable",
    chromeDensity: "balanced",
    canvasBudgetPercent: 86,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "힌지 영역 0% 침범 분할 · 주 화면 캔버스 / 보조 화면 팔레트",
    primaryInputKo: "폴더블 펜 · 듀얼 세그먼트 터치",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.digitizer,
    previewViewport: Object.freeze({ width: 1440, height: 1080 }),
  }),
  desktop: Object.freeze({
    id: "desktop",
    labelKo: "데스크톱 · 맥북 워크스테이션",
    shortLabelKo: "데스크톱",
    category: "desktop",
    chromeDensity: "balanced",
    canvasBudgetPercent: 84,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "단일 44px 상단바 + 좌측 48px 레일 + 우측 280px 인스펙터",
    primaryInputKo: "디지타이저 · Force Touch 트랙패드 · WebHID · MIDI",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.digitizer,
    previewViewport: Object.freeze({ width: 1440, height: 900 }),
  }),
  ultrawide: Object.freeze({
    id: "ultrawide",
    labelKo: "울트라와이드 모니터 (21:9 · 32:9)",
    shortLabelKo: "울트라와이드",
    category: "desktop",
    chromeDensity: "expanded",
    canvasBudgetPercent: 86,
    minTouchTargetPx: 44,
    recommendedLayoutKo: "중앙 메인 원고 + 좌측 레퍼런스 핀보드 + 우측 3D/타임라인 병렬 도킹",
    primaryInputKo: "액정 타블렛 · TourBox/Loupedeck · 풋페달",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.dialPad,
    previewViewport: Object.freeze({ width: 2560, height: 1080 }),
  }),
  "tv-10ft": Object.freeze({
    id: "tv-10ft",
    labelKo: "스마트 TV 10ft 시어터 · 거실 듀얼스크린",
    shortLabelKo: "스마트 TV 10ft",
    category: "tv",
    chromeDensity: "ten-foot",
    canvasBudgetPercent: 90,
    minTouchTargetPx: 56,
    recommendedLayoutKo: "3m 원거리 가독 대형 타일 · D-Pad 황금·코랄 포커스 링 · 무선 미러링",
    primaryInputKo: "TV 리모컨 D-Pad · 키보드 방향키 · 무선 미러링",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.tv,
    previewViewport: Object.freeze({ width: 1920, height: 1080 }),
  }),
});

export const DEVICE_FORM_FACTOR_ORDER: readonly DeviceFormFactorId[] = Object.freeze([
  "watch-round",
  "watch-rect",
  "mobile-xs",
  "mobile-lg",
  "tablet-portrait",
  "tablet-landscape",
  "foldable-dual",
  "desktop",
  "ultrawide",
  "tv-10ft",
]);

/** 설정 홈의 기본 접힘 배지에서 사용하는 경량 요약 메타데이터. */
export const MULTI_DEVICE_HUB_SUMMARY = Object.freeze({
  titleKo: "멀티 디바이스 생태계 · 워치 · 스마트 TV · 주변기기 허브",
  subtitleKo:
    "10단계 폼팩터, 디지타이저 필압 커브, WebHID·MIDI·게임패드·풋페달, 워치 크라운·TV 10ft·AR/WebXR을 한곳에서 점검합니다.",
  formFactorCount: DEVICE_FORM_FACTOR_ORDER.length,
  spritePaths: MULTI_DEVICE_SPRITE_PATHS,
} as const);

export interface TvStoryboardTile {
  readonly index: number;
  readonly cutCode: string;
  readonly titleKo: string;
  readonly pacingNoteKo: string;
}

export const TV_STORYBOARD_TILES: readonly TvStoryboardTile[] = Object.freeze([
  Object.freeze({ index: 0, cutCode: "CUT 01", titleKo: "새벽 골목 오프닝 전경", pacingNoteKo: "4K 와이드 3초 호흡" }),
  Object.freeze({ index: 1, cutCode: "CUT 02", titleKo: "주인공 시선 클로즈업", pacingNoteKo: "말풍선 중앙 안전선" }),
  Object.freeze({ index: 2, cutCode: "CUT 03", titleKo: "대치 구도 대각선 분할", pacingNoteKo: "효과음 우측 여백 확보" }),
  Object.freeze({ index: 3, cutCode: "CUT 04", titleKo: "빗방울 슬로우 인서트", pacingNoteKo: "어두운 배경 대비 점검" }),
  Object.freeze({ index: 4, cutCode: "CUT 05", titleKo: "반전 대사 2단 펼침", pacingNoteKo: "10ft 가독 폰트 28pt+" }),
  Object.freeze({ index: 5, cutCode: "CUT 06", titleKo: "엔딩 클리프행어 암전", pacingNoteKo: "다음 화 유도 배너" }),
]);

export type TvDpadDirection = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** TV 10ft 2D 타일 그리드에서 D-Pad 방향키 입력 시 다음 공간 포커스 인덱스를 계산한다. */
export function moveTvSpatialFocusIndex(
  currentIndex: number,
  direction: TvDpadDirection,
  columns: number = 3,
  totalItems: number = TV_STORYBOARD_TILES.length,
): number {
  if (totalItems <= 0) return 0;
  const safeCurrent = Math.min(totalItems - 1, Math.max(0, currentIndex));
  const safeCols = Math.max(1, columns);
  const row = Math.floor(safeCurrent / safeCols);
  const col = safeCurrent % safeCols;

  if (direction === "ArrowRight") {
    return col + 1 < safeCols && safeCurrent + 1 < totalItems ? safeCurrent + 1 : safeCurrent;
  }
  if (direction === "ArrowLeft") {
    return col > 0 ? safeCurrent - 1 : safeCurrent;
  }
  if (direction === "ArrowDown") {
    const next = (row + 1) * safeCols + col;
    return next < totalItems ? next : safeCurrent;
  }
  const prev = (row - 1) * safeCols + col;
  return prev >= 0 ? prev : safeCurrent;
}
