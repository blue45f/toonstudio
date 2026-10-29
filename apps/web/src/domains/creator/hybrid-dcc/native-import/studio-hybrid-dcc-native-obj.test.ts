import { describe, expect, it, vi } from "vitest";

import { hashStudioEditableMesh, serializeStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { deriveStudioMeshUvIslands } from "../../mesh-uv/studio-mesh-uv-authority";
import { createStudioHybridDccIdentityTransform } from "../studio-hybrid-dcc-object-transform";
import { validateStudioHybridDccFanPolygon } from "../studio-hybrid-dcc-polygon-validation";

import { STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES, type StudioNativeImportDecoded, type StudioNativeImportResult } from "./studio-hybrid-dcc-native-import-contracts";
import { decodeStudioNativeObj, STUDIO_NATIVE_OBJ_LIMITS } from "./studio-hybrid-dcc-native-obj";

const encoder = new TextEncoder();
const triangle = "v 0 0 0\nv 1 0 0\nv 0 1 0\n";
const quad = `${triangle}v 1 1 0\n`;
function decoded(text: string): StudioNativeImportDecoded {
  const result = decodeStudioNativeObj(encoder.encode(text));
  expect(result.ok, JSON.stringify(result.ok ? undefined : result.issues)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
function expectCode(result: StudioNativeImportResult, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("잘못된 OBJ를 받아들였습니다.");
  expect(result.issues.some((issue) => issue.code === code && issue.severity === "error")).toBe(true);
}
function loops(value: StudioNativeImportDecoded): readonly (readonly number[])[] {
  return value.assets[0]!.mesh.faces.map((face) => {
    const mesh = value.assets[0]!.mesh; const result: number[] = [];
    let id = face.he;
    do { const edge = mesh.halfEdges[id]!; result.push(mesh.halfEdges[edge.prev]!.vertex); id = edge.next; } while (id !== face.he);
    return result;
  });
}

describe("OBJ를 실제 native 편집 자산으로 복원", () => {
  it("v/f의 원본 polygon 순서·정점 색인·identity transform을 유지한다", () => {
    const value = decoded(`${quad}o 배경 벽\nf 1 2 4 3\n`);
    expect(value.format).toBe("obj"); expect(value.assets).toHaveLength(1);
    const asset = value.assets[0]!;
    expect(asset.name).toBe("배경 벽"); expect(asset.initialTransform).toEqual(createStudioHybridDccIdentityTransform());
    expect(asset.mesh.vertices).toHaveLength(4); expect(loops(value)).toEqual([[0, 1, 3, 2]]);
    expect(asset.mesh.faces[0]!.smooth).toBe(false); expect(asset.mesh.uvLayer).toBeUndefined();
    expect(hashStudioEditableMesh(asset.mesh)).toMatch(/^mesh:sha256:/u);
    expect(serializeStudioEditableMesh(asset.mesh).faces).toEqual([[0, 1, 3, 2]]);
  });

  it("같은 position index의 여러 vt를 원본 halfedge-origin 코너에 옮기며 V-up·타일 밖 좌표를 유지한다", () => {
    const value = decoded(`${quad}vt 0 0\nvt 1 0\nvt 0 1\nvt -0.25 1.5\nf 1/1 2/2 3/3\nf 1/4 4/2 2/1\n`);
    const mesh = value.assets[0]!.mesh;
    expect(mesh.vertices).toHaveLength(4); expect(mesh.faces).toHaveLength(2);
    expect(mesh.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual([[0, 0], [1, 0], [0, 1], [-0.25, 1.5], [1, 0], [0, 0]]);
    expect(mesh.halfEdges[mesh.halfEdges[0]!.prev]!.vertex).toBe(mesh.halfEdges[mesh.halfEdges[3]!.prev]!.vertex);
    expect(deriveStudioMeshUvIslands(mesh)).toHaveLength(2);
  });

  it("positive·relative negative index와 v//vn·v/vt/vn을 선언 시점에 엄격히 해석한다", () => {
    const value = decoded(`${triangle}vt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\no A\nf -3/-3/-1 -2/-2/-1 -1/-1/-1\no B\nf +1//1 +2//1 +3//1\n`);
    expect(value.assets).toHaveLength(2); expect(value.assets[0]!.mesh.uvLayer?.corners).toHaveLength(3);
    expect(value.assets[1]!.mesh.uvLayer).toBeUndefined();
    expect(value.issues.some(({ code }) => code === "obj-custom-normals")).toBe(true);
  });

  it("복수 o/g 조합을 중복 면 없이 전부 복원하고 같은 이름의 두 o도 합치지 않는다", () => {
    const value = decoded(`${triangle}o house\ng wall front\nf 1 2 3\ng roof\nf 1 2 3\no house\ng\nf 1 2 3\n`);
    expect(value.assets).toHaveLength(3); expect(value.assets.map(({ mesh }) => mesh.faces.length)).toEqual([1, 1, 1]);
    expect(value.assets.map(({ name }) => name)).toEqual(["house / wall front", "house / roof", "house"]);
    expect(value.assets.map(({ sourceNodeIndex }) => sourceNodeIndex)).toEqual([1, 1, 2]);
    expect(value.issues.some(({ code }) => code === "obj-groups-split")).toBe(true);
  });

  it("UV 있는 면과 없는 면을 별도 자산으로 보존하며 없는 UV를 0으로 만들지 않는다", () => {
    const value = decoded(`${quad}vt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\nf 2 4 3\n`);
    expect(value.assets).toHaveLength(2); expect(value.assets[0]!.mesh.uvLayer).toBeDefined(); expect(value.assets[1]!.mesh.uvLayer).toBeUndefined();
    expect(value.assets.map(({ name }) => name)).toEqual(["OBJ · UV", "OBJ · UV 없음"]);
    expect(value.assets.reduce((count, { mesh }) => count + mesh.faces.length, 0)).toBe(2);
    expect(value.issues.some(({ code }) => code === "obj-mixed-uv-parts")).toBe(true);
  });

  it("재질 슬롯·mixed smooth를 복원하고 MTL fetch·커스텀 normal·다중 smoothing group 한계를 보고한다", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const value = decoded(`${quad}mtllib https://example.invalid/secret.mtl\nusemtl brick\ns on\nf 1 2 3\nusemtl glass\ns off\nf 2 4 3\ns 2\nf 3 4 2\n`);
      expect(value.assets[0]!.mesh.faces.map(({ materialSlot, smooth }) => [materialSlot, smooth])).toEqual([[1, true], [2, false], [2, true]]);
      expect(value.issues.map(({ code }) => code)).toContain("obj-external-material");
      expect(value.issues.map(({ code }) => code)).toContain("obj-smoothing-groups");
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(value.issues)).not.toContain("secret.mtl");
    } finally { fetch.mockRestore(); }
  });

  it("기존 corner UV가 전부 0이어도 유효한 authoring 입력으로 보존한다", () => {
    const value = decoded(`${triangle}vt 0 0\nf 1/1 2/1 3/1\n`);
    expect(value.assets[0]!.mesh.uvLayer!.corners.every(({ u, v }) => u === 0 && v === 0)).toBe(true);
    const line = decoded(`${triangle}vt 0 1e-50\nvt 1 1e-50\nvt 2 1e-50\nf 1/1 2/2 3/3\n`);
    expect(line.assets[0]!.mesh.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it("단일 face에서도 원본의 양수 UV edge·extent·fan이 새로 접히면 경고 없는 성공 대신 원자적으로 거부한다", () => {
    for (const uv of [
      "vt 1 1\nvt 1.00000001 1\nvt 1 1.00000001\n",
      "vt 1 0\nvt 1.00000001 1\nvt 1 2\n",
      "vt 0 0\nvt 1 1\nvt 2 2.00000001\n",
      "vt 0 0\nvt 1e-50 0\nvt 0 1\n",
    ]) {
      const bytes = encoder.encode(`${triangle}${uv}f 1/1 2/2 3/3\n`); const before = bytes.slice();
      expectCode(decodeStudioNativeObj(bytes), "obj-uv-precision"); expect(bytes).toEqual(before);
    }
  });

  it("UV를 Float32로 읽을 때 실제 twin seam이 합쳐지는 입력은 거부한다", () => {
    const source = `${quad}vt .5 0\nvt 1 0\nvt 0 1\nvt .5000000001 0\nvt 1 1\nvt 1 0\nf 1/1 2/2 3/3\nf 1/4 4/5 2/6\n`;
    expectCode(decodeStudioNativeObj(encoder.encode(source)), "obj-uv-precision");
    // 반대 끝점이 계속 끊겨 있어 전체 edge의 seam flag가 같아도, 한 끝점의 새 합침은 거부한다.
    expectCode(decodeStudioNativeObj(encoder.encode(source.replace("vt 1 1\nvt 1 0", "vt 1 1\nvt .75 0"))), "obj-uv-precision");
    expectCode(decodeStudioNativeObj(encoder.encode(source.replace(".5000000001", ".75").replace("vt 1 1\nvt 1 0", "vt 1 1\nvt 1.0000000001 0"))), "obj-uv-precision");
    const equal = decoded(source.replace(".5000000001", ".5"));
    expect(equal.assets[0]!.mesh.uvLayer?.corners).toHaveLength(6);
  });

  it("v의 동차 좌표·vt의 선택 성분과 CR/연결 줄을 처리하고 원본 bytes는 바꾸지 않는다", () => {
    const text = "v 0 0 0 2\rv 2 0 0 2\rv 0 2 0 2\rvt .25\rvt .5 .75 1\rf 1/1 \\\r2/2 3/1\r";
    const bytes = encoder.encode(`prefix${text}suffix`); const before = bytes.slice();
    const result = decodeStudioNativeObj(bytes.subarray(6, bytes.length - 6));
    expect(result.ok).toBe(true); expect(bytes).toEqual(before);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.assets[0]!.mesh.vertices[1]!.position.x).toBe(1);
    expect(result.value.issues.map(({ code }) => code)).toContain("obj-texture-coordinate-w");
    expect(result.value.issues.map(({ code }) => code)).toContain("obj-homogeneous-vertices");
  });

  it("오목 polygon과 collinear 코너를 원본 UV 코너 누락 없이 검증된 삼각형으로 나눈다", () => {
    for (const points of [
      [[0, 0], [2, 0], [2, 2], [1, 1], [0, 2]],
      [[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]],
    ]) {
      const text = points.map(([x, y]) => `v ${x} ${y} 0`).join("\n") + "\n" + points.map((_, index) => `vt ${index / 8} ${index === 1 ? 0.3 : index / 4}`).join("\n") + "\nf 1/1 2/2 3/3 4/4 5/5\n";
      const value = decoded(text); const mesh = value.assets[0]!.mesh;
      expect(mesh.faces).toHaveLength(3); expect(mesh.vertices).toHaveLength(5);
      const used = new Set(mesh.uvLayer!.corners.map(({ u, v }) => `${u}|${v}`));
      points.forEach((_, index) => expect(used.has(`${Math.fround(index / 8)}|${Math.fround(index === 1 ? 0.3 : index / 4)}`)).toBe(true));
      for (const loop of loops(value)) validateStudioHybridDccFanPolygon(loop.map((id) => { const p = mesh.vertices[id]!.position; return [p.x, p.y, p.z]; }), 0);
      expect(value.issues.some(({ code }) => code === "obj-triangulated-polygon")).toBe(true);
    }
  });

  it("서로 다른 원본 v가 같은 좌표여도 임의 position weld를 하지 않는다", () => {
    const value = decoded(`${triangle}v 0 0 0\nf 1 2 3\nf 4 2 3\n`);
    expect(value.assets[0]!.mesh.vertices).toHaveLength(4);
    expect(loops(value)).toEqual([[0, 1, 2], [3, 1, 2]]);
  });

  it("simple nonplanar quad는 원본 polygon으로 유지한다", () => {
    const value = decoded("v 0 0 0\nv 1 0 0\nv 1 1 .2\nv 0 1 0\nf 1 2 3 4\n");
    expect(value.assets[0]!.mesh.faces).toHaveLength(1); expect(loops(value)[0]).toEqual([0, 1, 2, 3]);
  });

  it.each([
    ["f 0 2 3", "obj-invalid-index"], ["f 1 2 4", "obj-invalid-index"], ["f -4 -2 -1", "obj-invalid-index"],
    ["f 1/1 2/1 3/1", "obj-invalid-index"], ["f 1//1 2//1 3//1", "obj-invalid-index"],
    ["f 1/ 2/ 3/", "obj-invalid-syntax"], ["f 1 1 2", "obj-invalid-polygon"], ["s -1", "obj-invalid-syntax"],
    ["v NaN 0 0", "obj-invalid-number"], ["v 0x10 0 0", "obj-invalid-number"], ["v 1e309 0 0", "obj-invalid-number"],
    ["v 0 0 0 0", "obj-invalid-number"], ["vt 1e40 0", "obj-invalid-number"],
  ])("불완전하거나 범위 밖인 입력 %s를 원자적으로 거부한다", (line, code) => {
    expectCode(decodeStudioNativeObj(encoder.encode(`${triangle}${line}\n`)), code!);
  });

  it("부분 UV face·자교차 polygon·Float32에서 붕괴하는 기하를 거부한다", () => {
    expectCode(decodeStudioNativeObj(encoder.encode(`${triangle}vt 0 0\nf 1/1 2 3/1\n`)), "obj-face-partial-uv");
    expectCode(decodeStudioNativeObj(encoder.encode("v 0 0 0\nv 2 2 0\nv 0 2 0\nv 1 0 0\nf 1 2 3 4\n")), "obj-invalid-polygon");
    expectCode(decodeStudioNativeObj(encoder.encode("v 999999 0 0\nv 999999.00000001 0 0\nv 999999 1 0\nf 1 2 3\n")), "obj-invalid-polygon");
  });

  it("UTF-8·빈 파일·줄/face/assets 실행 예산을 초기 단계에서 검사한다", () => {
    expectCode(decodeStudioNativeObj(new Uint8Array([255])), "obj-invalid-utf8");
    expectCode(decodeStudioNativeObj(new Uint8Array()), "obj-file-budget");
    const oversized = new Uint8Array(1); Object.defineProperty(oversized, "byteLength", { value: STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES + 1 });
    expectCode(decodeStudioNativeObj(oversized), "obj-file-budget");
    expectCode(decodeStudioNativeObj(encoder.encode(`#${"x".repeat(STUDIO_NATIVE_OBJ_LIMITS.maxLineCharacters)}\n`)), "obj-budget-exceeded");
    expectCode(decodeStudioNativeObj(encoder.encode(`${triangle}f ${"1 ".repeat(4097)}\n`)), "obj-budget-exceeded");
    expectCode(decodeStudioNativeObj(encoder.encode(triangle + Array.from({ length: 257 }, (_, index) => `o part${index}\nf 1 2 3\n`).join(""))), "obj-budget-exceeded");
  });

  it("선·점·알 수 없는 레코드만 있는 파일을 편집 성공으로 보고하지 않는다", () => {
    expectCode(decodeStudioNativeObj(encoder.encode(`${triangle}l 1 2\np 3\n`)), "obj-empty-geometry");
    expectCode(decodeStudioNativeObj(encoder.encode(`${triangle}f 1 2 3\nsurf 1 2 3\n`)), "obj-unsupported-record");
  });
});
