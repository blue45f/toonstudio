/**
 * StudioModifierKeySettingsSection — 보조키 일시 전환(`DefaultToolModifyKey.tomd`) 및
 * 짧은 누름 도구 순환(`ToolRotationSet`) 설정 + 실시간 미리보기 섹션.
 *
 * `StudioHelpHubDialog` → `ShortcutCustomizer` 하단에 점진적 공개(`<details>`) 형태로 마운트되며,
 * `useStudioModifierKeyController`를 통해 지금 누른 보조키 동작을 실시간으로 검증할 수 있다.
 *
 * REA 근거:
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_853855365e8ebbed8b4f1694c57c2f224a338610827337312b0d42739c4eb4bc
 */
import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  DEFAULT_MODIFIER_KEY_CONFIG,
  MODIFIER_HOLD_TOOL_OPTIONS,
  normalizeModifierKeyConfig,
  type ModifierTapAction,
  type StudioModifierKeyConfig,
} from "./studio-modifier-key-map";
import { useStudioModifierKeyController } from "./useStudioModifierKeyController";

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioModifierKeySettingsSectionProps {
  readonly initialConfig?: StudioModifierKeyConfig;
  readonly onConfigChange?: (next: StudioModifierKeyConfig) => void;
  readonly defaultOpen?: boolean;
}

const INTERACTIVE_TRANSITION =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const RULE_KEY_LABELS: Readonly<Record<string, string>> = {
  Space: "스페이스",
  Alt: "옵션·알트",
  Shift: "시프트",
  Ctrl: "컨트롤",
  E: "지우개 키",
  B: "브러시 키",
};

export function StudioModifierKeySettingsSection({
  initialConfig = DEFAULT_MODIFIER_KEY_CONFIG,
  onConfigChange,
  defaultOpen = false,
}: StudioModifierKeySettingsSectionProps): ReactElement {
  const [config, setConfig] = useState<StudioModifierKeyConfig>(() =>
    normalizeModifierKeyConfig(initialConfig),
  );
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [statusMessage, setStatusMessage] = useState("");

  const liveController = useStudioModifierKeyController({
    config,
    enabled: isOpen,
  });

  const commit = (next: StudioModifierKeyConfig, message: string) => {
    const normalized = normalizeModifierKeyConfig(next);
    setConfig(normalized);
    onConfigChange?.(normalized);
    setStatusMessage(message);
  };

  const handleThresholdChange = (rawMs: number) => {
    commit(
      { ...config, holdThresholdMs: rawMs },
      `길게 누름 기준 시간을 ${(Math.round(rawMs) / 1000).toFixed(2)}초로 설정했어요.`,
    );
  };

  const handleRuleHoldToolChange = (ruleId: string, holdToolId: string) => {
    commit(
      {
        ...config,
        rules: config.rules.map((r) => (r.id === ruleId ? { ...r, holdToolId } : r)),
      },
      "길게 누르는 동안 전환할 도구를 변경했어요.",
    );
  };

  const handleRuleTapActionChange = (ruleId: string, tapAction: ModifierTapAction) => {
    commit(
      {
        ...config,
        rules: config.rules.map((r) => (r.id === ruleId ? { ...r, tapAction } : r)),
      },
      "짧게 누를 때의 동작을 변경했어요.",
    );
  };

  const handleToggleRuleEnabled = (ruleId: string) => {
    commit(
      {
        ...config,
        rules: config.rules.map((r) =>
          r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
        ),
      },
      "보조키 규칙 사용 여부를 전환했어요.",
    );
  };

  const handleResetModifierDefaults = () => {
    commit(DEFAULT_MODIFIER_KEY_CONFIG, "보조키 설정을 기본값으로 되돌렸어요.");
  };

  return (
    <details
      open={isOpen || undefined}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="rounded-xl border border-line bg-card/60 p-2 [word-break:keep-all]"
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-fg select-none",
          "hover:bg-raised/80",
          INTERACTIVE_TRANSITION,
          STUDIO_FOCUS_RING,
        )}
      >
        <span>보조키 일시 전환 설정</span>
        <span className="text-[0.68rem] font-normal tabular-nums text-fg-3">
          기준 {(config.holdThresholdMs / 1000).toFixed(2)}초
        </span>
      </summary>

      <div className="space-y-3 px-2 pb-2 pt-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.7rem] leading-relaxed text-fg-3">
            키를 길게 누르는 동안만 도구를 잠시 바꾸고, 손을 떼면 원래 쓰던 도구로 곧바로 돌아옵니다.
          </p>
          <button
            type="button"
            onClick={handleResetModifierDefaults}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2",
              "hover:border-accent/60 hover:bg-raised hover:text-fg",
              INTERACTIVE_TRANSITION,
              STUDIO_FOCUS_RING,
            )}
          >
            <RotateCcw size={13} aria-hidden />
            보조키 기본값 복원
          </button>
        </div>

        <div
          role="region"
          aria-label="지금 누른 보조키 동작 미리보기"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/35 bg-accent-soft/30 px-3 py-2 text-xs"
        >
          <div className="space-y-0.5">
            <p className="font-semibold text-fg">지금 누른 보조키 동작 미리보기</p>
            <p className="text-[0.7rem] tabular-nums text-fg-2">
              현재 도구: {liveController.activeToolLabel}
              {" · "}
              {liveController.state.isSpringActive ? "일시 전환 중" : "기본 대기"}
              {liveController.lastPressedToken ? ` · 최근 입력 ${liveController.lastPressedToken}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => liveController.cycleRotationForRule("mod-b-rotation")}
            className={cn(
              "min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
              INTERACTIVE_TRANSITION,
              STUDIO_FOCUS_RING,
            )}
          >
            브러시 세트 순환 시험
          </button>
        </div>

        <label className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/70 bg-panel px-3 py-2 text-xs text-fg-2">
          <span>길게 누름 기준 시간</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={liveController.thresholdBounds.min}
              max={liveController.thresholdBounds.max}
              step={10}
              aria-label="길게 누름 기준 시간 슬라이더"
              value={config.holdThresholdMs}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
              className="min-h-11 w-28 cursor-pointer accent-accent"
            />
            <span className="w-16 text-right font-semibold tabular-nums text-fg">
              {(config.holdThresholdMs / 1000).toFixed(2)}초
            </span>
          </div>
        </label>

        <div className="space-y-2" role="group" aria-label="보조키 매핑 목록">
          {config.rules.map((rule) => {
            const plainKeyName = RULE_KEY_LABELS[rule.key] ?? rule.key;
            return (
              <div
                key={rule.id}
                className="grid gap-2 rounded-lg border border-line/70 bg-panel p-2.5 sm:grid-cols-[1fr_auto_auto]"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={rule.enabled}
                    aria-label={`${plainKeyName} 보조키 사용 토글`}
                    onClick={() => handleToggleRuleEnabled(rule.id)}
                    className={cn(
                      "min-h-11 rounded-md border px-2.5 text-xs font-bold tabular-nums",
                      rule.enabled
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-card text-fg-3",
                      INTERACTIVE_TRANSITION,
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    {plainKeyName}
                  </button>
                  <span className="text-xs text-fg-2">
                    {rule.rotationSet.length > 0 ? "길게: 일시 전환 · 짧게: 도구 순환" : "길게 누르는 동안 일시 전환"}
                  </span>
                </div>

                <select
                  aria-label={`${plainKeyName} 길게 누를 때 도구`}
                  value={rule.holdToolId}
                  disabled={!rule.enabled}
                  onChange={(e) => handleRuleHoldToolChange(rule.id, e.target.value)}
                  className={cn(
                    "min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg disabled:opacity-45",
                    INTERACTIVE_TRANSITION,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  {MODIFIER_HOLD_TOOL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      길게 누름: {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={`${plainKeyName} 짧게 누를 때 동작`}
                  value={rule.tapAction}
                  disabled={!rule.enabled || rule.rotationSet.length === 0}
                  onChange={(e) =>
                    handleRuleTapActionChange(rule.id, e.target.value as ModifierTapAction)
                  }
                  className={cn(
                    "min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg disabled:opacity-45",
                    INTERACTIVE_TRANSITION,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <option value="none">짧게 누름: 변경 없음</option>
                  <option value="cycle-rotation-set">짧게 누름: 다음 도구로 순환</option>
                </select>
              </div>
            );
          })}
        </div>

        {statusMessage ? (
          <p role="status" aria-live="polite" className="text-[0.7rem] text-fg-2">
            {statusMessage}
          </p>
        ) : null}
      </div>
    </details>
  );
}
