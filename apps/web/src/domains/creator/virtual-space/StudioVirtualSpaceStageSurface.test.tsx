// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { studioVirtualDecorationPreset, type StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { addStudioVirtualDecorationSafely } from "./studio-virtual-space-decoration-layout";
import { studioOfficeEnvironmentManifest } from "./studio-virtual-space-office-environments";
import type { StudioVirtualSpacePhaserCanvasProps } from "./studio-virtual-space-phaser-canvas-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import type { StudioVirtualSpaceThreeStageProps } from "./three/studio-virtual-space-three-stage-props";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { VirtualThreeThemeProvider } from "./three/ui/VirtualThreeThemeProvider";
import { StudioVirtualSpaceStageSurface, type StudioVirtualSpaceStageSurfaceProps } from "./StudioVirtualSpaceStageSurface";

const stages = vi.hoisted(() => ({
  three: vi.fn<(props: StudioVirtualSpaceThreeStageProps) => void>(),
  office: vi.fn<(props: StudioVirtualSpacePhaserCanvasProps) => void>(),
  legacy: vi.fn<(props: StudioVirtualSpacePhaserCanvasProps) => void>(),
}));
vi.mock("./office2d/StudioOffice2dCanvas", () => ({ StudioOffice2dCanvas: (props: StudioVirtualSpacePhaserCanvasProps) => { stages.office(props); return null; } }));
vi.mock("./office2d/StudioVirtualSpaceStages", () => ({
  StudioVirtualSpaceThreeStage: (props: StudioVirtualSpaceThreeStageProps) => { stages.three(props); return null; },
  StudioVirtualSpaceLegacyStage: (props: StudioVirtualSpacePhaserCanvasProps) => { stages.legacy(props); return null; },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function input(stageKind: StudioVirtualSpaceStageSurfaceProps["stageKind"]): StudioVirtualSpaceStageSurfaceProps {
  const snapshot: StudioVirtualSpaceSnapshot = {
    self: { x: 100, y: 100, zoneId: "lobby", facing: "down", activity: "available", moving: false, avatarIndex: 0 },
    peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null,
    peerTyping: [], peerImpacts: [], objectStates: [], peerFixtures: [], direct: false,
  };
  return {
    stageKind,
    logical: { manifest: DEFAULT_STUDIO_WORLD_MANIFEST, snapshot, bridge: new StudioVirtualSpaceEngineBridge(),
      selfDisplayName: "작가", onLocalState: vi.fn(), onInteract: vi.fn(), onPortal: vi.fn(), onRuntimeMetrics: vi.fn() },
    twoD: { onPeerSelect: vi.fn(), onCancelFollow: vi.fn(), selfIdentity: "2d-only-identity", debugWorld: true,
      renderer: "canvas", artStyle: undefined, spaceTheme: undefined, decorations: undefined,
      environmentPreference: undefined, experiencePreference: undefined },
  };
}

function forestInput(stageKind: StudioVirtualSpaceStageSurfaceProps["stageKind"]): StudioVirtualSpaceStageSurfaceProps {
  const manifest = studioOfficeEnvironmentManifest("forest-atelier");
  if (!manifest) throw new Error("숲의 원형 아틀리에 월드가 없습니다.");
  const props = input(stageKind);
  return { ...props, logical: { ...props.logical, manifest },
    twoD: { ...props.twoD, decorations: studioVirtualDecorationPreset("creator-garden") } };
}

describe("가상 공간 renderer 라우터", () => {
  it("Three에는 2D 표현 필드 없이 공통 논리 authority와 독립 테마만 전달한다", () => {
    const props = input("three");
    render(<VirtualThreeThemeProvider spaceScopeId="space/router" acquireStorage={() => null}><StudioVirtualSpaceStageSurface {...props} /></VirtualThreeThemeProvider>);
    const actual = stages.three.mock.calls.at(-1)?.[0];
    if (!actual) throw new Error("Three 입력이 없습니다.");
    expect(actual.theme.id).toBe("creator-campus");
    expect(actual.themeRequestRevision).toBe(0);
    expect(actual.onThemePreviewChange).toBeTypeOf("function");
    expect(actual.bridge).toBe(props.logical.bridge);
    expect(actual.manifest).toBe(props.logical.manifest);
    expect(actual.snapshot).toBe(props.logical.snapshot);
    expect(actual.onLocalState).toBe(props.logical.onLocalState);
    expect(actual.onPortal).toBe(props.logical.onPortal);
    for (const key of Object.keys(props.twoD)) expect(Object.hasOwn(actual, key)).toBe(false);
    expect(stages.office).not.toHaveBeenCalled();
    expect(stages.legacy).not.toHaveBeenCalled();
  });

  it.each(["office2d", "legacy"] as const)("%s는 provider 없이 기존 표현 설정과 callback identity를 보존한다", stageKind => {
    const props = input(stageKind);
    render(<StudioVirtualSpaceStageSurface {...props} />);
    const calls = stageKind === "office2d" ? stages.office.mock.calls : stages.legacy.mock.calls;
    expect(calls.at(-1)?.[0]).toEqual({ ...props.twoD, ...props.logical });
    expect(stages.three).not.toHaveBeenCalled();
  });

  it.each(["office2d", "legacy"] as const)("%s는 최초 레거시 배치·소파 추가·실행 취소 원본의 기존 장식을 같은 위치에 표시한다", stageKind => {
    const props = forestInput(stageKind);
    const original = props.twoD.decorations;
    if (!original) throw new Error("기본 장식이 없습니다.");
    const originalJson = JSON.stringify(original);
    const stage = stageKind === "office2d" ? stages.office : stages.legacy;
    const view = render(<StudioVirtualSpaceStageSurface {...props} />);
    const initial = stage.mock.calls.at(-1)?.[0].decorations;
    if (!initial) throw new Error("화면의 장식 입력이 없습니다.");
    expect(initial.placements).toHaveLength(7);
    expect(initial.placements[0]).toEqual({ id: "garden-tree-west", type: "tree", x: 684, y: 715, rotation: 0, scale: .95 });
    expect(initial).toMatchObject({ layoutWidth: 1536, layoutHeight: 1024,
      presetKey: original.presetKey, districtKey: original.districtKey, presentationMode: original.presentationMode });

    const added = addStudioVirtualDecorationSafely(original, "sofa", { x: 760, y: 850 }, props.logical.manifest);
    if (!added.ok) throw new Error(`실제 기본 배치에 소파를 추가하지 못했습니다: ${added.reason}`);
    view.rerender(<StudioVirtualSpaceStageSurface {...props} twoD={{ ...props.twoD, decorations: added.state }} />);
    const afterAdd = stage.mock.calls.at(-1)?.[0].decorations;
    expect(afterAdd?.placements.slice(0, 7)).toEqual(initial.placements);
    expect(afterAdd?.placements).toHaveLength(8);
    expect(afterAdd?.placements.at(-1)?.type).toBe("sofa");

    // 편집 패널의 Undo는 revision만 증가시키고 history의 레거시 원본을 복구한다.
    const restored = { ...original, revision: added.state.revision + 1 };
    view.rerender(<StudioVirtualSpaceStageSurface {...props} twoD={{ ...props.twoD, decorations: restored }} />);
    expect(stage.mock.calls.at(-1)?.[0].decorations?.placements).toEqual(initial.placements);
    expect(JSON.stringify(original)).toBe(originalJson);
    expect(original.layoutWidth).toBeUndefined();
    expect(restored.placements).toBe(original.placements);
  });

  it.each(["office2d", "legacy"] as const)("%s는 현재 월드로 저장된 좌표를 다시 확대하거나 논리 입력을 바꾸지 않는다", stageKind => {
    const props = forestInput(stageKind);
    const stored: StudioVirtualDecorationState = { ...studioVirtualDecorationPreset("minimal"), layoutWidth: 1536, layoutHeight: 1024,
      placements: [{ id: "saved-tree", type: "tree", x: 684, y: 715, rotation: 90, scale: .95 }] };
    render(<StudioVirtualSpaceStageSurface {...props} twoD={{ ...props.twoD, decorations: stored }} />);
    const actual = (stageKind === "office2d" ? stages.office : stages.legacy).mock.calls.at(-1)?.[0];
    if (!actual) throw new Error("2D 입력이 없습니다.");
    expect(actual.decorations).toBe(stored);
    expect(actual.manifest).toBe(props.logical.manifest);
    expect(actual.snapshot).toBe(props.logical.snapshot);
    expect(actual.bridge).toBe(props.logical.bridge);
    expect(actual.onLocalState).toBe(props.logical.onLocalState);
    expect(actual.onPeerSelect).toBe(props.twoD.onPeerSelect);
  });

  it("장식이 있는 2D와 Three를 오가도 Three 입력을 격리하고 복귀 위치를 유지한다", () => {
    const props = forestInput("office2d");
    const renderStage = (stageKind: StudioVirtualSpaceStageSurfaceProps["stageKind"]) =>
      <VirtualThreeThemeProvider spaceScopeId="space/router-transition" acquireStorage={() => null}>
        <StudioVirtualSpaceStageSurface {...props} stageKind={stageKind} />
      </VirtualThreeThemeProvider>;
    const view = render(renderStage("office2d"));
    const initial = stages.office.mock.calls.at(-1)?.[0].decorations;
    expect(initial?.placements[0]).toMatchObject({ x: 684, y: 715 });
    view.rerender(renderStage("three"));
    const actual = stages.three.mock.calls.at(-1)?.[0];
    if (!actual) throw new Error("Three 입력이 없습니다.");
    for (const key of Object.keys(props.twoD)) expect(Object.hasOwn(actual, key)).toBe(false);
    expect(actual.manifest).toBe(props.logical.manifest);
    expect(actual.snapshot).toBe(props.logical.snapshot);
    view.rerender(renderStage("office2d"));
    expect(stages.office.mock.calls.at(-1)?.[0].decorations).toBe(initial);
  });
});
