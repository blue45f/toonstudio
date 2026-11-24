/**
 * Wave 38B — 8분할 오비탈 휠 · 태블릿 듀얼 휠 · 컨텍스트 매직 바 ·
 * 모바일 엄지 도크 / 엣지 스크럽 / 2.5× 루페 타입 계약 및 카탈로그 정의.
 */

export type ErgonomicDeviceMode = "desktop" | "tablet" | "mobile";

export type Handedness = "right" | "left";

export type OrbitalSectorId =
  | "brush"
  | "eraser"
  | "eyedropper"
  | "transform"
  | "symmetry"
  | "flip-horizontal"
  | "undo"
  | "layer-peek";

export interface OrbitalSectorDefinition {
  readonly index: number;
  readonly id: OrbitalSectorId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly hintKo: string;
  readonly shortcut: string;
  /** 12시(0°) 기준 시계 방향 중심 각도(도) */
  readonly centerAngleDeg: number;
  readonly startAngleDeg: number;
  readonly endAngleDeg: number;
  readonly toneToken: "accent" | "cool" | "good" | "warn";
}

export interface OrbitalWheelConfig {
  readonly deadzoneRadiusPx: number;
  readonly innerRadiusPx: number;
  readonly outerRadiusPx: number;
  readonly flickCommitRadiusPx: number;
  readonly hysteresisDeg: number;
  readonly magneticPullFactor: number;
}

export interface OrbitalPointerResolution {
  readonly distancePx: number;
  readonly rawBearingDeg: number;
  readonly inDeadzone: boolean;
  readonly snappedSectorIndex: number | null;
  readonly snappedSector: OrbitalSectorDefinition | null;
  readonly angularDeltaFromCenterDeg: number;
  readonly magneticSnapAngleDeg: number | null;
  readonly visualPointerAngleDeg: number | null;
  readonly magneticPullStrength: number;
  readonly ringDepth: "deadzone" | "inner" | "primary" | "flick-commit";
  readonly heldByHysteresis: boolean;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface OrbitalWheelAnchorResult {
  readonly x: number;
  readonly y: number;
  readonly clampedX: boolean;
  readonly clampedY: boolean;
}

export type TabletLeftDialMode = "brush-size" | "opacity" | "layer-switch";
export type TabletRightDialMode = "rotation" | "zoom" | "undo-scrub";

export interface TabletDualWheelState {
  readonly handedness: Handedness;
  readonly leftMode: TabletLeftDialMode;
  readonly rightMode: TabletRightDialMode;
  readonly brushSizePx: number;
  readonly opacityPct: number;
  readonly layerNames: readonly string[];
  readonly activeLayerIndex: number;
  readonly canvasRotationDeg: number;
  readonly rotationSnappedCardinalDeg: number | null;
  readonly zoomPct: number;
  readonly undoCursor: number;
  readonly undoMax: number;
  readonly lastFeedbackKo: string;
}

export interface TabletDualWheelLayout {
  readonly leftWheelCenter: Point2D;
  readonly rightWheelCenter: Point2D;
  readonly wheelRadiusPx: number;
  readonly orientation: "landscape" | "portrait";
}

export type MagicBarToolContext = "brush" | "lasso" | "3d-model" | "speech-balloon";

export type MagicBarActionId =
  | "stabilize-stroke"
  | "alpha-lock"
  | "color-drop-fill"
  | "mirror-symmetry"
  | "invert-selection"
  | "expand-selection"
  | "feather-edge"
  | "liquify-selection"
  | "extract-lineart"
  | "snap-camera-angle"
  | "sync-cut-light"
  | "toggle-wall-hide"
  | "tail-aim-speaker"
  | "fit-korean-wrap"
  | "balloon-style-cycle"
  | "auto-gutter-dodge";

export interface ContextMagicBarAction {
  readonly id: MagicBarActionId;
  readonly toolContext: MagicBarToolContext;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly summaryKo: string;
  readonly shortcut: string;
  readonly toggleable: boolean;
  readonly active: boolean;
}

export interface ContextMagicBarModel {
  readonly toolContext: MagicBarToolContext;
  readonly toolLabelKo: string;
  readonly actions: readonly [
    ContextMagicBarAction,
    ContextMagicBarAction,
    ContextMagicBarAction,
    ContextMagicBarAction,
  ];
}

export type MobileThumbActionId =
  | "brush"
  | "eraser"
  | "eyedropper"
  | "lasso"
  | "undo"
  | "layers";

export interface MobileThumbArcButton {
  readonly index: number;
  readonly id: MobileThumbActionId;
  readonly labelKo: string;
  readonly x: number;
  readonly y: number;
  readonly angleDeg: number;
  readonly hitTargetSizePx: number;
}

export interface MobileThumbArcDockLayout {
  readonly handedness: Handedness;
  readonly anchorCorner: "bottom-right" | "bottom-left";
  readonly pivot: Point2D;
  readonly arcRadiusPx: number;
  readonly minHitTargetPx: number;
  readonly minChordSpacingPx: number;
  readonly buttons: readonly MobileThumbArcButton[];
}

export type MobileEdgeSide = "left" | "right";
export type MobileEdgeScrubTarget = "brush-size" | "opacity";

export interface MobileEdgeScrubInput {
  readonly edge: MobileEdgeSide;
  readonly startX: number;
  readonly startY: number;
  readonly currentY: number;
  readonly viewport: ViewportSize;
  readonly handedness?: Handedness;
  readonly edgeZoneWidthPx?: number;
  readonly startValue: number;
  readonly previousDetentIndex?: number;
}

export interface MobileEdgeScrubResult {
  readonly engaged: boolean;
  readonly target: MobileEdgeScrubTarget;
  readonly labelKo: string;
  readonly value: number;
  readonly normalized: number;
  readonly detentIndex: number;
  readonly crossedDetent: boolean;
  readonly hitBoundary: boolean;
  readonly hapticKind: "none" | "tick" | "snap-midpoint" | "boundary";
  readonly hapticPatternMs: readonly number[];
  readonly unitSuffix: "px" | "%";
}

export interface PrecisionLoupeInput {
  readonly touchPoint: Point2D;
  readonly viewport: ViewportSize;
  readonly handedness: Handedness;
  readonly magnification?: number;
  readonly loupeRadiusPx?: number;
  readonly fingerOcclusionRadiusPx?: number;
  readonly safeMarginPx?: number;
}

export interface PrecisionLoupePlacement {
  readonly magnification: number;
  readonly loupeRadiusPx: number;
  readonly loupeCenter: Point2D;
  readonly touchPoint: Point2D;
  readonly quadrant: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  readonly clampedToViewport: boolean;
  readonly fingerClearancePx: number;
  readonly zeroFingerOcclusion: boolean;
  readonly sourceSampleRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export const ORBITAL_SECTOR_COUNT = 8;
export const ORBITAL_SECTOR_SPAN_DEG = 360 / ORBITAL_SECTOR_COUNT;

export const DEFAULT_ORBITAL_WHEEL_CONFIG: OrbitalWheelConfig = {
  deadzoneRadiusPx: 28,
  innerRadiusPx: 40,
  outerRadiusPx: 122,
  flickCommitRadiusPx: 138,
  hysteresisDeg: 4.5,
  magneticPullFactor: 0.58,
};

export const ORBITAL_WHEEL_SECTORS: readonly OrbitalSectorDefinition[] = [
  {
    index: 0,
    id: "brush",
    labelKo: "브러시",
    shortLabelKo: "브러시",
    hintKo: "필압 잉크 펜으로 바로 전환",
    shortcut: "B",
    centerAngleDeg: 0,
    startAngleDeg: 337.5,
    endAngleDeg: 22.5,
    toneToken: "accent",
  },
  {
    index: 1,
    id: "eraser",
    labelKo: "지우개",
    shortLabelKo: "지우개",
    hintKo: "선화 정리용 하드·소프트 지우개",
    shortcut: "E",
    centerAngleDeg: 45,
    startAngleDeg: 22.5,
    endAngleDeg: 67.5,
    toneToken: "cool",
  },
  {
    index: 2,
    id: "eyedropper",
    labelKo: "스포이드",
    shortLabelKo: "스포이드",
    hintKo: "캔버스 원색 즉시 추출",
    shortcut: "I",
    centerAngleDeg: 90,
    startAngleDeg: 67.5,
    endAngleDeg: 112.5,
    toneToken: "good",
  },
  {
    index: 3,
    id: "transform",
    labelKo: "변형",
    shortLabelKo: "변형",
    hintKo: "자유 변형·원근 왜곡 핸들 열기",
    shortcut: "T",
    centerAngleDeg: 135,
    startAngleDeg: 112.5,
    endAngleDeg: 157.5,
    toneToken: "warn",
  },
  {
    index: 4,
    id: "symmetry",
    labelKo: "대칭",
    shortLabelKo: "대칭",
    hintKo: "세로·방사형 대칭 자 토글",
    shortcut: "M",
    centerAngleDeg: 180,
    startAngleDeg: 157.5,
    endAngleDeg: 202.5,
    toneToken: "accent",
  },
  {
    index: 5,
    id: "flip-horizontal",
    labelKo: "좌우반전",
    shortLabelKo: "반전",
    hintKo: "인체·구도 균형 좌우 뒤집어 보기",
    shortcut: "H",
    centerAngleDeg: 225,
    startAngleDeg: 202.5,
    endAngleDeg: 247.5,
    toneToken: "cool",
  },
  {
    index: 6,
    id: "undo",
    labelKo: "실행취소",
    shortLabelKo: "취소",
    hintKo: "직전 획 즉시 되돌리기",
    shortcut: "⌘Z",
    centerAngleDeg: 270,
    startAngleDeg: 247.5,
    endAngleDeg: 292.5,
    toneToken: "warn",
  },
  {
    index: 7,
    id: "layer-peek",
    labelKo: "레이어 피크",
    shortLabelKo: "레이어",
    hintKo: "현재 레이어만 단독으로 훑어보기",
    shortcut: "L",
    centerAngleDeg: 315,
    startAngleDeg: 292.5,
    endAngleDeg: 337.5,
    toneToken: "good",
  },
] as const;

export const MAGIC_BAR_TOOL_LABELS_KO: Readonly<Record<MagicBarToolContext, string>> = {
  brush: "브러시",
  lasso: "올가미 선택",
  "3d-model": "3D 배경·포즈",
  "speech-balloon": "말풍선·식자",
};

export const MAGIC_BAR_BLUEPRINTS: Readonly<
  Record<
    MagicBarToolContext,
    readonly [
      Omit<ContextMagicBarAction, "active">,
      Omit<ContextMagicBarAction, "active">,
      Omit<ContextMagicBarAction, "active">,
      Omit<ContextMagicBarAction, "active">,
    ]
  >
> = {
  brush: [
    {
      id: "stabilize-stroke",
      toolContext: "brush",
      labelKo: "선 떨림 보정",
      shortLabelKo: "떨림 보정",
      summaryKo: "미세한 손떨림을 줄여 깔끔한 펜선을 유지해요",
      shortcut: "S",
      toggleable: true,
    },
    {
      id: "alpha-lock",
      toolContext: "brush",
      labelKo: "투명 픽셀 잠금",
      shortLabelKo: "투명 잠금",
      summaryKo: "칠해진 영역 밖으로 번지지 않게 선 색을 바꿔요",
      shortcut: "/",
      toggleable: true,
    },
    {
      id: "color-drop-fill",
      toolContext: "brush",
      labelKo: "닫힌 영역 채우기",
      shortLabelKo: "영역 채움",
      summaryKo: "열린 틈을 자동 보정해 밑색을 한 번에 채워요",
      shortcut: "G",
      toggleable: false,
    },
    {
      id: "mirror-symmetry",
      toolContext: "brush",
      labelKo: "좌우 대칭선",
      shortLabelKo: "대칭선",
      summaryKo: "정면 얼굴과 소품을 양쪽 동시에 그려요",
      shortcut: "M",
      toggleable: true,
    },
  ],
  lasso: [
    {
      id: "invert-selection",
      toolContext: "lasso",
      labelKo: "선택 반전",
      shortLabelKo: "선택 반전",
      summaryKo: "인물 바깥 배경 영역만 한 번에 선택해요",
      shortcut: "⇧⌘I",
      toggleable: false,
    },
    {
      id: "expand-selection",
      toolContext: "lasso",
      labelKo: "선택 2px 확장",
      shortLabelKo: "2px 확장",
      summaryKo: "선화 경계의 하얀 틈 없이 채색 범위를 넓혀요",
      shortcut: "]",
      toggleable: false,
    },
    {
      id: "feather-edge",
      toolContext: "lasso",
      labelKo: "경계 부드럽게",
      shortLabelKo: "경계 풀기",
      summaryKo: "명암·블러용 경계를 자연스럽게 풀어줘요",
      shortcut: "F",
      toggleable: true,
    },
    {
      id: "liquify-selection",
      toolContext: "lasso",
      labelKo: "선택 영역 유동화",
      shortLabelKo: "유동화",
      summaryKo: "이목구비와 실루엣 비율을 손끝으로 다듬어요",
      shortcut: "Q",
      toggleable: true,
    },
  ],
  "3d-model": [
    {
      id: "extract-lineart",
      toolContext: "3d-model",
      labelKo: "실시간 선화 추출",
      shortLabelKo: "선화 추출",
      summaryKo: "3D 배경과 소품 윤곽을 웹툰 펜선으로 바로 뽑아요",
      shortcut: "L",
      toggleable: true,
    },
    {
      id: "snap-camera-angle",
      toolContext: "3d-model",
      labelKo: "컷 카메라 맞춤",
      shortLabelKo: "카메라 맞춤",
      summaryKo: "아이레벨·하이앵글 구도를 컷 비율에 맞춰 고정해요",
      shortcut: "C",
      toggleable: false,
    },
    {
      id: "sync-cut-light",
      toolContext: "3d-model",
      labelKo: "광원 각도 동기화",
      shortLabelKo: "광원 동기",
      summaryKo: "2D 채광 방향과 3D 그림자 방향을 일치시켜요",
      shortcut: "K",
      toggleable: true,
    },
    {
      id: "toggle-wall-hide",
      toolContext: "3d-model",
      labelKo: "가림 벽 투명화",
      shortLabelKo: "벽 투명화",
      summaryKo: "카메라를 가리는 실내 벽면만 자동으로 비워줘요",
      shortcut: "H",
      toggleable: true,
    },
  ],
  "speech-balloon": [
    {
      id: "tail-aim-speaker",
      toolContext: "speech-balloon",
      labelKo: "꼬리 화자 조준",
      shortLabelKo: "화자 조준",
      summaryKo: "말풍선 꼬리를 말하는 인물 입 방향으로 맞춰요",
      shortcut: "T",
      toggleable: true,
    },
    {
      id: "fit-korean-wrap",
      toolContext: "speech-balloon",
      labelKo: "어절 줄바꿈 정돈",
      shortLabelKo: "어절 정돈",
      summaryKo: "단어가 어색하게 끊기지 않게 대사 폭을 맞춰요",
      shortcut: "W",
      toggleable: false,
    },
    {
      id: "balloon-style-cycle",
      toolContext: "speech-balloon",
      labelKo: "외침·속마음 전환",
      shortLabelKo: "말풍선 모양",
      summaryKo: "일반·외침·독백 말풍선 테두리를 순환해요",
      shortcut: "B",
      toggleable: false,
    },
    {
      id: "auto-gutter-dodge",
      toolContext: "speech-balloon",
      labelKo: "인물 얼굴 피하기",
      shortLabelKo: "얼굴 피하기",
      summaryKo: "말풍선이 캐릭터 눈과 표정을 가리지 않게 밀어줘요",
      shortcut: "D",
      toggleable: true,
    },
  ],
};

export const MOBILE_THUMB_ACTIONS: readonly {
  readonly id: MobileThumbActionId;
  readonly labelKo: string;
}[] = [
  { id: "brush", labelKo: "브러시" },
  { id: "eraser", labelKo: "지우개" },
  { id: "eyedropper", labelKo: "스포이드" },
  { id: "lasso", labelKo: "올가미" },
  { id: "undo", labelKo: "되돌리기" },
  { id: "layers", labelKo: "레이어" },
];
