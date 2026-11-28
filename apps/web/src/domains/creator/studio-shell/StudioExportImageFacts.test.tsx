// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioExportImageFacts } from "./StudioExportImageFacts";
import { StudioFreeAiAssistWorkbench } from "./StudioFreeAiAssistWorkbench";

beforeAll(async () => { await import("../studio-archive-import-apply"); });

const previousLanguage = useI18n.getState().lang;
beforeEach(() => { useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useI18n.setState({ lang: previousLanguage }); });

function fileWithHeader(name: string, width = 800, height = 1280) {
  const header = new Uint8Array(24);
  header.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const fields = new DataView(header.buffer);
  fields.setUint32(16, width);
  fields.setUint32(20, height);
  // jsdom Blob은 arrayBuffer가 없어서 브라우저의 slice().arrayBuffer()를 제공하는 Blob을 쓴다.
  const file = new NodeBlob([header], { type: "image/png" });
  return Object.assign(file, { name });
}

function choose(file: Blob | NodeBlob) {
  fireEvent.change(screen.getByLabelText(/내 기기에서 이미지 규격 확인|Check image dimensions on this device/u), { target: { files: [file] } });
}

describe("내보내기 코치의 로컬 이미지 규격 확인", () => {
  it("선택과 적용은 분석을 실행하지 않고 원고를 보존하며, 실행할 때 측정값만 전달한다", async () => {
    const close = vi.fn();
    const decode = vi.fn().mockResolvedValue({ width: 800, height: 1280, close });
    vi.stubGlobal("createImageBitmap", decode);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    render(<StudioFreeAiAssistWorkbench initialMode="export-preflight-coach" fetchImpl={fetchImpl} />);
    const brief = screen.getByRole<HTMLTextAreaElement>("textbox");
    fireEvent.change(brief, { target: { value: "처음 쓴 원고" } });
    choose(fileWithHeader("비공개-원고.png"));
    const add = await screen.findByRole("button", { name: "측정값을 원고에 추가" });
    expect(brief.value).toBe("처음 쓴 원고");
    fireEvent.change(brief, { target: { value: "수정된 원고\n" } });
    fireEvent.click(add);
    expect(brief.value).toBe("수정된 원고\n내보내기 이미지: 800 × 1280 px · 24 B");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "원고에 추가됨" }).disabled).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "₩0 무료 AI 실행" }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchImpl.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body).toMatchObject({ mode: "export-preflight-coach", inputText: brief.value });
    expect(Object.keys(body).sort()).toEqual(["allowZeroBillCascade", "inputText", "mode"]);
    expect(JSON.stringify(body)).not.toContain("비공개");
  });

  it("헤더만 남고 실제 픽셀을 디코딩할 수 없는 파일은 원고에 넣지 않는다", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode failed")));
    const change = vi.fn();
    render(<StudioExportImageFacts draft="기존 원고" maxLength={6000} onChange={change} />);
    choose(fileWithHeader("손상.png"));
    await screen.findByText(/이미지를 읽지 못했어요/u);
    choose(new NodeBlob(["invalid raster bytes"], { type: "image/png" }));
    await screen.findByText("PNG 또는 JPEG 파일을 선택해 주세요.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("다른 파일을 선택하거나 모드를 벗어난 뒤 늦게 끝난 결과를 버리고 비트맵을 해제한다", async () => {
    const first = Promise.withResolvers<{ width: number; height: number; close: () => void }>();
    const last = Promise.withResolvers<{ width: number; height: number; close: () => void }>();
    const close = vi.fn();
    const decode = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ width: 400, height: 200, close }).mockReturnValueOnce(last.promise);
    vi.stubGlobal("createImageBitmap", decode);
    const { unmount } = render(<StudioExportImageFacts draft="" maxLength={6000} onChange={vi.fn()} />);
    choose(fileWithHeader("먼저.png"));
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
    choose(fileWithHeader("나중.png", 400, 200));
    await screen.findByText(/400 × 200 px/u);
    await act(async () => first.resolve({ width: 800, height: 1280, close }));
    expect(screen.queryByText(/800 × 1280/u)).toBeNull();
    choose(fileWithHeader("마지막.png"));
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(3));
    unmount();
    await act(async () => last.resolve({ width: 800, height: 1280, close }));
    expect(close).toHaveBeenCalledTimes(3);
  });

  it("기기 한도를 초과하는 파일은 픽셀 디코딩 전에 중단하고 다음 JPEG는 파일에 기록된 규격으로 표시한다", async () => {
    const decode = vi.fn().mockResolvedValue({ width: 90, height: 360, close: vi.fn() });
    vi.stubGlobal("createImageBitmap", decode);
    render(<StudioExportImageFacts draft="" maxLength={6000} onChange={vi.fn()} />);
    choose(fileWithHeader("너무-큼.png", 30000, 30000));
    await screen.findByText(/해상도가 너무 높아요/u);
    expect(decode).not.toHaveBeenCalled();
    const jpegHeader = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 90, 1, 104, 1]);
    choose(new NodeBlob([jpegHeader], { type: "application/octet-stream" }));
    await screen.findByText("내보내기 이미지: 360 × 90 px · 12 B");
    expect(decode).toHaveBeenCalledOnce();
  });

  it("영문 안내를 표시하고 원고 길이 제한을 넘으면 내용을 자르지 않는다", async () => {
    useI18n.setState({ lang: "en" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 800, height: 1280, close: vi.fn() }));
    const onChange = vi.fn();
    render(<StudioExportImageFacts draft={"x".repeat(6000)} maxLength={6000} onChange={onChange} />);
    choose(fileWithHeader("private.png"));
    const add = await screen.findByRole<HTMLButtonElement>("button", { name: "Add measurements to brief" });
    expect(screen.getByText(/Shorten the brief/u)).toBeTruthy();
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("내보내기 이외의 모드에는 이미지 입력을 표시하지 않는다", () => {
    render(<StudioFreeAiAssistWorkbench initialMode="dialogue-polish" fetchImpl={async () => new Response(null, { status: 503 })} />);
    expect(screen.queryByLabelText(/내 기기에서 이미지 규격 확인/u)).toBeNull();
  });
});
