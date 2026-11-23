/**
 * 멀티 모니터 팝아웃 오케스트레이터(Window Management API `getScreenDetails`) +
 * 가상 스튜디오 화실 실무화 엔진(공동 원고 리뷰 테이블 · 50/10 포모도로 조명/음향 ·
 * 가상 카메라 셔터→2D 컷 즉시 삽입 · 로컬 전용 웹캠 거울 부스).
 *
 * 브라우저 영구 저장소를 직접 호출하지 않는 순수 모듈이다.
 */

export type MonitorTopologyId =
  | "single-monitor"
  | "dual-monitor"
  | "triple-monitor"
  | "pen-display-plus-monitor";

export interface DisplayScreenDescriptor {
  readonly id: string;
  readonly labelKo: string;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly isPrimary: boolean;
  readonly isPenDisplay?: boolean;
  readonly devicePixelRatio?: number;
}

export interface MultiMonitorEnvironmentProbe {
  readonly windowManagementApiSupported: boolean;
  readonly permissionMode: "api-ready" | "fallback-single-screen";
  readonly detectedScreenCount: number;
  readonly summaryKo: string;
}

export interface PopoutWindowPlan {
  readonly id:
    | "tools-and-reference"
    | "reader-mobile-scroll-preview"
    | "script-and-team-review";
  readonly titleKo: string;
  readonly targetScreenId: string;
  readonly bounds: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly targetSyncLatencyMs: number;
  readonly broadcastChannelTopic: string;
  readonly modulesKo: readonly string[];
  readonly windowFeatures: string;
}

export interface MultiMonitorLayoutPlan {
  readonly topology: MonitorTopologyId;
  readonly topologyLabelKo: string;
  readonly primaryCanvasScreenId: string;
  readonly primaryCanvasViewportPct: number;
  readonly penDisplayDedicatedCanvas: boolean;
  readonly popoutWindows: readonly PopoutWindowPlan[];
  readonly readerPreviewLatencyMs: number;
  readonly layoutSummaryKo: string;
}

export interface MultiMonitorLayoutInput {
  readonly screens: readonly DisplayScreenDescriptor[];
  readonly preferPenDisplayAsCanvas?: boolean;
  readonly includeReaderMobilePreview?: boolean;
}

interface ScreenDetailsWindowLike {
  readonly getScreenDetails?: () => Promise<{ readonly screens: readonly unknown[] }>;
  readonly screen?: { readonly isExtended?: boolean };
}

/**
 * Window Management API(`getScreenDetails`) 지원 여부를 안전하게 감지한다.
 */
export function probeMultiMonitorEnvironment(
  win?: ScreenDetailsWindowLike | null,
): MultiMonitorEnvironmentProbe {
  const target =
    win !== undefined
      ? win
      : typeof window !== "undefined"
        ? (window as unknown as ScreenDetailsWindowLike)
        : null;
  const apiSupported = typeof target?.getScreenDetails === "function";
  const isExtended = Boolean(target?.screen?.isExtended);

  return {
    windowManagementApiSupported: apiSupported,
    permissionMode: apiSupported ? "api-ready" : "fallback-single-screen",
    detectedScreenCount: isExtended ? 2 : 1,
    summaryKo: apiSupported
      ? isExtended
        ? "Window Management API 감지됨 · 확장 디스플레이 멀티 팝아웃 자동 배치 가능"
        : "Window Management API 지원됨 · 보조 모니터 연결 시 즉시 팝아웃 배치"
      : "단일 화면 폴백 모드 · 수동 창 분리 또는 단일 캔버스 극대화 레이아웃 적용",
  };
}

export function createMonitorPresetScreens(
  topology: MonitorTopologyId,
): readonly DisplayScreenDescriptor[] {
  if (topology === "single-monitor") {
    return [{ id: "screen-main", labelKo: "주 모니터 (2560×1440)", width: 2560, height: 1440, left: 0, top: 0, isPrimary: true }];
  }
  if (topology === "dual-monitor") {
    return [
      { id: "screen-main", labelKo: "주 화면 · 캔버스 전용 (2560×1440)", width: 2560, height: 1440, left: 0, top: 0, isPrimary: true },
      { id: "screen-aux-1", labelKo: "보조 모니터 · 툴/레퍼런스/독자뷰 (1920×1080)", width: 1920, height: 1080, left: 2560, top: 180, isPrimary: false },
    ];
  }
  if (topology === "pen-display-plus-monitor") {
    return [
      { id: "screen-pen-tablet", labelKo: "액정타블렛 (1920×1080 · 100% 캔버스)", width: 1920, height: 1080, left: 0, top: 1440, isPrimary: true, isPenDisplay: true },
      { id: "screen-upper-monitor", labelKo: "상단 보조 모니터 (2560×1440 · 팝아웃 허브)", width: 2560, height: 1440, left: 0, top: 0, isPrimary: false },
    ];
  }
  return [
    { id: "screen-center", labelKo: "중앙 주 모니터 · 100% 캔버스 (2560×1440)", width: 2560, height: 1440, left: 0, top: 0, isPrimary: true },
    { id: "screen-left", labelKo: "좌측 보조 모니터 · 툴/브러시/3D 레퍼런스 (1920×1080)", width: 1920, height: 1080, left: -1920, top: 180, isPrimary: false },
    { id: "screen-right", labelKo: "우측 보조 모니터 · 16ms 독자 모바일/리뷰 (1920×1080)", width: 1920, height: 1080, left: 2560, top: 180, isPrimary: false },
  ];
}

function formatWindowFeatures(bounds: PopoutWindowPlan["bounds"]): string {
  return `popup=yes,left=${bounds.left},top=${bounds.top},width=${bounds.width},height=${bounds.height},noopener=no`;
}

/**
 * 1·2·3모니터 및 액정타블렛+보조모니터 환경에 맞춰
 * 주 화면 100% 캔버스와 보조 화면 팝아웃(툴/레퍼런스/16ms 독자 모바일 스크롤)을 배치한다.
 */
export function planMultiMonitorLayout(
  input: MultiMonitorLayoutInput,
): MultiMonitorLayoutPlan {
  const screens =
    input.screens.length > 0 ? input.screens : createMonitorPresetScreens("single-monitor");
  const preferPen = input.preferPenDisplayAsCanvas ?? true;
  const includeReader = input.includeReaderMobilePreview ?? true;

  const penScreen = screens.find((screen) => screen.isPenDisplay);
  const primaryCanvasScreen =
    (preferPen && penScreen) || screens.find((screen) => screen.isPrimary) || screens[0];
  const auxiliaryScreens = screens.filter((screen) => screen.id !== primaryCanvasScreen.id);

  if (auxiliaryScreens.length === 0) {
    return {
      topology: "single-monitor",
      topologyLabelKo: "1모니터 집중 레이아웃",
      primaryCanvasScreenId: primaryCanvasScreen.id,
      primaryCanvasViewportPct: 86,
      penDisplayDedicatedCanvas: Boolean(primaryCanvasScreen.isPenDisplay),
      popoutWindows: [],
      readerPreviewLatencyMs: 16,
      layoutSummaryKo:
        "단일 모니터 환경: 캔버스 86% 확보 + 접이식 도크와 16ms 인라인 독자 스크롤 미리보기를 제공합니다.",
    };
  }

  const isPenPlusAux = Boolean(primaryCanvasScreen.isPenDisplay);
  const topology: MonitorTopologyId =
    auxiliaryScreens.length >= 2
      ? "triple-monitor"
      : isPenPlusAux
        ? "pen-display-plus-monitor"
        : "dual-monitor";

  const popoutWindows: PopoutWindowPlan[] = [];

  if (auxiliaryScreens.length === 1) {
    const aux = auxiliaryScreens[0];
    const readerWidth = includeReader ? Math.min(460, Math.round(aux.width * 0.3)) : 0;
    const toolsWidth = aux.width - readerWidth;

    const toolsBounds = {
      left: aux.left,
      top: aux.top,
      width: Math.max(640, toolsWidth),
      height: aux.height,
    };
    popoutWindows.push({
      id: "tools-and-reference",
      titleKo: "툴 · 레이어 · 3D 레퍼런스 팝아웃",
      targetScreenId: aux.id,
      bounds: toolsBounds,
      targetSyncLatencyMs: 16,
      broadcastChannelTopic: "toonstudio:popout:tools-ref",
      modulesKo: ["브러시·색상환", "레이어 트리", "3D 포즈/소품 레퍼런스"],
      windowFeatures: formatWindowFeatures(toolsBounds),
    });

    if (includeReader) {
      const readerBounds = {
        left: aux.left + toolsWidth,
        top: aux.top,
        width: Math.max(390, readerWidth),
        height: aux.height,
      };
      popoutWindows.push({
        id: "reader-mobile-scroll-preview",
        titleKo: "16ms 독자 모바일 세로 스크롤 미리보기",
        targetScreenId: aux.id,
        bounds: readerBounds,
        targetSyncLatencyMs: 16,
        broadcastChannelTopic: "toonstudio:popout:reader-scroll-16ms",
        modulesKo: ["390px 모바일 뷰포트", "실시간 60fps(16ms) 세로 스크롤", "컷 호흡·가독성 체크"],
        windowFeatures: formatWindowFeatures(readerBounds),
      });
    }
  } else {
    const auxTools = auxiliaryScreens[0];
    const auxReader = auxiliaryScreens[1];

    const toolsBounds = {
      left: auxTools.left,
      top: auxTools.top,
      width: auxTools.width,
      height: auxTools.height,
    };
    popoutWindows.push({
      id: "tools-and-reference",
      titleKo: "보조 1 · 툴 · 브러시 · 3D 스테이지 팝아웃",
      targetScreenId: auxTools.id,
      bounds: toolsBounds,
      targetSyncLatencyMs: 16,
      broadcastChannelTopic: "toonstudio:popout:tools-ref",
      modulesKo: ["전체 브러시·팔레트", "레이어·마스크", "3D 배경/VRM 뷰포트"],
      windowFeatures: formatWindowFeatures(toolsBounds),
    });

    const readerWidth = Math.min(460, Math.round(auxReader.width * 0.34));
    const reviewWidth = auxReader.width - readerWidth;

    if (includeReader) {
      const readerBounds = {
        left: auxReader.left,
        top: auxReader.top,
        width: Math.max(390, readerWidth),
        height: auxReader.height,
      };
      popoutWindows.push({
        id: "reader-mobile-scroll-preview",
        titleKo: "보조 2 · 16ms 독자 모바일 스크롤 미리보기",
        targetScreenId: auxReader.id,
        bounds: readerBounds,
        targetSyncLatencyMs: 16,
        broadcastChannelTopic: "toonstudio:popout:reader-scroll-16ms",
        modulesKo: ["실시간 16ms 모바일 스크롤", "말풍선 가독성 검증", "스크롤 리듬 피드백"],
        windowFeatures: formatWindowFeatures(readerBounds),
      });
    }

    const reviewBounds = {
      left: auxReader.left + (includeReader ? readerWidth : 0),
      top: auxReader.top,
      width: Math.max(600, reviewWidth),
      height: auxReader.height,
    };
    popoutWindows.push({
      id: "script-and-team-review",
      titleKo: "보조 2 · 대본 · 타임라인 · 팀 원고 리뷰",
      targetScreenId: auxReader.id,
      bounds: reviewBounds,
      targetSyncLatencyMs: 32,
      broadcastChannelTopic: "toonstudio:popout:script-review",
      modulesKo: ["회차 대본·콘티", "팀 핀 코멘트", "마감 타이머·진행률"],
      windowFeatures: formatWindowFeatures(reviewBounds),
    });
  }

  return {
    topology,
    topologyLabelKo:
      topology === "pen-display-plus-monitor"
        ? "액정타블렛 + 보조 모니터 분리"
        : topology === "triple-monitor"
          ? "3모니터 프로덕션 콕핏"
          : "2모니터 듀얼 팝아웃",
    primaryCanvasScreenId: primaryCanvasScreen.id,
    primaryCanvasViewportPct: 100,
    penDisplayDedicatedCanvas: isPenPlusAux,
    popoutWindows,
    readerPreviewLatencyMs: 16,
    layoutSummaryKo:
      topology === "pen-display-plus-monitor"
        ? "액정타블렛을 100% 방해 없는 풀 캔버스로 고정하고, 상단 보조 모니터에 툴·레퍼런스·16ms 독자 모바일 미리보기를 팝아웃했습니다."
        : `주 화면 100% 풀 캔버스 + 보조 화면 ${popoutWindows.length}개 팝아웃 창(독자 모바일 16ms 실시간 미러링 포함)을 배치했습니다.`,
  };
}

// ---------------------------------------------------------------------------
// 가상 스튜디오 화실 실무화 엔진
// ---------------------------------------------------------------------------

export type WorkdeskLightingPresetId =
  | "morning-sunlight"
  | "sunset-atelier"
  | "night-desk-lamp";

export interface WorkdeskLightingPreset {
  readonly id: WorkdeskLightingPresetId;
  readonly labelKo: string;
  readonly timeOfDayLabelKo: string;
  readonly colorTempKelvin: number;
  readonly deskLampIntensityPct: number;
  readonly blueLightReductionPct: number;
  readonly spatialAudioProfileKo: string;
  readonly ambienceDescriptionKo: string;
}

export const VIRTUAL_WORKDESK_LIGHTING_ORDER: readonly WorkdeskLightingPresetId[] = [
  "morning-sunlight",
  "sunset-atelier",
  "night-desk-lamp",
] as const;

export const VIRTUAL_WORKDESK_LIGHTING_PRESETS: Readonly<
  Record<WorkdeskLightingPresetId, WorkdeskLightingPreset>
> = {
  "morning-sunlight": {
    id: "morning-sunlight",
    labelKo: "햇살 아침 화실",
    timeOfDayLabelKo: "오전 09:30 · 자연 채광",
    colorTempKelvin: 5600,
    deskLampIntensityPct: 25,
    blueLightReductionPct: 0,
    spatialAudioProfileKo: "창밖 아침 바람 · 사각이는 종이 Foley",
    ambienceDescriptionKo: "색 정확도가 가장 높은 5600K 자연광으로 선화·밑색 작업에 적합합니다.",
  },
  "sunset-atelier": {
    id: "sunset-atelier",
    labelKo: "노을 마감 아틀리에",
    timeOfDayLabelKo: "오후 18:10 · 골든아워",
    colorTempKelvin: 3400,
    deskLampIntensityPct: 60,
    blueLightReductionPct: 20,
    spatialAudioProfileKo: "따뜻한 잔비 · 화실 우드 리버브 앰비언스",
    ambienceDescriptionKo: "노을 톤 간접광과 균형 잡힌 스탠드 조명으로 채색·감정 연출에 몰입합니다.",
  },
  "night-desk-lamp": {
    id: "night-desk-lamp",
    labelKo: "밤 스탠드 집중 모드",
    timeOfDayLabelKo: "심야 23:40 · 국부 데스크 스탠드",
    colorTempKelvin: 2700,
    deskLampIntensityPct: 92,
    blueLightReductionPct: 45,
    spatialAudioProfileKo: "심야 빗소리 · 저역 공간 백색소음",
    ambienceDescriptionKo: "눈 피로를 줄이는 2700K 국부 스탠드와 저블루라이트 모드로 야간 마감을 돕습니다.",
  },
};

export interface ReviewTableParticipant {
  readonly id: string;
  readonly nameKo: string;
  readonly roleKo: string;
  readonly focusedCutNumber: number;
  readonly status: "reviewing" | "drawing" | "approved";
}

export interface CapturedCutInsertPayload {
  readonly captureId: string;
  readonly cutNumber: number;
  readonly cameraPresetKo: string;
  readonly focalLengthMm: number;
  readonly includeThreeLayerPasses: boolean;
  readonly insertedInto2dCut: true;
  readonly summaryKo: string;
}

export interface WebcamMirrorBoothState {
  readonly optInOnly: true;
  readonly onDeviceOnly: true;
  readonly enabled: boolean;
  readonly mirrorMode: "expression-mirror" | "hand-pose-mirror" | "head-angle-guide";
  readonly mirroredPreviewFlipped: boolean;
  readonly privacyNoticeKo: string;
}

export interface VirtualWorkdeskSession {
  readonly sessionId: string;
  readonly roomTitleKo: string;
  readonly reviewTable: {
    readonly episodeTitleKo: string;
    readonly activeCutNumber: number;
    readonly pinnedNotesCount: number;
    readonly participants: readonly ReviewTableParticipant[];
  };
  readonly pomodoroRhythm: {
    readonly focusMinutes: number;
    readonly breakMinutes: number;
    readonly phase: "focus" | "break";
    readonly completedFocusCycles: number;
    readonly lightingPresetId: WorkdeskLightingPresetId;
    readonly activeLighting: WorkdeskLightingPreset;
    readonly spatialAudioEnabled: boolean;
    readonly breakGuidanceKo: string | null;
  };
  readonly capturedCuts: readonly CapturedCutInsertPayload[];
  readonly webcamMirrorBooth: WebcamMirrorBoothState;
}

export interface CreateVirtualWorkdeskOptions {
  readonly sessionId?: string;
  readonly roomTitleKo?: string;
  readonly episodeTitleKo?: string;
  readonly initialLighting?: WorkdeskLightingPresetId;
  readonly focusMinutes?: number;
  readonly breakMinutes?: number;
}

/**
 * 공동 원고 리뷰 테이블 · 50/10 포모도로 마감 리듬 조명/음향 ·
 * 가상 카메라 셔터→2D 컷 즉시 삽입 · 로컬 전용 웹캠 거울 부스 세션을 초기화한다.
 */
export function createVirtualWorkdeskSession(
  options: CreateVirtualWorkdeskOptions = {},
): VirtualWorkdeskSession {
  const lightingId = options.initialLighting ?? "morning-sunlight";
  return {
    sessionId: options.sessionId ?? "workdesk-atelier-01",
    roomTitleKo: options.roomTitleKo ?? "툰스튜디오 공동 원고 아틀리에",
    reviewTable: {
      episodeTitleKo: options.episodeTitleKo ?? "제14화 · 옥상 추격전",
      activeCutNumber: 12,
      pinnedNotesCount: 3,
      participants: [
        { id: "p-main", nameKo: "메인 작가", roleKo: "콘티·선화", focusedCutNumber: 12, status: "drawing" },
        { id: "p-color", nameKo: "채색 어시", roleKo: "밑색·명암", focusedCutNumber: 11, status: "reviewing" },
        { id: "p-pd", nameKo: "담당 PD", roleKo: "최종 검수", focusedCutNumber: 12, status: "approved" },
      ],
    },
    pomodoroRhythm: {
      focusMinutes: options.focusMinutes ?? 50,
      breakMinutes: options.breakMinutes ?? 10,
      phase: "focus",
      completedFocusCycles: 0,
      lightingPresetId: lightingId,
      activeLighting: VIRTUAL_WORKDESK_LIGHTING_PRESETS[lightingId],
      spatialAudioEnabled: true,
      breakGuidanceKo: null,
    },
    capturedCuts: [],
    webcamMirrorBooth: {
      optInOnly: true,
      onDeviceOnly: true,
      enabled: false,
      mirrorMode: "expression-mirror",
      mirroredPreviewFlipped: true,
      privacyNoticeKo: "웹캠 거울 부스는 사용자가 켠 동안만 로컬 기기 내부에서 처리되며 외부로 전송되지 않습니다.",
    },
  };
}

/** 50/10 포모도로 집중↔휴식 단계를 전환하고 시간대 조명(햇살→노을→밤 스탠드)을 자동 연동한다. */
export function advancePomodoroWorkdeskPhase(
  session: VirtualWorkdeskSession,
  explicitLighting?: WorkdeskLightingPresetId,
): VirtualWorkdeskSession {
  const current = session.pomodoroRhythm;
  const currentIndex = VIRTUAL_WORKDESK_LIGHTING_ORDER.indexOf(current.lightingPresetId);
  const nextPhase: "focus" | "break" = current.phase === "focus" ? "break" : "focus";
  const completedFocusCycles =
    current.phase === "focus" ? current.completedFocusCycles + 1 : current.completedFocusCycles;

  const nextLightingId: WorkdeskLightingPresetId =
    explicitLighting ??
    (nextPhase === "focus"
      ? VIRTUAL_WORKDESK_LIGHTING_ORDER[(currentIndex + 1) % VIRTUAL_WORKDESK_LIGHTING_ORDER.length]
      : current.lightingPresetId);

  return {
    ...session,
    pomodoroRhythm: {
      ...current,
      phase: nextPhase,
      completedFocusCycles,
      lightingPresetId: nextLightingId,
      activeLighting: VIRTUAL_WORKDESK_LIGHTING_PRESETS[nextLightingId],
      breakGuidanceKo:
        nextPhase === "break"
          ? `${current.breakMinutes}분 휴식 전환 · 손목 스트레칭과 원거리 시선 휴식을 권장합니다.`
          : null,
    },
  };
}

/** 가상 카메라 셔터를 눌러 3D 스테이지 구도를 2D 웹툰 컷 슬롯에 즉시 삽입한다. */
export function triggerVirtualCameraShutter(
  session: VirtualWorkdeskSession,
  input: {
    readonly cutNumber: number;
    readonly cameraPresetKo: string;
    readonly focalLengthMm?: number;
    readonly includeThreeLayerPasses?: boolean;
  },
): VirtualWorkdeskSession {
  const focalLengthMm = Math.min(200, Math.max(14, Math.round(input.focalLengthMm ?? 35)));
  const includeThreeLayerPasses = input.includeThreeLayerPasses ?? true;
  const captureId = `shutter-cut-${input.cutNumber}-${session.capturedCuts.length + 1}`;
  const payload: CapturedCutInsertPayload = {
    captureId,
    cutNumber: input.cutNumber,
    cameraPresetKo: input.cameraPresetKo,
    focalLengthMm,
    includeThreeLayerPasses,
    insertedInto2dCut: true,
    summaryKo: `${input.cutNumber}번 컷에 ${focalLengthMm}mm '${input.cameraPresetKo}' 구도 즉시 삽입 (${
      includeThreeLayerPasses ? "선화/음영/재질 ID 3층 분리" : "단일 래스터"
    })`,
  };

  return {
    ...session,
    reviewTable: {
      ...session.reviewTable,
      activeCutNumber: input.cutNumber,
    },
    capturedCuts: [payload, ...session.capturedCuts],
  };
}

export function updateWebcamMirrorBoothState(
  session: VirtualWorkdeskSession,
  patch: Partial<Pick<WebcamMirrorBoothState, "enabled" | "mirrorMode" | "mirroredPreviewFlipped">>,
): VirtualWorkdeskSession {
  return {
    ...session,
    webcamMirrorBooth: {
      ...session.webcamMirrorBooth,
      ...patch,
      optInOnly: true,
      onDeviceOnly: true,
    },
  };
}
