// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioUnified3dStageShell } from "./StudioUnified3dStageShell";
import {
  UNIFIED_3D_STAGE_SPECS,
  buildUnified3dStageHref,
  resolveUnified3dStageFromDeepLink,
} from "./studio-unified-3d-stage-routing";

afterEach(cleanup);

describe("StudioUnified3dStageShell", () => {
  it("기존 3D 딥링크를 4단계 정본 스테이지로 무손실 매핑하고 쿼리 파라미터를 보존한다", () => {
    expect(resolveUnified3dStageFromDeepLink("/studio/bg3d", "?preset=classroom&workId=w1")).toEqual({
      stageId: "build",
      legacySurfaceId: "/studio/bg3d",
      preservedParams: { preset: "classroom", workId: "w1" },
      canonicalHref: "/studio/3d/stage?stage=build&preset=classroom&workId=w1",
    });

    expect(resolveUnified3dStageFromDeepLink("/shaper", "?starter=action")).toMatchObject({
      stageId: "pose",
      legacySurfaceId: "/shaper",
      preservedParams: { starter: "action" },
    });

    expect(resolveUnified3dStageFromDeepLink("/studio/3d/dcc/shot", "?cut=3")).toMatchObject({
      stageId: "shot",
      legacySurfaceId: "/studio/3d/dcc/shot",
      preservedParams: { cut: "3" },
    });

    expect(resolveUnified3dStageFromDeepLink("/studio/lift3d")).toMatchObject({
      stageId: "live-ink",
      legacySurfaceId: "/studio/lift3d",
    });

    expect(buildUnified3dStageHref("live-ink", { cut: "2", workId: "ep-4" })).toBe(
      "/studio/3d/stage?stage=live-ink&cut=2&workId=ep-4",
    );
  });

  it("상단 Calm Chrome을 9개 핵심 컨트롤로 유지하고 키보드·클릭으로 4단계를 전환한다", () => {
    const onStageChange = vi.fn();
    const onBakeToCut = vi.fn();
    const onReturnTo2d = vi.fn();

    render(
      <StudioUnified3dStageShell
        initialPathname="/studio/poser"
        initialSearch="?starter=hero"
        canUndo
        canRedo={false}
        canBakeToCut
        onStageChange={onStageChange}
        onBakeToCut={onBakeToCut}
        onReturnTo2d={onReturnTo2d}
        viewport={<main data-testid="mock-stage-viewport">3D 뷰포트</main>}
        sideInspector={<div>속성 패널</div>}
      />,
    );

    const shell = screen.getByTestId("studio-unified-3d-stage-shell");
    expect(shell.getAttribute("data-unified-3d-stage")).toBe("pose");
    expect(shell.getAttribute("data-unified-3d-primary-controls")).toBe("9");

    const toolbar = screen.getByRole("toolbar", { name: "통합 3D 스테이지 제어 바" });
    expect(toolbar.querySelectorAll("button")).toHaveLength(9);
    expect(UNIFIED_3D_STAGE_SPECS).toHaveLength(4);

    // 비활성 버튼에는 명시적 사유 툴팁이 존재해야 한다.
    const redoBtn = screen.getByTestId("unified-3d-redo") as HTMLButtonElement;
    expect(redoBtn.disabled).toBe(true);
    expect(redoBtn.title).toContain("이력이 없습니다");

    // 화살표 키로 다음 단계(shot)로 이동
    const poseTab = screen.getByTestId("unified-3d-stage-tab-pose");
    fireEvent.keyDown(poseTab, { key: "ArrowRight" });
    expect(shell.getAttribute("data-unified-3d-stage")).toBe("shot");
    expect(onStageChange).toHaveBeenCalledWith("shot", "/studio/3d/stage?stage=shot&starter=hero");

    // 2D 컷에 굽기 & 보조 드로어 토글
    fireEvent.click(screen.getByTestId("unified-3d-bake-cut"));
    expect(onBakeToCut).toHaveBeenCalledOnce();
    expect(screen.getByTestId("unified-3d-stage-status").textContent).toContain("카메라 컷");

    fireEvent.click(screen.getByTestId("unified-3d-overflow-toggle"));
    expect(screen.getByTestId("unified-3d-overflow-drawer").textContent).toContain(
      "/studio/3d/stage?stage=shot&starter=hero",
    );

    fireEvent.click(screen.getByTestId("unified-3d-return-2d"));
    expect(onReturnTo2d).toHaveBeenCalledOnce();
  });
});
