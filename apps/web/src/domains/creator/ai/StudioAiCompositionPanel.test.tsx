// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_AI_DEFAULT_SETTINGS, type StudioTextAiTransport } from "./studio-ai-client";
import { StudioAiCompositionPanel } from "./StudioAiCompositionPanel";

const { suggestSceneCompositionMock } = vi.hoisted(() => ({
  suggestSceneCompositionMock: vi.fn(),
}));

vi.mock("./studio-ai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-ai-client")>();
  return {
    ...actual,
    suggestSceneComposition: suggestSceneCompositionMock,
  };
});

const OPERATION_ID = "composition-00000000-0000-4000-8000-000000000031";

beforeEach(() => {
  suggestSceneCompositionMock.mockReset();
  suggestSceneCompositionMock.mockResolvedValue({
    ok: true,
    data: {
      suggestion: "미디엄샷",
      textProvenance: {
        provider: "zai",
        model: "glm-5.1",
        transport: "server",
        promptVersion: 1,
        createdAt: "2026-07-22T00:00:00.000Z",
      },
    },
  });
});

afterEach(cleanup);

describe("StudioAiCompositionPanel server operation identity", () => {
  it("explains the automatic free-first path before a connection is available", () => {
    render(
      <StudioAiCompositionPanel
        settings={STUDIO_AI_DEFAULT_SETTINGS}
        configured={false}
      />
    );

    expect(screen.getByText(/장면 초안은 먼저 작성할 수 있어요/u)).toBeTruthy();
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "구도 제안 받기" }).hasAttribute("disabled"))
      .toBe(true);
    const settingsLink = screen.getByRole("link", { name: "AI 설정 열기" });
    expect(settingsLink.getAttribute("href")).toBe("/settings/ai");
    expect(settingsLink.getAttribute("target")).toBe("_blank");
  });

  it("binds the tracked operation ID to the server request and settlement", async () => {
    const onOperationStart = vi.fn(() => OPERATION_ID);
    const onOperationSettled = vi.fn();
    render(
      <StudioAiCompositionPanel
        settings={STUDIO_AI_DEFAULT_SETTINGS}
        transport={{ mode: "server", provider: "zai" }}
        configured
        onOperationStart={onOperationStart}
        onOperationSettled={onOperationSettled}
      />
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "비 오는 옥상" } });
    fireEvent.click(screen.getByRole("button", { name: "구도 제안 받기" }));

    await waitFor(() => expect(suggestSceneCompositionMock).toHaveBeenCalledOnce());
    expect(onOperationStart).toHaveBeenCalledWith("비 오는 옥상");
    expect(suggestSceneCompositionMock).toHaveBeenCalledWith(
      STUDIO_AI_DEFAULT_SETTINGS,
      "비 오는 옥상",
      { mode: "server", provider: "zai", operationId: OPERATION_ID, signal: expect.any(AbortSignal) },
      { difficulty: "standard", length: "standard", creativity: "balanced" }
    );
    expect(onOperationSettled).toHaveBeenCalledWith(expect.objectContaining({
      operationId: OPERATION_ID,
      result: expect.objectContaining({ ok: true }),
    }));
  });

  it("B컷의 재요청이 진행되거나 실패해도 직전 A컷 제안은 A컷에만 추가한다", async () => {
    let finishSecond: (value: unknown) => void = () => { throw new Error("B 요청을 시작하지 않았습니다."); };
    const second = new Promise((resolve) => { finishSecond = resolve; });
    suggestSceneCompositionMock
      .mockResolvedValueOnce({ ok: true, data: { suggestion: "A컷 구도 제안" } })
      .mockReturnValueOnce(second);
    const onInsertAsNote = vi.fn();
    const props = {
      settings: STUDIO_AI_DEFAULT_SETTINGS,
      configured: true,
      onInsertAsNote,
    };
    const { rerender } = render(
      <StudioAiCompositionPanel {...props} activePageId="cut-a" activePageLabel="1컷" sceneText="A 초안" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "구도 제안 받기" }));
    expect(await screen.findByText("A컷 구도 제안")).toBeTruthy();

    rerender(
      <StudioAiCompositionPanel {...props} activePageId="cut-b" activePageLabel="2컷" sceneText="B 초안" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "구도 제안 받기" }));
    const insertOriginal = () => fireEvent.click(
      screen.getByRole("button", { name: "원래 1컷에 메모로 추가" }),
    );
    insertOriginal();
    await act(async () => {
      finishSecond({ ok: false, code: "network_error", error: "B컷 요청에 실패했습니다." });
    });
    insertOriginal();
    expect(onInsertAsNote.mock.calls).toEqual([
      ["A컷 구도 제안", "cut-a"],
      ["A컷 구도 제안", "cut-a"],
    ]);
  });

  it("취소 버튼은 실제 요청 신호를 끊고 늦은 응답을 취소로 기록한다", async () => {
    let finishRequest: (value: unknown) => void = () => { throw new Error("요청을 시작하지 않았습니다."); };
    const request = new Promise((resolve) => { finishRequest = resolve; });
    suggestSceneCompositionMock.mockReturnValueOnce(request);
    const onOperationSettled = vi.fn();
    render(
      <StudioAiCompositionPanel
        settings={STUDIO_AI_DEFAULT_SETTINGS}
        transport={{ mode: "server", provider: "zai" }}
        configured
        sceneText="취소할 합성 장면 초안"
        onOperationStart={() => OPERATION_ID}
        onOperationSettled={onOperationSettled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "구도 제안 받기" }));
    const transport = suggestSceneCompositionMock.mock.calls[0][2] as StudioTextAiTransport;
    expect(transport.signal?.aborted).toBe(false);
    fireEvent.click(screen.getByTestId("composition-cancel-btn"));
    expect(transport.signal?.aborted).toBe(true);

    await act(async () => {
      finishRequest({ ok: true, data: { suggestion: "늦게 도착한 구도 제안" } });
    });
    expect(screen.queryByText("늦게 도착한 구도 제안")).toBeNull();
    expect(onOperationSettled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      operationId: OPERATION_ID,
      aborted: true,
      result: expect.objectContaining({ ok: false }),
    }));
  });

  it("renders the shared answer-tuning controls and passes a changed tuning into the request", async () => {
    render(
      <StudioAiCompositionPanel
        settings={STUDIO_AI_DEFAULT_SETTINGS}
        configured
      />
    );

    // 공통 부품(난이도·길이·창의성)이 상시 노출된다.
    expect(screen.getByRole("radiogroup", { name: "난이도" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "답변 길이" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "창의성" })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "깊게" }));
    fireEvent.click(screen.getByRole("radio", { name: "자유롭게" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "비 오는 옥상" } });
    fireEvent.click(screen.getByRole("button", { name: "구도 제안 받기" }));

    await waitFor(() => expect(suggestSceneCompositionMock).toHaveBeenCalledOnce());
    expect(suggestSceneCompositionMock).toHaveBeenCalledWith(
      STUDIO_AI_DEFAULT_SETTINGS,
      "비 오는 옥상",
      { mode: "byok", signal: expect.any(AbortSignal) },
      { difficulty: "deep", length: "standard", creativity: "free" }
    );
  });
});
