import {
  ArrowRight,
  Box,
  ChevronDown,
  Compass,
  FileUp,
  LayoutPanelTop,
  LayoutTemplate,
  PenTool,
  ScrollText,
  UserRound,
  Users,
} from "lucide-react";
import { useState, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

interface CreateStartGrandAtelierSectionProps {
  readonly storyHref: string;
  readonly compactOnMobile?: boolean;
}

const BEGINNER_JOURNEY_STEPS = [
  { step: "1", ko: "규격 선택", en: "Pick format" },
  { step: "2", ko: "바로 그리기", en: "Draw" },
  { step: "3", ko: "자동·파일 저장", en: "Save" },
  { step: "4", ko: "검수·공유", en: "Review" },
] as const;

const PRO_STUDIO_LANES = [
  {
    id: "shaper",
    href: "/studio/assets/characters/new",
    icon: UserRound,
    koTitle: "3D 캐릭터 셰이퍼",
    enTitle: "3D Character Shaper",
    koBody: "16종 웹툰 체형·얼굴·포즈 제어 후 캔버스 투입",
    enBody: "Tune 16 webtoon proportions, faces & poses for your canvas",
  },
  {
    id: "bg3d",
    href: "/studio/bg3d",
    icon: Box,
    koTitle: "3D 배경 · 선화 추출",
    enTitle: "3D Stage & Line Art",
    koBody: "카페·학교·성곽 3D 배치 후 흑백 선화 추출",
    enBody: "Stage 3D rooms & streets and extract clean line art",
  },
  {
    id: "brush-lab",
    href: "/studio/assets/brushes/new",
    icon: PenTool,
    koTitle: "브러시 실험실",
    enTitle: "Brush Lab",
    koBody: "필압 펜선·번짐·스크린톤 시필 작업대",
    enBody: "Test pressure pens, bleed & screentones",
  },
  {
    id: "collab",
    href: "/production",
    icon: Users,
    koTitle: "팀 공동 작업 원고 생성",
    enTitle: "Team Co-work Manuscript",
    koBody: "선화·채색·PD 역할을 미리 지정해 공유 룸 개설",
    enBody: "Assign ink, color & PD roles and open a shared studio room",
  },
  {
    id: "ai-helper",
    href: "/studio/ai-lab",
    icon: Compass,
    koTitle: "연출·구도 도우미",
    enTitle: "Direction & Framing Helper",
    koBody: "카메라 투시·시선 동선과 에피소드 리듬 제안",
    enBody: "Get camera perspective, eye-flow & episode pacing suggestions",
  },
  {
    id: "templates",
    href: "/studio/templates",
    icon: LayoutTemplate,
    koTitle: "장르별 템플릿 12종",
    enTitle: "12 Genre Templates",
    koBody: "로맨스·판타지·현대물 컷틀·색감 시작 세트",
    enBody: "Ready-made panel grids and palettes for romance, fantasy & drama",
  },
] as const;

export function CreateStartGrandAtelierSection({
  storyHref,
}: CreateStartGrandAtelierSectionProps) {
  const bt = useBilingual("CreateStartPage");
  const [customWidth, setCustomWidth] = useState(800);
  const [customHeight, setCustomHeight] = useState(12800);
  const [customDpi, setCustomDpi] = useState<300 | 350>(300);
  const [teamCollab, setTeamCollab] = useState(true);
  const [proToolsOpen, setProToolsOpen] = useState(false);

  const safeWidth = Math.min(8000, Math.max(320, Number.isFinite(customWidth) ? customWidth : 800));
  const safeHeight = Math.min(40000, Math.max(320, Number.isFinite(customHeight) ? customHeight : 12800));
  const customStudioHref = `/studio/new?lane=blank&width=${safeWidth}&height=${safeHeight}&dpi=${customDpi}${teamCollab ? "&collab=team" : ""}`;

  const presetCards = [
    {
      id: "webtoon-standard",
      href: "/studio/new?lane=blank&preset=webtoon-standard&width=800&height=12800&dpi=300",
      icon: ScrollText,
      specBadge: bt("800 × 12,800 px · 300 DPI", "800 × 12,800 px · 300 DPI"),
      rankBadge: bt("세로 스크롤", "Vertical scroll"),
      title: bt("네이버·카카오 표준 웹툰", "Standard Vertical Webtoon"),
      body: bt(
        "모바일 가독 폭 가이드와 기본 컷 프레임·선화 레이어가 자동 준비됩니다",
        "Pre-configured with mobile reading guides, panel frames, and ink layers",
      ),
      cta: bt("1클릭 바로 그리기", "Draw in 1 click"),
    },
    {
      id: "instatoon-square",
      href: "/studio/new?lane=blank&preset=instatoon-square&width=1080&height=1080&dpi=300",
      icon: LayoutPanelTop,
      specBadge: bt("1,080 × 1,080 px · 최대 10장", "1,080 × 1,080 px · Up to 10 slides"),
      rankBadge: bt("정방형 4컷", "Square 4-panel"),
      title: bt("인스타툰 · 4컷 일상 만화", "Instatoon · 4-Panel Comic"),
      body: bt(
        "정방형 4컷 분할 격자와 말풍선 세트가 준비된 가벼운 캔버스로 시작합니다",
        "Start on a square 4-panel grid with speech balloon presets ready",
      ),
      cta: bt("4컷 캔버스 열기", "Open 4-panel canvas"),
    },
    {
      id: "story-script",
      href: storyHref,
      icon: LayoutTemplate,
      specBadge: bt("대본 · 줄거리 → 자동 컷 배분", "Script & Plot → Auto panel split"),
      rankBadge: bt("이야기 우선", "Story first"),
      title: bt("이야기·웹소설 대본으로 시작", "Start from Story or Webnovel"),
      body: bt(
        "대사·지문만 적으면 페이지별 콘티 박스와 말풍선을 차례대로 배치합니다",
        "Write dialogue or notes to lay out storyboard panels and balloons",
      ),
      cta: bt("스토리 보드 열기", "Open storyboard flow"),
    },
    {
      id: "import-psd",
      href: "/studio/import",
      icon: FileUp,
      specBadge: bt("PSD · CLIP · TOON 레이어 보존", "PSD · CLIP · TOON layer-safe"),
      rankBadge: bt("외부 원고 호환", "External file"),
      title: bt("포토샵·클튜 파일 이어그리기", "Continue PSD or Clip File"),
      body: bt(
        "기존 PSD·이미지·백업 파일의 레이어를 살려 그대로 불러옵니다",
        "Import existing PSDs, images, or archives with layers intact",
      ),
      cta: bt("내 기기에서 파일 열기", "Import from device"),
    },
  ] as const;

  return (
    <div className="space-y-6" data-testid="create-grand-atelier-v4">
      <section
        aria-label={bt("초보자 1클릭 규격 프리셋", "1-click beginner format presets")}
        data-testid="create-grand-atelier-presets"
        className="pt-2"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <div>
            <p className="text-xs font-medium text-fg-3">
              {bt("표준 캔버스 규격", "Standard canvas formats")}
            </p>
            <h2 className="mt-1 text-base font-semibold text-fg [word-break:keep-all] sm:text-lg">
              {bt(
                "해상도 계산 없이 자주 쓰는 표준 규격으로 바로 시작하세요",
                "Launch a standard webtoon or 4-panel canvas without manual resolution setup",
              )}
            </h2>
          </div>
          <ol
            aria-label={bt("초보자 완주 4단계", "4-step beginner journey")}
            className="hidden flex-wrap items-center gap-3 text-xs text-fg-3 md:flex"
          >
            {BEGINNER_JOURNEY_STEPS.map((item, index) => (
              <li
                key={item.step}
                className={index === 0 ? "inline-flex items-center gap-1.5 font-medium text-fg" : "inline-flex items-center gap-1.5"}
              >
                <span className="font-mono text-[11px] tabular-nums text-fg-3">{item.step}</span>
                <span>{bt(item.ko, item.en)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="ink-cascade mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {presetCards.map((card, index) => {
            const PresetIcon = card.icon;
            return (
              <article
                key={card.id}
                style={{ "--ink-i": index } as CSSProperties}
                className="create-start-preset-card ink-frame group flex min-w-0 w-full flex-col justify-between rounded-[14px] border border-line bg-panel p-4 transition-colors duration-150 hover:border-line-strong"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-3">
                      <PresetIcon size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-fg-3" />
                      <span>{card.rankBadge}</span>
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-sm font-semibold text-fg [word-break:keep-all] sm:text-[0.9375rem]">
                    {card.title}
                  </h3>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-fg-3">
                    {card.specBadge}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-fg-2 [word-break:keep-all]">
                    {card.body}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-line/70">
                  <Link
                    href={card.href}
                    className="ink-arrow inline-flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-card px-3 py-2 text-xs font-medium text-fg transition-colors duration-150 hover:border-accent/60 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span>{card.cta}</span>
                    <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <details
        open={proToolsOpen}
        onToggle={(event) => {
          if (event.target === event.currentTarget) {
            setProToolsOpen(event.currentTarget.open);
          }
        }}
        data-testid="create-pro-tools-disclosure"
        className="group/pro rounded-xl border border-line bg-panel"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 [word-break:keep-all]">
            {bt("세부 캔버스 규격·전문 도구 열기", "Open custom canvas size & pro tools")}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-fg-3">
            <span>{bt("6종 · 직접 입력", "6 tools · custom")}</span>
            <ChevronDown size={16} strokeWidth={1.6} aria-hidden="true" className="transition-transform duration-150 group-open/pro:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <section
          aria-label={bt("전문 제작 도구 및 세부 규격 빠른 지정", "Pro studio tools and inline canvas setup")}
          className="grid gap-5 border-t border-line p-4 sm:p-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(19rem,1fr)]"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-fg-3">
                  {bt("전문 제작 도구", "Specialist tools")}
                </p>
                <h2 className="mt-0.5 text-sm font-semibold text-fg [word-break:keep-all] sm:text-base">
                  {bt(
                    "3D 캐릭터·배경·브러시 실험실·팀 작업실을 바로 엽니다",
                    "Open 3D character, background, brush lab, and team rooms directly",
                  )}
                </h2>
              </div>
              <Link
                href="/studio"
                className="ink-arrow inline-flex min-h-12 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/50 hover:text-accent"
              >
                <span>{bt("작업실 로비 열기", "Open Studio Lobby")}</span>
                <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
              </Link>
            </div>

            <div className="ink-cascade mt-3.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {PRO_STUDIO_LANES.map((lane) => {
                const LaneIcon = lane.icon;
                return (
                  <Link
                    key={lane.id}
                    href={lane.href}
                    className="ink-frame flex min-h-12 items-start gap-3 rounded-lg border border-line bg-card p-3 transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-fg-3" aria-hidden="true">
                      <LaneIcon size={16} strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-xs font-semibold text-fg [word-break:keep-all]">{bt(lane.koTitle, lane.enTitle)}</strong>
                      <span className="mt-0.5 block text-[11px] leading-4 text-fg-2 [word-break:keep-all]">{bt(lane.koBody, lane.enBody)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div
            data-testid="create-inline-spec-builder"
            className="flex flex-col justify-between border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-fg-3">
                    {bt("직접 입력 규격", "Custom dimensions")}
                  </p>
                  <h2 className="mt-0.5 text-sm font-semibold text-fg sm:text-base">
                    {bt("세부 규격 · 협업 지정", "Custom Canvas Size & Team Mode")}
                  </h2>
                </div>
                <span className="inline-flex items-center rounded border border-line bg-card px-2 py-0.5 text-[11px] font-medium text-fg-3">
                  {bt("직접 설정", "Custom")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-fg-2 [word-break:keep-all]">
                {bt(
                  "원하는 픽셀 폭·높이와 인쇄 해상도, 팀 공동작업을 한 화면에서 지정합니다",
                  "Set custom pixel dimensions, print DPI, and team collaboration in one place",
                )}
              </p>

              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <label className="block text-xs font-medium text-fg-2">
                  <span>{bt("폭 (px)", "Width (px)")}</span>
                  <input
                    type="number"
                    min={320}
                    max={8000}
                    step={10}
                    value={customWidth}
                    onChange={(event) => setCustomWidth(Number(event.target.value))}
                    aria-label={bt("캔버스 가로 폭 픽셀", "Canvas width in pixels")}
                    className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium tabular-nums text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </label>
                <label className="block text-xs font-medium text-fg-2">
                  <span>{bt("세로 높이 (px)", "Height (px)")}</span>
                  <input
                    type="number"
                    min={320}
                    max={40000}
                    step={100}
                    value={customHeight}
                    onChange={(event) => setCustomHeight(Number(event.target.value))}
                    aria-label={bt("캔버스 세로 높이 픽셀", "Canvas height in pixels")}
                    className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium tabular-nums text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </label>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  aria-pressed={customDpi === 350}
                  onClick={() => setCustomDpi((prev) => (prev === 300 ? 350 : 300))}
                  className="inline-flex min-h-12 items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-line-strong"
                >
                  <span>{bt("해상도", "Resolution")}</span>
                  <span className="font-semibold tabular-nums text-accent">{`${customDpi} DPI`}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={teamCollab}
                  onClick={() => setTeamCollab((prev) => !prev)}
                  className="inline-flex min-h-12 items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-line-strong"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={14} strokeWidth={1.6} aria-hidden="true" className="text-fg-3" />
                    {bt("팀 공동작업", "Team Mode")}
                  </span>
                  <span className={teamCollab ? "font-semibold text-accent" : "text-fg-3"}>
                    {teamCollab ? bt("켜짐", "On") : bt("꺼짐", "Off")}
                  </span>
                </button>
              </div>
            </div>

            <Link
              href={customStudioHref}
              data-testid="create-inline-spec-submit"
              className="ink-arrow mt-4 inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card px-4 py-2.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span>{bt("설정한 규격으로 새 작업실 열기", "Open New Studio with Custom Spec")}</span>
              <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </details>
    </div>
  );
}
