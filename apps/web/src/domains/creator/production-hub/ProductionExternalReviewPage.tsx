import "../studio-shell/creator-workflow-surfaces.css";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  MessageSquareText,
  Search,
  ShieldCheck,
  UserRound,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import {
  getProductionExternalReview,
  submitProductionExternalReview,
  type ProductionExternalReviewView,
} from "./production-api";
import {
  classifyReviewConnection,
  externalReviewDraftKey,
  extractReviewTags,
  filterReviewResponses,
  isDraftWorthSaving,
  needsConnectionFallback,
  parseExternalReviewDraft,
  permissionScopeRows,
  serializeExternalReviewDraft,
  type ConnectionInfoLike,
  type ReviewConnectionKind,
} from "./external-review-entry";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { LoadingState } from "@/shared/components/LoadingState";
import { EmptyTeach } from "@/shared/components/library-view-empty";
import { getApiErrorMessage } from "@/platform/api";
import { cn } from "@/shared/lib/utils";
import { getLang, useT } from "@/shared/lib/i18n";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { useMetaRobots } from "@/shared/seo/use-document-title";

type T = ReturnType<typeof useT>;

type Decision = "comment" | "approve" | "request-changes";

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(getLang(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function decisionLabel(t: T, decision: Decision): string {
  return {
    comment: t("extreview.decision.comment"),
    approve: t("extreview.decision.approve"),
    "request-changes": t("extreview.decision.requestChanges"),
  }[decision];
}

function decisionTone(decision: Decision): string {
  if (decision === "approve") return "border-good/35 bg-good/10 text-good";
  if (decision === "request-changes") return "border-bad/35 bg-bad/10 text-bad";
  return "border-accent/35 bg-accent-soft text-accent";
}

/** 제출본 상태 — 서버 코드를 그대로 노출하지 않고 라벨과 톤을 상태에 맞춘다. */
function submissionStatusLabel(t: T, status: string): string {
  return {
    approved: t("extreview.status.approved"),
    rejected: t("extreview.status.rejected"),
    "request-changes": t("extreview.status.requestChanges"),
    "changes-requested": t("extreview.status.requestChanges"),
    pending: t("extreview.status.pending"),
    submitted: t("extreview.status.submitted"),
    "in-review": t("extreview.status.inReview"),
    review: t("extreview.status.inReview"),
  }[status] ?? status
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function submissionStatusTone(status: string): string {
  if (status === "approved") return "border-good/35 bg-good/10 text-good";
  if (status === "rejected" || status === "request-changes" || status === "changes-requested") {
    return "border-bad/35 bg-bad/10 text-bad";
  }
  return "border-line bg-panel text-fg-2";
}

function isWebUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function isImageUrl(value: string): boolean {
  return isWebUrl(value) && /\.(png|jpe?g|gif|webp|avif|svg)(\?[^#]*)?(#.*)?$/iu.test(value);
}

/** 검수 자료 이미지 — 로드 실패하면 빈 상자로 위장하지 않고 실패를 그 자리에 표시한다. */
function EvidenceImage({ reference, index }: { reference: string; index: number }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="grid aspect-video w-full place-items-center p-3 text-center text-[0.6875rem] leading-4 text-fg-3">
        {t("extreview.evidence.failed", { n: index + 1 })}
      </span>
    );
  }
  return (
    <img
      src={reference}
      alt={t("extreview.evidence.alt", { n: index + 1 })}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-video w-full object-cover motion-safe:transition-transform motion-safe:group-hover:scale-[1.02]"
    />
  );
}

function permissionSummary(t: T, permissions: readonly ("view" | "comment" | "approve" | "download")[]): string {
  if (permissions.includes("approve")) return t("extreview.perm.approve");
  if (permissions.includes("comment")) return t("extreview.perm.comment");
  return t("extreview.perm.view");
}

function permissionRowLabel(t: T, permission: "view" | "comment" | "approve" | "download"): string {
  return {
    view: t("extreview.permRow.view"),
    comment: t("extreview.permRow.comment"),
    approve: t("extreview.permRow.approve"),
    download: t("extreview.permRow.download"),
  }[permission];
}

/** 연결 상태(온라인/저속/오프라인)를 구독한다 — 폴백 안내와 초안 보존의 기준. */
function useReviewConnection(): ReviewConnectionKind {
  const read = () =>
    classifyReviewConnection({
      online: navigator.onLine,
      connection: (navigator as Navigator & { connection?: ConnectionInfoLike }).connection ?? null,
    });
  const [kind, setKind] = useState<ReviewConnectionKind>(read);
  useEffect(() => {
    const update = () => setKind(read());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const connection = (navigator as Navigator & { connection?: ConnectionInfoLike & EventTarget }).connection;
    connection?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      connection?.removeEventListener?.("change", update);
    };
  }, []);
  return kind;
}

export function ProductionExternalReviewPage() {
  const t = useT();
  // 토큰 공유 검수 링크: 미공개 창작물·검수 의견이 검색에 노출되지 않도록 noindex.
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const params = useParams<{ projectId: string; reviewId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [view, setView] = useState<ProductionExternalReviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  // 링크 자체가 잘못된 경우는 재시도해도 결과가 같다 — 오류 화면에서 재시도를 빼는 기준.
  const linkInvalid = !params.projectId || !params.reviewId || !token;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [decision, setDecision] = useState<Decision>("comment");
  const [note, setNote] = useState("");
  const connectionKind = useReviewConnection();
  const [responseQuery, setResponseQuery] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);

  // 오프라인·저속에서도 작성 중인 의견이 사라지지 않게 이 기기에 임시 저장하고, 다시 열면 복원한다.
  // 저장소 접근이 막힌 환경(사생활 모드 등)에서는 초안만 포기하고 진입 자체는 계속한다.
  useEffect(() => {
    if (!params.reviewId) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(externalReviewDraftKey(params.reviewId));
    } catch {
      raw = null;
    }
    const draft = parseExternalReviewDraft(raw);
    if (draft) {
      setReviewerName((current) => current || draft.reviewerName);
      setNote((current) => current || draft.note);
      if (draft.decision === "comment" || draft.decision === "approve" || draft.decision === "request-changes") {
        setDecision(draft.decision);
      }
      setDraftRestored(true);
    }
    // 검수 건이 바뀔 때만 복원한다 — 입력 중 재실행으로 값을 되돌리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.reviewId]);

  useEffect(() => {
    if (!params.reviewId) return;
    const draft = { reviewerName, decision, note };
    if (!isDraftWorthSaving(draft)) return;
    try {
      window.localStorage.setItem(
        externalReviewDraftKey(params.reviewId),
        serializeExternalReviewDraft({ ...draft, savedAt: new Date().toISOString() }),
      );
    } catch {
      // 저장 실패는 조용히 무시한다 — 제출 동선이 본 경로다.
    }
  }, [params.reviewId, reviewerName, decision, note]);

  useEffect(() => {
    if (!params.projectId || !params.reviewId || !token) {
      setError(t("extreview.error.invalidLink"));
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void getProductionExternalReview(params.projectId, params.reviewId, token)
      .then((result) => {
        if (active) setView(result);
      })
      .catch(async (cause: unknown) => {
        if (active) setError(await getApiErrorMessage(cause, t("extreview.error.expiredFallback")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.projectId, params.reviewId, token, reloadTick, t]);

  const allowedDecisions = useMemo<readonly Decision[]>(() => {
    if (!view) return [];
    const values: Decision[] = [];
    if (view.review.permissions.includes("comment")) values.push("comment");
    if (view.review.permissions.includes("approve")) values.push("approve", "request-changes");
    return values;
  }, [view]);

  useEffect(() => {
    if (allowedDecisions.length > 0 && !allowedDecisions.includes(decision)) {
      setDecision(allowedDecisions[0]!);
    }
  }, [allowedDecisions, decision]);

  // 열어 둔 채 만료를 넘겨도 경고가 정지하지 않게 현재 시각을 주기적으로 갱신한다.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  // 이전 응답은 검색 자산이다 — 이름·본문·결정·#태그로 다시 찾을 수 있게 한다.
  const responseTags = useMemo(
    () => extractReviewTags((view?.review.responses ?? []).map((response) => response.note)),
    [view],
  );
  const visibleResponses = useMemo(
    () =>
      view
        ? filterReviewResponses(view.review.responses, responseQuery, (decision) => decisionLabel(t, decision))
        : [],
    [view, responseQuery, t],
  );

  const expiresAtMs = view ? Date.parse(view.review.expiresAt) : Number.NaN;
  // 임박 경고도 만료 판정과 같은 현재 시각 기준이어야 한다 — 연 순간의 값으로 고정하면
  // 열어 둔 채 경계(3일)를 넘어도 경고가 켜지지 않는다.
  const expiringSoon = Number.isFinite(expiresAtMs) && expiresAtMs - nowMs < 3 * 24 * 60 * 60 * 1000;
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!params.projectId || !params.reviewId || !view || submitting) return;
    if (!reviewerName.trim()) {
      setError(t("extreview.error.nameRequired"));
      return;
    }
    if (decision !== "approve" && !note.trim()) {
      setError(t("extreview.error.noteRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitProductionExternalReview(params.projectId, params.reviewId, {
        token,
        reviewerName: reviewerName.trim(),
        decision,
        note: note.trim(),
      });
      setView(result);
      setNote("");
      // 기록이 끝난 초안은 지운다 — 다음 방문에서 이미 보낸 의견이 다시 복원되지 않게.
      if (params.reviewId) {
        try {
          window.localStorage.removeItem(externalReviewDraftKey(params.reviewId));
        } catch {
          // 초안 삭제 실패는 제출 성공 처리를 막지 않는다.
        }
      }
      setDraftRestored(false);
      setSuccess(t("extreview.success.recorded", { decision: decisionLabel(t, decision) }));
    } catch (cause) {
      setError(await getApiErrorMessage(cause, t("extreview.error.saveFailedFallback")));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card px-5 py-4">
          <LoadingState variant="skeleton" label={t("extreview.loading")} />
          <p className="mt-3 text-sm font-semibold">{t("extreview.loading")}</p>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
        <div className="w-full max-w-lg">
          <h1 className="sr-only">{t("extreview.error.title")}</h1>
          <ErrorState
            title={t("extreview.error.title")}
            message={error ?? t("extreview.error.linkGone")}
            onRetry={linkInvalid ? undefined : () => setReloadTick((tick) => tick + 1)}
          />
          {connectionKind === "offline" ? (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-5 text-fg">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
              {t("extreview.connection.offlineLoadFailed")}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div data-creator-workflow="external-review" className="min-h-dvh bg-canvas text-fg">
      <header className="creator-workflow-topbar border-b border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-black text-accent">{t("extreview.badge.brand")}</span>
                {view.review.watermark ? <span className="rounded-full border border-line bg-raised px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2">{t("extreview.badge.watermark")}</span> : null}
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{view.review.label}</h1>
              <p className="mt-2 text-sm text-fg-2">{view.projectTitle}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel px-4 py-3 text-xs text-fg-2">
              <div className="flex items-center gap-2"><Clock3 className={expiringSoon ? "size-4 text-bad" : "size-4 text-warn"} aria-hidden="true" />{t("extreview.meta.expires")} {view ? formatDate(view.review.expiresAt) : ""}{expiringSoon ? t("extreview.meta.expiringSoon") : ""}</div>
              <div className="mt-2 flex items-center gap-2"><UserRound className="size-4 text-accent" aria-hidden="true" />{t("extreview.meta.permissions")} {permissionSummary(t, view.review.permissions)}</div>
              <div className="mt-2 flex items-center gap-2"><ShieldCheck className="size-4 text-good" aria-hidden="true" />{t("extreview.meta.scopeTitle")}</div>
              <ul className="mt-1.5 space-y-1" aria-label={t("extreview.meta.scopeTitle")}>
                {permissionScopeRows(view.review.permissions).map((row) => (
                  <li key={row.permission} className="flex items-center justify-between gap-3">
                    <span>{permissionRowLabel(t, row.permission)}</span>
                    <span className={row.allowed ? "font-bold text-good" : "font-bold text-fg-3"}>{row.allowed ? t("extreview.meta.allowed") : t("extreview.meta.blocked")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <section aria-label={t("extreview.entry.title")} className="rounded-3xl border border-accent/30 bg-card p-5">
          <h2 className="text-sm font-black">{t("extreview.entry.title")}</h2>
          <p className="mt-1.5 text-xs leading-6 text-fg-2">{t("extreview.entry.noSignup")}</p>
          <ol className="mt-3 grid gap-2 text-xs font-semibold text-fg-2 sm:grid-cols-3">
            <li className="rounded-xl border border-line bg-panel px-3 py-2.5">1. {t("extreview.entry.step1")}</li>
            <li className="rounded-xl border border-line bg-panel px-3 py-2.5">2. {t("extreview.entry.step2")}</li>
            <li className="rounded-xl border border-line bg-panel px-3 py-2.5">3. {t("extreview.entry.step3")}</li>
          </ol>
          {needsConnectionFallback(connectionKind) ? (
            <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-5 text-fg">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
              <p>{connectionKind === "offline" ? t("extreview.connection.offline") : t("extreview.connection.slow")}</p>
            </div>
          ) : null}
          {draftRestored ? <p role="status" className="mt-3 text-xs font-semibold text-accent">{t("extreview.draft.restored")}</p> : null}
        </section>
      </div>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <section aria-label={t("extreview.submissions.label")} className="space-y-4">
          {view.submissions.map((submission, index) => (
            <article key={submission.id} className="relative overflow-hidden rounded-3xl border border-line bg-card p-5 sm:p-6">
              {view.review.watermark ? (
                <div className="pointer-events-none absolute -right-10 top-8 rotate-12 text-5xl font-black text-fg-3" aria-hidden="true">REVIEW</div>
              ) : null}
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><FileCheck2 className="size-5" aria-hidden="true" /></span>
                    <div><p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-fg-3">{t("extreview.submission.n", { n: index + 1 })}</p><h2 className="mt-1 text-base font-black">{submission.deliverable?.type ?? t("extreview.submission.noDeliverable")}</h2></div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold ${submissionStatusTone(submission.status)}`}>{submissionStatusLabel(t, submission.status)}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-panel p-3"><dt className="text-fg-3">Revision</dt><dd className="mt-1 font-bold">{submission.revisionRef.lineage} r{submission.revisionRef.revision}</dd></div>
                  <div className="rounded-xl border border-line bg-panel p-3"><dt className="text-fg-3">{t("extreview.submission.format")}</dt><dd className="mt-1 font-bold">{submission.deliverable?.expectedFormat ?? t("extreview.submission.noFormat")}</dd></div>
                  <div className="rounded-xl border border-line bg-panel p-3"><dt className="text-fg-3">{t("extreview.submission.submittedAt")}</dt><dd className="mt-1 font-bold">{formatDate(submission.submittedAt)}</dd></div>
                </dl>
                {submission.deliverable?.completionCriteria.length ? (
                  <div className="mt-4 rounded-xl border border-line bg-panel p-4"><p className="text-xs font-black">{t("extreview.submission.criteria")}</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">{submission.deliverable.completionCriteria.map((criterion, criterionIndex) => <li key={`${criterion}-${criterionIndex}`} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" /><span>{criterion}</span></li>)}</ul></div>
                ) : null}
                {submission.evidenceRefs.length ? (
                  <div className="mt-4"><p className="text-xs font-black">{t("extreview.submission.evidence")}</p>
                    {submission.evidenceRefs.some(isImageUrl) ? <div className="mt-2">
                      {/* 미리보기와 원본을 분리한다 — 격자 안은 검수용 미리보기, 원본은 명시 동작으로만 연다. */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.625rem] font-black text-fg-2">{t("extreview.evidence.previewLabel")}</span>
                        <span className="text-[0.625rem] text-fg-3">{t("extreview.evidence.previewNote")}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {submission.evidenceRefs.filter(isImageUrl).map((reference, imageIndex) => (
                        <a key={`${reference}-${imageIndex}`} href={reference} target="_blank" rel="noopener noreferrer"
                          className="group overflow-hidden rounded-xl border border-line bg-panel" aria-label={t("extreview.evidence.openOriginal", { n: imageIndex + 1 })}>
                          <EvidenceImage reference={reference} index={imageIndex} />
                          <span className="flex items-center justify-center gap-1 px-2 py-1.5 text-[0.625rem] font-bold text-accent">{t("extreview.evidence.originalLabel")} <ExternalLink className="size-3" aria-hidden="true" /></span>
                        </a>
                      ))}
                      </div>
                    </div> : null}
                    {submission.evidenceRefs.some((reference) => !isImageUrl(reference)) ? <div className="mt-2 flex flex-wrap gap-2">{submission.evidenceRefs.filter((reference) => !isImageUrl(reference)).map((reference, refIndex) => isWebUrl(reference) ? <a key={`${reference}-${refIndex}`} href={reference} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>{t("extreview.evidence.open")} <ExternalLink className="size-3.5" aria-hidden="true" /></a> : <span key={`${reference}-${refIndex}`} className="rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[0.6875rem] text-fg-2">{reference}</span>)}</div> : null}
                  </div>
                ) : null}
                {submission.protectedEvidenceCount > 0 ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-panel p-3 text-xs leading-5 text-fg-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />
                    <p>{t("extreview.protected", { n: submission.protectedEvidenceCount })}</p>
                  </div>
                ) : null}
                <p className="mt-4 text-[0.625rem] text-fg-3">{t("extreview.submission.digest")} <span className="break-all font-mono" title={submission.revisionRef.digest}>{submission.revisionRef.digest.slice(0, 24)}…</span></p>
              </div>
            </article>
          ))}
          {view.submissions.length === 0 ? (
            <EmptyTeach
              icon={FileCheck2}
              title={t("extreview.empty.title")}
              desc={t("extreview.empty.desc")}
            />
          ) : null}
          </section>

          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
            <h2 className="text-base font-black">{t("extreview.responses.title")}</h2>
            {view.review.responses.length > 0 ? (
              <div className="mt-3">
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-fg-3">
                  <Search className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t("extreview.search.label")}</span>
                  <input
                    className="w-full bg-transparent text-sm text-fg outline-none"
                    value={responseQuery}
                    onChange={(event) => setResponseQuery(event.target.value)}
                    placeholder={t("extreview.search.placeholder")}
                  />
                </label>
                {responseTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {responseTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setResponseQuery(`#${tag}`)}
                        className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold", responseQuery === `#${tag}` ? "border-accent/40 bg-accent-soft text-accent" : "border-line bg-panel text-fg-2")}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 text-[0.625rem] text-fg-3">{t("extreview.search.count", { n: visibleResponses.length })}</p>
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              {visibleResponses.map((response) => (
                <article key={response.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black">{response.reviewerName}</p><span className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold", decisionTone(response.decision))}>{decisionLabel(t, response.decision)}</span></div>
                  {response.note ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-fg-2">{response.note}</p> : null}
                  <p className="mt-2 text-[0.625rem] text-fg-3">{formatDate(response.createdAt)}</p>
                </article>
              ))}
              {view.review.responses.length === 0 ? <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">{t("extreview.responses.empty")}</p> : null}
              {view.review.responses.length > 0 && visibleResponses.length === 0 ? <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">{t("extreview.search.noResults")}</p> : null}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          {allowedDecisions.length === 0 ? (
            <div className="rounded-3xl border border-line bg-card p-5">
              <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-accent" aria-hidden="true" /><h2 className="text-base font-black">{t("extreview.readonly.title")}</h2></div>
              <p className="mt-3 text-xs leading-6 text-fg-2">{t("extreview.readonly.desc")}</p>
            </div>
          ) : (
          <form onSubmit={(event) => void submit(event)} className="rounded-3xl border border-accent/30 bg-card p-5">
            {/* 제출 중에는 입력 전체를 잠근다 — 성공 처리의 입력 초기화가 제출 중 새로 쓴 의견을 지우지 않게. */}
            <fieldset disabled={submitting || expired} className="contents">
            <div className="flex items-center gap-2"><MessageSquareText className="size-5 text-accent" aria-hidden="true" /><h2 className="text-base font-black">{t("extreview.form.title")}</h2></div>
            {expired ? <div role="alert" className="mt-3 rounded-lg border border-bad/35 bg-bad/10 p-3 text-xs text-fg">{t("extreview.form.expired")}</div> : null}
            <label className="mt-4 block text-xs font-semibold text-fg-2">{t("extreview.form.name")}<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} autoComplete="name" /></label>
            <fieldset className="mt-4"><legend className="text-xs font-semibold text-fg-2">{t("extreview.form.decision")}</legend><div className="mt-2 grid gap-2">{allowedDecisions.map((value) => <label key={value} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold", decision === value ? decisionTone(value) : "border-line bg-panel text-fg-2")}><input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />{decisionLabel(t, value)}</label>)}</div></fieldset>
            <label className="mt-4 block text-xs font-semibold text-fg-2">{t("extreview.form.note")}<textarea className="mt-1.5 min-h-32 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg" value={note} onChange={(event) => setNote(event.target.value)} placeholder={decision === "approve" ? t("extreview.form.notePlaceholderApprove") : t("extreview.form.notePlaceholderOther")} /></label>
            {success ? <div role="status" className="mt-3 rounded-lg border border-good/35 bg-good/10 p-3 text-xs text-fg">{success}</div> : null}
            {error ? <div role="alert" className="mt-3 rounded-lg border border-bad/35 bg-bad/10 p-3 text-xs text-fg">{error}</div> : null}
            <button type="submit" className={cn(buttonClass(), "mt-4 w-full")} disabled={submitting}>{submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="size-4" aria-hidden="true" />}{submitting ? t("extreview.form.submitting") : t("extreview.form.record", { decision: decisionLabel(t, decision) })}</button>
            <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">{t("extreview.form.auditNote")}</p>
            </fieldset>
          </form>
          )}
        </aside>
      </div>
    </div>
  );
}
