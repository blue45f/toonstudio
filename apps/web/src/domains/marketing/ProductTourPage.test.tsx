import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PRODUCT_TOUR_DURATION_SECONDS,
  PRODUCT_TOUR_FILM_CHAPTERS,
  PRODUCT_TOUR_FPS,
} from "@toonstudio/product-tour-film";

import { PRODUCT_TOUR_ADDITIONS } from "./product-tour-additions";
import { PRODUCT_TOUR_RUNTIME_AUDIO } from "./product-tour-audio.generated";
import {
  PRODUCT_TOUR,
  PRODUCT_TOUR_COPY,
  formatProductTourDuration,
  formatProductTourTime,
  productTourIsoDuration,
} from "./product-tour-content";
import {
  PRODUCT_TOUR_MEDIA_ATLAS_LINKS,
  PRODUCT_TOUR_TECH_LINKS,
  PRODUCT_TOUR_TECH_STATUS_LABEL,
} from "./public/product-tour-tech-links";

const PUBLIC_BRAND = "apps/web/public/brand";
const PAGE_SOURCE = "apps/web/src/domains/marketing/ProductTourPage.tsx";
const PLAYER_SOURCE = "apps/web/src/domains/marketing/ProductTourPlayer.tsx";
const ROUTE_SOURCE = "apps/web/src/app/routes/groups/marketing.routes.tsx";
const HOME_DASHBOARD_SOURCE = "apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx";
const HOME_CONTENT_SOURCE = "apps/web/src/domains/marketing/reference-home-content.ts";
const REMOTION_SOURCE = "tools/media/brand-film/src/ProductTourFilm.tsx";
const SHARED_REMOTION_SOURCE = "packages/product-tour-film/src/ProductTourFilm.tsx";
const FALLBACK_PLAYER_SOURCE = "apps/web/src/domains/marketing/ProductTourMp4Player.tsx";
const RUNTIME_AUDIO_MANIFEST = `${PUBLIC_BRAND}/product-tour/product-tour-audio.json`;
const REMOTION_ROOT = "tools/media/brand-film/src/index.tsx";
const ADDITIONS_SOURCE = "apps/web/src/domains/marketing/ProductTourAdditions.tsx";
const MADE_NOTE_SOURCE = "apps/web/src/domains/marketing/ProductTourMadeNote.tsx";
const HANGUL = /[ㄱ-ㆎ가-힣]/u;

/** 영상 제작 시점의 실제 제품 화면 캡처만 capture로 부를 수 있다. 그 밖의 그림·SVG 도해는 concept이다. */
function isProductCapture(src: string): boolean {
  return /^\/?brand\/product-tour\/[^/]+\.png$/u.test(src);
}

function pathnameOf(href: string): string {
  return href.split(/[?#]/u, 1)[0] ?? href;
}

describe("long-form product tour contracts", () => {
  it("keeps the walkthrough intentionally long and chaptered", () => {
    expect(PRODUCT_TOUR.duration).toBe(504);
    expect(PRODUCT_TOUR.chapters).toHaveLength(9);
    expect(PRODUCT_TOUR.chapters[0].start).toBe(0);
    expect(PRODUCT_TOUR.chapters.at(-1)?.end).toBe(PRODUCT_TOUR.duration);
    expect(PRODUCT_TOUR.chapters.every((chapter, index) => index === 0 || chapter.start === PRODUCT_TOUR.chapters[index - 1].end)).toBe(true);
  });

  it("gives every chapter a feature destination distinct from its related links", () => {
    for (const chapter of PRODUCT_TOUR.chapters) {
      expect(chapter.feature.href.startsWith("/"), chapter.id).toBe(true);
      expect(chapter.feature.ko.trim(), chapter.id).not.toBe("");
      expect(chapter.feature.en.trim(), chapter.id).not.toBe("");
      expect(chapter.related.map((link) => link.href), chapter.id).not.toContain(chapter.feature.href);
      expect(existsSync(`apps/web/public${chapter.image}`), chapter.image).toBe(true);
    }
    const production = PRODUCT_TOUR.chapters.find((chapter) => chapter.id === "production");
    expect(production?.related.map((link) => link.href)).toContain("/studio/space");
  });

  it("registers the public page and links it from the creator home and the introduction", () => {
    const routeSource = readFileSync(ROUTE_SOURCE, "utf8");
    const dashboard = readFileSync(HOME_DASHBOARD_SOURCE, "utf8");
    const homeContent = readFileSync(HOME_CONTENT_SOURCE, "utf8");
    const aboutSource = readFileSync("apps/web/src/domains/legal/AboutPage.tsx", "utf8");

    expect(routeSource).toContain('path: "/product-tour"');
    // 홈은 '처음 둘러보는 순서'의 다음 버튼과 '더 알아보기'로, 서비스 소개는 8분 제품 투어 버튼으로 투어에 닿는다.
    expect(dashboard).toContain('<ServiceFlowNext current="home"');
    expect(homeContent).toContain('{ id: "tour", href: "/product-tour"');
    expect(homeContent).toContain('{ href: "/product-tour", ko: "8분 제품 투어"');
    expect(aboutSource).toContain('href: "/product-tour"');
    expect(aboutSource).toContain("8분 제품 투어 보기");
  });

  it("uses video metadata, chapter navigation and actual product surfaces", () => {
    const pageSource = readFileSync(PAGE_SOURCE, "utf8");
    const playerSource = readFileSync(PLAYER_SOURCE, "utf8");

    expect(pageSource).toContain('"@type": "VideoObject"');
    // 재생 시간(PT8M24S)은 문자열을 손으로 적지 않고 PRODUCT_TOUR.duration(504초)에서 계산한다 — 영상을 다시 렌더하면 함께 바뀐다.
    expect(pageSource).toContain("duration: productTourIsoDuration(PRODUCT_TOUR.duration)");
    expect(pageSource).not.toContain('"PT8M24S"');
    expect(productTourIsoDuration(PRODUCT_TOUR.duration)).toBe("PT8M24S");
    expect(pageSource).toContain("product-tour-page__journey-grid");
    expect(pageSource).toContain("controllerRef={playerController}");
    expect(pageSource).toContain("chapter.feature.href");
    expect(pageSource).not.toContain("CreatorFeatureReels");
    const fallbackSource = readFileSync(FALLBACK_PLAYER_SOURCE, "utf8");
    expect(playerSource).toContain("component={ProductTourRemotionComposition}");
    expect(playerSource).toContain("initiallyMuted={false}");
    expect(playerSource).toContain("numberOfSharedAudioTags={2}");
    expect(playerSource).toContain("enableSound");
    expect(playerSource).toContain("ProductTourMp4Player");
    expect(fallbackSource).toContain('preload="metadata"');
    expect(fallbackSource).toContain('srcLang="ko"');
    expect(fallbackSource).toContain('srcLang="en"');
    expect(fallbackSource).toContain("PRODUCT_TOUR_STALL_TIMEOUT_MS");
    expect(fallbackSource).toContain("recoverPlayback");
    expect(playerSource).toContain("PRODUCT_TOUR.chapters.map");
  });

  it("does not float a fixed voice guide over the tour (the player already reads the current chapter)", () => {
    const pageSource = readFileSync(PAGE_SOURCE, "utf8");
    expect(pageSource).not.toContain('variant="fixed"');
    expect(pageSource).not.toContain("VoiceGuideButton");
    expect(readFileSync(PLAYER_SOURCE, "utf8")).toContain("toggleVoiceGuide");
  });

  it("plays from the hero button and each chapter's 'watch this scene' link through the same user-gesture path", () => {
    const pageSource = readFileSync(PAGE_SOURCE, "utf8");
    // 2차 단순화: 히어로 포스터는 바로 아래 재생기의 포스터와 같은 그림이라 걷어 냈다. 재생 버튼은 히어로에 하나, 장면 링크는 챕터마다 하나.
    expect(pageSource.match(/onClick=\{watchScene\(heroStart\)\}/gu)).toHaveLength(1);
    expect(pageSource).toContain("onClick={watchScene(chapter.start)}");
    expect(pageSource).not.toContain("product-tour__hero-visual");
    expect(pageSource).toContain("controller.playFrom(seconds, event)");
    expect(pageSource).toContain('href="#product-tour-video"');
  });

  it("ends on the seminar flow: a single next button to start creating, with the technology journey folded away", () => {
    const pageSource = readFileSync(PAGE_SOURCE, "utf8");
    expect(pageSource).toContain('<ServiceFlowNext current="tour" />');
    // 기술·발표 이동(6칸)은 투어 흐름을 흐리지 않게 접힌 안내로 둔다.
    expect(pageSource).toContain('<ServiceStoryJourney current="tour" />');
    expect(pageSource.indexOf("<ServiceFlowNext")).toBeLessThan(pageSource.indexOf("<ServiceStoryJourney"));
    // 영상 아래 세 묶음(챕터별 기능·역할별 시작·새로 더해진 기능)은 탭으로 나눠 한 번에 하나만 보여 준다.
    expect(pageSource).toContain("<IntroTabs");
    expect(pageSource).toContain('mount="all"');
  });

  it("labels concept illustrations honestly on the chapter cards and inside the film", () => {
    for (const chapter of PRODUCT_TOUR.chapters) {
      expect(chapter.visual, chapter.id).toBe(isProductCapture(chapter.image) ? "capture" : "concept");
      if (chapter.image.endsWith(".svg")) expect(chapter.visual, chapter.id).toBe("concept");
    }
    for (const chapter of PRODUCT_TOUR_FILM_CHAPTERS) {
      for (const asset of chapter.assets) {
        expect(asset.visual, asset.src).toBe(isProductCapture(asset.src) ? "capture" : "concept");
        expect(existsSync(`apps/web/public/${asset.src}`), asset.src).toBe(true);
      }
    }
    const filmSource = readFileSync(SHARED_REMOTION_SOURCE, "utf8");
    expect(filmSource).not.toContain("LIVE WORKSPACE");
    expect(filmSource).not.toContain("실제 제품 화면 기반");
    expect(filmSource).toContain("개념 도해");
    expect(PRODUCT_TOUR_COPY.ko.featuresBody).toContain("개념 도해");
    expect(PRODUCT_TOUR_COPY.en.featuresBody).toContain("Concept illustration");
    expect(readFileSync(PAGE_SOURCE, "utf8")).toContain("copy.conceptBadge");
  });

  it("keeps the film chapters, timings and workspaces aligned with the page chapters", () => {
    expect(PRODUCT_TOUR_FILM_CHAPTERS.map((chapter) => [chapter.start, chapter.end])).toEqual(
      PRODUCT_TOUR.chapters.map((chapter) => [chapter.start, chapter.end]),
    );
    expect(PRODUCT_TOUR_FILM_CHAPTERS.map((chapter) => chapter.route)).toEqual(
      PRODUCT_TOUR.chapters.map((chapter) => pathnameOf(chapter.feature.href)),
    );
  });

  it("renders the film in the starlight brand instead of the retired ink and orange palette", () => {
    const filmSource = readFileSync(SHARED_REMOTION_SOURCE, "utf8").toLowerCase();
    for (const retired of ["#0d0b09", "#ff743a", "#ff7a3d", "#ff8a4c", "✦"]) {
      expect(filmSource, retired).not.toContain(retired);
    }
    for (const starlight of ["#070a14", "#11142d", "#b39bff", "#68d5ff", "brand/spectrum-ribbon-v2/icon-192.png"]) {
      expect(filmSource, starlight).toContain(starlight);
    }
  });

  it("adds the virtual studio and production board as features that are not in the tour", () => {
    expect(PRODUCT_TOUR_ADDITIONS.map((item) => [item.id, pathnameOf(item.href)])).toEqual([
      ["virtual-studio", "/studio/space"],
      ["production-board", "/production/projects/sample-project/production"],
    ]);
    const tourFeatures = PRODUCT_TOUR.chapters.map((chapter) => pathnameOf(chapter.feature.href));
    for (const item of PRODUCT_TOUR_ADDITIONS) expect(tourFeatures, item.id).not.toContain(pathnameOf(item.href));
    const source = readFileSync(ADDITIONS_SOURCE, "utf8");
    expect(source).toContain("영상에 없음");
    expect(source).toContain('item.visual === "capture"');
    expect(readFileSync(PAGE_SOURCE, "utf8")).toContain("<ProductTourAdditions />");
  });

  it("shares one reviewed Remotion composition between rendering and runtime playback", () => {
    const bridgeSource = readFileSync(REMOTION_SOURCE, "utf8");
    const filmSource = readFileSync(SHARED_REMOTION_SOURCE, "utf8");
    const rootSource = readFileSync(REMOTION_ROOT, "utf8");

    expect(bridgeSource).toContain("@toonstudio/product-tour-film");
    expect(filmSource).toContain("PRODUCT_TOUR_DURATION_SECONDS = 504");
    expect(filmSource).toContain("PRODUCT_TOUR_FPS = 30");
    expect(rootSource).toContain('id="ToonStudioProductTour"');
    expect(rootSource).toContain("PRODUCT_TOUR_DURATION_SECONDS * PRODUCT_TOUR_FPS");
  });

  it("ships the poster, bilingual captions and real-screen chapter media locally", () => {
    for (const asset of [
      "toonstudio-product-tour-poster.jpg",
      "toonstudio-product-tour.ko.vtt",
      "toonstudio-product-tour.en.vtt",
      "product-tour/01-overview.png",
      "product-tour/02-plan.png",
      "product-tour/03-draw.png",
      "product-tour/05-3d.png",
      "product-tour/06-ai.png",
      "product-tour/07-production.png",
      "product-tour/07-review.png",
      "product-tour/08-learn.png",
      "product-tour/09-publish.png",
    ]) {
      expect(existsSync(`${PUBLIC_BRAND}/${asset}`), asset).toBe(true);
    }
  });

  it("ships versioned Remotion runtime narration, BGM and shared cue data", () => {
    const manifest = JSON.parse(readFileSync(RUNTIME_AUDIO_MANIFEST, "utf8")) as typeof PRODUCT_TOUR_RUNTIME_AUDIO;
    const narration = readFileSync(`${PUBLIC_BRAND}/product-tour/toonstudio-product-tour-narration.ko.m4a`);
    const bgm = readFileSync(`${PUBLIC_BRAND}/product-tour/toonstudio-product-tour-bgm.m4a`);

    expect(manifest).toEqual(PRODUCT_TOUR_RUNTIME_AUDIO);
    expect(manifest.version).toBe(1);
    expect(manifest.duration).toBe(504);
    expect(manifest.cues).toHaveLength(27);
    expect(manifest.narration.src).toMatch(/\?v=[a-f0-9]{16}$/u);
    expect(manifest.bgm.src).toMatch(/\?v=[a-f0-9]{16}$/u);
    expect(manifest.narration.bytes).toBe(narration.byteLength);
    expect(manifest.bgm.bytes).toBe(bgm.byteLength);
    expect(createHash("sha256").update(narration).digest("hex")).toBe(manifest.narration.sha256);
    expect(createHash("sha256").update(bgm).digest("hex")).toBe(manifest.bgm.sha256);
  });

  it("ships a versioned narrated mix with original BGM and synchronized captions", () => {
    const video = readFileSync(`${PUBLIC_BRAND}/toonstudio-product-tour.mp4`);
    const manifest = JSON.parse(
      readFileSync(`${PUBLIC_BRAND}/product-tour-manifest.json`, "utf8"),
    ) as {
      version: number;
      bytes: number;
      sha256: string;
      audio?: { narration?: { locale?: string }; bgm?: unknown[]; mix?: string };
    };
    const sha256 = createHash("sha256").update(video).digest("hex");

    expect(PRODUCT_TOUR.src).toMatch(/^\/brand\/toonstudio-product-tour\.mp4\?v=[a-f0-9]{16}$/u);
    expect(PRODUCT_TOUR.bytes).toBe(video.byteLength);
    expect(manifest).toMatchObject({
      version: 2,
      bytes: video.byteLength,
      sha256,
      audio: {
        narration: { locale: "ko-KR" },
        mix: "stereo-aac-128k-with-narration-ducking",
      },
    });
    expect(manifest.audio?.bgm).toHaveLength(2);
    expect(existsSync("tools/media/brand-film/audio/toonstudio-product-tour-narration.ko.m4a")).toBe(true);

    for (const locale of ["ko", "en"] as const) {
      const captions = readFileSync(`${PUBLIC_BRAND}/toonstudio-product-tour.${locale}.vtt`, "utf8");
      const cueLines = captions
        .split(/\r?\n/u)
        .filter((line) => line.includes(" --> "));
      expect(cueLines).toHaveLength(27);
      expect(captions).toContain("00:08:16.000");
    }
  });

});

describe("product tour: lengths are derived and the copy stays honest", () => {
  it("keeps the page data, the shared Remotion package and the runtime audio on one length and frame rate", () => {
    expect(PRODUCT_TOUR.duration).toBe(PRODUCT_TOUR_DURATION_SECONDS);
    expect(PRODUCT_TOUR.fps).toBe(PRODUCT_TOUR_FPS);
    expect(PRODUCT_TOUR_RUNTIME_AUDIO.duration).toBe(PRODUCT_TOUR.duration);
    expect(PRODUCT_TOUR_RUNTIME_AUDIO.fps).toBe(PRODUCT_TOUR.fps);
  });

  it("formats the running time for people (ko/en, short/long) and for schema.org", () => {
    expect(formatProductTourDuration(504, "ko")).toBe("8분 24초");
    expect(formatProductTourDuration(504, "en")).toBe("8m 24s");
    expect(formatProductTourDuration(504, "en", "long")).toBe("8 minutes 24 seconds");
    expect(formatProductTourDuration(480, "ko")).toBe("8분");
    expect(formatProductTourDuration(61, "en", "long")).toBe("1 minute 1 second");
    expect(formatProductTourDuration(0, "ko")).toBe("0초");
    expect(productTourIsoDuration(504)).toBe("PT8M24S");
    expect(productTourIsoDuration(24)).toBe("PT24S");
    expect(productTourIsoDuration(480)).toBe("PT8M");
    expect(productTourIsoDuration(3605)).toBe("PT1H5S");
    expect(productTourIsoDuration(0)).toBe("PT0S");
  });

  it("derives the chips, eyebrow, intro and meta description from PRODUCT_TOUR instead of retyping them", () => {
    const { ko, en } = PRODUCT_TOUR_COPY;
    const chapterCount = PRODUCT_TOUR.chapters.length;
    expect(ko.facts[0]).toBe(formatProductTourDuration(PRODUCT_TOUR.duration, "ko"));
    expect(en.facts[0]).toBe(formatProductTourDuration(PRODUCT_TOUR.duration, "en"));
    expect(ko.facts[1]).toBe(`${chapterCount}개 제작 챕터`);
    expect(en.facts[1]).toBe(`${chapterCount} production chapters`);
    expect(ko.intro).toContain(`${chapterCount}개 챕터`);
    expect(en.intro).toContain(`${chapterCount} chapters`);
    expect(ko.eyebrow).toBe(`PRODUCT TOUR · ${formatProductTourTime(PRODUCT_TOUR.duration)}`);
    expect(ko.metaDescription).toContain(formatProductTourDuration(PRODUCT_TOUR.duration, "ko"));
    expect(en.metaDescription).toContain(formatProductTourDuration(PRODUCT_TOUR.duration, "en"));
    // 스크린 리더는 "8:24" 를 길이로 읽지 못하므로 말로 읽히는 길이를 따로 둔다.
    expect(ko.eyebrowSr).toContain("8분 24초");
    expect(en.eyebrowSr).toContain("8 minutes 24 seconds");
    // 제목의 "8분 안에" 는 반올림한 표현이다. 영상 길이가 바뀌어 분이 달라지면 이 문구를 다시 검토하도록 잠근다.
    expect(ko.title[1]).toContain(`${Math.floor(PRODUCT_TOUR.duration / 60)}분`);
    expect(en.title[1]).toContain(`${Math.floor(PRODUCT_TOUR.duration / 60)} minutes`);
  });

  it("calls the film product captures plus concept illustrations in the meta description, never real product screens", () => {
    for (const locale of ["ko", "en"] as const) {
      const meta = PRODUCT_TOUR_COPY[locale].metaDescription;
      expect(meta, locale).not.toMatch(/실제 제품 화면|real product screens/iu);
      // useMetaDescription 은 200자에서 자른다.
      expect(meta.length, locale).toBeLessThanOrEqual(200);
    }
    expect(PRODUCT_TOUR_COPY.ko.metaDescription).toContain("제품 화면 캡처와 개념 도해");
    expect(PRODUCT_TOUR_COPY.en.metaDescription).toContain("product captures and concept illustrations");
  });

  it("says the narration is synthesized and the music is AI-generated, and ties that to the audio pipeline", () => {
    expect(PRODUCT_TOUR_COPY.ko.facts[2]).toContain("합성");
    expect(PRODUCT_TOUR_COPY.ko.facts[2]).toContain("AI 생성");
    expect(PRODUCT_TOUR_COPY.en.facts[2]).toContain("Synthesized");
    expect(PRODUCT_TOUR_COPY.en.facts[2]).toContain("AI-generated");
    expect(PRODUCT_TOUR_RUNTIME_AUDIO.narration.voice.provider).toBe("macOS speech synthesis");
    expect(PRODUCT_TOUR_RUNTIME_AUDIO.narration.disclosure.ko).toContain("합성 음성");
    // 배경음은 사이트 오리지널 OST 15곡 중 2곡이다. 믹스 스크립트가 읽는 곡이 정확히 둘이어야 화면의 "2곡" 이 맞다.
    const mix = readFileSync("tools/media/brand-film/mix-product-tour-audio.mjs", "utf8");
    expect([...mix.matchAll(/audio\/original\/([a-z-]+)\.mp3/gu)].map((match) => match[1])).toEqual([
      "ink-and-starlight-instrumental",
      "atlas-of-starlight-instrumental",
    ]);
    expect(PRODUCT_TOUR_COPY.ko.audioNote).toContain("2곡");
    expect(PRODUCT_TOUR_COPY.en.audioNote).toContain("two");
    // OST 파이프라인은 AI 생성기(ElevenLabs·ACE-Step)의 출처 기록이 있는 곡만 게시 목록에 올린다.
    const generator = readFileSync("scripts/generate-site-original-ost.mjs", "utf8");
    expect(generator).toContain('metadata.provider === "elevenlabs"');
    expect(generator).toContain('metadata.provider === "ace-step"');
  });
});

describe("product tour: technology links and the 'how it was made' note", () => {
  it("shows route conditions and the chapter's technology under each chapter card, and extends the next links", () => {
    const page = readFileSync(PAGE_SOURCE, "utf8");
    expect(page).toContain("<ProductTourTechLinks chapterId={chapter.id} />");
    expect(page).toContain("<RouteConditionBadges href={chapter.feature.href} />");
    for (const href of ["/brand-film", "/features", "/about/workflow", "/about/technology"]) {
      expect(page, href).toContain(`href="${href}"`);
    }
    // 노트는 다음 단계 버튼 뒤, 기술·발표 자료 이어 보기 앞에 둔다. 읽기 순서: 다음 → 만든 방법 → 더 깊은 자료.
    expect(page.indexOf("<ServiceFlowNext")).toBeLessThan(page.indexOf("<ProductTourMadeNote />"));
    expect(page.indexOf("<ProductTourMadeNote />")).toBeLessThan(page.indexOf("<ServiceStoryJourney"));
    expect(page).toContain('<span className="sr-only">{copy.eyebrowSr}</span>');
  });

  it("gives every tour chapter one to three technology cards and exactly one story chapter", () => {
    expect(Object.keys(PRODUCT_TOUR_TECH_LINKS).sort()).toEqual(PRODUCT_TOUR.chapters.map((chapter) => chapter.id).sort());
    for (const chapter of PRODUCT_TOUR.chapters) {
      const tech = PRODUCT_TOUR_TECH_LINKS[chapter.id];
      expect(tech.atlas.length, chapter.id).toBeGreaterThanOrEqual(1);
      expect(tech.atlas.length, chapter.id).toBeLessThanOrEqual(3);
      expect(new Set(tech.atlas.map((link) => link.atlasId)).size, chapter.id).toBe(tech.atlas.length);
      for (const text of [...tech.atlas.map((link) => link.label), tech.story.label]) {
        expect(text.ko.trim(), chapter.id).toBe(text.ko);
        expect(text.en.trim(), chapter.id).toBe(text.en);
        expect(text.ko.length, chapter.id).toBeGreaterThan(0);
        expect(HANGUL.test(text.en), `${chapter.id}: ${text.en}`).toBe(false);
      }
      expect(PRODUCT_TOUR_TECH_STATUS_LABEL[tech.story.status], chapter.id).toBeDefined();
    }
  });

  it("explains the film in four lines whose claims match the code", () => {
    const note = readFileSync(MADE_NOTE_SOURCE, "utf8");
    for (const needle of ["<details", "@remotion/player", "@toonstudio/product-tour-film", "?player=mp4", "Range", "Blob", "WebVTT", "PRODUCT_TOUR_MEDIA_ATLAS_LINKS", "/about/technology/videos"]) {
      expect(note, needle).toContain(needle);
    }
    // 라이선스는 "저장소로 확인할 수 없다" 까지만 말한다(법률 판단 금지).
    expect(note).toContain("확인할 수 없습니다");
    expect(note).not.toMatch(/무료로 (?:사용|이용)|라이선스를 (?:구매|취득)|사용 자격이 있/u);
    expect(PRODUCT_TOUR_MEDIA_ATLAS_LINKS.map((link) => link.atlasId)).toEqual([
      "remotion-composition-player",
      "webvtt-caption-tracks",
      "http-range-blob-seekable-media",
      "video-object-json-ld",
      "aria-tabs-site-section-tabs",
    ]);

    // 웹앱이 Remotion 을 실행 코드로 가져오는 곳은 투어 재생기뿐이고, 브랜드 필름은 파일로만 서빙한다.
    const dependencies = (JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> }).dependencies;
    expect(Object.keys(dependencies)).toEqual(expect.arrayContaining(["remotion", "@remotion/player", "@toonstudio/product-tour-film"]));
    expect(readFileSync(PLAYER_SOURCE, "utf8")).toContain('from "@remotion/player"');
    for (const file of ["BrandFilmPage.tsx", "CreatorBrandFilm.tsx", "BrandFilmStoryboard.tsx"]) {
      expect(readFileSync(`apps/web/src/domains/marketing/${file}`, "utf8"), file).not.toMatch(/from "(?:remotion|@remotion\/player|@toonstudio\/product-tour-film)"/u);
    }
  });
});

