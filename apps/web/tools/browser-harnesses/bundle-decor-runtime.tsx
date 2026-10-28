import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { StudioOffice2dCanvas } from "../../src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas";
import { StudioVirtualSpaceEngineBridge } from "../../src/domains/creator/virtual-space/studio-virtual-space-engine-bridge";
import { studioVirtualPlaceWorldManifest } from "../../src/domains/creator/virtual-space/studio-virtual-space-place-world";

import type { StudioVirtualSpacePoint } from "../../src/domains/creator/virtual-space/studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "../../src/domains/creator/virtual-space/studio-virtual-space-presence";

import "../../src/app/styles/globals.css";

function PlaceStage({ place }: { readonly place: string }) {
  const manifest = useMemo(() => studioVirtualPlaceWorldManifest(place), [place]);
  const bridge = useMemo(() => new StudioVirtualSpaceEngineBridge(), []);
  const [position, setPosition] = useState<StudioVirtualSpacePoint>({ x: 480, y: 540 });
  const [interaction, setInteraction] = useState("");
  const snapshot = useMemo<StudioVirtualSpaceSnapshot>(() => ({
    self: { x: 480, y: 540, zoneId: place, facing: "up", activity: "available", moving: false, avatarIndex: 1 },
    peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null,
    peerTyping: [], peerImpacts: [], objectStates: [], peerFixtures: [], direct: false,
  }), [place]);
  return <>
    <nav aria-label="동작 검수">
      <button onClick={() => bridge.requestMove({ x: 480, y: 312 })}>작업대로 이동</button>
      <button onClick={() => bridge.requestInteract()}>작업대 선택</button>
    </nav>
    <output data-decor-position={`${position.x},${position.y}`} data-decor-interaction={interaction}>
      위치 {Math.round(position.x)}, {Math.round(position.y)} · 선택 {interaction || "없음"}
    </output>
    <div className="decor-stage" data-decor-place={place}>
      <StudioOffice2dCanvas manifest={manifest} bridge={bridge} snapshot={snapshot} selfIdentity="bundle-decor-review"
        selfDisplayName="장식 검수" onLocalState={(state) => setPosition(state.point)} onInteract={(target) => setInteraction(target?.id ?? "")}
        onPeerSelect={() => undefined} onCancelFollow={() => undefined} />
    </div>
  </>;
}

function BundleDecorRuntimeHarness() {
  const initial = new URLSearchParams(location.search).get("place") ?? "garden";
  const [place, setPlace] = useState(["garden", "tree-library", "creator-cafe"].includes(initial) ? initial : "garden");
  return <main>
    <h1>구매 번들 가상 장소 장식 검수</h1>
    <p>실제 장소 manifest와 2D Canvas를 사용합니다. 각 장소는 검수된 CC0 장식 두 개를 기존 이미지 캐시로 읽습니다.</p>
    <nav aria-label="장소 선택">
      {["garden", "tree-library", "creator-cafe"].map((id) => <button key={id} aria-pressed={place === id} onClick={() => setPlace(id)}>{id}</button>)}
    </nav>
    <PlaceStage key={place} place={place} />
  </main>;
}

const root = document.getElementById("bundle-decor-runtime-root");
if (!root) throw new Error("장식 검수 화면의 루트가 없습니다.");
createRoot(root).render(<BundleDecorRuntimeHarness />);
