// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClaudeBudgetForTests, setClaudeBudgetLimit } from "@/shared/ai/claude/claude-budget";
import { resetClaudeUsage } from "@/shared/ai/claude/claude-usage-meter";
import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";
import { useI18n } from "@/shared/lib/i18n";

import { normalizeAltText, type AltTextRaw, type AltTextScope } from "./claude-alt-text";
import { ClaudeAltTextDialog } from "./ClaudeAltTextDialog";

import type { ArtDirectorBitmap, ArtDirectorImageDeps } from "./claude-art-director-image";
import type { AltTextRunResult } from "./claude-alt-text-run";

const runAltText = vi.hoisted(() => vi.fn());
vi.mock("./claude-alt-text-run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./claude-alt-text-run")>();
  return { ...actual, runAltText };
});

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
const FAKE_KEY = "sk-test-alt-text-0000";

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

const RAW: AltTextRaw = {
  short: "비 오는 골목에서 파란 머리 인물이 우산 하나를 건넨다.",
  long: "어두운 골목에 비가 내린다.\n\n파란 머리 인물이 우산을 펴 옆 사람에게 다가간다.",
  panels: [
    { step: 1, description: "비 내리는 골목 전경", text: [] },
    { step: 2, description: "우산을 내미는 손", text: ["하늘: 같이 쓸래?", "…응"] },
  ],
  warnings: ["오른쪽 아래 작은 글씨는 읽기 어려웠어요."],
};

function outcome(scope: AltTextScope = "standard", raw: AltTextRaw = RAW): AltTextRunResult {
  return {
    view: normalizeAltText(raw, scope),
    scope,
    model: "claude-opus-5-5",
    usage: { inputTokens: 1_800, outputTokens: 700, cacheReadTokens: 0, cacheWriteTokens: 0 },
    estimatedUsd: 0.021,
  };
}

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ClaudeAltTextDialog onClose={onClose} />
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

const RUN = /Claude로 설명 만들기|다시 만들기/;

function preset(name: string): HTMLInputElement {
  return screen.getByRole("radio", { name: new RegExp(name) }) as HTMLInputElement;
}

function footerCap(): string | undefined {
  return document.querySelector("[data-claude-footer-cap]")?.textContent ?? undefined;
}

function capValue(text: string | undefined): number {
  return Number((text ?? "").replace(/[^0-9.]/gu, ""));
}

describe("ClaudeAltTextDialog", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    runAltText.mockReset();
    runAltText.mockResolvedValue(outcome());
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

      expect(screen.getByRole("dialog", { name: "AI 대체 텍스트 도우미" }).getAttribute("aria-modal")).toBe("true");
      expect(screen.getByText("Claude 연결이 필요해요.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "AI 설정에서 연결하기" }).getAttribute("href")).toBe("/settings/ai?source=studio");
      await chooseImage();
      expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("이미지가 없으면 올리는 길을 알리고, 실행 버튼은 이유를 말해 준다", () => {
      connectClaude();
      renderDialog();

      expect(screen.getByRole("button", { name: "이미지 선택" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "클립보드에서 붙여 넣기" })).toBeTruthy();
      const run = screen.getByRole("button", { name: RUN }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      expect(run.getAttribute("aria-describedby")).toBe(document.querySelector("[data-claude-need-hint]")?.id);
      expect(screen.getByText("먼저 설명할 이미지를 올려 주세요.")).toBeTruthy();
    });

    it("실행 전 확인에 모델·처리 경로·결과 종류를 항상 보여 준다", () => {
      connectClaude();
      renderDialog();

      const preflight = document.querySelector("[data-claude-preflight]") as HTMLElement;
      expect(within(preflight).getByText("Claude Opus 5.5")).toBeTruthy();
      expect(within(preflight).getByText(/이 브라우저 → Anthropic/)).toBeTruthy();
      expect(within(preflight).getByText("아직 이미지가 없어요. 올리면 크기와 용량이 여기에 보여요.")).toBeTruthy();
      expect(within(preflight).getByText("한 줄 대체 텍스트와 상세 설명")).toBeTruthy();
    });

    it("설명 언어는 화면 언어를 따르고, 지원하지 않는 화면 언어면 한국어다", () => {
      useI18n.setState({ lang: "en" });
      connectClaude();
      renderDialog();
      expect((screen.getByLabelText("Description language") as HTMLSelectElement).value).toBe("en");

      cleanup();
      useI18n.setState({ lang: "ko" });
      renderDialog();
      expect((screen.getByLabelText("설명 언어") as HTMLSelectElement).value).toBe("ko");
    });
  });

  describe("설명 범위와 비용 상한", () => {
    it("범위를 넓힐수록 비용 상한과 결과 안내가 함께 바뀌고, 범위마다 한 줄 설명이 보인다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      fireEvent.click(screen.getByRole("radio", { name: "짧게" }));
      const brief = capValue(footerCap());
      expect(screen.getByText("한 줄 대체 텍스트만 만들어요. 가장 빠르고 저렴해요.")).toBeTruthy();
      expect(within(document.querySelector("[data-claude-preflight]") as HTMLElement).getByText("한 줄 대체 텍스트 한 건")).toBeTruthy();

      fireEvent.click(screen.getByRole("radio", { name: "보통" }));
      const standard = capValue(footerCap());

      fireEvent.click(screen.getByRole("radio", { name: "컷별로 자세히" }));
      const detailed = capValue(footerCap());
      expect(screen.getByText(/컷 순서대로 장면과 보이는 대사·효과음 글자까지 적어요/)).toBeTruthy();
      expect(within(document.querySelector("[data-claude-preflight]") as HTMLElement).getByText("한 줄 대체 텍스트, 상세 설명, 컷별 설명(보이는 글자 포함)")).toBeTruthy();

      expect(brief).toBeGreaterThan(0);
      expect(standard).toBeGreaterThan(brief);
      expect(detailed).toBeGreaterThan(standard);
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe(footerCap());
    });

    it("범위 선택은 방향키로 옮기며 고른다", async () => {
      connectClaude();
      renderDialog();

      const standard = screen.getByRole("radio", { name: "보통" });
      expect(standard.getAttribute("tabindex")).toBe("0");
      expect(screen.getByRole("radio", { name: "짧게" }).getAttribute("tabindex")).toBe("-1");

      fireEvent.keyDown(standard, { key: "ArrowRight" });
      expect(screen.getByRole("radio", { name: "컷별로 자세히" }).getAttribute("aria-checked")).toBe("true");
      fireEvent.keyDown(screen.getByRole("radio", { name: "컷별로 자세히" }), { key: "ArrowRight" });
      expect(screen.getByRole("radio", { name: "짧게" }).getAttribute("aria-checked")).toBe("true");
      fireEvent.keyDown(screen.getByRole("radio", { name: "짧게" }), { key: "End" });
      expect(screen.getByRole("radio", { name: "컷별로 자세히" }).getAttribute("aria-checked")).toBe("true");
    });

    it("방식을 바꾸면 모델과 깊이가 요청에 반영된다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      fireEvent.click(preset("빠르게"));
      expect(within(document.querySelector("[data-claude-preflight]") as HTMLElement).getByText("Claude Haiku 5.5")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByRole("region", { name: "대체 텍스트" });

      const [route, , context, options] = runAltText.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY, model: "claude-opus-5-5" });
      expect(context).toMatchObject({ depth: "low" });
      expect(options.model).toBe("claude-haiku-5-5");
    });

    it("단가를 모르는 모델이면 숫자를 지어내지 않고 가격을 모른다고 말한다", async () => {
      connectClaude("claude-future-9");
      renderDialog();
      await chooseImage();

      expect(footerCap()).toBeUndefined();
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("가격을 몰라요");
    });
  });

  describe("예산 가드", () => {
    it("넘을 수 있는 요청은 확인하기 전까지 보내지 않고, 한 번 확인하면 한 번만 보낸다", async () => {
      connectClaude();
      setClaudeBudgetLimit(0.05);
      renderDialog();
      await chooseImage();

      const run = screen.getByRole("button", { name: RUN }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      expect(screen.getByText("예산 확인을 체크하면 실행할 수 있어요.")).toBeTruthy();

      fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
      expect(run.disabled).toBe(false);
      fireEvent.click(run);
      await screen.findByRole("region", { name: "대체 텍스트" });
      expect(runAltText).toHaveBeenCalledTimes(1);
      expect((screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요") as HTMLInputElement).checked).toBe(false);
    });
  });

  describe("실행과 결과", () => {
    it("입력한 설정으로 실행하고 결과·사용량을 보여 주며 버튼은 다시 만들기로 바뀐다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      fireEvent.change(screen.getByLabelText("설명 언어"), { target: { value: "ja" } });
      fireEvent.click(screen.getByRole("radio", { name: "컷별로 자세히" }));
      fireEvent.change(screen.getByLabelText("장르"), { target: { value: "로맨스" } });
      fireEvent.change(screen.getByLabelText("인물·상황 메모"), { target: { value: "파란 머리가 하늘" } });
      runAltText.mockResolvedValue(outcome("detailed"));
      fireEvent.click(screen.getByRole("button", { name: RUN }));

      const region = await screen.findByRole("region", { name: "대체 텍스트" });
      expect(runAltText).toHaveBeenCalledTimes(1);
      const [route, image, context, options] = runAltText.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY, model: "claude-opus-5-5" });
      expect(image).toMatchObject({ mediaType: "image/png", data: "QUJD", width: 800, height: 1_000 });
      expect(context).toEqual({ scope: "detailed", language: "ja", depth: "medium", genre: "로맨스", notes: "파란 머리가 하늘" });
      expect(options.model).toBe("claude-opus-5-5");
      expect(options.signal).toBeInstanceOf(AbortSignal);

      expect((within(region).getByLabelText("한 줄 대체 텍스트") as HTMLTextAreaElement).value).toBe(RAW.short);
      expect((within(region).getByLabelText("상세 설명") as HTMLTextAreaElement).value).toBe("어두운 골목에 비가 내린다.\n\n파란 머리 인물이 우산을 펴 옆 사람에게 다가간다.");
      expect(within(region).getByText("오른쪽 아래 작은 글씨는 읽기 어려웠어요.")).toBeTruthy();
      expect(within(region).getByText(/모델 claude-opus-5-5 · 입력 1,800 · 출력 700 토큰 · 추정 \$0\.02/)).toBeTruthy();
      expect(screen.getByText("설명을 만들었어요. 바로 고쳐 쓸 수 있어요.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "다시 만들기 (요금 발생)" })).toBeTruthy();
    });

    it("범위에 따라 보이는 칸이 다르다(짧게: 한 줄만, 보통: 상세 설명까지, 자세히: 컷별까지)", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();

      fireEvent.click(screen.getByRole("radio", { name: "짧게" }));
      runAltText.mockResolvedValue(outcome("brief"));
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      let region = await screen.findByRole("region", { name: "대체 텍스트" });
      expect(within(region).queryByLabelText("상세 설명")).toBeNull();
      expect(within(region).queryByText("컷별 설명")).toBeNull();

      runAltText.mockResolvedValue(outcome("standard"));
      fireEvent.click(screen.getByRole("radio", { name: "보통" }));
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await waitFor(() => expect(screen.getByLabelText("상세 설명")).toBeTruthy());
      region = screen.getByRole("region", { name: "대체 텍스트" });
      expect(within(region).queryByText("컷별 설명")).toBeNull();

      runAltText.mockResolvedValue(outcome("detailed"));
      fireEvent.click(screen.getByRole("radio", { name: "컷별로 자세히" }));
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await waitFor(() => expect(within(screen.getByRole("region", { name: "대체 텍스트" })).getByText("컷별 설명")).toBeTruthy());
      region = screen.getByRole("region", { name: "대체 텍스트" });
      const second = region.querySelector('[data-claude-alt-panel="2"]') as HTMLElement;
      expect(within(second).getByText("우산을 내미는 손")).toBeTruthy();
      expect(within(second).getByText("“하늘: 같이 쓸래?”")).toBeTruthy();
      expect(within(second).getByText("“…응”")).toBeTruthy();
      expect(runAltText).toHaveBeenCalledTimes(3);
    });

    it("컷별 설명이 비어 오면 다시 만들어 보라고 알린다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("radio", { name: "컷별로 자세히" }));
      runAltText.mockResolvedValue(outcome("detailed", { ...RAW, panels: [] }));
      fireEvent.click(screen.getByRole("button", { name: RUN }));

      await screen.findByText("컷별 설명이 오지 않았어요. 다시 만들어 보세요.");
      expect(screen.queryByRole("button", { name: "컷별 설명 복사" })).toBeNull();
    });

    it("한 줄 대체 텍스트가 125자를 넘으면 막지 않고 글자 수로 알리고, 고치면 알림이 사라진다", async () => {
      connectClaude();
      runAltText.mockResolvedValue(outcome("standard", { ...RAW, short: "가".repeat(130) }));
      renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("button", { name: RUN }));

      const region = await screen.findByRole("region", { name: "대체 텍스트" });
      const counter = region.querySelector("[data-claude-alt-count]") as HTMLElement;
      expect(counter.textContent).toBe("130/125자 · 권장 길이를 넘었어요");
      expect((within(region).getByLabelText("한 줄 대체 텍스트") as HTMLTextAreaElement).value).toHaveLength(130);

      fireEvent.change(within(region).getByLabelText("한 줄 대체 텍스트"), { target: { value: "가".repeat(100) } });
      expect(counter.textContent).toBe("100/125자");
    });

    it("한 줄 대체 텍스트를 고치면 줄바꿈이 공백이 되고 미리보기 이미지의 alt도 바뀐다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();
      expect(screen.getByAltText("분석할 이미지 미리보기")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: RUN }));

      const region = await screen.findByRole("region", { name: "대체 텍스트" });
      expect(screen.getByAltText(RAW.short)).toBeTruthy();
      expect(screen.getByText(/미리보기 이미지의 대체 텍스트로 아래 한 줄 설명을 쓰고 있어요/)).toBeTruthy();

      fireEvent.change(within(region).getByLabelText("한 줄 대체 텍스트"), { target: { value: "비 오는 골목\n우산 하나" } });
      expect((within(region).getByLabelText("한 줄 대체 텍스트") as HTMLTextAreaElement).value).toBe("비 오는 골목 우산 하나");
      expect(screen.getByAltText("비 오는 골목 우산 하나")).toBeTruthy();
    });

    it("복사는 고친 글 기준으로 대체 텍스트·alt 속성·상세 설명·컷별 설명이 나간다", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
      connectClaude();
      runAltText.mockResolvedValue(outcome("detailed"));
      renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("radio", { name: "컷별로 자세히" }));
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      const region = await screen.findByRole("region", { name: "대체 텍스트" });
      fireEvent.change(within(region).getByLabelText("한 줄 대체 텍스트"), { target: { value: '그는 "안녕" & <인사>' } });
      fireEvent.change(within(region).getByLabelText("상세 설명"), { target: { value: "고친 상세 설명" } });

      fireEvent.click(within(region).getByRole("button", { name: "대체 텍스트 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(writeText).toHaveBeenLastCalledWith('그는 "안녕" & <인사>');
      await waitFor(() => expect(within(region).getByRole("button", { name: "복사했어요." })).toBeTruthy());

      fireEvent.click(within(region).getByRole("button", { name: "alt 속성으로 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
      expect(writeText).toHaveBeenLastCalledWith('alt="그는 &quot;안녕&quot; &amp; &lt;인사&gt;"');

      fireEvent.click(within(region).getByRole("button", { name: "상세 설명 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
      expect(writeText).toHaveBeenLastCalledWith("고친 상세 설명");

      fireEvent.click(within(region).getByRole("button", { name: "컷별 설명 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(4));
      expect(writeText).toHaveBeenLastCalledWith('1. 비 내리는 골목 전경\n2. 우산을 내미는 손\n   "하늘: 같이 쓸래?"\n   "…응"');
    });

    it("다시 만들면 새 결과로 바뀌고 고친 글은 새 글로 대체된다", async () => {
      connectClaude();
      renderDialog();
      await chooseImage();
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      const region = await screen.findByRole("region", { name: "대체 텍스트" });
      fireEvent.change(within(region).getByLabelText("한 줄 대체 텍스트"), { target: { value: "고친 글" } });

      runAltText.mockResolvedValue(outcome("standard", { ...RAW, short: "새로 만든 글" }));
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await waitFor(() => expect((screen.getByLabelText("한 줄 대체 텍스트") as HTMLTextAreaElement).value).toBe("새로 만든 글"));
      expect(runAltText).toHaveBeenCalledTimes(2);
    });

    it("Ctrl+Enter로 실행하고, 실행할 수 없을 때는 아무 일도 없다", async () => {
      connectClaude();
      renderDialog();
      const dialog = screen.getByRole("dialog");

      fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true });
      expect(runAltText).not.toHaveBeenCalled();

      await chooseImage();
      fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true });
      await screen.findByRole("region", { name: "대체 텍스트" });
      expect(runAltText).toHaveBeenCalledTimes(1);
    });
  });

  describe("긴 이미지의 구간", () => {
    it("구간마다 결과와 고친 글이 따로 남고, 이미지를 바꾸면 모두 지워진다", async () => {
      connectClaude();
      fakeDeps.size = { width: 800, height: 5_000 };
      renderDialog();
      await chooseImage(pngFile(800, 5_000, "long.png"));

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      const region = await screen.findByRole("region", { name: "대체 텍스트" });
      fireEvent.change(within(region).getByLabelText("한 줄 대체 텍스트"), { target: { value: "첫 구간 고친 글" } });

      await act(async () => {
        fireEvent.change(screen.getByLabelText("분석할 구간"), { target: { value: "1" } });
      });
      await waitFor(() => expect(screen.queryByRole("region", { name: "대체 텍스트" })).toBeNull());
      expect(screen.getByText("이 구간은 아직 설명을 만들지 않았어요. 아래 버튼으로 실행해 주세요.")).toBeTruthy();

      await act(async () => {
        fireEvent.change(screen.getByLabelText("분석할 구간"), { target: { value: "0" } });
      });
      const again = await screen.findByRole("region", { name: "대체 텍스트" });
      expect((within(again).getByLabelText("한 줄 대체 텍스트") as HTMLTextAreaElement).value).toBe("첫 구간 고친 글");

      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      await act(async () => {
        fireEvent.change(input as HTMLInputElement, { target: { files: [pngFile(800, 1_000, "other.png")] } });
      });
      await waitFor(() => expect(screen.queryByRole("region", { name: "대체 텍스트" })).toBeNull());
    });
  });

  describe("실패·중단·닫기", () => {
    it("실패하면 사유와 다음 행동을 알리고 자동으로 다시 보내지 않는다", async () => {
      connectClaude();
      runAltText.mockRejectedValue(new Error("요청이 너무 많아요."));
      renderDialog();
      await chooseImage();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("설명을 만들지 못했어요. 내용을 확인하고 다시 시도해 주세요. (요청이 너무 많아요.)");
      expect(runAltText).toHaveBeenCalledTimes(1);
      expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("중단하면 요청을 취소하고 오류가 아니라 중단으로 보여 준다", async () => {
      connectClaude();
      let signal: AbortSignal | undefined;
      runAltText.mockImplementation((_route, _image, _context, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        signal = options.signal;
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }));
      renderDialog();
      await chooseImage();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByRole("button", { name: "중단" });
      expect(screen.getByText(/이미지를 보고 설명을 쓰는 중이에요\. 보통 10~30초 걸려요\./)).toBeTruthy();
      // 매초 바뀌는 경과 시간은 화면에만 보이고 안내 영역(role=status)에는 들어가지 않는다.
      expect(screen.getByText(/0초 경과/).closest("[role=status]")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "중단" }));
      expect(signal?.aborted).toBe(true);
      await screen.findByText("설명 만들기를 중단했어요. 이미 처리된 부분은 요금이 청구됐을 수 있어요. 필요하면 다시 시도해 주세요.");
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("닫으면 진행 중인 요청도 취소한다", async () => {
      connectClaude();
      let signal: AbortSignal | undefined;
      runAltText.mockImplementation((_route, _image, _context, options: { signal: AbortSignal }) => new Promise(() => {
        signal = options.signal;
      }));
      const { onClose } = renderDialog();
      await chooseImage();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByRole("button", { name: "중단" });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "닫기" }));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
    });
  });
});

describe("ClaudeAltTextDialog — 리뷰 반영", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    runAltText.mockReset();
    runAltText.mockResolvedValue(outcome());
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

  it("이미지를 올리기 전에는 '입력하면 계산해요'를 보여 주고 예산 경고를 띄우지 않는다", () => {
    connectClaude();
    setClaudeBudgetLimit(0.05);
    renderDialog();

    expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("입력하면 계산해요");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("이번 한 번만 예산을 넘어도 진행해요")).toBeNull();
  });

  it("'이번 한 번만'을 고른 요청만 전송 계층에 예산 판정 건너뛰기를 알린다", async () => {
    connectClaude();
    setClaudeBudgetLimit(0.02);
    renderDialog();
    await chooseImage();

    fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
    fireEvent.click(screen.getByRole("button", { name: RUN }));
    await screen.findByRole("region", { name: "대체 텍스트" });

    expect(runAltText.mock.calls[0]?.[3]).toMatchObject({ budgetOverride: true });
  });

  it("결과를 고치는 칸에서는 Ctrl+Enter가 새 요청을 보내지 않고, 키를 누르고 있어도 반복해서 보내지 않는다", async () => {
    connectClaude();
    renderDialog();
    await chooseImage();
    fireEvent.click(screen.getByRole("button", { name: RUN }));
    const region = await screen.findByRole("region", { name: "대체 텍스트" });
    expect(runAltText).toHaveBeenCalledTimes(1);

    const field = within(region).getByLabelText("한 줄 대체 텍스트");
    fireEvent.change(field, { target: { value: "내가 고친 글" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(runAltText).toHaveBeenCalledTimes(1);
    expect((within(region).getByLabelText("한 줄 대체 텍스트") as HTMLTextAreaElement).value).toBe("내가 고친 글");

    const dialog = screen.getByRole("dialog", { name: "AI 대체 텍스트 도우미" });
    fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true, repeat: true });
    expect(runAltText).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(runAltText).toHaveBeenCalledTimes(2));
  });

  it("복사에 실패하면 조용히 넘기지 않고 알린다", async () => {
    connectClaude();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    renderDialog();
    await chooseImage();
    fireEvent.click(screen.getByRole("button", { name: RUN }));
    const region = await screen.findByRole("region", { name: "대체 텍스트" });

    fireEvent.click(within(region).getByRole("button", { name: "대체 텍스트 복사" }));

    expect((await within(region).findByRole("alert")).textContent).toMatch(/복사하지 못했어요/);
  });

  it("줄어든 항목이 있으면 몇 곳인지 알린다", async () => {
    connectClaude();
    const trimmed = outcome("detailed");
    runAltText.mockResolvedValue({ ...trimmed, view: { ...trimmed.view, trimmed: 2 } });
    renderDialog();
    await chooseImage();

    fireEvent.click(screen.getByRole("button", { name: RUN }));
    await screen.findByRole("region", { name: "대체 텍스트" });

    expect(document.querySelector("[data-claude-trimmed]")?.textContent).toContain("2곳의 내용이 줄었어요");
  });
});
