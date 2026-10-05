import { describe, expect, it } from "vitest";

import {
  buildFalLoraGenerationInput,
  buildFalLoraTrainingInput,
  generateStudioLoraImage,
  isStudioFalConfigured,
  loadStudioFalApiKey,
  parseFalLoraGenerationResult,
  parseFalLoraTrainingResult,
  parseFalQueueStatus,
  saveStudioFalApiKey,
  submitStudioLoraTraining,
  uploadStudioLoraFile,
  FAL_LORA_GENERATION_MODEL_ID,
  FAL_LORA_TRAINING_MODEL_ID,
  FAL_QUEUE_BASE_URL,
  type StudioFalKeyStorage,
  type StudioLoraFetch,
} from "./studio-lora-fal";

function memoryStorage(): StudioFalKeyStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface RecordedCall {
  readonly url: string;
  readonly init?: RequestInit;
}

function recordingFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetchImpl: StudioLoraFetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: StudioLoraFetch = async (input, init) => {
    calls.push({ url: input, init });
    return handler(input, init);
  };
  return { fetchImpl, calls };
}

describe("fal 키 보관", () => {
  it("저장→로드가 왕복되고 빈 값 저장은 키를 지운다", () => {
    const storage = memoryStorage();
    expect(loadStudioFalApiKey(storage)).toBe("");
    expect(isStudioFalConfigured("")).toBe(false);
    expect(saveStudioFalApiKey(storage, "  fal-key-1 ")).toBe(true);
    expect(loadStudioFalApiKey(storage)).toBe("fal-key-1");
    expect(isStudioFalConfigured(loadStudioFalApiKey(storage))).toBe(true);
    expect(saveStudioFalApiKey(storage, "")).toBe(true);
    expect(loadStudioFalApiKey(storage)).toBe("");
  });

  it("저장소가 없으면 로드는 빈 문자열, 저장은 실패로 드러난다", () => {
    expect(loadStudioFalApiKey(null)).toBe("");
    expect(saveStudioFalApiKey(null, "x")).toBe(false);
  });
});

describe("학습 입력 조립", () => {
  it("캐릭터 학습은 마스크 생성을 켜고, 화풍 학습은 끈다", () => {
    expect(
      buildFalLoraTrainingInput({ imagesDataUrl: "https://x/z.zip", triggerWord: "hero", isStyle: false }),
    ).toEqual({
      images_data_url: "https://x/z.zip",
      trigger_word: "hero",
      is_style: false,
      create_masks: true,
    });
    expect(
      buildFalLoraTrainingInput({ imagesDataUrl: "https://x/z.zip", triggerWord: "ink", isStyle: true, steps: 800.7 }),
    ).toEqual({
      images_data_url: "https://x/z.zip",
      trigger_word: "ink",
      is_style: true,
      create_masks: false,
      steps: 800,
    });
  });
});

describe("학습 잡 제출", () => {
  it("키가 없으면 fetch를 아예 호출하지 않는다", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse(200, {}));
    const result = await submitStudioLoraTraining({ fetchImpl }, "", {
      imagesDataUrl: "https://x/z.zip",
      triggerWord: "hero",
      isStyle: false,
    });
    expect(result).toEqual({
      ok: false,
      code: "not_configured",
      error: "fal.ai 키가 등록되어 있지 않습니다.",
    });
    expect(calls).toHaveLength(0);
  });

  it("큐 제출 계약 — URL·인증 헤더·본문이 fal 문서와 일치한다", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse(200, {
        request_id: "req-1",
        status_url: "https://queue.fal.run/status/req-1",
        response_url: "https://queue.fal.run/response/req-1",
      }),
    );
    const result = await submitStudioLoraTraining({ fetchImpl }, "fal-secret", {
      imagesDataUrl: "https://cdn.example/set.zip",
      triggerWord: "hero",
      isStyle: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requestId).toBe("req-1");
      expect(result.data.statusUrl).toBe("https://queue.fal.run/status/req-1");
    }
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe(`${FAL_QUEUE_BASE_URL}/${FAL_LORA_TRAINING_MODEL_ID}`);
    const headers = new Headers(call?.init?.headers);
    expect(headers.get("Authorization")).toBe("Key fal-secret");
    const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
    expect(body["images_data_url"]).toBe("https://cdn.example/set.zip");
    expect(body["trigger_word"]).toBe("hero");
    // 키 원문이 본문에 섞이지 않는다.
    expect(String(call?.init?.body)).not.toContain("fal-secret");
  });

  it("거부 응답은 provider_error로 사유만 전한다", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse(401, { detail: "Invalid API key" }));
    const result = await submitStudioLoraTraining({ fetchImpl }, "bad-key", {
      imagesDataUrl: "https://x/z.zip",
      triggerWord: "hero",
      isStyle: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("provider_error");
      expect(result.error).toContain("Invalid API key");
      expect(result.error).not.toContain("bad-key");
    }
  });
});

describe("스토리지 업로드", () => {
  it("initiate → PUT 순서로 올리고 file_url을 돌려준다(PUT에는 인증 헤더가 없다)", async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      if (url.includes("/storage/upload/initiate")) {
        return jsonResponse(200, {
          file_url: "https://v3b.fal.media/files/set.zip",
          upload_url: "https://v3b.fal.media/upload?signature=abc",
        });
      }
      return new Response(null, { status: 200 });
    });
    const result = await uploadStudioLoraFile({ fetchImpl }, "fal-secret", {
      name: "set.zip",
      contentType: "application/zip",
      body: new Blob([new Uint8Array([1, 2, 3])], { type: "application/zip" }),
    });
    expect(result).toEqual({ ok: true, data: { fileUrl: "https://v3b.fal.media/files/set.zip" } });
    expect(calls).toHaveLength(2);
    const put = calls[1];
    expect(put?.init?.method).toBe("PUT");
    const putHeaders = new Headers(put?.init?.headers);
    expect(putHeaders.get("Authorization")).toBeNull();
    expect(putHeaders.get("Content-Type")).toBe("application/zip");
  });
});

describe("응답 파싱", () => {
  it("큐 상태는 문서화된 3종만 인정한다", () => {
    expect(parseFalQueueStatus({ status: "IN_QUEUE" })).toBe("IN_QUEUE");
    expect(parseFalQueueStatus({ status: "IN_PROGRESS" })).toBe("IN_PROGRESS");
    expect(parseFalQueueStatus({ status: "COMPLETED" })).toBe("COMPLETED");
    expect(parseFalQueueStatus({ status: "FAILED" })).toBeNull();
    expect(parseFalQueueStatus({})).toBeNull();
    expect(parseFalQueueStatus(null)).toBeNull();
  });

  it("학습 결과는 diffusers_lora_file.url을 뽑는다", () => {
    expect(
      parseFalLoraTrainingResult({
        diffusers_lora_file: { url: "https://cdn/lora.safetensors" },
        config_file: { url: "https://cdn/config.json" },
      }),
    ).toEqual({ loraFileUrl: "https://cdn/lora.safetensors", configFileUrl: "https://cdn/config.json" });
    expect(parseFalLoraTrainingResult({ diffusers_lora_file: {} })).toBeNull();
    expect(parseFalLoraTrainingResult({ error: "boom" })).toBeNull();
  });

  it("생성 결과는 첫 이미지와 seed를 뽑는다", () => {
    expect(
      parseFalLoraGenerationResult({
        images: [{ url: "https://cdn/out.png", width: 832, height: 1216 }],
        seed: 42,
      }),
    ).toEqual({ imageUrl: "https://cdn/out.png", width: 832, height: 1216, seed: 42 });
    expect(parseFalLoraGenerationResult({ images: [] })).toBeNull();
  });

  it("생성 입력은 loras 배열에 학습 파일을 건다", () => {
    expect(buildFalLoraGenerationInput({ prompt: "hero, smiling", loraFileUrl: "https://cdn/lora" })).toEqual({
      prompt: "hero, smiling",
      loras: [{ path: "https://cdn/lora", scale: 1 }],
      output_format: "png",
      num_images: 1,
    });
  });
});

describe("학습 모델 생성(큐 폴링)", () => {
  it("제출 → 진행 중 → 완료 → 결과 수신까지 실제 응답 순서대로 동작한다", async () => {
    let statusCalls = 0;
    const { fetchImpl, calls } = recordingFetch((url) => {
      if (url.endsWith(`/${FAL_LORA_GENERATION_MODEL_ID}`)) {
        return jsonResponse(200, { request_id: "gen-1", status_url: null, response_url: null });
      }
      if (url.endsWith("/status")) {
        statusCalls += 1;
        return jsonResponse(200, { status: statusCalls < 2 ? "IN_PROGRESS" : "COMPLETED" });
      }
      return jsonResponse(200, {
        images: [{ url: "https://cdn/gen.png", width: 1024, height: 1024 }],
        seed: 7,
      });
    });
    const result = await generateStudioLoraImage(
      { fetchImpl, sleep: () => Promise.resolve() },
      "fal-secret",
      { prompt: "hero, 우산을 쓴 모습", loraFileUrl: "https://cdn/lora.safetensors" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.imageUrl).toBe("https://cdn/gen.png");
      expect(result.data.seed).toBe(7);
    }
    // 제출 본문에 loras가 실렸는지 확인한다.
    const submitBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(submitBody["loras"]).toEqual([{ path: "https://cdn/lora.safetensors", scale: 1 }]);
  });

  it("프롬프트가 비면 제출하지 않는다", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse(200, {}));
    const result = await generateStudioLoraImage({ fetchImpl }, "fal-secret", {
      prompt: "  ",
      loraFileUrl: "https://cdn/lora",
    });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("폴링 한도를 넘기면 실패로 단정하지 않고 처리 중일 수 있음을 알린다", async () => {
    const { fetchImpl } = recordingFetch((url) => {
      if (url.endsWith("/status")) return jsonResponse(200, { status: "IN_PROGRESS" });
      return jsonResponse(200, { request_id: "gen-2", status_url: null, response_url: null });
    });
    const result = await generateStudioLoraImage(
      { fetchImpl, sleep: () => Promise.resolve() },
      "fal-secret",
      { prompt: "hero", loraFileUrl: "https://cdn/lora" },
      { maxPollAttempts: 3 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("계속 처리될 수 있습니다");
    }
  });
});
