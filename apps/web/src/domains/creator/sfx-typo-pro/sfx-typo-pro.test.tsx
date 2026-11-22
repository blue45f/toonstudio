// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SFX_PRESET_PHRASES,
  SFX_STYLE_PRESETS,
  buildSfxVectorStamp,
  createSfxStampSpec,
  escapeSfxXml,
  findLocalizedPresetSuggestion,
  loadSavedSfxStamps,
  saveSavedSfxStamps,
  swapSfxLocalizedText,
  type SfxDistortionMode,
  type SfxStyleId,
} from "./sfx-typo-engine";
import { StudioSfxTypoStampPanel } from "./StudioSfxTypoStampPanel";
import { StudioLocalizationPanel } from "../studio-shell/StudioLocalizationPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("자동 효과음(SFX) 타이포그래피 & 원근 왜곡 벡터 스탬프 엔진", () => {
  it("붓글씨·메탈·충격파·공포 4종 스타일과 2중 외곽 테두리 SVG를 결정론적으로 생성한다", () => {
    const expectedIds: readonly SfxStyleId[] = ["brush", "metal", "shockwave", "horror"];
    expect(SFX_STYLE_PRESETS.map((s) => s.id)).toEqual(expectedIds);

    for (const styleId of expectedIds) {
      const spec = createSfxStampSpec({ text: "쾅!", styleId, seed: 42 });
      const first = buildSfxVectorStamp(spec);
      const second = buildSfxVectorStamp(spec);

      expect(first.svgMarkup).toBe(second.svgMarkup);
      expect(first.svgMarkup).toContain('data-sfx-layer="outer-stroke"');
      expect(first.svgMarkup).toContain('data-sfx-layer="inner-stroke"');
      expect(first.svgMarkup).toContain('data-sfx-layer="fill"');
      expect(first.svgMarkup).toContain(`data-sfx-style="${styleId}"`);
      expect(first.glyphs).toHaveLength(2);
      expect(first.decorations.length).toBeGreaterThan(0);
    }
  });

  it("아치 및 원근 테이퍼 왜곡이 글자 좌표·회전·세로 스케일에 수학적으로 반영된다", () => {
    const archUp = buildSfxVectorStamp(
      createSfxStampSpec({
        text: "우르릉!",
        distortion: { mode: "arch-up", archStrength: 0.6 },
        seed: 7,
      }),
    );
    // 중앙 글자가 양끝 글자보다 위로 솟아 있어야 한다(y 값이 더 작음)
    expect(archUp.glyphs[1]!.y).toBeLessThan(archUp.glyphs[0]!.y);
    expect(archUp.glyphs[0]!.rotateDeg).toBeLessThan(0);
    expect(archUp.glyphs[3]!.rotateDeg).toBeGreaterThan(0);

    const perspLeft = buildSfxVectorStamp(
      createSfxStampSpec({
        text: "파아앗!",
        distortion: { mode: "perspective-left", taperRatio: 1.6, perspectiveDepth: 0.6 },
        seed: 7,
      }),
    );
    // 좌→우 원근 테이퍼는 좌측 글자가 우측 글자보다 크게 스케일되어야 한다
    expect(perspLeft.glyphs[0]!.scaleY).toBeGreaterThan(perspLeft.glyphs[3]!.scaleY);

    const perspRight = buildSfxVectorStamp(
      createSfxStampSpec({
        text: "파아앗!",
        distortion: { mode: "perspective-right", taperRatio: 1.6, perspectiveDepth: 0.6 },
        seed: 7,
      }),
    );
    expect(perspRight.glyphs[3]!.scaleY).toBeGreaterThan(perspRight.glyphs[0]!.scaleY);

    const modes: readonly SfxDistortionMode[] = [
      "none",
      "arch-up",
      "arch-down",
      "perspective-left",
      "perspective-right",
      "perspective-burst",
    ];
    for (const mode of modes) {
      const model = buildSfxVectorStamp(
        createSfxStampSpec({ text: "두근", distortion: { mode }, seed: 9 }),
      );
      expect(model.viewBoxWidth).toBeGreaterThanOrEqual(260);
      expect(model.viewBoxHeight).toBeGreaterThanOrEqual(180);
    }
  });

  it("swapSfxLocalizedText는 번역 교체 시 스타일·2중 외곽선·왜곡·컷 배치를 100% 보존하고 폭을 자동 보정한다", () => {
    const original = createSfxStampSpec({
      id: "cut-07-boom",
      text: "쾅!",
      styleId: "metal",
      distortion: { mode: "perspective-left", archStrength: 0.45, taperRatio: 1.55, skewDeg: -16 },
      doubleStroke: { innerColor: "#111111", innerWidth: 7, outerColor: "#eeeeee", outerWidth: 15 },
      placement: {
        cutId: "cut-07",
        x: 245,
        y: 380,
        width: 410,
        height: 195,
        rotationDeg: -11,
        anchor: "top-right",
        zIndex: 77,
      },
      seed: 12345,
    });

    const swappedEn = swapSfxLocalizedText(original, "KABOOM!!", "en");
    expect(swappedEn.text).toBe("KABOOM!!");
    expect(swappedEn.originalText).toBe("쾅!");
    expect(swappedEn.locale).toBe("en");
    expect(swappedEn.id).toBe(original.id);
    expect(swappedEn.styleId).toBe(original.styleId);
    expect(swappedEn.distortion).toEqual(original.distortion);
    expect(swappedEn.doubleStroke).toEqual(original.doubleStroke);
    expect(swappedEn.placement).toEqual(original.placement);
    expect(swappedEn.seed).toBe(original.seed);
    // 긴 영문 번역은 원본 배치 폭을 넘지 않도록 폰트 보정 배율이 축소되어야 한다
    expect(swappedEn.localizedFitScale).toBeLessThan(1);

    const swappedJa = swapSfxLocalizedText(swappedEn, "ドォン!", "ja");
    expect(swappedJa.originalText).toBe("쾅!");
    expect(swappedJa.placement).toEqual(original.placement);
    expect(swappedJa.styleId).toBe("metal");
  });

  it("XML 특수문자 및 스크립트 주입 문자열을 안전하게 이스케이프한다", () => {
    const payload = '<script>alert("x")</script>';
    expect(escapeSfxXml(payload)).not.toContain("<script>");
    const model = buildSfxVectorStamp(createSfxStampSpec({ text: payload }));
    expect(model.svgMarkup).not.toContain("<script>");
    expect(model.svgMarkup).toContain("&lt;");
  });

  it("주요 웹툰 효과음 프리셋 및 로컬 스탬프 저장/복원을 지원한다", () => {
    const phrases = SFX_PRESET_PHRASES.map((p) => p.textKo);
    expect(phrases).toEqual(expect.arrayContaining(["쾅!", "스윽", "두근", "파앗!"]));
    expect(findLocalizedPresetSuggestion("쾅!", "en")).toBe("BOOM!");
    expect(findLocalizedPresetSuggestion("두근", "ja")).toBe("ドキッ");

    const stamp = createSfxStampSpec({ text: "파앗!", styleId: "brush" });
    expect(saveSavedSfxStamps("proj-sfx-1", [stamp])).toBe(true);
    const loaded = loadSavedSfxStamps("proj-sfx-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.text).toBe("파앗!");
  });
});

describe("StudioSfxTypoStampPanel & StudioLocalizationPanel 통합", () => {
  it("스타일 전환, 번역 교체(스타일·배치 보존), 로컬 보관함 저장이 동작한다", () => {
    render(<StudioSfxTypoStampPanel projectId="proj-ui-sfx" />);

    expect(screen.getByTestId("sfx-typo-preview-svg")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "메탈" }));
    fireEvent.click(screen.getByRole("button", { name: "좌→우 원근" }));

    const swapField = screen.getByLabelText("교체할 번역 효과음");
    fireEvent.change(swapField, { target: { value: "BOOM!!" } });
    fireEvent.click(screen.getByRole("button", { name: "번역 교체 적용" }));

    expect(screen.getByRole("status").textContent).toContain("BOOM!!");
    expect(screen.getByTestId("sfx-typo-preview-svg").getAttribute("aria-label")).toContain("BOOM!!");

    fireEvent.click(screen.getByRole("button", { name: "컷 스탬프 저장" }));
    expect(screen.getByText(/저장한 효과음 스탬프 \(1\)/)).toBeTruthy();
  });

  it("StudioLocalizationPanel의 접이식 진입점을 열면 SFX 타이포 스탬프 패널이 마운트된다", () => {
    render(<StudioLocalizationPanel projectId="proj-loc-sfx" />);
    const disclosure = screen.getByTestId("sfx-typo-pro-disclosure") as HTMLDetailsElement;
    expect(screen.queryByTestId("studio-sfx-typo-stamp-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    expect(screen.getByTestId("studio-sfx-typo-stamp-panel")).toBeTruthy();
  });
});
