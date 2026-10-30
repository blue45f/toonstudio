import {
  formatI18nTemplate,
  getCurrentUiLocale,
  translateCurrentStaticSourceText,
  useBilingual,
} from "@/shared/lib/i18n-bilingual-copy";
import { ExternalLink, Inbox, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SupportConversationDetail,
  SupportConversationList,
  SupportConversation,
} from "@toonstudio/contracts/customer-support";

import {
  BUSINESS_INQUIRY_STATUSES,
  BUSINESS_INQUIRY_STATUS_LABELS,
  BUSINESS_INQUIRY_TYPE_LABELS,
  type BusinessInquiryEntry,
  type BusinessInquiryPage,
  type BusinessInquiryStatus,
} from "@toonstudio/core/business-inquiry";

import { api, getApiErrorMessage, httpStatus } from "@/platform/api";
import { AdminBusinessVerifications } from "./AdminBusinessVerifications";
import { AdminEmptyState, AdminSpinner } from "./admin-ui";

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(getCurrentUiLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function InquiryCard({
  item,
  onStatusChange,
  disabled,
}: {
  item: BusinessInquiryEntry;
  onStatusChange: (id: string, status: BusinessInquiryStatus) => Promise<void>;
  disabled: boolean;
}) {
  return (
    <article className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
              {BUSINESS_INQUIRY_TYPE_LABELS[item.type]}
            </span>
            <span className="text-xs text-fg-3">{formatDate(item.createdAt)}</span>
          </div>
          <h2 className="mt-3 text-lg font-bold text-fg">
            {item.organization || translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "개인 문의")} · {item.contactName}
          </h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
            <a href={formatI18nTemplate(translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "en", "mailto:{v0}"), { v0: String(item.email) })} className="font-semibold text-accent hover:underline">
              {item.email}
            </a>
            {item.website ? (
              <a
                href={item.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-accent hover:underline"
              >
                {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "웹사이트 ")}<ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-fg-3">
          {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "처리 상태")}<select
            value={item.status}
            disabled={disabled}
            onChange={(event) => void onStatusChange(item.id, event.target.value as BusinessInquiryStatus)}
            className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent disabled:opacity-60"
          >
            {BUSINESS_INQUIRY_STATUSES.map((status) => (
              <option key={status} value={status}>{BUSINESS_INQUIRY_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-4 whitespace-pre-wrap rounded-xl border border-line/70 bg-panel/55 p-4 text-sm leading-7 text-fg-2">
        {item.message}
      </p>
      <p className="mt-3 text-xs text-fg-3">
        {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "접수 경로: ")}{item.sourcePath || "/business"} {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "· 문의 ID: ")}{item.id}
      </p>
    </article>
  );
}

export function AdminBusinessInquiries() {
  const [status, setStatus] = useState<BusinessInquiryStatus | "all">("all");
  const [page, setPage] = useState<BusinessInquiryPage>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get<BusinessInquiryPage>("/admin/business-inquiries", {
        params: { status: status === "all" ? undefined : status, limit: 100 },
      });
      setPage(result);
    } catch (requestError) {
      setError(await getApiErrorMessage(requestError, translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "비즈니스 문의를 불러오지 못했어요.")));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, nextStatus: BusinessInquiryStatus) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await api.post<BusinessInquiryEntry>(`/admin/business-inquiries/${encodeURIComponent(id)}/status`, {
        status: nextStatus,
      });
      setPage((current) => ({
        ...current,
        items: current.items.map((item) => item.id === id ? updated : item),
      }));
    } catch (requestError) {
      setError(await getApiErrorMessage(requestError, translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "문의 상태를 변경하지 못했어요.")));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
    <AdminCustomerSupport />
    <section className="space-y-5" aria-labelledby="business-inquiries-title">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-line bg-card p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "en", "Private business inbox")}</p>
          <h2 id="business-inquiries-title" className="mt-1 text-2xl font-bold text-fg">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "비즈니스 문의")}</h2>
          <p className="mt-2 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "투자·IR, 제휴, 콘텐츠/IP, 후원·스폰서십 문의를 비공개로 처리합니다.")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-fg-3">
            {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "상태 필터")}<select
              value={status}
              onChange={(event) => setStatus(event.target.value as BusinessInquiryStatus | "all")}
              className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent"
            >
              <option value="all">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "전체 (")}{page.total})</option>
              {BUSINESS_INQUIRY_STATUSES.map((item) => (
                <option key={item} value={item}>{BUSINESS_INQUIRY_STATUS_LABELS[item]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg-2 hover:border-accent/50 hover:text-accent disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "en", "animate-spin") : ""} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "새로고침")}</button>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {loading && page.items.length === 0 ? (
        <AdminSpinner />
      ) : page.items.length === 0 && !error ? (
        <AdminEmptyState icon={<Inbox size={20} />} title={translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "해당 상태의 문의가 없습니다.")} />
      ) : page.items.length === 0 ? null : (
        <div className="grid gap-4">
          {page.items.map((item) => (
            <InquiryCard
              key={item.id}
              item={item}
              disabled={updatingId === item.id}
              onStatusChange={updateStatus}
            />
          ))}
        </div>
      )}
    </section>
    <div className="mt-6">
      <AdminBusinessVerifications />
    </div>
    </>
  );
}

const SUPPORT_POLL_MS = 10_000;
const SUPPORT_PAGE_SIZE = 50;
const SUPPORT_STATES = ["waiting", "open", "closed", "all"] as const;
type SupportQueueFilter = (typeof SUPPORT_STATES)[number];

export function AdminCustomerSupport() {
  const t = useBilingual("AdminCustomerSupport");
  const [filter, setFilter] = useState<SupportQueueFilter>("waiting");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<SupportConversationList>({ items: [], total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [authDenied, setAuthDenied] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const denied = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const retryMessage = useRef<{ conversationId: string; content: string; id: string } | null>(null);
  const stateLabel = (status: SupportConversation["status"] | "all") => ({
    ai: t("AI 상담", "AI conversation"),
    waiting: t("상담원 답변 대기", "Waiting for an agent"),
    open: t("상담 진행 중", "In progress"),
    closed: t("종료됨", "Closed"),
    all: t("전체", "All"),
  })[status];

  const denyAccess = useCallback(() => {
    denied.current = true;
    mutation.current?.abort();
    retryMessage.current = null;
    setAuthDenied(true);
    setPage({ items: [], total: 0 });
    setSelectedId(null);
    setDetail(null);
    setDraft("");
    setListError("");
    setDetailError("");
    setMutationError("");
    setNotice("");
    setLoading(false);
    setDetailLoading(false);
    setBusy(false);
  }, []);

  useEffect(() => () => mutation.current?.abort(), []);

  useEffect(() => {
    if (authDenied) return;
    const controller = new AbortController();
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setPage({ items: [], total: 0 });
    setLoading(true);
    setListError("");
    async function loadQueue() {
      try {
        const result = await api.get<SupportConversationList>("/admin/support/conversations", {
          params: { status: filter === "all" ? undefined : filter, limit: SUPPORT_PAGE_SIZE, offset },
          signal: controller.signal,
        });
        if (!current || denied.current) return;
        if (offset > 0 && result.total <= offset) {
          setOffset(Math.max(0, Math.floor((result.total - 1) / SUPPORT_PAGE_SIZE) * SUPPORT_PAGE_SIZE));
          return;
        }
        setPage(result);
        setListError("");
      } catch (cause) {
        if (!current || denied.current) return;
        if (httpStatus(cause) === 401 || httpStatus(cause) === 403) {
          denyAccess();
          return;
        }
        const message = await getApiErrorMessage(cause, t("고객 문의를 불러오지 못했습니다.", "Could not load customer inquiries."));
        if (current && !denied.current) setListError(message);
      } finally {
        if (current && !denied.current) {
          setLoading(false);
          timer = setTimeout(() => void loadQueue(), SUPPORT_POLL_MS);
        }
      }
    }
    void loadQueue();
    return () => { current = false; controller.abort(); clearTimeout(timer); };
  }, [filter, offset, refresh, authDenied, denyAccess, t]);

  useEffect(() => {
    if (!selectedId || authDenied || busy) return;
    const controller = new AbortController();
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setDetailLoading(true);
    setDetailError("");
    async function loadDetail() {
      try {
        const result = await api.get<SupportConversationDetail>(`/admin/support/conversations/${encodeURIComponent(selectedId ?? "")}`, { signal: controller.signal });
        if (!current || denied.current) return;
        setDetail(result);
        setDetailError("");
      } catch (cause) {
        if (!current || denied.current) return;
        if (httpStatus(cause) === 401 || httpStatus(cause) === 403) {
          denyAccess();
          return;
        }
        if (httpStatus(cause) === 404) setDetail(null);
        const message = await getApiErrorMessage(cause, t("대화 내역을 불러오지 못했습니다.", "Could not load this conversation."));
        if (current && !denied.current) setDetailError(message);
      } finally {
        if (current && !denied.current) {
          setDetailLoading(false);
          timer = setTimeout(() => void loadDetail(), SUPPORT_POLL_MS);
        }
      }
    }
    void loadDetail();
    return () => { current = false; controller.abort(); clearTimeout(timer); };
  }, [selectedId, refresh, authDenied, busy, denyAccess, t]);

  function selectConversation(id: string) {
    if (selectedId === id) return;
    setSelectedId(id);
    setDetail(null);
    setDraft("");
    setDetailError("");
    setMutationError("");
    setNotice("");
    retryMessage.current = null;
  }

  async function updateConversation(status?: "open" | "closed") {
    if (!detail || busy || denied.current) return;
    const content = draft.trim();
    if (!status && !content) return;
    const id = detail.conversation.id;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    setMutationError("");
    setNotice("");
    try {
      if (!status && (!retryMessage.current || retryMessage.current.conversationId !== id || retryMessage.current.content !== content)) {
        retryMessage.current = { conversationId: id, content, id: crypto.randomUUID() };
      }
      const result = await api.post<SupportConversationDetail>(
        `/admin/support/conversations/${encodeURIComponent(id)}/${status ? "status" : "messages"}`,
        status ? { status } : { content, clientMessageId: retryMessage.current?.id },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || denied.current) return;
      setDetail(result);
      if (!status) { setDraft(""); retryMessage.current = null; }
      setNotice(status ? t("문의 상태를 변경했습니다.", "Conversation status updated.") : t("상담원 답변을 보냈습니다.", "Agent reply sent."));
      setRefresh((value) => value + 1);
    } catch (cause) {
      if (controller.signal.aborted || denied.current) return;
      if (httpStatus(cause) === 401 || httpStatus(cause) === 403) {
        denyAccess();
        return;
      }
      const message = await getApiErrorMessage(cause, t("처리하지 못했습니다. 내용을 확인하고 다시 시도해 주세요.", "The request failed. Check your draft and try again."));
      if (!controller.signal.aborted && !denied.current) setMutationError(message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="mb-8 space-y-4 rounded-2xl border border-line bg-card p-5" aria-labelledby="customer-support-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="customer-support-title" className="text-2xl font-bold text-fg">{t("1:1 고객 상담", "Private customer support")}</h2>
          <p className="mt-2 text-sm text-fg-2">{t("상담원 연결을 요청한 고객에게 답변합니다. AI 상담 내역도 함께 확인할 수 있습니다.", "Reply to customers who requested an agent and review their AI conversation.")}</p>
        </div>
        <button type="button" disabled={loading || busy} onClick={() => { denied.current = false; setAuthDenied(false); setRefresh((value) => value + 1); }} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-fg disabled:opacity-60">{t("고객 상담 새로고침", "Refresh customer support")}</button>
      </header>
      {authDenied ? <p role="alert" className="text-sm text-danger">{t("관리자 권한을 확인할 수 없습니다. 관리자 계정으로 다시 로그인한 뒤 새로고침해 주세요.", "Administrator access could not be verified. Sign in as an administrator and refresh.")}</p> : <>
        <label className="flex flex-wrap items-center gap-3 text-sm text-fg-2">{t("고객 상담 상태", "Customer support status")}
          <select aria-label={t("고객 상담 상태", "Customer support status")} value={filter} disabled={busy} onChange={(event) => {
            const next = SUPPORT_STATES.find((value) => value === event.target.value);
            if (next) { setFilter(next); setOffset(0); setSelectedId(null); setDetail(null); setDraft(""); setMutationError(""); setNotice(""); }
          }} className="min-h-11 rounded-xl border border-line bg-panel px-3 text-fg">{SUPPORT_STATES.map((status) => <option key={status} value={status}>{stateLabel(status)}</option>)}</select>
          <span>{page.total}{t("건", " conversations")}</span>
        </label>
        {loading && <p role="status" className="text-sm text-fg-2">{t("고객 문의를 불러오는 중입니다.", "Loading customer inquiries.")}</p>}
        {listError && <p role="alert" className="text-sm text-danger">{listError}</p>}
        {!loading && !listError && page.items.length === 0 && <p className="text-sm text-fg-2">{t("해당 상태의 고객 상담이 없습니다.", "No customer conversations with this status.")}</p>}
        <nav aria-label={t("고객 상담 페이지", "Customer support pages")} className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
          <button type="button" disabled={loading || busy || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - SUPPORT_PAGE_SIZE))} className="min-h-11 rounded-xl border border-line px-3 text-fg disabled:opacity-60">{t("고객 상담 이전 페이지", "Previous customer support page")}</button>
          <span>{Math.floor(offset / SUPPORT_PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(page.total / SUPPORT_PAGE_SIZE))}</span>
          <button type="button" disabled={loading || busy || offset + SUPPORT_PAGE_SIZE >= page.total} onClick={() => setOffset((value) => value + SUPPORT_PAGE_SIZE)} className="min-h-11 rounded-xl border border-line px-3 text-fg disabled:opacity-60">{t("고객 상담 다음 페이지", "Next customer support page")}</button>
        </nav>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(200px,1fr)_minmax(0,2fr)]">
          <ul aria-label={t("고객 상담 목록", "Customer conversations")} className="max-h-[34rem] space-y-2 overflow-y-auto">
            {page.items.map((item) => <li key={item.id}><button type="button" disabled={busy} aria-pressed={selectedId === item.id} onClick={() => selectConversation(item.id)} className="grid min-h-14 w-full gap-1 break-words rounded-xl border border-line bg-panel p-3 text-left text-sm text-fg hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent disabled:opacity-60">
              <strong>{item.subject}</strong><span className="text-xs text-fg-2">{stateLabel(item.status)} · {formatDate(item.updatedAt)}</span>
            </button></li>)}
          </ul>
          <div className="min-w-0 space-y-3 rounded-xl border border-line bg-panel p-4">
            {!selectedId && <p className="text-sm text-fg-2">{t("답변할 문의를 선택해 주세요.", "Select a conversation to reply.")}</p>}
            {detailLoading && !detail && <p role="status" className="text-sm text-fg-2">{t("대화 내역을 불러오는 중입니다.", "Loading conversation history.")}</p>}
            {detailError && <p role="alert" className="text-sm text-danger">{detailError}</p>}
            {detail && <>
              <h3 className="break-words font-bold text-fg">{detail.conversation.subject}</h3>
              <p className="text-xs text-fg-2">{stateLabel(detail.conversation.status)} · {t("문의 ID: ", "Conversation ID: ")}{detail.conversation.id}</p>
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 긴 대화 기록을 키보드로 스크롤하려면 영역 자체가 포커스를 받아야 한다(WCAG 2.1.1). */}
              <div role="log" tabIndex={0} aria-label={t("고객 상담 대화 내역", "Customer support transcript")} aria-live="polite" className="max-h-96 overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><ol className="space-y-3">
                {detail.messages.map((message) => <li key={message.id} className="rounded-lg border border-line bg-card p-3">
                  <p className="mb-1 text-xs font-bold text-fg-2">{message.role === "user" ? t("고객", "Customer") : message.role === "assistant" ? "AI" : t("상담원", "Agent")} · {formatDate(message.createdAt)}</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-fg">{message.content}</p>
                </li>)}
              </ol></div>
              {detail.conversation.status !== "closed" ? <form onSubmit={(event) => { event.preventDefault(); void updateConversation(); }} className="space-y-3">
                <label className="grid gap-2 text-sm font-semibold text-fg">{t("상담원 답변", "Agent reply")}<textarea value={draft} disabled={busy} maxLength={4000} rows={4} onChange={(event) => setDraft(event.target.value)} className="w-full resize-y rounded-xl border border-line bg-card p-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60" /></label>
                <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || !draft.trim()} className="min-h-11 rounded-xl bg-fg px-4 text-sm font-bold text-canvas disabled:opacity-60">{busy ? t("처리 중…", "Processing…") : t("답변 보내기", "Send reply")}</button><button type="button" disabled={busy} onClick={() => void updateConversation("closed")} className="min-h-11 rounded-xl border border-line px-4 text-sm text-fg disabled:opacity-60">{t("문의 종료", "Close conversation")}</button></div>
              </form> : <button type="button" disabled={busy} onClick={() => void updateConversation("open")} className="min-h-11 rounded-xl border border-line px-4 text-sm text-fg disabled:opacity-60">{t("상담 다시 열기", "Reopen conversation")}</button>}
            </>}
            {mutationError && <p role="alert" className="text-sm text-danger">{mutationError}</p>}
            {notice && <p role="status" className="text-sm text-fg-2">{notice}</p>}
          </div>
        </div>
      </>}
    </section>
  );
}
