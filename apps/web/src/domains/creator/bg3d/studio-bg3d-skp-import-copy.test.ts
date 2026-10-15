import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_SKP_STAGES } from "./studio-bg3d-skp-contract";
import {
  STUDIO_BG3D_SKP_LEGAL_NOTICE,
  STUDIO_BG3D_SKP_SUPPORT_SUMMARY,
  STUDIO_BG3D_SKP_WAREHOUSE_NOTICE,
  describeStudioBg3dSkpAppliedUnit,
  describeStudioBg3dSkpConversion,
  describeStudioBg3dSkpCounts,
  describeStudioBg3dSkpDeclaredUnit,
  describeStudioBg3dSkpMetadataStatus,
  describeStudioBg3dSkpNameList,
  describeStudioBg3dSkpSizeLevel,
  describeStudioBg3dSkpSource,
  describeStudioBg3dSkpStage,
  describeStudioBg3dSkpWarning,
  formatStudioBg3dSkpBytes,
  formatStudioBg3dSkpDimensions,
  formatStudioBg3dSkpLength,
  studioBg3dSkpStageLabel,
} from "./studio-bg3d-skp-import-copy";
import { createStudioBg3dSkpWarning } from "./studio-bg3d-skp-report-builder";
import {
  STUDIO_BG3D_SKP_WARNING_CODES,
  type StudioBg3dSkpWarningCode,
} from "./studio-bg3d-skp-report-constants";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

describe("formatStudioBg3dSkpLength", () => {
  it("picks the unit a person would read", () => {
    expect(formatStudioBg3dSkpLength(0)).toBe("0m");
    expect(formatStudioBg3dSkpLength(0.00508)).toBe("5.1mm");
    expect(formatStudioBg3dSkpLength(0.254)).toBe("25.4cm");
    expect(formatStudioBg3dSkpLength(2.54)).toBe("2.54m");
    expect(formatStudioBg3dSkpLength(12)).toBe("12m");
    expect(formatStudioBg3dSkpLength(2540)).toBe("2.54km");
  });

  it("never prints NaN or Infinity", () => {
    expect(formatStudioBg3dSkpLength(Number.NaN)).toBe("알 수 없음");
    expect(formatStudioBg3dSkpLength(Number.POSITIVE_INFINITY)).toBe("알 수 없음");
  });

  it("labels the three axes of the Y-up output", () => {
    expect(formatStudioBg3dSkpDimensions([2.54, 1.27, 0.5])).toBe("너비 2.54m × 높이 1.27m × 깊이 50cm");
  });
});

describe("stage copy", () => {
  it("has a label for every stage of the contract", () => {
    for (const stage of STUDIO_BG3D_SKP_STAGES) {
      expect(studioBg3dSkpStageLabel(stage).length).toBeGreaterThan(0);
    }
  });

  it("numbers the stage out of the total and says where the work runs", () => {
    expect(describeStudioBg3dSkpStage({ stage: "building-scene", fraction: null, execution: "worker" }))
      .toBe("4/6 · 모델 구조 만들기 · 별도 Worker");
    const fallback = describeStudioBg3dSkpStage({ stage: "validating", fraction: 0.456, execution: "main-thread" });
    expect(fallback).toContain("1/6 · 파일 확인 46%");
    expect(fallback).toContain("화면 스레드");
  });

  it("clamps a progress fraction that is out of range", () => {
    expect(describeStudioBg3dSkpStage({ stage: "optimizing", fraction: 7, execution: "worker" })).toContain("100%");
    expect(describeStudioBg3dSkpStage({ stage: "optimizing", fraction: -1, execution: "worker" })).toContain(" 0%");
  });
});

describe("describeStudioBg3dSkpWarning", () => {
  it("covers every warning code in the report contract with a non-empty sentence", () => {
    for (const code of STUDIO_BG3D_SKP_WARNING_CODES) {
      const copy = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning(code, "warning", { count: 3 }));
      expect({ code, filled: copy.text.length > 10 }).toEqual({ code, filled: true });
      expect(copy.code).toBe(code);
    }
  });

  it("keeps the severity and does not print an empty count", () => {
    const copy = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("flipped-faces", "warning", { count: 4 }));
    expect(copy).toMatchObject({ code: "flipped-faces", severity: "warning" });
    expect(copy.text).toContain("4곳");
    expect(copy.text).not.toMatch(/undefined|null|NaN/u);
  });

  it("tells too-small and too-large apart and names the unit that was applied", () => {
    const small = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("size-abnormal", "warning", { detail: "too-small" }));
    const large = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("size-abnormal", "warning", { detail: "too-large" }));
    expect(small.text).toContain("매우 작습니다");
    expect(large.text).toContain("매우 큽니다");
    const unit = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("unit-override-applied", "info", { detail: "cm" }));
    expect(unit.text).toContain("센티미터(cm)");
  });

  it("explains why textures are missing or left out", () => {
    const missing = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("texture-missing", "warning", { count: 2, detail: "Brick, Wood" }));
    expect(missing.text).toContain("2개");
    expect(missing.text).toContain("(Brick, Wood)");
    const byCount = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("textures-omitted", "warning", { count: 80, detail: "count" }));
    const bySize = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("textures-omitted", "warning", { count: 5, detail: "size" }));
    expect(byCount.text).toContain("너무 많아");
    expect(bySize.text).toContain("용량이 커서");
  });

  it("gives hidden geometry a way out", () => {
    const hidden = describeStudioBg3dSkpWarning(createStudioBg3dSkpWarning("hidden-tags-included", "warning", { count: 1, detail: "Scratch" }));
    expect(hidden.text).toContain("(Scratch)");
    expect(hidden.text).toContain("SketchUp에서 삭제");
  });

  it("is exhaustive for the contract's code list (a new code must get a sentence)", () => {
    const expected: readonly StudioBg3dSkpWarningCode[] = [
      "empty-scene",
      "size-abnormal",
      "unit-override-applied",
      "high-polygon-count",
      "flipped-faces",
      "orientation-check-skipped",
      "texture-missing",
      "texture-unsupported-format",
      "textures-omitted",
      "hidden-instances-included",
      "hidden-tags-included",
      "metadata-unavailable",
      "main-thread-fallback",
    ];
    expect([...STUDIO_BG3D_SKP_WARNING_CODES]).toEqual(expected);
  });
});

describe("report summaries", () => {
  it("states the default unit as no correction and a chosen unit as a scale", () => {
    expect(describeStudioBg3dSkpAppliedUnit(createSkpReportFixture())).toBe("인치(in) 기준 · 보정 없음(SketchUp 기본 저장 단위)");
    const chosen = createSkpReportFixture({ units: { appliedUnit: "m", scaleFactor: 1 / 0.0254, userSelected: true } });
    expect(describeStudioBg3dSkpAppliedUnit(chosen)).toBe("미터(m)로 해석 · 크기 ×39.3701 보정(직접 선택)");
    const confirmed = createSkpReportFixture({ units: { appliedUnit: "inch", scaleFactor: 1, userSelected: true } });
    expect(describeStudioBg3dSkpAppliedUnit(confirmed)).toContain("인치(in)로 확인함");
  });

  it("reports the unit the file declares, or that it could not be read", () => {
    expect(describeStudioBg3dSkpDeclaredUnit(createSkpReportFixture())).toBe("파일에 적힌 표시 단위: Inches");
    const legacy = createSkpReportFixture();
    const withoutUnits = { ...legacy, source: { ...legacy.source, declaredUnits: null } };
    expect(describeStudioBg3dSkpDeclaredUnit(withoutUnits)).toContain("읽지 못함");
  });

  it("describes the size level in words", () => {
    expect(describeStudioBg3dSkpSizeLevel("ok")).toBe("크기 정상");
    expect(describeStudioBg3dSkpSizeLevel("too-small")).toContain("작음");
    expect(describeStudioBg3dSkpSizeLevel("too-large")).toContain("큼");
  });

  it("summarises the counts and leaves out the face count when the metadata pass did not run", () => {
    expect(describeStudioBg3dSkpCounts(createSkpReportFixture())).toBe(
      "원본 면 40 · 삼각형 80 · 정점 160 · 재질 2 · 텍스처 0 · 배치된 컴포넌트·그룹 3",
    );
    const fixture = createSkpReportFixture();
    const skipped = { ...fixture, counts: { ...fixture.counts, sourceFaces: null } };
    expect(describeStudioBg3dSkpCounts(skipped)).not.toContain("원본 면");
  });

  it("distinguishes an unreadable name list from an empty one and shows how many were cut", () => {
    expect(describeStudioBg3dSkpNameList("장면", { available: false, items: [], total: 0, truncated: false }))
      .toBe("장면: 읽지 못함");
    expect(describeStudioBg3dSkpNameList("태그", { available: true, items: [], total: 0, truncated: false }))
      .toBe("태그: 없음");
    expect(describeStudioBg3dSkpNameList("컴포넌트", { available: true, items: ["Chair", "Table"], total: 2, truncated: false }))
      .toBe("컴포넌트 2개: Chair, Table");
    expect(describeStudioBg3dSkpNameList("컴포넌트", { available: true, items: ["Chair"], total: 70, truncated: true }))
      .toBe("컴포넌트 70개: Chair 외 69개");
  });

  it("explains every metadata outcome, including the failure that the user should know about", () => {
    expect(describeStudioBg3dSkpMetadataStatus("saved")).toContain("저장했습니다");
    expect(describeStudioBg3dSkpMetadataStatus("existing")).toContain("이미 있어");
    expect(describeStudioBg3dSkpMetadataStatus("failed")).toContain("저장하지 못했습니다");
    expect(describeStudioBg3dSkpMetadataStatus("skipped")).toContain("저장하지 않았습니다");
  });
});

describe("source and conversion summaries", () => {
  it("formats byte sizes without pretending to know an invalid one", () => {
    expect(formatStudioBg3dSkpBytes(512)).toBe("512B");
    expect(formatStudioBg3dSkpBytes(120_000)).toBe("117.2KiB");
    expect(formatStudioBg3dSkpBytes(3 * 1024 * 1024)).toBe("3MiB");
    expect(formatStudioBg3dSkpBytes(-1)).toBe("알 수 없음");
  });

  it("names the SketchUp version and container of the source", () => {
    expect(describeStudioBg3dSkpSource(createSkpReportFixture())).toBe("SketchUp 2021 · 2021 이후 형식 · 117.2KiB");
    const legacy = createSkpReportFixture();
    const old = {
      ...legacy,
      source: { ...legacy.source, container: "legacy" as const, sketchupLabel: null, byteSize: 900 },
    };
    expect(describeStudioBg3dSkpSource(old)).toBe("SketchUp 버전 알 수 없음 · 2013–2020 형식 · 900B");
  });

  it("states honestly where the conversion ran and what happened to textures", () => {
    expect(describeStudioBg3dSkpConversion(createSkpReportFixture()))
      .toBe("별도 Worker에서 변환 · 0.4초 · 텍스처 없음 · 드로 콜 12→2");
    const fixture = createSkpReportFixture();
    const fallback = {
      ...fixture,
      conversion: { ...fixture.conversion, execution: "main-thread" as const, textures: "omitted" as const },
    };
    expect(describeStudioBg3dSkpConversion(fallback)).toContain("화면 스레드에서 변환(Worker 사용 불가)");
    expect(describeStudioBg3dSkpConversion(fallback)).toContain("텍스처 제외(평균 색)");
  });
});

describe("notices", () => {
  it("points 3D Warehouse downloads at the existing rights record", () => {
    expect(STUDIO_BG3D_SKP_WAREHOUSE_NOTICE).toContain("3D Warehouse");
    expect(STUDIO_BG3D_SKP_WAREHOUSE_NOTICE).toContain("이용 권리 기록");
  });

  it("keeps the unofficial-parser and trademark statements", () => {
    expect(STUDIO_BG3D_SKP_LEGAL_NOTICE).toContain("Trimble과 관련 없는 비공식");
    expect(STUDIO_BG3D_SKP_LEGAL_NOTICE).toContain("Trimble Inc.의 상표");
  });

  it("derives the support limits from the contract constants", () => {
    expect(STUDIO_BG3D_SKP_SUPPORT_SUMMARY).toContain("SketchUp 2013 이후");
    expect(STUDIO_BG3D_SKP_SUPPORT_SUMMARY).toContain("90초");
    expect(STUDIO_BG3D_SKP_SUPPORT_SUMMARY).toContain("데스크톱 32MiB");
    expect(STUDIO_BG3D_SKP_SUPPORT_SUMMARY).toContain("모바일 16MiB");
    expect(STUDIO_BG3D_SKP_SUPPORT_SUMMARY).toContain("압축을 푼 모델 데이터");
    expect(STUDIO_BG3D_SKP_SUPPORT_SUMMARY).not.toMatch(/undefined|NaN/u);
  });
});
