import "./ai-assist-i18n";

import { useId } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ASSIST_PRESET_IDS, type AssistEffortDepth, type AssistPresetId } from "./assist-effort-presets";
import { ASSIST_INPUT } from "./assist-ui";
import { formatAssistUsd } from "./assist-usage-meter";
import { AssistModelSelect } from "./AssistModelSelect";
import { useManagedAssist } from "./use-assist-route";

/** 프리셋별 비용 상한. undefined는 아직 계산할 입력이 없다는 뜻, null은 단가를 모른다는 뜻이다. */
export type AssistPresetCaps = Readonly<Record<AssistPresetId, number | null | undefined>>;

export interface AssistPresetPickerProps {
  /** 화면에 보일 제목(기능마다 "분석 방식", "번역 방식"처럼 다르다). */
  readonly legend: string;
  readonly value: AssistPresetId;
  readonly onChange: (id: AssistPresetId) => void;
  readonly disabled: boolean;
  readonly connectionModel: string;
  readonly caps: AssistPresetCaps;
  readonly customModel: string;
  readonly onCustomModel: (modelId: string) => void;
  readonly customDepth: AssistEffortDepth;
  readonly onCustomDepth: (depth: AssistEffortDepth) => void;
}

const COPY: Readonly<Record<AssistPresetId, { readonly title: string; readonly description: string }>> = {
  quick: { title: "aiAssist.preset.quick", description: "aiAssist.preset.quickDesc" },
  default: { title: "aiAssist.preset.default", description: "aiAssist.preset.defaultDesc" },
  precise: { title: "aiAssist.preset.precise", description: "aiAssist.preset.preciseDesc" },
  custom: { title: "aiAssist.preset.custom", description: "aiAssist.preset.customDesc" },
};

const DEPTHS: ReadonlyArray<{ readonly value: AssistEffortDepth; readonly key: string }> = [
  { value: "low", key: "aiAssist.preset.depthLow" },
  { value: "medium", key: "aiAssist.preset.depthMedium" },
  { value: "high", key: "aiAssist.preset.depthHigh" },
];

/**
 * 처리 방식 고르기 — 빠르게 · 기본 · 꼼꼼하게 · 직접 고르기. 카드마다 이번 입력에 대한 비용 상한을 같이 보여 줘서,
 * 사용자가 품질과 비용을 한눈에 견주고 고른다. 모델 이름은 카드 설명과 실행 전 확인에 그대로 드러난다.
 */
export function AssistPresetPicker({
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
}: AssistPresetPickerProps) {
  const t = useT();
  const idBase = useId();
  // 관리형 경로(ToonStudio AI)는 사용자 비용이 없어 방식마다 비용 대신 "무료"를 보여 준다.
  const managed = useManagedAssist();
  return (
    <fieldset className="space-y-2" disabled={disabled} data-claude-preset-picker="true">
      <legend className="mb-1 text-xs font-bold text-fg-2">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ASSIST_PRESET_IDS.map((id) => {
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
                {id === "custom" ? null : managed ? (
                  <span className="shrink-0 rounded-full border border-good/35 bg-good/10 px-2 py-0.5 text-[0.6875rem] font-bold text-good">
                    {t("aiAssist.managed.capChip")}
                  </span>
                ) : cap === undefined ? null : (
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold", cap === null ? "border-warn/35 bg-warn/10 text-warn" : "border-line text-fg-2")}>
                    {cap === null ? t("aiAssist.preflight.capUnknown") : t("aiAssist.preflight.capChip", { cost: formatAssistUsd(cap) })}
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
            <label htmlFor={`${idBase}-model`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.common.modelLabel")}</label>
            <AssistModelSelect id={`${idBase}-model`} value={customModel} onChange={onCustomModel} defaultModel={connectionModel} disabled={disabled} />
          </div>
          <div>
            <label htmlFor={`${idBase}-depth`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.preset.depthLabel")}</label>
            <select id={`${idBase}-depth`} className={ASSIST_INPUT} value={customDepth} disabled={disabled} onChange={(event) => onCustomDepth(event.target.value as AssistEffortDepth)}>
              {DEPTHS.map((option) => <option key={option.value} value={option.value}>{t(option.key)}</option>)}
            </select>
            <p className="mt-1 text-xs text-fg-3">{t("aiAssist.preset.depthHint")}</p>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
