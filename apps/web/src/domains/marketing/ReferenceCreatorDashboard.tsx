import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Boxes, ChevronDown, ChevronRight, Compass, FolderKanban, Glasses, PencilLine, Plus, Search, Sparkles } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { SpectacleHero } from "@/shared/components/layout/SpectacleHero";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { DiscoverHomePreview } from "@/domains/catalog/public/DiscoverHomePreview";

import { HomeCoreStudios } from "./HomeCoreStudios";
import { HomeLunaPanel } from "./HomeLunaPanel";
import { HomeNowCard } from "./HomeNowCard";
import { ServiceFlowNext } from "./public/intro-primitives";
import { ReferenceEditorPreview } from "./ReferenceEditorPreview";
import { HOME_EXAMPLES, HOME_LEARN_MORE, HOME_QUICK_STARTS, homeArt } from "./reference-home-content";
import "./reference-creator-dashboard.css";

/**
 * 공개 홈(/)은 BLUEPRINT §3.3의 4밴드로 조립한다(data-home-band):
 * ① 히어로(통합 입력이 1차 행동, Luna 창작 안내는 요청할 때 펼침)
 * ② 이어하기 — 지금 할 일 카드(HomeNowCard)와 예시 작품 선반.
 *    다른 도구·감상 방식은 접이식 메뉴에서 선택한다.
 * ③ 작품 발견 미리보기(스포트라이트 1장 + 요일 레일 1줄).
 * ④ 더 알아보기 — 시작 카드·핵심 작업실·편집기 미리보기·챕터 링크.
 */
export function ReferenceCreatorDashboard() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [inputMode, setInputMode] = useState<"create" | "search">("create");
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
  return <div className="reference-dashboard" data-reference-dashboard="true">
    <div data-home-band="hero">
      <SpectacleHero
        className="rd-poster"
        artClassName="rd-poster-art"
        innerClassName="rd-poster-inner"
        copyClassName="rd-story"
        eyebrowClassName="rd-eyebrow"
        ledeClassName="rd-intro"
        titleId="creator-hero-title"
        art={{
          src: "/brand/illustrated-20260928/hero.webp",
          srcSet: "/brand/illustrated-20260928/hero-320.webp 320w, /brand/illustrated-20260928/hero-640.webp 640w, /brand/illustrated-20260928/hero.webp 677w",
          sizes: "100vw",
        }}
        beforeTitle={<p className="rd-brand"><ToonStudioWordmark /><small>Stories Come to Life</small></p>}
        eyebrow={bi("상상하는 모든 이야기, 여기서 작품이 됩니다.", "Every story you imagine starts here.")}
        title={<>{bi("오늘은 어떤 이야기를", "What story will you")}<br /><em>{bi("만들까요?", "create today?")}</em></>}
        lede={bi("당신의 상상이, 세상을 놀라게 할 웹툰이 됩니다.", "Your imagination. Your next extraordinary story.")}
        aside={
          <details className="rd-luna-help">
            <summary className="rd-optional-summary">
              <Sparkles size={16} aria-hidden="true" />
              <span>{bi("시작이 막막한가요?", "Need help getting started?")}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <HomeLunaPanel />
          </details>
        }
      >
            <form className="rd-idea" onSubmit={submitInput}>
              <div className="rd-idea-modes" role="group" aria-label={bi("입력 모드", "Input mode")}>
                <button type="button" aria-pressed={!searching} onClick={() => setInputMode("create")}>
                  <PencilLine size={14} aria-hidden="true" /><span>{bi("이야기 만들기", "Create a story")}</span>
                </button>
                <button type="button" aria-pressed={searching} onClick={() => setInputMode("search")}>
                  <Search size={14} aria-hidden="true" /><span>{bi("작품 찾기", "Find stories")}</span>
                </button>
              </div>
              <label className="sr-only" htmlFor="rd-idea-input">{searching ? bi("작품 검색", "Story search") : bi("아이디어 입력", "Idea input")}</label>
              <input
                id="rd-idea-input"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder={searching
                  ? bi("작품명·작가·태그로 찾아보세요", "Search by title, creator or tag")
                  : bi("아이디어를 입력해보세요 (예: 비 오는 날의 첫사랑)", "Type an idea (e.g. first love on a rainy day)")}
                maxLength={200}
                autoComplete="off"
                enterKeyHint={searching ? "search" : undefined}
              />
              <button type="submit" className="rd-idea-submit">{searching ? bi("검색", "Search") : bi("시작하기", "Start")}<ArrowRight size={16} aria-hidden="true" /></button>
            </form>
      </SpectacleHero>
    </div>
    <div data-home-band="continue">
      <HomeNowCard />
      <details className="rd-launchpad-help">
        <summary className="rd-optional-summary">
          <span>{bi("다른 시작 방법 보기", "More ways to start")}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
      <nav
        data-testid="home-v2-spectrum-launchpad"
        aria-label={bi("도구와 감상 방식", "Tools and viewing options")}
        className="rd-v2-bento"
      >
        <div className="rd-v2-spectrum-ribbon" aria-hidden="true" />
        <div className="rd-v2-bento-head">
          <span className="rd-v2-eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            <span>{bi("하고 싶은 작업을 고르세요", "Choose what you would like to do")}</span>
          </span>
        </div>
        <div className="rd-v2-bento-grid">
          <Link href="/studio/new?lane=blank" className="rd-v2-card rd-v2-card--primary min-h-11">
            <div className="rd-v2-card-top">
              <span className="rd-v2-index" aria-hidden="true">01</span>
              <span className="rd-v2-spec">{bi("빈 원고", "Blank canvas")}</span>
              <span className="rd-v2-glyph rd-v2-glyph--scroll" aria-hidden="true"><i /><i /><i /></span>
            </div>
            <div className="rd-v2-card-body">
              <strong><PencilLine size={15} aria-hidden="true" />{bi("바로 그리기", "Start drawing")}</strong>
              <small>{bi("빈 원고에서 그림과 이야기를 시작해요", "Start your art and story on a blank canvas")}</small>
            </div>
            <span className="rd-v2-cta">{bi("바로 그리기", "Open Canvas")}<ArrowRight size={14} aria-hidden="true" /></span>
          </Link>

          <Link href="/studio/bg3d" className="rd-v2-card min-h-11">
            <div className="rd-v2-card-top">
              <span className="rd-v2-index" aria-hidden="true">02</span>
              <span className="rd-v2-spec">{bi("배경·포즈", "Scenes and poses")}</span>
              <span className="rd-v2-glyph rd-v2-glyph--cube" aria-hidden="true"><i /><i /></span>
            </div>
            <div className="rd-v2-card-body">
              <strong><Boxes size={15} aria-hidden="true" />{bi("3D 배경 만들기", "Build a 3D scene")}</strong>
              <small>{bi("공간과 캐릭터 포즈를 배치해요", "Arrange a scene and pose your characters")}</small>
            </div>
            <span className="rd-v2-cta">{bi("3D 스튜디오 열기", "Open 3D Studio")}<ArrowRight size={14} aria-hidden="true" /></span>
          </Link>

          <Link href="/discover" className="rd-v2-card min-h-11">
            <div className="rd-v2-card-top">
              <span className="rd-v2-index" aria-hidden="true">03</span>
              <span className="rd-v2-spec">{bi("장르·연재처", "Genres and platforms")}</span>
              <span className="rd-v2-glyph rd-v2-glyph--bars" aria-hidden="true"><i /><i /><i /><i /></span>
            </div>
            <div className="rd-v2-card-body">
              <strong><Compass size={15} aria-hidden="true" />{bi("읽을 작품 찾기", "Find a story to read")}</strong>
              <small>{bi("취향에 맞는 작품과 공식 연재처를 찾아요", "Discover stories and where to read them")}</small>
            </div>
            <span className="rd-v2-cta">{bi("작품 둘러보기", "Browse stories")}<ArrowRight size={14} aria-hidden="true" /></span>
          </Link>

          <Link href="/read/spatial" className="rd-v2-card min-h-11">
            <div className="rd-v2-card-top">
              <span className="rd-v2-index" aria-hidden="true">04</span>
              <span className="rd-v2-spec">{bi("새로운 감상", "A different view")}</span>
              <span className="rd-v2-glyph rd-v2-glyph--dome" aria-hidden="true"><i /><i /></span>
            </div>
            <div className="rd-v2-card-body">
              <strong><Glasses size={15} aria-hidden="true" />{bi("공간 뷰어 체험", "Try the spatial viewer")}</strong>
              <small>{bi("만화 컷을 입체적인 공간에서 감상해요", "Explore comic panels in a spatial view")}</small>
            </div>
            <span className="rd-v2-cta">{bi("공간 뷰어 체험", "Launch Spatial")}<ArrowRight size={14} aria-hidden="true" /></span>
          </Link>
        </div>
      </nav>
      </details>
      <RevealOnScroll>
      <section className="rd-examples" aria-labelledby="rd-examples-title">
        <div className="rd-examples-heading"><h2 id="rd-examples-title">{bi("예시 작품", "Example works")}</h2><Link href="/studio"><FolderKanban size={13} aria-hidden="true" />{bi("내 프로젝트", "My projects")}<ChevronRight size={13} aria-hidden="true" /></Link></div>
        <div className="rd-example-shelf">{HOME_EXAMPLES.map((example) => <div className="rd-example-cover" key={example.image}><img src={homeArt(example.image, 320)} alt="" width={180} height={120} decoding="async" /><span>{bi(example.ko, example.en)}<small>{bi(example.metaKo, example.metaEn)}</small></span></div>)}<Link className="rd-new-project" href="/create"><Plus size={22} aria-hidden="true" /><span>{bi("작품 시작하기", "Start a work")}</span></Link></div>
      </section>
      </RevealOnScroll>
    </div>
    <RevealOnScroll variant="fade" className="rd-discover" data-home-band="discover">
      <DiscoverHomePreview />
    </RevealOnScroll>
    <details className="rd-more" data-home-band="more">
      <summary className="rd-more-summary">
        <span>{bi("더 알아보기", "Learn more")}</span>
        <small>{bi("시작 카드·핵심 작업실·에디터 미리보기·서비스 소개", "Start cards, core studios, editor preview and introduction")}</small>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <RevealOnScroll>
      <nav id="creator-start" className="rd-quick" aria-labelledby="creator-toolkit-title">
        <div className="rd-section-heading">
          <h2 id="creator-toolkit-title" tabIndex={-1}>{bi("무엇부터 시작할까요?", "Where would you like to start?")}</h2>
          <span aria-hidden="true">START CREATING</span>
        </div>
        <div className="rd-quick-grid">{HOME_QUICK_STARTS.map((item) => <Link key={item.href} href={item.href}><img src={homeArt(item.image, 320)} alt="" width={240} height={144} decoding="async" /><strong>{bi(item.ko, item.en)}</strong><small>{bi(item.detailKo, item.detailEn)}</small></Link>)}</div>
      </nav>
      </RevealOnScroll>
      <RevealOnScroll>
        <HomeCoreStudios />
      </RevealOnScroll>
      <RevealOnScroll>
        <ReferenceEditorPreview />
      </RevealOnScroll>
      <RevealOnScroll variant="fade" className="rd-flow-next">
        <ServiceFlowNext current="home" title={bi("처음이라면 서비스 소개부터", "New here? Start with the introduction")} />
      </RevealOnScroll>
      <nav className="rd-chapters" aria-label={bi("서비스 더 알아보기", "Learn more about ToonStudio")}>
        <span className="rd-chapters-label">{bi("더 알아보기", "Learn more")}</span>
        {HOME_LEARN_MORE.map((link) => <Link key={link.href} href={link.href}>{bi(link.ko, link.en)}<ArrowRight size={14} aria-hidden="true" /></Link>)}
      </nav>
    </details>
  </div>;
}
