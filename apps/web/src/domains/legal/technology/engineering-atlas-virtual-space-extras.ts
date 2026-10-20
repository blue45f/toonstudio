import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 6: 접근성 대체 경로 · 커스텀 가구 이미지 업로드 파이프라인.
 * 경로·수치는 2026-10-21 기준 코드에서 직접 확인한 값이다. 공간 클라이언트는
 * 웹(Phaser) 캔버스 단일 체제이므로 근거도 캔버스와 웹 셸·공유 계약에서 찾는다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const DEC = "apps/api/src/modules/studio-virtual-space-decoration";

export const VIRTUAL_SPACE_EXTRA_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "accessibility-alternatives-joystick-reduced-motion",
    category: "virtual-space",
    name: "Accessibility alternatives",
    title: t("걷지 않아도, 움직임이 부담돼도 쓸 수 있는 공간", "A space you can use without walking or with motion kept low"),
    status: "live",
    tagline: t(
      "무대는 Phaser 캔버스라 키보드와 조이스틱으로 움직이고, 셸은 버튼·폼·상태 안내로 같은 일에 닿게 합니다.",
      "The stage is a Phaser canvas moved by keyboard and joystick, and the shell reaches the same jobs with buttons, forms and status text.",
    ),
    background: [
      t(
        "가상 스튜디오의 공간은 Phaser 캔버스입니다. 캔버스는 같은 문서 안의 화면이라 iframe 경계는 없지만, 캔버스 내부를 브라우저 접근성 도구가 직접 읽지는 못합니다. 그래서 접근성은 두 층으로 나눠 봅니다. 캔버스 안의 이동은 키보드와 조이스틱이 맡고, 안내·선택·채팅·편집은 웹 셸의 DOM이 맡습니다.",
        "The virtual studio's space is a Phaser canvas. The canvas sits in the same document, so there is no iframe boundary, but the browser's accessibility tools still cannot read inside a canvas directly. Accessibility is therefore in two layers: movement inside the canvas is the keyboard's and the joystick's job, and guidance, choosing, chat and editing belong to the web shell's DOM.",
      ),
      t(
        "입장 로비는 들어가기 전에 조작법을 먼저 보여 줍니다. 이동은 WASD와 방향키, 상호작용은 E와 X, 리액션은 숫자 키입니다. 무대 밖 셸에서는 공간 선택 버튼이 aria-pressed로 눌림 상태를 알리고, 연결 상태는 role=status로 읽히며, 이모트 버튼마다 aria-label이 있고, 말풍선 채팅은 라벨이 붙은 입력과 기록 목록으로 되어 있어 키보드로 오갈 수 있습니다.",
        "The entry lobby shows the controls before you go in: WASD and the arrow keys to move, E and X to interact, and number keys for reactions. In the shell around the stage, the space-choice buttons report their pressed state with aria-pressed, the connection state is read as role=status, every emote button has an aria-label, and bubble chat is a labelled input plus a log list, so all of it can be reached by keyboard.",
      ),
      t(
        "배치 편집에도 끌지 않는 길이 있습니다. 캔버스에서 항목을 끌어 옮기는 대신, 셸의 월드 저작 패널에서 선택한 항목의 이름과 좌표·크기를 숫자 입력으로 고치고 삭제 버튼으로 지울 수 있습니다. 모션 감소는 캔버스도 직접 구독합니다. 캔버스가 운영체제의 prefers-reduced-motion을 읽어 자기 연출을 줄이고, 사이트 공통 유틸도 같은 신호로 셸의 앰비언트 효과를 줄입니다.",
        "Layout editing also has a non-dragging path. Instead of dragging items on the canvas, the shell's world authoring panel lets you change a chosen item's name, position and size with number inputs and remove it with a delete button. The canvas also subscribes to reduced motion directly: it reads the operating system's prefers-reduced-motion and tones down its own effects, and a site-wide utility follows the same signal for the shell's ambient effects.",
      ),
      t(
        "한계도 분명합니다. 캔버스 안의 아바타 위치나 말풍선을 스크린 리더가 읽어 주는지는 확인하지 못했습니다. 캔버스에 포커스가 간 뒤 키보드 이동이 끝까지 동작하는지, 모든 셸 기능을 키보드만으로 마칠 수 있는지의 전수 검증도 하지 못했습니다. 그래서 이 카드는 대체 경로가 코드에 있음을 확인한 기록일 뿐, 접근성 인증이 아닙니다.",
        "The limits are clear too. Whether a screen reader can read avatar positions or speech bubbles inside the canvas was not verified. Neither was a full audit of keyboard movement after focus moves into the canvas, or of finishing every shell feature by keyboard alone. So this card records that alternative routes exist in code; it is not an accessibility certification.",
      ),
    ],
    keyPoints: [
      t("걷기는 WASD·방향키·빈 공간 클릭·조이스틱, 안내는 로비가 먼저 보여 줍니다", "Walking is WASD, arrows, clicking empty space or the joystick; the lobby shows how first"),
      t("무대 밖 셸은 버튼·폼·상태 안내가 있는 DOM이라 키보드로 닿습니다", "The shell outside the stage is DOM with buttons, forms and status text"),
      t("배치는 숫자 입력으로, 모션 감소는 캔버스와 셸이 함께 구독합니다", "Layout falls back to number inputs; the canvas and shell both subscribe to reduced motion"),
    ],
    diagram: {
      id: "accessibility-alternatives-joystick-reduced-motion-diagram",
      kind: "graph",
      title: t("같은 목적지에 닿는 여러 길", "Several routes to the same destination"),
      caption: t(
        "걷기 외의 길이 같은 목적지로 이어지고, 모션 감소는 캔버스와 셸의 연출을 낮춥니다.",
        "Routes other than walking reach the same destination, and reduced motion tones down canvas and shell effects.",
      ),
      alt: t(
        "키보드, 빈 공간 클릭, 터치 조이스틱, 웹 셸의 공간 선택과 채팅, 저작 패널의 숫자 입력이 모두 같은 목적지로 이어집니다. 모션 감소 구독은 목적지를 바꾸지 않고 캔버스와 셸의 움직임 연출만 낮춥니다.",
        "The keyboard, clicking empty space, the touch joystick, the shell's space choice and chat, and the authoring panel's number inputs all lead to the same destination. The reduced-motion subscription does not change the destination; it only tones down the canvas and shell motion effects.",
      ),
      nodes: [
        { id: "keys", label: t("키보드", "Keyboard"), sub: t("WASD · 방향키 · E/X", "WASD, arrows, E/X"), tone: "local", at: [1, 0] },
        { id: "stick", label: t("조이스틱", "Joystick"), sub: t("터치 · 8방향 스냅", "Touch, 8-way snap"), tone: "local", at: [3, 0] },
        { id: "goal", label: t("같은 목적지", "Same destination"), sub: t("방 · 사람 · 기능", "Room, person, feature"), tone: "good", shape: "pill", at: [2, 1] },
        { id: "tap", label: t("웹 셸 DOM", "Web shell DOM"), sub: t("선택 · 채팅 · 상태", "Choice, chat, status"), tone: "local", at: [1, 2] },
        { id: "list", label: t("숫자 입력 편집", "Number-input editing"), sub: t("좌표 · 크기 · 삭제", "Position, size, delete"), tone: "local", at: [3, 2] },
        { id: "motion", label: t("모션 감소", "Reduced motion"), sub: t("캔버스·셸 구독", "Canvas and shell"), tone: "warn", at: [0, 1] },
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
          "공간 선택 버튼(aria-pressed), 연결 상태(role=status), 이모트 버튼(aria-label), 라벨이 붙은 말풍선 채팅 폼과 기록 목록을 DOM으로 제공합니다. 터치 기기에서는 조이스틱(고정·플로팅·탭, 8방향 스냅)이 걷기를 대신합니다.",
          "Provides space-choice buttons (aria-pressed), the connection state (role=status), emote buttons (aria-label) and a labelled bubble-chat form and log as DOM. On touch devices a joystick (fixed, floating and tap modes, 8-way snap) replaces walking.",
        ),
        paths: [`${V}/StudioVirtualSpacePage.tsx`, `${V}/hud/SpaceChatPanel.tsx`, `${V}/hud/SpaceEmotePicker.tsx`, `${V}/StudioVirtualSpaceJoystick.tsx`, `${V}/studio-virtual-space-joystick-input.ts`],
        route: "/studio/space",
      },
      {
        feature: t("월드 저작 패널 · 숫자 입력 편집", "World authoring panel · number-input editing"),
        role: t(
          "캔버스 드래그 대신 선택 항목의 이름·좌표·크기를 숫자 입력으로 고치고 버튼으로 지울 수 있습니다.",
          "Instead of dragging on the canvas, a selected item's name, position and size can be changed with number inputs and removed with a button.",
        ),
        paths: [`${V}/StudioVirtualSpaceWorldAuthoringPanel.tsx`],
      },
      {
        feature: t("사이트 공통 모션 감소 구독", "Site-wide reduced-motion subscription"),
        role: t(
          "운영체제의 prefers-reduced-motion을 구독해 값이 바뀌면 바로 반영하고, 셸의 앰비언트 효과와 Phaser 캔버스가 이를 따릅니다.",
          "Subscribes to the operating system's prefers-reduced-motion, reflects changes at once, and the shell's ambient effects and the Phaser canvas follow it.",
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
        code: `// 숫자 입력을 읽어 step 격자에 맞춰 월드 값을 고친다(WorldAuthoringPanel의 단순화).
export function readNumberField(raw: string, step = 1): number | null {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null; // 숫자가 아니면 버린다
  return Math.round(parsed / step) * step; // step 격자에 맞춘다(기본 step 1, 스케일만 0.05)
}`,
        codeEn: `// Read a number input and snap it to the step grid to fix a world value (simplified from WorldAuthoringPanel).
export function readNumberField(raw: string, step = 1): number | null {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null; // not a number, drop it
  return Math.round(parsed / step) * step; // snap to the step grid (default step 1, scale uses 0.05)
}`,
        explain: t(
          "캔버스 위 드래그가 어려운 환경에서도 좌표와 크기를 숫자로 정확히 정할 수 있습니다. 숫자 입력은 월드 매니페스트를 직접 고치며, 무대에 따로 보낼 update 명령은 없습니다.",
          "Even where dragging on the canvas is hard, position and size can be set exactly as numbers. The number inputs edit the world manifest directly; there is no separate update command to send to a stage.",
        ),
        source: `${V}/StudioVirtualSpaceWorldAuthoringPanel.tsx`,
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
        "공간은 Phaser 캔버스이고 접근성은 두 층입니다. 캔버스 안 이동은 WASD·방향키와 터치 조이스틱이 맡고, 입장 로비가 조작법을 먼저 알려 줍니다. 셸에서는 공간 선택·연결 상태·채팅·배치 편집이 버튼과 폼으로 되어 있어 키보드로 닿고, 모션 감소는 캔버스와 셸이 운영체제 설정을 함께 따릅니다. 다만 캔버스 안을 스크린 리더가 읽는지는 확인하지 못했습니다.",
        "The space is a Phaser canvas, and accessibility is in two layers. Movement inside the canvas is handled by WASD, the arrow keys and the touch joystick, and the entry lobby shows the controls first. In the shell, space choice, connection state, chat and layout editing are buttons and forms the keyboard can reach, and the canvas and the shell follow the operating system's reduced-motion setting together. How well a screen reader can read inside the canvas was not verified.",
      ),
      analogy: t(
        "건물에 계단만 있지 않고 엘리베이터와 경사로, 안내 데스크가 함께 있는 것과 같습니다. 어느 길로 가도 같은 사무실에 닿습니다.",
        "It is like a building that has an elevator, a ramp and an information desk as well as stairs. Whichever way you go you arrive at the same office.",
      ),
      questions: [
        {
          question: t("키보드만으로 쓸 수 있나요?", "Can it be used with the keyboard alone?"),
          answer: t(
            "이동(WASD/방향키)과 상호작용(E/X)은 로비가 안내하고, 셸의 공간 선택·채팅·배치 편집은 버튼과 폼이라 키보드로 오갈 수 있습니다. 캔버스 안에서 끝까지 되는지의 전수 검증은 하지 않았습니다.",
            "Movement (WASD or arrows) and interaction (E or X) are announced by the lobby, and the shell's space choice, chat and layout editing are buttons and forms the keyboard can reach. A full audit inside the canvas was not done.",
          ),
        },
        {
          question: t("모션 감소는 무엇을 바꾸나요?", "What does reduced motion change?"),
          answer: t(
            "캔버스와 셸이 함께 따릅니다. Phaser 캔버스가 prefers-reduced-motion을 직접 구독해 자기 연출을 줄이고, 사이트 공통 구독이 셸의 앰비언트·등장 연출을 줄입니다.",
            "The canvas and the shell follow it together. The Phaser canvas subscribes to prefers-reduced-motion directly and reduces its own effects, and a site-wide subscription reduces the shell's ambient and entrance effects.",
          ),
        },
        {
          question: t("스크린 리더는요?", "What about screen readers?"),
          answer: t(
            "셸의 연결 상태는 role=status로, 공간 선택은 aria-pressed로 읽힙니다. 캔버스 안 아바타 위치나 말풍선을 읽어 주는 수준은 확인하지 못했습니다.",
            "The shell's connection state is exposed as role=status and space choice as aria-pressed. Reading avatar positions or bubbles inside the canvas aloud was not verified.",
          ),
        },
      ],
      pitfall: t(
        "'WCAG 준수'나 '접근성 인증' 같은 표현을 쓰지 마세요. 이 카드는 대체 경로가 코드에 있음을 확인한 것이며, 캔버스 내부의 스크린 리더 사용성 검증이나 키보드 전수 검증이 아닙니다.",
        "Do not say 'WCAG compliant' or 'accessibility certified'. This card confirms that alternative routes exist in code; it is not a screen-reader usability test inside the canvas or a full keyboard audit.",
      ),
    },
    technologies: ["Phaser", "WAI-ARIA", "React", "matchMedia"],
    facts: [
      { value: "WASD · 방향키", label: t("로비가 안내하는 이동 키", "Movement keys the lobby announces"), source: `${V}/StudioVirtualSpaceEntryLobby.tsx` },
      { value: "140자", label: t("말풍선 채팅 입력 한 번의 최대 길이(maxLength)", "Maximum length of one bubble-chat entry (maxLength)"), source: `${V}/hud/SpaceChatPanel.tsx` },
      { value: "0.08", label: t("조이스틱 데드존(입력 모듈 상수)", "Joystick dead zone (input module constant)"), source: `${V}/studio-virtual-space-joystick-input.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "custom-furniture-upload-pipeline",
    category: "virtual-space",
    name: "Furniture upload",
    title: t("내가 올린 이미지를 아바타 곁 가구로 쓰기 위한 검수 줄", "An inspection line for using my own image as furniture beside my avatar"),
    status: "configured",
    tagline: t(
      "올린 PNG·WebP 이미지는 시그니처 바이트로 검사하고 다시 인코딩해, 아바타 주변 장식으로만 씁니다.",
      "An uploaded PNG or WebP image is checked by signature bytes and re-encoded, and used only as a decoration around the avatar.",
    ),
    background: [
      t(
        "사용자가 만든 이미지를 올려 자기 아바타 주변에 두는 가구(장식)로 쓰는 기능입니다. 올린 파일은 믿을 수 없는 입력입니다. 선언된 형식과 실제 바이트가 다를 수 있어, 검수 기준은 파일 이름이 아니라 이미지 시그니처와 디코딩 가능성입니다.",
        "This feature lets you upload an image you made and use it as furniture (a decoration) placed around your avatar. An uploaded file is untrusted input. The declared type and the actual bytes can differ, so the inspection standard is not the file name but the image signature and whether it decodes.",
      ),
      t(
        "순서는 이렇습니다. ① 로그인한 본인인지 확인합니다. ② 형식 검사: PNG·WebP만 받고, 1MB를 넘거나 한 변이 1,024px를 넘으면 거절합니다. 선언된 MIME과 시그니처 바이트(PNG 시그니처, RIFF/WEBP)가 다르면 거절하고, 알파를 잃는 JPEG는 애초에 받지 않습니다. ③ 통과하면 긴 변 256px PNG로 다시 인코딩해 EXIF를 제거하고 저장합니다. 이름은 40자까지입니다.",
        "The steps: 1) Confirm the uploader is the signed-in owner. 2) Check the format: only PNG and WebP are accepted, and anything over 1 MB or with an edge over 1,024 px is rejected. If the declared MIME and the signature bytes (the PNG signature, RIFF/WEBP) differ it is rejected, and JPEG, which loses alpha, is not accepted at all. 3) If it passes, it is re-encoded to a PNG with a 256 px long edge, stripping EXIF, and stored. Names are capped at 40 characters.",
      ),
      t(
        "읽기는 소유자 전용입니다. 목록은 본인 것만 최신순으로 최대 60개까지 보여 주고, 실제 이미지는 900초짜리 서명 URL로만 읽습니다. 업로드는 시간당 30회로 제한되고, 공간에 배치할 수 있는 장식은 최대 36개입니다. 삭제 엔드포인트는 없어, 올린 가구를 지우는 동선은 아직 없습니다.",
        "Reads are owner-only. The list shows only your own items, newest first, up to 60, and the image itself is read only through a signed URL valid for 900 seconds. Uploads are limited to 30 per hour, and at most 36 decorations can be placed in a space. There is no delete endpoint, so there is no flow for removing an uploaded furniture item yet.",
      ),
      t(
        "한계: 서명 URL을 아는 사람은 900초 동안 이미지를 읽을 수 있습니다. 방 안 전원에게 보이는 장식이라 치명적이지는 않지만, 비공개 파일처럼 말하면 안 됩니다. 운영 환경에서 실제 업로드가 일어나는지는 이 카드에서 확인하지 못했습니다.",
        "Limits: anyone who knows a signed URL can read the image for 900 seconds. It is a decoration everyone in the room sees, so the impact is small, but it must not be described as a private file. Whether uploads actually happen in production was not verified here.",
      ),
    ],
    keyPoints: [
      t("확장자가 아니라 시그니처 바이트로 형식을 검사합니다", "It checks the format by signature bytes, not the extension"),
      t("통과한 이미지는 256px PNG로 다시 인코딩해 EXIF를 벗깁니다", "A passing image is re-encoded to a 256 px PNG, stripping EXIF"),
      t("읽기는 소유자 전용 서명 URL(900초)로만 열립니다", "Reads open only through owner-only signed URLs (900 s)"),
    ],
    diagram: {
      id: "custom-furniture-upload-pipeline-diagram",
      kind: "graph",
      title: t("업로드부터 배치까지의 검수 줄", "The inspection line from upload to placement"),
      caption: t(
        "시그니처로 검사하고 다시 인코딩해 저장한 뒤, 서명 URL로만 읽어 아바타 곁에 배치합니다.",
        "Check by signature, re-encode and store, then read only through a signed URL and place it beside the avatar.",
      ),
      alt: t(
        "업로드된 이미지는 시그니처 바이트와 크기 상한을 검사해 통과하면 긴 변 256px PNG로 다시 인코딩해 저장되고, 실패하면 거절됩니다. 읽을 때는 소유자 전용 서명 URL을 발급해 아바타 주변 장식으로 배치합니다.",
        "An uploaded image is checked for signature bytes and size caps; if it passes it is re-encoded to a PNG with a 256 px long edge and stored, and if it fails it is rejected. On reading, an owner-only signed URL is issued and the image is placed as a decoration around the avatar.",
      ),
      nodes: [
        { id: "upload", label: t("업로드", "Upload"), sub: t("PNG · WebP 이미지", "PNG or WebP image"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "admit", label: t("형식 검사", "Format check"), sub: t("시그니처 · 크기", "Signature · size"), tone: "warn", shape: "diamond", at: [1, 0] },
        { id: "reencode", label: t("재인코딩·저장", "Re-encode and store"), sub: t("긴 변 256px PNG · EXIF 제거", "256 px PNG, EXIF stripped"), tone: "server", at: [2, 0] },
        { id: "store", label: t("내 가구 목록", "My furniture list"), sub: t("본인 것만 · 최대 60개", "Mine only, up to 60"), tone: "server", shape: "cylinder", at: [3, 0] },
        { id: "registry", label: t("서명 URL 발급", "Signed URL issue"), sub: t("900초 유효", "Valid 900 s"), tone: "server", shape: "cylinder", at: [4, 0] },
        { id: "reject", label: t("거절", "Rejected"), sub: t("400 오류", "400 error"), tone: "warn", at: [1, 1] },
        { id: "read", label: t("아바타 곁 배치", "Placed by avatar"), sub: t("장식 최대 36개", "Up to 36 decorations"), tone: "good", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "upload", to: "admit", label: t("파일", "file") },
        { from: "admit", to: "reencode", label: t("통과", "pass") },
        { from: "admit", to: "reject", label: t("실패", "fail"), style: "dashed" },
        { from: "reencode", to: "store", label: t("저장 뒤", "after") },
        { from: "store", to: "registry", label: t("읽을 때", "on read") },
        { from: "registry", to: "read", label: t("배치", "place") },
      ],
    },
    usage: [
      {
        feature: t("가구 이미지 올리기(피커)", "Uploading a furniture image (picker)"),
        role: t(
          "파일을 고르면 클라이언트가 업로드하고, 성공하면 내 가구 목록에 바로 나타납니다. 아바타 주변에 배치해 씁니다.",
          "Picking a file makes the client upload it, and on success it appears in my furniture list right away. It is placed around the avatar.",
        ),
        paths: [`${V}/StudioVirtualSpaceCustomFurniturePicker.tsx`, `${V}/studio-virtual-custom-furniture-client.ts#uploadStudioVirtualCustomFurniture`],
        route: "/studio/space",
      },
      {
        feature: t("공유 계약의 형식 검사", "Format check in the shared contract"),
        role: t(
          "선언된 MIME과 시그니처 바이트를 대조하고, 용량(1MB)·한 변(1,024px) 상한을 계약 모듈이 판정합니다. 웹과 API가 같은 계약을 씁니다.",
          "The contract module compares the declared MIME with the signature bytes and judges the size (1 MB) and edge (1,024 px) caps. The web and the API use the same contract.",
        ),
        paths: [`packages/contracts/src/studio-virtual-custom-furniture-contract.ts#admitStudioVirtualCustomFurniture`],
      },
      {
        feature: t("서버 저장·재인코딩·서명 URL", "Server storage, re-encoding and signed URLs"),
        role: t(
          "업로드(시간당 30회 제한)를 받아 다시 인코딩해 저장하고, 목록(본인 것 최대 60개)과 900초 서명 URL 발급을 서비스가 맡습니다.",
          "The service accepts uploads (limited to 30 per hour), re-encodes and stores them, and handles the list (mine only, up to 60) and issuing 900-second signed URLs.",
        ),
        paths: [`${DEC}/studio-virtual-space-furniture.service.ts#upload`, `${DEC}/studio-virtual-space-furniture.service.ts#list`, `${DEC}/studio-virtual-space-furniture.service.ts#createReadUrl`],
      },
      {
        feature: t("올린 가구 목록", "Uploaded furniture list"),
        role: t(
          "피커가 본인 소유 가구만 최신순으로 보여 줍니다. 삭제 엔드포인트는 없어, 목록에서 지우는 동선은 아직 없습니다.",
          "The picker shows only furniture you own, newest first. There is no delete endpoint, so there is no flow for removing one from the list yet.",
        ),
        paths: [`${V}/StudioVirtualSpaceCustomFurniturePicker.tsx`, `${DEC}/studio-virtual-space-furniture.service.ts#list`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("시그니처 바이트로 이미지 받아들이기", "Admitting an image by signature bytes"),
        language: "ts",
        code: `// 선언된 MIME과 시그니처 바이트를 대조해 가구 이미지를 받아들인다(공유 계약의 단순화).
export const MAX_BYTES = 1024 * 1024; // 1MB
export const MAX_EDGE = 1024; // 한 변 상한(px)
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function signatureOf(bytes: Uint8Array): "png" | "webp" | null {
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "png";
  const riff = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF";
  const webp = String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return riff && webp ? "webp" : null; // JPEG는 알파를 잃어 받지 않는다
}

export function admitImage(declared: string, bytes: Uint8Array): boolean {
  if (bytes.length > MAX_BYTES) return false;
  const actual = signatureOf(bytes);
  return actual !== null && declared === "image/" + actual;
}`,
        codeEn: `// Admit a furniture image by comparing the declared MIME with the signature bytes (simplified from the shared contract).
export const MAX_BYTES = 1024 * 1024; // 1 MB
export const MAX_EDGE = 1024; // max edge (px)
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function signatureOf(bytes: Uint8Array): "png" | "webp" | null {
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "png";
  const riff = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF";
  const webp = String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return riff && webp ? "webp" : null; // JPEG loses alpha, so it is not accepted
}

export function admitImage(declared: string, bytes: Uint8Array): boolean {
  if (bytes.length > MAX_BYTES) return false;
  const actual = signatureOf(bytes);
  return actual !== null && declared === "image/" + actual;
}`,
        explain: t(
          "이름이나 선언된 형식은 공격자가 마음대로 고를 수 있어서 믿지 않습니다. 선언과 실제 바이트가 어긋나면 거절하고, 용량 상한도 같은 자리에서 봅니다. 한 변 상한은 디코딩한 크기 검사로 이어집니다.",
          "Names and declared types are chosen freely by an attacker, so they are not trusted. If the declaration and the actual bytes disagree it is rejected, and the size cap is checked in the same place. The edge cap continues into a decoded-size check.",
        ),
        source: `packages/contracts/src/studio-virtual-custom-furniture-contract.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("소유자 전용 서명 URL 발급", "Issuing an owner-only signed URL"),
        language: "ts",
        code: `// 읽기는 소유자 확인 뒤 900초짜리 서명 URL로만 연다(서비스의 단순화).
export const READ_URL_TTL_SECONDS = 900;
export interface FurnitureItem { id: string; ownerId: string }

export function createReadUrl(item: FurnitureItem, userId: string, sign: (path: string, ttl: number) => string): string | null {
  if (item.ownerId !== userId) return null; // 남의 가구는 URL도 만들지 않는다
  return sign("/furniture/" + item.id, READ_URL_TTL_SECONDS);
}`,
        codeEn: `// Reads open only through a 900-second signed URL after an owner check (simplified from the service).
export const READ_URL_TTL_SECONDS = 900;
export interface FurnitureItem { id: string; ownerId: string }

export function createReadUrl(item: FurnitureItem, userId: string, sign: (path: string, ttl: number) => string): string | null {
  if (item.ownerId !== userId) return null; // no URL is even made for someone else's furniture
  return sign("/furniture/" + item.id, READ_URL_TTL_SECONDS);
}`,
        explain: t(
          "목록도 읽기도 소유자 기준입니다. URL 자체가 900초 뒤에 만료하므로, 주소가 새어 나가도 읽을 수 있는 시간은 짧습니다.",
          "Both the list and reads are owner-scoped. The URL itself expires after 900 seconds, so even if an address leaks, the window for reading stays short.",
        ),
        source: `${DEC}/studio-virtual-space-furniture.service.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "OWASP · File Upload Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html", kind: "guide", note: t("업로드 방어의 표준 체크리스트", "The standard checklist for upload defences") },
      { title: "Wikipedia · List of file signatures", url: "https://en.wikipedia.org/wiki/List_of_file_signatures", kind: "article", note: t("첫 바이트로 형식을 아는 방법", "Knowing a format from its first bytes") },
      { title: "MDN · File API", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_API", kind: "docs", note: t("브라우저에서 파일 다루기", "Handling files in the browser") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "사용자가 올린 이미지를 아바타 곁 가구로 쓸 때는 두 가지를 검사합니다. 본인인지, 그리고 선언한 형식과 실제 바이트가 같은지입니다. PNG·WebP만 받고 1MB와 한 변 1,024px을 상한으로 두며, 통과하면 긴 변 256px PNG로 다시 인코딩해 EXIF를 제거합니다. 읽기는 본인만, 900초짜리 서명 URL로만 열립니다.",
        "When a user's image becomes furniture beside their avatar, two things are checked: whether they are the owner, and whether the declared type matches the actual bytes. Only PNG and WebP are accepted, with caps of 1 MB and a 1,024 px edge, and a passing image is re-encoded to a PNG with a 256 px long edge, stripping EXIF. Reads are owner-only, through signed URLs valid for 900 seconds.",
      ),
      analogy: t(
        "소품 반입 검수와 같습니다. 규격에 맞는 소품만 들이고, 들인 소품은 새 포장(재인코딩)으로 바꿔 보관하며, 꺼낼 때는 본인 확인 뒤 시간 제한 열쇠를 줍니다.",
        "It is like checking props brought into a theatre: only props that meet the spec come in, they are stored in fresh packaging (re-encoding), and taking one out needs an owner check and a time-limited key.",
      ),
      questions: [
        {
          question: t("아무 이미지나 올릴 수 있나요?", "Can any image be uploaded?"),
          answer: t(
            "아니요. PNG·WebP만 받고, 선언된 형식과 시그니처 바이트가 다르면 거절됩니다. 1MB를 넘거나 한 변이 1,024px를 넘어도 거절되고, JPEG는 알파를 잃어 받지 않습니다.",
            "No. Only PNG and WebP are accepted, and a mismatch between the declared type and the signature bytes is rejected. Anything over 1 MB or with an edge over 1,024 px is also rejected, and JPEG is not accepted because it loses alpha.",
          ),
        },
        {
          question: t("남의 가구를 가져다 쓸 수 있나요?", "Can I use someone else's furniture?"),
          answer: t(
            "목록과 읽기는 소유자 전용입니다. 읽기는 900초짜리 서명 URL로만 열리고, 남의 가구에는 URL 자체가 발급되지 않습니다.",
            "Listing and reading are owner-only. Reads open only through a signed URL valid for 900 seconds, and no URL is issued at all for someone else's furniture.",
          ),
        },
        {
          question: t("올린 가구를 지울 수 있나요?", "Can I delete furniture I uploaded?"),
          answer: t(
            "아직 삭제 엔드포인트가 없습니다. 목록에서 지우거나 서버에서 삭제하는 동선은 제공되지 않으니, 올릴 때 주의가 필요합니다.",
            "There is no delete endpoint yet. No flow removes an item from the list or deletes it on the server, so care is needed when uploading.",
          ),
        },
      ],
      pitfall: t(
        "'모든 이미지를 지원한다'거나 '완전히 비공개'라고 말하지 마세요. 받는 형식은 PNG·WebP뿐이고, 서명 URL을 아는 사람은 900초 동안 읽을 수 있습니다. 침투 시험 같은 보안 검증 결과도 없습니다.",
        "Do not say 'all images are supported' or 'fully private'. Only PNG and WebP are accepted, and anyone who knows a signed URL can read the image for 900 seconds. There are no security-verification results such as a penetration test either.",
      ),
    },
    technologies: ["Phaser", "PNG · WebP", "NestJS", "signed URLs"],
    facts: [
      { value: "1MB · 1024px", label: t("가구 이미지 용량 · 한 변 상한", "Furniture image size and edge caps"), source: `packages/contracts/src/studio-virtual-custom-furniture-contract.ts` },
      { value: "256px", label: t("재인코딩되는 긴 변(PNG)", "Re-encoded long edge (PNG)"), source: `packages/contracts/src/studio-virtual-custom-furniture-contract.ts` },
      { value: "900초", label: t("읽기 서명 URL 유효 시간", "Signed read URL lifetime"), source: `${DEC}/studio-virtual-space-furniture.service.ts` },
      { value: "36개", label: t("공간에 배치할 수 있는 장식 상한", "Cap on decorations placeable in a space"), source: `${V}/studio-virtual-space-customization.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
