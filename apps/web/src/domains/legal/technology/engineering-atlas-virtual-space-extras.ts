import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 6: 접근성 대체 경로 · 배경 GLB 업로드 파이프라인.
 * 경로·수치는 2026-10-12 기준 코드에서 직접 확인한 값이다. 공간 클라이언트는
 * 웹(Phaser) 캔버스에서 Godot 무대로 교체됐으므로 근거도 무대와 웹 셸에서 찾는다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const GBG = "apps/api/src/modules/studio-godot-space-layout";

export const VIRTUAL_SPACE_EXTRA_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "accessibility-alternatives-joystick-reduced-motion",
    category: "virtual-space",
    name: "Accessibility alternatives",
    title: t("걷지 않아도, 움직임이 부담돼도 쓸 수 있는 공간", "A space you can use without walking or with motion kept low"),
    status: "live",
    tagline: t(
      "Godot 무대는 키보드로 움직이고, 무대 밖 셸은 버튼·폼·상태 안내로 같은 일에 닿게 합니다.",
      "The Godot stage moves by keyboard, and the shell around it reaches the same jobs with buttons, forms and status text.",
    ),
    background: [
      t(
        "가상 스튜디오의 공간 클라이언트는 웹 캔버스에서 Godot 무대로 교체됐습니다. 무대는 iframe 안의 게임 화면이라 브라우저의 접근성 도구가 그 내부를 직접 읽을 수 없습니다. 그래서 접근성은 두 층으로 나눠 봅니다. 무대 안의 이동은 키보드가 맡고, 무대 밖의 안내·선택·채팅·편집은 웹 셸의 DOM이 맡습니다.",
        "The virtual studio's space client was replaced, from a web canvas to a Godot stage. The stage is a game screen inside an iframe, so the browser's accessibility tools cannot read inside it directly. Accessibility is therefore in two layers: movement inside the stage is the keyboard's job, and guidance, choosing, chat and editing outside the stage belong to the web shell's DOM.",
      ),
      t(
        "입장 로비는 들어가기 전에 조작법을 먼저 보여 줍니다. 이동은 WASD와 방향키, 상호작용은 E와 X, 리액션은 숫자 키입니다. 무대 밖 셸에서는 공간 선택 버튼이 aria-pressed로 눌림 상태를 알리고, 연결 상태는 role=status로 읽히며, 이모트 버튼마다 aria-label이 있고, 말풍선 채팅은 라벨이 붙은 입력과 기록 목록으로 되어 있어 키보드로 오갈 수 있습니다.",
        "The entry lobby shows the controls before you go in: WASD and the arrow keys to move, E and X to interact, and number keys for reactions. In the shell around the stage, the space-choice buttons report their pressed state with aria-pressed, the connection state is read as role=status, every emote button has an aria-label, and bubble chat is a labelled input plus a log list, so all of it can be reached by keyboard.",
      ),
      t(
        "배치 편집에도 끌지 않는 길이 있습니다. 무대에서 항목을 끌어 옮기는 대신, 셸의 배치 패널에서 선택한 구역·소품의 이름과 좌표·크기를 숫자 입력으로 고치고 삭제 버튼으로 지울 수 있습니다. 모션 감소는 공간 전용 설정이 아니라 사이트 공통 유틸이 운영체제의 prefers-reduced-motion을 구독해 셸의 앰비언트 효과를 줄이는 방식입니다.",
        "Layout editing also has a non-dragging path. Instead of dragging items on stage, the shell's layout panel lets you change a chosen zone or prop's name, position and size with number inputs and remove it with a delete button. Reduced motion is not a space-only setting: a site-wide utility subscribes to the operating system's prefers-reduced-motion and the shell's ambient effects follow it.",
      ),
      t(
        "한계도 분명합니다. Godot 무대 안의 아바타 위치나 말풍선을 스크린 리더가 읽어 주는지는 확인하지 못했습니다. 무대 iframe으로 포커스가 넘어간 뒤 키보드 이동이 끝까지 동작하는지, 모든 셸 기능을 키보드만으로 마칠 수 있는지의 전수 검증도 하지 못했습니다. 그래서 이 카드는 대체 경로가 코드에 있음을 확인한 기록일 뿐, 접근성 인증이 아닙니다.",
        "The limits are clear too. Whether a screen reader can read avatar positions or speech bubbles inside the Godot stage was not verified. Neither was a full audit of keyboard movement after focus moves into the stage iframe, or of finishing every shell feature by keyboard alone. So this card records that alternative routes exist in code; it is not an accessibility certification.",
      ),
    ],
    keyPoints: [
      t("걷기는 WASD·방향키·빈 공간 클릭, 안내는 로비가 먼저 보여 줍니다", "Walking is WASD, arrows or clicking empty space; the lobby shows how first"),
      t("무대 밖 셸은 버튼·폼·상태 안내가 있는 DOM이라 키보드로 닿습니다", "The shell outside the stage is DOM with buttons, forms and status text"),
      t("배치는 숫자 입력으로, 모션 감소는 사이트 공통 구독으로 대체합니다", "Layout falls back to number inputs; reduced motion to a site-wide subscription"),
    ],
    diagram: {
      id: "accessibility-alternatives-joystick-reduced-motion-diagram",
      kind: "graph",
      title: t("같은 목적지에 닿는 여러 길", "Several routes to the same destination"),
      caption: t(
        "걷기 외의 길이 같은 목적지로 이어지고, 모션 감소는 셸의 연출만 낮춥니다.",
        "Routes other than walking reach the same destination, and reduced motion only tones down the shell's effects.",
      ),
      alt: t(
        "키보드, 빈 공간 클릭, 웹 셸의 공간 선택과 채팅, 배치 패널의 숫자 입력이 모두 같은 목적지로 이어집니다. 사이트 공통 모션 감소 구독은 목적지를 바꾸지 않고 셸의 움직임 연출만 낮춥니다.",
        "The keyboard, clicking empty space, the shell's space choice and chat, and the layout panel's number inputs all lead to the same destination. The site-wide reduced-motion subscription does not change the destination; it only tones down the shell's motion effects.",
      ),
      nodes: [
        { id: "keys", label: t("키보드", "Keyboard"), sub: t("WASD · 방향키 · E/X", "WASD, arrows, E/X"), tone: "local", at: [1, 0] },
        { id: "stick", label: t("빈 공간 클릭", "Click empty space"), sub: t("무대 안 이동", "Move on stage"), tone: "local", at: [3, 0] },
        { id: "goal", label: t("같은 목적지", "Same destination"), sub: t("방 · 사람 · 기능", "Room, person, feature"), tone: "good", shape: "pill", at: [2, 1] },
        { id: "tap", label: t("웹 셸 DOM", "Web shell DOM"), sub: t("선택 · 채팅 · 상태", "Choice, chat, status"), tone: "local", at: [1, 2] },
        { id: "list", label: t("숫자 입력 편집", "Number-input editing"), sub: t("좌표 · 크기 · 삭제", "Position, size, delete"), tone: "local", at: [3, 2] },
        { id: "motion", label: t("모션 감소", "Reduced motion"), sub: t("사이트 공통 구독", "Site-wide subscription"), tone: "warn", at: [0, 1] },
      ],
      edges: [
        { from: "keys", to: "goal", label: t("이동", "move") },
        { from: "stick", to: "goal", label: t("이동", "move") },
        { from: "tap", to: "goal", label: t("직접", "direct") },
        { from: "list", to: "goal", label: t("편집", "edit") },
        { from: "motion", to: "goal", label: t("연출", "effects"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("입장 로비 · 조작법 안내", "Entry lobby · control guidance"),
        role: t(
          "들어가기 전에 이동(WASD·방향키·빈 공간 클릭), 상호작용(E·X), 리액션(숫자 키)을 미리 보여 줍니다.",
          "Before entry it shows movement (WASD, arrows, clicking empty space), interaction (E, X) and reactions (number keys).",
        ),
        paths: [`${V}/StudioVirtualSpaceEntryLobby.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("웹 셸 · 공간 선택과 상태·채팅", "Web shell · space choice, status and chat"),
        role: t(
          "공간 선택 버튼(aria-pressed), 연결 상태(role=status), 이모트 버튼(aria-label), 라벨이 붙은 말풍선 채팅 폼과 기록 목록을 DOM으로 제공합니다.",
          "Provides space-choice buttons (aria-pressed), the connection state (role=status), emote buttons (aria-label) and a labelled bubble-chat form and log as DOM.",
        ),
        paths: [`${V}/StudioGodotSpaceEmbed.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("배치 패널 · 숫자 입력 편집", "Layout panel · number-input editing"),
        role: t(
          "무대 드래그 대신 선택 항목의 이름·좌표·크기를 숫자 입력으로 고치고 버튼으로 지울 수 있습니다.",
          "Instead of dragging on stage, a selected item's name, position and size can be changed with number inputs and removed with a button.",
        ),
        paths: [`${V}/StudioGodotLayoutPanel.tsx`],
      },
      {
        feature: t("사이트 공통 모션 감소 구독", "Site-wide reduced-motion subscription"),
        role: t(
          "운영체제의 prefers-reduced-motion을 구독해 값이 바뀌면 바로 반영하고, 셸의 앰비언트 효과가 이를 따릅니다.",
          "Subscribes to the operating system's prefers-reduced-motion, reflects changes at once, and the shell's ambient effects follow it.",
        ),
        paths: ["apps/web/src/shared/ambient/useAmbientExperience.ts", "apps/web/src/shared/ambient/ambient-engine.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("모션 감소 설정 구독", "Subscribing to the reduced-motion setting"),
        language: "ts",
        code: `// prefers-reduced-motion 을 구독해 바뀔 때마다 알린다(useReducedMotionPreference 의 프레임워크 없는 버전).
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!query) {
    onChange(false); // matchMedia 가 없는 환경에서는 움직임을 줄이지 않는다
    return () => undefined;
  }
  onChange(query.matches);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener); // 정리 함수
}
// 켜지면: 셸의 앰비언트·등장 연출이 이 신호를 따라 움직임을 줄인다.`,
        codeEn: `// Subscribe to prefers-reduced-motion and report each change (a framework-free version of useReducedMotionPreference).
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!query) {
    onChange(false); // where matchMedia does not exist, motion is not reduced
    return () => undefined;
  }
  onChange(query.matches);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener); // cleanup function
}
// When on: the shell's ambient and entrance effects follow this signal and reduce motion.`,
        explain: t(
          "사용자가 운영체제 설정을 중간에 바꿔도 따라가도록 change 이벤트를 구독합니다. 공간 전용 설정이 아니라 사이트 공통 유틸이라, 셸의 다른 화면과 같은 신호를 공유합니다.",
          "It subscribes to the change event so the app follows even when the user flips the operating system setting mid-session. It is a site-wide utility rather than a space-only setting, so the shell shares one signal across screens.",
        ),
        source: "apps/web/src/shared/ambient/useAmbientExperience.ts",
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("숫자 입력으로 배치 고치기", "Fixing a layout with number inputs"),
        language: "ts",
        code: `// 배치 패널의 숫자 폼을 읽어 무대에 update 명령을 보낸다(StudioGodotLayoutPanel 제출부의 단순화).
export interface RectForm { name: string; x: string; y: string; w: string; h: string }
export function rectFromForm(form: RectForm): { name: string; rect: [number, number, number, number] } {
  const num = (value: string) => Number.parseFloat(value) || 0;
  return { name: form.name, rect: [num(form.x), num(form.y), num(form.w), num(form.h)] };
}`,
        codeEn: `// Read the layout panel's number form and send an update command to the stage (simplified from StudioGodotLayoutPanel's submit).
export interface RectForm { name: string; x: string; y: string; w: string; h: string }
export function rectFromForm(form: RectForm): { name: string; rect: [number, number, number, number] } {
  const num = (value: string) => Number.parseFloat(value) || 0;
  return { name: form.name, rect: [num(form.x), num(form.y), num(form.w), num(form.h)] };
}`,
        explain: t(
          "무대 위 드래그가 어려운 환경에서도 좌표와 크기를 숫자로 정확히 정할 수 있습니다. 폼 제출은 무대 드래그와 같은 update 명령으로 이어집니다.",
          "Even where dragging on stage is hard, position and size can be set exactly as numbers. Submitting the form leads to the same update command as a stage drag.",
        ),
        source: `${V}/StudioGodotLayoutPanel.tsx`,
        verify: "types",
      },
    ],
    links: [
      { title: "WCAG 2.2 · Animation from Interactions", url: "https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html", kind: "spec", note: t("움직임을 끌 수 있어야 하는 이유", "Why motion must be switchable") },
      { title: "WCAG 2.2 · Keyboard", url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html", kind: "spec", note: t("키보드만으로 쓸 수 있어야 함", "Operable with a keyboard alone") },
      { title: "MDN · prefers-reduced-motion", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion", kind: "docs", note: t("모션 감소 설정 읽기", "Reading the reduced-motion setting") },
      { title: "W3C WAI-ARIA Authoring Practices", url: "https://www.w3.org/WAI/ARIA/apg/", kind: "guide", note: t("접근 가능한 위젯 패턴", "Accessible widget patterns") },
    ],
    chapterIds: ["virtual-studio-world-authority", "quality"],
    talk: {
      pitch: t(
        "공간 클라이언트가 Godot 무대로 바뀌면서 접근성도 두 층이 됐습니다. 무대 안 이동은 WASD와 방향키가 맡고, 입장 로비가 조작법을 먼저 알려 줍니다. 무대 밖에서는 공간 선택·연결 상태·채팅·배치 편집이 웹 셸의 버튼과 폼으로 되어 있어 키보드로 닿고, 모션 감소는 사이트 공통 구독이 운영체제 설정을 따릅니다. 다만 무대 안을 스크린 리더가 읽는지는 확인하지 못했습니다.",
        "When the space client became a Godot stage, accessibility split into two layers. Movement on stage is handled by WASD and the arrow keys, and the entry lobby shows the controls first. Outside the stage, space choice, connection state, chat and layout editing are buttons and forms in the web shell that the keyboard can reach, and reduced motion follows the operating system through a site-wide subscription. How well a screen reader can read inside the stage was not verified.",
      ),
      analogy: t(
        "건물에 계단만 있지 않고 엘리베이터와 경사로, 안내 데스크가 함께 있는 것과 같습니다. 어느 길로 가도 같은 사무실에 닿습니다.",
        "It is like a building that has an elevator, a ramp and an information desk as well as stairs. Whichever way you go you arrive at the same office.",
      ),
      questions: [
        {
          question: t("키보드만으로 쓸 수 있나요?", "Can it be used with the keyboard alone?"),
          answer: t(
            "이동(WASD/방향키)과 상호작용(E/X)은 로비가 안내하고, 셸의 공간 선택·채팅·배치 편집은 버튼과 폼이라 키보드로 오갈 수 있습니다. 무대 iframe 안에서 끝까지 되는지의 전수 검증은 하지 않았습니다.",
            "Movement (WASD or arrows) and interaction (E or X) are announced by the lobby, and the shell's space choice, chat and layout editing are buttons and forms the keyboard can reach. A full audit inside the stage iframe was not done.",
          ),
        },
        {
          question: t("모션 감소는 무엇을 바꾸나요?", "What does reduced motion change?"),
          answer: t(
            "사이트 공통 구독이 운영체제의 prefers-reduced-motion을 따라 셸의 앰비언트·등장 연출을 줄입니다. Godot 무대 안 연출까지 줄이는지는 확인하지 못했습니다.",
            "A site-wide subscription follows the operating system's prefers-reduced-motion and reduces the shell's ambient and entrance effects. Whether it also reduces effects inside the Godot stage was not verified.",
          ),
        },
        {
          question: t("스크린 리더는요?", "What about screen readers?"),
          answer: t(
            "셸의 연결 상태는 role=status로, 공간 선택은 aria-pressed로 읽힙니다. 무대 안 아바타 위치나 말풍선을 읽어 주는 수준은 확인하지 못했습니다.",
            "The shell's connection state is exposed as role=status and space choice as aria-pressed. Reading avatar positions or bubbles inside the stage aloud was not verified.",
          ),
        },
      ],
      pitfall: t(
        "'WCAG 준수'나 '접근성 인증' 같은 표현을 쓰지 마세요. 이 카드는 대체 경로가 코드에 있음을 확인한 것이며, 무대 내부의 스크린 리더 사용성 검증이나 키보드 전수 검증이 아닙니다.",
        "Do not say 'WCAG compliant' or 'accessibility certified'. This card confirms that alternative routes exist in code; it is not a screen-reader usability test inside the stage or a full keyboard audit.",
      ),
    },
    technologies: ["Godot", "WAI-ARIA", "React", "matchMedia"],
    facts: [
      { value: "WASD · 방향키", label: t("로비가 안내하는 이동 키", "Movement keys the lobby announces"), source: `${V}/StudioVirtualSpaceEntryLobby.tsx` },
      { value: "200자", label: t("말풍선 채팅 입력 한 번의 최대 길이(maxLength)", "Maximum length of one bubble-chat entry (maxLength)"), source: `${V}/StudioGodotSpaceEmbed.tsx` },
      { value: "10", label: t("배치 숫자 입력의 step", "Step of the layout number inputs"), source: `${V}/StudioGodotLayoutPanel.tsx` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "custom-furniture-upload-pipeline",
    category: "virtual-space",
    name: "Furniture upload",
    title: t("내가 올린 GLB를 공간 배경으로 쓰기 위한 검수 줄", "An inspection line for using my own GLB as a space background"),
    status: "configured",
    tagline: t(
      "올린 GLB는 Godot가 실제로 읽는 형식인지 검사하고, 공간 정의에는 uploads/ 참조만 남깁니다.",
      "An uploaded GLB is checked for a format Godot actually loads, and the space definition keeps only an uploads/ reference.",
    ),
    background: [
      t(
        "사용자가 만든 3D 장면을 GLB 파일로 올려 Godot 공간의 배경으로 쓰는 기능입니다. 올린 파일은 믿을 수 없는 입력이고, 읽는 쪽은 사람이 아니라 Godot 런타임 로더입니다. 구조만 맞는 GLB라도 로더가 못 읽으면 무대는 조용히 기본 그림으로 떨어지므로, 검수 기준은 '유효한 GLB'가 아니라 'Godot가 실제로 읽는 GLB'입니다.",
        "This feature lets you upload a 3D scene you made as a GLB file and use it as the background of a Godot space. An uploaded file is untrusted input, and its reader is not a person but the Godot runtime loader. A structurally valid GLB that the loader cannot read makes the stage quietly fall back to its default drawing, so the inspection standard is not 'a valid GLB' but 'a GLB Godot actually loads'.",
      ),
      t(
        "순서는 이렇습니다. ① 작품의 활성 팀 멤버인지 확인합니다. ② 형식 검사: 확장자를 믿지 않고 매직 바이트와 버전(glTF 2.0), 청크 정합성을 읽고, 20MB를 넘거나 메시·BIN 청크가 없으면 거절합니다. Godot가 못 읽는 압축 확장(meshopt·Draco·KTX2 등)을 필수로 요구하는 파일도 거절합니다. ③ 통과하면 SHA-256 해시와 함께 자산 행으로 저장하고, 공간 정의에는 uploads/ 참조만 남깁니다.",
        "The steps: 1) Confirm an active team member of the work. 2) Check the format: ignoring the extension, read the magic bytes, the version (glTF 2.0) and chunk consistency, and reject anything over 20MB or without meshes or a BIN chunk. Files that require compression extensions Godot cannot read (meshopt, Draco, KTX2 and the like) are also rejected. 3) If it passes, store it as an asset row with a SHA-256 hash, and leave only an uploads/ reference in the space definition.",
      ),
      t(
        "무대에 넣을 때가 까다롭습니다. Godot 무대는 인증 헤더를 실을 수 없어, 셸이 주입하는 순간에만 참조를 API content 절대 URL로 바꾼 사본을 만들어 건넵니다. 무대가 편집 결과를 돌려보내면 역변환으로 정본 참조를 복원합니다. 저장되는 정의는 언제나 참조 형태라, 자격 정보가 정의에 섞이지 않습니다.",
        "Handing it to the stage is the delicate part. The Godot stage cannot carry authentication headers, so only at injection time does the shell build a copy whose reference is replaced with the API content absolute URL. When the stage returns an edited result, the reverse conversion restores the canonical reference. The stored definition is always in reference form, so no credentials leak into it.",
      ),
      t(
        "한계: 배경 content 서빙은 자산 id(UUID)를 아는 것을 전제로 인증 없이 열립니다. 방 안 전원에게 보이는 장식층이라 카탈로그 배경과 같은 가시성으로 둔 선택이지만, 비공개 파일처럼 말하면 안 됩니다. 운영 환경에서 실제 업로드가 일어나는지, 큰 배경의 무대 로딩 시간은 이 카드에서 확인하지 못했습니다.",
        "Limits: background content is served without authentication, on the premise that the asset id (a UUID) is known. It is a decorative layer everyone in the room sees, so it was given the same visibility as catalogue backgrounds, but it must not be described as a private file. Whether uploads actually happen in production, and how long a large background takes to load on stage, was not verified here.",
      ),
    ],
    keyPoints: [
      t("확장자가 아니라 매직 바이트와 청크 구조로 검사합니다", "It checks magic bytes and chunk structure, not the extension"),
      t("Godot가 못 읽는 압축 확장은 업로드 경계에서 거절합니다", "Compression extensions Godot cannot read are rejected at the boundary"),
      t("정의에는 참조만, 무대 주입 때만 content URL로 바꿉니다", "The definition holds a reference; only stage injection swaps in the content URL"),
    ],
    diagram: {
      id: "custom-furniture-upload-pipeline-diagram",
      kind: "graph",
      title: t("업로드부터 무대 로드까지의 검수 줄", "The inspection line from upload to stage loading"),
      caption: t(
        "Godot가 읽는 형식인지 검사해 저장하고, 정의에는 참조만 남긴 뒤 주입 때만 주소로 바꿉니다.",
        "Check it is a format Godot loads, store it, keep only a reference in the definition, and swap in the address only at injection.",
      ),
      alt: t(
        "업로드된 GLB는 매직 바이트·버전·필수 확장을 검사해 통과하면 해시와 함께 자산으로 저장되고, 실패하면 거절됩니다. 공간 정의에는 uploads/ 참조만 기록되고, 무대에 넣을 때만 셸이 content URL로 바꾼 사본을 건네 Godot 무대가 배경으로 읽습니다.",
        "An uploaded GLB is checked for magic bytes, version and required extensions; if it passes it is stored as an asset with its hash, and if it fails it is rejected. The space definition records only an uploads/ reference, and only when handing it to the stage does the shell pass a copy with the content URL, which the Godot stage loads as the background.",
      ),
      nodes: [
        { id: "upload", label: t("업로드", "Upload"), sub: t("GLB 파일", "GLB file"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "admit", label: t("형식 검사", "Format check"), sub: t("매직·버전·확장", "Magic, version, ext."), tone: "warn", shape: "diamond", at: [1, 0] },
        { id: "reencode", label: t("자산 저장", "Store asset"), sub: t("SHA-256 · DB 행", "SHA-256, DB row"), tone: "server", at: [2, 0] },
        { id: "store", label: t("공간 정의", "Space definition"), sub: t("uploads/ 참조만", "uploads/ reference only"), tone: "server", shape: "cylinder", at: [3, 0] },
        { id: "registry", label: t("무대 주입 사본", "Stage copy"), sub: t("content URL로 변환", "Swapped to a content URL"), tone: "server", shape: "cylinder", at: [4, 0] },
        { id: "reject", label: t("거절", "Rejected"), sub: t("400 오류", "400 error"), tone: "warn", at: [1, 1] },
        { id: "read", label: t("Godot 무대", "Godot stage"), sub: t("배경으로 로드", "Loads as background"), tone: "good", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "upload", to: "admit", label: t("파일", "file") },
        { from: "admit", to: "reencode", label: t("통과", "pass") },
        { from: "admit", to: "reject", label: t("실패", "fail"), style: "dashed" },
        { from: "reencode", to: "store", label: t("저장 뒤", "after") },
        { from: "store", to: "registry", label: t("주입 때", "inject") },
        { from: "registry", to: "read", label: t("로드", "load") },
      ],
    },
    usage: [
      {
        feature: t("배경 GLB 올리기(셸 패널)", "Uploading a background GLB (shell panel)"),
        role: t(
          "편집 모드에서 .glb 파일을 고르면 업로드하고, 성공하면 바로 이 공간의 배경으로 지정합니다. 배치 저장으로 확정됩니다.",
          "In edit mode, picking a .glb file uploads it and, on success, applies it as this space's background right away. Saving the layout makes it final.",
        ),
        paths: [`${V}/StudioGodotLayoutPanel.tsx`, `${V}/studio-godot-space.ts#uploadGodotSpaceBackground`],
        route: "/studio/space",
      },
      {
        feature: t("서버 검증과 자산 저장", "Server validation and asset storage"),
        role: t(
          "작품 멤버십을 확인하고, GLB 구조와 필수 확장을 검사한 뒤 SHA-256 해시와 함께 자산 행을 저장합니다.",
          "Checks work membership, validates the GLB structure and required extensions, then stores an asset row with a SHA-256 hash.",
        ),
        paths: [`${GBG}/studio-godot-background-glb.ts#validateGodotBackgroundGlb`, `${GBG}/studio-godot-space-background.service.ts#upload`],
      },
      {
        feature: t("무대 주입용 참조 변환", "Reference conversion for stage injection"),
        role: t(
          "저장 정의의 uploads/ 참조를 무대 주입 때만 content 절대 URL로 바꾸고, 무대의 회신은 역변환으로 정본 참조로 되돌립니다.",
          "Swaps the stored definition's uploads/ reference for the content absolute URL only at stage injection, and converts stage replies back to the canonical reference.",
        ),
        paths: [`${V}/studio-godot-space.ts#resolveGodotBackgroundForStage`, `${V}/studio-godot-space.ts#restoreGodotBackgroundReference`],
      },
      {
        feature: t("올린 배경 목록과 삭제", "Uploaded background list and deletion"),
        role: t(
          "작품의 배경 자산을 최신순으로 보여 주고, 패널에서 다른 배경으로 바꾸거나 지울 수 있습니다.",
          "Lists the work's background assets newest first, and the panel can switch to another background or delete one.",
        ),
        paths: [`${V}/studio-godot-space.ts#fetchGodotSpaceBackgrounds`, `${GBG}/studio-godot-space-background.service.ts#list`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("매직 바이트와 필수 확장으로 GLB 받아들이기", "Admitting a GLB by magic bytes and required extensions"),
        language: "ts",
        code: `// 매직 바이트·버전·필수 확장으로 Godot가 읽을 수 있는 GLB인지 본다(validateGodotBackgroundGlb 의 단순화).
const GLB_MAGIC = 0x46546c67; // "glTF"
const MAX_BYTES = 20 * 1024 * 1024; // 배경 GLB 용량 상한
const UNSUPPORTED = ["EXT_meshopt_compression", "KHR_draco_mesh_compression", "KHR_texture_basisu"];

export function admitGlb(bytes: Uint8Array, extensionsRequired: readonly string[]): { ok: boolean; reason?: string } {
  if (bytes.byteLength > MAX_BYTES) return { ok: false, reason: "bytes" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) return { ok: false, reason: "signature" };
  if (view.getUint32(4, true) !== 2) return { ok: false, reason: "version" }; // glTF 2.0 만 받는다
  const bad = extensionsRequired.filter((name) => UNSUPPORTED.includes(name));
  if (bad.length > 0) return { ok: false, reason: "extensions" };
  return { ok: true };
}`,
        codeEn: `// Judge a GLB by magic bytes, version and required extensions (simplified from validateGodotBackgroundGlb).
const GLB_MAGIC = 0x46546c67; // "glTF"
const MAX_BYTES = 20 * 1024 * 1024; // background GLB size cap
const UNSUPPORTED = ["EXT_meshopt_compression", "KHR_draco_mesh_compression", "KHR_texture_basisu"];

export function admitGlb(bytes: Uint8Array, extensionsRequired: readonly string[]): { ok: boolean; reason?: string } {
  if (bytes.byteLength > MAX_BYTES) return { ok: false, reason: "bytes" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) return { ok: false, reason: "signature" };
  if (view.getUint32(4, true) !== 2) return { ok: false, reason: "version" }; // glTF 2.0 only
  const bad = extensionsRequired.filter((name) => UNSUPPORTED.includes(name));
  if (bad.length > 0) return { ok: false, reason: "extensions" };
  return { ok: true };
}`,
        explain: t(
          "이름이나 선언된 형식은 공격자가 마음대로 고를 수 있어서 믿지 않습니다. 실제 검사는 청크 정합성과 메시·BIN 청크까지 보지만, 핵심 기준은 구조가 아니라 소비자인 Godot 런타임이 실제로 읽는 형식인지입니다.",
          "Names and declared types are chosen freely by an attacker, so they are not trusted. The real check goes on to chunk consistency and the meshes and BIN chunk, but the core standard is not structure alone: it is whether the consumer, the Godot runtime, actually loads the format.",
        ),
        source: `${GBG}/studio-godot-background-glb.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("참조를 무대용 주소로 바꾸기", "Swapping a reference for a stage address"),
        language: "ts",
        code: `// 저장 정의는 uploads/<id>.glb 참조만 싣고, 무대 주입 사본에서만 content URL로 바꾼다(resolveGodotBackgroundForStage 의 단순화).
const REF = /^uploads\\/([0-9a-f-]{36})\\.glb$/;
export function stageGlb(glb: string, contentUrl: (assetId: string) => string): string {
  const match = REF.exec(glb);
  return match ? contentUrl(match[1] as string) : glb; // 기본 배경 같은 비참조 값은 그대로 둔다
}`,
        codeEn: `// The stored definition carries only an uploads/<id>.glb reference; only the stage copy swaps in a content URL (simplified from resolveGodotBackgroundForStage).
const REF = /^uploads\\/([0-9a-f-]{36})\\.glb$/;
export function stageGlb(glb: string, contentUrl: (assetId: string) => string): string {
  const match = REF.exec(glb);
  return match ? contentUrl(match[1] as string) : glb; // non-reference values such as a default background stay as they are
}`,
        explain: t(
          "정의가 정본이라 주소 형식이 바뀌어도 정의는 그대로 남습니다. 무대가 편집 결과를 돌려보낼 때는 역변환으로 참조를 복원해, URL이 정본에 섞이지 않게 합니다.",
          "Because the definition is canonical, it stays unchanged even if the address form changes. When the stage returns an edited result, the reverse conversion restores the reference so no URL leaks into the canonical form.",
        ),
        source: `${V}/studio-godot-space.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "OWASP · File Upload Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html", kind: "guide", note: t("업로드 방어의 표준 체크리스트", "The standard checklist for upload defences") },
      { title: "Khronos · glTF 2.0 Specification", url: "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html", kind: "spec", note: t("GLB 컨테이너와 청크 구조", "The GLB container and chunk layout") },
      { title: "Wikipedia · List of file signatures", url: "https://en.wikipedia.org/wiki/List_of_file_signatures", kind: "article", note: t("첫 바이트로 형식을 아는 방법", "Knowing a format from its first bytes") },
      { title: "Khronos · glTF", url: "https://www.khronos.org/gltf/", kind: "docs", note: t("glTF 생태계 개요", "An overview of the glTF ecosystem") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "사용자가 올린 GLB를 Godot 공간 배경으로 쓸 때는 두 가지를 검사합니다. 작품 멤버인지, 그리고 Godot 런타임이 실제로 읽을 수 있는 형식인지입니다. 매직 바이트와 버전, 청크 구조를 보고 meshopt나 Draco 같은 압축 확장을 필수로 요구하면 거절합니다. 저장되는 공간 정의에는 uploads/ 참조만 남고, 무대에 넣을 때만 셸이 content 주소로 바꾼 사본을 건넵니다.",
        "When a user's GLB becomes a Godot space background, two things are checked: whether they are a member of the work, and whether the format is one the Godot runtime actually loads. Magic bytes, version and chunk structure are read, and a file that requires compression extensions such as meshopt or Draco is rejected. The stored space definition keeps only an uploads/ reference, and only at injection does the shell hand over a copy with the content address.",
      ),
      analogy: t(
        "무대 소품 반입 검수와 같습니다. 규격에 맞는 소품만 들이고, 소품 목록에는 보관 번호만 적어 두며, 무대에 올릴 때만 실제 위치를 알려 줍니다.",
        "It is like checking props brought into a theatre: only props that meet the spec come in, the prop list records only a storage number, and the actual position is shared only when the prop goes on stage.",
      ),
      questions: [
        {
          question: t("아무 GLB나 올릴 수 있나요?", "Can any GLB be uploaded?"),
          answer: t(
            "아니요. glTF 2.0 바이너리 GLB여야 하고 20MB를 넘지 않아야 하며, Godot가 읽지 못하는 압축 확장(meshopt·Draco·KTX2 등)을 필수로 요구하면 거절됩니다. 메시가 없는 파일도 배경으로 쓸 수 없습니다.",
            "No. It must be a glTF 2.0 binary GLB of at most 20MB, and a file that requires compression extensions Godot cannot read (meshopt, Draco, KTX2 and the like) is rejected. A file with no meshes cannot be a background either.",
          ),
        },
        {
          question: t("남의 배경을 가져다 쓸 수 있나요?", "Can I use someone else's background?"),
          answer: t(
            "업로드·목록·삭제는 작품의 활성 팀 멤버만 됩니다. 다만 배경 content 읽기는 자산 id를 아는 것을 전제로 인증 없이 열립니다. 방 안 전원에게 보이는 장식층이라 카탈로그 배경과 같은 가시성으로 둔 것입니다.",
            "Uploading, listing and deleting are for active team members of the work only. Reading background content, though, is open without authentication on the premise that the asset id is known: it is a decorative layer everyone in the room sees, given the same visibility as catalogue backgrounds.",
          ),
        },
        {
          question: t("올리면 바로 확정되나요?", "Is it final as soon as it is uploaded?"),
          answer: t(
            "업로드하면 바로 이 공간의 배경으로 지정되지만, 공간 정의에 남기는 것은 배치 저장을 눌러야 확정됩니다. 저장이 다른 편집자와 충돌하면 최신본을 불러와 다시 편집해야 합니다.",
            "Uploading applies it as this space's background right away, but writing it into the space definition is final only when the layout is saved. If a save conflicts with another editor, the latest layout must be reloaded and edited again.",
          ),
        },
      ],
      pitfall: t(
        "'모든 GLB를 지원한다'거나 '비공개 저장소'라고 말하지 마세요. Godot가 못 읽는 필수 확장은 거절되고, 배경 content는 자산 id 기반으로 인증 없이 서빙됩니다. 침투 시험 같은 보안 검증 결과도 없습니다.",
        "Do not say 'all GLBs are supported' or 'private storage'. Required extensions Godot cannot read are rejected, and background content is served without authentication by asset id. There are no security-verification results such as a penetration test either.",
      ),
    },
    technologies: ["Godot", "glTF", "NestJS", "SHA-256"],
    facts: [
      { value: "20MB", label: t("배경 GLB 용량 상한(설계값)", "Background GLB size cap (design value)"), source: `${GBG}/studio-godot-background-glb.ts` },
      { value: "glTF 2.0", label: t("올릴 수 있는 GLB 버전", "GLB version that can be uploaded"), source: `${GBG}/studio-godot-background-glb.ts` },
      { value: "96", label: t("공간 정의에서 배경 GLB 참조의 최대 길이(자)", "Maximum length of a background GLB reference in a space definition (chars)"), source: `${V}/studio-godot-space.ts` },
      { value: "120", label: t("저장되는 배경 파일 이름의 최대 길이(자)", "Maximum length of a stored background file name (chars)"), source: `${GBG}/studio-godot-space-background.service.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
