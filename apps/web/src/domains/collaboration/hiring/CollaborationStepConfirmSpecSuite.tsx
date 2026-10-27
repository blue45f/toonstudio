/**
 * 아트머그(Artmug 4단계 공정 컨펌 & 역행 수정 할증 가드) +
 * 라우드소싱(Loudsourcing NDA·1:1 유급 파일럿 3컷 보증) +
 * 노션(Notion 동기화 스타일시트·브러시·레이어 명명 규칙 블록) 역공학 내재화 스위트.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, FileCode2, ShieldAlert, Sparkles } from "lucide-react";

import {
  STEP_CONFIRM_STAGES,
  evaluateStepConfirmAndRollbackGuard,
  type StepConfirmStageId,
} from "./collaboration-step-confirm-spec-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function CollaborationStepConfirmSpecSuite() {
  const bt = useBilingual("CollaborationStepConfirmSpecSuite");
  const [currentStageId, setCurrentStageId] = useState<StepConfirmStageId>("step3-flats");
  const [requestedChangeTargetStageId, setRequestedChangeTargetStageId] =
    useState<StepConfirmStageId>("step3-flats");
  const [baseEpisodeContractKRW, setBaseEpisodeContractKRW] = useState<number>(600_000);
  const [usedConfirmCountInCurrentStage, setUsedConfirmCountInCurrentStage] =
    useState<number>(1);
  const [brushPresetSynced, setBrushPresetSynced] = useState<boolean>(true);
  const [colorScriptSynced, setColorScriptSynced] = useState<boolean>(true);
  const [layerNamingRuleSynced, setLayerNamingRuleSynced] = useState<boolean>(true);
  const [ndaAndPilotEscrowLocked, setNdaAndPilotEscrowLocked] = useState<boolean>(true);

  const evaluation = useMemo(
    () =>
      evaluateStepConfirmAndRollbackGuard({
        currentStageId,
        requestedChangeTargetStageId,
        baseEpisodeContractKRW,
        usedConfirmCountInCurrentStage,
        includedConfirmQuotaPerStage: 2,
        brushPresetSynced,
        colorScriptSynced,
        layerNamingRuleSynced,
        ndaAndPilotEscrowLocked,
      }),
    [
      currentStageId,
      requestedChangeTargetStageId,
      baseEpisodeContractKRW,
      usedConfirmCountInCurrentStage,
      brushPresetSynced,
      colorScriptSynced,
      layerNamingRuleSynced,
      ndaAndPilotEscrowLocked,
    ]
  );

  return (
    <section
      data-testid="collaboration-step-confirm-spec-suite"
      aria-label={bt(
        "아트머그·라우드소싱·노션 역공학 4단계 공정 컨펌 및 동기화 사양서 가드",
        "4-Stage Confirmation & Synced Specification Guard"
      )}
      className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5 text-fg"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {bt(
                "Artmug · Loudsourcing · Notion 역공학 내재화",
                "Artmug · Loudsourcing · Notion Internalized"
              )}
            </span>
            <span
              data-testid="step-confirm-sync-badge"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-xs font-semibold text-fg-2"
            >
              <FileCode2 className="size-3.5 text-good" aria-hidden="true" />
              {bt(
                `동기화 사양 블록 ${evaluation.syncedSpecReadyCount}/${evaluation.syncedSpecTotalCount} 완료`,
                `Synced Spec Blocks ${evaluation.syncedSpecReadyCount}/${evaluation.syncedSpecTotalCount} Ready`
              )}
            </span>
          </div>
          <h2 className="mt-2 text-base font-bold sm:text-lg">
            {bt(
              "4단계 컨펌 게이트(러프→선화→밑색→완성) & 역행 수정(Rollback) 보전 가드",
              "4-Stage Confirmation Gate & Upstream Rollback Surcharge Guard"
            )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "선화·밑색 확정 이후 구도나 포즈를 뒤집는 '이전 공정 역행 수정' 요청 시 작업자 권익 보호를 위해 역행 재작업 할증비를 자동 산출하고, Notion 스타일 동기화 브러시·컬러시트 블록을 검증합니다.",
              "Protects artists from uncompensated upstream rework (e.g. changing rough poses during flat/shading stages) and verifies synced brush/palette specification blocks."
            )}
          </p>
        </div>
        <div
          data-testid="step-confirm-adjusted-total"
          className="rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-right"
        >
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3">
            {bt("최종 보호 정산 예정액", "Protected Settlement Total")}
          </p>
          <p className="mt-0.5 text-xl font-black text-fg">
            ₩{evaluation.totalAdjustedContractKRW.toLocaleString("ko-KR")}
          </p>
        </div>
      </header>

      {/* 4단계 컨펌 스텝 카드 */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {STEP_CONFIRM_STAGES.map((stage) => {
          const isCurrent = stage.id === currentStageId;
          return (
            <button
              key={stage.id}
              type="button"
              aria-pressed={isCurrent}
              data-testid={`step-confirm-stage-btn-${stage.id}`}
              onClick={() => setCurrentStageId(stage.id)}
              className={`flex flex-col justify-between rounded-xl border p-3 text-left text-xs transition-colors ${
                isCurrent
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-line bg-canvas/60 text-fg-2 hover:border-accent/40"
              }`}
            >
              <div>
                <p className="font-bold text-fg">{bt(stage.labelKo, stage.labelEn)}</p>
                <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
                  {bt(stage.allowedScopeKo, stage.allowedScopeEn)}
                </p>
              </div>
              <p className="mt-2 font-mono text-[0.6875rem] text-accent">
                {bt(
                  `역행 수정 계수 ${Math.round(stage.rollbackPenaltyRatio * 100)}%`,
                  `Rollback factor ${Math.round(stage.rollbackPenaltyRatio * 100)}%`
                )}
              </p>
            </button>
          );
        })}
      </div>

      {/* 역행 수정 판별 입력 */}
      <div className="grid gap-3 rounded-xl border border-line bg-canvas/60 p-3.5 text-xs sm:grid-cols-3">
        <label className="grid gap-1 font-semibold text-fg-2">
          {bt("수정 요청 대상 공정 (Target Stage)", "Requested Change Target Stage")}
          <select
            data-testid="step-confirm-target-stage-select"
            value={requestedChangeTargetStageId}
            onChange={(event) =>
              setRequestedChangeTargetStageId(event.target.value as StepConfirmStageId)
            }
            className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-bold text-fg"
          >
            {STEP_CONFIRM_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {bt(stage.labelKo, stage.labelEn)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 font-semibold text-fg-2">
          {bt("회차 기본 계약금 (원)", "Base Episode Contract (KRW)")}
          <input
            type="number"
            step={50000}
            min={100000}
            data-testid="step-confirm-base-krw-input"
            value={baseEpisodeContractKRW}
            onChange={(event) => setBaseEpisodeContractKRW(Number(event.target.value))}
            className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-bold text-fg"
          />
        </label>

        <label className="grid gap-1 font-semibold text-fg-2">
          {bt("현재 단계 누적 컨펌 횟수 (기본 2회 무상)", "Used Confirm Count in Stage (2 Free)")}
          <input
            type="number"
            min={0}
            max={10}
            data-testid="step-confirm-used-count-input"
            value={usedConfirmCountInCurrentStage}
            onChange={(event) =>
              setUsedConfirmCountInCurrentStage(Number(event.target.value))
            }
            className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-bold text-fg"
          />
        </label>
      </div>

      {/* Notion 동기화 사양 블록 체크리스트 */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-canvas/60 p-3 text-xs">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={brushPresetSynced}
            onChange={(event) => setBrushPresetSynced(event.target.checked)}
          />
          <span>{bt("클튜 브러시 프리셋(.sut) 동기화됨", "Brush Preset (.sut) Synced")}</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={colorScriptSynced}
            onChange={(event) => setColorScriptSynced(event.target.checked)}
          />
          <span>{bt("캐릭터 고유색·시간대 컬러시트 동기화됨", "Color Script Palette Synced")}</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={layerNamingRuleSynced}
            onChange={(event) => setLayerNamingRuleSynced(event.target.checked)}
          />
          <span>{bt("표준 레이어 트리 명명 규칙 잠금", "Layer Tree Naming Spec Locked")}</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={ndaAndPilotEscrowLocked}
            onChange={(event) => setNdaAndPilotEscrowLocked(event.target.checked)}
          />
          <span>{bt("라우드소싱형 NDA & 유급 파일럿 3컷 예치", "NDA & Paid 3-Cut Pilot Escrow")}</span>
        </label>
      </div>

      {/* 판정 배너 */}
      <div
        aria-live="polite"
        data-testid="step-confirm-verdict-banner"
        data-verdict={evaluation.gateVerdict}
        className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
          evaluation.gateVerdict === "upstream-rollback-guard"
            ? "border-bad/40 bg-bad/10 text-fg"
            : evaluation.gateVerdict === "extra-confirm-fee"
              ? "border-warn/40 bg-warn/10 text-fg"
              : "border-good/40 bg-good/10 text-fg"
        }`}
      >
        {evaluation.gateVerdict === "pass-in-scope" ? (
          <CheckCircle2 className="size-4 shrink-0 text-good" aria-hidden="true" />
        ) : (
          <ShieldAlert className="size-4 shrink-0 text-warn" aria-hidden="true" />
        )}
        <span>{bt(evaluation.summaryKo, evaluation.summaryEn)}</span>
      </div>
    </section>
  );
}
