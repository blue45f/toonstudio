import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { acquireStudioHuddleAudioFocus } from "../../src/domains/creator/live/huddle/studio-p2p-huddle-audio-focus";
import { playOffice2dSpatialCue } from "../../src/domains/creator/virtual-space/office2d/office2d-stage-extensions";
import { StudioVirtualSpaceAmbientAudio } from "../../src/domains/creator/virtual-space/StudioVirtualSpaceAmbientAudio";
import "../../src/app/styles/globals.css";

// 실제 설정·소리 엔진과 회의 우선순위 원장 검증용이다. 실제 통화·마이크·서버 연결은 만들지 않는다.
function Fixture() {
  const release = useRef<(() => void) | null>(null);
  const [joined, setJoined] = useState(false);
  useEffect(() => () => { release.current?.(); }, []);
  return <main className="mx-auto max-w-2xl p-4 text-fg">
    <h1 className="text-xl font-bold">회의 중 로컬 효과음 검증</h1>
    <p>실제 통화 대신 로컬 회의 상태만 전환합니다. 환경음은 직접 켜기 전까지 재생하지 않습니다.</p>
    <button type="button" className="my-3 min-h-11 rounded-lg border px-3" aria-pressed={joined} onClick={() => {
      if (release.current) { release.current(); release.current = null; setJoined(false); }
      else { release.current = acquireStudioHuddleAudioFocus(); setJoined(true); }
    }}>{joined ? "로컬 회의 상태 종료" : "로컬 회의 상태 시작"}</button>
    <button type="button" className="m-3 min-h-11 rounded-lg border px-3" onClick={() => playOffice2dSpatialCue("room-enter")}>2D 입장 알림음</button>
    <StudioVirtualSpaceAmbientAudio scope={null} ready focused={false} away={false} />
  </main>;
}

const root = document.getElementById("test-root");
if (!root) throw new Error("음향 검증 root가 없습니다.");
createRoot(root).render(<Fixture />);
