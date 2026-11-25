/**
 * Wave 39E — Tab 3: 스마트워치 동반 리모컨 (디지털 크라운 · 4버튼 촉각 패드 · 손목 피로 코치 · 3초 음성 대사 큐).
 */

import {
  Activity,
  CheckCircle2,
  FlipHorizontal2,
  Mic,
  Pipette,
  Redo2,
  Undo2,
  Watch,
} from "lucide-react";
import { useState, type ReactElement } from "react";

import {
  acknowledgeBreakCompleted,
  applyDigitalCrownDelta,
  createInitialSmartwatchState,
  DEMO_VOICE_MEMO_PRESETS,
  enqueueVoiceDialogueMemo,
  recordDrawingBurst,
  TACTILE_PAD_BUTTONS,
  triggerTactilePadButton,
  type CrownSensitivityPreset,
  type DigitalCrownMode,
  type SmartwatchCompanionState,
  type TactilePadButtonId,
} from "./smartwatch-companion-engine";

export interface CharlabCspSurpassWatchTabProps {
  readonly uid: string;
  readonly isEn: boolean;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const CROWN_MODES: readonly { readonly id: DigitalCrownMode; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "brush-size", labelKo: "브러시 크기", labelEn: "Brush Size" },
  { id: "canvas-zoom", labelKo: "캔버스 줌", labelEn: "Canvas Zoom" },
  { id: "brush-opacity", labelKo: "불투명도", labelEn: "Opacity" },
  { id: "canvas-rotate", labelKo: "캔버스 회전", labelEn: "Rotation" },
];

const SENSITIVITY_PRESETS: readonly { readonly id: CrownSensitivityPreset; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "precision", labelKo: "정밀", labelEn: "Precision" },
  { id: "balanced", labelKo: "균형", labelEn: "Balanced" },
  { id: "turbo", labelKo: "터보", labelEn: "Turbo" },
];

function getPadIcon(id: TactilePadButtonId): ReactElement {
  if (id === "undo") return <Undo2 className="h-4 w-4" aria-hidden="true" />;
  if (id === "redo") return <Redo2 className="h-4 w-4" aria-hidden="true" />;
  if (id === "eyedropper") return <Pipette className="h-4 w-4" aria-hidden="true" />;
  return <FlipHorizontal2 className="h-4 w-4" aria-hidden="true" />;
}

export function CharlabCspSurpassWatchTab(props: CharlabCspSurpassWatchTabProps): ReactElement {
  const { uid, isEn } = props;
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [watchState, setWatchState] = useState<SmartwatchCompanionState>(() =>
    createInitialSmartwatchState(),
  );
  const [voiceDraft, setVoiceDraft] = useState<string>("지금 당장 돌아와!");
  const [queueMessage, setQueueMessage] = useState("");

  const handleCrownSpin = (deltaDeg: number, velocity: number): void => {
    setWatchState((prev) =>
      applyDigitalCrownDelta(prev, { deltaDeg, angularVelocityDegPerSec: velocity }).state,
    );
  };

  const handleAddVoiceMemo = (transcript: string, durationSec: number, speakerName?: string): void => {
    setWatchState((prev) => enqueueVoiceDialogueMemo(prev, { transcript, durationSec, speakerName }));
  };

  return (
    <div
      id={`${uid}-panel-watch-remote`}
      role="tabpanel"
      aria-labelledby={`${uid}-tab-watch-remote`}
      className="space-y-4 [word-break:keep-all]"
    >
      <p data-testid="watch-scope-notice" className="text-xs text-fg-2">
        {pick("고정 워치 상태·크라운 입력·촉각 패턴·획 통계·전사 텍스트를 계산하는 예제예요. BLE 연결·송신·진동·마이크 녹음·음성 인식·실제 캔버스 명령은 실행하지 않아요. 피로 점수는 합성 통계이며 신체 상태 측정값이 아니에요.", "These examples calculate fixed watch state, crown input, haptics, stroke metrics and transcript text. BLE, transmission, vibration, recording, speech recognition and live canvas commands are not connected. Fatigue scores use synthetic metrics.")}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Watch className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("디지털 크라운 입력 계산 예제", "Digital Crown Input Example")}</span>
            </h3>
            <span data-testid="watch-crown-value" className="text-xs font-bold text-accent tabular-nums">
              {pick("브러시", "Brush")} {watchState.brushSizePx}px · {pick("줌", "Zoom")} {watchState.canvasZoomPct}%
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CROWN_MODES.map((m) => (
              <button
                key={m.id}
                data-testid={`crown-mode-${m.id}`}
                type="button"
                onClick={() => setWatchState((prev) => ({ ...prev, crownMode: m.id }))}
                className={watchState.crownMode === m.id ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {isEn ? m.labelEn : m.labelKo}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SENSITIVITY_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setWatchState((prev) => ({ ...prev, sensitivityPreset: s.id }))}
                className={watchState.sensitivityPreset === s.id ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {pick(`감도: ${s.labelKo}`, `Sens: ${s.labelEn}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button data-testid="crown-spin-slow-up" type="button" onClick={() => handleCrownSpin(15, 30)} className={BTN_OUTLINE}>
              {pick("정밀 +1틱 (저속)", "Fine +1 Tick")}
            </button>
            <button data-testid="crown-spin-fast-up" type="button" onClick={() => handleCrownSpin(45, 360)} className={BTN_PRIMARY}>
              {pick("고속 스핀 +가속", "Fast Spin +Boost")}
            </button>
          </div>

          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-bold text-fg">{pick("4버튼 상태 · 촉각 패턴 예제", "4-Button State & Haptic Examples")}</span>
              <span data-testid="watch-pad-state" className="text-fg-2 tabular-nums">
                Undo {watchState.undoStackDepth} · Redo {watchState.redoStackDepth} ·{" "}
                {watchState.canvasFlippedHorizontal ? pick("좌우반전 ON", "Flipped ON") : pick("정방향", "Normal")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TACTILE_PAD_BUTTONS.map((btn) => {
                const activeToggle =
                  (btn.id === "eyedropper" && watchState.eyedropperActive) ||
                  (btn.id === "flip-horizontal" && watchState.canvasFlippedHorizontal);
                return (
                  <button
                    key={btn.id}
                    data-testid={`watch-pad-${btn.id}`}
                    type="button"
                    onClick={() => setWatchState((prev) => triggerTactilePadButton(prev, btn.id).state)}
                    className={activeToggle ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {getPadIcon(btn.id)}
                    <span>{isEn ? btn.labelEn : btn.labelKo}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("합성 획 통계 · 휴식 지표 예제", "Synthetic Stroke & Break Metrics")}</span>
            </h3>
            <span
              data-testid="wrist-fatigue-badge"
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                watchState.fatigueReport.fatigueScore >= 58
                  ? "border-bad/40 bg-bad-soft text-bad"
                  : "border-good/40 bg-good-soft text-good"
              }`}
            >
              {watchState.fatigueReport.fatigueScore}pt · {watchState.fatigueReport.riskLevel}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {isEn ? watchState.fatigueReport.summaryEn : watchState.fatigueReport.summaryKo}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="fatigue-burst-btn"
              type="button"
              onClick={() =>
                setWatchState((prev) =>
                  recordDrawingBurst(prev, {
                    addedMinutes: 35,
                    addedStrokeMeters: 52,
                    burstSpeedPxPerSec: 1380,
                    burstHighPressureRatio: 0.82,
                  }),
                )
              }
              className={BTN_OUTLINE}
            >
              {pick("고강도 마감 버스트 (+35분)", "Simulate Heavy Sprint")}
            </button>
            <button
              data-testid="fatigue-rest-btn"
              type="button"
              onClick={() => setWatchState((prev) => acknowledgeBreakCompleted(prev, 5))}
              className={BTN_PRIMARY}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("5분 휴식 가정 계산", "Simulate 5m Break")}</span>
            </button>
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-fg">
                <Mic className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("전사 텍스트 → 예제 메모 큐", "Transcript → Example Memo Queue")}</span>
              </span>
              <span data-testid="voice-queue-count" className="font-semibold text-fg-2 tabular-nums">
                {pick(`대기 ${watchState.balloonMemoQueue.length}건`, `${watchState.balloonMemoQueue.length} queued`)}
              </span>
            </div>
            <div className="flex gap-2">
              <label htmlFor={`${uid}-voice-input`} className="sr-only">
                {pick("예제 대사 텍스트 (길이 2.4초 가정)", "Example Dialogue (Assumed 2.4s)")}
              </label>
              <input
                id={`${uid}-voice-input`}
                data-testid="voice-memo-input"
                type="text"
                value={voiceDraft}
                onChange={(e) => setVoiceDraft(e.target.value)}
                className={`min-h-11 flex-1 rounded-lg border border-line bg-canvas px-3 text-xs text-fg ${FOCUS_RING}`}
              />
              <button
                data-testid="voice-memo-enqueue-btn"
                type="button"
                onClick={() => handleAddVoiceMemo(voiceDraft, 2.4, "강서준")}
                className={BTN_PRIMARY}
              >
                {pick("예제 큐에 추가", "Queue Example")}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_VOICE_MEMO_PRESETS.slice(1, 3).map((preset) => (
                <button
                  key={preset.capturedAtLabel}
                  type="button"
                  onClick={() => handleAddVoiceMemo(preset.transcript, preset.durationSec, preset.speakerName)}
                  className={BTN_OUTLINE}
                >
                  {preset.speakerName}: {preset.transcript.slice(0, 12)}…
                </button>
              ))}
              <button
                data-testid="voice-memo-consume-btn"
                type="button"
                onClick={() => setQueueMessage(pick("실제 원고에 연결되지 않아 메모를 배치하거나 큐에서 지우지 않았어요. 입력 메모는 패널을 닫기 전까지 유지해요.", "No manuscript is connected, so no memo was placed or removed. Memos stay until this panel closes."))}
                className={BTN_OUTLINE}
              >
                {pick("예제 큐 · 연결 상태 확인", "Check Example Queue & Connection")}
              </button>
            </div>
            {queueMessage ? <p role="status" data-testid="watch-queue-status" className="text-xs text-fg-2">{queueMessage}</p> : null}
            <ul className="space-y-1 text-xs">
              {watchState.balloonMemoQueue.map((memo) => (
                <li
                  key={memo.memoId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5"
                >
                  <span className="truncate text-fg">
                    [{memo.inferredStyle}] {memo.cleanedDialogue}
                  </span>
                  <span className="shrink-0 text-[11px] text-fg-3 tabular-nums">{memo.durationSec}s</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
