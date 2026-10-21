import { describe, expect, it } from "vitest";

import { convertPsdAdjustmentLayer } from "./studio-psd-adjustment-import";
import {
  buildPsdAdjustmentImportReport,
  classifyPsdAdjustmentFidelity,
  formatPsdAdjustmentReportLines,
  psdAdjustmentSupportForKind,
  psdAdjustmentSupportForPsdType,
  psdAdjustmentSupportSummaryLine,
  PSD_ADJUSTMENT_SUPPORT_TABLE,
} from "./studio-psd-adjustment-report";

import type { AdjustmentLayer } from "ag-psd";

function convert(type: string, extra: Record<string, unknown> = {}) {
  const result = convertPsdAdjustmentLayer({ type, ...extra } as unknown as AdjustmentLayer);
  if (result.status !== "converted") throw new Error(`${type} 변환 실패`);
  return result;
}

const CUBE_TEXT = "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n";

describe("PSD 조정 레이어 대응표", () => {
  it("16종 전부를 유일한 psdType·종류로 고정한다(정확 10·근사 5·보존 전용 1)", () => {
    expect(PSD_ADJUSTMENT_SUPPORT_TABLE).toHaveLength(16);
    expect(new Set(PSD_ADJUSTMENT_SUPPORT_TABLE.map((entry) => entry.psdType)).size).toBe(16);
    expect(new Set(PSD_ADJUSTMENT_SUPPORT_TABLE.map((entry) => entry.kind)).size).toBe(16);
    const byFidelity = (fidelity: string) =>
      PSD_ADJUSTMENT_SUPPORT_TABLE.filter((entry) => entry.fidelity === fidelity);
    expect(byFidelity("exact").map((entry) => entry.kind)).toEqual(expect.arrayContaining([
      "levels", "curves", "color-balance", "channel-mixer", "exposure",
      "vibrance", "invert", "posterize", "threshold", "photo-filter",
    ]));
    expect(byFidelity("approximated")).toHaveLength(5);
    expect(byFidelity("preserved-only").map((entry) => entry.kind)).toEqual(["color-lookup"]);
  });

  it("대응표의 모든 psdType이 실제 변환기에서 같은 종류로 변환된다(드리프트 방지)", () => {
    for (const entry of PSD_ADJUSTMENT_SUPPORT_TABLE) {
      const converted = convert(entry.psdType);
      expect(converted.kind, entry.psdType).toBe(entry.kind);
      expect(psdAdjustmentSupportForKind(entry.kind)?.psdType).toBe(entry.psdType);
      expect(psdAdjustmentSupportForPsdType(entry.psdType)?.kind).toBe(entry.kind);
    }
  });

  it("요약 줄은 16종과 충실도별 종수를 정직하게 나눠 쓴다", () => {
    const line = psdAdjustmentSupportSummaryLine();
    expect(line).toContain("전체 16종");
    expect(line).toContain("정확 변환 10종");
    expect(line).toContain("근사 변환 5종");
    expect(line).toContain("파라미터만 보존 1종(컬러 룩업)");
  });
});

describe("충실도 판정", () => {
  it("메모 없는 정확 종류는 exact, 근사 종류는 approximated", () => {
    expect(classifyPsdAdjustmentFidelity(convert("levels"))).toBe("exact");
    expect(classifyPsdAdjustmentFidelity(convert("invert"))).toBe("exact");
    expect(classifyPsdAdjustmentFidelity(convert("selective color", {
      reds: { c: 1, m: 0, y: 0, k: 0 },
    }))).toBe("approximated");
    expect(classifyPsdAdjustmentFidelity(convert("black & white"))).toBe("approximated");
  });

  it("색상 범위가 있는 색조/채도는 마스터만 적용이라 approximated", () => {
    const converted = convert("hue/saturation", {
      master: { hue: 0, saturation: 10, lightness: 0 },
      reds: { a: 0, b: 0, c: 0, d: 0, hue: 5, saturation: 0, lightness: 0 },
    });
    expect(classifyPsdAdjustmentFidelity(converted)).toBe("approximated");
  });

  it("컬러 룩업은 데이터가 없으면 preserved-only, 내장 .cube가 있으면 exact", () => {
    expect(classifyPsdAdjustmentFidelity(convert("color lookup", {
      lookupType: "3dlut",
      lut3DFileName: "look.cube",
    }))).toBe("preserved-only");
    expect(classifyPsdAdjustmentFidelity(convert("color lookup", {
      lutFormat: "cube",
      lut3DFileData: new TextEncoder().encode(CUBE_TEXT),
    }))).toBe("exact");
    expect(classifyPsdAdjustmentFidelity(convert("color lookup", {
      lutFormat: "3dl",
      lut3DFileData: new TextEncoder().encode(CUBE_TEXT),
    }))).toBe("preserved-only");
  });

  it("정확 종류라도 기본값 채움 메모가 있으면 approximated로 내린다", () => {
    // 포토 필터 색이 없으면 기본 워밍 색으로 채웠다는 메모가 남는다.
    expect(classifyPsdAdjustmentFidelity(convert("photo filter"))).toBe("approximated");
    expect(classifyPsdAdjustmentFidelity(convert("photo filter", {
      color: { r: 236, g: 138, b: 0 },
      density: 25,
      preserveLuminosity: true,
    }))).toBe("exact");
  });
});

describe("파일별 리포트", () => {
  it("복원·제외를 충실도별로 세고, 정확 행은 상세 줄에 올리지 않는다", () => {
    const report = buildPsdAdjustmentImportReport(
      [
        { name: "레벨1", kind: "levels", notes: [] },
        { name: "선택1", kind: "selective-color", notes: ["선택 색상은 색상 섹터 분류 기준 CMYK 근사로 적용됩니다(파라미터는 무손실 보존)."] },
        { name: "룩업1", kind: "color-lookup", notes: ["LUT 데이터가 PSD에 내장돼 있지 않아 파라미터만 보존했습니다 — 픽셀에는 적용되지 않습니다."] },
      ],
      [{ name: "미래조정", psdType: "mystery", reason: "알 수 없는 PSD 조정 종류(mystery)입니다." }],
    );
    expect(report.total).toBe(4);
    expect(report.restored).toBe(3);
    expect(report.dropped).toBe(1);
    expect(report.counts).toEqual({ exact: 1, approximated: 1, "preserved-only": 1, dropped: 1 });

    const lines = formatPsdAdjustmentReportLines(report);
    expect(lines[0]).toContain("대응표(전체 16종)");
    expect(lines[1]).toContain("조정 레이어 4개 — 복원 3개(정확 1 · 근사 1 · 파라미터만 보존 1) · 제외 1개");
    const detail = lines.slice(2).join("\n");
    expect(detail).toContain("선택1(선택 색상): 근사 변환");
    expect(detail).toContain("룩업1(컬러 룩업): 파라미터만 보존");
    expect(detail).toContain("미래조정(mystery): 제외");
    expect(detail).not.toContain("레벨1");
  });

  it("조정 레이어가 없으면 리포트 줄이 없다", () => {
    expect(formatPsdAdjustmentReportLines(buildPsdAdjustmentImportReport([], []))).toEqual([]);
  });
});
