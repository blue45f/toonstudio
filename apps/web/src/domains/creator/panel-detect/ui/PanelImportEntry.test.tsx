// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { detectPanels } from "../panel-detect-core";
import { fakePngFile } from "../panel-detect-test-doubles";
import { PANEL_IMPORT_RIGHTS_STATEMENT_KO } from "../panel-import-rights";

import { PanelImportEntry, type PanelWorkbenchLoader } from "./PanelImportEntry";
import { createKit, renderInRouter, samplePage } from "./panel-ui-test-kit";

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
    expect(screen.getByText(/이 도구는 이미지를 이 기기 안에서만 처리하고 서버로 보내지 않아요/)).toBeTruthy();
    // 이 도구가 보내지 않는다는 말이지, Studio 문서로 넣은 뒤의 저장·동기화까지 덮는 약속이 아니다.
    expect(screen.getByText(/Studio 문서로 넣은 뒤의 저장과 동기화는 Studio 의 규칙을 따라요/)).toBeTruthy();
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

  it("시작 단추가 작업대로 바뀌어도 포커스를 잃지 않고 작업대 1단계 제목으로 간다", async () => {
    renderInRouter(<PanelImportEntry environment={createKit().env} />);
    const start = button("컷 찾기 시작");
    start.focus();
    expect(document.activeElement).toBe(start);
    fireEvent.click(start);
    const heading = await screen.findByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" });
    expect(document.activeElement).toBe(heading);
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
    expect(alert.textContent).toContain("이 도구는 이미지를 서버로 보내지 않아요");
    // 이 안내는 렌더 오류에도 뜨므로 이미지를 읽었는지 여부는 말하지 않는다.
    expect(alert.textContent).not.toContain("아직 읽지");
    // 가져오기 화면의 나머지는 그대로 남는다.
    expect(screen.getByRole("heading", { level: 2, name: "스캔한 원고에서 컷을 찾거나, 긴 원고를 카드로 나누기" })).toBeTruthy();
    fireEvent.click(button("다시 시도"));
    expect(await screen.findByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("이미지를 읽은 뒤 작업대가 그리다 실패해도 ‘아직 읽지 않았다’고 말하지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const kit = createKit();
    // 감지 결과 모양이 어긋나면 확인 화면을 그리다 던진다 — 이미지는 이미 읽은 뒤다.
    const broken = { ...detectPanels(samplePage().raster(), {}), panels: undefined as never };
    renderInRouter(<PanelImportEntry environment={{ ...kit.env, detect: () => Promise.resolve(broken) }} />);
    fireEvent.click(button("컷 찾기 시작"));
    fireEvent.click(await screen.findByRole("checkbox", { name: new RegExp(PANEL_IMPORT_RIGHTS_STATEMENT_KO) }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("파일 입력칸을 찾지 못했어요.");
    fireEvent.change(input, { target: { files: [fakePngFile("page-01.png", 400, 560)] } });
    await waitFor(() => expect(kit.loadSource).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("작업대를 열지 못했어요");
    expect(alert.textContent).not.toContain("아직 읽지");
    expect(alert.textContent).not.toContain("어디로도 보내지 않았어요");
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
    expect(screen.getByText(/This tool processes images only on this device and does not send them to a server/)).toBeTruthy();
    // 진입 구역과 열린 작업대(재배열 1단계)가 같은 한정을 각자 보여 준다.
    expect(screen.getAllByText(/Studio’s own saving and sync rules apply/)).toHaveLength(2);
  });
});
