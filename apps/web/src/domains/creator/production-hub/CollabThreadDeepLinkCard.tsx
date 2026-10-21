/**
 * 핀 멘션 딥링크 종점 — 통합 작업함의 멘션 항목이 여는 `?thread=<id>`의 소비처.
 *
 * 지금까지 멘션 딥링크는 회차 목록 표면에서 소비되지 않아, 알림을 눌러도
 * 해당 핀에 닿지 못했다 (C3 잔여 격차). 이 카드는 표면 맨 위에서 스레드를
 * 직접 불러와 보여 주고, 여는 순간 서버 읽음 처리를 남기며, 그 자리에서
 * 해결/다시 열기까지 끝낼 수 있게 한다 — 받은함 → 읽음 → 해당 맥락 처리가
 * 한 동선으로 닫힌다. 스레드가 해결되면 통합 작업함의 멘션 항목도 닫힌다
 * (모델의 pin-resolved 닫힘 규칙).
 */
import { CheckCheck, MessageSquareWarning, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  getStudioTeamCommentThread,
  markStudioTeamCommentRead,
  reopenStudioTeamCommentThread,
  resolveStudioTeamCommentThread,
  type StudioTeamCommentThread,
} from "../studio-team-comment-client";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ANCHOR_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  page: { ko: "페이지 핀", en: "Page pin" },
  frame: { ko: "프레임 핀", en: "Frame pin" },
  element: { ko: "요소 핀", en: "Element pin" },
  point: { ko: "좌표 핀", en: "Point pin" },
  "pdf-page": { ko: "PDF 페이지 핀", en: "PDF page pin" },
  "compare-image": { ko: "비교 이미지 핀", en: "Compare image pin" },
};

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly thread: StudioTeamCommentThread }
  | { readonly kind: "error"; readonly message: string };

export function CollabThreadDeepLinkCard({ workId }: { readonly workId: string }) {
  const bt = useBilingual("CollabThreadDeepLinkCard");
  const [params, setParams] = useSearchParams();
  const threadId = params.get("thread");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!threadId) return;
    const own = ++generation.current;
    setState({ kind: "loading" });
    try {
      const thread = await getStudioTeamCommentThread(workId, threadId, { messageLimit: 51 });
      if (generation.current !== own) return;
      setState({ kind: "ready", thread });
      // 받은함 → 읽음: 여는 순간 서버 읽음으로 남긴다. 실패해도 읽기는 막지 않는다.
      void markStudioTeamCommentRead(workId, threadId).catch(() => undefined);
    } catch {
      if (generation.current !== own) return;
      setState({
        kind: "error",
        message: bt("멘션된 핀 스레드를 불러오지 못했습니다. 삭제됐거나 권한이 없을 수 있습니다.", "Could not load the mentioned pin thread. It may be deleted or out of reach."),
      });
    }
  }, [bt, threadId, workId]);

  useEffect(() => {
    if (threadId) void load();
  }, [load, threadId]);

  if (!threadId) return null;

  const close = () => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("thread");
      return next;
    });
  };

  const transition = async (action: "resolve" | "reopen") => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (action === "resolve") await resolveStudioTeamCommentThread(workId, threadId);
      else await reopenStudioTeamCommentThread(workId, threadId);
      setNotice(action === "resolve"
        ? bt("스레드를 해결로 표시했습니다. 통합 작업함의 멘션도 닫힙니다.", "Marked resolved. The inbox mention closes too.")
        : bt("스레드를 다시 열었습니다.", "Thread reopened."));
      await load();
    } catch {
      setNotice(bt("상태를 바꾸지 못했습니다. 권한이나 네트워크를 확인해 주세요.", "Could not change the thread state. Check permissions or the network."));
    } finally {
      setBusy(false);
    }
  };

  const thread = state.kind === "ready" ? state.thread : null;
  const anchorLabel = thread ? (ANCHOR_LABELS[thread.anchor.type] ?? { ko: "핀", en: "Pin" }) : null;
  const anchorPage = thread && "pageId" in thread.anchor ? thread.anchor.pageId : null;

  return (
    <section
      aria-label={bt("멘션된 핀 스레드", "Mentioned pin thread")}
      className="rounded-2xl border border-accent/45 bg-accent/5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareWarning className="size-5 text-accent" aria-hidden="true" />
          <h3 className="text-base font-black text-fg">{bt("알림에서 연 핀 스레드", "Pin thread opened from your inbox")}</h3>
          {thread ? (
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${thread.status === "resolved" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>
              {thread.status === "resolved" ? bt("해결됨", "Resolved") : bt("열림", "Open")}
            </span>
          ) : null}
          {anchorLabel ? (
            <span className="rounded-full bg-raised px-2 py-0.5 text-[0.65rem] font-bold text-fg-2">
              {bt(anchorLabel.ko, anchorLabel.en)}{anchorPage ? ` · ${anchorPage}` : ""}
            </span>
          ) : null}
        </div>
        <button type="button" onClick={close} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 gap-1" })}>
          <X className="size-4" aria-hidden="true" /> {bt("닫기", "Close")}
        </button>
      </div>

      {state.kind === "loading" ? (
        <p role="status" className="mt-3 text-sm text-fg-2">{bt("스레드를 불러오는 중…", "Loading thread…")}</p>
      ) : state.kind === "error" ? (
        <div role="alert" className="mt-3">
          <p className="text-sm text-fg">{state.message}</p>
          <button type="button" onClick={() => void load()} className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Retry")}
          </button>
        </div>
      ) : thread ? (
        <>
          <ul className="mt-3 space-y-2">
            {thread.messages.map((message) => (
              <li key={message.id} className="rounded-xl border border-line bg-card p-3">
                <p className="flex flex-wrap items-baseline gap-2 text-xs">
                  <span className="font-bold text-fg">{message.author.name}</span>
                  <time className="text-fg-3" dateTime={message.createdAt}>
                    {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}
                  </time>
                  {message.mentions.length > 0 ? (
                    <span className="text-accent">{message.mentions.map((mention) => `@${mention.name}`).join(" ")}</span>
                  ) : null}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-fg">{message.body}</p>
              </li>
            ))}
          </ul>
          {thread.messagesTruncated ? (
            <p className="mt-2 text-xs text-fg-3">{bt("최근 메시지만 표시합니다. 전체 대화는 스튜디오 댓글 패널에서 볼 수 있습니다.", "Showing recent messages only. Open the studio comments panel for the full thread.")}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {thread.status === "open" ? (
              <button type="button" disabled={busy} onClick={() => void transition("resolve")} className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11 gap-1.5" })}>
                <CheckCheck className="size-4" aria-hidden="true" /> {bt("해결로 표시", "Mark resolved")}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void transition("reopen")} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
                <RotateCcw className="size-4" aria-hidden="true" /> {bt("다시 열기", "Reopen")}
              </button>
            )}
            <span className="text-xs text-fg-3">{bt("여는 순간 읽음으로 기록됩니다.", "Opening this thread marks it read.")}</span>
          </div>
        </>
      ) : null}
      {notice ? <p role="status" className="mt-3 text-xs text-fg-2">{notice}</p> : null}
    </section>
  );
}
