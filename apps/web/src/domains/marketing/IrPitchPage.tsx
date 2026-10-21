import { useEffect, useRef, useState } from "react";

import { translateCurrentStaticSourceText, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Clapperboard,
  Cpu,
  Database,
  Handshake,
  Layers,
  Mail,
  Maximize,
  PenTool,
  Presentation,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

import { productTourChapterHref } from "./product-tour-content";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { HeroBlock } from "@/shared/components/layout";
import { Container } from "@/shared/components/section";
import { IntroActions, IntroSectionHeading } from "@/domains/marketing/public/intro-primitives";
import { INTRO_PAGE, INTRO_SECTION } from "@/domains/marketing/public/intro-tokens";

const SCOPE = "domains.marketing.IrPitchPage";

/** IR 컷: 제품 투어(8:24)의 챕터 중 개요·드로잉·3D·제작·마무리를 완결 단위로 발췌한 4:48 편집본. 실제 제품 화면만으로 구성했다. */
const IR_FILM_SRC = "/brand/toonstudio-ir-tour.mp4";
const IR_FILM_POSTER = "/brand/toonstudio-product-tour-poster.jpg";

/** 발표 중 질의가 나오면 전체 투어의 해당 챕터로 바로 점프한다. 시작 초는 product-tour-content의 챕터 정본을 쓴다. */
const CHAPTER_JUMPS = [
  { start: 108, ko: "드로잉", en: "Drawing" },
  { start: 228, ko: "3D 배경", en: "3D sets" },
  { start: 300, ko: "AI 보조", en: "AI assist" },
  { start: 354, ko: "협업·제작 관리", en: "Production" },
] as const;

const PROBLEMS = [
  {
    icon: Layers,
    ko: { title: "도구 파편화", body: "대본, 콘티, 드로잉, 3D, 파일 공유, 일정이 전부 다른 앱에 흩어져 있어요." },
    en: { title: "Fragmented tools", body: "Scripts, storyboards, drawing, 3D, file sharing and schedules — all in different apps." },
  },
  {
    icon: UsersRound,
    ko: { title: "협업 손실", body: "누가 뭘 맡았고, 어떤 피드백이 오갔고, 뭐가 승인됐는지가 메신저와 파일 이름 속에 묻혀요. 그러다 보면 같은 작업을 두 번 하게 됩니다." },
    en: { title: "Collaboration loss", body: "Who owns what, which feedback was given, what got approved — it all sinks into messengers and file names, and the same work gets done twice." },
  },
  {
    icon: ShieldCheck,
    ko: { title: "연재 리스크", body: "회차가 얼마나 진행됐는지, 마감이 위험한지, 플랫폼 규격에 맞는지를 뒤늦게 알게 돼요. 품질도 일정도 흔들립니다." },
    en: { title: "Release risk", body: "You find out too late how far an episode has come, whether the deadline is at risk, or whether the file meets platform specs — and quality and schedule both wobble." },
  },
] as const;

/** 제작 현장의 파편화 지도. 카테고리마다 표준으로 굳은 도구가 따로 있고, 그 사이를 창작자가 오간다. */
const LANDSCAPE = [
  { ko: { category: "전문 드로잉", tools: "클립스튜디오 · 포토샵 · 메디방" }, en: { category: "Pro drawing", tools: "Clip Studio · Photoshop · MediBang" } },
  { ko: { category: "3D 배경·소재", tools: "스케치업 · 에이콘3D · 블렌더" }, en: { category: "3D sets & assets", tools: "SketchUp · Acon3D · Blender" } },
  { ko: { category: "3D 포즈", tools: "Design Doll · Magic Poser" }, en: { category: "3D posing", tools: "Design Doll · Magic Poser" } },
  { ko: { category: "협업·관리", tools: "크레코(CRECO) · 메신저 · 드라이브 · 노션" }, en: { category: "Collaboration", tools: "CRECO · messengers · Drive · Notion" } },
  { ko: { category: "AI 보조", tools: "내 작품을 모르는 생성형 AI" }, en: { category: "AI assist", tools: "Generative AI that knows nothing about your work" } },
] as const;

const FLOW_STEPS = [
  { ko: "기획", en: "Plan" },
  { ko: "대본", en: "Script" },
  { ko: "콘티", en: "Storyboard" },
  { ko: "드로잉", en: "Draw" },
  { ko: "검수", en: "Review" },
  { ko: "연재 준비", en: "Release prep" },
] as const;

/** 제품 역량 다섯 가지. 이미지는 전부 제품 투어 제작 때 찍은 실제 제품 화면 캡처다. */
const CAPABILITIES = [
  {
    id: "drawing",
    image: "/brand/product-tour/03-draw.png",
    href: "/studio/canvas",
    chapterStart: 108,
    icon: PenTool,
    stats: [{ ko: "WebGPU · Vello", en: "WebGPU · Vello" }, { ko: "브러시 226종", en: "226 brushes" }],
    ko: { title: "드로잉 엔진", body: "직접 포팅한 WebGPU 벡터 렌더러(Vello)와 Skia 캔버스 덕분에, 큰 원고도 브라우저에서 바로 다룰 수 있어요. 브러시 226종에 레이어·선택·보정까지 한 화면에 다 있습니다.", cta: "캔버스 열기" },
    en: { title: "Drawing engine", body: "With our own WebGPU vector renderer (Vello) and a Skia canvas, even large manuscripts just work in the browser — 226 brushes, layers, selection and adjustments, all on one screen.", cta: "Open the canvas" },
  },
  {
    id: "three-d",
    image: "/brand/product-tour/05-3d.png",
    href: "/studio/bg3d",
    chapterStart: 228,
    icon: Boxes,
    stats: [{ ko: "테마 팩 42", en: "42 theme packs" }, { ko: "배치 가능 에셋 14,665", en: "14,665 placeable assets" }, { ko: "프리셋 9", en: "9 presets" }],
    ko: { title: "3D 배경·가상 스튜디오", body: "상용 라이선스를 확보한 3D 에셋 번들을 배경 스튜디오에 연결해 뒀어요. 테마 팩 42종에서 골라 배치하고 카메라 구도를 잡으면, 그대로 컷의 밑그림이 됩니다. 가상 스튜디오는 클래식 2D 무대에서 내 캐릭터로 만나 함께 작업하는 공간이에요.", cta: "3D 배경 스튜디오" },
    en: { title: "3D sets & virtual studio", body: "We wired a commercially licensed 3D asset bundle into the background studio: pick from 42 theme packs, place what you need, frame the camera — and it becomes the base of your panel. The virtual studio is a classic 2D stage where you meet and work as your character.", cta: "Open the 3D studio" },
  },
  {
    id: "collaboration",
    image: "/brand/product-tour/07-production.png",
    href: "/production",
    chapterStart: 354,
    icon: UsersRound,
    stats: [{ ko: "Yjs 실시간 동기화", en: "Yjs real-time sync" }],
    ko: { title: "실시간 협업·제작 관리", body: "Yjs로 여럿이 동시에 편집하고, 코멘트와 권한, 승인 기록이 원고에 바로 붙어요. 회차 진행률과 마감도 같은 화면에서 봅니다.", cta: "제작 관리 열기" },
    en: { title: "Real-time collaboration", body: "With Yjs, several people edit at once, and comments, permissions and approvals stick right onto the manuscript. Episode progress and deadlines live on the same screen.", cta: "Open production" },
  },
  {
    id: "ai",
    image: "/brand/product-tour/06-ai.png",
    href: "/studio/ai-lab",
    chapterStart: 300,
    icon: Sparkles,
    stats: [{ ko: "BYOK · 로컬 모델 선택", en: "BYOK · local models" }],
    ko: { title: "Responsible AI", body: "AI는 장면 나누기, 설정이 어긋난 곳 찾기, 규격 검사 같은 반복 일을 도와요. 작품의 방향과 표현, 최종 승인과 권리는 사람이 정합니다. 무엇을 썼는지는 기록에 남고, 무료 모델·내 키(BYOK)·로컬 모델 중에서 고를 수 있어요.", cta: "AI 도구 보기" },
    en: { title: "Responsible AI", body: "AI helps with the repetitive parts — splitting scenes, spotting continuity slips, checking specs. Direction, expression, final approvals and rights stay with people. Everything AI does is recorded, and you choose between free models, your own key (BYOK) and local models.", cta: "See AI tools" },
  },
  {
    id: "local-first",
    image: "/brand/product-tour/01-overview.png",
    href: "/about/technology",
    chapterStart: null,
    icon: Database,
    stats: [{ ko: "OPFS · IndexedDB", en: "OPFS · IndexedDB" }],
    ko: { title: "로컬 우선 데이터", body: "원고는 먼저 내 기기에 저장돼요. 오프라인에서도 작업이 이어지고, 클라우드 동기화는 원할 때만 켭니다. 회차·장면·레이어·피드백이 하나의 제작 기록으로 쌓여요.", cta: "기술 자세히 보기" },
    en: { title: "Local-first data", body: "Your manuscript saves to your own device first. Work carries on offline, and cloud sync only turns on when you want it. Episodes, scenes, layers and feedback build up into one production record.", cta: "Read the engineering hub" },
  },
] as const;

const BUSINESS_MODEL = [
  { ko: { tier: "Free", body: "핵심 제작 흐름을 무료로 써 보고, 로컬 저장과 기본 협업·AI까지" }, en: { tier: "Free", body: "Try the core production flow for free, with local saving and basic collaboration and AI" } },
  { ko: { tier: "Pro", body: "고급 제작 기능, 넉넉한 저장·버전, 귀찮은 일을 줄여 주는 자동화. 월 19,900원은 아직 검증 중인 가격 가설이에요." }, en: { tier: "Pro", body: "Advanced tools, roomier storage and versions, automation that takes over the tedious parts. KRW 19,900 a month is still a pricing hypothesis we are validating." } },
  { ko: { tier: "Team · Education", body: "권한과 공정, 자산을 팀 단위로 관리하고, 교육용으로는 반과 과제를 운영할 수 있어요." }, en: { tier: "Team · Education", body: "Manage permissions, workflow and assets as a team — or run classes and assignments for education" } },
  { ko: { tier: "Marketplace", body: "브러시·소재·3D·템플릿을 사고팔고, 산 것은 제작 화면에 바로 갖다 씁니다. 거래 수수료 모델이에요." }, en: { tier: "Marketplace", body: "Buy and sell brushes, materials, 3D and templates, and use what you bought right in the studio. Revenue comes from transaction fees." } },
] as const;

/** 아래 수치는 성과가 아니라 검증 목표다. */
const VALIDATION_GOALS = [
  { value: "30명", ko: "무료 베타 창작자", en: "Free beta creators" },
  { value: "10명+", ko: "직무별 심층 인터뷰", en: "In-depth interviews by role" },
  { value: "3–6개월", ko: "유료로 쓸 의향 검증", en: "Willingness-to-pay validation" },
] as const;

const ASKS = [
  { ko: "초기 창작자 코호트 연결", en: "Early creator cohort access" },
  { ko: "BM·가격 검증 조언", en: "Advice on model & pricing validation" },
  { ko: "콘텐츠 업계 네트워크", en: "Content industry network" },
  { ko: "후속 투자·정부 지원 연결", en: "Follow-on investment & public programs" },
] as const;

/** 창업자 주요 경력. 출처는 본인 포트폴리오(heejun.cloud)이고, 근무 기간·연도는 사용자 지시로 넣지 않는다. */
const FOUNDER_CAREER = [
  { ko: "배달의민족(우아한형제들) — 주문·결제·장바구니 구조를 설계하고 이끌었어요. 국내에서 처음으로 애플페이 결제를 붙였고, React로 갈아타며 번들을 70% 줄이고 성능은 30% 끌어올렸습니다.", en: "Baemin (Woowa Brothers) — designed and led the order, payment and cart architecture. Shipped Korea's first Apple Pay checkout, and cut the bundle by 70% while improving performance 30% in the move to React." },
  { ko: "스마일게이트 스토브 — 웹서비스개발팀 팀장으로 10명 팀을 이끌며 STOVE 플랫폼을 맡았어요.", en: "Smilegate STOVE — led a 10-person web service team running the STOVE platform." },
  { ko: "삼쩜삼(자비스앤빌런즈) — Tax그룹 FE 챕터 리드로 프론트엔드를 이끌었어요.", en: "Samjjeomsam (Jarvis & Villains) — front-end chapter lead in the Tax group." },
  { ko: "카카오 — 다음 메일 프론트엔드를 만들었어요.", en: "Kakao — built the Daum Mail front-end." },
  { ko: "엔씨소프트 — 모바일 퍼블리싱 플랫폼을 다뤘어요.", en: "NCSOFT — worked on the mobile publishing platform." },
] as const;

export function IrPitchPage() {
  const bi = useBilingualLocalizer(SCOPE);
  const eyebrow = (text: string) => translateCurrentStaticSourceText(SCOPE, "en", text);

  useDocumentTitle(bi("ToonStudio IR · 웹툰 제작 OS 투자 소개", "ToonStudio IR · Investor brief for the webtoon production OS"));

  /* 발표 모드: /product-tour 플레이어와 같은 단축키 UX(←/→ 씬 이동, Space 재생·정지/다음, F 전체화면, Esc 종료).
     ?present=1로 열면 바로 발표 모드로 시작한다. 스크롤 본문은 그대로 두고 씬은 발표용으로 압축한 별도 구성이다. */
  const [presenting, setPresenting] = useState(false);
  const [scene, setScene] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLVideoElement>(null);

  const SCENE_COUNT = 10;
  const FILM_SCENE = 1;
  const goTo = (next: number) => setScene(Math.min(SCENE_COUNT - 1, Math.max(0, next)));

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void overlayRef.current?.requestFullscreen();
    } catch {
      /* 전체화면이 막힌 환경에서는 오버레이만으로 발표를 계속한다. */
    }
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("present")) setPresenting(true);
  }, []);

  useEffect(() => {
    if (!presenting) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresenting(false);
      else if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); goTo(scene + 1); }
      else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); goTo(scene - 1); }
      else if (event.key === "Home") { event.preventDefault(); goTo(0); }
      else if (event.key === "End") { event.preventDefault(); goTo(SCENE_COUNT - 1); }
      else if (event.key === "f" || event.key === "F") toggleFullscreen();
      else if (event.key === " ") {
        event.preventDefault();
        if (scene === FILM_SCENE && filmRef.current) {
          if (filmRef.current.paused) void filmRef.current.play();
          else filmRef.current.pause();
        } else goTo(scene + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [presenting, scene]);

  const sceneTitle = (index: number): string => [
    bi("표지", "Cover"),
    bi("IR 영상", "IR film"),
    bi("문제", "Problem"),
    bi("경쟁 지형", "Landscape"),
    bi("솔루션", "Solution"),
    bi("차별화", "Differentiation"),
    bi("제품 역량", "Product"),
    bi("시장", "Market"),
    bi("비즈니스 모델·검증", "Model & validation"),
    bi("창업자·Ask", "Founder & ask"),
  ][index] ?? "";

  const bigTitle = "text-balance font-display text-4xl font-black leading-tight tracking-tight text-fg sm:text-5xl lg:text-6xl";
  const sceneShell = "mx-auto grid w-full max-w-6xl content-center gap-8 px-6 py-16 sm:px-10";

  /** 발표 씬 10개. 본문 섹션을 발표용 큰 글자·압축 문안으로 다시 구성한 것이라 수치·표기는 본문과 같다. */
  const scenes = [
    (
      <div key="cover" className={sceneShell}>
        <p className="eyebrow text-accent">IR · TOONSTUDIO</p>
        <h2 className={bigTitle}>{bi("웹툰의 기획부터 연재 준비까지, 흩어진 제작 도구와 협업 과정을 브라우저 하나로 연결합니다.", "From planning to release prep, ToonStudio connects the scattered tools and collaboration of webtoon production in one browser.")}</h2>
        <p className="text-xl font-semibold text-fg-2">{bi("지금 toonstudio.cloud에서 돌아가고 있는 웹툰 제작 OS예요 · 김희준 Founder", "A webtoon production OS, already live at toonstudio.cloud · Heejun Kim, Founder")}</p>
      </div>
    ),
    (
      <div key="film" className={sceneShell}>
        <p className="eyebrow text-accent">IR FILM · 4:48</p>
        <video ref={filmRef} className="aspect-video w-full rounded-2xl border border-line/70 bg-panel object-cover" src={IR_FILM_SRC} poster={IR_FILM_POSTER} controls playsInline aria-label={bi("ToonStudio IR 영상", "ToonStudio IR film")} />
        <p className="text-lg text-fg-2">{bi("제품 투어에서 실제 화면만 골라 담은 IR 컷이에요. Space를 누르면 재생·정지합니다.", "An IR cut made only of real product screens from the tour. Press Space to play or pause.")}</p>
      </div>
    ),
    (
      <div key="problem" className={sceneShell}>
        <p className="eyebrow text-accent">PROBLEM</p>
        <h2 className={bigTitle}>{bi("창작자는 작품보다 도구 사이의 빈틈에 시간을 씁니다.", "Creators spend more time between tools than on the work itself.")}</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {PROBLEMS.map((problem) => {
            const copy = bi(problem.ko, problem.en);
            return (
              <li key={problem.en.title} className="rounded-2xl border border-line/70 bg-card/65 p-5">
                <h3 className="font-display text-xl font-black text-fg">{copy.title}</h3>
                <p className="mt-2 text-base leading-7 text-fg-2">{copy.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    ),
    (
      <div key="landscape" className={sceneShell}>
        <p className="eyebrow text-accent">LANDSCAPE</p>
        <h2 className={bigTitle}>{bi("좋은 도구들은 이미 있습니다. 다만, 나뉘어 있습니다.", "Good tools already exist — they are just split apart.")}</h2>
        <ul className="grid gap-2">
          {LANDSCAPE.map((row) => {
            const copy = bi(row.ko, row.en);
            return (
              <li key={row.en.category} className="flex flex-wrap items-baseline gap-x-4 rounded-2xl border border-line/70 bg-card/65 px-5 py-3.5">
                <span className="w-32 shrink-0 font-display text-base font-black text-fg">{copy.category}</span>
                <span className="text-base text-fg-2">{copy.tools}</span>
              </li>
            );
          })}
        </ul>
        <p className="max-w-4xl text-lg leading-8 text-fg-2">{bi("가장 가까운 경쟁자 크레코는 완성된 결과물을 관리하는 허브, ToonStudio는 만드는 도구 자체가 들어 있는 통합 제작 OS예요.", "The closest competitor, CRECO, manages finished outputs; ToonStudio has the creation tools themselves built in.")}</p>
      </div>
    ),
    (
      <div key="flow" className={sceneShell}>
        <p className="eyebrow text-accent">SOLUTION</p>
        <h2 className={bigTitle}>{bi("작품·회차·장면을 중심으로 전 공정을 한 흐름으로.", "Every stage connects around the work, its episodes and its scenes.")}</h2>
        <ol className="flex flex-wrap items-center gap-3" aria-label={bi("제작 파이프라인", "Production pipeline")}>
          {FLOW_STEPS.map((step, index) => (
            <li key={step.en} className="inline-flex items-center gap-3">
              <span className="inline-flex min-h-14 items-center rounded-full border border-accent/40 bg-accent-soft/25 px-6 font-display text-xl font-black text-fg">{bi(step.ko, step.en)}</span>
              {index < FLOW_STEPS.length - 1 ? <ArrowRight size={20} className="text-accent" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
        <p className="text-lg text-fg-2">{bi("앞 단계에서 만든 게 다음 단계로 그대로 넘어갑니다.", "What you make in one stage carries straight into the next.")}</p>
      </div>
    ),
    (
      <div key="difference" className={sceneShell}>
        <p className="eyebrow text-accent">DIFFERENTIATION</p>
        <h2 className={bigTitle}>{bi("네 가지 차별화", "Four points of difference")}</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {[
            { ko: "아직 비어 있는 자리 — 브라우저에서 전문 드로잉 + 전 공정 통합", en: "A position still open — pro drawing + full process, in a browser" },
            { ko: "전문 브러시 226종 · WebGPU 스트로크 렌더링", en: "226 pro brushes · WebGPU stroke rendering" },
            { ko: "1인부터 소규모 팀까지 한곳에서 협업 (대규모는 설계·로드맵)", en: "Collaboration in one place, solo to small teams (large studios: design & roadmap)" },
            { ko: "회차-공정-담당-승인, 웹툰식 분업을 그대로 내장", en: "Episodes, processes, owners, approvals — the webtoon way, built in" },
          ].map((item) => (
            <li key={item.en} className="rounded-2xl border border-line/70 bg-card/65 p-6 font-display text-xl font-black leading-snug text-fg">{bi(item.ko, item.en)}</li>
          ))}
        </ul>
      </div>
    ),
    (
      <div key="product" className={sceneShell}>
        <p className="eyebrow text-accent">PRODUCT</p>
        <h2 className={bigTitle}>{bi("계획이 아니에요. 이미 돌아가고 있는 제품입니다.", "This is not a plan. The product is already running.")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map((capability) => {
            const copy = bi(capability.ko, capability.en);
            return (
              <li key={capability.id} className="grid overflow-hidden rounded-2xl border border-line/70 bg-card/65">
                <img src={capability.image} alt="" width={1280} height={720} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
                <div className="grid gap-1.5 p-4">
                  <h3 className="font-display text-lg font-black text-fg">{copy.title}</h3>
                  <p className="text-sm font-bold text-accent">{capability.stats.map((stat) => bi(stat.ko, stat.en)).join(" · ")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    ),
    (
      <div key="market" className={sceneShell}>
        <p className="eyebrow text-accent">MARKET</p>
        <h2 className={bigTitle}>{bi("웹툰 시장, 이미 크고 더 빠르게 자라고 있어요.", "The webtoon market is already big — and growing faster.")}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-3xl border border-line/70 bg-card/65 p-6">
            <p className="font-display text-5xl font-black tracking-tight text-fg">{bi("2조 2,856억 원", "KRW 2.2856T")}</p>
            <p className="mt-2 font-bold text-fg">{bi("2024년 국내 웹툰 산업 매출 (문체부·콘진원 실태조사)", "Korean webtoon industry revenue, 2024 (MCST · KOCCA survey)")}</p>
          </div>
          <div className="rounded-3xl border border-line/70 bg-card/65 p-6">
            <p className="font-display text-5xl font-black tracking-tight text-fg">{bi("약 102억 → 427억~453억 달러", "$10.2B → $42.7–45.3B")}</p>
            <p className="mt-2 font-bold text-fg">{bi("글로벌 시장 2024 → 2030 전망 · 연평균 약 27% (복수 기관 추정치)", "Global market 2024 → 2030 · about 27% CAGR (multiple research estimates)")}</p>
          </div>
        </div>
        <p className="max-w-4xl text-lg leading-8 text-fg-2">{bi("제작 표준 도구는 전부 외산이고, 국산 전문 제작 코어는 비어 있어요(구조 산정). 그 빈자리가 ToonStudio의 자리입니다.", "Every standard production tool is foreign, and the Korean professional core is empty (structural estimate). That gap is ToonStudio's position.")}</p>
      </div>
    ),
    (
      <div key="model" className={sceneShell}>
        <p className="eyebrow text-accent">BUSINESS MODEL & VALIDATION</p>
        <h2 className={bigTitle}>{bi("개인 창작자에서 시작해 팀·교육·마켓으로.", "Starting with solo creators, then teams, education and a marketplace.")}</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {BUSINESS_MODEL.map((model) => {
            const copy = bi(model.ko, model.en);
            return (
              <li key={copy.tier} className="rounded-2xl border border-line/70 bg-card/65 p-5">
                <h3 className="font-display text-lg font-black text-fg">{copy.tier}</h3>
                <p className="mt-1 text-sm leading-6 text-fg-2">{copy.body}</p>
              </li>
            );
          })}
        </ul>
        <ul className="flex flex-wrap gap-x-8 gap-y-2">
          {VALIDATION_GOALS.map((goal) => (
            <li key={goal.en} className="flex items-baseline gap-3">
              <span className="font-display text-3xl font-black text-fg">{goal.value}</span>
              <span className="font-semibold text-fg-2">{bi(goal.ko, goal.en)} <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs font-bold text-accent">{bi("목표", "Goal")}</span></span>
            </li>
          ))}
        </ul>
      </div>
    ),
    (
      <div key="ask" className={sceneShell}>
        <p className="eyebrow text-accent">FOUNDER & ASK</p>
        <h2 className={bigTitle}>{bi("창작자가 작품에만 집중할 수 있는 제작 기반을 만들겠습니다.", "We are building the production foundation that lets creators focus only on their work.")}</h2>
        <p className="text-xl font-semibold text-fg-2">{bi("김희준 · Founder — 배달의민족·스마일게이트·삼쩜삼·카카오·엔씨소프트를 거친 18년차 개발자예요. 설계부터 배포까지 직접 만듭니다.", "Heejun Kim · Founder — an 18-year developer who came through Baemin, Smilegate, Samjjeomsam, Kakao and NCSOFT, building everything from design to deployment himself.")}</p>
        <ul className="flex flex-wrap gap-2">
          {ASKS.map((ask) => (
            <li key={ask.en} className="rounded-full border border-line/70 bg-panel px-4 py-2.5 font-display text-base font-bold text-fg">{bi(ask.ko, ask.en)}</li>
          ))}
        </ul>
        <p className="text-lg font-semibold text-fg-2">toonstudio.cloud · blue45f@gmail.com</p>
      </div>
    ),
  ];

  return (
    <Container size="wide" className={INTRO_PAGE}>
      <HeroBlock
        eyebrow="IR · TOONSTUDIO"
        title={bi(
          "웹툰의 기획부터 연재 준비까지, 흩어진 제작 도구와 협업 과정을 브라우저 하나로 연결합니다.",
          "From planning to release prep, ToonStudio connects the scattered tools and collaboration of webtoon production in one browser.",
        )}
        lede={bi(
          "ToonStudio는 지금 toonstudio.cloud에서 실제로 돌아가고 있는 웹툰 제작 OS예요. 이 페이지에 나오는 영상과 화면은 전부 실제 제품에서 가져왔습니다.",
          "ToonStudio is a webtoon production OS, already live at toonstudio.cloud. Every film and screen on this page comes straight from the real product.",
        )}
        actions={(
          <div className="grid gap-3">
            <IntroActions
              primary={{ href: "/product-tour", label: bi("8분 전체 제품 투어 보기", "Watch the full 8-minute tour"), icon: CirclePlay }}
              secondary={{ href: "/about", label: bi("서비스 소개 보기", "About the service") }}
            />
            <button
              type="button"
              onClick={() => { setScene(0); setPresenting(true); }}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-accent/50 bg-accent-soft/30 px-4 py-2.5 text-sm font-bold text-accent transition-colors hover:bg-accent-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Presentation size={16} aria-hidden="true" />
              {bi("발표 모드로 열기 (풀스크린 · ←/→ · Space)", "Present full-screen (←/→ · Space)")}
            </button>
          </div>
        )}
        media={(
          <figure className="grid gap-3">
            <video
              className="aspect-video w-full rounded-2xl border border-line/70 bg-panel object-cover"
              src={IR_FILM_SRC}
              poster={IR_FILM_POSTER}
              controls
              preload="none"
              playsInline
              aria-label={bi("ToonStudio IR 영상 (4분 48초)", "ToonStudio IR film (4 minutes 48 seconds)")}
            />
            <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                <Clapperboard size={15} className="text-accent" aria-hidden="true" />
                {bi("IR 컷 4:48 — 제품 투어에서 실제 화면 챕터만 골라 붙였어요.", "IR cut, 4:48 — stitched from real-screen chapters of the product tour.")}
              </span>
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                {CHAPTER_JUMPS.map((chapter) => (
                  <Link key={chapter.start} href={productTourChapterHref(chapter.start)} className="inline-flex min-h-8 items-center gap-1 font-semibold text-accent hover:text-accent-2">
                    {bi(chapter.ko, chapter.en)}<ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ))}
              </span>
            </figcaption>
          </figure>
        )}
      />

      <section className={INTRO_SECTION} aria-labelledby="ir-problem-title">
        <IntroSectionHeading
          id="ir-problem-title"
          eyebrow={eyebrow("PROBLEM")}
          title={bi("창작자는 작품보다 도구 사이의 빈틈에 시간을 씁니다.", "Creators spend more time between tools than on the work itself.")}
          body={bi("결국 문제는 기능이 부족해서가 아니에요. 제작 흐름이 중간에 끊기는 게 문제입니다.", "In the end it is not about missing features. The problem is the flow breaking in the middle.")}
        />
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {PROBLEMS.map((problem) => {
            const Icon = problem.icon;
            const copy = bi(problem.ko, problem.en);
            return (
              <li key={problem.en.title} className="rounded-2xl border border-line/70 bg-card/65 p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden="true" /></span>
                <h3 className="mt-3 break-keep font-display text-lg font-black text-fg">{copy.title}</h3>
                <p className="mt-1.5 break-keep text-sm leading-6 text-fg-2">{copy.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-landscape-title">
        <IntroSectionHeading
          id="ir-landscape-title"
          eyebrow={eyebrow("LANDSCAPE")}
          title={bi("좋은 도구들은 이미 있습니다. 다만, 나뉘어 있습니다.", "Good tools already exist — they are just split apart.")}
        />
        <ul className="mt-5 grid gap-2">
          {LANDSCAPE.map((row) => {
            const copy = bi(row.ko, row.en);
            return (
              <li key={row.en.category} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border border-line/70 bg-card/65 px-5 py-3.5">
                <span className="w-28 shrink-0 font-display text-sm font-black text-fg">{copy.category}</span>
                <span className="break-keep text-sm text-fg-2">{copy.tools}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 max-w-3xl break-keep text-sm leading-7 text-fg-2">
          {bi(
            "가장 가까운 경쟁자는 협업 플랫폼 크레코(CRECO)예요. 대형 제작사들이 베타로 써 보며 다져진 곳이라, 완성된 결과물의 버전·피드백·권한을 관리하는 데 강합니다. ToonStudio는 그보다 한 단계 앞을 봅니다. 드로잉·3D·콘티·AI 도구 자체가 안에 들어 있어서, 만드는 과정이 곧 관리 기록이 되는 통합 제작 OS예요.",
            "The closest competitor is CRECO, a collaboration platform hardened by beta testing with large studios — it is strong at managing versions, feedback and permissions for finished outputs. ToonStudio looks one step earlier: the drawing, 3D, storyboard and AI tools live inside, so the act of making is itself the management record.",
          )}
        </p>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-flow-title">
        <IntroSectionHeading
          id="ir-flow-title"
          eyebrow={eyebrow("SOLUTION")}
          title={bi("전 공정이 작품 하나를 중심으로 한 흐름으로 이어집니다.", "One work, one unbroken flow through every stage.")}
          body={bi("앞 단계에서 만든 게 다음 단계로 그대로 넘어갑니다. 역할마다 보는 화면은 달라도, 작품 정보는 하나로 이어져요.", "What you make in one stage carries straight into the next. Each role sees a different screen, but the work itself stays one.")}
        />
        <ol className="mt-5 flex flex-wrap items-center gap-2" aria-label={bi("제작 파이프라인", "Production pipeline")}>
          {FLOW_STEPS.map((step, index) => (
            <li key={step.en} className="inline-flex items-center gap-2">
              <span className="inline-flex min-h-11 items-center rounded-full border border-line/70 bg-card/65 px-4 font-display text-sm font-black text-fg">
                {bi(step.ko, step.en)}
              </span>
              {index < FLOW_STEPS.length - 1 ? <ArrowRight size={15} className="text-accent" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-difference-title">
        <IntroSectionHeading
          id="ir-difference-title"
          eyebrow={eyebrow("DIFFERENTIATION")}
          title={bi("네 가지 차별화", "Four points of difference")}
        />
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            {
              ko: { title: "아직 비어 있는 자리", body: "전문 도구는 데스크톱 앱에 있고, 협업 도구는 결과물을 관리하는 허브에 머물러 있어요. 브라우저에서 전문 드로잉부터 전 공정을 하나로 합친 자리는 아직 비어 있습니다." },
              en: { title: "A position still open", body: "Pro tools live in desktop apps, and collaboration tools stop at managing outputs. Nobody has yet put pro drawing and the whole process together in a browser." },
            },
            {
              ko: { title: "전문 브러시 226종 · WebGPU 스트로크 렌더링", body: "직접 포팅한 WebGPU 벡터 렌더러(Vello)가 획을 GPU로 그려 줘서, 브라우저에서도 전문 브러시의 질감과 속도가 그대로 나와요." },
              en: { title: "226 pro brushes · WebGPU stroke rendering", body: "Our own WebGPU vector renderer (Vello) draws strokes on the GPU, so professional brush feel and speed hold up right in the browser." },
            },
            {
              ko: { title: "1인부터 팀까지, 한곳에서 협업", body: "지금은 1인 작가와 소규모 팀이 실제로 연재하는 흐름에 맞춰 설계하고 검증하고 있어요. 대규모 스튜디오로 넓히는 건 같은 구조를 키우는 일이라, 지원 설계와 로드맵 단계로 구분해 둡니다." },
              en: { title: "Collaboration in one place, from solo to team", body: "Right now we design and validate around how solo creators and small teams actually publish. Growing to large studios means scaling the same structure — we keep that clearly marked as support design and roadmap." },
            },
            {
              ko: { title: "회차-공정-담당-승인, 웹툰식 분업 그대로", body: "웹툰 팀이 일하는 방식 그대로, 회차·공정·담당자·승인을 제품 구조에 넣었어요. 팀이 커져도 흐름이 흐트러지지 않습니다." },
              en: { title: "Division of labor, the webtoon way", body: "Episodes, processes, owners and approvals are built into the product, exactly the way webtoon teams already work — so the flow holds as the team grows." },
            },
          ].map((item) => {
            const copy = bi(item.ko, item.en);
            return (
              <li key={item.en.title} className="rounded-2xl border border-line/70 bg-card/65 p-5">
                <h3 className="break-keep font-display text-base font-black text-fg">{copy.title}</h3>
                <p className="mt-1.5 break-keep text-sm leading-6 text-fg-2">{copy.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-product-title">
        <IntroSectionHeading
          id="ir-product-title"
          eyebrow={eyebrow("PRODUCT")}
          title={bi("계획이 아니에요. 이미 돌아가고 있는 제품입니다.", "This is not a plan. The product is already running.")}
        />
        <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon;
            const copy = bi(capability.ko, capability.en);
            return (
              <li key={capability.id} className="grid overflow-hidden rounded-2xl border border-line/70 bg-card/65">
                <img src={capability.image} alt="" width={1280} height={720} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
                <div className="grid gap-2 p-5">
                  <h3 className="flex items-center gap-2 break-keep font-display text-lg font-black text-fg">
                    <Icon size={18} className="shrink-0 text-accent" aria-hidden="true" />{copy.title}
                  </h3>
                  <p className="break-keep text-sm leading-6 text-fg-2">{copy.body}</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label={bi("핵심 수치와 기술", "Key figures and technologies")}>
                    {capability.stats.map((stat) => (
                      <li key={stat.en} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">{bi(stat.ko, stat.en)}</li>
                    ))}
                  </ul>
                  <Link href={capability.href} className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-accent hover:text-accent-2">
                    {copy.cta}<ArrowRight size={14} aria-hidden="true" />
                  </Link>
                  {capability.chapterStart !== null ? (
                    <Link href={productTourChapterHref(capability.chapterStart)} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-fg">
                      <CirclePlay size={14} className="text-accent" aria-hidden="true" />{bi("투어에서 이 장면 보기", "Watch this in the tour")}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-market-title">
        <IntroSectionHeading id="ir-market-title" eyebrow={eyebrow("MARKET")} title={bi("웹툰 시장, 이미 크고 더 빠르게 자라고 있어요.", "The webtoon market is already big — and growing faster.")} />
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-3xl border border-line/70 bg-card/65 p-6 sm:p-8">
            <p className="font-display text-5xl font-black tracking-tight text-fg">{bi("2조 2,856억 원", "KRW 2.2856T")}</p>
            <p className="mt-2 break-keep font-bold text-fg">{bi("2024년 국내 웹툰 산업 매출", "South Korean webtoon industry revenue, 2024")}</p>
          </div>
          <div className="rounded-3xl border border-line/70 bg-card/65 p-6 sm:p-8">
            <p className="font-display text-5xl font-black tracking-tight text-fg">{bi("약 102억 달러 → 427억~453억 달러", "$10.2B → $42.7–45.3B")}</p>
            <p className="mt-2 break-keep font-bold text-fg">{bi("글로벌 웹툰 시장 2024년 → 2030년 전망 (연평균 약 27% 성장, 복수 시장조사 기관 추정치)", "Global webtoon market, 2024 → 2030 forecast (about 27% CAGR, estimates by multiple research firms)")}</p>
          </div>
        </div>
        <p className="mt-4 max-w-3xl break-keep text-sm leading-7 text-fg-2">
          {bi(
            "그런데 정작 웹툰 종주국인 한국에서 제작 표준은 일본 셀시스의 클립스튜디오예요(누적 5,000만 부 — 2025년 4월 공식 발표, 구독 ARR 46억 엔 초과). 이름난 드로잉 툴을 놓고 보면 클립스튜디오(일본), 포토샵(미국), 프로크리에이트(호주), 메디방/이비스(일본)까지 전부 외산이고, 국산 전문 드로잉 툴은 없어요. 공식 점유율 통계가 따로 없어 구조로 어림잡은 수치지만, 전문 드로잉 코어는 사실상 전부 외산이고 국산은 0%에 가깝습니다. 국산 도구는 협업이나 소재 같은 주변에 머물러 있고, 기획부터 연재까지 잇는 제작 중심은 비어 있어요. ToonStudio가 들어가려는 자리가 여기입니다.",
            "And yet, in Korea — the home of webtoons — the production standard is Japan's Clip Studio by Celsys (50 million copies cumulative, officially announced April 2025; subscription ARR above JPY 4.6 billion). Line up the well-known drawing tools and they are all foreign: Clip Studio (Japan), Photoshop (US), Procreate (Australia), MediBang/ibis (Japan). There is no Korean professional drawing tool. There are no official share statistics, so this is a structural estimate — but the pro drawing core is effectively all foreign, and the Korean share is close to zero. Korean tools stay around the edges, in collaboration and assets, while the production core from planning to release sits empty. That is exactly where ToonStudio aims to be.",
          )}
        </p>
        <p className="mt-2 text-xs leading-5 text-fg-3">
          {bi("출처: 문화체육관광부·한국콘텐츠진흥원 「2025 웹툰 산업 실태조사」 · 글로벌 시장 규모는 복수 시장조사 기관 추정치 · 클립스튜디오 수치는 셀시스 공식 발표(2025년 4월)", "Sources: MCST · KOCCA, 2025 Webtoon Industry Survey · global market size estimated by multiple research firms · Clip Studio figures from Celsys' official announcement (April 2025)")}
        </p>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-model-title">
        <IntroSectionHeading id="ir-model-title" eyebrow={eyebrow("BUSINESS MODEL & VALIDATION")} title={bi("개인 창작자에서 시작해 팀·교육·마켓으로 넓혀 갑니다.", "Starting with solo creators, then teams, education and a marketplace.")} />
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <ul className="grid gap-3">
            {BUSINESS_MODEL.map((model) => {
              const copy = bi(model.ko, model.en);
              return (
                <li key={copy.tier} className="rounded-2xl border border-line/70 bg-card/65 p-5">
                  <h3 className="font-display text-base font-black text-fg">{copy.tier}</h3>
                  <p className="mt-1 break-keep text-sm leading-6 text-fg-2">{copy.body}</p>
                </li>
              );
            })}
          </ul>
          <div className="rounded-2xl border border-accent/35 bg-accent-soft/25 p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-display text-base font-black text-fg">
              <Cpu size={17} className="text-accent" aria-hidden="true" />
              {bi("검증 로드맵 — 아래 숫자는 성과가 아니라 목표예요", "Validation roadmap — these numbers are goals, not results")}
            </h3>
            <ul className="mt-4 grid gap-4">
              {VALIDATION_GOALS.map((goal) => (
                <li key={goal.en} className="flex items-baseline gap-4">
                  <span className="font-display text-3xl font-black tracking-tight text-fg">{goal.value}</span>
                  <span className="break-keep text-sm font-semibold text-fg-2">
                    {bi(goal.ko, goal.en)}
                    <span className="ml-2 rounded-full border border-accent/40 px-2 py-0.5 text-xs font-bold text-accent">{bi("목표", "Goal")}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 break-keep text-sm leading-6 text-fg-2">
              {bi("먼저 작은 창작팀이 실제로 연재하는 현장에서 써 보게 할 거예요. 역할마다 어디서 막히는지, 얼마면 쓸지를 코호트별로 확인할 계획입니다.", "First, small creator teams will use it in their real publishing flow. Then we check, cohort by cohort, where each role gets stuck and what they would pay.")}
            </p>
          </div>
        </div>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-founder-title">
        <IntroSectionHeading id="ir-founder-title" eyebrow={eyebrow("FOUNDER & ASK")} title={bi("직접 만드는 창업자라, 검증이 빠릅니다.", "The founder builds it himself — so validation moves fast.")} />
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-line/70 bg-card/65 p-5 sm:p-6">
            <p className="font-display text-xl font-black text-fg">{bi("김희준 · Founder", "Heejun Kim · Founder")}</p>
            <p className="mt-2 break-keep text-sm leading-6 text-fg-2">
              {bi("18년차 개발자예요. 제품 설계부터 프론트엔드, 인프라, AI 연결, 테스트 자동화까지 혼자 다 만들고, 프로토타입을 실제 서비스로 키워 왔어요.", "A developer of 18 years. He builds everything himself — product design, front-end, infrastructure, AI wiring, test automation — and has grown the prototype into a live service.")}
            </p>
            <ul className="mt-4 grid gap-2.5 border-t border-line/60 pt-4">
              {FOUNDER_CAREER.map((career) => (
                <li key={career.en} className="break-keep text-sm leading-6 text-fg-2">{bi(career.ko, career.en)}</li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-fg-2">
              <span>toonstudio.cloud</span>
              <a href="mailto:blue45f@gmail.com" className="inline-flex items-center gap-1.5 text-accent hover:text-accent-2">
                <Mail size={14} aria-hidden="true" />blue45f@gmail.com
              </a>
            </p>
          </div>
          <div className="rounded-2xl border border-line/70 bg-card/65 p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-display text-base font-black text-fg">
              <Handshake size={17} className="text-accent" aria-hidden="true" />
              {bi("지금 이런 연결을 찾고 있어요", "What we are looking for now")}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {ASKS.map((ask) => (
                <li key={ask.en} className="rounded-full border border-line/70 bg-panel px-3.5 py-2 text-sm font-bold text-fg">{bi(ask.ko, ask.en)}</li>
              ))}
            </ul>
            <p className="mt-4 break-keep font-display text-lg font-black leading-snug text-fg">
              {bi("창작자가 작품에만 집중할 수 있는 제작 기반을 만들겠습니다.", "We are building the production foundation that lets creators focus only on their work.")}
            </p>
          </div>
        </div>
      </section>

      {presenting ? (
        <div ref={overlayRef} className="fixed inset-0 z-[100] flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label={bi("IR 발표 모드", "IR presentation mode")}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-8">
            <p className="text-sm font-bold text-fg-2">
              {sceneTitle(scene)} <span className="text-fg-3">· {scene + 1} / {SCENE_COUNT}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={toggleFullscreen} aria-label={bi("전체화면 전환", "Toggle full screen")} className="grid size-10 place-items-center rounded-xl border border-line/70 text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <Maximize size={17} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setPresenting(false)} aria-label={bi("발표 모드 종료", "Exit presentation mode")} className="grid size-10 place-items-center rounded-xl border border-line/70 text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="h-1 shrink-0 bg-line/50" aria-hidden="true">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${((scene + 1) / SCENE_COUNT) * 100}%` }} />
          </div>
          <div className="relative flex-1 overflow-y-auto">
            {scenes[scene]}
            <button type="button" onClick={() => goTo(scene - 1)} disabled={scene === 0} aria-label={bi("이전 씬", "Previous scene")} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-line/70 bg-card/70 text-fg-2 transition-opacity hover:text-fg disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => goTo(scene + 1)} disabled={scene === SCENE_COUNT - 1} aria-label={bi("다음 씬", "Next scene")} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-line/70 bg-card/70 text-fg-2 transition-opacity hover:text-fg disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
          <p className="shrink-0 px-5 py-3 text-center text-xs text-fg-3 sm:px-8">
            {bi("←/→ 씬 이동 · Space 재생·정지/다음 · F 전체화면 · Esc 종료", "←/→ scenes · Space play-pause/next · F full screen · Esc exit")}
          </p>
        </div>
      ) : null}
    </Container>
  );
}
