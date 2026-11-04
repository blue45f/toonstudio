import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { SpaceNpcPortrait } from "../../src/domains/creator/virtual-space/hud/SpaceNpcPortrait";
import { studioVirtualToonHqManifest } from "../../src/domains/creator/virtual-space/office2d/hq/toon-hq-manifest";
import { StudioOffice2dCanvas } from "../../src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas";
import { StudioVirtualSpaceEngineBridge } from "../../src/domains/creator/virtual-space/studio-virtual-space-engine-bridge";
import { STUDIO_SPACE_THEMES, type StudioSpaceThemeKey } from "../../src/domains/creator/virtual-space/studio-virtual-space-theme";

import type { StudioVirtualSpaceSnapshot } from "../../src/domains/creator/virtual-space/studio-virtual-space-presence";
import type { StudioVirtualSpaceEngineLocalState } from "../../src/domains/creator/virtual-space/studio-virtual-space-stage-state";
import type { StudioWorldNpcDefinition } from "../../src/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import "../../src/app/styles/globals.css";
import "../../src/domains/creator/virtual-space/hud/space-hud.css";

// 실제 2D 엔진·월드·기존 자산을 실행한다. 합성 로컬 presence이며 서버 회의·협업 검증은 아니다.
function Fixture() {
  const bridge = useMemo(() => new StudioVirtualSpaceEngineBridge(), []);
  const manifest = useMemo(() => studioVirtualToonHqManifest(true), []);
  const [theme, setTheme] = useState<StudioSpaceThemeKey>("modern-office");
  const [state, setState] = useState<StudioVirtualSpaceEngineLocalState>({ point: { x: 336, y: 1470 }, facing: "down", moving: false, zoneId: "hq-lobby" });
  const [npc, setNpc] = useState<StudioWorldNpcDefinition | null>(null);
  const snapshot: StudioVirtualSpaceSnapshot = {
    self: { ...state.point, facing: state.facing, moving: state.moving, zoneId: state.zoneId, activity: "available", avatarIndex: 0 },
    peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null,
    peerTyping: [], peerImpacts: [], objectStates: [], peerFixtures: [], direct: false,
  };
  return <main className="p-3 text-fg">
    <h1>가상 스튜디오 실제 2D 엔진 검증</h1>
    <p>실제 2D 엔진 · 합성 로컬 사용자. 서버 협업과 실통화는 포함하지 않습니다.</p>
    <label>공간 테마<select aria-label="검증 공간 테마" value={theme} onChange={(event) => {
      const selected = STUDIO_SPACE_THEMES.find((item) => item.key === event.target.value);
      if (selected) setTheme(selected.key);
    }}>{STUDIO_SPACE_THEMES.map((item) => <option key={item.key} value={item.key}>{item.labelKo}</option>)}</select></label>
    <label>텍스트 입력<input aria-label="키보드 충돌 검증 입력" /></label>
    <output data-review-position data-x={state.point.x} data-y={state.point.y}>{Math.round(state.point.x)}, {Math.round(state.point.y)}</output>
    <div style={{ position: "relative", height: "70vh", minHeight: 400 }}>
      <StudioOffice2dCanvas manifest={manifest} snapshot={snapshot} bridge={bridge} selfIdentity="runtime-review" selfDisplayName="검증 사용자"
        spaceTheme={theme} onLocalState={setState} onInteract={() => undefined} onPeerSelect={() => undefined} onCancelFollow={() => undefined}
        onNpcInteract={(_, selected) => setNpc(selected)} />
    </div>
    {npc ? <section data-review-npc={npc.skinKey}><h2>{npc.id}</h2><SpaceNpcPortrait skinKey={npc.skinKey} expression="default" alt={npc.id} artStyle="webtoon" stageKind="office2d" /></section> : null}
  </main>;
}
const host = document.getElementById("test-root");
if (!host) throw new Error("실제 엔진 검증 root가 없습니다.");
createRoot(host).render(<Fixture />);
