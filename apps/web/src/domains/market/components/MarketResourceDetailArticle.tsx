import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Box,
  CheckCircle2,
  Cpu,
  Download,
  FileJson,
  Heart,
  LogIn,
  ShieldCheck,
  Sliders,
  Sparkles,
  Store,
  Upload,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useMarketDeviceInstall } from "../hooks/use-market-device-install";
import { useMarketFollowedCreators } from "../hooks/use-market-followed-creators";
import { useMarketLibrary } from "../hooks/use-market-library";
import { useMarketRecentlyViewed } from "../hooks/use-market-recently-viewed";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import {
  formatMarketDate,
  marketKindMeta,
  marketLicenseMeta,
} from "../models/market-kind";
import {
  brushPreviewData,
  filterPreviewData,
  palettePreviewData,
  recipePreviewData,
  templatePreviewData,
} from "../models/market-preview";
import { useMarketStudioHandoff } from "../hooks/use-market-studio-handoff";

import { CreatorMarketplaceCloudLibraryAction } from "./CreatorMarketplaceCloudLibraryAction";
import { useMarketGuestLoginNoticeState } from "../hooks/use-market-guest-login-notice";

import { MarketGuestLoginNotice } from "./MarketGuestLoginNotice";
import { CreatorMarketplaceReportAction } from "./CreatorMarketplaceReportAction";
import { Market3dAssetPreview } from "./Market3dAssetPreview";
import { MarketAcquisitionModal } from "./MarketAcquisitionModal";
import { MarketAssetRecipePreview } from "./MarketAssetRecipePreview";
import { MarketBrushPreview } from "./MarketBrushPreview";
import { MarketCommentsSection } from "./MarketCommentsSection";
import { MarketCompareToggle } from "./MarketCompareToggle";
import { MarketDetailLicenseAdvisor } from "./MarketDetailLicenseAdvisor";
import { MarketDetailPackageInspector } from "./MarketDetailPackageInspector";
import { MarketDetailRelatedShelves } from "./MarketDetailRelatedShelves";
import { MarketDetailStickyBar } from "./MarketDetailStickyBar";
import { MarketDetailUsageGuide } from "./MarketDetailUsageGuide";
import { MarketDeviceInstallStatus } from "./MarketDeviceInstallStatus";
import { MarketEditResourceModal } from "./MarketEditResourceModal";
import { MarketFilterPreview } from "./MarketFilterPreview";
import { MarketInstallJourney } from "./MarketInstallJourney";
import { MarketPalettePreview } from "./MarketPalettePreview";
import { MarketResourceCover } from "./MarketResourceCover";
import { MarketResourceReleaseHistory } from "./MarketResourceReleaseHistory";
import { MarketReviewsSection } from "./MarketReviewsSection";
import { MarketScene3dPreview } from "./MarketScene3dPreview";
import { MarketSocialProofBar } from "./MarketSocialProofBar";
import { MarketTemplatePreview } from "./MarketTemplatePreview";
import { MarketWebtoon3dViewerModal } from "./MarketWebtoon3dViewerModal";
import { MarketWebtoonSpecBadge } from "./MarketWebtoonSpecBadge";
import { StaleNoticeBar } from "./StaleNoticeBar";

import {
  MARKET_GUEST_LOGIN_NOTICE_ID,
  marketGuestLoginNoticeDescribedBy,
  shouldInterceptMarketAcquireAsLogin,
} from "../models/market-guest-login-notice";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { SharePageButton } from "@/shared/components/share-page-button";
import { compactPublicShareDescription } from "@/shared/lib/public-share-policy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const ENGINE_LABELS: Record<string, string> = {
  canvas2d: "Canvas 2D",
  webgl2: "WebGL 2",
  webgpu: "WebGPU",
  three: "Three.js",
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-xs text-fg-3">{label}</dt>
      <dd className="min-w-0 max-w-full text-right text-xs font-medium text-fg">{children}</dd>
    </div>
  );
}

function downloadMetadataSnapshot(record: CreatorMarketplaceResourceRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.packageId.replace(/[^a-z0-9._-]+/giu, "-")}-${record.resourceVersion}-metadata-snapshot.json`;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface MarketResourceDetailArticleProps {
  record: CreatorMarketplaceResourceRecord;
  relatedItems: readonly CreatorMarketplaceResourceRecord[];
  publisherItems?: readonly CreatorMarketplaceResourceRecord[];
  staleSavedAt: string | null;
  onRetry: () => void;
}

/** 로딩이 끝난 단건 리소스 본문 — 상태 분기는 페이지가, 렌더는 이 컴포넌트가 맡는다. */
export function MarketResourceDetailArticle({
  record,
  relatedItems,
  publisherItems = [],
  staleSavedAt,
  onRetry,
}: MarketResourceDetailArticleProps) {
  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);
  const palettePreviews = palettePreviewData(record);
  const brushPreviews = brushPreviewData(record);
  const filterPreviews = filterPreviewData(record);
  const templatePreviews = templatePreviewData(record);
  const recipePreviews = recipePreviewData(record);
  const previewItems: readonly { readonly name: string }[] | null = record.kind === "palette"
    ? palettePreviews
    : record.kind === "brush"
      ? brushPreviews
      : record.kind === "filter"
        ? filterPreviews
        : record.kind === "template"
          ? templatePreviews
          : recipePreviews;
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const safePreviewIndex = Math.min(selectedPreviewIndex, Math.max(0, (previewItems?.length ?? 1) - 1));
  const selectedPalette = palettePreviews?.[safePreviewIndex];
  const selectedBrush = brushPreviews?.[safePreviewIndex];
  const selectedFilter = filterPreviews?.[safePreviewIndex];
  const selectedTemplate = templatePreviews?.[safePreviewIndex];
  const selectedRecipe = recipePreviews?.[safePreviewIndex];
  const [currentRecord, setCurrentRecord] = useState(record);
  const deviceInstall = useMarketDeviceInstall(currentRecord);
  const studioHandoff = useMarketStudioHandoff(currentRecord, deviceInstall.state);
  const [viewer3dOpen, setViewer3dOpen] = useState(false);

  const [acquisitionModalOpen, setAcquisitionModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const { isAcquired } = useMarketLibrary();
  const { isWishlisted, toggleWishlist } = useMarketWishlist();
  const { recordRecentlyViewed } = useMarketRecentlyViewed();
  const { isFollowingCreator, toggleFollowCreator } = useMarketFollowedCreators();
  const acquired = isAcquired(currentRecord.id);
  const wishlisted = isWishlisted(currentRecord.id);
  const followingPublisher = isFollowingCreator(record.publisher.id);
  // 게스트 획득 사전 고지(P-3): 획득 버튼 근처 고지와 같은 판정을 공유한다.
  // 게스트의 획득 클릭은 실패할 획득 모달 대신 로그인 절차로 연결한다.
  const guestLoginState = useMarketGuestLoginNoticeState();
  const guestMustLogin = shouldInterceptMarketAcquireAsLogin(guestLoginState);
  const handleAcquireClick = () => {
    if (guestMustLogin) {
      requestAuthModalOpen({
        reason: "protected-action",
        source: "market-resource-library",
        mode: "login",
      });
      return;
    }
    setAcquisitionModalOpen(true);
  };

  useEffect(() => {
    setCurrentRecord(record);
  }, [record]);

  useEffect(() => {
    setSelectedPreviewIndex(0);
  }, [record.id]);

  useEffect(() => {
    recordRecentlyViewed(record);
  }, [record, recordRecentlyViewed]);
  const studioActionLabel = studioHandoff.actionLabel;
  const studioActionSummary = studioHandoff.summary;


  return (
    <article className="mt-6">
      {staleSavedAt ? (
        <StaleNoticeBar
          savedAt={staleSavedAt}
          onRetry={onRetry}
          className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto"
        />
      ) : null}
      <header
        className="relative overflow-hidden rounded-xl border border-line bg-[linear-gradient(140deg,var(--color-card)_0%,var(--color-panel)_60%,var(--color-canvas)_100%)] p-6 text-fg sm:p-8"
      >
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,380px)]">
          <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex min-h-6 items-center rounded-md bg-accent px-2 text-xs font-bold text-on-accent"
          >
            {kind.label}
          </span>
          <span className="inline-flex min-h-6 items-center rounded-md bg-raised px-2 text-xs font-semibold text-fg">
            v{record.resourceVersion}
          </span>
          {record.containsAi ? (
            <span className="inline-flex min-h-6 items-center rounded-md border border-warn/40 bg-raised px-2 text-xs font-semibold text-fg">
              {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "AI 포함")}</span>
          ) : (
            <span className="inline-flex min-h-6 items-center rounded-md border border-good/40 bg-raised px-2 text-xs font-semibold text-fg">
              {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "AI 미포함으로 공개")}</span>
          )}
        </div>

        <h1 className="mt-3 max-w-2xl text-pretty text-2xl font-bold leading-tight text-fg sm:text-3xl">
          {record.name}
        </h1>
        {record.description ? (
          <p className="mt-2.5 max-w-xl text-pretty font-serif text-sm italic leading-relaxed text-fg sm:text-base">
            {record.description}
          </p>
        ) : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <MarketWebtoonSpecBadge
            format={record.entries.length > 0 && record.entries.every((entry) => entry.delivery.mode === "portable-json") ? "portable-json" : undefined}
          />
          {record.kind.startsWith("3d") ? (
            <button
              type="button"
              onClick={() => setViewer3dOpen(true)}
              className="inline-flex min-h-6 items-center gap-1 rounded-md bg-accent/20 border border-accent/40 px-2 text-xs font-bold text-accent hover:bg-accent/30 transition-colors"
            >
              <Box className="size-3" />
              <span>{translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "3D 렌더 모드 예시 보기")}</span>
            </button>
          ) : null}
        </div>
        <MarketSocialProofBar resourceId={currentRecord.id} />
          </div>
          {/* 상세 첫 화면의 주인공은 리소스 자체의 아트다 — 카드와 같은 커버를 큰 무대로 재사용한다. */}
          <div aria-hidden="true" className="group relative aspect-[16/9] overflow-hidden rounded-xl border border-line/70 lg:aspect-[4/3]">
            <MarketResourceCover record={record} />
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Every valid pack entry remains inspectable; selection never changes install policy. */}
          {previewItems && previewItems.length > 0 ? (
            <section aria-label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "패키지 미리보기")}>
              {previewItems.length > 1 ? (
                <div className="mb-2.5 rounded-xl border border-line bg-panel/60 p-2.5">
                  <div
                    role="tablist"
                    aria-label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "미리볼 패키지 항목")}
                    className="flex max-w-full gap-1.5 overflow-x-auto pb-1"
                  >
                    {previewItems.map((item, index) => (
                      <button
                        key={`${item.name}-${index}`}
                        id={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "market-preview-tab-{v0}"), { v0: String(index) })}
                        type="button"
                        role="tab"
                        aria-controls="market-preview-panel"
                        aria-selected={safePreviewIndex === index}
                        tabIndex={safePreviewIndex === index ? 0 : -1}
                        onClick={() => setSelectedPreviewIndex(index)}
                        onKeyDown={(event) => {
                          let nextIndex: number | null = null;
                          if (event.key === "ArrowRight") {
                            nextIndex = (index + 1) % previewItems.length;
                          } else if (event.key === "ArrowLeft") {
                            nextIndex = (index - 1 + previewItems.length) % previewItems.length;
                          } else if (event.key === "Home") {
                            nextIndex = 0;
                          } else if (event.key === "End") {
                            nextIndex = previewItems.length - 1;
                          }
                          if (nextIndex === null) return;
                          event.preventDefault();
                          setSelectedPreviewIndex(nextIndex);
                          const tabList = event.currentTarget.closest('[role="tablist"]');
                          const tabs = tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                          tabs?.[nextIndex]?.focus();
                        }}
                        className={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "min-h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11 {v0}"), { v0: String(safePreviewIndex === index
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg") })}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[0.68rem] leading-relaxed text-fg-3">
                    {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "선택은 상세 미리보기만 바꾸며 Studio 동작은 패키지 적용 정책을 따릅니다.")}</p>
                </div>
              ) : null}

              <div
                id="market-preview-panel"
                role={previewItems.length > 1 ? "tabpanel" : undefined}
                aria-labelledby={previewItems.length > 1 ? formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "market-preview-tab-{v0}"), { v0: String(safePreviewIndex) }) : undefined}
                tabIndex={previewItems.length > 1 ? 0 : undefined}
              >
                {selectedPalette ? (
                  <MarketPalettePreview
                    key={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "palette-{v0}"), { v0: String(safePreviewIndex) })}
                    colors={selectedPalette.colors}
                    paletteName={selectedPalette.name}
                  />
                ) : null}

                {selectedBrush ? (
                  <MarketBrushPreview key={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "brush-{v0}"), { v0: String(safePreviewIndex) })} brush={selectedBrush} />
                ) : null}

                {selectedFilter ? (
                  <MarketFilterPreview key={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "filter-{v0}"), { v0: String(safePreviewIndex) })} filter={selectedFilter} />
                ) : null}

                {selectedTemplate ? (
                  <MarketTemplatePreview key={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "template-{v0}"), { v0: String(safePreviewIndex) })} template={selectedTemplate} />
                ) : null}

                {record.kind === "asset" && selectedRecipe ? (
                  <MarketAssetRecipePreview key={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "asset-{v0}"), { v0: String(safePreviewIndex) })} recipe={selectedRecipe} />
                ) : null}

                {record.kind === "3d-preset" && selectedRecipe ? (
                  <MarketScene3dPreview key={`3d-${safePreviewIndex}`} recipe={selectedRecipe} />
                ) : null}

                {record.kind === "3d-asset" && selectedRecipe ? (
                  <Market3dAssetPreview key={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "3d-asset-{v0}"), { v0: String(safePreviewIndex) })} recipe={selectedRecipe} />
                ) : null}
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-line bg-card p-5" aria-labelledby="market-preview-unavailable-heading">
              <h2 id="market-preview-unavailable-heading" className="text-sm font-semibold text-fg">
                {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "웹 미리보기 없음")}</h2>
              <p className="mt-1 text-xs leading-relaxed text-fg-2">
                {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "이 패키지는 웹에서 재현할 수 있는 미리보기 데이터가 없어요. 실제 결과는 Studio에서 확인해 주세요.")}</p>
            </section>
          )}

          <MarketDetailPackageInspector record={record} />

          <MarketResourceReleaseHistory resourceId={record.id} />

          <MarketDetailUsageGuide kind={record.kind} />

          <MarketDetailLicenseAdvisor record={record} />

          {/* Artist Reviews & Ratings (Real interactive submission & feedback) */}
          <MarketReviewsSection resourceId={currentRecord.id} />

          {/* Q&A Comments & Threaded Replies (Real interactive threaded discussions) */}
          <MarketCommentsSection
            resourceId={currentRecord.id}
            publisherId={currentRecord.publisher.id}
          />

          {/* Tags */}
          {record.tags.length > 0 ? (
            <section aria-label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "태그")}>
              <ul className="flex flex-wrap gap-1.5">
                {record.tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "/market/browse?tag={v0}"), { v0: String(encodeURIComponent(tag)) })}
                      className="inline-flex min-h-6 items-center rounded bg-raised px-2.5 text-xs text-fg-2 transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11 pointer-coarse:px-3"
                    >
                      #{tag}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <MarketDetailRelatedShelves
            record={record}
            relatedItems={relatedItems}
            publisherItems={publisherItems}
          />
        </div>

        <div className="space-y-4 lg:sticky lg:top-[var(--site-header-sticky-offset,5rem)] lg:self-start">
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4">
            <CreatorMarketplaceCloudLibraryAction record={record} />
            <MarketDeviceInstallStatus
              record={currentRecord}
              snapshot={deviceInstall}
            />
            <MarketInstallJourney
              acquired={acquired}
              handoff={studioHandoff}
              record={currentRecord}
              snapshot={deviceInstall}
            />
            <Link
              href={studioHandoff.href}
              className={buttonClass({ variant: "solid", size: "md", className: "w-full" })}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {studioActionLabel}
            </Link>
            {!acquired ? (
              <MarketGuestLoginNotice id={MARKET_GUEST_LOGIN_NOTICE_ID} />
            ) : null}
            {acquired ? (
              <Link
                href="/market/library"
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "w-full gap-1.5 border-good/40 text-good hover:bg-good/10",
                })}
              >
                <CheckCircle2 className="size-3.5" />
                <span>{translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "내 보관함에 보관됨 (보관함 이동)")}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleAcquireClick}
                aria-describedby={marketGuestLoginNoticeDescribedBy(
                  guestLoginState,
                  MARKET_GUEST_LOGIN_NOTICE_ID,
                )}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "w-full gap-1.5 border-accent text-accent hover:bg-accent/10",
                })}
              >
                {guestMustLogin ? (
                  <LogIn className="size-3.5" aria-hidden="true" />
                ) : (
                  <Download className="size-3.5" />
                )}
                <span>내 에셋에 추가하기</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleWishlist(currentRecord)}
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: cn(
                  "w-full gap-1.5",
                  wishlisted && "border-warn/40 bg-warn/10 text-warn hover:bg-warn/20",
                ),
              })}
            >
              <Heart
                className={cn("size-3.5", wishlisted && "fill-warn text-warn")}
                aria-hidden="true"
              />
              <span>{wishlisted ? translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "찜한 에셋에서 제거") : translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "찜 목록에 추가")}</span>
            </button>
            <MarketCompareToggle record={currentRecord} className="w-full" />
            {currentRecord.isOwner ? (
              <button
                type="button"
                onClick={() => setEditModalOpen(true)}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "w-full gap-1.5 border-accent/60 text-accent hover:bg-accent/10",
                })}
              >
                <Sliders className="size-3.5" />
                <span>{translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "에셋 정보 수정 / 판올림")}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => downloadMetadataSnapshot(record)}
              className={buttonClass({ variant: "outline", size: "sm", className: "w-full" })}
            >
              <FileJson className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "메타데이터 스냅샷 다운로드")}</button>
            <Link
              href={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "/market/browse?kind={v0}"), { v0: String(record.kind) })}
              className={buttonClass({ variant: "ghost", size: "sm", className: "w-full" })}
            >
              같은 종류의 리소스 더 보기
            </Link>
            <SharePageButton
              path={`/market/resource/${encodeURIComponent(currentRecord.id)}`}
              text={currentRecord.name}
              description={compactPublicShareDescription(
                currentRecord.description,
                `${kind.label} 리소스의 구성과 사용권, Studio 적용 방법을 확인해 보세요.`,
              )}
              label="리소스 공유"
              actionLabel="리소스 보기"
              className={buttonClass({ variant: "ghost", size: "sm", className: "w-full" })}
            />
            <CreatorMarketplaceReportAction record={record} />
            <p className="text-center text-[0.68rem] leading-relaxed text-fg-3">
              {studioActionSummary}
            </p>
          </div>

          <dl className="divide-y divide-line rounded-xl border border-line bg-card px-4 py-1">
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "배급자")}>
              <span className="flex max-w-full flex-col items-end gap-1">
                <span className="inline-flex max-w-full items-center">
                  {record.publisher.avatar ? (
                    <img
                      src={record.publisher.avatar}
                      alt=""
                      className="mr-1.5 inline-block h-4 w-4 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <Link
                    href={`/u/${encodeURIComponent(record.publisher.id)}`}
                    className="inline-flex min-h-6 max-w-full items-center break-all underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
                  >
                    {record.publisher.name}
                  </Link>
                </span>
                <span className="flex flex-wrap items-center justify-end gap-1.5">
                  <Link
                    href={`/market/creator/${encodeURIComponent(record.publisher.id)}`}
                    className="inline-flex min-h-6 items-center gap-1 rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] font-semibold text-fg transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    <Store className="size-3 text-accent" aria-hidden="true" />
                    {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "배급자 스토어 열기")}
                  </Link>
                  <button
                    type="button"
                    aria-pressed={followingPublisher}
                    onClick={() => toggleFollowCreator(record.publisher)}
                    className={cn(
                      "inline-flex min-h-6 items-center gap-1 rounded border px-2 py-0.5 text-[0.68rem] font-semibold transition-colors",
                      followingPublisher
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
                    )}
                  >
                    {followingPublisher ? (
                      <UserCheck className="size-3" aria-hidden="true" />
                    ) : (
                      <UserPlus className="size-3" aria-hidden="true" />
                    )}
                    {followingPublisher
                      ? translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "배급자 팔로우 중")
                      : translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "배급자 팔로우")}
                  </button>
                </span>
                <Link
                  href={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "en", "/market/browse?publisher={v0}"), { v0: String(encodeURIComponent(record.publisher.id)) })}
                  className="inline-flex min-h-6 items-center text-[0.68rem] font-normal text-fg-3 underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
                >
                  {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "이 배급자의 마켓 리소스")}</Link>
              </span>
            </MetaRow>
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "패키지 ID")}>
              <span className="block max-w-full break-all font-mono text-[0.68rem] text-fg-2">
                {record.packageId}
              </span>
            </MetaRow>
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "버전")}>
              <span className="numeral tnum">v{record.resourceVersion}</span>
            </MetaRow>
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "라이선스")}>
              <span className="flex max-w-[190px] flex-col items-end gap-1">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                  {license.url ? (
                    <a
                      href={license.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-6 items-center underline decoration-line-strong underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
                    >
                      {license.label}
                    </a>
                  ) : (
                    <Link
                      href="/terms"
                      className="inline-flex min-h-6 items-center underline decoration-line-strong underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
                    >
                      {license.label}
                    </Link>
                  )}
                </span>
                <span className="font-normal leading-relaxed text-fg-2">{license.summary}</span>
              </span>
            </MetaRow>
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "호환 엔진")}>
              {record.compatibility.engines.map((engine) => ENGINE_LABELS[engine] ?? engine).join(", ")}
            </MetaRow>
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "최소 스튜디오 버전")}>
              <span className="numeral tnum">v{record.minimumStudioVersion}</span>
            </MetaRow>
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "AI 사용")}>
              <span className="inline-flex items-center gap-1">
                <Sparkles className={`h-3.5 w-3.5 ${record.containsAi ? "text-warn" : "text-good"}`} aria-hidden="true" />
                {record.containsAi ? translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "포함") : translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "미포함")}
              </span>
            </MetaRow>
            {record.attributionText ? (
              <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "출처 표기")}>
                <span className="block max-w-[180px] whitespace-normal break-words text-fg-2">
                  {record.attributionText}
                </span>
              </MetaRow>
            ) : null}
            <MetaRow label={translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "업데이트")}>
              <time dateTime={record.updatedAt}>{formatMarketDate(record.updatedAt)}</time>
            </MetaRow>
          </dl>

          {record.provenance.origin === "permissive" ? (
            <div className="rounded-xl border border-line bg-panel p-4 text-xs leading-relaxed text-fg-2">
              <p className="mb-1 inline-flex items-center gap-1 font-medium text-fg">
                <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "외부 허용 리소스")}</p>
              {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "출처: ")}{record.provenance.sourceName}
              <br />
              <a
                href={record.provenance.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-6 items-center break-all text-cool underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
              >
                {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "원본 소스 ↗")}</a>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-panel p-4 text-xs leading-relaxed text-fg-2">
              <p className="mb-1 inline-flex items-center gap-1 font-medium text-fg">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "오리지널 창작")}</p>
              {translateCurrentStaticSourceText("domains.market.components.MarketResourceDetailArticle", "ko", "배급자가 직접 만든 리소스입니다.")}</div>
          )}
        </div>
      </div>

      <MarketWebtoon3dViewerModal
        open={viewer3dOpen}
        onClose={() => setViewer3dOpen(false)}
        assetTitle={record.name}
        studioResourceId={record.id}
      />

      <MarketDetailStickyBar
        record={currentRecord}
        studioHandoff={studioHandoff}
        onOpenAcquisition={handleAcquireClick}
      />

      <MarketAcquisitionModal
        open={acquisitionModalOpen}
        onClose={() => setAcquisitionModalOpen(false)}
        record={currentRecord}
        studioHandoff={studioHandoff}
      />

      <MarketEditResourceModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        record={currentRecord}
        onSaved={(updated) => setCurrentRecord(updated)}
      />
    </article>
  );
}
