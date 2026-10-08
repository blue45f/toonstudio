import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** 기술 도감 · web-platform · 격리 문서와 GPU 플랫폼 층. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. */
export const ENGINEERING_ATLAS_WEB_PLATFORM_ISOLATION: readonly EngineeringAtlasEntry[] = [
  {
    id: "cross-origin-isolation-studio-gate",
    category: "web-platform",
    name: "Cross-Origin Isolation",
    title: t("스튜디오에만 거는 '격리 문서'", "An isolated document, for the studio only"),
    status: "live",
    tagline: t(
      "/studio 문서에만 COOP·COEP를 걸어 공유 메모리를 안전하게 쓰는 문을 엽니다.",
      "COOP and COEP on the /studio document alone unlock safe shared memory.",
    ),
    background: [
      t(
        "브라우저는 '스펙터' 같은 CPU 보안 사고 이후, 서로 다른 사이트의 코드가 한 방에서 메모리를 나눠 쓰지 못하게 문을 잠갔습니다. 그 바람에 큰 그림 데이터를 복사 없이 일꾼(워커)과 함께 만지는 공유 메모리(SharedArrayBuffer)도 기본으로는 꺼져 있습니다. 서버가 헤더 두 개를 붙여 '이 문서는 바깥과 섞이지 않는다'고 약속하면, 그 문서만 잠금이 풀립니다.",
        "After CPU security incidents such as Spectre, browsers locked the door so code from different sites cannot share memory in one room. That also switched off SharedArrayBuffer, the shared memory that lets a page and its Workers touch big image data without copying. When a server attaches two headers promising that a document will not mix with outsiders, only that document gets the lock released.",
      ),
      t(
        "순서는 이렇습니다. 서버가 /studio 응답에 COOP same-origin(다른 창과의 연결 끊기)과 COEP credentialless(쿠키 없이만 외부 리소스 허용) 헤더를 붙이면 브라우저가 crossOriginIsolated 를 true 로 알려 줍니다. 공개 페이지에서 앱 안 링크로 /studio 에 들어오면 문서 헤더가 바뀌지 않았으므로, 게이트가 표지를 남기고 새로고침을 딱 한 번 합니다. 새로 받은 문서는 헤더를 달고 오므로 격리가 켜집니다.",
        "The order is this. When the server adds COOP same-origin (cut the link to other windows) and COEP credentialless (allow outside resources only without cookies) to the /studio response, the browser reports crossOriginIsolated as true. If a visitor enters /studio through an in-app link, the document headers have not changed, so the gate leaves a marker and reloads exactly once. The fresh document arrives with the headers, so isolation switches on.",
      ),
      t(
        "공개 사이트 전체에 걸지 않는 것이 설계의 핵심입니다. COOP same-origin 은 window.opener 연결을 끊어, 구글 로그인이나 결제처럼 팝업이 원래 창으로 돌아와야 하는 흐름을 깨뜨릴 수 있습니다. 그래서 격리는 /studio 경계에만 두고, 공개 페이지에서 스튜디오로 갈 때는 문서를 새로 불러옵니다. COEP 는 모든 외부 리소스에 허가 헤더를 요구하는 require-corp 대신, 쿠키 없이 불러오는 조건으로 허용하는 credentialless 를 골랐습니다.",
        "Keeping the public site out of it is the core of the design. COOP same-origin cuts window.opener, which can break flows where a popup must return to the original window, such as Google sign-in or payments. So isolation sits only at the /studio boundary, and going from a public page to the studio loads a fresh document. For COEP it uses credentialless, which admits outside resources when fetched without cookies, instead of require-corp, which demands a permission header from every one of them.",
      ),
      t(
        "지켜야 할 규칙도 있습니다. 전용 워커 스크립트 응답에도 같은 COEP 헤더가 있어야 하고, 서비스 워커가 캐시한 셸이 헤더를 잃으면 오프라인에서 격리가 사라지므로 헤더가 있는 셸만 폴백으로 씁니다. 격리가 끝내 켜지지 않아도 편집기는 열리며, 공유 메모리가 필요한 기능의 한도(예: 조각 정점 수)만 낮아집니다. COEP credentialless 를 지원하는 브라우저 범위는 코드로 알 수 없으니 MDN 호환성 표로 확인하세요.",
        "There are rules to keep. Dedicated Worker script responses need the same COEP header, and a shell cached by the Service Worker loses isolation offline if it lost its headers, so only a shell that still carries them is used as the fallback. If isolation never turns on, the editor still opens and only the limits of shared-memory features (for example the sculpt vertex count) go down. Which browsers support COEP credentialless cannot be read from code, so check the MDN compatibility table.",
      ),
    ],
    keyPoints: [
      t("격리는 /studio 경로에만 건다", "Isolation applies to /studio only"),
      t("비격리면 새로고침은 딱 1회", "At most one guarded reload"),
      t("실패해도 편집기는 열린다", "If isolation fails, the editor still opens"),
      t("공유 메모리 기능의 한도만 내려간다", "Only shared-memory limits are lowered"),
    ],
    diagram: {
      id: "cross-origin-isolation-studio-gate-diagram",
      kind: "sequence",
      title: t("격리 가드 리로드 흐름", "The guarded reload flow"),
      caption: t(
        "공개 페이지에서 들어와도 새로고침은 한 번뿐이고, 실패하면 그대로 편집기를 엽니다.",
        "Even when entered from a public page, the reload happens once, and failure still opens the editor.",
      ),
      alt: t(
        "공개 페이지에서 스튜디오로 이동하면 격리 게이트가 crossOriginIsolated 값을 확인하고, 아니면 표지를 남긴 뒤 한 번 새로고침합니다. Cloudflare 가 COOP·COEP 헤더를 붙인 문서를 돌려주면 고성능 모드가 켜지고, 그래도 격리가 안 되면 재시도 없이 편집기만 엽니다.",
        "Moving from a public page to the studio, the isolation gate checks crossOriginIsolated, and if it is false it leaves a marker and reloads once. When Cloudflare returns the document with COOP and COEP headers, high-performance mode turns on; if isolation still fails, the editor opens without another retry.",
      ),
      actors: [
        { id: "public", label: t("공개 페이지", "Public page"), sub: t("React 앱", "React app"), tone: "local" },
        { id: "gate", label: t("격리 게이트", "Isolation gate"), sub: t("앱 안의 가드", "In-app guard"), tone: "local" },
        { id: "edge", label: t("Cloudflare", "Cloudflare"), sub: t("응답 헤더", "Response headers"), tone: "edge" },
        { id: "studio", label: t("/studio 문서", "/studio document"), sub: t("편집기", "Editor"), tone: "good" },
      ],
      messages: [
        { from: "public", to: "gate", label: t("/studio 로 이동", "Navigate to /studio") },
        {
          from: "gate",
          to: "gate",
          label: t("crossOriginIsolated 확인", "Check crossOriginIsolated"),
          note: t("false 면 새로고침을 결정", "False means decide to reload"),
        },
        {
          from: "gate",
          to: "gate",
          label: t("중복 방지 표지 기록", "Write a once-only marker"),
          note: t("sessionStorage + history.state", "sessionStorage and history.state"),
        },
        {
          from: "gate",
          to: "edge",
          label: t("location.reload()", "location.reload()"),
          note: t("문서를 헤더와 함께 다시 요청", "Request the document again with headers"),
        },
        {
          from: "edge",
          to: "studio",
          label: t("COOP same-origin + COEP credentialless", "COOP same-origin + COEP credentialless"),
          style: "dashed",
        },
        {
          from: "studio",
          to: "studio",
          label: t("crossOriginIsolated === true", "crossOriginIsolated === true"),
          note: t("공유 메모리·고성능 모드 켜짐", "Shared memory and high-performance mode on"),
        },
        {
          from: "studio",
          to: "studio",
          label: t("그래도 false 면 그대로 열기", "Still false? Open anyway"),
          style: "dashed",
          note: t("재시도 없음 · 한도만 낮춤", "No retry; only limits are lowered"),
        },
      ],
    },
    usage: [
      {
        feature: t("캔버스 편집기 · 고성능 모드", "Canvas editor · high-performance mode"),
        role: t(
          "/studio 응답 헤더로 격리 문서를 만들고, 앱 안 링크로 들어오면 게이트가 1회만 새로고침합니다.",
          "Response headers make /studio an isolated document; when entered by an in-app link, the gate reloads once.",
        ),
        paths: [
          "config/http-response-headers.json",
          "apps/web/public/_headers",
          "apps/web/src/app/studio-cross-origin-isolation.ts#requestStudioCrossOriginIsolationReload",
          "apps/web/src/app/StudioCrossOriginIsolationGate.tsx",
          "apps/web/src/app/routes/AppRouter.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("개발 서버·미리보기 서버", "Dev and preview servers"),
        role: t(
          "Vite 미들웨어가 문서와 워커 요청에 같은 헤더를 붙여 운영과 같은 조건으로 시험합니다.",
          "A Vite middleware adds the same headers to document and Worker requests so tests run under production conditions.",
        ),
        paths: ["apps/web/vite.config.ts#studioCrossOriginIsolationPlugin"],
      },
      {
        feature: t("오프라인 복구 (서비스 워커)", "Offline recovery (Service Worker)"),
        role: t(
          "격리 헤더가 없는 캐시 셸은 오프라인 폴백으로 쓰지 않아 격리가 조용히 사라지는 일을 막습니다.",
          "A cached shell without the isolation headers is never used as the offline fallback, so isolation cannot vanish silently.",
        ),
        paths: [
          "apps/web/src/app/service-worker/studio-service-worker-navigation.ts#isUsableStudioShell",
          "docs/studio-service-worker.md",
        ],
      },
      {
        feature: t("무거운 기능의 한도 (조각)", "Limits of heavy features (sculpt)"),
        role: t(
          "공유 메모리가 없으면 조각 정점 상한을 2,097,152로 낮춰, 되돌리기 복제 비용이 편집 지연으로 드러나는 구간을 피합니다.",
          "Without shared memory the sculpt vertex ceiling drops to 2,097,152, avoiding the range where undo-copy cost shows up as lag.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-capability-probe.ts",
          "apps/web/src/domains/creator/studio-capability-budgets.ts#STUDIO_SCULPT_NO_SHARED_MEMORY_MAX_VERTICES",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("딱 한 번만 새로고침하는 가드", "A guard that reloads exactly once"),
        language: "ts",
        ...sampleSource([
          ['const KEY = "iso-reload-v1";'],
          [""],
          ["export function shouldReloadForIsolation(pathname: string): boolean {"],
          ['  const isStudio = pathname === "/studio" || pathname.startsWith("/studio/");'],
          ["  if (!isStudio || globalThis.crossOriginIsolated) return false;", "스튜디오가 아니거나 이미 격리됐으면 할 일이 없다", "nothing to do outside the studio or when already isolated"],
          ["  try {"],
          ['    if (sessionStorage.getItem(KEY) === "done") return false;', "두 번째 시도는 하지 않는다", "never make a second attempt"],
          ['    sessionStorage.setItem(KEY, "done");'],
          ["  } catch {"],
          ["    return false;", "표지를 못 남기면 무한 새로고침 대신 포기한다", "if the marker cannot be written, give up instead of looping"],
          ["  }"],
          ["  return true;", "호출자가 location.reload() 를 정확히 한 번 부른다", "the caller calls location.reload() exactly once"],
          ["}"],
        ]),
        explain: t(
          "핵심은 '표지를 먼저 남기고, 남기지 못하면 새로고침하지 않는다'입니다. 실제 코드는 sessionStorage 와 history.state 두 곳에 표지를 남기고 방향(스튜디오 진입·공개 복귀)까지 구분합니다.",
          "The key is to write the marker first and not reload when it cannot be written. The real code writes the marker to both sessionStorage and history.state and also tells entry and exit directions apart.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("운영 헤더 규칙(요약)", "Production header rules (abridged)"),
        language: "text",
        ...sampleSource(
          [
            ["/studio/*", "스튜디오 문서만 격리 문서가 된다", "only studio documents become isolated"],
            ["  Cross-Origin-Opener-Policy: same-origin"],
            ["  Cross-Origin-Embedder-Policy: credentialless"],
            ["/assets/*", "워커 스크립트를 포함한 빌드 산출물", "build output, including Worker scripts"],
            ["  Cross-Origin-Embedder-Policy: credentialless"],
            ["  Cross-Origin-Resource-Policy: same-origin"],
          ],
          "#",
        ),
        explain: t(
          "apps/web/public/_headers 에서 격리와 관련된 규칙만 골랐습니다. 이 파일은 config/http-response-headers.json 에서 생성되며, 직접 고치지 않습니다.",
          "Only the isolation-related rules are picked from apps/web/public/_headers. That file is generated from config/http-response-headers.json and is not edited by hand.",
        ),
        source: "apps/web/public/_headers",
      },
    ],
    links: [
      {
        title: "web.dev · Making your website cross-origin isolated using COOP and COEP",
        url: "https://web.dev/articles/coop-coep",
        kind: "guide",
        note: t("격리가 필요한 이유와 헤더 설정 절차", "Why isolation is needed and how to set the headers"),
      },
      {
        title: "web.dev · A guide to enable cross-origin isolation",
        url: "https://web.dev/articles/cross-origin-isolation-guide",
        kind: "guide",
        note: t("서드파티 리소스가 많을 때의 단계별 도입", "Step-by-step adoption when many third-party resources exist"),
      },
      {
        title: "MDN · Window.crossOriginIsolated",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated",
        kind: "docs",
      },
      {
        title: "MDN · Cross-Origin-Embedder-Policy header",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy",
        kind: "docs",
        note: t("require-corp 와 credentialless 의 차이, 호환성 표", "require-corp versus credentialless, and the compatibility table"),
      },
      {
        title: "MDN · SharedArrayBuffer",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer",
        kind: "docs",
      },
    ],
    chapterIds: ["pwa-continuity", "worker-architecture"],
    talk: {
      pitch: t(
        "스튜디오는 큰 그림 데이터를 복사하지 않고 일꾼과 함께 만지고 싶습니다. 브라우저는 보안 때문에 그 공유 메모리를 기본으로 막아 두었고, 서버가 헤더 두 개로 이 문서는 격리된다고 약속해야 풀어 줍니다. 그래서 공개 사이트는 그대로 두고 작업실 문인 /studio 에만 그 약속을 겁니다. 격리가 안 켜지는 환경에서도 편집기는 열리고, 무거운 기능의 한도만 낮아집니다.",
        "The studio wants to handle big image data together with its workers without copying. For security the browser keeps that shared memory off by default and releases it only when the server promises, with two headers, that the document is isolated. So the public site stays as it is and only /studio, the door to the workshop, gets the promise. Where isolation does not switch on, the editor still opens and only the limits of heavy features go down.",
      ),
      analogy: t(
        "공동 작업실에서 모두가 같은 열쇠를 쓰면 편하지만 위험합니다. 그래서 로비는 그대로 열어 두고 작업실 출입문에만 별도의 출입증 검사를 달았다고 생각하면 됩니다.",
        "Sharing one key in a common workshop is convenient but risky. Think of it as leaving the lobby open and putting an extra badge check on the workshop door only.",
      ),
      questions: [
        {
          question: t("왜 사이트 전체에 걸지 않나요?", "Why not apply it to the whole site?"),
          answer: t(
            "COOP same-origin 은 창 사이의 연결을 끊어 로그인·결제 팝업이 원래 창으로 돌아오지 못하게 만들 수 있습니다. 그래서 스튜디오 문서에만 걸었습니다.",
            "COOP same-origin cuts the link between windows, which can stop sign-in and payment popups from returning. That is why it applies to the studio document only.",
          ),
        },
        {
          question: t("격리가 안 되는 브라우저에서는 어떻게 되나요?", "What happens in a browser where isolation does not work?"),
          answer: t(
            "새로고침을 한 번만 시도하고, 그래도 안 되면 편집기를 그대로 엽니다. 공유 메모리를 쓰는 기능의 상한(예: 조각 정점 수)만 낮아집니다.",
            "It tries one reload and, if that fails, opens the editor anyway. Only the ceilings of shared-memory features, such as the sculpt vertex count, go down.",
          ),
        },
        {
          question: t("새로고침이 무한 반복되지 않나요?", "Can the reload loop forever?"),
          answer: t(
            "sessionStorage 와 history.state 에 표지를 남기고, 표지를 쓸 수 없는 환경에서는 새로고침 자체를 포기합니다.",
            "It leaves markers in sessionStorage and history.state, and where markers cannot be written it gives up reloading altogether.",
          ),
        },
      ],
      pitfall: t(
        "브라우저별로 COEP credentialless 가 켜지는지는 코드로 확인할 수 없고, 실브라우저별 격리 성공 여부도 이 카드에서 검증하지 않았습니다. '모든 브라우저에서 고성능 모드가 켜진다'고 말하면 과장입니다. 지원 현황은 MDN 호환성 표를 보여 주세요.",
        "Whether COEP credentialless is available per browser cannot be read from code, and real-browser isolation was not verified for this card. Saying that high-performance mode turns on in every browser would be an overstatement; show the MDN compatibility table instead.",
      ),
    },
    technologies: ["SharedArrayBuffer", "COOP", "COEP", "Cloudflare Static Assets", "Service Worker"],
    facts: [
      {
        value: "same-origin · credentialless",
        label: t("/studio 의 COOP · COEP 값", "COOP and COEP values on /studio"),
        source: "config/http-response-headers.json",
      },
      {
        value: "2,097,152",
        label: t("공유 메모리가 없을 때 조각 정점 상한", "Sculpt vertex ceiling without shared memory"),
        source: "apps/web/src/domains/creator/studio-capability-budgets.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "webgpu-tier-budget-recovery",
    category: "web-platform",
    name: "WebGPU",
    title: t("브라우저 이름이 아닌 '한도'로 판단하는 GPU 층", "A GPU layer that judges by limits, not by browser name"),
    status: "live",
    tagline: t(
      "어댑터를 실제로 확인하고 한도로 등급을 매기며, 끊기면 같은 GPU로 복구를 시도합니다.",
      "It checks for a real adapter, grades by limits, and retries the same GPU after a loss.",
    ),
    background: [
      t(
        "GPU 가속은 빠르지만 기기마다 성능이 다르고, 브라우저는 GPU 메모리 총량을 알려 주지 않습니다. navigator.gpu 가 있는데도 실제로는 쓸 수 없는 환경도 있습니다. 하드웨어 가속을 끈 크롬에서 필터를 적용했더니 픽셀이 하나도 바뀌지 않은 일이 코드 주석에 기록돼 있습니다. 그래서 브라우저 이름으로 막는 대신, 기기가 스스로 보고하는 한도를 읽어 정직하게 나누는 층이 필요했습니다.",
        "GPU acceleration is fast, but performance differs by device and the browser does not report total GPU memory. Some environments even expose navigator.gpu yet cannot actually use it. A code comment records a case where applying a filter in Chrome with hardware acceleration off changed no pixels at all. So instead of blocking by browser name, the project needed a layer that reads the limits a device reports and divides work honestly.",
      ),
      t(
        "동작은 네 단계입니다. 첫째, navigator.gpu 가 있다고 끝내지 않고 requestAdapter() 를 3초(250~10,000ms 범위) 안에 한 번 물어 어댑터가 실제로 있는지 봅니다. 둘째, 어댑터가 보고한 버퍼·텍스처·연산 한도 8개를 읽어 full·standard·lite 등급을 매깁니다. 브라우저 이름과 User-Agent 는 읽지 않습니다. 셋째, 물리 GPUDevice 는 fabric 하나가 소유하고 기능들은 lease 로 빌려 씁니다. 넷째, 장치가 끊기면 같은 GPU 로 재연결을 시도하고, 세 번 끊기면 이번 세션에서는 포기합니다.",
        "It works in four steps. First, having navigator.gpu is not enough; requestAdapter() is asked once within 3 seconds (allowed range 250 to 10,000 ms) to see whether an adapter really exists. Second, the eight buffer, texture and compute limits the adapter reports are read to assign the full, standard or lite tier; browser name and User-Agent are never read. Third, one fabric owns the physical GPUDevice and features borrow it through leases. Fourth, after a device loss the same GPU is retried, and a third loss ends GPU use for the session.",
      ),
      t(
        "등급 규칙의 핵심은 비대칭입니다. GPU 한도는 확인이 안 되면 '미달'로 보고(fail-closed), CPU 코어 수나 기기 메모리처럼 브라우저가 숨기는 값은 확인이 안 되면 '통과'로 봅니다(fail-open). 성능 좋은 기기를 알 수 없다는 이유로 벌하지 않으면서, 검증할 수 없는 GPU 한도 위에 무거운 작업을 올리지도 않는 선택입니다. 대안인 User-Agent 분기는 새 브라우저가 나올 때마다 목록을 고쳐야 합니다.",
        "The tier rule is deliberately asymmetric. A GPU limit that cannot be confirmed counts as short (fail-closed), while a value browsers often hide, such as CPU cores or device memory, counts as passing when unknown (fail-open). This avoids punishing a capable device just because it is opaque, without putting heavy work on a GPU limit nobody could verify. The alternative, branching on User-Agent, needs a list update for every new browser.",
      ),
      t(
        "한계도 분명합니다. 기능별 예산 사다리(조각 정점 8,388,608 → 524,288 같은 단계)는 계산 함수와 테스트까지 만들어져 있지만, 아직 실제 기능이 읽어 쓰는 호출처가 없습니다. 지금 사용자가 보는 것은 도움말의 기기 진단, GPU 필터 사용 가능 판정, 마켓 호환성 판정, 장치 손실 안내입니다. 벡터 렌더러와 브러시 쪽 GPU 사용은 드로잉 카드가 따로 다룹니다.",
        "The limits are clear too. The per-feature budget ladder (steps such as sculpt vertices 8,388,608 down to 524,288) has calculation functions and tests, but no feature reads it yet. What users see today is the device diagnostics in Help, the GPU-filter availability verdict, the marketplace compatibility verdict and the device-loss notice. GPU use by the vector renderer and brushes is covered by the drawing cards.",
      ),
    ],
    keyPoints: [
      t("어댑터가 실제로 있는지부터 묻는다", "Ask whether an adapter really exists"),
      t("브라우저 이름이 아니라 한도로 등급을 매긴다", "Grade by limits, never by browser name"),
      t("GPUDevice 는 하나만 두고 빌려 쓴다", "One GPUDevice, shared through leases"),
      t("기능별 예산 사다리는 구현만, 연결은 아직", "The budget ladder is built but not yet wired"),
    ],
    diagram: {
      id: "webgpu-tier-budget-recovery-diagram",
      kind: "layers",
      title: t("WebGPU 플랫폼 층 한눈에", "The WebGPU platform layer at a glance"),
      caption: t(
        "확인 → 등급 → 소유권 → 복구가 연결돼 있고, 기능별 예산은 아직 연결 전입니다.",
        "Check, grade, ownership and recovery are wired; per-feature budgets are not yet.",
      ),
      alt: t(
        "위에서 아래로 어댑터 실재 검사, 한도 8개 등급 판정, 기능별 예산 사다리, 단일 GPUDevice 소유권, 장치 손실 복구가 쌓여 있습니다. 예산 사다리는 구현과 테스트만 있고 제품 기능에 연결되지 않았다고 따로 표시합니다.",
        "From top to bottom: the real adapter check, the grade from eight limits, the per-feature budget ladder, one owner for the GPUDevice, and device-loss recovery. The budget ladder is marked separately because it is built and tested but not connected to product features.",
      ),
      layers: [
        {
          id: "probe",
          label: t("어댑터 실재 검사", "Real adapter check"),
          sub: t("requestAdapter() · 3초 제한 · UA 읽지 않음", "requestAdapter(), 3 s limit, no UA sniffing"),
          tone: "local",
          chips: ["WebGPU"],
        },
        {
          id: "tier",
          label: t("한도 8개로 등급 판정", "Grade from eight limits"),
          sub: t("full · standard · lite, GPU 한도는 모르면 미달", "full, standard, lite; unknown GPU limit counts as short"),
          tone: "local",
          chips: ["maxBufferSize", "maxTextureDimension2D"],
        },
        {
          id: "budget",
          label: t("기능별 예산 사다리", "Per-feature budget ladder"),
          sub: t("조각 정점 8,388,608 → 524,288 · 구현·테스트만", "sculpt vertices 8,388,608 to 524,288; built and tested only"),
          tone: "warn",
        },
        {
          id: "fabric",
          label: t("단일 GPUDevice 소유권", "One owner for the GPUDevice"),
          sub: t("lease 참조 카운트 · device epoch · 손실은 epoch당 1회 통지", "lease ref-counts, device epoch, one loss notice per epoch"),
          tone: "local",
        },
        {
          id: "recovery",
          label: t("장치 손실 복구", "Device-loss recovery"),
          sub: t("250ms부터 두 배씩 최대 6번 · 3번 끊기면 세션 포기", "250 ms doubling, up to 6 tries; third loss ends GPU use"),
          tone: "local",
          chips: ["GPUDevice.lost"],
        },
      ],
      brackets: [{ label: t("제품에 연결 안 됨", "Not wired to the product"), layerIds: ["budget"] }],
    },
    usage: [
      {
        feature: t("도움말 · 기기 진단", "Help · device diagnostics"),
        role: t(
          "어댑터 한도를 실측해 등급과 측정 여부를 보여 줍니다. 측정하지 못한 값은 값이 아니라 '확인 못 함'으로 적습니다.",
          "Measures adapter limits and shows the tier; anything that could not be measured is reported as unmeasured, never guessed.",
        ),
        paths: [
          "apps/web/src/domains/creator/StudioHelpCenterDialog.tsx",
          "apps/web/src/domains/creator/studio-device-diagnostics.ts",
          "apps/web/src/domains/creator/studio-capability-probe.ts",
          "apps/web/src/domains/creator/studio-capability-tier.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("이미지 필터 적용 (GPU 레인 입장)", "Image filters (GPU lane admission)"),
        role: t(
          "navigator.gpu 가 있어도 어댑터가 없으면 GPU 레인을 고르지 않아, 필터를 눌렀는데 픽셀이 안 바뀌는 사고를 막습니다.",
          "A page with navigator.gpu but no adapter never picks the GPU lane, which prevents a filter that changes zero pixels.",
        ),
        paths: ["apps/web/src/domains/creator/render/studio-gpu-filter-lane-admission.ts"],
      },
      {
        feature: t("커뮤니티 마켓 · 실행 환경 호환 판정", "Community market · runtime compatibility"),
        role: t(
          "엔진 사용 가능 여부를 User-Agent 가 아니라 캔버스 컨텍스트와 어댑터 실측으로 판정합니다.",
          "Engine availability comes from canvas-context and adapter probes, not from the User-Agent.",
        ),
        paths: ["apps/web/src/domains/creator/studio-marketplace-runtime-compatibility.ts"],
      },
      {
        feature: t("GPU 장치 공유와 손실 복구", "GPU device sharing and loss recovery"),
        role: t(
          "물리 GPUDevice 하나를 lease 로 나눠 쓰고, 끊기면 다른 엔진으로 몰래 바꾸지 않고 같은 GPU 의 재연결을 시도하며 그림과 마지막 정상 프레임은 보존합니다.",
          "One physical GPUDevice is shared by leases; after a loss the same GPU is retried, never silently swapped for another engine, and the drawing and last good frame are kept.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-gpu-fabric.ts",
          "apps/web/src/domains/creator/studio-device-loss-recovery.ts",
          "apps/web/src/domains/creator/studio-safe-mode-runtime.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("어댑터가 실제로 있는지 한 번만 묻기", "Ask once whether an adapter really exists"),
        language: "ts",
        ...sampleSource([
          ['interface GpuLike { requestAdapter(o?: { powerPreference?: "low-power" | "high-performance" }): Promise<object | null> }'],
          ["let verdict: Promise<boolean> | null = null;"],
          [""],
          ["export function hasGpuAdapter(timeoutMs = 3000): Promise<boolean> {"],
          ["  verdict ??= (async () => {", "세션당 한 번만 묻고 결과를 재사용한다", "ask once per session and reuse the answer"],
          ["    const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu;"],
          ["    if (!gpu) return false;"],
          ["    try {"],
          ["      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));", "드라이버가 매달릴 수 있다", "a driver can hang"],
          ['      return (await Promise.race([gpu.requestAdapter({ powerPreference: "high-performance" }), timeout])) !== null;'],
          ["    } catch {"],
          ["      return false;", "질의 실패는 '없음'과 같게 다룬다", "a failed query is treated as no adapter"],
          ["    }"],
          ["  })();"],
          ["  return verdict;"],
          ["}"],
        ]),
        explain: t(
          "'gpu' in navigator 만으로는 부족합니다. 드라이버가 막혔거나 가상 머신이면 어댑터가 null 로 돌아오기 때문입니다. 실제 코드는 타임아웃 범위(250~10,000ms)와 취소 신호까지 다룹니다.",
          "Checking 'gpu' in navigator is not enough: with a blocked driver or a virtual machine the adapter comes back null. The real code also handles the timeout range (250 to 10,000 ms) and an abort signal.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("한도로 등급 매기기 (두 신호만)", "Grading by limits (two signals only)"),
        language: "ts",
        ...sampleSource([
          ['export type Tier = "full" | "standard" | "lite" | "unsupported";'],
          [""],
          ["const NEED = [", "[등급, maxBufferSize(MiB), 최소 코어 수]", "[tier, maxBufferSize in MiB, minimum cores]"],
          ['  ["full", 1024, 8],'],
          ['  ["standard", 384, 4],'],
          ['  ["lite", 256, 0],'],
          ["] as const;"],
          [""],
          ["export function tierOf(maxBufferMiB: number | null, cores: number | null): Tier {"],
          ['  if (maxBufferMiB === null) return "unsupported";', "GPU 한도는 모르면 미달 (fail-closed)", "an unknown GPU limit counts as short (fail-closed)"],
          ["  for (const [tier, minBuffer, minCores] of NEED) {"],
          ["    if (maxBufferMiB >= minBuffer && (cores === null || cores >= minCores)) return tier;", "코어 수는 모르면 통과 (fail-open)", "unknown core count passes (fail-open)"],
          ["  }"],
          ['  return "unsupported";'],
          ["}"],
        ]),
        explain: t(
          "실제 판정은 maxBufferSize 말고도 저장 버퍼 바인딩·2D 텍스처 크기·워크그룹 한도 등 GPU 한도 8개와 기기 메모리·코어 수를 함께 봅니다. 여기서는 비대칭 규칙(모르는 GPU 한도는 미달, 모르는 호스트 신호는 통과)만 남겼습니다.",
          "The real verdict also weighs storage-buffer binding, 2D texture size, workgroup limits and device memory, eight GPU limits in all plus host signals. This sample keeps only the asymmetric rule: unknown GPU limit fails, unknown host signal passes.",
        ),
        source: "apps/web/src/domains/creator/studio-capability-tier.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · WebGPU API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API",
        kind: "docs",
        note: t("WebGPU 의 개념과 사용 흐름", "Concepts and usage flow of WebGPU"),
      },
      {
        title: "W3C · WebGPU",
        url: "https://www.w3.org/TR/webgpu/",
        kind: "spec",
        note: t("기본 한도(default limits)의 정의", "Definition of the default limits"),
      },
      {
        title: "MDN · GPU.requestAdapter()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter",
        kind: "docs",
      },
      {
        title: "MDN · GPUDevice.lost",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost",
        kind: "docs",
        note: t("장치 손실을 감지하는 표준 방법", "The standard way to detect a device loss"),
      },
      {
        title: "Can I use · WebGPU",
        url: "https://caniuse.com/webgpu",
        kind: "guide",
        note: t("브라우저별 지원 현황(발표 직전에 다시 확인)", "Per-browser support (recheck just before presenting)"),
      },
    ],
    chapterIds: ["browser-local-compute", "performance"],
    talk: {
      pitch: t(
        "GPU 가속은 빠르지만 기기마다 달라서, 이름이 아니라 기기가 보고한 한도로 등급을 매깁니다. 어댑터가 실제로 있는지부터 확인하고, 모르는 GPU 한도는 보수적으로, 숨겨진 CPU 정보는 관대하게 봅니다. GPU 장치는 하나만 두고 나눠 쓰며, 끊기면 다른 엔진으로 몰래 바꾸지 않고 같은 GPU 로 재연결을 시도합니다. 기능별 한도 사다리는 계산까지 만들었지만 아직 기능에 연결하지 않았습니다.",
        "GPU acceleration is fast but differs by device, so grades come from the limits a device reports, not from its name. The check starts with whether an adapter really exists, treats unknown GPU limits conservatively and hidden CPU facts generously. One GPU device is shared, and after a loss the same GPU is retried rather than silently swapping engines. The per-feature limit ladder is calculated and tested, but no feature is connected to it yet.",
      ),
      analogy: t(
        "식당이 손님의 옷차림이 아니라 예약 인원과 테이블 크기에 맞춰 자리를 내주는 것과 같습니다. 접시(GPU 메모리)가 몇 개인지는 알려 주지 않으니 정해 둔 비율만 쓰기로 약속해 둡니다.",
        "It is like a restaurant seating guests by party size and table size, not by how they dress. Since nobody says how many plates (GPU memory) exist, it promises to use only an agreed share.",
      ),
      questions: [
        {
          question: t("WebGPU 를 지원하지 않는 브라우저는요?", "What about browsers without WebGPU?"),
          answer: t(
            "navigator.gpu 가 없거나 어댑터를 못 얻으면 등급이 '미지원'이 되고, 해당 기능은 GPU 레인을 고르지 않습니다. 작업 도중 엔진을 몰래 바꾸지 않고 시작 전에 정합니다.",
            "Without navigator.gpu or an adapter the tier is unsupported and the feature does not pick the GPU lane. The choice is made before work starts, never switched silently mid-task.",
          ),
        },
        {
          question: t("왜 User-Agent 로 판단하지 않나요?", "Why not decide from the User-Agent?"),
          answer: t(
            "같은 한도를 보고하는 기기는 어떤 브라우저에서 열어도 같은 등급을 받게 하려는 설계입니다. 새 브라우저가 나올 때마다 목록을 고칠 필요도 없습니다.",
            "Devices that report the same limits should get the same tier in any browser, and there is no list to update for each new browser.",
          ),
        },
        {
          question: t("GPU 가 끊기면 작업이 사라지나요?", "Is work lost when the GPU drops out?"),
          answer: t(
            "그림과 마지막 정상 프레임은 보존하고 같은 GPU 의 재연결을 시도합니다. 세 번 끊기면 이번 세션에서는 GPU 렌더러를 쓰지 못하고, 다른 엔진은 사용자가 직접 선택해야 합니다.",
            "The drawing and the last good frame are kept while the same GPU is retried. After three losses the GPU renderer is off for the session, and any other engine must be chosen by the user.",
          ),
        },
      ],
      pitfall: t(
        "기능별 예산 사다리(조각 정점 수 등)는 계산 함수와 테스트까지만 있고 실행 경로에서 읽는 곳이 없습니다. '기기에 맞춰 3D 해상도를 자동으로 낮춘다'고 말하면 과장입니다. 브라우저별 WebGPU 지원 현황은 코드로 확인되지 않으니 외부 표를 인용하세요.",
        "The per-feature budget ladder (sculpt vertices and so on) has functions and tests only, and nothing on the execution path reads it. Claiming that 3D resolution drops automatically to fit the device would be an overstatement. Per-browser WebGPU support cannot be verified from code, so cite an external table.",
      ),
    },
    technologies: ["WebGPU", "GPUDevice.lost", "WGSL", "Device tier"],
    facts: [
      {
        value: "3,000 ms",
        label: t("어댑터 질의 기본 제한 시간(허용 250~10,000ms)", "Default adapter-query timeout (allowed 250 to 10,000 ms)"),
        source: "apps/web/src/domains/creator/studio-capability-probe.ts",
      },
      {
        value: "1 GiB · 384 MiB · 256 MiB",
        label: t("full · standard · lite 가 요구하는 maxBufferSize", "maxBufferSize required by full, standard and lite"),
        source: "apps/web/src/domains/creator/studio-capability-tier.ts",
      },
      {
        value: "3회",
        label: t("장치 손실이 이 횟수에 닿으면 이번 세션 GPU 포기", "Losses after which GPU use ends for the session"),
        source: "apps/web/src/domains/creator/studio-device-loss-recovery.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
];
