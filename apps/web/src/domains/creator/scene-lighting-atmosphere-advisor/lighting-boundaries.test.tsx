// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioSceneLightingAdvisorPanel, analyzeSceneLightingEmotion, auditLightingReadability, createLightingSession,
  exportLightingRigJson, proposeSceneLightingTop3, tweakLightingRig } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("조명 예제의 입력·원문·상태 경계", () => {
  it.each([NaN, Infinity, 1e308])("외부 릭의 잘못된 수치 %s를 통과 또는 JSON null로 숨기지 않는다", bad => {
    const session = createLightingSession();
    const rig = structuredClone(session.currentRig);
    Object.assign(rig.atmosphere, { shadowContrastRatio: bad });
    Object.assign(rig.keyLight, { azimuthDeg: bad });
    const before = structuredClone(rig);
    expect(() => auditLightingReadability(rig)).toThrow();
    expect(() => exportLightingRigJson({ ...session, currentRig: rig })).toThrow();
    expect(rig).toEqual(before);
  });
  it("긴 입력은 계산 전에 거부하고 분석에는 지원 원문의 공백·Unicode를 보존한다", () => {
    const text = "  가 🧑🏽‍🎨\n\t원문  ";
    expect(analyzeSceneLightingEmotion({ dialogue: text }).dialogue).toBe(text);
    expect(() => analyzeSceneLightingEmotion({ dialogue: "가".repeat(4097) })).toThrow();
  });
  it("닫히지 않은 괄호 입력도 지원 한도 안에서 원문을 보존한다", () => {
    const dialogue = "(".repeat(4096);
    const analysis = analyzeSceneLightingEmotion({ dialogue });
    expect(analysis.dialogue).toBe(dialogue);
    expect(Object.values(analysis.emotionVector).every(Number.isFinite)).toBe(true);
  });
  it("외부 메타데이터는 내보내지 않고 원문 라벨·실제 바이올렛 상태·예제 경계를 기록한다", () => {
    const baseline = createLightingSession().baselineRig;
    const rig = { ...baseline, labelKo: "  가 🧑🏽‍🎨 원문  ", keyLight: { ...baseline.keyLight, privateNote: "synthetic-private-fixture" },
      rimLight: { ...baseline.rimLight, pigmentOklch: { ...baseline.rimLight.pigmentOklch, h: 294 } } };
    const before = structuredClone(rig);
    const json = exportLightingRigJson(createLightingSession(rig));
    const parsed = JSON.parse(json);
    expect(parsed.activeRig.labelKo).toBe(rig.labelKo);
    expect(parsed.violetSlopPct).toBe(25);
    expect(parsed.sceneApplied).toBe(false);
    expect(parsed.rendererCompatibilityVerified).toBe(false);
    expect(json).not.toContain("synthetic-private-fixture");
    expect(rig).toEqual(before);
  });
  it("중복 제안 ID·과대 기록과 비유한 미세 조정을 원본 변경 없이 거부한다", () => {
    const bundle = proposeSceneLightingTop3({ dialogue: "원문" });
    const session = createLightingSession(); const before = structuredClone(session);
    expect(() => exportLightingRigJson(session, { ...bundle, proposals: [bundle.proposals[0], bundle.proposals[0], bundle.proposals[2]] })).toThrow();
    expect(() => exportLightingRigJson({ ...session, history: Array.from({ length: 21 }, (_, i) => ({ step: i + 1, action: "revert" as const, proposalId: null, labelKo: "기록" })) })).toThrow();
    expect(() => tweakLightingRig(session, { keyIntensity: NaN })).toThrow();
    expect(session).toEqual(before);
  });
  it("감정 벡터의 미지원 메타데이터도 원본을 보존하고 내보내기에서 제외한다", () => {
    const bundle = proposeSceneLightingTop3({ dialogue: "  가 🧑🏽‍🎨 원문  " });
    Object.assign(bundle.analysis.emotionVector, { privateNote: "synthetic-vector-private-fixture" });
    const before = structuredClone(bundle);
    const json = exportLightingRigJson(createLightingSession(), bundle);
    expect(json).not.toContain("synthetic-vector-private-fixture");
    expect(JSON.parse(json).analysis.emotionVector).toEqual({
      tension: bundle.analysis.emotionVector.tension, flutter: bundle.analysis.emotionVector.flutter,
      anger: bundle.analysis.emotionVector.anger, solitude: bundle.analysis.emotionVector.solitude,
      elation: bundle.analysis.emotionVector.elation, suspense: bundle.analysis.emotionVector.suspense,
    });
    expect(bundle).toEqual(before);
  });
  it("같은 장소·시간이라도 다른 감정으로 달라진 릭은 같은 제안 ID를 재사용하지 않는다", () => {
    const first = proposeSceneLightingTop3({ dialogue: "끝내자. 물러설 곳 없어. 위험해!" });
    const next = proposeSceneLightingTop3({ dialogue: "사랑 좋아해 설레 두근 보고 싶어" });
    for (const i of [1, 2] as const) {
      expect(next.proposals[i].rig).not.toEqual(first.proposals[i].rig);
      expect(next.proposals[i].id).not.toBe(first.proposals[i].id);
    }
  });
  it("한도를 넘겨도 입력을 잃지 않고 미계산 상태로 돌아온다", () => {
    render(<StudioSceneLightingAdvisorPanel />);
    const text = "가".repeat(4097);
    fireEvent.change(screen.getByTestId("lighting-dialogue-input"), { target: { value: text } });
    expect((screen.getByTestId("lighting-dialogue-input") as HTMLTextAreaElement).value).toBe(text);
    expect(screen.getByTestId("lighting-calculation-error")).toBeTruthy();
    expect(screen.queryByTestId("lighting-proposal-card-1")).toBeNull();
    fireEvent.change(screen.getByTestId("lighting-dialogue-input"), { target: { value: "다시 계산할 원문" } });
    expect(screen.getByTestId("lighting-proposal-card-1")).toBeTruthy();
  });
  it("대사가 바뀌면 이전 미리보기를 해제한다", () => {
    render(<StudioSceneLightingAdvisorPanel />);
    fireEvent.click(screen.getByTestId("lighting-preview-btn-2"));
    fireEvent.change(screen.getByTestId("lighting-dialogue-input"), { target: { value: "사랑 좋아해 설레 두근" } });
    expect(screen.getByTestId("lighting-preview-btn-2").getAttribute("aria-pressed")).toBe("false");
  });
  it.each(["", "가".repeat(17) + "🧑🏽‍🎨"])("SVG 대사 예제는 빈 원문을 대체하거나 이모지를 자르지 않는다 (%#)", dialogue => {
    render(<StudioSceneLightingAdvisorPanel initialDialogue={dialogue} />);
    expect(screen.getByTestId("lighting-mood-preview-svg").querySelector('text[y="45"]')?.textContent).toBe(dialogue);
  });
  it("수신자 없는 적용은 실제 장면 성공이 아닌 메모리 예제 선택으로 표시한다", () => {
    render(<StudioSceneLightingAdvisorPanel />);
    fireEvent.click(screen.getByTestId("lighting-apply-btn-1"));
    expect(screen.getByTestId("lighting-example-scope").textContent).toContain("실제");
    expect(screen.getByTestId("lighting-delivery-apply").textContent).toContain("미연결");
  });
});

describe("조명 예제의 실제 복사 ACK와 콜백", () => {
  it("적용 pending의 중복을 막고 거절 후 같은 결과를 최신 수신자에게만 재알림한다", async () => {
    const gate = Promise.withResolvers<void>();
    const first = vi.fn(() => gate.promise); const latest = vi.fn();
    const view = render(<StudioSceneLightingAdvisorPanel onApply={first} />);
    fireEvent.click(screen.getByTestId("lighting-apply-btn-1"));
    fireEvent.click(screen.getByTestId("lighting-apply-btn-1"));
    expect(first).toHaveBeenCalledTimes(1);
    const sent = first.mock.calls[0];
    await act(async () => { gate.reject(new Error("예제 전달 거절")); });
    view.rerender(<StudioSceneLightingAdvisorPanel />);
    fireEvent.click(screen.getByTestId("lighting-retry-apply"));
    expect(screen.getByTestId("lighting-retry-apply")).toBeTruthy();
    view.rerender(<StudioSceneLightingAdvisorPanel onApply={latest} />);
    fireEvent.click(screen.getByTestId("lighting-retry-apply"));
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0]).toEqual(sent);
    expect(latest.mock.calls[0]?.[1].history).toHaveLength(1);
  });
  it("동기 throw와 원복 reject도 화면을 유지하고 같은 결과를 재알림한다", async () => {
    const apply = vi.fn(() => { throw new Error("동기 전달 실패"); });
    const revert = vi.fn().mockRejectedValue(new Error("원복 예제 전달 거절"));
    const latest = vi.fn();
    const view = render(<StudioSceneLightingAdvisorPanel onApply={apply} onRevert={revert} />);
    fireEvent.click(screen.getByTestId("lighting-apply-btn-1"));
    expect(screen.getByTestId("lighting-retry-apply")).toBeTruthy();
    fireEvent.click(screen.getByTestId("lighting-revert-btn"));
    await screen.findByTestId("lighting-retry-revert");
    view.rerender(<StudioSceneLightingAdvisorPanel onRevert={latest} />);
    fireEvent.click(screen.getByTestId("lighting-retry-revert"));
    expect(latest.mock.calls[0]).toEqual(revert.mock.calls[0]);
    expect(latest.mock.calls[0]?.[0].currentRig).toEqual(latest.mock.calls[0]?.[0].baselineRig);
  });
  it("복사 후 알림 실패는 클립보드를 중복하지 않고 최신 수신자로 재시도한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn().mockRejectedValue(new Error("알림 거절")); const latest = vi.fn();
    const view = render(<StudioSceneLightingAdvisorPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("lighting-copy-json-btn"));
    await screen.findByTestId("lighting-copy-retry");
    const sent = first.mock.calls[0];
    view.rerender(<StudioSceneLightingAdvisorPanel />);
    fireEvent.click(screen.getByTestId("lighting-copy-retry"));
    await screen.findByTestId("lighting-copy-retry");
    view.rerender(<StudioSceneLightingAdvisorPanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("lighting-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("입력 변경 후 복사 재시도도 실패했던 문자열·UTF-8 크기를 그대로 사용한다", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("복사 거절")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    render(<StudioSceneLightingAdvisorPanel />);
    fireEvent.click(screen.getByTestId("lighting-copy-json-btn"));
    await screen.findByTestId("lighting-copy-retry");
    const sent = write.mock.calls[0]?.[0];
    fireEvent.change(screen.getByTestId("lighting-dialogue-input"), { target: { value: "사랑 설레 좋아해" } });
    fireEvent.click(screen.getByTestId("lighting-copy-retry"));
    await waitFor(() => expect(screen.getByTestId("lighting-copy-status").textContent).toContain("완료"));
    expect(write.mock.calls[1]?.[0]).toBe(sent);
    expect(screen.getByTestId("lighting-copy-status").textContent).toContain(`${new TextEncoder().encode(sent).byteLength.toLocaleString("ko-KR")} B`);
  });
  it("클립보드 미지원은 전달·복사 성공으로 표시하지 않는다", async () => {
    vi.stubGlobal("navigator", {});
    const notify = vi.fn();
    render(<StudioSceneLightingAdvisorPanel onExportJson={notify} />);
    fireEvent.click(screen.getByTestId("lighting-copy-json-btn"));
    expect(notify).not.toHaveBeenCalled();
    expect(await screen.findByTestId("lighting-copy-retry")).toBeTruthy();
  });
  it("복사 pending 중 중복을 막고 ACK 뒤 최신 수신자로 전달한다", async () => {
    const gate = Promise.withResolvers<void>();
    const write = vi.fn(() => gate.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn(); const latest = vi.fn();
    const view = render(<StudioSceneLightingAdvisorPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("lighting-copy-json-btn"));
    fireEvent.click(screen.getByTestId("lighting-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    view.rerender(<StudioSceneLightingAdvisorPanel onExportJson={latest} />);
    await act(async () => { gate.resolve(); });
    expect(latest).toHaveBeenCalledTimes(1);
  });
  it("복사 완료의 크기는 실제 UTF-8 bytes이다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    render(<StudioSceneLightingAdvisorPanel />);
    fireEvent.click(screen.getByTestId("lighting-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("lighting-copy-status").textContent).toContain("완료"));
    expect(screen.getByTestId("lighting-copy-status").textContent).toContain(`${new TextEncoder().encode(write.mock.calls[0]?.[0]).byteLength.toLocaleString("ko-KR")} B`);
  });
});
