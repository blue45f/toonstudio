// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY,
  STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY,
  readStudioVirtualSpaceEntryPreference,
  writeStudioVirtualSpaceEntryPreference,
} from "./studio-virtual-space-entry-preference";
import { StudioVirtualAvatarPersistenceNotice } from "./studio-virtual-avatar-persistence";
import { useStudioVirtualAvatarPersistence } from "./use-studio-virtual-avatar-persistence";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));

function Choice({ personal = true }: { readonly personal?: boolean }) {
  const [current, setCurrent] = useState(0);
  const persistence = useStudioVirtualAvatarPersistence();
  const choose = (index: number) => { setCurrent(index); persistence.save(index); };
  return <>
    <span aria-label="현재 화면 캐릭터">{current}</span>
    <button onClick={() => choose(1)}>시나 선택</button>
    <button onClick={() => choose(2)}>지훈 선택</button>
    <button onClick={() => choose(-1)}>자동 선택</button>
    <StudioVirtualAvatarPersistenceNotice status={persistence.status} onRetry={persistence.retry} personal={personal} />
  </>;
}

beforeEach(() => {
  localStorage.clear();
  expect(writeStudioVirtualSpaceEntryPreference(0, "회귀 검사")).toBe(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("캐릭터 선택의 현재 적용과 브라우저 저장", () => {
  it("명시 선택의 실제 저장이 성공한 뒤에만 완료 안내를 표시한다", () => {
    render(<Choice />);
    expect(screen.queryByText("이 브라우저에 캐릭터 선택을 저장했어요.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "시나 선택" }));
    expect(readStudioVirtualSpaceEntryPreference()).toMatchObject({ avatarIndex: 1, nickname: "회귀 검사" });
    expect(screen.getByText("이 브라우저에 캐릭터 선택을 저장했어요.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("저장 거부 때 현재 선택을 유지하고 명시 재시도가 성공하면 오류를 해제한다", () => {
    const original = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === localStorage && key === STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY && blocked) {
        throw new DOMException("단위 검사 저장 거부", "QuotaExceededError");
      }
      original.call(this, key, value);
    });
    render(<Choice />);
    fireEvent.click(screen.getByRole("button", { name: "시나 선택" }));
    expect(screen.getByLabelText("현재 화면 캐릭터").textContent).toBe("1");
    expect(readStudioVirtualSpaceEntryPreference().avatarIndex).toBe(0);
    expect(screen.getByRole("alert").textContent).toContain("이전 모습");
    expect(screen.queryByText("이 브라우저에 캐릭터 선택을 저장했어요.")).toBeNull();
    blocked = false;
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 저장 다시 시도" }));
    expect(screen.getByLabelText("현재 화면 캐릭터").textContent).toBe("1");
    expect(readStudioVirtualSpaceEntryPreference()).toMatchObject({ avatarIndex: 1, nickname: "회귀 검사" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("이 브라우저에 캐릭터 선택을 저장했어요.")).toBeTruthy();
  });

  it("실패 후 다른 캐릭터를 고르면 마지막 명시 선택만 다시 저장한다", () => {
    const original = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === localStorage && key === STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY && blocked) throw new DOMException("단위 검사", "QuotaExceededError");
      original.call(this, key, value);
    });
    render(<Choice />);
    fireEvent.click(screen.getByRole("button", { name: "시나 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "지훈 선택" }));
    expect(screen.getByLabelText("현재 화면 캐릭터").textContent).toBe("2");
    blocked = false;
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 저장 다시 시도" }));
    expect(readStudioVirtualSpaceEntryPreference().avatarIndex).toBe(2);
  });

  it("두 저장 키 중 하나만 기록됐을 때 완료라고 표시하지 않는다", () => {
    const original = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === localStorage && key === STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY && blocked) throw new DOMException("단위 검사", "QuotaExceededError");
      original.call(this, key, value);
    });
    render(<Choice />);
    fireEvent.click(screen.getByRole("button", { name: "시나 선택" }));
    expect(readStudioVirtualSpaceEntryPreference().avatarIndex).toBe(1);
    expect(localStorage.getItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY)).toBe("0");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("이 브라우저에 캐릭터 선택을 저장했어요.")).toBeNull();
    blocked = false;
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 저장 다시 시도" }));
    expect(localStorage.getItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY)).toBe("1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("자동 선택과 팀 연결 상태를 브라우저 저장과 구분한다", () => {
    render(<Choice personal={false} />);
    fireEvent.click(screen.getByRole("button", { name: "자동 선택" }));
    expect(readStudioVirtualSpaceEntryPreference().avatarIndex).toBe(-1);
    expect(screen.getByText("브라우저 저장과 팀 연결·공유 상태는 별개예요.")).toBeTruthy();
  });
});
