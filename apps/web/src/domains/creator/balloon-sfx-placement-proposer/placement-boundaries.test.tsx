// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBalloonSfxProposerPanel } from "./StudioBalloonSfxProposerPanel";
import { computeNegativeSpaceGrid, createPlacementSessionState, exportLayoutProposalJson, exportLayoutProposalSvg, getCutPreset, proposeBalloonSfxLayoutsTop3 } from "./balloon-sfx-placement-engine";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function preset() { return getCutPreset("closeup-monologue"); }
function valueInput(index: number): HTMLInputElement {
  const input = screen.getByTestId(`proposer-dialogue-input-${index}`);
  if (!(input instanceof HTMLInputElement)) throw new Error("대사 입력이 없습니다.");
  return input;
}
function setClipboard(writeText?: (text: string) => Promise<void>): void { Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined }); }
describe("배치 예제 입력과 원문 경계", () => {
  it.each([NaN, Infinity, 1e308])("grid 캔버스 극값 %s를 계산 전에 거부한다", (canvasWidth) => {
    expect(() => computeNegativeSpaceGrid({ canvasWidth, protectedZones: [] })).toThrow();
  });
  it("비유한 grid 밀도와 무제한 보호 영역을 거부한다", () => {
    expect(() => computeNegativeSpaceGrid({ cols: NaN, protectedZones: [] })).toThrow();
    const zone = preset().protectedZones[0]; if (!zone) throw new Error("예제 영역이 없습니다.");
    expect(() => computeNegativeSpaceGrid({ protectedZones: Array.from({ length: 65 }, (_, i) => ({ ...zone, id: `z${i}` })) })).toThrow();
  });
  it("양수인 극소 얼굴 침범을 반올림해 안전0으로 표시하지 않는다", () => {
    const grid = computeNegativeSpaceGrid({ protectedZones: [{ id: "tiny-face", kind: "face", labelKo: "얼굴", labelEn: "Face", box: { x: 0, y: 0, width: 0.001, height: 0.001 }, weight: 1 }] });
    expect(grid.cells[0]?.faceOcclusionRatio).toBeGreaterThan(0);
    expect(grid.cells[0]?.occlusionRatio).toBeGreaterThan(0);
  });
  it("중복 대사와 보호 영역 ID를 거부하며 원본을 유지한다", () => {
    const source = preset(); const first = source.dialogues[0]; const zone = source.protectedZones[0];
    if (!first || !zone) throw new Error("예제 입력이 없습니다.");
    const input = { dialogues: [first, first], protectedZones: source.protectedZones }; const before = structuredClone(input);
    expect(() => proposeBalloonSfxLayoutsTop3(input)).toThrow(); expect(input).toEqual(before);
    expect(() => computeNegativeSpaceGrid({ protectedZones: [zone, zone] })).toThrow();
  });
  it("기존3개 미리보기 계약에서도 초과 대사와 Unicode 원문을 JSON에 보존한다", () => {
    const first = preset().dialogues[0]; if (!first) throw new Error("대사가 없습니다.");
    const dialogues = Array.from({ length: 4 }, (_, i) => ({ ...first, id: `d${i}`, text: `  ${i} 👩🏽‍🎨\n원문  ` }));
    const bundle = proposeBalloonSfxLayoutsTop3({ dialogues, protectedZones: preset().protectedZones });
    const json = JSON.parse(exportLayoutProposalJson({ presetId: preset().id, safeMargin: 36, protectedZones: preset().protectedZones, bundle, session: createPlacementSessionState() }));
    expect(bundle.proposals[0].balloons).toHaveLength(3);
    expect(json.sourceDialogues).toEqual(dialogues);
  });
  it("외부 SVG 좌표에 문자열 속성을 주입할 수 없다", () => {
    const proposal = structuredClone(proposeBalloonSfxLayoutsTop3(preset()).proposals[0]);
    Reflect.set(proposal.sfx, "centerX", '0" onload="alert(1)');
    expect(() => exportLayoutProposalSvg({ safeMargin: 36, protectedZones: preset().protectedZones, proposal })).toThrow();
  });
  it("외부 JSON/SVG의 NaN을 정상 내보내기로 처리하지 않는다", () => {
    const source = preset(); const bundle = proposeBalloonSfxLayoutsTop3(source); const proposal = bundle.proposals[0];
    expect(() => exportLayoutProposalJson({ presetId: source.id, safeMargin: 36, protectedZones: source.protectedZones, bundle: { ...bundle, canvasWidth: NaN }, session: createPlacementSessionState() })).toThrow();
    expect(() => exportLayoutProposalSvg({ safeMargin: 36, protectedZones: source.protectedZones, proposal: { ...proposal, sfx: { ...proposal.sfx, rotationDeg: NaN } } })).toThrow();
  });
});
describe("배치 UI의 상태·알림·복사", () => {
  it("추가·삭제·재추가 뒤 한 대사를 바꿔도 다른 대사를 덮지 않는다", () => {
    render(<StudioBalloonSfxProposerPanel />);
    fireEvent.click(screen.getByTestId("proposer-add-dialogue-btn")); fireEvent.click(screen.getByTestId("proposer-add-dialogue-btn"));
    fireEvent.change(valueInput(3), { target: { value: "보존할 대사" } });
    fireEvent.click(screen.getByTestId("proposer-remove-dialogue-2")); fireEvent.click(screen.getByTestId("proposer-add-dialogue-btn"));
    fireEvent.change(valueInput(3), { target: { value: "새 대사" } });
    expect(valueInput(2).value).toBe("보존할 대사");
  });
  it("미리보기 줄바꿈은 Emoji 서로게이트를 자르지 않는다", () => {
    render(<StudioBalloonSfxProposerPanel />);
    fireEvent.change(valueInput(1), { target: { value: "가".repeat(15) + "👩🏽‍🎨" + "가".repeat(32) } });
    for (const line of screen.getByTestId("proposer-cut-preview-svg").querySelectorAll("tspan")) expect(line.textContent).not.toMatch(/[\uD800-\uDFFF]/u);
  });
  it("적용 뒤 입력 수정은 이미 적용한 스냅샷을 다시 적용한 것처럼 바꾸지 않는다", () => {
    const onApply = vi.fn(); render(<StudioBalloonSfxProposerPanel onApply={onApply} />);
    fireEvent.click(screen.getByTestId("proposer-apply-btn-1"));
    const applied = screen.getByTestId("proposer-cut-preview-svg").textContent;
    fireEvent.change(valueInput(1), { target: { value: "새 미적용 대사" } });
    expect(screen.getByTestId("proposer-cut-preview-svg").textContent).toBe(applied);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
  it("적용 알림 거절은 최신 수신자로 같은 결과를 재시도하며 revision을 올리지 않는다", async () => {
    const failed = vi.fn(async () => { throw new Error("receiver failed"); }); const latest = vi.fn();
    const view = render(<StudioBalloonSfxProposerPanel onApply={failed} />);
    fireEvent.click(screen.getByTestId("proposer-apply-btn-1"));
    await waitFor(() => expect(screen.getByTestId("proposer-notification-apply").textContent).toContain("실패"));
    view.rerender(<StudioBalloonSfxProposerPanel onApply={latest} />);
    fireEvent.click(screen.getByTestId("proposer-retry-apply"));
    expect(latest.mock.calls[0]).toEqual(failed.mock.calls[0]);
  });
  it("클립보드 미지원은 실패이고 동일 JSON 복사를 재시도한다", async () => {
    setClipboard(); render(<StudioBalloonSfxProposerPanel />); fireEvent.click(screen.getByTestId("proposer-export-json-btn"));
    await waitFor(() => expect(screen.getByTestId("proposer-copy-status").textContent).toContain("실패"));
    const write = vi.fn().mockResolvedValue(undefined); setClipboard(write); fireEvent.click(screen.getByTestId("proposer-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("proposer-copy-status").textContent).toContain("복사 완료")); expect(write).toHaveBeenCalledTimes(1);
  });
  it("복사 ACK 대기 중에는 중복 요청을 보내지 않는다", async () => {
    let finish: (() => void) | undefined; const write = vi.fn(() => new Promise<void>(resolve => { finish = resolve; })); setClipboard(write);
    render(<StudioBalloonSfxProposerPanel />); fireEvent.click(screen.getByTestId("proposer-export-json-btn")); fireEvent.click(screen.getByTestId("proposer-export-json-btn"));
    expect(write).toHaveBeenCalledTimes(1); await act(async () => { finish?.(); });
  });
});
