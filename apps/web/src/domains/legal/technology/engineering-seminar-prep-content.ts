import type { LocalizedText } from "./engineering-story-content";

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export interface SeminarPrepQuestion {
  readonly question: LocalizedText;
  /** 2~3문장 답변 요지 — 코드에서 확인된 것만. 확인하지 못한 운영 상태는 "미확인"이라고 적는다. */
  readonly answer: LocalizedText;
  readonly glossaryId?: string;
  /** 이 질문에 답할 때 열 기술 도감 카드(발표자가 부록 트랙으로 바로 이동한다). 모든 질문이 가지며, 실제 카드인지는 콘텐츠 테스트가 확인한다. */
  readonly atlasId: string;
}

/**
 * 예상 질문과 답변 요지. 정본 수치는 코드와 도감 카드(`talk.pitfall`·`questions`)를 따른다.
 * 라이선스·결제처럼 판단이 필요한 주제는 사실만 적고 판단은 소유자 몫으로 표시한다.
 * 답변에 쓴 수치와 파일은 `engineering-seminar-lessons.test.ts`가 원본과 대조한다.
 */
export const SEMINAR_PREP_QUESTIONS: readonly SeminarPrepQuestion[] = [
  {
    question: t("왜 굳이 브라우저에서 하나요? 네이티브 앱이 낫지 않나요?", "Why the browser at all? Wouldn't a native app be better?"),
    answer: t(
      "설치 장벽이 없고 URL 하나로 공유·협업이 됩니다. 한 번 준비해 둔 작업실은 서버가 느리거나 끊겨도 서비스 워커가 같은 화면이나 긴급 드로잉을 열어 주지만, 오프라인은 미리 준비된 범위만 보장합니다. 네이티브 앱과 우열을 가리려는 것이 아니라 브라우저가 작업을 어디까지 책임질 수 있는지 보여 주는 사례입니다.",
      "There is no install barrier, and one URL shares and collaborates. Once prepared, the studio opens the same screen or an emergency drawing page through the service worker even when the server is slow or down, but offline covers only the prepared scope. This is not a ranking against native apps but a case study of how far a browser can take responsibility for the work.",
    ),
    glossaryId: "pwa",
    atlasId: "service-worker-app-shell-policy",
  },
  {
    question: t("WASM이 뭔가요? 왜 Rust인가요?", "What is WASM, and why Rust?"),
    answer: t(
      "WASM은 미리 컴파일한 코드를 브라우저에서 빠르게 돌리는 실행 형식입니다. Rust는 메모리 실수를 컴파일 때 잡아 주고 GC가 없어 성능을 예측하기 쉽습니다. 자연매체 브러시 Hokusai는 MIT OR Apache-2.0의 외부 크레이트(0.3.0 고정)를 Rust 래퍼로 감싸 WASM으로 빌드한 것이며, 승격 게이트를 넘지 못해 아직 실험 상태입니다.",
      "WASM is a format that runs precompiled code quickly in the browser. Rust catches memory mistakes at compile time and has no garbage collector, so performance is easier to predict. The Hokusai natural-media brush is an external MIT OR Apache-2.0 crate (pinned to 0.3.0) wrapped by a Rust wrapper and built to WASM; it has not passed its promotion gate, so it is still experimental.",
    ),
    glossaryId: "wasm",
    atlasId: "hokusai-wasm-natural-media",
  },
  {
    question: t("오프라인에서 정말 그림이 그려지나요?", "Can you really draw offline?"),
    answer: t(
      "네, 미리 준비된 범위에서는 그려집니다. 스튜디오를 열 때 응답을 4초까지만 기다리고, 시간 초과·네트워크 예외·408·5xx일 때만 기기에 준비한 같은 스튜디오 화면을, 그것도 없을 때만 작은 긴급 복구 드로잉(/offline-drawing)을 엽니다. 첫 방문 오프라인은 안 되고 협업·AI·게시는 서버가 필요하며, 긴급 드로잉의 작품은 PNG나 원고 파일로 내보내 이어 작업해야 합니다.",
      "Yes, within the prepared scope. When the studio opens it waits at most four seconds, and only on a timeout, network error, 408 or 5xx does it open the same studio screen prepared on the device, or, only if that is missing, a tiny emergency drawing page (/offline-drawing). A first visit offline does not work, collaboration, AI and publishing need the server, and work made in the emergency drawing must be exported as PNG or a manuscript file to continue.",
    ),
    glossaryId: "offline-shell",
    atlasId: "server-down-fallback-deadline",
  },
  {
    question: t("AI는 어디까지 쓰고, 사람은 뭘 하나요?", "Where does AI stop and humans take over?"),
    answer: t(
      "AI는 제안, 사람은 확정입니다. 결과는 문서를 직접 고치지 않고 제안·후보로만 돌아오며 작가가 고른 것만 적용되고, 지금 연결된 획 제안 생성기는 AI 모델이 아닌 이동평균입니다. 무료 경로는 시작 전에 확실히 거절된 한도 소진(402·429 등)일 때만 다음으로 넘기고, 시간 초과·5xx는 다시 보내지 않으며 유료 경로는 사용자가 허락해야만 씁니다.",
      "AI proposes, humans decide. Results never edit the document directly but come back as proposals or candidates and only what the artist picks is applied, and the stroke-proposal generator wired today is a moving average, not an AI model. The free route advances only on a clear refusal before the work starts, such as quota exhaustion (402, 429 and similar); timeouts and 5xx are never resent, and a paid route runs only with the user's approval.",
    ),
    glossaryId: "ai-routing",
    atlasId: "ai-proposal-not-commit",
  },
  {
    question: t("비용 구조는요? 무료로 운영되나요?", "What about costs? Is it free to run?"),
    answer: t(
      "무료 우선 설계입니다. 정적 화면은 Cloudflare, API는 Render 무료 웹 서비스, 실시간 임시 상태는 Durable Objects에 두고, 원장 DB는 Supabase PostgreSQL이 현재 권위이며 Neon은 legacy로 보존합니다. 유료 전환은 자동으로 하지 않고, 대가는 콜드 스타트(15분 무요청 뒤 첫 응답에 약 1분)와 공급자가 바꿀 수 있는 한도이며, 운영 대시보드의 실제 요금제와 사용량은 미확인입니다.",
      "Free-first design. Static screens run on Cloudflare, the API on Render's free web service and temporary realtime state on Durable Objects; for the ledger database, Supabase PostgreSQL is the current authority and Neon is preserved as legacy. Nothing upgrades to paid automatically; the price is cold starts (about a minute for the first response after 15 idle minutes) and limits that providers can change, and the actual plan and usage on the production dashboards are unconfirmed.",
    ),
    atlasId: "static-first-edge-gateway",
  },
  {
    question: t("CSP·Procreate와 차별점은 뭔가요?", "How is it different from CSP or Procreate?"),
    answer: t(
      "단일 드로잉 앱과 우열을 가리려는 것이 아닙니다. 기획→콘티→드로잉→3D→검수→발행이 한 프로젝트로 이어진다는 점이 우리가 내세우는 차이이고, 경쟁 제품의 가격·점유율·기능 우열은 조사하지 않았습니다. 브러시 엔진도 한 라이브러리가 모두 맡지 않고 perfect-freehand·p5.brush·Hokusai처럼 역할별로 나누며, libmypaint는 Hokusai의 일치 여부를 재는 비교·시험용 기준입니다.",
      "We are not trying to rank against a single drawing app. The difference we claim is that planning, boards, drawing, 3D, review and publishing connect in one project; competitors' price, market share and feature rank were not researched. The brush engines are split by role, such as perfect-freehand, p5.brush and Hokusai, instead of one library doing everything, and libmypaint is the comparison and test reference for checking Hokusai's parity.",
    ),
    glossaryId: "libmypaint",
    atlasId: "renderer-role-ledger",
  },
  {
    question: t("3D를 왜 넣었나요?", "Why include 3D?"),
    answer: t(
      "보여주기용이 아니라 밑그림 재료입니다. 3D 화면을 한 장 찍어 색·깊이·법선을 읽고 컬러·톤·질감선·주선 네 레이어로 나누는 LT 변환은 AI 없이 같은 입력에 같은 결과를 내서, 작가가 그 위에 바로 펜을 댑니다. VRM은 모든 캐릭터가 같은 뼈 이름을 쓰는 약속이라 포즈 도구와 웹캠 추적이 같은 뼈대에 붙습니다.",
      "Not for show but as underdrawing material. The LT conversion takes one capture of the 3D view, reads color, depth and normals and splits it into color, tone, texture-line and main-line layers; with no AI, the same input gives the same result, so the artist inks directly over it. VRM is a promise that every character uses the same bone names, so pose tools and webcam tracking attach to one skeleton.",
    ),
    glossaryId: "lt-conversion",
    atlasId: "toon-shading-outline",
  },
  {
    question: t("여러 명이 같이 작업하면 충돌 안 나나요?", "Doesn't simultaneous editing cause conflicts?"),
    answer: t(
      "CRDT가 정해진 규칙으로 변경을 병합해 작업이 사라지는 일은 막지만, 같은 값을 동시에 바꾸면 규칙에 따라 한쪽이 선택되므로 짧은 편집 잠금을 함께 씁니다. CRDT는 권한을 모르기 때문에 서버가 편집 권한·속도 한도·변경 내용의 불변식을 먼저 검사하고, 큰 비트맵은 CRDT 밖에서 변경 로그와 체크포인트로 따로 보관합니다. 이 장은 아직 실험 단계이고, 통화(WebRTC)와 문서 동기화는 별도 채널입니다.",
      "A CRDT merges changes by fixed rules so work is not lost, but when the same value is changed at once the rules pick one side, so a short edit lock is used alongside. A CRDT does not know about authorization, so the server first checks edit rights, rate limits and the invariants of the change, and large bitmaps are kept outside the CRDT as a change log with checkpoints. This chapter is still experimental, and calls (WebRTC) and document sync are separate channels.",
    ),
    glossaryId: "crdt",
    atlasId: "yjs-crdt-document",
  },
  {
    question: t("오픈소스 라이선스 문제는 없나요?", "Any open-source licensing issues?"),
    answer: t(
      "/about/technology/licenses에 그룹별 의무와 주의사항을 공개하고 고지 파일은 빌드가 생성하며, 손으로 쓴 THIRD_PARTY_NOTICES.md는 일부 목록입니다. 사실만 말씀드리면 Mixbox는 CC BY-NC 4.0(비상업), Remotion은 자격 조건이 있는 자체 라이선스, wasm-vips는 MIT 래퍼에 LGPL 라이브러리가 내장돼 생성 고지에는 MIT로만 나오는 알려진 공백이 있고, Hokusai는 MIT OR Apache-2.0의 외부 크레이트를 감싼 것입니다. 이 조건이 우리 배포에 충분한지, 특히 Remotion 자격 여부는 저장소로 확인할 수 없어(미확인) 소유자의 결정과 별도 확인이 필요하며 법률 판단은 하지 않습니다.",
      "Obligations and cautions per license group are published at /about/technology/licenses, the notice file is generated by the build, and the hand-written THIRD_PARTY_NOTICES.md is only a partial list. Stating facts only: Mixbox is CC BY-NC 4.0 (non-commercial), Remotion has its own license with eligibility conditions, wasm-vips is an MIT wrapper with embedded LGPL libraries that appear only as MIT in the generated notices (a known gap), and Hokusai is an external MIT OR Apache-2.0 crate that we wrap. Whether these terms suffice for our distribution, especially Remotion eligibility, cannot be confirmed from the repository (unconfirmed), so it is the owner's decision and needs separate review; we make no legal judgment.",
    ),
    glossaryId: "oss-license",
    atlasId: "oss-license-notice-pipeline",
  },
  {
    question: t("우리 팀에 적용하려면 어디서 시작하나요?", "Where should our team start adopting this?"),
    answer: t(
      "기술 스토리의 각 챕터 끝에 재사용 절차(reuseSteps)가 있습니다. 예를 들어 브러시 챕터는 입력 보정과 최종 문서 기록을 별도 인터페이스로 나누고, 짧은 데모가 아니라 긴 획과 고밀도 포인터를 측정하고, 기능 감지와 선택한 경로의 결과 패리티를 함께 검증하라고 안내합니다. 어느 챕터를 따르든 ‘무엇이 원본이고 누가 확정하는가’를 정하는 일부터 시작하세요.",
      "Each engineering story chapter ends with reuse steps (reuseSteps). The brush chapter, for example, says to separate input stabilization from the final document record behind different interfaces, measure long strokes and dense pointer input rather than short demos, and verify capability detection together with result parity on the chosen path. Whichever chapter you follow, begin by deciding what the source is and who commits it.",
    ),
    atlasId: "pointer-input-contract",
  },
  {
    question: t("무료 인프라로 운영하면 한도나 위험은 없나요?", "Does running on free infrastructure carry limits or risks?"),
    answer: t(
      "공급자가 한도와 약관을 바꿀 수 있어 위험이 있고, 그래서 표에는 한도를 기록한 날짜를 함께 적습니다(예: Render 무료 서비스는 15분 무요청 뒤 잠들고 첫 응답에 약 1분). Neon 무료 한도에 막혔을 때는 2026-09-26 사람의 승인으로 Supabase에서 빈 상태로 새로 시작했고, 자동 이중 쓰기와 자동 전환은 없으며 유료 승격도 승인 없이는 하지 않습니다. 운영 대시보드의 실제 요금제와 사용량은 저장소로 확인할 수 없어 미확인입니다.",
      "Yes: providers can change free limits and terms, so the tables record the date each limit was written down (for example, Render's free service sleeps after 15 idle minutes and the first response takes about a minute). When Neon's free quota blocked us, a person approved a fresh start on Supabase on 2026-09-26; there is no automatic double write or failover, and no paid upgrade without approval. The actual plan and usage on the production dashboards cannot be checked from the repository and are unconfirmed.",
    ),
    glossaryId: "quota-ledger",
    atlasId: "supabase-single-writer-authority",
  },
  {
    question: t("오픈소스를 고쳐 쓰면 유지 비용과 라이선스 부담은 어떻게 되나요?", "What does patching open source cost in upkeep and license burden?"),
    answer: t(
      "pnpm 패치 7개와 포크 2개(wgpu 29.0.4 벤더 포크, braces 보안 포크)는 정확한 버전에 묶여 있어 업그레이드 때 다시 써야 하고, 상류에 반영한 근거(PR·이슈)는 저장소에서 찾지 못했습니다. 패치 3개는 unsafe-eval을 열지 않으려고 문자열 코드 실행을 걷어 내거나 늦췄고, wgpu 포크는 변경 하나를 toon-fabric 피처 뒤에 두어 끄면 API가 상류와 같으며, braces 포크는 업스트림 수정이 없는 취약점에 중첩 깊이 100 가드를 더한 것이라 이후 braces 권고는 감사 게이트가 잡지 못해 직접 확인해야 합니다. 라이선스 고지는 빌드가 생성하지만 의무를 어떻게 이행할지는 법률 판단이라 소유자가 결정합니다.",
      "The seven pnpm patches and the two forks (the vendored wgpu 29.0.4 fork and the braces security fork) are pinned to exact versions and must be rewritten on upgrade, and no upstream PR or issue of ours was found in the repository. Three patches remove or defer string-code execution so the security policy never has to open unsafe-eval; the wgpu fork keeps its one change behind the toon-fabric feature, so with it off the API equals upstream, and the braces fork adds a nesting-depth guard of 100 for a vulnerability with no upstream fix, so future braces advisories escape the audit gate and must be checked by hand. Notices are generated by the build, but how to meet the obligations is a legal judgment left to the owner.",
    ),
    glossaryId: "pnpm-patch-fork",
    atlasId: "oss-pnpm-patches-no-unsafe-eval",
  },
  {
    question: t("경쟁·참고 제품과는 어떻게 다르고, 코드를 가져다 썼나요?", "How does it differ from reference products, and was their code used?"),
    answer: t(
      "영역별 대표만 들면 그림은 Clip Studio Paint, 협업·가상공간은 Gather, 3D는 Blender, 콘티는 Storyboard Pro이며, 지도에는 저장소 문서의 ‘배운 점·다르게 한 점·안 한 점’만 담았고 내부 구현과 가격·점유율·우열은 확인하지 않았습니다. 규칙은 clean-room으로 공식 매뉴얼과 공개 사양에서 사용자의 문제와 검증 가능한 결과만 가져오고, 상용 소스·프리셋 반입과 디컴파일은 금지하며 GPL 오픈소스 그림 프로그램의 코어 코드도 참고만 하고 가져오지 않았습니다(ADR 0008). 우리 쪽 특징을 든다면 가상 스튜디오의 공간이 권한을 갖지 않고 기존 프로젝트·권한 위에 얹힌 화면이라는 점이고, Clip Studio Paint의 .clip 파일 직접 호환은 하지 않았습니다.",
      "By domain representatives only: Clip Studio Paint for drawing, Gather for collaboration and virtual space, Blender for 3D and Storyboard Pro for boards; the map holds only the learned, done-differently and not-done notes written in repository documents, and internals, price, share and rank were not checked. The rule is clean-room: take only the user's problem and a verifiable outcome from official manuals and public specs, never import commercial source or presets or decompile, and the core code of a GPL open-source drawing program was consulted but not imported (ADR 0008). Our own point is that the virtual studio's space holds no permission and is a view laid over existing projects and permissions, and direct .clip file compatibility with Clip Studio Paint was not built.",
    ),
    atlasId: "virtual-studio-architecture-overview",
  },
  {
    question: t("외부 공개 API가 느리거나 응답 모양이 바뀌면 화면은 어떻게 되나요?", "What does the UI do when an external public API is slow or changes shape?"),
    answer: t(
      "화면은 외부 API를 직접 부르지 않고 서버의 자료 엔진 하나를 거치며, 6초 안에 못 오면 포기하고 리디렉션을 막고 2MiB 넘는 응답은 버립니다. 응답 모양이 틀리면 빈 목록을 성공처럼 보이지 않고 ‘불러오지 못함’으로 알리며, 공급자가 429·503을 보내면 Retry-After(1~120초, 없으면 30초) 동안 그 호스트 호출을 멈춥니다. 이 한도와 쿨다운은 서버 프로세스 한 대의 메모리 기준이고 운영에서의 실제 호출 성공은 미확인입니다.",
      "The UI never calls external APIs directly; it goes through one server-side resource engine that gives up after 6 seconds, blocks redirects and drops responses over 2 MiB. A wrong response shape is reported as failed to load rather than shown as an empty success, and if a provider sends 429 or 503, calls to that host pause for its Retry-After (1 to 120 seconds, 30 when absent). These limits and cooldowns live in one server process's memory, and real production call success is unconfirmed.",
    ),
    glossaryId: "circuit-breaker",
    atlasId: "resource-engine-one-contract",
  },
  {
    question: t("직접 연결(P2P)이 막힌 네트워크에서는 통화가 되나요?", "Do calls work on a network that blocks direct (P2P) connections?"),
    answer: t(
      "직접 연결이 막히면 통화가 실패할 수 있습니다. 중계(TURN)용 단기 자격(Cloudflare 4시간, 화면 공유는 기본 900초) 발급 코드는 구현돼 있지만 운영 키 등록 여부는 저장소로 확인할 수 없어 미확인이고, 키가 없으면 STUN만으로 시작하며 제한된 NAT에서 중계가 통과한 검증 기록도 없습니다. 통화 설정과 채팅이 오가는 직접 레인은 막혀도 서버로 되돌아가지 않게 일부러 설계했습니다.",
      "If direct connections are blocked, a call can fail. Code to issue short-lived relay (TURN) credentials (four hours on Cloudflare, 900 seconds by default for screen sharing) is implemented, but whether the production key is registered cannot be confirmed from the repository (unconfirmed); without a key the call starts on STUN only, and there is no record of a relay passing through a restricted NAT. The direct lane that carries call setup and chat is deliberately built so that it never falls back to the server, even when blocked.",
    ),
    glossaryId: "turn",
    atlasId: "webrtc-ice-turn-paths",
  },
  {
    question: t("기기 안 AI 모델은 얼마나 크고, 정확도는 어떤가요?", "How big are the on-device AI models, and how accurate are they?"),
    answer: t(
      "기능은 5종이고 ONNX 모델 파일 6개의 합계가 119,438,571바이트(가장 큰 채색 모델이 약 79MB)라 처음 켤 때 한 번 내려받으며, 받은 바이트의 SHA-256이 등록값과 다르면 거절합니다. WebGPU가 안 되는 기기는 느린 WASM으로 돌고, 번역 모델(약 123MB)은 아직 배포에 배치하지 않아 사전 변환과 원문 검색이 대신합니다. 모델 간 정확도 비교 수치는 저장소에서 확인하지 못했고(미확인), 속도는 Node+WASM 중앙값 1건(2026-10-03)만 있으며 채색 모델은 2019년 모델이라 512×512 고정에 옅은 파스텔 색감입니다.",
      "There are five features, and the six ONNX model files total 119,438,571 bytes (the largest, the colorizing model, is about 79 MB); they download once on first use and are rejected if the SHA-256 of the received bytes differs from the registry. Devices without WebGPU run the slower WASM path, and the translation model (about 123 MB) is not yet placed in the deployment, so dictionary conversion and original-text search stand in. No figures comparing model accuracy were found in the repository (unconfirmed), speed is recorded only as one Node plus WASM median (2026-10-03), and the colorizing model is a 2019 model fixed at 512x512 with pale pastel colors.",
    ),
    glossaryId: "onnx",
    atlasId: "onnx-runtime-web-inference",
  },
  {
    question: t("큰 파일이나 ZIP 폭탄 같은 악성 파일은 어떻게 막나요?", "How are large files and zip bombs stopped?"),
    answer: t(
      "받은 ZIP은 열기 전에 크기와 압축률을 보고(항목당 압축률 100배·해제 크기 256MB 상한), 풀면서 선언한 크기를 넘는 순간 스트림을 끊습니다. 이미지는 원본 12MiB와 디코드 픽셀 상한(데스크톱 16,777,216, 모바일 8,388,608)을 디코드 전에 확인합니다. 브라우저별 압축 지원은 코드 주석의 주장이라 MDN 호환성 표로 따로 확인해야 하고, 내장 해제기가 없으면 DECOMPRESSION_UNAVAILABLE 오류로 알립니다.",
      "A received ZIP is checked for size and compression ratio before opening (at most a 100x ratio and 256 MB uncompressed per entry), and the stream is cut the moment it unpacks past the declared size. Images are checked before decoding against a 12 MiB source limit and decoded-pixel limits (16,777,216 on desktop, 8,388,608 on mobile). Per-browser compression support is a claim in a code comment and must be checked against MDN's compatibility table, and without a built-in decompressor the app reports DECOMPRESSION_UNAVAILABLE.",
    ),
    glossaryId: "compression-streams",
    atlasId: "compression-streams-zip-bomb-guard",
  },
  {
    question: t("드래그앤드롭을 왜 라이브러리 없이 직접 만들었나요?", "Why was drag and drop built by hand instead of with a library?"),
    answer: t(
      "일에 따라 세 방식을 씁니다. 파일 반입과 단순 목록은 브라우저 표준 DnD, 칸반·창은 Pointer Events, 캔버스와 3D 안의 물체는 Konva·three.js 내장 기능이며 package.json에는 끌어 놓기 라이브러리가 없습니다. 이 기준은 코드에서 정리한 해석이지 결정 문서(ADR)가 아니고 라이브러리와 비교한 기록이나 성능 수치도 없으며, 대가로 접근성·터치·IME 처리를 직접 책임지므로 끌지 않는 경로(Alt+방향키 등)를 짝으로 둡니다.",
      "The method depends on the job. File import and simple lists use the browser's native DnD, the kanban board and windows use Pointer Events, and objects inside the canvas and 3D use built-in Konva and three.js features; package.json lists no drag-and-drop library. This selection rule is an interpretation drawn from the code, not a decision record (ADR), there is no comparison with libraries or performance figure, and the price is owning accessibility, touch and IME handling ourselves, with a no-drag path (Alt+arrows and so on) alongside.",
    ),
    glossaryId: "html5-dnd-vs-pointer",
    atlasId: "dnd-implementation-choice",
  },
  {
    question: t("AI 에이전트로 개발할 때 품질은 어떻게 지키나요?", "How is quality protected when developing with AI agents?"),
    answer: t(
      "규칙은 AGENTS.md 한 곳에 두고 도구별 파일은 그곳을 가리키기만 하며, AI가 만든 변경도 사람의 변경과 같은 harness:verify·훅·CI core를 지나고 운영 배포는 사람이 승인한 40자리 SHA만 반영합니다. 사실이 충돌하면 코드와 테스트가 먼저이고 OpenWiki는 길잡이입니다. 개발 속도나 결함률 같은 정량 효과는 측정하지 않았고, loop 명령 파일 23개의 실제 실행 기록도 확인하지 못했습니다(미확인).",
      "The rules live in one AGENTS.md and tool files only point to it; a change made by AI passes the same harness:verify, hooks and CI core as a person's change, and production deployment applies only a 40-character SHA that a person approved. When facts conflict, code and tests win and OpenWiki is a guide. The quantitative effect on speed or defect rate was not measured, and no execution record was found for the 23 loop command files (unconfirmed).",
    ),
    glossaryId: "agent-harness",
    atlasId: "agent-harness-verify-gates",
  },
  {
    question: t("가상 스튜디오는 몇 명까지 되고, 더 키우려면 무엇이 필요한가요?", "How many people fit in the virtual studio, and what would scaling need?"),
    answer: t(
      "숫자는 층마다 다릅니다. 공간 상수는 24명이지만 검증된 수용량이 아니고, 직접 연결 메시는 8명에서 막히며, 영상은 원격 3명(나 포함 4명)까지이고 실시간 서버의 방당 연결 64는 접속 상태용입니다. 더 큰 행사는 서버가 영상을 나눠 주는 SFU 같은 구조가 필요하고 지금은 범위 밖이며, 모든 수치는 설정값이지 부하 시험 결과가 아닙니다.",
      "The number depends on the layer. The space constant is 24 people but not a verified capacity, the direct mesh stops at 8, video allows 3 remote people (4 including you), and the realtime server's 64 connections per room are for presence. A larger event would need an SFU-style design where a server fans out video, which is out of scope now, and every figure is a configured value, not a load-test result.",
    ),
    glossaryId: "mesh-vs-sfu",
    atlasId: "proximity-video-capacity-chain",
  },
  {
    question: t("차세대 웹 기능이 안 되는 브라우저에서는 어떻게 되나요?", "What happens in a browser that lacks next-generation web features?"),
    answer: t(
      "27종의 감지는 오류를 던지지 않고 미지원이면 false로 끝나며, 실험 기능은 폴백을 만들지 않아 그 기능만 조용히 없고 기존 기능은 그대로 동작합니다. 실제로 연결한 화면 꺼짐 방지·스튜디오 프리렌더·화면 전환·스포이트 중 앞의 세 가지는 설정에서 끌 수 있습니다. Speculation Rules는 보안 정책에 막히는지 실제 브라우저로 확인하지 못해 효과를 단정하지 않으며, WebTransport는 클라이언트 코드만 있어 운영은 WebSocket뿐입니다.",
      "Detection of the 27 APIs never throws and ends in false when unsupported; experimental features have no fallback, so only that feature is silently absent and existing features work as before. Of the wired screen wake lock, studio prerender, view transitions and eyedropper, the first three can be switched off in settings. Whether the security policy blocks Speculation Rules was not confirmed in a real browser, so no effect is claimed, and WebTransport has only client code, so production uses WebSocket alone.",
    ),
    glossaryId: "feature-detection",
    atlasId: "capability-detection-registry-27",
  },
  {
    question: t("결제나 크레딧이 이중으로 청구되지 않게 어떻게 하나요?", "How are payments and credits kept from being charged twice?"),
    answer: t(
      "금액은 서버가 쥐고 브라우저가 보낸 금액은 대조에만 쓰며, 결제사 응답이 애매하면 다시 승인하지 않고 조회로 결과를 확정하고, 웹훅도 본문 대신 다시 조회한 값만 반영합니다. 크레딧 지갑은 쓰기 전에 예약하고 끝난 뒤 실제 사용량만 정산하는 2단계이며 같은 요청 키는 몇 번 보내도 같은 영수증을 받습니다. 다만 마켓 승인의 모호 결과 분기와 운영의 실결제 활성 여부는 미확인이고, 지갑은 판매가 꺼져 있으며 서버 AI와 연결 전입니다.",
      "The server holds the amount and the browser's amount is used only for comparison; when a payment provider's reply is ambiguous it does not approve again but looks the result up, and webhooks apply only a re-queried value instead of the body. The credit wallet works in two steps, reserving before use and settling only actual usage afterwards, and the same request key always returns the same receipt. However, the ambiguous-result branch in marketplace approval and whether real payments are active in production are unconfirmed, and the wallet has sales turned off and is not yet connected to server AI.",
    ),
    glossaryId: "idempotency-key",
    atlasId: "payment-idempotency-webhook-reconcile",
  },
  {
    question: t("프런트와 백엔드 버전이 어긋나면 사용자는 무엇을 보고, 어떻게 맞추나요?", "What does a user see when the front end and back end versions drift apart, and how are they kept in step?"),
    answer: t(
      "같은 승인 SHA 하나를 정적 웹과 API에 올리는 것은 절차이고, 번들과 API 헬스 응답은 커밋 SHA를 말하지 않으므로 코드가 같은 빌드임을 증명하지는 않습니다. 대신 도구 버전(pnpm 11·Node 24.16 이상·--frozen-lockfile)을 고정하고, 웹과 API가 @toonstudio/contracts를 함께 import하며, 실시간 서버는 다른 프로토콜 버전(8)의 메시지를 거절하고, 사라진 청크는 청크마다 한 번씩 새로고침하고 오류 경계는 세션당 한 번만 새로고침해 복구합니다. 서버 응답 모양이 바뀌는 경우는 정책과 리뷰에 의존하고 실제 배포 중인 탭으로 재현해 보지는 않았습니다(미확인).",
      "Shipping one approved SHA to the static web and the API is a procedure, and since bundles and API health responses do not state the commit SHA, code does not prove they are the same build. Instead the tool versions are pinned (pnpm 11, Node 24.16 or newer, --frozen-lockfile), web and API import @toonstudio/contracts together, the realtime server rejects messages of another protocol version (8), and a vanished chunk is recovered with one reload per chunk, and the error boundary reloads once per session. When a server response shape changes it relies on policy and review, and it was not reproduced with a tab open during a real deployment (unconfirmed).",
    ),
    glossaryId: "manual-sha-release",
    atlasId: "version-skew-chunk-reload-recovery",
  },
];

export const SEMINAR_PREP_CHECKLIST: readonly LocalizedText[] = [
  t("타이머(T)를 켜고 30분 리허설 1회 — 구간 예산보다 늦으면 핵심 기술 구간에서 줄이기", "One 30-minute rehearsal with the timer (T) — if behind budget, trim inside the core technology section"),
  t("데모 탭 4개를 미리 열고 각 단계의 실패 시 대체 화면 확인", "Pre-open the four demo tabs and check each step's fallback"),
  t("오프라인 발표본 HTML을 내려받아 네트워크 없이 열리는지 확인", "Download the offline deck HTML and confirm it opens without a network"),
  t("프로젝터 연결 후 발표자 창을 열고, 청중 화면에서 전체 화면(F)이 동작하는지 확인", "After connecting the projector, open the presenter window and confirm fullscreen (F) on the audience screen"),
  t(`예상 질문 ${SEMINAR_PREP_QUESTIONS.length}개 중 자신 없는 5개 이상을 소리 내어 답변 — 1개당 1분 안에`, `Answer at least five of the ${SEMINAR_PREP_QUESTIONS.length} anticipated questions you feel least sure about aloud — under a minute each`),
  t("용어집에서 헷갈리는 용어 5개 다시 보기 — WASM·CRDT·LT 변환·VRM·PWA", "Revisit five shaky glossary terms — WASM, CRDT, LT conversion, VRM, PWA"),
];
