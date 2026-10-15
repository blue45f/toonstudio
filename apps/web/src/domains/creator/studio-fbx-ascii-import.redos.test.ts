import { describe, expect, it } from "vitest";

import { parseStudioFbxAscii } from "./studio-fbx-ascii-import";

/**
 * ASCII FBX 읽기의 최악 입력 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * FBX 모델은 마켓·공유에서 받은 바깥 파일이다. `Vertices: *N {` 머리말 뒤에 닫는 `}` 가 끝내 없는 파일에서는
 * `/Vertices:...\{([^}]*)\}/` 가 머리말 위치마다 문서 끝까지 다시 읽어 입력 길이의 제곱 시간이 든다.
 * 아래 입력은 수정 전 구현에서 각각 수 초가 걸렸고, 선형 시간이면 수십 ms 안에 끝난다.
 * 상한은 느린 CI 에서도 흔들리지 않게 1초로 넉넉히 둔다.
 */
const LINEAR_TIME_BUDGET_MS = 1_000;

function timed<T>(run: () => T): { value: T; elapsedMs: number } {
  const startedAt = performance.now();
  const value = run();
  return { value, elapsedMs: performance.now() - startedAt };
}

const TRIANGLE = [
  "; FBX 7.4.0 project file",
  "FBXHeaderExtension:  {",
  "\tFBXHeaderVersion: 1003",
  "\tFBXVersion: 7400",
  "}",
  "Objects:  {",
  "\tGeometry: 1, \"Geometry::Triangle\", \"Mesh\" {",
  "\t\tVertices: *9 {",
  "\t\t\ta: 0,0,0,1,0,0,0,1,0",
  "\t\t}",
  "\t\tPolygonVertexIndex: *3 {",
  "\t\t\ta: 0,1,-3",
  "\t\t}",
  "\t}",
  "\tModel: 2, \"Model::Triangle\", \"Mesh\" {",
  "\t\tVersion: 232",
  "\t}",
  "}",
].join("\n");

describe("ASCII FBX 정점·면 블록 읽기의 선형 시간", () => {
  it("닫는 중괄호 없는 Vertices 머리말이 길게 반복돼도 제곱 시간이 되지 않는다", () => {
    const text = `; FBX 7.4.0 project file\n${"Vertices: *1 {".repeat(25_000)}`;
    const { value, elapsedMs } = timed(() => parseStudioFbxAscii(text));
    expect(value.positions).toEqual([]);
    expect(elapsedMs, "Vertices 블록 읽기 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("닫는 중괄호 없는 PolygonVertexIndex 머리말이 길게 반복돼도 제곱 시간이 되지 않는다", () => {
    const text = `; FBX 7.4.0 project file\n${"PolygonVertexIndex: *1 {".repeat(20_000)}`;
    const { value, elapsedMs } = timed(() => parseStudioFbxAscii(text));
    expect(value.polygons).toEqual([]);
    expect(elapsedMs, "PolygonVertexIndex 블록 읽기 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("별표 없는 머리말 형태도 제곱 시간이 되지 않는다", () => {
    const text = `; FBX 7.4.0 project file\n${"Vertices: {".repeat(30_000)}`;
    const { value, elapsedMs } = timed(() => parseStudioFbxAscii(text));
    expect(value.positions).toEqual([]);
    expect(elapsedMs, "Vertices 블록(별표 없음) 읽기 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("ASCII FBX 정점·면 블록 읽기의 판정 보존", () => {
  it("삼각형 하나를 같은 정점과 면으로 읽는다", () => {
    const parsed = parseStudioFbxAscii(TRIANGLE);
    expect(parsed.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(parsed.polygons).toEqual([[0, 1, 2]]);
    expect(parsed.modelNames).toEqual(["Triangle"]);
  });

  it("닫는 중괄호가 있는 첫 머리말만 쓰고 뒤의 블록은 무시한다", () => {
    const text = `${TRIANGLE}\nVertices: *3 {\n a: 9,9,9\n}\n`;
    expect(parseStudioFbxAscii(text).positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it("별표 없는 Vertices 머리말도 읽는다", () => {
    const text = "; FBX\nVertices: {\n a: 1,2,3\n}\nPolygonVertexIndex: {\n a: 0,1,-3\n}\n";
    const parsed = parseStudioFbxAscii(text);
    expect(parsed.positions).toEqual([1, 2, 3]);
    expect(parsed.polygons).toEqual([[0, 1, 2]]);
  });

  it("머리말만 있고 닫는 중괄호가 없으면 비어 있다", () => {
    const parsed = parseStudioFbxAscii("; FBX\nVertices: *9 {\n a: 0,0,0,1,0,0,0,1,0\n");
    expect(parsed.positions).toEqual([]);
  });

  it("머리말이 없으면 비어 있다", () => {
    expect(parseStudioFbxAscii("; FBX\nObjects: {\n}\n").positions).toEqual([]);
  });
});
