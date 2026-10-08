import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 6: 접근성 대체 경로 · 맞춤 가구 업로드 파이프라인.
 * 경로·수치는 2026-10-07 기준 코드에서 직접 확인한 값이다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const FURNITURE = "apps/api/src/modules/studio-virtual-space-decoration";

export const VIRTUAL_SPACE_EXTRA_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "accessibility-alternatives-joystick-reduced-motion",
    category: "virtual-space",
    name: "Accessibility alternatives",
    title: t("걷지 않아도, 움직임이 부담돼도 쓸 수 있는 공간", "A space you can use without walking or with motion kept low"),
    status: "live",
    tagline: t(
      "키보드·조이스틱·탭 이동·목록 검색·모션 감소로 '걷기'가 유일한 길이 되지 않게 합니다.",
      "Keyboard, joystick, tap-to-move, list search and reduced motion keep walking from being the only way.",
    ),
    background: [
      t(
        "걸어 다니는 공간은 멋지지만, 모든 사람이 방향키를 정확히 누르거나 빠른 화면 움직임을 편하게 보는 것은 아닙니다. 그래서 '걷기'가 유일한 길이 되지 않도록 같은 목적지에 닿는 길을 여러 개 둡니다. 키보드(WASD·방향키·E/X·Tab), 화면 조이스틱, 탭으로 이동, 방과 사람을 글자로 찾는 목록, 그리고 움직임을 줄이는 설정입니다.",
        "A walkable space is appealing, but not everyone can press arrow keys precisely or watch fast on-screen motion comfortably. So walking is never the only route; several routes reach the same destination: the keyboard (WASD, arrows, E/X, Tab), an on-screen joystick, tap-to-move, a list to find rooms and people by text, and a setting that reduces motion.",
      ),
      t(
        "키보드: 캔버스는 tabIndex 0 의 application 역할이며 조작법이 aria-label 로 안내됩니다. 터치: 화면 조이스틱은 고정·떠다니는·탭 이동 세 가지 조작 모드가 있고, 데드존(8%)으로 손떨림을 무시하며 창이 포커스를 잃으면 입력을 0 으로 되돌려 '계속 걷는' 사고를 막습니다. 목록: '방·팀원 찾기'는 이동·바로 가기·열기를 걷지 않고 할 수 있는 동등한 경로입니다(바로 가기는 한 번 눌러 무장하고 한 번 더 눌러야 실행). 모션: 모션 감소를 켜면 품질 등급이 accessibility 로 고정되고 튕김·카메라 앞서보기·흔들림이 꺼지며 카메라가 즉시 따라갑니다.",
        "Keyboard: the canvas is focusable (tabIndex 0) with the application role, and its controls are described in an aria-label. Touch: the joystick has three control modes (fixed, floating, tap-to-move), ignores hand tremor with an 8% dead zone, and resets input to zero when the window loses focus so the avatar cannot keep walking. List: 'Find rooms and people' is an equivalent route to move, jump or open things without walking (a jump is armed with one press and runs on a second press). Motion: turning on reduced motion pins the quality tier to accessibility, switches off rebound, camera look-ahead and shake, and the camera follows instantly.",
      ),
      t(
        "접근성은 한 기능이 아니라 대체 경로의 묶음입니다. 공간 화면을 통째로 목록 화면으로 대신하는 방법은 쉽지만 공간 안의 존재감을 잃으므로, 같은 화면 안에 대체 경로를 함께 둡니다. 설정도 사용자가 고르면 기억하고, 운영체제의 모션 감소는 항상 이깁니다.",
        "Accessibility here is a bundle of alternative routes rather than one feature. Replacing the whole spatial screen with a list is easy but loses the sense of presence, so the alternatives live inside the same screen. Choices are remembered, and the operating system's reduced-motion setting always wins.",
      ),
      t(
        "한계: 스크린 리더로 공간 전체(아바타 위치·말풍선)를 읽어 주는 수준은 이 카드에서 확인하지 못했습니다. 캔버스는 그림이라 스크린 리더에게는 목록과 상태 안내(role=status)가 주된 접점입니다. 이 화면을 자동 접근성 검사가 덮는지, 모든 기능을 키보드만으로 끝낼 수 있는지의 전수 검증도 하지 못했습니다.",
        "Limits: whether a screen reader can read the whole space (avatar positions, bubbles) was not verified here. The canvas is a picture, so for screen readers the list and the status announcements (role=status) are the main touchpoints. Whether automated accessibility checks cover this screen, and whether every feature can be finished by keyboard alone, was also not fully verified.",
      ),
    ],
    keyPoints: [
      t("걷기 말고도 같은 곳에 닿는 길이 여럿 있습니다", "Several routes reach the same place besides walking"),
      t("모션 감소는 등급·튕김·카메라를 함께 낮춥니다", "Reduced motion lowers tier, rebound and camera together"),
      t("스크린 리더로 공간 전체를 읽는지는 미확인", "Reading the whole space by screen reader is unverified"),
    ],
    diagram: {
      id: "accessibility-alternatives-joystick-reduced-motion-diagram",
      kind: "graph",
      title: t("같은 목적지에 닿는 여러 길", "Several routes to the same destination"),
      caption: t(
        "걷기 외의 길이 같은 목적지로 이어지고, 모션 감소는 연출만 낮춥니다.",
        "Routes other than walking reach the same destination, and reduced motion only tones down the effects.",
      ),
      alt: t(
        "키보드, 화면 조이스틱, 탭·클릭 이동, 방·팀원 목록의 네 가지 길이 모두 같은 목적지로 이어집니다. 모션 감소 설정은 목적지를 바꾸지 않고 튕김과 카메라 연출 같은 움직임만 낮춥니다.",
        "Four routes (keyboard, on-screen joystick, tap or click to move, and the room and teammate list) all lead to the same destination. The reduced-motion setting does not change the destination; it only tones down movement such as rebound and camera effects.",
      ),
      nodes: [
        { id: "keys", label: t("키보드", "Keyboard"), sub: t("WASD · 방향키 · E/X", "WASD, arrows, E/X"), tone: "local", at: [1, 0] },
        { id: "stick", label: t("화면 조이스틱", "On-screen joystick"), sub: t("고정·떠다니는 · 데드존", "Fixed, floating, dead zone"), tone: "local", at: [3, 0] },
        { id: "goal", label: t("같은 목적지", "Same destination"), sub: t("방 · 사람 · 기능", "Room, person, feature"), tone: "good", shape: "pill", at: [2, 1] },
        { id: "tap", label: t("탭·클릭 이동", "Tap or click"), sub: t("A* 경로로 걷기", "Walks an A* path"), tone: "local", at: [1, 2] },
        { id: "list", label: t("방·팀원 목록", "Room and people list"), sub: t("검색 · 바로 가기", "Search, jump"), tone: "local", at: [3, 2] },
        { id: "motion", label: t("모션 감소", "Reduced motion"), sub: t("연출만 낮춤", "Only tones effects down"), tone: "warn", at: [0, 1] },
      ],
      edges: [
        { from: "keys", to: "goal", label: t("이동", "move") },
        { from: "stick", to: "goal", label: t("이동", "move") },
        { from: "tap", to: "goal", label: t("경로", "path") },
        { from: "list", to: "goal", label: t("직접", "direct") },
        { from: "motion", to: "goal", label: t("연출", "effects"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("키보드 조작과 캔버스 접근 이름", "Keyboard control and the canvas accessible name"),
        role: t(
          "캔버스가 키보드 포커스를 받고 조작법(WASD/방향키 이동, E/X 상호작용, Tab 메뉴 이동)을 aria-label 로 알립니다.",
          "The canvas takes keyboard focus and announces the controls (WASD or arrows to move, E or X to interact, Tab to menus) in an aria-label.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("모바일 조이스틱과 조작 모드", "Mobile joystick and control modes"),
        role: t(
          "고정·떠다니는·탭 이동 3가지 조작 모드, 8% 데드존, 창 포커스 이탈 때 입력 초기화를 제공합니다.",
          "Provides three control modes (fixed, floating, tap), an 8% dead zone, and an input reset when the window loses focus.",
        ),
        paths: [`${V}/StudioVirtualSpaceJoystick.tsx`, `${V}/studio-virtual-space-joystick-input.ts`, `${V}/studio-virtual-space-experience-preference.ts`],
      },
      {
        feature: t("방·팀원 찾기 목록", "Find rooms and people list"),
        role: t(
          "걷지 않고도 방으로 이동하거나 사람에게 다가가고 기능을 여는 키보드·모바일 경로입니다. 순간이동은 두 번 눌러야 실행됩니다.",
          "A keyboard and mobile route to move to rooms, approach people and open features without walking. Jumping runs only on a second press.",
        ),
        paths: [`${V}/StudioVirtualSpaceDirectory.tsx`, `${V}/StudioVirtualSpaceUserList.tsx`],
      },
      {
        feature: t("모션 감소", "Reduced motion"),
        role: t(
          "운영체제의 모션 감소를 구독해 품질 등급을 accessibility 로 고정하고, 충돌 반발·카메라 룩어헤드·흔들림을 끕니다.",
          "Subscribes to the operating system's reduced-motion setting to pin the quality tier to accessibility and switch off rebound, camera look-ahead and shake.",
        ),
        paths: [`${V}/studio-virtual-space-reduced-motion.ts`, `${V}/studio-virtual-space-quality.ts`, `${V}/studio-virtual-space-collision-response.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("조이스틱 데드존", "A joystick dead zone"),
        language: "ts",
        code: `// 중심 근처의 떨림은 무시하고(데드존), 데드존 밖부터 0~1 로 다시 펼친다(studioJoystickVector 의 단순화).
export function joystick(x: number, y: number, deadZone = 0.08): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 }; // 손떨림은 정지로 본다
  const magnitude = Math.min(1, (length - deadZone) / (1 - deadZone));
  return { x: (x / length) * magnitude, y: (y / length) * magnitude };
}`,
        codeEn: `// Ignore jitter near the centre (the dead zone) and re-stretch from the dead zone's edge to 0..1 (simplified from studioJoystickVector).
export function joystick(x: number, y: number, deadZone = 0.08): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 }; // hand tremor counts as standing still
  const magnitude = Math.min(1, (length - deadZone) / (1 - deadZone));
  return { x: (x / length) * magnitude, y: (y / length) * magnitude };
}`,
        explain: t(
          "데드존 안은 0 으로, 그 밖은 0부터 다시 시작해 천천히 걷는 입력도 정확히 표현합니다. 그냥 잘라내면 데드존 경계에서 속도가 갑자기 뛰는 문제가 생깁니다.",
          "Inside the dead zone the output is 0, and outside it restarts from 0, so slow walking input is represented accurately. Simply cutting would make speed jump at the dead zone's edge.",
        ),
        source: `${V}/studio-virtual-space-joystick-input.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("모션 감소 설정 구독", "Subscribing to the reduced-motion setting"),
        language: "ts",
        code: `// prefers-reduced-motion 을 구독해 바뀔 때마다 알린다(useStudioPrefersReducedMotion 의 프레임워크 없는 버전).
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
// 켜지면: 충돌 반발·카메라 앞서보기·흔들림을 끄고 카메라가 즉시 따라가게 한다.`,
        codeEn: `// Subscribe to prefers-reduced-motion and report each change (a framework-free version of useStudioPrefersReducedMotion).
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
// When on: switch off rebound, camera look-ahead and shake, and make the camera follow instantly.`,
        explain: t(
          "사용자가 운영체제 설정을 중간에 바꿔도 따라가도록 change 이벤트를 구독합니다. 값을 읽는 쪽은 이 신호 하나로 품질 등급, 충돌 반발, 카메라, 이모트 표현을 함께 낮춥니다.",
          "It subscribes to the change event so the app follows even when the user flips the operating system setting mid-session. Consumers use this one signal to lower the quality tier, rebound, camera and emote presentation together.",
        ),
        source: `${V}/studio-virtual-space-reduced-motion.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "WCAG 2.2 · Animation from Interactions", url: "https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html", kind: "spec", note: t("움직임을 끌 수 있어야 하는 이유", "Why motion must be switchable") },
      { title: "WCAG 2.2 · Keyboard", url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html", kind: "spec", note: t("키보드만으로 쓸 수 있어야 함", "Operable with a keyboard alone") },
      { title: "MDN · prefers-reduced-motion", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion", kind: "docs", note: t("모션 감소 설정 읽기", "Reading the reduced-motion setting") },
      { title: "MDN · application role", url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/application_role", kind: "docs", note: t("캔버스에 붙인 ARIA 역할", "The ARIA role on the canvas") },
      { title: "W3C WAI-ARIA Authoring Practices", url: "https://www.w3.org/WAI/ARIA/apg/", kind: "guide", note: t("접근 가능한 위젯 패턴", "Accessible widget patterns") },
    ],
    chapterIds: ["virtual-studio-world-authority", "quality"],
    talk: {
      pitch: t(
        "공간을 걷는 것만이 유일한 방법이 아니도록 같은 목적지에 닿는 길을 여러 개 만들었습니다. 키보드, 화면 조이스틱, 탭 이동, 방과 사람을 검색하는 목록, 그리고 운영체제의 모션 감소를 따르는 설정입니다. 모션 감소를 켜면 화질 등급과 튕김, 카메라 연출이 함께 낮아집니다. 다만 스크린 리더로 공간 전체를 읽는 수준은 아직 확인하지 못했습니다.",
        "So that walking is not the only way, there are several routes to the same destination: the keyboard, an on-screen joystick, tap-to-move, a list to search rooms and people, and a setting that follows the operating system's reduced-motion preference. Turning reduced motion on lowers the quality tier, rebound and camera effects together. How well a screen reader can read the whole space was not verified yet.",
      ),
      analogy: t(
        "건물에 계단만 있지 않고 엘리베이터와 경사로, 안내 데스크가 함께 있는 것과 같습니다. 어느 길로 가도 같은 사무실에 닿습니다.",
        "It is like a building that has an elevator, a ramp and an information desk as well as stairs. Whichever way you go you arrive at the same office.",
      ),
      questions: [
        {
          question: t("키보드만으로 쓸 수 있나요?", "Can it be used with the keyboard alone?"),
          answer: t(
            "이동(WASD/방향키)과 상호작용(E/X), 메뉴 이동(Tab)이 안내되고, 방·팀원 찾기 목록으로 걷지 않고도 이동할 수 있습니다. 모든 기능을 키보드만으로 끝낼 수 있는지의 전수 검증은 이 카드에서 하지 않았습니다.",
            "Movement (WASD or arrows), interaction (E or X) and menu navigation (Tab) are announced, and the room and people list lets you move without walking. A full audit that every feature can be finished by keyboard alone was not done for this card.",
          ),
        },
        {
          question: t("모션 감소는 무엇을 바꾸나요?", "What does reduced motion change?"),
          answer: t(
            "품질 등급이 accessibility 로 고정되어 파티클이 0, NPC 가 2명으로 줄고, 충돌 튕김·카메라 앞서보기·흔들림이 꺼지며 카메라가 지연 없이 따라갑니다. 이모트도 정적인 표현을 씁니다.",
            "The quality tier is pinned to accessibility, so particles drop to 0 and NPCs to 2, rebound, camera look-ahead and shake are off, and the camera follows without lag. Emotes also use a static presentation.",
          ),
        },
        {
          question: t("스크린 리더는요?", "What about screen readers?"),
          answer: t(
            "캔버스에는 역할과 이름이 있고 상태 안내는 role=status 로 읽힙니다. 아바타 위치나 말풍선을 읽어 주는 수준은 확인하지 못했습니다.",
            "The canvas has a role and a name, and status messages are exposed as role=status. Reading avatar positions or bubbles aloud was not verified.",
          ),
        },
      ],
      pitfall: t(
        "'WCAG 준수'나 '접근성 인증' 같은 표현을 쓰지 마세요. 이 카드는 대체 경로가 코드에 있음을 확인한 것이며, 접근성 인증이나 스크린 리더 사용성 검증이 아닙니다.",
        "Do not say 'WCAG compliant' or 'accessibility certified'. This card confirms that alternative routes exist in code; it is not an accessibility certification or a screen-reader usability test.",
      ),
    },
    technologies: ["Pointer Events", "WAI-ARIA", "React"],
    facts: [
      { value: "8%", label: t("조이스틱 데드존 기본값(설계값)", "Default joystick dead zone (design value)"), source: `${V}/studio-virtual-space-joystick-input.ts` },
      { value: "3가지", label: t("조작 모드(fixed · floating · tap)", "Control modes (fixed, floating, tap)"), source: `${V}/studio-virtual-space-experience-preference.ts` },
      { value: "NPC 2 · 파티클 0", label: t("accessibility 품질 등급의 NPC 수와 파티클 비율(설계값)", "NPC count and particle ratio of the accessibility tier (design values)"), source: `${V}/studio-virtual-space-quality.ts` },
      { value: "3.5초", label: t("바로 가기 '무장' 후 두 번째 누름을 기다리는 시간(설계값)", "Time to wait for the second press after a jump is 'armed' (design value)"), source: `${V}/StudioVirtualSpaceDirectory.tsx` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "custom-furniture-upload-pipeline",
    category: "virtual-space",
    name: "Furniture upload",
    title: t("내가 올린 그림을 가구로 쓰기 위한 안전한 업로드 줄", "A careful upload line for turning my own picture into furniture"),
    status: "configured",
    tagline: t(
      "올린 이미지는 바이트로 형식을 확인하고 256px PNG 로 다시 만든 뒤 비공개 저장소에 둡니다.",
      "An uploaded image is format-checked by its bytes, re-encoded as a 256 px PNG and kept in private storage.",
    ),
    background: [
      t(
        "자기만의 가구 그림을 올려 공간을 꾸미는 기능입니다. 사용자가 올린 파일은 믿을 수 없는 입력입니다. 이름이 .png 라고 PNG 가 아니고, 작은 파일 속에 거대한 픽셀 수가 숨어 있을 수 있고, 사진에는 촬영 위치(EXIF) 같은 정보가 들어 있을 수 있습니다. 그래서 공장의 입고 검수 라인처럼 단계마다 거릅니다.",
        "This feature lets you upload your own furniture picture to decorate the space. An uploaded file is untrusted input: a .png name does not make it a PNG, a small file can hide an enormous pixel count, and photos may carry information such as the shooting location (EXIF). So it is filtered at each step, like a factory's receiving inspection line.",
      ),
      t(
        "순서는 이렇습니다. ① 로그인한 활성 계정인지 확인합니다. ② 형식 확인: 확장자나 Content-Type 을 믿지 않고 파일의 첫 바이트(시그니처)로 PNG/WebP 인지 읽고, 원본 1 MiB·한 변 1024px 를 넘으면 거절하며 이름은 40자 안으로 새깁니다(JPEG 는 투명 배경이 없어 받지 않습니다). ③ 재인코딩: 디코드한 뒤 긴 변을 256px 이하의 PNG 로 다시 만들어 EXIF 와 색 프로파일이 떨어지게 합니다. ④ 비공개 객체 저장소에 변경 불가 방식으로 올리고 ⑤ 그다음에 레지스트리 행을 씁니다. ⑥ 읽을 때는 서버가 소유자를 확인한 뒤 900초짜리 서명 URL 을 줍니다.",
        "The steps: 1) Confirm a signed-in, active account. 2) Check the format: ignoring the extension and Content-Type, read the file's first bytes (signature) to see whether it is PNG or WebP, reject anything over 1 MiB or 1024 px on a side, and cap the name at 40 characters (JPEG is refused because it has no transparency). 3) Re-encode: decode and rebuild as a PNG of at most 256 px on the long side so EXIF and colour profiles drop away. 4) Upload to private object storage in an immutable way and 5) only then write the registry row. 6) To read, the server checks the owner and issues a signed URL valid for 900 seconds.",
      ),
      t(
        "순서가 중요합니다. 레지스트리를 먼저 쓰면 저장이 실패했을 때 가리키는 파일이 없는 '유령 행'이 남기 때문에 저장 다음에 레지스트리를 씁니다. 남의 가구 id 로 URL 을 달라고 하면 404 이고, 객체 경로는 클라이언트가 아니라 서버가 레지스트리에서 읽어 씁니다. 데이터베이스 테이블에는 행 수준 보안(RLS)이 켜져 있습니다.",
        "Order matters. Writing the registry first would leave a 'ghost row' pointing at no file if the upload fails, so the registry comes after storage. Asking for a URL with someone else's furniture id returns 404, and the object path is read by the server from the registry rather than supplied by the client. Row-level security (RLS) is enabled on the database tables.",
      ),
      t(
        "한계: 저장소가 구성되지 않은 환경에서는 503 으로 응답합니다(코드의 선택적 의존성). 운영 환경에서 저장소가 실제로 구성됐는지, 업로드가 실제로 일어나는지는 이 카드에서 확인하지 못했습니다. 목록은 한 번에 60개까지이고, 같은 방의 다른 사람에게 내 가구가 어떻게 보이는지(공유)는 확인하지 못했습니다.",
        "Limits: in an environment where storage is not configured it answers 503 (the dependency is optional in code). Whether storage is actually configured in production and uploads really happen was not verified here. A listing returns at most 60 items, and how my furniture appears to others in the same room (sharing) was not verified.",
      ),
    ],
    keyPoints: [
      t("확장자가 아니라 바이트 시그니처로 형식을 확인합니다", "The format is checked by byte signature, not extension"),
      t("256px PNG 로 다시 만들어 EXIF 를 떼어 냅니다", "It re-encodes to a 256 px PNG, dropping EXIF"),
      t("저장이 먼저, 레지스트리는 나중입니다(유령 행 방지)", "Storage first, registry after (no ghost rows)"),
    ],
    diagram: {
      id: "custom-furniture-upload-pipeline-diagram",
      kind: "graph",
      title: t("업로드부터 읽기까지의 검수 줄", "The inspection line from upload to reading"),
      caption: t(
        "형식을 검사하고 다시 만든 뒤 저장하고, 저장이 끝나야 장부에 올립니다.",
        "Check the format, rebuild, store, and only after storing write it to the ledger.",
      ),
      alt: t(
        "업로드된 파일은 형식 검사를 거쳐 통과하면 256px PNG 로 재인코딩되고, 실패하면 거절됩니다. 재인코딩된 이미지는 먼저 비공개 저장소에 올라가고, 그다음에 소유자와 해시를 적은 레지스트리 행이 기록됩니다. 읽을 때는 소유자만 서명 URL 을 받습니다.",
        "An uploaded file goes through a format check; if it passes it is re-encoded as a 256 px PNG, and if it fails it is rejected. The re-encoded image is uploaded to private storage first, and then a registry row with owner and hash is written. When reading, only the owner gets a signed URL.",
      ),
      nodes: [
        { id: "upload", label: t("업로드", "Upload"), sub: t("base64 본문", "Base64 body"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "admit", label: t("형식 검사", "Format check"), sub: t("시그니처·크기", "Signature, size"), tone: "warn", shape: "diamond", at: [1, 0] },
        { id: "reencode", label: t("재인코딩", "Re-encode"), sub: t("256px PNG · EXIF 제거", "256 px PNG, no EXIF"), tone: "server", at: [2, 0] },
        { id: "store", label: t("비공개 저장소", "Private storage"), sub: t("변경 불가 업로드", "Immutable upload"), tone: "server", shape: "cylinder", at: [3, 0] },
        { id: "registry", label: t("레지스트리", "Registry"), sub: t("소유자·해시·크기", "Owner, hash, size"), tone: "server", shape: "cylinder", at: [4, 0] },
        { id: "reject", label: t("거절", "Rejected"), sub: t("400 오류", "400 error"), tone: "warn", at: [1, 1] },
        { id: "read", label: t("읽기", "Read"), sub: t("소유자만 서명 URL", "Signed URL for owner"), tone: "good", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "upload", to: "admit", label: t("파일", "file") },
        { from: "admit", to: "reencode", label: t("통과", "pass") },
        { from: "admit", to: "reject", label: t("실패", "fail"), style: "dashed" },
        { from: "reencode", to: "store", label: t("PNG", "PNG") },
        { from: "store", to: "registry", label: t("저장 뒤", "after") },
        { from: "registry", to: "read", label: t("소유자만", "owner") },
      ],
    },
    usage: [
      {
        feature: t("맞춤 가구 올리기(서버)", "Uploading custom furniture (server)"),
        role: t(
          "형식·크기 검사, 재인코딩, 비공개 저장, 레지스트리 기록을 이 순서로 처리합니다. 저장소가 구성되지 않았으면 503 으로 알립니다.",
          "Handles the format and size check, re-encoding, private storage and registry writing in that order, and answers 503 if storage is not configured.",
        ),
        paths: [
          `${FURNITURE}/studio-virtual-space-furniture.service.ts#upload`,
          `${FURNITURE}/studio-virtual-space-furniture-reencode.ts`,
          "packages/contracts/src/studio-virtual-custom-furniture-contract.ts",
        ],
      },
      {
        feature: t("내 가구 목록과 읽기 URL", "My furniture list and read URL"),
        role: t(
          "내 가구를 최신순 60개까지 보여 주고, 소유자에게만 900초짜리 서명 읽기 URL 을 발급합니다.",
          "Lists my furniture newest first, up to 60, and issues a 900-second signed read URL to the owner only.",
        ),
        paths: [`${FURNITURE}/studio-virtual-space-furniture.controller.ts`],
      },
      {
        feature: t("꾸미기 패널 · 가구 선택기", "Decoration panel · furniture picker"),
        role: t(
          "사용자가 파일을 고르면 서버 API 로 올리고, 받은 서명 URL 로 미리보기를 보여 줍니다.",
          "When a user picks a file it is uploaded to the server API, and the signed URL received is used for the preview.",
        ),
        paths: [`${V}/StudioVirtualSpaceCustomFurniturePicker.tsx`, `${V}/studio-virtual-custom-furniture-client.ts`],
        route: "/studio/space",
      },
      {
        feature: t("레지스트리 테이블과 행 수준 보안", "Registry table and row-level security"),
        role: t(
          "가구 행은 소유자(userId)별로 저장되고, 테이블에 RLS 를 켜고 공개 Data API 역할(anon·authenticated)의 권한을 회수하며, 계정이 사라지면 가구도 함께 지워집니다.",
          "Furniture rows are stored per owner (userId), RLS is enabled on the table with privileges revoked from the public Data API roles (anon, authenticated), and furniture is removed along with the account.",
        ),
        paths: [
          "apps/api/src/platform/database/migrations/0096_studio_virtual_space_custom_furniture.sql",
          "apps/api/src/platform/database/migrations/0098_studio_virtual_space_runtime_security.sql",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("첫 바이트와 크기로 PNG 를 받아들이기", "Admitting a PNG by its first bytes and size"),
        language: "ts",
        code: `// 확장자나 Content-Type 이 아니라 파일의 첫 바이트로 형식을 확인한다(contract 의 단순화).
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_BYTES = 1024 * 1024; // 원본 1 MiB 상한
const MAX_EDGE = 1024; // 한 변 1024px 상한(작은 파일에 숨은 거대한 픽셀 방지)

export function admitPng(bytes: Uint8Array): { ok: true; width: number; height: number } | { ok: false; reason: string } {
  if (bytes.length > MAX_BYTES) return { ok: false, reason: "bytes" };
  if (bytes.length < 24 || PNG.some((value, index) => bytes[index] !== value)) return { ok: false, reason: "signature" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16); // IHDR: 시그니처 뒤 너비·높이(big-endian)
  const height = view.getUint32(20);
  if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) return { ok: false, reason: "dimensions" };
  return { ok: true, width, height };
}`,
        codeEn: `// Check the format by the file's first bytes, not the extension or Content-Type (simplified from the contract).
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_BYTES = 1024 * 1024; // 1 MiB cap on the original
const MAX_EDGE = 1024; // 1024 px cap per side (stops huge pixel counts hidden in a small file)

export function admitPng(bytes: Uint8Array): { ok: true; width: number; height: number } | { ok: false; reason: string } {
  if (bytes.length > MAX_BYTES) return { ok: false, reason: "bytes" };
  if (bytes.length < 24 || PNG.some((value, index) => bytes[index] !== value)) return { ok: false, reason: "signature" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16); // IHDR: width and height after the signature (big-endian)
  const height = view.getUint32(20);
  if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) return { ok: false, reason: "dimensions" };
  return { ok: true, width, height };
}`,
        explain: t(
          "이름이나 선언된 형식은 공격자가 마음대로 고를 수 있어서 믿지 않습니다. 시그니처가 맞아야 하고, 헤더에서 읽은 너비·높이가 한도 안이어야 다음 단계(디코드)로 보냅니다. 원본은 WebP 도 같은 방식으로 확인합니다.",
          "Names and declared types are chosen freely by an attacker, so they are not trusted. The signature must match and the width and height read from the header must be within limits before the file goes on to decoding. The original checks WebP the same way.",
        ),
        source: "packages/contracts/src/studio-virtual-custom-furniture-contract.ts",
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("저장이 먼저, 장부는 나중에", "Storage first, ledger after"),
        language: "ts",
        code: `// 저장이 성공한 뒤에만 레지스트리 행을 쓴다. 순서를 거꾸로 하면 저장이 실패했을 때 가리키는 파일이 없는 유령 행이 남는다.
type Storage = { putImmutable(bytes: Uint8Array): Promise<{ path: string; digest: string }> };
type Registry = { insert(row: { id: string; ownerId: string; path: string; digest: string }): Promise<void> };

export async function saveFurniture(ownerId: string, png: Uint8Array, storage: Storage, registry: Registry): Promise<string> {
  const id = crypto.randomUUID();
  const stored = await storage.putImmutable(png); // 1) 바이트를 먼저 비공개 저장소에
  await registry.insert({ id, ownerId, path: stored.path, digest: stored.digest }); // 2) 그다음에 행을 기록
  return id;
}`,
        codeEn: `// Write the registry row only after storing succeeds; in the reverse order a failed upload would leave a ghost row pointing at no file.
type Storage = { putImmutable(bytes: Uint8Array): Promise<{ path: string; digest: string }> };
type Registry = { insert(row: { id: string; ownerId: string; path: string; digest: string }): Promise<void> };

export async function saveFurniture(ownerId: string, png: Uint8Array, storage: Storage, registry: Registry): Promise<string> {
  const id = crypto.randomUUID();
  const stored = await storage.putImmutable(png); // 1) put the bytes in private storage first
  await registry.insert({ id, ownerId, path: stored.path, digest: stored.digest }); // 2) then record the row
  return id;
}`,
        explain: t(
          "저장이 예외를 던지면 레지스트리까지 가지 않으므로 남는 행이 없습니다. 반대로 행을 쓴 뒤 저장이 실패하면 목록에는 보이는데 열리지 않는 가구가 생깁니다. 실제 서비스는 재인코딩 검사 뒤에 이 순서를 따릅니다.",
          "If storing throws, the registry is never reached, so no row remains. The other way round, a failed upload after the row is written would leave furniture that shows in the list but cannot be opened. The real service follows this order after the re-encode checks.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "OWASP · File Upload Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html", kind: "guide", note: t("업로드 방어의 표준 체크리스트", "The standard checklist for upload defences") },
      { title: "Wikipedia · List of file signatures", url: "https://en.wikipedia.org/wiki/List_of_file_signatures", kind: "article", note: t("첫 바이트로 형식을 아는 방법", "Knowing a format from its first bytes") },
      { title: "W3C · PNG specification", url: "https://www.w3.org/TR/png/", kind: "spec", note: t("PNG 시그니처와 IHDR", "The PNG signature and IHDR") },
      { title: "Google · WebP RIFF container", url: "https://developers.google.com/speed/webp/docs/riff_container", kind: "docs", note: t("WebP 파일 구조", "The WebP file structure") },
      { title: "Wikipedia · Exif", url: "https://en.wikipedia.org/wiki/Exif", kind: "article", note: t("사진 속 숨은 정보", "Hidden information in photos") },
      { title: "Supabase · Storage", url: "https://supabase.com/docs/guides/storage", kind: "docs", note: t("비공개 객체 저장소", "Private object storage") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "사용자가 올린 가구 그림은 믿지 않고 단계마다 거릅니다. 파일 이름이 아니라 첫 바이트로 PNG 인지 확인하고, 크기와 픽셀 수를 제한하고, 256px PNG 로 다시 만들어 위치정보(EXIF) 같은 숨은 정보를 떼어 냅니다. 저장이 끝난 뒤에야 목록에 올리고, 남의 그림은 못 보도록 소유자만 서명 URL 을 받습니다. 다만 저장소가 구성돼야 동작하는 기능이라 운영 구성 여부는 확인하지 못했습니다.",
        "Uploaded furniture pictures are not trusted and are filtered at each step. The format is confirmed from the first bytes rather than the name, size and pixel count are capped, and the image is rebuilt as a 256 px PNG so hidden data such as location (EXIF) falls away. It is listed only after storing finishes, and only the owner gets a signed URL so nobody sees others' pictures. It needs storage to be configured to work, so production configuration was not verified.",
      ),
      analogy: t(
        "공장 입고 검수 라인입니다. 상자를 열어 내용물을 확인하고, 규격 포장(256px PNG)으로 다시 담아 창고(비공개 저장소)에 넣은 뒤에야 재고 장부(레지스트리)에 올립니다.",
        "It is a factory receiving line: open the box and check the contents, repack in standard packaging (a 256 px PNG), put it in the warehouse (private storage) and only then enter it in the stock ledger (the registry).",
      ),
      questions: [
        {
          question: t("JPEG 는 왜 안 되나요?", "Why is JPEG not accepted?"),
          answer: t(
            "JPEG 는 투명 배경(알파)이 없어 가구 그림의 투명 배경이 깨지기 때문에 계약 단계에서 받지 않습니다. PNG 와 WebP 만 받습니다.",
            "JPEG has no transparency (alpha), which would break a furniture picture's transparent background, so the contract does not accept it. Only PNG and WebP are accepted.",
          ),
        },
        {
          question: t("남이 내 가구를 볼 수 있나요?", "Can others see my furniture?"),
          answer: t(
            "읽기 URL 은 소유자가 아니면 404 입니다. 객체 경로는 서버가 레지스트리에서 읽어 쓰고 클라이언트가 정하지 않습니다. 같은 방 사람에게 내 가구가 어떻게 보이는지는 이 카드에서 확인하지 못했습니다.",
            "The read URL answers 404 for anyone but the owner, and the object path is read by the server from the registry rather than chosen by the client. How my furniture appears to others in the same room was not verified here.",
          ),
        },
        {
          question: t("악성 파일은 완전히 막나요?", "Does it block malicious files completely?"),
          answer: t(
            "형식·크기·픽셀 수 검사와 재인코딩으로 위험을 줄이지만 보안 인증이나 침투 시험을 거쳤다는 뜻은 아닙니다.",
            "Format, size and pixel checks plus re-encoding reduce the risk, but that does not mean it has passed a security certification or penetration test.",
          ),
        },
      ],
      pitfall: t(
        "'안전하다'를 단정하지 마세요. 단계별 방어를 코드로 확인한 것이고 침투 시험 결과는 없습니다. 운영 저장소가 구성되어 있는지도 확인하지 못했습니다.",
        "Do not assert 'it is safe'. The step-by-step defences were confirmed in code, and there are no penetration-test results. Whether production storage is configured was not verified.",
      ),
    },
    technologies: ["Supabase", "PostgreSQL", "NestJS", "PNG"],
    facts: [
      { value: "1 MiB · 1024px", label: t("원본 업로드 크기 상한 · 한 변 최대 픽셀(설계값)", "Original upload size cap and maximum pixels per side (design values)"), source: "packages/contracts/src/studio-virtual-custom-furniture-contract.ts" },
      { value: "256px", label: t("재인코딩 후 긴 변의 최대 길이", "Maximum long side after re-encoding"), source: "packages/contracts/src/studio-virtual-custom-furniture-contract.ts" },
      { value: "900초", label: t("서명 읽기 URL 수명(설계값)", "Lifetime of the signed read URL (design value)"), source: `${FURNITURE}/studio-virtual-space-furniture.service.ts` },
      { value: "60개", label: t("목록 한 번에 돌려주는 가구 수 상한", "Cap on furniture returned in one listing"), source: `${FURNITURE}/studio-virtual-space-furniture.service.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
