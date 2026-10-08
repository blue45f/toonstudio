import { codePair, t } from "./engineering-atlas-open-data-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * open-data 카드 4: 오픈소스를 고쳐 쓰는 법(pnpm 패치 · wgpu 벤더 포크) · 라이선스 고지 파이프라인 · 공급망 고정.
 * 사실 근거는 카드마다 usage.paths 와 facts.source 에 둔 파일이다(2026-10-07 코드와 대조).
 * 라이선스 서술은 저장소의 처리 방식만 다루며 법률 판단은 하지 않는다.
 */
export const OPEN_DATA_OSS_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "oss-pnpm-patches-no-unsafe-eval",
    category: "open-data",
    name: "pnpm patch",
    title: t("고쳐서 쓰는 오픈소스: pnpm 패치 7개와 unsafe-eval 없는 실행", "Open source we patch: seven pnpm patches and running without unsafe-eval"),
    status: "live",
    tagline: t("패치 7개 중 3개는 new Function 문제를 풀어 CSP 를 풀지 않고도 동작하게 합니다.", "Three of seven patches tackle new Function so libraries run without relaxing the CSP."),
    background: [
      t(
        "오픈소스는 가져다 쓰는 것이 기본이지만, 우리 사정에 맞지 않는 곳이 생기면 둘 중 하나를 고릅니다. 원본 프로젝트가 고쳐 주기를 기다리거나, 우리 쪽에서 작게 고쳐 쓰는 것입니다. pnpm 패치는 설치된 패키지의 특정 버전 위에 작은 수정 파일(diff)을 얹는 방법이라, 원본을 통째로 복사하는 포크보다 변경 범위가 작고 눈에 잘 띕니다. 지금 패치 7개를 쓰고, 소스를 통째로 저장소에 두고 고친 포크는 wgpu-toon 과 braces 둘입니다.",
        "Open source is normally used as it comes, but when something does not fit, there are two choices: wait for the original project to fix it, or patch it a little ourselves. A pnpm patch lays a small diff over one exact version of an installed package, so the change is smaller and easier to see than a fork that copies the whole source. Seven patches are in use today, plus two forks that keep the whole source in the repository: wgpu-toon and braces.",
      ),
      t(
        "가장 중요한 이유는 보안 설정입니다. 운영 CSP 의 script-src 는 'wasm-unsafe-eval' 만 열고 'unsafe-eval' 은 열지 않습니다. 그런데 일부 라이브러리는 문자열로 코드를 만드는 new Function 을 씁니다. 세 패치가 이를 다루는 방식은 둘입니다. manifold-3d 와 ktx2-encoder 는 패치한 파일의 new Function 2곳을 정적 코드로 바꿔 0곳이 됐고(설치본 검색으로 확인), @gltf-transform/functions 는 호출을 없앤 것이 아니라 Function() 을 쓰는 이미지 커널(ndarray 계열)을 처음 필요할 때만 불러오게 미뤘습니다. CSP 를 풀지 않고 라이브러리를 고친 것입니다.",
        "The main reason is a security setting. The production CSP script-src opens only 'wasm-unsafe-eval' and not 'unsafe-eval', yet some libraries use new Function, which builds code from strings. Three patches address this in two ways. In manifold-3d and ktx2-encoder the two new Function sites in the patched files became static code and now number zero (checked by searching the installed copies); @gltf-transform/functions does not remove a call but loads its Function-using image kernels (the ndarray family) only when first needed. The libraries were fixed instead of loosening the CSP.",
      ),
      t(
        "나머지 네 패치는 이유가 다릅니다. React Three Fiber 는 폐기된 THREE.Clock 경고를 피하고, p5.brush 는 소프트웨어 WebGL 에서 같은 seed 도 픽셀이 달라지던 셰이더 미분을 유한 차분으로 바꾸고, ag-psd 는 브라우저에 없는 Node util 호출을 없애며, minimatch 는 brace-expansion 5 에 맞춘 호환 어댑터입니다. braces 는 패치가 아니라 저장소 포크입니다. 수정 릴리스가 나오지 않은 취약점 때문에, 3.0.3 에 미배포 수정과 중첩 깊이 100 상한을 더한 사본(patches/braces)으로 취약 범위를 대체했습니다. 관리 원칙은 정확한 버전에만 묶고, 업그레이드 때마다 다시 검토하고, 검증 장치를 두는 것입니다.",
        "The other four patches have different reasons. React Three Fiber avoids the deprecated THREE.Clock warning; p5.brush swaps shader derivatives that gave different pixels for the same seed on software WebGL for finite differences; ag-psd drops a Node util call that browsers lack; and minimatch is a compatibility adapter for brace-expansion 5. braces is a repository fork, not a patch: because the vulnerability has no upstream fix, the vulnerable range is replaced by a copy of 3.0.3 plus unreleased upstream fixes and a nesting-depth cap of 100 (patches/braces). The management rules are to pin to an exact version, to review at every upgrade and to keep a verification mechanism.",
      ),
      t(
        "한계도 말해야 합니다. 상류에 반영된 근거(PR·이슈)를 저장소에서 찾지 못했고, 패치는 정확한 버전에 묶여 있어 라이브러리를 올릴 때마다 다시 써야 합니다. 또 CSP 호환은 라이브러리 전체가 아니라 검증한 작업 9개 기준이며, 선택적 이미지 API 전부가 호환된 것은 아닙니다. braces 포크는 레지스트리 패키지가 아니라 pnpm audit 대상에서 빠지므로 이후 권고는 직접 확인해야 합니다.",
        "The limits must be stated too. No evidence of upstream acceptance (PRs or issues) was found in the repository, and because patches are tied to an exact version, each library upgrade means rewriting them. CSP compatibility also holds for the nine verified jobs, not for whole libraries, and not every optional image API became compatible. The braces fork is not a registry package, so pnpm audit skips it and later advisories must be checked by hand.",
      ),
    ],
    keyPoints: [
      t("패치 7개 중 3개는 new Function 문제를 풀어 CSP 를 풀지 않는다", "Three of seven patches address new Function, no CSP relaxation"),
      t("정확한 버전에 묶고, 업그레이드 때마다 다시 검토한다", "Pinned to exact versions and reviewed at every upgrade"),
      t("문자열 코드 생성을 금지한 Node 와 실제 CSP 로 확인한다", "Verified in Node with code generation off and under the real CSP"),
    ],
    diagram: {
      id: "oss-pnpm-patches-no-unsafe-eval-diagram",
      kind: "graph",
      title: t("원본 → 패치 → 검증 → 운영", "Original, patch, verification, production"),
      caption: t("CSP 를 풀지 않고 라이브러리를 고친 뒤, 문자열 코드 생성을 막은 환경에서 실제로 돌려 확인합니다.", "Fix the library instead of loosening the CSP, then run it for real where string code generation is blocked."),
      alt: t(
        "new Function 을 쓰는 원본 패키지에 pnpm 패치가 적용되어 패치된 설치본이 됩니다. 설치본은 번들되어 운영 브라우저로 가기 전에, 문자열 코드 생성을 금지한 Node 시험과 실제 CSP 로 돌리는 빌드 Worker 검증 9개 작업을 통과해야 합니다.",
        "A pnpm patch is applied to an original package that uses new Function, producing a patched install. Before the install is bundled to the production browser, it must pass a Node test with string code generation disabled and nine build-worker jobs run under the real CSP.",
      ),
      nodes: [
        { id: "orig", label: t("원본 패키지", "Original package"), sub: t("내부에 new Function", "uses new Function inside"), tone: "warn", at: [0, 0] },
        { id: "patch", label: t("pnpm 패치", "pnpm patch"), sub: t("정확한 버전에만 적용", "pinned to one version"), tone: "server", at: [1, 0] },
        { id: "fixed", label: t("패치된 설치본", "Patched install"), sub: t("new Function 제거·지연", "new Function removed or deferred"), tone: "good", at: [2, 0] },
        { id: "browser", label: t("운영 브라우저", "Production browser"), sub: t("CSP 에 unsafe-eval 없음", "CSP without unsafe-eval"), tone: "local", shape: "pill", at: [3, 0] },
        { id: "node", label: t("Node 시험", "Node test"), sub: t("문자열 코드 생성 금지", "string code generation off"), tone: "good", at: [2, 1] },
        { id: "ver", label: t("빌드 Worker 검증", "Built-worker check"), sub: t("실제 CSP 로 9개 작업", "9 jobs under the real CSP"), tone: "good", at: [3, 1] },
      ],
      edges: [
        { from: "orig", to: "patch", label: t("diff", "diff") },
        { from: "patch", to: "fixed", label: t("적용", "apply") },
        { from: "fixed", to: "browser", label: t("번들", "bundle") },
        { from: "fixed", to: "node", label: t("시험", "test") },
        { from: "node", to: "ver", label: t("통과", "pass") },
        { from: "ver", to: "browser", label: t("게이트", "gate") },
      ],
    },
    usage: [
      {
        feature: t("3D 전문 처리 · 불리언·압축·텍스처", "3D specialist processing · booleans, compression, textures"),
        role: t("manifold-3d 솔리드 불리언, glTF 압축, KTX2 인코딩을 Worker 에서 unsafe-eval 없이 실행합니다.", "Runs manifold-3d solid booleans, glTF compression and KTX2 encoding in Workers without unsafe-eval."),
        paths: ["patches/manifold-3d@3.5.1.patch", "patches/ktx2-encoder@0.6.0.patch", "patches/@gltf-transform__functions@4.4.2.patch"],
        route: "/studio",
      },
      {
        feature: t("CSP 호환 검증", "CSP compatibility checks"),
        role: t("문자열 코드 생성을 금지한 Node 와 실제 운영 CSP 로 돌린 빌드 Worker 로 패치가 유효한지 확인합니다.", "Confirms the patches with a Node that forbids string code generation and with built Workers run under the real production CSP."),
        paths: ["apps/web/src/domains/creator/scene3d/specialists/specialist-csp-compat.test.ts", "scripts/verify-studio-scene3d-specialists.mjs", "pnpm-workspace.yaml"],
      },
      {
        feature: t("붓·3D 화면·PSD 가져오기의 보정", "Fixes for brushes, the 3D view and PSD import"),
        role: t("R3F 는 폐기 경고, p5.brush 는 셰이더 결정성, ag-psd 는 브라우저 호환을 위해 고쳐 씁니다.", "R3F is patched for a deprecation warning, p5.brush for shader determinism and ag-psd for browser compatibility."),
        paths: ["patches/@react-three__fiber@9.6.1.patch", "patches/p5.brush@2.2.1.patch", "patches/ag-psd@31.0.1.patch"],
      },
      {
        feature: t("개발 도구 · braces 보안 포크", "Dev tooling · the braces security fork"),
        role: t("ESLint 경계 검사가 쓰는 micromatch 가 braces 취약 범위를 거쳐, 패치 대신 중첩 깊이 100 상한을 더한 저장소 사본으로 대체했고 회귀 시험이 낡은 사본을 잡습니다.", "The micromatch behind the ESLint boundary check pulls in the vulnerable braces range, so a repository copy with a nesting-depth cap of 100 replaces it instead of a patch, and a regression test catches a stale copy."),
        paths: ["patches/braces/README.md", "scripts/braces-security-compat.test.mjs", "pnpm-workspace.yaml"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("패치의 핵심: 즉시 불러오던 것을 쓸 때 불러오기", "The patch idea: load on first use instead of eagerly"),
        language: "text",
        ...codePair(`
//~ 이미지 커널(ndarray-*)은 Function() 을 쓴다. 맨 위에서 즉시 불러오지 않고 쓸 때 불러온다. ## The image kernels (ndarray-*) use Function(). Load them when needed, not eagerly at the top.
-import { getPixels, savePixels } from "ndarray-pixels";
-import ndarray from "ndarray";
-import { lanczos2, lanczos3 } from "ndarray-lanczos";
+async function getPixels(...args) { return (await import("ndarray-pixels")).getPixels(...args); }
+async function savePixels(...args) { return (await import("ndarray-pixels")).savePixels(...args); }
+async function loadNdarray() { return (await import("ndarray")).default; }
+async function lanczos3(...args) { return (await import("ndarray-lanczos")).lanczos3(...args); }
//~ (lanczos2 도 같은 방식이다) ## (lanczos2 is wrapped the same way)
-paletteTexturePixels.baseColor = ndarray(new Uint8Array(w * h * 4), [w, h, 4]);
+paletteTexturePixels.baseColor = (await loadNdarray())(new Uint8Array(w * h * 4), [w, h, 4]);
`),
        explain: t(
          "patches/@gltf-transform__functions@4.4.2.patch 의 발췌입니다. 기하 전용 변환은 이미지 커널을 초기화하지 않게 되고, 팔레트 PNG 처럼 이미지 API 를 실제로 부를 때만 원래 의존성을 불러옵니다. 이미지 API 가 CSP 호환이 됐다는 뜻은 아닙니다.",
          "An excerpt of patches/@gltf-transform__functions@4.4.2.patch. Geometry-only transforms no longer initialize the image kernels, and the original dependencies load only when an image API such as palette PNG generation is really called. It does not claim the image APIs became CSP-compatible.",
        ),
        source: "patches/@gltf-transform__functions@4.4.2.patch",
      },
      {
        kind: "simplified",
        title: t("문자열 코드 생성을 금지한 Node 로 실제 실행", "Run it for real in Node with string code generation off"),
        language: "js",
        ...codePair(`
import { execFileSync } from "node:child_process";

//~ Function()/eval 을 금지한 Node 로 패치한 패키지를 실제로 실행해 본다. ## Run the patched package in a Node that forbids Function() and eval.
const output = execFileSync(
  process.execPath,
  [
    "--disallow-code-generation-from-strings", //~ 문자열로 코드를 만들면 즉시 오류 ## building code from strings now throws
    "--input-type=module",
    "--eval",
    "import factory from 'manifold-3d'; const m = await factory(); m.setup(); " +
      "const cube = m.Manifold.cube([2, 2, 2], true); console.log(cube.volume()); cube.delete();",
  ],
  { encoding: "utf8", timeout: 20_000 },
);
if (output.trim() !== "8") throw new Error("patch is broken: " + output); //~ 부피 8 이면 WASM 커널이 정상이다 ## volume 8 means the WASM kernel works
`),
        explain: t(
          "specialist-csp-compat.test.ts 의 방식을 줄인 것입니다. 패치가 깨졌거나 업그레이드로 new Function 이 되살아나면 이 실행이 오류로 끝나 알려 줍니다. Node 전용이라 구문만 검증합니다.",
          "A reduction of the approach in specialist-csp-compat.test.ts. If a patch breaks or an upgrade brings new Function back, this run ends in an error and tells us. It is Node-only, so only the syntax is verified.",
        ),
        source: "apps/web/src/domains/creator/scene3d/specialists/specialist-csp-compat.test.ts",
        verify: "syntax",
      },
    ],
    links: [
      { title: "pnpm · pnpm patch", url: "https://pnpm.io/cli/patch", kind: "docs" },
      { title: "pnpm · patchedDependencies setting", url: "https://pnpm.io/settings#patcheddependencies", kind: "docs", note: t("패치를 정확한 버전에 묶는 설정", "The setting that ties a patch to an exact version") },
      { title: "MDN · CSP script-src", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src", kind: "docs", note: t("unsafe-eval 과 wasm-unsafe-eval 의 차이", "unsafe-eval versus wasm-unsafe-eval") },
      { title: "Emscripten · DYNAMIC_EXECUTION setting", url: "https://emscripten.org/docs/tools_reference/settings_reference.html#dynamic-execution", kind: "docs", note: t("정적 디스패치 패치가 따른 방식", "The approach the static-dispatch patches follow") },
      { title: "MDN · Function() constructor", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/Function", kind: "docs" },
    ],
    chapterIds: ["open-source", "infrastructure"],
    talk: {
      pitch: t(
        "오픈소스는 가져다 쓰는 것만이 아니라 필요하면 작게 고쳐 씁니다. pnpm 패치 7개를 쓰고, 그중 3개는 라이브러리 안의 new Function 을 걷어 내거나(2개) 필요할 때까지 미뤄서(1개) 운영 보안 정책(CSP)을 풀지 않고도 3D 불리언과 압축이 돌아가게 했습니다. 통째로 복사해 고친 포크는 wgpu-toon 과 braces 둘입니다. 패치마다 정확한 버전에 묶고 검증 장치를 둡니다.",
        "We do not only consume open source; we patch it a little when needed. Seven pnpm patches are in use, and three of them either remove new Function from libraries (two) or postpone loading it until needed (one), so 3D booleans and compression run without relaxing the production security policy (CSP). The two forks that copy the whole source are wgpu-toon and braces. Each patch is tied to an exact version and backed by a verification mechanism.",
      ),
      analogy: t(
        "가전제품을 통째로 새로 사는 대신 맞지 않는 플러그에 어댑터를 하나 끼워 쓰는 것과 같습니다. 어댑터 규격이 바뀌면(라이브러리 업그레이드) 다시 맞춰야 합니다.",
        "It is like adding one adapter to a plug that does not fit instead of buying a whole new appliance. When the socket standard changes (a library upgrade), the adapter must be redone.",
      ),
      questions: [
        {
          question: t("왜 CSP 를 풀지 않고 라이브러리를 고쳤나요?", "Why fix the library rather than loosen the CSP?"),
          answer: t(
            "unsafe-eval 을 열면 문자열로 코드를 실행하는 길을 사이트 전체에 허용하게 되어 방어선이 약해집니다. 저장소 문서도 업그레이드 때 패치를 다시 검토하고 CSP 를 완화하지 말라고 적습니다. 대신 패치를 유지하는 비용을 부담합니다.",
            "Opening unsafe-eval allows string-to-code execution across the whole site and weakens the defence. The repository's own notes say to re-review patches on upgrades and not to relax the CSP. The price is the upkeep of the patches.",
          ),
        },
        {
          question: t("원본 프로젝트에 반영했나요?", "Were the patches accepted upstream?"),
          answer: t(
            "저장소에서 상류 PR 이나 이슈 근거를 찾지 못했습니다. 반영됐다고 말할 수 없습니다.",
            "No upstream PR or issue evidence was found in the repository, so we cannot say they were accepted.",
          ),
        },
        {
          question: t("라이브러리를 올리면 어떻게 되나요?", "What happens when a library is upgraded?"),
          answer: t(
            "패치는 정확한 버전에 묶여 있어 새 버전에서는 다시 써야 합니다. CSP 호환 시험이 실제 실행으로 깨짐 여부를 확인합니다.",
            "Patches are tied to the exact version, so a new version needs them rewritten. The CSP compatibility test checks by real execution whether things still work.",
          ),
        },
      ],
      pitfall: t(
        "CSP 를 모두 통과한다고 말하지 마세요. 확인된 범위는 라이브러리 3개가 unsafe-eval 없이 동작한다는 것(검증 작업 9개 기준)입니다. 2개는 new Function 을 정적 코드로 바꿨고 @gltf-transform/functions 는 Function() 을 쓰는 이미지 커널을 필요할 때까지 미룬 것이라 선택적 이미지 API 전부가 호환인 것은 아닙니다. 상류 반영 근거는 찾지 못했습니다. braces 는 패치가 아니라 포크이고 pnpm audit 대상이 아니어서 이후 권고는 직접 확인해야 합니다.",
        "Do not say everything passes the CSP. What is confirmed is that three libraries work without unsafe-eval (for the nine verified jobs). Two replaced new Function with static code, while @gltf-transform/functions only postpones its Function-using image kernels until needed, so not every optional image API is compatible. No upstream-acceptance evidence was found. braces is a fork, not a patch, and pnpm audit skips it, so later advisories must be checked by hand.",
      ),
    },
    technologies: ["pnpm", "CSP", "WebAssembly", "glTF Transform", "Manifold"],
    facts: [
      { value: "7", label: t("pnpm 패치 수(braces 는 패치가 아니라 포크)", "pnpm patches (braces is a fork, not a patch)"), source: "pnpm-workspace.yaml" },
      { value: "2 → 0", label: t("manifold-3d 패치 파일의 new Function 수", "new Function sites in the patched manifold-3d file"), source: "patches/manifold-3d@3.5.1.patch" },
      { value: "100", label: t("braces 포크의 중첩 깊이 상한(MAX_DEPTH)", "Nesting-depth cap in the braces fork (MAX_DEPTH)"), source: "patches/braces/lib/constants.js" },
      { value: "9", label: t("실제 CSP 로 돌린 검증 작업 수", "Jobs run under the real CSP"), source: "docs/reports/studio-scene3d-specialist-toolchain-2026-09-19.md" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "oss-fork-wgpu-toon",
    category: "open-data",
    name: "wgpu-toon",
    title: t("복사해 한 가지만 더한 벤더 포크: 같은 GPUDevice 공유", "A vendored fork with one addition: sharing the same GPUDevice"),
    status: "experimental",
    tagline: t("wgpu 29.0.4 를 저장소에 복사해 패치 1개를 얹고, 모든 변경을 피처 하나 뒤에 둡니다.", "wgpu 29.0.4 is copied into the repo with one patch, every change sitting behind a single feature."),
    background: [
      t(
        "오픈소스를 쓰다 보면 우리에게 꼭 필요한 기능이 원본에 없을 때가 있습니다. 가장 가벼운 해결은 작은 패치이고, 부족하면 원본 소스를 저장소에 복사해 고쳐 쓰는 벤더 포크가 됩니다. ToonStudio 는 그래픽 라이브러리 wgpu 29.0.4 를 crates/vendor/wgpu-toon 에 복사해 한 가지 기능만 더했습니다. 페이지가 이미 열어 둔 GPU 작업대(GPUDevice)를 다른 도구와 함께 쓰게 하는 기능입니다(장치를 한 곳에서 빌려 쓰는 구조는 드로잉 카드 gpu-fabric-device-lease-vello 에서 다룹니다).",
        "Sometimes open source lacks a feature we need. The lightest fix is a small patch; when that is not enough, copying the source into the repository and editing it is a vendored fork. ToonStudio copied the graphics library wgpu 29.0.4 into crates/vendor/wgpu-toon and added one feature: letting the GPU workbench (GPUDevice) that the page already opened be shared with other tools (how one device is leased to everyone is covered in the drawing card gpu-fabric-device-lease-vello).",
      ),
      t(
        "wgpu 29 에는 페이지가 이미 가진 GPUDevice 를 wgpu::Device 로 받아들이는 방법이 없었습니다. 그래서 필터 WGSL(GPU 셰이더 언어)과 Vello(벡터 렌더러)가 서로 다른 작업대를 써서, 결과를 넘길 때마다 CPU 로 읽어 내렸다가(readback) 다시 올려야 했습니다. 포크는 같은 GPUDevice 를 채택(adopt)해 이 왕복을 없앱니다. 패치는 6개 파일에 걸친 6개 hunk(패치 주석 기준)이고 모두 toon-fabric 피처 뒤에 있어, 피처를 끄면 원본 wgpu 와 API 가 같습니다.",
        "wgpu 29 had no way to take a GPUDevice the page already owns and treat it as a wgpu::Device. So the filter WGSL (GPU shader language) and Vello (a vector renderer) used different workbenches and had to read results down to the CPU (readback) and upload them again at every hand-off. The fork adopts the same GPUDevice and removes that round trip. The patch is six hunks (by its own comments) across six files, all behind the toon-fabric feature, so with it off the API equals upstream wgpu.",
      ),
      t(
        "속도 이득은 크기마다 다르고, 정본은 결과 파일 하나입니다. 2026-09-23 측정(Chrome 153, 표본 9개)은 256²·512²·1024² 에서 0.93·3.29·3.12배로, 256² 는 이득이 측정되지 않았습니다. 문서에 이전 기록(2026-08-08, Chromium 140)으로 남은 1.89·2.12·2.43배는 덮어써진 옛 결과의 수치이고, 그때 붙인 ‘왕복 하한’ 풀이도 현재 값으로는 확인되지 않습니다. 읽은 바이트가 기존 경로와 일치한다는 점은 어느 쪽이나 같습니다. 배속을 단정하지 말고 구조적 이유(readback 제거)와 픽셀 일치를 근거로 말하는 편이 안전합니다.",
        "The speed-up varies with size, and the canonical record is one result file. The 2026-09-23 run (Chrome 153, 9 samples) gives 0.93x, 3.29x and 3.12x at 256², 512² and 1024², with no gain measured at 256². The 1.89x, 2.12x and 2.43x that the document keeps as a prior record (2026-08-08, Chromium 140) are numbers from an overwritten earlier result, and the round-trip-floor explanation attached to them is not confirmed by the current values. Both agree that the bytes read matched the old path. It is safer to rest on the structural reason (readback removed) and the pixel match than on any speed-up number.",
      ),
      t(
        "한계를 그대로 적습니다. 상류에 반영을 시도한 근거(PR·이슈)를 저장소에서 찾지 못했고 문서에는 PR 후보로만 적혀 있습니다. 복사본의 드리프트를 막는 UPSTREAM.sha256 은 189개 파일을 고정하는데 그중 Cargo.toml.orig 가 트리에 없어 vendor_patch_parity 시험이 실패할 것으로 보입니다(정적 추정, 실행하지 않음). 이 시험을 호출하는 CI 워크플로도 찾지 못했습니다.",
        "The limits, as they are. No evidence of an attempt to upstream the change (PR or issue) was found in the repo; the notes call it only a PR candidate. UPSTREAM.sha256, which guards the copy against drift, pins 189 files but Cargo.toml.orig is missing from the tree, so the vendor_patch_parity test appears likely to fail (static inference, not executed). No CI workflow calling that test was found either.",
      ),
    ],
    keyPoints: [
      t("wgpu 29.0.4 복사본 + 패치 1개, 모두 toon-fabric 피처 뒤", "A wgpu 29.0.4 copy plus one patch, all behind toon-fabric"),
      t("같은 GPUDevice 를 공유해 CPU 왕복(readback)을 없앤다", "Sharing one GPUDevice removes the CPU round trip (readback)"),
      t("배속은 크기마다 다르다: 0.93~3.29배(2026-09-23 정본)", "Speed-up varies by size: 0.93-3.29x (canonical, 2026-09-23)"),
    ],
    diagram: {
      id: "oss-fork-wgpu-toon-diagram",
      kind: "graph",
      title: t("작업대를 따로 쓸 때와 함께 쓸 때", "Separate workbenches versus one shared workbench"),
      caption: t("포크는 페이지의 GPUDevice 를 채택해, 결과를 CPU 로 내렸다 올리는 왕복을 없앱니다.", "The fork adopts the page's GPUDevice, removing the trip down to the CPU and back."),
      alt: t(
        "위 줄은 포크 전 경로입니다. Vello 가 자기 디바이스로 그린 결과를 CPU 메모리로 읽어 내렸다가 다시 올려 페이지의 GPUDevice 를 쓰는 필터에 넘깁니다. 아래 줄은 포크 후 경로로, Vello 가 페이지의 GPUDevice 를 채택해 공유 텍스처를 필터에 바로 넘깁니다.",
        "The top row is the path before the fork: Vello draws on its own device, the result is read down into CPU memory and uploaded again to the filter that uses the page's GPUDevice. The bottom row is the path after the fork: Vello adopts the page's GPUDevice and hands a shared texture straight to the filter.",
      ),
      nodes: [
        { id: "v0", label: t("Vello 렌더", "Vello render"), sub: t("자기 디바이스로 그림", "draws on its own device"), tone: "server", at: [0, 0] },
        { id: "cpu", label: t("CPU 메모리", "CPU memory"), sub: t("픽셀 배열이 왕복", "pixels travel both ways"), tone: "warn", at: [1, 0] },
        { id: "f0", label: t("필터 WGSL", "Filter WGSL"), sub: t("페이지의 GPUDevice", "the page's GPUDevice"), tone: "local", at: [2, 0] },
        { id: "v1", label: t("Vello 렌더", "Vello render"), sub: t("페이지 디바이스를 채택", "adopts the page device"), tone: "good", at: [0, 1] },
        { id: "f1", label: t("필터 WGSL", "Filter WGSL"), sub: t("같은 GPUDevice", "the same GPUDevice"), tone: "local", at: [2, 1] },
      ],
      edges: [
        { from: "v0", to: "cpu", label: t("readback", "readback") },
        { from: "cpu", to: "f0", label: t("업로드", "upload") },
        { from: "v1", to: "f1", label: t("공유 텍스처", "shared texture") },
      ],
      groups: [
        { id: "before", label: t("포크 전 · 기본 경로", "Before · default path"), tone: "warn", nodeIds: ["v0", "cpu", "f0"] },
        { id: "after", label: t("포크 후 · toon-fabric", "After · toon-fabric"), tone: "good", nodeIds: ["v1", "f1"] },
      ],
    },
    usage: [
      {
        feature: t("벡터 렌더 · Vello GPU 와 필터의 텍스처 교환", "Vector rendering · texture hand-off between Vello GPU and filters"),
        role: t("Track B(toon-fabric 켬)에서 Vello 가 필터와 같은 GPUDevice 를 채택해 공유 텍스처로 결과를 넘깁니다. Vello 는 명시적으로 고를 때만 쓰는 provider 입니다.", "In Track B (toon-fabric on), Vello adopts the same GPUDevice as the filters and passes results as a shared texture. Vello is a provider chosen explicitly."),
        paths: ["crates/vendor/wgpu-toon/PATCHES/0001-webgpu-handle-adoption.patch", "crates/studio-engine-vello/Cargo.toml", "packages/studio-engine-vello/src/gpu-browser.ts"],
      },
      {
        feature: t("복사본 드리프트 게이트", "Vendored-copy drift gate"),
        role: t("UPSTREAM.sha256 이 복사본의 모든 파일 해시를 고정하고, 시험이 선언되지 않은 수정과 패치 문서 누락을 잡도록 설계돼 있습니다.", "UPSTREAM.sha256 pins the hash of every vendored file, and a test is designed to catch undeclared edits and gaps in the patch document."),
        paths: ["crates/vendor/wgpu-toon/UPSTREAM.sha256", "crates/studio-engine-vello/tests/vendor_patch_parity.rs"],
      },
      {
        feature: t("측정 기록", "Measurement records"),
        role: t("교환 비용을 기존 경로(L0)와 같은 실행에서 비교한 결과와 하니스를 보관합니다.", "Keeps the exchange-cost comparison against the old path (L0) from the same run, together with its harness."),
        paths: ["tests/benchmarks/results/toon-vello-fork.json", "docs/engines/vello-baseline.md"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("Cargo 에서 복사본을 끼우고 피처로 켜고 끄기", "Swap in the copy with Cargo and switch it with a feature"),
        language: "toml",
        ...codePair(`
[features]
#~ Track A(기본)는 toon-fabric 이 꺼져 원본 wgpu 29.0.4 와 API 가 같다. Track B 에서 fabric 을 켠다. ## Track A (default) leaves toon-fabric off, so the API equals upstream wgpu 29.0.4; Track B turns fabric on.
fabric = ["gpu", "dep:wgpu"]

[dependencies]
wgpu = { version = "29.0.4", optional = true, default-features = false, features = ["toon-fabric"] }

[patch.crates-io]
#~ crates.io 의 wgpu 를 저장소 안 복사본으로 바꿔 끼운다. ## Replace the crates.io wgpu with the copy inside the repository.
wgpu = { path = "../vendor/wgpu-toon" }
`, "#"),
        explain: t(
          "crates/studio-engine-vello/Cargo.toml 의 발췌입니다. [patch.crates-io] 한 줄이 복사본을 끼우고, toon-fabric 피처가 꺼져 있으면 모든 패치 코드가 컴파일에서 빠집니다. 이 구조 덕분에 Track A 는 원본 변화 감지기 역할도 합니다.",
          "An excerpt of crates/studio-engine-vello/Cargo.toml. One [patch.crates-io] line swaps in the copy, and with the toon-fabric feature off all patched code is compiled out. That is why Track A doubles as a detector of upstream changes.",
        ),
        source: "crates/studio-engine-vello/Cargo.toml",
      },
      {
        kind: "simplified",
        title: t("피처 뒤에 숨긴 채택 함수", "The adoption function hidden behind the feature"),
        language: "rust",
        ...codePair(`
//~ 포크의 모든 추가 코드는 피처 뒤에 있다: 끄면 컴파일에서 사라져 원본과 API 가 같다. ## All added fork code sits behind the feature: with it off it compiles out and the API equals upstream.
#[cfg(all(webgpu, feature = "toon-fabric"))]
#[must_use]
pub fn from_webgpu_handle(device: webgpu::GpuDevice) -> (Self, Queue) {
    //~ 페이지가 이미 가진 GPUDevice 를 채택한다. queue 도 같은 JS 객체에서 꺼낸다. ## Adopt the GPUDevice the page already owns; the queue comes from the same JS object.
    let queue = crate::backend::webgpu::WebQueue::from_external_handle(device.queue());
    let device = crate::backend::webgpu::WebDevice::from_external_handle(device);
    (Self { inner: device.into() }, Queue { inner: queue.into() })
}
//~ wgpu 는 채택한 핸들을 파괴하지 않는다: GPUDevice 의 수명은 호출한 쪽 책임이다. ## wgpu never destroys an adopted handle: the caller owns the GPUDevice lifetime.
`),
        explain: t(
          "0001-webgpu-handle-adoption.patch 의 device.rs hunk(impl Device 안)를 줄인 것입니다. 이 함수는 wgpu 30 에도 없어 상류 PR 후보로만 기록돼 있습니다. 나머지 hunk 중 몇 개는 wgpu 30 에 이미 있는 내보내기 기능의 백포트입니다.",
          "A reduction of the device.rs hunk (inside impl Device) in 0001-webgpu-handle-adoption.patch. This function does not exist in wgpu 30 either, so it is recorded only as a candidate for an upstream PR. Several of the other hunks are backports of export features already in wgpu 30.",
        ),
        source: "crates/vendor/wgpu-toon/PATCHES/0001-webgpu-handle-adoption.patch",
      },
    ],
    links: [
      { title: "wgpu · repository", url: "https://github.com/gfx-rs/wgpu", kind: "repo" },
      { title: "W3C · WebGPU", url: "https://www.w3.org/TR/webgpu/", kind: "spec" },
      { title: "MDN · GPUDevice", url: "https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice", kind: "docs", note: t("페이지가 가진 GPU 작업대", "The GPU workbench a page owns") },
      { title: "Vello · repository", url: "https://github.com/linebender/vello", kind: "repo" },
      { title: "The Cargo Book · Overriding dependencies ([patch])", url: "https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html", kind: "docs", note: t("복사본을 끼우는 방법", "How the copy is swapped in") },
      { title: "The Cargo Book · Features", url: "https://doc.rust-lang.org/cargo/reference/features.html", kind: "docs" },
    ],
    chapterIds: ["open-source", "performance"],
    talk: {
      pitch: t(
        "오픈소스 그래픽 라이브러리 wgpu 에 우리에게 꼭 필요한 기능이 없어서, 29.0.4 를 저장소에 복사해 한 가지 기능만 더했습니다. 페이지가 이미 가진 GPU 작업대를 Vello 가 함께 쓰게 해서 CPU 로 왕복하던 단계를 없앱니다. 모든 변경은 피처 하나 뒤에 있고 끄면 원본과 같습니다.",
        "The open-source graphics library wgpu lacked a feature we needed, so we copied version 29.0.4 into the repository and added just one thing: letting Vello share the GPU workbench the page already owns, which removes the round trip through the CPU. Every change sits behind one feature, and with it off the code equals the original.",
      ),
      analogy: t(
        "공동 작업대입니다. 두 장인이 각자 작업대를 쓰면 물건을 넘길 때마다 상자에 담아 옮겨야 하지만, 같은 작업대를 쓰면 옆으로 밀어 주기만 하면 됩니다.",
        "It is a shared workbench. Two craftsmen on separate benches must box up each piece to hand it over, but on the same bench they just slide it sideways.",
      ),
      questions: [
        {
          question: t("얼마나 빨라졌나요?", "How much faster is it?"),
          answer: t(
            "정본 결과 파일(2026-09-23, Chrome 153, 표본 9개)은 교환 비용이 256²·512²·1024² 에서 0.93·3.29·3.12배이고 256² 는 이득이 없습니다. 문서에 이전 기록(2026-08-08, Chromium 140)으로 남은 1.89·2.12·2.43배는 덮어써진 옛 결과라 지금은 인용하지 않습니다. 숫자 하나로 단정하지 않고 CPU 왕복이 사라진다는 구조와 픽셀 일치를 근거로 말합니다.",
            "The canonical result file (2026-09-23, Chrome 153, 9 samples) gives 0.93x, 3.29x and 3.12x on exchange cost at 256², 512² and 1024², with no gain at 256². The 1.89x, 2.12x and 2.43x kept in the document as a prior record (2026-08-08, Chromium 140) come from an overwritten result, so we no longer quote them. We rest on the structure (the CPU round trip disappears) and the pixel match, not on one number.",
          ),
        },
        {
          question: t("상류에 기여했나요?", "Did you contribute it upstream?"),
          answer: t(
            "저장소에서 상류 PR 이나 이슈 근거를 찾지 못했습니다. 문서에는 PR 후보로만 적혀 있어 기여했다고 말할 수 없습니다.",
            "No upstream PR or issue evidence was found in the repository. The notes mention it only as a PR candidate, so we cannot say it was contributed.",
          ),
        },
        {
          question: t("복사본이 몰래 바뀌면 어떻게 알죠?", "How would we notice a silent change to the copy?"),
          answer: t(
            "UPSTREAM.sha256 이 189개 파일 해시를 고정하고 시험이 어긋남을 잡도록 설계돼 있습니다. 다만 그 시험을 호출하는 CI 를 찾지 못했고, 고정 목록의 Cargo.toml.orig 가 트리에 없어 실행하면 실패할 것으로 보입니다(정적 추정, 실행하지 않음).",
            "UPSTREAM.sha256 pins 189 file hashes and a test is designed to catch any mismatch. But no CI calling that test was found, and Cargo.toml.orig from the pinned list is missing from the tree, so running it would likely fail (static inference, not executed).",
          ),
        },
      ],
      pitfall: t(
        "상류에 반영됐다거나 항상 몇 배 빨라졌다고 말하지 마세요. 반영 근거는 없고 배속은 크기마다 다릅니다(256² 는 이득 없음, 정본은 헤드리스 Chrome 한 번의 측정이고 어댑터 이름이 비어 있음). Vello GPU 는 명시적으로 고르는 provider 이며 기본 렌더 경로가 아닙니다. 드리프트 시험 결과는 실행하지 않은 정적 추정입니다. 측정이 헤드리스 Chrome 한 환경뿐이라 상태를 experimental 로 표시했습니다.",
        "Do not say it was accepted upstream or that it is always some number of times faster. There is no acceptance evidence and the speed-up differs by size (no gain at 256²; the canonical record is one headless Chrome run with an empty adapter name). Vello GPU is a provider chosen explicitly, not the default render path. The drift-test outcome is a static inference, not an executed result. Measurements exist only for headless Chrome, hence the experimental status.",
      ),
    },
    technologies: ["wgpu", "WebGPU", "Vello", "Rust / WASM"],
    facts: [
      { value: "189", label: t("UPSTREAM.sha256 이 고정한 파일 수(정적 대조: 188 일치, Cargo.toml.orig 부재)", "Files pinned by UPSTREAM.sha256 (static check: 188 match, Cargo.toml.orig missing)"), source: "crates/vendor/wgpu-toon/UPSTREAM.sha256" },
      { value: "0.93x · 3.29x · 3.12x", label: t("정본 결과 파일의 교환 비용 배속(256²·512²·1024², 2026-09-23, Chrome 153, 표본 9개)", "Exchange-cost speed-up in the canonical result file (256², 512², 1024², 2026-09-23, Chrome 153, 9 samples)"), source: "tests/benchmarks/results/toon-vello-fork.json" },
      { value: "1.89x · 2.12x · 2.43x", label: t("덮어써진 옛 결과로 문서에 이전 기록만 남은 값(같은 크기 순서, 2026-08-08)", "Values of an overwritten earlier result, kept in the doc only as a prior record (same size order, 2026-08-08)"), source: "docs/engines/vello-baseline.md" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "oss-license-notice-pipeline",
    category: "open-data",
    name: "Third-party notices",
    title: t("라이선스 고지는 손이 아니라 빌드가 만든다", "License notices are built by the pipeline, not by hand"),
    status: "live",
    tagline: t("의존성 584개의 라이선스를 빌드 때마다 점검해 고지 파일로 만들고, 어긋나면 멈춥니다.", "Licenses of 584 dependencies are checked at every build into a notice file, and a mismatch stops the build."),
    background: [
      t(
        "오픈소스는 무료지만 조건이 있습니다. 대부분은 저작권 표시와 라이선스 사본을 함께 배포하라는 정도이지만, 일부는 비상업 전용이거나 소스 공개 의무가 있습니다. 직접 의존성 117개와 전이 의존성까지 합친 584개의 조건을 사람이 기억할 수는 없으므로, 빌드가 목록을 만들고 허용된 조합이 아니면 멈추게 합니다. 식품 성분표를 공장 라인이 자동으로 찍는 것과 같습니다.",
        "Open source is free but comes with conditions. Most just ask you to ship the copyright notice and a copy of the license, while some are non-commercial only or carry disclosure duties. Nobody can remember the conditions of 117 direct and 584 total dependencies, so the build produces the list and stops on any combination that is not allowed. It is like a factory line printing the ingredient label automatically.",
      ),
      t(
        "scripts/generate-third-party-notices.mjs 는 두 방식으로 돕니다. --check(pnpm audit:licenses)는 검사만 하고, --output(빌드의 postbuild)은 dist/legal/THIRD_PARTY_NOTICES.generated.md 를 만듭니다. 설치된 패키지의 SPDX 표기를 허용 목록과 대조하고, 라이선스 원문 431개와 해시를 모으며, Vello·Hokusai 같은 Rust 크레이트와 직접 빌드한 WASM 3종의 인벤토리도 합칩니다. 2026-10-08 확인 실행은 584개 항목으로 통과했습니다.",
        "scripts/generate-third-party-notices.mjs runs in two modes. --check (pnpm audit:licenses) only inspects, while --output (the build's postbuild) writes dist/legal/THIRD_PARTY_NOTICES.generated.md. It compares each installed package's SPDX expression with an allowlist, gathers 431 license texts with hashes, and merges the inventories of Rust crates such as Vello and Hokusai and of three self-built WASM modules. A check run on 2026-10-08 passed with 584 entries.",
      ),
      t(
        "제한이 있는 의존성은 이름·버전·라이선스를 핀으로 고정합니다. mixbox 2.0.0(CC-BY-NC-4.0)과 remotion·@remotion/player 4.0.514(Remotion License, 표준 SPDX 아님)는 그 조합일 때만 통과하고, 버전이나 표기가 바뀌면 빌드가 실패합니다. 목록에 없는 CC-BY-NC 패키지가 새로 들어와도 실패합니다. 이 카드는 저장소가 어떻게 처리하는지만 설명하며 법률 판단은 하지 않습니다.",
        "Restricted dependencies are pinned by name, version and license. mixbox 2.0.0 (CC-BY-NC-4.0) and remotion and @remotion/player 4.0.514 (Remotion License, not a standard SPDX id) pass only in exactly that combination, and the build fails if the version or label changes. A new CC-BY-NC package outside that list also fails. This card describes only how the repository handles them and makes no legal judgment.",
      ),
      t(
        "빈틈 셋을 적습니다. ① 손으로 쓴 루트 THIRD_PARTY_NOTICES.md 는 일부 목록이라 직접 의존성 117개 중 22개만 싣고 95개는 빠져 있습니다. 완전한 목록은 빌드 산출 고지입니다. ② wasm-vips 패키지는 자체 THIRD-PARTY-NOTICES.md 에 LGPL 라이브러리를 적지만, 생성기는 LICENSE·COPYING·NOTICE 로 시작하는 파일만 모아 생성 고지에는 MIT 로만 나옵니다. ③ mixbox 는 브러시 코드가 정적 import 하고 허용 여부는 런타임 라이선스 프로필이 판정하는데, 툴체인 문서는 같은 mixbox 를 연구 전용·비실행으로 적습니다.",
        "Three gaps are noted. 1 The hand-written root THIRD_PARTY_NOTICES.md is a partial list that carries only 22 of the 117 direct dependencies and omits 95; the full list is the build output. 2 The wasm-vips package lists LGPL libraries in its own THIRD-PARTY-NOTICES.md, but the generator only collects files named like LICENSE, COPYING or NOTICE, so the generated notice shows only MIT. 3 The brush code imports mixbox statically and a runtime license profile decides its use, while the toolchain document calls the same mixbox research-only and non-executable.",
      ),
    ],
    keyPoints: [
      t("빌드가 고지를 만들고 허용 목록 밖이면 실패한다", "The build writes the notice and fails outside the allowlist"),
      t("제한 의존성(mixbox·Remotion)은 이름·버전·라이선스를 고정", "Restricted deps (mixbox, Remotion) are pinned by name, version, license"),
      t("손으로 쓴 고지는 일부 목록: 직접 의존성 95/117 누락", "The hand-written notice is partial: 95 of 117 direct deps absent"),
    ],
    diagram: {
      id: "oss-license-notice-pipeline-diagram",
      kind: "graph",
      title: t("고지 생성 파이프라인", "The notice-generation pipeline"),
      caption: t("설치된 패키지를 허용 목록과 대조해 통과한 것만 고지로 만들고, 어긋나면 빌드를 멈춥니다.", "Installed packages are checked against an allowlist; only a pass becomes a notice, and a mismatch stops the build."),
      alt: t(
        "설치된 패키지와 Rust 크레이트 목록을 고지 생성기가 읽습니다. 생성기는 audit:licenses 나 postbuild 로 실행되어 허용 조합인지 판단합니다. 통과하면 dist/legal 생성 고지가 만들어지고 앱 안 라이선스 화면이 그것을 보여 줍니다. 어긋나면 빌드가 실패합니다.",
        "The notice generator reads the installed packages and Rust crate lists. It is started by audit:licenses or postbuild and decides whether each combination is allowed. A pass writes the generated notice under dist/legal, which the in-app license screen displays; a mismatch fails the build.",
      ),
      nodes: [
        { id: "pkgs", label: t("설치된 패키지", "Installed packages"), sub: t("pnpm 584 + Rust 크레이트", "pnpm 584 + Rust crates"), tone: "neutral", shape: "cylinder", at: [0, 0] },
        { id: "gen", label: t("고지 생성기", "Notice generator"), sub: t("generate-third-party-notices", "generate-third-party-notices"), tone: "server", at: [1, 0] },
        { id: "gate", label: t("허용 조합?", "Allowed?"), sub: t("SPDX 목록+핀", "SPDX list + pins"), tone: "warn", shape: "diamond", at: [2, 0] },
        { id: "out", label: t("생성 고지", "Generated notice"), sub: t("dist/legal/…generated.md", "dist/legal/…generated.md"), tone: "good", at: [3, 0] },
        { id: "app", label: t("앱 안 라이선스 화면", "In-app license view"), sub: t("Help ▸ License", "Help > License"), tone: "local", shape: "pill", at: [4, 0] },
        { id: "entry", label: t("실행 진입점", "Entry points"), sub: t("audit:licenses·postbuild", "audit:licenses, postbuild"), tone: "edge", at: [1, 1] },
        { id: "fail", label: t("빌드 실패", "Build fails"), sub: t("허용되지 않은 조합", "disallowed combination"), tone: "warn", at: [2, 1] },
      ],
      edges: [
        { from: "pkgs", to: "gen", label: t("읽기", "read") },
        { from: "entry", to: "gen", label: t("실행", "run") },
        { from: "gen", to: "gate", label: t("대조", "compare") },
        { from: "gate", to: "out", label: t("통과", "pass") },
        { from: "out", to: "app", label: t("표시", "show") },
        { from: "gate", to: "fail", label: t("어긋남", "mismatch"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("빌드 · 고지 생성과 검사", "Build · notice generation and audit"),
        role: t("postbuild 가 dist/legal/THIRD_PARTY_NOTICES.generated.md 를 만들고, pnpm audit:licenses 가 --check 로 같은 검사를 돌립니다.", "postbuild writes dist/legal/THIRD_PARTY_NOTICES.generated.md, and pnpm audit:licenses runs the same checks with --check."),
        paths: ["scripts/generate-third-party-notices.mjs", "package.json"],
      },
      {
        feature: t("스튜디오 · Help ▸ License", "Studio · Help > License"),
        role: t("생성 고지를 그대로 불러와 보여 주고, 없으면 없다고 말합니다. 엔진 라이선스 게이트 판정도 같은 화면에서 계산합니다.", "Loads and shows the generated notice as is, and says so when it is absent. Engine license-gate verdicts are computed on the same screen."),
        paths: ["apps/web/src/domains/creator/studio-third-party-notices.ts", "apps/web/src/domains/creator/StudioHelpCenterDialog.tsx"],
        route: "/studio",
      },
      {
        feature: t("제한 라이선스 처리 (mixbox·Remotion)", "Restricted licenses (mixbox, Remotion)"),
        role: t("mixbox 는 provider rights 라벨과 라이선스 프로필로, Remotion 은 패키지명·버전·라이선스 텍스트 해시 고정으로 다룹니다.", "mixbox is handled by a provider rights label and a license profile, Remotion by pinning package name, version and license-text hash."),
        paths: ["apps/web/src/domains/creator/brush-lab/brush-studio-v6-license-profile.ts", "apps/web/src/domains/creator/brush-lab/brush-studio-v6-pigment-provider.ts", "scripts/generate-third-party-notices.mjs#REVIEWED_RESTRICTED_PRODUCTION_DEPENDENCIES"],
      },
      {
        feature: t("기술 자료 · 라이선스 인벤토리", "Technology pages · license inventory"),
        role: t("직접 의존성 117개의 버전·SPDX 를 정리한 목록과, 설치 상태와 대조하는 수집 스크립트가 있습니다.", "A list of the 117 direct dependencies' versions and SPDX ids, plus a collection script that compares it with what is installed."),
        paths: ["apps/web/src/domains/legal/technology/engineering-license-inventory.ts", "scripts/collect-engineering-licenses.mjs"],
        route: "/about/technology/licenses",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("제한 의존성은 이름·버전·라이선스가 모두 맞을 때만 통과", "A restricted dependency passes only with the exact name, version and license"),
        language: "ts",
        ...codePair(`
type Restricted = { version: string; license: string };

//~ 허용 목록에 없는 CC-BY-NC 패키지, 또는 검토한 버전이 바뀐 패키지는 빌드를 멈춘다. ## A CC-BY-NC package outside the list, or a reviewed package whose version changed, stops the build.
const REVIEWED: Record<string, Restricted> = {
  mixbox: { version: "2.0.0", license: "CC-BY-NC-4.0" },
};

function assertReviewed(name: string, versions: readonly string[], license: string): void {
  const policy = REVIEWED[name];
  if (!policy && license !== "CC-BY-NC-4.0") return; //~ 제한 라이선스가 아니면 이 규칙의 대상이 아니다 ## not a restricted license, so this rule does not apply
  if (!policy || policy.license !== license || versions.length !== 1 || versions[0] !== policy.version) {
    throw new Error("Unreviewed restricted package: " + name + "@" + versions.join(",") + " - " + license);
  }
}

assertReviewed("mixbox", ["2.0.0"], "CC-BY-NC-4.0"); //~ 통과 ## passes
try {
  assertReviewed("other-nc-lib", ["1.0.0"], "CC-BY-NC-4.0"); //~ 목록에 없는 비상업 패키지 ## a non-commercial package that is not on the list
} catch (error) {
  console.log(error instanceof Error ? error.message : error); //~ 빌드가 여기서 실패한다 ## the build fails here
}
`),
        explain: t(
          "generate-third-party-notices.mjs 의 validateReviewedRestrictedProductionDependency 를 줄인 것입니다. 실제 생성기는 Remotion 의 라이선스 텍스트 SHA-256 도 함께 고정하고, 허용 목록(SPDX 표기 집합)과 다른 검사들을 이어서 실행합니다.",
          "A reduction of validateReviewedRestrictedProductionDependency in generate-third-party-notices.mjs. The real generator also pins the SHA-256 of Remotion's license text and goes on to run the SPDX allowlist and other checks.",
        ),
        source: "scripts/generate-third-party-notices.mjs",
        verify: "types",
      },
    ],
    links: [
      { title: "SPDX · License List", url: "https://spdx.org/licenses/", kind: "spec", note: t("라이선스 표준 식별자 목록", "The list of standard license identifiers") },
      { title: "SPDX · License expressions", url: "https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/", kind: "spec", note: t("OR·AND 로 묶은 표기 읽는 법", "How to read OR and AND expressions") },
      { title: "SPDX · CC-BY-NC-4.0", url: "https://spdx.org/licenses/CC-BY-NC-4.0.html", kind: "spec" },
      { title: "SPDX · LGPL-2.1-only", url: "https://spdx.org/licenses/LGPL-2.1-only.html", kind: "spec" },
      { title: "Remotion · License", url: "https://www.remotion.dev/docs/license", kind: "docs", note: t("표준 SPDX 가 아닌 자체 라이선스", "A custom license, not a standard SPDX id") },
      { title: "wasm-vips · repository", url: "https://github.com/kleisauke/wasm-vips", kind: "repo" },
    ],
    chapterIds: ["licenses", "open-source"],
    talk: {
      pitch: t(
        "오픈소스의 조건은 사람이 기억하지 않고 빌드가 확인합니다. 584개 패키지의 라이선스를 허용 목록과 대조해 고지 파일을 만들고, 비상업 라이선스나 Remotion 같은 제한 의존성은 이름·버전·라이선스를 고정해 한 글자만 달라져도 빌드가 멈춥니다. 다만 손으로 쓴 고지 파일은 일부 목록이라는 점도 함께 말합니다.",
        "We do not rely on memory for open-source conditions; the build checks them. It compares the licenses of 584 packages with an allowlist to write the notice file, and pins restricted dependencies such as non-commercial licenses or Remotion by name, version and license so that any change stops the build. We also say plainly that the hand-written notice file is only a partial list.",
      ),
      analogy: t(
        "공장 라인의 성분표 자동 인쇄기입니다. 허용되지 않은 재료가 들어오면 라인이 멈추고, 통과한 재료만 성분표에 찍힙니다.",
        "It is a factory line that prints ingredient labels automatically. If a disallowed ingredient arrives the line stops, and only approved ones are printed on the label.",
      ),
      questions: [
        {
          question: t("GPL 은 하나도 없나요?", "Is there no GPL at all?"),
          answer: t(
            "npm 직접 의존성에는 GPL·AGPL 이 없고 허용 목록에도 단독으로 들어 있지 않습니다. 다만 wasm-vips 의 내장 LGPL 라이브러리, 외부 프로그램을 별도 프로세스로만 연결하는 ToonBridge 같은 맥락이 있어 전혀 없다고 말하지는 않습니다.",
            "There is no GPL or AGPL among the direct npm dependencies, and neither appears alone in the allowlist. But with LGPL libraries inside wasm-vips and external programs linked only as separate processes through ToonBridge, we do not claim there is none anywhere.",
          ),
        },
        {
          question: t("mixbox 같은 비상업 라이선스는 어떻게 다루나요?", "How is a non-commercial license like mixbox handled?"),
          answer: t(
            "저장소는 provider 의 rights 라벨, 기본 라이선스 프로필, 감사의 이름·버전 핀으로 다룹니다. 그 처리가 서비스에 충분한지는 법률 판단이라 이 카드에서 하지 않으며, 소유자가 확정할 사항입니다.",
            "The repository uses the provider's rights label, a default license profile and the audit's name-and-version pin. Whether that is enough for the service is a legal judgment this card does not make; it is for the owner to settle.",
          ),
        },
        {
          question: t("루트의 THIRD_PARTY_NOTICES.md 에 전부 있나요?", "Is everything in the root THIRD_PARTY_NOTICES.md?"),
          answer: t(
            "아니요. 일부 목록이라 직접 의존성 117개 중 22개만 실려 있고 95개가 없습니다. 완전한 목록은 빌드가 만드는 THIRD_PARTY_NOTICES.generated.md 입니다.",
            "No. It is a partial list: only 22 of the 117 direct dependencies appear and 95 are absent. The complete list is THIRD_PARTY_NOTICES.generated.md, written by the build.",
          ),
        },
      ],
      pitfall: t(
        "법률 판단을 하지 마세요. 이 카드는 저장소가 라이선스를 어떻게 처리하는지만 설명합니다. Remotion 을 배포 법인이 쓸 수 있는 자격인지는 저장소로 확인할 수 없고, 툴체인 문서와 코드의 mixbox 서술이 서로 다르며, wasm-vips 의 LGPL 이 생성 고지에 나타나지 않는다는 점은 알려진 공백입니다.",
        "Do not make legal judgments. This card explains only how the repository handles licenses. Whether the distributing entity is eligible to use Remotion cannot be confirmed from the repository, the toolchain document and the code describe mixbox differently, and wasm-vips' LGPL not appearing in the generated notice is a known gap.",
      ),
    },
    technologies: ["SPDX", "Remotion", "Mixbox", "wasm-vips"],
    facts: [
      { value: "584", label: t("2026-10-08 audit:licenses 가 통과한 pnpm 항목 수", "pnpm entries passed by audit:licenses on 2026-10-08"), source: "scripts/generate-third-party-notices.mjs" },
      { value: "117", label: t("직접 런타임 의존성 수", "Direct runtime dependencies"), source: "scripts/collect-engineering-licenses.mjs" },
      { value: "95 / 117", label: t("손으로 쓴 고지 표에 실리지 않은 직접 의존성(표의 백틱 패키지명 대조, 2026-10-08)", "Direct dependencies missing from the hand-written notice table (backticked package-name match, 2026-10-08)"), source: "THIRD_PARTY_NOTICES.md" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "oss-supply-chain-pinning",
    category: "open-data",
    name: "Supply-chain pinning",
    title: t("오픈소스 공급망을 여러 겹으로 고정한다", "Pinning the open-source supply chain in several layers"),
    status: "live",
    tagline: t("버전·설치 스크립트·감사·실행 때 해시까지 겹겹이 막고, 빈틈은 숨기지 않고 적습니다.", "Versions, install scripts, audits and run-time hashes are layered, and the gaps are listed openly."),
    background: [
      t(
        "오픈소스를 쓴다는 것은 남이 만든 코드 수백 개를 우리 서비스에 들이는 일입니다. 그중 하나가 몰래 바뀌거나 취약점이 생기면 우리 서비스도 영향을 받습니다. 이를 공급망 위험이라 부릅니다. 식당으로 치면 식재료 납품처가 바뀌어도 모르는 상태를 막는 일입니다. ToonStudio 는 방어선을 여러 겹 둡니다.",
        "Using open source means bringing hundreds of other people's code packages into our service; if one is quietly changed or turns out vulnerable, our service is affected. This is called supply-chain risk, like not noticing that a restaurant's ingredient supplier changed. ToonStudio keeps several layers of defence.",
      ),
      t(
        "① 버전 고정: 핵심 라이브러리는 정확한 버전(zod 4.4.3, three 0.184.0, vitest 4.1.11)으로 묶고, 전이 의존성은 pnpm overrides 50개로 고치며, CI 는 pnpm install --frozen-lockfile 로 잠금 파일과 어긋나면 멈춥니다. ② 설치 스크립트 차단: 설치 때 빌드 스크립트를 실행해도 되는 패키지는 6개뿐이고 sharp·onnxruntime-node 등은 명시적으로 거부합니다. ③ 감사: audit:security 는 보안 권고 예외를 허용하지 않고, 라이선스 감사와 번들 경계 검사가 이어집니다.",
        "1 Version pinning: core libraries are tied to exact versions (zod 4.4.3, three 0.184.0, vitest 4.1.11), transitive ones are corrected by 50 pnpm overrides, and CI stops on pnpm install --frozen-lockfile when the lockfile disagrees. 2 Install-script blocking: only six packages may run build scripts at install time, and sharp, onnxruntime-node and others are explicitly denied. 3 Audits: audit:security allows no advisory exceptions, followed by the license audit and the bundle-boundary check.",
      ),
      t(
        "④ 실행 때는 출처와 해시를 고정합니다. 운영 CSP 가 외부 스크립트·WASM 실행을 막으므로 ONNX Runtime·MediaPipe 의 WASM 은 빌드 해시가 붙은 same-origin 자산으로 싣고, ONNX 모델 파일 6개(합계 119,438,571 바이트)는 저장소 안에 두고 길이와 SHA-256 을 확인한 뒤에야 세션을 만듭니다. 무거운 엔진은 동적 import 로만 불러오고, 정적 그래프에 돌아오면 번들 검사가 실패합니다.",
        "4 At run time, origin and hash are pinned. Because the production CSP blocks external script and WASM execution, the WASM of ONNX Runtime and MediaPipe ships as same-origin assets with build hashes, and the six ONNX model files (119,438,571 bytes in total) live in the repository and are checked for length and SHA-256 before a session is created. Heavy engines load only through dynamic import, and the bundle check fails if one returns to the static graph.",
      ),
      t(
        "예외도 있습니다. MediaPipe 모델은 storage.googleapis.com 에서 런타임에 내려받고, 배경 제거(selfie segmenter)는 latest 리비전이라 해시가 고정돼 있지 않습니다(아바타 임베더만 길이와 SHA-256 고정). GitHub Actions 는 471건 중 40자리 SHA 고정이 25건이고 나머지는 태그 고정이며, Dependabot·Renovate 설정은 찾지 못했습니다. 새 릴리스 숙성 대기(minimumReleaseAge)도 0 이고, braces 는 저장소 포크라 pnpm audit 대상이 아닙니다.",
        "There are exceptions. MediaPipe models are downloaded at run time from storage.googleapis.com, and the background-removal selfie segmenter uses the latest revision with no pinned hash (only the avatar embedder has a pinned length and SHA-256). Of 471 GitHub Actions uses, 25 are pinned to a 40-character SHA and the rest to tags, and no Dependabot or Renovate config was found. minimumReleaseAge is also 0, and braces is a repository fork that pnpm audit does not cover.",
      ),
    ],
    keyPoints: [
      t("방어선 4겹: 버전 고정 → 스크립트 차단 → 감사 → 해시·출처", "Four layers: pins, script blocking, audits, hashes and origin"),
      t("ONNX 모델 파일 6개는 길이와 SHA-256 을 확인한 뒤에만 쓴다", "The six ONNX model files are used only after length and SHA-256 checks"),
      t("예외: MediaPipe 모델은 런타임 다운로드, 일부는 latest", "Exceptions: MediaPipe models download at run time, some as latest"),
    ],
    diagram: {
      id: "oss-supply-chain-pinning-diagram",
      kind: "layers",
      title: t("공급망 방어선", "Supply-chain lines of defence"),
      caption: t("설치 전·설치 때·배포 전·실행 때 네 겹으로 막고, 맨 아래 칸에 알려진 예외를 따로 적습니다.", "Four layers cover before install, at install, before release and at run time, with known exceptions listed in the last row."),
      alt: t(
        "첫째 방어선은 정확한 버전 고정과 overrides 50개, 잠금 파일입니다. 둘째는 설치 때 실행되는 빌드 스크립트를 6개만 허용하는 것입니다. 셋째는 배포 전 보안·라이선스·번들 경계 감사입니다. 넷째는 실행 때 same-origin WASM과 ONNX 모델의 SHA-256 확인입니다. 마지막 칸은 MediaPipe 모델 런타임 다운로드 등 알려진 예외입니다.",
        "The first line is exact version pins, 50 overrides and the lockfile. The second allows only six build scripts at install time. The third is the pre-release security, license and bundle-boundary audits. The fourth is same-origin WASM and SHA-256 checks of ONNX models at run time. The last row lists known exceptions such as the MediaPipe model downloaded at run time.",
      ),
      layers: [
        { id: "pin", label: t("① 설치 전: 버전 고정", "1 Before install: pins"), sub: t("정확한 버전 · overrides 50개 · 잠금 파일 고정 설치", "Exact versions, 50 overrides, frozen-lockfile install"), tone: "server", chips: ["pnpm"] },
        { id: "scripts", label: t("② 설치 때: 스크립트 차단", "2 At install: script blocking"), sub: t("빌드 스크립트 허용 6개 · 나머지는 명시적 거부", "Six allowed build scripts; the rest explicitly denied"), tone: "server" },
        { id: "audit", label: t("③ 배포 전: 감사", "3 Before release: audits"), sub: t("보안 권고 예외 금지 · 라이선스 감사 · 번들 경계", "No advisory exceptions, license audit, bundle boundary"), tone: "good" },
        { id: "runtime", label: t("④ 실행 때: 같은 출처·해시", "4 At run time: origin and hash"), sub: t("WASM 은 same-origin · ONNX 모델은 SHA-256 확인", "WASM same-origin; ONNX models checked by SHA-256"), tone: "local", chips: ["ONNX Runtime Web", "SRI"] },
        { id: "gaps", label: t("알려진 예외", "Known exceptions"), sub: t("MediaPipe 모델 런타임 다운로드 · 액션 태그 고정 · SRI 1곳", "MediaPipe model download, tag-pinned actions, SRI in one place"), tone: "warn", chips: ["MediaPipe"] },
      ],
      brackets: [{ label: t("막는 장치 4겹", "Four layers of defence"), layerIds: ["pin", "scripts", "audit", "runtime"] }],
    },
    usage: [
      {
        feature: t("설치·CI 정책", "Install and CI policy"),
        role: t("pnpm overrides 50개, 빌드 스크립트 허용 6개와 명시 거부, 잠금 파일 고정 설치로 의존성을 고정합니다.", "Fixes dependencies with 50 pnpm overrides, six allowed build scripts with explicit denials, and frozen-lockfile installs."),
        paths: ["pnpm-workspace.yaml", "pnpm-lock.yaml", ".github/workflows/architecture-boundaries.yml"],
      },
      {
        feature: t("기기 안 AI · 배경 제거·채색·업스케일", "On-device AI · background removal, colorization, upscaling"),
        role: t("ONNX 모델 파일 6개와 WASM 을 저장소 안에 두고 same-origin 으로 서빙하며, 모델은 길이와 SHA-256 을 확인한 뒤 실행합니다.", "Keeps six ONNX model files and the WASM in the repository, serves them same-origin and runs a model only after checking its length and SHA-256."),
        paths: ["apps/web/src/domains/creator/studio-onnx-runtime-assets.ts", "apps/web/src/domains/creator/studio-onnx-inference-provider.ts", "apps/web/src/domains/creator/assets/u2netp.LICENSE.md"],
        route: "/studio",
      },
      {
        feature: t("웹캠 추적·AI 배경 제거 (MediaPipe)", "Webcam tracking and AI background removal (MediaPipe)"),
        role: t("WASM 은 same-origin 이지만 모델은 외부 스토리지에서 내려받는 예외입니다. 배경 제거 모델은 latest 리비전입니다.", "The WASM is same-origin, but the models are downloaded from external storage, an exception. The background-removal model uses the latest revision."),
        paths: ["apps/web/src/domains/creator/studio-mediapipe-vision-assets.ts", "apps/web/src/domains/creator/studio-bg-remove.ts"],
        route: "/studio",
      },
      {
        feature: t("배포 전 감사", "Pre-release audits"),
        role: t("보안 권고 예외 금지, 라이선스 감사, 번들 경계 검사가 push 전 검증에 들어 있습니다.", "The ban on advisory exceptions, the license audit and the bundle-boundary check are part of the pre-push verification."),
        paths: ["scripts/verify-security-advisory-exceptions.mjs", "scripts/check-studio-bundle.mjs"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("pnpm 설정: 버전 수렴과 설치 스크립트 제한", "pnpm settings: version convergence and install-script limits"),
        language: "yaml",
        ...codePair(`
minimumReleaseAge: 0 #~ 신규 릴리스 숙성 대기는 쓰지 않는다(정책으로 명시) ## no waiting period for new releases (stated as policy)

onlyBuiltDependencies: #~ 설치 때 빌드 스크립트를 실행해도 되는 패키지 ## packages allowed to run build scripts at install
  - esbuild
  - workerd

allowBuilds:
  sharp: false #~ 필요 없는 네이티브 빌드는 명시적으로 거부 ## unneeded native builds are explicitly denied
  onnxruntime-node: false

overrides:
  ws: '>=8.21.0' #~ 전이 의존성의 취약 버전을 고쳐진 버전으로 수렴시킨다 ## converge vulnerable transitive versions to fixed ones
`, "#"),
        explain: t(
          "pnpm-workspace.yaml 의 발췌입니다. 실제 파일은 허용 6개(@nestjs/core, @sentry/cli, @swc/core, esbuild, unrs-resolver, workerd), 명시 거부 여러 개, overrides 50개를 담고 있습니다. 거부 목록은 pnpm 11 의 엄격한 설치 모드에서 설치가 실패하지 않게 하는 역할도 합니다.",
          "An excerpt of pnpm-workspace.yaml. The real file holds six allowed packages (@nestjs/core, @sentry/cli, @swc/core, esbuild, unrs-resolver, workerd), several explicit denials and 50 overrides. The denials also keep installs from failing under pnpm 11's strict mode.",
        ),
        source: "pnpm-workspace.yaml",
      },
      {
        kind: "simplified",
        title: t("모델은 길이와 SHA-256 이 등록 값과 같을 때만 쓴다", "Use a model only when length and SHA-256 match the registered values"),
        language: "ts",
        ...codePair(`
async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

//~ 같은 출처의 모델 파일이라도 등록된 길이와 해시와 같아야 세션 생성에 쓴다. ## Even a same-origin model file must match the registered length and hash before a session is created.
export async function loadVerifiedModel(url: string, expected: { bytes: number; sha256: string }): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("model_download_failed");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength !== expected.bytes) throw new Error("model_length_mismatch"); //~ 파일 크기가 다르다 ## wrong file size
  if ((await sha256Hex(bytes)) !== expected.sha256) throw new Error("model_digest_mismatch"); //~ 해시가 다르다 ## wrong hash
  return bytes;
}
`),
        explain: t(
          "studio-onnx-runtime-assets.ts 의 길이 확인과 studio-onnx-inference-provider.ts 의 SHA-256 확인을 한 함수로 합친 것입니다. 실제 코드는 두 곳에서 나눠 하고, 실패하면 다시 시도할 수 있게 프로미스 캐시를 비웁니다.",
          "Merges the length check in studio-onnx-runtime-assets.ts and the SHA-256 check in studio-onnx-inference-provider.ts into one function. The real code does them in two places and clears its promise cache on failure so a retry is possible.",
        ),
        source: "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "pnpm · overrides setting", url: "https://pnpm.io/settings#overrides", kind: "docs" },
      { title: "pnpm · pnpm install (--frozen-lockfile)", url: "https://pnpm.io/cli/install", kind: "docs", note: t("잠금 파일과 어긋나면 멈추는 설치", "An install that stops when the lockfile disagrees") },
      { title: "GitHub Docs · Secure use reference", url: "https://docs.github.com/en/actions/reference/security/secure-use", kind: "guide", note: t("액션을 커밋 SHA 로 고정하는 이유", "Why actions are pinned to a commit SHA") },
      { title: "MDN · Subresource Integrity", url: "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity", kind: "docs" },
      { title: "ONNX Runtime · Web tutorials", url: "https://onnxruntime.ai/docs/tutorials/web/", kind: "docs" },
      { title: "Google AI Edge · MediaPipe solutions guide", url: "https://developers.google.com/edge/mediapipe/solutions/guide", kind: "docs" },
    ],
    chapterIds: ["open-source", "quality"],
    talk: {
      pitch: t(
        "오픈소스를 쓴다는 건 남의 코드를 들이는 일이라 방어선을 겹쳐 둡니다. 버전은 정확히 고정하고, 설치 때 실행되는 스크립트는 6개만 허용하고, 감사를 통과해야 하며, 실행할 때는 WASM 을 같은 출처에서 싣고 모델은 해시를 확인합니다. 빈틈은 MediaPipe 모델처럼 런타임에 내려받는 것들입니다.",
        "Using open source means bringing in other people's code, so the defences are layered. Versions are pinned exactly, only six install scripts may run, audits must pass, and at run time the WASM is served from the same origin and models are hash-checked. The gaps are things downloaded at run time, such as the MediaPipe models.",
      ),
      analogy: t(
        "식당의 납품 관리입니다. 거래처와 규격을 고정하고, 입고 때 검수하고, 조리 직전에 도장을 다시 확인합니다. 도장 없이 받는 품목(MediaPipe 모델)은 장부에 따로 적어 둡니다.",
        "It is a restaurant's supply management: fix suppliers and specs, inspect at receiving and re-check the stamp just before cooking. Items received without a stamp (the MediaPipe models) are written in a separate ledger.",
      ),
      questions: [
        {
          question: t("새 취약점이 나오면 어떻게 하나요?", "What happens when a new vulnerability appears?"),
          answer: t(
            "audit:security 가 pnpm audit 를 예외 없이 돌리고, 전이 의존성은 overrides 로 고쳐진 버전으로 올립니다. overrides 는 현재 50개입니다.",
            "audit:security runs pnpm audit with no exceptions, and transitive dependencies are raised to fixed versions through overrides, 50 of them today.",
          ),
        },
        {
          question: t("모델이 바뀌면 알 수 있나요?", "Would we notice if a model changed?"),
          answer: t(
            "ONNX 모델 파일 6개는 저장소 안에 있고 길이나 SHA-256 이 등록 값과 다르면 세션을 만들지 않습니다. 반면 MediaPipe 모델은 외부 스토리지에서 받고, 배경 제거 모델은 latest 라 바뀌어도 알 수 없습니다.",
            "The six ONNX model files are in the repository and no session is created if length or SHA-256 differ from the registered values. MediaPipe models, however, come from external storage, and the background-removal model is latest, so a change would go unnoticed.",
          ),
        },
        {
          question: t("의존성을 자동으로 올려 주나요?", "Are dependencies updated automatically?"),
          answer: t(
            "Dependabot·Renovate 설정은 찾지 못했습니다. 새 릴리스 숙성 대기도 0 이라 올리는 시점은 사람이 정합니다.",
            "No Dependabot or Renovate configuration was found. The waiting period for new releases is also 0, so people decide when to upgrade.",
          ),
        },
      ],
      pitfall: t(
        "모든 AI 모델이 로컬에서 고정된다고 말하지 마세요. MediaPipe 모델은 런타임에 Google 스토리지에서 받고 selfie segmenter 는 latest 입니다. GitHub Actions 는 대부분 태그 고정이라 SHA 고정은 25/471 입니다. SRI 는 Kakao SDK 한 곳에만 적용돼 있습니다.",
        "Do not say every AI model is pinned locally. MediaPipe models come from Google storage at run time and the selfie segmenter is latest. Most GitHub Actions are tag-pinned, with only 25 of 471 SHA-pinned. SRI is applied in just one place, the Kakao SDK.",
      ),
    },
    technologies: ["pnpm", "SHA-256", "SRI", "ONNX Runtime Web", "MediaPipe"],
    facts: [
      { value: "50", label: t("pnpm overrides 수", "pnpm overrides"), source: "pnpm-workspace.yaml" },
      { value: "6", label: t("설치 때 빌드 스크립트를 허용한 패키지 수", "Packages allowed to run build scripts at install"), source: "pnpm-workspace.yaml" },
      { value: "119,438,571 B", label: t("저장소 안 ONNX 모델 파일 6개의 합계 크기", "Total size of the six ONNX model files in the repo"), source: "apps/web/src/domains/creator/assets/u2netp.LICENSE.md" },
      { value: "25 / 471", label: t("SHA 로 고정한 GitHub Actions 사용 수 / 전체", "GitHub Actions uses pinned to a SHA / total"), source: ".github/workflows/architecture-boundaries.yml" },
    ],
    reviewedAt: "2026-10-07",
  },
];
