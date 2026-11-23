/**
 * 멀티 디바이스 주변기기(스타일러스·WebHID·게임패드·WebMIDI·USB 풋페달) 정본 프리셋 카탈로그.
 *
 * - 순수 읽기 전용 데이터와 타입 정의만 보관하며 브라우저 저장소나 DOM을 직접 호출하지 않는다.
 */

export type PressureCurvePresetId = "light" | "balanced" | "heavy";

export interface StylusPressureCurveConfig {
  readonly preset: PressureCurvePresetId;
  /** 감마 지수(0.35~2.5). 1 미만은 약한 힘에도 굵게, 1 초과는 강한 힘에 점진 반응. */
  readonly gamma: number;
  /** 시작 컷오프 데드존(0~0.25). */
  readonly deadzone: number;
  /** 출력 최소 필압(0~0.4). */
  readonly minOutput: number;
  /** 출력 최대 필압(0.5~1). */
  readonly maxOutput: number;
}

export const STYLUS_PRESSURE_PRESETS: Readonly<
  Record<PressureCurvePresetId, StylusPressureCurveConfig & { readonly labelKo: string; readonly summaryKo: string }>
> = Object.freeze({
  light: Object.freeze({
    preset: "light",
    gamma: 0.65,
    deadzone: 0.02,
    minOutput: 0.1,
    maxOutput: 1,
    labelKo: "가볍게 (손목 부담 최소)",
    summaryKo: "살짝만 대도 선 굵기가 빠르게 살아나 장시간 연재 작업에 편합니다.",
  }),
  balanced: Object.freeze({
    preset: "balanced",
    gamma: 1.0,
    deadzone: 0.03,
    minOutput: 0.06,
    maxOutput: 1,
    labelKo: "표준 균형 (G펜 기본)",
    summaryKo: "입력 필압을 선형에 가깝게 반영해 선화 강약 조절이 일정합니다.",
  }),
  heavy: Object.freeze({
    preset: "heavy",
    gamma: 1.48,
    deadzone: 0.05,
    minOutput: 0.04,
    maxOutput: 1,
    labelKo: "묵직하게 (정밀 세선)",
    summaryKo: "초반 가는 선을 넓게 확보해 세밀한 털·눈동자 묘사에 유리합니다.",
  }),
});

export type PenSideButtonSlot = "primary-lower" | "secondary-upper" | "tail-double-tap";

export type PenSideButtonActionId =
  | "eyedropper"
  | "eraser-hold"
  | "radial-menu"
  | "pan-canvas"
  | "undo"
  | "redo"
  | "toggle-eraser"
  | "switch-last-tool";

export type PenSideButtonMapping = Readonly<Record<PenSideButtonSlot, PenSideButtonActionId>>;

export interface PenSideButtonPreset {
  readonly id: "webtoon-ink" | "color-painter" | "apple-pencil-pro";
  readonly labelKo: string;
  readonly slots: PenSideButtonMapping;
}

export const PEN_SIDE_BUTTON_ACTION_LABELS: Readonly<Record<PenSideButtonActionId, string>> = Object.freeze({
  eyedropper: "스포이드 색 추출",
  "eraser-hold": "누르는 동안 지우개",
  "radial-menu": "래디얼 퀵 휠 호출",
  "pan-canvas": "손바닥 화면 이동",
  undo: "실행 취소 (Undo)",
  redo: "다시 실행 (Redo)",
  "toggle-eraser": "펜 ↔ 지우개 전환",
  "switch-last-tool": "직전 도구 왕복",
});

export const PEN_SIDE_BUTTON_PRESETS: Readonly<Record<PenSideButtonPreset["id"], PenSideButtonPreset>> =
  Object.freeze({
    "webtoon-ink": Object.freeze({
      id: "webtoon-ink",
      labelKo: "웹툰 펜선 3단 기본",
      slots: Object.freeze({
        "primary-lower": "eyedropper",
        "secondary-upper": "radial-menu",
        "tail-double-tap": "toggle-eraser",
      }),
    }),
    "color-painter": Object.freeze({
      id: "color-painter",
      labelKo: "채색·명암 집중 3단",
      slots: Object.freeze({
        "primary-lower": "eyedropper",
        "secondary-upper": "undo",
        "tail-double-tap": "switch-last-tool",
      }),
    }),
    "apple-pencil-pro": Object.freeze({
      id: "apple-pencil-pro",
      labelKo: "애플 펜슬 스퀴즈·더블탭 3단",
      slots: Object.freeze({
        "primary-lower": "radial-menu",
        "secondary-upper": "pan-canvas",
        "tail-double-tap": "toggle-eraser",
      }),
    }),
  });

export type WebHidControllerPresetId = "tourbox-neo-elite" | "loupedeck-ct-live";

export interface WebHidControlBinding {
  readonly controlId: string;
  readonly controlLabelKo: string;
  readonly actionId: string;
  readonly actionLabelKo: string;
  readonly stepValue: number;
}

export interface WebHidControllerPreset {
  readonly id: WebHidControllerPresetId;
  readonly displayName: string;
  readonly vendorIdHex: string;
  readonly descriptionKo: string;
  readonly bindings: readonly WebHidControlBinding[];
}

export const WEBHID_CONTROLLER_PRESETS: Readonly<
  Record<WebHidControllerPresetId, WebHidControllerPreset>
> = Object.freeze({
  "tourbox-neo-elite": Object.freeze({
    id: "tourbox-neo-elite",
    displayName: "TourBox Neo / Elite",
    vendorIdHex: "0x0483",
    descriptionKo: "노브·스크롤·다이얼 3축으로 브러시 크기, 캔버스 회전, 타임라인 프레임 이동을 조작합니다.",
    bindings: Object.freeze([
      Object.freeze({ controlId: "knob.cw", controlLabelKo: "노브 시계", actionId: "brush.size+", actionLabelKo: "브러시 크기 +2px", stepValue: 2 }),
      Object.freeze({ controlId: "knob.ccw", controlLabelKo: "노브 반시계", actionId: "brush.size-", actionLabelKo: "브러시 크기 -2px", stepValue: -2 }),
      Object.freeze({ controlId: "dial.cw", controlLabelKo: "다이얼 회전", actionId: "canvas.rotate", actionLabelKo: "캔버스 +15° 회전", stepValue: 15 }),
      Object.freeze({ controlId: "scroll.up", controlLabelKo: "스크롤 업", actionId: "canvas.zoom+", actionLabelKo: "줌 +10%", stepValue: 10 }),
      Object.freeze({ controlId: "tall.press", controlLabelKo: "톨 버튼", actionId: "history.undo", actionLabelKo: "실행 취소", stepValue: 1 }),
      Object.freeze({ controlId: "short.press", controlLabelKo: "쇼트 버튼", actionId: "eyedropper", actionLabelKo: "스포이드 추출", stepValue: 1 }),
    ]),
  }),
  "loupedeck-ct-live": Object.freeze({
    id: "loupedeck-ct-live",
    displayName: "Loupedeck CT / Live",
    vendorIdHex: "0x2ec2",
    descriptionKo: "6개 촉각 다이얼과 LCD 터치 패드로 불투명도·색온도·레이어·3D 카메라를 제어합니다.",
    bindings: Object.freeze([
      Object.freeze({ controlId: "dial.1", controlLabelKo: "좌상 다이얼", actionId: "brush.size", actionLabelKo: "브러시 굵기 조절", stepValue: 2 }),
      Object.freeze({ controlId: "dial.2", controlLabelKo: "좌중 다이얼", actionId: "brush.opacity", actionLabelKo: "브러시 불투명도", stepValue: 5 }),
      Object.freeze({ controlId: "dial.3", controlLabelKo: "좌하 다이얼", actionId: "canvas.rotate", actionLabelKo: "캔버스 정밀 회전", stepValue: 5 }),
      Object.freeze({ controlId: "wheel.main", controlLabelKo: "중앙 메인 휠", actionId: "timeline.scrub", actionLabelKo: "애니매틱 프레임 이동", stepValue: 1 }),
      Object.freeze({ controlId: "pad.1", controlLabelKo: "LCD 패드 1", actionId: "history.undo", actionLabelKo: "실행 취소", stepValue: 1 }),
      Object.freeze({ controlId: "pad.2", controlLabelKo: "LCD 패드 2", actionId: "layer.new", actionLabelKo: "새 레이어 추가", stepValue: 1 }),
    ]),
  }),
});

export interface GamepadLeftHandBinding {
  readonly inputKey: string;
  readonly labelKo: string;
  readonly actionId: string;
  readonly actionLabelKo: string;
}

export const GAMEPAD_LEFT_HAND_MAPPINGS: readonly GamepadLeftHandBinding[] = Object.freeze([
  Object.freeze({ inputKey: "stick.x", labelKo: "아날로그 스틱 좌/우", actionId: "brush.size", actionLabelKo: "브러시 크기 연속 조절" }),
  Object.freeze({ inputKey: "stick.y", labelKo: "아날로그 스틱 상/하", actionId: "canvas.zoom", actionLabelKo: "캔버스 줌 인/아웃" }),
  Object.freeze({ inputKey: "button.l1", labelKo: "L / LB 트리거", actionId: "history.undo", actionLabelKo: "실행 취소 (Undo)" }),
  Object.freeze({ inputKey: "button.l2", labelKo: "ZL / LT 트리거", actionId: "eyedropper", actionLabelKo: "스포이드 홀드" }),
  Object.freeze({ inputKey: "dpad.left", labelKo: "십자키 좌", actionId: "canvas.rotate.ccw", actionLabelKo: "캔버스 -15° 회전" }),
  Object.freeze({ inputKey: "dpad.right", labelKo: "십자키 우", actionId: "canvas.rotate.cw", actionLabelKo: "캔버스 +15° 회전" }),
  Object.freeze({ inputKey: "button.minus", labelKo: "(-) / Select", actionId: "history.redo", actionLabelKo: "다시 실행 (Redo)" }),
  Object.freeze({ inputKey: "button.stick", labelKo: "스틱 클릭 (L3)", actionId: "canvas.reset-angle", actionLabelKo: "회전 0° 즉시 초기화" }),
]);

export interface WebMidiKnobBinding {
  readonly ccNumber: number;
  readonly knobLabelKo: string;
  readonly targetParam: "brushSizePx" | "opacityPercent" | "canvasRotationDeg" | "wetnessPercent" | "layerOpacityPercent";
  readonly targetLabelKo: string;
  readonly minValue: number;
  readonly maxValue: number;
  readonly unit: string;
}

export const WEBMIDI_CC_BINDINGS: readonly WebMidiKnobBinding[] = Object.freeze([
  Object.freeze({ ccNumber: 1, knobLabelKo: "CC 1 · 모듈레이션 노브", targetParam: "brushSizePx", targetLabelKo: "브러시 크기", minValue: 1, maxValue: 120, unit: "px" }),
  Object.freeze({ ccNumber: 7, knobLabelKo: "CC 7 · 볼륨 페이더", targetParam: "opacityPercent", targetLabelKo: "브러시 불투명도", minValue: 5, maxValue: 100, unit: "%" }),
  Object.freeze({ ccNumber: 10, knobLabelKo: "CC 10 · 팬 다이얼", targetParam: "canvasRotationDeg", targetLabelKo: "캔버스 회전", minValue: -180, maxValue: 180, unit: "°" }),
  Object.freeze({ ccNumber: 74, knobLabelKo: "CC 74 · 컷오프 노브", targetParam: "wetnessPercent", targetLabelKo: "수채 수분·번짐", minValue: 0, maxValue: 100, unit: "%" }),
  Object.freeze({ ccNumber: 71, knobLabelKo: "CC 71 · 레조넌스 노브", targetParam: "layerOpacityPercent", targetLabelKo: "레이어 투명도", minValue: 0, maxValue: 100, unit: "%" }),
]);

export type FootPedalSlot = "left" | "center" | "right";

export interface FootPedalBinding {
  readonly slot: FootPedalSlot;
  readonly labelKo: string;
  readonly holdBehavior: "tap" | "hold";
  readonly actionId: "history.undo" | "eyedropper" | "pan-canvas" | "voice-bubble-toggle";
  readonly actionLabelKo: string;
}

export const FOOT_PEDAL_MAPPINGS: Readonly<Record<FootPedalSlot, FootPedalBinding>> = Object.freeze({
  left: Object.freeze({
    slot: "left",
    labelKo: "좌측 페달",
    holdBehavior: "tap",
    actionId: "history.undo",
    actionLabelKo: "1발 실행 취소 (Undo)",
  }),
  center: Object.freeze({
    slot: "center",
    labelKo: "중앙 페달",
    holdBehavior: "hold",
    actionId: "eyedropper",
    actionLabelKo: "밟는 동안 스포이드",
  }),
  right: Object.freeze({
    slot: "right",
    labelKo: "우측 페달",
    holdBehavior: "hold",
    actionId: "pan-canvas",
    actionLabelKo: "밟는 동안 손바닥 이동",
  }),
});
