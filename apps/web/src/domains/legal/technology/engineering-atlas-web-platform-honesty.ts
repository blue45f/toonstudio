import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** 기술 도감 · web-platform · 정직성 두 장(구현과 적용의 구분, 인앱 WebView 대응). 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. */
export const ENGINEERING_ATLAS_WEB_PLATFORM_HONESTY: readonly EngineeringAtlasEntry[] = [
  {
    id: "implemented-not-wired-modules",
    category: "web-platform",
    name: "Wiring audit",
    title: t("'구현 완료'와 '제품 적용'을 구분하기", "Telling implemented apart from wired into the product"),
    status: "experimental",
    tagline: t(
      "테스트는 통과해도 제품이 호출하지 않는 모듈이 있습니다. 적용이라 말하기 전에 호출처를 봅니다.",
      "Some modules pass tests yet no product code calls them. Check the callers before saying applied.",
    ),
    background: [
      t(
        "소프트웨어에서 구현했다는 말은 두 가지로 읽힙니다. 코드가 있고 테스트도 통과한다는 뜻일 수도, 사용자가 쓰는 화면에서 실제로 불려 동작한다는 뜻일 수도 있습니다. 둘은 다릅니다. 큰 설계를 단계적으로 들여오는 프로젝트에서는 부품을 먼저 만들어 테스트해 두고 연결은 나중에 하는 일이 흔해서, 부품은 있는데 아무도 부르지 않는 상태가 생깁니다.",
        "In software, implemented can mean two things: the code exists and its tests pass, or it is actually called and works on a screen users use. They differ. In a project that brings in a big design step by step, it is common to build and test parts first and wire them later, which leaves parts that exist but that nobody calls.",
      ),
      t(
        "이번 점검에서 이런 상태로 확인된 묶음은 여덟 가지입니다. 하나, 엔진 워커 세션과 SharedArrayBuffer·Atomics 포인터 링 버퍼. 둘, 저지연 포인터 병합 어댑터. 셋, OPFS 샤드 저장 워커와 타일 v2 백엔드. 넷, Memory64 코디네이터와 대형 문서 런타임. 다섯, 와이드 개멋(display-p3) 캔버스 능력 모듈. 여섯, 기능별 GPU 예산 사다리. 일곱, WebCodecs 자동 전환 없음 계획기. 여덟, Intl.Segmenter 어절 말풍선 줄바꿈. 모두 구현과 단위 테스트가 있지만 제품 코드의 호출처를 찾지 못했습니다.",
        "This review found eight groups in that state. One, the engine Worker session and the SharedArrayBuffer and Atomics pointer ring buffer. Two, the low-latency pointer-merge adapter. Three, the OPFS shard storage Worker and tile v2 backend. Four, the Memory64 coordinator and large-document runtime. Five, the wide-gamut (display-p3) canvas capability module. Six, the per-feature GPU budget ladder. Seven, the WebCodecs no-automatic-switch planner. Eight, word-unit balloon wrapping with Intl.Segmenter. All have code and unit tests, but no product caller was found.",
      ),
      t(
        "확인 방법은 단순합니다. 모듈 이름과 대표 함수를 저장소에서 검색해 테스트·하네스·스크립트를 빼고 남는 호출처가 있는지 봅니다. 반대편 사례도 구분합니다. 코드는 연결됐지만 운영 설정이 없는 기능이 있습니다. 예컨대 WebTransport 는 환경에서 옵션으로 이어지는 코드가 없고 서버 쪽 조건도 남아 있어 열 수 없는 상태입니다. 한계: 검색은 정적이라 동적 import 나 문자열을 조합한 호출은 놓칠 수 있어, 미연결 판정은 담당자의 확인을 거쳐야 합니다.",
        "The method is simple: search the repository for the module name and its main function and see whether any caller remains once tests, harnesses and scripts are excluded. The opposite case is told apart too: code that is wired but lacks production configuration. WebTransport, for instance, has no code that turns the environment into the option and still has server-side conditions, so it cannot be opened. Limit: the search is static, so dynamic imports or calls built from strings can be missed, and an unwired verdict needs the owner's confirmation.",
      ),
      t(
        "말하는 법은 이렇습니다. 구현만 있는 것은 설계·검증 완료, 연결 대기라고 부르고 실제로 쓰는 것과 나란히 두지 않습니다. 같은 저장소에서 실제로 쓰이는 경로는 CRC32 워커와 이미지 필터 워커 클라이언트, SQLite 전담 워커, Hokusai 라이브 브러시 워커, 모션 웹툰 내보내기의 WebCodecs 같은 곳입니다.",
        "As for wording, call code that is only implemented designed and verified, awaiting wiring, and never set it beside what is really used. In the same repository the paths in real use include the CRC32 and image-filter Worker clients, the dedicated SQLite Worker, the Hokusai live-brush Worker and the WebCodecs path of motion-webtoon export.",
      ),
    ],
    keyPoints: [
      t("테스트 통과는 제품이 호출한다는 뜻이 아니다", "Passing tests does not mean the product calls it"),
      t("호출처를 검색해 미연결 묶음 8가지를 가렸다", "A caller search sorted out eight unwired groups"),
      t("미연결은 연결 대기로, 실사용과 구분해 말한다", "Say awaiting wiring, apart from what is in use"),
      t("정적 검색이라 동적 호출은 놓칠 수 있다", "A static search can miss dynamic calls"),
    ],
    diagram: {
      id: "implemented-not-wired-modules-diagram",
      kind: "graph",
      title: t("모듈을 상태로 가르는 질문 세 개", "Three questions that sort a module into a status"),
      caption: t(
        "테스트, 제품 호출처, 운영 설정을 차례로 물어 live·configured·experimental 중 하나로 분류합니다.",
        "Ask about tests, product callers and production config in turn to classify a module as live, configured or experimental.",
      ),
      alt: t(
        "모듈을 발견하면 먼저 구현과 테스트가 있는지 묻고, 없으면 문서와 설계만 있는 상태로 둡니다. 있으면 제품 코드에서 부르는 곳이 있는지 물어, 없으면 연결 대기(experimental)로 분류합니다. 호출처가 있으면 운영 설정이 있는지 묻고, 있으면 쓰는 중(live), 없으면 배선만 끝남(configured)입니다.",
        "When a module is found, first ask whether it is implemented with tests; if not, it stays documented and designed only. If it is, ask whether product code calls it; if not, it is classed as awaiting wiring (experimental). With a caller, ask whether production config exists: with it, in use (live); without it, wired only (configured).",
      ),
      nodes: [
        { id: "found", label: t("모듈 발견", "Module found"), tone: "neutral", shape: "pill", at: [0, 0] },
        { id: "tests", label: t("테스트까지 있나?", "Tests exist?"), tone: "neutral", shape: "diamond", at: [1, 0] },
        { id: "caller", label: t("제품 호출처?", "Product caller?"), tone: "neutral", shape: "diamond", at: [2, 0] },
        { id: "config", label: t("운영 설정 있나?", "Prod config?"), tone: "neutral", shape: "diamond", at: [3, 0] },
        { id: "live", label: t("쓰는 중", "In use"), sub: t("live", "live"), tone: "good", at: [4, 0] },
        { id: "doc", label: t("문서·설계만", "Design only"), sub: t("documented", "documented"), tone: "neutral", at: [1, 1] },
        { id: "wait", label: t("연결 대기", "Awaiting wiring"), sub: t("experimental", "experimental"), tone: "warn", at: [2, 1] },
        { id: "wired", label: t("배선만 끝남", "Wired only"), sub: t("configured", "configured"), tone: "warn", at: [3, 1] },
      ],
      edges: [
        { from: "found", to: "tests" },
        { from: "tests", to: "caller", label: t("예", "yes") },
        { from: "caller", to: "config", label: t("예", "yes") },
        { from: "config", to: "live", label: t("예", "yes") },
        { from: "tests", to: "doc", label: t("아니오", "no") },
        { from: "caller", to: "wait", label: t("아니오", "no") },
        { from: "config", to: "wired", label: t("아니오", "no") },
      ],
    },
    usage: [
      {
        feature: t("엔진 워커 · 펜 입력 링 버퍼 (연결 대기)", "Engine Worker and pen-input ring (awaiting wiring)"),
        role: t(
          "createStudioEngineWorkerSession 의 호출처가 테스트와 장애 주입 하네스뿐이고, 설계 문서도 연결을 다음 단계로 적고 있습니다.",
          "createStudioEngineWorkerSession is called only by tests and a fault-injection harness, and the design document lists wiring it as a next step.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-engine-worker-client.ts#createStudioEngineWorkerSession",
          "apps/web/src/domains/creator/studio-shared-pointer-ring-buffer.ts",
          "docs/studio-browser-native-engine-vnext-2026-07-27.md",
        ],
      },
      {
        feature: t("저장 워커 · 타일 v2 · Memory64 (연결 대기)", "Storage Worker, tile v2 and Memory64 (awaiting wiring)"),
        role: t(
          "OPFS 샤드 저장 워커는 new Worker 호출처가 없고, 타일 v2 백엔드와 Memory64 코디네이터·대형 문서 런타임은 테스트와 브라우저 검증 스크립트만 가져다 씁니다.",
          "The OPFS shard storage Worker has no new Worker call, and the tile v2 backend, Memory64 coordinator and large-document runtime are used only by tests and a browser check script.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-storage.worker.ts",
          "apps/web/src/domains/creator/render/studio-engine-tile-storage-opfs-v2-backend.ts",
          "apps/web/src/domains/creator/kernel/Memory64WorkloadCoordinator.ts",
          "apps/web/src/domains/creator/studio-large-document-memory64-runtime.ts",
        ],
      },
      {
        feature: t("입력·색·예산·내보내기·줄바꿈 (연결 대기)", "Input, color, budgets, export and wrapping (awaiting wiring)"),
        role: t(
          "저지연 병합 어댑터, display-p3 능력 모듈, GPU 예산 사다리, WebCodecs 계획기, 어절 말풍선 줄바꿈은 자기 테스트 외 호출처가 없습니다. 실제 입력은 collectStudioStrokePointerBatch, 실제 2D 컨텍스트는 sRGB 입니다.",
          "The low-latency merge adapter, the display-p3 capability module, the GPU budget ladder, the WebCodecs planner and word-unit balloon wrapping have no callers beyond their tests. Real input goes through collectStudioStrokePointerBatch and real 2D contexts are sRGB.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-lowlatency-ingest-adapter.ts",
          "apps/web/src/domains/creator/canvas/studio-pointer-input.ts#collectStudioStrokePointerBatch",
          "apps/web/src/domains/creator/studio-highbit-capability.ts",
          "apps/web/src/domains/creator/studio-capability-budgets.ts",
          "apps/web/src/domains/creator/studio-webcodecs-plan.ts",
          "packages/studio-project-model/src/ir/balloon-text-layout.ts",
        ],
      },
      {
        feature: t("실시간 전송 · 설정 경로 없음 (WebTransport)", "Realtime transport with no config path (WebTransport)"),
        role: t(
          "WebTransport 어댑터와 소켓은 구현돼 있지만 환경 설정에서 엔드포인트 옵션으로 이어지는 코드가 없어 운영에서 켤 수 없습니다.",
          "The WebTransport adapter and socket are built, but no code maps an environment setting to the endpoint option, so it cannot be switched on in production.",
        ),
        paths: [
          "apps/web/src/domains/creator/live/studio-live-socket-connection-factory.ts#applyStudioRealtimePurposeRouting",
          "apps/web/src/domains/creator/studio-realtime-webtransport-adapter.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("비테스트 호출처를 찾는 검색", "A search for non-test callers"),
        language: "bash",
        ...sampleSource(
          [
            ["", "모듈의 대표 함수가 테스트·하네스·기술 자료 밖에서 불리는지 찾는다", "find whether the module's main function is called outside tests, harnesses and tech docs"],
            ["rg -n \"createStudioEngineWorkerSession\" apps packages \\"],
            ["  --glob '*.ts' --glob '*.tsx' \\"],
            ["  --glob '!*.test.*' --glob '!**/domains/legal/technology/**'"],
            [""],
            ["", "정의가 있는 파일 한 줄만 나오면 호출처가 없다 → 연결 대기로 분류한다", "if only the defining file shows up, there is no caller: classify as awaiting wiring"],
            ["", "동적 import 나 문자열 조합 호출은 놓칠 수 있으니 담당자 확인을 거친다", "dynamic imports or calls built from strings can be missed, so ask the owner"],
          ],
          "#",
        ),
        explain: t(
          "이 카드의 판정에 실제로 쓴 방식입니다. 같은 검색을 발표 직전에 다시 돌려 목록이 바뀌지 않았는지 확인하세요.",
          "This is the method actually used for the verdicts here. Run the same search again right before presenting to see that the list has not changed.",
        ),
      },
      {
        kind: "teaching",
        title: t("상태를 가르는 규칙", "The rule that picks a status"),
        language: "ts",
        ...sampleSource([
          ['export type Status = "live" | "configured" | "experimental" | "documented";'],
          [""],
          ["export function classify(module: {"],
          ["  implemented: boolean;"],
          ["  callers: number;"],
          ["  configNeeded: boolean;"],
          ["  configPresent: boolean;"],
          ["}): Status {"],
          ['  if (!module.implemented) return "documented";', "문서·설계만", "design or document only"],
          ['  if (module.callers === 0) return "experimental";', "구현·테스트만, 연결 대기", "code and tests only, awaiting wiring"],
          ['  return module.configNeeded && !module.configPresent ? "configured" : "live";', "배선은 끝났지만 운영 설정이 남음", "wired but production config remains"],
          ["}"],
        ]),
        explain: t(
          "기술 도감의 status 값이 뜻하는 바를 코드로 줄인 것입니다. 구현은 있으나 제품에 연결되지 않은 모듈에 live 를 쓰지 않는다는 규칙이 두 번째 줄에 들어 있습니다.",
          "The meaning of the atlas status values reduced to code. The rule that a module implemented but not wired never gets live sits on the second check.",
        ),
        verify: "types",
      },
    ],
    links: [
      {
        title: "Martin Fowler · Feature Toggles",
        url: "https://martinfowler.com/articles/feature-toggles.html",
        kind: "article",
        note: t("코드는 배포됐지만 꺼져 있는 상태를 다루는 고전적 글", "A classic on code that is shipped but switched off"),
      },
      {
        title: "Knip · Find unused files, dependencies and exports",
        url: "https://knip.dev/",
        kind: "docs",
        note: t("쓰이지 않는 파일·내보내기를 도구로 찾는 방법", "Finding unused files and exports with a tool"),
      },
      {
        title: "ripgrep",
        url: "https://github.com/BurntSushi/ripgrep",
        kind: "repo",
        note: t("호출처 검색에 쓴 도구", "The tool used for the caller search"),
      },
    ],
    chapterIds: ["worker-architecture", "troubleshooting-evidence"],
    talk: {
      pitch: t(
        "구현했다는 말은 두 가지로 읽힙니다. 코드와 테스트가 있다는 뜻과 사용자가 쓰는 화면에서 실제로 불린다는 뜻입니다. 우리는 호출처를 검색해 둘을 가렸고, 테스트까지 끝났지만 아직 아무도 부르지 않는 모듈 묶음 여덟 가지를 연결 대기로 따로 분류했습니다. 발표에서는 이 목록을 적용된 기술과 섞어 말하지 않습니다.",
        "Implemented can mean two things: code and tests exist, or it is actually called on screens users use. We searched for callers to tell them apart and set aside eight groups of modules that are finished and tested but that nobody calls yet, labelled awaiting wiring. In the talk we do not mix this list in with technology that is applied.",
      ),
      analogy: t(
        "완성된 부품 창고와 실제 도로를 달리는 자동차의 차이입니다. 엔진이 창고에 있다고 차가 그 엔진으로 달리는 것은 아닙니다.",
        "It is the difference between a warehouse of finished parts and a car on the road: an engine in the warehouse does not mean the car runs on it.",
      ),
      questions: [
        {
          question: t("그럼 쓸모없는 코드인가요?", "So is it useless code?"),
          answer: t(
            "아닙니다. 설계 문서가 다음 단계로 연결을 예고한 것도 있습니다. 다만 지금 사용자가 체감하는 기능은 아니라는 뜻입니다.",
            "No. Some are announced for wiring in the design document's next step. It only means they are not features users feel today.",
          ),
        },
        {
          question: t("어떻게 확인했나요?", "How did you check?"),
          answer: t(
            "모듈 이름과 대표 함수를 저장소에서 검색해 테스트·하네스·스크립트를 뺀 호출처를 봤습니다. 동적 호출은 놓칠 수 있어 담당자 확인이 필요합니다.",
            "We searched the repository for module names and main functions and looked at callers outside tests, harnesses and scripts. Dynamic calls can be missed, so the owners must confirm.",
          ),
        },
        {
          question: t("발표에서는 뭐라고 말하나요?", "What do you say in the talk?"),
          answer: t(
            "설계·검증 완료, 연결 대기라고 말하고, 실제로 쓰는 경로(CRC32 워커, SQLite 워커, 모션 웹툰 WebCodecs 등)와 구분합니다.",
            "Designed and verified, awaiting wiring, kept apart from paths in real use such as the CRC32 Worker, the SQLite Worker and motion-webtoon WebCodecs.",
          ),
        },
      ],
      pitfall: t(
        "이 목록은 정적 검색 결과입니다. 동적 import 나 문자열 조합 호출은 놓칠 수 있고, 이 카드는 각 모듈을 실행해 보지 않았습니다. 코드는 계속 바뀌므로 발표 직전에 같은 검색을 다시 돌리세요.",
        "This list is the result of a static search. Dynamic imports or calls built from strings can be missed, and no module was run for this card. Code keeps changing, so rerun the same search right before presenting.",
      ),
    },
    technologies: ["SharedArrayBuffer", "OffscreenCanvas", "OPFS", "WebTransport", "Memory64"],
    facts: [
      {
        value: "1,126줄",
        label: t("제품 호출처가 없는 SAB 포인터 링 버퍼 모듈", "SAB pointer ring buffer module with no product caller"),
        source: "apps/web/src/domains/creator/studio-shared-pointer-ring-buffer.ts",
      },
      {
        value: "897줄",
        label: t("제품 호출처가 없는 OPFS 타일 v2 백엔드", "OPFS tile v2 backend with no product caller"),
        source: "apps/web/src/domains/creator/render/studio-engine-tile-storage-opfs-v2-backend.ts",
      },
      {
        value: "882줄",
        label: t("제품 호출처가 없는 Memory64 코디네이터", "Memory64 coordinator with no product caller"),
        source: "apps/web/src/domains/creator/kernel/Memory64WorkloadCoordinator.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "inapp-webview-degrade",
    category: "web-platform",
    name: "In-app WebView",
    title: t("인앱 브라우저에서 막다른 길 만들지 않기", "No dead ends inside in-app browsers"),
    status: "live",
    tagline: t(
      "메신저·SNS 안의 브라우저를 알아보고 팝업 기능을 접으며 밖으로 나가는 길을 안내합니다.",
      "It recognizes browsers inside messengers and social apps, folds popup features and shows the way out.",
    ),
    background: [
      t(
        "코드 주석에 따르면 한국어권 웹툰 트래픽의 대부분은 카카오톡·네이버·인스타그램 같은 앱이 띄운 내장 브라우저(인앱 WebView)로 들어옵니다. 이 환경은 일반 브라우저와 다릅니다. window.open 이 항상 null 이라 새 창을 여는 기능은 조용히 죽고, 주소창과 뒤로 가기가 없어 막다른 화면에서는 앱을 끄는 것 말고 길이 없으며, OPFS·SharedArrayBuffer 같은 저장소·격리 기능은 앱마다 달라 없을 수도 있습니다.",
        "According to a code comment, most Korean-language webtoon traffic arrives in the embedded browsers (in-app WebViews) that apps such as KakaoTalk, Naver and Instagram open. These differ from normal browsers. window.open always returns null so features that open a new window quietly die, there is no address bar or back button so a dead end leaves no way out but quitting the app, and storage and isolation features such as OPFS and SharedArrayBuffer differ per app and may be missing.",
      ),
      t(
        "그래서 이 모듈은 판별만 합니다. UA 에서 앱 서명(kakaotalk, instagram 등)을 찾고, 서명이 없는 임베디드 WebView 는 Android 의 '; wv)' 표지나 iOS 에서 Safari 계열인데 Version/ 이 없는 경우로 가려냅니다. 확신이 없으면 일반 브라우저로 둡니다. 잘못 인앱으로 몰면 멀쩡한 Safari 사용자에게서 팝업 기능을 빼앗기 때문입니다. 판정 결과는 popupCapable=false 와 탈출 방법으로 돌려줍니다.",
        "So this module only identifies. It looks in the UA for an app signature (kakaotalk, instagram and so on), and spots an unsigned embedded WebView by the Android '; wv)' marker or, on iOS, a Safari-family UA without Version/. When unsure it assumes a normal browser, because wrongly treating a plain Safari user as in-app would take popup features away from them. The verdict is returned as popupCapable=false plus an escape method.",
      ),
      t(
        "탈출 방법은 플랫폼마다 다릅니다. Android 에서 카카오톡은 전용 주소(kakaotalk://web/openExternal?url=...)로, 그 밖의 WebView 는 intent:// 주소로 기본 브라우저를 열어 줍니다. iOS 는 앱 안에서 링크로 나갈 방법이 없어 Safari로 열기를 누르라는 안내 문구만 줍니다. 어떤 기능을 접을지는 각 화면이 정하고, 판별 시점에 접기 때문에 사용자가 죽은 버튼을 누르지 않습니다.",
        "The escape differs per platform. On Android, KakaoTalk gets a dedicated address (kakaotalk://web/openExternal?url=...) and other WebViews an intent:// address that opens the default browser. On iOS no link can leave the app, so only a hint to tap Open in Safari is shown. Each screen decides what to fold, and because folding happens at identification time, users never press a dead button.",
      ),
      t(
        "한계: 인앱 판별은 본질적으로 User-Agent 문자열에 기대므로 앱이 UA 를 바꾸면 틀릴 수 있습니다. 하드웨어 등급 판정이 UA 를 읽지 않는 것과 다른 예외 영역입니다. 모바일 앱 셸(apps/mobile)은 원격 웹을 그대로 싣는 얇은 Capacitor 셸이라, 앞서 본 플랫폼 기능이 그 WebView 안에서 어떻게 동작하는지는 코드로 확인되지 않았습니다.",
        "Limits: in-app detection rests on the User-Agent string by nature, so it can be wrong if an app changes its UA. This is the exception to the hardware-tier check, which never reads the UA. The mobile app shell (apps/mobile) is a thin Capacitor shell loading the remote web app as is, so how the platform features above behave inside that WebView was not confirmed from code.",
      ),
    ],
    keyPoints: [
      t("인앱 브라우저는 새 창이 안 열려 판별이 먼저다", "In-app browsers cannot open windows, so identify first"),
      t("확신이 없으면 일반 브라우저로 둔다", "When unsure, assume a normal browser"),
      t("Android 는 탈출 링크, iOS 는 안내 문구", "Android gets an escape link; iOS gets a hint"),
      t("기능은 판별 시점에 접어 죽은 버튼을 없앤다", "Fold features up front so no button is dead"),
    ],
    diagram: {
      id: "inapp-webview-degrade-diagram",
      kind: "graph",
      title: t("인앱 판별에서 기능 축소까지", "From in-app detection to folded features"),
      caption: t(
        "앱 서명이나 WebView 표지가 있을 때만 인앱으로 보고, 의심스러우면 일반 브라우저로 둡니다.",
        "Only an app signature or WebView marker means in-app; anything doubtful stays a normal browser.",
      ),
      alt: t(
        "User-Agent 를 읽어 앱 서명이 있으면 인앱으로 판정하고, 없으면 임베디드 WebView 표지를 확인합니다. 표지도 없으면 일반 브라우저로 둡니다. 인앱으로 판정되면 탈출 방법을 안내하고 새 창을 여는 기능을 접습니다.",
        "The User-Agent is read; an app signature means in-app, otherwise an embedded WebView marker is checked, and if that is absent too it stays a normal browser. An in-app verdict shows how to escape and folds the features that open new windows.",
      ),
      nodes: [
        { id: "ua", label: t("UA 읽기", "Read the UA"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "sign", label: t("앱 서명?", "App signature?"), tone: "neutral", shape: "diamond", at: [1, 0] },
        { id: "inapp", label: t("인앱으로 판정", "Verdict: in-app"), tone: "warn", at: [2, 0] },
        {
          id: "escape",
          label: t("탈출 방법 안내", "Show the way out"),
          sub: t("Android 링크 · iOS 문구", "Android link, iOS hint"),
          tone: "local",
          at: [3, 0],
        },
        {
          id: "fold",
          label: t("팝업 기능 접기", "Fold popup features"),
          sub: t("판별 시점에 결정", "decided up front"),
          tone: "good",
          at: [4, 0],
        },
        { id: "marker", label: t("WebView 표지?", "WebView marker?"), tone: "neutral", shape: "diamond", at: [1, 1] },
        {
          id: "normal",
          label: t("일반 브라우저", "Normal browser"),
          sub: t("확신이 없으면 여기로", "the default when unsure"),
          tone: "good",
          at: [1, 2],
        },
      ],
      edges: [
        { from: "ua", to: "sign" },
        { from: "sign", to: "inapp", label: t("예", "yes") },
        { from: "inapp", to: "escape" },
        { from: "escape", to: "fold" },
        { from: "sign", to: "marker", label: t("아니오", "no") },
        { from: "marker", to: "inapp", label: t("예", "yes") },
        { from: "marker", to: "normal", label: t("아니오", "no") },
      ],
    },
    usage: [
      {
        feature: t("도구 보조 창 열기", "Opening the tools companion window"),
        role: t(
          "새 창을 열 수 없으면 팝업을 허용하라는 실행 불가능한 안내 대신 기본 브라우저로 나가는 길을 안내합니다.",
          "When a new window cannot open, it shows the way out to the default browser instead of an impossible please allow popups.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-companion-popup-guidance.ts",
          "apps/web/src/domains/creator/StudioToolsCompanionPage.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("라이브 캔버스 · 새 탭에서 같이 그리기", "Live canvas · drawing together in a new tab"),
        role: t(
          "인앱 브라우저에서는 새 탭 기능을 처음부터 접어 죽은 버튼을 없앱니다.",
          "In in-app browsers the new-tab feature is folded from the start, removing a dead button.",
        ),
        paths: [
          "apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx",
          "apps/web/src/platform/browser/in-app-browser.ts#studioCanOpenAuxiliaryWindow",
        ],
      },
      {
        feature: t("브라우저 점검 · 몰입 기능 판정", "Browser check and immersive capability"),
        role: t(
          "진단 정보에 인앱 여부를 싣고, 몰입(XR)과 3D 배경 쪽 능력 판정에서도 같은 판별을 씁니다.",
          "Adds the in-app verdict to diagnostics and reuses the same identification for immersive (XR) and 3D background capability checks.",
        ),
        paths: [
          "apps/web/src/platform/browser/browser-check.ts",
          "apps/web/src/domains/creator/spatial/studio-immersive-capabilities.ts",
          "apps/web/src/domains/creator/bg3d/studio-bg3d-inapp-browser.ts",
        ],
      },
      {
        feature: t("모바일 앱 셸 (Capacitor)", "Mobile app shell (Capacitor)"),
        role: t(
          "원격 웹을 그대로 싣는 얇은 셸이라, 이 카드의 기능들이 그 WebView 안에서 어떻게 동작하는지는 코드로 확인되지 않았습니다.",
          "A thin shell that loads the remote web app as is; how these features behave in that WebView was not confirmed from code.",
        ),
        paths: ["apps/mobile/capacitor.config.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("서명으로 가리고, 모르면 일반 브라우저", "Match a signature, and default to a normal browser"),
        language: "ts",
        ...sampleSource([
          ['const SIGNATURES = [["kakaotalk", "KakaoTalk"], ["instagram", "Instagram"], ["naver(", "Naver"]] as const;'],
          [""],
          ["export function diagnose(userAgent: string, href: string) {"],
          ["  const ua = userAgent.toLowerCase();"],
          ["  const hit = SIGNATURES.find(([token]) => ua.includes(token));"],
          ["  const androidWebView = /;\\s*wv[;)]/u.test(ua);"],
          ["  if (!hit && !androidWebView) return { inApp: false as const };", "확신이 없으면 일반 브라우저로 둔다", "when unsure, treat it as a normal browser"],
          ['  const escapeHref = ua.includes("android")'],
          ['    ? hit?.[0] === "kakaotalk"'],
          ["      ? `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`"],
          ["      : `intent://${href.replace(/^https?:\\/\\//u, \"\")}#Intent;scheme=https;action=android.intent.action.VIEW;end;`"],
          ["    : null;", "iOS 는 링크가 없어 안내 문구만 준다", "iOS has no link, so only a hint is shown"],
          ["  return { inApp: true as const, name: hit?.[1] ?? null, escapeHref, popupCapable: false };"],
          ["}"],
        ]),
        explain: t(
          "실제 모듈(in-app-browser.ts)은 12종의 서명 표, iOS WKWebView 판별, 탈출 안내 문구까지 갖춘 순수 함수입니다. 여기서는 서명 일치, 확신 없으면 일반 브라우저, 플랫폼별 탈출 방식의 골격만 남겼습니다.",
          "The real module (in-app-browser.ts) is a pure function with a twelve-entry signature table, iOS WKWebView detection and escape hint text. This keeps only the skeleton: match a signature, default to normal when unsure, and a per-platform escape.",
        ),
        source: "apps/web/src/platform/browser/in-app-browser.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · Window.open()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/open",
        kind: "docs",
        note: t("새 창을 열 수 없을 때 null 이 돌아오는 경우", "When null comes back because a window cannot open"),
      },
      {
        title: "Android Developers · WebView",
        url: "https://developer.android.com/reference/android/webkit/WebView",
        kind: "docs",
        note: t("임베디드 WebView 의 정의", "What an embedded WebView is"),
      },
      {
        title: "MDN · Browser detection using the user agent",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent",
        kind: "guide",
        note: t("UA 로 판별할 때의 한계와 주의", "Limits and cautions of identifying by UA"),
      },
    ],
    chapterIds: ["performance", "troubleshooting-evidence"],
    talk: {
      pitch: t(
        "웹툰 독자 상당수는 카카오톡이나 네이버 앱이 띄운 내장 브라우저로 들어오고, 거기서는 새 창이 열리지 않고 주소창도 없습니다. 그래서 들어오자마자 어떤 환경인지 알아보고, 새 창이 필요한 기능은 미리 접으며, 밖으로 나가는 길을 안내합니다. 확신이 없으면 일반 브라우저로 취급해 멀쩡한 사용자의 기능을 빼앗지 않습니다.",
        "Many webtoon readers arrive through the built-in browser of KakaoTalk or Naver, where new windows do not open and there is no address bar. So on arrival the app identifies the environment, folds features that need a new window in advance, and shows the way out. When unsure it assumes a normal browser, so it never takes features from a user who has a normal one.",
      ),
      analogy: t(
        "건물 안내 데스크가 길을 잃은 방문객에게 지금 있는 구역을 알려 주고, 출입문이 없는 구역이면 엘리베이터로 나가는 법을 안내해 주는 것과 같습니다.",
        "It is like an information desk telling a lost visitor which zone they are in and, when that zone has no exit door, how to leave by elevator.",
      ),
      questions: [
        {
          question: t("왜 인앱 브라우저는 따로 다루나요?", "Why treat in-app browsers separately?"),
          answer: t(
            "새 창이 안 열리고 주소창·뒤로 가기가 없으며 저장소 기능이 앱마다 달라서, 일반 브라우저용 안내가 통하지 않기 때문입니다.",
            "New windows do not open, there is no address bar or back button, and storage features differ per app, so guidance meant for normal browsers does not work.",
          ),
        },
        {
          question: t("UA 로 판별해도 되나요?", "Is it fine to identify by UA?"),
          answer: t(
            "이 경우에는 UA 가 거의 유일한 단서입니다. 대신 판별만 하고 확신이 없으면 일반 브라우저로 두며, GPU 성능 같은 능력 판정에는 UA 를 쓰지 않습니다.",
            "Here the UA is nearly the only clue. So it only identifies, assumes a normal browser when unsure, and never uses the UA for capability checks such as GPU tier.",
          ),
        },
        {
          question: t("iOS 에서는 왜 링크가 없나요?", "Why is there no link on iOS?"),
          answer: t(
            "앱 안에서 기본 브라우저로 넘기는 믿을 만한 방법이 없어, Safari로 열기를 누르라는 안내 문구만 보여 줍니다.",
            "There is no reliable way to hand off to the default browser from inside the app, so only a hint to tap Open in Safari is shown.",
          ),
        },
      ],
      pitfall: t(
        "모바일 앱 셸(Capacitor)에서 이 기능들이 어떻게 동작하는지는 코드로 확인되지 않았습니다. 앱이 UA 를 바꾸면 판별이 틀릴 수 있고, 지원하는 12종 밖의 앱은 일반 브라우저로 취급됩니다.",
        "How these features behave inside the mobile app shell (Capacitor) was not confirmed from code. If an app changes its UA the verdict can be wrong, and apps outside the twelve supported kinds are treated as normal browsers.",
      ),
    },
    technologies: ["In-app WebView", "Capacitor", "User-Agent", "intent URL"],
    facts: [
      {
        value: "12",
        label: t("판별하는 인앱 환경 종류(앱 10개 + 일반 WebView 2종)", "In-app environment kinds identified (10 apps plus 2 generic WebViews)"),
        source: "apps/web/src/platform/browser/in-app-browser.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
];
