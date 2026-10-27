import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Heart,
  Layers,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  Settings2,
  Trash2,
  Trophy,
  WandSparkles,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  buildCreatorReaderManagementHref,
  buildCreatorPublicReaderPreviewHref,
  resolveCreatorReaderPreviewMode,
} from "./creator-public-reader-preview";
import { SERIES_STATUS_LABEL } from "./creator-community-utils";
import { frozenStatus3Text } from "./studio-frozen3-status-i18n";
import { resolveCreatorPublicationReaderPolicy } from "./creator-publication-reader";
import { useCreatorPublicationPageMeta } from "./creator-publication-page-meta";
import {
  CREATOR_COMMUNITY_KIND_LABEL,
  CREATOR_COMMUNITY_PROVENANCE_LABEL,
} from "./creator-community-labels";
import {
  CreatorCommunityPublicationPanel,
  CreatorWorkReportControl,
} from "./CreatorCommunityPublicationPanel";
import {
  WorkComments,
  WorkCommunityPanel,
  WorkInspector,
} from "./CreateWorkPageSections";
import { CreatorWorkRightsAside } from "./ai-training-consent/CreatorWorkRightsAside";
import { PublishedWorkReader } from "./PublishedWorkReader";
import {
  creatorProfileHref,
  creatorSeriesHref,
  creatorWorkHref,
  SHOWCASE_HOME_PATH,
  showcaseChallengeHref,
  showcaseGalleryHref,
} from "./publishing/showcase-links";
import { buildStudioHref } from "./creator-studio-links";
import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDeleteWorkRequest } from "./studio-destructive-command-catalog";
import { readWorkFx } from "./studio-motion-fx";
import { StudioDestructiveConfirmHost } from "./StudioDestructiveConfirmHost";
import { WorkFxPanel } from "./WorkFxPanel";
import { spatialShowcaseObjects } from "./spatial-showcase-placement";

import { CoverImage } from "@/shared/components/cover-image";
import { Container } from "@/shared/components/section";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  canShareCreatorWork,
  compactPublicShareDescription,
  publicShareImageUrl,
} from "@/shared/lib/public-share-policy";
import { resolveCreatorCommunityAiTraining } from "@/shared/lib/creator-community-publication-contract";
import { readCreatorPublicationSource } from "@toonstudio/contracts/creator-publication-integrity";
import { useApp } from "@/shared/lib/store";
import { cn, formatCount, relativeDate } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { NotFoundPage } from "@/shared/components/feedback/NotFoundPage";
import { StudioPageIntro } from "./page-intro/StudioPageIntro";
import {
  deleteWork,
  getWork,
  toggleWorkBookmark,
  toggleWorkLike,
  type WorkDetail,
} from "@/platform/creator-client";

const SharePageButton = lazy(async () => {
  const module = await import("@/shared/components/share-page-button");
  return { default: module.SharePageButton };
});

// 모션툰 영상(WebM) 내보내기 패널 — 작성자에게만 보이므로 녹화 엔진 청크를 지연 로드한다.
const StudioMotionExportPanel = lazy(() =>
  import("./StudioMotionExportPanel").then((mod) => ({ default: mod.StudioMotionExportPanel }))
);

export function CreateWorkPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewSearch = searchParams.toString();
  const { readerView, publicPreview } = useMemo(
    () => resolveCreatorReaderPreviewMode(previewSearch),
    [previewSearch],
  );
  const userId = useApp((s) => s.userId);
  const interactionUserId = publicPreview ? null : userId;

  const [work, setWork] = useState<WorkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const publicationPolicy = useMemo(
    () => resolveCreatorPublicationReaderPolicy(work?.doc),
    [work?.doc],
  );
  const shareable = work ? canShareCreatorWork(work, publicationPolicy.directive) : false;
  const publicCanonicalSlug =
    publicationPolicy.directive.visibility === "public"
      ? publicationPolicy.directive.canonicalSlug.trim()
      : "";
  const sharePath = work ? creatorWorkHref(publicCanonicalSlug || work.id) : SHOWCASE_HOME_PATH;
  const shareTitle = publicationPolicy.directive.socialTitle.trim() || work?.title || "창작 작품";
  const shareDescription = compactPublicShareDescription(
    publicationPolicy.directive.socialDescription || work?.description,
    work
      ? `${work.author.name} 창작자의 ${work.title} 작품을 감상해 보세요.`
      : "툰스튜디오 창작 게시판의 작품을 감상해 보세요.",
  );
  const shareImage = publicShareImageUrl(work?.cover);
  const publicationSource = useMemo(
    () => readCreatorPublicationSource(work?.doc),
    [work?.doc],
  );
  const sessionOwnsWork = Boolean(userId && work?.author.id === userId);
  const ownerControlsVisible = Boolean(work?.isOwner && !readerView);

  useCreatorPublicationPageMeta({
    workId: work?.id ?? id ?? null,
    title: work?.title ?? null,
    description: work?.description ?? null,
    cover: work?.cover ?? null,
    authorName: work?.author.name ?? null,
    createdAt: work?.createdAt ?? null,
    status: work?.status ?? null,
    directive: work ? publicationPolicy.directive : null,
  });

  useEffect(() => {
    if (!work || !id || !publicCanonicalSlug || id === publicCanonicalSlug) return;
    const query = previewSearch ? `?${previewSearch}` : "";
    navigate(`${creatorWorkHref(publicCanonicalSlug)}${query}`, { replace: true });
  }, [id, navigate, previewSearch, publicCanonicalSlug, work]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);
    getWork(id, controller.signal, { publicPreview })
      .then((result) => {
        if (alive) setWork(result);
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : frozenStatus3Text("studio.frozenStatus3.work.workLoadFailed", "창작물을 불러오지 못했습니다.");
        if (/\(404\)/.test(message)) setNotFound(true);
        else setError(message);
        setWork(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [id, publicPreview, reloadKey]);

  async function onToggleLike() {
    if (!work || !interactionUserId || liking) return;
    setLiking(true);
    setActionError(null);
    // 낙관적 토글 — 실패하면 서버 응답이 아닌 이전 상태로 되돌린다.
    const prev = { liked: work.liked, likes: work.likes };
    setWork({ ...work, liked: !prev.liked, likes: prev.likes + (prev.liked ? -1 : 1) });
    try {
      const result = await toggleWorkLike(work.id);
      setWork((current) => (current ? { ...current, liked: result.liked, likes: result.likes } : current));
    } catch (err) {
      setWork((current) => (current ? { ...current, ...prev } : current));
      setActionError(err instanceof Error ? err.message : frozenStatus3Text("studio.frozenStatus3.work.likeFailed", "좋아요를 처리하지 못했습니다."));
    } finally {
      setLiking(false);
    }
  }

  async function onToggleBookmark() {
    if (!work || !interactionUserId || bookmarking) return;
    setBookmarking(true);
    setActionError(null);
    const previous = {
      bookmarked: Boolean(work.bookmarked),
      bookmarks: work.bookmarks ?? 0,
    };
    setWork({
      ...work,
      bookmarked: !previous.bookmarked,
      bookmarks: Math.max(0, previous.bookmarks + (previous.bookmarked ? -1 : 1)),
    });
    try {
      const result = await toggleWorkBookmark(work.id);
      setWork((current) => current ? { ...current, ...result } : current);
    } catch (caught) {
      setWork((current) => current ? { ...current, ...previous } : current);
      setActionError(caught instanceof Error ? caught.message : frozenStatus3Text("studio.frozenStatus3.work.bookmarkFailed", "북마크를 처리하지 못했습니다."));
    } finally {
      setBookmarking(false);
    }
  }

  async function onDelete() {
    if (!work || deleting) return;
    if (!(await confirmStudioDestructiveAction(studioDeleteWorkRequest(work.title || "이 창작물")))) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteWork(work.id);
      navigate(SHOWCASE_HOME_PATH, { replace: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : frozenStatus3Text("studio.frozenStatus3.work.deleteFailed", "창작물을 삭제하지 못했습니다."));
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <Container size="prose" className="py-10">
        <div className="skeleton mb-4 h-7 w-2/3" />
        <div className="skeleton mb-6 h-4 w-1/3" />
        <div className="space-y-3">
          <span className="skeleton block aspect-[3/4] rounded-2xl" />
          <span className="skeleton block aspect-[3/4] rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (notFound || (!work && !error)) {
    return <NotFoundPage />;
  }

  if (error || !work) {
    return (
      <Container size="prose" className="py-10">
        <ErrorState
          title={translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "창작물을 불러오지 못했습니다.")}
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      </Container>
    );
  }

  return (
    <Container size="prose" className="py-8 lg:py-10">
      {/* 스튜디오 밖 라우트에도 승인 표면을 둔다 — 없으면 네이티브 confirm 으로 떨어진다. */}
      <StudioDestructiveConfirmHost />
      {!readerView ? <CampusObjectSource objects={spatialShowcaseObjects([work])} /> : null}
      <Link
        href={SHOWCASE_HOME_PATH}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 text-sm text-fg-2 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft size={15} aria-hidden />
        {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "창작 갤러리")}</Link>

      {readerView ? (
        <section
          role="status"
          data-public-reader-preview={publicPreview ? "anonymous" : "reader"}
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/35 bg-accent-soft/20 px-4 py-3 text-sm text-fg-2"
        >
          <Eye size={17} className="shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-fg">
              {publicPreview ? frozenStatus3Text("studio.frozenStatus3.work.readerChecking", "실제 비로그인 독자 응답으로 확인 중") : "독자 집중 보기"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
              {publicPreview
                ? "현재 로그인 세션을 서버 조회에서 제외해 공개 범위와 익명 독자 화면을 그대로 검증합니다."
                : "창작자 관리 도구와 공간 지도를 접고 작품 감상 흐름만 표시합니다."}
            </p>
          </div>
          {sessionOwnsWork ? (
            <Link
              href={buildCreatorReaderManagementHref(work.id)}
              className={buttonClass({ size: "sm", variant: "outline", className: "min-h-11 gap-1.5" })}
            >
              <Settings2 size={14} aria-hidden />
              관리 보기로 돌아가기
            </Link>
          ) : null}
        </section>
      ) : null}

      <header className="mb-6">
        {/* 리믹스 원작 정보 배지 */}
        {work.remixFromId && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-line bg-raised/50 px-2.5 py-1.5 text-xs text-fg-2 border-solid">
            <span className="font-semibold text-accent flex items-center gap-1">
              <WandSparkles size={13} />
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "en", "Remix")}</span>
            <span>{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "이 작품은 원작")}</span>
            <Link href={creatorWorkHref(work.remixFromId)} className="font-semibold text-fg hover:text-accent hover:underline">
              {work.remixFromTitle || translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "원본 작품")}
            </Link>
            <span>{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "의 리믹스 버전입니다.")}</span>
          </div>
        )}
        {/* 연재 시리즈 배지 — 시리즈 상세로 이동 */}
        {work.series && (
          <Link
            href={creatorSeriesHref(work.series.id)}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-cool/40 bg-[oklch(0.8_0.11_232/0.1)] px-2.5 py-1 text-xs font-medium text-cool transition-colors hover:border-cool/70"
          >
            <Layers size={12} />
            {work.series.title}
            {work.episodeNo != null && <span className="numeral">· {work.episodeNo}{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "화")}</span>}
            {work.series.status !== "ongoing" && (
              <span className="text-xs opacity-80">
                ({SERIES_STATUS_LABEL[work.series.status]})
              </span>
            )}
          </Link>
        )}
        <h1 className="text-pretty text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {work.title}
        </h1>
        <StudioPageIntro motif="cards" className="mt-1" />
        {work.community && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2">
              {CREATOR_COMMUNITY_KIND_LABEL[work.community.kind]}
            </span>
            <span className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              work.community.provenance === "human"
                ? "border-line bg-card text-fg-2"
                : "border-cool/40 bg-[oklch(0.8_0.11_232/0.1)] text-cool",
            )}>
              {CREATOR_COMMUNITY_PROVENANCE_LABEL[work.community.provenance]}
            </span>
            {work.community.portfolio && (
              <span className="rounded-full border border-accent/35 bg-accent-soft/30 px-2.5 py-1 text-xs font-medium text-accent">
                {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "포트폴리오 · 전시")}</span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2.5">
          <span className="size-9 shrink-0 overflow-hidden rounded-full bg-raised ring-1 ring-line">
            {work.author.avatar ? (
              <CoverImage
                src={work.author.avatar}
                alt=""
                className="h-full w-full object-cover"
                fallback={<span className="block h-full w-full bg-raised" />}
              />
            ) : (
              <span className="block h-full w-full bg-raised" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            {work.author.id ? (
              <Link
                href={creatorProfileHref(work.author.id)}
                className="block truncate text-sm font-medium text-fg transition-colors hover:text-accent"
              >
                {work.author.name}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium text-fg">{work.author.name}</p>
            )}
            <p className="text-xs text-fg-3">{relativeDate(work.createdAt)}</p>
          </div>
        </div>

        {work.description && (
          <p className="mt-4 whitespace-pre-wrap text-pretty text-sm leading-relaxed text-fg-2">
            {work.description}
          </p>
        )}

        {(work.community || publicationSource) && (
          <CreatorWorkRightsAside community={work.community} source={publicationSource} />
        )}

        {work.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {work.tags.map((tag) => (
              <Link
                key={tag}
                href={showcaseGalleryHref({ tag })}
                className="inline-flex h-8 items-center rounded-full border border-line bg-card px-3 text-xs text-fg-2 pointer-coarse:h-11 transition-colors hover:border-accent/50 hover:text-accent"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {work.titleId && (
            <Link
              href={`/title/${encodeURIComponent(work.titleId)}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Link2 size={14} className="text-accent" />
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "연관 웹툰 보러 가기")}</Link>
          )}
          {/* 챌린지 참여 배지 — 챌린지 페이지로 이동 */}
          {work.challenge && (
            <Link
              href={showcaseChallengeHref(work.challenge.slug)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft/40 px-3 py-2 text-xs text-accent transition-colors hover:bg-accent-soft"
            >
              <Trophy size={14} />
              {work.challenge.title} {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "챌린지 참여작")}</Link>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={onToggleLike}
            disabled={!interactionUserId || liking}
            aria-pressed={work.liked}
            aria-label={`좋아요 ${formatCount(work.likes)}개`}
            title={interactionUserId ? undefined : translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "비로그인 독자 보기에서는 로그인 상호작용을 사용하지 않습니다.")}
            className={buttonClass({
              size: "sm",
              variant: work.liked ? "solid" : "outline",
              className: "gap-1.5",
            })}
          >
            <Heart size={14} className={cn(work.liked && "fill-current")} />
            <span className="numeral">{formatCount(work.likes)}</span>
          </button>
          <button
            type="button"
            onClick={onToggleBookmark}
            disabled={!interactionUserId || bookmarking}
            aria-pressed={Boolean(work.bookmarked)}
            aria-label={`북마크 ${formatCount(work.bookmarks ?? 0)}개`}
            title={interactionUserId ? undefined : translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "비로그인 독자 보기에서는 로그인 상호작용을 사용하지 않습니다.")}
            className={buttonClass({
              size: "sm",
              variant: work.bookmarked ? "solid" : "outline",
              className: "gap-1.5",
            })}
          >
            <Bookmark size={14} className={cn(work.bookmarked && "fill-current")} />
            <span className="numeral">{formatCount(work.bookmarks ?? 0)}</span>
          </button>
          {shareable && (
            <Suspense fallback={null}>
              <SharePageButton
                path={sharePath}
                text={shareTitle}
                description={shareDescription}
                imageUrl={shareImage}
                label="작품 공유"
                actionLabel="작품 감상하기"
                className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}
              />
            </Suspense>
          )}
          <span
            className="inline-flex items-center gap-1.5 text-xs text-fg-3"
            aria-label={`조회 ${formatCount(work.views)}회`}
          >
            <Eye size={14} aria-hidden />
            <span className="numeral">{formatCount(work.views)}</span> {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "조회")}</span>

          {publicationPolicy.remixAllowed && !readerView ? (
            <Link
              href={buildStudioHref({ remixId: work.id })}
              className={buttonClass({
                size: "sm",
                variant: "outline",
                className: "gap-1.5 border-accent/40 bg-accent-soft/20 text-accent hover:bg-accent-soft/30 ml-2 border-solid",
              })}
            >
              <WandSparkles size={14} />
              <span>{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "이어서 편집 (Remix)")}</span>
            </Link>
          ) : ownerControlsVisible ? (
            <span className="ml-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-3">
              <WandSparkles size={14} aria-hidden />
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "리믹스 비허용")}</span>
          ) : null}

          {!work.isOwner && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {interactionUserId && work.author.id ? (
                <Link
                  href={{
                    pathname: "/messages/new",
                    query: {
                      to: work.author.id,
                      name: work.author.name,
                      contextType: "work",
                      contextId: work.id,
                      contextLabel: work.title,
                    },
                  }}
                  className={buttonClass({
                    size: "sm",
                    variant: "outline",
                    className: "gap-1.5",
                  })}
                >
                  <Mail size={14} />
                  {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "작가에게 문의")}</Link>
              ) : null}
              <CreatorWorkReportControl workId={work.id} authenticated={Boolean(interactionUserId)} />
            </div>
          )}

          {ownerControlsVisible && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Link
                href={buildCreatorPublicReaderPreviewHref(work.id)}
                target="_blank"
                rel="noreferrer"
                className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}
              >
                <ExternalLink size={14} />
                비로그인 독자 보기
              </Link>
              <Link
                href={buildStudioHref({ workId: work.id, mode: work.format === "upload" ? "upload" : null })}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}
              >
                <Pencil size={14} />
                {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "수정")}</Link>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5 text-bad hover:text-bad" })}
              >
                <Trash2 size={14} />
                {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "삭제")}</button>
            </div>
          )}
        </div>

        {actionError && <p className="mt-3 text-xs text-bad">{actionError}</p>}

      </header>

      {/* 게시 계약을 소비하는 독자 보기 — 세로 효과툰 또는 LTR/RTL 페이지 모드 */}
      <PublishedWorkReader
        key={work.id}
        workId={work.id}
        pages={work.pages}
        fx={readWorkFx(work.doc)}
        title={work.title}
        policy={publicationPolicy}
        isOwner={readerView ? false : work.isOwner}
        altText={work.community?.altText ?? ""}
        contentKind={work.community?.kind ?? "webtoon_episode"}
        aiTraining={resolveCreatorCommunityAiTraining(work.community)}
      />

      {ownerControlsVisible ? (
        <details className="mt-6 rounded-2xl border border-line bg-panel/30 p-4 sm:p-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <Settings2 size={16} className="text-accent" aria-hidden />
            창작자 관리 도구
            <span className="ml-auto text-xs font-normal text-fg-3">연재·권리·효과·영상 내보내기</span>
          </summary>
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <WorkCommunityPanel
              work={work}
              onUpdated={(patch) => {
                setWork((current) => (current ? { ...current, ...patch } : current));
                setReloadKey((value) => value + 1);
              }}
            />
            <CreatorCommunityPublicationPanel
              work={work}
              onUpdated={(patch) =>
                setWork((current) => current ? { ...current, ...patch } : current)
              }
            />
            <WorkFxPanel
              work={work}
              onUpdated={(doc, revision) =>
                setWork((current) => current ? { ...current, doc, revision: revision ?? current.revision } : current)
              }
            />
            <Suspense fallback={<div className="skeleton h-10 rounded-xl" aria-hidden />}>
              <StudioMotionExportPanel work={work} />
            </Suspense>
          </div>
        </details>
      ) : null}

      {/* 개체/레이어 탐색기는 관리 보기에서만 노출한다. */}
      {ownerControlsVisible ? <WorkInspector doc={work.doc} /> : null}

      {/* 이 작품을 이어서 그린 리믹스 작품들 */}
      {work.remixedChildren && work.remixedChildren.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-panel/30 p-4 sm:p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg mb-4">
            <WandSparkles size={15} className="text-accent" />
            {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "이 작품을 이어서 그린 리믹스 작품들")}<span className="numeral text-fg-3">{work.remixedChildren.length}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {work.remixedChildren.map((child) => (
              <Link
                key={child.id}
                href={creatorWorkHref(child.id)}
                className="group flex flex-col overflow-hidden rounded-xl border border-line bg-card/60 transition-colors hover:border-line-strong"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-raised/40">
                  <CoverImage
                    src={child.cover}
                    alt={child.title}
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-col gap-1 p-2">
                  <h3 className="line-clamp-1 text-xs font-semibold leading-tight text-fg group-hover:text-accent">
                    {child.title}
                  </h3>
                  <p className="truncate text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "en", "by ")}{child.author.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 시리즈 회차 내비게이션 — 이전화/시리즈 목록/다음화 */}
      {work.series && (
        <nav aria-label={translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "회차 이동")} className="mb-8 grid grid-cols-3 gap-2">
          {work.prevEpisode ? (
            <Link
              href={creatorWorkHref(work.prevEpisode.id)}
              className="group flex min-w-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <ChevronLeft size={15} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "이전화")}</span>
                <span className="block truncate text-xs font-medium">
                  {work.prevEpisode.episodeNo != null && (
                    <span className="numeral">{work.prevEpisode.episodeNo}{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "화 ")}</span>
                  )}
                  {work.prevEpisode.title}
                </span>
              </span>
            </Link>
          ) : (
            <span className="grid place-items-center rounded-xl border border-dashed border-line px-3 py-2.5 text-xs text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "첫 화입니다")}</span>
          )}
          <Link
            href={creatorSeriesHref(work.series.id)}
            className="grid place-items-center rounded-xl border border-line bg-card px-3 py-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
          >
            <span className="inline-flex items-center gap-1">
              <Layers size={13} />
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "회차 목록")}</span>
          </Link>
          {work.nextEpisode ? (
            <Link
              href={creatorWorkHref(work.nextEpisode.id)}
              className="group flex min-w-0 items-center justify-end gap-1.5 rounded-xl border border-line bg-card px-3 py-2.5 text-right text-sm text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <span className="min-w-0">
                <span className="block text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "다음화")}</span>
                <span className="block truncate text-xs font-medium">
                  {work.nextEpisode.episodeNo != null && (
                    <span className="numeral">{work.nextEpisode.episodeNo}{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "화 ")}</span>
                  )}
                  {work.nextEpisode.title}
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0" />
            </Link>
          ) : (
            <span className="grid place-items-center rounded-xl border border-dashed border-line px-3 py-2.5 text-xs text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "최신화입니다")}</span>
          )}
        </nav>
      )}

      {publicationPolicy.commentsAllowed ? (
        <WorkComments workId={work.id} anonymous={publicPreview} />
      ) : (
        <section className="rounded-2xl border border-line bg-panel/30 p-5 text-center">
          <MessageCircle size={18} className="mx-auto text-fg-3" aria-hidden />
          <h2 className="mt-2 text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "댓글이 닫혀 있습니다")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "작가가 이 작품의 댓글을 받지 않도록 게시했습니다.")}</p>
        </section>
      )}
    </Container>
  );
}
