import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 오픈소스 · Open API. 남의 코드와 데이터를 안전하게 쓰는 법. 법률 판단은 하지 않는다. */
export const GLOSSARY_MORE_OSS: readonly GlossaryTerm[] = [
  {
    id: "spdx",
    category: "oss",
    term: t("SPDX (라이선스 표기 규격)", "SPDX (license identifiers)"),
    definition: t(
      "라이선스 이름을 MIT, Apache-2.0, ‘Apache-2.0 OR MIT’처럼 누구나 같게 읽을 수 있는 짧은 표준 표기로 적는 규격입니다.",
      "A standard for writing licenses as short, unambiguous identifiers such as MIT, Apache-2.0 or ‘Apache-2.0 OR MIT’.",
    ),
    analogy: t(
      "식품의 성분표 표기법과 같습니다. 제품마다 제각각 쓰던 성분 이름을 같은 용어로 맞추면 한눈에 비교됩니다.",
      "Like a standard ingredient-label format: once every product uses the same terms, they can be compared at a glance.",
    ),
    inToonstudio: t(
      "라이선스 인벤토리(engineering-license-inventory.ts)는 직접 의존성 117개의 라이선스를 설치본 package.json 의 license 값으로 적습니다. 분포는 MIT 89·Apache-2.0 15·MPL-2.0 3·ISC 2·BSD-3 2·Remotion License 2 등이고, 고지 생성기의 표도 ‘SPDX/license expression’ 열을 둡니다. 이 표기는 사실의 기록이지 법률 의견이 아닙니다.",
      "The license inventory (engineering-license-inventory.ts) records the license of 117 direct dependencies from each installed package.json. The spread is MIT 89, Apache-2.0 15, MPL-2.0 3, ISC 2, BSD-3 2, Remotion License 2 and a few others, and the notice generator's tables carry an ‘SPDX/license expression’ column. This is a factual record, not legal advice.",
    ),
    chapters: ["licenses", "open-source"],
  },
  {
    id: "permissive-vs-copyleft",
    category: "oss",
    term: t("허용형 vs 카피레프트", "Permissive vs copyleft"),
    definition: t(
      "허용형(MIT·Apache)은 저작권 표시만 지키면 자유롭게 쓰게 하고, 카피레프트(GPL·MPL·LGPL)는 고친 코드나 이어 붙인 결과의 공개를 요구할 수 있는 조건입니다.",
      "Permissive licenses (MIT, Apache) let you use code freely if you keep the notice; copyleft licenses (GPL, MPL, LGPL) can require sharing modified code or what is combined with it.",
    ),
    analogy: t(
      "레시피 공유 조건과 같습니다. ‘출처만 밝혀라’와 ‘네가 바꾼 레시피도 같은 조건으로 공개하라’는 전혀 다른 약속입니다.",
      "Like recipe-sharing terms: ‘just credit me’ and ‘publish your changed recipe under the same terms’ are very different promises.",
    ),
    inToonstudio: t(
      "인벤토리는 직접 의존성에 weak-copyleft·noncommercial·custom-license 깃발을 따로 답니다. 깃발이 달린 것은 MPL-2.0 3개(@resvg/resvg-wasm·web-ifc·web-push), LGPL-2.1-only 1개(opencascade.js), CC-BY-NC-4.0 1개(mixbox), Remotion License 2개입니다. ‘오픈소스’ 한 단어로 묶지 않고 도구마다 따로 검토하며, 의무의 충족 여부는 법률 판단이라 단정하지 않습니다.",
      "The inventory flags direct dependencies as weak-copyleft, noncommercial or custom-license. Flagged are three MPL-2.0 packages (@resvg/resvg-wasm, web-ifc, web-push), one LGPL-2.1-only (opencascade.js), one CC-BY-NC-4.0 (mixbox) and two under the Remotion License. Tools are reviewed one by one rather than lumped as ‘open source’, and whether obligations are met is a legal judgment this page does not make.",
    ),
    chapters: ["licenses", "open-source"],
    atlasIds: ["oss-license-notice-pipeline"],
  },
  {
    id: "lgpl-separate-module",
    category: "oss",
    term: t("LGPL과 ‘별도 모듈로 불러오기’", "LGPL and loading as a separate module"),
    definition: t(
      "LGPL 은 라이브러리 자체의 수정은 공개하되, 그 라이브러리를 부르는 쪽 코드까지 공개하라고 하지 않도록 정한 약한 카피레프트 조건입니다.",
      "LGPL is a weak copyleft: changes to the library itself must be shared, but code that merely calls the library is not pulled in.",
    ),
    analogy: t(
      "빌린 공구를 쓰되 공구는 그대로 돌려주는 것과 같습니다. 공구를 고치면 그 개선은 나누고, 공구로 만든 가구는 내 것입니다.",
      "Like borrowing a tool: improvements to the tool are shared back, while the furniture you built with it stays yours.",
    ),
    inToonstudio: t(
      "opencascade.js 1.1.1(OCCT, LGPL-2.1)은 주 번들에 정적으로 묶지 않고 별도 WASM 모듈로 동적 로드한다고 코드 주석에 적혀 있습니다(studio-occt-wasm-facade.ts). 이 설계가 의무를 충족하는지는 법률 판단이라 여기서 단정하지 않습니다.",
      "A code comment says opencascade.js 1.1.1 (OCCT, LGPL-2.1) is not statically bundled into the main chunk but loaded dynamically as a separate WASM module (studio-occt-wasm-facade.ts). Whether this design satisfies the obligations is a legal question this page does not settle.",
    ),
    chapters: ["licenses", "open-source"],
  },
  {
    id: "cc-by-nc",
    category: "oss",
    term: t("CC BY-NC (비상업 조건)", "CC BY-NC (non-commercial condition)"),
    definition: t(
      "저작자를 표시하면 쓸 수 있지만 상업적 이용은 허락하지 않는 크리에이티브 커먼즈 조건입니다. 코드보다 자료·이미지에 흔합니다.",
      "A Creative Commons condition that allows use with credit but not commercial use, more common for assets and images than for code.",
    ),
    analogy: t(
      "전시회 무료 입장권과 같습니다. 구경하고 이름을 밝히며 따라 그리는 건 되지만, 그 그림을 팔면 안 됩니다.",
      "Like a free exhibition ticket: viewing, crediting and sketching along are fine, selling the sketch is not.",
    ),
    inToonstudio: t(
      "혼색 라이브러리 mixbox 2.0.0 이 CC-BY-NC-4.0 이라 인벤토리에서 noncommercial 깃발이 달립니다. mixbox 를 import 하는 곳은 테스트를 빼면 brush-lab 의 안료 공급자 한 곳이고, 그 공급자는 라이선스 프로파일(permissive-only / source-available / noncommercial-full)을 따로 두며 기본값이 noncommercial-full 입니다(brush-lab/brush-studio-v6-license-profile.ts). 혼색 브러시의 studio-spectral-wgm-mix-v1.ts 는 mixbox 를 쓰지 않습니다.",
      "The colour-mixing library mixbox 2.0.0 is CC-BY-NC-4.0, so the inventory flags it noncommercial. Outside tests, mixbox is imported in just one place, the brush lab's pigment provider, which keeps a separate licence profile (permissive-only / source-available / noncommercial-full) defaulting to noncommercial-full (brush-lab/brush-studio-v6-license-profile.ts). The colour-mixing brush's studio-spectral-wgm-mix-v1.ts does not use mixbox.",
    ),
    chapters: ["licenses", "open-api-provenance"],
  },
  {
    id: "pnpm-patch-fork",
    category: "oss",
    term: t("pnpm patch · 포크 (고쳐 쓰기)", "pnpm patch and forks"),
    definition: t(
      "남의 라이브러리를 그대로 못 쓸 때, 설치본에 작은 수정 패치를 겹쳐 적용하거나(pnpm patch) 소스를 통째로 복사해 따로 관리(포크)하는 방법입니다.",
      "When a third-party library cannot be used as is, you either apply a small patch over the installed copy (pnpm patch) or keep a full copy of the source yourself (a fork).",
    ),
    analogy: t(
      "산 옷의 단추만 새로 다는 것(패치)과 같은 옷을 본떠 새로 지어 입는 것(포크)의 차이입니다. 새로 지을수록 직접 관리할 일이 늘어납니다.",
      "Like sewing on a new button (patch) versus tailoring a copy of the whole garment (fork): the more you remake, the more you must maintain.",
    ),
    inToonstudio: t(
      "pnpm-workspace.yaml 의 patchedDependencies 에 패치 8개가 있습니다. 그중 manifold-3d·ktx2-encoder·@gltf-transform/functions 패치는 new Function/Function() 호출 경로를 걷어 unsafe-eval 없이 돌게 합니다. wgpu 는 crates/vendor/wgpu-toon 으로 포크하며 crates.io wgpu 29.0.4 를 바탕으로 6개 파일만 고치고, 어긋남을 vendor_patch_parity.rs 테스트가 잡습니다. 상류에 보낸 PR 근거는 저장소에서 찾지 못했습니다.",
      "pnpm-workspace.yaml lists eight patches under patchedDependencies. The manifold-3d, ktx2-encoder and @gltf-transform/functions patches remove new Function / Function() paths so they run without unsafe-eval. wgpu is forked as crates/vendor/wgpu-toon, based on crates.io wgpu 29.0.4 with only six files changed, and the vendor_patch_parity.rs test catches any drift. No upstream PR evidence was found in the repository.",
    ),
    chapters: ["open-source", "licenses"],
    atlasIds: ["gpu-fabric-device-lease-vello", "oss-pnpm-patches-no-unsafe-eval", "oss-fork-wgpu-toon"],
  },
  {
    id: "lockfile-supply-chain",
    category: "oss",
    term: t("락파일 · 공급망 보안", "Lockfile and supply-chain security"),
    definition: t(
      "락파일은 설치할 모든 패키지의 정확한 버전과 지문을 적어 둔 목록이고, 공급망 보안은 내가 쓰는 남의 코드가 바뀌거나 오염되는 위험을 관리하는 일입니다.",
      "A lockfile lists the exact version and fingerprint of every package to install; supply-chain security is managing the risk that third-party code you rely on changes or is poisoned.",
    ),
    analogy: t(
      "장보기 목록에 브랜드와 용량까지 적어 두는 것과 같습니다. 누가 대신 장을 봐도 같은 물건이 담기고, 바뀐 물건은 바로 눈에 띕니다.",
      "Like a shopping list naming brand and size: whoever shops brings home the same items, and any substitution stands out.",
    ),
    inToonstudio: t(
      "pnpm-lock.yaml 이 고정한 버전을 CI 가 pnpm install --frozen-lockfile 로 그대로 설치하고, 의존성을 바꾸면 pnpm audit:security(알려진 취약점 + 예외 검증 스크립트)와 pnpm audit:licenses(고지 생성기 --check)를 함께 돌립니다. 직접 import 하는 패키지는 해당 workspace 에 선언하고 락파일을 손으로 고치지 않는 것이 규칙입니다(AGENTS.md).",
      "CI installs exactly what pnpm-lock.yaml pins using pnpm install --frozen-lockfile, and when dependencies change the team also runs pnpm audit:security (known advisories plus an exception-verifying script) and pnpm audit:licenses (the notice generator with --check). The rule is to declare every directly imported package in its own workspace and never to edit the lockfile by hand (AGENTS.md).",
    ),
    chapters: ["open-source", "quality-gates"],
    atlasIds: ["oss-supply-chain-pinning"],
  },
  {
    id: "notices-sbom",
    category: "oss",
    term: t("고지(NOTICE)와 SBOM", "Notices and SBOM"),
    definition: t(
      "고지는 쓴 라이브러리와 그 라이선스·저작권을 사용자에게 밝히는 문서이고, SBOM 은 소프트웨어를 이루는 부품 목록을 기계가 읽는 형식으로 적은 명세서입니다.",
      "A notice tells users which libraries are used and under what licenses; an SBOM is a machine-readable bill of materials listing a software's components.",
    ),
    analogy: t(
      "식품의 원재료 표시와 공장 납품 명세서의 차이입니다. 앞은 소비자가 읽는 표시이고, 뒤는 검수 시스템이 읽는 목록입니다.",
      "Like a food label versus a factory's delivery manifest: the first is for shoppers to read, the second for inspection systems to process.",
    ),
    inToonstudio: t(
      "루트 THIRD_PARTY_NOTICES.md 는 2026-07-28 하이브리드 공급자 묶음에서 들어온 라이브러리를 적은 손글씨 문서라 직접 의존성 전체를 담지 않습니다. 완전한 목록은 배포 빌드가 만드는 dist/legal/THIRD_PARTY_NOTICES.generated.md 와 scripts/generate-third-party-notices.mjs --check 가 맡습니다. CycloneDX 형식 SBOM(sbom.cdx.json)은 데스크톱 동기화 릴리스 번들에서만 만들어집니다.",
      "The root THIRD_PARTY_NOTICES.md is hand-written for the libraries introduced by the 2026-07-28 hybrid-provider wave and does not cover every direct dependency. The complete list is the build output dist/legal/THIRD_PARTY_NOTICES.generated.md, kept honest by scripts/generate-third-party-notices.mjs --check. A CycloneDX SBOM (sbom.cdx.json) is produced only for the desktop-sync release bundle.",
    ),
    chapters: ["licenses", "open-source"],
    atlasIds: ["oss-license-notice-pipeline"],
  },
  {
    id: "open-api-vs-openapi",
    category: "oss",
    term: t("Open API vs OpenAPI (명세)", "Open API vs OpenAPI (the spec)"),
    definition: t(
      "Open API(공개 API)는 외부가 쓸 수 있게 열어 둔 데이터·기능의 통로이고, OpenAPI 는 API 를 설명하는 문서의 표준 형식(명세)입니다. 이름은 비슷하지만 다른 것입니다.",
      "An open API is a doorway to data or features opened for outsiders; OpenAPI is a standard format (a specification) for documenting APIs. The names are alike but the things differ.",
    ),
    analogy: t(
      "열린 매장(Open API)과 그 매장의 표준 메뉴판 양식(OpenAPI)의 차이입니다. 매장이 열려 있다고 메뉴판이 꼭 표준 양식인 것은 아닙니다.",
      "An open shop (open API) versus the standard template for its menu (OpenAPI): being open does not mean the menu follows the template.",
    ),
    inToonstudio: t(
      "두 방향이 있습니다. 밖의 공개 API(미술관·위키미디어·날씨 등)를 쓰는 길은 서버 ResourceEngine 과 CSP 가 지킵니다. 우리가 여는 길은 GET /api/integrations/developer-manifest 의 선언(스키마 toonstudio.integration-developer-manifest/1)뿐이고, API 키 발급·OAuth 앱 심사는 운영자 활성화가 필요한 단계로 안내돼 있고, OpenAPI 문서를 만드는 @nestjs/swagger 는 의존성에 없습니다. ‘계약 공개와 단계적 활성화’로만 말합니다.",
      "There are two directions. Using outside open APIs (museums, Wikimedia, weather and so on) is guarded by the server ResourceEngine and CSP. The path we open is only the declaration at GET /api/integrations/developer-manifest (schema toonstudio.integration-developer-manifest/1); API key issuance and OAuth app review are described as operator-activation steps, and @nestjs/swagger, which would generate an OpenAPI document, is not a dependency. It is described only as ‘contract published, activated in stages’.",
    ),
    chapters: ["open-api-data", "open-api-provenance"],
    atlasIds: ["resource-engine-one-contract", "browser-direct-calls-under-csp"],
  },
  {
    id: "rights-provenance-receipt",
    category: "oss",
    term: t("권리 게이트와 출처 영수증", "Rights gate and provenance receipt"),
    definition: t(
      "외부에서 가져오는 자료마다 ‘써도 되는 범위’를 등급으로 판정하고, 어디서 어떤 조건으로 왔는지 기록(영수증)을 함께 남기는 장치입니다.",
      "A mechanism that grades how far each imported item may be used and keeps a receipt of where it came from and under what terms.",
    ),
    analogy: t(
      "중고 거래의 영수증과 보증서 같습니다. 물건(자료)이 어디서 왔는지 적혀 있어야 나중에 문제가 생겨도 근거를 댈 수 있습니다.",
      "Like the receipt and warranty of a second-hand purchase: knowing where the item came from gives you something to point to if trouble comes later.",
    ),
    inToonstudio: t(
      "가져오기 권한은 direct·reference-only·metadata-only·blocked 네 등급입니다(packages/core/src/creator-resources.ts 의 ResourceImportPermission). 공급자가 자유롭게 써도 된다고 해도 우리 규칙을 모두 통과해야 올리며, 라이선스(CC0·CC-BY-4.0 등)와 출처 표기 문구(attributionMarkdown)가 함께 따라갑니다. 출처를 기록하는 모델이 한 갈래가 아니라는 점은 도감 카드가 숨기지 않고 적어 둡니다.",
      "Import permission has four grades: direct, reference-only, metadata-only and blocked (ResourceImportPermission in packages/core/src/creator-resources.ts). Even when a provider says an item is free to use, it goes live only if it passes all our rules, and the licence (CC0, CC-BY-4.0 and so on) and an attribution text (attributionMarkdown) travel with it. The atlas card openly notes that provenance is not recorded in a single model.",
    ),
    chapters: ["open-api-provenance", "open-api-data"],
    atlasIds: ["rights-provenance-receipt"],
  },
  {
    id: "resource-engine-contract",
    category: "oss",
    term: t("ResourceEngine (한 계약으로 여러 공급자)", "ResourceEngine (many providers, one contract)"),
    definition: t(
      "미술관·도서·공공데이터처럼 모양이 제각각인 외부 API 를 서버 한 곳에서 같은 규칙(시간 제한·크기 제한·권리 검사)으로 부르는 어댑터 층입니다.",
      "An adapter layer that calls differently shaped outside APIs such as museums, books and public data from one server place under the same rules: time limits, size limits and rights checks.",
    ),
    analogy: t(
      "여러 나라 콘센트를 한 멀티 어댑터로 받는 것과 같습니다. 기기(앱)는 어댑터 하나만 꽂으면 됩니다.",
      "Like one travel multi-adapter for many countries' sockets: the device (the app) only ever plugs into the one adapter.",
    ),
    inToonstudio: t(
      "apps/api/src/modules/creator-resources/resource-engine.ts 가 응답 본문을 2MiB(MAX_BODY)로 제한하고, 동시 호출이 6개를 넘으면 upstream_busy, 호스트가 쿨다운 중이면 upstream_cooldown 으로 거절합니다. 테스트에서는 진짜 fetch 대신 가짜 fetch 를 꽂아(createResourceEngine) 네트워크 없이 권리·캐시·쿨다운을 시험합니다.",
      "apps/api/src/modules/creator-resources/resource-engine.ts caps response bodies at 2 MiB (MAX_BODY), refuses with upstream_busy when more than 6 calls are in flight and with upstream_cooldown while a host is cooling down. Tests plug in a fake fetch instead of the real one (createResourceEngine) to check rights, caching and cooldowns without any network.",
    ),
    chapters: ["open-api-adapter", "open-api-data"],
    atlasIds: ["resource-engine-one-contract", "injected-fetch-adapters"],
  },
];
