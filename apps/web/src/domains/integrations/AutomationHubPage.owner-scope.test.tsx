/**
 * 자동화 허브 소유자 스코프 회귀 테스트.
 *
 * 자동화 레시피가 계정 구분 없이 레거시 단일 키를 공유하던 혼선을 막는다.
 * 세션 전환 시 그 계정의 파티션을 다시 읽고, 저장하지 않은 편집은 전환을
 * 따라가지 않으며, 저장은 현재 소유자 키로만 쓴다.
 * 세션은 hoisted 모의 상태로 몰아 테스트가 소유자 전환을 직접 일으킨다
 * (학습 실습 소유자 스코프 테스트와 같은 방식).
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutomationHubPage } from "./AutomationHubPage";
import {
  RECIPE_STORAGE_KEY,
  recipeDraftFromTemplate,
  recipeStorageKey,
} from "./integration-platform-storage";
import type { IntegrationRecipeTemplate } from "./integration-platform-types";

const template: IntegrationRecipeTemplate = {
  id: "review-meeting",
  name: "Review meeting",
  trigger: "review.requested",
  actions: ["calendar.create", "meeting.create", "message.send"],
};

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  listeners: new Set<(session: { user: { id: string } } | null) => void>(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.userId,
  listeners: auth.listeners,
}));

vi.mock("./integration-platform-client", () => ({
  integrationPlatformClient: {
    catalog: vi.fn(async () => ({ generatedAt: "2026-10-05T00:00:00.000Z", providers: [], categories: [] })),
    recipes: vi.fn(async () => ({ events: [], actions: [], templates: [template] })),
    validateRecipe: vi.fn(),
  },
}));

function switchSession(userId: string | null) {
  auth.userId = userId;
  const session = userId ? { user: { id: userId } } : null;
  auth.listeners.forEach((listener) => listener(session));
}
function actSwitch(userId: string | null) {
  act(() => {
    switchSession(userId);
  });
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/settings/automation"]}>
      <AutomationHubPage />
    </MemoryRouter>,
  );
}

const namedRaw = (name: string) =>
  JSON.stringify([{ ...recipeDraftFromTemplate(template), name }]);

beforeEach(() => {
  localStorage.clear();
  auth.userId = null;
  auth.listeners.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("자동화 허브 소유자 스코프 (페이지 바인딩)", () => {
  it("첫 로그인 계정으로 열면 레거시 레시피를 claim 해 보여준다", async () => {
    localStorage.setItem(RECIPE_STORAGE_KEY, namedRaw("레거시 레시피"));
    auth.userId = "user-a";

    mount();
    expect(await screen.findByDisplayValue("레거시 레시피")).toBeTruthy();
    expect(localStorage.getItem(RECIPE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(recipeStorageKey("user-a"))).toBe(namedRaw("레거시 레시피"));
  });

  it("게스트로 열면 레거시를 claim 하지 않고 템플릿 기본값을 보여준다", async () => {
    localStorage.setItem(RECIPE_STORAGE_KEY, namedRaw("레거시 레시피"));

    mount();
    expect(await screen.findByDisplayValue("Review meeting")).toBeTruthy();
    expect(localStorage.getItem(RECIPE_STORAGE_KEY)).toBe(namedRaw("레거시 레시피"));
    expect(localStorage.getItem(recipeStorageKey("guest"))).toBeNull();
  });

  it("계정을 바꾸면 그 계정의 파티션을 보여주고 저장은 현재 소유자 키로만 쓴다", async () => {
    localStorage.setItem(recipeStorageKey("user-a"), namedRaw("A의 레시피"));
    auth.userId = "user-a";

    mount();
    expect(await screen.findByDisplayValue("A의 레시피")).toBeTruthy();

    actSwitch("user-b");
    expect(await screen.findByDisplayValue("Review meeting")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Review meeting"), { target: { value: "B의 레시피" } });
    fireEvent.click(screen.getByRole("button", { name: /구성 저장|Save recipes/ }));
    expect(localStorage.getItem(recipeStorageKey("user-b"))).toBe(namedRaw("B의 레시피"));
    expect(localStorage.getItem(recipeStorageKey("user-a"))).toBe(namedRaw("A의 레시피"));

    actSwitch("user-a");
    expect(await screen.findByDisplayValue("A의 레시피")).toBeTruthy();

    // 로그아웃하면 게스트 파티션(빈 구성)으로 돌아간다.
    actSwitch(null);
    expect(await screen.findByDisplayValue("Review meeting")).toBeTruthy();
    expect(localStorage.getItem(recipeStorageKey("guest"))).toBeNull();
  });

  it("저장하지 않은 편집은 소유자 전환을 따라가지 않는다", async () => {
    localStorage.setItem(recipeStorageKey("user-a"), namedRaw("A의 레시피"));
    auth.userId = "user-a";

    mount();
    const input = await screen.findByDisplayValue("A의 레시피");
    fireEvent.change(input, { target: { value: "저장 안 한 편집" } });
    expect(screen.getByDisplayValue("저장 안 한 편집")).toBeTruthy();

    actSwitch("user-b");
    expect(await screen.findByDisplayValue("Review meeting")).toBeTruthy();

    actSwitch("user-a");
    expect(await screen.findByDisplayValue("A의 레시피")).toBeTruthy();
    expect(screen.queryByDisplayValue("저장 안 한 편집")).toBeNull();
    expect(localStorage.getItem(recipeStorageKey("user-a"))).toBe(namedRaw("A의 레시피"));
  });
});
