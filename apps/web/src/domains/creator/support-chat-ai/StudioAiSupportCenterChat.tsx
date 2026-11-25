import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Headphones,
  RotateCcw,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, useLocation } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  SUPPORT_AI_QUICK_PROMPTS,
  SUPPORT_TOPIC_OPTIONS,
  buildLocalSupportGreeting,
  maskSensitiveSupportInput,
  requestSupportTicketAutofill,
  saveSupportHandoffDraft,
  sendSupportAiChatMessage,
  urgencyLabelKo,
  type CreatorSupportBriefCategory,
  type SupportAiChatMessage,
  type SupportAiTopicId,
  type SupportChatSourceMode,
  type SupportTicketAutofill,
  type SupportTicketUrgency,
} from "./support-ai-chat-client";

export interface SupportBriefTransferPayload {
  readonly category: CreatorSupportBriefCategory;
  readonly summary: string;
  readonly contact: string;
}

export interface StudioAiSupportCenterChatProps {
  readonly onApplyToBrief?: (payload: SupportBriefTransferPayload) => void;
  readonly initialPath?: string;
}

function modeBadgeLabel(mode?: SupportChatSourceMode): string {
  if (mode === "zero-bill-free-ai") return "₩0 무료 AI";
  if (mode === "deterministic-kb") return "즉시 해결 가이드";
  return "로컬 즉시 상담";
}

function maskedKindLabelKo(kind: string): string {
  const labels: Record<string, string> = {
    api_key: "비밀키",
    auth_token: "인증토큰",
    jwt_token: "인증토큰",
    resident_id: "주민번호",
    card_number: "카드번호",
    email: "이메일",
    phone: "연락처",
    password: "비밀번호",
  };
  return labels[kind] ?? "민감정보";
}

function creatorCategoryForTopic(topicId: SupportAiTopicId): CreatorSupportBriefCategory {
  return (
    SUPPORT_TOPIC_OPTIONS.find((item) => item.id === topicId)?.creatorSupportCategory
    ?? "production"
  );
}

export function StudioAiSupportCenterChat({
  onApplyToBrief,
  initialPath,
}: StudioAiSupportCenterChatProps) {
  const location = useLocation();
  const currentPath = initialPath ?? location.pathname;
  const composerId = useId();
  const oneLineInputId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const handoffAbortRef = useRef<AbortController | null>(null);
  const chatEpochRef = useRef(0);

  useEffect(() => {
    return () => {
      chatEpochRef.current += 1;
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      handoffAbortRef.current?.abort();
      handoffAbortRef.current = null;
    };
  }, []);

  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<SupportAiChatMessage[]>(() => [
    buildLocalSupportGreeting(),
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [autofillMeta, setAutofillMeta] = useState<SupportTicketAutofill | null>(null);
  const [oneLineIssue, setOneLineIssue] = useState("");
  const [handoffCategory, setHandoffCategory] = useState<SupportAiTopicId>("general");
  const [handoffUrgency, setHandoffUrgency] = useState<SupportTicketUrgency>("normal");
  const [handoffSummary, setHandoffSummary] = useState("");
  const [checklist, setChecklist] = useState<readonly string[]>([]);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [handoffContact, setHandoffContact] = useState("");
  const [handoffSavedMessage, setHandoffSavedMessage] = useState<string | null>(null);

  const scrollLogToBottom = () => {
    const el = logRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  };

  const dispatchMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const epoch = chatEpochRef.current;
    setSending(true);
    setHandoffSavedMessage(null);
    const snapshotHistory = messages;

    try {
      const reply = await sendSupportAiChatMessage({
        sessionId,
        message: trimmed,
        history: snapshotHistory,
        currentPath,
        signal: controller.signal,
      });
      if (
        chatEpochRef.current !== epoch ||
        controller.signal.aborted ||
        chatAbortRef.current !== controller
      ) {
        return;
      }
      setSessionId(reply.sessionId);
      setMessages((prev) => [...prev, reply.userMessage, reply.assistantMessage]);
      setDraft("");
      queueMicrotask(scrollLogToBottom);
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
        if (chatEpochRef.current === epoch) {
          setSending(false);
        }
      }
    }
  };

  const handleCancelSending = () => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setSending(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void dispatchMessage(draft);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void dispatchMessage(draft);
    }
  };

  const handleMarkResolved = (messageId: string) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.id === messageId ? { ...item, feedback: "resolved" } : item,
      ),
    );
  };

  const handleOpenEscalation = async (sourceMessageId?: string) => {
    if (handoffLoading) return;
    if (sourceMessageId) {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === sourceMessageId ? { ...item, feedback: "escalated" } : item,
        ),
      );
    }
    handoffAbortRef.current?.abort();
    const controller = new AbortController();
    handoffAbortRef.current = controller;
    const epoch = chatEpochRef.current;
    setHandoffOpen(true);
    setHandoffLoading(true);
    setHandoffSavedMessage(null);
    try {
      const filled = await requestSupportTicketAutofill({
        sessionId,
        oneLineIssue: oneLineIssue.trim() || undefined,
        messages,
        currentPath,
        signal: controller.signal,
      });
      if (
        chatEpochRef.current !== epoch ||
        controller.signal.aborted ||
        handoffAbortRef.current !== controller
      ) {
        return;
      }
      setAutofillMeta(filled);
      setOneLineIssue(filled.oneLineIssue);
      setHandoffCategory(filled.category);
      setHandoffUrgency(filled.urgency);
      setHandoffSummary(filled.summary);
      setChecklist(filled.diagnosticChecklist);
      setCheckedItems([]);
    } finally {
      if (handoffAbortRef.current === controller) {
        handoffAbortRef.current = null;
        if (chatEpochRef.current === epoch) {
          setHandoffLoading(false);
        }
      }
    }
  };

  const handleCloseEscalation = () => {
    handoffAbortRef.current?.abort();
    handoffAbortRef.current = null;
    setHandoffLoading(false);
    setHandoffOpen(false);
  };

  const handleResetChat = () => {
    chatEpochRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    handoffAbortRef.current?.abort();
    handoffAbortRef.current = null;
    setSending(false);
    setHandoffLoading(false);
    setSessionId(undefined);
    setMessages([buildLocalSupportGreeting()]);
    setDraft("");
    setHandoffOpen(false);
    setAutofillMeta(null);
    setOneLineIssue("");
    setHandoffSummary("");
    setChecklist([]);
    setCheckedItems([]);
    setHandoffContact("");
    setHandoffSavedMessage(null);
  };

  const toggleChecklistItem = (item: string) => {
    setCheckedItems((prev) =>
      prev.includes(item) ? prev.filter((entry) => entry !== item) : [...prev, item],
    );
  };

  const handlePrepareHandoff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const safeIssue = maskSensitiveSupportInput(oneLineIssue.trim()).masked;
    if (!safeIssue) return;

    const safeSummaryBase = maskSensitiveSupportInput(handoffSummary.trim()).masked;
    const checkedSummary =
      checklist.length > 0
        ? `\n\n[사용자 확인 체크리스트]\n${checklist
            .map((item) => `- [${checkedItems.includes(item) ? "x" : " "}] ${item}`)
            .join("\n")}`
        : "";
    const composedSummary = `${safeSummaryBase || `[문의 한 줄] ${safeIssue}`}${checkedSummary}`.slice(
      0,
      6_000,
    );
    const safeContact = handoffContact.trim().slice(0, 300);
    const creatorCategory = creatorCategoryForTopic(handoffCategory);

    const persisted = saveSupportHandoffDraft({
      oneLineIssue: safeIssue,
      category: handoffCategory,
      creatorSupportCategory: creatorCategory,
      urgency: handoffUrgency,
      summary: composedSummary,
      checkedItems,
      contact: safeContact,
      createdAt: new Date().toISOString(),
    });

    onApplyToBrief?.({
      category: creatorCategory,
      summary: composedSummary,
      contact: safeContact,
    });

    setHandoffSavedMessage(
      persisted
        ? "담당자 전달용 문의 요약이 준비됐어요. 아래 1:1 고객센터 또는 지원 브리프에서 바로 이어서 접수할 수 있어요."
        : "담당자 전달용 문의 요약을 준비했어요. 브라우저 저장이 제한돼 있어 아래 1:1 고객센터로 바로 이동해 주세요.",
    );
  };

  const resolvedCount = messages.filter((item) => item.feedback === "resolved").length;

  return (
    <section
      id="ai-support-center"
      aria-labelledby="ai-support-center-title"
      className="mt-5 overflow-hidden rounded-3xl border border-line bg-card shadow-sm [word-break:keep-all]"
    >
      <div className="border-b border-line bg-panel px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
              <Headphones size={14} aria-hidden="true" />
              AI SUPPORT CENTER · ₩0
            </p>
            <h2
              id="ai-support-center-title"
              className="mt-1.5 text-xl font-black tracking-tight text-fg sm:text-2xl"
            >
              AI 고객센터 · 1:1 실시간 채팅상담
            </h2>
            <p className="mt-1 text-xs leading-6 text-fg-2 sm:text-sm">
              막힌 작업을 편하게 한 줄로 물어보세요. 바로 이동하는 해결 버튼과 함께 안내하고, 필요하면 문의 한 줄만으로 담당자에게 넘겨 드려요.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2">
              <ShieldCheck size={15} className="shrink-0 text-success" aria-hidden="true" />
              ₩0 무료 · 개인정보 자동 마스킹
            </span>
            <button
              type="button"
              onClick={handleResetChat}
              className={buttonClass({ variant: "outline", className: "min-h-11 gap-1.5 px-3 text-xs" })}
            >
              <RotateCcw size={14} aria-hidden="true" />
              새 상담
            </button>
          </div>
        </div>

        <div className="mt-4" aria-label="빠른 질문 선택">
          <p className="text-xs font-bold text-fg-2">자주 막히는 문제 바로 묻기</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUPPORT_AI_QUICK_PROMPTS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                disabled={sending}
                onClick={() => {
                  void dispatchMessage(chip.prompt);
                }}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line-strong bg-card px-3.5 py-2 text-left text-xs font-bold text-fg transition-colors duration-150 hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [word-break:keep-all]"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="1:1 AI 채팅상담 대화 내역"
        className="max-h-[28rem] space-y-4 overflow-y-auto overscroll-contain bg-canvas/40 px-4 py-4 sm:px-6 sm:py-5"
      >
        {messages.map((msg, index) => {
          const isUser = msg.role === "user";
          const showFeedbackRow = !isUser && index > 0;
          return (
            <article
              key={msg.id}
              className={
                isUser
                  ? "ml-auto max-w-[92%] rounded-2xl border border-accent/35 bg-accent-soft px-4 py-3 text-fg sm:max-w-[78%]"
                  : "mr-auto max-w-[96%] rounded-2xl border border-line bg-card px-4 py-3.5 text-fg shadow-sm sm:max-w-[86%]"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem]">
                <span className="inline-flex items-center gap-1.5 font-bold text-fg">
                  {isUser ? (
                    "내 질문"
                  ) : (
                    <>
                      <Bot size={15} className="shrink-0 text-accent" aria-hidden="true" />
                      ToonStudio AI 상담사
                    </>
                  )}
                </span>
                {!isUser && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {msg.topicLabelKo ? (
                      <span className="rounded-lg border border-line bg-panel px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2">
                        {msg.topicLabelKo}
                      </span>
                    ) : null}
                    <span className="rounded-lg bg-raised px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2">
                      {modeBadgeLabel(msg.mode)}
                    </span>
                  </div>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg [word-break:keep-all]">
                {msg.content}
              </p>

              {isUser && msg.piiMasked ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-warning/35 bg-warning-soft px-2.5 py-1 text-[0.75rem] font-semibold text-warning">
                  <ShieldCheck size={14} className="shrink-0" aria-hidden="true" />
                  민감 정보({(msg.maskedKinds ?? []).map(maskedKindLabelKo).join(", ")})를 자동으로 마스킹했어요.
                </p>
              ) : null}

              {!isUser && msg.steps && msg.steps.length > 0 ? (
                <ol className="mt-3 space-y-1.5 rounded-xl border border-line bg-panel px-3.5 py-3 text-xs leading-6 text-fg-2">
                  {msg.steps.map((step, stepIndex) => (
                    <li key={step} className="flex gap-2">
                      <span className="shrink-0 font-bold tabular-nums text-accent">
                        {stepIndex + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : null}

              {!isUser && msg.actionLinks && msg.actionLinks.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" aria-label="바로 해결 링크">
                  {msg.actionLinks.map((action) => (
                    <Link
                      key={action.id}
                      to={action.to}
                      className={buttonClass({
                        variant: action.kind === "primary" ? "solid" : "outline",
                        className: "min-h-11 gap-1.5 px-3.5 text-xs [word-break:keep-all]",
                      })}
                    >
                      <span>{action.label}</span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              ) : null}

              {!isUser && msg.followUpPrompts && msg.followUpPrompts.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {msg.followUpPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        void dispatchMessage(prompt);
                      }}
                      className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-panel px-3 py-1.5 text-left text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-accent hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 disabled:opacity-50 motion-reduce:transition-none [word-break:keep-all]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}

              {showFeedbackRow ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    aria-pressed={msg.feedback === "resolved"}
                    onClick={() => handleMarkResolved(msg.id)}
                    className={
                      msg.feedback === "resolved"
                        ? "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-success/40 bg-success-soft px-3 text-xs font-bold text-success transition-colors duration-150 motion-reduce:transition-none"
                        : "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-success hover:text-success motion-reduce:transition-none"
                    }
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    해결됐어요
                  </button>
                  <button
                    type="button"
                    aria-pressed={msg.feedback === "escalated"}
                    onClick={() => {
                      void handleOpenEscalation(msg.id);
                    }}
                    className={
                      msg.suggestEscalation || msg.feedback === "escalated"
                        ? "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 text-xs font-bold text-accent transition-colors duration-150 hover:bg-accent hover:text-on-accent motion-reduce:transition-none"
                        : "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-accent hover:text-accent motion-reduce:transition-none"
                    }
                  >
                    <Headphones size={14} aria-hidden="true" />
                    담당자 연결
                  </button>
                  {msg.feedback === "resolved" ? (
                    <span className="text-xs font-semibold text-success">
                      도움이 되어 다행이에요! 추가 질문도 언제든 물어보세요.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}

        {sending ? (
          <div className="mr-auto max-w-[80%] rounded-2xl border border-line bg-card px-4 py-3 text-xs font-semibold text-fg-2">
            AI 상담사가 해결 방법과 바로가기 버튼을 정리하고 있어요…
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-line bg-panel px-4 py-4 sm:px-6"
      >
        <label htmlFor={composerId} className="block text-xs font-bold text-fg">
          AI 상담 메시지 입력
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            id={composerId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={2}
            maxLength={2_000}
            disabled={sending}
            placeholder="예: 작업하던 원고가 안 보여요 / 3D 배경과 VRM 합성 방법 알려줘"
            className="min-h-11 w-full min-w-0 flex-1 resize-y rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-sm leading-6 text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
          />
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className={buttonClass({ className: "min-h-11 flex-1 gap-1.5 px-4 sm:flex-initial" })}
            >
              <Send size={15} aria-hidden="true" />
              질문 보내기
            </button>
            {sending ? (
              <button
                type="button"
                data-testid="support-chat-cancel-btn"
                onClick={handleCancelSending}
                className={buttonClass({
                  variant: "outline",
                  className: "min-h-11 gap-1.5 px-3 text-xs",
                })}
              >
                <X size={14} aria-hidden="true" />
                요청 취소
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void handleOpenEscalation();
              }}
              className={buttonClass({
                variant: "outline",
                className: "min-h-11 flex-1 gap-1.5 px-3.5 text-xs sm:flex-initial",
              })}
            >
              <UserCheck size={15} aria-hidden="true" />
              담당자 연결
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-fg-3">
          <span>비밀번호·API 키·카드번호는 입력하지 마세요. 감지 시 자동 마스킹됩니다.</span>
          <span className="tabular-nums">
            {draft.length.toLocaleString()} / 2,000자
            {resolvedCount > 0 ? ` · 해결됨 ${resolvedCount}건` : ""}
          </span>
        </div>
      </form>

      {handoffOpen ? (
        <section
          aria-labelledby="ai-support-handoff-title"
          className="border-t border-line bg-card px-4 py-5 sm:px-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
                HUMAN ESCALATION · 1 REQUIRED FIELD
              </p>
              <h3 id="ai-support-handoff-title" className="mt-1 text-lg font-black text-fg">
                담당자 문의로 넘기기
              </h3>
              <p className="mt-1 text-xs leading-6 text-fg-2">
                필수 입력은 <strong>문의 한 줄</strong> 1칸뿐이에요. 분류·긴급도·요약·진단 체크리스트는 AI가 대화 내역에서 자동으로 채웠습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseEscalation}
              className={buttonClass({ variant: "quiet", className: "min-h-11 px-3 text-xs" })}
            >
              닫기
            </button>
          </div>

          {handoffLoading ? (
            <p className="mt-4 rounded-xl border border-line bg-panel px-4 py-3 text-xs font-semibold text-fg-2">
              AI가 상담 대화에서 분류·긴급도·진단 체크리스트를 자동으로 채우고 있어요…
            </p>
          ) : (
            <form onSubmit={handlePrepareHandoff} className="mt-4 space-y-4">
              <div>
                <label htmlFor={oneLineInputId} className="block text-xs font-bold text-fg">
                  문의 한 줄 (필수)
                </label>
                <input
                  id={oneLineInputId}
                  type="text"
                  required
                  maxLength={200}
                  value={oneLineIssue}
                  onChange={(event) => {
                    setOneLineIssue(event.target.value);
                    setHandoffSavedMessage(null);
                  }}
                  placeholder="예: 3화 PDF 내보내기에서 70% 구간에 멈춤 오류가 납니다"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-panel px-3.5 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
                />
              </div>

              <details className="rounded-2xl border border-line bg-panel px-4 py-3">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-bold text-fg sm:text-sm">
                  <span>
                    AI 자동 채움 항목 보기 (선택) ·{" "}
                    {SUPPORT_TOPIC_OPTIONS.find((item) => item.id === handoffCategory)?.labelKo ?? "일반 이용 안내"} ·{" "}
                    {urgencyLabelKo(handoffUrgency)}
                  </span>
                </summary>

                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-fg-2">
                      AI 자동 분류
                      <select
                        value={handoffCategory}
                        onChange={(event) => {
                          setHandoffCategory(event.target.value as SupportAiTopicId);
                          setHandoffSavedMessage(null);
                        }}
                        className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
                      >
                        {SUPPORT_TOPIC_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.labelKo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold text-fg-2">
                      AI 추천 긴급도
                      <select
                        value={handoffUrgency}
                        onChange={(event) => {
                          setHandoffUrgency(event.target.value as SupportTicketUrgency);
                          setHandoffSavedMessage(null);
                        }}
                        className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
                      >
                        <option value="high">긴급 (작업 차단·유실·결제)</option>
                        <option value="normal">보통 (기능·성능 점검)</option>
                        <option value="low">여유 (일반 이용 문의)</option>
                      </select>
                    </label>
                  </div>

                  <label className="block text-xs font-bold text-fg-2">
                    AI 자동 요약
                    <textarea
                      rows={4}
                      maxLength={4_000}
                      value={handoffSummary}
                      onChange={(event) => {
                        setHandoffSummary(event.target.value);
                        setHandoffSavedMessage(null);
                      }}
                      className="mt-1 min-h-24 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-xs leading-6 text-fg"
                    />
                  </label>

                  {checklist.length > 0 ? (
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-bold text-fg-2">
                        진단 체크리스트 (확인한 항목만 선택)
                      </legend>
                      {checklist.map((item) => (
                        <label
                          key={item}
                          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg"
                        >
                          <input
                            type="checkbox"
                            checked={checkedItems.includes(item)}
                            onChange={() => toggleChecklistItem(item)}
                            className="size-4 shrink-0 accent-[var(--color-accent)]"
                          />
                          <span>{item}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : null}

                  <label className="block text-xs font-bold text-fg-2">
                    담당자 회신 연락처 (선택)
                    <input
                      type="text"
                      maxLength={300}
                      value={handoffContact}
                      onChange={(event) => {
                        setHandoffContact(event.target.value);
                        setHandoffSavedMessage(null);
                      }}
                      placeholder="업무용 이메일 또는 메신저 ID (공용 기기 입력 주의)"
                      className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
                    />
                  </label>

                  {autofillMeta?.piiMasked ? (
                    <p className="text-xs font-semibold text-warning">
                      대화 중 감지된 민감 정보는 요약에서 자동으로 마스킹 처리됐어요.
                    </p>
                  ) : null}
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={!oneLineIssue.trim()}
                  className={buttonClass({ className: "min-h-11 gap-2 px-4" })}
                >
                  <UserCheck size={15} aria-hidden="true" />
                  문의 준비 완료·브리프 반영
                </button>
                <Link
                  to="/support"
                  className={buttonClass({ variant: "outline", className: "min-h-11 gap-1.5 px-4 text-xs" })}
                >
                  1:1 고객센터 접수 화면 열기
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>

              {handoffSavedMessage ? (
                <p className="rounded-xl border border-success/35 bg-success-soft px-3.5 py-2.5 text-xs font-semibold text-success">
                  {handoffSavedMessage}
                </p>
              ) : null}
            </form>
          )}
        </section>
      ) : null}
    </section>
  );
}

export default StudioAiSupportCenterChat;
