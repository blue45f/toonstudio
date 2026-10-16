// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { fakePngFile } from "../panel-detect-test-doubles";
import { PANEL_IMPORT_RIGHTS_STATEMENT_KO } from "../panel-import-rights";

import { PanelImportWorkbench, type PanelImportMode } from "./PanelImportWorkbench";
import { createKit, renderInRouter, sampleStrip, type Kit, type KitOverrides } from "./panel-ui-test-kit";

function renderWorkbench(mode: PanelImportMode, overrides: KitOverrides = {}): { readonly kit: Kit; readonly onClose: ReturnType<typeof vi.fn>; readonly unmount: () => void } {
  const kit = createKit(overrides);
  const onClose = vi.fn();
  const { unmount } = renderInRouter(<PanelImportWorkbench mode={mode} onClose={onClose} environment={kit.env} />);
  return { kit, onClose, unmount };
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });

/** 렌더마다 새 환경 객체를 만들어 넘기는 부모. 환경 객체의 동일성에 기대면 안 된다는 것을 확인한다. */
function FreshEnvironmentHost({ kit }: { readonly kit: Kit }): ReactElement {
  const [renders, setRenders] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setRenders((count) => count + 1)}>다시 그리기 {renders}</button>
      <PanelImportWorkbench mode="reflow" onClose={() => undefined} environment={{ ...kit.env }} />
    </>
  );
}

async function chooseImage(name = "page-01.png"): Promise<void> {
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(PANEL_IMPORT_RIGHTS_STATEMENT_KO) }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("파일 입력칸을 찾지 못했어요.");
  fireEvent.change(input, { target: { files: [fakePngFile(name, 400, 560)] } });
}

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => { useI18n.getState().setLang("ko"); });

describe("가져오기 작업대", () => {
  it("권리 확인과 이미지 선택으로 시작하고, 고르면 모드별 흐름으로 넘어간다 (재배열)", async () => {
    const { kit } = renderWorkbench("reflow");
    expect(screen.getByText("컷 자동 감지 · 세로 재배열")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" })).toBeTruthy();
    await chooseImage();
    expect(await screen.findByRole("heading", { name: "2. 컷 확인과 고치기" })).toBeTruthy();
    expect(kit.sources).toHaveLength(1);
    expect(button("다른 원고 고르기")).toBeTruthy();
  });

  it("카드뉴스 모드는 카드 미리보기로 넘어간다", async () => {
    renderWorkbench("cards", { image: sampleStrip() });
    expect(screen.getByText("카드뉴스 슬라이스 (4:5)")).toBeTruthy();
    await chooseImage("strip.png");
    expect(await screen.findByRole("heading", { name: "2. 카드 미리보기와 조정" })).toBeTruthy();
  });

  it("다른 원고를 고르려면 한 번 더 묻고, 처음으로 돌아가면 이미지와 미리보기 주소를 해제한다", async () => {
    const { kit } = renderWorkbench("reflow");
    await chooseImage();
    await screen.findByRole("heading", { name: "2. 컷 확인과 고치기" });
    const [source] = kit.sources;
    fireEvent.click(button("다른 원고 고르기"));
    expect(screen.getByText(/지금까지 고친 컷과 설정이 사라져요/)).toBeTruthy();
    fireEvent.click(button("계속 작업"));
    expect(screen.queryByText(/지금까지 고친 컷과 설정이 사라져요/)).toBeNull();
    expect(source?.disposed).toBe(false);
    expect(kit.revoked).toEqual([]);

    fireEvent.click(button("다른 원고 고르기"));
    fireEvent.click(button("처음으로"));
    expect(await screen.findByRole("heading", { name: "1. 원고 권리 확인과 이미지 선택" })).toBeTruthy();
    expect(source?.disposed).toBe(true);
    expect(kit.revoked).toEqual(["blob:panel-preview"]);
    // 처음으로 돌아가면 권리 확인도 새로 해야 한다.
    expect((screen.getByRole("checkbox", { name: new RegExp(PANEL_IMPORT_RIGHTS_STATEMENT_KO) }) as HTMLInputElement).checked).toBe(false);
  });

  it("닫으면 알리고, 화면이 사라지면 디코딩한 이미지와 미리보기 주소를 해제한다", async () => {
    const { kit, onClose, unmount } = renderWorkbench("reflow");
    await chooseImage();
    await screen.findByRole("heading", { name: "2. 컷 확인과 고치기" });
    fireEvent.click(button("작업대 닫기"));
    expect(onClose).toHaveBeenCalledTimes(1);
    const [source] = kit.sources;
    unmount();
    await waitFor(() => expect(source?.disposed).toBe(true));
    expect(kit.revoked).toEqual(["blob:panel-preview"]);
  });

  it("부모가 렌더마다 새 환경 객체를 넘겨도 열려 있는 원고를 해제하지 않는다", async () => {
    const kit = createKit();
    renderInRouter(<FreshEnvironmentHost kit={kit} />);
    await chooseImage();
    await screen.findByRole("heading", { name: "2. 컷 확인과 고치기" });
    const [source] = kit.sources;
    fireEvent.click(screen.getByRole("button", { name: /^다시 그리기/ }));
    fireEvent.click(screen.getByRole("button", { name: /^다시 그리기/ }));
    expect(source?.disposed).toBe(false);
    expect(kit.revoked).toEqual([]);
  });

  it("영문 화면에서는 작업대 제목과 단추가 영문이다", async () => {
    useI18n.getState().setLang("en");
    renderWorkbench("cards");
    expect(screen.getByText("Card-news slicer (4:5)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close the workbench" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "1. Confirm rights and choose the image" })).toBeTruthy();
  });
});
