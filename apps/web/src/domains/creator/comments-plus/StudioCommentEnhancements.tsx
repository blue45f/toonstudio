/**
 * Studio Comment Enhancements — 댓글 고도화 프레젠테이션 컴포넌트.
 *
 * 순수 코어(`studio-comment-enhance`)를 화면에 연결하는 브리지다.
 * 기존 댓글 패널은 건드리지 않는다.
 *
 * - TypingIndicator: "누가 입력 중" 애니메이션 표시.
 * - ReactionBar: 이모지 리액션 집계 + 낙관적 토글.
 * - MentionText: @멘션 하이라이트 렌더링.
 * - ThreadStatusChip: 해결/미해결 상태 칩.
 *
 * ko/en, 다크/라이트, 390px 모바일, reduced-motion, 키보드 접근성 대응.
 */
import { useState, type ReactElement, type ReactNode } from "react";
import { Check, CheckCheck, CircleDashed, Eye, EyeOff, History, RotateCcw } from "lucide-react";

import {
  getCurrentUiLocale,
  translateAuthoredSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  aggregateReactions,
  parseMentions,
  type Reaction,
  type ReactionSummary,
} from "./studio-comment-enhance";
import {
  cutNormalizedAnchorToCanvasPoint,
  getVisibleRedpenStrokes,
  projectRedpenStrokeToCanvasPath,
  type CommentResolutionAction,
  type CommentResolutionAuditEntry,
  type CutBoundingBox,
  type RedpenOverlayThreadState,
} from "./studio-redpen-comment-overlay";

function useTx(): (source: string) => string {
  useBilingualI18nRevision();
  const locale = getCurrentUiLocale();
  return (source: string) =>
    translateAuthoredSourceText(locale, "ko", "StudioCommentEnhancements", source);
}

// ── 타이핑 인디케이터 ──────────────────────────────────────────────────

export interface TypingUser {
  userId: string;
  userName: string;
}

export function TypingIndicator({
  users,
}: {
  /** 현재 타이핑 중인 사용자 (최대 3명까지 표시). */
  users: TypingUser[];
}): ReactElement | null {
  const tx = useTx();
  const visible = users.slice(0, 3);
  if (visible.length === 0) return null;

  const label =
    visible.length === 1
      ? tx("{name}님이 입력 중…").replace("{name}", visible[0].userName)
      : tx("{names} 외 {n}명이 입력 중…")
          .replace("{names}", visible.map((u) => u.userName).join(", "))
          .replace("{n}", String(visible.length - 1));

  return (
    <div
      className="flex items-center gap-2 text-xs text-fg-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <style>{`
        @keyframes sc-enh-typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }
        .sc-enh-typing-dot { animation: sc-enh-typing-bounce 1.2s ease-in-out infinite; }
        .sc-enh-typing-dot:nth-child(2) { animation-delay: .15s; }
        .sc-enh-typing-dot:nth-child(3) { animation-delay: .3s; }
        @media (prefers-reduced-motion: reduce) { .sc-enh-typing-dot { animation: none; opacity: .7; } }
      `}</style>
      <span className="flex items-end gap-1" aria-hidden="true">
        <span className="sc-enh-typing-dot inline-block size-1.5 rounded-full bg-accent" />
        <span className="sc-enh-typing-dot inline-block size-1.5 rounded-full bg-accent" />
        <span className="sc-enh-typing-dot inline-block size-1.5 rounded-full bg-accent" />
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

// ── 리액션 바 ──────────────────────────────────────────────────────────

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "👏"] as const;

export function ReactionBar({
  reactions,
  myUserId,
  onToggle,
  onQuickAdd,
}: {
  reactions: Reaction[];
  myUserId: string;
  /** 이모지 토글 (낙관적 업데이트는 호출자가 처리). */
  onToggle: (emoji: string) => void;
  /** 빠른 추가 팝오버 등을 여는 용도. 없으면 빠른 추가 버튼을 숨긴다. */
  onQuickAdd?: () => void;
}): ReactElement {
  const tx = useTx();
  const summary: ReactionSummary[] = aggregateReactions(reactions, myUserId);

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tx("리액션")}>
      {summary.map(({ emoji, count, reactedByMe }) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          aria-pressed={reactedByMe}
          aria-label={`${emoji} ${count}개${reactedByMe ? `, ${tx("내 리액션")}` : ""}`}
          className={
            reactedByMe
              ? "inline-flex min-h-8 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-contrast shadow-md transition-transform hover:scale-105 active:scale-95"
              : "inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 transition-all hover:scale-105 hover:border-accent active:scale-95"
          }
        >
          <span aria-hidden="true">{emoji}</span>
          <span className="tabular-nums">{count}</span>
        </button>
      ))}
      {onQuickAdd && (
        <button
          type="button"
          onClick={onQuickAdd}
          aria-label={tx("리액션 추가")}
          title={tx("리액션 추가")}
          className="inline-flex min-h-8 size-8 items-center justify-center rounded-full border border-dashed border-line text-fg-3 transition-colors hover:border-accent hover:text-accent"
        >
          <span aria-hidden="true" className="text-sm leading-none">+</span>
        </button>
      )}
      {summary.length === 0 && !onQuickAdd && (
        <span className="text-xs text-fg-4">{tx("아직 리액션이 없어요")}</span>
      )}
    </div>
  );
}

/** 빠른 리액션 선택기 (이모지 5종). */
export function QuickReactionPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}): ReactElement {
  const tx = useTx();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={tx("빠른 리액션")}>
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-label={`${emoji} ${tx("리액션")}`}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-xl transition-transform hover:scale-125 active:scale-95"
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}

// ── 멘션 텍스트 ────────────────────────────────────────────────────────

export function MentionText({
  text,
  onMentionClick,
}: {
  text: string;
  /** 멘션 클릭 시 (프로필 이동 등). 없으면 클릭 불가. */
  onMentionClick?: (name: string) => void;
}): ReactElement {
  const mentions = parseMentions(text);
  if (mentions.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  mentions.forEach((m, i) => {
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    const label = text.slice(m.start, m.end);
    parts.push(
      onMentionClick ? (
        <button
          key={i}
          type="button"
          onClick={() => onMentionClick(m.name)}
          className="rounded bg-accent-soft px-0.5 font-semibold text-accent underline decoration-accent/50 underline-offset-2"
        >
          {label}
        </button>
      ) : (
        <span
          key={i}
          className="rounded bg-accent-soft px-0.5 font-semibold text-accent"
        >
          {label}
        </span>
      )
    );
    cursor = m.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// ── 스레드 상태 칩 ────────────────────────────────────────────────────

export function ThreadStatusChip({
  resolved,
  onToggle,
}: {
  resolved: boolean;
  /** 클릭 시 해결/다시 열기. 없으면 표시 전용. */
  onToggle?: () => void;
}): ReactElement {
  const tx = useTx();
  const label = resolved ? tx("해결됨") : tx("미해결");
  const inner = (
    <>
      {resolved ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <span className="relative flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-warn" />
        </span>
      )}
      {label}
    </>
  );
  const className = resolved
    ? "inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-xs font-semibold text-good"
    : "inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warn";

  if (!onToggle) {
    return (
      <span className={className} role="status">
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={resolved}
      aria-label={resolved ? tx("다시 열기") : tx("해결하기")}
      title={resolved ? tx("다시 열기") : tx("해결하기")}
      className={`${className} min-h-8 transition-transform hover:scale-105 active:scale-95`}
    >
      {inner}
      {!resolved && <CircleDashed className="size-3.5 opacity-60" aria-hidden="true" />}
    </button>
  );
}

// ── 비파괴 빨간펜 코멘트 오버레이 (#066–#070) ──────────────────────────

/**
 * 캔버스 드로잉 레이어와 완전히 분리된 비파괴 빨간펜 SVG 오버레이.
 * 컷 바운딩 박스 기준 정규화 좌표 `(u, v)`로 핀과 스트로크를 투영하므로
 * 컷 높이가 변하거나 크롭되어도 핀이 허공에 뜨지 않는다.
 */
export function RedpenCommentOverlaySvg({
  overlay,
  cutBox,
  showPinMarker = true,
  className,
}: {
  overlay: RedpenOverlayThreadState;
  cutBox: CutBoundingBox;
  /** 정규화 앵커 핀 마커 표시 여부 (기본 true). */
  showPinMarker?: boolean;
  className?: string;
}): ReactElement | null {
  const tx = useTx();
  const visibleStrokes = getVisibleRedpenStrokes(overlay);
  if (!overlay.visible && !showPinMarker) return null;

  const resolution = cutNormalizedAnchorToCanvasPoint(overlay.anchor, cutBox);
  const projected = visibleStrokes.map((stroke) =>
    projectRedpenStrokeToCanvasPath(stroke, cutBox),
  );
  const safeWidth = Number.isFinite(cutBox.width) && cutBox.width > 0 ? cutBox.width : 1;
  const safeHeight = Number.isFinite(cutBox.height) && cutBox.height > 0 ? cutBox.height : 1;
  const viewBox = `${cutBox.x} ${cutBox.y} ${safeWidth} ${safeHeight}`;

  return (
    <svg
      role="img"
      aria-label={tx("비파괴 빨간펜 코멘트 오버레이 ({count}획)").replace(
        "{count}",
        String(projected.length),
      )}
      viewBox={viewBox}
      data-non-destructive-overlay="true"
      data-canvas-layer-id="none"
      data-thread-id={overlay.threadId}
      data-cut-id={cutBox.cutId}
      className={`pointer-events-none select-none overflow-visible ${className ?? ""}`.trim()}
    >
      {overlay.visible &&
        projected.map((item) => (
          <path
            key={item.strokeId}
            d={item.d}
            fill="none"
            stroke={item.color}
            strokeOpacity={item.opacity}
            strokeWidth={item.widthPx}
            strokeLinecap="round"
            strokeLinejoin="round"
            data-redpen-stroke-id={item.strokeId}
          />
        ))}
      {showPinMarker && (
        <g
          data-redpen-pin-anchor="true"
          data-pin-u={String(resolution.anchor.u)}
          data-pin-v={String(resolution.anchor.v)}
          data-pin-clamped={String(resolution.wasClamped)}
          transform={`translate(${resolution.canvasPoint.x}, ${resolution.canvasPoint.y})`}
        >
          <circle
            r={8}
            fill={overlay.resolved ? "var(--color-good)" : "var(--color-bad)"}
            fillOpacity={0.9}
            stroke="var(--color-canvas)"
            strokeWidth={2}
          />
          {resolution.wasClamped && (
            <circle
              r={12}
              fill="none"
              stroke="var(--color-warn)"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
          )}
        </g>
      )}
    </svg>
  );
}

// ── 해결 · 재열기 감사 로그 (#069) ──────────────────────────────────────

function auditActionLabel(
  action: CommentResolutionAction,
  tx: (source: string) => string,
): string {
  switch (action) {
    case "accept-and-resolve":
      return tx("빨간펜 수락 · 체크완료");
    case "resolve":
      return tx("해결 완료");
    case "reopen":
      return tx("다시 열기");
  }
}

function formatAuditTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16);
}

export function CommentResolutionAuditLog({
  entries,
}: {
  entries: readonly CommentResolutionAuditEntry[];
}): ReactElement {
  const tx = useTx();
  if (entries.length === 0) {
    return (
      <p className="text-xs text-fg-4" role="status">
        {tx("아직 해결 이력이 없습니다")}
      </p>
    );
  }
  return (
    <ol
      role="log"
      aria-label={tx("해결 및 재열기 감사 이력")}
      className="space-y-1.5 border-l-2 border-line pl-3 text-xs text-fg-2"
    >
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-audit-action={entry.action}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
        >
          <span
            className={
              entry.nextResolved
                ? "rounded bg-good-soft px-1.5 py-0.5 font-semibold text-good"
                : "rounded bg-warning-soft px-1.5 py-0.5 font-semibold text-warn"
            }
          >
            {auditActionLabel(entry.action, tx)}
          </span>
          <span className="font-medium text-fg-1">{entry.actorName}</span>
          <span className="tabular-nums text-fg-4">{formatAuditTimestamp(entry.timestamp)}</span>
          {entry.note && <span className="text-fg-3">· {entry.note}</span>}
        </li>
      ))}
    </ol>
  );
}

// ── 빨간펜 토글 + 1클릭 수락 체크완료 컨트롤 바 (#066–#069) ─────────────

export function RedpenOverlayControlBar({
  overlay,
  onToggleVisibility,
  onAcceptAndResolve,
  onReopen,
  defaultAuditOpen = false,
}: {
  overlay: RedpenOverlayThreadState;
  onToggleVisibility: () => void;
  /** 수락 시 1클릭 체크완료 콜백. */
  onAcceptAndResolve?: () => void;
  /** 해결된 코멘트를 다시 열 때 호출. */
  onReopen?: () => void;
  defaultAuditOpen?: boolean;
}): ReactElement {
  const tx = useTx();
  const [auditOpen, setAuditOpen] = useState(defaultAuditOpen);
  const strokeCount = overlay.strokes.length;

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={tx("빨간펜 오버레이 제어")}
      >
        <button
          type="button"
          onClick={onToggleVisibility}
          aria-pressed={overlay.visible}
          aria-label={overlay.visible ? tx("빨간펜 숨기기") : tx("빨간펜 보기")}
          className={
            overlay.visible
              ? "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-bad/40 bg-bad-soft px-2.5 py-1 text-xs font-semibold text-bad transition-colors hover:bg-bad-soft/80"
              : "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors hover:border-bad"
          }
        >
          {overlay.visible ? (
            <Eye className="size-3.5" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5" aria-hidden="true" />
          )}
          <span>{overlay.visible ? tx("빨간펜 숨기기") : tx("빨간펜 보기")}</span>
          <span className="tabular-nums opacity-75">({strokeCount})</span>
        </button>

        {!overlay.resolved && onAcceptAndResolve && (
          <button
            type="button"
            onClick={onAcceptAndResolve}
            aria-label={tx("빨간펜 수락 후 1클릭 체크완료")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-good/40 bg-good-soft px-2.5 py-1 text-xs font-semibold text-good transition-colors hover:bg-good-soft/80"
          >
            <CheckCheck className="size-3.5" aria-hidden="true" />
            <span>{tx("수락 · 체크완료")}</span>
          </button>
        )}

        {overlay.resolved && onReopen && (
          <button
            type="button"
            onClick={onReopen}
            aria-label={tx("코멘트 다시 열기")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-warn/40 bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warn transition-colors hover:bg-warning-soft/80"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span>{tx("다시 열기")}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setAuditOpen((open) => !open)}
          aria-expanded={auditOpen}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors hover:border-fg-3"
        >
          <History className="size-3.5" aria-hidden="true" />
          <span>
            {tx("이력 {n}건").replace("{n}", String(overlay.auditLog.length))}
          </span>
        </button>
      </div>

      {auditOpen && <CommentResolutionAuditLog entries={overlay.auditLog} />}
    </div>
  );
}
