// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { fakePngFile } from "../panel-detect-test-doubles";
import { PANEL_IMPORT_RIGHTS_STATEMENT, PANEL_IMPORT_RIGHTS_STATEMENT_KO } from "../panel-import-rights";
import { PanelSourceError, type PanelSourceImage } from "../panel-source-image";

import { PanelImportEnvironmentContext } from "./panel-import-env";
import { PanelSourceStep, type PanelSourceReady } from "./PanelSourceStep";
import { createKit, fakePanelSource, samplePage, type Kit, type KitOverrides } from "./panel-ui-test-kit";

function fileInputOf(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("파일 입력칸을 찾지 못했어요.");
  return input;
}

function renderStep(overrides: KitOverrides = {}): { readonly kit: Kit; readonly container: HTMLElement; readonly onReady: Mock<(ready: PanelSourceReady) => void> } {
  const kit = createKit(overrides);
  const onReady = vi.fn<(ready: PanelSourceReady) => void>();
  const { container } = render(
    <PanelImportEnvironmentContext.Provider value={kit.env}>
      <PanelSourceStep mode="reflow" onReady={onReady} />
    </PanelImportEnvironmentContext.Provider>,
  );
  return { kit, container, onReady };
}

const checkbox = (): HTMLElement => screen.getByRole("checkbox", { name: new RegExp(PANEL_IMPORT_RIGHTS_STATEMENT_KO) });
const pick = (container: HTMLElement, file: File): void => { fireEvent.change(fileInputOf(container), { target: { files: [file] } }); };

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => { useI18n.getState().setLang("ko"); });

describe("1단계 — 권리 확인과 이미지 선택", () => {
  it("권리 확인 전에는 파일 선택이 닫혀 있고 읽기를 시작하지 않는다", () => {
    const { kit, container, onReady } = renderStep();
    expect((checkbox() as HTMLInputElement).checked).toBe(false);
    expect(fileInputOf(container).disabled).toBe(true);
    expect(screen.getByText("먼저 위의 권리 확인에 체크해 주세요.")).toBeTruthy();
    // 입력칸이 닫혀 있어도 이벤트가 새어 들어오는 경우를 대비해 처리 단계도 확인을 요구한다.
    pick(container, fakePngFile("page-01.png", 400, 560));
    expect(kit.loadSource).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("확인하면 입력칸이 열리고, 읽은 뒤 확인 기록(출처 영수증·메모 포함)과 함께 넘긴다", async () => {
    const { kit, container, onReady } = renderStep();
    fireEvent.click(checkbox());
    expect(fileInputOf(container).disabled).toBe(false);
    expect(screen.getByText(/PNG·JPG·WebP, 최대 48MB/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: /출처·이용 허락 메모/ }), { target: { value: "  출판사 허락\n2026-09-30  " } });
    const file = fakePngFile("page-01.png", 400, 560);
    pick(container, file);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(kit.loadSource).toHaveBeenCalledTimes(1);
    expect(kit.loadSource.mock.calls[0]?.[0]).toBe(file);
    const ready = onReady.mock.calls[0]?.[0];
    expect(ready?.file).toBe(file);
    expect(ready?.rights.statement).toBe(PANEL_IMPORT_RIGHTS_STATEMENT);
    expect(ready?.rights.attestedAt).toBe("2026-10-15T09:00:00.000Z");
    expect(ready?.rights.note).toBe("출판사 허락 2026-09-30");
    expect(ready?.rights.source).toMatchObject({ fileName: "page-01.png", width: 400, height: 560, sha256: "c".repeat(64) });
    expect(await screen.findByText(/page-01\.png \(400×560px\)를 읽었어요\. 권리 확인이 기록됐어요\./)).toBeTruthy();
    // 끝난 뒤에는 같은 단계가 다시 시작되지 않도록 닫힌다.
    expect(fileInputOf(container).disabled).toBe(true);
  });

  it("읽는 중에는 진행 안내와 취소가 보이고, 취소하면 이미지를 쓰지 않는다", async () => {
    const { container, onReady } = renderStep({
      loadSource: (_file, signal) => new Promise<PanelSourceImage>((_resolve, reject) => {
        signal.addEventListener("abort", () => { reject(new PanelSourceError("cancelled")); }, { once: true });
      }),
    });
    fireEvent.click(checkbox());
    pick(container, fakePngFile("page-01.png", 400, 560));
    expect(await screen.findByText(/page-01\.png 읽는 중…/)).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(await screen.findByText("이미지 읽기를 취소했어요. 다시 골라 주세요.")).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();
    // 취소한 뒤에는 다시 고를 수 있다.
    expect(fileInputOf(container).disabled).toBe(false);
  });

  it("취소한 뒤에 늦게 끝난 읽기는 결과를 버리고 이미지를 해제한다", async () => {
    let finish: (source: PanelSourceImage) => void = () => undefined;
    const late = fakePanelSource(samplePage(), "late.png");
    const { container, onReady } = renderStep({
      loadSource: () => new Promise<PanelSourceImage>((resolve) => { finish = resolve; }),
    });
    fireEvent.click(checkbox());
    pick(container, fakePngFile("late.png", 400, 560));
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    finish(late);
    expect(await screen.findByText("이미지 읽기를 취소했어요. 다시 골라 주세요.")).toBeTruthy();
    expect(late.disposed).toBe(true);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("읽기에 실패하면 이유를 알려 주고 같은 파일로 다시 시도할 수 있다", async () => {
    let attempts = 0;
    const { container, onReady } = renderStep({
      loadSource: (file) => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new PanelSourceError("unsupported-format"))
          : Promise.resolve(fakePanelSource(samplePage(), file.name));
      },
    });
    fireEvent.click(checkbox());
    const file = fakePngFile("page-01.png", 400, 560);
    pick(container, file);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("PNG, JPG, WebP 이미지만 읽을 수 있어요");
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "같은 파일로 다시 시도" }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(attempts).toBe(2);
    expect(onReady.mock.calls[0]?.[0].file).toBe(file);
  });

  it("권리 확인을 해제한 채 다시 시도하면 파일을 읽기 전에 확인이 필요하다고 알려 주고, 다시 체크하면 읽는다", async () => {
    let attempts = 0;
    const { container, onReady } = renderStep({
      loadSource: (file) => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new PanelSourceError("unsupported-format"))
          : Promise.resolve(fakePanelSource(samplePage(), file.name));
      },
    });
    fireEvent.click(checkbox());
    pick(container, fakePngFile("page-01.png", 400, 560));
    expect((await screen.findByRole("alert")).textContent).toContain("PNG, JPG, WebP 이미지만 읽을 수 있어요");
    expect(attempts).toBe(1);

    // 오류 화면에서는 체크를 풀 수 있다. 풀린 채 다시 시도하면 디코딩·해시를 하기 전에 거절해야 한다.
    fireEvent.click(checkbox());
    expect((checkbox() as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "같은 파일로 다시 시도" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("권리 확인에 체크");
    // 일반 오류 문구로 뭉개지 않는다.
    expect(alert.textContent).not.toContain("알 수 없는 오류");
    expect(attempts).toBe(1);
    expect(onReady).not.toHaveBeenCalled();

    fireEvent.click(checkbox());
    fireEvent.click(screen.getByRole("button", { name: "같은 파일로 다시 시도" }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(attempts).toBe(2);
    expect(onReady.mock.calls[0]?.[0].rights.statement).toBe(PANEL_IMPORT_RIGHTS_STATEMENT);
  });

  it("해상도 한도를 넘으면 실제 값과 한도를 알려 준다", async () => {
    const { container } = renderStep({
      loadSource: () => Promise.reject(new PanelSourceError("too-many-pixels", { megapixels: 16, pixels: 40_000_000 })),
    });
    fireEvent.click(checkbox());
    pick(container, fakePngFile("huge.png", 8000, 5000));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/40MP.*16MP/u);
  });

  it("영문 화면에서도 같은 흐름과 문구로 보인다", () => {
    useI18n.getState().setLang("en");
    const { container } = renderStep();
    expect(screen.getByRole("heading", { name: "1. Confirm rights and choose the image" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /I own this manuscript or have permission to use it/ })).toBeTruthy();
    expect(screen.getByText("First tick the rights confirmation above.")).toBeTruthy();
    expect(fileInputOf(container).disabled).toBe(true);
    expect(screen.getByText(/never sent to a server/)).toBeTruthy();
  });

  it("서버로 보내지 않는다는 안내가 항상 보인다", () => {
    renderStep();
    expect(screen.getByText(/이미지는 이 기기에서만 처리하고 서버로 보내지 않아요/)).toBeTruthy();
  });
});
