import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { commentedCode, t } from "./engineering-atlas-drawing-kit";

/**
 * 기술 도감 · drawing · 렌더러 카드.
 * 렌더러가 여럿 공존하는 구조(역할 원장), GPU 장치 공유, Skia 보존 표면, Rust/WASM 자연매체 붓을 다룬다.
 */

const ROLES = "packages/studio-engine-registry/src/renderer-roles.ts";
const FABRIC = "apps/web/src/domains/creator/render/studio-gpu-fabric.ts";
const SKIA = "packages/studio-engine-skia/src/document-renderer.ts";
const HOKUSAI_POLICY = "apps/web/src/domains/creator/brush/studio-brush-backend-quality-policy.ts";

export const ENGINEERING_ATLAS_DRAWING_ENGINES: readonly EngineeringAtlasEntry[] = [
  {
    id: "renderer-role-ledger",
    category: "drawing",
    name: "Renderer role ledger",
    title: t("렌더러가 많아도 '누가 무엇을 맡는지'는 기계가 검사한다", "With many renderers, a machine checks who owns what"),
    status: "live",
    tagline: t("엔진 20개의 역할을 코드 한 곳에 적고, 어긋나면 테스트가 깨지게 합니다.", "The roles of 20 engines live in one place in code, and drift breaks a test."),
    background: [
      t(
        "ToonStudio 에는 Konva, Canvas2D, Pixi, Vello, 전용 WebGPU 브러시, Hokusai, CanvasKit, Three, Babylon 처럼 렌더러가 여럿 공존합니다. 이럴 때 가장 큰 위험은 '코드는 A 가 그리는데 문서는 B 라고 말하는' 어긋남입니다. 실제로 매뉴얼의 'WebGPU 기반 캔버스' 같은 서술이 코드보다 먼저 낡았습니다. 그래서 역할을 글이 아니라 코드(원장)에 적고, 문서는 거기서 생성합니다.",
        "ToonStudio has many renderers side by side: Konva, Canvas2D, Pixi, Vello, a dedicated WebGPU brush, Hokusai, CanvasKit, Three and Babylon. The biggest risk is drift: code that draws with A while the documentation says B. Phrases like 'a WebGPU-based canvas' in the manual went stale before the code did. So roles are written in code (a ledger), and the documentation is generated from it.",
      ),
      t(
        "역할은 네 가지뿐입니다. primary(권위를 단독 소유), provider(명시적으로 선택되는 게이트형 엔진), reference(비교·골든 전용), lab(제품 호출부가 0건). 권위 13종마다 primary 는 정확히 1명이어야 하고, 없으면 이유를 적어야 합니다(현재는 필터 섬 1건). 테스트가 불변식, 근거 경로의 실재, 생성 문서와의 바이트 일치를 확인하고, 정규식 스캐너가 lab 엔진의 제품 import 가 0건임을 지킵니다.",
        "There are only four roles: primary (sole owner of an authority), provider (a gated engine chosen explicitly), reference (comparison and golden images only) and lab (zero product callers). Each of the 13 authorities needs exactly one primary, or a written reason why not (currently one: the filter island). Tests check the invariants, that evidence paths exist and that the generated document matches byte for byte, and a regex scanner keeps lab engines at zero product imports.",
      ),
      t(
        "엔진 선택 쪽에는 ProviderDescriptor(zod strict)와 레지스트리·플래너가 있습니다. 옛 fallbackProviderId 같은 필드는 조용히 사라지지 않고 거부되고, 플래너는 렌더러를 '섬(작업 단위)'으로 고르며 객체 단위로 바꾸지 않고 상호작용 중 GPU→CPU 읽기(readback)를 금지합니다. 벤치마크 우승자로 자동 전환하는 방식이 아니라 증거(토너먼트)와 권위(원장)를 분리했습니다.",
        "On the selection side there is a ProviderDescriptor (zod strict), a registry and a planner. A stale field such as fallbackProviderId is rejected instead of silently vanishing; the planner picks a renderer per island (unit of work), never per object, and forbids GPU-to-CPU readback during interaction. Instead of auto-switching to a benchmark winner, evidence (tournament) and authority (ledger) are kept separate.",
      ),
      t(
        "한계: 원장의 설명(note)과 근거(evidence)는 사람이 쓰므로 사실 오류가 남을 수 있습니다. 실제로 libmypaint 항목은 한동안 '호출부 0건'이라고 적혀 있었지만 선택 획 네이티브 변환 워커가 loadLibMypaint 를 호출하고 있었고, 발표 전 검증에서 찾아 문장을 고쳤습니다. 다만 역할 칸(reference, 비교 전용)이 이 사용을 반영하는지는 아직 검토 대상입니다. 기계가 지키는 것은 구조(소유자 수, 경로 실재, 문서 일치)이고, 문장의 정확성은 여전히 사람의 검토 몫입니다.",
        "A limit: the ledger's notes and evidence are written by people, so factual errors can remain. In fact the libmypaint entry used to say it had zero call sites while a native-conversion worker for selected strokes was calling loadLibMypaint; a pre-talk check found it and the sentence was fixed. Whether the role column (reference, comparison only) reflects that use is still open for review. Machines guard the structure (owner counts, path existence, document match); the accuracy of the prose still needs human review.",
      ),
    ],
    keyPoints: [
      t("권위 13종 중 12종은 primary 1명, 1종은 소유자 없음 선언(테스트 강제)", "12 of 13 authorities have one primary, 1 is declared ownerless (test-enforced)"),
      t("문서는 원장에서 생성, 손으로 고치면 테스트 실패", "Docs are generated; hand edits fail the test"),
      t("lab 엔진은 제품 import 0건을 스캐너가 증명", "A scanner proves lab engines have zero product imports"),
    ],
    diagram: {
      id: "renderer-role-ledger-diagram",
      kind: "layers",
      title: t("권위별 소유자 지도", "Who owns which authority"),
      caption: t("권위 12종은 소유자가 정확히 한 엔진이고, 나머지 1종은 '소유자 없음'을 이유와 함께 선언합니다.", "Twelve authorities each have exactly one owning engine, and the remaining one is declared 'no owner' with a reason."),
      alt: t(
        "위에서 아래로 화면·입력·선택은 Konva와 Pixi, 획 확정은 Canvas2D, 문서 벡터 표시는 Skia CanvasKit, 자연매체는 Hokusai, 선 기하·스케치·3D는 각 전용 라이브러리가 소유합니다. 이미지 필터는 소유자 없음으로 선언되고, 맨 아래의 제공자·참조·실험 엔진은 권위를 갖지 않습니다.",
        "From top to bottom: Konva and Pixi own display, input and selection; Canvas2D owns stroke commits; Skia CanvasKit owns the document vector island; Hokusai owns natural media; dedicated libraries own stroke geometry, sketch and 3D. Image filters are declared ownerless, and the providers, references and labs at the bottom hold no authority.",
      ),
      layers: [
        { id: "display", label: t("화면·입력·선택", "Display, input, selection"), sub: t("Konva 가 표시·입력·선택 chrome, Pixi 가 선택 오버레이 섬을 소유", "Konva owns display, input and selection chrome; Pixi owns the overlay island"), tone: "good", chips: ["Konva", "PixiJS"] },
        { id: "commit", label: t("획 확정(래스터)", "Stroke commit (raster)"), sub: t("Canvas2D 그리기 노드가 래스터 브러시 확정을 소유", "A Canvas2D draw node owns raster brush commits"), tone: "good", chips: ["Canvas2D"] },
        { id: "island", label: t("문서 벡터 표시 섬", "Document vector island"), sub: t("Skia CanvasKit 보존 표면이 승인된 요소의 표시를 소유(ADR-0025)", "A Skia CanvasKit retained surface owns display of approved elements (ADR-0025)"), tone: "good", chips: ["CanvasKit"] },
        { id: "media", label: t("자연매체", "Natural media"), sub: t("Hokusai WASM 이 연필·목탄·유화 계열 권위를 소유", "Hokusai WASM owns the pencil, charcoal and oil authority"), tone: "good", chips: ["Hokusai WASM"] },
        { id: "geometry", label: t("선 기하·스케치·경로·3D", "Geometry, sketch, paths, 3D"), sub: t("권위마다 전용 라이브러리 한 개씩", "One dedicated library per authority"), tone: "good", chips: ["perfect-freehand", "Rough.js", "CanvasKit", "Three.js", "Babylon.js"] },
        { id: "filter", label: t("이미지 필터: 소유자 없음", "Image filters: no owner"), sub: t("작업마다 플래너가 provider 하나를 고르고, 이유를 원장에 선언", "A planner picks one provider per job; the reason is declared"), tone: "warn", chips: ["WebGPU", "Dedicated Worker", "WASM"] },
        { id: "others", label: t("제공자·참조·실험", "Providers, references, labs"), sub: t("권위 없음: 선택형 provider, 비교용 reference, 호출 0건 lab", "No authority: opt-in providers, references, labs with zero callers"), tone: "neutral", chips: ["Vello", "ThorVG", "libmypaint", "Velato", "WESL"] },
      ],
      brackets: [
        { label: t("primary: 12종은 권위마다 정확히 1명", "primary: exactly 1 for each of 12"), layerIds: ["display", "commit", "island", "media", "geometry"] },
        { label: t("권위를 갖지 않는 쪽", "Holds no authority"), layerIds: ["filter", "others"] },
      ],
    },
    usage: [
      {
        feature: t("엔진 역할 원장(개발·품질 게이트)", "Engine role ledger (development and quality gate)"),
        role: t(
          "엔진 20개의 역할과 근거를 한 곳에 적고, 불변식 검사·경로 실재 검사·lab import 스캐너·생성 문서 일치를 테스트로 돌립니다.",
          "Records the role and evidence of 20 engines in one place, and tests run the invariant check, path-existence check, lab import scanner and generated-document match.",
        ),
        paths: [
          `${ROLES}#STUDIO_RENDERER_ROLE_LEDGER`,
          "docs/engines/renderer-roles.md",
          "scripts/generate-studio-renderer-roles.mts",
          "tests/integration/package-web/studio-engine-registry/renderer-roles.test.ts",
          "docs/adr/0019-renderer-role-ledger-single-authority.md",
        ],
      },
      {
        feature: t("이미지 필터 · 작업마다 provider 1개 선택", "Image filters · one provider per job"),
        role: t(
          "필터 레인(GPU 체인·워커·Konva 기본)을 레지스트리에 등록하고, 플래너가 작업마다 provider 하나와 가장 싼 전송 방식을 고릅니다.",
          "Registers the filter lanes (GPU chain, worker, native Konva) in the registry; the planner picks one provider and the cheapest transport for each job.",
        ),
        paths: [
          "apps/web/src/domains/creator/filter/studio-filter-island-plan.ts",
          "packages/studio-engine-registry/src/planner.ts",
          "packages/studio-engine-registry/src/descriptor.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("권위마다 primary 1명인지 검사하기", "Checking one primary per authority"),
        language: "ts",
        ...commentedCode(
          [
            "type Role = 'primary' | 'provider' | 'reference' | 'lab';",
            "interface Entry { id: string; role: Role; authorities: string[] }",
            "",
            "function issues(ledger: Entry[], authorities: string[]): string[] {",
            "  const out: string[] = [];",
            "  for (const e of ledger) {",
            "    // @0@",
            "    if (e.role !== 'primary' && e.authorities.length > 0) out.push(e.id + ': ' + e.role + ' must not own authority');",
            "  }",
            "  for (const a of authorities) {",
            "    const owners = ledger.filter((e) => e.role === 'primary' && e.authorities.includes(a));",
            "    // @1@",
            "    if (owners.length !== 1) out.push(a + ': expected exactly 1 primary owner, found ' + owners.length);",
            "  }",
            "  return out;",
            "}",
            "",
            "console.log(issues([",
            "  { id: 'konva', role: 'primary', authorities: ['document-display'] },",
            "  { id: 'vello', role: 'provider', authorities: ['document-display'] },",
            "], ['document-display'])); // @2@",
          ].join("\n"),
          [
            "provider·reference·lab 은 권위를 가질 수 없다",
            "권위마다 primary 소유자는 정확히 1명",
            "위반 1건: vello 는 provider 인데 권위를 주장했다",
          ],
          [
            "providers, references and labs may not own an authority",
            "every authority needs exactly one primary owner",
            "one violation: vello is a provider yet claims an authority",
          ],
        ),
        explain: t(
          "제품의 rendererRoleLedgerInvariants 가 하는 일을 줄인 것입니다. 실제 검사는 id 중복, 빈 근거, 목표 역할 오류, 소유자 없음 선언의 이유 유무까지 확인하고, 현재 원장에서는 위반이 0건입니다.",
          "A reduction of what the product's rendererRoleLedgerInvariants does. The real check also covers duplicate ids, empty evidence, target-role errors and whether an 'ownerless' declaration has a reason; the current ledger has zero violations.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Architecture Decision Records (ADR)", url: "https://adr.github.io/", kind: "guide", note: t("ADR-0018·0019 같은 결정 기록의 형식", "The format behind decision records such as ADR-0018 and ADR-0019") },
      { title: "Write the Docs · Docs as code", url: "https://www.writethedocs.org/guide/docs-as-code/", kind: "guide", note: t("문서를 코드처럼 생성·검사하는 방법", "Generating and testing documentation like code") },
      { title: "Zod · API reference", url: "https://zod.dev/api", kind: "docs", note: t("ProviderDescriptor 가 쓰는 .strict() 스키마", "The .strict() schemas used by ProviderDescriptor") },
      { title: "W3C · WebGPU", url: "https://www.w3.org/TR/webgpu/", kind: "spec" },
    ],
    chapterIds: ["brush-render-authority", "architecture"],
    talk: {
      pitch: t(
        "렌더러가 열 개 넘게 공존해도 누가 무엇을 맡는지는 문서가 아니라 코드 한 곳에 적고, 어긋나면 테스트가 깨지게 했습니다. 권위 13종 중 12종은 책임자가 정확히 한 명이고 나머지 1종(이미지 필터)은 '소유자 없음'을 이유와 함께 선언하며, 실험 엔진은 제품에서 호출되지 않는다는 것을 스캐너가 증명합니다.",
        "Even with a dozen renderers, who owns what is written in one place in code rather than in prose, and drift breaks a test. Of 13 authorities, 12 have exactly one owner and the remaining one (image filters) is declared ownerless with a reason, and a scanner proves experimental engines are never called by the product.",
      ),
      analogy: t(
        "건물의 열쇠 담당자 명부입니다. 방마다 열쇠 책임자는 딱 한 명이어야 하고, 명부와 실제 열쇠가 다르면 경비 시스템이 경보를 울립니다.",
        "It is a building's key-holder register. Each room has exactly one responsible key holder, and if the register and the real keys disagree, the security system raises an alarm.",
      ),
      questions: [
        {
          question: t("Vello 가 문서 엔진 아닌가요?", "Isn't Vello the document engine?"),
          answer: t(
            "ADR-0018 제목에는 Vello 가 있지만 현재 원장에서 문서 벡터 표시 섬의 primary 는 Skia CanvasKit 보존 표면이고, Vello 클래식·하이브리드는 provider, vello_cpu 는 비교용입니다. 문서 표시·입력·선택 권위는 여전히 Konva 가 갖고 있습니다.",
            "ADR-0018's title mentions Vello, but in the current ledger the primary of the document vector island is the Skia CanvasKit retained surface; Vello classic and hybrid are providers and vello_cpu is a reference. Document display, input and selection still belong to Konva.",
          ),
        },
        {
          question: t("토너먼트가 성능 우승자로 자동 전환하나요?", "Does the tournament auto-switch to the fastest engine?"),
          answer: t(
            "아닙니다. 토너먼트는 증거 수집용이고 실행·교체 권한이 없다고 모듈 주석이 밝힙니다. 결과를 다른 엔진으로 재시도해도 된다는 허가로 쓰지 않습니다.",
            "No. A module comment says the tournament only gathers evidence and has no authority to execute or replace a renderer; its result is never permission to retry elsewhere.",
          ),
        },
        {
          question: t("원장이 틀리면 어떻게 되나요?", "What if the ledger itself is wrong?"),
          answer: t(
            "구조(소유자 수, 경로 실재, 문서 일치)는 기계가 지키지만 설명 문장은 사람이 씁니다. 그래서 note 도 코드 리뷰 대상이며, 낡은 서술은 발견되는 대로 고칩니다.",
            "Machines guard the structure (owner counts, path existence, document match), but the prose is human-written. Notes are therefore reviewed like code, and stale statements are fixed when found.",
          ),
        },
      ],
      pitfall: t(
        "원장의 libmypaint 항목은 한때 'loadLibMypaint 호출부 0건'이라고 적혀 있었으나 워커(studio-native-brush-probe.worker.ts)가 호출하고 있어 문장을 고쳤습니다. 역할 칸(reference)이 이 사용과 맞는지는 아직 검토 중이니, 발표에서는 구조 검사까지만 보증한다고 말하세요.",
        "The ledger's libmypaint entry used to claim zero loadLibMypaint call sites, but a worker (studio-native-brush-probe.worker.ts) calls it, so the sentence was fixed. Whether the role column (reference) fits that use is still under review, so in a talk vouch only for the structural checks.",
      ),
    },
    technologies: ["Konva", "Canvas2D", "CanvasKit", "Vello", "WebGPU"],
    facts: [
      { value: "20", label: t("원장 항목 수(primary 10 · provider 6 · reference 2 · lab 2)", "Ledger entries (10 primary, 6 provider, 2 reference, 2 lab)"), source: ROLES },
      { value: "13", label: t("권위(authority) 종류 — 12종은 primary 1명, 1종은 소유자 없음 선언", "Authorities - 12 have one primary, 1 is declared ownerless"), source: ROLES },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "gpu-fabric-device-lease-vello",
    category: "drawing",
    name: "StudioGpuFabric",
    title: t("GPU 장치는 하나만 만들어 빌려 쓰고, Rust 렌더러가 그 장치를 입양하기", "One GPU device, leased to many, and adopted by a Rust renderer"),
    status: "live",
    tagline: t("GPU 장치를 한 곳에서만 만들고 참조 카운트로 빌려 쓰며, Rust(Vello)도 같은 장치를 씁니다.", "One GPU device is created in one place and leased by reference count; Rust (Vello) uses it too."),
    background: [
      t(
        "GPU 에 일을 시키려면 '장치(GPUDevice)'가 필요한데, 서로 다른 장치가 만든 그림은 CPU 를 거치지 않고는 주고받을 수 없습니다. 브러시·필터·벡터 렌더러가 각자 장치를 만들면 합성할 때마다 GPU→CPU→GPU 복사가 생겨 느려집니다. ToonStudio 는 장치를 한 곳(StudioGpuFabric)에서만 만들고, 다른 기능은 참조 카운트가 있는 대여(lease)로 빌려 씁니다.",
        "To give a GPU work you need a device (GPUDevice), and pictures made by different devices cannot be exchanged without going through the CPU. If brushes, filters and vector renderers each created their own, every composite would pay a GPU-to-CPU-to-GPU copy. ToonStudio creates the device in one place (StudioGpuFabric) and everyone else borrows it through reference-counted leases.",
      ),
      t(
        "첫 acquire 가 어댑터와 장치를 한 번만 만들고(동시 호출은 같은 Promise 를 기다림), 이후는 같은 장치의 lease 를 나눠 줍니다. 마지막 lease 가 반납돼도 장치를 없애지 않아 60fps 미리보기가 매 프레임 빌리고 반납해도 안전합니다. 장치 손실(device.lost)이 오면 세대(epoch)마다 한 번만 소비자들에게 알리고 상태를 비우며, 의도한 종료는 손실로 알리지 않습니다. 장치 능력(최대 텍스처 크기 등)은 생성 때 한 번만 조사해 캐시합니다.",
        "The first acquire creates the adapter and device once (concurrent calls wait on the same promise); later calls hand out leases on that device. Returning the last lease does not destroy it, so a 60 fps preview can borrow and return every frame safely. On device loss (device.lost) consumers are told once per epoch and state is cleared, while a planned shutdown is not reported as a loss. Capabilities such as maximum texture size are probed once at creation and cached.",
      ),
      t(
        "Rust 쪽 난관: Vello 가 쓰는 wgpu 29 에는 밖에서 만든 WebGPU 장치를 입양하는 API 가 없습니다. 그래서 crates.io 의 wgpu 29.0.4 를 그대로 가져와(vendoring) 입양 패치 6조각을 기능 플래그 뒤에 두었습니다. 플래그를 끄면 상류와 같은 코드라 상류 회귀 탐지기 역할도 합니다. Vello 는 fabric 의 장치를 입양하고 결과를 GPU 텍스처로 돌려주며, 제품 핫패스에는 CPU 읽기가 없습니다(포크 자체는 오픈소스 카드 oss-fork-wgpu-toon 참고).",
        "The Rust-side obstacle: wgpu 29, which Vello uses, has no API to adopt a WebGPU device created elsewhere. So wgpu 29.0.4 from crates.io is vendored with six patch hunks behind a feature flag; with the flag off it is the upstream code, which doubles as an upstream-regression detector. Vello adopts the fabric's device and returns results as a GPU texture, with no CPU readback on the product hot path (the fork itself is covered by the open-source card oss-fork-wgpu-toon).",
      ),
      t(
        "한계: 장치 손실은 모든 소비자에게 동시에 영향을 주므로 세대 통지와 소비자별 복구가 필수입니다. '단일 장치'는 방향이자 계약이며 전수 이관이 끝난 것은 아닙니다(아래 pitfall). 또 현재 /studio 의 문서 표시 슬롯은 Skia 표면이 소유하고, Vello 는 검증된 비교·명시적 provider 경로로 유지됩니다. GPU 등급과 복구 정책은 웹 플랫폼 카드 webgpu-tier-budget-recovery 를 보세요.",
        "Limits: a device loss hits every consumer at once, so epoch notification and per-consumer recovery are essential. 'A single device' is a direction and a contract, not a finished migration (see the pitfall). And the document display slot in /studio is currently owned by the Skia surface; Vello remains a verified comparison and explicit-provider path. For GPU tiers and recovery policy, see the web-platform card webgpu-tier-budget-recovery.",
      ),
    ],
    keyPoints: [
      t("GPU 장치는 하나, 소비자는 참조 카운트로 대여", "One GPU device; consumers lease it by reference count"),
      t("마지막 반납에도 장치 유지, 손실은 세대마다 1회 통지", "Device survives the last return; loss is announced once per epoch"),
      t("Rust 렌더러는 wgpu 입양 패치로 같은 장치를 사용", "The Rust renderer adopts the same device via a wgpu patch"),
    ],
    diagram: {
      id: "gpu-fabric-device-lease-vello-diagram",
      kind: "sequence",
      title: t("장치 대여와 Vello의 입양", "Device lease and Vello's adoption"),
      caption: t("장치는 한 번만 만들고, Vello 는 같은 장치임을 확인한 뒤 복사 없이 텍스처를 돌려줍니다.", "The device is created once; Vello confirms it is the same device and returns textures without copying."),
      alt: t(
        "기능이 acquire 를 호출하면 fabric 이 브라우저에서 장치를 한 번 얻어 lease 로 빌려 줍니다. Vello 허브도 같은 장치를 빌려 Rust 쪽에 adoptGpuDevice 로 넘기고, 같은 장치인지 확인한 뒤 장면을 렌더해 GPU 텍스처를 돌려받습니다. 장치가 손실되면 fabric 이 세대마다 한 번 알립니다.",
        "A feature calls acquire and the fabric gets a device from the browser once and lends it as a lease. The Vello hub borrows the same device and passes it to Rust through adoptGpuDevice, checks it is the same device, then renders and receives a GPU texture. If the device is lost, the fabric announces it once per epoch.",
      ),
      actors: [
        { id: "feature", label: t("기능", "Feature"), sub: t("필터·강모", "Filters, bristles"), tone: "local" },
        { id: "fabric", label: t("StudioGpuFabric", "StudioGpuFabric"), sub: t("장치 브로커", "Device broker"), tone: "good" },
        { id: "gpu", label: t("브라우저 WebGPU", "Browser WebGPU"), tone: "edge" },
        { id: "hub", label: t("Vello 허브", "Vello hub"), sub: t("TypeScript", "TypeScript"), tone: "local" },
        { id: "vello", label: t("Vello", "Vello"), sub: t("Rust · WASM", "Rust, WASM"), tone: "ai" },
      ],
      messages: [
        { from: "feature", to: "fabric", label: t("acquire()", "acquire()") },
        { from: "fabric", to: "gpu", label: t("requestAdapter → requestDevice", "requestAdapter -> requestDevice"), note: t("한 번만 · 동시 호출은 같은 Promise 대기", "Once; concurrent calls share one promise") },
        { from: "gpu", to: "fabric", label: t("GPUDevice", "GPUDevice"), style: "dashed" },
        { from: "fabric", to: "feature", label: t("lease(device, epoch)", "lease(device, epoch)"), style: "dashed", note: t("참조 카운트 +1", "Reference count +1") },
        { from: "hub", to: "fabric", label: t("acquire()", "acquire()"), note: t("같은 장치를 빌림", "Borrows the same device") },
        { from: "hub", to: "vello", label: t("adoptGpuDevice(device)", "adoptGpuDevice(device)"), note: t("wgpu 입양 패치", "Via the wgpu adoption patch") },
        { from: "vello", to: "hub", label: t("gpuDeviceHandle() 로 확인", "Verified via gpuDeviceHandle()"), style: "dashed", note: t("참조가 같지 않으면 오류", "An error unless the reference is identical") },
        { from: "vello", to: "vello", label: t("장면 렌더 → GPUTexture", "Render scene -> GPUTexture"), note: t("CPU 읽기 없음", "No CPU readback") },
        { from: "gpu", to: "fabric", label: t("device.lost", "device.lost"), style: "dashed", note: t("세대마다 1회 통지 후 상태 비움", "Announced once per epoch, then state cleared") },
      ],
    },
    usage: [
      {
        feature: t("GPU 필터(밝기·HSL·레벨·커브·컬러밸런스)", "GPU filters (brightness, HSL, levels, curves, color balance)"),
        role: t(
          "기본 제품 경로가 fabric 의 장치를 빌려 필터 런타임을 올립니다.",
          "The default product path leases the fabric's device to host the filter runtime.",
        ),
        paths: [`${FABRIC}#acquireStudioGpuDevice`, "apps/web/src/domains/creator/render/studio-gpu-filter-apply.ts"],
        route: "/studio",
      },
      {
        feature: t("GPU 강모 유화 브러시", "GPU bristle oil brush"),
        role: t(
          "강모 런타임이 같은 장치를 빌리고 장치 손실 통지를 받습니다.",
          "The bristle runtime leases the same device and receives device-loss notices.",
        ),
        paths: ["apps/web/src/domains/creator/render/studio-gpu-bristle-runtime.ts"],
        route: "/studio",
      },
      {
        feature: t("Vello 벡터 장면 렌더(비교·명시 provider)", "Vello vector scene rendering (comparison, explicit provider)"),
        role: t(
          "Vello 허브가 fabric 의 장치를 참조 동일성까지 확인해 입양하고 텍스처를 복사 없이 넘깁니다.",
          "The Vello hub adopts the fabric's device, verifying reference identity, and passes textures without copying.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-vello-hub.ts",
          "crates/studio-engine-vello/src/gpu_web.rs",
          "crates/vendor/wgpu-toon/PATCHES/0001-webgpu-handle-adoption.patch",
        ],
      },
      {
        feature: t("안전 모드(장치 손실 뒤 복구)", "Safe mode (recovery after device loss)"),
        role: t(
          "장치 손실 통지를 받으면 fabric 에서 새 장치를 다시 빌려 복구합니다.",
          "On a device-loss notice it leases a fresh device from the fabric to recover.",
        ),
        paths: ["apps/web/src/domains/creator/studio-safe-mode-runtime.ts"],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("참조 카운트 lease 로 장치 빌리기", "Borrowing a device with reference-counted leases"),
        language: "ts",
        ...commentedCode(
          [
            "let pending: Promise<GPUDevice | null> | null = null;",
            "let leases = 0;",
            "export const activeLeases = (): number => leases;",
            "",
            "// @0@",
            "export async function acquire() {",
            "  pending ??= (async () => {",
            "    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });",
            "    const device = (await adapter?.requestDevice()) ?? null;",
            "    void device?.lost.then(() => { pending = null; }); // @1@",
            "    return device;",
            "  })();",
            "  const device = await pending;",
            "  if (!device) return null;",
            "  let released = false;",
            "  leases += 1;",
            "  return { device, release() { if (!released) { released = true; leases -= 1; } } };",
            "}",
          ].join("\n"),
          [
            "물리 GPUDevice 는 하나만 만들고, 소비자는 참조 카운트 lease 로 빌린다(마지막 반납에도 파기하지 않는다).",
            "손실되면 비우고, 다음 acquire 가 새로 시도한다",
          ],
          [
            "Create only one physical GPUDevice; consumers borrow it through reference-counted leases (not destroyed on the last return).",
            "on loss, clear it so the next acquire tries again",
          ],
        ),
        explain: t(
          "제품의 acquireStudioGpuDevice 를 줄인 것입니다. 실제 코드는 능력 캐시, 세대(epoch) 통지, 획득 도중 dispose, 필터 런타임용 파사드 장치(destroy 를 반납으로 바꿈)까지 다룹니다.",
          "A reduction of the product's acquireStudioGpuDevice. The real code also handles capability caching, epoch notification, dispose during acquisition, and a facade device for the filter runtime that turns destroy into a return.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "W3C · WebGPU", url: "https://www.w3.org/TR/webgpu/", kind: "spec" },
      { title: "MDN · GPUDevice.lost", url: "https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost", kind: "docs", note: t("장치 손실을 알리는 Promise", "The promise that announces device loss") },
      { title: "MDN · WebGPU API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API", kind: "docs" },
      { title: "wgpu", url: "https://github.com/gfx-rs/wgpu", kind: "repo", note: t("Rust 의 WebGPU 구현. 입양 패치의 대상", "Rust's WebGPU implementation, the target of the adoption patch") },
      { title: "Vello", url: "https://github.com/linebender/vello", kind: "repo", note: t("GPU 컴퓨트 기반 2D 벡터 렌더러", "A GPU-compute 2D vector renderer") },
    ],
    chapterIds: ["wasm-fixed-simd", "brush-render-authority"],
    talk: {
      pitch: t(
        "서로 다른 GPU 장치가 만든 그림은 복사 없이 주고받을 수 없습니다. 그래서 장치를 한 곳에서만 만들고 필터·브러시·벡터 렌더러가 참조 카운트로 빌려 씁니다. Rust 로 만든 Vello 도 이 장치를 입양하도록 wgpu 에 작은 패치를 얹었습니다.",
        "Pictures made by different GPU devices cannot be exchanged without copying. So the device is created in one place and filters, brushes and vector renderers lease it by reference count. Vello, written in Rust, adopts the same device thanks to a small patch on wgpu.",
      ),
      analogy: t(
        "공용 작업대 하나를 여러 장인이 번갈아 쓰는 공방입니다. 재료(텍스처)를 다른 작업대로 옮기지 않고 그 자리에서 다음 장인에게 넘길 수 있습니다.",
        "It is a workshop where several craftspeople share one workbench. Material (a texture) can be handed to the next craftsperson on the spot instead of being carried to another bench.",
      ),
      questions: [
        {
          question: t("왜 wgpu 를 포크했나요?", "Why was wgpu forked?"),
          answer: t(
            "wgpu 29 에 외부 GPUDevice 를 입양하는 API 가 없다는 것이 저장소 문서의 실측 근거입니다. 패치는 기능 플래그 뒤에 두고 플래그를 끄면 상류와 같게 유지하며, 드리프트를 막는 해시 목록과 패리티 테스트가 설계돼 있습니다(현재 상태는 아래 주의 참고). 포크의 라이선스와 관리 방식은 오픈소스 카드에서 다룹니다.",
            "The repository documents that wgpu 29 has no API to adopt an external GPUDevice. The patch sits behind a feature flag, stays identical to upstream when it is off, and a hash list plus a parity test are designed to catch drift (see the caution below for their current state). The fork's licensing and upkeep are covered in the open-source cards.",
          ),
        },
        {
          question: t("장치가 죽으면 모든 기능이 같이 멈추나요?", "If the device dies, does everything stop together?"),
          answer: t(
            "같이 영향을 받습니다. 그래서 세대(epoch) 단위로 한 번만 알리고 소비자별로 복구하며, 안전 모드가 새 장치를 다시 빌립니다. 획 도중이면 마지막 정상 프레임을 유지합니다.",
            "They are affected together, which is why loss is announced once per epoch, each consumer recovers on its own, and safe mode leases a new device. Mid-stroke, the last good frame is kept.",
          ),
        },
        {
          question: t("Vello 가 지금 화면을 그리나요?", "Does Vello draw the screen today?"),
          answer: t(
            "현재 /studio 의 문서 표시 슬롯은 Skia 표면이 소유하고, Vello 는 검증된 비교·명시적 provider 경로입니다. 실패 뒤 자동으로 호출되지도 않습니다(원장 note 기준).",
            "The document display slot in /studio is currently owned by the Skia surface; Vello is a verified comparison and explicit-provider path, and is never called automatically after a failure (per the ledger note).",
          ),
        },
      ],
      pitfall: t(
        "'단일 장치'는 방향이자 계약이고 전수 이관은 아닙니다. fabric 자신을 포함해 16개 비테스트 파일이 requestDevice 를 직접 호출합니다(벤치마크·실험 앱·워커 포함, 2026-10-08 grep). 실기기에서 장치 손실을 재현한 결과는 이 카드에서 확인하지 못했습니다. 포크의 드리프트 방지 테스트(vendor_patch_parity)는 실행하지 않았고, 해시 목록(UPSTREAM.sha256)에 있는 Cargo.toml.orig 가 트리에 없으며 이 테스트를 부르는 CI 연결도 찾지 못했습니다.",
        "'A single device' is a direction and a contract, not a finished migration. Including the fabric itself, 16 non-test files call requestDevice directly (benchmarks, lab apps and workers among them; grep on 2026-10-08). Reproducing device loss on real hardware was not verified for this card. The fork's drift test (vendor_patch_parity) was not run, Cargo.toml.orig, which the hash list (UPSTREAM.sha256) names, is missing from the tree, and no CI wiring for that test was found.",
      ),
    },
    technologies: ["WebGPU", "Vello", "wgpu", "Rust / WASM"],
    facts: [
      { value: "29.0.4", label: t("고정한 wgpu 버전(포크 기준)", "Pinned wgpu version (the fork's base)"), source: "crates/studio-engine-vello/Cargo.toml" },
      { value: "6", label: t("입양 패치 조각 수(toon-fabric 피처 뒤)", "Patch hunks behind the toon-fabric feature"), source: "crates/studio-engine-vello/Cargo.toml" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "skia-canvaskit-retained-surface",
    category: "drawing",
    name: "CanvasKit",
    title: t("요소마다 한 번 녹화해 두고, 바뀐 것만 다시 그리는 GPU 표시 섬", "Record each element once and redraw only what changed"),
    status: "live",
    tagline: t("그리기 명령을 SkPicture 로 한 번 녹화해 재사용하고, 바뀐 요소만 GPU 에 더합니다.", "Drawing commands are recorded once as SkPictures and reused; only changed elements are added on the GPU."),
    background: [
      t(
        "문서에 선이 수천 개 쌓이면 줌·팬 때마다 모든 선을 처음부터 다시 그리는 방식은 느려집니다. 영화 필름을 한 장씩 다시 그리는 대신 장면을 녹화해 둔 '재생 목록'을 다시 틀면 됩니다. Skia 의 SkPicture 가 바로 그 녹화본(디스플레이 리스트)이고, CanvasKit 은 Skia 를 WebAssembly 와 WebGL 로 브라우저에 가져온 것입니다.",
        "When thousands of strokes pile up, redrawing every stroke from scratch on each zoom or pan gets slow. Instead of repainting every film frame, you replay a recorded playlist. Skia's SkPicture is that recording (a display list), and CanvasKit brings Skia to the browser through WebAssembly and WebGL.",
      ),
      t(
        "문서 요소마다 PictureRecorder 로 한 번만 녹화해 id 와 리비전으로 캐시합니다(리비전이 같으면 다시 컴파일하지 않음). 요소는 최대 128개씩 배치로 묶고, 하나가 바뀌면 그 배치만 다시 만듭니다. 화면에는 변화 없음(cached), 같은 카메라에서 추가만(append: 추가분만 그림), 최근 뷰포트 복원(restored), 전체(full) 중 하나가 선택됩니다.",
        "Each document element is recorded once with a PictureRecorder and cached by id and revision (an unchanged revision is not recompiled). Elements are grouped into batches of at most 128, and only the batch that changed is rebuilt. Each frame is presented as one of: cached (nothing changed), append (same camera, draw only the additions), restored (recent viewport snapshot) or full.",
      ),
      t(
        "안전장치: Konva 원본은 정확히 같은 소스 리비전의 '가시 프레임 영수증'을 받은 뒤에만 숨깁니다. 지원 밖이거나 실패하면 Konva 가 그대로 보입니다(fail-visible). WebGL2 를 못 얻으면 소프트웨어 폴백 없이 닫히고 같은 엔진의 명시적 복구만 제공합니다. SkPicture 같은 WASM 객체는 직접 해제해야 누수가 없습니다.",
        "Safeguards: the original Konva nodes are hidden only after a visible-frame receipt for the exact same source revision. Unsupported or failed cases simply stay visible in Konva (fail-visible). If WebGL2 is unavailable the surface closes with no software fallback and offers only explicit recovery of the same engine. WASM objects such as SkPicture must be freed by hand to avoid leaks.",
      ),
      t(
        "범위: '에디터가 Skia 로 바뀌었다'가 아니라 승인된 요소(일반 선화·마커·확정 지우개, 지원 벡터, 가로쓰기 단색 텍스트, 정적 이미지)의 '표시'가 옮겨졌다는 뜻입니다. 문서·Undo·입력 권위는 그대로입니다. 그라디언트·세로쓰기·미지원 블렌드 같은 조합은 호환 경계에 남아 있습니다.",
        "Scope: this does not mean the editor became Skia; the display of approved elements (ordinary line art, markers, committed erasers, supported vectors, horizontal solid-color text, static images) moved over. Document, undo and input authority are unchanged, and combinations such as gradients, vertical text and unsupported blends stay on the compatibility boundary.",
      ),
    ],
    keyPoints: [
      t("요소별 SkPicture 를 한 번 녹화해 revision 으로 재사용", "Record each element's SkPicture once and reuse by revision"),
      t("128개 배치 · 바뀐 배치만 재생성, 추가분만 그리기", "Batches of 128; rebuild only changed ones, draw only additions"),
      t("영수증을 받은 뒤에만 Konva 원본을 숨김(실패하면 보임)", "Hide Konva only after a receipt; on failure it stays visible"),
    ],
    diagram: {
      id: "skia-canvaskit-retained-surface-diagram",
      kind: "layers",
      title: t("문서가 화면에 올라오는 스택", "The stack that puts a document on screen"),
      caption: t("승인된 요소만 보존 표면이 그리고, 영수증 게이트가 Konva 를 숨겨도 되는 순간을 정합니다.", "Only approved elements go through the retained surface, and a receipt gate decides when Konva may be hidden."),
      alt: t(
        "맨 위는 입력과 선택을 맡는 Konva입니다. 그 아래 Skia 보존 표면이 요소별 SkPicture를 128개 배치로 묶어 WebGL2 캔버스에 그립니다. 영수증 게이트가 같은 리비전의 프레임이 보인 뒤에만 Konva 원본을 숨기고, 맨 아래 호환 경계는 미지원 요소를 Konva로 계속 보여 줍니다.",
        "At the top, Konva handles input and selection. Below it the Skia retained surface groups per-element SkPictures into batches of 128 and draws them to a WebGL2 canvas. A receipt gate hides the Konva originals only after a frame of the same revision is visible, and the compatibility boundary at the bottom keeps unsupported elements visible through Konva.",
      ),
      layers: [
        { id: "konva", label: t("입력·선택·변형 chrome", "Input, selection, transform chrome"), sub: t("문서 표시·포인터·선택은 여전히 Konva 가 소유", "Konva still owns display, pointer and selection"), tone: "local", chips: ["Konva"] },
        { id: "pictures", label: t("요소별 SkPicture 캐시", "Per-element SkPicture cache"), sub: t("id + revision 이 같으면 다시 녹화하지 않음", "No re-recording when id and revision match"), tone: "good", chips: ["CanvasKit", "SkPicture"] },
        { id: "batch", label: t("배치(최대 128개)", "Batches (up to 128)"), sub: t("항목 하나가 바뀌면 그 배치만 다시 만든다", "A change rebuilds only its own batch"), tone: "good" },
        { id: "canvas", label: t("WebGL2 캔버스", "WebGL2 canvas"), sub: t("cached · append · restored · full 중 하나로 표시", "Presented as cached, append, restored or full"), tone: "edge", chips: ["WebGL2"] },
        { id: "receipt", label: t("영수증 게이트", "Receipt gate"), sub: t("같은 리비전의 가시 프레임 영수증 뒤에만 Konva 원본을 숨김", "Konva originals hidden only after a same-revision visible receipt"), tone: "warn" },
        { id: "compat", label: t("호환 경계(fail-visible)", "Compatibility boundary"), sub: t("미지원·실패는 Konva 가 그대로 보여 준다", "Unsupported or failed elements stay visible in Konva"), tone: "neutral" },
      ],
      brackets: [
        { label: t("ADR-0025 보존 표시 섬", "ADR-0025 retained display island"), layerIds: ["pictures", "batch", "canvas", "receipt"] },
      ],
    },
    usage: [
      {
        feature: t("캔버스 편집기 · 문서 표시(줌·팬)", "Canvas editor · document display (zoom, pan)"),
        role: t(
          "승인된 선화·마커·벡터·텍스트·이미지를 보존 표면으로 그려, 줌·팬 때 다시 녹화하지 않고 재생합니다.",
          "Draws approved line art, markers, vectors, text and images through the retained surface, replaying instead of re-recording on zoom and pan.",
        ),
        paths: [
          SKIA,
          "apps/web/src/domains/creator/render/StudioSkiaDocumentSurface.tsx",
          "apps/web/src/domains/creator/canvas/StudioCanvasViewportDomOverlays.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("영수증 게이트와 호환 경계", "Receipt gate and compatibility boundary"),
        role: t(
          "같은 리비전의 가시 프레임 영수증 뒤에만 Konva 문서 노드를 숨기고, 미지원 요소는 Konva 로 계속 보여 줍니다.",
          "Hides Konva document nodes only after a same-revision visible-frame receipt, and keeps unsupported elements visible through Konva.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-skia-presentation-fence.ts",
          "apps/web/src/domains/creator/render/studio-skia-document-plan.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("내보내기(지원 페이지)", "Export (supported pages)"),
        role: t(
          "지원되는 페이지는 분리된 Skia 표면에서 정확한 리비전으로 내보내고, 미지원 조합은 기존 내보내기를 유지합니다.",
          "Supported pages export from a detached Skia surface at the exact revision; unsupported combinations keep the existing exporter.",
        ),
        paths: ["apps/web/src/domains/creator/render/studio-skia-document-export.ts"],
        route: "/studio",
      },
      {
        feature: t("경로 연산 품질(PathOps)", "Path-operation quality (PathOps)"),
        role: t(
          "Skia PathOps 로 경로 합치기·획 확장 같은 품질 연산을 Worker 에서 수행합니다.",
          "Runs quality operations such as path union and stroke expansion with Skia PathOps in a Worker.",
        ),
        paths: ["apps/web/src/domains/creator/render/studio-canvaskit-quality-engine.ts"],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("요소마다 한 번만 녹화하는 SkPicture 캐시", "A SkPicture cache that records each element once"),
        language: "ts",
        ...commentedCode(
          [
            "import type { Canvas, CanvasKit, SkPicture } from 'canvaskit-wasm';",
            "",
            "const cache = new Map<string, { revision: object; picture: SkPicture }>();",
            "",
            "// @0@",
            "export function pictureFor(",
            "  ck: CanvasKit,",
            "  id: string,",
            "  revision: object,",
            "  bounds: [number, number, number, number],",
            "  draw: (canvas: Canvas) => void,",
            "): SkPicture {",
            "  const hit = cache.get(id);",
            "  if (hit?.revision === revision) return hit.picture; // @1@",
            "  hit?.picture.delete(); // @2@",
            "  const recorder = new ck.PictureRecorder();",
            "  draw(recorder.beginRecording(bounds, true));",
            "  const picture = recorder.finishRecordingAsPicture();",
            "  recorder.delete();",
            "  cache.set(id, { revision, picture });",
            "  return picture;",
            "}",
          ].join("\n"),
          [
            "항목(id)마다 한 번만 녹화한 SkPicture 를 보관하고, revision 이 바뀐 항목만 다시 녹화한다.",
            "기하 재사용: 다시 컴파일하지 않는다",
            "WASM 객체는 명시적으로 해제한다",
          ],
          [
            "Keep one recorded SkPicture per item id and re-record only items whose revision changed.",
            "geometry reuse: nothing is recompiled",
            "WASM objects must be freed explicitly",
          ],
        ),
        explain: t(
          "제품의 document-renderer 는 이 아이디어에 128개 배치 합성, 승인 예산(128MiB), 영수증 검증을 더합니다. revision 이 같은지 객체 참조로 비교하므로 내용을 훑지 않아도 됩니다.",
          "The product's document-renderer adds 128-item batching, an admission budget (128 MiB) and receipt validation to this idea. Revisions are compared by object reference, so contents need not be scanned.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Skia · CanvasKit", url: "https://skia.org/docs/user/modules/canvaskit/", kind: "docs", note: t("Skia 를 WASM·WebGL 로 가져온 모듈 문서", "Docs for the module that brings Skia to WASM and WebGL") },
      { title: "Skia · SkPicture API", url: "https://api.skia.org/classSkPicture.html", kind: "docs" },
      { title: "MDN · webglcontextlost event", url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event", kind: "docs", note: t("컨텍스트 손실을 처리해야 하는 이유", "Why context loss must be handled") },
      { title: "Skia", url: "https://github.com/google/skia", kind: "repo" },
    ],
    chapterIds: ["brush-render-authority", "architecture"],
    talk: {
      pitch: t(
        "문서에 선이 많아도 줌과 팬이 부드럽도록, 요소마다 그리는 명령을 한 번만 녹화해 두고 바뀐 것만 다시 그립니다. 다만 에디터 전체가 Skia 로 바뀐 것은 아니고, 승인된 요소의 화면 표시만 이 방식으로 옮겨졌습니다.",
        "To keep zoom and pan smooth even with many strokes, each element's drawing commands are recorded once and only what changed is redrawn. The editor did not become Skia, though; only the on-screen display of approved elements moved to this approach.",
      ),
      analogy: t(
        "애니메이션 셀화를 한 번 그려 두고 카메라만 움직여 다시 촬영하는 것과 같습니다. 새 컷이 추가되면 그 컷만 새로 그립니다.",
        "It is like drawing animation cels once and re-shooting with a moving camera; when a new cel is added, only that cel is drawn.",
      ),
      questions: [
        {
          question: t("에디터가 Skia 로 바뀐 건가요?", "Did the editor switch to Skia?"),
          answer: t(
            "아닙니다. ADR-0025 가 밝히듯 승인된 요소의 표시 섬이고, 문서·Undo·입력·선택 권위는 Konva 에 남아 있습니다.",
            "No. As ADR-0025 states, this is a display island for approved elements; document, undo, input and selection authority remain with Konva.",
          ),
        },
        {
          question: t("WebGL2 가 안 되면 어떻게 되나요?", "What if WebGL2 is unavailable?"),
          answer: t(
            "소프트웨어 폴백 없이 닫히고 문서는 Konva 로 계속 보입니다. 화면에는 같은 GPU 엔진을 다시 준비하는 버튼과 안내가 나타납니다.",
            "It closes without a software fallback and the document stays visible through Konva. The screen shows a notice and a button to prepare the same GPU engine again.",
          ),
        },
        {
          question: t("메모리는 어떻게 제한하나요?", "How is memory bounded?"),
          answer: t(
            "SkPicture 는 128MiB 승인 예산, 뷰포트 스냅샷은 최대 3장·논리 32MiB, GPU 자원 캐시는 64MiB 한도를 요청합니다(코드·ADR 기준). 드라이버가 보고하는 실제 사용량은 없을 수 있습니다.",
            "SkPictures have a 128 MiB admission budget, viewport snapshots keep at most three images and 32 MiB logical storage, and a 64 MiB GPU resource cache limit is requested (per code and ADR). Driver-reported usage may be unavailable.",
          ),
        },
      ],
      pitfall: t(
        "물리 펜과 30·120분 실기기 인증은 운영 인수 게이트로 남아 있고, 소프트웨어 검증으로 주장하지 않습니다(ADR-0025). 줌·팬 성능 수치는 이 카드에서 확인하지 못했습니다. 마운트 코드의 변수 이름은 아직 옛 Vello 슬롯(velloHubAuthority)을 씁니다.",
        "Physical-pen and 30/120-minute real-device certification remain operational acceptance gates and are not claimed by software tests (ADR-0025). Zoom and pan performance figures were not verified for this card. The mount code still uses the old Vello slot name (velloHubAuthority).",
      ),
    },
    technologies: ["CanvasKit", "WebGL2", "Konva", "WebAssembly"],
    facts: [
      { value: "128", label: t("SkPicture 배치 하나에 묶는 최대 항목 수", "Maximum items grouped into one SkPicture batch"), source: SKIA },
      { value: "0.41.1", label: t("고정한 canvaskit-wasm 버전(WebGL 빌드)", "Pinned canvaskit-wasm version (WebGL build)"), source: "packages/studio-engine-skia/package.json" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "hokusai-wasm-natural-media",
    category: "drawing",
    name: "Hokusai",
    title: t("Rust 로 만든 자연매체 붓: 결정적이지만 승격 게이트는 아직 못 넘음", "A Rust natural-media brush: deterministic, but it has not cleared the promotion gate"),
    status: "experimental",
    tagline: t("MyPaint 호환 붓을 Rust·WASM 으로 돌립니다. 결정적이지만 품질·속도 게이트는 통과하지 못했습니다.", "A MyPaint-compatible brush in Rust and WASM: deterministic, but it has not cleared the quality and speed gate."),
    background: [
      t(
        "연필·목탄·유화 같은 '자연매체' 붓은 붓 자국 하나하나의 간격·크기·불투명도·무작위를 압력·기울기·속도에 곡선으로 연결해 흉내 냅니다. MyPaint/libmypaint 가 이 방식의 대표격이고(.myb 설정 파일), Hokusai 는 같은 계산을 Rust 로 다시 쓴 라이브러리입니다. ToonStudio 는 이를 WebAssembly 로 빌드해 브라우저 Worker 에서 돌립니다.",
        "Natural-media brushes such as pencil, charcoal and oil imitate the real thing by wiring each dab's spacing, size, opacity and randomness to pressure, tilt and speed through curves. MyPaint/libmypaint is the best-known example (.myb settings files), and Hokusai is a Rust rewrite of the same calculation. ToonStudio builds it to WebAssembly and runs it in a browser Worker.",
      ),
      t(
        "상류 hokusai-wasm 은 타일을 흰 배경에 합성해 버려서 쓰지 않고, hokusai-core·brush·tile-mem 0.3.0 을 정확히 고정해 직접 감쌌습니다. 내부의 선형광 premultiplied 정수 타일을 straight-alpha sRGB RGBA8 로 바꿔 내보내므로 레이어와 제대로 합성됩니다. 같은 캔버스·브러시·시드·샘플 순서면 바이트까지 같은 결과가 나오고, 빌드는 오프라인·고정 로캘과 시각으로 두 번 독립 빌드해 결과물이 서로, 그리고 체크인된 산출물과 같아야 통과합니다.",
        "The upstream hokusai-wasm composites tiles over white, so it is not used; hokusai-core, brush and tile-mem 0.3.0 are pinned exactly and wrapped directly. Internal linear-light premultiplied integer tiles are converted to straight-alpha sRGB RGBA8, so they composite correctly onto layers. The same canvas, brush, seed and sample order give byte-identical output, and the build passes only if two independent offline builds with fixed locale and time match each other and the checked-in artifact.",
      ),
      t(
        "정직한 결과: 승격 게이트에서 탈락했습니다. 2026-08-08 Apple M2 Max, 1792×1536, 32샘플 측정에서 libmypaint WASM 대비 처리량이 잉크 선명 브러시(ink-crisp) 0.097배, 수채 번짐 브러시(wash-soft) 0.318배였고(요구 1.2배), 수채 번짐 브러시는 품질 패리티도 통과하지 못했습니다. 그래서 자동 라우트에 올린 프리셋은 0개이고, 지금 사용자는 완성된 획을 골라 자연매체로 변환하는 명시 동선으로만 씁니다.",
        "The honest result: it failed the promotion gate. In a 2026-08-08 run on an Apple M2 Max at 1792x1536 with 32 samples, throughput versus the libmypaint WASM was 0.097x for the crisp-ink brush (ink-crisp) and 0.318x for the soft-wash brush (wash-soft) (1.2x required), and the soft-wash brush also failed quality parity. So zero presets are promoted to an automatic route, and today users reach it only through the explicit flow of selecting a finished stroke and converting it.",
      ),
      t(
        "이 숫자는 한 코퍼스·한 날짜·한 기기의 측정이라 어느 쪽이 더 낫다는 결론은 아닙니다. 결정성·압력 충실도·무손실 설정 반영·메모리 한도는 통과했고, 측정 당시 WASM(186,189바이트)과 지금 체크인된 산출물(187,243바이트)은 달라서 재측정 값은 저장소에 없습니다. libmypaint(C→WASM)는 Hokusai 의 자동 대체(폴백)가 아니라 성능·품질 비교 기준입니다. 다만 별개 기능인 '선택 획 네이티브 엔진 변환'에서는 사용자가 직접 고르는 엔진(기본 선택)으로도 쓰입니다.",
        "These figures come from one corpus, one date and one machine, so they do not prove either side is better. Determinism, pressure fidelity, lossless setting mapping and the memory bound all passed; the WASM at measurement time (186,189 bytes) differs from the checked-in artifact (187,243 bytes), and no re-measurement exists in the repository. libmypaint (C compiled to WASM) is a performance and quality comparison reference, not an automatic replacement (fallback) for Hokusai. Separately, the 'selected stroke native-engine conversion' feature also uses it as an engine the user picks (the default choice).",
      ),
    ],
    keyPoints: [
      t("Rust 로 쓴 MyPaint 호환 붓, 바이트 결정적 WASM", "A Rust MyPaint-compatible brush as byte-deterministic WASM"),
      t("승격 게이트 미통과: 처리량 0.097~0.318배, 승격 0개", "Gate not cleared: 0.097-0.318x throughput, zero promoted"),
      t("지금은 '선택한 획 → 자연매체 변환' 동선으로만 사용", "Used only through 'selected stroke -> natural media'"),
    ],
    diagram: {
      id: "hokusai-wasm-natural-media-diagram",
      kind: "graph",
      title: t("선택한 획이 자연매체 래스터가 되기까지", "From a selected stroke to a natural-media raster"),
      caption: t("변환은 명시적으로만 일어나고, 자동 라우트로 올리는 길은 승격 게이트가 막고 있습니다.", "Conversion happens only on request; the promotion gate blocks the way to an automatic route."),
      alt: t(
        "선택한 획이 Worker 로 가서 Hokusai WASM 이 샘플을 재생하고 투명 PNG 래스터를 만들며, 원본 버전을 확인한 뒤 문서에 삽입됩니다. 같은 WASM 에서 아래로 가는 점선은 라이브 자동 라우트 후보인데, 승격 게이트가 처리량 0.097~0.318배로 막아 승격 프리셋이 0개입니다.",
        "A selected stroke goes to a Worker where Hokusai WASM replays the samples and makes a transparent PNG raster, which is inserted into the document after the source revision is checked. The dashed branch down from the WASM is the live automatic-route candidate, which the promotion gate blocks at 0.097-0.318x throughput, leaving zero promoted presets.",
      ),
      nodes: [
        { id: "stroke", label: t("선택한 획", "Selected stroke"), sub: t("완성된 벡터 획", "A finished vector stroke"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "worker", label: t("Dedicated Worker", "Dedicated Worker"), sub: t("메인 스레드 밖", "Off the main thread"), tone: "local", at: [1, 1] },
        { id: "wasm", label: t("Hokusai WASM", "Hokusai WASM"), sub: t("Rust · 바이트 결정적", "Rust, byte-deterministic"), tone: "ai", at: [2, 1] },
        { id: "png", label: t("투명 PNG 래스터", "Transparent PNG raster"), sub: t("straight-alpha sRGB", "straight-alpha sRGB"), tone: "local", at: [3, 1] },
        { id: "doc", label: t("문서에 삽입", "Insert into document"), sub: t("원본 벡터는 숨겨 보존", "Original vector kept hidden"), tone: "good", shape: "pill", at: [4, 1] },
        { id: "gate", label: t("승격 게이트", "Promotion gate"), sub: t("1.2배·패리티", "1.2x and parity"), tone: "warn", shape: "diamond", at: [2, 2] },
        { id: "blocked", label: t("승격 프리셋 0개", "Zero promoted presets"), sub: t("처리량 0.097~0.318배", "0.097-0.318x throughput"), tone: "warn", at: [3, 2] },
      ],
      edges: [
        { from: "stroke", to: "worker", label: t("변환 요청", "convert") },
        { from: "worker", to: "wasm", label: t("샘플 재생", "replay") },
        { from: "wasm", to: "png", label: t("dirtyFrame", "dirtyFrame") },
        { from: "png", to: "doc", label: t("확인", "verify") },
        { from: "wasm", to: "gate", style: "dashed", label: t("자동 라우트?", "auto route?") },
        { from: "gate", to: "blocked", label: t("미통과", "not met") },
      ],
    },
    usage: [
      {
        feature: t("선택한 획 → 자연매체 변환(인스펙터)", "Selected stroke → natural-media conversion (inspector)"),
        role: t(
          "선택한 획을 연필·목탄·유화·캘리그래피·마커 프리셋과 재료 프로파일로 변환해 투명 래스터로 삽입하고, 원본 벡터는 숨겨 보존합니다.",
          "Converts a selected stroke with pencil, charcoal, oil, calligraphy or marker presets and material profiles into a transparent raster, keeping the original vector hidden.",
        ),
        paths: [
          "apps/web/src/domains/creator/StudioHokusaiNaturalMediaInspectorSection.tsx",
          "apps/web/src/domains/creator/render/studio-hokusai-natural-media.worker.ts",
          "apps/web/src/domains/creator/render/studio-hokusai-natural-media-contract.ts",
          "apps/web/src/domains/creator/render/studio-hokusai-natural-media-replacement.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("WASM 패키지와 재현 빌드 검증", "WASM package and reproducible-build check"),
        role: t(
          "Rust 래퍼가 straight-alpha RGBA8 로 내보내고, 두 번의 독립 빌드가 체크인된 산출물과 같은지 검증합니다.",
          "A Rust wrapper emits straight-alpha RGBA8, and a script verifies that two independent builds match the checked-in artifact.",
        ),
        paths: [
          "packages/studio-hokusai-wasm/src/lib.rs",
          "packages/studio-hokusai-wasm/pkg/INTEGRITY.sha256",
          "scripts/verify-studio-hokusai-wasm.mjs",
        ],
      },
      {
        feature: t("자동 라우트 승격 게이트(품질 정책)", "Automatic-route promotion gate (quality policy)"),
        role: t(
          "커밋된 비교 결과가 통과하기 전에는 어떤 프리셋도 자동 제품 경로에 오르지 못하게 코드로 잠급니다. 라이브 브러시를 허용하는 옵트인 입구는 코드에 있지만 이를 켜는 제품 코드가 없어, 일반 붓 선반에서는 시작되지 않습니다.",
          "Locks the code so no preset reaches the automatic product route until committed evidence passes. The code has an opt-in entry that would allow the live brush, but no product code turns it on, so the normal brush shelf never starts it.",
        ),
        paths: [`${HOKUSAI_POLICY}#STUDIO_HOKUSAI_FULLSIZE_PROMOTION_GATE`, "tests/benchmarks/results/libmypaint-fullsize.json"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("승격 게이트: 품질과 속도를 함께 통과해야 한다", "Promotion gate: quality and speed must both pass"),
        language: "ts",
        source: HOKUSAI_POLICY,
        ...commentedCode(
          [
            "interface Case { brush: string; throughputRatio: number; parityPass: boolean }",
            "const REQUIRED_RATIO = 1.2; // @0@",
            "",
            "// @1@",
            "const promotable = (cases: Case[]): boolean =>",
            "  cases.every((c) => c.parityPass && c.throughputRatio >= REQUIRED_RATIO);",
            "",
            "// @2@",
            "const measured: Case[] = [",
            "  { brush: 'ink-crisp', throughputRatio: 0.096991, parityPass: true },",
            "  { brush: 'wash-soft', throughputRatio: 0.318134, parityPass: false },",
            "];",
            "console.log(promotable(measured)); // @3@",
          ].join("\n"),
          [
            "libmypaint 대비 요구 처리량 비율",
            "모든 사례가 품질 패리티와 처리량을 동시에 통과해야 자동 라우트에 올린다.",
            "측정값: 2026-08-08, Apple M2 Max, 1792x1536, 32샘플 (tests/benchmarks/results/libmypaint-fullsize.json)",
            "false → 승격 프리셋 목록은 비어 있다",
          ],
          [
            "required throughput ratio versus libmypaint",
            "A preset reaches the automatic route only if every case passes quality parity and throughput.",
            "measured on 2026-08-08, Apple M2 Max, 1792x1536, 32 samples (tests/benchmarks/results/libmypaint-fullsize.json)",
            "false -> the promoted-preset list stays empty",
          ],
        ),
        explain: t(
          "제품 코드는 프리셋별 증거가 커밋될 때만 승격 목록에 들어가게 하고, 지금 목록은 빈 배열입니다. 위 두 숫자는 같은 비교 결과 파일에서 가져왔고, 잉크 선명 브러시는 품질 패리티는 통과했지만 속도가 모자랐습니다.",
          "The product code lets a preset into the promoted list only when its evidence is committed, and the list is an empty array today. The two numbers come from the same comparison file; the crisp-ink brush passed quality parity but fell short on speed.",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("Hokusai WASM 호출 순서", "Calling the Hokusai WASM"),
        language: "ts",
        ...commentedCode(
          [
            "import init, { HokusaiBrush, HokusaiCanvas } from './pkg/studio_hokusai_wasm.js';",
            "",
            "await init(); // @0@",
            "const brush = HokusaiBrush.naturalMedia(); // @1@",
            "const canvas = new HokusaiCanvas(256, 256, 0xdecafbad); // @2@",
            "canvas.beginStroke(brush, 0xdecafbad); // @3@",
            "canvas.addSample(brush, 40, 60, 0.35, -0.2, 0.7, 0); // @4@",
            "canvas.addSample(brush, 120, 90, 0.75, 0.1, 0.6, 16);",
            "canvas.finishStroke(brush);",
            "const [x, y, w, h] = canvas.dirtyBounds(); // @5@",
            "const rgba = canvas.dirtyFrame(); // @6@",
            "console.log(x, y, w, h, rgba.length);",
            "canvas.clearDirty();",
            "canvas.dispose();",
            "canvas.free();",
            "brush.free();",
          ].join("\n"),
          [
            "WASM 로드",
            "libmypaint .myb v3 기반 프리셋",
            "투명 캔버스 + 기본 시드",
            "이 시점의 브러시를 스냅샷",
            "x, y, 필압, tiltX, tiltY, 절대 시각(ms, 단조 증가)",
            "64px 타일 단위의 보수적 변경 영역",
            "straight-alpha sRGB RGBA8 (w*h*4 바이트)",
          ],
          [
            "load the WASM",
            "preset based on libmypaint .myb v3",
            "transparent canvas plus a default seed",
            "snapshot the brush at this point",
            "x, y, pressure, tiltX, tiltY, absolute time in ms (monotonic)",
            "conservative changed area in 64 px tiles",
            "straight-alpha sRGB RGBA8 (w*h*4 bytes)",
          ],
        ),
        explain: t(
          "저장소의 래퍼 API 호출 순서를 줄인 것입니다. 같은 초기 캔버스·브러시·시드·샘플 순서면 결과 바이트가 같습니다. 이 예제는 로컬 pkg 를 가져오므로 구문만 검사합니다.",
          "The call order of the repository's wrapper API, shortened. The same initial canvas, brush, seed and sample order give identical bytes. It imports the local pkg, so only syntax is checked.",
        ),
        verify: "syntax",
      },
    ],
    links: [
      { title: "Hokusai (reearth)", url: "https://github.com/reearth/hokusai", kind: "repo", note: t("Rust 로 쓴 MyPaint 호환 라이브러리", "The Rust MyPaint-compatible library") },
      { title: "libmypaint", url: "https://github.com/mypaint/libmypaint", kind: "repo", note: t("비교 기준이 된 C 라이브러리", "The C library used as the comparison reference") },
      { title: "wasm-bindgen", url: "https://rustwasm.github.io/docs/wasm-bindgen/", kind: "docs" },
      { title: "wasm-pack", url: "https://rustwasm.github.io/docs/wasm-pack/", kind: "docs" },
      { title: "Wikipedia · Alpha compositing", url: "https://en.wikipedia.org/wiki/Alpha_compositing", kind: "article", note: t("premultiplied 와 straight alpha 의 차이", "Premultiplied versus straight alpha") },
    ],
    chapterIds: ["brush-engine", "wasm-fixed-simd"],
    talk: {
      pitch: t(
        "Rust 로 자연매체 붓 엔진을 만들었고, 결과가 바이트까지 같고 빌드도 재현됩니다. 그런데 비교 측정에서 기존 libmypaint WASM 보다 느리고 일부 품질 패리티도 못 넘어서 자동 라우트에는 올리지 않았습니다. 그 게이트가 코드에 박혀 있어서, 지금은 선택한 획을 변환하는 동선으로만 쓰입니다.",
        "We built a natural-media brush engine in Rust whose output is byte-identical and whose build is reproducible. In our comparison it was slower than the existing libmypaint WASM and missed quality parity on one brush, so it is not on an automatic route. That gate is written into the code, and today the engine is reached only by converting a selected stroke.",
      ),
      analogy: t(
        "신입 선수의 기록회입니다. 폼은 정확하고 매번 같은 기록이 나오지만 아직 대표팀 기록(1.2배)에는 못 미쳐서, 지정 경기에만 내보내는 상태입니다.",
        "It is like a rookie's time trial: the form is clean and the time repeats every run, but it is below the national-team mark (1.2x), so the rookie only enters designated events.",
      ),
      questions: [
        {
          question: t("그럼 Hokusai 가 더 못한 엔진인가요?", "So is Hokusai simply the worse engine?"),
          answer: t(
            "그렇게 일반화하지 마세요. 2026-08-08 Apple M2 Max 에서 한 코퍼스로 잰 처리량이 0.097~0.318배였다는 사실만 확실합니다. 이후 재빌드 뒤 재측정은 저장소에 없습니다.",
            "Please do not generalize. All that is certain is a throughput of 0.097-0.318x on one corpus on an Apple M2 Max on 2026-08-08; no re-measurement after later rebuilds exists in the repository.",
          ),
        },
        {
          question: t("libmypaint 를 폴백으로 쓰나요?", "Is libmypaint used as a fallback?"),
          answer: t(
            "아닙니다. Hokusai 의 대체(폴백)가 아니라 비교 기준(reference)이고, 정책 파일도 이 라이브 경로에서는 '벤치마크 기준, 제품 폴백 아님'으로 적고 있습니다. 엔진 간 자동 대체는 ADR-0018 로 금지돼 있습니다. 다만 별개 기능인 '선택 획 · 네이티브 엔진 변환'에서는 사용자가 인스펙터에서 libmypaint 를 직접 고를 수 있고, 그쪽의 기본 선택입니다.",
            "No. It is a comparison reference, not a replacement (fallback) for Hokusai, and for this live path the policy file records it as a benchmark reference, not a product fallback. Automatic substitution between engines is forbidden by ADR-0018. Separately, in the 'selected stroke / native-engine conversion' feature the user can pick libmypaint in the inspector, and it is that feature's default choice.",
          ),
        },
        {
          question: t("라이브로 그릴 때도 Hokusai 가 쓰이나요?", "Is Hokusai used while drawing live?"),
          answer: t(
            "아니요. 현재 사용자 동선은 완성된 획을 골라 변환하는 것뿐입니다. 라이브 레인은 코드에 옵트인 입구만 있고 지금은 제품 어디에서도 켜지지 않으며, 일반 붓 선반에서는 시작되지 않습니다.",
            "No. Today's user flow is only converting a finished stroke. The live lane has just an opt-in entry in code and is not switched on anywhere in the product today; the normal brush shelf never starts it.",
          ),
        },
      ],
      pitfall: t(
        "수치를 말할 때는 반드시 '2026-08-08, Apple M2 Max, 1792×1536, 32샘플'을 함께 말하고, 어느 엔진이 더 낫다고 단정하지 마세요. 현재 빌드의 재측정값과 실사용 체감 속도는 이 카드에서 확인하지 못했습니다. 역할 원장이 Hokusai 를 자연매체 권위의 primary 로 지정한 것은 역할 지정이고, 라이브 붓을 자동 경로로 올리는 승격(프리셋 0개)과는 별개의 게이트입니다.",
        "Always quote the figures with '2026-08-08, Apple M2 Max, 1792x1536, 32 samples', and do not declare either engine better. Re-measurements of the current build and real-world perceived speed were not verified for this card. The role ledger naming Hokusai the primary of the natural-media authority is a role assignment, separate from the promotion gate that would put the live brush on an automatic route (zero presets).",
      ),
    },
    technologies: ["Rust / WASM", "wasm-bindgen", "libmypaint", "Dedicated Worker"],
    facts: [
      { value: "0.097×", label: t("libmypaint 대비 최저 처리량 비율(요구 1.2×, 2026-08-08 측정)", "Lowest throughput ratio versus libmypaint (1.2x required; measured 2026-08-08)"), source: HOKUSAI_POLICY },
      { value: "0", label: t("자동 제품 경로로 승격된 프리셋 수", "Presets promoted to the automatic product route"), source: HOKUSAI_POLICY },
      { value: "=0.3.0", label: t("정확히 고정한 hokusai-core·brush·tile-mem 버전", "Exactly pinned hokusai-core, brush and tile-mem version"), source: "packages/studio-hokusai-wasm/Cargo.toml" },
    ],
    reviewedAt: "2026-10-07",
  },
];
