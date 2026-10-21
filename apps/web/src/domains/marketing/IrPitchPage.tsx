import { translateCurrentStaticSourceText, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  Boxes,
  CirclePlay,
  Clapperboard,
  Cpu,
  Database,
  Handshake,
  Layers,
  Mail,
  PenTool,
  ShieldCheck,
  Sparkles,
  UsersRound,
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
    ko: { title: "도구 파편화", body: "대본, 콘티, 드로잉, 3D, 파일 공유, 일정 관리가 서로 다른 앱에 분산됩니다." },
    en: { title: "Fragmented tools", body: "Scripts, storyboards, drawing, 3D, file sharing and schedules live in separate apps." },
  },
  {
    icon: UsersRound,
    ko: { title: "협업 손실", body: "역할·권한·피드백·승인 이력이 메신저와 파일명에 흩어져 재작업이 반복됩니다." },
    en: { title: "Collaboration loss", body: "Roles, permissions, feedback and approvals scatter across messengers and file names, so work is redone." },
  },
  {
    icon: ShieldCheck,
    ko: { title: "연재 리스크", body: "회차별 진행률과 마감 위험, 플랫폼 규격을 늦게 발견해 품질과 일정이 흔들립니다." },
    en: { title: "Release risk", body: "Episode progress, deadline risk and platform specs surface too late, shaking quality and schedule." },
  },
] as const;

/** 제작 현장의 파편화 지도. 카테고리마다 표준으로 굳은 도구가 따로 있고, 그 사이를 창작자가 오간다. */
const LANDSCAPE = [
  { ko: { category: "전문 드로잉", tools: "클립스튜디오 · 포토샵 · 메디방" }, en: { category: "Pro drawing", tools: "Clip Studio · Photoshop · MediBang" } },
  { ko: { category: "3D 배경·소재", tools: "스케치업 · 에이콘3D · 블렌더" }, en: { category: "3D sets & assets", tools: "SketchUp · Acon3D · Blender" } },
  { ko: { category: "3D 포즈", tools: "Design Doll · Magic Poser" }, en: { category: "3D posing", tools: "Design Doll · Magic Poser" } },
  { ko: { category: "협업·관리", tools: "크레코(CRECO) · 메신저 · 드라이브 · 노션" }, en: { category: "Collaboration", tools: "CRECO · messengers · Drive · Notion" } },
  { ko: { category: "AI 보조", tools: "작품 문맥과 분리된 생성형 AI" }, en: { category: "AI assist", tools: "Standalone generative AI, cut off from the work's context" } },
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
    icon: PenTool,
    stats: [{ ko: "WebGPU · Vello", en: "WebGPU · Vello" }, { ko: "브러시 226종", en: "226 brushes" }],
    ko: { title: "드로잉 엔진", body: "자체 포팅한 WebGPU 벡터 렌더러(Vello)와 Skia 기반 캔버스로 대용량 원고를 브라우저에서 다룹니다. 브러시 226종, 레이어·선택·보정을 한 화면에 갖췄습니다.", cta: "캔버스 열기" },
    en: { title: "Drawing engine", body: "A self-ported WebGPU vector renderer (Vello) and a Skia-based canvas handle large manuscripts in the browser, with 226 brushes, layers, selection and adjustments on one screen.", cta: "Open the canvas" },
  },
  {
    id: "three-d",
    image: "/brand/product-tour/05-3d.png",
    href: "/studio/bg3d",
    icon: Boxes,
    stats: [{ ko: "테마 팩 42", en: "42 theme packs" }, { ko: "배치 가능 에셋 14,665", en: "14,665 placeable assets" }, { ko: "프리셋 9", en: "9 presets" }],
    ko: { title: "3D 배경·가상 스튜디오", body: "상용 라이선스를 확보한 3D 에셋 번들을 배경 스튜디오에 배선했습니다. 테마 팩 42종에서 골라 배치하고 카메라 구도를 잡아 컷의 밑그림으로 씁니다. 가상 스튜디오는 클래식 2D 무대에서 내 캐릭터로 만나 함께 작업하는 공간입니다.", cta: "3D 배경 스튜디오" },
    en: { title: "3D sets & virtual studio", body: "A commercially licensed 3D asset bundle is wired into the background studio: pick from 42 theme packs, place assets and frame the camera as a base for the panel. The virtual studio is a classic 2D stage where you meet and work as your character.", cta: "Open the 3D studio" },
  },
  {
    id: "collaboration",
    image: "/brand/product-tour/07-production.png",
    href: "/production",
    icon: UsersRound,
    stats: [{ ko: "Yjs 실시간 동기화", en: "Yjs real-time sync" }],
    ko: { title: "실시간 협업·제작 관리", body: "Yjs 기반 동시 편집과 코멘트, 역할별 권한과 승인 기록이 원고에 직접 붙습니다. 회차별 진행률과 마감을 같은 화면에서 관리합니다.", cta: "제작 관리 열기" },
    en: { title: "Real-time collaboration", body: "Yjs-based co-editing, comments, role permissions and approval records attach directly to the manuscript, with episode progress and deadlines managed on the same screen.", cta: "Open production" },
  },
  {
    id: "ai",
    image: "/brand/product-tour/06-ai.png",
    href: "/studio/ai-lab",
    icon: Sparkles,
    stats: [{ ko: "BYOK · 로컬 모델 선택", en: "BYOK · local models" }],
    ko: { title: "Responsible AI", body: "AI는 장면 분해, 연속성 점검, 규격 검사 같은 반복 업무만 돕고, 작품 방향·표현 선택·수정 승인과 권리 판단은 사람이 합니다. AI 사용 이력은 프로젝트 기록으로 남고, 무료 모델·BYOK·로컬 모델을 고를 수 있습니다.", cta: "AI 도구 보기" },
    en: { title: "Responsible AI", body: "AI only assists repetitive work such as scene breakdowns, continuity checks and spec validation; direction, expression, approvals and rights decisions stay with people. AI use is recorded, and free models, BYOK and local models are all selectable.", cta: "See AI tools" },
  },
  {
    id: "local-first",
    image: "/brand/product-tour/01-overview.png",
    href: "/about/technology",
    icon: Database,
    stats: [{ ko: "OPFS · IndexedDB", en: "OPFS · IndexedDB" }],
    ko: { title: "로컬 우선 데이터", body: "원고는 먼저 내 기기에 저장되고 오프라인에서도 작업이 이어집니다. 클라우드 동기화는 선택 사항이며, 회차·장면·레이어·피드백 데이터가 하나의 제작 그래프로 쌓입니다.", cta: "기술 자세히 보기" },
    en: { title: "Local-first data", body: "Manuscripts save to your device first and work continues offline. Cloud sync is optional, and episodes, scenes, layers and feedback accumulate into one production graph.", cta: "Read the engineering hub" },
  },
] as const;

const BUSINESS_MODEL = [
  { ko: { tier: "Free", body: "핵심 제작 흐름 체험, 로컬 저장, 제한된 협업·AI" }, en: { tier: "Free", body: "Core production flow, local saving, limited collaboration and AI" } },
  { ko: { tier: "Pro", body: "고급 제작 기능, 확장 저장·버전, 생산성 자동화. 월 19,900원은 검증용 가격 가설입니다." }, en: { tier: "Pro", body: "Advanced tools, extended storage and versions, productivity automation. KRW 19,900/mo is a pricing hypothesis under validation." } },
  { ko: { tier: "Team · Education", body: "권한·공정·자산 관리, 관리자 대시보드, 교육용 클래스·과제 운영" }, en: { tier: "Team · Education", body: "Permissions, workflow and asset management, admin dashboards, classes and assignments" } },
  { ko: { tier: "Marketplace", body: "브러시·소재·3D·템플릿을 거래하고 제작 흐름에 바로 적용하는 수수료 모델" }, en: { tier: "Marketplace", body: "Commission on brushes, materials, 3D and templates, applied directly in the workflow" } },
] as const;

/** 아래 수치는 성과가 아니라 검증 목표다. */
const VALIDATION_GOALS = [
  { value: "30명", ko: "무료 베타 창작자 모집", en: "Free beta creators" },
  { value: "10명+", ko: "직무별 심층 인터뷰", en: "In-depth interviews by role" },
  { value: "3–6개월", ko: "Pro 유료 의향 검증", en: "Paid-intent validation for Pro" },
] as const;

const ASKS = [
  { ko: "초기 창작자 코호트 연결", en: "Early creator cohort access" },
  { ko: "BM·가격 검증 자문", en: "Business model & pricing validation" },
  { ko: "콘텐츠 산업 네트워크", en: "Content industry network" },
  { ko: "후속 투자·정부지원 연계", en: "Follow-on investment & public programs" },
] as const;

export function IrPitchPage() {
  const bi = useBilingualLocalizer(SCOPE);
  const eyebrow = (text: string) => translateCurrentStaticSourceText(SCOPE, "en", text);

  useDocumentTitle(bi("ToonStudio IR · 웹툰 제작 OS 투자 소개", "ToonStudio IR · Investor brief for the webtoon production OS"));

  return (
    <Container size="wide" className={INTRO_PAGE}>
      <HeroBlock
        eyebrow="IR · TOONSTUDIO"
        title={bi(
          "웹툰의 기획부터 연재 준비까지, 흩어진 제작 도구와 협업 과정을 브라우저 하나로 연결합니다.",
          "From planning to release prep, ToonStudio connects the scattered tools and collaboration of webtoon production in one browser.",
        )}
        lede={bi(
          "ToonStudio는 지금 toonstudio.cloud에서 작동하는 웹툰 제작 OS입니다. 이 페이지의 영상과 화면은 전부 실제 제품 기준입니다.",
          "ToonStudio is a webtoon production OS already running at toonstudio.cloud. Every film and screen on this page comes from the real product.",
        )}
        actions={(
          <IntroActions
            primary={{ href: "/product-tour", label: bi("8분 전체 제품 투어 보기", "Watch the full 8-minute tour"), icon: CirclePlay }}
            secondary={{ href: "/about", label: bi("서비스 소개 보기", "About the service") }}
          />
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
                {bi("IR 컷 4:48 — 제품 투어 챕터를 실제 화면 그대로 발췌했습니다.", "IR cut, 4:48 — full-tour chapters excerpted with real product screens only.")}
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
          body={bi("핵심 문제는 기능 부족이 아니라 제작 흐름이 끊기는 것입니다.", "The core problem is not missing features — it is the broken production flow.")}
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
            "가장 가까운 경쟁자는 협업 플랫폼 크레코(CRECO)입니다. 대형 제작사 베타 검증으로 다져진, 만든 결과물의 버전·피드백·권한을 관리하는 허브입니다. ToonStudio의 자리는 그 앞단입니다 — 드로잉·3D·콘티·AI 제작 도구 자체를 내장해, 만드는 과정이 곧 관리 기록이 되는 통합 제작 OS입니다.",
            "The closest competitor is CRECO, a collaboration platform hardened by beta testing with large studios — a hub that manages versions, feedback and permissions for finished outputs. ToonStudio sits one step earlier: an integrated production OS with the drawing, 3D, storyboard and AI tools built in, where the act of making is itself the management record.",
          )}
        </p>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-flow-title">
        <IntroSectionHeading
          id="ir-flow-title"
          eyebrow={eyebrow("SOLUTION")}
          title={bi("작품·회차·장면을 중심으로 전 공정을 한 흐름으로 연결합니다.", "Every stage connects around the work, its episodes and its scenes.")}
          body={bi("앞 단계의 결과물이 다음 단계로 그대로 이어지고, 역할마다 필요한 화면은 다르게, 작품 정보는 하나로 유지됩니다.", "Each stage hands its output to the next, while every role gets its own surface over one shared work context.")}
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
              ko: { title: "미개척 포지션", body: "전문 도구는 데스크톱 앱에, 협업 도구는 관리 허브에 머물러 있습니다. 브라우저에서 전문 드로잉과 전 공정을 하나로 통합한 자리는 아직 비어 있습니다." },
              en: { title: "An open position", body: "Professional tools live in desktop apps and collaboration tools in management hubs. The position that unifies pro drawing and the full process in a browser is still open." },
            },
            {
              ko: { title: "전문 브러시 226종 · WebGPU 스트로크 렌더링", body: "자체 포팅한 WebGPU 벡터 렌더러(Vello)가 획을 GPU로 그려, 브라우저에서도 전문 브러시의 질감과 속도를 냅니다." },
              en: { title: "226 pro brushes · WebGPU stroke rendering", body: "A self-ported WebGPU vector renderer (Vello) draws strokes on the GPU, bringing professional brush feel and speed to the browser." },
            },
            {
              ko: { title: "1인부터 팀까지, 전 규모 올인원 협업", body: "1인 작가와 소규모 팀의 실제 연재 흐름이 현재 설계·검증 범위입니다. 대규모 스튜디오 규모는 같은 구조로 확장하는 지원 설계·로드맵 단계입니다." },
              en: { title: "All-in-one collaboration at every scale", body: "Solo creators and small teams in real release flow are the current design and validation scope. Large-studio scale is a support design and roadmap stage that extends the same structure." },
            },
            {
              ko: { title: "회차-공정-담당-승인, 웹툰 분업 체계", body: "웹툰 제작의 분업을 회차·공정·담당자·승인 단위로 제품 구조에 그대로 넣어, 팀이 커져도 흐름이 흐트러지지 않게 합니다." },
              en: { title: "Division of labor, built in", body: "The webtoon division of labor — episodes, processes, owners and approvals — is built into the product structure, so the flow holds as teams grow." },
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
          title={bi("계획이 아니라, 이미 작동하는 제품입니다.", "Not a plan — a product that already runs.")}
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
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-market-title">
        <IntroSectionHeading id="ir-market-title" eyebrow={eyebrow("MARKET")} title={bi("웹툰은 이미 크고, 더 빠르게 커지는 시장입니다.", "Webtoons are already large — and growing faster.")} />
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
            "그런데 웹툰 종주국인 한국의 제작 표준 도구는 일본 셀시스의 클립스튜디오입니다(누적 5,000만 부 — 2025년 4월 공식 발표, 구독 ARR 46억 엔 초과). 표준 드로잉 툴은 클립스튜디오(일본)·포토샵(미국)·프로크리에이트(호주)·메디방/이비스(일본)까지 전량 외산이고 국산 전문 드로잉 툴은 없습니다 — 전문 드로잉 코어의 외산 비중은 사실상 100%, 국산은 0%에 수렴합니다(공식 점유율 통계가 없어 주요 표준 도구의 원산지 기준 구조 산정). 국산 도구는 협업·소재 같은 주변 영역에 머물고, 기획부터 연재까지 잇는 전문 제작 코어는 비어 있습니다. ToonStudio가 채우는 자리입니다.",
            "Yet the standard production tool in Korea — the home of webtoons — is Japan's Clip Studio by Celsys (50 million copies cumulative, officially announced April 2025; subscription ARR above JPY 4.6 billion). Every standard drawing tool is foreign — Clip Studio (Japan), Photoshop (US), Procreate (Australia), MediBang/ibis (Japan) — and no Korean professional drawing tool exists: the foreign share of the pro drawing core is effectively 100% and the Korean share converges to 0% (a structural estimate from the origin of the standard tools, as no official share statistics exist). Korean tools stay in surrounding areas such as collaboration and assets, while the professional production core that connects planning to release remains empty. That is the gap ToonStudio fills.",
          )}
        </p>
        <p className="mt-2 text-xs leading-5 text-fg-3">
          {bi("출처: 문화체육관광부·한국콘텐츠진흥원 「2025 웹툰 산업 실태조사」 · 글로벌 시장 규모는 복수 시장조사 기관 추정치 · 클립스튜디오 수치는 셀시스 공식 발표(2025년 4월)", "Sources: MCST · KOCCA, 2025 Webtoon Industry Survey · global market size estimated by multiple research firms · Clip Studio figures from Celsys' official announcement (April 2025)")}
        </p>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-model-title">
        <IntroSectionHeading id="ir-model-title" eyebrow={eyebrow("BUSINESS MODEL & VALIDATION")} title={bi("개인 창작자에서 팀·교육·마켓으로 확장합니다.", "From solo creators to teams, education and a marketplace.")} />
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
              {bi("검증 로드맵 — 아래는 성과가 아니라 목표입니다", "Validation roadmap — goals, not results")}
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
              {bi("작은 창작팀의 실제 연재 흐름에서 먼저 검증하고, 직무별 병목과 지불 의향을 코호트별로 확인합니다.", "Validation starts inside the real release flow of small creator teams, checking bottlenecks and willingness to pay by role and cohort.")}
            </p>
          </div>
        </div>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="ir-founder-title">
        <IntroSectionHeading id="ir-founder-title" eyebrow={eyebrow("FOUNDER & ASK")} title={bi("개발 가능한 창업자가 직접 검증 속도를 높입니다.", "A founder who builds, shortening every validation loop.")} />
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-line/70 bg-card/65 p-5 sm:p-6">
            <p className="font-display text-xl font-black text-fg">{bi("김희준 · Founder", "Heejun Kim · Founder")}</p>
            <p className="mt-2 break-keep text-sm leading-6 text-fg-2">
              {bi("18년 개발 경험을 바탕으로 제품 설계, 프론트엔드, 인프라, AI 연동과 테스트 자동화를 직접 수행하며 프로토타입을 실제 서비스로 고도화하고 있습니다.", "With 18 years of development experience, he personally covers product design, front-end, infrastructure, AI integration and test automation, growing the prototype into a live service.")}
            </p>
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
              {bi("지금 필요한 연결", "What we are asking for")}
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
    </Container>
  );
}
