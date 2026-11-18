/**
 * Studio Modifier Key Map — CSP 스프링 로드 수식키(`DefaultToolModifyKey.tomd`) 및
 * 도구 순환 세트(`ToolRotationSet`) 순수 상태 머신.
 *
 * 동작 계약:
 * - `keydown` 후 `holdThresholdMs` 이상 누르고 있으면(`advanceModifierKeyHold` 또는 `keyup` 경과 판정)
 *   일시적으로 `holdToolId` 도구로 전환하고, `keyup` 시 직전 도구(`priorToolId`)로 즉시 복귀한다.
 * - `holdThresholdMs` 미만으로 짧게 탭(`keyup`)하면 해당 규칙의 `ToolRotationSet`을 순서대로 순환한다.
 * - 키 자동 반복(`event.repeat === true`)과 한국어·다국어 IME 조합 중(`isComposing`, `keyCode === 229`,
 *   `key === "Process"`) 입력은 무시한다.
 * - 창 포커스 이탈(`blur`) 시 고정된 임시 전환 상태를 자동 해제하고 직전 도구를 복원한다.
 *
 * REA 근거(clean-room math & state machine):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_853855365e8ebbed8b4f1694c57c2f224a338610827337312b0d42739c4eb4bc
 */

export type ModifierTapAction = "none" | "cycle-rotation-set";

export interface ModifierKeyMappingRule {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly holdToolId: string;
  readonly tapAction: ModifierTapAction;
  readonly rotationSet: readonly string[];
}

export interface StudioModifierKeyConfig {
  readonly holdThresholdMs: number;
  readonly rules: readonly ModifierKeyMappingRule[];
}

export interface ModifierKeyboardEventLike {
  readonly key: string;
  readonly code?: string;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
}

export interface ModifierKeyControllerState {
  readonly activeToolId: string;
  readonly priorToolId: string | null;
  readonly pressedRuleId: string | null;
  readonly pressedKey: string | null;
  readonly pressedAtMs: number | null;
  readonly isSpringActive: boolean;
}

export const DEFAULT_HOLD_THRESHOLD_MS = 200;
export const MIN_HOLD_THRESHOLD_MS = 60;
export const MAX_HOLD_THRESHOLD_MS = 800;

export const MODIFIER_HOLD_TOOL_OPTIONS: readonly {
  readonly id: string;
  readonly label: string;
}[] = Object.freeze([
  { id: "pan", label: "손바닥 이동" },
  { id: "eyedropper", label: "스포이드" },
  { id: "eraser", label: "지우개" },
  { id: "brush", label: "브러시" },
  { id: "zoom", label: "돋보기 확대/축소" },
  { id: "line-snap", label: "직선 스냅 보정" },
]);

export const DEFAULT_MODIFIER_KEY_RULES: readonly ModifierKeyMappingRule[] = Object.freeze([
  {
    id: "mod-space",
    key: "Space",
    label: "Space (손바닥 이동)",
    enabled: true,
    holdToolId: "pan",
    tapAction: "none",
    rotationSet: [],
  },
  {
    id: "mod-alt",
    key: "Alt",
    label: "Alt (일시 스포이드)",
    enabled: true,
    holdToolId: "eyedropper",
    tapAction: "none",
    rotationSet: [],
  },
  {
    id: "mod-shift",
    key: "Shift",
    label: "Shift (직선 스냅 보정)",
    enabled: true,
    holdToolId: "line-snap",
    tapAction: "none",
    rotationSet: [],
  },
  {
    id: "mod-e-rotation",
    key: "E",
    label: "E (홀드: 일시 지우개 / 탭: 지우개 순환)",
    enabled: true,
    holdToolId: "eraser",
    tapAction: "cycle-rotation-set",
    rotationSet: ["eraser-hard", "eraser-soft", "eraser-vector"],
  },
  {
    id: "mod-b-rotation",
    key: "B",
    label: "B (홀드: 일시 브러시 / 탭: 펜·연필 순환)",
    enabled: true,
    holdToolId: "brush",
    tapAction: "cycle-rotation-set",
    rotationSet: ["brush", "pen", "pencil"],
  },
]);

export const DEFAULT_MODIFIER_KEY_CONFIG: StudioModifierKeyConfig = Object.freeze({
  holdThresholdMs: DEFAULT_HOLD_THRESHOLD_MS,
  rules: DEFAULT_MODIFIER_KEY_RULES,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeModifierKeyToken(
  event: Pick<ModifierKeyboardEventLike, "key" | "code">,
): string {
  if (event.code === "Space" || event.key === " " || event.key === "Spacebar") {
    return "Space";
  }
  const trimmed = event.key.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "alt" || lower === "option") return "Alt";
  if (lower === "control" || lower === "ctrl") return "Ctrl";
  if (lower === "shift") return "Shift";
  if (lower === "meta" || lower === "command" || lower === "cmd") return "Meta";
  if (lower === "space") return "Space";
  return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
}

export function isImeComposingEvent(event: ModifierKeyboardEventLike): boolean {
  return (
    event.isComposing === true ||
    event.keyCode === 229 ||
    event.key === "Process" ||
    event.key === "Dead"
  );
}

/** `ToolRotationSet`에서 현재 도구의 다음 순번 도구를 반환한다. 목록 밖이면 첫 번째 도구를 선택한다. */
export function cycleToolRotationSet(
  currentToolId: string,
  rotationSet: readonly string[],
): string {
  if (rotationSet.length === 0) return currentToolId;
  const idx = rotationSet.indexOf(currentToolId);
  if (idx < 0) return rotationSet[0]!;
  return rotationSet[(idx + 1) % rotationSet.length]!;
}

export function normalizeModifierKeyConfig(
  raw?: Partial<StudioModifierKeyConfig> | null,
): StudioModifierKeyConfig {
  const holdThresholdMs = Math.round(
    clamp(
      raw?.holdThresholdMs ?? DEFAULT_HOLD_THRESHOLD_MS,
      MIN_HOLD_THRESHOLD_MS,
      MAX_HOLD_THRESHOLD_MS,
    ),
  );
  const rulesSource = raw?.rules?.length ? raw.rules : DEFAULT_MODIFIER_KEY_RULES;
  const rules: ModifierKeyMappingRule[] = rulesSource.map((r) => ({
    id: r.id,
    key: normalizeModifierKeyToken({ key: r.key }),
    label: r.label,
    enabled: r.enabled !== false,
    holdToolId: r.holdToolId.trim() || "pan",
    tapAction: r.tapAction === "cycle-rotation-set" ? "cycle-rotation-set" : "none",
    rotationSet: [...r.rotationSet],
  }));
  return { holdThresholdMs, rules };
}

export function createModifierKeyControllerState(
  initialToolId: string,
): ModifierKeyControllerState {
  return {
    activeToolId: initialToolId,
    priorToolId: null,
    pressedRuleId: null,
    pressedKey: null,
    pressedAtMs: null,
    isSpringActive: false,
  };
}

/** `keydown` 처리: `event.repeat` 및 IME 조합을 무시하고 스프링 대기 상태를 기록한다. */
export function onModifierKeyDown(
  state: ModifierKeyControllerState,
  config: StudioModifierKeyConfig,
  event: ModifierKeyboardEventLike,
  nowMs: number,
): ModifierKeyControllerState {
  if (event.repeat === true || isImeComposingEvent(event)) {
    return state;
  }
  if (state.pressedRuleId !== null) {
    return state;
  }

  const keyToken = normalizeModifierKeyToken(event);
  const rule = config.rules.find((item) => item.enabled && item.key === keyToken);
  if (!rule) return state;

  const immediateSpring = config.holdThresholdMs <= 0;
  return {
    activeToolId: immediateSpring ? rule.holdToolId : state.activeToolId,
    priorToolId: state.activeToolId,
    pressedRuleId: rule.id,
    pressedKey: keyToken,
    pressedAtMs: nowMs,
    isSpringActive: immediateSpring,
  };
}

/** 타이머/포인터 틱에서 호출: 누른 시간이 `holdThresholdMs`에 도달하면 임시 도구로 즉시 전환한다. */
export function advanceModifierKeyHold(
  state: ModifierKeyControllerState,
  config: StudioModifierKeyConfig,
  nowMs: number,
): ModifierKeyControllerState {
  if (
    state.pressedRuleId === null ||
    state.pressedAtMs === null ||
    state.isSpringActive
  ) {
    return state;
  }
  if (nowMs - state.pressedAtMs < config.holdThresholdMs) {
    return state;
  }
  const rule = config.rules.find((item) => item.id === state.pressedRuleId);
  if (!rule) return state;

  return {
    ...state,
    activeToolId: rule.holdToolId,
    isSpringActive: true,
  };
}

/**
 * `keyup` 처리:
 * - 누른 시간이 `holdThresholdMs` 이상이거나 이미 스프링 전환된 경우 직전 도구(`priorToolId`)로 복귀한다.
 * - `holdThresholdMs` 미만 탭이면 `ToolRotationSet`을 순환한다.
 */
export function onModifierKeyUp(
  state: ModifierKeyControllerState,
  config: StudioModifierKeyConfig,
  event: ModifierKeyboardEventLike,
  nowMs: number,
): ModifierKeyControllerState {
  if (
    state.pressedRuleId === null ||
    state.pressedKey === null ||
    state.pressedAtMs === null ||
    state.priorToolId === null
  ) {
    return state;
  }

  const releasedKey = normalizeModifierKeyToken(event);
  if (releasedKey !== state.pressedKey) {
    return state;
  }

  const elapsedMs = Math.max(0, nowMs - state.pressedAtMs);
  const rule = config.rules.find((item) => item.id === state.pressedRuleId);
  const wasHold = state.isSpringActive || elapsedMs >= config.holdThresholdMs;

  let nextToolId = state.priorToolId;
  if (!wasHold && rule && rule.tapAction === "cycle-rotation-set") {
    nextToolId = cycleToolRotationSet(state.priorToolId, rule.rotationSet);
  }

  return {
    activeToolId: nextToolId,
    priorToolId: null,
    pressedRuleId: null,
    pressedKey: null,
    pressedAtMs: null,
    isSpringActive: false,
  };
}

/** 창 포커스 상실(`window.blur`) 시 고정된 스프링 로드 상태를 안전하게 자동 해제한다. */
export function onModifierWindowBlur(
  state: ModifierKeyControllerState,
): ModifierKeyControllerState {
  if (state.pressedRuleId === null) return state;
  return {
    activeToolId: state.priorToolId ?? state.activeToolId,
    priorToolId: null,
    pressedRuleId: null,
    pressedKey: null,
    pressedAtMs: null,
    isSpringActive: false,
  };
}
