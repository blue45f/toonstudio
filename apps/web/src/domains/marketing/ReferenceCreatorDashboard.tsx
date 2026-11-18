import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  ChevronRight,
  Compass,
  FolderKanban,
  Glasses,
  Lightbulb,
  MessageCircle,
  PackageCheck,
  PencilLine,
  Plus,
  Search,
} from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { DiscoverHomePreview } from "@/domains/catalog/public/DiscoverHomePreview";

import { HomeCoreStudios } from "./HomeCoreStudios";
import { HomeLunaPanel } from "./HomeLunaPanel";
import { HomeNowCard } from "./HomeNowCard";
import { ServiceFlowNext } from "./public/intro-primitives";
import { ReferenceEditorPreview } from "./ReferenceEditorPreview";
import { HOME_EXAMPLES, HOME_LEARN_MORE, HOME_QUICK_STARTS, homeArt } from "./reference-home-content";
import "./reference-creator-dashboard.css";
import "./reference-creator-dashboard-hero.css";

const inkIndex = (index: number) => ({ "--ink-i": index }) as CSSProperties;

const JOURNEY = [
  { href: "/create?intent=my-story", icon: Lightbulb, ko: "이야기 준비", en: "Plan your story", detailKo: "인물·세계·첫 장면", detailEn: "Cast, world and first scene" },
  { href: "/studio/new?lane=blank", icon: PencilLine, ko: "원고 그리기", en: "Draw your pages", detailKo: "콘티·선화·채색·말풍선", detailEn: "Storyboard, ink, color, balloons" },
  { href: "/studio?view=exports", icon: PackageCheck, ko: "작품 완성", en: "Finish your work", detailKo: "검수·내보내기·연재", detailEn: "Review, export and publish" },
] as const;

const isNarrowViewport = () =>
  typeof window !== "undefined"
  && typeof globalThis.matchMedia === "function"
  && globalThis.matchMedia("(max-width: 767px)").matches;

/**
 * 공개 홈(/)은 4밴드로 조립한다(data-home-band):
 * ① 히어로 — 실제 이어하기·가까운 일정이 있으면 먼저, 이어서 원고 아트와 작품 시작·둘러보기,
 *    준비→그리기→완성 3단계, 아이디어 한 줄 입력과 Luna 도움.
 * ② 이어서 고르기 — 하고 싶은 작업 4가지와 예시 작품 선반.
 * ③ 작품 발견 미리보기.
 * ④ 더 알아보기 — 시작 카드·핵심 작업실·편집기 미리보기·서비스 소개 링크.
 *
 * 2026-11-18 unslop 개편: 히어로는 틀 없는 비대칭 분할로 원고 아트가 주인공이 된다. 칸이
 * 그어지듯 열리는 패널 와이프(ink-motion)가 이 제품만의 첫 인상이고, 나머지 크롬은 조용하다.
 */
export function ReferenceCreatorDashboard() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [inputMode, setInputMode] = useState<"create" | "search">("create");
  const [lunaOpen, setLunaOpen] = useState(() => !isNarrowViewport());
  const [moreOpen, setMoreOpen] = useState(() => !isNarrowViewport());
  const [activeJourneyStep, setActiveJourneyStep] = useState<number | null>(null);
  const helpersRef = useRef<HTMLDivElement>(null);
  const manuscriptStageRef = useRef<HTMLDivElement>(null);
  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const stage = manuscriptStageRef.current;
    if (!stage || event.pointerType === "touch") return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    stage.style.setProperty("--tilt-rx", `${(-ny * 4.5).toFixed(2)}deg`);
    stage.style.setProperty("--tilt-ry", `${(nx * 5.5).toFixed(2)}deg`);
  };
  const resetStageTilt = () => {
    const stage = manuscriptStageRef.current;
    if (!stage) return;
    stage.style.setProperty("--tilt-rx", "0deg");
    stage.style.setProperty("--tilt-ry", "0deg");
  };
  const searching = inputMode === "search";
  const submitInput = (event: FormEvent) => {
    event.preventDefault();
    const text = idea.trim();
    if (searching) {
      navigate(text ? `/search?q=${encodeURIComponent(text)}` : "/search");
      return;
    }
    navigate(text ? `/create?intent=my-story&topic=free-story&idea=${encodeURIComponent(text)}` : "/create?intent=my-story");
  };
  useEffect(() => {
    const closeHelpOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || !(event.target instanceof Element)) return;
      const details = event.target.closest<HTMLDetailsElement>("details[open]");
      if (!details || !helpersRef.current?.contains(details)) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    window.addEventListener("keydown", closeHelpOnEscape);
    return () => window.removeEventListener("keydown", closeHelpOnEscape);
  }, []);
  return <div className="reference-dashboard" data-reference-dashboard="true">
    <div data-home-band="hero">
      <HomeNowCard>
      <section className="rd-clarity-hero" aria-labelledby="creator-hero-title">
        <div className="rd-clarity-copy">
          <h1 id="creator-hero-title" data-ink-enter="rise" style={inkIndex(0)}>{bi("상상한 장면을,", "Imagine a scene.")}<br /><span>{bi("나의 작품으로.", "Make it your story.")}</span></h1>
          <p data-ink-enter="rise" style={inkIndex(1)}>{bi("기획과 콘티, 작화, 검수와 출고까지 브라우저 하나에서 이어 가요", "Planning, storyboards, inking, review and publishing in one browser tab")}</p>
          <div className="rd-clarity-actions" data-ink-enter="rise" style={inkIndex(2)}>
            <Link className="rd-clarity-start ink-arrow" href="/create">{bi("작품 시작하기", "Start a work")}<ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" /></Link>
            <Link className="rd-clarity-browse ink-arrow" href="/discover">{bi("둘러보기", "Explore")}<ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" /></Link>
          </div>
        </div>
        <figure
          className="rd-clarity-art"
          data-focus-step={activeJourneyStep !== null ? String(activeJourneyStep) : undefined}
          aria-label={bi("선화에서 완성작으로 이어지는 브랜드 예시 원고", "Brand artwork: from line art to a finished scene")}
        >
          <div
            ref={manuscriptStageRef}
            className="rd-clarity-manuscript ink-sheen ink-stage-tilt"
            data-ink-enter="panel"
            style={inkIndex(1)}
            onPointerMove={handleStagePointerMove}
            onPointerLeave={resetStageTilt}
          >
            <img data-ink-enter="zoom" src="/brand/luminous-atelier-20261114/scene-hero-living-atelier.webp" sizes="(max-width: 639px) 100vw, 52vw" alt={bi("선화에 색을 더하며 완성하는 웹툰 원고 예시", "Example webtoon manuscript progressing from line art to color")} width={960} height={600} decoding="async" fetchPriority="high" />
            <span className="rd-clarity-cropframe" aria-hidden="true" />
          </div>
          <figcaption>{bi("ToonStudio 브랜드 아트", "ToonStudio brand artwork")}</figcaption>
        </figure>
      </section>
      <nav
        className="rd-clarity-journey"
        aria-label={bi("작품을 만드는 순서", "Steps to create your work")}
        onPointerLeave={() => setActiveJourneyStep(null)}
      >
        <ol>
          {JOURNEY.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.href}
                data-ink-enter="rise"
                style={inkIndex(index + 3)}
                onPointerEnter={() => setActiveJourneyStep(index)}
                onFocus={() => setActiveJourneyStep(index)}
                onBlur={() => setActiveJourneyStep(null)}
              >
                <Link href={step.href} className="ink-arrow">
                  <span className="rd-clarity-journey-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.5} /></span>
                  <span className="rd-clarity-journey-text">
                    <strong>{bi(step.ko, step.en)}</strong>
                    <small>{bi(step.detailKo, step.detailEn)}</small>
                  </span>
                  <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
                </Link>
                {index < JOURNEY.length - 1 ? (
                  <span className="rd-clarity-journey-connector" aria-hidden="true"><i data-ink-enter="line" style={inkIndex(index + 5)} /></span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
      <div ref={helpersRef} className="rd-clarity-helpers">
        <details className="rd-idea-help" open>
          <summary className="rd-optional-summary"><PencilLine size={16} strokeWidth={1.5} aria-hidden="true" /><span>{bi("아이디어 쓰기 · 작품 찾기", "Write an idea · Find a story")}</span><ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" /></summary>
          <form className="rd-idea" onSubmit={submitInput}>
            <div className="rd-idea-modes" role="group" aria-label={bi("입력 모드", "Input mode")}>
              <button type="button" aria-pressed={!searching} onClick={() => setInputMode("create")}>
                <PencilLine size={14} strokeWidth={1.5} aria-hidden="true" /><span>{bi("이야기 만들기", "Create a story")}</span>
              </button>
              <button type="button" aria-pressed={searching} onClick={() => setInputMode("search")}>
                <Search size={14} strokeWidth={1.5} aria-hidden="true" /><span>{bi("작품 찾기", "Find stories")}</span>
              </button>
            </div>
            <label className="sr-only" htmlFor="rd-idea-input">{searching ? bi("작품 검색", "Story search") : bi("아이디어 입력", "Idea input")}</label>
            <input
              id="rd-idea-input"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder={searching
                ? bi("작품명·작가·태그", "Title, creator or tag")
                : bi("예: 비 오는 날의 첫사랑", "e.g. first love on a rainy day")}
              maxLength={200}
              autoComplete="off"
              enterKeyHint={searching ? "search" : undefined}
            />
            <button type="submit" className="rd-idea-submit">{searching ? bi("검색", "Search") : bi("시작하기", "Start")}<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></button>
          </form>
          <div className="rd-v4-preset-chips" role="group" aria-label={bi("웹툰 빠른 규격 및 작업실 프리셋", "Quick webtoon format & studio presets")}>
            <Link href="/create#ai-composer" className="rd-v4-preset-chip rd-v4-preset-chip--ai"><span>{bi("AI 자동 콘티·대사", "AI Storyboard")}</span></Link>
            <Link href="/studio/new?lane=blank" className="rd-v4-preset-chip">{bi("세로 웹툰 (800×무한)", "Vertical Webtoon (800×∞)")}</Link>
            <Link href="/studio/new?lane=storyboard&start=storyboard" className="rd-v4-preset-chip">{bi("인스타툰 4컷 (1080²)", "4-Panel Comic (1080²)")}</Link>
            <Link href="/studio/assets/characters/new" className="rd-v4-preset-chip">{bi("3D 캐릭터 셰이퍼", "3D Character Shaper")}</Link>
            <Link href="/studio/bg3d" className="rd-v4-preset-chip">{bi("3D 배경 · LT 선화", "3D Scene · Line Art")}</Link>
            <Link href="/production" className="rd-v4-preset-chip">{bi("팀 공동 작업 · 검수", "Team Collab & Review")}</Link>
          </div>
        </details>
        <details
          className="rd-luna-help"
          open={lunaOpen}
          onToggle={(event) => {
            if (event.target === event.currentTarget) setLunaOpen(event.currentTarget.open);
          }}
        >
          <summary className="rd-optional-summary"><MessageCircle size={16} strokeWidth={1.5} aria-hidden="true" /><span>{bi("시작이 막막한가요?", "Need help getting started?")}</span><ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" /></summary>
          <HomeLunaPanel />
        </details>
      </div>
      </HomeNowCard>
    </div>
    <div data-home-band="continue">
      <nav
        data-testid="home-v2-spectrum-launchpad"
        aria-labelledby="rd-launchpad-title"
        className="rd-v2-bento"
      >
        <span className="rd-v2-spectrum-ribbon" aria-hidden="true" />
        <h2 id="rd-launchpad-title" className="rd-band-title" data-ink="line">{bi("하고 싶은 작업을 고르세요", "Choose what you would like to do")}</h2>
        <div className="rd-v2-bento-grid" data-ink-stagger>
          <Link href="/studio/new?lane=blank" className="rd-v2-card rd-v2-card--primary ink-frame ink-arrow min-h-11">
            <span className="rd-v2-card-icon" aria-hidden="true"><PencilLine size={18} strokeWidth={1.5} /></span>
            <span className="rd-v2-card-body">
              <strong>{bi("바로 그리기", "Start drawing")}</strong>
              <small>{bi("빈 원고에서 그림과 이야기를 시작해요", "Start your art and story on a blank canvas")}</small>
            </span>
            <span className="rd-v2-cta">{bi("캔버스 열기", "Open canvas")}<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></span>
          </Link>
          <Link href="/studio/bg3d" className="rd-v2-card ink-frame ink-arrow min-h-11">
            <span className="rd-v2-card-icon" aria-hidden="true"><Boxes size={18} strokeWidth={1.5} /></span>
            <span className="rd-v2-card-body">
              <strong>{bi("3D 배경 만들기", "Build a 3D scene")}</strong>
              <small>{bi("공간과 캐릭터 포즈를 배치해요", "Arrange a scene and pose your characters")}</small>
            </span>
            <span className="rd-v2-cta">{bi("3D 스튜디오 열기", "Open 3D studio")}<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></span>
          </Link>
          <Link href="/discover" className="rd-v2-card ink-frame ink-arrow min-h-11">
            <span className="rd-v2-card-icon" aria-hidden="true"><Compass size={18} strokeWidth={1.5} /></span>
            <span className="rd-v2-card-body">
              <strong>{bi("읽을 작품 찾기", "Find a story to read")}</strong>
              <small>{bi("취향에 맞는 작품과 공식 연재처를 찾아요", "Discover stories and where to read them")}</small>
            </span>
            <span className="rd-v2-cta">{bi("작품 둘러보기", "Browse stories")}<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></span>
          </Link>
          <Link href="/read/spatial" className="rd-v2-card ink-frame ink-arrow min-h-11">
            <span className="rd-v2-card-icon" aria-hidden="true"><Glasses size={18} strokeWidth={1.5} /></span>
            <span className="rd-v2-card-body">
              <strong>{bi("공간 뷰어 체험", "Try the spatial viewer")}</strong>
              <small>{bi("만화 컷을 입체적인 공간에서 감상해요", "Explore comic panels in a spatial view")}</small>
            </span>
            <span className="rd-v2-cta">{bi("뷰어 열기", "Open viewer")}<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></span>
          </Link>
        </div>
      </nav>
      <section className="rd-examples" aria-labelledby="rd-examples-title">
        <div className="rd-examples-heading">
          <h2 id="rd-examples-title" data-ink="line">{bi("예시 작품", "Example works")}</h2>
          <Link href="/studio" className="ink-arrow inline-flex min-h-11 min-w-11 items-center gap-1.5"><FolderKanban size={14} strokeWidth={1.5} aria-hidden="true" />{bi("내 프로젝트", "My projects")}<ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" /></Link>
        </div>
        <div className="rd-example-shelf" data-ink-stagger="panel">
          {HOME_EXAMPLES.map((example) => (
            <div className="rd-example-cover" key={example.image}>
              <span className="rd-example-art ink-cover"><img src={homeArt(example.image, 320)} alt="" width={180} height={120} decoding="async" /></span>
              <span className="rd-example-caption">{bi(example.ko, example.en)}<small>{bi(example.metaKo, example.metaEn)}</small></span>
            </div>
          ))}
          <Link className="rd-new-project" href="/create"><Plus size={20} strokeWidth={1.5} aria-hidden="true" /><span>{bi("작품 시작하기", "Start a work")}</span></Link>
        </div>
      </section>
    </div>
    <div className="rd-discover" data-home-band="discover">
      <DiscoverHomePreview />
    </div>
    <details
      className="rd-more"
      data-home-band="more"
      open={moreOpen}
      onToggle={(event) => {
        if (event.target === event.currentTarget) setMoreOpen(event.currentTarget.open);
      }}
    >
      <summary className="rd-more-summary">
        <span>{bi("더 알아보기", "Learn more")}</span>
        <small>{bi("시작 카드·핵심 작업실·에디터 미리보기·서비스 소개", "Start cards, core studios, editor preview and introduction")}</small>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
      </summary>
      <nav id="creator-start" className="rd-quick" aria-labelledby="creator-toolkit-title">
        <div className="rd-section-heading">
          <h2 id="creator-toolkit-title" tabIndex={-1} data-ink="line">{bi("무엇부터 시작할까요?", "Where would you like to start?")}</h2>
        </div>
        <div className="rd-quick-grid" data-ink-stagger>
          {HOME_QUICK_STARTS.map((item) => (
            <Link key={item.href} href={item.href} className="ink-frame">
              <span className="rd-quick-art ink-cover"><img src={homeArt(item.image, 320)} alt="" width={240} height={144} decoding="async" /></span>
              <strong>{bi(item.ko, item.en)}</strong>
              <small>{bi(item.detailKo, item.detailEn)}</small>
            </Link>
          ))}
        </div>
      </nav>
      <HomeCoreStudios />
      <div data-ink="settle">
        <ReferenceEditorPreview />
      </div>
      <div className="rd-flow-next">
        <ServiceFlowNext current="home" title={bi("처음이라면 서비스 소개부터", "New here? Start with the introduction")} />
      </div>
      <nav className="rd-chapters" aria-label={bi("서비스 더 알아보기", "Learn more about ToonStudio")}>
        <span className="rd-chapters-label">{bi("더 알아보기", "Learn more")}</span>
        {HOME_LEARN_MORE.map((link) => <Link key={link.href} href={link.href} className="ink-arrow">{bi(link.ko, link.en)}<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></Link>)}
      </nav>
    </details>
  </div>;
}
