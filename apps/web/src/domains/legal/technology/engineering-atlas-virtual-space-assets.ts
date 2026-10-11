import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 5: 아트 에셋 파이프라인(v3~v9, CI 게이트) · 캐릭터 아틀라스/LPC/텍스처 상주.
 * 웹(Phaser) 공간 클라이언트 제거와 Godot 무대 교체 이후 기준으로 다시 확인했다.
 * 경로·수치는 현재 코드와 매니페스트에서 직접 확인한 값이다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const ASSETS = "apps/web/public/assets/virtual-studio";

export const VIRTUAL_SPACE_ASSET_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "art-asset-pipeline-v3-v9-ci-gate",
    category: "virtual-space",
    name: "Art asset pipeline",
    title: t("그림 에셋을 만들고 해시로 지키는 파이프라인(v3~v9)", "A pipeline that builds art assets and guards them by hash (v3 to v9)"),
    status: "live",
    tagline: t(
      "원본을 결정적으로 가공하고 해시 매니페스트를 CI 가 검증합니다. 웹 소비처는 로비와 미리보기입니다.",
      "Sources are processed deterministically and CI checks hash manifests; the web consumers are the lobby and previews.",
    ),
    background: [
      t(
        "가상 스튜디오의 그림(배경, 캐릭터, 가구)은 3,560개 파일, 약 412.6 MiB 입니다. 이만큼의 그림이 버전을 거듭하며 바뀌면, 파일 하나가 몰래 바뀌거나 빠져도 눈치채기 어렵습니다. 그래서 팩마다 '명세서'(매니페스트)에 파일별 크기와 지문(SHA-256)을 적어 두고, 기계가 명세서와 실제 파일을 대조합니다. 택배 상자마다 송장과 무게를 적어 두고 도착할 때 대조하는 것과 같습니다. 공간 안 렌더는 이제 Godot 무대가 맡고, 이 팩의 웹 소비처는 입장 로비와 캐릭터·장소 미리보기입니다.",
        "The studio's art (backgrounds, characters, furniture) is 3,560 files and about 412.6 MiB. With that much art changing across versions, one file silently altered or missing is hard to notice. So each pack's manifest lists every file's size and fingerprint (SHA-256), and a machine compares the manifest with the real files. It is like writing an invoice and weight on every parcel and checking them on arrival. In-space rendering is now handled by the Godot stage, and the web consumers of these packs are the entry lobby and the character and place previews.",
      ),
      t(
        "흐름은 이렇습니다. ① 원본을 준비합니다(v4·v6·v7 은 이미지 생성 도구로 만든 시트·보드, v5 는 스크립트가 스타일별로 그린 렌더). ② Python/Pillow 스크립트가 원본을 결정적으로 자르고 팩으로 묶어 webp/png 와 매니페스트(경로, 바이트, SHA-256, 가로세로)를 만듭니다. ③ Node 검증 스크립트가 폴더와 매니페스트가 정확히 일치하는지(남거나 빠진 파일 없음), 크기·해시·이미지 크기가 같은지, 심볼릭 링크와 경로 탈출이 없는지 확인합니다. ④ CI 빌드 작업이 test:studio-virtual-art 와 verify:studio-virtual-art 를 돌려 어긋나면 멈춥니다.",
        "The flow: 1) Prepare the sources (sheets and boards made with image generation tools for v4, v6 and v7; scripted per-style renders for v5). 2) Python/Pillow scripts slice the sources deterministically and bundle packs, producing webp/png files and a manifest (path, bytes, SHA-256, width and height). 3) Node verification scripts check that the folder and manifest match exactly (no extra or missing files), that size, hash and image dimensions agree, and that there are no symlinks or path escapes. 4) The CI build job runs test:studio-virtual-art and verify:studio-virtual-art and stops on any mismatch.",
      ),
      t(
        "스크립트는 '색만 바꾼 복제'를 새 그림이라고 주장하지 않게 설계되었습니다. v4 는 '프레임 자르기와 스타일 패키징만 한다', v5 는 '스타일 사이에 원본 픽셀을 재사용하지 않는다', v6·v7 은 CSS 재색을 쓰지 않는다고 적고, v7 검증기는 원본 파일 안의 C2PA 출처 표시와 생성 ID 개수까지 확인합니다. v8·v9 매니페스트는 모델 버전을 인증하지 않는다고 스스로 밝힙니다.",
        "The scripts are designed not to claim a recolored copy is new art. v4 says it only slices frames and packages styles, v5 says no source pixels are reused across styles, v6 and v7 say they use no CSS recolouring, and the v7 verifier even checks the C2PA provenance marks inside the source files and the number of generation IDs. The v8 and v9 manifests state themselves that they do not certify a model version.",
      ),
      t(
        "한계: CI 의 아트 게이트(verify:studio-virtual-art)가 해시까지 검증하는 범위는 v3~v7 과 world-v2 입니다. v8(experience-v8)은 전용 검증 스크립트가 없고, 게이트는 v7 검증기 코드에 포함된 v8 런타임 배경 24종의 해시·크기 대조까지만 닿습니다. 나머지는 생존한 단위 테스트가 나눠 맡습니다. 테마 캐릭터 무결성 테스트는 v8 매니페스트에서 원본 6개의 바이트 수와 SHA-256 을 파일과 대조하고, 미리보기·아틀라스 테스트는 프레임과 URL 을 확인합니다. v9(cinematic-v9) 매니페스트의 8개 기록을 전수 대조하던 전용 테스트는 제거되어, 현재 남은 테스트에서는 그 전수 대조가 확인되지 않습니다. 이 파이프라인은 그림의 품질이나 저작권을 판단하지 않습니다.",
        "Limits: the CI art gate (verify:studio-virtual-art) verifies v3 to v7 and world-v2 down to hashes. v8 (experience-v8) has no dedicated verifier script, and the gate reaches only the check built into the v7 verifier code that compares the hashes and sizes of the 24 v8 runtime backdrops. Surviving unit tests share the rest: the theme character integrity test compares the byte counts and SHA-256 values of six sources in the v8 manifest with the files, and the preview and atlas tests check frames and URLs. The dedicated test that compared all eight records of the v9 (cinematic-v9) manifest was removed, so no surviving test is confirmed to make that full comparison now. This pipeline does not judge art quality or copyright.",
      ),
    ],
    keyPoints: [
      t("그림마다 바이트 수와 SHA-256 을 매니페스트에 적습니다", "Every file's size and SHA-256 go in a manifest"),
      t("CI 가 폴더와 매니페스트가 정확히 맞는지 대조합니다", "CI checks that the folder matches the manifest exactly"),
      t("소비처는 로비·미리보기, 공간 렌더는 Godot 무대입니다", "Consumers are the lobby and previews; the Godot stage renders the space"),
    ],
    diagram: {
      id: "art-asset-pipeline-v3-v9-ci-gate-diagram",
      kind: "graph",
      title: t("원본에서 CI 게이트까지", "From source to the CI gate"),
      caption: t(
        "가공 스크립트가 팩과 매니페스트를 만들고, 검증 스크립트와 CI 가 둘을 대조합니다.",
        "Processing scripts produce packs and manifests, and verifier scripts and CI compare the two.",
      ),
      alt: t(
        "원본(이미지 생성 도구의 시트나 스크립트 렌더)을 Python 가공 스크립트가 자르고 묶어 에셋 팩과 매니페스트를 만듭니다. Node 검증 스크립트가 둘을 대조하고 결과를 CI 게이트가 판정하며, 통과한 팩을 입장 로비와 미리보기가 씁니다. 공간 안 렌더는 이 경로 밖에 있는 Godot 무대가 맡습니다. v8·v9 는 게이트의 검증 스크립트가 일부만 닿아 점선으로 표시했고, 나머지는 생존한 단위 테스트가 대조합니다.",
        "A Python processing script slices and bundles the sources (sheets from image generation tools or scripted renders) into asset packs and a manifest. Node verification scripts compare the two, the CI gate judges the result, and the entry lobby and previews use the packs that pass. In-space rendering is handled by the Godot stage, outside this path. The gate's verifier scripts reach v8 and v9 only partly, so they are shown with a dashed line; surviving unit tests compare the rest.",
      ),
      nodes: [
        { id: "source", label: t("원본", "Source"), sub: t("생성 도구 시트 · 렌더", "Tool sheets, renders"), tone: "external", shape: "cloud", at: [0, 0] },
        { id: "build", label: t("가공 스크립트", "Build scripts"), sub: t("Python · Pillow", "Python, Pillow"), tone: "local", at: [1, 0] },
        { id: "packs", label: t("에셋 팩", "Asset packs"), sub: t("webp · png", "webp, png"), tone: "neutral", shape: "cylinder", at: [2, 0] },
        { id: "manifest", label: t("매니페스트", "Manifest"), sub: t("바이트 · SHA-256", "Bytes, SHA-256"), tone: "neutral", shape: "cylinder", at: [2, 1] },
        { id: "verify", label: t("검증 스크립트", "Verifiers"), sub: t("Node · 해시 대조", "Node, hash check"), tone: "good", at: [3, 0] },
        { id: "gate", label: t("CI 게이트", "CI gate"), sub: t("어긋나면 중단", "Stops on mismatch"), tone: "warn", shape: "diamond", at: [4, 0] },
        { id: "runtime", label: t("로비 · 미리보기", "Lobby and previews"), sub: t("캐릭터 · 랜드마크", "Characters, landmarks"), tone: "local", shape: "pill", at: [5, 0] },
        { id: "gap", label: t("v8 · v9", "v8 and v9"), sub: t("게이트 일부 + 생존 테스트", "Partly gate + surviving tests"), tone: "warn", at: [3, 1] },
      ],
      edges: [
        { from: "source", to: "build", label: t("원본", "source") },
        { from: "build", to: "packs", label: t("생성", "build") },
        { from: "build", to: "manifest", label: t("기록", "record") },
        { from: "packs", to: "verify", label: t("대조", "compare") },
        { from: "manifest", to: "verify", label: t("기준", "baseline") },
        { from: "verify", to: "gate", label: t("결과", "result") },
        { from: "gate", to: "runtime", label: t("통과", "pass") },
        { from: "gap", to: "verify", label: t("일부만", "partly"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("입장 로비 · 아트 미리보기", "Entry lobby · art previews"),
        role: t(
          "로비는 고른 아트 스타일(sky-island, webtoon, pastel, retro, ink, neon)의 랜드마크 프레임을 보여 주고, 미리보기 컴포넌트는 experience 아틀라스에서 검수된 한 프레임만 SVG 로 잘라 표시합니다. 아틀라스 등록 상수와 helper 는 장면 아트 런타임 모듈에 남아 프레임 세트 코드가 참조합니다.",
          "The lobby shows the landmark frame of the chosen art style (sky-island, webtoon, pastel, retro, ink, neon), and the preview component cuts exactly one reviewed frame from the experience atlas as SVG. The atlas registration constants and helper remain in the scene art runtime module, referenced by the frame-set code.",
        ),
        paths: [`${V}/StudioVirtualExperienceArtPreview.tsx`, `${V}/StudioVirtualSpaceEntryLobby.tsx`, `${V}/studio-virtual-space-scene-art-runtime.ts`],
        route: "/studio/space",
      },
      {
        feature: t("아트 가공 스크립트", "Art processing scripts"),
        role: t(
          "원본을 결정적으로 자르고 팩과 매니페스트를 만듭니다. 색만 바꾼 복제를 새 그림으로 주장하지 않는다는 원칙이 스크립트 머리말에 적혀 있습니다.",
          "They slice the sources deterministically and produce packs and manifests. The principle of not presenting recolored copies as new art is written in the script headers.",
        ),
        paths: [
          "scripts/generate-virtual-studio-art-v4.py",
          "scripts/generate-virtual-studio-independent-art-v5.py",
          "scripts/generate-virtual-studio-living-town-v6.py",
          "scripts/generate-virtual-studio-imagegen25-v7.py",
        ],
      },
      {
        feature: t("무결성 검증과 CI 게이트", "Integrity verification and the CI gate"),
        role: t(
          "매니페스트와 폴더를 대조하는 검증기 7종과 그 단위 테스트를 CI 빌드 작업에서 실행해, 어긋나면 빌드를 멈춥니다.",
          "Seven verifiers that compare manifests with folders, plus their unit tests, run in the CI build job, which stops on any mismatch.",
        ),
        paths: ["scripts/verify-virtual-studio-v3-art.mjs", "scripts/verify-virtual-studio-art-manifest.mjs", ".github/workflows/ci.yml", "package.json"],
      },
      {
        feature: t("v8 · v9 매니페스트와 생존 테스트", "v8 and v9 manifests and surviving tests"),
        role: t(
          "최근 팩은 파일별 바이트 수와 sha256 을 기록합니다(v9 는 생성 ID 도). v8 은 테마 캐릭터 무결성 테스트가 매니페스트의 원본 6개를 파일과 대조하고, 미리보기·아트 스타일·테마 캐릭터 테스트가 프레임과 스타일 계약을 확인합니다. v9 매니페스트는 모델 버전을 인증하지 않는다고(modelVersionVerified: false) 밝힙니다.",
          "The recent packs record per-file byte counts and sha256 values (v9 also generation IDs). For v8, the theme character integrity test compares six sources from the manifest with the files, and the preview, art-style and theme character tests check frame and style contracts. The v9 manifest says it does not certify a model version (modelVersionVerified: false).",
        ),
        paths: [
          `${ASSETS}/experience-v8/art-manifest.json`,
          `${ASSETS}/cinematic-v9/art-manifest.json`,
          `${V}/StudioVirtualExperienceArtPreview.test.tsx`,
          `${V}/studio-virtual-space-art-style.test.ts`,
          `${V}/studio-virtual-space-character-theme-art.test.ts`,
          `${V}/studio-virtual-space-theme-character-integrity.test.ts`,
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("매니페스트와 실제 파일 대조", "Comparing a manifest with the real files"),
        language: "ts",
        code: `// 매니페스트에 적힌 바이트 수와 SHA-256 이 실제 파일과 같은지 확인한다(검증기의 핵심, 단순화).
type Entry = { file: string; bytes: number; sha256: string };

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function verify(
  entries: readonly Entry[],
  onDisk: readonly string[], // 폴더에 실제로 있는 파일
  read: (file: string) => Promise<ArrayBuffer>, // 실제 검증기는 fs.readFile 을 쓴다
): Promise<string[]> {
  const errors: string[] = [];
  const declared = new Set(entries.map((e) => e.file));
  for (const file of onDisk) if (!declared.has(file)) errors.push(\`file missing from manifest: \${file}\`);
  for (const e of entries) {
    if (!onDisk.includes(e.file)) { errors.push(\`manifest points to missing file: \${e.file}\`); continue; }
    const data = await read(e.file);
    if (data.byteLength !== e.bytes) errors.push(\`byte length mismatch: \${e.file}\`);
    if (toHex(await crypto.subtle.digest("SHA-256", data)) !== e.sha256) errors.push(\`sha256 mismatch: \${e.file}\`);
  }
  return errors; // 빈 배열이면 통과, 아니면 CI 가 실패한다
}`,
        codeEn: `// Check that the byte counts and SHA-256 values in a manifest match the real files (the verifier's core, simplified).
type Entry = { file: string; bytes: number; sha256: string };

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function verify(
  entries: readonly Entry[],
  onDisk: readonly string[], // files actually in the folder
  read: (file: string) => Promise<ArrayBuffer>, // the real verifier uses fs.readFile
): Promise<string[]> {
  const errors: string[] = [];
  const declared = new Set(entries.map((e) => e.file));
  for (const file of onDisk) if (!declared.has(file)) errors.push(\`file missing from manifest: \${file}\`);
  for (const e of entries) {
    if (!onDisk.includes(e.file)) { errors.push(\`manifest points to missing file: \${e.file}\`); continue; }
    const data = await read(e.file);
    if (data.byteLength !== e.bytes) errors.push(\`byte length mismatch: \${e.file}\`);
    if (toHex(await crypto.subtle.digest("SHA-256", data)) !== e.sha256) errors.push(\`sha256 mismatch: \${e.file}\`);
  }
  return errors; // an empty array passes; otherwise CI fails
}`,
        explain: t(
          "양쪽을 다 봅니다. 폴더에만 있는 파일(명세 누락)과 명세에만 있는 파일(실제 누락)을 모두 잡고, 같은 파일은 크기와 SHA-256 이 다르면 실패로 칩니다. 실제 검증기는 이미지 가로세로, 심볼릭 링크, 경로 탈출도 확인합니다.",
          "It looks both ways: it catches files only in the folder (missing from the manifest) and files only in the manifest (missing on disk), and fails a file whose size or SHA-256 differs. The real verifiers also check image dimensions, symlinks and path escapes.",
        ),
        source: "scripts/verify-virtual-studio-v3-art.mjs",
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("아트 무결성 게이트를 로컬에서 실행", "Run the art integrity gate locally"),
        language: "bash",
        code: `# CI 와 같은 두 단계를 로컬에서 그대로 실행한다(.github/workflows/ci.yml 의 "Verify Virtual Studio art integrity").
pnpm run test:studio-virtual-art    # 검증기 자체의 단위 테스트(node --test)
pnpm run verify:studio-virtual-art  # 매니페스트와 실제 파일 대조(v3~v7, world-v2)
# 어긋나면 "sha256 mismatch: <파일>" 처럼 파일 이름과 함께 실패한다.`,
        codeEn: `# Run the same two CI steps locally (the "Verify Virtual Studio art integrity" step in .github/workflows/ci.yml).
pnpm run test:studio-virtual-art    # unit tests of the verifiers themselves (node --test)
pnpm run verify:studio-virtual-art  # compare manifests with real files (v3 to v7, world-v2)
# On a mismatch it fails with the file name, such as "sha256 mismatch: <file>".`,
        explain: t(
          "앞 단계는 검증기가 제대로 일하는지, 뒤 단계는 실제 에셋이 맞는지를 봅니다. 두 단계가 모두 통과해야 빌드가 이어집니다.",
          "The first step checks that the verifiers work, the second that the real assets are right. Both must pass for the build to continue.",
        ),
        verify: "none",
      },
    ],
    links: [
      { title: "Node.js · crypto (createHash)", url: "https://nodejs.org/api/crypto.html", kind: "docs", note: t("검증기가 SHA-256 을 계산하는 방법", "How the verifiers compute SHA-256") },
      { title: "Node.js · Test runner", url: "https://nodejs.org/api/test.html", kind: "docs", note: t("node --test 로 검증기를 시험", "Testing the verifiers with node --test") },
      { title: "GitHub Actions", url: "https://docs.github.com/actions", kind: "docs", note: t("CI 워크플로", "The CI workflows") },
      { title: "Pillow", url: "https://pillow.readthedocs.io/", kind: "docs", note: t("가공 스크립트의 이미지 라이브러리", "The image library in the processing scripts") },
      { title: "Google · WebP", url: "https://developers.google.com/speed/webp", kind: "docs", note: t("미리보기가 쓰는 에셋 형식", "The asset format used by the previews") },
    ],
    chapterIds: ["quality"],
    talk: {
      pitch: t(
        "가상 스튜디오의 그림은 3,560개 파일입니다. 그림마다 크기와 SHA-256 지문을 명세서에 적어 두고, 빌드할 때마다 기계가 명세서와 실제 파일을 대조해 어긋나면 빌드를 멈춥니다. 웹에서 이 팩을 쓰는 곳은 입장 로비와 미리보기이고, 공간 안 렌더는 Godot 무대가 맡습니다. 단, 모든 버전이 같은 방식으로 지켜지는 것은 아닙니다. v3~v7 은 아트 게이트가 해시까지 검증하고, v8 은 게이트 일부와 생존한 단위 테스트가 나눠 대조하며, v9 의 전수 대조 테스트는 제거됐습니다.",
        "The studio's art is 3,560 files. Each file's size and SHA-256 fingerprint are written in a manifest, and on every build a machine compares the manifest with the real files and stops the build on a mismatch. On the web these packs are used by the entry lobby and the previews, while the Godot stage renders inside the space. Not every version is guarded the same way, though: the art gate verifies v3 to v7 down to hashes, part of the gate and surviving unit tests share v8, and the full-comparison test for v9 was removed.",
      ),
      analogy: t(
        "택배 창고의 입고 검수입니다. 상자마다 송장(매니페스트)에 무게와 도장이 적혀 있고, 입고 담당(검증기)이 실제 상자와 하나씩 맞춰 보며, 하나라도 다르면 문을 열어 주지 않습니다.",
        "It is the receiving inspection at a parcel warehouse. Each box has an invoice (manifest) with weight and stamp, the receiving clerk (verifier) matches them one by one against the real boxes, and the gate stays shut if even one differs.",
      ),
      questions: [
        {
          question: t("이 그림들은 AI가 만든 건가요?", "Is this art AI-generated?"),
          answer: t(
            "스크립트 머리말과 매니페스트에 따르면 v4·v6·v7 은 이미지 생성 도구로 만든 시트를 자르고 정리한 것이고 v5 는 스크립트가 스타일별로 그린 렌더입니다. v8·v9 매니페스트는 모델 버전을 인증하지 않는다고 적습니다. 라이선스 판단은 이 카드의 범위가 아닙니다.",
            "According to the script headers and manifests, v4, v6 and v7 are sheets from image generation tools that were sliced and organised, while v5 is a set of per-style renders drawn by a script. The v8 and v9 manifests say they do not certify a model version. License judgement is outside this card.",
          ),
        },
        {
          question: t("CI 가 그림의 품질도 보나요?", "Does CI judge art quality too?"),
          answer: t(
            "아니요. 파일이 명세서와 같은지, 개수와 크기가 맞는지, 심볼릭 링크 같은 위험이 없는지를 봅니다. 그림이 예쁜지는 사람이 봅니다.",
            "No. It checks that files match the manifest, counts and sizes are right, and there are no hazards such as symlinks. Whether the art looks good is for humans.",
          ),
        },
        {
          question: t("v8·v9 는 왜 검증이 약한가요?", "Why is verification weaker for v8 and v9?"),
          answer: t(
            "아트 게이트(verify:studio-virtual-art)에는 v8·v9 전용 검증 스크립트가 없어 게이트만 보면 약해 보입니다. v8 은 v7 검증기에 포함된 런타임 배경 24종 검사와 테마 캐릭터 무결성 테스트(원본 6개의 바이트·해시 대조)가 나눠 맡습니다. v9 매니페스트(8개)를 전수 대조하던 테스트는 제거되어, 현재 남은 테스트에서는 그 전수 대조가 확인되지 않습니다.",
            "The art gate (verify:studio-virtual-art) has no dedicated v8 or v9 verifier script, so the gate alone looks weak. For v8, the runtime-backdrop check built into the v7 verifier (24 backdrops) and the theme character integrity test (byte and hash comparison of six sources) share the work. The test that compared the whole v9 manifest (8 assets) was removed, so no surviving test is confirmed to make that full comparison now.",
          ),
        },
      ],
      pitfall: t(
        "'모든 에셋이 아트 게이트에서 검증된다'고 말하지 마세요. 게이트는 v3~v7·world-v2 와 v7 검증기에 포함된 v8 런타임 배경 24종 검사까지이고, v8 의 나머지는 생존한 단위 테스트가 대조하며, v9 는 현재 전수 대조가 확인되지 않습니다. 원본이 AI 생성이라는 서술도 매니페스트가 밝힌 범위에서만 말하고, 모델 버전은 인증된 바 없습니다.",
        "Do not say 'every asset is verified by the art gate'. The gate covers v3 to v7, world-v2 and the v8 runtime-backdrop check built into the v7 verifier (24 backdrops); surviving unit tests compare the rest of v8, and no full comparison of v9 is currently confirmed. Describe the AI-generated origin only to the extent the manifests state it; no model version is certified.",
      ),
    },
    technologies: ["GitHub Actions", "Pillow", "WebP", "SHA-256"],
    facts: [
      { value: "3,560개 · 412.6 MiB", label: t("가상 스튜디오 아트·월드 자산 파일 수와 크기", "Number and size of virtual-studio art and world asset files"), source: ASSETS },
      { value: "1,872개", label: t("v5 독립 스타일 팩의 매니페스트 파일 수", "Manifest file count of the v5 independent style packs"), source: "scripts/verify-virtual-studio-v5-art.mjs" },
      { value: "7종", label: t("CI 에서 도는 아트 검증기(매니페스트, v3, v4, v5, v6, v7, world-v2)", "Art verifiers run in CI (manifest, v3, v4, v5, v6, v7, world-v2)"), source: "package.json" },
      { value: "24종", label: t("v7 검증기가 해시를 확인하는 v8 런타임 배경 수", "v8 runtime backdrops whose hashes the v7 verifier checks"), source: "scripts/verify-virtual-studio-imagegen25-v7.test.mjs" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "character-atlas-lpc-residency",
    category: "virtual-space",
    name: "Sprite atlas",
    title: t("캐릭터 그림을 정확히 자르고 미리보기로 보여 주기", "Cutting character art exactly and showing it in previews"),
    status: "live",
    tagline: t(
      "스프라이트 시트를 픽셀 손실 없이 자르고, 캐릭터 미리보기와 로비가 그 프레임을 씁니다.",
      "Sprite sheets are cut without losing a pixel, and character previews and the lobby use those frames.",
    ),
    background: [
      t(
        "캐릭터의 모습은 한 장짜리 큰 그림 위에 동작별 칸을 모아 둔 '스프라이트 시트'에서 칸을 하나씩 꺼내 보여 줍니다. 만화책 컷을 격자로 인쇄한 종이에서 오려 쓰는 것과 같습니다. 칸을 나눌 때 1픽셀이라도 어긋나면 캐릭터가 깜빡이거나 옆 칸의 그림이 비치므로, 정수 경계로 정확히 자릅니다. 웹에서 이 라이브러리를 쓰는 곳은 캐릭터 미리보기와 입장 로비·캐릭터 선택이고, 공간 안에서 캐릭터를 움직이는 렌더는 Godot 무대가 맡습니다.",
        "A character's appearance is shown by taking one cell at a time from a sprite sheet, one big picture holding cells for each motion. It is like cutting out panels from a sheet printed as a grid. If cutting is off by even one pixel the character flickers or the neighbouring cell shows through, so cuts are made exactly at integer boundaries. On the web this library is used by the character previews and the entry lobby and character picker, while the Godot stage renders characters moving inside the space.",
      ),
      t(
        "자르기: 시트를 칸 수로 나눌 때 Math.round 로 경계를 정해 이웃한 칸이 겹치지도 잘리지도 않게 합니다(rounded-grid). 간격이 고르지 않은 생성 원본은 검수한 칸 영역 목록(explicit-frames)을 그대로 씁니다. 미리보기 컴포넌트는 이 프레임 좌표로 SVG viewBox 와 클립을 만들어 한 칸만 보여 줍니다. 상주 규칙도 같은 라이브러리에 남아 있습니다. 텍스처를 주인별로 세는 상주 클래스는 아무도 쓰지 않으면 30초 유예 뒤 백엔드의 제거를 부르도록 설계됐고, 지금은 단위 테스트가 가짜 백엔드로 그 동작을 검증합니다.",
        "Cutting: boundaries are set with Math.round when dividing the sheet by cell count, so neighbouring cells neither overlap nor lose pixels (rounded-grid). Generated sources with uneven spacing use the reviewed list of cell regions (explicit-frames) as is. The preview component builds an SVG viewBox and clip from these frame coordinates and shows exactly one cell. The residency rule also remains in the same library: the residency class, which counts textures per owner, is designed to call the backend's removal after a 30-second grace period when nobody uses a texture, and unit tests now verify that behaviour with a fake backend.",
      ),
      t(
        "픽셀 아트 캐릭터 20명(NPC 8, 플레이어 프리셋 12)은 오픈소스 Universal LPC 생성기의 레이어를 겹쳐 만들었습니다. 64px 원본을 2배 최근접 확대해 픽셀이 번지지 않게 합니다. 걷기 시트는 9열(0열이 서기, 1~8열이 걷기), 대기 2열, 앉기 3열, 이모트 3열, 달리기 8열입니다. 크레딧을 화면에 띄우는 고지 컴포넌트는 제거됐지만, 작가·라이선스 기록은 credits.json 과 CREDITS.md 파일로 남고, 코드 안 요약 상수(작가 목록과 라이선스별 레이어 수)를 테스트가 그 파일과 대조합니다.",
        "The 20 pixel-art characters (8 NPCs, 12 player presets) were composed from layers of the open-source Universal LPC generator. The 64 px sources are enlarged 2× with nearest-neighbour so pixels stay sharp. The walk sheet has 9 columns (column 0 stands, 1 to 8 walk), idle has 2, sit 3, emote 3 and run 8. The on-screen credits notice component was removed, but the author and license records remain as the credits.json and CREDITS.md files, and tests compare the summary constants in the code (the author list and the layer counts per license) with those files.",
      ),
      t(
        "텍스처를 바로 내리지 않고 30초 보관하는 것은 메모리를 조금 더 쓰는 대가입니다. 30초는 설계값이며 기기별 메모리 사용량 측정은 확인하지 못했습니다. LPC 레이어의 라이선스(OGA-BY, CC-BY, CC0 등) 해석은 이 카드의 범위가 아닙니다.",
        "Keeping a texture for 30 seconds instead of unloading it at once costs a bit more memory. The 30 seconds is a design value, and per-device memory measurements were not found. Interpreting the licenses of the LPC layers (OGA-BY, CC-BY, CC0 and so on) is outside this card.",
      ),
    ],
    keyPoints: [
      t("시트를 정수 경계로 잘라 겹침도 손실도 없습니다", "Sheets are cut at integer bounds with no overlap or loss"),
      t("주인별로 참조를 세고 30초 뒤 백엔드에서 내립니다", "References are counted per owner; the backend unloads after 30 s"),
      t("LPC 20명, 크레딧은 파일과 코드 요약으로 남습니다", "20 LPC characters; credits remain as files and a code summary"),
    ],
    diagram: {
      id: "character-atlas-lpc-residency-diagram",
      kind: "graph",
      title: t("LPC 레이어에서 미리보기의 캐릭터, 그리고 메모리 해제까지", "From LPC layers to a character in previews, and back out of memory"),
      caption: t(
        "시트를 만들고 정확히 잘라 미리보기가 쓰며, 크레딧은 파일로 남깁니다.",
        "Sheets are built, cut exactly and used by previews, with credits kept as files.",
      ),
      alt: t(
        "Universal LPC 생성기의 레이어를 빌드 스크립트가 겹치고 2배 확대해 시트와 크레딧 파일을 만듭니다. 시트는 정수 경계로 잘려 프레임 좌표가 되고, 캐릭터 미리보기가 그 좌표로 한 칸을 보여 줍니다. 주인별 참조를 세는 상주 클래스는 아무도 쓰지 않으면 30초 뒤 백엔드에서 제거하도록 설계됐습니다. 크레딧은 화면 컴포넌트가 아니라 credits.json 과 CREDITS.md 파일로 남습니다.",
        "A build script layers and 2× enlarges Universal LPC generator layers into sheets and credit files. The sheets are cut at integer boundaries into frame coordinates, and the character preview shows one cell using those coordinates. The residency class, which counts references per owner, is designed to remove a texture through the backend 30 seconds after nobody uses it. The credits remain as the credits.json and CREDITS.md files, not as an on-screen component.",
      ),
      nodes: [
        { id: "layers", label: t("LPC 레이어", "LPC layers"), sub: t("오픈소스 생성기", "Open-source generator"), tone: "external", shape: "cloud", at: [0, 0] },
        { id: "build", label: t("빌드 스크립트", "Build script"), sub: t("겹치기 · 2배 확대", "Layer, enlarge 2×"), tone: "local", at: [1, 0] },
        { id: "sheet", label: t("시트 + 크레딧 파일", "Sheets and credit files"), sub: t("webp · manifest", "webp, manifest"), tone: "neutral", shape: "cylinder", at: [2, 0] },
        { id: "slice", label: t("정수 경계로 자르기", "Cut at integer bounds"), sub: t("rounded-grid", "rounded-grid"), tone: "good", at: [3, 0] },
        { id: "owner", label: t("상주 관리", "Residency"), sub: t("주인별 참조", "Per-owner references"), tone: "local", at: [4, 0] },
        { id: "drop", label: t("30초 뒤 제거", "Removed after 30 s"), tone: "warn", shape: "pill", at: [5, 0] },
        { id: "notice", label: t("크레딧 파일", "Credit files"), sub: t("credits.json · CREDITS.md", "credits.json, CREDITS.md"), tone: "neutral", at: [2, 1] },
      ],
      edges: [
        { from: "layers", to: "build", label: t("레이어", "layers") },
        { from: "build", to: "sheet", label: t("생성", "build") },
        { from: "sheet", to: "slice", label: t("불러옴", "load") },
        { from: "slice", to: "owner", label: t("프레임", "frames") },
        { from: "owner", to: "drop", label: t("아무도 안 씀", "unused"), style: "dashed" },
        { from: "sheet", to: "notice", label: t("credits", "credits"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("캐릭터 미리보기와 로비", "Character previews and the lobby"),
        role: t(
          "미리보기 컴포넌트는 스킨 정의의 아틀라스 레이아웃으로 정지 에셋을 고르고, 프레임 좌표만큼 SVG viewBox 를 잘라 보여 줍니다. 로비와 캐릭터 선택이 이 미리보기를 씁니다. 시트 크기가 정의와 다르면 그 프레임은 표시하지 않습니다.",
          "The preview component picks the static asset from the skin's atlas layout and shows it cut to the frame coordinates as an SVG viewBox. The lobby and the character picker use this preview. If a sheet's size differs from its definition, that frame is not shown.",
        ),
        paths: [`${V}/StudioVirtualCharacterPreview.tsx`, `${V}/studio-virtual-space-character-atlas.ts`, `${V}/studio-virtual-space-character-assets.ts`],
        route: "/studio/space",
      },
      {
        feature: t("텍스처 상주 규칙", "Texture residency rule"),
        role: t(
          "StudioCharacterAssetResidency 가 주인별 참조를 세어, 모두 떠나면 30초 유예 뒤 백엔드의 제거를 부릅니다. 로드가 끝나기 전에 떠난 주인에게는 완료 콜백이 아무 영향도 주지 않으며, 단위 테스트가 가짜 백엔드로 검증합니다.",
          "StudioCharacterAssetResidency counts references per owner and calls the backend's removal 30 seconds after all leave. The completion callback has no effect on an owner that left before loading finished, and unit tests verify this with a fake backend.",
        ),
        paths: [`${V}/studio-virtual-space-character-assets.ts#StudioCharacterAssetResidency`, `${V}/studio-virtual-space-character-theme-art.test.ts`],
      },
      {
        feature: t("LPC 픽셀 캐릭터(NPC 8 · 프리셋 12)", "LPC pixel characters (8 NPCs, 12 presets)"),
        role: t(
          "빌드 스크립트가 만든 시트를 스킨으로 연결해 미리보기와 선택 목록이 걷기·앉기·이모트 프레임을 고릅니다.",
          "Sheets made by the build script are mapped to skins, and the previews and picker select walk, sit and emote frames from them.",
        ),
        paths: [`${V}/lpc/studio-lpc-characters.ts`, "scripts/virtual-studio/build-lpc-characters.mjs", `${ASSETS}/characters-lpc-v1/manifest.json`],
      },
      {
        feature: t("LPC 크레딧 기록", "LPC credit records"),
        role: t(
          "화면에 띄우는 고지 컴포넌트는 제거됐습니다. 작가 목록과 라이선스별 레이어 수는 코드 안 요약 상수로 남고, 원본 기록은 credits.json 과 CREDITS.md 파일에 있습니다. LPC 테스트가 요약 상수를 credits.json 과 대조합니다.",
          "The on-screen notice component was removed. The author list and the layer counts per license remain as summary constants in the code, and the original records are in the credits.json and CREDITS.md files. The LPC tests compare the summary constants with credits.json.",
        ),
        paths: [`${V}/lpc/studio-lpc-characters.ts`, `${ASSETS}/characters-lpc-v1/credits.json`, `${ASSETS}/characters-lpc-v1/CREDITS.md`, `${V}/lpc/studio-lpc-characters.test.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("겹침도 손실도 없는 정수 격자 자르기", "Integer grid slicing with no overlap or loss"),
        language: "ts",
        code: `// 시트를 정수 경계로 나눠, 겹치는 픽셀도 잘리는 픽셀도 없게 한다(rounded-grid, 단순화).
type Frame = { index: number; x: number; y: number; width: number; height: number };

export function roundedGrid(width: number, height: number, columns: number, rows: number): Frame[] {
  const frames: Frame[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y = Math.round((row * height) / rows);
    const nextY = Math.round(((row + 1) * height) / rows);
    for (let column = 0; column < columns; column += 1) {
      const x = Math.round((column * width) / columns);
      const nextX = Math.round(((column + 1) * width) / columns);
      frames.push({ index: row * columns + column, x, y, width: nextX - x, height: nextY - y });
    }
  }
  return frames; // 미리보기는 이 좌표로 SVG viewBox 를 만든다
}`,
        codeEn: `// Cut a sheet at integer boundaries so no pixel overlaps and none is lost (rounded-grid, simplified).
type Frame = { index: number; x: number; y: number; width: number; height: number };

export function roundedGrid(width: number, height: number, columns: number, rows: number): Frame[] {
  const frames: Frame[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y = Math.round((row * height) / rows);
    const nextY = Math.round(((row + 1) * height) / rows);
    for (let column = 0; column < columns; column += 1) {
      const x = Math.round((column * width) / columns);
      const nextX = Math.round(((column + 1) * width) / columns);
      frames.push({ index: row * columns + column, x, y, width: nextX - x, height: nextY - y });
    }
  }
  return frames; // previews build an SVG viewBox from these coordinates
}`,
        explain: t(
          "칸의 끝 경계가 다음 칸의 시작 경계와 같은 값이라 사이에 빈틈도 겹침도 생기지 않습니다. 나누어떨어지지 않는 크기에서는 칸 폭이 1픽셀씩 달라질 수 있지만 전체가 정확히 덮입니다.",
          "Each cell's end boundary is the same value as the next cell's start, so there is neither gap nor overlap. When the size does not divide evenly, cell widths may differ by one pixel, yet the whole sheet is covered exactly.",
        ),
        source: `${V}/studio-virtual-space-character-atlas.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("주인별 참조 세기와 30초 유예 해제", "Per-owner reference counting with a 30-second grace unload"),
        language: "ts",
        code: `// 주인(owner)별 참조를 세고, 아무도 안 쓰면 30초 유예 뒤 텍스처를 내린다(Residency 의 단순화).
export class Residency {
  private owners = new Map<string, Set<string>>(); // 텍스처 키 → 쓰는 주인들
  private unusedAt = new Map<string, number>();

  use(owner: string, key: string): void {
    const set = this.owners.get(key) ?? new Set<string>();
    this.owners.set(key, set.add(owner));
    this.unusedAt.delete(key);
  }

  release(owner: string, key: string, now: number): void {
    const set = this.owners.get(key);
    if (set?.delete(owner) && set.size === 0) this.unusedAt.set(key, now);
  }

  collect(now: number, remove: (key: string) => void, idleMs = 30_000): void {
    for (const [key, at] of this.unusedAt) {
      if (now - at < idleMs) continue; // 방향을 자주 바꿔도 같은 시트를 다시 받지 않게 잠시 보관
      remove(key);
      this.unusedAt.delete(key);
      this.owners.delete(key);
    }
  }
}`,
        codeEn: `// Count references per owner and unload a texture 30 seconds after nobody uses it (simplified from the residency class).
export class Residency {
  private owners = new Map<string, Set<string>>(); // texture key → owners using it
  private unusedAt = new Map<string, number>();

  use(owner: string, key: string): void {
    const set = this.owners.get(key) ?? new Set<string>();
    this.owners.set(key, set.add(owner));
    this.unusedAt.delete(key);
  }

  release(owner: string, key: string, now: number): void {
    const set = this.owners.get(key);
    if (set?.delete(owner) && set.size === 0) this.unusedAt.set(key, now);
  }

  collect(now: number, remove: (key: string) => void, idleMs = 30_000): void {
    for (const [key, at] of this.unusedAt) {
      if (now - at < idleMs) continue; // keep briefly so changing direction does not re-download the same sheet
      remove(key);
      this.unusedAt.delete(key);
      this.owners.delete(key);
    }
  }
}`,
        explain: t(
          "여러 캐릭터가 같은 시트를 쓰면 한 명이 떠나도 시트는 남습니다. 마지막 주인이 떠난 시각만 기록해 두고, 정리 시점에 유예가 지난 것만 내립니다.",
          "When several characters share a sheet it stays after one leaves. Only the time the last owner left is recorded, and at cleanup only entries past the grace period are removed.",
        ),
        source: `${V}/studio-virtual-space-character-assets.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · SVG viewBox", url: "https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/viewBox", kind: "docs", note: t("미리보기가 프레임을 자르는 방법", "How the previews cut a frame") },
      { title: "Universal LPC Spritesheet Character Generator", url: "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator", kind: "repo", note: t("캐릭터 레이어의 출처", "The source of the character layers") },
      { title: "Liberated Pixel Cup · OpenGameArt", url: "https://lpc.opengameart.org/", kind: "guide", note: t("LPC 프로젝트 소개", "About the LPC project") },
      { title: "Wikipedia · Texture atlas", url: "https://en.wikipedia.org/wiki/Texture_atlas", kind: "article", note: t("한 장에 모은 텍스처", "Textures gathered into one image") },
    ],
    chapterIds: ["performance", "licenses"],
    talk: {
      pitch: t(
        "캐릭터의 모습은 한 장의 큰 시트에서 칸을 꺼내 보여 줍니다. 칸을 정수 경계로 정확히 잘라 한 픽셀도 겹치거나 잘리지 않게 하고, 캐릭터 미리보기와 입장 로비가 그 프레임으로 캐릭터를 보여 줍니다. 공간 안 렌더는 Godot 무대가 맡습니다. 픽셀 캐릭터 20명은 오픈소스 LPC 생성기 레이어로 만들었고, 작가와 라이선스 기록은 credits.json 과 CREDITS.md 로 남습니다.",
        "A character's appearance is shown by taking cells from one big sheet. The cells are cut exactly at integer boundaries so no pixel overlaps or is lost, and the character previews and the entry lobby show characters with those frames. The Godot stage renders inside the space. The 20 pixel characters are built from open-source LPC generator layers, and the author and license records remain as credits.json and CREDITS.md.",
      ),
      analogy: t(
        "도서관 대출 카운터와 같습니다. 책(텍스처)을 빌려 간 사람(주인)이 한 명이라도 있으면 서가에 두고, 모두 반납하면 잠깐 카운터에 두었다가 서가로 돌려보냅니다.",
        "It works like a library desk. As long as even one person (owner) has borrowed a book (texture) it stays out, and once all return it, it rests at the desk briefly before going back to the shelf.",
      ),
      questions: [
        {
          question: t("왜 30초나 보관하나요?", "Why keep it for 30 seconds?"),
          answer: t(
            "캐릭터가 방향을 자주 바꾸거나 잠깐 사라졌다 나타날 때 같은 시트를 다시 내려받지 않게 하려는 짧은 캐시입니다. 30초는 설계값입니다.",
            "It is a short cache so that when a character changes direction often, or disappears and reappears, the same sheet is not downloaded again. The 30 seconds is a design value.",
          ),
        },
        {
          question: t("LPC 그림의 라이선스는요?", "What about the LPC art licenses?"),
          answer: t(
            "작가 목록과 라이선스별 레이어 수(OGA-BY 3.0, CC-BY 4.0, CC0 등)는 코드 안 요약 상수와 credits.json·CREDITS.md 파일에 남습니다. 예전 화면 고지 컴포넌트는 제거됐습니다. 법적 해석은 이 카드의 범위가 아니라서 라이선스 자료를 보세요.",
            "The author list and the layer counts per license (OGA-BY 3.0, CC-BY 4.0, CC0 and so on) remain as summary constants in the code and in the credits.json and CREDITS.md files. The former on-screen notice component was removed. Legal interpretation is outside this card; see the license materials.",
          ),
        },
        {
          question: t("픽셀이 번지지 않나요?", "Won't the pixels blur?"),
          answer: t(
            "시트를 만들 때 64px 원본을 2배 정수 확대해 둡니다. 캐릭터 미리보기는 픽셀 아트 스킨에 image-rendering: pixelated 를 적용해 도트 경계를 유지하고, 에셋 정의에도 'nearest' 필터 힌트(textureFilter)가 붙습니다.",
            "When the sheets were built the 64 px sources were enlarged by an integer factor of 2. The character preview applies image-rendering: pixelated to pixel-art skins so dot edges stay sharp, and the asset definitions also carry a 'nearest' filter hint (textureFilter).",
          ),
        },
      ],
      pitfall: t(
        "LPC 레이어의 라이선스 적합성(상업적 이용 가능 여부)을 이 카드에서 판단하지 마세요. 화면 크레딧 고지가 있다고 말하지 마세요. 고지 컴포넌트는 제거됐고 기록은 파일과 코드 요약으로만 남습니다. 메모리 사용량은 측정값이 없는 설계값 기준입니다.",
        "Do not judge the license suitability of the LPC layers (such as commercial use) from this card. Do not say there is an on-screen credits notice: the notice component was removed, and the records remain only as files and a code summary. Memory use rests on a design value with no measurement.",
      ),
    },
    technologies: ["Universal LPC", "WebP", "SVG"],
    facts: [
      { value: "20명", label: t("LPC 픽셀 캐릭터 수(NPC 8 · 플레이어 프리셋 12)", "Number of LPC pixel characters (8 NPCs, 12 player presets)"), source: `${ASSETS}/characters-lpc-v1/manifest.json` },
      { value: "64px × 2", label: t("LPC 원본 프레임 크기와 최근접 확대 배율", "LPC source frame size and nearest-neighbour scale"), source: `${V}/lpc/studio-lpc-characters.ts` },
      { value: "30초", label: t("텍스처 유휴 보관 시간(설계값)", "Idle retention time of a texture (design value)"), source: `${V}/studio-virtual-space-character-assets.ts` },
      { value: "256칸", label: t("시트 한 장의 프레임 수 상한", "Frame cap per sheet"), source: `${V}/studio-virtual-space-character-atlas.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
