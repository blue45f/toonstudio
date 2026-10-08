import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 8 "만들고 검사하고 내보내기".
 * 사실의 정본은 오픈소스 지도(vite-vitest-playwright·pnpm-patches-overrides·wasm-vips·psd-pdf-formats·remotion 행),
 * pnpm-workspace.yaml(패치·override), tests/benchmarks/results/quality-lab.json(wasm-vips 선택 근거), ADR-0008과 코드다.
 * 라이선스가 까다로운 wasm-vips(LGPL 구성요소)·Remotion(자체 라이선스)은 설치본이 말하는 라이선스만 적고 적격성은 판단하지 않는다.
 * 수치는 engineering-library-guide-areas-b.test.ts 가 pnpm-workspace.yaml 등에서 읽어 대조한다. 기준일 2026-10-08.
 */

const CREATOR = "apps/web/src/domains/creator";
const EXPORT = `${CREATOR}/export`;

export const LIBRARY_AREA_BUILD_QUALITY_MEDIA: LibraryGuideArea = {
  id: "build-quality-media",
  number: 8,
  title: t("만들고 검사하고 내보내기", "Build, check and export"),
  question: t("빌드·테스트·내보내기는 무엇으로 하나?", "What do we build, test and export with?"),
  oneLine: t(
    "Vite가 묶고, Vitest·Playwright가 지키고, 내보내기는 기기 안의 wasm-vips·ag-psd 등이 맡습니다.",
    "Vite bundles, Vitest and Playwright guard, and on-device parts such as wasm-vips and ag-psd handle export.",
  ),
  easy: t(
    "공장의 조립 라인과 검수대에 비유합니다. 부품을 조립하고(Vite) 검수대 세 곳(단위·브라우저·접근성)을 지나야 출고되며, 파일을 내보낼 때도 같은 공장 안의 포장 라인(wasm-vips·ag-psd·pdf-lib·Remotion)에서 포장합니다. 손본 부품은 수정 기록표(패치·override)로 남깁니다.",
    "Think of an assembly line and inspection desks in a factory. Parts are assembled (Vite) and must pass three inspection desks (unit, browser, accessibility) before shipping, and exports are packed on a packing line inside the same factory (wasm-vips, ag-psd, pdf-lib, Remotion). Parts we modified stay on a change record (patches and overrides).",
  ),
  designWhy: [
    {
      title: t("무거운 엔진은 필요할 때만, 새면 빌드가 실패", "Heavy engines on demand; a leak fails the build"),
      body: t(
        "3D·CRDT 같은 큰 엔진은 이름 붙인 지연 로드 청크로 나눕니다. 그것이 첫 화면 번들로 돌아오면 번들 검사(check-studio-bundle)가 빌드를 실패시킵니다. 청크 이름을 잘못 붙여 번들이 커져 되돌린 기록도 설정 주석에 남아 있습니다.",
        "Large engines such as 3D and CRDT are split into named lazy chunks. If one returns to the first-screen bundle, the bundle check (check-studio-bundle) fails the build. Comments in the config also record naming attempts that made bundles larger and were reverted.",
      ),
    },
    {
      title: t("검사는 층으로 나눠 서로 다른 실패를 잡는다", "Checks in layers catch different failures"),
      body: t(
        "Vitest는 화면·API·Worker·스크립트 단위를, Playwright는 실제 브라우저의 접근성(axe)을, 정책 스크립트는 번들·라이선스·경계 규칙을 지킵니다. CI는 린트·타입 검사·정적 검사·접근성·빌드·DB 같은 작업으로 나뉘어 돕니다.",
        "Vitest guards screen, API, Worker and script units, Playwright guards accessibility (axe) in a real browser, and policy scripts guard the bundle, license and boundary rules. CI runs as separate jobs such as lint, type check, static checks, accessibility, build and database.",
      ),
    },
    {
      title: t("고쳐 쓴 곳은 기록으로 남긴다", "What we changed stays on record"),
      body: t(
        "pnpm 패치 7개와 override 50개는 pnpm-workspace.yaml에 모았고, 포크 2개(braces·wgpu-toon)는 저장소 안 폴더로 둡니다. 설치 때 자동 적용되고, 빌드가 라이선스 고지를 만들며 허용 목록 밖 라이선스는 감사에서 실패합니다.",
        "The 7 pnpm patches and 50 overrides are gathered in pnpm-workspace.yaml, and the 2 forks (braces and wgpu-toon) live in folders inside the repository. They apply automatically at install, the build generates license notices, and a license outside the allowlist fails the audit.",
      ),
    },
    {
      title: t("내보내기는 기기 안에서, 까다로운 부품은 따로", "Export on the device, demanding parts apart"),
      body: t(
        "초대형 페이지 축소·PSD·PDF 작업·영상 렌더 키트를 서버 없이 기기에서 만듭니다. LGPL 구성요소가 든 wasm-vips는 final 내보내기에서만 dynamic import로, Remotion은 /product-tour 경로에서만 불러오며, ADR-0008은 LGPL 계층의 배포 형태를 법무 검토 후 확정한다고 적습니다.",
        "Huge-page downsizing, PSD, PDF work and video render kits are made on the device without a server. wasm-vips, which carries LGPL components, is loaded by dynamic import only for final export and Remotion only on the /product-tour route, and ADR-0008 says the distribution form of LGPL layers is settled after legal review.",
      ),
    },
  ],
  diagram: {
    id: "build-quality-media-diagram",
    kind: "graph",
    title: t("코드가 파일이 되고 내보내지기까지", "From code to a build, then to exported files"),
    caption: t(
      "소스는 pnpm으로 설치되고 Vite로 묶인 뒤 검사 관문을 지나 배포 파일이 되며, 내보내기는 그 앱 안에서 기기가 직접 합니다.",
      "Source is installed with pnpm, bundled by Vite and passes the check gates to become a build, and exporting happens inside that app on the device itself.",
    ),
    alt: t(
      "왼쪽에서 오른쪽으로 읽습니다. 소스 코드가 pnpm으로 설치되고(패치 7개와 override 50개 적용) Vite로 묶입니다. Vitest와 Playwright가 서로 다른 검사를 하고, 번들 검사와 라이선스 고지까지 통과해야 배포 파일이 됩니다. 사용자가 앱에서 작품을 내보낼 때는 서버 없이 기기에서 wasm-vips가 초대형 페이지를 줄이고, ag-psd가 PSD를, pdf-lib와 pdf.js가 PDF를, Remotion이 영상을 맡습니다.",
      "Read from left to right. Source code is installed with pnpm (7 patches and 50 overrides applied) and bundled by Vite. Vitest and Playwright run different checks, and the build must also pass the bundle check and license notices to become a deployable build. When a user exports artwork in the app, on the device without a server wasm-vips shrinks huge pages, ag-psd handles PSD, pdf-lib and pdf.js handle PDF, and Remotion handles video.",
    ),
    nodes: [
      { id: "source", label: t("소스 코드", "Source code"), sub: t("TypeScript · React", "TypeScript, React"), tone: "neutral", shape: "pill", at: [0, 1] },
      { id: "pnpm", label: t("pnpm 설치", "pnpm install"), sub: t("패치 7 · override 50", "7 patches, 50 overrides"), tone: "neutral", at: [1, 1] },
      { id: "vite", label: t("Vite 8 빌드", "Vite 8 build"), sub: t("청크 분리 · 지연 로드", "Chunk split, lazy load"), tone: "neutral", at: [2, 1] },
      { id: "vitest", label: t("Vitest", "Vitest"), sub: t("단위·계약 테스트", "Unit, contract tests"), tone: "good", at: [3, 0] },
      { id: "playwright", label: t("Playwright", "Playwright"), sub: t("실제 브라우저 · axe", "Real browser, axe"), tone: "good", at: [3, 1] },
      { id: "dist", label: t("배포 파일", "Deployable build"), sub: t("번들 검사 · 고지문", "Bundle check, notices"), tone: "good", at: [4, 1] },
      { id: "export", label: t("작품 내보내기", "Export artwork"), sub: t("서버 없이 기기에서", "On the device"), tone: "local", shape: "pill", at: [4, 3] },
      { id: "vips", label: t("wasm-vips", "wasm-vips"), sub: t("초대형 페이지 축소", "Shrink huge pages"), tone: "local", at: [3, 3] },
      { id: "psd", label: t("ag-psd", "ag-psd"), sub: t("PSD 레이어", "PSD layers"), tone: "local", at: [3, 4] },
      { id: "pdf", label: t("pdf-lib", "pdf-lib"), sub: t("PDF 합치기·분할", "Merge, split PDFs"), tone: "local", at: [4, 4] },
      { id: "remotion", label: t("Remotion", "Remotion"), sub: t("영상 재생·렌더 키트", "Video player, render kit"), tone: "local", at: [5, 3] },
    ],
    edges: [
      { from: "source", to: "pnpm" },
      { from: "pnpm", to: "vite" },
      { from: "vite", to: "vitest" },
      { from: "vite", to: "playwright" },
      { from: "vitest", to: "dist" },
      { from: "playwright", to: "dist" },
      { from: "dist", to: "export", label: t("앱이 열린 뒤", "in the app") },
      { from: "export", to: "vips", label: t("큰 페이지", "big pages") },
      { from: "export", to: "psd", label: t("PSD", "PSD") },
      { from: "export", to: "pdf", label: t("PDF", "PDF") },
      { from: "export", to: "remotion", label: t("영상", "video") },
    ],
  },
  libraries: [
    {
      id: "vite",
      name: "Vite",
      kind: "tool",
      package: "vite",
      oneLine: t("소스를 브라우저가 받을 파일로 묶는 빌드 도구(Vite 8)", "The build tool (Vite 8) that packs source into files the browser downloads"),
      usedFor: t(
        "화면 코드를 해시 붙은 파일로 묶고 무거운 엔진은 지연 로드 청크로 나눕니다. React Compiler 변환과 서비스 워커 생성도 이 빌드가 맡습니다.",
        "Packs screen code into hashed files and splits heavy engines into lazy chunks. The React Compiler transform and the Service Worker build also run in this build.",
      ),
      why: t(
        "큰 엔진을 이름 붙인 청크로 나누고 지연 로드 경계를 설정으로 고정할 수 있어, 첫 화면 번들 검사를 빌드 결과(manifest)로 자동화합니다. 번들러는 Rolldown 1.0.3(전이 의존성)입니다.",
        "Large engines can be split into named chunks and lazy-load boundaries fixed in config, so the first-screen bundle check runs automatically on the build output (the manifest). The bundler is Rolldown 1.0.3, a transitive dependency.",
      ),
      cost: t(
        "React Compiler 변환이 빌드 시간의 91%를 쓴 측정(2026-08-08)이 있고, 청크 이름을 잘못 붙이면 공유 코드가 한 덩어리가 되어 되돌린 적이 두 번 있습니다. Vite를 다른 번들러와 비교한 문서는 못 찾았습니다.",
        "One measurement (2026-08-08) put 91% of build time in the React Compiler transform, and wrongly naming a chunk merged shared code into one lump and was reverted twice. We found no document comparing Vite with other bundlers.",
      ),
      paths: ["apps/web/vite.config.ts", "apps/web/config/vite-manual-chunks.ts", "scripts/check-studio-bundle.mjs"],
      license: "MIT",
      status: "live",
      mapRowId: "vite-vitest-playwright",
      atlasIds: ["drawing-quality-gates"],
    },
    {
      id: "vitest",
      name: "Vitest",
      kind: "tool",
      package: "vitest",
      oneLine: t("코드가 약속대로 동작하는지 자동으로 확인하는 테스트 실행기", "A test runner that automatically checks code behaves as promised"),
      usedFor: t(
        "화면·API·Worker·스크립트 테스트를 한 설정으로 돌립니다. API의 NestJS 데코레이터도 변환해 같은 실행기에서 검사합니다.",
        "Runs screen, API, Worker and script tests from one config. The API's NestJS decorators are transformed too, so they are checked in the same runner.",
      ),
      why: t(
        "수집 루트(apps·deploy·packages·scripts·tests)를 명시하고 루트별 파일 수 하한을 두어, 폴더가 옮겨져 테스트가 조용히 줄어도 CI가 알아챕니다. 운영 DB 주소는 테스트가 물려받지 않게 막았습니다.",
        "The collected roots (apps, deploy, packages, scripts, tests) are listed and each has a file-count floor, so CI notices when a folder moves and tests quietly shrink. Tests are also prevented from inheriting a production database address.",
      ),
      cost: t(
        "단위 테스트는 실제 브라우저의 GPU·OPFS·WASM을 대신하지 못해 Playwright와 실측 하니스가 따로 필요합니다. 시간을 재는 테스트는 별도 설정(vitest.perf.config.ts)으로 분리합니다.",
        "Unit tests cannot stand in for the real browser's GPU, OPFS and WASM, so Playwright and measurement harnesses are needed separately. Timing tests are split into their own config (vitest.perf.config.ts).",
      ),
      paths: ["vitest.config.ts", "vitest.perf.config.ts", "vitest.setup.ts"],
      license: "MIT",
      status: "live",
      mapRowId: "vite-vitest-playwright",
      atlasIds: ["test-honesty-and-time-budget-isolation", "module-boundary-ratchet"],
    },
    {
      id: "playwright",
      name: "Playwright",
      kind: "tool",
      package: "@playwright/test",
      oneLine: t("진짜 브라우저를 자동으로 조작해 화면을 확인하는 테스트 도구", "A test tool that drives a real browser automatically to check screens"),
      usedFor: t(
        "핵심 화면을 실제 Chromium으로 열어 동작을 확인하고, axe-core로 접근성(WCAG 2.2 AA까지) 심각·치명 위반을 PR마다 검사합니다.",
        "Opens key screens in a real Chromium to check behavior, and runs axe-core on every PR for serious and critical accessibility violations (up to WCAG 2.2 AA).",
      ),
      why: t(
        "접근성과 화면 깨짐은 단위 테스트로 잡히지 않아 실제 브라우저가 필요합니다. PR마다는 핵심 라우트(데스크톱 10·모바일 4)만 axe로 검사하고, 전수 감사는 수동으로 분리해 CI 시간을 지킵니다.",
        "Accessibility and broken layouts slip past unit tests, so a real browser is needed. Each PR checks only the key routes (10 desktop, 4 mobile) with axe, and the exhaustive audit is kept manual to protect CI time.",
      ),
      cost: t(
        "자동 검사는 접근성의 일부만 잡습니다(키보드 순서·대체 텍스트의 뜻은 사람이 확인). 비로그인·개발 서버 기준이라 로그인 뒤 화면은 보증하지 않습니다. axe 검사기는 MPL-2.0(개발 전용)입니다.",
        "Automated checks catch only part of accessibility (keyboard order and the meaning of alt text need people). They run signed out against the dev server, so screens after sign-in are not guaranteed. The axe checker is MPL-2.0 (dev only).",
      ),
      paths: ["playwright.a11y.config.ts", "e2e/a11y-smoke.spec.ts", "playwright.config.ts"],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "vite-vitest-playwright",
      atlasIds: ["axe-a11y-matrix"],
    },
    {
      id: "pnpm-patches-overrides",
      name: "pnpm patch",
      kind: "tool",
      oneLine: t("설치한 오픈소스를 정확한 버전에 묶어 작게 고쳐 쓰는 기록", "A record of installed open source pinned to exact versions and lightly modified"),
      usedFor: t(
        "라이브러리 패치 7개와 하위 의존성 버전을 강제한 override 50개를 pnpm-workspace.yaml에 모아, 설치할 때 자동으로 적용합니다.",
        "Gathers 7 library patches and 50 overrides that force sub-dependency versions in pnpm-workspace.yaml, and applies them automatically at install time.",
      ),
      why: t(
        "운영 CSP가 unsafe-eval을 열지 않아, new Function을 쓰는 라이브러리 3곳은 CSP를 풀지 않고 코드를 고쳐 씁니다. 포크보다 변경 범위가 작고 눈에 띄며, 보안 권고는 override로 한곳에서 정리합니다.",
        "The production CSP does not open unsafe-eval, so three libraries that use new Function are patched instead of relaxing the CSP. A patch is smaller and easier to see than a fork, and security advisories are handled in one place with overrides.",
      ),
      alternatives: t(
        "원본이 고쳐 주기를 기다리거나 통째로 복사하는 포크가 대안입니다. 포크는 보안 수정을 위한 braces와 GPU 장치 공유를 위한 wgpu-toon 두 곳뿐입니다.",
        "The alternatives are waiting for upstream to fix it or a fork that copies everything. Forks are limited to two: braces for a security fix and wgpu-toon for sharing a GPU device.",
      ),
      cost: t(
        "정확한 버전에만 묶여 라이브러리를 올릴 때마다 다시 써야 합니다. 원본에 보낸 PR은 저장소에서 찾지 못했고, CSP 호환은 라이브러리 전체가 아니라 검증한 작업 기준입니다.",
        "Patches are tied to exact versions and must be redone at each upgrade. We found no upstream PR in the repository, and CSP compatibility holds for the verified jobs, not for whole libraries.",
      ),
      paths: ["pnpm-workspace.yaml", "patches/ag-psd@31.0.1.patch", "patches/braces/README.md"],
      license: "원본 라이선스를 따름",
      licenseSource: "THIRD_PARTY_NOTICES.md",
      status: "live",
      mapRowId: "pnpm-patches-overrides",
      atlasIds: ["oss-pnpm-patches-no-unsafe-eval", "oss-supply-chain-pinning", "oss-license-notice-pipeline"],
    },
    {
      id: "wasm-vips",
      name: "wasm-vips",
      kind: "library",
      package: "wasm-vips",
      oneLine: t("이미지 처리 라이브러리 libvips를 WASM으로 옮긴 것", "The image-processing library libvips compiled to WASM"),
      usedFor: t(
        "한 변이 8192px를 넘는 초대형 페이지를 최종 내보낼 때 Lanczos3 방식으로 줄입니다(16,384² 화소까지). 미리보기에는 쓰지 않습니다.",
        "Downsizes pages over 8192 px on a side with the Lanczos3 kernel during final export (up to 16,384² pixels). It is not used for previews.",
      ),
      why: t(
        "Quality Lab 실측(2026-08-07, 2048→512 축소)에서 PSNR 27.26dB·SSIM 0.9887로 CanvasKit 두 방식(25.31/0.9834, 23.78/0.9768)보다 높았습니다. 그래서 큰 페이지의 최종 내보내기에만 씁니다.",
        "In the Quality Lab measurement (2026-08-07, 2048 to 512 downscale) it scored PSNR 27.26 dB and SSIM 0.9887, above both CanvasKit methods (25.31/0.9834 and 23.78/0.9768). So it is used only for the final export of big pages.",
      ),
      alternatives: t(
        "비교 후보는 CanvasKit 선형·cubic 축소입니다. 더 빠르지만(15~30ms 대 124ms, Apple M2 Max 1대) 화질 점수가 낮았고, 내보내기가 실패해도 다른 방식으로 몰래 대체하지 않습니다.",
        "The comparison candidates were CanvasKit linear and cubic downscaling. They are faster (15 to 30 ms versus 124 ms on one Apple M2 Max) but scored lower, and a failed export is never quietly replaced by another method.",
      ),
      cost: t(
        "래퍼만 MIT이고 내장 libvips·glib·libheif 등은 LGPLv3입니다(설치본 THIRD-PARTY-NOTICES.md). 레지스트리는 'dev-only 후보·LGPL 격리 배포 필요'라 적어, 상업 배포 조건은 별도 확인이 필요합니다.",
        "Only the wrapper is MIT; the bundled libvips, glib, libheif and others are LGPLv3 (the installed THIRD-PARTY-NOTICES.md). The registry says 'dev-only candidate, LGPL isolated deployment required', so commercial distribution terms need separate review.",
      ),
      paths: [
        `${EXPORT}/studio-vips-export.ts`,
        `${EXPORT}/studio-export-presets.ts`,
        "packages/studio-engine-registry/src/filter-providers.ts",
        "docs/candidates/filters/capability-survey.md",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "wasm-vips",
      atlasIds: ["oss-license-notice-pipeline"],
    },
    {
      id: "ag-psd",
      name: "ag-psd",
      kind: "library",
      package: "ag-psd",
      oneLine: t("Photoshop 파일(PSD)을 읽고 쓰는 JavaScript 라이브러리", "A JavaScript library that reads and writes Photoshop (PSD) files"),
      usedFor: t(
        "작품을 요소별 레이어 PSD로 내보내 Photoshop에서 다시 만지게 하고, PSD 레이어와 ABR 브러시를 가져옵니다.",
        "Exports artwork as a per-element layered PSD that can be edited again in Photoshop, and imports PSD layers and ABR brushes.",
      ),
      why: t(
        "웹툰 작가가 Photoshop에서 요소별로 다시 고칠 수 있는 결과가 필요해, 각 요소를 실제로 그린 픽셀 그대로 레이어에 담아 PSD로 조립합니다. MIT 라이선스의 기존 브라우저 PSD 작성기를 이어 썼습니다.",
        "Webtoon artists need a result they can edit element by element in Photoshop, so each element is captured as the pixels actually drawn and assembled into a PSD. We kept using the existing MIT-licensed browser PSD writer.",
      ),
      alternatives: t(
        "Photoshop 글자 엔진 데이터를 직접 주입하는 방법은 비공개 키가 버전에 묶여 파일이 깨질 수 있어 쓰지 않았고, 루비 글자는 보이는 래스터와 XMP 목록으로 보존합니다.",
        "Injecting Photoshop text-engine data by hand was rejected because the private keys are tied to versions and can corrupt files; ruby text is preserved as a visible raster plus an XMP manifest.",
      ),
      cost: t(
        "회전·세로쓰기·곡선·효과가 든 글자는 Photoshop에서 글자로 다시 편집되지 않고 래스터로 남습니다. pnpm 패치 1개로 ABR 오류 경로의 Node 전용 호출을 걷어냈지만 전용 회귀 테스트는 못 찾았습니다.",
        "Text with rotation, vertical writing, curves or effects stays raster instead of editable text in Photoshop. One pnpm patch removes a Node-only call from the ABR error path, but we found no dedicated regression test for it.",
      ),
      paths: [`${EXPORT}/studio-psd-export.ts`, `${CREATOR}/studio-abr-import.ts`, "patches/ag-psd@31.0.1.patch"],
      license: "MIT",
      status: "live",
      mapRowId: "psd-pdf-formats",
      atlasIds: ["oss-pnpm-patches-no-unsafe-eval"],
    },
    {
      id: "pdf-lib",
      name: "pdf-lib",
      kind: "library",
      package: "pdf-lib",
      oneLine: t("이미 있는 PDF를 합치고 돌리고 나누는 JavaScript 라이브러리", "A JavaScript library that merges, rotates and splits existing PDFs"),
      usedFor: t(
        "PDF 작업대에서 PDF를 합치기·재배열·회전·분할하고, 페이지 썸네일은 pdf.js(Apache-2.0)가 그립니다. 모두 기기 안에서 하고 서버로 보내지 않습니다.",
        "In the PDF workbench it merges, reorders, rotates and splits PDFs, and pdf.js (Apache-2.0) draws the page thumbnails. All of it runs on the device and nothing goes to a server.",
      ),
      why: t(
        "원고 PDF를 서버에 올리지 않고 브라우저에서 바로 다루려는 요구에 맞습니다. 계획(모델)은 순수 함수로 두고 pdf-lib 어댑터는 실제 바이트 연산만 맡게 나눠 테스트하기 쉽게 했습니다.",
        "It meets the need to handle manuscript PDFs in the browser without uploading them. The plan (model) is pure functions and the pdf-lib adapter does only the byte operations, which makes it easy to test.",
      ),
      alternatives: t(
        "작품을 PDF로 내보내는 길은 외부 라이브러리 없이 직접 조립하는 엔진이 맡고(같은 입력이면 같은 바이트), pdf-lib는 이미 있는 PDF를 다루는 작업대에만 씁니다.",
        "Exporting artwork to PDF is done by an engine assembled by hand with no library (same input, same bytes); pdf-lib is used only in the workbench for existing PDFs.",
      ),
      cost: t(
        "암호가 걸린 PDF는 열지 못해 '암호가 걸려 있어요'로 안내합니다(복호화는 범위 밖). pdf.js는 Worker 파일과 함께 필요할 때만 불러옵니다.",
        "It cannot open an encrypted PDF, so the screen says it is password-protected (decryption is out of scope). pdf.js and its Worker file load only when needed.",
      ),
      paths: [
        `${CREATOR}/pdf-workbench/pdf-workbench-engine.ts`,
        `${CREATOR}/pdf-workbench/pdf-workbench-thumbnails.ts`,
      ],
      license: "MIT",
      status: "live",
      mapRowId: "psd-pdf-formats",
      atlasIds: ["export-engine-deterministic-pdf"],
    },
    {
      id: "remotion",
      name: "Remotion",
      kind: "library",
      oneLine: t("React 코드로 영상을 만드는 도구", "A tool for making video with React code"),
      usedFor: t(
        "공개 '제품 투어' 영상을 웹에서 재생하고(@remotion/player), 브랜드 필름은 별도 도구로 렌더하며, 홍보 영상 편집기는 로컬 렌더용 Remotion ZIP을 내보냅니다.",
        "Plays the public product-tour video on the web (@remotion/player), renders the brand film in a separate tool, and the promo-video editor exports a Remotion ZIP for local rendering.",
      ),
      why: t(
        "브라우저 실시간 녹화는 탭이 보이는 동안만 되지만, Remotion 구성은 프레임을 정확히 계산해 재생 속도와 무관하게 H.264로 렌더할 수 있습니다. 홈은 초기 번들에 가져오지 않고 /product-tour 경로에서만 불러옵니다.",
        "Native browser recording works in real time only while the tab is visible, but a Remotion composition computes frames exactly and can render H.264 regardless of playback speed. The home page does not pull it into the initial bundle; it loads only on the /product-tour route.",
      ),
      alternatives: t(
        "브라우저 Canvas와 MediaRecorder 녹화는 실시간이라 탭을 보이게 둬야 해서, 홍보 영상 편집기는 이 방식과 Remotion ZIP을 함께 제공합니다.",
        "Browser Canvas with MediaRecorder recording is real time and needs a visible tab, so the promo-video editor offers it alongside the Remotion ZIP.",
      ),
      cost: t(
        "자체 라이선스(SPDX 아님): 자격이 되면 무료, 아니면 Company License입니다. 저장소는 패키지·버전·라이선스 문구 해시를 고정해 감시하지만 배포 법인의 자격은 별도 확인이 필요합니다.",
        "A custom license (not an SPDX ID): free if eligible, otherwise a Company License. The repository pins and audits the package, version and license-text hash, but whether the distributing entity qualifies needs separate review.",
      ),
      paths: [
        "apps/web/src/domains/marketing/ProductTourPlayer.tsx",
        "packages/product-tour-film/src/ProductTourFilm.tsx",
        "tools/media/brand-film/package.json",
      ],
      license: "Remotion License",
      licenseSource: "THIRD_PARTY_NOTICES.md",
      status: "live",
      mapRowId: "remotion",
      atlasIds: ["oss-license-notice-pipeline"],
    },
  ],
  pitfall: t(
    "wasm-vips(LGPL 구성요소)와 Remotion(자체 라이선스)은 설치본이 말하는 라이선스만 적었고 적격성은 판단하지 않았습니다. resvg·HarfBuzz는 모듈과 테스트만 있고 제품에 연결하지 않아(experimental) 카드에서 뺐습니다.",
    "For wasm-vips (LGPL components) and Remotion (custom license) only what the installed package says is written, and eligibility is not judged. resvg and HarfBuzz have modules and tests but are not wired into the product (experimental), so they are left out of the cards.",
  ),
  status: "live",
  atlasIds: [
    "oss-pnpm-patches-no-unsafe-eval",
    "oss-supply-chain-pinning",
    "oss-license-notice-pipeline",
    "axe-a11y-matrix",
    "test-honesty-and-time-budget-isolation",
    "export-engine-deterministic-pdf",
  ],
  chapterIds: ["delivery", "quality", "licenses", "open-source", "performance"],
  glossaryIds: [
    "ci-cd",
    "ratchet",
    "axe-wcag",
    "lockfile-supply-chain",
    "pnpm-patch-fork",
    "notices-sbom",
    "lgpl-separate-module",
    "oss-license",
    "remotion",
    "contract-test",
    "permissive-vs-copyleft",
    "spdx",
  ],
};
