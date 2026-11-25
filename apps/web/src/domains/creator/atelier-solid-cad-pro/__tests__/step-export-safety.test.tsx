// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "@/shared/lib/copy-text";

import {
  ATELIER_SOLID_PRESETS,
  StudioAtelierSolidCadProPanel,
  evaluateAtelierSolidModel,
  exportBinaryStlBuffer,
  exportStepAp214Ascii,
  type StudioAtelierSolidCadProPanelProps,
} from "../index";

vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("미검증 STEP 출력 차단", () => {
  it("96개 면을 초과하는 모든 프리셋의 STEP 공개 API는 파일 문자열 대신 식별 가능한 오류를 던진다", () => {
    for (const preset of ATELIER_SOLID_PRESETS) {
      const evaluation = evaluateAtelierSolidModel({ presetId: preset.id });
      const before = exportBinaryStlBuffer(evaluation.mesh, preset.id);
      expect(evaluation.mesh.triangleCount).toBeGreaterThan(96);
      expect(() => exportStepAp214Ascii(evaluation)).toThrow(/STEP_AP214_UNVERIFIED/u);
      expect(exportBinaryStlBuffer(evaluation.mesh, preset.id)).toEqual(before);
      expect(new DataView(before.buffer).getUint32(80, true)).toBe(evaluation.mesh.triangleCount);
      expect(before.byteLength).toBe(84 + 50 * evaluation.mesh.triangleCount);
    }
  });

  it("STEP 상태 확인은 콜백·클립보드를 호출하지 않고 미지원 이유만 보여 준다", async () => {
    const onExportStep = vi.fn<NonNullable<StudioAtelierSolidCadProPanelProps["onExportStep"]>>();
    render(<StudioAtelierSolidCadProPanel onExportStep={onExportStep} />);
    fireEvent.click(screen.getByTestId("atelier-solid-export-step-btn"));
    await waitFor(() => expect(screen.getByTestId("atelier-solid-export-preview").getAttribute("data-export-kind")).toBe("STEP_UNAVAILABLE"));
    expect(screen.getByTestId("atelier-solid-export-status").textContent).toContain("STEP AP214 미지원");
    expect(screen.getByTestId("atelier-solid-export-preview").textContent).not.toContain("ISO-10303-21;");
    expect(onExportStep).not.toHaveBeenCalled();
    expect(copyText).not.toHaveBeenCalled();
  });

  it("CPU/SVG·임시 상태·권리 검사와 제조 검증 미연결을 접근성 설명에도 알린다", () => {
    render(<StudioAtelierSolidCadProPanel />);
    const scope = screen.getByTestId("atelier-solid-scope");
    expect(scope.textContent).toContain("CPU/SVG");
    expect(scope.textContent).toContain("Rights BOM");
    expect(scope.textContent).toContain("정투상·제조 공차 보증 없음");
    expect(scope.textContent).toContain("패널을 닫기 전");
    expect(screen.getByTestId("atelier-solid-cad-pro-panel").getAttribute("aria-describedby")).toBe(scope.id);
  });

  it("수신 콜백이 없으면 LT 원고 전송 완료로 알리지 않는다", async () => {
    render(<StudioAtelierSolidCadProPanel />);
    fireEvent.click(screen.getByTestId("atelier-solid-export-lt-btn"));
    await waitFor(() => expect(screen.getByTestId("atelier-solid-export-status").textContent).toContain("원고 미반영"));
    expect(screen.getByTestId("atelier-solid-export-status").textContent).not.toContain("전송 완료");
  });
});
