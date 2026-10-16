// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { PanelImportEntry, type PanelWorkbenchLoader } from "./PanelImportEntry";
import { createKit, renderInRouter } from "./panel-ui-test-kit";

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });

const realLoader: PanelWorkbenchLoader = () => import("./PanelImportWorkbench").then((module) => ({ default: module.PanelImportWorkbench }));

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => {
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("Studio 가져오기 — 원고 이미지 도우미 진입 구역", () => {
  it("두 가지 모드를 소개하고 이미지가 이 기기에서만 처리된다고 알린다", () => {
    renderInRouter(<PanelImportEntry environment={createKit().env} />);
    expect(screen.getByRole("heading", { level: 2, name: "스캔한 원고에서 컷을 찾거나, 긴 원고를 카드로 나누기" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "컷 자동 감지 · 세로 재배열" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "카드뉴스 슬라이스 (4:5)" })).toBeTruthy();
    expect(screen.getByText(/이미지는 이 기기 안에서만 처리하고 서버로 보내지 않아요/)).toBeTruthy();
    expect(screen.getByText(/내가 권리를 가진 원고이거나 이용 허락을 받은 원고만 사용해 주세요/)).toBeTruthy();
    // 무거운 작업대는 시작을 누르기 전에는 열리지 않는다.
    expect(screen.queryByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" })).toBeNull();
  });

  it("시작을 누르면 지연 로딩 표시 뒤에 작업대가 열리고, 닫으면 모드 선택으로 돌아온다", async () => {
    renderInRouter(<PanelImportEntry environment={createKit().env} />);
    fireEvent.click(button("컷 찾기 시작"));
    expect(await screen.findByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "카드뉴스 슬라이스 (4:5)" })).toBeNull();
    fireEvent.click(button("작업대 닫기"));
    expect(screen.getByRole("heading", { level: 3, name: "카드뉴스 슬라이스 (4:5)" })).toBeTruthy();
  });

  it("카드뉴스 모드로도 열 수 있다", async () => {
    renderInRouter(<PanelImportEntry environment={createKit().env} />);
    fireEvent.click(button("카드 나누기 시작"));
    expect(await screen.findByText("긴 세로 원고 이미지 한 장을 골라 주세요. 4:5(1080×1350) 카드로 나눠요. Studio 에서 내보낸 세로 이미지도 쓸 수 있어요.")).toBeTruthy();
  });

  it("작업대 코드를 불러오지 못하면 이 구역만 안내로 바뀌고, 다시 시도하면 열린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let attempts = 0;
    const loader: PanelWorkbenchLoader = () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("chunk load failed")) : realLoader();
    };
    renderInRouter(<PanelImportEntry environment={createKit().env} loadWorkbench={loader} />);
    fireEvent.click(button("컷 찾기 시작"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("작업대를 열지 못했어요");
    expect(alert.textContent).toContain("어디로도 보내지 않았어요");
    // 가져오기 화면의 나머지는 그대로 남는다.
    expect(screen.getByRole("heading", { level: 2, name: "스캔한 원고에서 컷을 찾거나, 긴 원고를 카드로 나누기" })).toBeTruthy();
    fireEvent.click(button("다시 시도"));
    expect(await screen.findByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("불러오기에 실패했을 때 닫으면 모드 선택으로 돌아온다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderInRouter(<PanelImportEntry environment={createKit().env} loadWorkbench={() => Promise.reject(new Error("offline"))} />);
    fireEvent.click(button("카드 나누기 시작"));
    await screen.findByRole("alert");
    fireEvent.click(button("닫기"));
    expect(screen.getByRole("heading", { level: 3, name: "컷 자동 감지 · 세로 재배열" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("언어를 바꾸면 열려 있는 구역과 작업대가 함께 바뀐다", async () => {
    renderInRouter(<PanelImportEntry environment={createKit().env} />);
    fireEvent.click(button("컷 찾기 시작"));
    await screen.findByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" });
    act(() => { useI18n.getState().setLang("en"); });
    expect(await screen.findByRole("heading", { name: "1. Confirm rights and choose the image" })).toBeTruthy();
    expect(screen.getByText("MANUSCRIPT HELPER")).toBeTruthy();
    expect(screen.getByText(/Images are processed only on this device and never uploaded/)).toBeTruthy();
  });
});
