import { Bot, LifeBuoy, MessageCircle, Plus, RefreshCw, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_SUBJECT_MAX_LENGTH,
  type SupportConversationDetail,
} from "@toonstudio/contracts/customer-support";

import "./customer-support-i18n";
import "./customer-support-chat.css";
import { useCustomerSupportChat } from "./useCustomerSupportChat";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

type ChatController = ReturnType<typeof useCustomerSupportChat>;

function SupportComposer({ chat }: { chat: ChatController }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || chat.busy) return;
    if (await chat.send(draft.trim())) setDraft("");
  };
  return (
    <form className="customer-support__composer" onSubmit={(event) => { void submit(event); }}>
      <label htmlFor="support-message">{t("customerSupport.message")}</label>
      <textarea
        id="support-message"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
        placeholder={t("customerSupport.messagePlaceholder")}
        aria-describedby="support-message-limit"
        rows={3}
        disabled={chat.busy}
        required
      />
      <div className="customer-support__composer-actions">
        <small id="support-message-limit">{draft.length.toLocaleString()} / {t("customerSupport.characters")}</small>
        <button type="submit" className="customer-support__primary" disabled={chat.busy || !draft.trim()}>
          <Send size={16} aria-hidden="true" />
          {t(chat.busy ? "customerSupport.sending" : "customerSupport.send")}
        </button>
      </div>
    </form>
  );
}

function SupportTranscript({ detail }: { detail: SupportConversationDetail }) {
  const t = useT();
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 긴 대화 영역을 키보드로 스크롤할 수 있어야 한다.
    <div className="customer-support__transcript" role="log" tabIndex={0} aria-label={t("customerSupport.transcript")} aria-relevant="additions text" aria-live="polite">
      {detail.messages.length ? (
        <ol>
          {detail.messages.map((message) => (
            <li key={message.id} data-role={message.role}>
              <div className="customer-support__message-meta">
                <strong>{t(`customerSupport.role.${message.role}`)}</strong>
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
              </div>
              <p>{message.content}</p>
            </li>
          ))}
        </ol>
      ) : <p className="customer-support__muted">{t("customerSupport.noMessages")}</p>}
    </div>
  );
}

function SupportConversationView({ chat, detail }: { chat: ChatController; detail: SupportConversationDetail }) {
  const t = useT();
  const { conversation } = detail;
  const awaitingAi = conversation.status === "ai" && (Boolean(detail.aiError) || detail.messages.at(-1)?.role === "user");
  return (
    <>
      <header className="customer-support__conversation-heading">
        <div>
          <h3>{conversation.subject}</h3>
          <span className="customer-support__badge" data-status={conversation.status}>{t(`customerSupport.status.${conversation.status}`)}</span>
        </div>
        <button type="button" disabled={chat.busy || chat.detailLoading} onClick={() => { void chat.refreshDetail(); }}>
          <RefreshCw size={16} aria-hidden="true" />{t("customerSupport.refresh")}
        </button>
      </header>
      <p className="customer-support__hint">{t(conversation.status === "ai" ? "customerSupport.aiHint" : conversation.status === "closed" ? "customerSupport.closedHint" : "customerSupport.waitingHint")}</p>
      <SupportTranscript detail={detail} />
      {awaitingAi && (
        <div className="customer-support__notice" role="status">
          <p>{t("customerSupport.aiError")}</p>
          <button type="button" disabled={chat.busy} onClick={() => { void chat.act("retry"); }}>{t("customerSupport.retryAi")}</button>
        </div>
      )}
      {conversation.status !== "closed" && <SupportComposer key={conversation.id} chat={chat} />}
      {conversation.status !== "closed" && (
        <div className="customer-support__conversation-actions">
          {conversation.status === "ai" && (
            <div>
              <button type="button" disabled={chat.busy} onClick={() => { void chat.act("escalate"); }} aria-describedby="support-handoff-hint">
                <LifeBuoy size={16} aria-hidden="true" />{t("customerSupport.escalate")}
              </button>
              <p id="support-handoff-hint" className="customer-support__muted">{t("customerSupport.handoffHint")}</p>
            </div>
          )}
          <button type="button" disabled={chat.busy} onClick={() => { void chat.act("close"); }}>{t("customerSupport.close")}</button>
        </div>
      )}
    </>
  );
}

function NewSupportConversation({ chat }: { chat: ChatController }) {
  const t = useT();
  const [subject, setSubject] = useState("");
  const [mode, setMode] = useState<"ai" | "human" | null>(null);
  const effectiveMode = chat.ai?.available ? mode ?? "ai" : "human";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (subject.trim().length >= 2) await chat.create(subject.trim(), effectiveMode);
  };
  return (
    <form className="customer-support__new" onSubmit={(event) => { void submit(event); }}>
      <h3>{t("customerSupport.new")}</h3>
      <label htmlFor="support-subject">{t("customerSupport.subject")}</label>
      <input id="support-subject" value={subject} onChange={(event) => setSubject(event.target.value)} minLength={2} maxLength={SUPPORT_SUBJECT_MAX_LENGTH} placeholder={t("customerSupport.subjectPlaceholder")} disabled={chat.busy} required />
      <fieldset disabled={chat.busy || chat.loading}>
        <legend>{t("customerSupport.mode")}</legend>
        <label><input type="radio" name="support-mode" value="ai" checked={effectiveMode === "ai"} onChange={() => setMode("ai")} disabled={!chat.ai?.available} /><Bot size={18} aria-hidden="true" />{t("customerSupport.ai")}</label>
        <label><input type="radio" name="support-mode" value="human" checked={effectiveMode === "human"} onChange={() => setMode("human")} /><MessageCircle size={18} aria-hidden="true" />{t("customerSupport.human")}</label>
      </fieldset>
      {!chat.loading && !chat.ai?.available && <p className="customer-support__hint">{t(chat.ai ? "customerSupport.unavailable" : "customerSupport.availabilityUnknown")}</p>}
      <button type="submit" className="customer-support__primary" disabled={chat.busy || chat.loading || subject.trim().length < 2}>{t(chat.busy ? "customerSupport.creating" : "customerSupport.create")}</button>
    </form>
  );
}

function SupportWorkspace() {
  const t = useT();
  const chat = useCustomerSupportChat();
  return (
    <div className="customer-support__workspace" aria-busy={chat.busy}>
      <aside className="customer-support__inbox" aria-label={t("customerSupport.history")}>
        <div className="customer-support__inbox-heading">
          <h3>{t("customerSupport.history")}</h3>
          <button type="button" disabled={chat.busy || chat.loading} onClick={() => { void chat.refreshList(); }} aria-label={t("customerSupport.refresh")}><RefreshCw size={16} aria-hidden="true" /></button>
        </div>
        <button type="button" className="customer-support__new-button" disabled={chat.busy} onClick={() => chat.choose(null)}><Plus size={16} aria-hidden="true" />{t("customerSupport.new")}</button>
        {chat.loading && <p role="status">{t("customerSupport.loading")}</p>}
        {chat.listError && <div role="alert"><p>{t("customerSupport.loadError")}</p><button type="button" disabled={chat.loading || chat.busy} onClick={() => { void chat.refreshList(); }}>{t("customerSupport.retry")}</button></div>}
        {!chat.loading && !chat.listError && !chat.items.length && <p className="customer-support__muted">{t("customerSupport.empty")}</p>}
        <ul aria-label={t("customerSupport.history")}>
          {chat.items.map((item) => (
            <li key={item.id}>
              <button type="button" aria-label={`${item.subject} · ${t(`customerSupport.status.${item.status}`)}`} aria-pressed={chat.selectedId === item.id} disabled={chat.busy} onClick={() => chat.choose(item.id)}>
                <span>{item.subject}</span><small>{t(`customerSupport.status.${item.status}`)}</small>
              </button>
            </li>
          ))}
        </ul>
        {chat.total > chat.pageSize && (
          <nav className="customer-support__pagination" aria-label={t("customerSupport.pagination")}>
            <p aria-live="polite">{t("customerSupport.range", { start: chat.offset + 1, end: Math.min(chat.offset + chat.items.length, chat.total), total: chat.total })}</p>
            <div>
              <button type="button" disabled={chat.busy || chat.loading || chat.offset === 0} onClick={() => { void chat.refreshList(Math.max(0, chat.offset - chat.pageSize)); }}>{t("customerSupport.previous")}</button>
              <button type="button" disabled={chat.busy || chat.loading || chat.offset + chat.pageSize >= chat.total} onClick={() => { void chat.refreshList(chat.offset + chat.pageSize); }}>{t("customerSupport.next")}</button>
            </div>
          </nav>
        )}
      </aside>
      <div className="customer-support__conversation">
        {chat.error && <div className="customer-support__notice" role="alert"><p>{t(`customerSupport.${chat.error}`)}</p>{chat.error === "loadError" && <button type="button" disabled={chat.busy} onClick={() => { void chat.refreshDetail(); }}>{t("customerSupport.retry")}</button>}</div>}
        {chat.detailLoading && <p role="status">{t("customerSupport.loading")}</p>}
        {chat.detail && <SupportConversationView chat={chat} detail={chat.detail} />}
        {!chat.selectedId && <NewSupportConversation chat={chat} />}
      </div>
    </div>
  );
}

export function CustomerSupportChat() {
  const t = useT();
  const session = useSession();
  return (
    <section className="customer-support" id="support-chat" aria-labelledby="customer-support-title">
      <header className="customer-support__heading">
        <p className="support-center__eyebrow"><Bot size={16} aria-hidden="true" /> CUSTOMER CARE</p>
        <h2 id="customer-support-title">{t("customerSupport.title")}</h2>
        <p>{t("customerSupport.description")}</p>
      </header>
      <p className="customer-support__privacy">{t("customerSupport.private")}</p>
      {session.status === "authenticated" ? (
        <SupportWorkspace key={session.data.user.id ?? session.data.user.email ?? "authenticated"} />
      ) : (
        <div className="customer-support__sign-in"><p>{t("customerSupport.loginHint")}</p><Link href="/auth/login">{t("customerSupport.login")}</Link></div>
      )}
    </section>
  );
}
