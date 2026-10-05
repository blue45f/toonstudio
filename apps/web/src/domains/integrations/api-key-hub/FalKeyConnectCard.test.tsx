// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  browserStudioFalSessionStorage,
  loadStudioFalApiKey,
  saveStudioFalApiKey,
} from "@/domains/creator/public/studio-lora-fal-key";

import { FalKeyConnectCard } from "./FalKeyConnectCard";

describe("FalKeyConnectCard", () => {
  afterEach(cleanup);
  beforeEach(() => {
    globalThis.sessionStorage?.clear();
  });

  it("키가 없으면 미설정으로 보이고, 등록하면 세션 저장소에 저장된다", () => {
    render(<FalKeyConnectCard />);
    expect(screen.getByText("미설정")).toBeTruthy();
    const register = screen.getByRole("button", { name: "등록하기" });
    expect((register as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/API 키 붙여넣기/), {
      target: { value: "fal-key-1234567890" },
    });
    fireEvent.click(register);

    expect(screen.getByText("연결됨")).toBeTruthy();
    expect(loadStudioFalApiKey(browserStudioFalSessionStorage())).toBe("fal-key-1234567890");
    // 원문은 화면에 렌더되지 않고 마스킹만 보인다.
    expect(screen.queryByText("fal-key-1234567890")).toBeNull();
    expect(screen.getByText(/7890/)).toBeTruthy();
  });

  it("이미 등록된 키가 있으면 연결됨으로 시작하고 해제할 수 있다", () => {
    saveStudioFalApiKey(browserStudioFalSessionStorage(), "fal-existing-key-42");
    render(<FalKeyConnectCard />);
    expect(screen.getByText("연결됨")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "fal.ai API 키 연결 해제" }));
    expect(screen.getByText("미설정")).toBeTruthy();
    expect(loadStudioFalApiKey(browserStudioFalSessionStorage())).toBe("");
  });

  it("너무 짧은 키는 등록되지 않고 안내가 뜬다", () => {
    render(<FalKeyConnectCard />);
    fireEvent.change(screen.getByLabelText(/API 키 붙여넣기/), {
      target: { value: "short" },
    });
    // 형식 검증에 걸리면 등록 버튼이 비활성이라 클릭 경로 대신 상태를 확인한다.
    expect((screen.getByRole("button", { name: "등록하기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(loadStudioFalApiKey(browserStudioFalSessionStorage())).toBe("");
  });
});
