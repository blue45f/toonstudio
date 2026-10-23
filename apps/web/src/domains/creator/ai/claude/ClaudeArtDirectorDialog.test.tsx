// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClaudeBudgetForTests, setClaudeBudgetLimit } from "@/shared/ai/claude/claude-budget";
import { resetClaudeUsage } from "@/shared/ai/claude/claude-usage-meter";
import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";
import { useI18n } from "@/shared/lib/i18n";

import { normalizeArtDirectorReview, type ArtDirectorRawReview } from "./claude-art-director";
import { installStudioCanvasCapture, resetStudioCanvasCaptureForTests } from "./claude-canvas-capture-registry";
import { ClaudeArtDirectorDialog } from "./ClaudeArtDirectorDialog";

import type { ArtDirectorBitmap, ArtDirectorImageDeps } from "./claude-art-director-image";
import type { ArtDirectorRunResult } from "./claude-art-director-run";

const runArtDirectorReview = vi.hoisted(() => vi.fn());
vi.mock("./claude-art-director-run", () => ({ runArtDirectorReview }));

// jsdom에는 canvas.toBlob이 없어, 캔버스를 파일로 바꾸는 부분만 바꿔 끼운다(그 부분은 claude-canvas-image.test.ts가 시험한다).
const canvasToImageFile = vi.hoisted(() => vi.fn());
vi.mock("./claude-canvas-image", () => ({ canvasToImageFile }));

/** 캔버스·ImageBitmap이 없는 jsdom에서도 화면 흐름을 시험하도록 브라우저 구현만 바꿔 끼운다. */
const fakeDeps = vi.hoisted(() => ({
  size: { width: 800, height: 1_000 },
  revoked: [] as string[],
  urls: 0,
}));
vi.mock("./claude-art-director-image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./claude-art-director-image")>();
  const deps: ArtDirectorImageDeps = {
    decode: async () => ({ ...fakeDeps.size, source: {}, close: () => undefined }) satisfies ArtDirectorBitmap,
    encode: async () => new Blob([new Uint8Array(2_048)]),
    toBase64: async () => "QUJD",
    createObjectUrl: () => `blob:preview-${++fakeDeps.urls}`,
    revokeObjectUrl: (url) => { fakeDeps.revoked.push(url); },
  };
  return { ...actual, BROWSER_ART_DIRECTOR_IMAGE_DEPS: deps };
});

const INITIAL_LANGUAGE = useI18n.getState().lang;
const FAKE_KEY = "sk-test-art-director-0000";

function pngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function pngFile(width: number, height: number, name = "cut.png"): File {
  return new File([pngBytes(width, height)], name, { type: "image/png" });
}

function connectClaude(model = "claude-opus-5-5") {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      ...structuredClone(EMPTY_AI_CONNECTION),
      id: "claude-byok",
      label: "Claude (Anthropic)",
      baseUrl: "https://api.anthropic.com",
      apiKey: FAKE_KEY,
      textModel: model,
      imageModel: "",
      costPolicy: "user-funded-byok",
      apiKeys: [{ id: "key-1", label: "기본 키", apiKey: FAKE_KEY, enabled: true, priority: 100 }],
      models: [{ id: "text-1", label: "Claude", model, capability: "text", enabled: true, priority: 100 }],
    }],
    assignments: { text: "claude-byok", image: null, inference: null, "three-d": null },
  });
}

const RAW: ArtDirectorRawReview = {
  summary: "읽는 흐름은 자연스럽지만 글자가 배경에 묻혀요.",
  scores: { composition: 4, readability: 2, mood: 5 },
  strengths: ["색 대비가 좋아요"],
  readingOrder: [
    { step: 1, label: "배경 컷", region: { x: 0, y: 0, width: 800, height: 400 } },
    { step: 2, label: "주인공 대사", region: { x: 400, y: 500, width: 300, height: 200 } },
  ],
  issues: [
    { category: "lettering", severity: "high", confidence: "high", title: "대사 글자가 묻혀요", detail: "배경과 대비가 낮아요.", fix: "글자에 흰 외곽선을 넣어요.", region: { x: 40, y: 100, width: 200, height: 150 } },
    { category: "pacing", severity: "low", confidence: "low", title: "여백이 조금 좁아요", detail: "컷 사이 간격이 좁아요.", fix: "간격을 넓혀요.", region: null },
  ],
  nextActions: ["글자 대비부터 고치기"],
};

function outcome(): ArtDirectorRunResult {
  return {
    review: normalizeArtDirectorReview(RAW, { width: 800, height: 1_000 }),
    model: "claude-opus-5-5",
    usage: { inputTokens: 2_000, outputTokens: 1_500, cacheReadTokens: 0, cacheWriteTokens: 0 },
    estimatedUsd: 0.038,
  };
}

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ClaudeArtDirectorDialog onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

async function chooseImage(file = pngFile(800, 1_000)) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  if (!input) return;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await screen.findByAltText("분석할 이미지 미리보기");
}

const RUN = /Claude로 분석하기|다시 분석하기/;

function preset(name: string): HTMLInputElement {
  return screen.getByRole("radio", { name: new RegExp(name) }) as HTMLInputElement;
}

describe("ClaudeArtDirectorDialog", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    runArtDirectorReview.mockReset();
    runArtDirectorReview.mockResolvedValue(outcome());
    canvasToImageFile.mockReset();
    resetStudioCanvasCaptureForTests();
    fakeDeps.size = { width: 800, height: 1_000 };
    fakeDeps.revoked.length = 0;
    fakeDeps.urls = 0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  describe("처음 열었을 때", () => {
    it("연결이 없으면 연결 안내와 설정 링크를 보여 주고 실행할 수 없다", async () => {
      renderDialog();

      expect(screen.getByRole("dialog", { name: "AI 아트 디렉터" }).getAttribute("aria-modal")).toBe("true");
      expect(screen.getByText("Claude 연결이 필요해요.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "AI 설정에서 연결하기" }).getAttribute("href")).toBe("/settings/ai?source=studio");
      await chooseImage();
      expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("이미지가 없으면 올리는 길과 스튜디오 연결 팁을 알리고, 실행 버튼은 이유를 말해 준다", () => {
      connectClaude();
      renderDialog();

      expect(screen.getByRole("button", { name: "이미지 선택" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "클립보드에서 붙여 넣기" })).toBeTruthy();
      expect(screen.getByText(/이미지를 클립보드로/)).toBeTruthy();
      const run = screen.getByRole("button", { name: RUN }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      expect(run.getAttribute("aria-describedby")).toBe(document.querySelector("[data-claude-need-hint]")?.id);
      expect(screen.getByText("먼저 분석할 이미지를 올려 주세요.")).toBeTruthy();
    });

    it("실행 전 확인 요약에 모델과 처리 경로를 항상 보여 준다", () => {
      connectClaude();
      renderDialog();

      const preflight = document.querySelector("[data-claude-preflight]") as HTMLElement;
      expect(within(preflight).getByText("실행 전 확인")).toBeTruthy();
      expect(within(preflight).getByText("Claude Opus 5.5")).toBeTruthy();
      expect(within(preflight).getByText(/이 브라우저 → Anthropic/)).toBeTruthy();
      expect(within(preflight).getByText("아직 이미지가 없어요. 올리면 크기와 용량이 여기에 보여요.")).toBeTruthy();
    });
  });

  describe("분석 방식과 비용 상한", () => {
    it("이미지를 올리면 방식마다 비용 상한을 카드에 보여 주고 기본 방식이 골라져 있다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      expect(preset("기본").checked).toBe(true);
      // 입력은 UTF-8 바이트 상한(고정 지시 2,149토큰은 캐시 쓰기 ×1.25, 나머지 + 스키마 + 이미지 1,125토큰), 출력 8000토큰 상한.
      // Haiku 5.5 $0.1/$0.5, Opus 5.5 $4/$20 (100만 토큰당)
      const quick = preset("빠르게").closest("label") as HTMLElement;
      const standard = preset("기본").closest("label") as HTMLElement;
      expect(within(quick).getByText("최대 약 $0.0046")).toBeTruthy();
      expect(within(standard).getByText("최대 약 $0.18")).toBeTruthy();
      expect(document.querySelector("[data-claude-footer-cap]")?.textContent).toBe("최대 약 $0.18");
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("최대 약 $0.18");
      expect(screen.getByText(/원본 800×1000px/)).toBeTruthy();
      expect(screen.getByText(/전송 크기 800×1000px · 2KB/)).toBeTruthy();
    });

    it("방식을 바꾸면 비용 상한과 실행 설정이 함께 바뀐다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      fireEvent.click(preset("빠르게"));
      expect(document.querySelector("[data-claude-footer-cap]")?.textContent).toBe("최대 약 $0.0046");
      expect(within(document.querySelector("[data-claude-preflight]") as HTMLElement).getByText("Claude Haiku 5.5")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("대사 글자가 묻혀요");
      const [route, , context, options] = runArtDirectorReview.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY, model: "claude-opus-5-5" });
      expect(context).toMatchObject({ depth: "low" });
      expect(options.model).toBe("claude-haiku-5-5");
    });

    it("정밀 분석은 연결 모델을 그대로 쓰고 깊이만 높인다", async () => {
      connectClaude("claude-sonnet-5-5");
      renderDialog();
      await chooseImage();

      fireEvent.click(preset("꼼꼼하게"));
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("대사 글자가 묻혀요");

      const [, , context, options] = runArtDirectorReview.mock.calls[0] ?? [];
      expect(context).toMatchObject({ depth: "high" });
      expect(options.model).toBe("claude-sonnet-5-5");
    });

    it("직접 고르기에서는 모델과 깊이를 따로 고른다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      expect(screen.queryByLabelText("사용할 모델")).toBeNull();
      fireEvent.click(preset("직접 고르기"));
      fireEvent.change(screen.getByLabelText("사용할 모델"), { target: { value: "claude-fable-5-1" } });
      fireEvent.change(screen.getByLabelText("생각 깊이"), { target: { value: "high" } });
      expect(document.querySelector("[data-claude-footer-cap]")?.textContent).toBe("최대 약 $0.46");
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("대사 글자가 묻혀요");

      const [, , context, options] = runArtDirectorReview.mock.calls[0] ?? [];
      expect(context).toMatchObject({ depth: "high" });
      expect(options.model).toBe("claude-fable-5-1");
    });

    it("단가를 모르는 모델이면 숫자를 지어내지 않고 가격을 모른다고 말한다", async () => {
      connectClaude("claude-future-9");
      renderDialog();
      await chooseImage();

      expect(document.querySelector("[data-claude-footer-cap]")).toBeNull();
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("가격을 몰라요");
      expect(screen.getByText(/이 모델의 단가를 몰라 미리 추정할 수 없어요/)).toBeTruthy();
    });
  });

  describe("예산 가드", () => {
    it("넘을 수 있는 요청은 확인하기 전까지 보내지 않고, 한 번 확인하면 한 번만 보낸다", async () => {
      connectClaude();
      setClaudeBudgetLimit(0.1);
      renderDialog();
      await chooseImage();

      const run = screen.getByRole("button", { name: RUN }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      expect(screen.getByText("예산 확인을 체크하면 실행할 수 있어요.")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("이 요청은 최대 $0.18까지 들 수 있어 예산을 넘을 수 있어요.");

      fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
      expect(run.disabled).toBe(false);
      fireEvent.click(run);
      await screen.findByText("대사 글자가 묻혀요");
      expect(runArtDirectorReview).toHaveBeenCalledTimes(1);

      // 한 번 진행하면 동의는 거두어져 다음 요청에서 다시 묻는다.
      expect((screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요") as HTMLInputElement).checked).toBe(false);
    });

    it("한도 안이면 묻지 않고 바로 보낸다", async () => {
      connectClaude();
      setClaudeBudgetLimit(5);
      renderDialog();
      await chooseImage();

      expect(screen.queryByLabelText("이번 한 번만 예산을 넘어도 진행해요")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("대사 글자가 묻혀요");
      expect(runArtDirectorReview).toHaveBeenCalledTimes(1);
    });
  });

  describe("실행과 결과", () => {
    it("입력한 맥락으로 실행하고 결과·사용량을 보여 주며 버튼은 다시 분석으로 바뀐다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      fireEvent.change(screen.getByLabelText("장르"), { target: { value: "로맨스" } });
      fireEvent.change(screen.getByLabelText("의도한 분위기"), { target: { value: "비 오는 밤" } });
      fireEvent.change(screen.getByLabelText("제작자 메모"), { target: { value: "말풍선을 봐 주세요" } });
      fireEvent.click(screen.getByRole("radio", { name: "페이지형 만화" }));
      fireEvent.click(screen.getByRole("button", { name: RUN }));

      expect(await screen.findByText("대사 글자가 묻혀요")).toBeTruthy();
      expect(runArtDirectorReview).toHaveBeenCalledTimes(1);
      const [route, image, context, options] = runArtDirectorReview.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY, model: "claude-opus-5-5" });
      expect(image).toMatchObject({ mediaType: "image/png", data: "QUJD", width: 800, height: 1_000 });
      expect(context).toEqual({ medium: "page", depth: "medium", genre: "로맨스", mood: "비 오는 밤", notes: "말풍선을 봐 주세요" });
      expect(options.model).toBe("claude-opus-5-5");
      expect(options.signal).toBeInstanceOf(AbortSignal);

      const result = screen.getByRole("region", { name: "리뷰" });
      expect(within(result).getByText("읽는 흐름은 자연스럽지만 글자가 배경에 묻혀요.")).toBeTruthy();
      expect(within(result).getByText("중요")).toBeTruthy();
      expect(within(result).getByText("글자 가독성")).toBeTruthy();
      expect(within(result).getByText(/모델 claude-opus-5-5 · 입력 2,000 · 출력 1,500 토큰 · 추정 \$0\.04/)).toBeTruthy();
      expect(document.querySelector("[data-claude-task-status] [role=status]")?.textContent).toBe("분석을 마쳤어요.");
      expect(screen.getByRole("button", { name: "다시 분석하기 (요금 발생)" })).toBeTruthy();
    });

    it("Ctrl+Enter로 입력 중에도 실행하고, 실행할 수 없을 때는 아무 일도 없다", async () => {
      connectClaude();
      renderDialog();
      const dialog = screen.getByRole("dialog");

      fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true });
      expect(runArtDirectorReview).not.toHaveBeenCalled();

      await chooseImage();
      fireEvent.keyDown(screen.getByLabelText("장르"), { key: "Enter", ctrlKey: true });
      expect(await screen.findByText("대사 글자가 묻혀요")).toBeTruthy();
      expect(runArtDirectorReview).toHaveBeenCalledTimes(1);

      // 일반 Enter는 실행하지 않는다.
      fireEvent.keyDown(dialog, { key: "Enter" });
      expect(runArtDirectorReview).toHaveBeenCalledTimes(1);
    });

    it("실행 버튼 옆에 기기에 맞는 단축키를 알린다", () => {
      connectClaude();
      renderDialog();

      const hint = document.querySelector("[data-claude-shortcut-hint]") as HTMLElement;
      expect(hint.textContent).toMatch(/(Ctrl|⌘)\s*\+\s*Enter/u);
      expect(hint.textContent).toContain("단축키");
    });

    it("문제를 고르면 이미지에서 그 영역만 강조하고 위치를 말로도 알려 준다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("대사 글자가 묻혀요");

      const overlay = document.querySelector("[data-art-director-overlay]");
      expect(overlay?.getAttribute("aria-hidden")).toBe("true");
      expect(overlay?.querySelectorAll("[data-overlay-issue]")).toHaveLength(1);
      const issueButtons = screen.getAllByRole("button", { name: /^\d+\s*(대사 글자가 묻혀요|여백이 조금 좁아요)/ });
      expect(issueButtons).toHaveLength(2);
      expect((issueButtons[1] as HTMLButtonElement).disabled).toBe(true);

      const first = issueButtons[0] as HTMLButtonElement;
      fireEvent.click(first);
      expect(first.getAttribute("aria-pressed")).toBe("true");
      expect(overlay?.querySelector("[data-overlay-issue='issue-1']")?.className).toContain("ring-2");
      expect(screen.getAllByText("위치: 위쪽 · 왼쪽").length).toBeGreaterThan(0);

      fireEvent.click(first);
      expect(first.getAttribute("aria-pressed")).toBe("false");
    });

    it("읽는 순서 단계를 고르면 그 단계의 영역만 보여 주고, 오버레이는 체크박스로 끌 수 있다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("주인공 대사");

      fireEvent.click(screen.getByRole("button", { name: /주인공 대사/ }));
      const overlay = document.querySelector("[data-art-director-overlay]");
      expect(overlay?.querySelectorAll("[data-overlay-issue]")).toHaveLength(0);
      expect(overlay?.querySelector("[data-overlay-step='2']")).not.toBeNull();

      fireEvent.click(screen.getByLabelText("이미지에 위치 표시"));
      expect(document.querySelector("[data-art-director-overlay]")).toBeNull();
    });

    it("실패하면 사유를 알리고 결과 없이 다시 실행할 수 있다", async () => {
      connectClaude();
      runArtDirectorReview.mockRejectedValueOnce(new Error("키를 확인해 주세요. 인증에 실패했어요."));
      renderDialog();
      await chooseImage();

      fireEvent.click(screen.getByRole("button", { name: RUN }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("분석을 마치지 못했어요");
      expect(alert.textContent).toContain("키를 확인해 주세요. 인증에 실패했어요.");
      expect(screen.queryByRole("region", { name: "리뷰" })).toBeNull();
      expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(false);
      expect(runArtDirectorReview).toHaveBeenCalledTimes(1);
    });

    it("중단하면 요청을 취소하고 결과를 올리지 않는다", async () => {
      connectClaude();
      let signal: AbortSignal | undefined;
      runArtDirectorReview.mockImplementationOnce((_route, _image, _context, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      });
      renderDialog();
      await chooseImage();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      expect(await screen.findByText(/분석하는 중이에요/)).toBeTruthy();
      // 매초 바뀌는 경과 시간은 화면에만 보이고 안내 영역(role=status)에는 들어가지 않는다.
      expect(screen.getByText(/0초 경과/).closest("[role=status]")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "중단" }));

      await waitFor(() => { expect(signal?.aborted).toBe(true); });
      expect(await screen.findByText("분석을 중단했어요. 이미 처리된 부분은 요금이 청구됐을 수 있어요. 필요하면 다시 시도해 주세요.")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("region", { name: "리뷰" })).toBeNull();
    });

    it("닫으면 진행 중인 요청도 취소하고, 화면이 사라져도 미리보기 주소를 해제한다", async () => {
      connectClaude();
      let signal: AbortSignal | undefined;
      runArtDirectorReview.mockImplementationOnce((_route, _image, _context, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise(() => undefined);
      });
      const { onClose } = renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText(/분석하는 중이에요/);

      fireEvent.click(screen.getByRole("button", { name: "닫기" }));
      expect(signal?.aborted).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);

      cleanup();
      expect(fakeDeps.revoked).toContain("blob:preview-1");
    });
  });

  describe("이미지 가져오기", () => {
    it("지원하지 않는 파일은 이유와 함께 거절한다", async () => {
      connectClaude();
      renderDialog();
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      const gif = new File([new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000\u0000;")], "a.png", { type: "image/png" });

      await act(async () => {
        fireEvent.change(input as HTMLInputElement, { target: { files: [gif] } });
      });

      expect((await screen.findByRole("alert")).textContent).toBe("PNG, JPEG, WebP 이미지만 올릴 수 있어요. 다른 파일을 선택해 주세요.");
      expect(screen.queryByAltText("분석할 이미지 미리보기")).toBeNull();
    });

    it("붙여넣은 이미지도 불러온다", async () => {
      connectClaude();
      renderDialog();

      await act(async () => {
        fireEvent.paste(screen.getByRole("dialog"), { clipboardData: { files: [pngFile(800, 1_000, "clip.png")] } });
      });

      expect(await screen.findByAltText("분석할 이미지 미리보기")).toBeTruthy();
    });

    it("버튼으로 클립보드의 이미지를 가져온다", async () => {
      connectClaude();
      const read = vi.fn(async () => [{
        types: ["image/png"],
        getType: async () => new Blob([pngBytes(800, 1_000)], { type: "image/png" }),
      }]);
      vi.stubGlobal("navigator", { ...navigator, clipboard: { read } });
      renderDialog();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "클립보드에서 붙여 넣기" }));
      });

      expect(await screen.findByAltText("분석할 이미지 미리보기")).toBeTruthy();
      expect(read).toHaveBeenCalledTimes(1);
    });

    it("클립보드를 읽을 수 없으면 대신 할 일을 알려 준다", async () => {
      connectClaude();
      vi.stubGlobal("navigator", { ...navigator, clipboard: { read: async () => { throw new DOMException("denied", "NotAllowedError"); } } });
      renderDialog();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "클립보드에서 붙여 넣기" }));
      });

      expect(await screen.findByText("클립보드를 읽을 수 없어요. 권한을 허용하거나 Ctrl/⌘+V로 붙여 넣어 주세요.")).toBeTruthy();
    });

    it("세로로 긴 이미지는 구간별로 따로 분석하고 결과를 구간마다 보관한다", async () => {
      fakeDeps.size = { width: 1_000, height: 6_000 };
      connectClaude();
      renderDialog();
      await chooseImage(pngFile(1_000, 6_000, "long.png"));

      const select = screen.getByLabelText("분석할 구간");
      expect([...(select as HTMLSelectElement).options].length).toBeGreaterThan(1);
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("대사 글자가 묻혀요");

      await act(async () => {
        fireEvent.change(select, { target: { value: "1" } });
      });
      await waitFor(() => { expect(screen.getByText("이 구간은 아직 분석하지 않았어요. 아래 버튼으로 분석을 실행해 주세요.")).toBeTruthy(); });
      expect(screen.queryByText("대사 글자가 묻혀요")).toBeNull();

      await act(async () => {
        fireEvent.change(select, { target: { value: "0" } });
      });
      expect(await screen.findByText("대사 글자가 묻혀요")).toBeTruthy();
    });

    it("이미지를 바꾸면 이전 결과를 버린다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByText("대사 글자가 묻혀요");

      fireEvent.click(screen.getByRole("button", { name: "다른 이미지" }));
      await chooseImage(pngFile(800, 1_000, "next.png"));

      await waitFor(() => { expect(screen.queryByText("대사 글자가 묻혀요")).toBeNull(); });
      expect(screen.getByText("이 구간은 아직 분석하지 않았어요. 아래 버튼으로 분석을 실행해 주세요.")).toBeTruthy();
    });
  });

  it("영어 화면에서는 영어 문구를 쓴다", () => {
    useI18n.setState({ lang: "en" });
    connectClaude();
    renderDialog();

    expect(screen.getByRole("dialog", { name: "AI Art Director" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose image" })).toBeTruthy();
    expect(screen.getByText("Check before you run")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Quick/ })).toBeTruthy();
  });
});

describe("ClaudeArtDirectorDialog — 리뷰 반영", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    runArtDirectorReview.mockReset();
    runArtDirectorReview.mockResolvedValue(outcome());
    fakeDeps.size = { width: 800, height: 1_000 };
    fakeDeps.revoked.length = 0;
    fakeDeps.urls = 0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  it("이미지를 올리기 전에는 '가격을 몰라요'나 예산 경고 대신 '입력하면 계산해요'를 보여 준다", () => {
    connectClaude();
    setClaudeBudgetLimit(0.1);
    renderDialog();

    expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("입력하면 계산해요");
    expect(screen.queryByText("가격을 몰라요")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("이번 한 번만 예산을 넘어도 진행해요")).toBeNull();
  });

  it("'이번 한 번만'을 고른 요청은 전송 계층에 예산 판정 건너뛰기(budgetOverride)를 알리고, 평소에는 알리지 않는다", async () => {
    connectClaude();
    setClaudeBudgetLimit(0.1);
    renderDialog();
    await chooseImage();

    fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
    fireEvent.click(screen.getByRole("button", { name: RUN }));
    await screen.findByText("대사 글자가 묻혀요");
    expect(runArtDirectorReview.mock.calls[0]?.[3]).toMatchObject({ budgetOverride: true });

    act(() => { setClaudeBudgetLimit(50); });
    fireEvent.click(screen.getByRole("button", { name: RUN }));
    await waitFor(() => expect(runArtDirectorReview).toHaveBeenCalledTimes(2));
    expect(runArtDirectorReview.mock.calls[1]?.[3]).toMatchObject({ budgetOverride: false });
  });

  it("동의한 뒤 더 비싼 방식으로 바꾸면 같은 체크가 남아 있어도 다시 확인한다", async () => {
    connectClaude();
    setClaudeBudgetLimit(0.1);
    renderDialog();
    await chooseImage();

    fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
    expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(preset("직접 고르기"));
    fireEvent.change(screen.getByLabelText("사용할 모델"), { target: { value: "claude-fable-5-1" } });

    expect((screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("이미지를 올리면 포커스가 실행 버튼으로 가고, 실행하면 중단 버튼으로, 끝나면 실행 버튼으로 돌아온다", async () => {
    connectClaude();
    let finish: (value: ArtDirectorRunResult) => void = () => undefined;
    runArtDirectorReview.mockImplementation(() => new Promise<ArtDirectorRunResult>((resolve) => { finish = resolve; }));
    renderDialog();
    await chooseImage();

    const run = screen.getByRole("button", { name: RUN });
    await waitFor(() => expect(document.activeElement).toBe(run));

    fireEvent.click(run);
    const stop = await screen.findByRole("button", { name: "중단" });
    await waitFor(() => expect(document.activeElement).toBe(stop));

    await act(async () => { finish(outcome()); });
    await screen.findByText("대사 글자가 묻혀요");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /다시 분석하기/ })));
  });

  it("이미지를 지우면 포커스가 올리기 버튼으로 간다", async () => {
    connectClaude();
    renderDialog();
    await chooseImage();

    fireEvent.click(screen.getByRole("button", { name: "이미지 지우기" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "이미지 선택" })));
  });

  it("매우 긴 이미지는 어디까지만 구간으로 나눌 수 있는지 알린다", async () => {
    connectClaude();
    fakeDeps.size = { width: 800, height: 60_000 };
    renderDialog();
    await chooseImage(pngFile(800, 60_000));

    const note = document.querySelector("[data-claude-coverage]");
    expect(note?.textContent).toMatch(/원본 세로 60000px 중 위쪽 \d+px\(\d+%\)만 구간으로 나눌 수 있어요/);
    expect(screen.getAllByRole("option").length).toBeGreaterThan(4);
  });

  it("구간을 옮기면 이전 구간에서 고른 강조는 남지 않는다", async () => {
    connectClaude();
    fakeDeps.size = { width: 800, height: 6_000 };
    renderDialog();
    await chooseImage(pngFile(800, 6_000));

    fireEvent.click(screen.getByRole("button", { name: RUN }));
    await screen.findByText("대사 글자가 묻혀요");
    const issueButton = screen.getByRole("button", { name: /대사 글자가 묻혀요/ });
    fireEvent.click(issueButton);
    expect(issueButton.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("분석할 구간"), { target: { value: "1" } });
    });
    await waitFor(() => expect(screen.getByLabelText("분석할 구간")).toHaveProperty("value", "1"));
    fireEvent.click(screen.getByRole("button", { name: RUN }));
    await waitFor(() => expect(runArtDirectorReview).toHaveBeenCalledTimes(2));
    await screen.findByText("대사 글자가 묻혀요");

    expect(screen.getByRole("button", { name: /대사 글자가 묻혀요/ }).getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-overlay-issue]")).not.toBeNull();
    expect(document.querySelector("[data-overlay-issue].ring-2")).toBeNull();
  });

  it("대화상자 안 어디에 파일을 끌어다 놓아도 이미지로 불러오고, 브라우저가 파일을 열어 버리지 않는다", async () => {
    connectClaude();
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "AI 아트 디렉터" });
    const file = pngFile(800, 1_000);

    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, "dataTransfer", { value: { types: ["Files"], files: [file] } });
    dialog.querySelector("header")?.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { types: ["Files"], files: [file] } });
    await act(async () => {
      dialog.querySelector("header")?.dispatchEvent(drop);
    });
    expect(drop.defaultPrevented).toBe(true);
    await screen.findByAltText("분석할 이미지 미리보기");
  });

  it("잘린 항목이 있으면 몇 곳이 줄었는지 알린다", async () => {
    connectClaude();
    const trimmed = outcome();
    runArtDirectorReview.mockResolvedValue({ ...trimmed, review: { ...trimmed.review, trimmed: 3 } });
    renderDialog();
    await chooseImage();

    fireEvent.click(screen.getByRole("button", { name: RUN }));
    await screen.findByText("대사 글자가 묻혀요");

    expect(document.querySelector("[data-claude-trimmed]")?.textContent).toContain("3곳의 내용이 줄었어요");
  });

  describe("스튜디오 캔버스에서 가져오기", () => {
    it("스튜디오 밖(캡처가 등록되지 않음)에서는 단추가 없고 클립보드 안내가 남는다", () => {
      connectClaude();
      renderDialog();

      expect(screen.queryByRole("button", { name: "캔버스에서 가져오기" })).toBeNull();
      expect(document.querySelector("[data-claude-dropzone]")?.textContent).toContain("이미지를 클립보드로");
    });

    it("스튜디오가 켜져 있으면 단추를 보이고, 누르면 현재 페이지를 올린 이미지와 같은 길로 불러온다", async () => {
      connectClaude();
      const canvas = document.createElement("canvas");
      const capture = vi.fn().mockResolvedValue(canvas);
      canvasToImageFile.mockResolvedValue(pngFile(800, 1_000, "canvas-page.png"));
      renderDialog();
      let uninstall: () => void = () => undefined;
      act(() => { uninstall = installStudioCanvasCapture(capture); });

      const button = await screen.findByRole("button", { name: "캔버스에서 가져오기" });
      expect(document.querySelector("[data-claude-dropzone]")?.textContent).not.toContain("이미지를 클립보드로");
      await act(async () => { fireEvent.click(button); });

      await screen.findByAltText("분석할 이미지 미리보기");
      expect(capture).toHaveBeenCalledTimes(1);
      expect(canvasToImageFile).toHaveBeenCalledWith(canvas);
      expect(screen.getByText(/원본 800×1000px/)).toBeTruthy();
      // 불러온 뒤에도 같은 단추로 현재 페이지를 다시 가져올 수 있다.
      expect(screen.getByRole("button", { name: "캔버스에서 가져오기" })).toBeTruthy();
      act(() => uninstall());
      await waitFor(() => expect(screen.queryByRole("button", { name: "캔버스에서 가져오기" })).toBeNull());
    });

    it("캔버스를 가져오지 못하면 이유와 다음 행동을 알리고 이미지는 바뀌지 않는다", async () => {
      connectClaude();
      renderDialog();
      act(() => { installStudioCanvasCapture(vi.fn().mockRejectedValue(new Error("다른 내보내기 작업이 끝난 뒤 다시 시도해 주세요."))); });

      await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "캔버스에서 가져오기" })); });

      const note = await screen.findByText("캔버스를 이미지로 가져오지 못했어요. 잠시 뒤 다시 시도하거나 이미지를 직접 올려 주세요.");
      expect(note.getAttribute("role")).toBe("status");
      expect(screen.queryByAltText("분석할 이미지 미리보기")).toBeNull();
    });
  });
});
