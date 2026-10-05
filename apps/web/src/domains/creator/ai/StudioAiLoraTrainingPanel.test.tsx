// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  browserStudioFalSessionStorage,
  saveStudioFalApiKey,
  type StudioLoraFetch,
} from "./studio-lora-fal";
import {
  browserStudioLoraJobStorage,
  createStudioLoraJobRecord,
  saveStudioLoraJobs,
  type StudioLoraTrainingJob,
} from "./studio-lora-training";
import { StudioAiLoraTrainingPanel } from "./StudioAiLoraTrainingPanel";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function seedKey() {
  const storage = browserStudioFalSessionStorage();
  if (storage) saveStudioFalApiKey(storage, "fal-test-key");
}

function seedCompletedJob(): StudioLoraTrainingJob {
  const job: StudioLoraTrainingJob = {
    ...createStudioLoraJobRecord({
      id: "lora-req-done",
      characterLabel: "주인공 하루",
      triggerWord: "haru",
      kind: "character",
      providerRequestId: "req-done",
      statusUrl: null,
      responseUrl: null,
      trainingImageCount: 6,
      nowIso: "2026-10-06T00:00:00.000Z",
    }),
    status: "completed",
    loraFileUrl: "https://cdn.example/haru.safetensors",
  };
  saveStudioLoraJobs(browserStudioLoraJobStorage(), [job]);
  return job;
}

function renderPanel(fetchImpl?: StudioLoraFetch, onInsertImage = vi.fn()) {
  return render(
    <MemoryRouter>
      <StudioAiLoraTrainingPanel
        selectedImageSrc={null}
        onInsertImage={onInsertImage}
        clientDeps={fetchImpl ? { fetchImpl, sleep: () => Promise.resolve() } : undefined}
      />
    </MemoryRouter>,
  );
}

describe("StudioAiLoraTrainingPanel", () => {
  afterEach(cleanup);
  beforeEach(() => {
    globalThis.sessionStorage?.clear();
    globalThis.localStorage?.clear();
  });

  it("키가 없으면 비활성 안내와 키 허브 링크만 보인다", () => {
    renderPanel();
    expect(screen.getByText(/fal\.ai 키가 없어 학습 기능이 꺼져 있습니다/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /fal\.ai 키 등록하기/ });
    expect(link.getAttribute("href")).toBe("/settings/api-keys");
    expect(screen.queryByRole("button", { name: /학습 시작/ })).toBeNull();
  });

  it("키가 있으면 학습 폼이 열리고 완료 모델이 없을 때 폴백 안내가 보인다", () => {
    seedKey();
    renderPanel();
    expect(screen.getByRole("button", { name: /학습 시작/ })).toBeTruthy();
    expect(screen.getByText(/아직 학습이 완료된 모델이 없습니다/)).toBeTruthy();
    expect(screen.getByText(/본인의 fal 계정에 학습 요금이 청구됩니다/)).toBeTruthy();
  });

  it("완료된 잡은 완료 배지와 함께 보이고, 학습 모델로 생성해 캔버스에 넣을 수 있다", async () => {
    seedKey();
    seedCompletedJob();
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchImpl: StudioLoraFetch = async (input) => {
      if (input === "https://cdn.example/gen.png") {
        return new Response(pngBytes, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      if (input.endsWith("/status")) return jsonResponse(200, { status: "COMPLETED" });
      if (input === "https://queue.fal.run/fal-ai/flux-lora") {
        return jsonResponse(200, { request_id: "gen-1", status_url: null, response_url: null });
      }
      return jsonResponse(200, {
        images: [{ url: "https://cdn.example/gen.png", width: 832, height: 1216 }],
        seed: 3,
      });
    };
    const onInsertImage = vi.fn();
    renderPanel(fetchImpl, onInsertImage);

    expect(screen.getByText("주인공 하루")).toBeTruthy();
    expect(screen.getByText("완료")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("만들 장면"), {
      target: { value: "비 오는 골목" },
    });
    fireEvent.click(screen.getByRole("button", { name: /학습 모델로 생성/ }));

    const preview = await screen.findByAltText("학습 모델 생성 결과");
    expect(preview.getAttribute("src")).toBe("https://cdn.example/gen.png");

    fireEvent.click(screen.getByRole("button", { name: "캔버스에 추가" }));
    await waitFor(() => expect(onInsertImage).toHaveBeenCalledTimes(1));
    const [dataUrl, width, height] = onInsertImage.mock.calls[0] as [string, number, number];
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(width).toBe(832);
    expect(height).toBe(1216);
  });

  it("학습 접수 흐름 — 이미지 4장 → 업로드→제출 뒤 잡 카드가 대기 중으로 뜬다(전부 목)", async () => {
    seedKey();
    const calls: string[] = [];
    const fetchImpl: StudioLoraFetch = async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${input}`);
      if (input.includes("/storage/upload/initiate")) {
        return jsonResponse(200, {
          file_url: "https://cdn.example/set.zip",
          upload_url: "https://cdn.example/upload?sig=1",
        });
      }
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      return jsonResponse(200, {
        request_id: "train-1",
        status_url: "https://queue.example/status/train-1",
        response_url: "https://queue.example/response/train-1",
      });
    };
    const pngDataUrl = (seed: number) => {
      const bytes = new Uint8Array([137, 80, 78, 71, seed, 2, 3, 4]);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:image/png;base64,${btoa(binary)}`;
    };
    const clientDeps = { fetchImpl, sleep: () => Promise.resolve() };
    const view = render(
      <MemoryRouter>
        <StudioAiLoraTrainingPanel
          selectedImageSrc={pngDataUrl(1)}
          onInsertImage={vi.fn()}
          clientDeps={clientDeps}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/캐릭터\(또는 화풍\) 이름/), {
      target: { value: "하루" },
    });
    for (const seed of [1, 2, 3, 4]) {
      view.rerender(
        <MemoryRouter>
          <StudioAiLoraTrainingPanel
            selectedImageSrc={pngDataUrl(seed)}
            onInsertImage={vi.fn()}
            clientDeps={clientDeps}
          />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByRole("button", { name: /선택한 이미지 담기/ }));
    }
    expect(screen.getByText(/학습 이미지 4장/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /학습 시작/ }));
    expect(await screen.findByText("대기 중")).toBeTruthy();
    expect(screen.getByText(/학습을 접수했습니다/)).toBeTruthy();
    // 호출 순서: 업로드 개시 → 바이트 PUT → 학습 제출
    expect(calls[0]).toContain("/storage/upload/initiate");
    expect(calls[1]).toContain("PUT");
    expect(calls[2]).toContain("/fal-ai/flux-lora-fast-training");
  });
});
