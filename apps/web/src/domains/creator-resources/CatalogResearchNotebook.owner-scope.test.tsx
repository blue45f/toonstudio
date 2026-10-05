/**
 * 카탈로그 리서치 기획 노트 소유자 스코프 회귀 테스트.
 *
 * 기획 노트가 계정 구분 없이 레거시 단일 키를 공유해, 계정을 바꾸면
 * 이전 계정의 노트가 그대로 보이고 그 위에 덮어쓸 수 있던 혼선을
 * 막는다. 소유자 키잉·claim 계약은 학습 기록·마켓 찜과 같다.
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogResearchNotebook } from "./CatalogResearchNotebook";
import {
  emptyResearchNotebook,
  RESEARCH_NOTE_KEY,
  researchNoteStorageKey,
} from "@/shared/lib/catalog-research";

import type { ResearchSnapshot } from "@/shared/lib/catalog-research";

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  listeners: new Set<(session: { user: { id: string } } | null) => void>(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.userId,
  listeners: auth.listeners,
}));

function actSwitch(userId: string | null) {
  act(() => {
    auth.userId = userId;
    const session = userId ? { user: { id: userId } } : null;
    auth.listeners.forEach((listener) => listener(session));
  });
}

const snapshot: ResearchSnapshot = {
  version: 1,
  sourceVersion: "test",
  sourceHash: "hash-1",
  collectedAt: null,
  enrichedAt: null,
  inputCount: 0,
  excludedCount: 0,
  dictionary: [],
  rows: [],
};

function renderNotebook() {
  return render(<MemoryRouter><CatalogResearchNotebook works={[]} snapshot={snapshot} onRestore={() => {}} /></MemoryRouter>);
}

async function saveWithQuestion(question: string) {
  const input = await screen.findByLabelText(/조사 질문/u);
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "기획 노트 저장" }));
  await screen.findByText(/이 브라우저에 기획 노트를 저장했습니다/u);
}

beforeEach(() => {
  localStorage.clear();
  auth.userId = null;
  auth.listeners.clear();
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_key: string, operation: () => unknown) => operation() },
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("카탈로그 리서치 기획 노트 소유자 스코프", () => {
  it("계정마다 노트가 갈라져 저장되고 레거시 키는 건드리지 않는다", async () => {
    auth.userId = "user-a";
    renderNotebook();
    await saveWithQuestion("계정 A의 비밀 기획");
    expect(localStorage.getItem(researchNoteStorageKey("user-a"))).toContain("계정 A의 비밀 기획");
    expect(localStorage.getItem(RESEARCH_NOTE_KEY)).toBeNull();

    actSwitch("user-b");
    const input = await screen.findByLabelText(/조사 질문/u);
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));

    actSwitch("user-a");
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe("계정 A의 비밀 기획"));
  });

  it("레거시는 게스트가 claim 하지 않고 첫 계정이 읽는 자리에서 claim 한다", async () => {
    localStorage.setItem(RESEARCH_NOTE_KEY, JSON.stringify({
      ...emptyResearchNotebook(),
      question: "레거시 기획",
    }));
    renderNotebook();
    const input = await screen.findByLabelText(/조사 질문/u);
    // 게스트 파티션은 빈 채로 시작하고 레거시는 그대로 남는다.
    expect((input as HTMLTextAreaElement).value).toBe("");
    expect(localStorage.getItem(RESEARCH_NOTE_KEY)).not.toBeNull();

    actSwitch("user-a");
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe("레거시 기획"));
    expect(localStorage.getItem(RESEARCH_NOTE_KEY)).toBeNull();
    expect(localStorage.getItem(researchNoteStorageKey("user-a"))).toContain("레거시 기획");

    actSwitch("user-b");
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
  });
});
