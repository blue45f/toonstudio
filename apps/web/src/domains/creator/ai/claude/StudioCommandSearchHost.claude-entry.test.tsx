// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";

import { StudioCommandSearchHost } from "../../StudioCommandSearchHost";

const FAKE_KEY = "sk-test-mobile-entry-0000";

function connectClaude() {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      ...structuredClone(EMPTY_AI_CONNECTION),
      id: "claude-byok",
      label: "Claude (Anthropic)",
      baseUrl: "https://api.anthropic.com",
      apiKey: FAKE_KEY,
      textModel: "claude-opus-5-5",
      imageModel: "",
      costPolicy: "user-funded-byok",
      apiKeys: [{ id: "key-1", label: "기본 키", apiKey: FAKE_KEY, enabled: true, priority: 100 }],
      models: [{ id: "text-1", label: "Claude", model: "claude-opus-5-5", capability: "text", enabled: true, priority: 100 }],
    }],
    assignments: { text: "claude-byok", image: null, inference: null, "three-d": null },
  });
}

describe("검색 호스트의 Claude 보조 입구(모바일)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
  });

  afterEach(() => {
    cleanup();
    lockUserAi(false);
  });

  it("검색 트리거를 숨기는 모바일에서도 Claude 연결이 있으면 보조 메뉴 단추가 남는다", async () => {
    connectClaude();
    render(<MemoryRouter><StudioCommandSearchHost hideTrigger /></MemoryRouter>);

    expect(screen.queryByTestId("studio-command-search-trigger")).toBeNull();
    await waitFor(() => expect(document.querySelector('[data-claude-assist="menu"]')).not.toBeNull());
    expect(document.querySelector("[data-claude-assist-mobile-row]")?.querySelector('[data-claude-assist="menu"]')).not.toBeNull();
  });

  it("연결이 없으면 아무것도 그리지 않아 빈 줄이 남지 않는다(empty:hidden)", () => {
    render(<MemoryRouter><StudioCommandSearchHost hideTrigger /></MemoryRouter>);

    const row = document.querySelector("[data-claude-assist-mobile-row]");
    expect(row).not.toBeNull();
    expect(row?.childElementCount).toBe(0);
    expect(row?.className).toContain("empty:hidden");
  });
});
