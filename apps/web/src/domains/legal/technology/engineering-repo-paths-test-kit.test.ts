import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * CI 의 부분 체크아웃(작업 트리에 일부 폴더가 없는 환경)을 흉내 낸다: `existsSync` 가 항상 false 를 돌려줘도
 * git 이 추적하는 경로는 "저장소에 있다"고 판단하고, 추적하지 않는 경로는 계속 없다고 판단해야 한다.
 */
describe("repoPathExists", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:fs");
  });

  it("작업 트리에 파일이 있으면 있다고 본다", async () => {
    const { repoPathExists } = await import("./engineering-repo-paths-test-kit");
    expect(repoPathExists("package.json")).toBe(true);
    expect(repoPathExists("apps/web/src/domains/legal/technology")).toBe(true);
    expect(repoPathExists("no/such/file.ts")).toBe(false);
  });

  it("작업 트리에 없어도 git 이 추적하는 파일·폴더는 있다고 보고, 추적하지 않는 경로는 없다고 본다", async () => {
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:fs")>()),
      existsSync: () => false,
    }));
    const { repoPathExists } = await import("./engineering-repo-paths-test-kit");
    // 부분 체크아웃에서 실제로 빠지는 폴더와 같은 종류의 경로(이 저장소가 추적하는 파일)
    expect(repoPathExists("package.json")).toBe(true);
    expect(repoPathExists("apps/web/src/domains/legal/technology")).toBe(true);
    expect(repoPathExists("apps/web/src/domains/legal/technology/")).toBe(true);
    expect(repoPathExists("no/such/file.ts")).toBe(false);
    expect(repoPathExists("apps/web/src/domains/legal/technology/no-such-file.ts")).toBe(false);
  });
});
