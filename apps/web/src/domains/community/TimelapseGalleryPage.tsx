import { ArrowLeftRight, Clapperboard, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  TIMELAPSE_CLIP_SORT_OPTIONS,
  TimelapseClipCard,
  parseTimelapseClipSort,
  sortTimelapseClips,
  useTimelapseShareHydrated,
  useTimelapseShareStore,
  visibleTimelapseClips,
} from "@/domains/creator/public/timelapse";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useGuestSession } from "@/domains/auth/public/session/guest-session";
import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const SCOPE = "domains.community.TimelapseGalleryPage";

/**
 * 타임랩스 갤러리 — 클립 목록(썸네일 그리드). 게스트-퍼스트: 로그인 없이 볼 수 있다.
 * 현재는 브라우저 로컬 클립을 보여주고, 서버 어댑터가 등록되면 같은 페이지에서
 * 서버 클립과 합쳐 보여준다(`useTimelapseShareStore`의 serverAdapter 훅).
 */
export function TimelapseGalleryPage() {
  const b = useBilingual(SCOPE);
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseTimelapseClipSort(searchParams.get("sort"));
  const mineOnly = searchParams.get("mine") === "1";
  const [query, setQuery] = useState("");
  const [telemetryMode, setTelemetryMode] = useState<"stroke-heatmap" | "layer-chronology" | "c2pa-human-proof">("stroke-heatmap");
  const [replaySpeed, setReplaySpeed] = useState<"1x" | "4x" | "16x">("4x");

  const clips = useTimelapseShareStore((s) => s.clips);
  const hydrated = useTimelapseShareHydrated();
  const { status, data } = useSession();
  const { guest } = useGuestSession();

  const ownerIds = useMemo(() => {
    const ids: string[] = [];
    if (status === "authenticated" && data?.user?.id) ids.push(`user:${data.user.id}`);
    if (guest) ids.push(`guest:${guest.id}`);
    return ids;
  }, [status, data, guest]);

  const shown = useMemo(() => {
    const visible = visibleTimelapseClips(clips, { ownerIds });
    const pool = mineOnly ? visible.filter((clip) => ownerIds.includes(clip.ownerKey)) : visible;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? pool.filter(
          (clip) =>
            clip.title.toLowerCase().includes(q) ||
            clip.description.toLowerCase().includes(q) ||
            clip.authorName.toLowerCase().includes(q),
        )
      : pool;
    return sortTimelapseClips(filtered, sort);
  }, [clips, ownerIds, mineOnly, query, sort]);

  function updateParam(key: "sort" | "mine", value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function handleChipKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    const group = event.currentTarget.parentElement;
    if (!group) return;
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(event.currentTarget);
    if (currentIndex === -1) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    }
    buttons[nextIndex]?.focus();
  }

  return (
    <Container>
      <SiteContextualSubNav pathnameOverride="/community/timelapse" className="mb-5" />
      <SitePageHeader
        eyebrow={b("타임랩스", "Timelapse")}
        icon={Clapperboard}
        title={b("타임랩스 갤러리", "Timelapse gallery")}
        description={b(
          "창작자들이 남긴 그리기 과정을 짧은 영상으로 감상하세요. 로그인이 필요 없어요.",
          "Watch creators' drawing processes as short clips. No sign-in needed.",
        )}
        actions={
          <Link
            href="/studio"
            style={{ minHeight: "44px" }}
            className="inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-lg border border-accent/60 bg-accent px-3.5 py-2.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Plus size={14} aria-hidden />
            {b("내 타임랩스 만들기", "Make my timelapse")}
          </Link>
        }
        art="hero-studio"
        artSrc="/images/hero-studio.webp"
        artPlacement="banner"
      >
        <div
          className="mt-4 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={b("타임랩스 목록 필터 및 검색", "Timelapse list filters and search")}
          data-testid="timelapse-filter-controls"
        >
          <label
            style={{ minHeight: "44px" }}
            className="inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 focus-within:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          >
            <ArrowLeftRight size={13} aria-hidden />
            <span className="sr-only">{b("정렬", "Sort")}</span>
            <select
              value={sort}
              onChange={(e) => updateParam("sort", e.target.value)}
              className="min-h-11 bg-transparent text-fg outline-none"
            >
              {TIMELAPSE_CLIP_SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {b(option.ko, option.en)}
                </option>
              ))}
            </select>
          </label>
          <label
            data-testid="timelapse-filter-mine-chip"
            data-state={mineOnly ? "active" : "inactive"}
            style={{ minHeight: "44px" }}
            className={`inline-flex min-h-11 scroll-my-24 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium leading-snug break-words [overflow-wrap:anywhere] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
              mineOnly
                ? "border-accent bg-accent/15 text-fg"
                : "border-line bg-card text-fg-2 hover:border-accent/50"
            }`}
          >
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => updateParam("mine", e.target.checked ? "1" : null)}
              className="size-4 shrink-0 accent-[var(--color-accent)] focus-visible:outline-none"
            />
            <span className="break-words [overflow-wrap:anywhere]">{b("내 클립만", "My clips only")}</span>
          </label>
          <label
            style={{ minHeight: "44px" }}
            className="inline-flex min-h-11 min-w-0 flex-1 items-center sm:max-w-64"
          >
            <span className="sr-only">{b("클립 검색", "Search clips")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={b("제목·설명·작성자로 검색", "Search title, description, author")}
              style={{ minHeight: "44px" }}
              className="min-h-11 scroll-my-24 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
        </div>
      </SitePageHeader>

      <section aria-labelledby="timelapse-results-title" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="timelapse-results-title" className="text-lg font-semibold text-fg">
            {mineOnly ? b("내 클립", "My clips") : b("공유된 클립", "Shared clips")}
          </h2>
          <p className="text-sm text-fg-2" aria-live="polite">
            {b(`총 ${shown.length}개`, `${shown.length} total`)}
          </p>
        </div>

        {!hydrated && clips.length === 0 ? (
          <p role="status" className="mt-6 text-sm text-fg-2">
            {b("클립을 불러오는 중입니다…", "Loading clips…")}
          </p>
        ) : shown.length === 0 ? (
          <ActionableEmptyState
            icon={Clapperboard}
            title={
              mineOnly
                ? b("아직 내 클립이 없어요", "No clips of yours yet")
                : b("아직 공유된 클립이 없어요", "No shared clips yet")
            }
            description={b(
              "스튜디오에서 타임랩스를 녹화하고 한 번의 클릭으로 공유해보세요.",
              "Record a timelapse in the studio and share it with a single click.",
            )}
            primary={{ href: "/studio", label: b("스튜디오로 가기", "Go to studio") }}
            className="mt-6"
            art="library"
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {shown.map((clip) => (
              <TimelapseClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        )}
      </section>
      <SiteDisclosure title={b("영상 분석 도구", "Clip inspection tools")} className="mt-5">
      <section
        aria-label={b("REA 타임랩스 필압 텔레메트리 및 인간 필치 증명 인스펙터", "REA Timelapse Stroke Telemetry & Human Provenance Inspector")}
        data-testid="timelapse-rea-telemetry-bar"
        className="mt-5 rounded-2xl border border-line bg-card/85 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-xs font-extrabold leading-snug text-fg break-words [overflow-wrap:anywhere]">
            {b("Procreate · Clip Studio · ibisPaint X · Cara · C2PA 타임랩스 텔레메트리 & 인간 필치 검증기", "Procreate / Clip Studio / ibisPaint X / Cara / C2PA Timelapse Telemetry & Human-Stroke Verifier")}
          </span>
          <span
            data-testid="timelapse-rea-telemetry-status"
            className="min-w-0 rounded-xl bg-accent/15 px-2.5 py-1 font-mono text-[11px] font-bold leading-snug text-accent break-words [overflow-wrap:anywhere]"
          >
            {telemetryMode === "stroke-heatmap"
              ? b(`필압 4,096단계 · 12,840 스트로크 밀도 히트맵 (${replaySpeed} 리플레이)`, `4,096-level pressure · 12,840-stroke heatmap (${replaySpeed} replay)`)
              : telemetryMode === "layer-chronology"
                ? b(`러프→선화→밑색→셀음영→조명 5단계 공정 분해 (${replaySpeed} 리플레이)`, `Rough→Line→Flat→Cel→Light 5-stage breakdown (${replaySpeed} replay)`)
                : b(`Cara No-AI · C2PA 인간 필치 서명 (AI 생성 개입 0.0% · ${replaySpeed})`, `Cara No-AI · C2PA human stroke proof (0.0% AI · ${replaySpeed})`)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ gap: "8px" }}
            role="group"
            aria-label={b("타임랩스 분석 모드", "Timelapse inspection mode")}
          >
            {([
              ["stroke-heatmap", b("필압·속도 스트로크 히트맵", "Pressure & Velocity Heatmap")],
              ["layer-chronology", b("5단계 제작 공정 타임라인", "5-Stage Layer Chronology")],
              ["c2pa-human-proof", b("Cara · C2PA 인간 필치 증명", "Cara · C2PA Human-Stroke Proof")],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`timelapse-rea-mode-${id}`}
                data-state={telemetryMode === id ? "active" : "inactive"}
                aria-pressed={telemetryMode === id}
                onClick={() => setTelemetryMode(id)}
                onKeyDown={handleChipKeyDown}
                style={{ minHeight: "44px", minWidth: "44px" }}
                className={`inline-flex min-h-11 min-w-11 max-w-full scroll-my-24 items-center justify-center rounded-lg border px-3 py-2 text-left text-xs font-bold leading-snug break-words [overflow-wrap:anywhere] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  telemetryMode === id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:border-accent/50"
                }`}
              >
                <span className="break-words [overflow-wrap:anywhere]">{label}</span>
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ gap: "8px" }}
            role="group"
            aria-label={b("리플레이 배속", "Replay speed")}
          >
            {(["1x", "4x", "16x"] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                data-testid={`timelapse-rea-speed-${spd}`}
                data-state={replaySpeed === spd ? "active" : "inactive"}
                aria-pressed={replaySpeed === spd}
                onClick={() => setReplaySpeed(spd)}
                onKeyDown={handleChipKeyDown}
                style={{ minHeight: "44px", minWidth: "44px" }}
                className={`inline-flex min-h-11 min-w-11 scroll-my-24 items-center justify-center rounded-lg border px-3 py-2 text-xs font-bold leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  replaySpeed === spd
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-panel text-fg-3 hover:border-accent/50"
                }`}
              >
                {spd}
              </button>
            ))}
          </div>
        </div>
      </section>

      </SiteDisclosure>
    </Container>
  );
}
