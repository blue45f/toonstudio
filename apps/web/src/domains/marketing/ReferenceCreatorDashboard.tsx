import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Compass, FolderKanban,
  Lightbulb, MessageCircle, PackageCheck, PencilLine, Search, Users,
} from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import { HomeNowCard } from "./HomeNowCard";
import { HomeVividHero } from "./HomeVividHero";
import "./reference-creator-dashboard.css";
import "./home-vivid.css";

const LazyHomeLunaPanel = lazyRetry(() => import("./HomeLunaPanel").then((module) => ({ default: module.HomeLunaPanel })), "HomeLunaPanel");
const LazyHomeVividMore = lazyRetry(() => import("./HomeVividMore").then((module) => ({ default: module.HomeVividMore })), "HomeVividMore");
const LazyDiscoverHomePreview = lazyRetry(() => import("@/domains/catalog/public/DiscoverHomePreview").then((module) => ({ default: module.DiscoverHomePreview })), "DiscoverHomePreview");

const JOURNEY = [
  { href: "/create?intent=my-story", domain: "character", icon: Lightbulb, ko: "이야기 준비", en: "Plan your story", detailKo: "인물·세계·첫 장면", detailEn: "Cast, world and first scene" },
  { href: "/studio/new?lane=blank", domain: "draw", icon: PencilLine, ko: "원고 그리기", en: "Draw your pages", detailKo: "콘티·선화·채색·말풍선", detailEn: "Storyboard, ink, color, balloons" },
  { href: "/studio?view=exports", domain: "market", icon: PackageCheck, ko: "작품 완성", en: "Finish your work", detailKo: "검수·내보내기·연재", detailEn: "Review, export and publish" },
] as const;

const TASKS = [
  { href: "/studio/new?lane=blank", domain: "draw", icon: PencilLine, ko: "바로 그리기", en: "Start drawing", detailKo: "빈 원고에 첫 선을 그어 보세요.", detailEn: "Put the first line on a blank canvas.", image: "canvas-noir" },
  { href: "/create?intent=my-story", domain: "character", icon: Lightbulb, ko: "이야기 만들기", en: "Shape a story", detailKo: "아이디어를 장면과 대사로 풀어봐요.", detailEn: "Turn an idea into scenes and dialogue.", image: "character-pink" },
  { href: "/production", domain: "collab", icon: Users, ko: "함께 완성하기", en: "Create together", detailKo: "수정 요청부터 검수와 인계까지.", detailEn: "Follow revisions, reviews and handoffs.", image: "project-crimson" },
] as const;

/** 첫 행동 세 가지를 먼저 보여 주고 탐색·도움·상세 소개는 필요할 때 펼친다. */
export function ReferenceCreatorDashboard() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [inputMode, setInputMode] = useState<"create" | "search">("create");
  const [lunaOpen, setLunaOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [lunaVisited, setLunaVisited] = useState(false);
  const [moreVisited, setMoreVisited] = useState(false);
  const [discoverVisited, setDiscoverVisited] = useState(false);
  const helpersRef = useRef<HTMLDivElement>(null);
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
      if (details.classList.contains("rd-luna-help")) setLunaOpen(false);
      details.querySelector("summary")?.focus();
    };
    window.addEventListener("keydown", closeHelpOnEscape);
    return () => window.removeEventListener("keydown", closeHelpOnEscape);
  }, []);

  return (
    <div className="reference-dashboard home-vivid" data-reference-dashboard="true" data-home-editorial="vivid-mobile-first">
      <div data-home-band="hero">
        <HomeNowCard>
          <HomeVividHero />
          <div
            ref={helpersRef}
            className="rd-clarity-helpers"
            data-luna-open={lunaOpen ? "true" : "false"}
          >
            <details className="rd-idea-help">
              <summary className="rd-optional-summary">
                <PencilLine size={16} strokeWidth={1.6} aria-hidden="true" />
                <span>{bi("아이디어 쓰기 · 작품 찾기", "Write an idea · Find a story")}</span>
                <ChevronDown size={16} strokeWidth={1.6} aria-hidden="true" />
              </summary>
              <form className="rd-idea" onSubmit={submitInput}>
                <div className="rd-idea-modes" role="group" aria-label={bi("입력 모드", "Input mode")}>
                  <button type="button" className="min-h-11" aria-pressed={!searching} onClick={() => setInputMode("create")}>
                    <PencilLine size={14} strokeWidth={1.6} aria-hidden="true" />
                    <span>{bi("이야기 만들기", "Create a story")}</span>
                  </button>
                  <button type="button" className="min-h-11" aria-pressed={searching} onClick={() => setInputMode("search")}>
                    <Search size={14} strokeWidth={1.6} aria-hidden="true" />
                    <span>{bi("작품 찾기", "Find stories")}</span>
                  </button>
                </div>
                <label className="sr-only" htmlFor="rd-idea-input">
                  {searching ? bi("작품 검색", "Story search") : bi("아이디어 입력", "Idea input")}
                </label>
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
                <button type="submit" className="rd-idea-submit min-h-11">
                  {searching ? bi("검색", "Search") : bi("시작하기", "Start")}
                  <ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" />
                </button>
              </form>
            </details>

            <details
              className="rd-luna-help"
              data-spectrum-domain="collab"
              open={lunaOpen}
              onToggle={(event) => {
                if (event.target !== event.currentTarget) return;
                setLunaOpen(event.currentTarget.open);
                if (event.currentTarget.open) setLunaVisited(true);
              }}
            >
              <summary className="rd-optional-summary">
                <MessageCircle size={16} strokeWidth={1.6} aria-hidden="true" />
                <span>{bi("시작이 막막한가요?", "Need help getting started?")}</span>
                <ChevronDown size={16} strokeWidth={1.6} aria-hidden="true" />
              </summary>
              {lunaVisited && <Suspense fallback={<p className="vivid-loading" role="status">{bi("창작 도움을 불러오는 중…", "Loading creative help…")}</p>}><LazyHomeLunaPanel /></Suspense>}
            </details>
          </div>
        </HomeNowCard>
      </div>

      <div data-home-band="continue" className="vivid-create-section">
        <nav id="creator-start" data-testid="home-v2-spectrum-launchpad" aria-labelledby="creator-toolkit-title" className="vivid-task-section">
          <div className="vivid-section-heading">
            <div>
              <span className="vivid-section-kicker">{bi("시작은 가볍게", "A little spark, a new beginning")}</span>
              <h2 id="creator-toolkit-title" tabIndex={-1}>{bi("오늘은 무엇을 만들까요?", "What will you create today?")}</h2>
            </div>
            <span className="vivid-section-number" aria-hidden="true">01 / 03</span>
          </div>
          <div className="vivid-task-grid">
            {TASKS.map((task, index) => {
              const Icon = task.icon;
              return (
                <Link key={task.href} href={task.href} data-spectrum-domain={task.domain} className="vivid-task min-h-11">
                  <span className="vivid-task-number" aria-hidden="true">0{index + 1}</span>
                  <span className="vivid-task-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.7} /></span>
                  <span className="vivid-task-copy"><strong>{bi(task.ko, task.en)}</strong><small>{bi(task.detailKo, task.detailEn)}</small></span>
                  <ArrowUpRight className="vivid-task-arrow" size={22} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </nav>
        <nav className="vivid-journey" aria-label={bi("작품을 만드는 순서", "Steps to create your work")}>
          <ol>
            {JOURNEY.map((step, index) => {
              const Icon = step.icon;
              return <li key={step.href} data-spectrum-domain={step.domain}>
                <Link href={step.href} className="min-h-11">
                  <Icon size={17} aria-hidden="true" />
                  <span><strong>{bi(step.ko, step.en)}</strong><small>{bi(step.detailKo, step.detailEn)}</small></span>
                  {index < JOURNEY.length - 1 && <ChevronRight size={16} aria-hidden="true" />}
                </Link>
              </li>;
            })}
          </ol>
        </nav>
      </div>

      <details className="vivid-disclosure rd-discover" data-home-band="discover" open={discoverOpen} onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        setDiscoverOpen(event.currentTarget.open);
        if (event.currentTarget.open) setDiscoverVisited(true);
      }}>
        <summary className="vivid-disclosure-summary">
          <Compass size={21} aria-hidden="true" /><span><strong>{bi("다른 이야기가 궁금하다면", "Find your next inspiration")}</strong><small>{bi("작품을 둘러보고 새로운 영감을 만나세요.", "Discover stories and find a spark for your own.")}</small></span><ChevronDown size={18} aria-hidden="true" />
        </summary>
        {discoverVisited && <Suspense fallback={<p className="vivid-loading" role="status">{bi("작품을 불러오는 중…", "Loading stories…")}</p>}><LazyDiscoverHomePreview /></Suspense>}
        <Link href="/discover" className="vivid-disclosure-link min-h-11">{bi("작품 둘러보기", "Explore stories")}<ArrowRight size={16} aria-hidden="true" /></Link>
      </details>

      <details className="rd-more vivid-disclosure" data-home-band="more" open={moreOpen} onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        setMoreOpen(event.currentTarget.open);
        if (event.currentTarget.open) setMoreVisited(true);
      }}>
        <summary className="vivid-disclosure-summary rd-more-summary">
          <FolderKanban size={21} aria-hidden="true" /><span><strong>{bi("작업실 더 둘러보기", "Take a look around the studio")}</strong><small>{bi("예시 원고 · 3D · 협업 · 서비스 소개", "Sample artwork · 3D · Collaboration · About")}</small></span><ChevronDown size={18} aria-hidden="true" />
        </summary>
        {moreVisited && <Suspense fallback={<p className="vivid-loading" role="status">{bi("작업실 소개를 불러오는 중…", "Loading the studio preview…")}</p>}><LazyHomeVividMore /></Suspense>}
      </details>
    </div>
  );
}
