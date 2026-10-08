import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · three-d 카테고리 중 "공간(XR)" 계열 카드: WebXR 세션 권위와 공간 웹툰.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const CREATOR_DIR = "apps/web/src/domains/creator";
const SPATIAL_DIR = `${CREATOR_DIR}/spatial`;

export const WEBXR_SPATIAL_WEBTOON: EngineeringAtlasEntry = {
  id: "webxr-spatial-webtoon",
  category: "three-d",
  name: "WebXR · 공간 웹툰",
  title: t(
    "헤드셋이 없어도 읽히고, 있으면 방 안에 펼쳐지는 웹툰",
    "A webtoon that reads without a headset and unfolds in your room with one",
  ),
  status: "experimental",
  tagline: t(
    "WebXR이 되면 AR·VR로, 안 되면 2D로 읽게 하는 점진적 향상입니다.",
    "It uses AR and VR when WebXR works and plain 2D reading when it does not.",
  ),
  background: [
    t(
      "건물에 계단과 엘리베이터가 함께 있는 것과 같습니다. 엘리베이터(XR)가 없거나 고장 나도 계단(2D)으로 끝까지 갈 수 있고, 엘리베이터가 있으면 더 편하게 갑니다. 이런 설계를 점진적 향상이라 부릅니다. WebXR은 브라우저에서 AR(현실 위에 겹쳐 보기)과 VR(완전히 들어가기)을 쓰게 해 주는 웹 표준입니다. ToonStudio는 보안 연결에서 WebXR이 있을 때만 3D 화면을 준비하고, 아니면 일반 2D 읽기를 그대로 보여 줍니다.",
      "It is like a building with both stairs and an elevator. If the elevator (XR) is missing or broken you can still reach the top by the stairs (2D), and if it works the trip is easier. This design is called progressive enhancement. WebXR is the web standard that lets a browser do AR (overlaying on the real world) and VR (stepping fully inside). ToonStudio prepares the 3D view only on a secure connection where WebXR exists, and otherwise just shows ordinary 2D reading.",
    ),
    t(
      "코드에는 공간 읽기가 세 갈래 있습니다. 게시 작품 리더와 스튜디오 공간 스토리보드에서 여는 공간 리더(원고를 초점·호·벽 배치로 읽기), 주소 /read/spatial의 공간 북 리더(컷마다 깊이 레이어 최대 3개), 작가용 /studio/immersive의 XR 웹툰 스튜디오(AR 캐릭터 배치·VR 극장·깊이 패럴랙스·VRM 연출·컷 캡처)입니다. AR에서는 표면을 감지해 놓을 자리를 고르고, 감지가 안 되면 시점 바로 앞에 놓습니다.",
      "The code has three kinds of spatial reading: the spatial reader opened from the published-work reader and the studio's spatial storyboard (pages in focus, arc or wall layouts), the spatial-book reader at /read/spatial (up to 3 depth layers per cut), and the XR webtoon studio at /studio/immersive for artists (AR character placement, VR theatre, depth parallax, VRM staging, cut capture). In AR it detects a surface to pick where to place the pages, and if detection fails it places them right in front of the viewpoint.",
    ),
    t(
      "가장 까다로운 곳은 세션 권한입니다. 브라우저는 클릭 같은 사용자 동작 안에서만 XR 세션 요청을 받아 주므로, 지원 여부 조회는 클릭 전에 따로 해 두고 요청은 클릭 처리 안의 첫 await 이전에 보냅니다. three.js가 세션을 붙이는 작업은 중간에 취소할 수 없어서, 그 사이에 창을 닫으면 1.5초 뒤 세션부터 끝내 카메라·추적 권한을 먼저 풀고 렌더러는 나중에 정리합니다. 방·카메라·공간 좌표는 저장하지 않습니다.",
      "The trickiest part is session permission. A browser accepts an XR session request only inside a user action such as a click, so support is probed separately before any click and the request is sent inside the click handler before the first await. Because three.js attaching a session cannot be cancelled midway, closing the window during that step ends the session after 1.5 seconds to release camera and tracking permission first, and cleans up the renderer later. Room, camera and spatial coordinates are not saved.",
    ),
    t(
      "대안은 헤드셋 전용 앱을 따로 만드는 것이지만 설치 장벽이 크고, 웹은 링크 하나로 열립니다. 대가도 있습니다. 브라우저와 기기마다 WebXR 지원이 달라 표면 감지 같은 선택 기능은 없을 수 있고, 이 카드는 실제 헤드셋 검증을 하지 못했습니다. 자동 검사는 모의 세션 단위 테스트와, WebXR이 없는 브라우저에서 2D 읽기가 도는지 보는 스모크 테스트뿐입니다. 그래서 상태는 실험입니다.",
      "The alternative is a headset-only app, but installing it is a big barrier while the web opens with one link. There are costs. WebXR support differs by browser and device, so optional features such as surface detection may be missing, and this card could not do real-headset verification. The automatic checks are mock-session unit tests and a smoke test that confirms 2D reading works in a browser without WebXR. That is why the status is experimental.",
    ),
  ],
  keyPoints: [
    t("헤드셋이 없어도 2D로 끝까지 읽히고, 있으면 AR·VR로 넓어집니다", "Reads fully in 2D without a headset; AR and VR add more with one"),
    t("지원 조회는 클릭 전에, 세션 요청은 클릭 안에서 따로 합니다", "Support is probed before the click; the session is requested inside it"),
    t("렌더러 연결이 1.5초 넘게 끝나지 않으면 세션부터 끝냅니다", "If renderer attachment stalls over 1.5 s, the session ends first"),
    t("방·카메라·공간 좌표는 저장하지 않고, 실기기 검증은 아직입니다", "No room or camera pose is saved; real-headset checks are still missing"),
  ],
  diagram: {
    id: "webxr-spatial-webtoon-diagram",
    kind: "graph",
    title: t("있는 만큼만 넓어지는 읽기: 2D에서 AR·VR까지", "Reading that widens only as far as the device allows: 2D to AR and VR"),
    caption: t(
      "2D 읽기는 언제나 남아 있고, XR은 조건이 맞을 때만 단계를 밟아 열립니다. 버튼을 누르기 전에는 기기 권한을 묻지 않습니다.",
      "2D reading always remains, and XR opens step by step only when conditions are met. No device permission is asked before the button is pressed.",
    ),
    alt: t(
      "웹툰을 열면 먼저 보안 연결과 WebXR이 있는지 확인합니다. 없으면 2D로 읽습니다. 있으면 XR 런타임을 지연 로드하고, 기기 지원을 조회한 뒤, 독자가 버튼을 눌러야 세션을 요청합니다. 그다음 AR이면 표면 위에 배치하고 표면을 못 찾으면 시점 앞에 배치하며, VR이면 극장처럼 배치합니다.",
      "Opening the webtoon first checks for a secure connection and WebXR. Without them it reads in 2D. With them it lazy-loads the XR runtime, probes device support, and requests a session only after the reader presses a button. Then AR places the pages on a surface, or in front of the viewpoint if no surface is found, and VR lays them out like a theatre.",
    ),
    nodes: [
      { id: "open", label: t("웹툰 열기", "Open a webtoon"), sub: t("독자 또는 작가", "Reader or artist"), tone: "local", shape: "pill", at: [0, 0] },
      { id: "gate", label: t("XR 가능?", "XR possible?"), sub: t("HTTPS + xr", "HTTPS + xr"), tone: "warn", shape: "diamond", at: [1, 0] },
      { id: "load", label: t("XR 런타임 로드", "Load XR runtime"), sub: t("three.js 첫 로드", "three.js loads only now"), tone: "local", at: [2, 0] },
      { id: "probe", label: t("기기 지원 조회", "Probe device support"), sub: t("isSessionSupported", "isSessionSupported"), tone: "local", at: [3, 0] },
      { id: "click", label: t("버튼 클릭", "Button click"), sub: t("클릭 안에서 세션 요청", "Request inside the click"), tone: "good", at: [4, 0] },
      { id: "flat", label: t("2D로 읽기", "Read in 2D"), sub: t("헤드셋 없이도 전부 가능", "Fully usable without a headset"), tone: "good", at: [1, 1] },
      { id: "ar", label: t("AR: 표면에 배치", "AR: place on a surface"), sub: t("hit-test는 선택 기능", "hit-test is optional"), tone: "local", at: [3, 1] },
      { id: "mode", label: t("어느 버튼?", "Which button?"), tone: "warn", shape: "diamond", at: [4, 1] },
      { id: "vr", label: t("VR: 극장 배치", "VR: theatre layout"), sub: t("스틱·집기로 넘김", "Stick or pinch to turn"), tone: "local", at: [5, 1] },
      { id: "front", label: t("시점 앞에 배치", "Place ahead"), sub: t("표면을 못 찾을 때", "When no surface is found"), tone: "local", at: [3, 2] },
    ],
    edges: [
      { from: "open", to: "gate" },
      { from: "gate", to: "load", label: t("예", "yes") },
      { from: "gate", to: "flat", label: t("아니오", "no") },
      { from: "load", to: "probe" },
      { from: "probe", to: "click" },
      { from: "click", to: "mode" },
      { from: "mode", to: "ar", label: t("AR", "AR") },
      { from: "mode", to: "vr", label: t("VR", "VR") },
      { from: "ar", to: "front", label: t("표면 없음", "no surface"), style: "dashed" },
    ],
  },
  usage: [
    {
      feature: t("공간 리더 (게시 작품 · 스튜디오 공간 스토리보드)", "Spatial reader (published works and the studio spatial storyboard)"),
      role: t(
        "원고 이미지를 초점·호·벽 배치로 읽습니다. WebXR이 있을 때만 3D 런타임을 불러오고, AR/VR 버튼을 눌러야 기기 권한을 요청합니다. 없으면 2D 읽기를 씁니다.",
        "Reads page images in focus, arc or wall layouts. The 3D runtime loads only where WebXR exists and device permission is asked only after an AR/VR button is pressed; otherwise 2D reading is used.",
      ),
      paths: [
        `${SPATIAL_DIR}/SpatialWebtoonReader.tsx`,
        `${SPATIAL_DIR}/spatial-reader-runtime.ts`,
        `${SPATIAL_DIR}/SpatialWebtoonReaderLauncher.tsx`,
        `${CREATOR_DIR}/PublishedWorkReader.tsx`,
      ],
    },
    {
      feature: t("공간 북 리더 (/read/spatial)", "Spatial-book reader (/read/spatial)"),
      role: t(
        "작가가 만든 공간 북(컷 32개 이하, 컷당 깊이 레이어 3개 이하)을 VR 극장이나 AR 평면으로 봅니다. 공용 세션 권위를 쓰지 않고 세션을 직접 요청하는 별도 구현입니다.",
        "Views an artist-made spatial book (up to 32 cuts, up to 3 depth layers per cut) as a VR theatre or an AR plane. It is a separate implementation that requests the session itself instead of using the shared session authority.",
      ),
      paths: [
        `${CREATOR_DIR}/spatial-reader/StudioSpatialReaderPage.tsx`,
        `${CREATOR_DIR}/spatial-reader/spatial-reader-runtime.ts`,
        `${CREATOR_DIR}/spatial-reader/spatial-book.ts`,
      ],
      route: "/read/spatial",
    },
    {
      feature: t("XR 웹툰 스튜디오 (/studio/immersive)", "XR webtoon studio (/studio/immersive)"),
      role: t(
        "AR 캐릭터 배치·VR 극장·깊이 패럴랙스·VRM 연출·컷 캡처를 한곳에서 해 봅니다. 클릭하기 전에는 WebGL 비용이 없고, 시작을 누르면 three.js 프리젠터를 만든 뒤 세션을 요청합니다. 느린 네트워크에서 이 대기가 클릭의 유효 시간을 넘는지는 확인하지 못했습니다.",
        "Tries AR character placement, VR theatre, depth parallax, VRM staging and cut capture in one place. There is no WebGL cost before a click; pressing start creates the three.js presenter and then requests the session. Whether that wait can outlast the click's validity window on a slow network was not confirmed.",
      ),
      paths: [
        `${SPATIAL_DIR}/StudioImmersiveHubPage.tsx`,
        `${CREATOR_DIR}/xr-webtoon/XrWebtoonStudioHost.tsx`,
        `${CREATOR_DIR}/xr-webtoon/xr-webtoon-presenter.ts`,
      ],
      route: "/studio/immersive",
    },
    {
      feature: t("공용 WebXR 세션 권위", "Shared WebXR session authority"),
      role: t(
        "지원 조회, 클릭 안 세션 요청, 렌더러 부착, 종료와 정리를 한곳에서 맡고 1.5초 프라이버시 타이머를 둡니다. 공간 리더·XR 스튜디오·BG3D 몰입 미리보기가 함께 씁니다.",
        "Handles support probing, the in-click session request, renderer attachment, ending and cleanup in one place, with a 1.5-second privacy timer. The spatial reader, the XR studio and the BG3D immersive preview share it.",
      ),
      paths: [
        `${CREATOR_DIR}/studio-webxr-session.ts#createStudioWebXrSessionController`,
        `${CREATOR_DIR}/bg3d/StudioBg3dWebXrSessionBridge.tsx`,
        `${CREATOR_DIR}/bg3d/StudioBg3dImmersivePanel.tsx`,
      ],
      route: "/studio/bg3d",
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("지원 조회는 따로, 세션 요청은 클릭 안에서 바로", "Probe support separately; request the session straight inside the click"),
      language: "ts",
      code: `type Mode = "immersive-ar" | "immersive-vr";
type Support = "supported" | "unsupported" | "unknown";
interface XrPort {
  isSessionSupported(mode: Mode): Promise<boolean>;
  requestSession(mode: Mode, init?: { requiredFeatures?: string[]; optionalFeatures?: string[] }): Promise<{ end(): Promise<void> }>;
}

/** 클릭하기 전에 미리 조회해 둔다. 실패해도 막지 않고 unknown 으로 둔다. */
export async function inspect(xr: XrPort, mode: Mode): Promise<Support> {
  try { return (await xr.isSessionSupported(mode)) ? "supported" : "unsupported"; } catch { return "unknown"; }
}

/** 버튼 클릭 처리 안에서 호출한다. 첫 await 이전에 requestSession 을 불러야 클릭의 사용자 활성화가 남는다. */
export function start(xr: XrPort, mode: Mode, support: Support) {
  if (support === "unsupported") throw new Error(\`\${mode} is unsupported\`);
  // 두 모드 모두 local 만 필수다. AR 은 DOM 오버레이를 선택 기능으로 덧붙인다
  const init = mode === "immersive-ar"
    ? { requiredFeatures: ["local"], optionalFeatures: ["dom-overlay"] }
    : { requiredFeatures: ["local"] };
  return xr.requestSession(mode, init); // await 하지 않고 Promise 를 그대로 돌려준다
}`,
      codeEn: `type Mode = "immersive-ar" | "immersive-vr";
type Support = "supported" | "unsupported" | "unknown";
interface XrPort {
  isSessionSupported(mode: Mode): Promise<boolean>;
  requestSession(mode: Mode, init?: { requiredFeatures?: string[]; optionalFeatures?: string[] }): Promise<{ end(): Promise<void> }>;
}

/** Probe ahead of time, before any click. A failure does not block; it is left as unknown. */
export async function inspect(xr: XrPort, mode: Mode): Promise<Support> {
  try { return (await xr.isSessionSupported(mode)) ? "supported" : "unsupported"; } catch { return "unknown"; }
}

/** Call inside the button's click handler. requestSession must run before the first await so the click's user activation survives. */
export function start(xr: XrPort, mode: Mode, support: Support) {
  if (support === "unsupported") throw new Error(\`\${mode} is unsupported\`);
  // Both modes require only local. AR adds a DOM overlay as an optional feature
  const init = mode === "immersive-ar"
    ? { requiredFeatures: ["local"], optionalFeatures: ["dom-overlay"] }
    : { requiredFeatures: ["local"] };
  return xr.requestSession(mode, init); // do not await; return the Promise as is
}`,
      explain: t(
        "브라우저는 사용자 동작 직후에만 세션 요청을 받아 주므로, 먼저 await를 하면 요청이 거절될 수 있습니다. 실제 코드는 DOM 루트가 있을 때만 dom-overlay를 요청하고, VR에서 local-floor를 일부러 쓰지 않습니다. 촬영 장면이 이미 리그 위치를 정해 두어 바닥 기준이면 눈높이가 두 번 더해지기 때문입니다.",
        "A browser accepts a session request only right after a user action, so awaiting first can get the request refused. The real code requests dom-overlay only when a DOM root exists, and deliberately avoids local-floor in VR because the authored shot already sets the rig position, so a floor reference would add eye height twice.",
      ),
      source: `${CREATOR_DIR}/studio-webxr-session.ts`,
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("닫을 때 렌더러 연결이 1.5초 넘게 멈추면 세션부터 끝내기", "On close, end the session first if renderer attachment stalls past 1.5 s"),
      language: "ts",
      code: `const PRIVACY_TIMEOUT_MS = 1_500;

/** 취소할 수 없는 렌더러 연결이 오래 걸려도 카메라·추적 권한은 먼저 푼다. */
export async function closeXr(
  session: { end(): Promise<void> },
  attachment: Promise<void> | null,
  releaseRenderer: () => void,
): Promise<void> {
  let ending: Promise<void> | null = null;
  const endOnce = () => (ending ??= session.end().catch(() => undefined)); // 한 번만 끝낸다
  if (attachment) {
    let settled = false;
    const done = attachment.then(() => { settled = true; }, () => { settled = true; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => { timer = setTimeout(resolve, PRIVACY_TIMEOUT_MS); });
    await Promise.race([done, deadline]);
    clearTimeout(timer);
    if (!settled) void endOnce(); // 프라이버시가 렌더러 메모리보다 먼저다
    await done; // 부착이 끝난 뒤에야 렌더러를 정리한다
  }
  await endOnce();
  releaseRenderer();
}`,
      codeEn: `const PRIVACY_TIMEOUT_MS = 1_500;

/** Even if the uncancellable renderer attachment is slow, camera and tracking permission is released first. */
export async function closeXr(
  session: { end(): Promise<void> },
  attachment: Promise<void> | null,
  releaseRenderer: () => void,
): Promise<void> {
  let ending: Promise<void> | null = null;
  const endOnce = () => (ending ??= session.end().catch(() => undefined)); // end only once
  if (attachment) {
    let settled = false;
    const done = attachment.then(() => { settled = true; }, () => { settled = true; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => { timer = setTimeout(resolve, PRIVACY_TIMEOUT_MS); });
    await Promise.race([done, deadline]);
    clearTimeout(timer);
    if (!settled) void endOnce(); // privacy comes before renderer memory
    await done; // clean up the renderer only after the attachment finishes
  }
  await endOnce();
  releaseRenderer();
}`,
      explain: t(
        "three.js의 세션 부착은 중간에 취소할 수 없어서, 그 사이에 session.end()를 부르면 늦게 도착한 부착이 이미 정리된 렌더러를 되살리는 경쟁이 생깁니다. 그래서 평소에는 부착이 끝나기를 기다리고, 1.5초가 지나도 안 끝날 때만 프라이버시를 위해 세션부터 끝냅니다.",
        "Attaching a session in three.js cannot be cancelled, so calling session.end() in between lets a late attachment revive an already cleaned-up renderer. So normally it waits for the attachment, and only if 1.5 seconds pass without it finishing does it end the session first, for privacy.",
      ),
      source: `${CREATOR_DIR}/studio-webxr-session.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · WebXR Device API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API",
      kind: "docs",
      note: t("AR·VR 세션의 기본 개념과 API 목록", "The basic concepts of AR and VR sessions and the API list"),
    },
    {
      title: "WebXR Device API (W3C)",
      url: "https://www.w3.org/TR/webxr/",
      kind: "spec",
    },
    {
      title: "MDN · XRSystem.requestSession()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession",
      kind: "docs",
      note: t("세션 요청과 사용자 동작 요건", "Requesting a session and the user-gesture requirement"),
    },
    {
      title: "WebXR Hit Test Module",
      url: "https://immersive-web.github.io/hit-test/",
      kind: "spec",
      note: t("AR에서 현실 표면 위에 배치하는 선택 기능", "The optional feature for placing on real surfaces in AR"),
    },
    {
      title: "WebXR DOM Overlays Module",
      url: "https://immersive-web.github.io/dom-overlays/",
      kind: "spec",
      note: t("AR 화면 위에 일반 버튼을 겹치는 기능", "Overlaying ordinary buttons on the AR view"),
    },
    {
      title: "three.js documentation · WebXRManager",
      url: "https://threejs.org/docs/pages/WebXRManager.html",
      kind: "docs",
      note: t("three.js가 XR 세션을 붙이는 방식", "How three.js attaches an XR session"),
    },
  ],
  chapterIds: ["web-3d-engine", "nextgen-web-experiments"],
  talk: {
    pitch: t(
      "이 웹툰은 헤드셋이 없어도 끝까지 읽히고, 헤드셋이 있으면 방 안에 펼쳐집니다. WebXR이 되는 환경에서만 3D를 준비하고, 버튼을 눌러야 기기 권한을 묻고, 닫으면 곧바로 카메라·추적 권한을 풉니다. 방과 카메라의 위치는 저장하지 않습니다. 아직 실제 헤드셋 검증은 못 했기 때문에 실험 단계라고 솔직하게 말씀드립니다.",
      "This webtoon reads to the end without a headset and unfolds in your room with one. It prepares 3D only where WebXR works, asks for device permission only after a button press, and releases camera and tracking permission right away when closed. It does not save the position of the room or the camera. Because real-headset verification is not done yet, I will be honest that it is at an experimental stage.",
    ),
    analogy: t(
      "건물의 계단과 엘리베이터입니다. 엘리베이터(XR)가 없어도 계단(2D)으로 끝까지 갈 수 있습니다.",
      "Stairs and an elevator in a building: even without the elevator (XR) you can reach the top by the stairs (2D).",
    ),
    questions: [
      {
        question: t("헤드셋이 없으면 못 쓰나요?", "Can't I use it without a headset?"),
        answer: t(
          "아니요. 헤드셋이 없거나 보안 연결이 아니면 3D 런타임을 아예 불러오지 않고 2D 읽기를 보여 줍니다. 구간 이동과 읽기 방향 같은 설정도 2D에서 그대로 됩니다.",
          "You can. Without a headset, or without a secure connection, the 3D runtime is not even loaded and 2D reading is shown. Settings such as segment navigation and reading direction work in 2D too.",
        ),
      },
      {
        question: t("제 방 구조가 저장되나요?", "Is my room's layout saved?"),
        answer: t(
          "코드 주석은 세션·기준 공간·프레임·기기 핸들을 프로젝트나 OPFS 문서에 저장하지 않는다고 못 박고, 리더는 방·카메라·공간 좌표를 저장하지 않는다고 안내합니다. 읽던 쪽수와 보기 설정만 이 브라우저에 저장됩니다.",
          "A code comment states that sessions, reference spaces, frames and device handles are never saved into a project or OPFS document, and the reader says it does not save room, camera or spatial coordinates. Only the page you were on and view settings are stored in this browser.",
        ),
      },
      {
        question: t("실제 헤드셋에서 확인했나요?", "Was it checked on a real headset?"),
        answer: t(
          "아니요. 저장소 문서는 헤드셋 하드웨어를 에뮬레이션하거나 인증하지 않는다고 적고, 휴대용 리더의 검사 결과도 hardwareXRValidated를 false로 기록합니다. 세션 로직은 모의 세션 단위 테스트로, WebXR이 없는 브라우저의 2D 경로는 스모크 테스트로 확인했습니다.",
          "No. The repository's own document says headset hardware is neither emulated nor certified, and the portable reader's test results record hardwareXRValidated as false. The session logic is covered by mock-session unit tests, and the 2D path in a browser without WebXR by a smoke test.",
        ),
      },
    ],
    pitfall: t(
      "'VR/AR을 지원한다'고만 말하지 마세요. 실기기 검증이 없고, 지원 여부는 브라우저와 기기마다 다릅니다. 또 공간 읽기 구현이 둘이라 정책이 다릅니다. 공용 세션 권위는 VR에 local만 요구하지만 /read/spatial은 local-floor를 요구하고 hand-tracking도 선택으로 요청합니다.",
      "Do not just say 'it supports VR and AR'. There is no real-device verification, and support differs by browser and device. Also there are two spatial-reading implementations with different policies: the shared session authority requires only local for VR, while /read/spatial requires local-floor and also asks for hand-tracking as optional.",
    ),
  },
  technologies: ["WebXR", "Three.js", "WebGL2"],
  facts: [
    { value: "1.5 s", label: t("렌더러 연결이 끝나지 않을 때 세션부터 끝내기까지 기다리는 시간", "How long to wait before ending the session first when renderer attachment stalls"), source: `${CREATOR_DIR}/studio-webxr-session.ts` },
    { value: "32 / 3", label: t("공간 북 한 권의 컷 수 / 컷당 깊이 레이어 상한", "Cuts per spatial book / depth layers per cut, at most"), source: `${CREATOR_DIR}/spatial-reader/spatial-book.ts` },
    { value: "3", label: t("공간 리더가 동시에 쥐는 원본 이미지 수(대기 포함)", "Source images the spatial reader holds at once, pending included"), source: `${SPATIAL_DIR}/spatial-reader-textures.ts` },
    { value: "20", label: t("세션 권위의 모의 세션 단위 테스트 수", "Mock-session unit tests for the session authority"), source: `${CREATOR_DIR}/studio-webxr-session.test.ts` },
  ],
  reviewedAt: "2026-10-07",
};

/** three-d 카테고리의 "공간(XR)" 카드 묶음. */
export const THREE_D_XR_CARDS: readonly EngineeringAtlasEntry[] = [WEBXR_SPATIAL_WEBTOON];
