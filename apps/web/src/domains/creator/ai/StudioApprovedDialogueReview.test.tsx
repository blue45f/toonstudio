// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { StudioApprovedDialogueReview } from "./StudioApprovedDialogueReview";

const props = { cutId: "cut-3", approvedDialogue: "내일까진 오지 마.", currentDialogue: "오늘까지 와." };
const response = (approvedQuote = "내일까진", currentQuote = "오늘까지") => new Response(JSON.stringify({
  provider: "openai", result: { findings: [{ kind: "deadline", approvedQuote, currentQuote, explanation: "시한이 하루 앞당겨졌어요." }] },
}));
const start = () => fireEvent.click(screen.getByRole("button", { name: "OpenAI로 대사 의미 비교" }));
function deferredFetch() {
  let deliver!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => { deliver = resolve; });
  return { fetch: vi.fn<typeof fetch>().mockReturnValue(promise), deliver };
}

describe("승인 컷 대사 비교", () => {
  beforeEach(() => { useI18n.setState({ lang: "ko" }); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("사용자가 실행하면 현재 두 대사만 보내고 원문 인용과 근거를 보여 준다", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetch);
    render(<StudioApprovedDialogueReview {...props} />);
    expect(fetch).not.toHaveBeenCalled();
    start();
    expect(await screen.findByText("시한이 하루 앞당겨졌어요.")).toBeTruthy();
    expect(screen.getByText("승인본 · 내일까진")).toBeTruthy();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ approvedDialogue: props.approvedDialogue, currentDialogue: props.currentDialogue });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["컷 이동", "수동 편집", "취소"])("%s 뒤 도착한 결과를 폐기하고 같은 요청을 자동 재전송하지 않는다", async (change) => {
    const request = deferredFetch();
    vi.stubGlobal("fetch", request.fetch);
    const view = render(<StudioApprovedDialogueReview {...props} />);
    start();
    expect(screen.getByText("두 대사를 비교하고 있어요.")).toBeTruthy();
    if (change === "취소") fireEvent.click(screen.getByRole("button", { name: "비교 취소" }));
    else view.rerender(<StudioApprovedDialogueReview {...props} {...(change === "컷 이동" ? { cutId: "cut-4" } : { currentDialogue: "나중에 와." })} />);
    await act(async () => { request.deliver(response()); });
    expect(request.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(screen.queryByText("시한이 하루 앞당겨졌어요.")).toBeNull();
    expect(request.fetch).toHaveBeenCalledTimes(1);
  });

  it("근거가 틀린 응답은 숨기고 사용자가 재시도하면 새 결과를 받는다", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response("모레까지")).mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetch);
    render(<StudioApprovedDialogueReview {...props} />);
    start();
    expect(await screen.findByText(/AI 비교 결과를 확인하지 못했어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "의미 비교 다시 시도" }));
    expect(await screen.findByText("시한이 하루 앞당겨졌어요.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("같은 대사와 입력 한도 초과에서는 전송하지 않는다", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const view = render(<StudioApprovedDialogueReview {...props} currentDialogue={props.approvedDialogue} />);
    expect(screen.queryByRole("button")).toBeNull();
    view.rerender(<StudioApprovedDialogueReview {...props} currentDialogue={"힛".repeat(2_001)} />);
    expect(screen.getByText(/2,000자/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
