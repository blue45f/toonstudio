import { describe, expect, it } from "vitest";

import { isLabFailure } from "../../contracts";

import { accessorFitsBin, accessorLayout, dataViewOf, parseGlb, readAccessorValue, writeAccessorInteger, writeGlb } from "./glb-io";
import { buildFixtureGlb, fixtureJointNames } from "./glb-test-fixture";

import type { JsonObject } from "./glb-io";

function failureOf(run: () => unknown): { code: string; reasonKo: string } {
  try {
    run();
  } catch (error) {
    if (isLabFailure(error)) return { code: error.code, reasonKo: error.reasonKo };
    throw error;
  }
  throw new Error("실패해야 하는 호출이었습니다.");
}

describe("parseGlb / writeGlb", () => {
  it("쓰고 다시 읽으면 JSON과 BIN이 보존된다", () => {
    const json: JsonObject = { asset: { version: "2.0" }, scenes: [{ nodes: [] }], extra: { 한글: "값" } };
    const bin = new Uint8Array([1, 2, 3, 4, 5]);
    const bytes = writeGlb({ json, bin });
    expect(bytes.byteLength % 4).toBe(0);
    const parsed = parseGlb(bytes);
    expect(parsed.json).toEqual(json);
    expect([...parsed.bin.subarray(0, 5)]).toEqual([1, 2, 3, 4, 5]);
  });

  it("BIN이 없으면 JSON 청크만 쓴다", () => {
    const parsed = parseGlb(writeGlb({ json: { asset: { version: "2.0" } }, bin: new Uint8Array(0) }));
    expect(parsed.bin.byteLength).toBe(0);
  });

  it("잘못된 입력은 glb-invalid LabFailure로 실패한다", () => {
    expect(failureOf(() => parseGlb(new Uint8Array(4))).code).toBe("glb-invalid");
    const notGlb = new Uint8Array(32);
    expect(failureOf(() => parseGlb(notGlb, "x.glb")).reasonKo).toContain("x.glb");
    const good = writeGlb({ json: { asset: { version: "2.0" } }, bin: new Uint8Array(8) });
    expect(failureOf(() => parseGlb(good.subarray(0, good.byteLength - 4))).reasonKo).toContain("잘린");
    const wrongVersion = good.slice();
    new DataView(wrongVersion.buffer).setUint32(4, 1, true);
    expect(failureOf(() => parseGlb(wrongVersion)).reasonKo).toContain("버전");
    const wrongAsset = writeGlb({ json: { asset: { version: "1.0" } }, bin: new Uint8Array(0) });
    expect(failureOf(() => parseGlb(wrongAsset)).reasonKo).toContain("2.0");
  });
});

describe("accessor 읽기·쓰기", () => {
  const glb = parseGlb(buildFixtureGlb({ joints: fixtureJointNames(3), meshes: [{ node: "Body", jointIndices: [2, 1, 0], attributes: { color0: true } }] }));
  const primitive = (glb.json.meshes as JsonObject[])[0]?.primitives as JsonObject[];
  const attributes = primitive[0]?.attributes as JsonObject;

  it("FLOAT·UNSIGNED_BYTE(정규화 포함) 값을 읽는다", () => {
    const view = dataViewOf(glb.bin);
    const position = accessorLayout(glb.json, attributes.POSITION as number);
    expect(position).not.toBeNull();
    if (!position) return;
    expect(position.count).toBe(3);
    expect(readAccessorValue(view, position, 1, 0)).toBe(1);
    expect(readAccessorValue(view, position, 2, 1)).toBe(1);
    const color = accessorLayout(glb.json, attributes.COLOR_0 as number);
    expect(color?.normalized).toBe(true);
    if (color) expect(readAccessorValue(view, color, 0, 0)).toBeCloseTo(200 / 255, 6);
  });

  it("정수 accessor는 제자리에서 쓸 수 있고 FLOAT에는 쓸 수 없다", () => {
    const view = dataViewOf(glb.bin);
    const joints = accessorLayout(glb.json, attributes.JOINTS_0 as number);
    expect(joints).not.toBeNull();
    if (!joints) return;
    expect(readAccessorValue(view, joints, 0, 0)).toBe(2);
    writeAccessorInteger(view, joints, 0, 0, 1);
    expect(readAccessorValue(view, joints, 0, 0)).toBe(1);
    const position = accessorLayout(glb.json, attributes.POSITION as number);
    if (position) expect(() => writeAccessorInteger(view, position, 0, 0, 1)).toThrow();
  });

  it("범위 검사: BIN 안에 들어가야 읽을 수 있다", () => {
    const position = accessorLayout(glb.json, attributes.POSITION as number);
    expect(position && accessorFitsBin(position, glb.bin.byteLength)).toBe(true);
    expect(position && accessorFitsBin(position, 4)).toBe(false);
    expect(accessorLayout(glb.json, 9999)).toBeNull();
  });
});
