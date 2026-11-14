import { ArrowRight, CheckCircle2, Sparkles, Users } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

interface CreateStartGrandAtelierSectionProps {
  readonly storyHref: string;
}

const BEGINNER_JOURNEY_STEPS = [
  { step: "①", ko: "규격·프리셋 선택", en: "Pick format preset" },
  { step: "②", ko: "바로 그리기", en: "Draw right away" },
  { step: "③", ko: "자동·파일 저장", en: "Auto & file save" },
  { step: "④", ko: "검수·공유", en: "Review & share" },
] as const;

const PRO_STUDIO_LANES = [
  {
    id: "shaper",
    href: "/studio/assets/characters/new",
    iconSrc: "/brand/toonstudio-premium-icons/character.webp",
    koTitle: "3D 캐릭터 셰이퍼",
    enTitle: "3D Character Shaper",
    koBody: "16종 웹툰 체형·얼굴·포즈 제어 후 캔버스 투입",
    enBody: "Tune 16 webtoon proportions, faces & poses for your canvas",
  },
  {
    id: "bg3d",
    href: "/studio/bg3d",
    iconSrc: "/brand/toonstudio-premium-icons/background.webp",
    koTitle: "3D 배경 · LT 선화",
    enTitle: "3D Stage & LT Line Art",
    koBody: "카페·학교·성곽 3D 배치 후 1클릭 흑백 선화 추출",
    enBody: "Stage 3D rooms & streets and extract clean line art in 1 click",
  },
  {
    id: "brush-lab",
    href: "/studio/assets/brushes/new",
    iconSrc: "/brand/toonstudio-premium-icons/assets.webp",
    koTitle: "WGSL 마스터 브러시 랩",
    enTitle: "WGSL Master Brush Lab",
    koBody: "필압 G펜·번짐·스크린톤 커스텀 시필 워크벤치",
    enBody: "Test pressure G-pens, bleed & screentones live on GPU",
  },
  {
    id: "collab",
    href: "/production",
    iconSrc: "/brand/toonstudio-premium-icons/team.webp",
    koTitle: "팀 공동 작업 원고 생성",
    enTitle: "Team Co-work Manuscript",
    koBody: "선화·채색·PD 역할을 미리 지정해 공유 룸 개설",
    enBody: "Assign ink, color & PD roles and open a shared studio room",
  },
  {
    id: "ai-helper",
    href: "/studio/ai-lab",
    iconSrc: "/brand/toonstudio-premium-icons/ai-director.webp",
    koTitle: "AI 연출·구도 도우미",
    enTitle: "AI Direction & Framing Helper",
    koBody: "카메라 투시·시선 동선과 에피소드 리듬 제안",
    enBody: "Get camera perspective, eye-flow & episode pacing suggestions",
  },
  {
    id: "templates",
    href: "/studio/templates",
    iconSrc: "/brand/toonstudio-premium-icons/story.webp",
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

  const safeWidth = Math.min(8000, Math.max(320, Number.isFinite(customWidth) ? customWidth : 800));
  const safeHeight = Math.min(40000, Math.max(320, Number.isFinite(customHeight) ? customHeight : 12800));
  const customStudioHref = `/studio/new?lane=blank&width=${safeWidth}&height=${safeHeight}&dpi=${customDpi}${teamCollab ? "&collab=team" : ""}`;

  const presetCards = [
    {
      id: "webtoon-standard",
      href: "/studio/new?lane=blank&preset=webtoon-standard&width=800&height=12800&dpi=300",
      artSrc: "/brand/lobby-hq-20261003/background-city-768.webp",
      specBadge: bt("800 × 12,800 px · 300 DPI · 세로 스크롤", "800 × 12,800 px · 300 DPI · Vertical scroll"),
      rankBadge: bt("초보자 추천 1위", "Top Beginner Pick"),
      title: bt("네이버·카카오 표준 웹툰", "Standard Vertical Webtoon"),
      body: bt(
        "모바일 가독 폭 가이드와 기본 컷 프레임·선화 레이어가 자동 세팅됩니다.",
        "Pre-configured with mobile reading guides, panel frames, and ink layers.",
      ),
      cta: bt("1클릭 바로 그리기", "Draw in 1 click"),
      primary: true,
    },
    {
      id: "instatoon-square",
      href: "/studio/new?lane=blank&preset=instatoon-square&width=1080&height=1080&dpi=300",
      artSrc: "/brand/lobby-hq-20261003/background-classroom-768.webp",
      specBadge: bt("1,080 × 1,080 px · 최대 10장 슬라이드", "1,080 × 1,080 px · Up to 10 slides"),
      rankBadge: bt("입문 5분 완성", "5-Min Starter"),
      title: bt("인스타툰 · 4컷 일상 만화", "Instatoon · 4-Panel Comic"),
      body: bt(
        "정방형 4컷 분할 격자와 둥근 말풍선 세트가 준비된 가벼운 캔버스로 시작합니다.",
        "Start on a square 4-panel grid with rounded speech balloon presets ready.",
      ),
      cta: bt("4컷 캔버스 열기", "Open 4-panel canvas"),
      primary: false,
    },
    {
      id: "story-script",
      href: storyHref,
      artSrc: "/brand/lobby-hq-20261003/storyboard-768.webp",
      specBadge: bt("대본 · 줄거리 → 자동 컷 배분", "Script & Plot → Auto panel split"),
      rankBadge: bt("스토리 우선", "Story First"),
      title: bt("이야기·웹소설 대본으로 시작", "Start from Story or Webnovel"),
      body: bt(
        "그림이 막막해도 대사·지문만 적으면 페이지별 콘티 박스와 말풍선을 자동 배치합니다.",
        "Write dialogue or notes and let ToonStudio lay out storyboard panels and balloons.",
      ),
      cta: bt("스토리 보드 열기", "Open storyboard flow"),
      primary: false,
    },
    {
      id: "import-psd",
      href: "/studio/import",
      artSrc: "/brand/lobby-hq-20261003/project-crimson-960.webp",
      specBadge: bt("레이어 보존 · PSD / CLIP / TOON", "Layer-safe · PSD / CLIP / TOON"),
      rankBadge: bt("외부 원고 호환", "External File Ready"),
      title: bt("포토샵·클튜 파일 이어그리기", "Continue PSD or Clip File"),
      body: bt(
        "기존 PSD·이미지·백업 아카이브의 레이어를 살려 그대로 불러오거나 팀원과 공유합니다.",
        "Import existing PSDs, images, or archives with layers intact and share with your team.",
      ),
      cta: bt("내 기기에서 파일 열기", "Import from device"),
      primary: false,
    },
  ] as const;

  return (
    <div className="space-y-6" data-testid="create-grand-atelier-v4">
      <section
        aria-label={bt("초보자 1클릭 규격 프리셋", "1-click beginner format presets")}
        data-testid="create-grand-atelier-presets"
        className="rounded-2xl border border-accent/35 bg-gradient-to-br from-panel via-card to-panel p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-3.5">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              <Sparkles size={13} aria-hidden="true" />
              {bt("GRAND ATELIER V4 · 1클릭 첫 캔버스", "GRAND ATELIER V4 · 1-CLICK FIRST CANVAS")}
            </p>
            <h2 className="mt-1 text-base font-bold text-fg sm:text-lg">
              {bt(
                "복잡한 해상도 계산 없이 표준 규격 1클릭으로 바로 그리기를 시작하세요",
                "Skip complex resolution setup and launch a standard webtoon canvas in one click",
              )}
            </h2>
          </div>
          <ol
            aria-label={bt("초보자 완주 4단계", "4-step beginner journey")}
            className="flex flex-wrap items-center gap-1.5 text-xs"
          >
            {BEGINNER_JOURNEY_STEPS.map((item, index) => (
              <li
                key={item.step}
                className={
                  index === 0
                    ? "inline-flex items-center gap-1 rounded-full border border-accent bg-accent/15 px-2.5 py-1 font-bold text-accent"
                    : "inline-flex items-center gap-1 rounded-full border border-line bg-canvas/75 px-2.5 py-1 font-semibold text-fg-2"
                }
              >
                <span>{item.step}</span>
                <span>{bt(item.ko, item.en)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {presetCards.map((card) => (
            <article
              key={card.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-canvas/90 transition-colors hover:border-accent/60"
            >
              <div>
                <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-line/70 bg-panel">
                  <img
                    src={card.artSrc}
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                  <span className="absolute bottom-2 left-2 rounded-md border border-line/80 bg-canvas/90 px-2 py-0.5 text-[11px] font-bold text-fg backdrop-blur-sm">
                    {card.specBadge}
                  </span>
                </div>
                <div className="p-3.5">
                  <span className="inline-flex items-center rounded-full border border-accent/35 bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                    {card.rankBadge}
                  </span>
                  <h3 className="mt-2 text-sm font-bold text-fg sm:text-base">{card.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-2">{card.body}</p>
                </div>
              </div>
              <div className="px-3.5 pb-3.5">
                <Link
                  href={card.href}
                  className={
                    card.primary
                      ? "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-xs font-extrabold text-on-accent transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      : "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-xs font-bold text-fg transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  }
                >
                  <span>{card.cta}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-label={bt("전문 제작 도구 및 세부 규격 빠른 지정", "Pro studio tools and inline canvas setup")}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(19rem,1fr)]"
      >
        <div className="rounded-2xl border border-line bg-panel/65 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
                {bt("전문 아틀리에 바로 진입", "PRO STUDIO DIRECT LAUNCH")}
              </p>
              <h2 className="mt-0.5 text-sm font-bold text-fg sm:text-base">
                {bt(
                  "3D 캐릭터·3D 배경·WGSL 브러시 랩·팀 협업 룸까지 숨김 없이 한눈에 엽니다",
                  "Open 3D Character Shaper, 3D Stage, WGSL Brush Lab, and Team Rooms directly",
              )}
              </h2>
            </div>
            <Link
              href="/studio"
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-canvas px-3 py-2 text-xs font-semibold text-accent hover:border-accent/50"
            >
              {bt("작업실 로비 열기", "Open Studio Lobby")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {PRO_STUDIO_LANES.map((lane) => (
              <Link
                key={lane.id}
                href={lane.href}
                className="flex min-h-11 items-start gap-3 rounded-xl border border-line/85 bg-canvas/90 p-3 transition-colors hover:border-accent/55 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <img
                  src={lane.iconSrc}
                  alt=""
                  aria-hidden="true"
                  width={36}
                  height={36}
                  loading="lazy"
                  decoding="async"
                  className="size-9 shrink-0 rounded-lg border border-line/70 bg-panel object-cover p-0.5"
                />
                <span className="min-w-0 flex-1">
                  <strong className="block text-xs font-bold text-fg">{bt(lane.koTitle, lane.enTitle)}</strong>
                  <span className="mt-0.5 block text-[11px] leading-4 text-fg-2">{bt(lane.koBody, lane.enBody)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div
          data-testid="create-inline-spec-builder"
          className="flex flex-col justify-between rounded-2xl border border-line bg-panel/75 p-4 sm:p-5"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-good">
                  {bt("인라인 빠른 설정", "INLINE QUICK SPEC")}
                </p>
                <h2 className="mt-0.5 text-sm font-bold text-fg sm:text-base">
                  {bt("세부 규격 · 협업 빠른 지정", "Custom Canvas Size & Team Toggle")}
                </h2>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good/10 px-2.5 py-1 text-[11px] font-bold text-good">
                <CheckCircle2 size={12} aria-hidden="true" />
                {bt("3단계 마법사 통합", "1-Screen Setup")}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {bt(
                "원하는 픽셀 폭·높이와 인쇄 해상도, 팀 공동작업을 한 화면에서 바로 지정합니다.",
                "Set custom pixel dimensions, print DPI, and team collaboration on one screen.",
              )}
            </p>

            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <label className="block text-xs font-semibold text-fg-2">
                <span>{bt("폭 (px)", "Width (px)")}</span>
                <input
                  type="number"
                  min={320}
                  max={8000}
                  step={10}
                  value={customWidth}
                  onChange={(event) => setCustomWidth(Number(event.target.value))}
                  aria-label={bt("캔버스 가로 폭 픽셀", "Canvas width in pixels")}
                  className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                />
              </label>
              <label className="block text-xs font-semibold text-fg-2">
                <span>{bt("세로 높이 (px)", "Height (px)")}</span>
                <input
                  type="number"
                  min={320}
                  max={40000}
                  step={100}
                  value={customHeight}
                  onChange={(event) => setCustomHeight(Number(event.target.value))}
                  aria-label={bt("캔버스 세로 높이 픽셀", "Canvas height in pixels")}
                  className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                />
              </label>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                aria-pressed={customDpi === 350}
                onClick={() => setCustomDpi((prev) => (prev === 300 ? 350 : 300))}
                className="inline-flex min-h-11 items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-bold text-fg transition-colors hover:border-accent/50"
              >
                <span>{bt("해상도", "Resolution")}</span>
                <span className="text-accent">{`${customDpi} DPI`}</span>
              </button>
              <button
                type="button"
                aria-pressed={teamCollab}
                onClick={() => setTeamCollab((prev) => !prev)}
                className="inline-flex min-h-11 items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-bold text-fg transition-colors hover:border-accent/50"
              >
                <span className="inline-flex items-center gap-1">
                  <Users size={13} aria-hidden="true" className="text-accent" />
                  {bt("팀 공동작업", "Team Mode")}
                </span>
                <span className={teamCollab ? "text-good" : "text-fg-3"}>
                  {teamCollab ? "ON" : "OFF"}
                </span>
              </button>
            </div>
          </div>

          <Link
            href={customStudioHref}
            data-testid="create-inline-spec-submit"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-good px-4 py-2.5 text-xs font-extrabold text-canvas transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-good"
          >
            <span>{bt("설정한 규격으로 새 작업실 열기", "Open New Studio with Custom Spec")}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
