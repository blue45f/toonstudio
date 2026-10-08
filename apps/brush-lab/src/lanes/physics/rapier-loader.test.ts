import { afterEach, describe, expect, it } from "vitest";

import { LaneUnavailableError } from "../../engine/core/errors";

import { loadRapier, RAPIER_PACKAGE, resetRapierLoaderCache } from "./rapier-loader";

import type { RapierImporter } from "./rapier-loader";

afterEach(() => {
  resetRapierLoaderCache();
});

/** 실제 모듈 모양을 흉내 낸 스텁(init만 시험 대상). */
function stubModule(init: () => Promise<void>): { default: unknown } {
  return {
    default: {
      init,
      World: class {},
      RigidBodyDesc: class {},
      ColliderDesc: class {},
      JointData: class {},
    },
  };
}

async function failureOf(importer: RapierImporter): Promise<LaneUnavailableError> {
  try {
    await loadRapier(importer);
  } catch (error) {
    expect(error).toBeInstanceOf(LaneUnavailableError);
    return error as LaneUnavailableError;
  }
  throw new Error("로드가 실패해야 한다");
}

describe("rapier-loader: 실패 경로는 사유 코드 + 한글 문구로 드러난다(자체 PBD로 바꾸지 않는다)", () => {
  it("import가 거부되면 wasm-artifact-missing(stage import)이고 원인 문구를 담는다", async () => {
    const error = await failureOf(async () => {
      throw new Error("네트워크 오류 시험");
    });
    expect(error.code).toBe("wasm-artifact-missing");
    expect(error.message).toContain("불러오지 못했다");
    expect(error.message).toContain("네트워크 오류 시험");
    expect(error.details).toMatchObject({ laneId: "bristle-rapier", package: RAPIER_PACKAGE, stage: "import", cause: "네트워크 오류 시험" });
  });

  it("RAPIER.init()가 실패하면 wasm-artifact-missing(stage init)이다", async () => {
    const error = await failureOf(async () =>
      stubModule(async () => {
        throw new Error("wasm 인스턴스화 실패 시험");
      }),
    );
    expect(error.code).toBe("wasm-artifact-missing");
    expect(error.message).toContain("RAPIER.init");
    expect(error.details).toMatchObject({ stage: "init" });
  });

  it("모듈 모양이 예상과 다르면 wasm-integrity-mismatch(stage shape)이다", async () => {
    const empty = await failureOf(async () => ({}));
    expect(empty.code).toBe("wasm-integrity-mismatch");
    expect(empty.details).toMatchObject({ stage: "shape" });
    const partial = await failureOf(async () => ({ default: { init: async () => undefined } }));
    expect(partial.code).toBe("wasm-integrity-mismatch");
    expect(partial.message).toContain("모양이 예상과 다르다");
  });

  it("WebAssembly가 없는 환경은 feature-missing(stage wasm-support)이다", async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "WebAssembly");
    Object.defineProperty(globalThis, "WebAssembly", { value: undefined, configurable: true, writable: true });
    try {
      const error = await failureOf(async () => stubModule(async () => undefined));
      expect(error.code).toBe("feature-missing");
      expect(error.details).toMatchObject({ stage: "wasm-support" });
    } finally {
      if (desc) Object.defineProperty(globalThis, "WebAssembly", desc);
    }
  });

  it("주입한 임포터는 캐시하지 않고 매번 실행한다; 정상 스텁은 init을 한 번 부르고 모듈을 돌려준다", async () => {
    let inits = 0;
    const importer: RapierImporter = async () =>
      stubModule(async () => {
        inits += 1;
      });
    const a = await loadRapier(importer);
    const b = await loadRapier(importer);
    expect(inits).toBe(2);
    expect(typeof a.init).toBe("function");
    expect(b).not.toBe(undefined);
  });
});

describe("rapier-loader: 실제 Rapier(Node 22, wasm 내장 compat 빌드)", () => {
  it("기본 임포터로 동적 import·초기화에 성공하고 프로세스 안에서 캐시한다", async () => {
    const first = await loadRapier();
    expect(typeof first.World).toBe("function");
    expect(typeof first.JointData.spring).toBe("function");
    const second = await loadRapier();
    expect(second).toBe(first);
  });
});
