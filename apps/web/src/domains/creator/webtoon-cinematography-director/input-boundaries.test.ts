// @vitest-environment jsdom
import { createElement } from "react";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_CINEMATOGRAPHY_SCENES, DEMO_VERTICAL_STRIPS, analyzeVerticalEyeFlow,
  applyEyeFlowPrescriptions, applySafe180CameraFixes, audit180DegreeRule,
  computePinholeOptics, evaluateCompositionHarmony, projectWorldPointToFrame, reflectCameraAcrossAxis,
  StudioCinematographyDirectorPanel, type StudioCinematographyDirectorPanelProps, type Rule180AuditReport, type VerticalStripInput,
} from "./index";

afterEach(cleanup);

const scene = DEMO_CINEMATOGRAPHY_SCENES[0];
const preset = DEMO_VERTICAL_STRIPS[0];
if (!scene || !preset) throw new Error("합성 예제 누락");
const validScene = scene;
const validStrip = preset;
const healthy: VerticalStripInput = {
  stripId: "healthy", titleKo: "  원문😀  ", titleEn: "Healthy", descriptionKo: "", descriptionEn: "", stripWidthPx: 800,
  panels: [{ panelId: "panel", order: 1, titleKo: "  컷 원문  ", titleEn: "Panel", width: 800, height: 440, gutterAfterPx: 88, pacingIntent: "dialogue-rhythm",
    nodes: [200, 300].map((y, i) => ({ id: `n${i}`, kind: "speech-balloon", labelKo: "  대사😀  ", labelEn: "Line", x: 120, y, readingOrder: i + 1 })) }],
};

describe("시네마 계산 입력·처방 보존", () => {
  it("빈·퇴화·비유한 카메라 입력을 정상 준수 점수로 처리하지 않는다", () => {
    expect(() => audit180DegreeRule({ ...validScene, shots: [] })).toThrow();
    expect(() => audit180DegreeRule({ ...validScene, actorB: { ...validScene.actorB, position: validScene.actorA.position } })).toThrow();
    expect(() => audit180DegreeRule({ ...validScene, shots: validScene.shots.map((s) => ({ ...s, cameraPosition: { x: NaN, z: 0 } })) })).toThrow();
    expect(() => audit180DegreeRule({ ...validScene, shots: [validScene.shots[0], validScene.shots[0]].filter((s) => s !== undefined) })).toThrow();
  });

  it("빈·잘못된 패널 입력을 100점으로 처리하지 않는다", () => {
    expect(() => analyzeVerticalEyeFlow({ ...validStrip, panels: [] })).toThrow();
    expect(() => analyzeVerticalEyeFlow({ ...healthy, panels: healthy.panels.map((p) => ({ ...p, height: NaN })) })).toThrow();
    expect(() => analyzeVerticalEyeFlow({ ...healthy, panels: [...healthy.panels, ...healthy.panels] })).toThrow();
  });

  it("지원 최소 크기보다 작은 패널은 자기 처방을 만들기 전에 명시적으로 거부한다", () => {
    const small = { ...healthy, stripWidthPx: 320, panels: healthy.panels.map((p) => ({
      ...p, width: 320, height: 100,
      nodes: p.nodes.map((n, i) => ({ ...n, x: 150, y: i === 0 ? 90 : 0 })),
    })) };
    const before = structuredClone(small);
    expect(() => analyzeVerticalEyeFlow(small)).toThrow(/최소/);
    expect(small).toEqual(before);
  });

  it("지원 최소 크기의 유효 입력은 자기 처방을 적용할 수 있고 원본을 보존한다", () => {
    const minimum = { ...healthy, stripWidthPx: 320, panels: healthy.panels.map((p) => ({
      ...p, width: 320, height: 180,
      nodes: p.nodes.map((n, i) => ({ ...n, x: 150, y: i === 0 ? 90 : 0 })),
    })) };
    const before = structuredClone(minimum);
    const report = analyzeVerticalEyeFlow(minimum);
    const result = applyEyeFlowPrescriptions(minimum, report);
    expect(result.panels[0]?.width).toBe(320);
    expect(result.panels[0]?.height).toBe(180);
    expect(result.panels[0]?.nodes.every((n) => n.x >= 0 && n.x <= 320 && n.y >= 0 && n.y <= 180)).toBe(true);
    expect(analyzeVerticalEyeFlow(result).reverseJumpCount).toBe(0);
    expect(minimum).toEqual(before);
  });

  it("스트립보다 좁은 패널의 복합 처방도 실제 패널 범위 안에서 적용하고 원본을 보존한다", () => {
    const narrow = { ...healthy, stripWidthPx: 2400, panels: healthy.panels.map((p) => ({
      ...p, width: 320, height: 180,
      nodes: p.nodes.map((n, i) => ({ ...n, x: i === 0 ? 150 : 0, y: i === 0 ? 120 : 0 })),
    })) };
    const before = structuredClone(narrow);
    const report = analyzeVerticalEyeFlow(narrow);
    expect(report.anchorPrescriptions.length).toBeGreaterThan(0);
    for (const rx of report.anchorPrescriptions) {
      expect(rx.targetLocal.x).toBeGreaterThanOrEqual(0);
      expect(rx.targetLocal.x).toBeLessThanOrEqual(320);
      expect(rx.targetLocal.y).toBeGreaterThanOrEqual(0);
      expect(rx.targetLocal.y).toBeLessThanOrEqual(180);
    }
    const result = applyEyeFlowPrescriptions(narrow, report);
    expect(result.stripWidthPx).toBe(2400);
    expect(result.panels[0]?.width).toBe(320);
    expect(result.panels[0]?.height).toBe(180);
    expect(result.panels[0]?.nodes.every((n) => n.x >= 0 && n.x <= 320 && n.y >= 0 && n.y <= 180)).toBe(true);
    expect(narrow).toEqual(before);
  });

  it("처방 없는 정상 콘티의 좌표·원문·입력 순서를 그대로 보존한다", () => {
    const before = structuredClone(healthy);
    const report = analyzeVerticalEyeFlow(healthy);
    expect(report.defects).toHaveLength(0);
    expect(report.anchorPrescriptions).toHaveLength(0);
    expect(applyEyeFlowPrescriptions(healthy, report)).toEqual(before);
    expect(healthy).toEqual(before);
  });

  it("같은 읽기 순서 값은 기존의 안정 정렬을 유지하며 중복 ID로 오인하지 않는다", () => {
    const sameOrder = { ...healthy, panels: healthy.panels.map((p) => ({ ...p, nodes: p.nodes.map((n) => ({ ...n, readingOrder: 1 })) })) };
    expect(applyEyeFlowPrescriptions(sameOrder)).toEqual(sameOrder);
  });

  it("다른 버전의 처방을 최신 콘티에 적용하지 않는다", () => {
    const report = analyzeVerticalEyeFlow(validStrip);
    const changed = { ...validStrip, titleKo: `${validStrip.titleKo} 새 버전` };
    expect(() => applyEyeFlowPrescriptions(changed, report)).toThrow(/다시|변경|처방/);
  });

  it("예제 보정은 표시한 처방만 적용하고 후속 진단도 통과한다", () => {
    const report = analyzeVerticalEyeFlow(validStrip);
    const fixed = applyEyeFlowPrescriptions(validStrip, report);
    expect(analyzeVerticalEyeFlow(fixed).defects).toEqual([]);
    for (const p of validStrip.panels) for (const node of p.nodes) {
      if (!report.anchorPrescriptions.some((rx) => rx.panelId === p.panelId && rx.nodeId === node.id)) {
        expect(fixed.panels.find((n) => n.panelId === p.panelId)?.nodes.find((n) => n.id === node.id)).toEqual(node);
      }
    }
  });

  it("패널마다 같은 로컬 node ID를 허용하고 다른 패널의 처방으로 바꾸지 않는다", () => {
    const p = healthy.panels[0];
    const n = p?.nodes[0];
    if (!p || !n) throw new Error("예제 누락");
    const input = { ...healthy, panels: [
      { ...p, panelId: "a-b", nodes: [{ ...n, id: "c" }] },
      { ...p, panelId: "a", order: 2, nodes: [{ ...n, id: "b-c", x: 790 }] },
      { ...p, panelId: "same-local-id", order: 3, nodes: [{ ...n, id: "c" }] },
    ] };
    const report = analyzeVerticalEyeFlow(input);
    const fixed = applyEyeFlowPrescriptions(input, report);
    expect(fixed.panels[0]?.nodes[0]).toEqual(input.panels[0]?.nodes[0]);
    expect(fixed.panels[2]?.nodes[0]).toEqual(input.panels[2]?.nodes[0]);
    expect(fixed.panels[1]?.nodes[0]?.x).toBeLessThan(790);
    expect(new Set(report.defects.map((d) => d.defectId)).size).toBe(report.defects.length);
  });

  it("샷 반전은 전역 Z 부호가 아니라 이동·기울어진 배우 축을 기준으로 계산한다", () => {
    expect(reflectCameraAcrossAxis({ x: -1, z: -1 }, { x: 1, z: 1 }, { x: 0, z: 2 })).toEqual({ x: 2, z: 0 });
    expect(reflectCameraAcrossAxis({ x: -1, z: 10 }, { x: 1, z: 10 }, { x: 0, z: 12 })).toEqual({ x: 0, z: 8 });
  });

  it("중복 노드·NaN 앵커·미등록 pacing·잘못된 카메라 geometry와 구도 enum을 거부한다", () => {
    const p = healthy.panels[0];
    if (!p) throw new Error("패널 누락");
    expect(() => analyzeVerticalEyeFlow({ ...healthy, panels: [{ ...p, nodes: [...p.nodes, ...p.nodes] }] })).toThrow();
    expect(() => analyzeVerticalEyeFlow({ ...healthy, panels: [{ ...p, nodes: p.nodes.map((n) => ({ ...n, x: NaN })) }] })).toThrow();
    expect(() => Reflect.apply(analyzeVerticalEyeFlow, undefined, [{ ...healthy, panels: [{ ...p, pacingIntent: "unknown" }] }])).toThrow();
    expect(() => projectWorldPointToFrame({ x: 0, y: 0, z: 0 }, { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } }, 50)).toThrow();
    expect(() => computePinholeOptics({ focalLengthMm: NaN, apertureFStop: 2, focusDistanceM: 3 })).toThrow();
    expect(() => Reflect.apply(evaluateCompositionHarmony, undefined, [{ ...validScene.defaultComposition, shotScale: "unknown" }])).toThrow();
    const report = audit180DegreeRule(validScene);
    expect(() => applySafe180CameraFixes(validScene.shots.map((s) => ({ ...s, cameraPosition: { ...s.cameraPosition, x: s.cameraPosition.x + 1 } })), report)).toThrow(/다시/);
    expect(report).toMatchObject({ scope: "calculation-example", sceneApplied: false });
  });
});

describe("시네마 예제 알림", () => {
  it("대기 중 중복을 막고 거절 후 같은 결과만 재알림하며 실제 적용으로 표시하지 않는다", async () => {
    const controls = { reject: (_error: Error) => {} };
    const pending = new Promise<void>((_resolve, reject) => { controls.reject = reject; });
    const onCameraAuditChange = vi.fn<(report: Rule180AuditReport) => void | Promise<void>>().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    render(createElement<StudioCinematographyDirectorPanelProps>(StudioCinematographyDirectorPanel, { onCameraAuditChange }));
    expect(screen.getByTestId("cinematography-scope-notice").textContent).toContain("독자 시선");
    const fixButton = screen.getByTestId("btn-fix-180-crossing");
    fireEvent.click(fixButton);
    expect(screen.getByTestId("cinematography-director-panel").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(fixButton);
    fireEvent.click(screen.getByTestId("focal-btn-24"));
    expect(onCameraAuditChange).toHaveBeenCalledTimes(1);
    const report = onCameraAuditChange.mock.calls[0]?.[0];
    await act(async () => { controls.reject(new Error("거절")); });
    expect(screen.getByRole("alert").textContent).toContain("예제 알림 실패");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "예제 알림 다시 시도" })); });
    expect(onCameraAuditChange).toHaveBeenCalledTimes(2);
    expect(onCameraAuditChange.mock.calls[1]?.[0]).toBe(report);
    expect(screen.getByTestId("cinema-notification-0").textContent).toContain("실제 적용·저장 완료 아님");
  });

  it("동기 오류 후 콜백이 교체되면 동일 결과를 최신 콜백으로 재알림한다", () => {
    const first = vi.fn().mockImplementation(() => { throw new Error("알림 실패"); });
    const next = vi.fn();
    const view = render(createElement<StudioCinematographyDirectorPanelProps>(StudioCinematographyDirectorPanel, { onEyeFlowAuditChange: first, initialTab: "vertical-eyeflow" }));
    fireEvent.click(screen.getByTestId("btn-apply-eyeflow-fix"));
    const report = first.mock.calls[0]?.[0];
    view.rerender(createElement<StudioCinematographyDirectorPanelProps>(StudioCinematographyDirectorPanel, { onEyeFlowAuditChange: next, initialTab: "vertical-eyeflow" }));
    fireEvent.click(screen.getByRole("button", { name: "예제 알림 다시 시도" }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(report);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
