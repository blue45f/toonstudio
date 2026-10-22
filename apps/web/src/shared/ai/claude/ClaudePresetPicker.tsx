import "./claude-assist-i18n";

import { useId } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { CLAUDE_PRESET_IDS, type ClaudeEffortDepth, type ClaudePresetId } from "./claude-effort-presets";
import { CLAUDE_INPUT } from "./claude-ui";
import { formatClaudeUsd } from "./claude-usage-meter";
import { ClaudeModelSelect } from "./ClaudeModelSelect";

/** 프리셋별 비용 상한. undefined는 아직 계산할 입력이 없다는 뜻, null은 단가를 모른다는 뜻이다. */
export type ClaudePresetCaps = Readonly<Record<ClaudePresetId, number | null | undefined>>;

export interface ClaudePresetPickerProps {
  /** 화면에 보일 제목(기능마다 "분석 방식", "번역 방식"처럼 다르다). */
  readonly legend: string;
  readonly value: ClaudePresetId;
  readonly onChange: (id: ClaudePresetId) => void;
  readonly disabled: boolean;
  readonly connectionModel: string;
  readonly caps: ClaudePresetCaps;
  readonly customModel: string;
  readonly onCustomModel: (modelId: string) => void;
  readonly customDepth: ClaudeEffortDepth;
  readonly onCustomDepth: (depth: ClaudeEffortDepth) => void;
}

const COPY: Readonly<Record<ClaudePresetId, { readonly title: string; readonly description: string }>> = {
  quick: { title: "claudeAssist.preset.quick", description: "claudeAssist.preset.quickDesc" },
  default: { title: "claudeAssist.preset.default", description: "claudeAssist.preset.defaultDesc" },
  precise: { title: "claudeAssist.preset.precise", description: "claudeAssist.preset.preciseDesc" },
  custom: { title: "claudeAssist.preset.custom", description: "claudeAssist.preset.customDesc" },
};

const DEPTHS: ReadonlyArray<{ readonly value: ClaudeEffortDepth; readonly key: string }> = [
  { value: "low", key: "claudeAssist.preset.depthLow" },
  { value: "medium", key: "claudeAssist.preset.depthMedium" },
  { value: "high", key: "claudeAssist.preset.depthHigh" },
];

/**
 * 처리 방식 고르기 — 빠르게 · 기본 · 꼼꼼하게 · 직접 고르기. 카드마다 이번 입력에 대한 비용 상한을 같이 보여 줘서,
 * 사용자가 품질과 비용을 한눈에 견주고 고른다. 모델 이름은 카드 설명과 실행 전 확인에 그대로 드러난다.
 */
export function ClaudePresetPicker({
  legend,
  value,
  onChange,
  disabled,
  connectionModel,
  caps,
  customModel,
  onCustomModel,
  customDepth,
  onCustomDepth,
}: ClaudePresetPickerProps) {
  const t = useT();
  const idBase = useId();
  return (
    <fieldset className="space-y-2" disabled={disabled} data-claude-preset-picker="true">
      <legend className="mb-1 text-xs font-bold text-fg-2">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {CLAUDE_PRESET_IDS.map((id) => {
          const copy = COPY[id];
          const cap = caps[id];
          const selected = value === id;
          return (
            <label
              key={id}
              className={cn(
                "flex min-h-[4.5rem] cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent motion-reduce:transition-none",
                selected ? "border-accent bg-accent/10" : "border-line bg-card hover:bg-raised",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name={`${idBase}-preset`} value={id} checked={selected} className="sr-only" onChange={() => onChange(id)} />
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-fg">{t(copy.title)}</span>
                {cap === undefined || id === "custom" ? null : (
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold", cap === null ? "border-warn/35 bg-warn/10 text-warn" : "border-line text-fg-2")}>
                    {cap === null ? t("claudeAssist.preflight.capUnknown") : t("claudeAssist.preflight.capChip", { cost: formatClaudeUsd(cap) })}
                  </span>
                )}
              </span>
              <span className="text-xs text-fg-3">{t(copy.description, { model: connectionModel })}</span>
            </label>
          );
        })}
      </div>
      {value === "custom" ? (
        <div className="grid gap-3 rounded-xl border border-line bg-raised/40 p-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idBase}-model`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.common.modelLabel")}</label>
            <ClaudeModelSelect id={`${idBase}-model`} value={customModel} onChange={onCustomModel} defaultModel={connectionModel} disabled={disabled} />
          </div>
          <div>
            <label htmlFor={`${idBase}-depth`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.preset.depthLabel")}</label>
            <select id={`${idBase}-depth`} className={CLAUDE_INPUT} value={customDepth} disabled={disabled} onChange={(event) => onCustomDepth(event.target.value as ClaudeEffortDepth)}>
              {DEPTHS.map((option) => <option key={option.value} value={option.value}>{t(option.key)}</option>)}
            </select>
            <p className="mt-1 text-xs text-fg-3">{t("claudeAssist.preset.depthHint")}</p>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
