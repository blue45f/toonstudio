// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
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
});
