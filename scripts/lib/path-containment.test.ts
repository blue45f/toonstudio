import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

// 서비스 워커 검증 서버처럼 요청 경로를 실제 파일로 읽는 호출부는 심볼릭 링크가 root 바깥을 가리키는 경우까지 막아야 한다.
describe("isPathInsideDirectory — resolveSymlinks 옵션", () => {
  let sandbox: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "path-containment-"));
    root = join(sandbox, "dist");
    outside = join(sandbox, "outside");
    mkdirSync(join(root, "assets"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(root, "index.html"), "root file");
    writeFileSync(join(root, "assets", "chunk.js"), "chunk");
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(join(outside, "secret.txt"), join(root, "link-to-outside-file"));
    symlinkSync(outside, join(root, "link-to-outside-dir"), "dir");
    symlinkSync(join(root, "index.html"), join(root, "link-to-inside-file"));
    symlinkSync(root, join(root, "link-to-root"), "dir");
    symlinkSync(join(outside, "missing.txt"), join(root, "dangling-to-outside"));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("기본 판정은 문자열 기반이라 root 안의 링크 파일이 바깥을 가리켜도 안쪽으로 본다(알려진 한계)", () => {
    expect(isPathInsideDirectory(root, join(root, "link-to-outside-file"))).toBe(true);
    expect(isPathInsideDirectory(root, join(root, "link-to-outside-dir", "secret.txt"))).toBe(true);
  });

  it("옵션을 켜면 root 바깥 파일을 가리키는 링크와 바깥 디렉터리 링크를 거친 파일은 바깥으로 본다", () => {
    const options = { resolveSymlinks: true } as const;
    expect(isPathInsideDirectory(root, join(root, "link-to-outside-file"), options)).toBe(false);
    expect(isPathInsideDirectory(root, join(root, "link-to-outside-dir", "secret.txt"), options)).toBe(false);
  });

  it("옵션을 켜도 일반 파일과 root 안을 가리키는 링크는 안쪽이다", () => {
    const options = { resolveSymlinks: true } as const;
    expect(isPathInsideDirectory(root, join(root, "index.html"), options)).toBe(true);
    expect(isPathInsideDirectory(root, join(root, "assets", "chunk.js"), options)).toBe(true);
    expect(isPathInsideDirectory(root, join(root, "link-to-inside-file"), options)).toBe(true);
    expect(isPathInsideDirectory(root, join(root, "link-to-root", "assets", "chunk.js"), options)).toBe(true);
  });

  it("root 자신이나 root 를 가리키는 링크 자체는 안쪽이 아니다", () => {
    const options = { resolveSymlinks: true } as const;
    expect(isPathInsideDirectory(root, root, options)).toBe(false);
    expect(isPathInsideDirectory(root, join(root, "link-to-root"), options)).toBe(false);
  });

  it("root 자체가 링크여도 같은 실제 디렉터리 안의 파일은 안쪽이다", () => {
    const rootLink = join(sandbox, "dist-link");
    symlinkSync(root, rootLink, "dir");
    expect(isPathInsideDirectory(rootLink, join(rootLink, "index.html"), { resolveSymlinks: true })).toBe(true);
    expect(isPathInsideDirectory(rootLink, join(rootLink, "link-to-outside-file"), { resolveSymlinks: true })).toBe(false);
  });

  it("없는 경로는 문자열 판정만 하고, 바깥을 가리키는 끊어진 링크는 닫힘으로 바깥으로 본다", () => {
    const options = { resolveSymlinks: true } as const;
    expect(isPathInsideDirectory(root, join(root, "not-created-yet.js"), options)).toBe(true);
    expect(isPathInsideDirectory(root, join(sandbox, "dist-evil", "x.js"), options)).toBe(false);
    expect(isPathInsideDirectory(root, join(root, "dangling-to-outside"), options)).toBe(false);
    // 한계: 바깥을 가리키는 디렉터리 링크 아래의 "없는" 파일은 문자열 판정만 하므로 안쪽으로 나온다(읽기 전용 호출부 전제).
    expect(isPathInsideDirectory(root, join(root, "link-to-outside-dir", "not-created-yet.js"), options)).toBe(true);
  });

  it("문자열 판정에서 이미 바깥이면 옵션과 무관하게 바깥이다", () => {
    expect(isPathInsideDirectory(root, join(sandbox, "dist-evil", "index.html"), { resolveSymlinks: true })).toBe(false);
    expect(isPathInsideDirectory(root, join(root, "..", "outside", "secret.txt"), { resolveSymlinks: true })).toBe(false);
  });
});
