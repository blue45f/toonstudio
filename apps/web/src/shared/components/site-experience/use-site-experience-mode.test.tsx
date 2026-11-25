// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXPERIENCE_MODE_KEY } from "./site-experience-policy";
import { useSiteExperienceMode } from "./use-site-experience-mode";

function PreferenceProbe() {
  const { mode, setMode } = useSiteExperienceMode();
  return <><output aria-label="사이트 배경 선택">{mode}</output>
    <button type="button" onClick={() => setMode("vivid")}>화려하게 선택</button>
    <button type="button" onClick={() => setMode("calm")}>차분하게 선택</button></>;
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("컨텍스트 없는 사이트 연출 설정", () => {
  it("처음에는 calm이고 기존 키에 저장한 선택을 새 마운트에서 복구한다", () => {
    localStorage.setItem("설정 보존", "기존 값");
    const first = render(<PreferenceProbe />);
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("calm");
    fireEvent.click(screen.getByRole("button", { name: "화려하게 선택" }));
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("vivid");
    expect(localStorage.getItem(EXPERIENCE_MODE_KEY)).toBe("vivid");
    expect(localStorage.getItem("설정 보존")).toBe("기존 값");
    first.unmount();
    render(<PreferenceProbe />);
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("vivid");
    fireEvent.click(screen.getByRole("button", { name: "차분하게 선택" }));
    expect(localStorage.getItem(EXPERIENCE_MODE_KEY)).toBe("calm");
  });

  it("알 수 없는 저장값은 기존 계약대로 calm으로 읽는다", () => {
    localStorage.setItem(EXPERIENCE_MODE_KEY, "unknown-mode");
    render(<PreferenceProbe />);
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("calm");
  });

  it("다른 탭의 같은 키 변경과 전체 삭제를 반영하고 무관한 키 이벤트는 무시한다", () => {
    render(<PreferenceProbe />);
    localStorage.setItem(EXPERIENCE_MODE_KEY, "vivid");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "무관한 설정" })));
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("calm");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: EXPERIENCE_MODE_KEY })));
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("vivid");
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("calm");
  });

  it("저장소 접근이 거부돼도 calm으로 열리고 현재 선택은 사용할 수 있다", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    render(<PreferenceProbe />);
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("calm");
    fireEvent.click(screen.getByRole("button", { name: "화려하게 선택" }));
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("vivid");
  });

  it("쓰기만 거부될 때 현재 선택은 유지하고 저장값은 바뀌지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    render(<PreferenceProbe />);
    fireEvent.click(screen.getByRole("button", { name: "화려하게 선택" }));
    expect(screen.getByLabelText("사이트 배경 선택").textContent).toBe("vivid");
    expect(localStorage.getItem(EXPERIENCE_MODE_KEY)).toBeNull();
  });
});
