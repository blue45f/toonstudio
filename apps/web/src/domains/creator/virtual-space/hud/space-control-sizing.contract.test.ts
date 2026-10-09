import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sitewideCss = readFileSync(new URL("../../../../app/styles/sitewide-visual-ux.css", import.meta.url), "utf8");
const hudCss = readFileSync(new URL("./space-hud.css", import.meta.url), "utf8");
const lobbyCss = readFileSync(new URL("./space-lobby.css", import.meta.url), "utf8");
const spaceCss = readFileSync(new URL("../studio-virtual-space.css", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../StudioVirtualSpacePage.tsx", import.meta.url), "utf8");
const lobbySource = readFileSync(new URL("../StudioVirtualSpaceEntryLobby.tsx", import.meta.url), "utf8");

/** 사이트 공통 버튼 규칙(#main-content 아이디 특이도)이 가상 스튜디오 컨트롤의 자체 크기를 누르던 문제의 회귀 방지. */
describe("가상 스튜디오 컨트롤 크기 계약", () => {
  it("HUD와 입장 로비의 루트는 컨트롤 크기를 스스로 정한다고 표시한다", () => {
    expect(pageSource).toMatch(/className="space-hud" data-own-control-size="true"/u);
    expect(lobbySource).toMatch(/className="studio-vspace-entry space-lobby" data-own-control-size="true"/u);
  });

  it("사이트 공통 줄바꿈·높이 바닥 규칙은 그 표시 아래에서 물러난다", () => {
    const exempt = ':where(:not([data-own-control-size] *))';
    // 줄바꿈 규칙, 데스크톱 높이 바닥, 터치 높이 바닥 — 세 선언 모두 면제 조건을 갖는다.
    const guarded = sitewideCss.split(exempt).length - 1;
    expect(guarded).toBeGreaterThanOrEqual(4);
    // 고대비 테마의 !important 바닥도 같은 면제를 갖는다(없으면 고대비에서 140px 카드가 44px로 눌린다).
    expect(sitewideCss).toMatch(/:root\[data-design-theme="contrast"\] #main-content :is\(\s*button,[^)]*\):where\(:not\(\[data-own-control-size\] \*\)\) \{\s*min-inline-size: var\(--site-control-size\) !important;/u);
    expect(sitewideCss).toMatch(/#main-content :where\(button, \[role="button"\], \[role="tab"\], \[role="option"\]\):where\(:not\(\[data-own-control-size\] \*\)\) \{\s*max-inline-size: 100%;/u);
    expect(sitewideCss).toMatch(/@media \(min-width: 768px\) \{\s*#main-content :where\(button[^{]*\):where\(:not\(\[data-own-control-size\] \*\)\) \{\s*min-block-size: 2\.5rem;/u);
    expect(sitewideCss).toMatch(/@media \(pointer: coarse\) \{\s*#main-content :is\(button[^{]*\):where\(:not\(\[data-own-control-size\] \*\)\) \{\s*min-block-size: var\(--site-control-size\);/u);
  });

  it("면제된 HUD·로비는 터치 기기의 44px 바닥을 특이도 0으로 직접 둔다", () => {
    for (const css of [hudCss, lobbyCss]) {
      expect(css).toMatch(/@media \(pointer: coarse\) \{\s*:where\(\.space-(?:hud|lobby)\) :where\(button, \[role="button"\], \[role="tab"\], \[role="option"\], select, textarea\)[^{]*\{\s*min-block-size: var\(--site-control-size, 44px\);/u);
    }
  });

  it("면제된 HUD·로비는 고대비 테마의 44px 바닥도 특이도 0으로 직접 둔다", () => {
    for (const [css, root] of [[hudCss, "space-hud"], [lobbyCss, "space-lobby"]] as const) {
      expect(css).toContain(`:where(:root[data-design-theme="contrast"]) :where(.${root}) :where(button, [role="button"], [role="tab"], [role="option"], select, textarea)`);
      expect(css).toMatch(new RegExp(`:where\\(:root\\[data-design-theme="contrast"\\]\\) :where\\(\\.${root}\\) :where\\([^)]*\\)[^{]*\\{\\s*min-block-size: var\\(--site-control-size, 44px\\);\\s*min-inline-size: var\\(--site-control-size, 44px\\);`, "u"));
    }
  });

  it("22px 원 + 44px 눌림 영역으로 설계된 지도 점프 마커는 터치·고대비 바닥에서 제외한다", () => {
    expect(hudCss).toContain(':where(:not(.space-minimap__zone-jump))');
    expect(hudCss.split(':where(:not(.space-minimap__zone-jump))').length - 1).toBe(2);
  });

  it("고대비에서는 칩 컨트롤도 44px가 된다", () => {
    expect(hudCss).toContain(':root[data-design-theme="contrast"] :is(.space-minimap__gate-chip, .space-chat-input__hint, .space-chat__open-button) { min-height: var(--site-control-size, 44px); }');
  });

  it("지도 구역 점프 마커는 24px 원(WCAG 2.2 최소 대상 크기)이고 구역 버튼 모서리에 걸쳐 눌리는 영역을 32px까지만 넓힌다", () => {
    expect(hudCss).toMatch(/\.space-minimap__zone-jump \{[^}]*top: -8px;[^}]*right: -6px;[^}]*width: 24px;[^}]*height: 24px;/u);
    // 버튼 모서리에 걸쳐 있으므로 44px까지 넓히면 구역 버튼 모서리 클릭을 가로챈다.
    expect(hudCss).toMatch(/\.space-minimap__zone-jump::after \{ content: ""; position: absolute; inset: -4px;/u);
  });

  it("좁은 도크에서 작업 시작 글자는 접근성 트리에 남기고, 휴대폰 도크 가운데 버튼은 글자를 보여 준다", () => {
    // display:none이면 아이콘만 있는 버튼이 이름을 잃는다(axe button-name critical).
    expect(hudCss).not.toMatch(/\.space-dock__primary > span \{ display: none; \}/u);
    expect(hudCss).toMatch(/@container space-dock \(max-width: 640px\) \{[^}]*\.space-dock__primary > span \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\);/u);
    expect(hudCss).toMatch(/\.space-mobile-dock__work \.space-dock__primary > span \{ position: static; width: auto; height: auto; clip-path: none;/u);
    // 주 버튼 공통 규칙(0,2,1)이 패딩·글자 크기를 덮어 글자가 잘리지 않도록 속성 선택자로 특이도를 올린다.
    expect(hudCss).toMatch(/\.space-mobile-dock__work \.space-dock__primary\[data-workspace-primary-action\] \{ gap: 2px; padding: 6px 4px; font-size: 12px; \}/u);
  });

  it("휴대폰 도크 가운데 칸은 다른 칸보다 넓다(영어 'Start work'가 360폭에서 말줄임이 되던 것)", () => {
    expect(hudCss).toMatch(/\.space-mobile-dock \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) minmax\(0, 1\.3fr\) repeat\(2, minmax\(0, 1fr\)\);/u);
  });

  it("휴대폰 리액션 줄의 칸은 라벨 길이에 맞춰 넓어진다(고정 56px이면 영어 'Thumbs up'·'Coffee break'가 잘린다)", () => {
    expect(hudCss).toMatch(/\.space-emote-picker\[data-variant="strip"\] \.space-emote-picker__item \{[^}]*flex: 0 0 auto;[^}]*min-width: 56px;[^}]*max-width: 104px;/u);
    expect(hudCss).not.toMatch(/flex: 0 0 56px/u);
  });

  it("화면 크기(줌) 버튼은 터치·고대비에서 44px 바닥을 지키고, 옆 패널이 열리면 패널 왼쪽으로 비켜 선다", () => {
    // 데스크톱에서는 28px 배율 칸이지만 coarse 포인터와 고대비에서는 다른 HUD 컨트롤과 같은 44px가 된다.
    expect(hudCss).toMatch(/@media \(pointer: coarse\) \{ \.space-zoom__level \{ min-height: var\(--site-control-size, 44px\); \} \}/u);
    expect(hudCss).toContain(':root[data-design-theme="contrast"] .space-zoom__level { min-height: var(--site-control-size, 44px); }');
    expect(hudCss).toMatch(/\.space-hud\[data-panel-open\]\[data-hud-layout="desktop"\] \.space-hud__slot--top-right,\s*\.space-hud\[data-panel-open\]\[data-hud-layout="desktop"\] \.space-hud__slot--bottom-end \{\s*right: calc\(var\(--space-panel-width\)/u);
    expect(hudCss).toMatch(/@media \(forced-colors: active\) \{[^@]*\.space-zoom,/u);
  });

  it("지도 구역 버튼은 줄바꿈하지 않고 마커와 한 묶음의 중심이 구역 중심이다(가장자리 구역 라벨이 CA/FE로 끊기던 것)", () => {
    expect(hudCss).toMatch(/\.space-minimap__zone-actions \{ position: absolute; transform: translate\(-50%, -50%\); \}/u);
    expect(hudCss).toMatch(/\.space-minimap__zone-button \{[^}]*position: relative;[^}]*white-space: nowrap;/u);
  });

  it("바닥에 기대던 칩 컨트롤은 40px를 직접 선언하고 터치에서는 44px로 올린다", () => {
    expect(hudCss).toMatch(/\.space-minimap__gate-chip \{[^}]*min-height: 40px;/u);
    expect(hudCss).toMatch(/\.space-chat-input__hint \{[^}]*min-height: 40px;/u);
    expect(hudCss).toMatch(/\.space-chat__open-button \{[^}]*min-height: 40px;/u);
    expect(hudCss).toMatch(/@media \(pointer: coarse\) \{\s*\.space-minimap__gate-chip, \.space-chat-input__hint, \.space-chat__open-button \{ min-height: var\(--site-control-size, 44px\); \}/u);
  });

  it("캐릭터 피커 미리보기는 행·열을 상자 크기로 고정해 이미지가 카드 밖으로 넘치지 않는다", () => {
    expect(spaceCss).toMatch(/\.studio-vspace-character-picker__preview\{display:grid;grid-template:minmax\(0,1fr\)\/minmax\(0,1fr\);[^}]*height:100px/u);
    expect(spaceCss).toContain("min-height:140px");
  });

  it("패널이 열려 상단 중앙 칸이 좁아져도 NPC 카드의 대화 버튼이 두 줄로 깨지지 않는다", () => {
    expect(hudCss).toMatch(/\.space-hud__slot--top-center \{[^}]*container: space-top \/ inline-size;/u);
    expect(hudCss).toMatch(/\.space-proximity__talk \{[^}]*white-space: nowrap;/u);
    expect(hudCss).toMatch(/@container space-top \(max-width: 300px\) \{\s*\.space-proximity__npc-badge \{ display: none; \}/u);
  });

  it("휴대폰에서 리액션 줄이 열리면 같은 자리의 말 걸기 버튼을 숨기고, 루트가 열린 팝오버를 속성으로 알린다", () => {
    expect(pageSource).toMatch(/data-dock-popover=\{dockPopover \?\? undefined\}/u);
    expect(hudCss).toMatch(/\.space-hud\[data-hud-layout="mobile"\]\[data-dock-popover="react"\] \.space-chat--closed \{ visibility: hidden; \}/u);
  });

  it("휴대폰에서는 미니 투어가 열려 있는 동안 환영 배너를 접는다", () => {
    expect(pageSource).toMatch(/import \{[^}]*\bspaceHudShowsEventBanner\b[^}]*\} from "\.\/hud\/space-hud-priority";/u);
    expect(pageSource).toMatch(/spaceHudShowsEventBanner\(\{ desktop, coachOpen: coach !== null \}\) \? <SpaceEventBanner/u);
  });

  it("좁은 화면과 채팅 패널이 열린 동안에는 말풍선 채팅 힌트를 접고, 하단 프롬프트가 맡은 NPC 카드에는 대화 버튼을 두지 않는다", () => {
    expect(pageSource).toMatch(/import \{[^}]*\bspaceHudChatHintBlocked\b[^}]*\} from "\.\/hud\/space-hud-priority";/u);
    expect(pageSource).toMatch(/<SpaceChatInput blocked=\{spaceHudChatHintBlocked\(\{[^}]*chatPanelOpen: chatOpen, touch \}\)\}/u);
    expect(pageSource).toMatch(/studioNearbyCards\(\{[^}]*promptNpcId: promptNpc\?\.id \?\? null \}\)/u);
  });
});
