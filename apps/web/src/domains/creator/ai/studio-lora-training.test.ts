import { describe, expect, it } from "vitest";

import type { StudioLoraFetch } from "./studio-lora-fal";
import {
  buildStudioLoraGenerationPrompt,
  createStudioLoraArchive,
  createStudioLoraJobRecord,
  findCompletedStudioLoraJob,
  loadStudioLoraJobs,
  refreshStudioLoraJob,
  removeStudioLoraJob,
  saveStudioLoraJobs,
  studioLoraArchiveEntryFromDataUrl,
  studioLoraCharacterIdFromLabel,
  studioLoraCrc32,
  suggestStudioLoraTriggerWord,
  upsertStudioLoraJob,
  type StudioLoraJobStorage,
  type StudioLoraTrainingJob,
} from "./studio-lora-training";

const FIXED_NOW = () => Date.parse("2026-10-06T00:00:00.000Z");
const FIXED_ISO = "2026-10-06T00:00:00.000Z";

function memoryStorage(): StudioLoraJobStorage & { map: Map<string, string> } {
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

function baseJob(patch: Partial<StudioLoraTrainingJob> = {}): StudioLoraTrainingJob {
  return {
    ...createStudioLoraJobRecord({
      id: "job-1",
      characterLabel: "주인공",
      triggerWord: "toonchar",
      kind: "character",
      providerRequestId: "req-1",
      statusUrl: null,
      responseUrl: null,
      trainingImageCount: 6,
      nowIso: FIXED_ISO,
    }),
    ...patch,
  };
}

function routingFetch(routes: {
  status: () => Response;
  result?: () => Response;
}): { fetchImpl: StudioLoraFetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: StudioLoraFetch = async (input) => {
    urls.push(input);
    if (input.endsWith("/status")) return routes.status();
    return (routes.result ?? (() => jsonResponse(200, {})))();
  };
  return { fetchImpl, urls };
}

describe("식별자·트리거 제안", () => {
  it("라틴 이름은 슬러그로, 한글 이름은 기본값을 쓴다", () => {
    expect(studioLoraCharacterIdFromLabel("Hero Nine")).toBe("lora-hero-nine");
    expect(studioLoraCharacterIdFromLabel("주인공")).toBe("lora-character");
    expect(suggestStudioLoraTriggerWord("HeroNine")).toBe("HeroNine");
    expect(suggestStudioLoraTriggerWord("주인공")).toBe("toonchar");
  });

  it("생성 프롬프트에 트리거 워드를 한 번만 붙인다", () => {
    const job = baseJob();
    expect(buildStudioLoraGenerationPrompt(job, "비 오는 골목")).toBe("toonchar, 비 오는 골목");
    expect(buildStudioLoraGenerationPrompt(job, "toonchar, 웃는 모습")).toBe("toonchar, 웃는 모습");
    expect(buildStudioLoraGenerationPrompt(job, "  ")).toBe("");
  });
});

describe("학습 아카이브(zip)", () => {
  it("CRC32는 알려진 검증 벡터와 일치한다", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(studioLoraCrc32(bytes)).toBe(0xcbf43926);
  });

  it("STORE zip을 만들면 로컬 헤더와 EOCD로 항목을 되읽을 수 있다", () => {
    const first = new TextEncoder().encode("hello");
    const second = new Uint8Array([0, 1, 2, 3, 255]);
    const zip = createStudioLoraArchive([
      { name: "image-01.png", data: first },
      { name: "image-02.png", data: second },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // 첫 로컬 헤더
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // STORE
    const nameLength = view.getUint16(26, true);
    const name = new TextDecoder().decode(zip.slice(30, 30 + nameLength));
    expect(name).toBe("image-01.png");
    const dataStart = 30 + nameLength;
    expect(zip.slice(dataStart, dataStart + first.length)).toEqual(first);
    // EOCD는 끝에서 22바이트
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    const centralOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });

  it("data URL 이미지만 아카이브 항목으로 바꾼다", () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    let binary = "";
    for (const byte of pngBytes) binary += String.fromCharCode(byte);
    const entry = studioLoraArchiveEntryFromDataUrl(
      `data:image/png;base64,${btoa(binary)}`,
      0,
    );
    expect(entry?.name).toBe("image-01.png");
    expect(entry?.data).toEqual(pngBytes);
    expect(studioLoraArchiveEntryFromDataUrl("data:image/gif;base64,AAAA", 0)).toBeNull();
    expect(studioLoraArchiveEntryFromDataUrl("https://example.com/a.png", 0)).toBeNull();
  });
});

describe("잡 저장소", () => {
  it("저장→로드 왕복, 손상 항목은 버려진다", () => {
    const storage = memoryStorage();
    const job = baseJob();
    expect(saveStudioLoraJobs(storage, [job])).toBe(true);
    expect(loadStudioLoraJobs(storage)).toEqual([job]);

    storage.map.set(
      "toonstudio-studio-lora-jobs-v1",
      JSON.stringify([job, { id: 42 }, null, "junk"]),
    );
    expect(loadStudioLoraJobs(storage)).toEqual([job]);

    storage.map.set("toonstudio-studio-lora-jobs-v1", "{broken");
    expect(loadStudioLoraJobs(storage)).toEqual([]);
  });

  it("upsert/remove와 완료 모델 조회가 동작한다", () => {
    const queued = baseJob();
    const completed = baseJob({
      id: "job-2",
      status: "completed",
      loraFileUrl: "https://cdn/lora.safetensors",
      updatedAt: "2026-10-06T01:00:00.000Z",
    });
    let jobs = upsertStudioLoraJob([], queued);
    jobs = upsertStudioLoraJob(jobs, completed);
    expect(jobs).toHaveLength(2);
    const refreshed = upsertStudioLoraJob(jobs, { ...queued, status: "training" });
    expect(refreshed.find((job) => job.id === "job-1")?.status).toBe("training");
    expect(findCompletedStudioLoraJob(jobs, queued.characterId)?.id).toBe("job-2");
    expect(findCompletedStudioLoraJob(jobs, "lora-nobody")).toBeNull();
    expect(removeStudioLoraJob(jobs, "job-2")).toHaveLength(1);
  });
});

describe("잡 상태 새로고침 전이", () => {
  it("종료 상태 잡은 조회하지 않는다", async () => {
    const { fetchImpl, urls } = routingFetch({ status: () => jsonResponse(200, { status: "IN_QUEUE" }) });
    const completed = baseJob({ status: "completed", loraFileUrl: "https://cdn/lora" });
    const outcome = await refreshStudioLoraJob({ fetchImpl, now: FIXED_NOW }, "key", completed);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.queried).toBe(false);
      expect(outcome.data.job).toBe(completed);
    }
    expect(urls).toHaveLength(0);
  });

  it("IN_QUEUE → queued, IN_PROGRESS → training으로 전이한다", async () => {
    const queuedFetch = routingFetch({ status: () => jsonResponse(200, { status: "IN_QUEUE" }) });
    const queuedOutcome = await refreshStudioLoraJob(
      { fetchImpl: queuedFetch.fetchImpl, now: FIXED_NOW },
      "key",
      baseJob({ status: "training" }),
    );
    expect(queuedOutcome.ok && queuedOutcome.data.job.status).toBe("queued");

    const progressFetch = routingFetch({ status: () => jsonResponse(200, { status: "IN_PROGRESS" }) });
    const progressOutcome = await refreshStudioLoraJob(
      { fetchImpl: progressFetch.fetchImpl, now: FIXED_NOW },
      "key",
      baseJob(),
    );
    expect(progressOutcome.ok && progressOutcome.data.job.status).toBe("training");
    expect(progressOutcome.ok && progressOutcome.data.job.lastError).toBeNull();
  });

  it("COMPLETED + 결과에 LoRA 파일이 있으면 completed로 전이하고 모델을 연결한다", async () => {
    const { fetchImpl, urls } = routingFetch({
      status: () => jsonResponse(200, { status: "COMPLETED" }),
      result: () =>
        jsonResponse(200, {
          diffusers_lora_file: { url: "https://cdn/lora.safetensors" },
          config_file: { url: "https://cdn/config.json" },
        }),
    });
    const outcome = await refreshStudioLoraJob({ fetchImpl, now: FIXED_NOW }, "key", baseJob());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.job.status).toBe("completed");
      expect(outcome.data.job.loraFileUrl).toBe("https://cdn/lora.safetensors");
      expect(outcome.data.job.configFileUrl).toBe("https://cdn/config.json");
    }
    expect(urls.some((url) => url.endsWith("/status"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/req-1"))).toBe(true);
  });

  it("COMPLETED인데 결과가 오류면 failed로 전이한다", async () => {
    const httpError = routingFetch({
      status: () => jsonResponse(200, { status: "COMPLETED" }),
      result: () => jsonResponse(500, { detail: "training crashed" }),
    });
    const failedOutcome = await refreshStudioLoraJob(
      { fetchImpl: httpError.fetchImpl, now: FIXED_NOW },
      "key",
      baseJob(),
    );
    expect(failedOutcome.ok && failedOutcome.data.job.status).toBe("failed");

    const noFile = routingFetch({
      status: () => jsonResponse(200, { status: "COMPLETED" }),
      result: () => jsonResponse(200, { seed: 1 }),
    });
    const noFileOutcome = await refreshStudioLoraJob(
      { fetchImpl: noFile.fetchImpl, now: FIXED_NOW },
      "key",
      baseJob(),
    );
    expect(noFileOutcome.ok && noFileOutcome.data.job.status).toBe("failed");
  });

  it("상태 조회 404는 failed, 5xx와 미지 상태는 상태를 유지한다", async () => {
    const notFound = routingFetch({ status: () => jsonResponse(404, {}) });
    const notFoundOutcome = await refreshStudioLoraJob(
      { fetchImpl: notFound.fetchImpl, now: FIXED_NOW },
      "key",
      baseJob(),
    );
    expect(notFoundOutcome.ok && notFoundOutcome.data.job.status).toBe("failed");

    const serverError = routingFetch({ status: () => jsonResponse(503, {}) });
    const serverOutcome = await refreshStudioLoraJob(
      { fetchImpl: serverError.fetchImpl, now: FIXED_NOW },
      "key",
      baseJob(),
    );
    expect(serverOutcome.ok && serverOutcome.data.job.status).toBe("queued");
    expect(serverOutcome.ok && serverOutcome.data.job.lastError).toContain("503");

    const unknown = routingFetch({ status: () => jsonResponse(200, { status: "SOMETHING_ELSE" }) });
    const unknownOutcome = await refreshStudioLoraJob(
      { fetchImpl: unknown.fetchImpl, now: FIXED_NOW },
      "key",
      baseJob(),
    );
    expect(unknownOutcome.ok && unknownOutcome.data.job.status).toBe("queued");
    expect(unknownOutcome.ok && unknownOutcome.data.job.lastError).toContain("알 수 없는");
  });

  it("키가 없으면 잡을 바꾸지 않고 오류를 돌려준다", async () => {
    const { fetchImpl, urls } = routingFetch({ status: () => jsonResponse(200, { status: "IN_QUEUE" }) });
    const outcome = await refreshStudioLoraJob({ fetchImpl, now: FIXED_NOW }, "", baseJob());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("not_configured");
    expect(urls).toHaveLength(0);
  });
});
