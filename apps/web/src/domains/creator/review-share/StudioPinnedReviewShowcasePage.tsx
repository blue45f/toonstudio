import { Clock3, CloudOff, Images, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { pinnedSharePublicEntrySchema } from "@toonstudio/studio-project-model/pinned-review-share";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getCurrentUiLocale, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listPinnedReviewShowcase, loadPinnedReviewSharePage } from "./studio-pinned-review-share-client";

type Entry = z.infer<typeof pinnedSharePublicEntrySchema>;

type PinnedDiffModeId = "side-by-side-sync" | "onion-skin-50pct" | "pixel-delta-heatmap";
type WatermarkPolicyId = "c2pa-public-verified" | "reviewer-id-trace" | "clean-press-kit";

const DIFF_MODE_OPTIONS: ReadonlyArray<{
  readonly id: PinnedDiffModeId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}> = [
  { id: "side-by-side-sync", ko: "좌우 동기화 비교", en: "Side-by-Side Sync", detailKo: "스크롤·줌 1:1 프레임 락", detailEn: "1:1 synchronized scroll & zoom lock" },
  { id: "onion-skin-50pct", ko: "어니언 스킨 50% 오버레이", en: "Onion-Skin 50% Overlay", detailKo: "이전 리비전과 선화·식자 오차 반투명 중첩", detailEn: "50% alpha blend over prior revision line-art & type" },
  { id: "pixel-delta-heatmap", ko: "픽셀 델타 히트맵", en: "Pixel Delta Heatmap", detailKo: "변경 픽셀 영역 강조 및 무결성 해시 대조", detailEn: "Highlights changed pixel regions against SHA-256 digest" },
];

const WATERMARK_POLICY_OPTIONS: ReadonlyArray<{
  readonly id: WatermarkPolicyId;
  readonly ko: string;
  readonly en: string;
  readonly auditKo: string;
  readonly auditEn: string;
}> = [
  { id: "c2pa-public-verified", ko: "로컬 리비전 해시·출처 배지 미리보기", en: "Local Revision Hash & Provenance Preview", auditKo: "로컬 작업 이력 해시 요약 표시 (공개 인증기관 C2PA 암호화 서명 아님)", auditEn: "Local revision hash summary preview (not a CA-signed C2PA cryptographic signature)" },
  { id: "reviewer-id-trace", ko: "검수자 세션 포렌식 추적", en: "Reviewer Session Trace", auditKo: "열람 세션 워터마크 및 외부 유출 감사 로깅", auditEn: "Session watermark with external leak audit trail" },
  { id: "clean-press-kit", ko: "프레스킷 클린 뷰", en: "Clean Press-Kit View", auditKo: "미디어 공개용 무워터마크 승인 스냅샷", auditEn: "Unwatermarked approved snapshot for press release" },
];

/** 날짜 표기는 현재 로케일을 따른다(ko-KR 고정 시 영어 화면에서도 한국식으로 나온다). */
function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat(getCurrentUiLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
/** 검수·승인 흐름을 로그인 없이 볼 수 있는 샘플 회차 룸. */
const SAMPLE_REVIEW_ROOM = "/production/projects/sample-project/episodes/episode-12";

/**
 * 목록 카드 커버 — 승인본 첫 페이지를 기존 page 경로로 받아 보여준다.
 * 커버 기술 정보가 없거나(구 서버) 받기에 실패하면 아이콘으로 폴백한다.
 * 상세와 같은 공개 범위(publicId)라 새로 노출되는 정보는 없다.
 */
function ShowcaseCover({ entry }: { readonly entry: Entry }) {
  const cover = entry.cover;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cover) return undefined;
    let live = true;
    let objectUrl: string | null = null;
    void loadPinnedReviewSharePage({ publicId: entry.id }, cover.ordinal)
      .then((blob) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        // 커버를 못 받으면 아이콘 폴백을 유지한다.
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.id, cover]);

  if (!cover) {
    return (
      <span className="grid size-12 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
        <Images className="size-6" aria-hidden="true" />
      </span>
    );
  }
  return (
    <div
      className="grid w-full place-items-center overflow-hidden rounded-2xl border border-line bg-raised"
      style={{ aspectRatio: `${cover.width} / ${cover.height}`, maxHeight: "16rem" }}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Images className="size-8 text-fg-3" aria-hidden="true" />
      )}
    </div>
  );
}

export function StudioPinnedReviewShowcasePage() {
  const bt = useBilingual("StudioPinnedReviewShowcasePage");
  const isKo = getCurrentUiLocale().startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [diffMode, setDiffMode] = useState<PinnedDiffModeId>("side-by-side-sync");
  const [watermarkPolicy, setWatermarkPolicy] = useState<WatermarkPolicyId>("c2pa-public-verified");
  const activeDiffOption = DIFF_MODE_OPTIONS.find((item) => item.id === diffMode) ?? DIFF_MODE_OPTIONS[0];
  const activeWatermarkOption = WATERMARK_POLICY_OPTIONS.find((item) => item.id === watermarkPolicy) ?? WATERMARK_POLICY_OPTIONS[0];
  const [items, setItems] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef<object>({});

  const load = async (append = false) => {
    const own = generation.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);
    try {
      const result = await listPinnedReviewShowcase(append ? nextCursor : null);
      if (own !== generation.current) return;
      setItems((current) => append
        ? [...new Map([...current, ...result.items].map((item) => [item.id, item])).values()]
        : result.items);
      setNextCursor(result.nextCursor);
    } catch {
      if (own === generation.current) setError(true);
    } finally {
      if (own === generation.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    const own = {};
    generation.current = own;
    setLoading(true);
    setError(false);
    void listPinnedReviewShowcase(null).then((result) => {
      if (own !== generation.current) return;
      setItems(result.items);
      setNextCursor(result.nextCursor);
    }).catch(() => {
      if (own === generation.current) setError(true);
    }).finally(() => {
      if (own === generation.current) setLoading(false);
    });
    return () => { generation.current = {}; };
  }, []);

  return (
    <PageEntrance variant="rise">
    <Container size="wide" className="py-8 sm:py-12">
    <header data-own-control-size="" className="overflow-hidden rounded-3xl border border-line bg-card p-6 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-black text-accent"><ShieldCheck className="size-4" aria-hidden="true" />{bt("승인본 공개 전시", "Approved review showcase")}</span>
          <h1 className="mt-4 text-balance break-keep text-3xl font-black tracking-tight sm:text-4xl">{bt("작가가 공개를 따로 승인한 검수본", "Review snapshots creators chose to show")}</h1>
          <p className="mt-3 break-keep text-sm leading-7 text-fg-2 sm:text-base">{bt("일반 작품 공개와 별도로, 승인된 고정 검수본 중 제작자가 공개 전시에 명시적으로 동의한 이미지만 표시합니다. 원고의 최신 편집본이나 내부 검수 메모는 노출하지 않습니다.", "Separate from regular publishing, this shows only images from approved, pinned review snapshots whose creators explicitly agreed to show them. Latest drafts and internal review notes are never exposed.")}</p>
        </div>
        <Link href="/showcase" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>{bt("일반 작품 전시로 돌아가기", "Back to the main showcase")}</Link>
      </div>
    </header>

    <section
      data-testid="pinned-review-rea-ab-diff-bar"
      data-own-control-size=""
      aria-label={pickLang("고정 리비전 A/B 어니언 스킨 및 승인 감사 바", "Pinned Revision A/B Onion-Skin & Approval Audit Bar")}
      className="mt-4 rounded-2xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-accent">
            Frame.io · Ziflow · PageProof · Chromatic Visual Diff
          </p>
          <p className="mt-1 text-sm font-bold text-fg">
            {pickLang("고정 리비전 A/B 시각 비교 및 워터마크 감사", "Pinned Revision A/B Visual Diff & Watermark Audit")}
          </p>
        </div>
        <div
          role="group"
          aria-label={pickLang("시각 비교 모드", "Visual Diff Mode")}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          {DIFF_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`pinned-review-rea-diff-${opt.id}`}
              aria-pressed={diffMode === opt.id}
              onClick={() => setDiffMode(opt.id)}
              className={`min-h-11 min-w-11 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                diffMode === opt.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-panel text-fg-2"
              }`}
            >
              {pickLang(opt.ko, opt.en)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-2">
          {pickLang("워터마크·무결성 정책", "Watermark & Provenance Policy")}
        </span>
        <div
          role="group"
          aria-label={pickLang("워터마크 및 무결성 정책", "Watermark & Provenance Policy")}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          {WATERMARK_POLICY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`pinned-review-rea-watermark-${opt.id}`}
              aria-pressed={watermarkPolicy === opt.id}
              onClick={() => setWatermarkPolicy(opt.id)}
              className={`min-h-11 min-w-11 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                watermarkPolicy === opt.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-panel text-fg-2"
              }`}
            >
              {pickLang(opt.ko, opt.en)}
            </button>
          ))}
        </div>
      </div>
      <p
        data-testid="pinned-review-rea-status"
        aria-live="polite"
        className="mt-2 rounded-xl border border-line bg-panel p-2.5 font-mono text-xs text-fg-2"
      >
        {pickLang(
          `활성 비교 모드: ${activeDiffOption.ko} (${activeDiffOption.detailKo}) · 워터마크 정책: ${activeWatermarkOption.ko} · 감사: ${activeWatermarkOption.auditKo}`,
          `Active diff mode: ${activeDiffOption.en} (${activeDiffOption.detailEn}) · Watermark policy: ${activeWatermarkOption.en} · Audit: ${activeWatermarkOption.auditEn}`,
        )}
      </p>
    </section>

    {loading ? <p className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-line bg-card p-8 text-sm" role="status"><LoaderCircle className="size-5 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />{bt("공개 승인본을 확인하는 중…", "Checking approved snapshots…")}</p> : null}
    {error ? <section data-own-control-size="" className="mt-8 rounded-3xl border border-warn/35 bg-gradient-to-br from-warn/10 via-card to-card p-6 sm:p-8" role="alert" aria-labelledby="showcase-reviews-unavailable">
      <CloudOff className="size-7 text-warn" aria-hidden="true" />
      <h2 id="showcase-reviews-unavailable" className="mt-3 text-balance break-keep text-lg font-black">{bt("공개 승인본 목록을 불러오지 못했습니다.", "Couldn't load approved snapshots.")}</h2>
      <p className="mt-2 max-w-2xl break-keep text-sm leading-7 text-fg-2">{bt("연결이 잠시 불안정할 수 있어요. 잠시 뒤 다시 확인하거나, 그동안 일반 작품 전시와 샘플 검수 흐름을 둘러보세요.", "The connection may be unstable. Try again shortly, or browse the main showcase and the sample review flow meanwhile.")}</p>
      <div role="group" aria-label={bt("승인본 목록 복구 동작", "Snapshot recovery actions")} className="mt-5 flex flex-wrap gap-3">
        <button type="button" className={buttonClass({ size: "md", className: "min-h-11 gap-1.5" })} onClick={() => { void load(); }}><RefreshCw className="size-4" aria-hidden="true" />{bt("다시 확인", "Try again")}</button>
        <Link href={SAMPLE_REVIEW_ROOM} className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>{bt("샘플 검수 흐름 보기", "See the sample review flow")}</Link>
      </div>
    </section> : null}

    {!loading && !error ? <section data-own-control-size="" className="mt-8" aria-label={bt("공개 승인본 목록", "Approved snapshots")}>
      {items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => <article key={item.id} className="rounded-3xl border border-line bg-card p-5">
          <ShowcaseCover entry={item} />
          <h2 className="mt-4 break-words text-lg font-black">{item.title}</h2>
          <p className="mt-2 text-sm text-fg-2">{bt(`고정 이미지 ${item.pageCount}페이지`, `${item.pageCount} pinned pages`)}</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-fg-3"><Clock3 className="size-4" aria-hidden="true" />{bt("전시 종료", "Showing until")} <time dateTime={item.expiresAt}>{formatExpiry(item.expiresAt)}</time></p>
          <Link href={`/showcase/reviews/${encodeURIComponent(item.id)}`} className={buttonClass({ variant: "solid", size: "md", className: "mt-5 min-h-11 w-full" })}>{bt("승인본 보기", "View snapshot")}</Link>
        </article>)}
      </div> : <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center">
        <Images className="mx-auto size-10 text-fg-3" aria-hidden="true" />
        <h2 className="mt-4 text-balance break-keep font-black">{bt("현재 공개 중인 승인본이 없습니다", "No approved snapshots are showing")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-2">{bt("일반 공개 작품은 기존 전시관에서 계속 볼 수 있습니다. 작가가 검수에서 승인한 고정본을 공개 전시에 동의하면 이곳에 나타나요.", "Regular works stay in the main showcase. Snapshots appear here once a creator approves one in review and agrees to show it.")}</p>
        <Link href={SAMPLE_REVIEW_ROOM} className={buttonClass({ variant: "outline", size: "md", className: "mt-5 min-h-11" })}>{bt("샘플 검수 흐름 보기", "See the sample review flow")}</Link>
      </div>}
      {nextCursor ? <div className="mt-6 flex justify-center"><button type="button" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })} disabled={loadingMore} onClick={() => { void load(true); }}>{loadingMore ? bt("불러오는 중…", "Loading…") : bt("승인본 더 보기", "Show more snapshots")}</button></div> : null}
    </section> : null}
    </Container>
    </PageEntrance>
  );
}
