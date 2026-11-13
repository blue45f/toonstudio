/**
 * 작가 뉴스레터 작성·발송 페이지(`/newsletter/compose`).
 *
 * 필명(작가 이름) 단위로 구독자 수를 확인하고, 제목·본문을 써서 임시 저장하거나
 * 발송한다. 발송 전 미리보기로 실제 메일 형태를 확인한다.
 *
 * 발송은 어댑터가 정한다: 통합 API 키 허브에 Resend 키를 등록하면 서버 릴레이를
 * 거쳐 실제 메일이 나가고, 키가 없으면 로컬 기록 전용으로 상태 전이 + 이력만
 * 남는다. 화면의 발송 상태 문구가 어느 쪽인지 그대로 표시한다
 * (`newsletter-mail-adapter.ts`, `newsletter-mail-resend.ts` 참조).
 */

import { Eye, History, Mail, PenLine, Plus, Save, Send, Trash2, Users } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";

import { getAuthSession } from "@/domains/auth/public/session/auth-session-state";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";
import { TaskScreenNavigation } from "@/shared/components/task-screen-navigation";
import { useTaskScreen } from "@/shared/components/use-task-screen";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { formatCount } from "@/shared/lib/utils";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";

import {
  buildNewsletterPreview,
  countNewsletterSubscribers,
  listAuthorNewsletterIssues,
  listAuthorNewsletterSendHistory,
} from "./newsletter-model";
import {
  RESEND_NEWSLETTER_ADAPTER_ID,
  browserNewsletterSessionStorage,
  isNewsletterResendConfigured,
  loadNewsletterResendApiKey,
} from "./newsletter-mail-resend";
import { useNewsletterStore } from "./newsletter-store";
import type { NewsletterIssue, SendIssueFailureReason } from "./newsletter-types";

type Notice = { readonly kind: "success" | "error"; readonly text: string } | null;
type CampaignTemplateId = "new-episode-drop" | "behind-the-scenes-sketch" | "hiatus-return-notice";
type AudienceSegmentId = "all-subscribers" | "superfan-top10pct" | "dormant-30d-winback";

const CAMPAIGN_TEMPLATE_OPTIONS: readonly {
  readonly id: CampaignTemplateId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "new-episode-drop",
    ko: "신규 회차 업로드 알림",
    en: "New Episode Drop",
    detailKo: "새 에피소드 대표 컷 미리보기와 바로 읽기 CTA를 포함한 주간 연재 발송 포맷",
    detailEn: "Weekly release digest featuring key panel preview and direct episode reader CTA",
  },
  {
    id: "behind-the-scenes-sketch",
    ko: "비하인드 콘티·스케치 노트",
    en: "Behind-the-Scenes Sketch",
    detailKo: "러프 콘티·초기 캐릭터 시트·작가 후기 에세이를 묶은 팬레터 전용 템플릿",
    detailEn: "Creator essay format bundling rough storyboards, character sheets, and studio notes",
  },
  {
    id: "hiatus-return-notice",
    ko: "휴재 복귀·시즌 예고장",
    en: "Hiatus Return Notice",
    detailKo: "시즌 복귀 일정·연재 재개 카운트다운·정주행 요약 링크를 전하는 공지 포맷",
    detailEn: "Season return announcement with countdown schedule and recap binge links",
  },
];

const AUDIENCE_SEGMENT_OPTIONS: readonly {
  readonly id: AudienceSegmentId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "all-subscribers",
    ko: "전체 구독 독자 발송",
    en: "All Subscribers",
    detailKo: "필명을 구독한 모든 활성 독자 이메일 목록에 동시 발송합니다.",
    detailEn: "Broadcasts to all active reader email addresses subscribed to your pen name.",
  },
  {
    id: "superfan-top10pct",
    ko: "상위 10% 열혈 팬 세그먼트",
    en: "Top 10% Superfans",
    detailKo: "최근 5회 연속 열람·완독률을 기록한 상위 10% 코어 독자층에 우선 발송합니다.",
    detailEn: "Targets the top 10% core readers with 5+ consecutive issue opens and full reads.",
  },
  {
    id: "dormant-30d-winback",
    ko: "30일 미열람 독자 재활성",
    en: "30-Day Dormant Winback",
    detailKo: "최근 30일간 열람 이력이 없는 휴면 구독자에게 하이라이트 요약본을 보냅니다.",
    detailEn: "Re-engages subscribers inactive for 30+ days with a curated story highlight digest.",
  },
];

/**
 * 뉴스레터 스토어는 IndexedDB 비동기 persist라, 복원이 끝나기 전에 화면을 열면
 * 빈 초기 상태가 진짜처럼 보이고(구독자 0명·초안 없음), 그 상태에서 임시 저장을
 * 누르면 복원된 issues에 방금 만든 초안이 덮여 사라진다. 복원 완료를 게이트로 쓴다.
 */
function useNewsletterHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useNewsletterStore.persist.onFinishHydration(cb),
    () => useNewsletterStore.persist.hasHydrated(),
    () => false,
  );
}

export function NewsletterComposePage() {
  const { activeScreen, navigateScreen } = useTaskScreen({ ids: ["compose", "preview", "history", "settings"] as const, defaultScreen: "compose" });
  const t = useBilingual("newsletter");
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const actorId = useAuthActorId();
  useDocumentTitle("뉴스레터 작성");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const hydrated = useNewsletterHydrated();
  const [campaignTemplate, setCampaignTemplate] = useState<CampaignTemplateId>("new-episode-drop");
  const [audienceSegment, setAudienceSegment] = useState<AudienceSegmentId>("all-subscribers");

  const activeTemplate =
    CAMPAIGN_TEMPLATE_OPTIONS.find((item) => item.id === campaignTemplate) ?? CAMPAIGN_TEMPLATE_OPTIONS[0];
  const activeSegment =
    AUDIENCE_SEGMENT_OPTIONS.find((item) => item.id === audienceSegment) ?? AUDIENCE_SEGMENT_OPTIONS[0];

  const legacyPenName = useNewsletterStore((state) => state.penName);
  const penNames = useNewsletterStore((state) => state.penNames);
  const setPenName = useNewsletterStore((state) => state.setPenName);
  const claimLegacyData = useNewsletterStore((state) => state.claimLegacyData);
  // 필명은 계정별로 갈린다 — 다른 계정의 필명·초안이 이 화면에 새지 않게 한다.
  const penName = actorId ? (penNames[actorId] ?? null) : legacyPenName;
  const subscriptions = useNewsletterStore((state) => state.subscriptions);
  const issues = useNewsletterStore((state) => state.issues);
  const sendHistory = useNewsletterStore((state) => state.sendHistory);
  const createIssue = useNewsletterStore((state) => state.createIssue);
  const updateIssue = useNewsletterStore((state) => state.updateIssue);
  const deleteIssue = useNewsletterStore((state) => state.deleteIssue);
  const sendIssue = useNewsletterStore((state) => state.sendIssue);

  const [penNameInput, setPenNameInput] = useState<string>(
    () => penName ?? getAuthSession()?.user.name ?? "",
  );
  // Resend 키 등록 여부는 화면 진입 시점에 읽는다 — 키 등록은 API 키 허브에서 하고,
  // 등록 뒤 이 화면으로 돌아오면 새 상태로 다시 읽힌다.
  const [resendConfigured] = useState(() =>
    isNewsletterResendConfigured(
      loadNewsletterResendApiKey(browserNewsletterSessionStorage()),
    ),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, setSending] = useState(false);

  // 복원이 끝난 뒤 미귀속(레거시) 데이터를 현재 계정 소유로 확정한다. 이 확정 전에는
  // 목록 필터가 ownerId로 거르므로, 다른 계정이 먼저 귀속시킨 데이터는 보이지 않는다.
  useEffect(() => {
    if (hydrated && actorId) claimLegacyData(actorId);
  }, [hydrated, actorId, claimLegacyData]);

  useEffect(() => {
    if (penName) setPenNameInput(penName);
  }, [penName]);

  const myIssues = penName ? listAuthorNewsletterIssues(issues, penName, actorId ?? undefined) : [];
  const myHistory = penName ? listAuthorNewsletterSendHistory(sendHistory, penName, actorId ?? undefined) : [];
  const subscriberCount = penName ? countNewsletterSubscribers(subscriptions, penName) : 0;
  const editingIssue = myIssues.find((issue) => issue.id === editingId) ?? null;
  const editingSent = editingIssue?.status === "sent";
  const editorLocked = !penName || editingSent;
  const preview = buildNewsletterPreview({ authorName: penName ?? "", title, body });

  const failureCopy = (reason: SendIssueFailureReason): string => {
    switch (reason) {
      case "empty-title":
        return t("제목을 입력해 주세요.", "Please enter a subject.");
      case "empty-body":
        return t("본문을 입력해 주세요.", "Please write the body.");
      case "no-subscribers":
        return t(
          "아직 이 브라우저에서 구독한 독자가 없어 발송할 수 없어요.",
          "No reader has subscribed from this browser yet, so there is no one to send to.",
        );
      case "already-sent":
        return t("이미 발송한 뉴스레터예요.", "This newsletter was already sent.");
      case "not-found":
        return t("초안을 찾을 수 없어요.", "The draft could not be found.");
      case "delivery-failed":
        return t(
          "실제 메일 발송에 실패했어요. 발송 이력에 실패로 기록했고, 초안은 그대로 남아 있어 다시 보낼 수 있어요.",
          "Real email delivery failed. The attempt was recorded as failed in your history, and the draft is still here so you can send it again.",
        );
    }
  };

  const startNew = () => {
    navigateScreen("compose");
    setEditingId(null);
    setTitle("");
    setBody("");
    setNotice(null);
  };

  const loadIssue = (issue: NewsletterIssue) => {
    navigateScreen(issue.status === "sent" ? "preview" : "compose");
    setEditingId(issue.id);
    setTitle(issue.title);
    setBody(issue.body);
    setNotice(null);
  };

  /** 편집 내용을 초안으로 확정하고 그 ID를 돌려준다. 발송 전에도 같은 경로를 쓴다. */
  const saveDraft = (): string | null => {
    if (!penName) return null;
    if (editingId) {
      const updated = updateIssue(editingId, { title, body }, actorId);
      return updated ? updated.id : null;
    }
    const created = createIssue(penName, { title, body }, actorId);
    setEditingId(created.id);
    return created.id;
  };

  /** 초안을 확정하지 못한 이유를 공지로 남긴다 — 조용히 끝나면 사용자는 저장된 줄 안다. */
  const draftFailureNotice = () => {
    setNotice({
      kind: "error",
      text: !penName
        ? t("필명을 먼저 저장해 주세요. 필명이 있어야 초안을 만들 수 있어요.", "Save your pen name first — a draft needs one.")
        : t("임시 저장하지 못했어요. 편집 중인 초안을 찾을 수 없어요.", "Couldn't save the draft. The issue being edited could not be found."),
    });
  };

  const handleSaveDraft = () => {
    if (saveDraft()) {
      setNotice({ kind: "success", text: t("임시 저장했어요.", "Draft saved.") });
    } else {
      draftFailureNotice();
    }
  };

  const handleSend = async () => {
    const issueId = saveDraft();
    if (!issueId) {
      draftFailureNotice();
      return;
    }
    setSending(true);
    try {
      const result = await sendIssue(issueId, actorId);
      if (result.sent) {
        const deliveredByResend = result.record?.adapterId === RESEND_NEWSLETTER_ADAPTER_ID;
        setNotice({
          kind: "success",
          text: deliveredByResend
            ? t(
                `실제 메일을 보냈어요. 수신 ${result.record?.recipientCount ?? 0}명 · Resend 발송`,
                `Email sent to ${result.record?.recipientCount ?? 0} recipients via Resend.`,
              )
            : t(
                `발송을 기록했어요. 수신 ${result.record?.recipientCount ?? 0}명 · 실제 이메일은 메일 서비스 연결 후 발송됩니다.`,
                `Send recorded for ${result.record?.recipientCount ?? 0} recipients. Actual email goes out once a mail service is connected.`,
              ),
        });
      } else if (result.reason) {
        setNotice({ kind: "error", text: failureCopy(result.reason) });
      }
    } catch {
      // 어댑터가 결과 반환이 아니라 예외로 실패하는 경우(연결 오류 등)에도
      // 무반응으로 끝나지 않게 오류 공지를 남긴다.
      setNotice({
        kind: "error",
        text: t(
          "발송 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.",
          "Something went wrong while sending. Please try again in a moment.",
        ),
      });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = () => {
    if (!editingId) return;
    // 확인 없이 즉시 지우면 되돌릴 수 없다 — 발송 이력이 아닌 초안이라도 확인을 거친다.
    if (!window.confirm(t("이 초안을 삭제할까요? 되돌릴 수 없어요.", "Delete this draft? This can't be undone."))) return;
    if (deleteIssue(editingId, actorId)) {
      startNew();
    } else {
      setNotice({
        kind: "error",
        text: t("삭제하지 못했어요. 이미 삭제됐거나 초안이 아니에요.", "Couldn't delete it. It may already be deleted or no longer a draft."),
      });
    }
  };

  if (!hydrated) {
    return (
      <Container size="wide" className="py-10">
        <p role="status" className="text-sm text-fg-2">
          {t("저장된 뉴스레터를 불러오는 중이에요…", "Loading your saved newsletters…")}
        </p>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <PenLine size={13} /> {t("뉴스레터", "NEWSLETTER")}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("뉴스레터 보내기", "Send a newsletter")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-2">
            {t(
              "새 화가 나오면 구독자에게 이메일 한 통으로 소식을 전하세요. 발송은 주 1회 묶음을 기본으로 안내합니다.",
              "Tell your subscribers about a new episode with one email. Subscribers are guided to a weekly digest by default.",
            )}
          </p>
        </div>
        <nav aria-label={t("뉴스레터 메뉴", "Newsletter navigation")} className="flex flex-wrap gap-2">
          <a
            href="/newsletter"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
          >
            <Mail size={15} aria-hidden />
            {t("내 구독 관리", "My subscriptions")}
          </a>
          <a
            href="/newsletter/compose"
            aria-current="page"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-white"
          >
            <PenLine size={15} aria-hidden />
            {t("작가용 뉴스레터 발송", "Author compose")}
          </a>
        </nav>
      </header>

      <TaskScreenNavigation label={t("뉴스레터 작업 선택", "Newsletter task")} activeScreen={activeScreen} defaultScreen="compose" items={[
        { id: "compose", label: t("작성", "Compose") }, { id: "preview", label: t("미리보기", "Preview") },
        { id: "history", label: t("발송 이력", "Send history") }, { id: "settings", label: t("발신자·템플릿", "Sender & templates") },
      ]} />
      <section hidden={activeScreen !== "settings"}
        data-testid="newsletter-compose-rea-openrate-bar"
        aria-label={pickLang("템플릿·발송 대상 미리보기", "Template and audience preview")}
        className="mb-5 rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-accent">
            {pickLang("캠페인 템플릿 · 독자 분류 미리보기", "Campaign template and audience preview")}
          </span>
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-3">
            {t("미리보기 전용 · 실제 발송 대상에 반영되지 않음", "Preview only · does not change recipients")}
          </span>
        </div>
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("캠페인 템플릿", "Campaign template")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("캠페인 템플릿", "Template")}
          </span>
          {CAMPAIGN_TEMPLATE_OPTIONS.map((item) => {
            const active = item.id === campaignTemplate;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`newsletter-rea-tpl-${item.id}`}
                aria-pressed={active}
                onClick={() => setCampaignTemplate(item.id)}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("수신 독자 세그먼트", "Audience segment")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("독자 세그먼트", "Segment")}
          </span>
          {AUDIENCE_SEGMENT_OPTIONS.map((item) => {
            const active = item.id === audienceSegment;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`newsletter-rea-seg-${item.id}`}
                aria-pressed={active}
                onClick={() => setAudienceSegment(item.id)}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <p
          data-testid="newsletter-compose-rea-status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg"
        >
          {pickLang(
            `${activeTemplate.ko} + ${activeSegment.ko} · ${activeTemplate.detailKo} (${activeSegment.detailKo})`,
            `${activeTemplate.en} + ${activeSegment.en} · ${activeTemplate.detailEn} (${activeSegment.detailEn})`,
          )}
        </p>
      </section>

      {!actorId ? (
        <section className="rounded-2xl border border-line bg-panel/50 p-6">
          <h2 className="text-base font-semibold text-fg">
            {t("로그인하면 뉴스레터를 보낼 수 있어요", "Sign in to send newsletters")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            {t(
              "뉴스레터 작성과 발송 기록은 내 계정에 묶여 있어요.",
              "Newsletter drafts and send history are tied to your account.",
            )}
          </p>
          <button
            type="button"
            onClick={() => requestAuthModalOpen({ reason: "protected-action", mode: "login" })}
            className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("로그인하기", "Sign in")}
          </button>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          <section hidden={activeScreen !== "settings" && !(activeScreen === "compose" && !penName)} className="rounded-2xl border border-line bg-panel/50 p-6">
            <h2 className="text-base font-semibold text-fg">{t("작가 이름", "Author name")}</h2>
            <p className="mt-1 text-sm text-fg-2">
              {t(
                "독자가 구독한 작가 이름과 같아야 구독자 수와 발송 대상이 연결됩니다.",
                "Use the same name readers subscribed to, so subscriber counts and recipients line up.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm text-fg-2">
                {t("필명", "Pen name")}
                <input
                  value={penNameInput}
                  onChange={(event) => setPenNameInput(event.target.value)}
                  placeholder={t("예: 김밤하늘", "e.g. Your pen name")}
                  className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg"
                />
              </label>
              <button
                type="button"
                onClick={() => setPenName(penNameInput, actorId)}
                className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-line-strong"
              >
                {t("저장", "Save")}
              </button>
            </div>
            {penName && (
              <p className="mt-4 flex items-center gap-2 text-sm text-fg-2">
                <Users size={15} className="text-accent" />
                {t(
                  `현재 구독자 ${formatCount(subscriberCount)}명`,
                  `${formatCount(subscriberCount)} subscribers`,
                )}
                <span className="text-xs text-fg-3">
                  {t(
                    "(데모 기준 + 이 브라우저 구독 합산, 서버 집계 연결 전 로컬 기준)",
                    "(demo baseline plus this browser's subscriptions, local until server counts are connected)",
                  )}
                </span>
              </p>
            )}
          </section>

          <section hidden={activeScreen !== "compose"} className="rounded-2xl border border-line bg-panel/50 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-fg">
                {editingSent
                  ? t("발송 완료된 뉴스레터", "Sent newsletter")
                  : t("새 뉴스레터 작성", "Write a newsletter")}
              </h2>
              <button
                type="button"
                onClick={startNew}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
              >
                <Plus size={14} /> {t("새 글", "New")}
              </button>
            </div>

            {!penName && (
              <p className="mt-3 text-sm text-accent">
                {t("먼저 작가 이름을 저장해 주세요.", "Save your author name first.")}
              </p>
            )}
            {editingSent && (
              <p className="mt-3 text-sm text-fg-2">
                {t(
                  "발송이 끝난 글은 수정할 수 없어요. 내용은 아래 미리보기에서 확인할 수 있습니다.",
                  "Sent newsletters can't be edited. You can review the content in the preview below.",
                )}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-fg-2">
                {t("제목", "Subject")}
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={editorLocked}
                  placeholder={t("예: 「하늘 고래」 24화 소식", "e.g. New episode news")}
                  className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-fg-2">
                {t("본문", "Body")}
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  disabled={editorLocked}
                  rows={10}
                  placeholder={t(
                    "구독자에게 전할 소식을 적어 주세요. 빈 줄로 단락을 나눌 수 있어요.",
                    "Write the news for your subscribers. Separate paragraphs with a blank line.",
                  )}
                  className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm leading-relaxed text-fg disabled:opacity-60"
                />
              </label>
            </div>

            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`mt-4 text-sm ${notice.kind === "error" ? "text-bad" : "text-accent"}`}
              >
                {notice.text}
              </p>
            )}

            {!editingSent && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!penName}
                  className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-line-strong disabled:opacity-50"
                >
                  <Save size={15} /> {t("임시 저장", "Save draft")}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                  >
                    <Trash2 size={15} /> {t("초안 삭제", "Delete draft")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!penName || sending}
                  className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Send size={15} />
                  {sending ? t("보내는 중…", "Sending…") : t("발송하기", "Send")}
                </button>
                <span className="text-xs text-fg-3">
                  {resendConfigured
                    ? t(
                        "Resend 키가 등록돼 있어요. 발송하면 실제 메일이 나갑니다.",
                        "A Resend key is registered. Sending delivers real email.",
                      )
                    : t(
                        "지금은 로컬 기록 전용이에요. 실제 이메일은 메일 서비스 연결 후 발송됩니다.",
                        "Local record only for now. Actual email goes out once a mail service is connected.",
                      )}{" "}
                  <Link to="/settings/api-keys" className="font-medium text-accent hover:underline">
                    {resendConfigured
                      ? t("키 관리", "Manage key")
                      : t("실발송 키 등록하기", "Register a sending key")}
                  </Link>
                </span>
              </div>
            )}
          </section>

          <section hidden={activeScreen !== "preview"} className="rounded-2xl border border-line bg-panel/50 p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <Eye size={16} className="text-accent" /> {t("메일 미리보기", "Email preview")}
            </h2>
            <div className="mt-4 rounded-xl border border-line bg-card p-5">
              <p className="text-xs text-fg-3">
                {t("보낸 사람", "From")}: {preview.fromName || t("(작가 이름)", "(author name)")}
              </p>
              <p className="mt-1 text-lg font-bold text-fg">
                {preview.subject || t("(제목 없음)", "(no subject)")}
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {preview.paragraphs.length === 0 ? (
                  <p className="text-sm text-fg-3">{t("본문이 여기에 표시됩니다.", "The body appears here.")}</p>
                ) : (
                  preview.paragraphs.map((paragraph, index) => (
                    <p key={index} className="whitespace-pre-line text-sm leading-relaxed text-fg-2">
                      {paragraph}
                    </p>
                  ))
                )}
              </div>
              <hr className="my-5 border-line" />
              <p className="text-xs leading-relaxed text-fg-3">
                {t(
                  `이 메일은 ${preview.fromName || "작가"} 뉴스레터를 구독해서 받았어요. 더 이상 받고 싶지 않으면 구독 해지(${preview.unsubscribePath})에서 끌 수 있습니다.`,
                  `You received this because you subscribed to this author's newsletter. You can unsubscribe anytime at ${preview.unsubscribePath}.`,
                )}
              </p>
            </div>
          </section>

          {penName && (
            <section hidden={activeScreen !== "history"} className="rounded-2xl border border-line bg-panel/50 p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
                <History size={16} className="text-accent" /> {t("내 글과 발송 이력", "My newsletters and send history")}
              </h2>
              {myIssues.length === 0 ? (
                <p className="mt-3 text-sm text-fg-3">
                  {t("아직 쓴 뉴스레터가 없어요.", "You haven't written a newsletter yet.")}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {myIssues.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => loadIssue(issue)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-line-strong"
                      >
                        <span className="text-sm font-medium text-fg">
                          {issue.title.trim() || t("(제목 없음)", "(no subject)")}
                        </span>
                        <span className="text-xs text-fg-3">
                          {issue.status === "sent"
                            ? t(
                                `발송 완료 · ${issue.sentAt ? new Date(issue.sentAt).toLocaleString() : ""}`,
                                `Sent · ${issue.sentAt ? new Date(issue.sentAt).toLocaleString() : ""}`,
                              )
                            : t(
                                `임시 저장 · ${new Date(issue.updatedAt).toLocaleString()}`,
                                `Draft · ${new Date(issue.updatedAt).toLocaleString()}`,
                              )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {myHistory.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4">
                  {myHistory.map((record) => (
                    <li key={record.id} className="text-xs text-fg-3">
                      {record.failed
                        ? t(
                            `${new Date(record.sentAt).toLocaleString()} · 「${record.issueTitle}」 발송 실패 · ${record.adapterId} · ${record.failureMessage ?? ""}`,
                            `${new Date(record.sentAt).toLocaleString()} · “${record.issueTitle}” delivery failed · ${record.adapterId}`,
                          )
                        : t(
                            `${new Date(record.sentAt).toLocaleString()} · 「${record.issueTitle}」 수신 ${record.recipientCount}명 · ${record.adapterId === "local-log" ? "로컬 기록 전용" : record.adapterId}`,
                            `${new Date(record.sentAt).toLocaleString()} · “${record.issueTitle}” to ${record.recipientCount} recipients · ${record.adapterId === "local-log" ? "local record only" : record.adapterId}`,
                          )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </Container>
  );
}
