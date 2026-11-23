/**
 * 차세대 공간 입력(웹캠 옵트인 퀵 HUD · AR 스마트글라스 투시 트레이싱 · WebXR VR 360° & 공간 리본 스케치)
 * 및 브라우저 하드웨어·차세대 API 실시간 감지기.
 */

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type WebcamQuickHudSignal =
  | { readonly kind: "gaze"; readonly zone: "left-rail" | "center-canvas" | "right-inspector" }
  | { readonly kind: "expression"; readonly expression: "brow-raise" | "double-blink" | "neutral" }
  | { readonly kind: "hand"; readonly gesture: "open-palm" | "pinch-ok" | "none" };

export interface WebcamQuickHudState {
  readonly optInConsented: boolean;
  readonly active: boolean;
  readonly gazeZone: "left-rail" | "center-canvas" | "right-inspector";
  readonly lastTriggeredActionKo: string;
  readonly privacyNoticeKo: string;
}

export interface WebcamQuickHudAdapter {
  readonly getState: () => WebcamQuickHudState;
  readonly setOptInConsent: (consented: boolean) => WebcamQuickHudState;
  readonly processSignal: (signal: WebcamQuickHudSignal) => WebcamQuickHudState;
}

/**
 * 웹캠 표정·손·시선 퀵 HUD 옵트인 어댑터.
 * 기본값은 항상 비활성(`optInConsented: false`)이며, 명시적 동의 없이 어떤 신호도 활성화하지 않는다.
 */
export function createWebcamQuickHudAdapter(): WebcamQuickHudAdapter {
  let state: WebcamQuickHudState = Object.freeze({
    optInConsented: false,
    active: false,
    gazeZone: "center-canvas",
    lastTriggeredActionKo: "옵트인 동의 대기 중 (카메라 미접근)",
    privacyNoticeKo: "모든 표정·시선 추론은 기기 내부 메모리에서만 처리되며 외부 서버로 전송되지 않습니다.",
  });

  return Object.freeze({
    getState: () => state,
    setOptInConsent(consented: boolean) {
      state = Object.freeze({
        ...state,
        optInConsented: consented,
        active: consented,
        lastTriggeredActionKo: consented
          ? "웹캠 퀵 HUD 활성화됨 (시선·표정·손 제스처 대기)"
          : "웹캠 퀵 HUD 중지됨 (카메라 비활성)",
      });
      return state;
    },
    processSignal(signal: WebcamQuickHudSignal) {
      if (!state.optInConsented || !state.active) {
        return state;
      }
      if (signal.kind === "gaze") {
        const zoneLabel =
          signal.zone === "left-rail"
            ? "좌측 도구 레일 시선 강조"
            : signal.zone === "right-inspector"
              ? "우측 레이어·색상 패널 시선 강조"
              : "중앙 원고 캔버스 집중";
        state = Object.freeze({ ...state, gazeZone: signal.zone, lastTriggeredActionKo: zoneLabel });
      } else if (signal.kind === "expression") {
        const action =
          signal.expression === "brow-raise"
            ? "눈썹 올림 → 래디얼 퀵 HUD 호출"
            : signal.expression === "double-blink"
              ? "더블 윙크 → 실행 취소 (Undo)"
              : "표정 중립";
        state = Object.freeze({ ...state, lastTriggeredActionKo: action });
      } else {
        const action =
          signal.gesture === "open-palm"
            ? "손바닥 펼침 → 레퍼런스 보드 토글"
            : signal.gesture === "pinch-ok"
              ? "핀치 OK → 현재 컷 체크포인트 고정"
              : "손 제스처 대기";
        state = Object.freeze({ ...state, lastTriggeredActionKo: action });
      }
      return state;
    },
  });
}

export interface ArSmartGlassTracingState {
  readonly active: boolean;
  readonly overlayOpacity: number;
  readonly anchorLocked: boolean;
  readonly wireframeGuide: boolean;
  readonly paperOffsetMm: { readonly x: number; readonly y: number };
  readonly eyeReliefDimmingPercent: number;
}

/** AR 스마트글라스 광학 투시 트레이싱 상태를 생성한다. */
export function createArSmartGlassTracingState(
  initial: Partial<ArSmartGlassTracingState> = {},
): ArSmartGlassTracingState {
  return Object.freeze({
    active: initial.active ?? false,
    overlayOpacity: roundTo(clamp(initial.overlayOpacity ?? 0.48, 0.15, 0.85), 2),
    anchorLocked: initial.anchorLocked ?? false,
    wireframeGuide: initial.wireframeGuide ?? true,
    paperOffsetMm: Object.freeze({
      x: roundTo(clamp(initial.paperOffsetMm?.x ?? 0, -100, 100), 1),
      y: roundTo(clamp(initial.paperOffsetMm?.y ?? 0, -100, 100), 1),
    }),
    eyeReliefDimmingPercent: Math.round(clamp(initial.eyeReliefDimmingPercent ?? 25, 0, 70)),
  });
}

export function updateArTracingState(
  state: ArSmartGlassTracingState,
  patch: Partial<ArSmartGlassTracingState>,
): ArSmartGlassTracingState {
  return createArSmartGlassTracingState({
    ...state,
    ...patch,
    paperOffsetMm: patch.paperOffsetMm ?? state.paperOffsetMm,
  });
}

export type WebXrSessionMode = "director-360" | "spatial-ribbon-sketch";

export interface SpatialRibbonPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly widthCm: number;
}

export interface WebXrDirectorSessionState {
  readonly active: boolean;
  readonly mode: WebXrSessionMode;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly ribbonPoints: readonly SpatialRibbonPoint[];
  readonly statusKo: string;
}

/** WebXR VR 360° 디렉터 및 공간 리본 스케치 세션 어댑터 초기 상태를 만든다. */
export function createWebXrDirectorSession(
  initialMode: WebXrSessionMode = "director-360",
): WebXrDirectorSessionState {
  return Object.freeze({
    active: false,
    mode: initialMode,
    yawDeg: 0,
    pitchDeg: 0,
    ribbonPoints: Object.freeze([]),
    statusKo:
      initialMode === "director-360"
        ? "360° 웹툰 무대 디렉터 프리뷰 대기"
        : "6DoF 공간 리본 스케치 대기",
  });
}

export function setWebXrDirectorMode(
  session: WebXrDirectorSessionState,
  mode: WebXrSessionMode,
  active: boolean = session.active,
): WebXrDirectorSessionState {
  return Object.freeze({
    ...session,
    active,
    mode,
    statusKo:
      mode === "director-360"
        ? active
          ? "WebXR 360° 무대 카메라 연출 활성"
          : "360° 웹툰 무대 디렉터 프리뷰 대기"
        : active
          ? `6DoF 공간 리본 스케치 활성 (${session.ribbonPoints.length}점)`
          : "6DoF 공간 리본 스케치 대기",
  });
}

export function appendSpatialRibbonPoint(
  session: WebXrDirectorSessionState,
  point: SpatialRibbonPoint,
): WebXrDirectorSessionState {
  const nextPoints = Object.freeze([
    ...session.ribbonPoints.slice(-63),
    Object.freeze({
      x: roundTo(clamp(point.x, -10, 10), 3),
      y: roundTo(clamp(point.y, -10, 10), 3),
      z: roundTo(clamp(point.z, -10, 10), 3),
      widthCm: roundTo(clamp(point.widthCm, 0.2, 20), 2),
    }),
  ]);
  return Object.freeze({
    ...session,
    active: true,
    mode: "spatial-ribbon-sketch",
    ribbonPoints: nextPoints,
    statusKo: `6DoF 공간 리본 스케치 활성 (${nextPoints.length}점)`,
  });
}

export type HardwareCapabilityStatus = "ready" | "opt-in" | "fallback";

export interface BrowserHardwareCapabilityItem {
  readonly id:
    | "pointer-stylus"
    | "touch-multitouch"
    | "trackpad-force"
    | "web-hid"
    | "web-midi"
    | "gamepad"
    | "broadcast-sync"
    | "voice-speech"
    | "webcam-hud"
    | "webxr-spatial"
    | "foldable-segments"
    | "haptics-vibrate";
  readonly labelKo: string;
  readonly categoryKo: string;
  readonly status: HardwareCapabilityStatus;
  readonly detailKo: string;
}

export interface BrowserHardwareCapabilityReport {
  readonly items: readonly BrowserHardwareCapabilityItem[];
  readonly readyCount: number;
  readonly optInCount: number;
  readonly fallbackCount: number;
}

export interface BrowserHardwareProbeEnv {
  readonly hasPointerEvent?: boolean;
  readonly maxTouchPoints?: number;
  readonly hasForceTouch?: boolean;
  readonly hasWebHid?: boolean;
  readonly hasWebMidi?: boolean;
  readonly hasGamepad?: boolean;
  readonly hasBroadcastChannel?: boolean;
  readonly hasSpeechRecognition?: boolean;
  readonly hasMediaDevices?: boolean;
  readonly hasWebXr?: boolean;
  readonly hasViewportSegments?: boolean;
  readonly hasVibrate?: boolean;
}

/**
 * 현재 브라우저의 하드웨어 입력(스타일러스·터치·WebHID·WebMIDI·게임패드)과
 * 차세대 API(BroadcastChannel·음성·웹캠·WebXR·폴더블 세그먼트·햅틱) 지원 상태를 실시간 진단한다.
 */
export function detectBrowserHardwareAndNextGenCapabilities(
  env?: BrowserHardwareProbeEnv,
): BrowserHardwareCapabilityReport {
  const nav = typeof navigator !== "undefined" ? (navigator as unknown as Record<string, unknown>) : {};
  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};

  const hasPointerEvent = env?.hasPointerEvent ?? typeof globalThis.PointerEvent === "function";
  const maxTouchPoints =
    env?.maxTouchPoints ?? (typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : 0);
  const hasForceTouch = env?.hasForceTouch ?? "onwebkitmouseforcechanged" in win;
  const hasWebHid = env?.hasWebHid ?? (typeof nav.hid === "object" && nav.hid !== null);
  const hasWebMidi = env?.hasWebMidi ?? typeof nav.requestMIDIAccess === "function";
  const hasGamepad = env?.hasGamepad ?? typeof nav.getGamepads === "function";
  const hasBroadcastChannel = env?.hasBroadcastChannel ?? typeof globalThis.BroadcastChannel === "function";
  const hasSpeechRecognition =
    env?.hasSpeechRecognition ??
    (typeof win.SpeechRecognition === "function" || typeof win.webkitSpeechRecognition === "function");
  const hasMediaDevices =
    env?.hasMediaDevices ??
    (typeof nav.mediaDevices === "object" &&
      nav.mediaDevices !== null &&
      typeof (nav.mediaDevices as { readonly getUserMedia?: unknown }).getUserMedia === "function");
  const hasWebXr = env?.hasWebXr ?? (typeof nav.xr === "object" && nav.xr !== null);
  const hasViewportSegments =
    env?.hasViewportSegments ??
    Array.isArray((win.visualViewport as { readonly segments?: unknown } | undefined)?.segments);
  const hasVibrate = env?.hasVibrate ?? typeof nav.vibrate === "function";

  const items: readonly BrowserHardwareCapabilityItem[] = Object.freeze([
    Object.freeze({
      id: "pointer-stylus",
      labelKo: "디지타이저 · 스타일러스 (필압/기울기/회전)",
      categoryKo: "펜 입력",
      status: hasPointerEvent ? "ready" : "fallback",
      detailKo: hasPointerEvent ? "Pointer Events 필압·기울기·배럴 회전 수신 가능" : "마우스 속도 테이퍼 모드로 자동 보완",
    }),
    Object.freeze({
      id: "touch-multitouch",
      labelKo: "아이패드 · 터치스크린 멀티터치",
      categoryKo: "터치",
      status: maxTouchPoints >= 2 ? "ready" : "fallback",
      detailKo: maxTouchPoints >= 2 ? `최대 ${maxTouchPoints}점 멀티터치 (2지 Undo·3지 Redo)` : "데스크톱 포인터 시뮬레이션 모드",
    }),
    Object.freeze({
      id: "trackpad-force",
      labelKo: "맥북 Force Touch · 0° 자석 핀치",
      categoryKo: "트랙패드",
      status: hasForceTouch ? "ready" : "fallback",
      detailKo: hasForceTouch ? "압력 클릭·핀치 회전 자석 스냅 네이티브 지원" : "표준 트랙패드·휠 0° 자석 스냅 동작",
    }),
    Object.freeze({
      id: "web-hid",
      labelKo: "WebHID (TourBox · Loupedeck · 풋페달)",
      categoryKo: "외부 장치",
      status: hasWebHid ? "opt-in" : "fallback",
      detailKo: hasWebHid ? "사용자 장치 선택 후 직결 가능" : "키보드 단축키·라이브 시뮬레이터로 동작",
    }),
    Object.freeze({
      id: "web-midi",
      labelKo: "WebMIDI 노브 · 페이더 바인딩",
      categoryKo: "외부 장치",
      status: hasWebMidi ? "opt-in" : "fallback",
      detailKo: hasWebMidi ? "MIDI CC 노브 실시간 권한 연동 가능" : "화면 CC 슬라이더 테스트 모드 지원",
    }),
    Object.freeze({
      id: "gamepad",
      labelKo: "조이콘 · 게임패드 왼손 단축키",
      categoryKo: "외부 장치",
      status: hasGamepad ? "ready" : "fallback",
      detailKo: hasGamepad ? "Gamepad API 폴링 준비 완료" : "가상 게임패드 매핑 미리보기 제공",
    }),
    Object.freeze({
      id: "broadcast-sync",
      labelKo: "크로스-디바이스 실시간 브릿지",
      categoryKo: "동기화",
      status: hasBroadcastChannel ? "ready" : "fallback",
      detailKo: hasBroadcastChannel ? "BroadcastChannel 저지연 탭·워치·TV 동기화 활성" : "단일 메모리 루프백 동기화로 안전 동작",
    }),
    Object.freeze({
      id: "voice-speech",
      labelKo: "워치 보이스-투-말풍선 캡처",
      categoryKo: "음성",
      status: hasSpeechRecognition ? "opt-in" : "fallback",
      detailKo: hasSpeechRecognition ? "마이크 허용 시 실시간 대사 받아쓰기 지원" : "원탭 빠른 대사 칩·직접 입력 폴백 지원",
    }),
    Object.freeze({
      id: "webcam-hud",
      labelKo: "웹캠 표정 · 손 · 시선 퀵 HUD",
      categoryKo: "차세대 I/O",
      status: hasMediaDevices ? "opt-in" : "fallback",
      detailKo: hasMediaDevices ? "명시적 옵트인 동의 시 로컬 메모리 전용 추적" : "시선·표정 시뮬레이터 모드 제공",
    }),
    Object.freeze({
      id: "webxr-spatial",
      labelKo: "AR 글라스 트레이싱 · WebXR VR 360°",
      categoryKo: "공간 컴퓨팅",
      status: hasWebXr ? "opt-in" : "fallback",
      detailKo: hasWebXr ? "WebXR 세션 진입 가능 (360° 디렉터·공간 리본)" : "2D/3D 프리뷰 시뮬레이션 폴백 제공",
    }),
    Object.freeze({
      id: "foldable-segments",
      labelKo: "폴더블 듀얼 세그먼트 힌지 감지",
      categoryKo: "폼팩터",
      status: hasViewportSegments ? "ready" : "fallback",
      detailKo: hasViewportSegments ? "Viewport Segments API로 힌지 자동 회피" : "수동 책 펼침·테이블탑 분할 시뮬레이터 제공",
    }),
    Object.freeze({
      id: "haptics-vibrate",
      labelKo: "크라운 · 0° 자석 디텐트 햅틱",
      categoryKo: "촉각 피드백",
      status: hasVibrate ? "ready" : "fallback",
      detailKo: hasVibrate ? "진동 햅틱 디텐트 신호 출력 가능" : "시각 포커스 링·배지 펄스로 대체",
    }),
  ]);

  let readyCount = 0;
  let optInCount = 0;
  let fallbackCount = 0;
  for (const item of items) {
    if (item.status === "ready") readyCount += 1;
    else if (item.status === "opt-in") optInCount += 1;
    else fallbackCount += 1;
  }

  return Object.freeze({ items, readyCount, optInCount, fallbackCount });
}
