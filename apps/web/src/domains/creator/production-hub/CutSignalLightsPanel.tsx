import { useEffect, useMemo, useState } from "react";

import {
  CUT_SIGNAL_RULES,
  CUT_SIGNAL_SETTINGS_STORAGE_KEY,
  DEFAULT_CUT_SIGNAL_SETTINGS,
  cutSignalRule,
  isCutSignalRuleEnabled,
  parseCutSignalSettings,
  serializeCutSignalSettings,
  summarizeCutSignals,
  toggleCutSignalRule,
  type CutSignalCutInput,
  type CutSignalLight,
  type CutSignalResult,
  type CutSignalRuleId,
  type CutSignalSettings,
} from "./cut-signal-lights";
import { ProductionPill, ProductionSectionCard } from "./production-ui";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const LIGHT_DOT_CLASS: Readonly<Record<CutSignalLight, string>> = Object.freeze({
  red: "bg-bad",
  yellow: "bg-warn",
  green: "bg-good",
  none: "bg-line",
});

const LIGHT_CELL_CLASS: Readonly<Record<CutSignalLight, string>> = Object.freeze({
  red: "border-bad/35 bg-bad/10",
  yellow: "border-warn/35 bg-warn/10",
  green: "border-line bg-panel",
  none: "border-line bg-panel",
});

function CutCell({ result }: { readonly result: CutSignalResult }) {
  const bt = useBilingual("CutSignalLightsPanel");
  const lightLabel =
    result.light === "red"
      ? bt("빨간불", "Red light")
      : result.light === "yellow"
        ? bt("노란불", "Yellow light")
        : result.light === "green"
          ? bt("신호 없음", "Clear")
          : bt("판정 재료 없음", "Not enough data");
  return (
    <li className={cn("rounded-xl border p-2.5", LIGHT_CELL_CLASS[result.light])}>
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2.5 shrink-0 rounded-full", LIGHT_DOT_CLASS[result.light])} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">{result.label}</span>
        <span className="sr-only">{lightLabel}</span>
      </div>
      {result.signals.length > 0 ? (
        <ul className="mt-1.5 grid gap-0.5">
          {result.signals.map((signal) => (
            <li key={signal.ruleId} className="text-[0.6875rem] leading-4 text-fg-2">
              <span className="font-semibold">{bt(cutSignalRule(signal.ruleId).label.ko, cutSignalRule(signal.ruleId).label.en)}</span>
              {" — "}
              {bt(signal.detail.ko, signal.detail.en)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[0.6875rem] leading-4 text-fg-3">{lightLabel}</p>
      )}
    </li>
  );
}

/**
 * 회차 맵용 미완성 컷 신호등 패널 (REPORT A-2).
 *
 * 컷 단위 레이어 메타를 받아 규칙 기반 신호를 색으로 보여 준다. "미완성 판정"이
 * 아니라 작가가 정한 규칙의 신호등이므로, 규칙은 아래 토글로 개별적으로 끌 수
 * 있고 꺼진 규칙은 판정에서 완전히 빠진다. 설정은 localStorage에 남는다
 * (제어형 props를 주면 그쪽이 우선한다).
 *
 * 컷 메타(`cuts`)는 에디터 레이어 메타를 cut-signal-lights의 구조적 입력으로
 * 바꾼 어댑터가 공급한다. 재료가 없는 컷은 통과로 위장하지 않고 회색으로 남는다.
 */
export function CutSignalLightsPanel({
  cuts,
  settings: controlledSettings,
  onSettingsChange,
}: {
  readonly cuts: readonly CutSignalCutInput[];
  readonly settings?: CutSignalSettings;
  readonly onSettingsChange?: (next: CutSignalSettings) => void;
}) {
  const bt = useBilingual("CutSignalLightsPanel");
  const [internalSettings, setInternalSettings] = useState<CutSignalSettings>(() => {
    if (controlledSettings) return controlledSettings;
    if (typeof window === "undefined") return DEFAULT_CUT_SIGNAL_SETTINGS;
    try {
      return parseCutSignalSettings(window.localStorage.getItem(CUT_SIGNAL_SETTINGS_STORAGE_KEY));
    } catch {
      return DEFAULT_CUT_SIGNAL_SETTINGS;
    }
  });
  const settings = controlledSettings ?? internalSettings;
  const isControlled = controlledSettings !== undefined;

  useEffect(() => {
    if (isControlled || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CUT_SIGNAL_SETTINGS_STORAGE_KEY, serializeCutSignalSettings(internalSettings));
    } catch {
      // 저장 실패(시크릿 모드 등)는 신호등 동작을 막지 않는다.
    }
  }, [internalSettings, isControlled]);

  const summary = useMemo(() => summarizeCutSignals(cuts, settings), [cuts, settings]);

  const handleToggle = (ruleId: CutSignalRuleId, enabled: boolean) => {
    const next = toggleCutSignalRule(settings, ruleId, enabled);
    if (!isControlled) setInternalSettings(next);
    onSettingsChange?.(next);
  };

  return (
    <ProductionSectionCard
      title={bt("미완성 컷 신호등", "Unfinished-cut signal lights")}
      description={bt(
        "빈 레이어·스케치 보임·톤 누락처럼 기계로 확인할 수 있는 신호를 컷마다 모았습니다. 완성 판정이 아니라 내가 정한 규칙의 신호등이에요.",
        "Machine-checkable signals — empty layers, visible sketches, missing tone — collected per cut. This is not a finished/unfinished verdict; it is a signal light for rules you choose.",
      )}
      action={(
        <span className="flex flex-wrap items-center gap-1.5">
          {summary.redCount > 0 ? (
            <ProductionPill tone="danger">{bt(`빨간불 ${summary.redCount}컷`, `${summary.redCount} red`)}</ProductionPill>
          ) : null}
          {summary.yellowCount > 0 ? (
            <ProductionPill tone="warning">{bt(`노란불 ${summary.yellowCount}컷`, `${summary.yellowCount} yellow`)}</ProductionPill>
          ) : null}
          <ProductionPill tone={summary.redCount + summary.yellowCount > 0 ? "neutral" : "success"}>
            {bt(`신호 없음 ${summary.greenCount}컷`, `${summary.greenCount} clear`)}
          </ProductionPill>
          {summary.unevaluatedCount > 0 ? (
            <ProductionPill>{bt(`판정 재료 없음 ${summary.unevaluatedCount}컷`, `${summary.unevaluatedCount} unknown`)}</ProductionPill>
          ) : null}
        </span>
      )}
    >
      {summary.totalCuts === 0 ? (
        <p className="text-xs leading-5 text-fg-3">
          {bt("아직 신호등에 올릴 컷이 없습니다.", "No cuts to check yet.")}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {summary.results.map((result) => (
            <CutCell key={result.cutId} result={result} />
          ))}
        </ul>
      )}
      <fieldset className="mt-4 rounded-xl border border-line bg-panel p-3">
        <legend className="px-1 text-xs font-semibold text-fg">{bt("신호 규칙", "Signal rules")}</legend>
        <p className="text-[0.6875rem] leading-4 text-fg-3">
          {bt("끄면 그 규칙은 어떤 컷에서도 신호를 켜지 않습니다.", "Turn a rule off and it stops lighting signals on every cut.")}
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {CUT_SIGNAL_RULES.map((rule) => {
            const enabled = isCutSignalRuleEnabled(settings, rule.id);
            const count = summary.signalCountByRule[rule.id];
            return (
              <li key={rule.id} className="flex items-start gap-2">
                <input
                  id={`cut-signal-rule-${rule.id}`}
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0"
                  checked={enabled}
                  onChange={(event) => handleToggle(rule.id, event.target.checked)}
                />
                <label htmlFor={`cut-signal-rule-${rule.id}`} className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold leading-5 text-fg">
                    {bt(rule.label.ko, rule.label.en)}
                    {enabled && count > 0 ? (
                      <span className="ml-1.5 font-normal text-fg-3">{bt(`${count}컷`, `${count} cuts`)}</span>
                    ) : null}
                  </span>
                  <span className="block text-[0.6875rem] leading-4 text-fg-3">{bt(rule.description.ko, rule.description.en)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </ProductionSectionCard>
  );
}
