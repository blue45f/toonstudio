import { Play, Square } from "lucide-react";

import {
  SPEECH_REGISTER_OPTIONS,
  type KoreanSpeechRegister,
  type TargetChannelId,
} from "./fresh-ideas-contracts";
import {
  SUPPORTED_CHANNEL_OPTIONS,
  type ExpandedChannelDraftV2,
} from "./fresh-ideas-channels-localization";

const MOTION_BTN =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export function FreshIdeasModeBChannelPanel({
  disabled = false,
  selectedChannelId,
  selectedRegister,
  bridgeForeignToKorea,
  isStreaming,
  streamedText,
  streamProgressPct,
  modeBDraft,
  onSelectChannelId,
  onChangeRegister,
  onToggleKoreaBridge,
  onRunStream,
  onStopStream,
}: {
  readonly disabled?: boolean;
  readonly selectedChannelId: TargetChannelId;
  readonly selectedRegister: KoreanSpeechRegister;
  readonly bridgeForeignToKorea: boolean;
  readonly isStreaming: boolean;
  readonly streamedText: string;
  readonly streamProgressPct: number;
  readonly modeBDraft: ExpandedChannelDraftV2;
  readonly onSelectChannelId: (channelId: TargetChannelId) => void;
  readonly onChangeRegister: (register: KoreanSpeechRegister) => void;
  readonly onToggleKoreaBridge: () => void;
  readonly onRunStream: () => void;
  readonly onStopStream: () => void;
}) {
  return (
    <div
      data-testid="fresh-ideas-mode-b-panel"
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {SUPPORTED_CHANNEL_OPTIONS.map((ch) => (
            <button
              key={ch.id}
              type="button"
              disabled={disabled}
              data-testid={`fresh-ideas-channel-${ch.id}`}
              onClick={() => onSelectChannelId(ch.id)}
              className={`min-h-10 rounded-lg border px-2.5 py-1 text-xs ${
                selectedChannelId === ch.id
                  ? "border-accent bg-raised font-medium text-fg"
                  : "border-line bg-card text-fg-3 hover:bg-raised"
              } ${MOTION_BTN}`}
            >
              {ch.labelKo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="한국어 종결어미 잠금"
            disabled={disabled}
            data-testid="fresh-ideas-register-select"
            value={selectedRegister}
            onChange={(e) => onChangeRegister(e.target.value as KoreanSpeechRegister)}
            className="min-h-10 rounded-lg border border-line bg-card px-2 text-xs text-fg"
          >
            {SPEECH_REGISTER_OPTIONS.map((reg) => (
              <option key={reg.id} value={reg.id}>
                {reg.labelKo}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={disabled}
            data-testid="fresh-ideas-korea-bridge-btn"
            onClick={onToggleKoreaBridge}
            className={`min-h-10 rounded-lg border px-2.5 py-1 text-xs ${
              bridgeForeignToKorea
                ? "border-accent bg-raised font-medium text-fg"
                : "border-line bg-card text-fg-3"
            } ${MOTION_BTN}`}
          >
            국내 시장 브리지
          </button>

          <button
            type="button"
            disabled={disabled || isStreaming}
            data-testid="fresh-ideas-stream-btn"
            onClick={onRunStream}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-accent bg-raised px-3 py-1 text-xs font-medium text-fg ${MOTION_BTN}`}
          >
            <Play size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>실시간 스트리밍 생성</span>
          </button>
          {isStreaming && (
            <button
              type="button"
              onClick={onStopStream}
              className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg-2 ${MOTION_BTN}`}
            >
              <Square size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
              <span>중지</span>
            </button>
          )}
        </div>
      </div>

      {streamedText && (
        <div
          data-testid="fresh-ideas-stream-output"
          className="rounded border border-accent/60 bg-card p-2.5"
        >
          <span className="block font-mono text-[11px] tabular-nums text-fg-3">
            스트리밍 출력 ({streamProgressPct}%) · Unslop 실시간 정제 적용
          </span>
          <p className="mt-1 whitespace-pre-line leading-5 text-fg-2">{streamedText}</p>
        </div>
      )}

      <div className="rounded border border-line bg-card p-2.5">
        <span className="block font-mono text-[11px] text-fg-3">제목 3종 변주 (직설 · 질문 · 장면)</span>
        <p className="mt-1 font-medium text-fg">{modeBDraft.headlineVariants.directThesisKo}</p>
        <p className="text-fg-2">{modeBDraft.headlineVariants.tensionQuestionKo}</p>
        <p className="text-fg-3">{modeBDraft.headlineVariants.metricOrSceneKo}</p>
      </div>
      <div className="space-y-1.5 leading-5 text-fg-2">
        {modeBDraft.bodySectionsKo.map((sec, idx) => (
          <p key={idx} className="whitespace-pre-line">
            {sec}
          </p>
        ))}
        <p className="rounded border border-line bg-card px-2.5 py-2 text-fg-2">
          예상 반박 선제 대응: {modeBDraft.preemptiveObjectionKo}
        </p>
        <p className="rounded border border-line bg-card px-2.5 py-2 font-medium text-fg">
          마무리 제안 (CTA): {modeBDraft.closingCtaKo}
        </p>
        {modeBDraft.socialThreeLineCutKo && (
          <div
            data-testid="fresh-ideas-dual-three-line-cut"
            className="rounded border border-line bg-card p-2.5 font-mono text-[11px] text-fg-2"
          >
            <span className="block text-fg-3">SNS 3줄 요약 컷:</span>
            {modeBDraft.socialThreeLineCutKo.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
