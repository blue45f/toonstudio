import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isPathInsideDirectory } from "./path-containment.mjs";

// 서비스 워커 검증 서버는 요청 경로를 dist/ 아래 파일로 바꿔 읽는다. 문자열 접두사 비교로는
// 형제 디렉터리(dist-evil)가 dist 안쪽으로 오판되므로, 경로 구분자 경계까지 비교해야 한다.
const DIST = resolve("/repo/dist");

describe("isPathInsideDirectory", () => {
  it("dist 아래의 파일과 하위 디렉터리 파일은 안쪽으로 판정한다", () => {
    expect(isPathInsideDirectory(DIST, resolve(DIST, "sw.js"))).toBe(true);
    expect(isPathInsideDirectory(DIST, resolve(DIST, "assets/chunk.js"))).toBe(true);
    expect(isPathInsideDirectory(DIST, `${DIST}/assets/../index.html`)).toBe(true);
  });

  it("이름이 dist 로 시작하는 형제 디렉터리는 바깥으로 판정한다", () => {
    expect(isPathInsideDirectory(DIST, resolve("/repo/dist-evil/secret.txt"))).toBe(false);
    expect(isPathInsideDirectory(DIST, resolve("/repo/dist2/index.html"))).toBe(false);
    expect(isPathInsideDirectory(DIST, resolve("/repo/distribution"))).toBe(false);
  });

  it("상위 디렉터리로 벗어나는 경로와 루트 자신은 바깥으로 판정한다", () => {
    expect(isPathInsideDirectory(DIST, `${DIST}/../package.json`)).toBe(false);
    expect(isPathInsideDirectory(DIST, resolve("/repo/package.json"))).toBe(false);
    expect(isPathInsideDirectory(DIST, DIST)).toBe(false);
    expect(isPathInsideDirectory(DIST, `${DIST}/`)).toBe(false);
  });

  it("점 두 개로 시작하는 파일 이름은 상위 이동으로 오인하지 않는다", () => {
    expect(isPathInsideDirectory(DIST, resolve(DIST, "..hidden"))).toBe(true);
    expect(isPathInsideDirectory(DIST, resolve(DIST, "..", "dist-evil"))).toBe(false);
  });
});
