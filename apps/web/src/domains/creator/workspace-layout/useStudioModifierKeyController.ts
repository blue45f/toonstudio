/**
 * useStudioModifierKeyController — `studio-modifier-key-map.ts` 순수 상태 머신을
 * `window` 키보드·`blur`·길게 누름 타이머에 실시간 연결하는 훅.
 * REA 근거: ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68,
 * ev_853855365e8ebbed8b4f1694c57c2f224a338610827337312b0d42739c4eb4bc
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_HOLD_THRESHOLD_MS,
  DEFAULT_MODIFIER_KEY_CONFIG,
  DEFAULT_MODIFIER_KEY_RULES,
  MAX_HOLD_THRESHOLD_MS,
  MIN_HOLD_THRESHOLD_MS,
  MODIFIER_HOLD_TOOL_OPTIONS,
  advanceModifierKeyHold,
  createModifierKeyControllerState,
  cycleToolRotationSet,
  isImeComposingEvent,
  normalizeModifierKeyConfig,
  normalizeModifierKeyToken,
  onModifierKeyDown,
  onModifierKeyUp,
  onModifierWindowBlur,
} from "./studio-modifier-key-map";

import type { ModifierKeyControllerState, StudioModifierKeyConfig } from "./studio-modifier-key-map";

export interface UseStudioModifierKeyControllerOptions {
  readonly config?: StudioModifierKeyConfig;
  readonly initialToolId?: string;
  readonly enabled?: boolean;
  readonly onActiveToolChange?: (toolId: string) => void;
  readonly now?: () => number;
}

export interface StudioModifierKeyControllerHandle {
  readonly state: ModifierKeyControllerState;
  readonly activeToolLabel: string;
  readonly lastPressedToken: string | null;
  readonly thresholdBounds: { readonly min: number; readonly max: number; readonly defaultMs: number };
  readonly cycleRotationForRule: (ruleId: string) => string;
}

const TOOL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(MODIFIER_HOLD_TOOL_OPTIONS.map((item) => [item.id, item.label])),
  pen: "펜",
  pencil: "연필",
  select: "선택",
  "eraser-hard": "딱딱한 지우개",
  "eraser-soft": "부드러운 지우개",
  "eraser-vector": "벡터 지우개",
});

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName === "INPUT") {
    const t = (target as HTMLInputElement).type;
    return t !== "range" && t !== "button" && t !== "checkbox";
  }
  return false;
}

export function useStudioModifierKeyController({
  config = DEFAULT_MODIFIER_KEY_CONFIG,
  initialToolId = DEFAULT_MODIFIER_KEY_RULES[4]?.holdToolId ?? "brush",
  enabled = true,
  onActiveToolChange,
  now = () => Date.now(),
}: UseStudioModifierKeyControllerOptions = {}): StudioModifierKeyControllerHandle {
  const normalizedConfig = useMemo(() => normalizeModifierKeyConfig(config), [config]);
  const [state, setState] = useState<ModifierKeyControllerState>(() =>
    createModifierKeyControllerState(initialToolId),
  );
  const [lastPressedToken, setLastPressedToken] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const nowRef = useRef(now);
  const onToolChangeRef = useRef(onActiveToolChange);
  nowRef.current = now;
  onToolChangeRef.current = onActiveToolChange;

  const commitState = useCallback(
    (updater: (prev: ModifierKeyControllerState) => ModifierKeyControllerState) => {
      setState((prev) => {
        const next = updater(prev);
        if (next.activeToolId !== prev.activeToolId) onToolChangeRef.current?.(next.activeToolId);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const clearHoldTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target) || isImeComposingEvent(event) || event.repeat) return;
      setLastPressedToken(normalizeModifierKeyToken(event));
      const downAt = nowRef.current();
      commitState((prev) => onModifierKeyDown(prev, normalizedConfig, event, downAt));
      clearHoldTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        commitState((prev) => advanceModifierKeyHold(prev, normalizedConfig, downAt + normalizedConfig.holdThresholdMs));
      }, normalizedConfig.holdThresholdMs);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      clearHoldTimer();
      commitState((prev) => onModifierKeyUp(prev, normalizedConfig, event, nowRef.current()));
    };
    const handleBlur = () => {
      clearHoldTimer();
      commitState((prev) => onModifierWindowBlur(prev));
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      clearHoldTimer();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [commitState, enabled, normalizedConfig]);

  const cycleRotationForRule = useCallback(
    (ruleId: string): string => {
      const rule = normalizedConfig.rules.find((item) => item.id === ruleId);
      let resolvedTool = state.activeToolId;
      commitState((prev) => {
        const nextTool = rule ? cycleToolRotationSet(prev.activeToolId, rule.rotationSet) : prev.activeToolId;
        resolvedTool = nextTool;
        return nextTool === prev.activeToolId ? prev : { ...prev, activeToolId: nextTool };
      });
      return resolvedTool;
    },
    [commitState, normalizedConfig.rules, state.activeToolId],
  );

  return {
    state,
    activeToolLabel: TOOL_LABELS[state.activeToolId] ?? state.activeToolId,
    lastPressedToken,
    thresholdBounds: { min: MIN_HOLD_THRESHOLD_MS, max: MAX_HOLD_THRESHOLD_MS, defaultMs: DEFAULT_HOLD_THRESHOLD_MS },
    cycleRotationForRule,
  };
}
