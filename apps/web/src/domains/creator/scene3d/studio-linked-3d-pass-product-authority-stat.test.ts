import { afterEach, describe, expect, it, vi } from "vitest";

import { acquireStudioLinked3dPassProductAuthority } from "../studio-linked-3d-pass-product-authority";

// Node에서는 파일 시스템만 대체하고 제품 authority와 실제 CAS 저장·stat 구현은 함께 실행한다.
vi.mock("../studio-opfs-filesystem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../studio-opfs-filesystem")>();
  return { ...actual, createStudioOpfsNativeFileSystem: () => ({ ...actual.createStudioOpfsMemoryFileSystem(), kind: "opfs" }) };
});

afterEach(() => vi.unstubAllGlobals());

describe("연결형 3D 제품 CAS의 프로젝트 export stat 계약", () => {
  it("제품 authority가 저장한 PNG의 실제 CAS stat과 검증 읽기를 노출한다", async () => {
    vi.stubGlobal("navigator", {
      locks: { request: async (_name: string, _options: unknown, task: () => Promise<unknown>) => task() },
      storage: { getDirectory: vi.fn() },
    });
    const authority = await acquireStudioLinked3dPassProductAuthority();
    const bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
    const put = await authority.put(bytes, { mime: "image/png" });
    expect(await authority.stat(put.ref.hash)).toMatchObject({ hash: put.ref.hash, bytes: bytes.length, mime: "image/png" });
    expect(await authority.get(put.ref.hash, { verify: true })).toEqual(bytes);
    expect(await authority.stat(`sha256:${"0".repeat(64)}`)).toBeNull();
  });
});
