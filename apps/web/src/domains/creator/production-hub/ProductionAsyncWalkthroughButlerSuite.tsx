/**
 * Loom (비동기 보이스·화면 타임스탬프 워크스루 액션 핀) +
 * Trello (Butler 규칙 기반 공정 카드 자동 이동 및 체크리스트 게이트)
 * 역공학 내재화 스위트 (`ProductionReviewSurface.tsx` 탑재).
 */

import { useId, useMemo, useState } from "react";
import { CheckCircle2, Film, Play, Sparkles, Zap } from "lucide-react";

import {
  DEFAULT_WALKTHROUGH_PINS,
  evaluateAsyncWalkthroughButler,
  type AsyncWalkthroughClipPin,
  type ButlerRuleTriggerMode,
} from "./production-async-walkthrough-butler-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const BUTLER_MODE_OPTIONS: readonly {
  readonly value: ButlerRuleTriggerMode;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  {
    value: "auto-advance-on-zero-blocker",
    labelKo: "블로커 0건 즉시 다음 공정 이동",
    labelEn: "Auto-advance when blockers = 0",
  },
  {
    value: "strict-all-pins-resolved",
    labelKo: "모든 핀(보정 포함) 100% 완료 시 이동",
    labelEn: "Strict: require 100% pins resolved",
  },
  {
    value: "manual-pd-gate",
    labelKo: "수동 PD 승인 게이트 유지",
    labelEn: "Manual PD gate hold",
  },
];

export function ProductionAsyncWalkthroughButlerSuite() {
  const bt = useBilingual("ProductionAsyncWalkthroughButlerSuite");
  const tableCaptionId = useId();
  const clipCodeInputId = useId();

  const [clipCode, setClipCode] = useState("LOOM-EP12-REV3");
  const [butlerMode, setButlerMode] = useState<ButlerRuleTriggerMode>(
    "auto-advance-on-zero-blocker",
  );
  const [autoNotifyNextAssignee, setAutoNotifyNextAssignee] = useState(true);
  const [autoUnlockMilestoneHold, setAutoUnlockMilestoneHold] = useState(true);
  const [pins, setPins] = useState<readonly AsyncWalkthroughClipPin[]>(
    () => DEFAULT_WALKTHROUGH_PINS,
  );
  const [activeTimestampSec, setActiveTimestampSec] = useState<number>(18);

  const evaluation = useMemo(
    () =>
      evaluateAsyncWalkthroughButler({
        clipCode,
        fromStageKo: "04 선화·펜선 검수",
        toStageKo: "06 명암·렌더링 인계",
        butlerMode,
        autoNotifyNextAssignee,
        autoUnlockMilestoneHold,
        pins,
      }),
    [clipCode, butlerMode, autoNotifyNextAssignee, autoUnlockMilestoneHold, pins],
  );

  function togglePinResolved(pinId: string) {
    setPins((prev) =>
      prev.map((pin) =>
        pin.pinId === pinId ? { ...pin, resolved: !pin.resolved } : pin,
      ),
    );
  }

  function resolveAllPins() {
    setPins((prev) => prev.map((pin) => ({ ...pin, resolved: true })));
  }

  return (
    <section
      data-testid="production-async-walkthrough-butler-suite"
      aria-label={bt(
        "Loom 비동기 타임스탬프 워크스루 및 Trello Butler 공정 자동 전환 스위트",
        "Loom Async Timestamp Walkthrough & Trello Butler Stage Automation Suite",
      )}
      className="rounded-2xl border border-line bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
              <Film className="size-3.5" aria-hidden="true" />
              {bt("Loom Async Walkthrough · Trello Butler 내재화", "Loom Async Walkthrough · Trello Butler")}
            </span>
            <span
              data-testid="walkthrough-completion-badge"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-xs font-semibold tabular-nums text-fg-2"
            >
              <Zap className="size-3.5 text-good" aria-hidden="true" />
              {bt(
                `타임스탬프 핀 ${evaluation.resolvedPins}/${evaluation.totalPins} (${evaluation.completionRatioPct}%) · 블로커 ${evaluation.unresolvedBlockerCount}건`,
                `Pins ${evaluation.resolvedPins}/${evaluation.totalPins} (${evaluation.completionRatioPct}%) · Blockers ${evaluation.unresolvedBlockerCount}`,
              )}
            </span>
          </div>
          <h3 className="mt-2 text-base font-black text-fg sm:text-lg">
            {bt(
              "비동기 화면·음성 타임스탬프 워크스루 & Butler 공정 카드 자동 전환",
              "Async Screen/Voice Timestamp Walkthrough & Butler Stage Card Automation",
            )}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "실시간 회의 없이 PD·선행 작가가 녹화한 캔버스 타임스탬프 피드백 핀을 점검하고, 블로커 핀이 0건이 되는 즉시 Trello Butler 규칙으로 다음 공정 카드로 이동·알림·정산 해금을 자동 수행합니다.",
              "Review recorded canvas timestamp pins asynchronously and automatically advance the stage card, ping the next artist, and unlock milestone escrow via Trello Butler rules once blockers hit zero.",
            )}
          </p>
        </div>

        <button
          type="button"
          data-testid="walkthrough-resolve-all-btn"
          onClick={resolveAllPins}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/15"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {bt("전 구간 타임스탬프 핀 일괄 해결", "Resolve all timestamp pins")}
        </button>
      </div>

      {/* Butler 규칙 설정 폼 (modern-web-guidance: forms — <5 exclusive options as radio buttons in fieldset/legend, identifier input with autocorrect="off") */}
      <form
        onSubmit={(event) => event.preventDefault()}
        className="mt-4 grid gap-4 rounded-xl border border-line bg-raised/40 p-3.5 lg:grid-cols-[minmax(0,1fr)_240px]"
      >
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-fg">
            {bt("Trello Butler 공정 전환 트리거 모드 (단일 선택)", "Trello Butler Stage Trigger Mode")}
          </legend>
          <div className="flex flex-wrap gap-3 pt-1">
            {BUTLER_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg-2"
              >
                <input
                  type="radio"
                  name="butler-trigger-mode"
                  value={option.value}
                  checked={butlerMode === option.value}
                  data-testid={`butler-mode-${option.value}`}
                  onChange={() => setButlerMode(option.value)}
                />
                <span>{bt(option.labelKo, option.labelEn)}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 pt-1 text-xs text-fg-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                name="auto-notify-assignee"
                checked={autoNotifyNextAssignee}
                onChange={(event) => setAutoNotifyNextAssignee(event.target.checked)}
              />
              <span>{bt("이동 즉시 후행 공정 작가 자동 멘션", "Auto-ping next stage artist")}</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                name="auto-unlock-milestone"
                checked={autoUnlockMilestoneHold}
                onChange={(event) => setAutoUnlockMilestoneHold(event.target.checked)}
              />
              <span>{bt("선행 공정 에스크로 분할 정산 자동 해금", "Auto-unlock upstream milestone tranche")}</span>
            </label>
          </div>
        </fieldset>

        <div className="flex flex-col justify-between gap-1.5">
          <label htmlFor={clipCodeInputId} className="text-xs font-bold text-fg">
            {bt("워크스루 클립 식별 코드", "Walkthrough Clip ID")}
          </label>
          <input
            id={clipCodeInputId}
            name="walkthrough-clip-code"
            type="text"
            value={clipCode}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => setClipCode(event.target.value)}
            className="rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-xs text-fg"
          />
          <span className="text-[0.6875rem] text-fg-3 tabular-nums">
            {bt(`현재 재생 헤드: ${activeTimestampSec}초 구간`, `Playhead: ${activeTimestampSec}s`)}
          </span>
        </div>
      </form>

      {/* 타임스탬프 핀 반응형 데이터 테이블 (modern-web-guidance: responsive-table — tabindex="0" role="region" aria-labelledby + sticky th) */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Modern Web Guidance responsive-table keyboard scrollable region */}
      <div tabIndex={0}
        role="region"
        aria-labelledby={tableCaptionId}
        className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line"
      >
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <caption id={tableCaptionId} className="sr-only">
            {bt(
              "비동기 워크스루 타임스탬프 피드백 핀 및 해결 상태 표",
              "Async walkthrough timestamp pins and resolution status table",
            )}
          </caption>
          <thead className="sticky top-0 z-10 bg-raised text-fg-2">
            <tr>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("타임스탬프 · 컷", "Timestamp · Cut")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("대상 레이어 · 작성자", "Target Layer · Author")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("녹화 음성·드로오버 지시사항", "Recorded Voice & Draw-Over Note")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("등급 · 상태", "Severity · Status")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-panel">
            {pins.map((pin) => (
              <tr key={pin.pinId} data-testid={`walkthrough-pin-row-${pin.pinId}`}>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-panel px-3 py-2.5 font-mono font-bold text-fg tabular-nums"
                >
                  <button
                    type="button"
                    onClick={() => setActiveTimestampSec(pin.timestampSec)}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-bold text-accent hover:border-accent"
                  >
                    <Play className="size-3" aria-hidden="true" />
                    {pin.timestampLabel} · #{pin.cutNumber}컷
                  </button>
                </th>
                <td className="px-3 py-2.5 text-fg-2">
                  <div className="font-semibold text-fg">
                    {bt(pin.targetLayerKo, pin.targetLayerEn)}
                  </div>
                  <div className="text-[0.6875rem] text-fg-3">
                    {bt(pin.authorRoleKo, pin.authorRoleEn)}
                  </div>
                </td>
                <td className="px-3 py-2.5 leading-5 text-fg-2">
                  {bt(pin.noteKo, pin.noteEn)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${
                        pin.severity === "blocker"
                          ? "bg-bad/15 text-bad"
                          : pin.severity === "polish"
                            ? "bg-warn/15 text-warn"
                            : "bg-good/15 text-good"
                      }`}
                    >
                      {pin.severity === "blocker"
                        ? bt("블로커", "Blocker")
                        : pin.severity === "polish"
                          ? bt("세부 보정", "Polish")
                          : bt("우수 확정", "Praise")}
                    </span>
                    <button
                      type="button"
                      aria-pressed={pin.resolved}
                      data-testid={`toggle-walkthrough-pin-${pin.pinId}`}
                      onClick={() => togglePinResolved(pin.pinId)}
                      className={`rounded-lg border px-2 py-0.5 text-[0.6875rem] font-bold ${
                        pin.resolved
                          ? "border-good/40 bg-good/10 text-good"
                          : "border-line bg-raised text-fg-2"
                      }`}
                    >
                      {pin.resolved ? bt("해결됨", "Resolved") : bt("미해결", "Open")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        aria-live="polite"
        data-testid="walkthrough-butler-status-banner"
        className={`mt-3.5 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
          evaluation.cardMovedToNextStage
            ? "border-good/40 bg-good/10 text-fg"
            : "border-warn/40 bg-warn/10 text-fg"
        }`}
      >
        <CheckCircle2
          className={`size-4 shrink-0 ${evaluation.cardMovedToNextStage ? "text-good" : "text-warn"}`}
          aria-hidden="true"
        />
        <span>{bt(evaluation.summaryBannerKo, evaluation.summaryBannerEn)}</span>
      </div>
    </section>
  );
}
