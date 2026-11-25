// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioOneLineOrchestratorPanel } from "./StudioOneLineOrchestratorPanel";
import { createOrchestratorSession, exportUnifiedSceneBundleJson, exportUnifiedSceneMarkdown, orchestrateOneLineSceneBundles } from "./oneline-orchestrator-engine";

afterEach(() => { cleanup(); vi.restoreAllMocks(); clipboard(); });
function result(): ReturnType<typeof orchestrateOneLineSceneBundles> { return orchestrateOneLineSceneBundles({ dialogue: "가자!" }); }
function clipboard(writeText?: (text: string) => Promise<void>): void { Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined }); }

describe("연출 체인 원문·입력·내보내기 경계", () => {
  it("유효한 대사의 공백·Unicode 원문을 JSON에 별도로 보존한다", () => {
    const dialogue = "  가자 👩🏽‍🎨!  ";
    const model = orchestrateOneLineSceneBundles({ dialogue });
    expect(JSON.parse(exportUnifiedSceneBundleJson(model, createOrchestratorSession())).input.originalDialogue).toBe(dialogue);
  });
  it("세 구간 이상의 대사를 말풍선 두 개로 조용히 잘라내지 않는다", () => {
    expect(() => orchestrateOneLineSceneBundles({ dialogue: "첫째 / 둘째 / 셋째" })).toThrow();
  });
  it("상한의 두 구간 Unicode 대사를 원문 수정 없이 JSON 왕복한다", () => {
    const dialogue = "👩🏽‍🎨".repeat(200) + " / " + "가".repeat(2693);
    expect(dialogue.length).toBe(4096);
    const input = { dialogue, intensity: Number.NaN, safeMargin: Number.NaN };
    const before = { ...input }; const model = orchestrateOneLineSceneBundles(input);
    expect(input).toEqual(before);
    const parsed = JSON.parse(exportUnifiedSceneBundleJson(model, createOrchestratorSession()));
    expect(parsed.input.originalDialogue).toBe(dialogue);
    expect(Number.isFinite(parsed.input.intensity)).toBe(true);
    expect(model.dialoguesForBalloon).toHaveLength(2);
  });
  it("대사 상한 초과를 네 엔진 실행 전에 거부한다", () => {
    expect(() => orchestrateOneLineSceneBundles({ dialogue: "가".repeat(4097) })).toThrow();
  });
  it.each([exportUnifiedSceneBundleJson, exportUnifiedSceneMarkdown])("외부 결과의 NaN과 잘못된 session 지표를 내보내지 않는다", (exporter) => {
    const model = result(); Reflect.set(model, "intensity", NaN);
    expect(() => exporter(model, createOrchestratorSession())).toThrow();
    const session = createOrchestratorSession(); Reflect.set(session, "appliedSlotCount", Infinity);
    expect(() => exporter(result(), session)).toThrow();
  });
  it("지원하지 않는 슬롯 선택을 원본 상태 수정 없이 거부한다", () => {
    const model = result(); const session = createOrchestratorSession(); const before = structuredClone(session);
    Reflect.set(session.draftSelection, "expression", 99);
    expect(() => exportUnifiedSceneBundleJson(model, session)).toThrow();
    expect(session.applied).toEqual(before.applied);
  });
});

describe("연출 체인 메모리 상태와 외부 알림 ACK", () => {
  it("화면은 실제 장면 변경·저장과 구분되는 메모리 예제임을 표시한다", () => {
    render(<StudioOneLineOrchestratorPanel />);
    expect(screen.getByTestId("orchestrator-example-notice").textContent).toContain("메모리 예제");
  });
  it("입력 상한 초과 시 기존 대사와 예제 결과를 유지한다", () => {
    render(<StudioOneLineOrchestratorPanel initialDialogue="유지할 대사" />);
    const input = screen.getByTestId("orchestrator-dialogue-input");
    fireEvent.change(input, { target: { value: "가".repeat(4097) } });
    if (!(input instanceof HTMLInputElement)) throw new Error("대사 입력이 없습니다.");
    expect(input.value).toBe("유지할 대사");
  });
  it("적용 알림 pending 중 중복 요청·원복을 막고 ACK를 기다린다", async () => {
    let finish: (() => void) | undefined;
    const recipient = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<StudioOneLineOrchestratorPanel onApplyBundle={recipient} />);
    fireEvent.click(screen.getByTestId("orchestrator-apply-all-btn")); fireEvent.click(screen.getByTestId("orchestrator-apply-all-btn"));
    expect(recipient).toHaveBeenCalledTimes(1);
    const revert = screen.getByTestId("orchestrator-revert-all-btn");
    expect(revert.closest("fieldset")?.disabled).toBe(true);
    await act(async () => { finish?.(); });
    expect(screen.getByTestId("orchestrator-notification-apply").textContent).toContain("알림 완료");
  });
  it("알림 거절은 최신 수신자에게 같은 결과만 재시도한다", async () => {
    const first = vi.fn(async () => { throw new Error("receiver rejected"); }); const latest = vi.fn();
    const view = render(<StudioOneLineOrchestratorPanel onApplyBundle={first} />);
    fireEvent.click(screen.getByTestId("orchestrator-apply-all-btn"));
    await waitFor(() => expect(screen.getByTestId("orchestrator-notification-apply").textContent).toContain("실패"));
    view.rerender(<StudioOneLineOrchestratorPanel onApplyBundle={latest} />);
    fireEvent.click(screen.getByTestId("orchestrator-retry-apply"));
    expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
  });
  it("클립보드 미지원은 오류이며 재시도는 같은 JSON만 복사한다", async () => {
    clipboard(); const notification = vi.fn();
    render(<StudioOneLineOrchestratorPanel onExportJson={notification} />);
    fireEvent.click(screen.getByTestId("orchestrator-export-json-btn"));
    await waitFor(() => expect(screen.getByTestId("orchestrator-copy-status").textContent).toContain("실패"));
    const write = vi.fn().mockResolvedValue(undefined); clipboard(write);
    fireEvent.click(screen.getByTestId("orchestrator-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("orchestrator-copy-status").textContent).toContain("복사 완료"));
    expect(notification).toHaveBeenCalledTimes(1); expect(write).toHaveBeenCalledTimes(1);
  });
  it("동기 알림 throw는 밖으로 새지 않고 같은 결과를 재시도한다", async () => {
    const first = vi.fn(() => { throw new Error("sync rejected"); }); const latest = vi.fn();
    const view = render(<StudioOneLineOrchestratorPanel onApplyBundle={first} />);
    fireEvent.click(screen.getByTestId("orchestrator-apply-all-btn"));
    expect(screen.getByTestId("orchestrator-notification-apply").textContent).toContain("실패");
    view.rerender(<StudioOneLineOrchestratorPanel onApplyBundle={latest} />);
    fireEvent.click(screen.getByTestId("orchestrator-retry-apply"));
    expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
  });
  it("알림 실패 뒤 수신자 제거는 거짓 성공이 아니며 다시 연결한 수신자로만 전달한다", async () => {
    const first = vi.fn(async () => { throw new Error("rejected"); }); const latest = vi.fn();
    const view = render(<StudioOneLineOrchestratorPanel onApplyBundle={first} />);
    fireEvent.click(screen.getByTestId("orchestrator-apply-all-btn"));
    await waitFor(() => expect(screen.getByTestId("orchestrator-notification-apply").textContent).toContain("실패"));
    view.rerender(<StudioOneLineOrchestratorPanel />);
    fireEvent.click(screen.getByTestId("orchestrator-retry-apply"));
    expect(screen.getByTestId("orchestrator-notification-apply").textContent).toContain("실패");
    view.rerender(<StudioOneLineOrchestratorPanel onApplyBundle={latest} />);
    fireEvent.click(screen.getByTestId("orchestrator-retry-apply"));
    expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
    expect(first).toHaveBeenCalledTimes(1);
  });
  it("수신자 미연결은 메모리 예제만 변경하고 rerender로 자동 알림하지 않는다", () => {
    const latest = vi.fn(); const view = render(<StudioOneLineOrchestratorPanel locale="en" />);
    fireEvent.click(screen.getByTestId("orchestrator-apply-all-btn"));
    expect(screen.getByTestId("orchestrator-notification-apply").textContent).toContain("No receiver");
    view.rerender(<StudioOneLineOrchestratorPanel locale="en" onApplyBundle={latest} />);
    expect(latest).not.toHaveBeenCalled();
  });
  it("클립보드 ACK 전 중복 복사를 막고 reject 후 입력을 바꿔도 같은 원문만 재시도한다", async () => {
    let rejectCopy: ((error: Error) => void) | undefined;
    const write = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; })); clipboard(write);
    render(<StudioOneLineOrchestratorPanel />);
    fireEvent.click(screen.getByTestId("orchestrator-export-json-btn")); fireEvent.click(screen.getByTestId("orchestrator-export-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("orchestrator-copy-status").textContent).toContain("기다리고");
    await act(async () => { rejectCopy?.(new Error("denied")); });
    const original = write.mock.calls[0];
    fireEvent.change(screen.getByTestId("orchestrator-dialogue-input"), { target: { value: "새 대사" } });
    const retryWrite = vi.fn().mockResolvedValue(undefined); clipboard(retryWrite);
    fireEvent.click(screen.getByTestId("orchestrator-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("orchestrator-copy-status").textContent).toContain("복사 완료"));
    expect(retryWrite.mock.calls[0]).toEqual(original);
  });
  it("JSON 알림 거절은 실제 클립보드 성공과 구분하고 알림만 재시도한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined); clipboard(write);
    const first = vi.fn(async () => { throw new Error("notification denied"); }); const latest = vi.fn();
    const view = render(<StudioOneLineOrchestratorPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("orchestrator-export-json-btn"));
    await waitFor(() => expect(screen.getByTestId("orchestrator-notification-json").textContent).toContain("실패"));
    expect(screen.getByTestId("orchestrator-copy-status").textContent).toContain("복사 완료");
    view.rerender(<StudioOneLineOrchestratorPanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("orchestrator-retry-json"));
    expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]); expect(write).toHaveBeenCalledTimes(1);
  });
  it("내보내기와 프리뷰는 Unicode 서러게이트를 중간에서 자르지 않는다", () => {
    render(<StudioOneLineOrchestratorPanel initialDialogue={"😀".repeat(90)} />);
    const text = screen.getByTestId("orchestrator-unified-svg").textContent ?? "";
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  });

});
