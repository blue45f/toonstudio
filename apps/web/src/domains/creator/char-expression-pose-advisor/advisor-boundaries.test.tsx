// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioCharExpressionPoseAdvisorPanel, analyzeDialogueIntent, applyAdvisorProposal, checkExpressionContinuity, createAdvisorSessionState, exportAdvisorStateJson, getPreviousCutPreset, recommendCharacterAdjustments, revertAdvisorProposal } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const sample = () => {
  const session = createAdvisorSessionState();
  const bundle = recommendCharacterAdjustments({ dialogue: "정말 좋아~", intensity: 4 }, session.previousCut);
  return { session, bundle };
};

describe("캐릭터 계산 예제의 원문과 외부 결과 검증", () => {
  it.each([NaN, Infinity, -Infinity, 1e308])("스냅샷 수치 %s를 자연스러운 연속성·JSON null로 바꾸지 않는다", (gazeYaw) => {
    const { session, bundle } = sample();
    const previous = { ...session.previousCut, gazeYaw };
    expect(() => checkExpressionContinuity(previous, bundle.proposals[0])).toThrow();
    expect(() => exportAdvisorStateJson({ bundle, session: { ...session, previousCut: previous } })).toThrow();
  });
  it.each([NaN, Infinity, -1, 1.1])("외부 가중치 %s는 적용하기 전에 거부한다", (happy) => {
    const { session, bundle } = sample();
    const proposal = { ...bundle.proposals[0], blendShapes: { ...bundle.proposals[0].blendShapes, happy } };
    const before = structuredClone(session);
    expect(() => applyAdvisorProposal(session, proposal)).toThrow();
    expect(session).toEqual(before);
  });
  it("대사·이력 상한을 지키고 상한 직전 적용의 되돌리기는 보존한다", () => {
    expect(() => analyzeDialogueIntent({ dialogue: "가".repeat(8193) })).toThrow();
    const { session, bundle } = sample();
    const applied = applyAdvisorProposal(session, bundle.proposals[0]);
    const record = applied.history[0]; if (!record) throw new Error("예제 이력 없음");
    const full = { ...applied, history: Array.from({ length: 255 }, (_, i) => ({ ...record, step: i + 1 })) };
    expect(() => applyAdvisorProposal(full, bundle.proposals[0])).toThrow();
    const restored = revertAdvisorProposal(full);
    expect(restored.current).toEqual(session.baseline);
    expect(restored.history).toHaveLength(256);
  });
  it("원문 공백·개행·분해 한글·이모지를 JSON까지 보존하고 분석 후보만 정규화한다", () => {
    const raw = `  ${"정말 좋아~".normalize("NFD")} 👨‍👩‍👧‍👦\r\n\t `;
    const analysis = analyzeDialogueIntent({ dialogue: raw });
    expect(analysis.dialogue).toBe(raw);
    const composed = analyzeDialogueIntent({ dialogue: raw.normalize("NFC") });
    expect(analysis.primaryEmotion).toBe(composed.primaryEmotion);
    expect(analysis.viseme).toBe(composed.viseme);
    const session = createAdvisorSessionState();
    const bundle = recommendCharacterAdjustments({ dialogue: raw }, session.previousCut);
    expect(JSON.parse(exportAdvisorStateJson({ bundle, session })).analysis.dialogue).toBe(raw);
  });
  it("중복·과대 제안과 현재 모델에 맞지 않는 유한 점수를 내보내지 않는다", () => {
    const { session, bundle } = sample();
    const duplicate = { ...bundle, proposals: [bundle.proposals[0], bundle.proposals[0], bundle.proposals[2]] as const };
    expect(() => exportAdvisorStateJson({ bundle: duplicate, session })).toThrow();
    const forged = { ...bundle, proposals: [{ ...bundle.proposals[0], confidence: 0.123 }, bundle.proposals[1], bundle.proposals[2]] as const };
    expect(() => exportAdvisorStateJson({ bundle: forged, session })).toThrow();
    const oversized = structuredClone(bundle);
    Reflect.set(oversized, "proposals", Array.from({ length: 300 }, () => bundle.proposals[0]));
    expect(() => exportAdvisorStateJson({ bundle: oversized, session })).toThrow();
  });
  it("알 수 없는 감정 enum을 조용히 다른 감정으로 해석하지 않는다", () => {
    const { session, bundle } = sample();
    const invalid = structuredClone(session.previousCut);
    Reflect.set(invalid, "emotion", "unknown-emotion");
    expect(() => checkExpressionContinuity(invalid, bundle.proposals[0])).toThrow();
  });
  it("없는 직전 컷 enum을 다른 정상값으로 바꾸지 않는다", () => {
    const invalidPreset: Parameters<typeof getPreviousCutPreset> = ["calm-neutral"];
    Reflect.set(invalidPreset, 0, "unknown-cut");
    expect(() => getPreviousCutPreset(...invalidPreset)).toThrow();
  });
  it("null 제안 ID로 적용 상태를 만들지 않는다", () => {
    const { session, bundle } = sample();
    const invalidProposal = structuredClone(bundle.proposals[0]);
    Reflect.set(invalidProposal, "id", null);
    expect(() => applyAdvisorProposal(session, invalidProposal)).toThrow();
  });
  it("기본 baseline 가중치는 공유 프리셋과 별도 사본이고 출력은 메모리 예제다", () => {
    const { session, bundle } = sample();
    expect(session.baseline.blendShapes).not.toBe(getPreviousCutPreset("calm-neutral").snapshot.blendShapes);
    expect(JSON.parse(exportAdvisorStateJson({ bundle, session }))).toMatchObject({ dataSourceKind: "heuristic-estimate", actualCharacterApplied: false, vrmFileConverted: false, persisted: false });
  });
});

describe("적용·되돌리기·복사 알림 경계", () => {
  it("적용 수신자의 pending 중 중복 적용을 막고 최신 수신자에게 같은 결과만 재시도한다", async () => {
    let reject: ((reason: Error) => void) | undefined;
    const rejected = vi.fn(() => new Promise<void>((_resolve, no) => { reject = no; }));
    const latest = vi.fn();
    const view = render(<StudioCharExpressionPoseAdvisorPanel onApplyProposal={rejected} />);
    fireEvent.click(screen.getByTestId("advisor-apply-btn-1"));
    fireEvent.click(screen.getByTestId("advisor-apply-btn-1"));
    expect(rejected).toHaveBeenCalledTimes(1);
    await act(async () => { reject?.(new Error("예제 거절")); });
    await screen.findByTestId("advisor-retry-apply");
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioCharExpressionPoseAdvisorPanel />);
    fireEvent.click(screen.getByTestId("advisor-retry-apply"));
    expect(screen.getByTestId("advisor-notification-apply").textContent).toContain("알림 실패");
    expect(latest).not.toHaveBeenCalled();
    view.rerender(<StudioCharExpressionPoseAdvisorPanel onApplyProposal={latest} />);
    fireEvent.click(screen.getByTestId("advisor-retry-apply"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
  });
  it("되돌리기 콜백 throw를 잡고 원래 baseline 복구를 재실행하지 않는다", async () => {
    const rejected = vi.fn(() => { throw new Error("예제 수신자 실패"); });
    const latest = vi.fn();
    const view = render(<StudioCharExpressionPoseAdvisorPanel onRevertProposal={rejected} />);
    fireEvent.click(screen.getByTestId("advisor-apply-btn-1"));
    fireEvent.click(screen.getByTestId("advisor-revert-btn"));
    await screen.findByTestId("advisor-retry-revert");
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioCharExpressionPoseAdvisorPanel onRevertProposal={latest} />);
    fireEvent.click(screen.getByTestId("advisor-retry-revert"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
  });
  it("클립보드 거절은 완료가 아니며 복사 재시도는 export 알림을 중복하지 않는다", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("권한 거절")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const exported = vi.fn();
    render(<StudioCharExpressionPoseAdvisorPanel onExportJson={exported} />);
    fireEvent.click(screen.getByTestId("advisor-copy-json-btn"));
    fireEvent.click(await screen.findByTestId("advisor-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("advisor-copy-status").textContent).toContain("복사 완료"));
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]?.[0]).toBe(write.mock.calls[0]?.[0]);
    expect(exported).toHaveBeenCalledTimes(1);
  });
});
