import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const atelierMotionCss = readFileSync(new URL("./atelier-motion.css", import.meta.url), "utf8");
const vibrantMotionCss = readFileSync(
  new URL("../../shared/ui/vibrant-identity/vibrant-page-motion.css", import.meta.url),
  "utf8",
);
const vibrantBannerTsx = readFileSync(
  new URL("../../shared/ui/vibrant-identity/VibrantPageIdentityBanner.tsx", import.meta.url),
  "utf8",
);

const GPU_COMPOSITED_PROPERTIES = new Set(["scale", "translate", "rotate", "transform", "opacity"]);
const ALLOWED_TRANSITION_PROPERTIES = new Set([
  ...GPU_COMPOSITED_PROPERTIES,
  "color",
  "background-color",
  "border-color",
  "box-shadow",
  "display",
  "overlay",
  "none",
]);
const FORBIDDEN_LAYOUT_PROPERTIES = new Set([
  "all",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "margin",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "font-size",
  "line-height",
  "gap",
  "flex",
  "grid",
  "background-position",
  "border-width",
]);

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//gu, "");
}

/** 중괄호 균형을 맞춰 지정된 at-rule 헤더로 시작하는 블록 본문을 모두 추출한다. */
function extractAtRuleBlocks(css: string, headerPattern: RegExp): string[] {
  const source = stripComments(css);
  const blocks: string[] = [];
  for (const match of source.matchAll(headerPattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const open = source.indexOf("{", start);
    if (open === -1) continue;
    let depth = 0;
    let index = open;
    for (; index < source.length; index += 1) {
      const ch = source[index];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(open + 1, index));
  }
  return blocks;
}

/** 최상위 또는 블록 내부에서 `transition:` / `transition-property:` 대상 속성 이름을 추출한다. */
function extractTransitionTargetProperties(css: string): string[] {
  const source = stripComments(css);
  const props: string[] = [];

  for (const match of source.matchAll(/\btransition(?:-property)?\s*:\s*([^;{}]+);/gu)) {
    const value = (match[1] ?? "").replace(/!important/giu, "").trim();
    if (!value) continue;
    // cubic-bezier(...) 내부의 쉼표는 구분자에서 제외하고 최상위 쉼표로 분리한다.
    let parenDepth = 0;
    let segmentStart = 0;
    const segments: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (ch === "(") parenDepth += 1;
      else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
      else if (ch === "," && parenDepth === 0) {
        segments.push(value.slice(segmentStart, i).trim());
        segmentStart = i + 1;
      }
    }
    segments.push(value.slice(segmentStart).trim());

    for (const segment of segments) {
      const firstToken = segment.split(/\s+/u)[0]?.trim().toLowerCase();
      if (firstToken) props.push(firstToken);
    }
  }
  return props;
}

/** @keyframes 블록 내부에 선언된 CSS 속성 이름을 모두 수집한다. */
function extractKeyframeProperties(css: string): Array<{ name: string; property: string }> {
  const source = stripComments(css);
  const results: Array<{ name: string; property: string }> = [];
  for (const match of source.matchAll(/@keyframes\s+([\w-]+)\s*\{/gu)) {
    const name = match[1] ?? "";
    const start = match.index;
    if (start === undefined) continue;
    const open = source.indexOf("{", start);
    if (open === -1) continue;
    let depth = 0;
    let index = open;
    for (; index < source.length; index += 1) {
      const ch = source[index];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = source.slice(open + 1, index);
    for (const decl of body.matchAll(/([a-z-]+)\s*:\s*[^;{}]+;/giu)) {
      const property = decl[1]?.trim().toLowerCase();
      if (property) results.push({ name, property });
    }
  }
  return results;
}

describe("Atelier 전 페이지 촉각 마이크로-인터랙션 계약", () => {
  const cleanAtelier = stripComments(atelierMotionCss);
  const cleanVibrant = stripComments(vibrantMotionCss);

  it("쫀득한 스프링 클릭 피드백 토큰(--ease-spring-snappy, 110ms)과 scale: 0.975 프레스가 터치·펜 포함 전역으로 정의된다", () => {
    expect(cleanAtelier).toMatch(/--ease-spring-snappy\s*:\s*cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/u);
    expect(cleanAtelier).toMatch(/--motion-press\s*:\s*110ms/u);
    expect(cleanAtelier).toMatch(/scale\s*:\s*0\.975\s*;/u);
    expect(cleanAtelier).toMatch(/transition-duration\s*:\s*var\(--motion-press\)/u);

    // :active 프레스 피드백이 @media (hover: hover) 블록 안에 갇혀 있지 않아야 터치·펜 기기에서도 동작한다.
    const hoverOnlyBlocks = extractAtRuleBlocks(
      cleanAtelier,
      /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{/gu,
    ).join("\n");
    expect(hoverOnlyBlocks).not.toMatch(/scale\s*:\s*0\.975/u);

    // 버튼·탭·링크 CTA 클릭 대상이 모두 press 블록에 포함된다.
    const noPrefBlocks = extractAtRuleBlocks(
      cleanAtelier,
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/gu,
    ).join("\n");
    for (const selector of [
      ".fx-press:active",
      ".fx-sheen:active",
      ".site-header__create:active",
      ".site-footer__create:active",
      ".rd-clarity-start:active",
      '[role="tab"]:active',
      "button:",
    ]) {
      expect(noPrefBlocks, `터치/펜 포함 클릭 피드백 누락: ${selector}`).toContain(selector);
    }
  });

  it("정밀 포인터 호버(@media (hover: hover) and (pointer: fine))에서 4대 카드 마그네틱 리프트와 .ink-arrow 화살표 이동을 제공한다", () => {
    const fineHoverBlocks = extractAtRuleBlocks(
      cleanAtelier,
      /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{/gu,
    ).join("\n");

    expect(fineHoverBlocks.length).toBeGreaterThan(0);
    for (const cardClass of [".fx-lift:hover", ".ink-frame:hover", ".ts-showcase-sprite-card:hover", ".rd-v2-card:hover"]) {
      expect(fineHoverBlocks, `카드 마그네틱 리프트 누락: ${cardClass}`).toContain(cardClass);
    }
    expect(fineHoverBlocks).toMatch(/translate\s*:\s*0\s+-2px\s*;/u);
    expect(fineHoverBlocks).toMatch(/box-shadow\s*:\s*var\(--motion-lift-shadow\)\s*;/u);
    expect(fineHoverBlocks).toMatch(/\.ink-arrow:hover[^\n{]*svg:last-child/u);
    expect(fineHoverBlocks).toMatch(/translate\s*:\s*3px\s+0\s*;/u);
  });

  it("Primary CTA 스페큘러 쉬머 글라이드가 transform 전용 ::after와 color-mix(in oklch, var(--color-on-accent) 26%, transparent)를 사용한다", () => {
    for (const ctaClass of [".fx-sheen", ".site-header__create", ".site-footer__create", ".rd-clarity-start"]) {
      expect(cleanAtelier, `CTA 쉬머 컨테이너 누락: ${ctaClass}`).toContain(ctaClass);
      expect(cleanAtelier, `CTA 쉬머 가상요소 누락: ${ctaClass}::after`).toContain(`${ctaClass}::after`);
    }

    expect(cleanAtelier).toMatch(/overflow\s*:\s*hidden\s*;/u);
    expect(cleanAtelier).toMatch(/pointer-events\s*:\s*none\s*;/u);
    expect(cleanAtelier).toContain("color-mix(in oklch, var(--color-on-accent) 26%, transparent)");
    expect(cleanAtelier).toMatch(/transform\s*:\s*translate3d\(-125%,\s*0,\s*0\)/u);
    expect(cleanAtelier).toMatch(/transform\s*:\s*translate3d\(125%,\s*0,\s*0\)/u);
    expect(cleanAtelier).toMatch(/transition\s*:\s*transform\s+var\(--motion-sheen\)\s+var\(--ease-out-expo\)/u);
  });

  it("탭([role=tab][aria-selected=true])과 접이식(details > summary)이 첫 프레임 opacity: 1을 유지하며 미세 회전·GPU 진입을 수행한다", () => {
    expect(cleanAtelier).toContain('[role="tab"][aria-selected="true"]');
    expect(cleanAtelier).toContain("details > summary > svg:last-child");
    expect(cleanAtelier).toMatch(/details:not\(\[open\]\)\s*>\s*summary:hover\s*>\s*svg:last-child/u);
    expect(cleanAtelier).toMatch(/rotate\s*:\s*\d+deg\s*;/u);
    expect(cleanAtelier).toContain("details[open] > :not(summary)");

    // 첫 프레임 명암비 무결성(Axe WCAG AA): 탭·<details> 키프레임과 진입 규칙은 opacity: 0을 쓰지 않는다.
    const tabKeyframes = extractKeyframeProperties(cleanAtelier);
    expect(tabKeyframes.length).toBeGreaterThan(0);
    for (const entry of tabKeyframes) {
      expect(entry.property, `${entry.name} 키프레임 opacity 숨김 금지`).not.toBe("opacity");
    }
  });

  it("transition-all 및 레이아웃 유발 속성 전이가 0건이며 @keyframes는 GPU 합성 속성만 사용한다", () => {
    for (const [label, css] of [
      ["atelier-motion.css", cleanAtelier],
      ["vibrant-page-motion.css", cleanVibrant],
    ] as const) {
      expect(css, `${label}: transition-all 금지`).not.toMatch(/\btransition-all\b/u);
      expect(css, `${label}: transition: all 금지`).not.toMatch(/\btransition(?:-property)?\s*:\s*[^;{}]*\ball\b/iu);

      const transitionProps = extractTransitionTargetProperties(css);
      expect(transitionProps.length, `${label}: 전이 규칙 존재`).toBeGreaterThan(0);
      for (const prop of transitionProps) {
        expect(FORBIDDEN_LAYOUT_PROPERTIES.has(prop), `${label}: 금지된 레이아웃/전역 전이 속성 "${prop}"`).toBe(false);
        expect(ALLOWED_TRANSITION_PROPERTIES.has(prop), `${label}: 허용 목록 외 전이 속성 "${prop}"`).toBe(true);
      }

      const keyframeProps = extractKeyframeProperties(css);
      for (const { name, property } of keyframeProps) {
        expect(
          GPU_COMPOSITED_PROPERTIES.has(property),
          `${label}: @keyframes ${name}에 비-GPU 속성 "${property}" 금지`,
        ).toBe(true);
      }
    }
  });

  it("atelier-motion.css와 VibrantPageIdentityBanner.tsx에 원시 hex/rgb/hsl 색상이 0건이고 OKLCH 토큰 합성만 사용한다", () => {
    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/iu;

    expect(cleanAtelier).not.toMatch(rawColorRegex);
    expect(cleanAtelier).toContain("color-mix(in oklch,");

    expect(vibrantBannerTsx).not.toMatch(rawColorRegex);
    expect(vibrantBannerTsx).not.toMatch(/\btransition-all\b|\bhover:scale-|\banimate-pulse\b/u);
    expect(vibrantBannerTsx).toContain("vp-cta-primary fx-press fx-sheen ink-arrow");
    expect(vibrantBannerTsx).toContain("vp-flow-chip fx-press");
    expect(vibrantBannerTsx).toContain("vp-quick-link fx-press ink-arrow");
  });

  it("prefers-reduced-motion: reduce, contrast 테마, forced-colors: active 3중 경로 모두에서 transform·scale·translate·sheen을 완전 비활성화한다", () => {
    // 1. prefers-reduced-motion: reduce
    const reducedAtelier = extractAtRuleBlocks(
      cleanAtelier,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/gu,
    ).join("\n");
    expect(reducedAtelier.length).toBeGreaterThan(0);
    for (const assertion of [
      "animation: none !important",
      "transition: none !important",
      "scale: none !important",
      "translate: none !important",
      "rotate: none !important",
      "transform: none !important",
      "display: none !important",
      ".fx-sheen::after",
      ".site-header__create::after",
      ".site-footer__create::after",
      ".rd-clarity-start::after",
    ]) {
      expect(reducedAtelier, `reduced-motion 누락: ${assertion}`).toContain(assertion);
    }

    // 2. :root[data-design-theme="contrast"]
    const contrastStart = cleanAtelier.indexOf(':root[data-design-theme="contrast"]');
    const forcedStart = cleanAtelier.indexOf("@media (forced-colors: active)");
    expect(contrastStart).toBeGreaterThan(-1);
    expect(forcedStart).toBeGreaterThan(contrastStart);
    const contrastSection = cleanAtelier.slice(contrastStart, forcedStart);
    for (const assertion of [
      "--motion-lift-shadow: none",
      "animation: none !important",
      "transition: none !important",
      "scale: none !important",
      "translate: none !important",
      "rotate: none !important",
      "transform: none !important",
      "box-shadow: none !important",
      "display: none !important",
      ".fx-sheen",
      ".site-header__create",
      ".site-footer__create",
      ".rd-clarity-start",
    ]) {
      expect(contrastSection, `contrast 테마 해제 누락: ${assertion}`).toContain(assertion);
    }

    // 3. @media (forced-colors: active)
    const forcedAtelier = extractAtRuleBlocks(
      cleanAtelier,
      /@media\s*\(forced-colors:\s*active\)\s*\{/gu,
    ).join("\n");
    expect(forcedAtelier.length).toBeGreaterThan(0);
    for (const assertion of [
      "--motion-lift-shadow: none",
      "animation: none !important",
      "transition: none !important",
      "scale: none !important",
      "translate: none !important",
      "rotate: none !important",
      "transform: none !important",
      "box-shadow: none !important",
      "display: none !important",
      ".fx-sheen::after",
      ".site-header__create::after",
      ".site-footer__create::after",
      ".rd-clarity-start::after",
    ]) {
      expect(forcedAtelier, `forced-colors 해제 누락: ${assertion}`).toContain(assertion);
    }

    // 4. vibrant-page-motion.css 3중 접근성 해제도 동기화돼 있다.
    const reducedVibrant = extractAtRuleBlocks(
      cleanVibrant,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/gu,
    ).join("\n");
    const forcedVibrant = extractAtRuleBlocks(
      cleanVibrant,
      /@media\s*\(forced-colors:\s*active\)\s*\{/gu,
    ).join("\n");
    expect(reducedVibrant).toContain("scale: none !important");
    expect(reducedVibrant).toContain("translate: none !important");
    expect(reducedVibrant).toContain("transform: none !important");
    expect(cleanVibrant).toContain(':root[data-design-theme="contrast"] .vp-cta-primary::after { display: none !important; }');
    expect(forcedVibrant).toContain("scale: none !important");
    expect(forcedVibrant).toContain("translate: none !important");
    expect(forcedVibrant).toContain(".vp-cta-primary::after { display: none !important; }");
  });
});
