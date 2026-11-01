// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualDynamicSpriteWorkspace } from "./StudioVirtualDynamicSpriteWorkspace";
import { StudioVirtualSpaceCollaborationHub } from "./StudioVirtualSpaceCollaborationHub";
import { StudioVirtualSpaceWorkstationLiveModal } from "./StudioVirtualSpaceWorkstationLiveModal";
import { ILLUSTRATED_2D_WORKSTATIONS } from "./studio-virtual-space-illustrated-2d-runtime";
import {
  DYNAMIC_CREATOR_SPRITE_CAST,
  DYNAMIC_SPRITE_ACTIONS,
  DYNAMIC_SPRITE_EXPRESSIONS,
  DYNAMIC_SPRITE_VFX_PRESETS,
  PRACTICAL_COLLAB_ZONES,
  addPracticalCollabPinNote,
  computeDynamicSpriteFrameKinematics,
  createInitialPracticalSpriteWorkspaceState,
  renderDynamicCreatorSpriteDataUri,
  renderDynamicCreatorSpriteSvg,
  toggleCollaboratorSynergyPair,
  triggerCollaboratorTaskAction,
  triggerWorkspaceFeverAwakening,
  updateCollaboratorSpriteConfig,
} from "./studio-virtual-space-dynamic-sprite-engine";

afterEach(cleanup);

describe("studio-virtual-space-dynamic-sprite-engine & StudioVirtualDynamicSpriteWorkspace", () => {
  it("defines 8 distinctive small-face (5.5~6.0 head-tall) creator personas, 10 expressions, 10 8-frame actions, and 8 flashy VFX", () => {
    expect(DYNAMIC_CREATOR_SPRITE_CAST).toHaveLength(8);
    expect(DYNAMIC_SPRITE_EXPRESSIONS).toHaveLength(10);
    expect(DYNAMIC_SPRITE_ACTIONS).toHaveLength(10);
    expect(DYNAMIC_SPRITE_VFX_PRESETS).toHaveLength(8);
    expect(PRACTICAL_COLLAB_ZONES).toHaveLength(4);
    expect(PRACTICAL_COLLAB_ZONES.find((zone) => zone.id === "zone-3d-blender-sketchup")?.titleKo).toBe("🧊 ToonStudio 3D 배경 합동 스튜디오");
    expect(DYNAMIC_CREATOR_SPRITE_CAST.find((persona) => persona.personaId === "cgi-director")?.characterNameKo).toBe("윤진 (3D 배경 감독)");

    for (const persona of DYNAMIC_CREATOR_SPRITE_CAST) {
      expect(persona.headToBodyRatio).toBeLessThanOrEqual(0.185);
      expect(persona.headTallUnits).toBeGreaterThanOrEqual(5.5);

      for (let frame = 0; frame < 8; frame++) {
        const k = computeDynamicSpriteFrameKinematics(
          persona.personaId,
          persona.defaultActionId,
          persona.defaultExpressionId,
          persona.defaultVfxId,
          frame,
        );
        expect(k.frameIndex).toBe(frame);
        expect(k.headRadiusPx).toBeLessThan(12);
      }

      const svg = renderDynamicCreatorSpriteSvg({
        personaId: persona.personaId,
        actionId: persona.defaultActionId,
        expressionId: persona.defaultExpressionId,
        vfxId: persona.defaultVfxId,
        frameIndex: 3,
      });
      expect(svg).toContain(`data-persona="${persona.personaId}"`);
      expect(svg).toContain(`data-action="${persona.defaultActionId}"`);
      expect(svg).toContain(`data-expression="${persona.defaultExpressionId}"`);
      expect(svg).toContain(`data-vfx="${persona.defaultVfxId}"`);

      const dataUri = renderDynamicCreatorSpriteDataUri({
        personaId: persona.personaId,
        actionId: persona.defaultActionId,
        expressionId: persona.defaultExpressionId,
        vfxId: persona.defaultVfxId,
        frameIndex: 2,
      });
      expect(dataUri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    }
  });

  it("handles practical workspace collaboration actions, synergy pairing, fever awakening, and canvas pins", () => {
    let state = createInitialPracticalSpriteWorkspaceState();
    expect(state.collaborators).toHaveLength(8);
    expect(state.collaborators.find((collaborator) => collaborator.personaId === "cgi-director")?.dccToolBadge).toBe("공간 모델러 + Blender 5.2");

    state = updateCollaboratorSpriteConfig(state, "line-artist", {
      expressionId: "sparkle-star",
      actionId: "awakening-skill-burst",
      vfxId: "prism-stardust-burst",
      headTallUnits: 6.2,
    });
    const updatedLine = state.collaborators.find((c) => c.personaId === "line-artist");
    expect(updatedLine?.expressionId).toBe("sparkle-star");
    expect(updatedLine?.actionId).toBe("awakening-skill-burst");
    expect(updatedLine?.headTallUnits).toBe(6.2);

    state = triggerCollaboratorTaskAction(state, "line-artist", "approve-cut");
    const approvedLine = state.collaborators.find((c) => c.personaId === "line-artist");
    expect(approvedLine?.taskStatus).toBe("approved");
    expect(approvedLine?.progressPercent).toBe(100);
    expect(approvedLine?.actionId).toBe("victory-jump-cheer");
    expect(approvedLine?.vfxId).toBe("prism-stardust-burst");

    state = toggleCollaboratorSynergyPair(state, "line-artist", "cgi-director");
    const pairedLine = state.collaborators.find((c) => c.personaId === "line-artist");
    expect(pairedLine?.pairedWithPersonaId).toBe("cgi-director");

    state = addPracticalCollabPinNote(
      state,
      "zone-3d-blender-sketchup",
      "cgi-director",
      "EP43-C12",
      "3D 성채 계단 그림자 각도 35도 보정 완료",
    );
    expect(state.canvasPins[0]?.noteKo).toContain("3D 성채 계단 그림자");

    state = triggerWorkspaceFeverAwakening(state);
    expect(state.feverAwakeningActive).toBe(true);
    expect(state.globalFps).toBe(24);
  });

  it("renders StudioVirtualDynamicSpriteWorkspace and supports interactive sprite & collaboration controls", () => {
    render(<StudioVirtualDynamicSpriteWorkspace />);

    expect(
      screen.getByTestId("studio-virtual-dynamic-sprite-workspace"),
    ).toBeTruthy();
    expect(screen.getByTestId("dynamic-collab-office-stage")).toBeTruthy();
    expect(screen.getByTestId("dynamic-sprite-sheet-strip")).toBeTruthy();

    // Switch character to cgi-director
    fireEvent.click(screen.getByTestId("dynamic-cast-select-cgi-director-btn"));
    expect(
      screen.getByTestId("dynamic-inspector-hero-sprite").getAttribute("data-persona-id"),
    ).toBe("cgi-director");

    // Switch expression, action, and VFX
    fireEvent.click(screen.getByTestId("dynamic-expr-joyful-wink-btn"));
    expect(
      screen.getByTestId("dynamic-inspector-hero-sprite").getAttribute("data-expression-id"),
    ).toBe("joyful-wink");

    fireEvent.click(screen.getByTestId("dynamic-action-victory-jump-cheer-btn"));
    expect(
      screen.getByTestId("dynamic-inspector-hero-sprite").getAttribute("data-action-id"),
    ).toBe("victory-jump-cheer");

    fireEvent.click(screen.getByTestId("dynamic-vfx-manga-speedlines-btn"));
    expect(
      screen.getByTestId("dynamic-inspector-hero-sprite").getAttribute("data-vfx-id"),
    ).toBe("manga-speedlines");

    // Approve cut & trigger fever awakening
    fireEvent.click(screen.getByTestId("dynamic-task-approve-btn"));
    expect(screen.getByTestId("dynamic-active-task-status").textContent).toContain(
      "승인 완료 (100%)",
    );

    fireEvent.click(screen.getByTestId("dynamic-workspace-fever-btn"));
    expect(screen.getByTestId("dynamic-workspace-event-banner").textContent).toContain(
      "전 팀원 마감 피버 각성",
    );
  });

  it("integrates into StudioVirtualSpaceCollaborationHub via the dynamic-sprite-workspace tab and renders StudioVirtualSpaceWorkstationLiveModal", () => {
    cleanup();
    render(<StudioVirtualSpaceCollaborationHub />);
    const tabBtn = screen.getByRole("tab", {
      name: /소두 다중프레임 스프라이트·VFX·협업/,
    });
    fireEvent.click(tabBtn);
    expect(
      screen.getAllByTestId("studio-virtual-dynamic-sprite-workspace").length,
    ).toBeGreaterThanOrEqual(1);

    cleanup();
    render(
      <StudioVirtualSpaceWorkstationLiveModal
        station={ILLUSTRATED_2D_WORKSTATIONS[0]}
        onClose={() => undefined}
        onSelectStation={() => undefined}
      />,
    );
    expect(screen.getByTestId("workstation-live-collab-modal")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workstation-tab-kanban"));
    fireEvent.click(screen.getByTestId("kanban-advance-cut-18-btn"));
    fireEvent.click(screen.getByTestId("workstation-tab-turntable-sfx"));
    fireEvent.click(screen.getByTestId("sfx-pad-boom-btn"));
  });

  it("협업 모달은 초점을 가두고 Escape로 닫은 뒤 실행 버튼에 초점을 돌려준다", async () => {
    const onClose = vi.fn();
    const station = ILLUSTRATED_2D_WORKSTATIONS[0];
    function ModalHarness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>협업창 열기</button>
        {open ? <StudioVirtualSpaceWorkstationLiveModal station={station}
          onClose={() => { onClose(); setOpen(false); }} onSelectStation={() => undefined} /> : null}
      </>;
    }
    const { container } = render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "협업창 열기" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: station.titleKo });
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);
    const firstControl = within(dialog).getByRole("combobox", { name: "워크스테이션 전환" });
    expect(document.activeElement).toBe(firstControl);
    const lastControl = within(dialog).getAllByRole("button").at(-1);
    if (!lastControl) throw new Error("모달 마지막 버튼이 필요합니다.");
    lastControl.focus();
    fireEvent.keyDown(lastControl, { key: "Tab", code: "Tab" });
    expect(document.activeElement).toBe(firstControl);
    fireEvent.keyDown(firstControl, { key: "Tab", code: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastControl);
    opener.focus();
    expect(document.activeElement).toBe(lastControl);
    fireEvent.keyDown(lastControl, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
