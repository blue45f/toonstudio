// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVisualPinReviewPanel, addVisualReviewPin, advanceBatonStage, buildExternalBridgeManifest, buildVisualReviewDigestMarkdown, createInitialVisualPinReviewState, evaluateStageGateReadiness, updateReviewPinComment } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("핀 상태·댓글·외부 출력 경계", () => {
  it("중복 핀 ID와 번호를 거부하며 원본은 보존한다", () => {
    const state = createInitialVisualPinReviewState();
    const pin = state.pins[0]; if (!pin) throw new Error("예제 핀 없음");
    const duplicate = { ...state, pins: [pin, { ...pin }] };
    const before = structuredClone(duplicate);
    expect(() => evaluateStageGateReadiness(duplicate)).toThrow();
    expect(() => buildExternalBridgeManifest("slack-notion-digest", duplicate)).toThrow();
    expect(duplicate).toEqual(before);
  });
  it("오래된 번호 카운터와 이력 길이는 기존 ID를 덮지 않는다", () => {
    const state = createInitialVisualPinReviewState();
    const added = addVisualReviewPin({ ...state, nextPinNumber: 1 }, { stampId: "expression-fix", xPct: 20, yPct: 30 });
    expect(new Set(added.pins.map((pin) => pin.id)).size).toBe(added.pins.length);
    expect(added.pins.at(-1)?.pinNumber).toBe(5);
    const clean = createInitialVisualPinReviewState({ variant: "clean" });
    const first = clean.history[0]; if (!first) throw new Error("예제 이력 없음");
    const advanced = advanceBatonStage({ ...clean, history: [{ ...first, id: "hist-2" }] }).state;
    expect(new Set(advanced.history.map((record) => record.id)).size).toBe(advanced.history.length);
  });
  it.each([NaN, Infinity, -Infinity, 1e308])("잘못된 외부 좌표 %s를 JSON null 또는 정상 핀으로 내보내지 않는다", (xPct) => {
    const state = createInitialVisualPinReviewState();
    const pin = state.pins[0]; if (!pin) throw new Error("예제 핀 없음");
    const invalid = { ...state, pins: [{ ...pin, xPct }] };
    expect(() => buildExternalBridgeManifest("csp-psd-layers", invalid)).toThrow();
    expect(() => buildVisualReviewDigestMarkdown(invalid)).toThrow();
  });
  it("핀·이력 상한과 비유한 추가 좌표를 거부한다", () => {
    const clean = createInitialVisualPinReviewState({ variant: "clean" });
    const pin = clean.pins[0]; const record = clean.history[0];
    if (!pin || !record) throw new Error("예제 없음");
    const full = { ...clean, pins: Array.from({ length: 256 }, (_, i) => ({ ...pin, id: `pin-${i + 1}`, pinNumber: i + 1 })), nextPinNumber: 257 };
    expect(() => addVisualReviewPin(full, { stampId: "expression-fix", xPct: 20, yPct: 20 })).toThrow();
    expect(() => addVisualReviewPin(clean, { stampId: "expression-fix", xPct: NaN, yPct: 20 })).toThrow();
    expect(() => advanceBatonStage({ ...clean, history: Array.from({ length: 256 }, (_, i) => ({ ...record, id: `h-${i}` })) })).toThrow();
  });
  it("긴 Unicode·공백·개행과 빈 댓글은 입력·JSON·Markdown에서 그대로 보존한다", () => {
    const state = createInitialVisualPinReviewState();
    const text = `  가 👨‍👩‍👧‍👦\r\n\t${"메모".repeat(160)}  `;
    const updated = updateReviewPinComment(state, "pin-1", text);
    expect(updated.pins[0]?.comment).toBe(text);
    expect(JSON.parse(buildExternalBridgeManifest("slack-notion-digest", updated).jsonPayload).pins[0].comment).toBe(text);
    expect(buildVisualReviewDigestMarkdown(updated)).toContain(text);
    expect(updateReviewPinComment(updated, "pin-1", "").pins[0]?.comment).toBe("");
    expect(state.pins[0]?.comment).not.toBe(text);
  });
  it("정적 보존 목록과 메모리 전이는 실제 파일 변환·서버 저장·권한 확인이 아니다", () => {
    const manifest = buildExternalBridgeManifest("blender-glb-camera", createInitialVisualPinReviewState());
    expect(manifest).toMatchObject({ dataSourceKind: "in-memory-example", fileConversionVerified: false, persisted: false });
    expect(JSON.parse(manifest.jsonPayload)).toMatchObject({ dataSourceKind: "in-memory-example", fileConversionVerified: false, persisted: false });
    expect(manifest.markdownDigest).toContain("예제");
    expect(manifest.suggestedFileName).toMatch(/\.json$/u);
    expect(JSON.parse(manifest.jsonPayload).mimeType).toBe("application/json");
  });
});

describe("핀 패널의 초안·알림·복사", () => {
  it("컷별 빠른 댓글 초안은 왕복 때 보존하고 다른 컷으로 따라가지 않는다", () => {
    render(<StudioVisualPinReviewPanel />);
    const draft = "  컷1 전용 👨‍👩‍👧‍👦\n\t다음 줄 원문  ";
    fireEvent.change(screen.getByTestId("visual-pin-quick-comment"), { target: { value: draft } });
    fireEvent.click(screen.getByTestId("visual-pin-cut-cut-02"));
    expect((screen.getByTestId("visual-pin-quick-comment") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByTestId("visual-pin-cut-cut-01"));
    expect((screen.getByTestId("visual-pin-quick-comment") as HTMLTextAreaElement).value).toBe(draft);
  });
  it("StrictMode와 inline 부모 콜백에서 같은 상태를 반복 통지하지 않는다", async () => {
    let calls = 0;
    function Parent() {
      const [count, setCount] = useState(0);
      return <><output data-testid="count">{count}</output><StudioVisualPinReviewPanel onStateChange={() => { calls += 1; if (calls > 4) throw new Error("알림 반복"); setCount((n) => n + 1); }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(calls).toBe(1);
  });
  it("단계 전달 거절의 최신 수신자 재시도는 단계를 다시 넘기지 않는다", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("예제 수신자 거절"));
    const latest = vi.fn();
    const view = render(<StudioVisualPinReviewPanel initialVariant="clean" onStageAdvance={rejected} />);
    fireEvent.click(screen.getByTestId("visual-pin-advance-btn"));
    await screen.findByTestId("visual-pin-retry-stage");
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioVisualPinReviewPanel initialVariant="clean" onStageAdvance={latest} />);
    fireEvent.click(screen.getByTestId("visual-pin-retry-stage"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
    expect(screen.getByTestId("visual-pin-stage-kpi").textContent).toContain("밑색");
  });
  it("실제 복사 ACK 전 중복을 막고 실패한 복사만 재시도한다", async () => {
    let rejectCopy: ((reason: Error) => void) | undefined;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; })).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const exported = vi.fn();
    render(<StudioVisualPinReviewPanel onCopyBridgeJson={exported} />);
    fireEvent.click(screen.getByTestId("visual-pin-copy-json-btn"));
    fireEvent.click(screen.getByTestId("visual-pin-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => { rejectCopy?.(new Error("권한 거절")); });
    fireEvent.click(await screen.findByTestId("visual-pin-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("visual-pin-copy-status").textContent).toContain("복사 완료"));
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]?.[0]).toBe(write.mock.calls[0]?.[0]);
    expect(exported).toHaveBeenCalledTimes(1);
  });
});


it("오래된 화면의 핀 댓글 갱신은 최신 원문을 덮지 않는다", () => {
  const state = createInitialVisualPinReviewState();
  const original = state.pins[0]?.comment;
  if (original === undefined) throw new Error("예제 없음");
  const latest = updateReviewPinComment(state, "pin-1", "최신 원문 👨‍👩‍👧‍👦");
  const stale = updateReviewPinComment(latest, "pin-1", "옛 화면 댓글", undefined, original);
  expect(stale).toBe(latest);
});


it("예제 표시를 붙인 한 줄 요약도 기존 180자 예산을 지킨다", () => {
  const state = createInitialVisualPinReviewState({ projectTitle: "👨‍👩‍👧‍👦".repeat(100), episodeLabel: "긴 회차 제목" });
  const report = evaluateStageGateReadiness(state);
  expect(report.notification.oneLineSummaryKo.length).toBeLessThanOrEqual(180);
  expect(report.notification.oneLineSummaryEn.length).toBeLessThanOrEqual(180);
});

it("실패한 수신자 제거는 완료로 취급하지 않고 재연결 뒤 같은 상태를 보낸다", async () => {
  const rejected = vi.fn().mockRejectedValue(new Error("예제 수신자 거절"));
  const latest = vi.fn();
  const view = render(<StudioVisualPinReviewPanel onStateChange={rejected} />);
  await screen.findByTestId("visual-pin-retry-state");
  const payload = rejected.mock.calls[0];
  view.rerender(<StudioVisualPinReviewPanel />);
  fireEvent.click(screen.getByTestId("visual-pin-retry-state"));
  await act(async () => {});
  expect(screen.getByTestId("visual-pin-retry-state")).toBeTruthy();
  view.rerender(<StudioVisualPinReviewPanel onStateChange={latest} />);
  fireEvent.click(screen.getByTestId("visual-pin-retry-state"));
  await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
  expect(latest.mock.calls[0]).toEqual(payload);
});

it("클립보드 미지원은 복사 완료로 표시하지 않는다", async () => {
  vi.stubGlobal("navigator", {});
  render(<StudioVisualPinReviewPanel />);
  fireEvent.click(screen.getByTestId("visual-pin-copy-alert-btn"));
  const status = await screen.findByTestId("visual-pin-copy-status");
  expect(status.getAttribute("role")).toBe("alert");
  expect(status.textContent).not.toContain("복사 완료");
});
