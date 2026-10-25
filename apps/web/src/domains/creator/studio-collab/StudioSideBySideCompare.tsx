import { ArrowLeftRight, MessageSquare, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useState } from "react";

import {
  applyComparePan,
  applyCompareZoom,
  DEFAULT_COMPARE_VIEWPORT,
  replaceCompareSide,
  swapComparePair,
  type CompareCommentAnchor,
  type ComparePair,
  type CompareVersion,
  type CompareViewport,
} from "./studio-side-by-side-compare";

export interface SideBySideCompareProps {
  initialPair: ComparePair;
  availableVersions?: readonly CompareVersion[];
  initialAnchors?: readonly CompareCommentAnchor[];
  onAddComment?: (threadId: string, body: string) => void;
}

interface ThreadView {
  threadId: string;
  side: "left" | "right";
  x: number;
  y: number;
  messages: Array<{ author: string; body: string }>;
}

function threadsFromAnchors(anchors: readonly CompareCommentAnchor[]): ThreadView[] {
  const byId = new Map<string, ThreadView>();
  for (const anchor of anchors) {
    const existing = byId.get(anchor.threadId);
    if (existing) existing.messages.push({ author: anchor.author, body: anchor.body });
    else byId.set(anchor.threadId, { threadId: anchor.threadId, side: anchor.side, x: anchor.x, y: anchor.y,
      messages: [{ author: anchor.author, body: anchor.body }] });
  }
  return [...byId.values()];
}

function Pane({
  version, viewport, threads, selectedThread, onSelectThread,
}: {
  version: CompareVersion;
  viewport: CompareViewport;
  threads: readonly ThreadView[];
  selectedThread: string | null;
  onSelectThread: (threadId: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-line bg-card/45 p-2">
      <p className="truncate px-1 pb-2 text-xs font-bold text-fg">{version.label}</p>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-panel">
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${viewport.offsetX}%, ${viewport.offsetY}%) scale(${viewport.scale})`, transformOrigin: "center" }}
        >
          {version.imageUrl ? (
            <img src={version.imageUrl} alt={version.label} className="h-full w-full object-contain" draggable={false} />
          ) : (
            <div className="grid h-full w-full place-items-center px-4 text-center">
              <p className="text-xs leading-relaxed text-fg-3">
                {version.note ?? "미리보기 이미지가 없는 버전입니다. 버전 정보와 변경 내역으로 비교합니다."}
              </p>
            </div>
          )}
          {threads.map((thread) => (
            <button
              key={thread.threadId}
              type="button"
              onClick={() => onSelectThread(thread.threadId)}
              aria-label={`${thread.threadId} 스레드 위치로 이동`}
              className={`absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[0.65rem] font-bold ${
                selectedThread === thread.threadId ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-accent shadow"
              }`}
              style={{ left: `${thread.x * 100}%`, top: `${thread.y * 100}%` }}
            >
              {thread.messages.length}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudioSideBySideCompare({ initialPair, availableVersions = [], initialAnchors = [], onAddComment }: SideBySideCompareProps) {
  const [pair, setPair] = useState<ComparePair>(initialPair);
  const [viewport, setViewport] = useState<CompareViewport>(DEFAULT_COMPARE_VIEWPORT);
  const [threads, setThreads] = useState<ThreadView[]>(() => threadsFromAnchors(initialAnchors));
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const leftThreads = threads.filter((thread) => thread.side === "left");
  const rightThreads = threads.filter((thread) => thread.side === "right");
  const selected = threads.find((thread) => thread.threadId === selectedThread) ?? null;

  function submitReply() {
    const body = reply.trim();
    if (!selected || !body) return;
    setThreads((current) => current.map((thread) =>
      thread.threadId === selected.threadId
        ? { ...thread, messages: [...thread.messages, { author: "나", body }] }
        : thread));
    onAddComment?.(selected.threadId, body);
    setReply("");
  }

  return (
    <section aria-label="나란히 비교 검수" data-testid="studio-side-by-side-compare" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setViewport((v) => applyCompareZoom(v, 1.25))} aria-label="두 화면 함께 확대"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised">
          <ZoomIn size={14} aria-hidden /> 확대
        </button>
        <button type="button" onClick={() => setViewport((v) => applyCompareZoom(v, 0.8))} aria-label="두 화면 함께 축소"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised">
          <ZoomOut size={14} aria-hidden /> 축소
        </button>
        <button type="button" onClick={() => setViewport(DEFAULT_COMPARE_VIEWPORT)} aria-label="보기 초기화"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised">
          <RotateCcw size={14} aria-hidden /> 초기화
        </button>
        <button type="button" onClick={() => setPair((current) => swapComparePair(current))} aria-label="좌우 버전 교체"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft/25 px-3 text-xs font-semibold text-accent hover:bg-accent-soft/45">
          <ArrowLeftRight size={14} aria-hidden /> 좌우 교체
        </button>
        <span className="text-xs text-fg-3">확대·축소는 두 화면에 동시에 적용됩니다.</span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setViewport((v) => applyComparePan(v, -10, 0))} aria-label="두 화면 함께 왼쪽으로 이동"
            className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised">◀</button>
          <button type="button" onClick={() => setViewport((v) => applyComparePan(v, 10, 0))} aria-label="두 화면 함께 오른쪽으로 이동"
            className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised">▶</button>
        </span>
      </div>

      {availableVersions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {(["left", "right"] as const).map((side) => (
            <label key={side} className="text-xs font-semibold text-fg-2">
              {side === "left" ? "왼쪽 버전" : "오른쪽 버전"}
              <select
                value={side === "left" ? pair.left.id : pair.right.id}
                onChange={(event) => {
                  const version = availableVersions.find((candidate) => candidate.id === event.target.value);
                  if (version) setPair((current) => replaceCompareSide(current, side, version));
                }}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                {availableVersions.map((version) => (
                  <option key={version.id} value={version.id}>{version.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Pane version={pair.left} viewport={viewport} threads={leftThreads} selectedThread={selectedThread} onSelectThread={setSelectedThread} />
        <Pane version={pair.right} viewport={viewport} threads={rightThreads} selectedThread={selectedThread} onSelectThread={setSelectedThread} />
      </div>

      <div className="rounded-xl border border-line bg-card/30 p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <MessageSquare size={14} className="text-accent" aria-hidden /> 인라인 피드백 스레드
        </p>
        {threads.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-3">
            아직 코멘트 앵커가 없습니다. 검수자가 이미지 위 지적 부위에 앵커를 남기면 여기에 스레드가 모입니다.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {threads.map((thread) => (
              <li key={thread.threadId}>
                <button type="button" onClick={() => setSelectedThread(thread.threadId)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs leading-relaxed ${
                    selectedThread === thread.threadId ? "border-accent/40 bg-accent-soft/20 text-fg" : "border-line bg-panel text-fg-2 hover:bg-raised"
                  }`}>
                  <span className="font-bold">{thread.side === "left" ? "왼쪽" : "오른쪽"} · {thread.threadId}</span>
                  <span className="mt-0.5 block truncate">{thread.messages[thread.messages.length - 1]?.body}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected ? (
          <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); submitReply(); }}>
            <label className="min-w-0 flex-1 text-xs font-semibold text-fg-2">
              {selected.threadId}에 답글
              <input value={reply} onChange={(event) => setReply(event.target.value.slice(0, 500))} maxLength={500}
                placeholder="이 지적 부위에 대한 의견을 남겨요" className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent" />
            </label>
            <button type="submit" disabled={!reply.trim()} className="mt-auto inline-flex min-h-11 shrink-0 items-center rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:opacity-45">
              답글 달기
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
