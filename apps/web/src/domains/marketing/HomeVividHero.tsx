import { ArrowRight, FolderKanban, Pause, Play, Brush } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useAtelierMotion } from "@/shared/components/site-experience/use-atelier-motion";

import { homeArt } from "./reference-home-content";

/** 소개 아트와 실제 시작 동선을 분리해 작은 화면에서도 첫 행동을 먼저 제공한다. */
export function HomeVividHero() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const { hostRef, running, motionAllowed, paused, setPaused } = useAtelierMotion();

  return (
    <div ref={hostRef} data-hero-motion="true" data-motion={running ? "playing" : "paused"}>
    <section className="rd-clarity-hero vivid-hero" aria-labelledby="creator-hero-title">
      <div className="vivid-hero-copy">
        <span className="vivid-eyebrow"><Brush size={15} aria-hidden="true" />{bi("당신의 다음 이야기는 여기서", "Your next story starts here")}</span>
        <h1 id="creator-hero-title">
          {bi("상상한 장면을,", "Imagine a scene.")}
          <br />
          <span>{bi("나의 작품으로.", "Make it your story.")}</span>
        </h1>
        <p>{bi("떠오른 아이디어를 그리고, 다듬고, 함께 완성해요. 나만의 창작 공간, 툰스튜디오.", "Draw an idea, shape the story, and bring it to life together. Your creative space, ToonStudio.")}</p>
        <div className="vivid-hero-actions">
          <Link className="vivid-primary min-h-11" href="/create">
            {bi("작품 시작하기", "Start a work")}<ArrowRight size={19} aria-hidden="true" />
          </Link>
          <Link className="vivid-secondary min-h-11" href="/studio">
            <FolderKanban size={17} aria-hidden="true" />{bi("내 작업 이어가기", "Continue my work")}
          </Link>
        </div>
        <div className="vivid-hero-note">
          <span aria-hidden="true" className="vivid-color-dots"><i /><i /><i /></span>
          {bi("작은 아이디어 하나면 충분해요.", "One little idea is all it takes.")}
        </div>
      </div>
      <figure className="rd-clarity-art vivid-art" aria-label={bi("선화에서 완성작으로 이어지는 브랜드 예시 원고", "Brand artwork: from line art to a finished scene")}>
        <div className="vivid-art-orbit" aria-hidden="true" />
        <div className="vivid-art-spark vivid-art-spark--one" aria-hidden="true">✦</div>
        <div className="vivid-art-spark vivid-art-spark--two" aria-hidden="true">✦</div>
        <div className="vivid-comic-panel vivid-comic-panel--back" aria-hidden="true">
          <img src={homeArt("storyboard", 320)} alt="" width={480} height={320} decoding="async" loading="lazy" />
          <span>{bi("한 컷의 시작", "The first panel")}</span>
        </div>
        <div className="vivid-comic-panel vivid-comic-panel--main">
          <div className="vivid-art-frame-label" aria-hidden="true"><span>TOONSTUDIO</span><span>01 — CREATE</span></div>
          <img
            src="/brand/luminous-atelier-20261114/scene-hero-living-atelier.webp"
            alt={bi("선화에 색을 더하며 완성하는 웹툰 원고 예시", "Example webtoon manuscript progressing from line art to color")}
            width={960}
            height={600}
            sizes="(max-width: 767px) 90vw, 48vw"
            decoding="async"
            fetchPriority="high"
          />
          <span className="vivid-art-sticker" aria-hidden="true">{bi("이야기는 지금부터!", "Make your next chapter!")}</span>
        </div>
        <figcaption>{bi("ToonStudio 브랜드 아트", "ToonStudio brand artwork")}</figcaption>
      </figure>
      {motionAllowed && <button
        type="button"
        className="vivid-motion-toggle min-h-11"
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
      >
        {!paused ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        {!paused ? bi("움직임 멈추기", "Pause motion") : bi("움직임 재생", "Play motion")}
      </button>}
    </section>
    </div>
  );
}
