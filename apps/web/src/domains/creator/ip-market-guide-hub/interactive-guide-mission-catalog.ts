/**
 * 30초 인터랙티브 미션(5대 워크플로우 × 3단계) 및 검색형 단축키·제스처 카탈로그 데이터.
 */

export type StudioGuideMissionId =
  | "beginner-first-cut"
  | "bg3d-stage-placement"
  | "vrm-pose-item-fit"
  | "remotion-shortform-export"
  | "multidevice-companion-link";

export type StudioGuidePageContext =
  | "studio-canvas"
  | "bg3d-stage"
  | "vrm-character"
  | "remotion-shorts"
  | "multidevice-hub"
  | "market"
  | "growth-ip";

export type SilentVisualDemoCue =
  | "pulse-target"
  | "drag-arc"
  | "snap-magnet"
  | "timeline-scrub"
  | "pair-radar";

export interface InteractiveMissionStep {
  readonly id: string;
  readonly order: 1 | 2 | 3;
  readonly titleKo: string;
  readonly microCueKo: string;
  readonly targetToolId: string;
  readonly targetSelectorHint: string;
  readonly visualCue: SilentVisualDemoCue;
  readonly shortcutBadge: string;
  readonly estimatedSeconds: number;
}

export interface StudioInteractiveMission {
  readonly id: StudioGuideMissionId;
  readonly titleKo: string;
  readonly badgeKo: string;
  readonly totalDurationSeconds: 30;
  readonly pageContext: StudioGuidePageContext;
  readonly spritePath: string;
  readonly goalOutcomeKo: string;
  readonly steps: readonly [
    InteractiveMissionStep,
    InteractiveMissionStep,
    InteractiveMissionStep,
  ];
}

export type ShortcutPlatformFilter = "all" | "desktop" | "touch-ipad" | "wearable-tv";

export type ShortcutCategoryFilter =
  | "all"
  | "drawing"
  | "navigation"
  | "3d-vrm"
  | "export-device";

export interface ShortcutGestureEntry {
  readonly id: string;
  readonly titleKo: string;
  readonly category: Exclude<ShortcutCategoryFilter, "all">;
  readonly platform: Exclude<ShortcutPlatformFilter, "all">;
  readonly macCombo: string;
  readonly winCombo: string;
  readonly gestureCueKo: string;
  readonly effectSummaryKo: string;
  readonly keywords: readonly string[];
  readonly visualCue: SilentVisualDemoCue;
}

export const STUDIO_INTERACTIVE_MISSIONS: readonly StudioInteractiveMission[] = [
  {
    id: "beginner-first-cut",
    titleKo: "초심자 첫 컷 30초 완성",
    badgeKo: "입문 3단계",
    totalDurationSeconds: 30,
    pageContext: "studio-canvas",
    spritePath: "/assets/studio/vibrant-sprites/emblem-guide-map.webp",
    goalOutcomeKo: "붓을 고르고 한 획을 그은 뒤 말풍선까지 30초 안에 완성합니다.",
    steps: [
      {
        id: "beginner-step-1-pick-brush",
        order: 1,
        titleKo: "붓 고르기",
        microCueKo: "좌측 도구 레일의 G펜 아이콘을 한 번 탭하세요.",
        targetToolId: "gpen",
        targetSelectorHint: "[data-studio-tool='gpen']",
        visualCue: "pulse-target",
        shortcutBadge: "B",
        estimatedSeconds: 8,
      },
      {
        id: "beginner-step-2-draw-stroke",
        order: 2,
        titleKo: "한 획 긋기",
        microCueKo: "캔버스 중앙의 곡선 가이드를 따라 가볍게 한 획을 그어 보세요.",
        targetToolId: "canvas-stroke",
        targetSelectorHint: "[data-studio-canvas='primary']",
        visualCue: "drag-arc",
        shortcutBadge: "Drag",
        estimatedSeconds: 12,
      },
      {
        id: "beginner-step-3-add-bubble",
        order: 3,
        titleKo: "말풍선 얹기",
        microCueKo: "말풍선 버튼을 누르고 대사 한 줄을 올려 첫 컷을 마무리하세요.",
        targetToolId: "bubble-sfx",
        targetSelectorHint: "[data-studio-tool='bubble-sfx']",
        visualCue: "snap-magnet",
        shortcutBadge: "T",
        estimatedSeconds: 10,
      },
    ],
  },
  {
    id: "bg3d-stage-placement",
    titleKo: "3D 배경 배치 30초 체험",
    badgeKo: "3D 배경",
    totalDurationSeconds: 30,
    pageContext: "bg3d-stage",
    spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    goalOutcomeKo: "3D 스테이지를 불러와 카메라 앵글을 맞추고 3층 선화·음영을 추출합니다.",
    steps: [
      {
        id: "bg3d-step-1-load-stage",
        order: 1,
        titleKo: "3D 배경 불러오기",
        microCueKo: "옥상 또는 카페 스테이지 프리셋을 컷 위로 끌어다 놓으세요.",
        targetToolId: "bg3d-stage",
        targetSelectorHint: "[data-studio-tool='bg3d']",
        visualCue: "pulse-target",
        shortcutBadge: "3",
        estimatedSeconds: 10,
      },
      {
        id: "bg3d-step-2-angle-lock",
        order: 2,
        titleKo: "카메라 앵글·소실점 맞추기",
        microCueKo: "드래그로 눈높이 또는 로우 앵글 구도를 잡은 뒤 잠그세요.",
        targetToolId: "bg3d-camera",
        targetSelectorHint: "[data-bg3d-control='camera-orbit']",
        visualCue: "drag-arc",
        shortcutBadge: "Alt+Drag",
        estimatedSeconds: 10,
      },
      {
        id: "bg3d-step-3-extract-layers",
        order: 3,
        titleKo: "선화·음영 3층 자동 추출",
        microCueKo: "3층 추출 버튼으로 선화·음영·마스크 레이어를 컷에 즉시 삽입하세요.",
        targetToolId: "bg3d-extract",
        targetSelectorHint: "[data-bg3d-action='extract-3layer']",
        visualCue: "snap-magnet",
        shortcutBadge: "Shift+E",
        estimatedSeconds: 10,
      },
    ],
  },
  {
    id: "vrm-pose-item-fit",
    titleKo: "VRM 포즈·아이템 밀착 30초 체험",
    badgeKo: "VRM·소품",
    totalDurationSeconds: 30,
    pageContext: "vrm-character",
    spritePath: "/assets/studio/vibrant-sprites/emblem-community.webp",
    goalOutcomeKo: "캐릭터 포즈를 잡고 3D 소품을 본 소켓에 피부 뚫림 없이 밀착합니다.",
    steps: [
      {
        id: "vrm-step-1-pose-preset",
        order: 1,
        titleKo: "VRM 포즈 프리셋 적용",
        microCueKo: "장면에 맞는 대화·액션 포즈 카드를 선택해 캐릭터를 세우세요.",
        targetToolId: "vrm-pose",
        targetSelectorHint: "[data-vrm-panel='pose-presets']",
        visualCue: "pulse-target",
        shortcutBadge: "V",
        estimatedSeconds: 10,
      },
      {
        id: "vrm-step-2-socket-snap",
        order: 2,
        titleKo: "본 소켓에 소품 자석 밀착",
        microCueKo: "소품을 손·머리·어깨 소켓으로 옮겨 자동 스냅을 확인하세요.",
        targetToolId: "vrm-item-fit",
        targetSelectorHint: "[data-vrm-action='socket-autofit']",
        visualCue: "snap-magnet",
        shortcutBadge: "F",
        estimatedSeconds: 10,
      },
      {
        id: "vrm-step-3-anticlip-confirm",
        order: 3,
        titleKo: "피부 간격(Anti-Clip) 확정",
        microCueKo: "1.5~3.0mm 자동 간격 보정을 확인하고 현재 컷에 확정하세요.",
        targetToolId: "vrm-confirm",
        targetSelectorHint: "[data-vrm-action='confirm-fit']",
        visualCue: "pulse-target",
        shortcutBadge: "Enter",
        estimatedSeconds: 10,
      },
    ],
  },
  {
    id: "remotion-shortform-export",
    titleKo: "Remotion 숏폼 출고 30초 체험",
    badgeKo: "숏폼 영상",
    totalDurationSeconds: 30,
    pageContext: "remotion-shorts",
    spritePath: "/assets/studio/vibrant-sprites/tech-remotion.webp",
    goalOutcomeKo: "웹툰 컷 3장을 9:16 숏폼 타임라인에 올리고 비트싱크 프리뷰를 출고합니다.",
    steps: [
      {
        id: "remotion-step-1-pick-cuts",
        order: 1,
        titleKo: "하이라이트 컷 3장 선택",
        microCueKo: "예고편에 넣을 핵심 컷 3장을 타임라인 트랙으로 불러오세요.",
        targetToolId: "remotion-cuts",
        targetSelectorHint: "[data-remotion-track='cuts']",
        visualCue: "pulse-target",
        shortcutBadge: "1-3",
        estimatedSeconds: 10,
      },
      {
        id: "remotion-step-2-beat-sync",
        order: 2,
        titleKo: "자막·오디오 비트싱크 맞추기",
        microCueKo: "스크러버를 움직여 효과음 피크와 컷 전환 타이밍을 일치시키세요.",
        targetToolId: "remotion-sync",
        targetSelectorHint: "[data-remotion-control='beat-scrub']",
        visualCue: "timeline-scrub",
        shortcutBadge: "Space",
        estimatedSeconds: 10,
      },
      {
        id: "remotion-step-3-render-preview",
        order: 3,
        titleKo: "9:16 쇼츠 프리뷰 출고",
        microCueKo: "안전 영역 가이드를 확인한 뒤 숏폼 컴포지션을 내보내세요.",
        targetToolId: "remotion-export",
        targetSelectorHint: "[data-remotion-action='export-shorts']",
        visualCue: "snap-magnet",
        shortcutBadge: "Cmd/Ctrl+E",
        estimatedSeconds: 10,
      },
    ],
  },
  {
    id: "multidevice-companion-link",
    titleKo: "멀티 디바이스 연결 30초 체험",
    badgeKo: "워치·TV·태블릿",
    totalDurationSeconds: 30,
    pageContext: "multidevice-hub",
    spritePath: "/assets/studio/vibrant-sprites/emblem-market.webp",
    goalOutcomeKo: "워치·TV·태블릿을 로컬 채널로 페어링해 크라운과 리모컨 제어를 확인합니다.",
    steps: [
      {
        id: "device-step-1-select-target",
        order: 1,
        titleKo: "보조 기기 폼팩터 고르기",
        microCueKo: "스마트워치, 스마트 TV, 아이패드 중 함께 쓸 기기를 선택하세요.",
        targetToolId: "device-select",
        targetSelectorHint: "[data-device-selector='form-factor']",
        visualCue: "pulse-target",
        shortcutBadge: "D",
        estimatedSeconds: 10,
      },
      {
        id: "device-step-2-local-pair",
        order: 2,
        titleKo: "로컬 채널·QR 즉시 페어링",
        microCueKo: "같은 브라우저·Wi-Fi 로컬 동기화 레이더로 페어링을 연결하세요.",
        targetToolId: "device-pair",
        targetSelectorHint: "[data-device-action='pair-local']",
        visualCue: "pair-radar",
        shortcutBadge: "P",
        estimatedSeconds: 10,
      },
      {
        id: "device-step-3-verify-input",
        order: 3,
        titleKo: "크라운·D-Pad 동기화 테스트",
        microCueKo: "워치 크라운 브러시 크기 또는 TV 방향키 포커스 반응을 확인하세요.",
        targetToolId: "device-verify",
        targetSelectorHint: "[data-device-action='test-sync']",
        visualCue: "snap-magnet",
        shortcutBadge: "Arrow",
        estimatedSeconds: 10,
      },
    ],
  },
];

export const STUDIO_SHORTCUT_GESTURE_CATALOG: readonly ShortcutGestureEntry[] = [
  {
    id: "sc-brush-gpen",
    titleKo: "G펜 브러시 즉시 전환",
    category: "drawing",
    platform: "desktop",
    macCombo: "B",
    winCombo: "B",
    gestureCueKo: "펜 사이드 버튼 1회 클릭",
    effectSummaryKo: "활성 도구를 직전 G펜 프리셋으로 전환하고 잉크 오라를 표시합니다.",
    keywords: ["붓", "브러시", "g펜", "brush", "pen", "b"],
    visualCue: "pulse-target",
  },
  {
    id: "sc-undo-2finger",
    titleKo: "실행 취소 (Undo)",
    category: "drawing",
    platform: "touch-ipad",
    macCombo: "⌘Z",
    winCombo: "Ctrl+Z",
    gestureCueKo: "두 손가락 탭 (2-Finger Tap)",
    effectSummaryKo: "직전 획·변형을 즉시 되돌리고 150ms 햅틱 디텐트를 울립니다.",
    keywords: ["실행취소", "되돌리기", "undo", "2지", "두손가락", "ctrl+z"],
    visualCue: "snap-magnet",
  },
  {
    id: "sc-redo-3finger",
    titleKo: "다시 실행 (Redo)",
    category: "drawing",
    platform: "touch-ipad",
    macCombo: "⇧⌘Z",
    winCombo: "Ctrl+Y",
    gestureCueKo: "세 손가락 탭 (3-Finger Tap)",
    effectSummaryKo: "취소한 작업을 한 단계 복원합니다.",
    keywords: ["다시실행", "redo", "3지", "세손가락", "ctrl+y"],
    visualCue: "snap-magnet",
  },
  {
    id: "sc-pinch-rotate-snap",
    titleKo: "캔버스 0° 자석 회전 스냅",
    category: "navigation",
    platform: "touch-ipad",
    macCombo: "R + Shift",
    winCombo: "R + Shift",
    gestureCueKo: "트랙패드·터치 두 손가락 핀치 회전 → 0° 자석 멈춤",
    effectSummaryKo: "기울어진 캔버스를 정확히 수평(0°)으로 자석 정렬합니다.",
    keywords: ["회전", "스냅", "트랙패드", "핀치", "rotate", "0도"],
    visualCue: "drag-arc",
  },
  {
    id: "sc-eyedropper-hold",
    titleKo: "스포이드 색상 추출",
    category: "drawing",
    platform: "touch-ipad",
    macCombo: "I (또는 ⌥ 길게)",
    winCombo: "I (또는 Alt 길게)",
    gestureCueKo: "캔버스 0.35초 롱프레스",
    effectSummaryKo: "커서 아래 색상을 추출해 현재 팔레트와 캐릭터 바이블에 표시합니다.",
    keywords: ["스포이드", "색상", "추출", "롱프레스", "eyedropper", "alt"],
    visualCue: "pulse-target",
  },
  {
    id: "sc-bg3d-extract",
    titleKo: "3D 배경 선화·음영 3층 추출",
    category: "3d-vrm",
    platform: "desktop",
    macCombo: "⇧E",
    winCombo: "Shift+E",
    gestureCueKo: "3D 뷰포트 하단 '3층 추출' 원탭",
    effectSummaryKo: "현재 3D 카메라 구도에서 선화·셀 음영·재질 ID 마스크 3개 레이어를 뽑습니다.",
    keywords: ["3d", "배경", "선화", "음영", "추출", "bg3d", "shift+e"],
    visualCue: "snap-magnet",
  },
  {
    id: "sc-vrm-socket-fit",
    titleKo: "VRM 소품 본 소켓 자석 밀착",
    category: "3d-vrm",
    platform: "desktop",
    macCombo: "F",
    winCombo: "F",
    gestureCueKo: "소품 드래그 시 손·머리 소켓 자동 자석 스냅",
    effectSummaryKo: "3D 소품을 VRM 관절 소켓에 붙이고 Anti-Clip 간격을 자동 보정합니다.",
    keywords: ["vrm", "소품", "밀착", "소켓", "포즈", "anticlip", "f"],
    visualCue: "snap-magnet",
  },
  {
    id: "sc-watch-crown-brush",
    titleKo: "스마트워치 크라운 브러시·줌 조절",
    category: "export-device",
    platform: "wearable-tv",
    macCombo: "[ / ]",
    winCombo: "[ / ]",
    gestureCueKo: "워치 디지털 크라운 회전 (1클릭 = 2px)",
    effectSummaryKo: "손을 캔버스에서 떼지 않고 브러시 굵기나 줌 배율을 미세 조절합니다.",
    keywords: ["워치", "크라운", "브러시크기", "watch", "crown", "줌"],
    visualCue: "pair-radar",
  },
  {
    id: "sc-tv-dpad-review",
    titleKo: "스마트 TV 10ft 스토리보드 탐색",
    category: "export-device",
    platform: "wearable-tv",
    macCombo: "← / → / Enter",
    winCombo: "← / → / Enter",
    gestureCueKo: "TV 리모컨 D-Pad 방향키 + 확인 버튼",
    effectSummaryKo: "거실 대형 화면에서 컷과 Remotion 쇼츠 프리뷰를 리모컨으로 넘겨 봅니다.",
    keywords: ["tv", "리모컨", "dpad", "10ft", "스토리보드", "쇼츠"],
    visualCue: "timeline-scrub",
  },
  {
    id: "sc-remotion-export",
    titleKo: "Remotion 9:16 숏폼 즉시 프리뷰",
    category: "export-device",
    platform: "desktop",
    macCombo: "⌘E",
    winCombo: "Ctrl+E",
    gestureCueKo: "타임라인 상단 '숏폼 출고' 원탭",
    effectSummaryKo: "선택한 컷과 비트싱크 자막을 9:16 숏폼 컴포지션으로 묶어 미리 봅니다.",
    keywords: ["remotion", "숏폼", "출고", "영상", "애니", "ctrl+e"],
    visualCue: "timeline-scrub",
  },
];
