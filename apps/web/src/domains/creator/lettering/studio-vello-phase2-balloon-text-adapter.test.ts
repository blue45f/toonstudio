import { readFileSync } from "node:fs";
import path from "node:path";

import { pathBounds, pathIRSchema, sceneIRSchema } from "@toonstudio/studio-project-model";
import { describe, expect, it, vi } from "vitest";

import {
  buildBalloonGeometryPathIR,
  buildVelloPhase2BalloonScene,
  layoutKoreanBalloonText,
  renderPhase2BalloonFrame,
  type StudioVelloBalloonSpec,
  type StudioVelloTextShaperBridge,
} from "./studio-vello-phase2-balloon-text-adapter";

import type { ShapedText, VerticalShapedText } from "@toonstudio/studio-engine-vello";

function createCanvas2DSpy() {
  const calls: string[] = [];
  const rotateAngles: number[] = [];
  const drawnTexts: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    font: "",
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    setTransform: vi.fn(() => calls.push("setTransform")),
    clearRect: vi.fn(() => calls.push("clearRect")),
    beginPath: vi.fn(() => calls.push("beginPath")),
    moveTo: vi.fn(() => calls.push("moveTo")),
    lineTo: vi.fn(() => calls.push("lineTo")),
    quadraticCurveTo: vi.fn(() => calls.push("quadraticCurveTo")),
    bezierCurveTo: vi.fn(() => calls.push("bezierCurveTo")),
    closePath: vi.fn(() => calls.push("closePath")),
    fill: vi.fn(() => calls.push("fill")),
    stroke: vi.fn(() => calls.push("stroke")),
    translate: vi.fn(() => calls.push("translate")),
    rotate: vi.fn((angle: number) => { calls.push("rotate"); rotateAngles.push(angle); }),
    scale: vi.fn(() => calls.push("scale")),
    fillText: vi.fn((text: string) => { calls.push("fillText"); drawnTexts.push(text); }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, rotateAngles, drawnTexts };
}

describe("studio-vello-phase2-balloon-text-adapter", () => {
  it("keeps zero Konva imports, type-only Vello engine import, and <= 360 lines", () => {
    const src = readFileSync(
      path.resolve(__dirname, "studio-vello-phase2-balloon-text-adapter.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["'](?:konva|react-konva)/u);
    expect(src).not.toMatch(/import\s+(?!type\b)[^;]+from\s+["']@toonstudio\/studio-engine-vello["']/u);
    expect(src.split("\n").length).toBeLessThanOrEqual(360);
  });

  it("generates valid Bezier PathIR geometry for oval, cloud, burst, and box balloons with dynamic tails", () => {
    const oval = buildBalloonGeometryPathIR({
      shape: "oval",
      x: 40,
      y: 30,
      width: 240,
      height: 140,
      tail: { anchor: "bottom", ratio: 0.45, length: 42, baseWidth: 28, tipOffset: -12, bend: 0.35 },
    });
    const parsedOval = pathIRSchema.parse(oval.bodyPath);
    expect(oval.satellitePaths).toHaveLength(0);
    expect(parsedOval.verbs.some((v) => v.v === "C")).toBe(true);
    expect(parsedOval.verbs.some((v) => v.v === "Q")).toBe(true);
    expect(parsedOval.verbs.at(-1)?.v).toBe("Z");
    const ovalBounds = pathBounds(parsedOval)!;
    expect(ovalBounds.maxY).toBeGreaterThanOrEqual(30 + 140 + 40);

    const cloud = buildBalloonGeometryPathIR({
      shape: "cloud",
      x: 100,
      y: 80,
      width: 220,
      height: 150,
      tail: { anchor: "bottom", length: 50, baseWidth: 24 },
    });
    expect(pathIRSchema.parse(cloud.bodyPath).verbs.filter((v) => v.v === "C").length).toBeGreaterThanOrEqual(10);
    expect(cloud.satellitePaths).toHaveLength(3);
    for (const dot of cloud.satellitePaths) pathIRSchema.parse(dot);

    const burst = buildBalloonGeometryPathIR({
      shape: "burst",
      x: 10,
      y: 20,
      width: 260,
      height: 160,
      tail: { anchor: "right", length: 36, baseWidth: 22, kind: "pointed" },
    });
    expect(pathIRSchema.parse(burst.bodyPath).verbs.filter((v) => v.v === "Q").length).toBeGreaterThanOrEqual(12);
    expect(burst.satellitePaths).toHaveLength(1);

    for (const anchor of ["top", "right", "bottom", "left"] as const) {
      const box = buildBalloonGeometryPathIR({
        shape: "box",
        x: 0,
        y: 0,
        width: 220,
        height: 120,
        cornerRadius: 16,
        tail: { anchor, ratio: 0.5, length: 30, baseWidth: 20, bend: -0.2 },
      });
      const parsedBox = pathIRSchema.parse(box.bodyPath);
      expect(parsedBox.verbs.filter((v) => v.v === "Q")).toHaveLength(2);
      expect(parsedBox.verbs.filter((v) => v.v === "C")).toHaveLength(4);
    }
  });

  it("lays out Korean horizontal (HTB) dialogue with Hangul kinsoku line breaking", () => {
    const spec: StudioVelloBalloonSpec = {
      id: "htb-kinsoku",
      shape: "oval",
      x: 20,
      y: 20,
      width: 185,
      height: 140,
      text: "정말 그럴 리가 없잖아?!",
      writingMode: "htb",
      fontSize: 22,
      align: "center",
    };
    const layout = layoutKoreanBalloonText(spec);
    expect(layout.writingMode).toBe("htb");
    expect(layout.shaperBackend).toBe("deterministic-fallback");
    expect(layout.lines.length).toBeGreaterThanOrEqual(2);
    // 행두 금칙: 어떤 줄도 ? 또는 ! 로 시작하면 안 된다
    for (const line of layout.lines) {
      expect(line.startsWith("?")).toBe(false);
      expect(line.startsWith("!")).toBe(false);
    }
    expect(layout.runs).toHaveLength(layout.lines.length);
  });

  it("lays out traditional Korean vertical (TTB 세로쓰기) with right-to-left columns, punctuation rotation, and tate-chu-yoko", () => {
    const spec: StudioVelloBalloonSpec = {
      id: "ttb-dialogue",
      shape: "oval",
      x: 50,
      y: 40,
      width: 240,
      height: 180,
      text: "「그날 2026년」정말…놀라웠다。",
      writingMode: "ttb",
      fontSize: 20,
      align: "center",
    };
    const layout = layoutKoreanBalloonText(spec);
    expect(layout.writingMode).toBe("ttb");
    expect(layout.verticalMetrics).toBeDefined();
    expect(layout.verticalMetrics!.columnCount).toBeGreaterThanOrEqual(2);
    expect(layout.verticalMetrics!.rotatedPunctuationCount).toBeGreaterThanOrEqual(2); // 「 」 …
    expect(layout.verticalMetrics!.tateChuYokoCount).toBe(1); // 2026

    const col0Runs = layout.runs.filter((r) => r.lineOrColumnIndex === 0);
    const col1Runs = layout.runs.filter((r) => r.lineOrColumnIndex === 1);
    expect(col0Runs.length).toBeGreaterThan(0);
    expect(col1Runs.length).toBeGreaterThan(0);
    // 전통 세로쓰기는 우→좌로 열이 진행한다 (0열이 1열보다 오른쪽)
    expect(col0Runs[0]!.x).toBeGreaterThan(col1Runs[0]!.x);
    expect(layout.runs.some((r) => r.form === "upright" && r.rotationDeg === 0)).toBe(true);
    expect(layout.runs.some((r) => r.form === "rotated" && r.rotationDeg === 90)).toBe(true);
    expect(layout.runs.some((r) => r.form === "shifted")).toBe(true); // 。
    expect(layout.runs.some((r) => r.form === "tate-chu-yoko" && r.text === "2026")).toBe(true);
  });

  it("integrates Parley/HarfRust horizontal and vertical glyph-path shapers into Vello SceneIR", () => {
    const mockGlyphPath = {
      verbs: [
        { v: "M" as const, x: 0, y: 0 },
        { v: "L" as const, x: 10, y: 0 },
        { v: "L" as const, x: 10, y: 12 },
        { v: "Z" as const },
      ],
    };
    const shaper: StudioVelloTextShaperBridge = {
      shapeHorizontal: vi.fn((): ShapedText => ({
        width: 120,
        height: 28,
        lineCount: 1,
        glyphs: [
          { id: 1, x: 0, y: 0, path: mockGlyphPath },
          { id: 2, x: 18, y: 0, path: mockGlyphPath },
        ],
      })),
      shapeVertical: vi.fn((): VerticalShapedText => ({
        width: 32,
        height: 96,
        columnCount: 1,
        columnAdvance: 32,
        verticalMetricsSource: "vmtx",
        verticalFeatures: {
          requested: ["vert", "vrt2"],
          fontHasVert: true,
          fontHasVrt2: true,
          application: "applied",
          appliedGlyphs: 2,
          geometricFallbackGlyphs: 0,
          strategy: "opentype-vert-vrt2",
        },
        glyphs: [
          { id: 10, x: 0, y: 0, column: 0, rotated: false, tateChuYoko: false, verticalAlternate: true, verticalFallback: null, path: mockGlyphPath },
        ],
        columns: [{ index: 0, x: 0, height: 96 }],
        warnings: [],
      })),
    };

    const balloons: StudioVelloBalloonSpec[] = [
      { id: "b-htb", shape: "box", x: 10, y: 10, width: 200, height: 90, text: "안녕", writingMode: "htb" },
      { id: "b-ttb", shape: "oval", x: 240, y: 10, width: 120, height: 180, text: "세로", writingMode: "ttb" },
    ];
    const output = buildVelloPhase2BalloonScene(balloons, { width: 400, height: 220 }, { shaper });
    const parsed = sceneIRSchema.parse(output.scene);

    expect(parsed.nodes).toHaveLength(2);
    expect(output.stats.balloonCount).toBe(2);
    expect(output.stats.verticalBalloonCount).toBe(1);
    expect(output.stats.glyphPathCount).toBe(3);
    expect(output.stats.textRunCount).toBe(0);
    expect(output.layouts.get("b-htb")?.shaperBackend).toBe("parley-harfrust");
    expect(output.layouts.get("b-ttb")?.verticalMetrics?.verticalMetricsSource).toBe("vmtx");
  });

  it("renders valid SceneIR via Vello submit or Canvas 2D fallback including 90-degree vertical runs", () => {
    const balloons: StudioVelloBalloonSpec[] = [
      {
        id: "b-1",
        shape: "oval",
        x: 30,
        y: 20,
        width: 200,
        height: 150,
        text: "「대사」2026",
        writingMode: "ttb",
        fontSize: 20,
        tail: { anchor: "bottom", length: 32, baseWidth: 24 },
      },
    ];

    const velloSubmit = vi.fn();
    const velloRes = renderPhase2BalloonFrame(balloons, { width: 320, height: 240 }, { velloSubmit });
    expect(velloRes.backend).toBe("vello");
    expect(velloSubmit).toHaveBeenCalledOnce();
    sceneIRSchema.parse(velloRes.output.scene);

    const { ctx, calls, rotateAngles, drawnTexts } = createCanvas2DSpy();
    const fallbackRes = renderPhase2BalloonFrame(balloons, { width: 320, height: 240 }, { canvas2d: ctx, dpr: 2 });
    expect(fallbackRes.backend).toBe("canvas2d-fallback");
    expect(calls).toContain("bezierCurveTo");
    expect(calls).toContain("quadraticCurveTo");
    expect(calls).toContain("fill");
    expect(calls).toContain("stroke");
    expect(calls).toContain("fillText");
    expect(rotateAngles.some((a) => Math.abs(a - Math.PI / 2) < 1e-6)).toBe(true);
    expect(drawnTexts.join("")).toContain("2026");
  });
});
