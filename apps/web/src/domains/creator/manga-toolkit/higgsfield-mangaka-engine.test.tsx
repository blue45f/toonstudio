// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioBlankComicProDrawingSubPanel } from "./StudioBlankComicProDrawingSubPanel";
import { StudioHiggsfieldMangakaPanel } from "./StudioHiggsfieldMangakaPanel";
import {
  buildMangakaBg3dSceneBridgePlan,
  classifyMangakaGapPx,
  classifyMangakaPanelWidth,
  computeMangakaDeterministicGapPx,
  computeMangakaSafeSliceIntervals,
  countMangakaWordsCjkAware,
  createMangakaCharacterCastLock,
  evaluateMangakaStripRules,
  MANGAKA_GAP_CLASS_BOUNDS,
  MANGAKA_IDEA_PEOPLE_MAX,
  MANGAKA_PANEL_ASPECT_RESOLUTIONS,
  MANGAKA_PORTAL_SPECS,
  MANGAKA_STYLE_CONFIGS,
  matchMangakaCameraYawToAnchorAngle,
  stageMangakaEpisodeStrip,
  type MangakaPanelInputSpec,
} from "./higgsfield-mangaka-engine";

describe("Higgsfield Mangaka Engine (REA Reverse-Engineered)", () => {
  it("exposes 4 visual styles and 8 publishing portal specifications", () => {
    expect(Object.keys(MANGAKA_STYLE_CONFIGS)).toEqual([
      "manga-bw",
      "manga-color",
      "comics",
      "webtoon",
    ]);
    expect(MANGAKA_STYLE_CONFIGS["manga-bw"].reading.defaultDirection).toBe("rtl");
    expect(MANGAKA_STYLE_CONFIGS.webtoon.reading.defaultDirection).toBe("ttb");

    expect(MANGAKA_PORTAL_SPECS.webtoon.widthPx).toBe(800);
    expect(MANGAKA_PORTAL_SPECS.tapas.widthPx).toBe(940);
    expect(MANGAKA_PORTAL_SPECS.naver.widthPx).toBe(690);
    expect(MANGAKA_PORTAL_SPECS.daum.widthPx).toBe(760);
    expect(MANGAKA_PORTAL_SPECS.kr700.widthPx).toBe(700);
    expect(MANGAKA_PORTAL_SPECS.kr720.widthPx).toBe(720);
    expect(Object.keys(MANGAKA_PANEL_ASPECT_RESOLUTIONS)).toHaveLength(11);
  });

  it("computes deterministic FNV-1a gap pixels within class bounds and classifies gap/width classes", () => {
    for (const [cls, [minPx, maxPx]] of Object.entries(MANGAKA_GAP_CLASS_BOUNDS)) {
      const px = computeMangakaDeterministicGapPx(
        cls as keyof typeof MANGAKA_GAP_CLASS_BOUNDS,
        "ep1:p3",
      );
      expect(px).toBeGreaterThanOrEqual(minPx);
      expect(px).toBeLessThanOrEqual(maxPx);
    }
    expect(classifyMangakaGapPx(150)).toBe("action");
    expect(classifyMangakaGapPx(300)).toBe("beat");
    expect(classifyMangakaGapPx(480)).toBe("pause");
    expect(classifyMangakaGapPx(800)).toBe("scene");
    expect(classifyMangakaGapPx(1200)).toBe("timeSkip");

    expect(classifyMangakaPanelWidth(800, 800)).toBe("full");
    expect(classifyMangakaPanelWidth(640, 800)).toBe("inset");
    expect(classifyMangakaPanelWidth(400, 800)).toBe("insert");
    expect(classifyMangakaPanelWidth(200, 800)).toBe("tiny");
  });

  it("counts Latin words and CJK characters using Higgsfield Mangaka mt() formula", () => {
    expect(countMangakaWordsCjkAware("Hello world")).toBe(2);
    expect(countMangakaWordsCjkAware("등교길 황금빛 아침")).toBe(4);
    expect(countMangakaWordsCjkAware("Mira: 안녕하세요!")).toBe(1 + Math.ceil(5 / 2));
  });

  it("enforces IDEA_PEOPLE_MAX = 6 character cast lock and validates photo mime/size", () => {
    const candidates = Array.from({ length: 8 }, (_, idx) => ({
      id: `char-${idx + 1}`,
      name: `Hero ${idx + 1}`,
      appearancePrompt: "Silver hair",
      sourcePhotoMime: idx === 0 ? "application/pdf" : "image/webp",
      sourcePhotoBytes: 1_000_000,
    }));

    const result = createMangakaCharacterCastLock(candidates);
    expect(result.rejectedPhotoReasons).toHaveLength(1);
    expect(result.acceptedCast).toHaveLength(MANGAKA_IDEA_PEOPLE_MAX);
    expect(result.ignoredOverflowCount).toBe(1);
    expect(result.acceptedCast[0]?.screenSidePreference).toBe("left");
    expect(result.acceptedCast[1]?.screenSidePreference).toBe("right");
  });

  it("stages an episode strip, avoids faces/overlaps, computes safe slices, and passes WT-* QA checks", () => {
    const panels: readonly MangakaPanelInputSpec[] = [
      {
        pageId: "p1",
        sceneId: "scene-1",
        role: "hook",
        aspect: "9:16",
        widthClass: "full",
        gapBefore: "action",
        background: "detailed",
        faceBoxes: [{ x: 30, y: 30, w: 220, h: 200 }],
        lines: [
          { id: "l1", kind: "speech", speaker: "Mira", text: "Six bells already?!" },
          { id: "l2", kind: "sfx", text: "CLANG!" },
        ],
      },
      {
        pageId: "p2",
        sceneId: "scene-1",
        role: "establishing",
        aspect: "4:5",
        widthClass: "inset",
        gapBefore: "beat",
        background: "detailed",
        lines: [
          { id: "l3", kind: "caption", text: "EXT. CANAL BRIDGE" },
          { id: "l4", kind: "speech", speaker: "Bram", text: "You are late again." },
        ],
      },
      {
        pageId: "p3",
        sceneId: "scene-2",
        role: "cliffhanger",
        aspect: "9:16",
        widthClass: "full",
        gapBefore: "scene",
        background: "detailed",
        keyBeat: true,
        lines: [
          { id: "l5", kind: "thought", speaker: "Mira", text: "Found you, little light." },
        ],
      },
    ];

    const strip = stageMangakaEpisodeStrip({
      episodeId: "ep-test",
      panels,
      style: "webtoon",
      portal: "naver",
      titleCard: true,
      endCard: true,
    });

    expect(strip.width).toBe(800);
    expect(strip.metrics.panels).toBe(3);
    expect(strip.safeSliceIntervals.length).toBeGreaterThan(0);

    const slices = computeMangakaSafeSliceIntervals(strip);
    expect(slices).toEqual(strip.safeSliceIntervals);

    const qa = evaluateMangakaStripRules(strip, ["l1", "l2", "l3", "l4", "l5"]);
    expect(qa.mustViolations).toHaveLength(0);
    expect(qa.passedChecks).toBe(qa.totalChecks);
  });

  it("bridges SketchUp 3D background camera yaw and scene presets with Mangaka panels", () => {
    expect(matchMangakaCameraYawToAnchorAngle(0)).toBe("front");
    expect(matchMangakaCameraYawToAnchorAngle(45)).toBe("left-34");
    expect(matchMangakaCameraYawToAnchorAngle(90)).toBe("left");
    expect(matchMangakaCameraYawToAnchorAngle(180)).toBe("back");
    expect(matchMangakaCameraYawToAnchorAngle(270)).toBe("right");
    expect(matchMangakaCameraYawToAnchorAngle(310)).toBe("right-34");

    const bridge = buildMangakaBg3dSceneBridgePlan({
      sceneId: "scene-classroom",
      panels: [
        {
          pageId: "p-est",
          sceneId: "scene-classroom",
          role: "establishing",
          aspect: "16:9",
        },
      ],
      visualStyle: "manga-bw",
      cameraYawByPanelId: { "p-est": 45 },
    });

    expect(bridge.establishingPanelId).toBe("p-est");
    expect(bridge.sketchUpStylePresetId).toBe("hidden-line");
    expect(bridge.twoPointPerspectiveLocked).toBe(true);
    expect(bridge.characterAnchorAnglesByPanel["p-est"]).toBe("left-34");
  });

  it("renders StudioHiggsfieldMangakaPanel and integrates into StudioBlankComicProDrawingSubPanel", () => {
    render(<StudioHiggsfieldMangakaPanel />);
    expect(screen.getByTestId("higgsfield-mangaka-section")).toBeTruthy();
    expect(screen.getByTestId("mangaka-qa-score-badge").textContent).toContain("WT-* QA");

    fireEvent.change(screen.getByTestId("mangaka-style-select"), {
      target: { value: "manga-bw" },
    });
    expect(
      (screen.getByTestId("mangaka-style-select") as HTMLSelectElement).value,
    ).toBe("manga-bw");

    render(<StudioBlankComicProDrawingSubPanel />);
    const mangakaTabBtn = screen.getByTestId("pro-drawing-tab-higgsfield-mangaka");
    fireEvent.click(mangakaTabBtn);
    expect(screen.getAllByTestId("higgsfield-mangaka-section").length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
