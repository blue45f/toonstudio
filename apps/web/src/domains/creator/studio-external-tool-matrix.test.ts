import { describe, expect, it } from "vitest";

import {
  findExternalToolMatrixRow,
  listExternalToolGaps,
  STUDIO_EXTERNAL_TOOL_MATRIX,
} from "./studio-external-tool-matrix";

describe("studio-external-tool-matrix", () => {
  it("매트릭스에 독점 포맷 브릿지 행이 있다", () => {
    const clip = findExternalToolMatrixRow("클립스튜디오", ".clip");
    expect(clip?.support).toBe("bridge");
    expect(clip?.gap).toContain(".clip");
    expect(clip?.requiredCondition).toContain("리버스엔지니어링 금지");
  });

  it("없는 쌍은 null이다", () => {
    expect(findExternalToolMatrixRow("포토샵", ".kra")).toBeNull();
  });

  it("격차 목록은 gap이 있는 행만 포함한다", () => {
    const gaps = listExternalToolGaps();
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((row) => row.gap !== "")).toBe(true);
    expect(STUDIO_EXTERNAL_TOOL_MATRIX.length).toBeGreaterThanOrEqual(gaps.length);
  });

  it("네이티브 행은 기존 처리 경로를 가진다", () => {
    const psd = findExternalToolMatrixRow("포토샵", ".psd");
    expect(psd?.support).toBe("native");
    expect(psd?.existingPath).toContain("ag-psd");
  });
});
