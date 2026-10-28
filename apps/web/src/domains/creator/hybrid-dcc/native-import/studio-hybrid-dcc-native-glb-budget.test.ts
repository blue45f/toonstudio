import { describe, expect, it } from "vitest";

import { admitNativeGlbOutputWork, admitNativeGlbPrimitiveScanWork } from "./studio-hybrid-dcc-native-glb-budget";
import { estimateStudioNativeImportAssetBytes, STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES } from "./studio-hybrid-dcc-native-import-contracts";

describe("개별 HE 한도와 장면 작업 메모리 admission", () => {
  it("각각 유효한 두 primitive의 V 합계가 단일 mesh 한도를 넘어도 별도 작업 예산 안이면 허용한다", () => {
    const first = admitNativeGlbOutputWork(0, 150000, 150000, false);
    const total = admitNativeGlbOutputWork(first, 150000, 150000, false);
    expect(total).toBe(estimateStudioNativeImportAssetBytes(300000, 300000, 100000, false));
    expect(total).toBeLessThan(STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES);
    expect(() => admitNativeGlbOutputWork(total, 150000, 150000, true)).toThrow(/256 MiB/u);
  });

  it("한 primitive가 단일 HE 한도를 넘거나 누적 작업량이 잘못되면 거부한다", () => {
    expect(() => admitNativeGlbOutputWork(0, 250001, 3, false)).toThrow(/개별 primitive/u);
    expect(() => admitNativeGlbOutputWork(0, 3, 500001, true)).toThrow(/개별 primitive/u);
    expect(() => admitNativeGlbOutputWork(NaN, 3, 3, true)).toThrow(/256 MiB/u);
  });

  it("면 출력 수와 독립적으로 TRIANGLES·STRIP·FAN의 반복 입력 검증량을 계산한다", () => {
    expect(admitNativeGlbPrimitiveScanWork(0, 300, 4, 1500)).toBe(1500);
    expect(() => admitNativeGlbPrimitiveScanWork(1500, 300, 4, 1500)).toThrow(/반복 primitive/u);
    expect(admitNativeGlbPrimitiveScanWork(0, 300, 5)).toBe(300 + 298 * 12);
    expect(admitNativeGlbPrimitiveScanWork(0, 300, 6)).toBe(300 + 298 * 12);
    expect(() => admitNativeGlbPrimitiveScanWork(0, 3, 4, 16_000_001)).toThrow(/반복 primitive/u);
  });
});
