import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 웹 플랫폼. 브라우저가 기본으로 주는 능력과 그 안전장치. */
export const GLOSSARY_MORE_WEB: readonly GlossaryTerm[] = [
  {
    id: "cross-origin-isolation",
    category: "web",
    term: t("교차 출처 격리 (COOP · COEP)", "Cross-origin isolation (COOP · COEP)"),
    definition: t(
      "서버가 헤더 두 개로 ‘이 문서는 바깥과 섞이지 않는다’고 약속하면, 브라우저가 공유 메모리 같은 강한 기능을 풀어 주는 상태입니다.",
      "A state where two server headers promise a document will not mix with outsiders, so the browser unlocks strong features such as shared memory.",
    ),
    analogy: t(
      "출입 검사가 두 번 있는 클린룸과 같습니다. 바깥과 연결된 창문을 닫고(COOP) 들여오는 물건도 검사해야(COEP) 방 안에서 공구를 같이 쓸 수 있습니다.",
      "Like a clean room with two checkpoints: shut the window to the outside (COOP) and inspect everything brought in (COEP), and only then may tools be shared inside.",
    ),
    inToonstudio: t(
      "/studio 문서에만 COOP same-origin + COEP credentialless 를 겁니다(config/http-response-headers.json). 공개 페이지에서 앱 안 링크로 들어오면 StudioCrossOriginIsolationGate 가 새로고침을 한 번만 해 격리를 켭니다. 사이트 전체에 걸면 팝업 로그인·결제가 깨질 수 있어 경계를 스튜디오로 좁혔습니다.",
      "COOP same-origin and COEP credentialless are applied to the /studio document only (config/http-response-headers.json). Entering from a public page through an in-app link, StudioCrossOriginIsolationGate reloads exactly once to switch isolation on. Site-wide isolation could break popup sign-in and payments, so the boundary stays at the studio.",
    ),
    chapters: ["nextgen-web-experiments", "worker-architecture"],
    atlasIds: ["cross-origin-isolation-studio-gate"],
  },
  {
    id: "shared-array-buffer",
    category: "web",
    term: t("SharedArrayBuffer · Atomics", "SharedArrayBuffer · Atomics"),
    definition: t(
      "여러 Worker 가 복사 없이 같은 메모리를 함께 읽고 쓰게 하는 객체(SharedArrayBuffer)와, 동시에 만져도 깨지지 않게 하는 안전 연산(Atomics)입니다.",
      "An object that lets several Workers read and write the same memory without copying (SharedArrayBuffer), plus safe operations that keep concurrent access from corrupting it (Atomics).",
    ),
    analogy: t(
      "우편으로 사본을 주고받는 대신 모두가 같이 보는 화이트보드 한 장을 두는 것과 같습니다. 동시에 쓰면 글씨가 엉키니 ‘한 번에 한 명’ 규칙(Atomics)이 필요합니다.",
      "Like one shared whiteboard instead of mailing copies back and forth. Writing at the same moment would tangle the ink, so you need a one-at-a-time rule (Atomics).",
    ),
    inToonstudio: t(
      "격리가 켜져 공유 메모리가 있으면 조각(스컬프트) 메시 한도를 높게 쓰고, 없으면 STUDIO_SCULPT_NO_SHARED_MEMORY_MAX_VERTICES = 2,097,152 정점으로 낮춥니다(studio-capability-budgets.ts). Atomics 로 펜 입력을 주고받는 링 버퍼(studio-shared-pointer-ring-buffer.ts)는 구현·테스트가 있지만 제품 화면에서 부르는 곳은 코드에서 찾지 못했습니다.",
      "With isolation on, shared memory lets the sculpt mesh budget rise; without it the limit drops to STUDIO_SCULPT_NO_SHARED_MEMORY_MAX_VERTICES = 2,097,152 vertices (studio-capability-budgets.ts). A ring buffer that passes pen input through Atomics (studio-shared-pointer-ring-buffer.ts) is implemented and tested, but no product call site was found in the code.",
    ),
    chapters: ["worker-architecture", "wasm-fixed-simd"],
    atlasIds: ["cross-origin-isolation-studio-gate", "implemented-not-wired-modules"],
  },
  {
    id: "web-locks",
    category: "web",
    term: t("Web Locks API", "Web Locks API"),
    definition: t(
      "여러 탭·Worker 중 ‘이 일을 맡을 사람은 하나뿐’이 되도록 브라우저가 대신 번호표를 관리해 주는 잠금 장치입니다.",
      "A browser-managed lock that makes sure only one tab or Worker holds a given job at a time, handing out the turns for you.",
    ),
    analogy: t(
      "공용 회의실 예약판과 같습니다. 이미 쓰는 사람이 있으면 기다리거나 포기하고, 그 사람이 나가면 다음 사람이 자동으로 들어갑니다.",
      "Like a shared meeting-room booking board: if someone is inside you wait or give up, and when they leave the next person steps in automatically.",
    ),
    inToonstudio: t(
      "같은 작품을 두 탭이 동시에 저장하면 서로 덮어쓰므로 먼저 연 탭만 리더가 됩니다. studio-autosave-document-leader.ts 는 exclusive 잠금(ifAvailable)으로 리더를 정하고, 나머지 탭은 대기열에 서서 리더가 닫히면 문서를 이어받습니다. AI 무료 한도 계산도 ‘toonstudio:user-ai:runtime-budget’ 잠금으로 탭 간 중복 차감을 막습니다.",
      "Two tabs saving one work would overwrite each other, so only the tab opened first becomes the leader. studio-autosave-document-leader.ts picks it with an exclusive lock (ifAvailable); other tabs queue and inherit the document when the leader closes. The free-AI budget uses the ‘toonstudio:user-ai:runtime-budget’ lock to stop double charging across tabs.",
    ),
    chapters: ["pwa-continuity", "browser-local-first"],
    atlasIds: ["web-locks-broadcastchannel-single-author"],
  },
  {
    id: "broadcast-channel",
    category: "web",
    term: t("BroadcastChannel", "BroadcastChannel"),
    definition: t(
      "같은 사이트의 탭·창·Worker 끼리 서버 없이 메시지를 주고받는 방송 채널입니다.",
      "A broadcast channel through which tabs, windows and Workers of one site exchange messages without any server.",
    ),
    analogy: t(
      "한 건물 안의 안내방송과 같습니다. 채널 이름(방송실)을 아는 모든 층이 듣지만 건물 밖으로는 새지 않습니다.",
      "Like a public-address system inside one building: every floor that knows the channel name hears it, and nothing leaks outside.",
    ),
    inToonstudio: t(
      "탭 사이 ‘알림’ 용도입니다. studio-document-window-coordination.ts 는 15초 하트비트(HEARTBEAT_MS)로 창이 살아 있음을 알리고, studio-workspace-sqlite-runtime.ts 는 작업공간 DB 가 바뀌었다는 무효화 신호를 보냅니다. 메시지는 ‘바뀌었다’는 알림이며 데이터의 원본은 SQLite·OPFS 쪽입니다.",
      "Used for notifications between tabs. studio-document-window-coordination.ts announces that a window is alive with a 15-second heartbeat (HEARTBEAT_MS), and studio-workspace-sqlite-runtime.ts broadcasts that the workspace database changed. A message only says ‘something changed’; the source of truth stays in SQLite and OPFS.",
    ),
    chapters: ["browser-local-first", "pwa-continuity"],
    atlasIds: ["web-locks-broadcastchannel-single-author"],
  },
  {
    id: "webcodecs",
    category: "web",
    term: t("WebCodecs", "WebCodecs"),
    definition: t(
      "브라우저에 들어 있는 영상·이미지 코덱(압축·해제 장치)을 코드가 직접 불러 쓰는 낮은 층의 API입니다.",
      "A low-level API that lets code call the browser's own video and image codecs (compressors and decompressors) directly.",
    ),
    analogy: t(
      "완성된 도시락 대신 주방의 불과 도마를 직접 빌려 쓰는 것과 같습니다. 자유롭지만 순서와 안전은 내가 챙겨야 합니다.",
      "Like borrowing the kitchen's stove and cutting board instead of ordering a finished lunch box: more freedom, but sequencing and safety are on you.",
    ),
    inToonstudio: t(
      "영상 내보내기와 움직이는 이미지 가져오기에 씁니다. studio-webcodecs-capability.ts 는 VideoEncoder.isConfigSupported() 로 ‘이 설정을 실제로 인코딩할 수 있는지’ 먼저 묻고, 하드웨어 가속 코덱을 우선하며 모두 소프트웨어면 VP9 → VP8 → AV1 순으로 고릅니다(AV1 은 느린 경우가 많아서). 고른 방식이 안 되면 몰래 다른 방식으로 바꾸지 않고 ‘불가’를 알립니다.",
      "Used for video export and for importing animated images. studio-webcodecs-capability.ts first asks VideoEncoder.isConfigSupported() whether a setting can really be encoded, prefers hardware-accelerated codecs, and falls back VP9 → VP8 → AV1 when everything is software (AV1 is often slow). If the chosen pipeline is unavailable it reports so instead of silently switching.",
    ),
    chapters: ["performance", "nextgen-web-experiments"],
    atlasIds: ["webcodecs-selected-pipeline"],
  },
  {
    id: "compression-streams",
    category: "web",
    term: t("Compression Streams", "Compression Streams"),
    definition: t(
      "브라우저가 기본으로 주는 압축·해제 스트림(gzip·deflate)입니다. 라이브러리 없이 데이터를 줄이고 풀 수 있습니다.",
      "Built-in browser streams for compressing and decompressing (gzip, deflate), so data can be shrunk and expanded without a library.",
    ),
    analogy: t(
      "이삿짐에 압축팩을 쓰는 것과 같습니다. 부피를 줄여 담고 받는 쪽에서 다시 부풀립니다. 단, 열어 보니 방 하나를 채우는 ‘압축 폭탄’은 막아야 합니다.",
      "Like vacuum bags for moving: squeeze things small, puff them back up at the other end. Just guard against a ‘zip bomb’ that swells to fill a whole room.",
    ),
    inToonstudio: t(
      "ZIP 패키지를 읽을 때 DecompressionStream(‘deflate-raw’)로 항목을 풀고(studio-zip-reader.ts, packages/studio-format-gateway/src/bounded-zip.ts), PNG 를 만들 때 CompressionStream(‘deflate’)을 씁니다(studio-bg3d-streaming-png.ts). bounded-zip 은 파일 520,000,000B·항목 2,048개·압축비 100배 같은 상한을 두어 압축 폭탄을 막습니다.",
      "ZIP packages are read with DecompressionStream(‘deflate-raw’) (studio-zip-reader.ts, packages/studio-format-gateway/src/bounded-zip.ts) and PNGs are produced with CompressionStream(‘deflate’) (studio-bg3d-streaming-png.ts). bounded-zip enforces limits such as 520,000,000 bytes per archive, 2,048 entries and a 100x compression ratio to stop zip bombs.",
    ),
    chapters: ["storage", "quality"],
    atlasIds: ["compression-streams-zip-bomb-guard"],
  },
  {
    id: "wasm-simd",
    category: "web",
    term: t("WASM SIMD", "WASM SIMD"),
    definition: t(
      "CPU 명령 한 번에 숫자 여러 개를 동시에 계산하는 SIMD 를 WASM 에서도 쓰게 한 기능입니다. 같은 계산을 대량으로 반복할 때 유리합니다.",
      "SIMD lets one CPU instruction compute several numbers at once, and WASM can use it too. It helps when the same calculation repeats on large batches.",
    ),
    analogy: t(
      "계산대 한 줄이 아니라 네 줄을 동시에 여는 마트와 같습니다. 손님(숫자)이 많고 하는 일이 같을 때 줄이 빨리 줄어듭니다.",
      "Like a supermarket that opens four checkout lanes at once: when many customers (numbers) need the same service, the queue shrinks fast.",
    ),
    inToonstudio: t(
      "저장소에 커밋된 자체 .wasm 8개 중 6개 레인(Vello 2·Hokusai·먹물 커널은 +simd128, ink-mesh·ink-modeler 는 -msimd128)을 SIMD128 로 빌드합니다. 고정 SIMD128 은 널리 지원돼 ‘되는 브라우저/안 되는 브라우저’용 이중 빌드 없이 바이너리 하나로 배포하고, 산출물은 레인별 INTEGRITY.sha256 으로 고정합니다.",
      "Six of the eight own .wasm files committed to the repository are built with SIMD128 (Vello's two lanes, Hokusai and the sumi kernel with +simd128; ink-mesh and ink-modeler with -msimd128). Fixed SIMD128 is widely supported, so one binary ships without a dual build, and each artifact is pinned by its lane's INTEGRITY.sha256.",
    ),
    chapters: ["wasm-fixed-simd", "brush-engine"],
    atlasIds: ["wasm-self-built-fixed-simd"],
  },
  {
    id: "wasm-memory64",
    category: "web",
    term: t("WASM Memory64", "WASM Memory64"),
    definition: t(
      "WASM 이 4GiB 보다 큰 메모리 주소를 다룰 수 있게 하는 64비트 주소 방식입니다.",
      "A 64-bit addressing mode that lets WASM address more than 4 GiB of memory.",
    ),
    analogy: t(
      "아파트 호수를 세 자리에서 여섯 자리로 늘리는 것과 같습니다. 더 큰 단지를 지을 수 있지만, 모든 우편배달부(브라우저)가 새 주소 체계를 아는 것은 아닙니다.",
      "Like extending apartment numbers from three digits to six: bigger complexes become possible, but not every mail carrier (browser) knows the new scheme yet.",
    ),
    inToonstudio: t(
      "큰 ZIP 항목(1MiB 이상)의 CRC32 검산에서만 실제로 씁니다(studio-wasm-crc32-kernel.ts, STUDIO_WASM_CRC32_MINIMUM_INPUT_BYTES). studio-wasm64-memory-governor.ts 가 먼저 브라우저에서 memory64 모듈이 만들어지는지 탐지하며, 웹의 메모리 주소 한계를 16GiB 로 코드에 적어 둡니다. ‘가능하다’와 ‘모든 곳에서 쓴다’를 구분합니다.",
      "Actually used only to verify CRC32 of large ZIP entries (1 MiB and up; studio-wasm-crc32-kernel.ts, STUDIO_WASM_CRC32_MINIMUM_INPUT_BYTES). studio-wasm64-memory-governor.ts first probes whether the browser can create a memory64 module, and records the web's 16 GiB address limit in code. ‘Possible’ and ‘used everywhere’ are kept apart.",
    ),
    chapters: ["wasm-fixed-simd", "worker-architecture"],
    atlasIds: ["wasm-memory64-zip-crc"],
  },
  {
    id: "csp",
    category: "web",
    term: t("CSP (콘텐츠 보안 정책)", "CSP (Content Security Policy)"),
    definition: t(
      "‘이 페이지는 어디서 온 스크립트·이미지·연결만 허용한다’는 허용 목록을 헤더로 선언해, 브라우저가 대신 지키게 하는 규칙입니다.",
      "An allowlist, declared in a header, of where scripts, images and connections may come from, enforced by the browser itself.",
    ),
    analogy: t(
      "클럽 입구의 초대 명단과 같습니다. 명단에 없는 주소는 코드가 아무리 들어가려 해도 경비(브라우저)가 막습니다.",
      "Like the guest list at a club door: an address that is not on the list is turned away by the bouncer (the browser) no matter how the code tries to get in.",
    ),
    inToonstudio: t(
      "config/http-response-headers.json 의 CSP 는 script-src 를 자기 출처·해시·일부 로그인/결제 주소로 좁히고, WASM 컴파일만 ‘wasm-unsafe-eval’ 로 허용합니다(eval 은 허용하지 않음). connect-src 에는 허용 주소 26개(‘self’·blob: 포함)만 있어 서버를 거치지 않는 외부 API 호출 범위를 이 목록이 지킵니다. scripts/verify-static-csp.mjs 가 빌드 산출물을 검사합니다.",
      "The CSP in config/http-response-headers.json narrows script-src to the own origin, a hash and a few sign-in/payment hosts, and allows only WASM compilation through ‘wasm-unsafe-eval’ (eval stays blocked). connect-src lists just 26 entries (including ‘self’ and blob:), so this list enforces which external APIs the browser may call directly. scripts/verify-static-csp.mjs checks the build output.",
    ),
    chapters: ["open-api-data", "infrastructure"],
    atlasIds: ["browser-direct-calls-under-csp", "response-header-contract-csp"],
  },
  {
    id: "permissions-policy",
    category: "web",
    term: t("Permissions-Policy (기능 정책)", "Permissions-Policy"),
    definition: t(
      "카메라·마이크·위치 같은 민감한 기능을 이 사이트가 쓸 수 있는지 헤더로 미리 정해 두는 규칙입니다.",
      "A header-based rule that decides in advance whether this site may use sensitive features such as camera, microphone or location.",
    ),
    analogy: t(
      "집 분전반의 차단기와 같습니다. 방마다 콘센트(기능)가 있어도 차단기를 내려 두면 전기가 들어오지 않습니다.",
      "Like the breaker panel at home: a room may have an outlet (feature), but with the breaker off no power arrives.",
    ),
    inToonstudio: t(
      "운영 헤더는 camera=(self), microphone=(self), geolocation=(), cross-origin-isolated=(self) 입니다. 그래서 날씨 위치 기능은 운영에서 동작하지 않습니다. 가상 스튜디오는 참여만으로 카메라·마이크를 요청하지 않고, 사용자가 동의 버튼을 눌러야 요청합니다(SpaceProximityConsent).",
      "The production header is camera=(self), microphone=(self), geolocation=(), cross-origin-isolated=(self), so the weather-by-location feature does not work in production. The virtual studio never asks for camera or microphone just because you joined; the user must press a consent button first (SpaceProximityConsent).",
    ),
    chapters: ["webrtc-media-authority", "infrastructure"],
    atlasIds: ["media-permissions-policy", "response-header-contract-csp"],
  },
  {
    id: "speculation-rules",
    category: "web",
    term: t("Speculation Rules (미리 렌더링)", "Speculation Rules (prerendering)"),
    definition: t(
      "사용자가 곧 갈 만한 페이지를 브라우저가 미리 받아 두거나 미리 그려 두게 하는 힌트 규칙입니다.",
      "Hint rules that tell the browser to fetch or even render a page the user is likely to open next.",
    ),
    analogy: t(
      "단골이 앉기도 전에 물과 수저를 미리 놓아 두는 식당과 같습니다. 안 오면 낭비지만 오면 바로 먹을 수 있습니다.",
      "Like a restaurant that sets water and cutlery before a regular sits down: wasted if they never come, instant if they do.",
    ),
    inToonstudio: t(
      "shared/lib/speculation-rules.ts 가 스튜디오 진입처럼 ‘문서 이동’으로 넘어가는 목적지만 prerender(eagerness moderate, 마우스를 올린 동안)로 알립니다. 공개 페이지와 스튜디오는 COOP/COEP 경계 때문에 문서 이동으로 오가기 때문입니다. Chromium 전용이며, 운영 CSP 와의 궁합과 실제 효과는 브라우저에서 검증하지 못했습니다(미확인).",
      "shared/lib/speculation-rules.ts prerenders only destinations reached by document navigation, such as entering the studio (eagerness moderate, i.e. while the pointer hovers), because public pages and the studio swap documents across the COOP/COEP boundary. Chromium only; how it behaves under the production CSP and its real benefit were not verified in a browser (unconfirmed).",
    ),
    chapters: ["nextgen-web-experiments"],
    atlasIds: ["speculation-rules-prerender"],
  },
  {
    id: "feature-detection",
    category: "web",
    term: t("기능 감지 · 점진적 향상", "Feature detection · progressive enhancement"),
    definition: t(
      "‘이 브라우저에 이 기능이 있나?’를 먼저 물어보고, 있으면 쓰고 없으면 기본 동작으로 넘어가는 설계 방식입니다.",
      "A design habit of asking ‘does this browser have the feature?’ first: use it if present, fall back to the basic path if not.",
    ),
    analogy: t(
      "새 가게에 가기 전에 영업 중인지 전화로 확인하는 것과 같습니다. 닫았으면 헛걸음 대신 다른 길로 갑니다.",
      "Like phoning a new shop to check it is open before going: if it is closed you take another route instead of a wasted trip.",
    ),
    inToonstudio: t(
      "shared/lib/nextgen-web-capabilities.ts 한 곳에 차세대 API 27개(Compute Pressure·EyeDropper·View Transitions·WebXR·Navigation API 등)의 감지를 모았습니다. 감지는 예외를 던지지 않고 API 가 없거나 막히면 그냥 ‘미지원’이며, 실험 기능은 미지원 환경에서 조용히 없어도 됩니다. ‘감지됨’은 ‘제품에서 쓰임’과 다른 말입니다.",
      "shared/lib/nextgen-web-capabilities.ts gathers detection for 27 next-generation APIs (Compute Pressure, EyeDropper, View Transitions, WebXR, Navigation API and more) in one place. Detection never throws: a missing or blocked API is simply ‘unsupported’, and experimental features may quietly be absent there. ‘Detected’ does not mean ‘used in the product’.",
    ),
    chapters: ["nextgen-web-experiments"],
    atlasIds: ["capability-detection-registry-27"],
  },
  {
    id: "sqlite-wasm",
    category: "web",
    term: t("SQLite WASM", "SQLite WASM"),
    definition: t(
      "서버 없이 브라우저 안에서 돌아가는 SQLite 데이터베이스입니다. 표 형태의 데이터를 SQL 로 저장하고 검색합니다.",
      "A SQLite database that runs inside the browser with no server, storing and querying tabular data with SQL.",
    ),
    analogy: t(
      "물건을 한 더미로 쌓지 않고 칸과 라벨로 정리한 서류 캐비닛과 같습니다. 칸(테이블)과 라벨(인덱스) 덕분에 필요한 서류를 빨리 찾습니다.",
      "Like a filing cabinet with drawers and labels instead of one heap: drawers (tables) and labels (indexes) let you find a paper fast.",
    ),
    inToonstudio: t(
      "@sqlite.org/sqlite-wasm 3.53.0-build1 을 전용 Worker 안에서 OPFS(opfs-sahpool) 위에 올려, 설정·카탈로그·저장 의도 같은 표 데이터를 SQL 로 보관합니다(studio-local-database.ts, studio-local-database-worker-sqlite-loader.ts). 쓰는 창구를 Worker 하나로 모아 여러 탭이 같은 파일을 동시에 만지지 않게 합니다.",
      "@sqlite.org/sqlite-wasm 3.53.0-build1 runs in a dedicated Worker on top of OPFS (opfs-sahpool), keeping tabular data such as settings, catalogs and save intents in SQL (studio-local-database.ts, studio-local-database-worker-sqlite-loader.ts). One Worker owns the write path so several tabs never touch the same file at once.",
    ),
    chapters: ["storage", "browser-local-first"],
    atlasIds: ["sqlite-wasm-opfs-sah-pool"],
  },
  {
    id: "indexeddb",
    category: "web",
    term: t("IndexedDB", "IndexedDB"),
    definition: t(
      "브라우저 안에 쌓는 키-값 형태의 비동기 데이터베이스입니다. 큰 객체도 저장할 수 있고 OPFS 보다 오래된 표준입니다.",
      "An asynchronous key-value database inside the browser that can hold large objects. It is an older standard than OPFS.",
    ),
    analogy: t(
      "번호표가 붙은 사물함 벽과 같습니다. 번호(키)만 알면 안의 짐(객체)을 꺼내고, 칸 안에는 큰 짐도 들어갑니다. 파일 서랍(OPFS)과는 쓰임이 다릅니다.",
      "Like a wall of numbered lockers: know the number (key) and you get the luggage (object), big pieces included. Different from a file drawer (OPFS).",
    ),
    inToonstudio: t(
      "shared/lib/idb-kv.ts(DB 이름 toonstudio-kv)가 localStorage 에 쌓이던 원장·채팅·발행 이력 같은 큰 스냅샷을 옮겨 담는 가장 작은 래퍼입니다. 프라이버시 모드·쿼터 차단처럼 못 쓰는 환경에서는 예외 대신 null/false 를 돌려 호출자가 대체 경로를 고릅니다. 파일 덩어리와 SQL 데이터는 OPFS·SQLite WASM 쪽입니다.",
      "shared/lib/idb-kv.ts (database name toonstudio-kv) is the smallest wrapper that moves large snapshots such as ledgers, chats and publish history out of localStorage. Where IndexedDB is unavailable (private mode, blocked quota) it returns null/false instead of throwing, so callers choose a fallback. File blobs and SQL data live in OPFS and SQLite WASM.",
    ),
    chapters: ["storage", "browser-local-first"],
    atlasIds: ["verified-localstorage-to-idb-migration"],
  },
  {
    id: "cache-storage",
    category: "web",
    term: t("Cache Storage (런타임 캐시 버킷)", "Cache Storage (runtime cache buckets)"),
    definition: t(
      "서비스 워커가 요청과 응답 한 쌍을 이름 붙은 캐시에 넣어 두고 꺼내 쓰는 브라우저 저장소입니다.",
      "A browser store where a Service Worker keeps request/response pairs in named caches and serves them later.",
    ),
    analogy: t(
      "편의점 창고의 종류별 선반과 같습니다. 음료·과자·냉동처럼 선반을 나누고, 선반마다 최대 진열 수를 정해 오래된 것부터 치웁니다.",
      "Like the stockroom shelves of a convenience store: separate shelves for drinks, snacks and frozen goods, each with a maximum count, clearing the oldest first.",
    ),
    inToonstudio: t(
      "서비스 워커(studio-service-worker-policy.ts)가 요청을 종류별로 나눠 immutable 600 · heavy 64 · media 120 · data 80 · cover 300개 상한의 버킷에 담고, 가장 오래된 항목부터 지워 LRU 에 가깝게 유지합니다. 버킷 이름에 계약 버전(현재 5)을 넣어, 응답의 모양이 달라지면 옛 이름의 캐시를 더는 쓰지 않습니다. GET 만 캐시하고 쓰기 요청은 항상 네트워크로 보냅니다.",
      "The Service Worker (studio-service-worker-policy.ts) sorts requests into buckets capped at immutable 600, heavy 64, media 120, data 80 and cover 300 entries, trimming the oldest first to approximate LRU. The contract version (currently 5) is part of the bucket name, so when the shape of a cached response changes, caches under the old name are no longer used. Only GET is cached; writes always go to the network.",
    ),
    chapters: ["pwa-continuity", "pwa-safe-update"],
    atlasIds: ["service-worker-app-shell-policy", "precache-budget-offline-core"],
  },
  {
    id: "web-app-manifest",
    category: "web",
    term: t("웹 앱 매니페스트", "Web app manifest"),
    definition: t(
      "웹앱의 이름·아이콘·시작 주소·표시 방식을 적어 둔 JSON 파일로, 브라우저가 ‘설치’할 때 읽는 신분증입니다.",
      "A JSON file naming the app, its icons, start URL and display mode, which the browser reads when installing it.",
    ),
    analogy: t(
      "명함과 같습니다. 이름과 로고, 연락처(시작 주소)가 적혀 있어 홈 화면에 올릴 때 그대로 옮겨 적습니다.",
      "Like a business card: name, logo and contact (start URL) are printed on it, and the browser copies them onto the home screen.",
    ),
    inToonstudio: t(
      "apps/web/public/manifest.webmanifest — start_url 은 /studio, display 는 standalone(display_override 로 window-controls-overlay 를 먼저 시도)이며 maskable 아이콘이 있습니다. 바로가기(shortcuts)로 ‘새 작품 시작’(/studio/new)·‘2D 스튜디오’(/studio)·‘3D 배경 만들기’(/studio/bg3d) 등을 홈 화면에서 바로 엽니다.",
      "apps/web/public/manifest.webmanifest — start_url is /studio, display is standalone (display_override tries window-controls-overlay first), and maskable icons are included. Shortcuts open ‘Start a new work’ (/studio/new), ‘2D studio’ (/studio) and ‘Make 3D backgrounds’ (/studio/bg3d) straight from the home screen.",
    ),
    chapters: ["pwa-continuity", "pwa-offline-update"],
    atlasIds: ["web-app-manifest-install-identity"],
  },
  {
    id: "view-transitions",
    category: "web",
    term: t("View Transitions (화면 전환 효과)", "View Transitions"),
    definition: t(
      "페이지나 화면이 바뀔 때 브라우저가 이전 모습과 새 모습을 겹쳐 부드럽게 이어 주는 전환 기능입니다.",
      "A browser feature that blends the old and new looks smoothly when a page or screen changes.",
    ),
    analogy: t(
      "영화의 장면 전환(디졸브)과 같습니다. 컷이 뚝 끊기지 않고 앞 장면이 흐려지며 다음 장면이 떠오릅니다.",
      "Like a dissolve between film scenes: the cut does not snap, the old shot fades while the next one rises.",
    ),
    inToonstudio: t(
      "링크가 명시적으로 켠 지점에서만 루트 전환이 일어납니다(app/styles/globals.css: 나갈 때 160ms·들어올 때 200ms 페이드). 동작 줄이기(prefers-reduced-motion: reduce)에서는 애니메이션 없이 즉시 전환합니다. 지원 여부는 기능 감지 레지스트리에서 한 번에 확인하며, 실험 기능이라 미지원 브라우저에서는 조용히 효과가 없는 것이 허용됩니다.",
      "A root transition runs only where a link explicitly opts in (app/styles/globals.css: a 160 ms fade out and a 200 ms fade in). Under prefers-reduced-motion: reduce it switches instantly with no animation. Support is checked once in the capability-detection registry, and because it is experimental the effect may quietly be absent in unsupported browsers.",
    ),
    chapters: ["nextgen-web-experiments"],
    atlasIds: ["view-transitions-modern-css", "capability-detection-registry-27"],
  },
  {
    id: "scheduler-yield",
    category: "web",
    term: t("scheduler.yield() (잠깐 비켜 주기)", "scheduler.yield() (stepping aside)"),
    definition: t(
      "긴 계산 도중에 잠깐 실행을 양보해, 그 사이 들어온 터치·펜 입력을 먼저 처리하게 하는 브라우저 API입니다.",
      "A browser API that briefly hands over execution during a long calculation so pending touch and pen input is handled first.",
    ),
    analogy: t(
      "긴 줄을 서 있다가 급한 손님이 오면 한 걸음 비켜 먼저 계산하게 해 주는 것과 같습니다. 내 일은 조금 늦지만 줄 전체가 멈추지 않습니다.",
      "Like stepping aside in a long queue so an urgent customer can pay first: your own job slips a little, but the whole line never freezes.",
    ),
    inToonstudio: t(
      "ZIP 항목의 CRC32 를 조각으로 나눠 계산할 때 조각 사이마다 양보합니다(studio-crc32-worker-client.ts). scheduler.yield 가 있으면 대기 중인 입력을 먼저 돌리고, 없으면 setTimeout 0 으로 대신해 렌더와 포인터 처리가 끼어들게 합니다. 중단 신호(abort)도 조각 사이에서 확인합니다.",
      "When a ZIP entry's CRC32 is computed in slices, it yields between slices (studio-crc32-worker-client.ts). With scheduler.yield, pending input runs first; without it a setTimeout of 0 stands in so rendering and pointer handling can interleave. An abort signal is also honoured between slices.",
    ),
    chapters: ["performance", "worker-architecture"],
    atlasIds: ["main-thread-yielding"],
  },
  {
    id: "intl-segmenter",
    category: "web",
    term: t("Intl.Segmenter (글자 단위 나누기)", "Intl.Segmenter (splitting text into characters)"),
    definition: t(
      "한글·이모지·결합 문자를 쪼개지 않고 사람이 느끼는 ‘글자 한 개’ 단위(grapheme)로 나누고 세어 주는 브라우저 기능입니다.",
      "A browser feature that splits and counts text in the units people feel as one character (graphemes) without breaking Korean, emoji or combined marks apart.",
    ),
    analogy: t(
      "구슬 목걸이를 셀 때 알이 아니라 ‘꿰어진 한 묶음’ 단위로 세는 것과 같습니다. 이모지 하나가 코드 여러 개여도 한 개로 셉니다.",
      "Like counting a bead necklace by finished clusters, not single beads: an emoji made of several code points still counts as one.",
    ),
    inToonstudio: t(
      "Intl.Segmenter(granularity: grapheme)로 글자 수를 세고(studio-workspaces.ts, studio-virtual-space-entry-preference.ts), 대화 타자기 효과도 이 기능을 씁니다. 지원하지 않는 엔진에서는 코드포인트 단위로 나누되 서로게이트 쌍(이모지 조각)이 깨지지 않게 폴백합니다. 번역문이 말풍선에 들어가는지 볼 때도 같은 글자 나누기를 씁니다.",
      "Intl.Segmenter (granularity: grapheme) counts characters (studio-workspaces.ts, studio-virtual-space-entry-preference.ts), and the dialogue typewriter effect uses it too. Engines without it fall back to code points while keeping surrogate pairs (emoji halves) intact. The check for whether a translation fits a speech bubble relies on the same character splitting.",
    ),
    chapters: ["on-device-translation", "nextgen-web-experiments"],
    atlasIds: ["intl-segmenter-korean-lines"],
  },
];
