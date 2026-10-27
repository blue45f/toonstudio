import {
  AlertTriangle,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Eye,
  FolderHeart,
  Heart,
  Loader2,
  MessageCircle,
  PenLine,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthModal } from "@/domains/auth/public/account-auth-modal";
import { listWorks, type WorkSummary } from "@/platform/creator-client";
import { CoverImage } from "@/shared/components/cover-image";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  creatorRoleDefinition,
  creatorText,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { useT } from "@/shared/lib/i18n";
import {
  formatI18nTemplate,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useApp, useHydrated } from "@/shared/lib/store";
import { cn, formatCount, relativeDate } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("AccountPage", ko, en);

// ── 로그아웃 상태 안내 ──────────────────────────────
export function SignInPrompt() {
  const [modal, setModal] = useState(false);
  const t = useT();
  return (
    <Container size="prose" className="py-10 sm:py-16">
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-line bg-gradient-to-b from-card/55 to-panel/30 p-8 text-center sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-2 h-28 w-28 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 30%, transparent), transparent 70%)" }}
        />
        <span className="pf-glow relative mx-auto mb-3 grid size-12 place-items-center rounded-2xl border border-accent/30 bg-accent-soft/60 text-accent">
          <UserRound size={24} />
        </span>
        <h1 className="relative text-lg font-bold text-fg">{t("account.signIn.title")}</h1>
        <p className="relative mt-1.5 text-sm leading-relaxed text-fg-2">
          {t("account.signIn.message")}
        </p>
        <button
          type="button"
          onClick={() => setModal(true)}
          className={buttonClass({ variant: "solid", className: "relative mt-5 gap-1.5" })}
        >
          <UserRound size={16} />
          {t("account.signIn.cta")}
        </button>
      </div>
      {modal && <AuthModal onClose={() => setModal(false)} />}
    </Container>
  );
}

// ── 내 게시물(창작물) 그리드 ───────────────────────────
function PostCard({ work }: { work: WorkSummary }) {
  return (
    <Link
      href={formatI18nTemplate(translateCurrentStaticSourceText("domains.account.AccountPage", "en", "/showcase/work/{v0}"), { v0: String(work.id) })}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel/30 transition-colors hover:border-line-strong"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-raised/40">
        <CoverImage
          src={work.cover}
          alt={work.title}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          fallback={
            <span className="grid h-full w-full place-items-center bg-gradient-to-br from-raised to-card text-fg-3">
              <PenLine size={28} />
            </span>
          }
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-fg group-hover:text-accent">
          {work.title}
        </h3>
        <div className="mt-auto flex items-center gap-3 pt-1.5 text-[0.72rem] text-fg-3">
          <span className="inline-flex items-center gap-1">
            <Heart size={12} className={cn(work.liked && "fill-accent text-accent")} />
            <span className="numeral">{formatCount(work.likes)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} />
            <span className="numeral">{formatCount(work.comments)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye size={12} />
            <span className="numeral">{formatCount(work.views)}</span>
          </span>
          <span className="ml-auto shrink-0">{relativeDate(work.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export function PostsTab({ userId }: { userId: string }) {
  const t = useT();
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listWorks({ userId }, controller.signal)
      .then((result) => {
        if (alive) setWorks(result);
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : t("account.posts.errorTitle"));
        setWorks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId, reloadKey, t]);

  if (error) {
    return (
      <ErrorState
        title={t("account.posts.errorTitle")}
        message={error}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel/30">
            <span className="skeleton block aspect-[3/4]" />
            <div className="space-y-2 p-3">
              <span className="skeleton block h-4 w-full" />
              <span className="skeleton block h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (works.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <img
          src="/images/empty-library.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="mx-auto mb-4 h-28 w-full max-w-xs rounded-2xl border border-line/60 object-cover"
        />
        <PenLine size={26} className="mx-auto mb-3 text-fg-3" />
        <p className="text-sm font-medium text-fg">{t("account.posts.emptyTitle")}</p>
        <p className="mt-1 text-xs text-fg-3">{t("account.posts.emptyMessage")}</p>
        <Link
          href="/studio"
          className={buttonClass({ size: "sm", variant: "outline", className: "mt-4 gap-1.5" })}
        >
          <PenLine size={14} />
          {t("account.posts.cta")}
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {works.map((work) => (
        <PostCard key={work.id} work={work} />
      ))}
    </div>
  );
}

// ── 내 활동(로컬 스토어 요약) ───────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel/40 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-fg numeral">{value}</p>
        <p className="mt-1 text-xs text-fg-3">{label}</p>
      </div>
    </div>
  );
}

export function ActivityTab() {
  const t = useT();
  const hydrated = useHydrated();
  const reviews = useApp((s) => s.reviews);
  const reads = useApp((s) => s.reads);
  const collections = useApp((s) => s.collections);

  if (!hydrated) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="skeleton block h-[4.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  const reviewCount = Object.keys(reviews).length;
  const readEntries = Object.entries(reads);
  const wantCount = readEntries.filter(([, s]) => s === "want").length;
  const readingCount = readEntries.filter(([, s]) => s === "reading").length;
  const doneCount = readEntries.filter(([, s]) => s === "done").length;
  const collectionCount = collections.length;

  // 최근 리뷰(createdAt 기준 내림차순) — 작품 메타가 로컬에 없어 titleId로 상세 링크만 제공.
  const recentReviews = Object.values(reviews)
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 6);

  const empty =
    reviewCount === 0 && wantCount === 0 && readingCount === 0 && doneCount === 0 && collectionCount === 0;

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <img
          src="/images/empty-generic.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="mx-auto mb-4 h-28 w-full max-w-xs rounded-2xl border border-line/60 object-cover"
        />
        <Star size={26} className="mx-auto mb-3 text-fg-3" />
        <p className="text-sm font-medium text-fg">{t("account.activity.emptyTitle")}</p>
        <p className="mt-1 text-xs text-fg-3">{t("account.activity.emptyMessage")}</p>
        <Link
          href="/ranking"
          className={buttonClass({ size: "sm", variant: "outline", className: "mt-4 gap-1.5" })}
        >
          {t("account.activity.viewTitlesCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Star} label={t("account.activity.stat.reviews")} value={reviewCount} />
        <StatCard icon={Bookmark} label={t("account.activity.stat.want")} value={wantCount} />
        <StatCard icon={BookOpen} label={t("account.activity.stat.reading")} value={readingCount} />
        <StatCard icon={CheckCircle2} label={t("account.activity.stat.done")} value={doneCount} />
        <StatCard icon={FolderHeart} label={t("account.activity.stat.collections")} value={collectionCount} />
      </div>

      {recentReviews.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-fg-3">
            {t("account.activity.recentReviewsTitle")}
          </h2>
          <ul className="space-y-2">
            {recentReviews.map((review) => (
              <li key={review.titleId}>
                <Link
                  href={formatI18nTemplate(translateCurrentStaticSourceText("domains.account.AccountPage", "en", "/title/{v0}"), { v0: String(review.titleId) })}
                  className="flex items-start gap-3 rounded-xl border border-line bg-panel/30 p-3 transition-colors hover:border-line-strong"
                >
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                    <Star size={12} className="fill-accent" />
                    {review.rating.toFixed(1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-fg-2">
                      {review.text || `(${t("account.activity.recentNoText")})`}
                    </p>
                    {review.createdAt && (
                      <p className="mt-1 text-[0.7rem] text-fg-3">{relativeDate(review.createdAt)}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[0.72rem] leading-relaxed text-fg-3">
        {t("account.activity.storageHint").split("{link}")[0]}
        <Link href="/library" className="text-accent underline-offset-2 hover:underline">
          {t("route.library")}
        </Link>
        {t("account.activity.storageHint").split("{link}")[1]}
      </p>
    </div>
  );
}

// ── 공개 프로필 미리보기 ─────────────────────────
// 저장 전 입력값이 다른 사용자에게 어떻게 보이는지 실시간으로 보여준다.
export function ProfilePreview({
  name,
  bio,
  image,
  fallbackInitial,
  creatorRoleProfile,
  dirty,
  userId,
}: {
  name: string;
  bio: string;
  image: string | null;
  fallbackInitial: string;
  creatorRoleProfile: CreatorRoleProfile;
  dirty: boolean;
  userId: string | null;
}) {
  const locale = getActiveI18nLocale();
  const primaryRole = creatorRoleDefinition(creatorRoleProfile.primaryRole);
  return (
    <section
      aria-labelledby="profile-preview-title"
      className="overflow-hidden rounded-2xl border border-line bg-panel/40"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
        <h2 id="profile-preview-title" className="text-sm font-semibold text-fg">
          {bi("공개 프로필 미리보기", "Public profile preview")}
        </h2>
        {dirty ? (
          <span className="inline-flex min-h-7 items-center rounded-full border border-warn/40 bg-warn/10 px-2.5 text-[0.7rem] font-bold text-warn">
            {bi("저장 전", "Unsaved changes")}
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {image ? (
            <img
              src={image}
              alt=""
              className="size-12 shrink-0 rounded-full border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent"
            >
              {fallbackInitial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-fg">
              {name.trim() || bi("이름을 입력해 주세요", "Enter a display name")}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-fg-2">
              {bio.trim() || bi("소개가 아직 없어요", "No bio yet")}
            </p>
          </div>
        </div>
        {creatorRoleProfile.roleVisibility && primaryRole ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex min-h-7 items-center rounded-full border border-accent/35 bg-accent-soft px-2.5 text-xs font-bold text-accent">
              {creatorText(primaryRole.label, locale)}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[0.72rem] leading-5 text-fg-3">
            {bi(
              "직무 정보는 공개 프로필에 표시되지 않아요.",
              "Role information is hidden from the public profile.",
            )}
          </p>
        )}
        <p className="mt-3 text-[0.72rem] leading-5 text-fg-3">
          {bi(
            "다른 사용자에게는 이렇게 보여요. 저장하기 전에는 반영되지 않아요.",
            "This is how other users see you. Changes apply after saving.",
          )}
        </p>
        {userId ? (
          <Link
            href={`/u/${encodeURIComponent(userId)}`}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            {bi("공개 프로필 열기", "View public profile")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

// ── 계정 탈퇴 확인 다이얼로그 ──────────────────────
// window.confirm 대신 포커스 관리가 되는 인페이지 모달을 사용한다.
export function DeleteAccountDialog({
  open,
  deleting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("settings.data.cancel")}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-canvas/80 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-desc"
        className="relative w-full max-w-md rounded-2xl border border-bad/30 bg-panel p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bad/10 text-bad">
            <AlertTriangle size={20} aria-hidden />
          </span>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("settings.data.cancel")}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <h2 id="delete-account-title" className="mt-4 text-lg font-bold text-fg">
          {t("account.profile.deleteTitle")}
        </h2>
        <p id="delete-account-desc" className="mt-2 text-sm leading-6 text-fg-2">
          {t("account.profile.confirmDelete")}
        </p>
        <p className="mt-2 text-sm leading-6 text-fg-2">{t("account.profile.deleteDesc")}</p>
        <p className="mt-3 rounded-xl border border-bad/30 bg-bad/5 px-3.5 py-2.5 text-xs font-semibold leading-5 text-bad">
          {bi("탈퇴 후에는 계정을 복구할 수 없어요.", "You cannot recover your account after deletion.")}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised disabled:opacity-50"
          >
            {t("settings.data.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-bad px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Trash2 size={16} aria-hidden />}
            {deleting ? t("account.profile.deleting") : t("account.profile.deleteTitle")}
          </button>
        </div>
      </div>
    </div>
  );
}
