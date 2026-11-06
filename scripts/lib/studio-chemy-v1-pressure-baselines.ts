import macBaseline from "../fixtures/studio-chemy-v1-pressure/baseline.json";
import linuxBaseline from "../fixtures/studio-chemy-v1-pressure/linux-x64/baseline.json";

import type { ChemyPressureBaseline, ChemyPressureEnvironment } from "./studio-chemy-v1-pressure-policy";

export interface ChemyPressureBaselineSelection {
  readonly baseline: ChemyPressureBaseline;
  readonly fixtureDirectory: "" | "linux-x64/";
}

const MAC_BASELINE: ChemyPressureBaselineSelection = Object.freeze({
  baseline: macBaseline,
  fixtureDirectory: "",
});
const LINUX_BASELINE: ChemyPressureBaselineSelection = Object.freeze({
  baseline: linuxBaseline,
  fixtureDirectory: "linux-x64/",
});

/** 검증한 세 환경 값만 정확히 선택한다. 미확인 환경의 골든 생성·대체 경로는 없다. */
export function selectLegacyChemyV1PressureBaseline(
  environment?: Partial<ChemyPressureEnvironment> | null,
): ChemyPressureBaselineSelection | null {
  if (environment?.browser !== "156.0.8078.4") return null;
  if (environment.platform === "darwin" && environment.architecture === "arm64") return MAC_BASELINE;
  if (environment.platform === "linux" && environment.architecture === "x64") return LINUX_BASELINE;
  return null;
}
