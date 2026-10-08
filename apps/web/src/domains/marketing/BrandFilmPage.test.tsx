import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CREATOR_FILM } from "./creator-home-content";
import { PRODUCT_TOUR, formatProductTourDuration } from "./product-tour-content";

const PAGE_SOURCE = "apps/web/src/domains/marketing/BrandFilmPage.tsx";
const FILM_COMPOSITIONS = "tools/media/brand-film/src/index.tsx";
const PAGE_STYLES = "apps/web/src/domains/marketing/brand-film-page.css";
const PUBLIC_BRAND = "apps/web/public/brand";


describe("brand film public page contracts", () => {
  it("uses the shared accessible player and localized page metadata", () => {
    const source = readFileSync(PAGE_SOURCE, "utf8");

    expect(source).toContain("<CreatorBrandFilm");
    expect(source).toContain('canonicalPath: "/brand-film"');
    expect(source).toContain('"@type": "VideoObject"');
    expect(source).toContain('data-brand-film="remotion"');
    expect(source).toContain('href="/studio/new"');
    expect(source).toContain('href="/showcase/promo"');
  });

  it("ships every rendered ratio, the poster and bilingual captions locally", () => {
    for (const asset of [
      "toonstudio-intro.mp4",
      "toonstudio-intro-portrait.mp4",
      "toonstudio-intro-square.mp4",
      "toonstudio-film-poster.jpg",
      "toonstudio-intro.ko.vtt",
      "toonstudio-intro.en.vtt",
    ]) {
      expect(existsSync(`${PUBLIC_BRAND}/${asset}`), asset).toBe(true);
    }
  });

  it("keeps mobile, reduced-motion and high-contrast layouts explicit", () => {
    const styles = readFileSync(PAGE_STYLES, "utf8");

    expect(styles).toContain("overflow-x: clip");
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain("@media (max-width: 460px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (prefers-contrast: more), (forced-colors: active)");
  });
});

describe("brand film copy matches the film that is rendered", () => {
  /** 렌더 루트에 등록된 24초 계열 컴포지션(가로·세로·정사각·헤더·공유 이미지)의 fps 와 프레임 수. */
  function filmCompositions(): readonly { readonly id: string; readonly fps: number; readonly frames: number }[] {
    const root = readFileSync(FILM_COMPOSITIONS, "utf8");
    return [...root.matchAll(/<Composition id="(ToonStudio(?:Landscape|Portrait|Square|RouteHeader|Share))"[^>]*?fps=\{(\d+)\} durationInFrames=\{(\d+)\}/gu)].map((match) => ({
      id: match[1] ?? "",
      fps: Number(match[2]),
      frames: Number(match[3]),
    }));
  }

  it("states a length, frame rate and frame count that every rendition's composition shares with CREATOR_FILM", () => {
    const compositions = filmCompositions();
    expect(compositions.map((item) => item.id)).toEqual([
      "ToonStudioLandscape",
      "ToonStudioPortrait",
      "ToonStudioSquare",
      "ToonStudioRouteHeader",
      "ToonStudioShare",
    ]);
    const { fps, frames } = compositions[0] ?? { fps: 0, frames: 0 };
    for (const item of compositions) {
      expect(item.fps, item.id).toBe(fps);
      expect(item.frames, item.id).toBe(frames);
    }
    expect(frames / fps).toBe(CREATOR_FILM.duration);

    // 화면의 "24초 · 00:24 · 30fps, 720프레임" 은 문구라서 데이터에서 만들지 않는다. 영상을 다시 렌더해 값이 바뀌면 여기서 걸린다.
    const source = readFileSync(PAGE_SOURCE, "utf8");
    const seconds = CREATOR_FILM.duration;
    expect(source).toContain(`"${seconds}초"`);
    expect(source).toContain(`"${seconds} seconds"`);
    expect(source).toContain(`BRAND FILM · 00:${seconds}`);
    expect(source).toContain(`${seconds}초 Remotion 브랜드 필름`);
    expect(source).toContain(`${seconds}-second Remotion brand film`);
    expect(source).toContain(`${fps}fps, ${frames}프레임`);
    expect(source).toContain(`${fps}fps, ${frames}-frame`);
    // 구조화 데이터의 길이는 문자열을 적지 않고 CREATOR_FILM.duration 에서 만든다.
    expect(source).toContain("duration: `PT${CREATOR_FILM.duration}S`");
    expect(source).not.toContain('"PT24S"');
  });

  it("says in the folded Remotion section that this film is a pre-rendered MP4 and only the tour is composed live", () => {
    const source = readFileSync(PAGE_SOURCE, "utf8");
    const fold = source.slice(source.indexOf('<details className="mk-fold brand-film-page__production">'), source.indexOf("</details>"));
    expect(fold).toContain("{copy.productionNote}");
    expect(fold).toContain('href="/about/technology/videos"');
    expect(fold).toContain('href="/about/technology/atlas#remotion-composition-player"');
    // 8분 투어 길이는 투어 데이터에서 계산해 문구에 넣는다.
    expect(source).toContain('formatProductTourDuration(PRODUCT_TOUR.duration, "ko")');
    expect(source).toContain('formatProductTourDuration(PRODUCT_TOUR.duration, "en")');
    expect(formatProductTourDuration(PRODUCT_TOUR.duration, "ko")).toBe("8분 24초");
    // 이 페이지는 Remotion 을 실행 코드로 가져오지 않는다 — 사전 렌더 MP4 파일만 서빙한다.
    expect(source).not.toMatch(/from "(?:remotion|@remotion\/player|@toonstudio\/product-tour-film)"/u);
  });
});

