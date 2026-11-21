// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCharacterCompositePanel } from "./StudioBg3dCharacterCompositePanel";
import { StudioBg3dModelingProDrawer } from "./StudioBg3dModelingProDrawer";
import { StudioBg3dProStagingDrawer } from "./StudioBg3dProStagingDrawer";

afterEach(() => {
  cleanup();
});

describe("StudioBg3dCharacterCompositePanel (고밀도 3D 배경 & 캐릭터 실시간 합성 UI)", () => {
  it("switches 6 rich scene presets and 3 detail densities with live manifold/grounding metrics", () => {
    render(<StudioBg3dCharacterCompositePanel />);

    const badge = screen.getByTestId("bg3d-rich-scene-manifold-badge");
    expect(badge.textContent).toContain("비다양체 0");
    expect(badge.textContent).toContain("퇴화 0");
    expect(badge.textContent).toContain("Y=0.000m");

    const metricsEl = screen.getByTestId("bg3d-rich-scene-metrics");
    const richText = metricsEl.textContent ?? "";
    expect(richText).toContain("입자 72");

    fireEvent.click(screen.getByTestId("bg3d-density-ultra"));
    expect(metricsEl.textContent).toContain("입자 156");

    fireEvent.click(screen.getByTestId("bg3d-rich-preset-rofan-imperial-banquet"));
    expect(screen.getByTestId("bg3d-composite-status").textContent).toContain("로판 황궁 대연회장");
    expect(screen.getByTestId("bg3d-mtoon-sync-summary").textContent).toContain("역광");
  });

  it("manages 1~3 character slots, furniture anchor snap, 7-mood MToon sync, 5 camera presets, and composite 3-pass capture", () => {
    const onCompositeReady = vi.fn();
    const onCaptureBaked = vi.fn();
    const onBakeToManuscriptCut = vi.fn();

    render(
      <StudioBg3dCharacterCompositePanel
        targetDocumentId="doc-ep-7"
        targetCutIndex={3}
        onCompositeReady={onCompositeReady}
        onCaptureBaked={onCaptureBaked}
        onBakeToManuscriptCut={onBakeToManuscriptCut}
      />,
    );

    // 기본 2명 -> 3명으로 추가 후 추가 버튼 비활성화
    const addBtn = screen.getByTestId("bg3d-composite-add-character") as HTMLButtonElement;
    expect(addBtn.disabled).toBe(false);
    fireEvent.click(addBtn);
    expect(screen.getByTestId("bg3d-composite-slot-char-harin")).toBeTruthy();
    expect(addBtn.disabled).toBe(true);

    // 가구 스냅 (의자 착석 · 난간 기대기) & VRM 브리지 전환
    fireEvent.click(screen.getByTestId("bg3d-stance-char-seoyeon-seated"));
    expect(screen.getByTestId("bg3d-stance-char-seoyeon-seated").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("bg3d-stance-char-doyun-leaning"));
    expect(screen.getByTestId("bg3d-stance-char-doyun-leaning").getAttribute("aria-pressed")).toBe("true");

    const sourceBtn = screen.getByTestId("bg3d-source-toggle-char-seoyeon");
    expect(sourceBtn.textContent).toBe("아바타");
    fireEvent.click(sourceBtn);
    expect(sourceBtn.textContent).toBe("VRM");

    // 7종 분위기 MToon 자동 동기화
    fireEvent.click(screen.getByTestId("bg3d-composite-mood-sunset"));
    expect(screen.getByTestId("bg3d-mtoon-sync-summary").textContent).toContain("노을");
    expect(screen.getByTestId("bg3d-mtoon-sync-summary").textContent).toContain("3100K");

    // 5종 연출 카메라 프리셋
    fireEvent.click(screen.getByTestId("bg3d-stage-camera-confrontation-low-angle"));
    expect(screen.getByTestId("bg3d-stage-camera-readout").textContent).toContain("더치 -4.5°");

    // 캐릭터 씬에 합성 & 원클릭 통합 3패스 캡처·원고 컷 굽기
    fireEvent.click(screen.getByTestId("bg3d-composite-apply-btn"));
    expect(onCompositeReady).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("bg3d-composite-capture-bake-btn"));
    expect(onCaptureBaked).toHaveBeenCalledTimes(1);
    expect(onBakeToManuscriptCut).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDocumentId: "doc-ep-7",
        targetCutIndex: 3,
        nonDestructive: true,
        atmospherePresetId: "sunset",
      }),
    );

    const preview = screen.getByTestId("bg3d-composite-capture-preview");
    expect(within(preview).getByAltText("합본 선화 패스 미리보기")).toBeTruthy();
    expect(within(preview).getByAltText("합본 음영 패스 미리보기")).toBeTruthy();
    expect(within(preview).getByAltText("합본 깊이 패스 미리보기")).toBeTruthy();

    // 캐릭터 1명 제거
    fireEvent.click(screen.getByTestId("bg3d-remove-char-harin"));
    expect(screen.queryByTestId("bg3d-composite-slot-char-harin")).toBeNull();
  });
});

describe("StudioBg3dModelingProDrawer (Blender + SketchUp 고급 3D 모델링 UI)", () => {
  it("runs SketchUp & Blender BufferGeometry operators with real-time manifold verification", () => {
    const onGeometryUpdated = vi.fn();
    const onComponentArrayBuilt = vi.fn();

    render(
      <StudioBg3dModelingProDrawer
        onGeometryUpdated={onGeometryUpdated}
        onComponentArrayBuilt={onComponentArrayBuilt}
      />,
    );

    const status = screen.getByTestId("bg3d-modeling-manifold-status");
    expect(status.textContent).toContain("매니폴드 정상");
    expect(status.textContent).toContain("12 트라이앵글");

    // SketchUp 4종 실행
    fireEvent.click(screen.getByTestId("bg3d-op-push-pull"));
    expect(status.textContent).toContain("매니폴드 정상");
    expect(onGeometryUpdated).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("bg3d-op-section-slice"));
    expect(status.textContent).toContain("매니폴드 정상");

    fireEvent.click(screen.getByTestId("bg3d-op-follow-me"));
    expect(status.textContent).toContain("매니폴드 정상");

    fireEvent.click(screen.getByTestId("bg3d-op-component-array"));
    expect(onComponentArrayBuilt).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "linear", count: 4 }),
    );
    expect(screen.getByTestId("bg3d-op-array-readout").textContent).toContain("선형 배열 4개");

    // 초기 블록으로 되돌린 뒤 Blender 4종 실행
    fireEvent.click(screen.getByTestId("bg3d-modeling-reset-btn"));
    expect(status.textContent).toContain("12 트라이앵글");

    fireEvent.click(screen.getByTestId("bg3d-op-micro-bevel"));
    expect(status.textContent).toContain("매니폴드 정상");

    fireEvent.click(screen.getByTestId("bg3d-modeling-reset-btn"));
    fireEvent.click(screen.getByTestId("bg3d-op-symmetric-mirror"));
    expect(status.textContent).toContain("매니폴드 정상");

    fireEvent.click(screen.getByTestId("bg3d-modeling-reset-btn"));
    fireEvent.click(screen.getByTestId("bg3d-op-subdivide"));
    expect(status.textContent).toContain("48 트라이앵글");
    expect(status.textContent).toContain("매니폴드 정상");

    fireEvent.click(screen.getByTestId("bg3d-modeling-reset-btn"));
    fireEvent.click(screen.getByTestId("bg3d-op-boolean"));
    expect(status.textContent).toContain("매니폴드 정상");
    expect(screen.getByTestId("bg3d-modeling-manifold-verifier").textContent).toContain("비다양체 0 · 퇴화 0");
  });

  it("lazy-mounts composite stage and modeling pro drawer inside StudioBg3dProStagingDrawer on disclosure toggle", async () => {
    render(
      <StudioBg3dProStagingDrawer
        axis180Locked
        axisSide={1}
        onToggleAxis180Lock={vi.fn()}
        onChangeAxisSide={vi.fn()}
        onStatusMessage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("studio-bg3d-character-composite-panel")).toBeNull();
    expect(screen.queryByTestId("studio-bg3d-modeling-pro-drawer")).toBeNull();

    const compositeDetails = screen.getByTestId("bg3d-pro-composite-disclosure") as HTMLDetailsElement;
    compositeDetails.open = true;
    fireEvent(compositeDetails, new Event("toggle"));
    expect(await screen.findByTestId("studio-bg3d-character-composite-panel")).toBeTruthy();

    const modelingDetails = screen.getByTestId("bg3d-pro-modeling-disclosure") as HTMLDetailsElement;
    modelingDetails.open = true;
    fireEvent(modelingDetails, new Event("toggle"));
    expect(await screen.findByTestId("studio-bg3d-modeling-pro-drawer")).toBeTruthy();
  });
});
