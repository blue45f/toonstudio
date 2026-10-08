import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · three-d 카테고리 중 "도형 계산" 계열 카드: OpenCascade·Manifold·three-bvh-csg 역할 분담.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const CREATOR_DIR = "apps/web/src/domains/creator";
const DCC_DIR = `${CREATOR_DIR}/hybrid-dcc`;
const SPECIALIST_DIR = `${CREATOR_DIR}/scene3d/specialists`;

export const OPENCASCADE_MANIFOLD_PRECISION: EngineeringAtlasEntry = {
  id: "opencascade-manifold-precision",
  category: "three-d",
  name: "OpenCascade · Manifold · three-bvh-csg",
  title: t(
    "구멍 하나 뚫는 데도 빠른 칼·새지 않는 칼·정밀한 칼을 가려 씁니다",
    "Even for one hole, it picks the fast, the leak-proof or the exact blade",
  ),
  status: "experimental",
  tagline: t(
    "미리보기는 빠르게, 확정은 닫힌 솔리드로, 치수가 중요하면 CAD 커널로 나눠 맡깁니다.",
    "Previews go fast, final cuts become closed solids, exact dimensions go to a CAD kernel.",
  ),
  background: [
    t(
      "물건에 구멍을 뚫는 일을 떠올려 보세요. 스티로폼 모형은 가위로 슥 잘라 모양만 보면 되고, 가구는 틈이 새지 않게 딱 맞아야 하고, 기계 부품은 도면의 치수 그대로여야 합니다. 3D 도형을 합치고 빼는 계산도 같아서, 계산기 하나로 다 하지 않고 일이 다른 셋을 나눠 씁니다. 빠른 미리보기용 three-bvh-csg, 새지 않는 솔리드용 Manifold, 도면급 정밀용 OpenCascade입니다.",
      "Think of drilling a hole in something. A foam model can be snipped with scissors just to see the shape, furniture must fit without gaps, and a machine part must match its drawing exactly. Combining and subtracting 3D shapes is the same, so instead of one calculator it uses three for three different jobs: three-bvh-csg for fast previews, Manifold for leak-proof solids and OpenCascade for drawing-grade precision.",
    ),
    t(
      "'새지 않는다'는 말은 도형의 겉면이 구멍 없는 닫힌 껍데기(다양체, manifold)라는 뜻입니다. three-bvh-csg는 삼각형들을 공간 분할 구조(BVH)로 빠르게 자르고 붙이지만 그 보장은 없어서, 결과에 '미리보기이며 솔리드를 보장하지 않는다'는 경고를 붙입니다. Manifold(WebAssembly)는 입력과 결과가 닫힌 껍데기인지 상태 코드로 확인하고 입출력의 SHA-256을 영수증에 남깁니다. OpenCascade는 삼각형이 아니라 곡면 수식(B-rep)을 그대로 다루는 CAD 커널로, 모서리 둥글리기·속 비우기·STEP 저장을 맡습니다.",
      "'Leak-proof' means the surface is a closed shell with no holes (a manifold). three-bvh-csg cuts and joins triangles quickly using a spatial structure (BVH) but gives no such guarantee, so its result carries a warning that it is a preview, not a guaranteed solid. Manifold (WebAssembly) checks by status code that the inputs and the result are closed shells and leaves a receipt with their SHA-256 hashes. OpenCascade is a CAD kernel that works on curved-surface equations (B-rep) rather than triangles and handles fillets, hollowing and STEP saving.",
    ),
    t(
      "세 계산기 모두 못 하면 못 한다고 말하게 둘러쌌습니다. Manifold 앞에서는 좌표가 유한한지, 꼭짓점 번호가 겹치거나 넓이가 0인 삼각형이 없는지, 두 메시의 삼각형 수를 곱한 작업량이 20억 이하인지(메시당 정점 25만·삼각형 50만 이하)를 먼저 검사하고, 동시에는 하나만 받고 둘째는 거절합니다. OpenCascade는 Worker 안에서 정해진 19가지 연산만 돌리며 제한 시간은 기본 120초입니다. opencascade.js 1.1.1은 객체를 지울 때 내부 표가 망가지는 문제가 있어, 해당하는 3가지 연산은 일회용 Worker에서 돌리고 끝나면 통째로 버립니다.",
      "All three are wrapped so that they say so when they cannot do the job. Before Manifold runs, inputs are checked for finite coordinates, no triangles with repeated vertex numbers or zero area, and a work estimate (the two meshes' triangle counts multiplied) of at most 2 billion, with each mesh capped at 250,000 vertices and 500,000 triangles; it accepts one at a time and refuses a second. OpenCascade runs only 19 fixed operations inside a Worker with a default 120-second limit. opencascade.js 1.1.1 corrupts an internal table when objects are deleted, so the 3 affected operations run in a disposable Worker that is discarded whole afterwards.",
    ),
    t(
      "왜 하나로 합치지 않았을까요? OpenCascade는 약 63MB의 WebAssembly라 미리보기마다 불러올 수 없고, 메시 불리언은 필렛 같은 곡면 연산을 못 하며, BVH 방식은 속도 대신 보장을 내려놓기 때문입니다. 그래서 각자 필요한 순간에만 지연 로드합니다. 다만 상태는 실험입니다. Hybrid DCC 기능 목록 178개는 스스로 모두 '커널 출하' 단계로만 표시하고, 화면 연결·문서 통합·저장·협업·브라우저 검증·운영 활성화 여섯 단계는 미검증으로 둡니다. 속도 측정값은 이 카드에 없습니다.",
      "Why not merge them? OpenCascade is about 63 MB of WebAssembly, too heavy to load for every preview; a mesh boolean cannot do curved operations such as fillets; and the BVH approach trades the guarantee for speed. So each loads only when it is needed. The status is experimental, though: the Hybrid DCC list marks all 178 of its features as merely 'kernel-shipped' and leaves six later stages unverified (UI wiring, document integration, persistence, collaboration, browser verification, production activation). This card has no speed measurements.",
    ),
  ],
  keyPoints: [
    t("미리보기·확정·정밀, 일이 다른 세 계산기를 따로 둡니다", "Three calculators for three jobs: preview, final and exact"),
    t("Manifold는 입력부터 검사하고 SHA-256 영수증을 남깁니다", "Manifold checks inputs first and leaves SHA-256 receipts"),
    t("OpenCascade는 63MB라 필요할 때만 불러와 Worker에서 돌립니다", "OpenCascade is 63 MB, so it loads on demand inside a Worker"),
    t("실험 단계: 178개 기능 모두 '커널 출하'까지만 확인됩니다", "Experimental: all 178 features are confirmed only as kernel-shipped"),
  ],
  diagram: {
    id: "opencascade-manifold-precision-diagram",
    kind: "layers",
    title: t("목적에 따라 고르는 세 가지 칼", "Three blades, chosen by purpose"),
    caption: t(
      "위쪽일수록 빠르고 가볍고, 아래쪽일수록 보장이 단단하고 무겁습니다. 고르는 사람은 작가입니다.",
      "Higher is faster and lighter, lower gives firmer guarantees at more cost. The artist does the choosing.",
    ),
    alt: t(
      "맨 위 계층은 빠른 미리보기용 three-bvh-csg로 닫힌 껍데기를 보장하지 않습니다. 그 아래에 닫힌 솔리드와 SHA-256 영수증을 주는 Manifold가 있고, 그 아래에 곡면 수식을 그대로 다루는 OpenCascade가 있습니다. 맨 아래에는 세 계산기가 함께 지키는 규칙이 있고, 위의 두 계층은 삼각형 메시를 합치고 빼는 한 묶음입니다.",
      "The top layer is three-bvh-csg for fast previews, which does not guarantee a closed shell. Below it, Manifold gives closed solids and SHA-256 receipts, and below that OpenCascade works directly on curved-surface equations. The bottom layer holds the rules all three share, and the top two layers form one group that combines and subtracts triangle meshes.",
    ),
    layers: [
      {
        id: "preview",
        label: t("빠른 칼 · 미리보기", "Fast blade: preview"),
        sub: t("삼각형을 빠르게 자름 · 닫힌 껍데기 보장 없음 · 경고 표시", "Cuts triangles quickly, no closed-shell guarantee, shows a warning"),
        tone: "warn",
        chips: ["three-bvh-csg"],
      },
      {
        id: "solid",
        label: t("새지 않는 칼 · 확정", "Leak-proof blade: final"),
        sub: t("입력·결과 상태 확인 · SHA-256 영수증 · 예산 검사", "Checks inputs and result, SHA-256 receipt, budget checks"),
        tone: "good",
        chips: ["Manifold", "WebAssembly"],
      },
      {
        id: "cad",
        label: t("정밀한 칼 · 도면급", "Exact blade: drawing-grade"),
        sub: t("곡면 수식 그대로 · 필렛·STEP · 63MB 지연 로드", "Keeps curve equations, fillets and STEP, 63 MB lazy load"),
        tone: "local",
        chips: ["OpenCascade", "Web Worker"],
      },
      {
        id: "rules",
        label: t("세 칼의 공통 규칙", "Rules shared by all three"),
        sub: t("못 하면 못 한다고 알림 · 몰래 다른 칼로 바꾸지 않음", "Say so when it cannot, never swap blades quietly"),
        tone: "neutral",
      },
    ],
    brackets: [
      { label: t("삼각형 메시끼리 합치고 빼기", "Combining triangle meshes"), layerIds: ["preview", "solid"] },
    ],
  },
  usage: [
    {
      feature: t("3D 배경 편집기 · 불리언 파생본", "3D background editor · Boolean derivative"),
      role: t(
        "두 GLB를 합치기·빼기·교집합으로 묶고 처리기를 고릅니다. 기본은 'BVH preview'이고 'Manifold solid'를 고르면 닫힌 솔리드로 확정합니다.",
        "Combines two GLBs by union, subtract or intersect and lets the artist pick the processor. The default is 'BVH preview', and 'Manifold solid' commits a closed solid.",
      ),
      paths: [
        `${SPECIALIST_DIR}/StudioScene3dAssetToolsPanel.tsx`,
        `${SPECIALIST_DIR}/specialist-csg.ts#processBoolean`,
        `${SPECIALIST_DIR}/specialist-solid-compound.ts`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("Hybrid DCC · 정밀 CAD", "Hybrid DCC · precision CAD"),
      role: t(
        "정밀 박스·구멍 빼기·모서리 라운드·속 비우기·STEP 점검 버튼이 OpenCascade Worker를 부르고, 위상 영수증 검사를 통과한 결과만 장면에 올립니다.",
        "The precise box, cut-a-hole, fillet, hollow-out and STEP check buttons call the OpenCascade Worker, and only results that pass the topology-receipt check reach the scene.",
      ),
      paths: [
        `${DCC_DIR}/studio-hybrid-dcc-tool-catalog.ts`,
        `${DCC_DIR}/studio-hybrid-dcc-workspace.ts#workspaceOcctBooleanCut`,
        `${CREATOR_DIR}/studio-occt-worker-client.ts#runStudioOcctOperation`,
        `${CREATOR_DIR}/studio-occt-wasm-facade.ts`,
      ],
      route: "/studio/3d/dcc/cad",
    },
    {
      feature: t("Hybrid DCC · 전문가 도구 · Manifold 불리언", "Hybrid DCC · expert tools · Manifold boolean"),
      role: t(
        "'닫힌 메시 불리언' 도구와 Boolean 모디파이어가 기본 솔리드 백엔드인 Manifold로 결과를 확정하고, 실패하면 진단 문구를 돌려줍니다.",
        "The 'closed-mesh boolean' tool and the Boolean modifier commit through the default solid backend, Manifold, and return a diagnostic message on failure.",
      ),
      paths: [
        `${CREATOR_DIR}/studio-solid-boolean-backend.ts#createStudioDefaultSolidBooleanBackend`,
        `${CREATOR_DIR}/studio-manifold-mesh-provider.ts#createStudioManifoldMeshProvider`,
        `${CREATOR_DIR}/studio-mesh-modifier-stack.ts`,
      ],
      route: "/studio/3d/dcc/model",
    },
    {
      feature: t("실브라우저 검사", "Real-browser check"),
      role: t(
        "제품 화면에서 정밀 박스를 만든 뒤 구멍 빼기를 눌러 삼각형 수를 확인하는 E2E 명세가 있습니다. 이 카드는 실행 이력을 확인하지 못했습니다.",
        "An E2E spec makes a precise box on the product screen, presses cut-a-hole and checks the triangle count. This card could not confirm a run history.",
      ),
      paths: ["e2e/hybrid-dcc-industrial.spec.ts"],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("같은 '상자에서 공 빼기'를 미리보기와 확정으로", "The same 'box minus ball' as a preview and as a final cut"),
      language: "ts",
      code: `import { BoxGeometry, MeshStandardMaterial, SphereGeometry } from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import Module from "manifold-3d";

/** 미리보기: 빠르지만 닫힌 껍데기라는 보장은 없다. */
export function previewCut() {
  const box = new Brush(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
  const ball = new Brush(new SphereGeometry(1.2, 32, 16), new MeshStandardMaterial());
  ball.position.set(0.8, 0.8, 0.8);
  ball.updateMatrixWorld(true);
  return new Evaluator().evaluate(box, ball, SUBTRACTION);
}

/** 확정: 결과의 상태 코드와 부피로 유효한 솔리드인지 확인할 수 있다. */
export async function solidCut() {
  const wasm = await Module();
  wasm.setup();
  const box = wasm.Manifold.cube([2, 2, 2], true);
  const sphere = wasm.Manifold.sphere(1.2, 32);
  const ball = sphere.translate([0.8, 0.8, 0.8]);
  const solid = box.subtract(ball);
  const report = { status: solid.status(), volume: solid.volume() };
  // WASM 안의 객체는 자동으로 지워지지 않으므로 직접 해제한다
  for (const handle of [solid, ball, sphere, box]) handle.delete();
  return report;
}`,
      codeEn: `import { BoxGeometry, MeshStandardMaterial, SphereGeometry } from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import Module from "manifold-3d";

/** Preview: fast, but no guarantee that the result is a closed shell. */
export function previewCut() {
  const box = new Brush(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
  const ball = new Brush(new SphereGeometry(1.2, 32, 16), new MeshStandardMaterial());
  ball.position.set(0.8, 0.8, 0.8);
  ball.updateMatrixWorld(true);
  return new Evaluator().evaluate(box, ball, SUBTRACTION);
}

/** Final: the status code and volume of the result show whether it is a valid solid. */
export async function solidCut() {
  const wasm = await Module();
  wasm.setup();
  const box = wasm.Manifold.cube([2, 2, 2], true);
  const sphere = wasm.Manifold.sphere(1.2, 32);
  const ball = sphere.translate([0.8, 0.8, 0.8]);
  const solid = box.subtract(ball);
  const report = { status: solid.status(), volume: solid.volume() };
  // Objects inside WASM are not freed automatically, so release them by hand
  for (const handle of [solid, ball, sphere, box]) handle.delete();
  return report;
}`,
      explain: t(
        "앞쪽은 three.js 메시를 바로 돌려주지만 결과가 닫혀 있는지는 알려 주지 않습니다. 뒤쪽 Manifold는 status()가 'NoError'인지와 volume()을 볼 수 있습니다. 실제 제품은 여기에 입력 검사와 영수증을 더한 provider를 한 겹 둡니다.",
        "The first returns a three.js mesh straight away but does not say whether it is closed. Manifold in the second can report whether status() is 'NoError' and what volume() is. The real product adds a provider layer with input checks and a receipt.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("불리언 전에 입력을 검사하는 문지기", "A gatekeeper that checks input before the boolean"),
      language: "ts",
      code: `const MAX_COORDINATE = 1_000_000_000;
const MAX_WORK_UNITS = 2_000_000_000;

/** 이상한 삼각형이 하나라도 있으면 계산하지 않고 거부한다. */
export function assertCleanMesh(positions: Float32Array, indices: Uint32Array): void {
  const vertexCount = positions.length / 3;
  for (const value of positions) {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) throw new Error("invalid coordinate");
  }
  const at = (vertex: number, axis: number) => positions[vertex * 3 + axis]!;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    if (Math.max(a, b, c) >= vertexCount) throw new Error("invalid vertex index");
    if (a === b || b === c || a === c) throw new Error("degenerate triangle");
    const [ux, uy, uz] = [at(b, 0) - at(a, 0), at(b, 1) - at(a, 1), at(b, 2) - at(a, 2)];
    const [vx, vy, vz] = [at(c, 0) - at(a, 0), at(c, 1) - at(a, 1), at(c, 2) - at(a, 2)];
    // 두 변의 외적 길이가 0에 가까우면 넓이가 없는 삼각형이다
    const cross = (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
    if (cross <= 1e-20) throw new Error("zero-area triangle");
  }
}

/** 작업량 추정: 두 메시의 삼각형 수를 곱한 값이 상한 이하여야 한다. */
export const withinBudget = (leftTriangles: number, rightTriangles: number): boolean =>
  leftTriangles * rightTriangles <= MAX_WORK_UNITS;`,
      codeEn: `const MAX_COORDINATE = 1_000_000_000;
const MAX_WORK_UNITS = 2_000_000_000;

/** If even one bad triangle exists, refuse instead of computing. */
export function assertCleanMesh(positions: Float32Array, indices: Uint32Array): void {
  const vertexCount = positions.length / 3;
  for (const value of positions) {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) throw new Error("invalid coordinate");
  }
  const at = (vertex: number, axis: number) => positions[vertex * 3 + axis]!;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    if (Math.max(a, b, c) >= vertexCount) throw new Error("invalid vertex index");
    if (a === b || b === c || a === c) throw new Error("degenerate triangle");
    const [ux, uy, uz] = [at(b, 0) - at(a, 0), at(b, 1) - at(a, 1), at(b, 2) - at(a, 2)];
    const [vx, vy, vz] = [at(c, 0) - at(a, 0), at(c, 1) - at(a, 1), at(c, 2) - at(a, 2)];
    // A cross product close to zero means a triangle with no area
    const cross = (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
    if (cross <= 1e-20) throw new Error("zero-area triangle");
  }
}

/** Work estimate: the product of the two triangle counts must stay within the cap. */
export const withinBudget = (leftTriangles: number, rightTriangles: number): boolean =>
  leftTriangles * rightTriangles <= MAX_WORK_UNITS;`,
      explain: t(
        "Manifold 제공자가 계산 전에 거르는 것들을 줄여 옮겼습니다. 실제 코드는 정점·삼각형 수 상한과 float32 표현 가능 여부도 확인하고, 계산 뒤에는 결과 상태와 위상 정보를 검사해 SHA-256 영수증을 만듭니다.",
        "This condenses what the Manifold provider filters out before computing. The real code also checks the vertex and triangle caps and float32 representability, and after computing it inspects the result state and topology and builds a SHA-256 receipt.",
      ),
      source: `${CREATOR_DIR}/studio-manifold-mesh-provider.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "Manifold · geometry library",
      url: "https://github.com/elalish/manifold",
      kind: "repo",
      note: t("닫힌 다양체를 보장하는 메시 불리언 라이브러리", "A mesh-boolean library that guarantees manifold output"),
    },
    {
      title: "ManifoldCAD",
      url: "https://manifoldcad.org/",
      kind: "docs",
      note: t("Manifold의 공식 사이트와 JavaScript 사용 설명", "Manifold's official site and JavaScript usage"),
    },
    {
      title: "three-bvh-csg",
      url: "https://github.com/gkjohnson/three-bvh-csg",
      kind: "repo",
      note: t("BVH로 빠르게 자르는 three.js CSG", "A fast BVH-based CSG for three.js"),
    },
    {
      title: "Open CASCADE Technology · Overview",
      url: "https://dev.opencascade.org/doc/overview/html/index.html",
      kind: "docs",
      note: t("OCCT 공식 문서의 개요", "The overview of the official OCCT documentation"),
    },
    {
      title: "opencascade.js",
      url: "https://ocjs.org/",
      kind: "docs",
      note: t("OCCT를 WebAssembly로 옮긴 프로젝트", "The project that ports OCCT to WebAssembly"),
    },
    {
      title: "MDN · WebAssembly",
      url: "https://developer.mozilla.org/en-US/docs/WebAssembly",
      kind: "guide",
    },
  ],
  chapterIds: ["web-3d-engine", "worker-architecture"],
  talk: {
    pitch: t(
      "구멍 하나 뚫는 일에도 목적이 셋입니다. 빠르게 보고 싶을 때는 미리보기용 계산, 최종 결과가 새지 않아야 할 때는 Manifold, 도면 같은 치수가 필요할 때는 OpenCascade. 이 셋을 하나로 합치지 않고 제자리에 둔 것이 설계이고, 각 계산은 입력 검사·예산·영수증으로 지켜서 실패하면 실패라고 말합니다.",
      "Even drilling one hole has three purposes. For a quick look it uses preview math, when the final result must not leak it uses Manifold, and when drawing-like dimensions matter it uses OpenCascade. Keeping the three in their own places rather than merging them is the design, and each calculation is guarded by input checks, budgets and receipts so that a failure is reported as a failure.",
    ),
    analogy: t(
      "스티로폼은 가위로, 가구는 이음매 없이, 기계 부품은 도면대로 — 일에 맞는 공구를 고르는 목공소입니다.",
      "A workshop that picks the tool by the job: scissors for foam, seamless joints for furniture, cuts true to the drawing for machine parts.",
    ),
    questions: [
      {
        question: t("왜 계산기를 셋이나 쓰나요?", "Why use three calculators?"),
        answer: t(
          "목적이 다르기 때문입니다. 빠른 미리보기는 보장을 내려놓고, 확정 결과는 닫힌 솔리드를 요구하고, 곡면과 치수는 삼각형이 아니라 곡면 수식으로 다뤄야 합니다. OpenCascade는 약 63MB라서 모든 미리보기에 쓸 수도 없습니다.",
          "Their purposes differ. A fast preview gives up the guarantee, a final result demands a closed solid, and curves and dimensions must be handled as surface equations rather than triangles. At about 63 MB, OpenCascade cannot serve every preview either.",
        ),
      },
      {
        question: t("OpenCascade는 LGPL인데 괜찮은가요?", "OpenCascade is LGPL. Is that a problem?"),
        answer: t(
          "코드는 별도 WebAssembly 모듈로 필요할 때 불러오고 메인 번들에 정적으로 묶지 않는다고 밝혀 둡니다. 법적 판단은 이 카드의 범위 밖이며, 라이선스 목록과 법무 검토가 맡습니다.",
          "The code states that it loads a separate WebAssembly module on demand and does not link it statically into the main bundle. A legal judgment is outside this card; the license inventory and legal review own it.",
        ),
      },
      {
        question: t("얼마나 빠른가요?", "How fast is it?"),
        answer: t(
          "이 카드에는 측정값이 없습니다. 코드가 보장하는 것은 예산 상한과 시간 제한(OpenCascade 기본 120초)이지 처리 속도가 아닙니다.",
          "This card has no measurements. What the code guarantees is budget caps and a time limit (120 seconds by default for OpenCascade), not throughput.",
        ),
      },
    ],
    pitfall: t(
      "'178개 기능이 다 된다'고 말하지 마세요. 목록 스스로 모두 '커널 출하' 단계이고 이후 여섯 단계는 미검증입니다. 또 'BVH'라는 이름이 둘입니다. 미리보기 CSG(three-bvh-csg)는 연결돼 있지만 three-mesh-bvh 제공자 모듈은 아직 화면 기능에 연결되지 않았습니다.",
      "Do not say all 178 features work. The list itself marks every one as kernel-shipped and the six later stages as unverified. Also 'BVH' names two things: the preview CSG (three-bvh-csg) is wired in, but the three-mesh-bvh provider module is not yet connected to any screen feature.",
    ),
  },
  technologies: ["OpenCascade WASM", "Manifold", "three-bvh-csg", "WebAssembly", "Web Workers", "SHA-256"],
  facts: [
    { value: "250,000 / 500,000", label: t("Manifold가 받는 메시 한 개의 정점 / 삼각형 상한", "Most vertices / triangles Manifold accepts per mesh"), source: `${CREATOR_DIR}/studio-manifold-mesh-provider.ts` },
    { value: "2,000,000,000", label: t("두 메시의 삼각형 수를 곱한 작업량 상한", "Cap on the work estimate, the two triangle counts multiplied"), source: `${CREATOR_DIR}/studio-manifold-mesh-provider.ts` },
    { value: "19", label: t("OpenCascade Worker가 받는 고정 연산 종류", "Fixed operation kinds the OpenCascade Worker accepts"), source: `${CREATOR_DIR}/studio-occt-worker-protocol.ts` },
    { value: "≈63 MB", label: t("OpenCascade WebAssembly 파일 크기(E2E 명세의 주석)", "Size of the OpenCascade WebAssembly file (a comment in the E2E spec)"), source: "e2e/hybrid-dcc-industrial.spec.ts" },
    { value: "178", label: t("Hybrid DCC 기능 목록 수, 전부 '커널 출하' 단계", "Features in the Hybrid DCC list, all at the 'kernel-shipped' stage"), source: `${DCC_DIR}/studio-dcc-section6-full-catalog.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const COORDINATE_UNIT_ROUNDTRIP: EngineeringAtlasEntry = {
  id: "coordinate-unit-roundtrip",
  category: "three-d",
  name: "glTF 좌표계 · 단위 · 왕복 검증",
  title: t(
    "프로그램마다 '위쪽'과 '1미터'가 달라서, 번역하고 되돌려 확인합니다",
    "Programs disagree on 'up' and 'one metre', so ToonStudio translates and converts back to check",
  ),
  status: "experimental",
  tagline: t(
    "경계마다 좌표·단위·각도를 번역하고, 되돌려 봐서 어긋나면 받지 않습니다.",
    "It translates coordinates, units and angles at each border and rejects what does not convert back.",
  ),
  background: [
    t(
      "여행지마다 차가 다니는 방향과 돈의 단위가 다릅니다. 3D 프로그램도 그렇습니다. Blender는 Z가 위쪽이고, glTF 규격과 three.js는 Y가 위쪽이며, Babylon.js는 기본이 왼손 좌표계입니다. 어떤 파일은 인치로, 어떤 파일은 밀리미터로 만들어집니다. 그냥 옮기면 캐릭터가 누워 있거나, 거울에 비친 듯 뒤집히거나, 개미만 하게 보입니다. 그래서 안쪽 약속을 하나 정하고 바깥과 만나는 경계마다 번역가를 둡니다.",
      "Every country drives on its own side and spends its own money. 3D programs are the same. Blender has Z up, the glTF specification and three.js have Y up, and Babylon.js is left-handed by default. Some files are made in inches, others in millimetres. Moved naively, a character lies down, flips as if in a mirror, or looks the size of an ant. So ToonStudio fixes one inner rule and puts a translator at each border where it meets the outside.",
    ),
    t(
      "안쪽 약속은 Scene3D 문서가 못 박습니다. 미터, 오른손, 위는 Y, 앞은 −Z이고 다른 값이면 문서를 받지 않습니다. 경계 번역은 이렇습니다. Blender 내보내기는 Y-up 옵션을 켜고, Babylon.js는 오른손 모드를 강제하며(아니면 캡처 카메라가 예외를 던집니다), 웹캠의 화면 좌표는 y 부호를 뒤집고 깊이를 0.85배로 줄이고, VRM 0.x는 불러온 뒤 Y축으로 180° 돌립니다. OBJ·FBX의 옛 재질(Phong)은 반짝임 지수를 거칠기로 바꿔 PBR로 올립니다.",
      "The inner rule is pinned down by the Scene3D document: metres, right-handed, Y up, −Z forward, and a document with other values is refused. The border translations are these. The Blender export turns on the Y-up option, Babylon.js is forced into right-handed mode (otherwise the capture camera throws), the webcam's screen coordinates get their y sign flipped and depth scaled by 0.85, and VRM 0.x is turned 180° about Y after loading. Old OBJ and FBX materials (Phong) are upgraded to PBR by turning the shininess exponent into roughness.",
    ),
    t(
      "단위는 변환이 아니라 정규화로 다룹니다. 업로드한 모델은 가장 긴 변이 2m가 되도록 배율을 한 번 맞추는데, 코드 주석은 SketchUp이 대개 인치 단위 원본을 그대로 내보내 크기가 몇 mm에서 몇 km까지 널뛴다고 설명합니다. 직접 제작해 검수한 배경 세트는 미터 그대로 쓰도록 배율을 1로 두고, Hybrid DCC에서 보낼 때는 그 배율의 역수를 인스턴스에 미리 곱해 1m 큐브가 1m로 남게 합니다. 역수가 0.001~1000을 벗어나면 보내기를 거절합니다.",
      "Units are handled by normalizing, not converting. An uploaded model gets one scale so its longest side becomes 2 m, and a code comment explains that SketchUp often exports inch-based originals as they are, so sizes can swing from a few millimetres to kilometres. Background sets that were built and audited in metres keep a scale of 1, and a hand-off from Hybrid DCC pre-multiplies the instance by the inverse of that scale so a 1 m cube stays 1 m. If the inverse falls outside 0.001 to 1000, the hand-off is refused.",
    ),
    t(
      "번역이 맞았는지는 되돌려 보기로 확인합니다. 행렬을 위치·회전·크기로 풀었다가 다시 조립해 원래와 1e-6(상대) 안에서 같을 때만 받고, 기울임(shear)이 섞여 되돌릴 수 없으면 거절합니다. 카메라 기울기(±180°·−37°·0°·42°)는 8자리, 조명 방향은 11자리까지 왕복해도 같은지 테스트하고, 저장 문서는 직렬화→읽기→재직렬화가 글자 단위로 같아야 합니다. MToon 색 차이처럼 번역으로 메우지 못하는 격차도 있어 상태는 실험입니다.",
      "Whether a translation was right is checked by converting back. A matrix is split into position, rotation and scale and rebuilt, and is accepted only if it matches the original within 1e-6 (relative); a matrix with shear that cannot be restored is refused. Camera roll (±180°, −37°, 0°, 42°) is tested to 8 digits and light direction to 11 digits after a round trip, and a saved document must serialize, parse and serialize again to identical text. Some gaps, such as the MToon colour difference, cannot be closed by translation, so the status is experimental.",
    ),
  ],
  keyPoints: [
    t("안쪽 약속은 하나: 미터·오른손·Y 위·−Z 앞", "One inner rule: metres, right-handed, Y up, −Z forward"),
    t("경계마다 번역가를 두고, 업로드 소품은 긴 변을 2m로 맞춥니다", "A translator at each border; uploaded props get a 2 m longest side"),
    t("행렬은 풀었다 다시 조립해 보고, 안 맞으면 거절합니다", "A matrix is split and rebuilt, and refused if it does not match"),
    t("저장 문서는 직렬화→읽기→재직렬화가 같아야 통과합니다", "A saved document passes only if serialize-parse-serialize is identical"),
  ],
  diagram: {
    id: "coordinate-unit-roundtrip-diagram",
    kind: "layers",
    title: t("바깥은 제각각, 경계에서 번역하고, 안쪽은 하나의 약속", "The outside disagrees, borders translate, the inside keeps one rule"),
    caption: t(
      "위에서 아래로 읽습니다. 바깥에서 온 것은 경계에서 번역되어 하나의 약속이 되고, 그 약속을 쓰는 쪽은 되돌려 보며 확인합니다.",
      "Read from top to bottom. What arrives from outside is translated at the border into one rule, and the side that uses the rule keeps checking by converting back.",
    ),
    alt: t(
      "맨 위 계층은 Z 위와 Y 위, 인치와 밀리미터, 왼손과 오른손처럼 제각각인 바깥 세계입니다. 그 아래 경계 번역 계층에서 Y-up 내보내기, y 뒤집기, 2m 맞춤과 PBR 변환, 180도 회전, 역수 보정을 합니다. 그 아래에 미터, 오른손, Y 위, −Z 앞이라는 하나의 약속이 있고, 다시 그 아래에 약속을 쓰는 three.js, Babylon.js, Scene3D 문서가 있습니다. 맨 아래는 행렬, 각도, 문서를 되돌려 보는 확인 계층입니다.",
      "The top layer is the outside world that disagrees: Z up versus Y up, inches versus millimetres, left-handed versus right-handed. Below it, the border-translation layer does the Y-up export, y flip, 2 m fit with PBR upgrade, 180-degree turn and inverse compensation. Under that sits the one rule of metres, right-handed, Y up and −Z forward, then three.js, Babylon.js and the Scene3D document that use it. The bottom layer checks matrices, angles and documents by converting back.",
    ),
    layers: [
      {
        id: "outside",
        label: t("바깥 세계는 제각각", "The outside disagrees"),
        sub: t("Z 위·Y 위 · 인치·밀리미터 · 왼손·오른손 · 화면 y 아래", "Z or Y up, inches or mm, left or right hand, screen y down"),
        tone: "external",
        chips: ["Blender", "glTF", "VRM", "MediaPipe Tasks Vision"],
      },
      {
        id: "borders",
        label: t("경계마다 번역가", "A translator at each border"),
        sub: t("Y-up 내보내기 · y 뒤집기 · 2m 맞춤+PBR · 180° 회전 · 역수 보정", "Y-up export, y flip, 2 m fit and PBR, 180° turn, inverse scale"),
        tone: "warn",
      },
      {
        id: "rule",
        label: t("안쪽 약속은 하나", "One inner rule"),
        sub: t("미터 · 오른손 · Y 위 · −Z 앞 (Scene3D 문서가 강제)", "Metres, right-handed, Y up, −Z forward (enforced by Scene3D)"),
        tone: "good",
      },
      {
        id: "engines",
        label: t("약속을 쓰는 엔진·문서", "Engines using the rule"),
        sub: t("three.js 그대로 · Babylon.js 오른손 강제 · Scene3D 회전·렌즈 변환", "three.js as is, Babylon.js forced right-handed, Scene3D converts rotation and lens"),
        tone: "local",
        chips: ["Three.js", "Babylon.js"],
      },
      {
        id: "check",
        label: t("되돌려 보기", "Convert back to check"),
        sub: t("행렬 풀었다 조립 · 각도 왕복 · 문서 직렬화 왕복", "Split-and-rebuild matrices, angle round trips, document round trips"),
        tone: "neutral",
      },
    ],
    brackets: [
      { label: t("번역해서 들이는 쪽", "Translated on the way in"), layerIds: ["outside", "borders"] },
      { label: t("약속을 쓰고 확인하는 쪽", "Where the rule is used and checked"), layerIds: ["engines", "check"] },
    ],
  },
  usage: [
    {
      feature: t("3D Scene 문서 · 좌표계 계약과 투영", "3D Scene document · coordinate contract and projection"),
      role: t(
        "문서는 meter/right/Y/-Z 이외의 좌표계를 받지 않습니다. 배경 3D 문서를 투영할 때 Euler XYZ 회전을 쿼터니언으로, 화각을 24mm 세로 센서 기준 렌즈(mm)로 바꿉니다.",
        "The document accepts no coordinate system other than meter/right/Y/-Z. Projecting a background 3D document turns Euler XYZ rotation into a quaternion and the field of view into a lens (mm) on a 24 mm vertical sensor.",
      ),
      paths: [
        `${CREATOR_DIR}/scene3d/studio-scene3d-document.ts#assertStudioScene3dDocument`,
        `${CREATOR_DIR}/scene3d/studio-scene3d-bg3d-projection.ts#projectStudioBg3dDocumentToScene3d`,
        `${CREATOR_DIR}/bg3d/studio-bg3d-lens.ts`,
      ],
    },
    {
      feature: t("3D 배경 편집기 · 부모 바꾸기·물리·카메라·조명", "3D background editor · re-parenting, physics, camera and light"),
      role: t(
        "부모를 바꾸거나 물리 결과를 문서에 되쓸 때 행렬을 위치·회전·크기로 풀어 다시 조립해 확인합니다. 카메라 기울기와 조명 방향은 각도와 벡터 사이를 오갑니다.",
        "When re-parenting or writing physics results back into the document, a matrix is split into position, rotation and scale and rebuilt to check. Camera roll and light direction move between angles and vectors.",
      ),
      paths: [
        `${CREATOR_DIR}/bg3d/studio-bg3d-three-hierarchy.ts#decomposeStudioBg3dThreeLocalMatrix`,
        `${CREATOR_DIR}/bg3d/studio-bg3d-physics-three.ts`,
        `${CREATOR_DIR}/bg3d/studio-bg3d-camera-orientation.ts`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("모델 가져오기 · 크기·재질 정규화와 DCC 보내기", "Model import · size and material normalizing, DCC hand-off"),
      role: t(
        "업로드 모델은 긴 변을 2m로 맞추고, 배경 세트는 1배로 둡니다. OBJ·FBX의 Phong 재질은 PBR로 올립니다. Hybrid DCC에서 보낼 때는 배율의 역수를 곱해 원래 크기를 지킵니다.",
        "Uploaded models get a 2 m longest side while background sets keep scale 1. Phong materials from OBJ and FBX are upgraded to PBR. A hand-off from Hybrid DCC multiplies by the inverse scale to keep the authored size.",
      ),
      paths: [
        `${CREATOR_DIR}/bg3d/studio-bg3d-model-scale-contract.ts#computeStudioBg3dAutoFitScale`,
        `${CREATOR_DIR}/bg3d/studio-bg3d-model-runtime-admission.ts#resolveStudioBg3dModelNormalizationScale`,
        `${CREATOR_DIR}/bg3d/studio-bg3d-model-import.ts`,
        `${DCC_DIR}/studio-hybrid-dcc-bg3d-handoff.ts`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("캐릭터·엔진 경계 번역", "Character and engine border translation"),
      role: t(
        "VRM 0.x는 불러온 뒤 180° 돌리고, 웹캠 랜드마크는 y를 뒤집으며, Blender는 Y-up으로 내보내고, Babylon.js 캡처는 오른손 장면과 세로 화각 고정만 받습니다.",
        "VRM 0.x is turned 180° after loading, webcam landmarks get y flipped, Blender exports Y-up, and the Babylon.js capture accepts only a right-handed scene with a fixed vertical field of view.",
      ),
      paths: [
        `${CREATOR_DIR}/vrm/studio-vrm-asset-runtime.ts`,
        `${CREATOR_DIR}/vrm/studio-vrm-pose-solver.ts`,
        "tools/toonbridge/adapters/blender-export-glb.py",
        `${CREATOR_DIR}/bg3d/studio-bg3d-babylon-camera-projection.ts#createStudioBg3dBabylonCaptureCamera`,
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("행렬을 풀었다 다시 조립해 보고, 안 맞으면 거절하기", "Split a matrix, rebuild it, and refuse if it does not match"),
      language: "ts",
      code: `import { Euler, Matrix4, Quaternion, Vector3 } from "three";

const EPSILON = 1e-6;

/** 행렬을 위치·회전·크기로 풀고, 다시 조립한 결과가 원래와 같을 때만 돌려준다. */
export function toTrs(matrix: Matrix4) {
  if (Math.abs(matrix.determinant()) < 1e-12) return null; // 납작하게 눌린 행렬
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  const again = new Matrix4().compose(position, quaternion, scale); // 되돌려 조립
  const magnitude = Math.max(1, ...matrix.elements.map((value) => Math.abs(value)));
  const worst = matrix.elements.reduce((max, value, i) => Math.max(max, Math.abs(value - again.elements[i]!)), 0);
  // 기울임(shear)이 있으면 위치·회전·크기만으로는 못 되돌리므로 거절한다
  if (!(worst <= magnitude * EPSILON)) return null;
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z],
  };
}`,
      codeEn: `import { Euler, Matrix4, Quaternion, Vector3 } from "three";

const EPSILON = 1e-6;

/** Split a matrix into position, rotation and scale, and return it only if the rebuilt matrix matches. */
export function toTrs(matrix: Matrix4) {
  if (Math.abs(matrix.determinant()) < 1e-12) return null; // a matrix squashed flat
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  const again = new Matrix4().compose(position, quaternion, scale); // rebuild it
  const magnitude = Math.max(1, ...matrix.elements.map((value) => Math.abs(value)));
  const worst = matrix.elements.reduce((max, value, i) => Math.max(max, Math.abs(value - again.elements[i]!)), 0);
  // With shear, position, rotation and scale alone cannot restore it, so refuse
  if (!(worst <= magnitude * EPSILON)) return null;
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z],
  };
}`,
      explain: t(
        "문서는 위치·회전(Euler XYZ)·크기만 저장하므로, 그 세 값으로 되돌릴 수 없는 행렬은 저장하면 다음에 불러올 때 물체가 튑니다. 실제 코드(decomposeStudioBg3dThreeLocalMatrix)는 같은 검사를 하고, 기울임이 든 행렬에는 null을 돌려줍니다.",
        "The document stores only position, rotation (Euler XYZ) and scale, so a matrix those three values cannot restore would make the object jump the next time it is loaded. The real code (decomposeStudioBg3dThreeLocalMatrix) runs the same check and returns null for a matrix with shear.",
      ),
      source: `${CREATOR_DIR}/bg3d/studio-bg3d-three-hierarchy.ts`,
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("로더의 2m 맞춤과 보내는 쪽의 역수 보정이 정확히 상쇄되기", "The loader's 2 m fit and the sender's inverse compensation cancel exactly"),
      language: "ts",
      code: `const AUTO_FIT_TARGET = 2; // 미터

/** 가져온 모델의 가장 긴 변이 2가 되도록 로더가 곱하는 배율. 이상한 값이면 1. */
export function autoFitScale(size: readonly [number, number, number]): number {
  const longest = Math.max(...size.map((value) => Math.abs(value)));
  return Number.isFinite(longest) && longest > 0 ? AUTO_FIT_TARGET / longest : 1;
}

/** 원래 크기를 지키려면 인스턴스 배율에 그 역수를 미리 곱해 둔다. 범위를 벗어나면 보내지 않는다. */
export function compensatedScale(size: readonly [number, number, number], authored: number): number {
  const scale = authored / autoFitScale(size);
  if (scale < 0.001 || scale > 1_000) throw new Error("scale budget exceeded");
  return scale;
}

// 1m 큐브: 로더가 ×2 를 곱하고 인스턴스가 ÷2 를 들고 있어 결국 1m 가 된다
const cube = [1, 1, 1] as const;
export const finalSize = autoFitScale(cube) * compensatedScale(cube, 1); // 1
// 인치로 만든 100칸짜리 모델은 로더가 0.02배로 줄여 2m 로 맞춘다
export const inchModelScale = autoFitScale([100, 40, 60]); // 0.02`,
      codeEn: `const AUTO_FIT_TARGET = 2; // metres

/** The scale the loader applies so the model's longest side becomes 2. Returns 1 for odd values. */
export function autoFitScale(size: readonly [number, number, number]): number {
  const longest = Math.max(...size.map((value) => Math.abs(value)));
  return Number.isFinite(longest) && longest > 0 ? AUTO_FIT_TARGET / longest : 1;
}

/** To keep the authored size, pre-multiply the instance scale by the inverse. Out of range means no hand-off. */
export function compensatedScale(size: readonly [number, number, number], authored: number): number {
  const scale = authored / autoFitScale(size);
  if (scale < 0.001 || scale > 1_000) throw new Error("scale budget exceeded");
  return scale;
}

// A 1 m cube: the loader multiplies by 2 and the instance holds a 1/2, so it ends up 1 m
const cube = [1, 1, 1] as const;
export const finalSize = autoFitScale(cube) * compensatedScale(cube, 1); // 1
// A model built 100 units long in inches is scaled by 0.02 to fit 2 m
export const inchModelScale = autoFitScale([100, 40, 60]); // 0.02`,
      explain: t(
        "정규화(로더)와 보정(보내는 쪽)이 서로의 역수라서 곱하면 1이 되는 것이 핵심입니다. 실제 보내기 코드는 위치가 1만 미만인지, 회전을 −π~π로 정리했는지도 함께 확인합니다.",
        "The point is that normalization (the loader) and compensation (the sender) are each other's inverse, so they multiply to 1. The real hand-off code also checks that positions stay below 10,000 and folds rotations into −π to π.",
      ),
      source: `${DCC_DIR}/studio-hybrid-dcc-bg3d-handoff.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "glTF 2.0 Specification · Coordinate system and units",
      url: "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html",
      kind: "spec",
      note: t("미터, 오른손, Y 위쪽 약속의 원문", "The source of the metres, right-handed, Y-up convention"),
    },
    {
      title: "three.js · Matrix4",
      url: "https://threejs.org/docs/pages/Matrix4.html",
      kind: "docs",
      note: t("decompose·compose로 행렬을 풀고 조립", "Split and rebuild a matrix with decompose and compose"),
    },
    {
      title: "Babylon.js Documentation",
      url: "https://doc.babylonjs.com/",
      kind: "docs",
      note: t("scene.useRightHandedSystem 같은 장면 설정", "Scene settings such as scene.useRightHandedSystem"),
    },
    {
      title: "Blender Python API · export_scene",
      url: "https://docs.blender.org/api/current/bpy.ops.export_scene.html",
      kind: "docs",
      note: t("glTF 내보내기의 +Y Up 옵션(export_yup)", "The +Y Up option of the glTF export (export_yup)"),
    },
    {
      title: "VRM Specification",
      url: "https://github.com/vrm-c/vrm-specification",
      kind: "spec",
      note: t("VRM 0.x와 1.0 규격 원문", "The VRM 0.x and 1.0 specifications"),
    },
  ],
  chapterIds: ["web-3d-engine", "quality"],
  talk: {
    pitch: t(
      "3D에서 가장 흔한 사고는 모델이 눕거나, 뒤집히거나, 너무 작거나 큰 채로 도착하는 것입니다. 원인은 프로그램마다 위쪽 축과 길이 단위가 다르기 때문입니다. ToonStudio는 안쪽 약속을 하나 정하고, 경계마다 번역한 뒤, 풀었다 다시 조립해 보는 식으로 되돌려 확인합니다. 맞지 않으면 조용히 고치지 않고 거절합니다.",
      "The most common 3D accident is a model arriving lying down, flipped, or far too small or large. The cause is that programs differ on the up axis and the unit of length. ToonStudio fixes one inner rule, translates at each border, and checks by converting back, for example by splitting a matrix and rebuilding it. When something does not match it refuses rather than quietly patching.",
    ),
    analogy: t(
      "여행할 때 환전소와 통역이 필요한 것과 같습니다. 환전한 돈을 다시 바꿔 보면 원래 금액이 나와야 제대로 바꾼 것입니다.",
      "Like travelling with a money changer and an interpreter: if you change the money back and get your original amount, the exchange was done right.",
    ),
    questions: [
      {
        question: t("왜 단위를 변환하지 않고 2m로 맞추나요?", "Why fit to 2 m instead of converting units?"),
        answer: t(
          "업로드 파일은 어떤 단위로 만들었는지 믿을 수 없기 때문입니다. 코드 주석은 SketchUp이 인치 원본을 그대로 내보내는 경우를 예로 듭니다. 대신 실제 크기를 지켜야 하는 Hybrid DCC 보내기에는 역수 보정을 따로 둡니다.",
          "Because there is no way to trust what unit an uploaded file was built in; a code comment gives SketchUp exporting inch-based originals as is. Where the real size must be kept, such as a Hybrid DCC hand-off, a separate inverse compensation exists.",
        ),
      },
      {
        question: t("되돌려 보기가 왜 필요한가요?", "Why check by converting back?"),
        answer: t(
          "변환이 맞았는지 가장 싸게 확인하는 방법이 반대로 한 번 더 바꿔 원래가 나오는지 보는 것이기 때문입니다. 위치·회전·크기로 못 되돌리는 행렬을 그냥 저장하면 다음에 불러올 때 물체가 튄다고 코드가 설명합니다.",
          "Because the cheapest check that a conversion was right is to convert once more in reverse and see the original. The code explains that storing a matrix that position, rotation and scale cannot restore would make the object jump on the next load.",
        ),
      },
      {
        question: t("Babylon.js는 왜 오른손을 강제하나요?", "Why force Babylon.js into right-handed mode?"),
        answer: t(
          "같은 문서가 three.js와 똑같이 보여야 하기 때문입니다. 장면이 오른손이 아니면 캡처 카메라가 지원하지 않는 투영이라며 예외를 던집니다.",
          "Because the same document must look identical to three.js. If the scene is not right-handed, the capture camera throws, calling the projection unsupported.",
        ),
      },
    ],
    pitfall: t(
      "'모든 변환이 왕복 검증된다'고 말하지 마세요. 위의 왕복은 각각 단위 테스트가 확인한 것이고, 파일 단위 왕복은 실제 Blender 산출물이 있어야 도는 스크립트에 있어 실행 이력을 확인하지 못했습니다. 2m 맞춤은 크기를 보존하는 변환이 아니라 정규화이고, CAD 쪽 질량 단위는 'model-unit'이라 미터로 단정할 수 없습니다.",
      "Do not say every conversion is round-trip verified. Each round trip above is covered by a unit test, and the file-level round trip lives in a script that needs real Blender output, so I could not confirm a run history. The 2 m fit is normalization, not size-preserving conversion, and the CAD mass unit is 'model-unit', so metres cannot be assumed there.",
    ),
  },
  technologies: ["GLB / glTF", "Three.js", "Babylon.js", "Blender bpy", "VRM", "MediaPipe Tasks Vision", "PBR"],
  facts: [
    { value: "meter / right / Y / −Z", label: t("Scene3D 문서가 허용하는 유일한 좌표계", "The only coordinate system the Scene3D document accepts"), source: `${CREATOR_DIR}/scene3d/studio-scene3d-document.ts` },
    { value: "2 m", label: t("업로드 모델의 가장 긴 변을 맞추는 기준 길이", "The length an uploaded model's longest side is fitted to"), source: `${CREATOR_DIR}/bg3d/studio-bg3d-model-scale-contract.ts` },
    { value: "0.001 ~ 1000", label: t("DCC 보내기에서 역수 보정 배율이 허용되는 범위", "Range allowed for the inverse-compensated scale in a DCC hand-off"), source: `${DCC_DIR}/studio-hybrid-dcc-bg3d-handoff.ts` },
    { value: "24 mm", label: t("초점거리↔화각 환산에 쓰는 세로 센서 높이", "Vertical sensor height used to convert focal length and field of view"), source: `${CREATOR_DIR}/bg3d/studio-bg3d-lens.ts` },
  ],
  reviewedAt: "2026-10-07",
};

/** three-d 카테고리의 "도형 계산" 카드 묶음. */
export const THREE_D_GEOMETRY_CARDS: readonly EngineeringAtlasEntry[] = [OPENCASCADE_MANIFOLD_PRECISION, COORDINATE_UNIT_ROUNDTRIP];
