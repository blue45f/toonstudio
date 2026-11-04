import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { SpaceAvatar } from "../../src/domains/creator/virtual-space/hud/SpaceAvatar";
import { STUDIO_VIRTUAL_ART_STYLES } from "../../src/domains/creator/virtual-space/studio-virtual-space-art-style";
import { STUDIO_CHARACTER_SKINS } from "../../src/domains/creator/virtual-space/studio-virtual-space-character-skins";
import { StudioVirtualSpaceEntryLobby } from "../../src/domains/creator/virtual-space/StudioVirtualSpaceEntryLobby";
import { StudioVirtualSpaceThemePicker } from "../../src/domains/creator/virtual-space/StudioVirtualSpaceThemePicker";
import { StudioVirtualThemeCharacterPicker } from "../../src/domains/creator/virtual-space/StudioVirtualThemeCharacterPicker";

import type { StudioSpaceThemeKey } from "../../src/domains/creator/virtual-space/studio-virtual-space-theme";
import "../../src/app/styles/globals.css";
import "../../src/domains/creator/virtual-space/hud/space-hud.css";
import "../../src/domains/creator/virtual-space/studio-virtual-space.css";

// 실제 UI와 기존 자산을 사용하는 독립 검증 화면이다. 인증·멀티플레이·월드 렌더 검증을 대신하지 않는다.
function Fixture() {
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [spaceTheme, setSpaceTheme] = useState<StudioSpaceThemeKey>("modern-office");
  const [nickname, setNickname] = useState("미리보기 작가");
  if (new URLSearchParams(window.location.search).has("lobby")) return <MemoryRouter>
    <StudioVirtualSpaceEntryLobby stageKind="office2d" identity="visual-review" avatarIndex={avatarIndex} artStyle="neon"
      nickname={nickname} returning={false} personal projectName="로비 캐릭터 검증"
      onAvatarIndex={setAvatarIndex} onNickname={setNickname} onEnter={() => undefined} />
  </MemoryRouter>;
  return <main className="mx-auto max-w-6xl p-4 text-fg">
    <h1 className="text-xl font-bold">캐릭터 선택창 · 상태창 작화 일치</h1>
    <p>기존 캐릭터와 테마 캐릭터를 선택해 여섯 작화의 상태창을 비교합니다.</p>
    <StudioVirtualThemeCharacterPicker mode="all" stageKind="office2d" identity="visual-review" artStyle="neon" spaceTheme={spaceTheme} avatarIndex={avatarIndex} onSelect={setAvatarIndex} />
    <section className="my-4 rounded-xl border p-4" data-review-office><h2>기본 2D 월드 직군</h2><SpaceAvatar identity="visual-review" avatarIndex={avatarIndex} stageKind="office2d" size="lg" /></section>
    <div className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {STUDIO_VIRTUAL_ART_STYLES.map((style) => <section key={style.key} data-review-style={style.key} className="rounded-xl border p-4">
        <h2>{style.labelKo}</h2>
        <p>{STUDIO_CHARACTER_SKINS[avatarIndex]?.labelKo}</p>
        <SpaceAvatar artStyle={style.key} identity="visual-review" avatarIndex={avatarIndex} size="lg" />
      </section>)}
    </div>
    <StudioVirtualSpaceThemePicker value={spaceTheme} onChange={setSpaceTheme} />
  </main>;
}
const root = document.getElementById("test-root");
if (!root) throw new Error("캐릭터 검증 root가 없습니다.");
createRoot(root).render(<Fixture />);
