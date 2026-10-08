import type {
  EngineeringChapter,
  EngineeringEvidence,
  EngineeringEvidenceKind,
} from "./engineering-story-content";

const evidence = (
  kind: EngineeringEvidenceKind,
  path: string,
  ko: string,
  en: string,
): EngineeringEvidence => ({ kind, path, label: { ko, en } });

/**
 * 후속 승격 챕터. 병합·검증이 끝난 뒤에야 게시하는 원칙에 따라, 앞선 모듈들이 닫힌 뒤에
 * 활성화가 확인된 기술만 따로 모아 둔다. 게시 상태는 각 챕터의 status와 전제 표기가 정본이다.
 */
export const ENGINEERING_FOLLOWUP_CHAPTERS = [
  {
    id: "skp-model-import",
    order: 38,
    status: "live",
    eyebrow: "38 · SKP MODEL IMPORT",
    title: {
      ko: "SketchUp .skp 파일을 브라우저에서 GLB로 바꿔 가져옵니다",
      en: "SketchUp .skp files convert to GLB in the browser on import",
    },
    thesis: {
      ko: "배경 3D 모델 가져오기가 .skp를 직접 받습니다. MIT 라이선스의 openskp 1.3.0(순수 TypeScript 파서)으로 브라우저 안에서 파일을 읽어 GLB로 바꾼 뒤 기존 GLB 가져오기 파이프라인에 합류합니다. 서버로 원본을 올리지도, SketchUp으로 돌아가 내보내지도 않습니다.",
      en: "Background 3D model import accepts .skp directly. The MIT-licensed openskp 1.3.0, a pure TypeScript parser, reads the file inside the browser and converts it to GLB, which then joins the existing GLB import pipeline. The original is never uploaded to a server, and there is no round trip back into SketchUp to export first.",
    },
    problem: {
      ko: ".skp는 Trimble의 독점 바이너리 포맷이라 브라우저가 기본으로는 읽지 못합니다. 배경 소재는 SketchUp과 그 소재 생태계에 많이 쌓여 있는데, 가져올 때마다 데스크톱 도구에서 DAE·GLB로 내보내는 왕복이 끼면 소재를 찾고 배치하는 동선이 끊깁니다.",
      en: ".skp is Trimble's proprietary binary format, which browsers cannot read natively. Background material is heavily stocked in SketchUp and its asset ecosystem, and forcing a desktop export to DAE or GLB on every import breaks the flow of finding and placing material.",
    },
    decision: {
      ko: "변환은 파사드(studio-bg3d-skp-converter.ts) 한곳에 가뒀습니다. openskp를 동적 import로 지연 로드해 buildScene → toGLB 순서로 변환하고, 결과 바이트가 GLB 매직으로 시작할 때만 가져오기(studio-bg3d-model-import.ts의 skp 경로)로 넘깁니다. 실패는 두 종류로 구분해 그대로 드러냅니다. 변환기를 불러오지 못한 경우와 파일 구조를 해석하지 못한 경우이며, 가짜 변환이나 조용한 건너뜀은 없습니다. 변환된 GLB의 선화·음영·밑색 단계 추출은 기존 멀티패스 파이프라인이 맡고, .skp 전용 추출기는 따로 만들지 않았습니다.",
      en: "Conversion is confined to one facade (studio-bg3d-skp-converter.ts). openskp lazy-loads through a dynamic import, converts buildScene → toGLB, and hands off to import (the skp path in studio-bg3d-model-import.ts) only when the result starts with the GLB magic. Failures surface in two distinct kinds—the converter could not be loaded, or the file structure could not be parsed—with no fake conversion and no silent skip. Stage extraction (linework, shading, base color) for the converted GLB is handled by the existing multipass pipeline; no .skp-specific extractor was built.",
    },
    userValue: {
      ko: "SketchUp으로 만든 배경 소재를 파일을 고르는 그 자리에서 3D 배경으로 가져와 단계 추출까지 이어 갈 수 있습니다.",
      en: "Background material made in SketchUp can be brought in as a 3D set at the moment the file is picked, continuing straight into stage extraction.",
    },
    tradeoff: {
      ko: "openskp는 젊은 프로젝트라 레거시 .skp 파일 일부는 해석에 실패할 수 있습니다. 그 경우의 대안은 SketchUp에서 DAE·GLB로 내보내 가져오는 것이고, 실패 안내가 이 대안을 함께 보여줍니다. 변환 검증은 openskp 자체 작성기로 만든 실제 .skp 바이트의 왕복까지이며, 시중의 모든 .skp 변형을 대표하지는 않습니다.",
      en: "openskp is a young project, so some legacy .skp files fail to parse. The fallback is exporting DAE or GLB from SketchUp, and the failure message shows that alternative. Conversion is verified up to a round trip of real .skp bytes produced by openskp's own builder, which does not represent every .skp variant in the wild.",
    },
    technologies: ["openskp 1.3.0", "SketchUp .skp", "GLB / glTF", "dynamic import"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/bg3d/studio-bg3d-skp-converter.ts", ".skp → GLB 변환 파사드와 실패 구분", ".skp-to-GLB conversion facade with distinct failures"),
      evidence("test", "apps/web/src/domains/creator/bg3d/studio-bg3d-skp-converter.test.ts", "실제 .skp 바이트의 GLB 변환 왕복 검사", "Round-trip conversion test over real .skp bytes"),
      evidence("code", "apps/web/src/domains/creator/bg3d/studio-bg3d-model-import.ts", "가져오기 파이프라인의 skp 포맷 경로", "The skp format path in the import pipeline"),
    ],
    reuseSteps: [
      { ko: "독점 포맷은 파사드 한곳에서만 다루고, 변환 결과의 형식(매직 바이트)을 확인한 뒤 기존 파이프라인에 합류시킵니다.", en: "Handle a proprietary format in exactly one facade, verify the converted result's format (magic bytes), and only then join the existing pipeline." },
      { ko: "변환기 로드 실패와 파싱 실패를 서로 다른 오류로 구분해, 사용자에게 대안까지 안내합니다.", en: "Keep converter-load failure and parse failure as distinct errors, and show the user the fallback for each." },
      { ko: "변환기 검증은 가짜 모듈 단위 검사와 실제 작성기로 만든 파일의 왕복 검사를 분리해 둡니다.", en: "Separate facade unit tests with a fake module from a round-trip test over a file made by the real builder." },
    ],
  },
  {
    id: "wasm-fixed-simd",
    order: 39,
    status: "experimental",
    eyebrow: "39 · WASM FIXED SIMD",
    title: {
      ko: "Wasm 여섯 레인을 fixed SIMD로 다시 빌드했습니다",
      en: "Six Wasm lanes rebuilt with fixed SIMD",
    },
    thesis: {
      ko: "브라우저에서 도는 Wasm 여섯 레인(Vello CPU·GPU 렌더러, Hokusai 자연매체, 잉크 메시, 잉크 모델러, brush-lab의 먹물 커널)을 fixed SIMD128을 켜고 다시 빌드해 산출물을 교체했습니다. 먹물 커널만 외부 crate 없이 직접 짠 코드이고, 나머지는 외부 라이브러리를 ToonStudio가 직접 빌드한 것입니다. 전제부터 적습니다. 실제 브라우저에서 얼마나 빨라졌는지는 아직 측정하지 않았습니다.",
      en: "Six Wasm lanes that run in the browser—the Vello CPU and GPU renderers, the Hokusai natural-media wrapper, ink-mesh, ink-modeler and the brush-lab sumi ink kernel—were rebuilt with fixed SIMD128 enabled and their artifacts replaced. Only the sumi kernel is first-party code with no external crates; the others are third-party libraries that ToonStudio builds itself. The premise comes first: how much faster they run in a real browser has not been measured yet.",
    },
    problem: {
      ko: "rustc의 wasm32 기본 타깃에는 simd128이 없어, 빌드 플래그를 명시하지 않은 수치 커널은 스칼라 명령으로만 컴파일됩니다. 적용 전 산출물을 실측한 기록(Vello와 잉크 두 레인)에서 v128 명령은 0개였습니다. 벡터 연산이 가능한 커널이 벡터 명령 없이 배포되고 있었던 셈입니다.",
      en: "rustc's default wasm32 target does not include simd128, so numerical kernels built without an explicit flag compile to scalar instructions only. The recorded measurements of the pre-change artifacts (Vello and the two ink lanes) showed zero v128 instructions: kernels capable of vector math were shipping without any vector instructions.",
    },
    decision: {
      ko: "Rust 레인(Vello pkg·pkg-gpu, Hokusai 래퍼, 먹물 커널)은 RUSTFLAGS에 -C target-feature=+simd128을, C++ 레인(ink-mesh·ink-modeler)은 모든 컴파일·링크 단계에 -msimd128을 적용해 다시 빌드했습니다. 빌드 명령은 docs/engines/vello-baseline.md, 각 레인의 README와 빌드 스크립트에 고정돼 있습니다. fixed SIMD128은 Baseline Widely Available이라 지원 여부를 가르는 이중 빌드 없이 단일 바이너리로 배포하고, 산출물은 레인별 INTEGRITY.sha256으로 고정했습니다. wasm-opt는 Binaryen이 Rust 1.97의 bulk-memory·비포획 명령을 거부해서 Vello 크레이트 전체(CPU·GPU 두 레인)와 Hokusai 래퍼에서 꺼 두었고, LLVM 최적화와 LTO는 그대로입니다. 커밋된 산출물의 SIMD 명령을 직접 세어 보면 여섯 레인 모두 0보다 크고(먹물 커널이 12개로 가장 적습니다), 같은 저장소의 libmypaint와 ThorVG Wasm에는 SIMD 빌드 기록도 SIMD 명령도 없습니다.",
      en: "The Rust lanes (Vello pkg and pkg-gpu, the Hokusai wrapper, the sumi kernel) were rebuilt with -C target-feature=+simd128 in RUSTFLAGS, and the C++ lanes (ink-mesh, ink-modeler) with -msimd128 on every compile and link step. The build commands are pinned in docs/engines/vello-baseline.md and in each lane's README and build script. Because fixed SIMD128 is Baseline Widely Available, a single binary ships without a dual build, and each artifact is pinned by its lane's INTEGRITY.sha256. wasm-opt is switched off for the whole Vello crate (both the CPU and GPU lanes) and for the Hokusai wrapper because the Binaryen build rejects the bulk-memory and non-trapping instructions that Rust 1.97 emits; LLVM optimization and LTO stay on. Counting SIMD instructions directly in the committed artifacts shows more than zero in all six lanes (the sumi kernel has the fewest at 12), while the repository's libmypaint and ThorVG Wasm have neither a SIMD build record nor any SIMD instructions.",
    },
    userValue: {
      ko: "지금 체감이 달라졌다고 말하지는 않겠습니다. 확인된 변화는 커널이 실제로 벡터 명령을 쓰도록 빌드됐다는 사실뿐이고, 효과의 크기는 브라우저 실측이 끝난 뒤에야 이 페이지의 문장도 바뀝니다.",
      en: "Nothing here claims a felt speedup today. The verified change is only that the kernels are now built to actually use vector instructions; the size of the effect changes this page's wording only after browser measurement lands.",
    },
    tradeoff: {
      ko: "이 챕터의 상태가 실험인 이유가 이 전제입니다. v128 명령이 산출물에 들어간 것은 빌드 기록과 산출물 직접 확인으로 알 수 있지만, 실제 기기와 브라우저에서의 속도 이득 측정값은 아직 없습니다. 현재 산출물 크기는 CPU 레인 3,067,458바이트, GPU 레인 7,871,358바이트이고, 재빌드 전 크기 기록이 없어 SIMD 적용이나 wasm-opt 중단이 크기에 준 영향은 미확인입니다. 실측에서 이득이 확인되지 않으면 SIMD 유지, wasm-opt 재개(도구 호환이 풀릴 때), 크기 회수 중 하나로 다시 판단해야 합니다.",
      en: "That premise is why this chapter's status is experimental. v128 instructions in the artifacts are known from build records and direct inspection of the artifacts, but there is no measured speedup on real devices and browsers yet. The current artifact sizes are 3,067,458 bytes for the CPU lane and 7,871,358 bytes for the GPU lane; with no record of the pre-rebuild sizes, how much SIMD or the wasm-opt pause changed them is unconfirmed. If measurement shows no gain, the follow-up decision is one of keeping SIMD, resuming wasm-opt once the tooling is compatible, or reclaiming the size.",
    },
    technologies: ["Rust / WASM", "C++ / Emscripten", "fixed SIMD128", "wasm-pack", "INTEGRITY.sha256"],
    evidence: [
      evidence("document", "docs/engines/vello-baseline.md", "Vello 핀과 fixed SIMD 재빌드 명령 기록", "Vello pin and fixed-SIMD rebuild commands"),
      evidence("document", "packages/studio-brush-platform/src/ink-mesh/README.md", "ink-mesh의 -msimd128 빌드와 적용 전 실측 기록", "ink-mesh -msimd128 build and pre-change measurement notes"),
      evidence("document", "packages/studio-brush-platform/src/ink-modeler/README.md", "ink-modeler의 -msimd128 빌드 기록", "ink-modeler -msimd128 build notes"),
      evidence("code", "apps/brush-lab/wasm/sumi-kernel/build.sh", "먹물 커널(Rust, brush-lab 소속)의 +simd128 재현 빌드", "Reproducible +simd128 build of the sumi kernel (Rust, part of brush-lab)"),
      evidence("code", "scripts/verify-studio-hokusai-wasm.mjs", "Hokusai 래퍼의 +simd128 재현 빌드 검증", "Reproducible +simd128 build check for the Hokusai wrapper"),
      evidence("code", "crates/studio-engine-vello/Cargo.toml", "Vello 크레이트 전체의 wasm-opt 중단 설정과 사유", "Crate-wide wasm-opt pause for the Vello crate and its reason"),
    ],
    reuseSteps: [
      { ko: "Wasm 수치 커널을 빌드할 때는 타깃 기능을 명시하고, 적용 전 산출물의 실제 명령 구성을 실측해 가정을 확인합니다.", en: "State target features explicitly when building Wasm numerical kernels, and measure the actual instruction mix of the pre-change artifact to test the assumption." },
      { ko: "재빌드한 산출물은 레인별 무결성 해시로 고정해 어떤 바이너리가 배포되는지 추적 가능하게 둡니다.", en: "Pin rebuilt artifacts with per-lane integrity hashes so the shipped binary is always traceable." },
      { ko: "속도 이득은 브라우저 실측이 끝난 뒤에만 문구로 주장하고, 그 전에는 상태를 실험으로 둡니다.", en: "Claim speed gains in copy only after browser measurement finishes; until then, keep the status experimental." },
    ],
  },
  {
    id: "turn-credential-issuance",
    order: 40,
    status: "configured",
    eyebrow: "40 · TURN CREDENTIAL ISSUANCE",
    title: {
      ko: "TURN 중계 발급은 배선 완료, 켜는 키는 운영자 손에 있습니다",
      en: "TURN relay issuance is wired; the switch is an operator-held key",
    },
    thesis: {
      ko: "직접 P2P가 막히는 네트워크를 위한 TURN 중계 자격증명 발급이 실시간 Worker에 배선됐습니다. 클라이언트에는 네 시간짜리 단기 자격증명만 나가고, 발급용 API 토큰은 Worker secret으로만 보관합니다. 그 secret이 운영에 등록됐는지는 저장소에서 확인할 수 없어(미확인), 중계가 실제로 켜졌다고는 말하지 않습니다.",
      en: "TURN relay credential issuance for networks where direct P2P is blocked is wired into the realtime Worker. Clients receive only four-hour short-lived credentials, and the issuing API token lives solely as a Worker secret. Whether that secret is registered in production cannot be confirmed from the repository (unverified), so this chapter does not say the relay is actually switched on.",
    },
    problem: {
      ko: "대칭 NAT와 방화벽 뒤에서는 브라우저끼리 직접 연결을 만들지 못해 음성 허들이 닿지 않는 경우가 생깁니다. 중계가 필요하지만, 중계 자격증명을 클라이언트에 고정해 넣으면 누구나 가져다 쓸 수 있고, 발급 경로가 흉내만 내면 연결 실패의 이유가 정책인지 네트워크인지 구분할 수 없습니다.",
      en: "Behind symmetric NATs and firewalls, browsers sometimes cannot form a direct connection and voice huddles become unreachable. A relay is needed, but embedding relay credentials in the client hands them to anyone, and an issuance path that only pretends to work makes it impossible to tell whether a failure is policy or network.",
    },
    decision: {
      ko: "실시간 Worker(deploy/cloudflare-realtime/src/turn.ts)가 POST /v1/turn/credentials에서 실시간 티켓을 확인한 뒤 Cloudflare Realtime TURN 키로 단기 자격증명을 발급합니다. 클라이언트(live/studio-ice-configuration.ts)는 받은 정책을 메모리 캐시에 두고 수명의 20%가 남으면 새로 받으며, 발급이 없거나 실패하면 STUN 전용 구성으로 바로 폴백합니다. secret이 없거나 kill switch가 켜져 있으면 발급을 흉내 내지 않고 STUN 전용 정책을 그대로 반환하므로, 클라이언트는 중계 없이 기존 동작을 유지합니다. 화면 공유의 ICE는 이 경로가 아니라 Nest API가 발급하는 coturn REST 자격(기본 900초)을 따로 받습니다.",
      en: "The realtime Worker (deploy/cloudflare-realtime/src/turn.ts) verifies a realtime ticket at POST /v1/turn/credentials and issues short-lived credentials from a Cloudflare Realtime TURN key. The client (live/studio-ice-configuration.ts) keeps the returned policy in a memory cache, fetches a fresh one when 20% of its lifetime remains, and falls straight back to a STUN-only configuration when issuance is absent or fails. When the secret is absent or the kill switch is on, issuance is not faked: the endpoint returns an honest STUN-only policy and the client keeps its existing relay-free behavior. Screen-share ICE does not use this route; it separately receives coturn REST credentials (900 seconds by default) issued by the Nest API.",
    },
    userValue: {
      ko: "secret이 등록되는 날에는 클라이언트 코드를 다시 배포하지 않아도 중계 경로가 열립니다. 그 전까지 허들은 직접 연결이 되는 네트워크에서 동작하고, 중계가 없다는 사실은 정책 응답에 그대로 드러납니다.",
      en: "On the day the secret is registered, the relay path opens without redeploying client code. Until then, huddles work on networks where direct connection succeeds, and the absence of a relay is visible in the policy response itself.",
    },
    tradeoff: {
      ko: "이 챕터의 상태가 '설정 필요'인 이유입니다. 발급 코드와 단위 검사는 병합됐지만, REALTIME_TURN_KEY_ID와 REALTIME_TURN_API_TOKEN secret 등록은 운영자만 할 수 있는 단계이고 저장소에서는 등록 여부를 확인할 수 없습니다(미확인). 제한 NAT를 실제로 통과하는 중계 연결을 검증한 기록도 이 저장소에는 없으며, 이 챕터가 그 검증을 대신하지 않습니다.",
      en: "That is why this chapter's status is 'setup required'. The issuance code and its unit tests are merged, but registering the REALTIME_TURN_KEY_ID and REALTIME_TURN_API_TOKEN secrets is an operator-only step, and the repository cannot show whether it has happened (unverified). The repository also holds no record of a relayed connection actually traversing a restrictive NAT, and this chapter does not stand in for that verification.",
    },
    technologies: ["WebRTC ICE", "Cloudflare Realtime TURN", "STUN", "short-lived credentials", "Cloudflare Workers"],
    evidence: [
      evidence("code", "deploy/cloudflare-realtime/src/turn.ts", "TURN 자격증명 발급 엔드포인트와 STUN 전용 폴백", "TURN credential issuance endpoint with honest STUN-only fallback"),
      evidence("test", "deploy/cloudflare-realtime/src/turn.test.ts", "발급·미등록·kill switch 경로 검사", "Issuance, unregistered and kill-switch path tests"),
      evidence("code", "apps/web/src/domains/creator/live/studio-ice-configuration.ts", "Worker 발급 엔드포인트를 호출해 캐시·갱신하고 STUN 전용으로 폴백하는 클라이언트", "Client that calls the Worker issuance endpoint, caches and refreshes the policy, and falls back to STUN-only"),
    ],
    reuseSteps: [
      { ko: "공급자 토큰은 서버 secret으로만 보관하고, 클라이언트에는 시간 제한이 있는 자격증명만 발급합니다.", en: "Keep provider tokens as server secrets only, and issue clients nothing but time-limited credentials." },
      { ko: "설정이 비어 있을 때는 흉내 내지 말고 축소된 정책을 정직하게 반환해 클라이언트 폴백을 단순하게 유지합니다.", en: "When configuration is missing, return the reduced policy honestly instead of faking issuance, so the client fallback stays simple." },
      { ko: "발급 배선과 실제 연결 검증을 별도 단계로 기록하고, 키 등록 전에는 중계 품질을 주장하지 않습니다.", en: "Record issuance wiring and real connection verification as separate stages, and claim no relay quality before the keys are registered." },
    ],
  },
] as const satisfies readonly EngineeringChapter[];
