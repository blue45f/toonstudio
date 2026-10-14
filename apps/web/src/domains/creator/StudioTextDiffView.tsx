import { useMemo } from "react";

import {
  computeStudioTextDiff,
  type StudioTextDiffLine,
  type StudioTextDiffSegment,
} from "./studio-text-diff";

export interface StudioTextDiffViewProps {
  beforeText: string;
  afterText: string;
  /** Heading shown above the diff, e.g. the balloon or script block label. */
  title?: string;
  beforeLabel?: string;
  afterLabel?: string;
}

function SegmentedLine({ segments, side }: { segments: readonly StudioTextDiffSegment[]; side: "before" | "after" }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "added" ? (
          <ins key={index} className="bg-good/30 text-fg no-underline">
            {segment.value}
          </ins>
        ) : segment.kind === "removed" ? (
          <del key={index} className="bg-bad/25 text-fg line-through decoration-bad/70">
            {segment.value}
          </del>
        ) : (
          <span key={index}>{segment.value}</span>
        )
      )}
      {segments.length === 0 ? <span aria-label={side === "before" ? "빈 줄" : "빈 줄"}> </span> : null}
    </>
  );
}

function DiffLineRow({ line }: { line: StudioTextDiffLine }) {
  if (line.kind === "modified" && line.beforeSegments && line.afterSegments) {
    return (
      <li className="px-3 py-1.5">
        <div className="flex gap-2">
          <span className="w-8 shrink-0 select-none text-right text-[0.65rem] leading-5 tabular-nums text-fg-3">
            {line.beforeLineNumber ?? ""}
          </span>
          <span className="w-3 shrink-0 select-none text-center text-[0.65rem] font-bold leading-5 text-bad" aria-hidden>
            −
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5 text-fg-2">
            <SegmentedLine segments={line.beforeSegments} side="before" />
          </p>
        </div>
        <div className="flex gap-2">
          <span className="w-8 shrink-0 select-none text-right text-[0.65rem] leading-5 tabular-nums text-fg-3">
            {line.afterLineNumber ?? ""}
          </span>
          <span className="w-3 shrink-0 select-none text-center text-[0.65rem] font-bold leading-5 text-good" aria-hidden>
            +
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5 text-fg">
            <SegmentedLine segments={line.afterSegments} side="after" />
          </p>
        </div>
      </li>
    );
  }

  const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : "";
  const markerClass =
    line.kind === "added" ? "text-good" : line.kind === "removed" ? "text-bad" : "text-fg-3";
  const rowClass =
    line.kind === "added"
      ? "bg-good/10"
      : line.kind === "removed"
        ? "bg-bad/10"
        : "";
  const textClass = line.kind === "unchanged" ? "text-fg-3" : "text-fg";
  const lineNumber = line.kind === "removed" ? line.beforeLineNumber : line.afterLineNumber;
  const content =
    line.kind === "added" ? (
      <ins className="no-underline">{line.text}</ins>
    ) : line.kind === "removed" ? (
      <del className="decoration-bad/60">{line.text}</del>
    ) : (
      line.text
    );

  return (
    <li className={`flex gap-2 px-3 py-1 ${rowClass}`}>
      <span className="w-8 shrink-0 select-none text-right text-[0.65rem] leading-5 tabular-nums text-fg-3">
        {lineNumber ?? ""}
      </span>
      <span className={`w-3 shrink-0 select-none text-center text-[0.65rem] font-bold leading-5 ${markerClass}`} aria-hidden>
        {marker}
      </span>
      <p className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5 ${textClass}`}>
        {content}
        {line.text === "" ? <span> </span> : null}
      </p>
    </li>
  );
}

/**
 * Read-only line/character diff surface for dialogue and script text between two versions.
 * Added lines and characters are highlighted in the "good" tone, removed ones in the "bad" tone,
 * and edited lines show both sides with the exact changed characters marked.
 */
export function StudioTextDiffView({
  beforeText,
  afterText,
  title = "대사·텍스트 비교",
  beforeLabel = "이전 버전",
  afterLabel = "현재 버전",
}: StudioTextDiffViewProps) {
  const diff = useMemo(() => computeStudioTextDiff(beforeText, afterText), [beforeText, afterText]);
  const { summary } = diff;

  return (
    <section aria-label={title} className="rounded-xl border border-line bg-card/30">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2.5">
        <h4 className="text-xs font-bold text-fg">{title}</h4>
        <p className="text-[0.68rem] text-fg-3">
          {beforeLabel} → {afterLabel}
        </p>
        {!diff.identical ? (
          <p className="ml-auto flex gap-2 text-[0.68rem] font-semibold" aria-label="텍스트 변경 요약">
            {summary.addedLines > 0 ? <span className="text-good">+{summary.addedLines}줄</span> : null}
            {summary.removedLines > 0 ? <span className="text-bad">−{summary.removedLines}줄</span> : null}
            {summary.modifiedLines > 0 ? (
              <span className="text-accent">{summary.modifiedLines}줄 수정</span>
            ) : null}
            {summary.addedChars + summary.removedChars > 0 ? (
              <span className="text-fg-3">
                글자 +{summary.addedChars} / −{summary.removedChars}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      {diff.identical ? (
        <p className="px-3 py-3 text-xs text-fg-3">두 버전의 대사가 같습니다.</p>
      ) : (
        <ol className="divide-y divide-line/50 py-1" aria-label={`${title} 줄별 차이`}>
          {diff.lines.map((line, index) => (
            <DiffLineRow key={`${line.beforeLineNumber ?? "x"}:${line.afterLineNumber ?? "y"}:${index}`} line={line} />
          ))}
        </ol>
      )}
      {diff.truncated ? (
        <p className="border-t border-line px-3 py-2 text-xs leading-relaxed text-fg-3">
          텍스트가 길어 앞부분만 비교했어요. 전체 대사는 각 버전 원문에서 확인할 수 있어요.
        </p>
      ) : null}
    </section>
  );
}
