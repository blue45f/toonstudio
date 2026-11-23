// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CreatorReliefAutopilotPanel } from "./CreatorReliefAutopilotPanel";
import {
  CHARACTER_BASE_COLOR_PRESETS,
  CROWD_SCENE_IDS,
  CUT_MOOD_IDS,
  MAX_BALLOON_CHARS,
  SHADING_LIGHTING_MOOD_IDS,
  autoLayoutScriptToBalloons,
  buildCutCompositionSvg,
  buildPerspectiveCrowdSvg,
  buildScriptBalloonsSvg,
  buildShadingRampSvg,
  deriveWebtoon5ToneShadingRamp,
  formatRgbToHex,
  generatePerspectiveCrowdSilhouettes,
  suggestCutCompositionsFromLine,
} from "./creator-relief-engine";

const HANGUL_REGEX = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;

describe("creator-relief-autopilot 엔진 및 UI 검증", () => {
  beforeEach(() => {
    useI18n.getState().setLang("ko");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    useI18n.getState().setLang("ko");
  });

  it("① 5감정×3구도 추천: 모든 감정에서 3종 구도 카드·3분할 앵커·말풍선 회피 좌표·SVG 와이어프레임을 반환한다", () => {
    for (const mood of CUT_MOOD_IDS) {
      const cards = suggestCutCompositionsFromLine("지금 당장 여기서 빠져나가야 해!", mood);
      expect(cards).toHaveLength(3);

      const ids = new Set(cards.map((card) => card.id));
      expect(ids.size).toBe(3);

      for (const card of cards) {
        expect(card.mood).toBe(mood);
        expect(card.thirdsAnchor.x).toBeGreaterThanOrEqual(20);
        expect(card.thirdsAnchor.x).toBeLessThanOrEqual(80);
        expect(card.balloonAnchor.x).toBeGreaterThanOrEqual(15);
        expect(card.balloonAnchor.x).toBeLessThanOrEqual(85);
        // 말풍선 좌표가 인물 초점 앵커를 가리지 않도록 최소 거리 유지
        const dist = Math.hypot(
          card.thirdsAnchor.x - card.balloonAnchor.x,
          card.thirdsAnchor.y - card.balloonAnchor.y,
        );
        expect(dist).toBeGreaterThanOrEqual(22);
        expect(card.gutterPx).toBeGreaterThanOrEqual(24);
        expect(card.wireframe.figures.length).toBeGreaterThanOrEqual(1);

        const svg = buildCutCompositionSvg(card);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
      }
    }

    // 문장부호에 따른 호흡 여백·말풍선 스타일 반응 검증
    const shoutCards = suggestCutCompositionsFromLine("멈춰!!", "confrontation");
    const pauseCards = suggestCutCompositionsFromLine("그건… 아니야…", "confrontation");
    expect(shoutCards[0].recommendedBalloonStyle).toBe("shout");
    expect(pauseCards[0].gutterPx).toBeGreaterThan(shoutCards[0].gutterPx);
    expect(suggestCutCompositionsFromLine("(아무에게도 들키면 안 돼)", "quiet")[0].recommendedBalloonStyle).toBe(
      "thought",
    );
    expect(suggestCutCompositionsFromLine("[나레이션] 새벽이 밝았다.", "quiet")[0].recommendedBalloonStyle).toBe(
      "narration",
    );
  });

  it("② 원근 군중 1클릭 생성: 4장면 모두 3~24명 경계를 준수하고 앞쪽(근경) scale > 뒤쪽(원경) scale로 깊이 정렬된다", () => {
    for (const scene of CROWD_SCENE_IDS) {
      const lowClamped = generatePerspectiveCrowdSilhouettes({ scene, count: 1, seed: 7 });
      expect(lowClamped.count).toBe(3);
      expect(lowClamped.silhouettes).toHaveLength(3);

      const highClamped = generatePerspectiveCrowdSilhouettes({ scene, count: 99, seed: 7 });
      expect(highClamped.count).toBe(24);
      expect(highClamped.silhouettes).toHaveLength(24);

      const crowd = generatePerspectiveCrowdSilhouettes({
        scene,
        count: 14,
        horizonPct: 42,
        seed: 123,
      });
      expect(crowd.silhouettes).toHaveLength(14);

      for (let i = 1; i < crowd.silhouettes.length; i += 1) {
        const back = crowd.silhouettes[i - 1];
        const front = crowd.silhouettes[i];
        expect(front.depth).toBeGreaterThan(back.depth);
        expect(front.baselineYPct).toBeGreaterThan(back.baselineYPct);
        expect(front.scale).toBeGreaterThan(back.scale);
        expect(front.opacity).toBeGreaterThanOrEqual(back.opacity);
      }

      // 결정론 재현성 확인
      const repeat = generatePerspectiveCrowdSilhouettes({
        scene,
        count: 14,
        horizonPct: 42,
        seed: 123,
      });
      expect(repeat).toEqual(crowd);

      const svg = buildPerspectiveCrowdSvg(crowd);
      expect(svg).toContain("<svg");
      expect(svg).toContain("<circle");
    }
  });

  it("③ 5-톤 웹툰 음영 팔레트: 모든 조명 무드·캐릭터 기본색에서 명도가 단조 감소(highlight > base > shadow1 > shadow2)하고 색조 시프트가 적용된다", () => {
    for (const mood of SHADING_LIGHTING_MOOD_IDS) {
      for (const preset of CHARACTER_BASE_COLOR_PRESETS) {
        const ramp = deriveWebtoon5ToneShadingRamp(preset.rgb, mood);
        expect(ramp.stops).toHaveLength(5);

        // OKLCH 지각 명도 단조 감소 검증
        expect(ramp.highlight.oklch.l).toBeGreaterThan(ramp.base.oklch.l);
        expect(ramp.base.oklch.l).toBeGreaterThan(ramp.shadow1.oklch.l);
        expect(ramp.shadow1.oklch.l).toBeGreaterThan(ramp.shadow2.oklch.l);

        // WCAG 상대 휘도 단조 감소 검증
        expect(ramp.highlight.relativeLuminance).toBeGreaterThan(ramp.base.relativeLuminance);
        expect(ramp.base.relativeLuminance).toBeGreaterThan(ramp.shadow1.relativeLuminance);
        expect(ramp.shadow1.relativeLuminance).toBeGreaterThan(ramp.shadow2.relativeLuminance);

        // 림라이트는 그림자보다 밝고 유효한 sRGB/OKLCH 수치 객체여야 함
        expect(ramp.rimLight.oklch.l).toBeGreaterThan(ramp.shadow1.oklch.l);
        for (const stop of ramp.stops) {
          expect(stop.rgb.r).toBeGreaterThanOrEqual(0);
          expect(stop.rgb.r).toBeLessThanOrEqual(255);
          expect(stop.rgb.g).toBeGreaterThanOrEqual(0);
          expect(stop.rgb.g).toBeLessThanOrEqual(255);
          expect(stop.rgb.b).toBeGreaterThanOrEqual(0);
          expect(stop.rgb.b).toBeLessThanOrEqual(255);
          expect(formatRgbToHex(stop.rgb)).toMatch(/^#[0-9A-F]{6}$/u);
        }
      }
    }

    // 같은 기본 피부톤이라도 조명 무드(warm-day vs sunset vs cool-night)에 따라 1차 음영 색조가 실제로 시프트됨
    const skin = CHARACTER_BASE_COLOR_PRESETS[0].rgb;
    const warmDay = deriveWebtoon5ToneShadingRamp(skin, "warm-day");
    const sunset = deriveWebtoon5ToneShadingRamp(skin, "sunset");
    const coolNight = deriveWebtoon5ToneShadingRamp(skin, "cool-night");
    expect(Math.abs(warmDay.shadow1.hueShiftDeg)).toBeGreaterThan(5);
    expect(sunset.shadow1.oklch.h).not.toBe(coolNight.shadow1.oklch.h);
    expect(buildShadingRampSvg(warmDay)).toContain("rgb(");
  });

  it("④ 대본→말풍선 오토파일럿: 긴 대본을 38자 이하로 자연 분절하고 4종 말풍선 스타일·호흡 여백을 정확히 산출한다", () => {
    const rawScript = [
      "[나레이션] 빗방울이 창문을 두드리는 깊은 밤, 두 사람 사이에는 오직 시계 초침 소리만 흐르고 있었다.",
      "세라: 정말로 우리 약속을 전부 없던 일로 만들고 이 도시를 떠나려는 건가요? 저는 아직도 그날 밤을 생생하게 기억하는데요.",
      "카엘: (미안해, 지금 말하면 너까지 위험해지니까 차마 입을 열 수가 없어...)",
      "카엘: 멈춰! 더 이상 한 걸음도 가까이 오지 마!",
      "세라: 왜 그런 눈으로 나를 보는 거야?",
      "지훈: 공백없는초장문테스트문자열을넣더라도반드시삼십팔자이하로안전하게잘려야합니다끝",
    ].join("\n");

    const layout = autoLayoutScriptToBalloons(rawScript);
    expect(layout.maxCharsPerBalloon).toBe(MAX_BALLOON_CHARS);
    expect(layout.totalInputLines).toBe(6);
    expect(layout.totalBalloons).toBeGreaterThan(6);
    expect(layout.splitCount).toBeGreaterThanOrEqual(3);

    for (const item of layout.items) {
      expect(item.charCount).toBeLessThanOrEqual(MAX_BALLOON_CHARS);
      expect(item.text.length).toBeLessThanOrEqual(MAX_BALLOON_CHARS);
      expect(item.lines.length).toBeGreaterThanOrEqual(1);
      expect(item.gutterPx).toBeGreaterThanOrEqual(36);
    }

    const styles = new Set(layout.items.map((item) => item.style));
    expect(styles.has("narration")).toBe(true);
    expect(styles.has("speech")).toBe(true);
    expect(styles.has("thought")).toBe(true);
    expect(styles.has("shout")).toBe(true);

    const narrationItem = layout.items.find((item) => item.style === "narration");
    const shoutItem = layout.items.find((item) => item.style === "shout");
    expect(narrationItem?.speaker).toBeNull();
    expect(narrationItem?.side).toBe("center");
    expect(shoutItem?.gutterPx).toBeLessThan(100);
    expect(layout.items.some((item) => item.isSplitContinuation)).toBe(true);

    const svg = buildScriptBalloonsSvg(layout);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");

    // 빈 입력 안전 처리
    const empty = autoLayoutScriptToBalloons("   \n\n  ");
    expect(empty.totalBalloons).toBe(0);
    expect(empty.items).toEqual([]);
  });

  it("UI 4탭 전환·조작·JSON/SVG 내보내기 콜백이 정상 동작한다", () => {
    const onExportJson = vi.fn();
    const onExportSvg = vi.fn();

    render(
      <CreatorReliefAutopilotPanel onExportJson={onExportJson} onExportSvg={onExportSvg} />,
    );

    // 탭 1: 빈 컷 구도 추천
    expect(screen.getByTestId("cra-panel-composition")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cra-mood-romance"));
    fireEvent.click(screen.getByTestId("cra-select-comp-1"));
    fireEvent.click(screen.getByTestId("cra-export-json"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toBe("composition");
    expect(JSON.parse(String(onExportJson.mock.calls[0]?.[1]))).toHaveProperty("mood", "romance");

    // 탭 2: 엑스트라 군중 1클릭
    fireEvent.click(screen.getByTestId("cra-tab-crowd"));
    expect(screen.getByTestId("cra-panel-crowd")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cra-scene-street"));
    fireEvent.change(screen.getByTestId("cra-crowd-count-slider"), { target: { value: "18" } });
    fireEvent.click(screen.getByTestId("cra-crowd-reshuffle"));
    fireEvent.click(screen.getByTestId("cra-export-svg-copy"));
    expect(onExportSvg).toHaveBeenCalledTimes(1);
    expect(String(onExportSvg.mock.calls[0]?.[1])).toContain("<svg");

    // 탭 3: 5-톤 음영 팔레트
    fireEvent.click(screen.getByTestId("cra-tab-shading"));
    expect(screen.getByTestId("cra-panel-shading")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cra-lighting-sunset"));
    fireEvent.click(screen.getByTestId("cra-color-preset-rofan-dress"));
    fireEvent.click(screen.getByTestId("cra-copy-stop-shadow1"));
    expect(screen.getByTestId("cra-stop-shadow2")).toBeTruthy();

    // 탭 4: 대본→말풍선 자동 배치
    fireEvent.click(screen.getByTestId("cra-tab-script"));
    expect(screen.getByTestId("cra-panel-script")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cra-script-sample-action"));
    expect(screen.getByTestId("cra-balloon-item-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cra-export-svg-download"));
    expect(onExportSvg).toHaveBeenCalledTimes(2);
  });

  it("EN 모드에서는 4개 탭 전환·조작·입력값·속성·상태바 어디에도 한글이 0자다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<CreatorReliefAutopilotPanel />);

    const assertZeroHangul = () => {
      const text = container.textContent ?? "";
      expect(HANGUL_REGEX.test(text), `Unexpected Hangul in text: ${text}`).toBe(false);

      const allElements = container.querySelectorAll("*");
      for (const el of allElements) {
        for (const attr of ["aria-label", "title", "placeholder"]) {
          const val = el.getAttribute(attr);
          if (val) {
            expect(HANGUL_REGEX.test(val), `Unexpected Hangul in ${attr}: ${val}`).toBe(false);
          }
        }
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          expect(HANGUL_REGEX.test(el.value), `Unexpected Hangul in input value: ${el.value}`).toBe(
            false,
          );
        }
      }
    };

    assertZeroHangul();

    fireEvent.click(screen.getByTestId("cra-mood-action"));
    fireEvent.click(screen.getByTestId("cra-dialogue-sample-1"));
    fireEvent.click(screen.getByTestId("cra-export-json"));
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("cra-tab-crowd"));
    fireEvent.click(screen.getByTestId("cra-scene-ballroom"));
    fireEvent.click(screen.getByTestId("cra-crowd-reshuffle"));
    fireEvent.click(screen.getByTestId("cra-export-svg-copy"));
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("cra-tab-shading"));
    fireEvent.click(screen.getByTestId("cra-lighting-rofan-pastel"));
    fireEvent.click(screen.getByTestId("cra-color-preset-navy-hair"));
    fireEvent.click(screen.getByTestId("cra-copy-stop-rimLight"));
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("cra-tab-script"));
    fireEvent.click(screen.getByTestId("cra-script-sample-rofan"));
    fireEvent.click(screen.getByTestId("cra-export-svg-download"));
    assertZeroHangul();
  });

  it("정적 위생 불변식: 모든 파일 <= 800줄, UI/CSS 원시 hex 0건, transition-all 0건, any 0건, reduced-motion 준수", () => {
    const files = readdirSync(__dirname).filter((name) => /\.(ts|tsx|css)$/u.test(name));
    const hexRegex = /#[0-9a-fA-F]{3,8}\b/u;
    const transitionAllRegex = /transition(?:-all|\s*:\s*all\b)/u;
    const anyRegex = /(?::\s*any\b|\bas\s+any\b|<any>)/u;

    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const file of files) {
      const content = readFileSync(resolve(__dirname, file), "utf8");
      const lines = content.split("\n").length;
      expect(lines, `${file} must be <= 800 lines (got ${lines})`).toBeLessThanOrEqual(800);

      if (!file.endsWith(".test.tsx")) {
        expect(hexRegex.test(content), `${file} must contain 0 raw hex colors`).toBe(false);
        expect(transitionAllRegex.test(content), `${file} must contain 0 transition-all`).toBe(
          false,
        );
        expect(anyRegex.test(content), `${file} must contain 0 any types`).toBe(false);
      }
    }

    const cssContent = readFileSync(resolve(__dirname, "creator-relief-autopilot.css"), "utf8");
    expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
