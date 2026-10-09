import { BookOpen, Bot, Boxes, Brush, ClipboardCheck, FileOutput, Map as MapIcon, PanelsTopLeft, Sparkles, Users, Workflow, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";
import type { WorkflowVisual } from "@/shared/components/site-experience/workflow-illustration";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { IntroPrimaryLink, IntroSecondaryLink, IntroSectionHeading } from "./public/intro-primitives";
import { INTRO_CARD } from "./public/intro-tokens";

const SCOPE = "domains.marketing.StudioIntroNarrative";

interface NarrativeCopy {
  readonly title: string;
  readonly body: string;
  readonly action: string;
}

interface FlowStep {
  readonly art: WorkflowVisual;
  readonly icon: LucideIcon;
  readonly href: string;
  readonly ko: NarrativeCopy;
  readonly en: NarrativeCopy;
}

interface BridgeItem {
  readonly icon: LucideIcon;
  /** 기능별 브랜드 아트 썸네일(기존 브랜드 아트 레지스트리에서 고른 실아트). */
  readonly art: string;
  readonly href: string;
  readonly ko: NarrativeCopy;
  readonly en: NarrativeCopy;
}

const FLOW_STEPS: readonly FlowStep[] = [
  {
    art: "plan", icon: BookOpen, href: "/story-lab",
    ko: { title: "기획·대본", body: "작품 설정, 캐릭터, 시즌, 회차와 대본을 제작 기준으로 정리합니다.", action: "기획 시작" },
    en: { title: "Plan and script", body: "Shape the world, characters, seasons, episodes and scripts as production-ready source material.", action: "Start planning" },
  },
  {
    art: "storyboard", icon: PanelsTopLeft, href: "/studio/new",
    ko: { title: "콘티·컷 구성", body: "대본을 장면과 컷으로 나누고 스크롤 리듬과 연출을 설계합니다.", action: "콘티 만들기" },
    en: { title: "Storyboard and panels", body: "Turn the script into scenes and panels while designing scroll rhythm and direction.", action: "Create a storyboard" },
  },
  {
    art: "create", icon: Brush, href: "/studio",
    ko: { title: "2D·3D 제작", body: "선화·채색·식자와 캐릭터 포즈·배경·카메라를 직접 제작합니다.", action: "작업실 열기" },
    en: { title: "Create in 2D and 3D", body: "Produce line art, color, lettering, character poses, backgrounds and camera compositions.", action: "Open the studio" },
  },
  {
    art: "collaborate", icon: Workflow, href: "/production",
    ko: { title: "일정·협업", body: "역할, 담당자, 선행 작업, 마감과 인수인계를 실제 산출물에 연결합니다.", action: "제작 흐름 보기" },
    en: { title: "Schedule and collaborate", body: "Connect roles, owners, dependencies, deadlines and handoffs to real deliverables.", action: "Open production" },
  },
  {
    art: "review", icon: ClipboardCheck, href: "/production/projects/sample-project/review",
    ko: { title: "검토·승인", body: "고정된 검수본에 의견을 남기고 수정본과 승인본을 정확히 구분합니다.", action: "샘플 검토 체험" },
    en: { title: "Review and approve", body: "Comment on a fixed review version and keep revisions, approvals and releases distinct.", action: "Try sample review" },
  },
  {
    art: "publish", icon: FileOutput, href: "/studio/publish",
    ko: { title: "연재·배포", body: "규격과 권리를 검사하고 모바일 미리보기와 게시본을 준비합니다.", action: "연재 준비" },
    en: { title: "Publish and deliver", body: "Check format and rights, preview mobile reading and prepare a release.", action: "Prepare to publish" },
  },
];

const BRIDGE_ITEMS: readonly BridgeItem[] = [
  {
    icon: Brush, art: "/brand/illustrated-20260928/canvas-noir-640.webp", href: "/studio/canvas",
    ko: { title: "전문 2D 드로잉", body: "브러시·레이어·선택·보정·컷·말풍선·식자를 한 작업실에서.", action: "캔버스 열기" },
    en: { title: "Professional 2D drawing", body: "Brushes, layers, selection, adjustments, panels, balloons and lettering in one workspace.", action: "Open the canvas" },
  },
  {
    icon: Boxes, art: "/brand/illustrated-20260928/character-blue-640.webp", href: "/studio/assets/characters/new",
    ko: { title: "3D 캐릭터·배경", body: "프리셋 캐릭터의 포즈와 3D 배경·카메라 구도를 현재 컷에 연결.", action: "3D 캐릭터 만들기" },
    en: { title: "3D characters and backgrounds", body: "Pose preset characters and connect 3D sets and camera framing to the current panel.", action: "Create a 3D character" },
  },
  {
    icon: Users, art: "/brand/atelier-process-640.webp", href: "/production",
    ko: { title: "협업·제작 관리", body: "담당자·마감·수정 요청·승인을 실제 작업물에 연결.", action: "제작 관리 열기" },
    en: { title: "Collaboration and production", body: "Connect owners, deadlines, revision requests and approvals to the actual work.", action: "Open production" },
  },
  {
    icon: MapIcon, art: "/brand/illustrated-20260928/background-classroom-640.webp", href: "/studio/space",
    ko: { title: "가상 스튜디오", body: "내 캐릭터로 걷고 만나며 팀과 같은 공간에서 작업.", action: "가상 스튜디오 입장" },
    en: { title: "Virtual studio", body: "Walk, meet and work with your team in one shared space as your character.", action: "Enter the virtual studio" },
  },
  {
    icon: Bot, art: "/brand/illustrated-20260928/luna-640.webp", href: "/studio/ai-lab",
    ko: { title: "AI 보조", body: "반복 작업과 아이디어 탐색을 돕고, 적용 여부는 창작자가 결정.", action: "AI 도구 보기" },
    en: { title: "AI assistance", body: "Help with repetition and exploration while the creator decides what is applied.", action: "See AI tools" },
  },
];

/**
 * 소개 히어로 무대 — 첫 화면 전체를 브랜드 아트 장면이 차지하고, 카피와 행동은
 * 아트 위 스크림에 얹힌다. 그림 아래 캡션 바가 시안의 마감 카피 1줄을 겸한다.
 * 이미지를 읽지 못하면 어두운 무대 바탕만 남아 흰 카피가 그대로 읽힌다.
 */
export function StudioIntroHeroStage({
  eyebrow,
  titleId,
  title,
  lede,
  actions,
}: {
  readonly eyebrow: string;
  readonly titleId: string;
  readonly title: string;
  readonly lede: string;
  readonly actions: ReactNode;
}) {
  const bi = useBilingualLocalizer(SCOPE);
  const [failed, setFailed] = useState(false);
  return (
    <figure className="relative flex min-h-[34rem] flex-col justify-end overflow-hidden rounded-[2rem] border border-line/70 bg-[#0d1020] shadow-sm sm:min-h-[36rem]">
      {!failed && (
        <img
          src="/brand/hero-20261009-wave11/studio-intro-world.webp"
          srcSet="/brand/hero-20261009-wave11/studio-intro-world-800.webp 800w, /brand/hero-20261009-wave11/studio-intro-world-1280.webp 1280w, /brand/hero-20261009-wave11/studio-intro-world.webp 2048w"
          sizes="(min-width: 80rem) 76rem, 100vw"
          alt={bi("책상 위 연필 스케치 속 소녀와 고래가 하늘고래와 이야기 도시가 펼쳐지는 세계로 이어지는 브랜드 콘셉트 아트", "Brand concept art of a pencil sketch of a girl and a whale on a desk blooming into a story world with a sky whale and a city of tales")}
          width={2048}
          height={878}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/5" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
      <div className="relative max-w-3xl p-6 text-white sm:p-10 lg:p-12">
        <p className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[0.7rem] font-bold tracking-[0.14em] backdrop-blur-sm">
          {eyebrow}
        </p>
        <h1 id={titleId} className="mt-5 font-display text-4xl font-black leading-[1.12] tracking-[-0.03em] break-keep text-balance sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/85 break-keep text-pretty sm:text-lg">
          {lede}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
      </div>
      <figcaption className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/15 bg-black/45 px-6 py-3 text-white backdrop-blur-sm sm:px-10 lg:px-12">
        <span className="break-keep text-sm font-bold sm:text-base">
          {bi("작은 아이디어가 하나의 세계가 될 때까지.", "From a Small Idea to a World of Your Own.")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/75">
          <Sparkles size={13} aria-hidden="true" />
          {bi("AI로 제작한 브랜드 콘셉트 아트", "AI-generated brand concept art")}
        </span>
      </figcaption>
    </figure>
  );
}

/** 제작 흐름 6단계 카드. 단계마다 기존 워크플로 일러스트 세트를 그대로 쓴다. */
export function StudioIntroFlow() {
  const bi = useBilingualLocalizer(SCOPE);
  return (
    <section id="creator-flow" className="cf-shell mt-14 sm:mt-20" aria-labelledby="creator-process-title">
      <IntroSectionHeading
        id="creator-process-title"
        eyebrow={bi("기획부터 연재까지", "From planning to publishing")}
        title={bi("모든 단계가 다음 작업으로 자연스럽게 이어집니다.", "Every stage leads naturally to the next task.")}
        body={bi("기능마다 새로운 파일과 페이지를 찾지 않아도 됩니다. 하나의 작품 프로젝트가 현재 위치와 다음 행동을 알려줍니다.", "You do not need to hunt through a new page and file for every feature. One project keeps the current context and next action clear.")}
      />
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const copy = bi(step.ko, step.en);
          return (
            <li key={step.art} className={`${INTRO_CARD} grid min-w-0 gap-3 p-4`}>
              <WorkflowIllustration kind={step.art} decorative sizes="(max-width: 640px) 90vw, 400px" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-accent">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={17} className="text-fg-2" aria-hidden="true" />
                <h3 className="min-w-0 break-keep text-base font-bold text-fg">{copy.title}</h3>
              </div>
              <p className="break-keep text-sm leading-6 text-fg-2">{copy.body}</p>
              <Link href={step.href} className="mt-auto inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:text-fg">
                {copy.action}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** 기능 브리지: 기능마다 브랜드 아트 썸네일을 붙인 목록. 이미지가 실패하면 그라디언트+아이콘으로 떨어진다. */
export function StudioIntroBridge() {
  const bi = useBilingualLocalizer(SCOPE);
  return (
    <section id="creator-bridge" className="cf-shell mt-14 sm:mt-20" aria-labelledby="creator-bridge-title">
      <IntroSectionHeading
        id="creator-bridge-title"
        eyebrow={bi("한 프로젝트, 하나의 제작 공간", "One project, one creation space")}
        title={bi("그리기부터 연재 준비까지, 작업이 끊기지 않게.", "Keep the work moving from drawing to publishing.")}
        body={bi("2D 원고, 3D 장면, 협업과 검토가 같은 작품·회차·컷을 가리킵니다. 프로그램 사이에서 파일을 옮기지 않고 한곳에서 이어서 작업하세요.", "2D art, 3D scenes, collaboration and review refer to the same work, episode and panel. Create and continue without moving files between applications.")}
      />
      <ul className="mt-6 grid gap-3 lg:grid-cols-2">
        {BRIDGE_ITEMS.map((item) => (
          <li key={item.href + item.art} className="min-w-0">
            <BridgeRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BridgeRow({ item }: { readonly item: BridgeItem }) {
  const bi = useBilingualLocalizer(SCOPE);
  const [failed, setFailed] = useState(false);
  const Icon = item.icon;
  const copy = bi(item.ko, item.en);
  return (
    <Link href={item.href} className={`${INTRO_CARD} group grid h-full grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4 sm:p-4`}>
      <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-gradient-to-br from-accent-soft via-panel to-canvas" aria-hidden="true">
        {failed ? (
          <span className="grid h-full w-full place-items-center text-accent"><Icon size={26} /></span>
        ) : (
          <img
            src={item.art}
            alt=""
            width={640}
            height={480}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-bold leading-snug text-fg">
          <Icon size={16} className="shrink-0 text-accent" aria-hidden="true" />
          {copy.title}
        </span>
        <span className="mt-1 block break-keep text-sm leading-6 text-fg-2">{copy.body}</span>
        <span className="mt-1.5 block text-sm font-semibold text-accent">{copy.action}</span>
      </span>
    </Link>
  );
}

/** 마감: 소개 서사의 끝 문장과 시작 행동. 소개 여정 페이저는 호출부가 아래에 붙인다. */
export function StudioIntroClosing() {
  const bi = useBilingualLocalizer(SCOPE);
  return (
    <section className="cf-shell mt-14 sm:mt-20" aria-labelledby="creator-closing-title">
      <p className="eyebrow text-accent">ToonStudio</p>
      <h2 id="creator-closing-title" tabIndex={-1} className="mt-2 max-w-3xl text-balance break-keep text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        {bi("작품을 시작하는 순간부터, 독자에게 공개하는 순간까지.", "From the moment a work begins to the moment readers see it.")}
      </h2>
      <p className="mt-3 max-w-[38rem] break-keep text-base leading-7 text-fg-2">
        {bi("대본·콘티·2D·3D·소재·파일·일정·협업·검토와 연재 준비를 하나의 프로젝트에서 끝까지 이어가세요.", "Connect scripts, storyboards, 2D, 3D, assets, files, schedules, collaboration, review and publishing in one project.")}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <IntroPrimaryLink href="/studio/new">{bi("새 작품 시작하기", "Start a new work")}</IntroPrimaryLink>
        <IntroSecondaryLink href="/production/projects/sample-project/overview">{bi("샘플 제작 흐름 보기", "See a sample workflow")}</IntroSecondaryLink>
      </div>
    </section>
  );
}
