import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { colorizeLineArt, generateBackgroundImage } from "./studio-ai-client";
import { repairStudioAiComicImageRegion } from "./studio-ai-comic-director-media";
import { loadStudioAiSettings, STUDIO_AI_DEFAULT_SETTINGS } from "./studio-ai-settings";

// 1024×1024 단색 PNG. 공급자 응답 대신 같은 바이트를 매번 돌려준다.
const png = "iVBORw0KGgoAAAANSUhEUgAABAAAAAQAAQAAAABXZhYuAAAAlklEQVR42u3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADvBgQeAAEN3jhkAAAAAElFTkSuQmCC";
const dataUrl = `data:image/png;base64,${png}`;
const prompt = "흰 바탕 한가운데 검은 원 하나를 그려 주세요.";
const settings = { ...STUDIO_AI_DEFAULT_SETTINGS, apiKey: "unit-test" };

function mockImageApi() {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    Response.json({ created: 1, data: [{ b64_json: png }] }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("Studio OpenAI 이미지 BYOK", () => {
  it.each(["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"])("%s 정사각 PNG 한 장의 요청과 응답", async (model) => {
    const fetch = mockImageApi();
    const result = await generateBackgroundImage({ ...settings, imageModel: model }, prompt, {
      size: "1024x1024", quality: "low",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      model, prompt, n: 1, quality: "low", size: "1024x1024", output_format: "png",
    });
    expect(result).toEqual({ ok: true, data: { dataUrl, width: 1024, height: 1024, model } });
    if (result.ok) {
      const bytes = Buffer.from(result.data.dataUrl.slice("data:image/png;base64,".length), "base64");
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1024, 1024]);
    }
  });

  it.each(["dall-e-3", "gpt-image-1.5", "gpt-image-1.5-2025-12-16", "custom-image"])("저장된 모델 %s 유지", (model) => {
    const storage = { getItem: () => JSON.stringify({ imageModel: model }), setItem: vi.fn() };
    expect(loadStudioAiSettings(storage).imageModel).toBe(model);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("모델 설정이 비어 있을 때 Flare 선택", () => {
    expect(loadStudioAiSettings(null).imageModel).toBe("gpt-image-2.6-flare");
    expect(loadStudioAiSettings({ getItem: () => "{}", setItem: vi.fn() }).imageModel).toBe("gpt-image-2.6-flare");
  });

  it("호환 게이트웨이로 GPT Image 생성 요청을 보낼 때 두 형식 필드를 생략한다", async () => {
    const fetch = mockImageApi();
    const baseUrl = "https://image-provider.test/v1";
    const imageModel = "openai/gpt-image-2.6-flare";
    const result = await generateBackgroundImage({ ...settings, baseUrl, imageModel }, prompt, {
      size: "1024x1792", quality: "low",
    });
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${baseUrl}/images/generations`);
    expect(JSON.parse(String(init?.body))).toEqual({
      model: imageModel, prompt, n: 1, quality: "low", size: "1024x1536",
    });
  });

  it("타사 자체 이미지 모델의 기존 응답 형식과 출력 크기를 유지한다", async () => {
    const fetch = mockImageApi();
    const baseUrl = "https://image-provider.test/v1";
    const imageModel = "provider-native-image";
    const result = await generateBackgroundImage({ ...settings, baseUrl, imageModel }, prompt, {
      size: "1024x1792", quality: "low",
    });
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(baseUrl + "/images/generations");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: imageModel, prompt, n: 1, quality: "low", size: "1024x1792", response_format: "b64_json",
    });
  });

  it("모델을 찾을 수 없으면 재시도 없이 404 오류를 반환", async () => {
    const fetch = mockImageApi().mockResolvedValue(Response.json({
      error: { message: "model_not_found" },
    }, { status: 404 }));
    const result = await generateBackgroundImage(settings, prompt, { quality: "low" });
    expect(result).toMatchObject({ ok: false, code: "http_error", error: expect.stringContaining("model_not_found") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe.each([
    {
      provider: "공식 OpenAI",
      baseUrl: settings.baseUrl,
      imageModel: settings.imageModel,
      outputFormat: "png",
      responseFormat: null,
    },
    {
      provider: "GPT Image 호환 게이트웨이",
      baseUrl: "https://image-provider.test/v1",
      imageModel: "chatgpt-image-latest",
      outputFormat: null,
      responseFormat: null,
    },
    {
      provider: "타사 자체 이미지 모델",
      baseUrl: "https://image-provider.test/v1",
      imageModel: "provider-native-image",
      outputFormat: null,
      responseFormat: "b64_json",
    },
  ])("$provider", ({ baseUrl, imageModel, outputFormat, responseFormat }) => {
    it.each(["colorize", "repair"])("%s 편집에 제공자별 multipart 형식을 적용한다", async (operation) => {
      const fetch = mockImageApi();
      const providerSettings = { ...settings, baseUrl, imageModel };
      const result = operation === "colorize"
        ? await colorizeLineArt(providerSettings, dataUrl, prompt)
        : await repairStudioAiComicImageRegion({
          settings: providerSettings, sourceImageDataUrl: dataUrl, maskDataUrl: dataUrl, prompt, target: "hands", parentCandidateId: "panel",
        });
      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0] ?? [];
      expect(url).toBe(baseUrl + "/images/edits");
      const form = init?.body;
      expect(form).toBeInstanceOf(FormData);
      if (form instanceof FormData) {
        expect(form.get("model")).toBe(imageModel);
        expect(form.get("output_format")).toBe(outputFormat);
        expect(form.get("response_format")).toBe(responseFormat);
        expect(form.has("quality")).toBe(false);
      }
    });
  });
});
