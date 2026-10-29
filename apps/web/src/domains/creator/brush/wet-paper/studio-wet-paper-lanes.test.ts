import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { exportPageToSvg } from "../../export/studio-svg-export";
import { BRUSH_PRESETS } from "../../studio-brush";
import { applyStudioBrushAliasWatercolorMaterial } from "../studio-brush-alias-profile";
import {
  resolveStudioBrushEngineLaneLabelKo,
  resolveStudioBrushEngineLaneWatercolorMaterial,
  studioBrushEngineLaneRowById,
} from "../studio-brush-engine-lane-catalog";
import { STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION } from "../studio-brush-engine-program-set";
import { studioBrushIconId } from "../studio-brush-icons";
import { resolveStudioBrushRuntimeContract } from "../studio-brush-runtime-contract";
import { resolveStudioBrushLifecycleStage } from "../studio-brush-variant-group-manifest";
import { filterStudioBrushLibraryItems } from "../studio-draw-ux";

import {
  resolveStudioWatercolorSettledSurface,
  resolveStudioWetPaperBakeProgramIdForBrush,
} from "./studio-watercolor-settled-surface";
import { resetStudioWetPaperBakeHostForTests, studioWetPaperBakeHostStatsForTests } from "./studio-wet-paper-host";

import type { StudioWetPaperBakeProgramId } from "./studio-wet-paper-programs";

const LANES: readonly (readonly [string, StudioWetPaperBakeProgramId, string])[] = [
  ["ink-wash--moxi-bake", "moxi-sumi-dispersion", "moxi-wet-paper-bake"],
  ["watercolor--curtis-bake", "curtis-watercolor-backrun", "curtis-wet-paper-bake"],
  ["watercolor--granulating-bake", "curtis-granulating-wash", "granulating-wet-paper-bake"],
  ["ink-wash--dry-brush", "chu-tai-dry-brush", "dry-brush-wet-paper-bake"],
];

function exportLaneSvg(brushId: string): string {
  return exportPageToSvg({
    width: 160,
    height: 96,
    bg: "#ffffff",
    transparentBg: true,
    elements: [{
      id: "wet-paper-lane-stroke",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: brushId,
      brushCatalogId: brushId,
      points: [12, 52, 40, 30, 70, 62, 104, 34, 140, 50],
      pressures: [0.35, 0.6, 0.85, 0.6, 0.4],
      stroke: "#1f6feb",
      strokeWidth: 16,
      opacity: 0.8,
      sampleSpacing: 1,
      watercolorPipeline: "causal-walker-v2",
    }],
  }).svg;
}

/** 내장 PNG를 풀어 RGBA 알파가 실제로 칠해졌는지 본다(서명·IHDR·IDAT 무결성 포함). */
function decodeEmbeddedPng(svg: string): { width: number; height: number; inked: number } {
  const match = /href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/u.exec(svg);
  if (!match?.[1]) throw new Error("no embedded png");
  const bytes = Buffer.from(match[1], "base64");
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const scanlines = inflateSync(Buffer.concat(chunks));
  expect(scanlines.length).toBe((width * 4 + 1) * height);
  let inked = 0;
  for (let row = 0; row < height; row += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((scanlines[row * (width * 4 + 1) + 1 + x * 4 + 3] ?? 0) > 8) inked += 1;
    }
  }
  return { width, height, inked };
}

describe("wet-paper diffusion lanes (MoXi · Curtis · granulation · dry brush)", () => {
  afterEach(() => resetStudioWetPaperBakeHostForTests());

  it("registers each lane as a listed watercolour-tab preset with its own engine variant", () => {
    const watercolorTab = new Set(filterStudioBrushLibraryItems({ category: "watercolor" }).map((item) => item.id));
    for (const [laneId, programId, engineVariant] of LANES) {
      const row = studioBrushEngineLaneRowById(laneId);
      expect(row?.lane, laneId).toBe("wet-paper");
      expect(resolveStudioBrushEngineLaneLabelKo(laneId)).toBe("젖은 종이 확산");
      expect(resolveStudioBrushEngineLaneWatercolorMaterial(laneId)?.wetPaperBakeProgramId).toBe(programId);
      expect(resolveStudioWetPaperBakeProgramIdForBrush(laneId)).toBe(programId);
      const contract = resolveStudioBrushRuntimeContract(laneId);
      expect(contract?.engine, laneId).toBe("watercolor-dabs");
      expect(contract?.engineVariant, laneId).toBe(engineVariant);
      expect(BRUSH_PRESETS.some((preset) => preset.id === laneId), laneId).toBe(true);
      expect(watercolorTab.has(laneId), `${laneId}: missing from the 수채·수묵 tab`).toBe(true);
      expect(resolveStudioBrushLifecycleStage(laneId)).toBe("experimental");
      expect(studioBrushIconId(laneId)).not.toBe("default");
    }
  });

  it("keeps one wet-texture authority: other lanes and program overrides never reach the bake", () => {
    for (const other of ["ink-wash--living-bake", "watercolor--edge-bloom", "watercolor", "pen", "oil--filbert-ribbon"]) {
      expect(resolveStudioWetPaperBakeProgramIdForBrush(other), other).toBeNull();
    }
    expect(resolveStudioWetPaperBakeProgramIdForBrush(42)).toBeNull();
    const bloomOverride = {
      version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION,
      watercolor: { wetEdgeBloomProgramId: "edge-bloom" },
    };
    const livingOverride = {
      version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION,
      watercolor: { livingInkBakeProgramId: "sumi-flow-bake" },
    };
    for (const [laneId] of LANES) {
      expect(resolveStudioWetPaperBakeProgramIdForBrush(laneId, bloomOverride), laneId).toBeNull();
      expect(resolveStudioWetPaperBakeProgramIdForBrush(laneId, livingOverride), laneId).toBeNull();
    }
  });

  it("requests the settled bake only for committed document renders and keeps the base wash bytes", () => {
    const planned = Array.from({ length: 12 }, (_, index) => ({
      x: 20 + index * 4,
      y: 40,
      radius: 7,
      opacity: 0.5,
      role: index % 2 === 0 ? "core" as const : "diffuse" as const,
    }));
    for (const [laneId] of LANES) {
      resetStudioWetPaperBakeHostForTests();
      const base = {
        brush: laneId,
        plannedDabs: planned,
        seed: 3,
        enginePrograms: null,
        color: "#202020",
        onBakeReady: () => {},
        bakeGeneration: 0,
      };
      const live = resolveStudioWatercolorSettledSurface({ ...base, activeDraft: true, durableDocumentRender: false });
      expect(live.wetPaperBake).toBeNull();
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves, laneId).toBe(0);
      const thumbnail = resolveStudioWatercolorSettledSurface({ ...base, activeDraft: false, durableDocumentRender: false });
      expect(thumbnail.wetPaperBake).toBeNull();
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves, laneId).toBe(0);
      const committed = resolveStudioWatercolorSettledSurface({ ...base, activeDraft: false, durableDocumentRender: true });
      expect(committed.wetPaperBake).toBeNull();
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves, laneId).toBe(1);
      // 베이스 워시는 재질 스케일 dab 그대로(웻 텍스처 증강 없음)다.
      expect(committed.dabs).toEqual(applyStudioBrushAliasWatercolorMaterial(laneId, planned, 3, "settled", null));
      expect(live.dabs).toEqual(applyStudioBrushAliasWatercolorMaterial(laneId, planned, 3, "live", null));
    }
  });

  it("exports the settled paper simulation as a deterministic lossless raster", () => {
    const svgs = new Map<string, string>();
    for (const [laneId, programId] of LANES) {
      const svg = exportLaneSvg(laneId);
      expect(svg, laneId).toContain('data-brush-engine="wet-paper-bake-v1"');
      expect(svg, laneId).toContain(`data-wet-paper-program="${programId}"`);
      expect(svg, laneId).toContain('data-pigment-color="#1f6feb"');
      expect(svg, laneId).not.toContain("wet-ribbon-carrier-v2");
      const png = decodeEmbeddedPng(svg);
      expect(png.inked, laneId).toBeGreaterThan(200);
      expect(exportLaneSvg(laneId), `${laneId}: export is not byte-stable`).toBe(svg);
      svgs.set(laneId, svg);
    }
    expect(new Set(svgs.values()).size).toBe(LANES.length);
    // 핀 없는 형제 레인은 기존 웻 리본 캐리어 그대로다.
    const sibling = exportLaneSvg("ink-wash--sumi-core");
    expect(sibling).toContain("wet-ribbon-carrier-v2");
    expect(sibling).not.toContain("wet-paper-bake-v1");
  });

  it("keeps the solver behind a dynamic import boundary from the retained canvas route", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(here, "../../../../../../..");
    const closure = staticImportClosure(root, ["apps/web/src/domains/creator/brush/StudioDrawNode.tsx"]);
    const wetPaper = "apps/web/src/domains/creator/brush/wet-paper/";
    expect(closure.has(`${wetPaper}studio-wet-paper-host.ts`)).toBe(true);
    expect(closure.has(`${wetPaper}studio-watercolor-settled-surface.ts`)).toBe(true);
    for (const heavy of [
      "studio-wet-paper-solver.ts",
      "studio-wet-paper-water.ts",
      "studio-wet-paper-pigment.ts",
      "studio-wet-paper-paper.ts",
      "studio-wet-paper-bristle.ts",
      "studio-wet-paper-composite.ts",
      "studio-wet-paper-runtime.ts",
      "studio-wet-paper-lbm-wgsl.ts",
    ]) {
      expect(closure.has(`${wetPaper}${heavy}`), heavy).toBe(false);
    }
    const host = readFileSync(path.join(root, `${wetPaper}studio-wet-paper-host.ts`), "utf8");
    expect(host).toContain('import("./studio-wet-paper-runtime")');
  });
});

/** 정적 값 import 폐포(동적 import·`import type` 제외) — 저장소 상대 경로. */
function staticImportClosure(root: string, roots: readonly string[]): ReadonlySet<string> {
  const visited = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(path.join(root, file), "utf8");
    for (const pattern of [
      /^[ \t]*import[ \t]+(?!type\b)[^;]*?\bfrom[ \t]*["']([^"']+)["']/gmu,
      /^[ \t]*import[ \t]*["']([^"']+)["']/gmu,
      /^[ \t]*export[ \t]+(?!type\b)[^;]*?\bfrom[ \t]*["']([^"']+)["']/gmu,
    ]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1] ?? "";
        let absolute: string;
        if (specifier.startsWith(".")) absolute = path.resolve(root, path.dirname(file), specifier);
        else if (specifier.startsWith("@/")) absolute = path.resolve(root, "apps/web/src", specifier.slice(2));
        else continue;
        for (const candidate of [`${absolute}.ts`, `${absolute}.tsx`, path.join(absolute, "index.ts"), absolute]) {
          if (/\.tsx?$/u.test(candidate) && existsSync(candidate)) {
            const relative = path.relative(root, candidate);
            if (!visited.has(relative)) queue.push(relative);
            break;
          }
        }
      }
    }
  }
  return visited;
}
