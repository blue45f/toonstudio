// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

// 실제 런타임이 openskp 를 동적 import 로 불러올 때의 실패 경로를 증명한다. 성공 경로(실제 모듈을 한 번만 불러와
// 재사용)는 studio-bg3d-skp-converter.test.ts 가 실제 openskp 로 다룬다.

/** 모듈 레지스트리를 비운 뒤 런타임과 계약을 같은 레지스트리에서 불러와 오류 클래스 판정(instanceof)이 맞게 한다. */
async function freshModules() {
  vi.resetModules();
  const contract = await import("./studio-bg3d-skp-contract");
  const runtime = await import("./studio-bg3d-skp-worker-runtime");
  return { contract, runtime };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

afterEach(() => {
  vi.doUnmock("openskp");
});

describe("loadStudioBg3dOpenSkpModule", () => {
  it("fails honestly with converter-unavailable, keeping the cause, when the openskp chunk cannot be loaded", async () => {
    vi.doMock("openskp", () => {
      throw new Error("chunk 404");
    });
    const { contract, runtime } = await freshModules();
    const error = await rejectionOf(runtime.loadStudioBg3dOpenSkpModule());
    expect(error).toBeInstanceOf(contract.StudioBg3dSkpConverterUnavailableError);
    if (!(error instanceof contract.StudioBg3dSkpConverterUnavailableError)) return;
    expect(error.code).toBe("skp-converter-unavailable");
    expect(error.reason).toBe("loader-failed");
    expect(error.cause).toBeDefined();
  });

  it("rejects a module that does not expose the conversion API instead of trusting the import", async () => {
    // vitest 의 모듈 모의는 정의하지 않은 export 를 읽으면 던지므로, 있어야 할 이름을 함수가 아닌 값으로 둔다.
    vi.doMock("openskp", () => ({ buildScene: () => ({}), toGLB: "not a function", parseSkp: () => ({}) }));
    const { contract, runtime } = await freshModules();
    const error = await rejectionOf(runtime.loadStudioBg3dOpenSkpModule());
    expect(error).toBeInstanceOf(contract.StudioBg3dSkpConverterUnavailableError);
    if (!(error instanceof contract.StudioBg3dSkpConverterUnavailableError)) return;
    expect(error.reason).toBe("converter-api-mismatch");
  });

  it("does not cache a failed load, so the next request tries again", async () => {
    let attempts = 0;
    vi.doMock("openskp", () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network down");
      return { buildScene: () => ({}), toGLB: () => new Uint8Array(0), parseSkp: () => ({}) };
    });
    const { runtime } = await freshModules();
    await expect(runtime.loadStudioBg3dOpenSkpModule()).rejects.toThrow();
    const loaded = await runtime.loadStudioBg3dOpenSkpModule();
    expect(typeof loaded.buildScene).toBe("function");
    expect(attempts).toBe(2);
    // 성공한 로드는 다시 부르지 않고 재사용한다.
    expect(await runtime.loadStudioBg3dOpenSkpModule()).toBe(loaded);
    expect(attempts).toBe(2);
  });
});
