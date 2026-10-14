import type { AdjustmentLayer } from "ag-psd";
import { describe, expect, it } from "vitest";

import {
  convertPsdAdjustmentLayer,
  summarizePsdAdjustmentConversions,
} from "../studio-psd-adjustment-import";

import { convertStudioAdjustmentToPsd } from "./studio-psd-adjustment-export";

/**
 * PSD 조정 확장 검증.
 * 2026-10-14 확장 6종(brightness/contrast·exposure·vibrance·invert·posterize·threshold)과
 * 2026-10-15 전수 대응 4종(black & white·photo filter·selective color·color lookup)은
 * 가져오기 변환이 converted로 돌려주고 역변환 라운드트립이 성립해야 한다.
 * 이로써 ag-psd 조정 16종 전부 변환 대상이며, unsupported는 알 수 없는 종류뿐이다.
 */
const PREVIOUS_FIXTURES: readonly AdjustmentLayer[] = [
  { type: "brightness/contrast", brightness: 30, contrast: -20, useLegacy: false },
  { type: "exposure", exposure: 1.25, offset: -0.1, gamma: 1.5 },
  { type: "vibrance", vibrance: 40, saturation: -10 },
  { type: "invert" },
  { type: "posterize", levels: 6 },
  { type: "threshold", level: 200 },
];

const CUBE_TEXT = "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n";

const NEW_FIXTURES: readonly AdjustmentLayer[] = [
  {
    type: "black & white",
    reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80,
    useTint: true, tintColor: { r: 172, g: 122, b: 51 },
  },
  { type: "photo filter", color: { r: 236, g: 138, b: 0 }, density: 25, preserveLuminosity: true },
  { type: "selective color", mode: "relative", reds: { c: 10, m: 0, y: 0, k: 0 } },
  {
    type: "color lookup",
    lookupType: "3dlut",
    lut3DFileName: "look.cube",
    lutFormat: "cube",
    lut3DFileData: new TextEncoder().encode(CUBE_TEXT),
  },
];

describe("PSD 조정 확장 — 기존 6종 변환·라운드트립 (회귀)", () => {
  it.each(PREVIOUS_FIXTURES.map((fixture) => [fixture.type, fixture] as const))(
    "%s: 가져오기 변환 후 역변환하면 원래 파라미터가 복원된다",
    (_type, fixture) => {
      const imported = convertPsdAdjustmentLayer(fixture);
      expect(imported.status).toBe("converted");
      if (imported.status !== "converted") return;
      const exported = convertStudioAdjustmentToPsd(imported.kind, imported.parameters);
      expect(exported.status).toBe("converted");
      if (exported.status !== "converted") return;
      expect(exported.adjustment).toEqual(fixture);
    },
  );
});

describe("PSD 조정 전수 대응 — 신규 4종 변환·라운드트립", () => {
  it.each(NEW_FIXTURES.map((fixture) => [fixture.type, fixture] as const))(
    "%s: 가져오기 변환 후 역변환하면 원래 파라미터가 복원된다",
    (_type, fixture) => {
      const imported = convertPsdAdjustmentLayer(fixture);
      expect(imported.status).toBe("converted");
      if (imported.status !== "converted") return;
      const exported = convertStudioAdjustmentToPsd(imported.kind, imported.parameters);
      expect(exported.status).toBe("converted");
      if (exported.status !== "converted") return;
      expect(exported.adjustment).toEqual(fixture);
    },
  );

  it("신규 4종의 Studio 종류 이름이 판정표와 일치한다", () => {
    const kinds = NEW_FIXTURES.map((fixture) => {
      const imported = convertPsdAdjustmentLayer(fixture);
      return imported.status === "converted" ? imported.kind : null;
    });
    expect(kinds).toEqual(["black-white", "photo-filter", "selective-color", "color-lookup"]);
  });

  it("흑백은 빈 필드를 Photoshop 기본 가중으로 채운다", () => {
    const imported = convertPsdAdjustmentLayer({ type: "black & white" });
    expect(imported).toMatchObject({
      status: "converted",
      kind: "black-white",
      parameters: { reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 },
    });
  });

  it("선택 색상은 9범위 중 있는 범위만 [c,m,y,k] 배열로 보존한다", () => {
    const imported = convertPsdAdjustmentLayer({
      type: "selective color",
      mode: "absolute",
      neutrals: { c: -5, m: 5, y: 0, k: 10 },
    });
    expect(imported.status).toBe("converted");
    if (imported.status !== "converted") return;
    expect(imported.parameters.mode).toBe("absolute");
    expect(imported.parameters["range.neutrals"]).toEqual([-5, 5, 0, 10]);
    expect(imported.parameters["range.reds"]).toBeUndefined();
    expect(imported.notes.join(" ")).toContain("근사");
  });

  it("LUT 데이터가 없는 컬러 룩업은 보존하되 미적용을 notes로 고지한다", () => {
    const imported = convertPsdAdjustmentLayer({ type: "color lookup", lookupType: "3dlut", lut3DFileName: "x.cube" });
    expect(imported.status).toBe("converted");
    if (imported.status !== "converted") return;
    expect(imported.parameters.lutBytes).toBeUndefined();
    expect(imported.notes.join(" ")).toContain("픽셀에는 적용되지 않습니다");
  });

  it("포토 필터 색상이 없으면 기본 워밍 색 + 메모로 채운다", () => {
    const imported = convertPsdAdjustmentLayer({ type: "photo filter", density: 40 });
    expect(imported.status).toBe("converted");
    if (imported.status !== "converted") return;
    expect(imported.parameters.color).toBe("#ec8a00");
    expect(imported.parameters.density).toBe(40);
    expect(imported.notes.length).toBeGreaterThan(0);
  });

  it("요약 카운트: 16종 전수 중 이 표본 10종은 전부 converted", () => {
    const summary = summarizePsdAdjustmentConversions(
      [...PREVIOUS_FIXTURES, ...NEW_FIXTURES].map((fixture) => convertPsdAdjustmentLayer(fixture)),
    );
    expect(summary.converted).toBe(10);
    expect(summary.unsupported).toBe(0);
    expect(summary.byKind["black-white"]).toBe(1);
    expect(summary.byKind["color-lookup"]).toBe(1);
  });

  it("알 수 없는 종류만 unsupported + 원본 type 보존", () => {
    const imported = convertPsdAdjustmentLayer({ type: "mystery" } as never);
    expect(imported.status).toBe("unsupported");
    if (imported.status !== "unsupported") return;
    expect(imported.psdType).toBe("mystery");
    expect(imported.reason.length).toBeGreaterThan(0);
  });
});
