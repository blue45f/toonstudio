import type { AdjustmentLayer } from "ag-psd";
import { describe, expect, it } from "vitest";

import {
  convertPsdAdjustmentLayer,
  summarizePsdAdjustmentConversions,
} from "../studio-psd-adjustment-import";

import { convertStudioAdjustmentToPsd } from "./studio-psd-adjustment-export";

/**
 * PSD 미지원 10종 확장 판정 검증.
 * 신규 6종(brightness/contrast·exposure·vibrance·invert·posterize·threshold)은
 * 가져오기 변환이 converted로 돌려주고 역변환 라운드트립이 성립해야 하며,
 * 나머지 4종(black & white·photo filter·selective color·color lookup)은
 * 여전히 unsupported로 정확히 보고돼야 한다.
 * 픽스처는 앞선 라운드트립 테스트와 같은 규약(필드를 명시한 형태)으로 둔다.
 */
const NEW_FIXTURES: readonly AdjustmentLayer[] = [
  { type: "brightness/contrast", brightness: 30, contrast: -20, useLegacy: false },
  { type: "exposure", exposure: 1.25, offset: -0.1, gamma: 1.5 },
  { type: "vibrance", vibrance: 40, saturation: -10 },
  { type: "invert" },
  { type: "posterize", levels: 6 },
  { type: "threshold", level: 200 },
];

const STILL_UNSUPPORTED: readonly AdjustmentLayer[] = [
  { type: "black & white", reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 },
  { type: "photo filter", density: 25, preserveLuminosity: true },
  { type: "selective color", mode: "relative", reds: { c: 10, m: 0, y: 0, k: 0 } },
  { type: "color lookup", lookupType: "3dlut", lut3DFileName: "look.cube" },
];

describe("PSD 조정 확장 — 신규 6종 변환·라운드트립", () => {
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

  it("신규 6종의 Studio 종류 이름이 판정표와 일치한다", () => {
    const kinds = NEW_FIXTURES.map((fixture) => {
      const imported = convertPsdAdjustmentLayer(fixture);
      return imported.status === "converted" ? imported.kind : null;
    });
    expect(kinds).toEqual([
      "brightness-contrast",
      "exposure",
      "vibrance",
      "invert",
      "posterize",
      "threshold",
    ]);
  });

  it("필드가 비어 있는 PSD 조정은 실행기 기본값으로 채워 변환된다", () => {
    const brightness = convertPsdAdjustmentLayer({ type: "brightness/contrast" });
    expect(brightness).toMatchObject({
      status: "converted",
      kind: "brightness-contrast",
      parameters: { brightness: 0, contrast: 0 },
    });
    const exposure = convertPsdAdjustmentLayer({ type: "exposure" });
    expect(exposure).toMatchObject({
      status: "converted",
      kind: "exposure",
      parameters: { exposure: 0, offset: 0, gamma: 1 },
    });
    const posterize = convertPsdAdjustmentLayer({ type: "posterize" });
    expect(posterize).toMatchObject({ status: "converted", kind: "posterize", parameters: { levels: 4 } });
    const threshold = convertPsdAdjustmentLayer({ type: "threshold" });
    expect(threshold).toMatchObject({ status: "converted", kind: "threshold", parameters: { level: 128 } });
  });

  it("레거시 밝기/대비는 근사 메모와 함께 변환된다", () => {
    const imported = convertPsdAdjustmentLayer({
      type: "brightness/contrast",
      brightness: 10,
      contrast: 10,
      useLegacy: true,
    });
    expect(imported.status).toBe("converted");
    if (imported.status !== "converted") return;
    expect(imported.parameters.useLegacy).toBe(true);
    expect(imported.notes.join(" ")).toContain("레거시");
  });
});

describe("PSD 조정 확장 — 남은 4종은 여전히 unsupported", () => {
  it.each(STILL_UNSUPPORTED.map((fixture) => [fixture.type, fixture] as const))(
    "%s: unsupported + 원본 type 보존",
    (_type, fixture) => {
      const imported = convertPsdAdjustmentLayer(fixture);
      expect(imported.status).toBe("unsupported");
      if (imported.status !== "unsupported") return;
      expect(imported.psdType).toBe(fixture.type);
      expect(imported.reason.length).toBeGreaterThan(0);
    },
  );

  it("요약 카운트: 신규 6종 converted, 남은 4종 unsupported로 갈린다", () => {
    const summary = summarizePsdAdjustmentConversions(
      [...NEW_FIXTURES, ...STILL_UNSUPPORTED].map((fixture) => convertPsdAdjustmentLayer(fixture)),
    );
    expect(summary.converted).toBe(6);
    expect(summary.unsupported).toBe(4);
    expect(summary.byKind["brightness-contrast"]).toBe(1);
    expect(summary.byKind["psd:color lookup"]).toBe(1);
  });
});
