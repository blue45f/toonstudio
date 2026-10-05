import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RESEARCH_MT_MODEL_ID,
  RESEARCH_MT_MODEL_TOTAL_BYTES,
  configureResearchMtLocalModelPath,
  loadOpusMtTranslator,
  resetResearchMtForTests,
  subscribeResearchMtProgress,
} from "./research-query-mt";

import type { ResearchMtProgress } from "./research-query-mt";

interface FakeEnv {
  localModelPath?: string;
  allowLocalModels?: boolean;
  allowRemoteModels?: boolean;
}

function fakeModule(options: {
  translated?: string;
  env?: FakeEnv;
  onPipeline?: (task: string, model: string, opts?: Record<string, unknown>) => void;
}) {
  const env: FakeEnv = options.env ?? {};
  return {
    env,
    pipeline: vi.fn(async (task: string, model: string, opts?: Record<string, unknown>) => {
      options.onPipeline?.(task, model, opts);
      const callback = opts?.progress_callback as
        | ((event: Record<string, unknown>) => void)
        | undefined;
      callback?.({
        status: "progress",
        file: "onnx/decoder_model_merged_quantized.onnx",
        loaded: 30,
        total: 60,
        progress: 50,
      });
      return async () => [{ translation_text: options.translated ?? "deep forest" }];
    }),
  };
}

afterEach(() => {
  resetResearchMtForTests();
});

describe("loadOpusMtTranslator", () => {
  it("자체 호스팅 경로와 원격 차단 env를 설정하고 translation pipeline을 만든다", async () => {
    const mod = fakeModule({});
    const translator = await loadOpusMtTranslator(async () => mod);
    expect(translator).not.toBeNull();
    expect(mod.pipeline).toHaveBeenCalledTimes(1);
    const [task, model, opts] = mod.pipeline.mock.calls[0] ?? [];
    expect(task).toBe("translation");
    expect(model).toBe(RESEARCH_MT_MODEL_ID);
    expect(opts?.dtype).toBe("q8");
    expect(mod.env.localModelPath).toBe("/models/");
    expect(mod.env.allowLocalModels).toBe(true);
    // 운영 CSP 경계 — 외부 origin 모델 다운로드는 끈다.
    expect(mod.env.allowRemoteModels).toBe(false);
  });

  it("configure로 지정한 자체 호스팅 경로를 우선한다", async () => {
    configureResearchMtLocalModelPath("/static/models/");
    const mod = fakeModule({});
    await loadOpusMtTranslator(async () => mod);
    expect(mod.env.localModelPath).toBe("/static/models/");
  });

  it("번역 출력의 translation_text만 뽑고, 진행률을 구독자에게 전한다", async () => {
    const seen: ResearchMtProgress[] = [];
    const unsubscribe = subscribeResearchMtProgress((progress) => seen.push(progress));
    const mod = fakeModule({ translated: "quiet lakeside cabin" });
    const translator = await loadOpusMtTranslator(async () => mod);
    expect(await translator?.("조용한 호숫가 오두막")).toBe("quiet lakeside cabin");
    expect(seen).toEqual([
      {
        file: "onnx/decoder_model_merged_quantized.onnx",
        loadedBytes: 30,
        totalBytes: 60,
        ratio: 0.5,
      },
    ]);
    unsubscribe();
  });

  it("모듈 로드 실패는 null로 귀결되고 던지지 않는다", async () => {
    const translator = await loadOpusMtTranslator(async () => null);
    expect(translator).toBeNull();
  });

  it("pipeline 생성이 던져도 null로 귀결된다", async () => {
    const mod = {
      env: {},
      pipeline: vi.fn(async () => {
        throw new Error("모델 파일이 자체 호스팅 경로에 없음");
      }),
    };
    const translator = await loadOpusMtTranslator(async () => mod);
    expect(translator).toBeNull();
  });

  it("세션 내 1회만 시도하고 결과를 캐시한다", async () => {
    const mod = fakeModule({});
    const importer = vi.fn(async () => mod);
    await loadOpusMtTranslator(importer);
    await loadOpusMtTranslator(importer);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("모델 총량 상수는 자체 호스팅 필수 파일 합계(약 123MB)를 반영한다", () => {
    expect(RESEARCH_MT_MODEL_TOTAL_BYTES).toBeGreaterThan(120_000_000);
    expect(RESEARCH_MT_MODEL_TOTAL_BYTES).toBeLessThan(126_000_000);
  });
});
