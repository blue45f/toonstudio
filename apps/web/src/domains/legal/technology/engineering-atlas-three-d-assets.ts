import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · three-d 카테고리 중 "3D 자산이 만들어지고 들어오는 길" 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const LIFT_DIR = "apps/web/src/domains/creator/lift3d";

export const LIFT_2D_TO_3D: EngineeringAtlasEntry = {
  id: "lift-2d-to-3d",
  category: "three-d",
  name: "Lift 3D",
  title: t("그림 한 장을 규칙으로 입체로 세웁니다", "Standing one drawing up as 3D, by rules"),
  status: "live",
  tagline: t(
    "원화 한 장에서 AI 없이, 같은 입력이면 같은 결과가 나오는 3D 모델(GLB)을 만듭니다.",
    "Builds a 3D model (GLB) from one drawing with no AI: the same input always gives the same output.",
  ),
  background: [
    t(
      "그림 한 장은 납작한 종이 인형과 같습니다. 이 기능은 종이 인형의 윤곽을 따라 앞뒤로 살짝 부풀려, 돌려 볼 수 있는 풍선 인형으로 만들어 줍니다. 캐릭터는 윤곽에서 멀수록 두껍게, 배경은 밝은 곳을 앞으로 내밀어 부조(조각을 얕게 튀어나오게 새긴 것)처럼 세웁니다. 만화가는 이 3D 세트 위에서 카메라를 옮기며 컷마다 구도를 잡을 수 있습니다.",
      "A single drawing is like a flat paper doll. This feature follows the doll's outline and puffs it out slightly front and back, like a balloon doll you can turn around. Characters get thicker the farther they are from the outline, while backgrounds push bright areas forward like a relief carving (a shallow sculpture). An artist can then move a camera around the 3D set to frame each panel.",
    ),
    t(
      "동작은 다섯 단계입니다. ① 그림을 작은 격자(기본 160칸 안팎)로 줄이고 ② 피사체와 배경을 가르는 마스크를 만들고 ③ 윤곽에서의 거리나 밝기로 높이 지도를 만들고 ④ 앞면·뒷면·옆벽이 있는 닫힌 메시로 엮은 뒤 ⑤ 텍스처가 붙은 GLB 파일로 굳힙니다. 모든 단계가 순수 계산이라 같은 그림·같은 설정이면 같은 해시(지문)가 나오고, 변환 코드에는 네트워크 호출이 없어 원본 그림이 서버로 나가지 않습니다.",
      "It works in five steps: (1) shrink the drawing onto a small grid (about 160 cells by default); (2) build a mask that separates subject from background; (3) turn distance from the outline, or brightness, into a height map; (4) weave it into a closed mesh with a front shell, a back shell and side walls; (5) bake it into a textured GLB file. Every step is plain computation, so the same drawing and settings give the same hash (fingerprint), and the conversion code makes no network calls, so the source art never leaves the browser.",
    ),
    t(
      "대안은 AI 깊이 추정이나 이미지→3D 생성 모델입니다. 그럴듯한 뒷면을 상상해 주지만 결과가 매번 달라지고, GPU·서버 비용이 들며, 원화가 외부로 나갈 수 있습니다. ToonStudio는 재현성·오프라인 동작·비용 0을 우선해 규칙 기반을 골랐습니다. 대신 정면 밖의 형태는 어디까지나 추정이라고 화면에서도 안내합니다. lift3d 코드에는 ML 모델 호출이 없습니다.",
      "The alternatives are AI depth estimation or image-to-3D generators. They imagine a plausible back side, but results vary from run to run, cost GPU or server time, and may send artwork off the device. ToonStudio chose rules for reproducibility, offline use and zero marginal cost, and says plainly that anything beyond the front view is an estimate. The lift3d code makes no ML model calls.",
    ),
    t(
      "교훈이 된 버그가 있습니다. 얇은 팔·꼬리에서 앞뒤 껍질이 정점을 공유하면 모서리 하나에 면이 네 번 쓰이는 비다양체(잘못된 구조)가 되는데, 열린 변은 0이라 '닫힌 solid'로 보고되던 문제였습니다. 그래서 지금은 '열린 변 0'과 '위상 오류 0'을 둘 다 만족할 때만 closed로 보고합니다. 좌우대칭 보정도 확신도 0.82 미만이면 걸지 않고 경고합니다.",
      "One bug shaped the design. On thin arms or tails the front and back shells shared vertices, so one edge was used by four faces (a non-manifold, invalid structure) while the open-edge count stayed at zero and the mesh was reported as a closed solid. Now closed is reported only when open edges are zero and topology errors are zero. Symmetry correction is likewise skipped, with a warning, when confidence is below 0.82.",
    ),
  ],
  keyPoints: [
    t("AI 없이 규칙으로: 같은 입력, 같은 해시", "Rules, not AI: same input, same hash"),
    t("캐릭터·소품은 닫힌 입체, 배경은 부조·시차 카드", "Closed solids for characters and props; relief or parallax cards for sets"),
    t("닫힘은 '열린 변 0'과 '위상 오류 0'을 모두 만족할 때만", "Closed means zero open edges and zero topology errors"),
    t("결과는 GLB로 받거나 배경 라이브러리에 바로 등록", "Download the GLB or register it straight into the background library"),
  ],
  diagram: {
    id: "lift-2d-to-3d-diagram",
    kind: "graph",
    title: t("그림 한 장이 GLB가 되기까지", "From one drawing to a GLB"),
    caption: t(
      "모든 단계가 브라우저 안의 순수 계산이라 같은 그림이면 같은 파일이 나옵니다.",
      "Every step is pure computation in the browser, so the same drawing yields the same file.",
    ),
    alt: t(
      "원화 PNG가 작업 격자로 줄고, 마스크와 높이 지도를 거쳐 좌우대칭 확인을 지나 닫힌 메시가 됩니다. 메시는 GLB로 직렬화되고, 검증을 거쳐 모델 라이브러리에 등록됩니다.",
      "A source PNG is reduced to a work grid, passes through a mask and a height map, and then a symmetry check before becoming a closed mesh. The mesh is serialized to GLB, verified, and registered in the model library.",
    ),
    nodes: [
      { id: "art", label: t("원화 PNG", "Source PNG"), sub: t("배경 제거 권장", "Cut-out preferred"), tone: "local", shape: "pill", at: [0, 0] },
      { id: "grid", label: t("작업 격자", "Work grid"), sub: t("알파 가중 리샘플", "Alpha-weighted resample"), tone: "local", at: [1, 0] },
      { id: "mask", label: t("마스크", "Mask"), sub: t("alpha·key·full", "alpha, key, full"), tone: "local", at: [2, 0] },
      { id: "depth", label: t("높이 지도", "Height map"), sub: t("거리장 또는 명암", "Distance field or shading"), tone: "local", at: [3, 0] },
      { id: "sym", label: t("대칭 ≥ 0.82?", "Symmetry ≥ 0.82?"), tone: "warn", shape: "diamond", at: [4, 0] },
      { id: "mesh", label: t("닫힌 메시", "Closed mesh"), sub: t("앞·뒤·옆벽", "Front, back, walls"), tone: "local", at: [5, 0] },
      { id: "glb", label: t("GLB 파일", "GLB file"), sub: t("텍스처 포함", "With texture"), tone: "good", shape: "cylinder", at: [5, 1] },
      { id: "library", label: t("모델 라이브러리", "Model library"), sub: t("안전 검사 후 등록", "Registered after checks"), tone: "local", shape: "cylinder", at: [4, 1] },
    ],
    edges: [
      { from: "art", to: "grid", label: t("리샘플", "resample") },
      { from: "grid", to: "mask", label: t("배경 분리", "split") },
      { from: "mask", to: "depth", label: t("높이 계산", "heights") },
      { from: "depth", to: "sym", label: t("축 찾기", "find axis") },
      { from: "sym", to: "mesh", label: t("보정 또는 생략", "apply or skip") },
      { from: "mesh", to: "glb", label: t("직렬화", "serialize") },
      { from: "glb", to: "library", label: t("검증 후 등록", "verify, add") },
    ],
    groups: [
      {
        id: "browser",
        label: t("브라우저 안에서만 처리", "Browser only"),
        tone: "local",
        nodeIds: ["art", "grid", "mask", "depth", "sym", "mesh", "glb", "library"],
      },
    ],
  },
  usage: [
    {
      feature: t("2D → 3D 변환 페이지", "2D to 3D conversion page"),
      role: t(
        "원화를 올리면 캐릭터·소품·배경 프리셋으로 3D를 만들고 미리 돌려 본 뒤 GLB로 내려받습니다.",
        "Takes an uploaded drawing, builds 3D with character, prop or background presets, lets you orbit a preview, and downloads a GLB.",
      ),
      paths: [
        `${LIFT_DIR}/studio-lift3d-pipeline.ts#liftStudioImageTo3d`,
        `${LIFT_DIR}/studio-lift3d-depth.ts#studioLift3dDistanceField`,
        `${LIFT_DIR}/studio-lift3d-mesh.ts`,
        `${LIFT_DIR}/StudioLift3dPage.tsx`,
      ],
      route: "/studio/lift3d",
    },
    {
      feature: t("3D 배경 편집기 · 모델 라이브러리", "3D background editor · model library"),
      role: t(
        "결과 GLB를 다시 올리지 않고 라이브러리의 검증된 등록 경계로 넘겨, 업로드한 모델과 같은 안전 검사를 받게 합니다.",
        "Hands the result GLB to the library's verified registration boundary without a re-upload, so it gets the same safety checks as an uploaded model.",
      ),
      paths: [
        `${LIFT_DIR}/studio-lift3d-library-handoff.ts`,
        "apps/web/src/domains/creator/bg3d/bg3d-model-library.ts",
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("GLB 직렬화", "GLB serialization"),
      role: t(
        "새 직렬화기를 만들지 않고 VRM 내보내기가 쓰는 순수 GLB writer를 그대로 써서, 이 앱의 가져오기 한도와 같은 기준을 지킵니다.",
        "Reuses the pure GLB writer behind VRM export instead of writing a new one, so output meets the same limits as the app's own import gate.",
      ),
      paths: [`${LIFT_DIR}/studio-lift3d-glb.ts`, "apps/web/src/domains/creator/vrm/studio-vrm-export-glb-container.ts"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("윤곽에서 얼마나 먼가: 3-4 거리 변환 + 원형 단면", "How far from the outline: 3-4 distance transform + round profile"),
      language: "ts",
      code: `// 3-4 chamfer: 두 번 훑어 "윤곽까지 거리"를 센다 (직선 3, 대각선 4)
export function distanceField(mask: Uint8Array, w: number, h: number): Float64Array {
  const d = Int32Array.from(mask, (m) => (m ? (w + h) * 4 : 0)); // 피사체=먼 값, 배경=0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]!);
  const relax = (x: number, y: number, steps: readonly (readonly [number, number, number])[]) => {
    for (const [dx, dy, cost] of steps) d[y * w + x] = Math.min(d[y * w + x]!, at(x + dx, y + dy) + cost);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) relax(x, y, [[-1, -1, 4], [0, -1, 3], [1, -1, 4], [-1, 0, 3]]); // 앞으로
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) relax(x, y, [[1, 1, 4], [0, 1, 3], [-1, 1, 4], [1, 0, 3]]); // 뒤로
  }
  return Float64Array.from(d, (v) => v / 3); // 3을 한 칸으로 환산
}

// 원형 단면: 윤곽(t=0)에서 접선이 수직이라 옆에서 봐도 납작하지 않다
export const roundProfile = (t: number) => Math.sqrt(Math.max(0, 2 * t - t * t));`,
      codeEn: `// 3-4 chamfer: two sweeps count "distance to the outline" (straight 3, diagonal 4)
export function distanceField(mask: Uint8Array, w: number, h: number): Float64Array {
  const d = Int32Array.from(mask, (m) => (m ? (w + h) * 4 : 0)); // subject = far value, background = 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]!);
  const relax = (x: number, y: number, steps: readonly (readonly [number, number, number])[]) => {
    for (const [dx, dy, cost] of steps) d[y * w + x] = Math.min(d[y * w + x]!, at(x + dx, y + dy) + cost);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) relax(x, y, [[-1, -1, 4], [0, -1, 3], [1, -1, 4], [-1, 0, 3]]); // forward
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) relax(x, y, [[1, 1, 4], [0, 1, 3], [-1, 1, 4], [1, 0, 3]]); // backward
  }
  return Float64Array.from(d, (v) => v / 3); // convert units of 3 into one cell
}

// Round profile: the tangent is vertical at the outline (t=0), so it is not flat from the side
export const roundProfile = (t: number) => Math.sqrt(Math.max(0, 2 * t - t * t));`,
      explain: t(
        "마스크 안쪽 칸마다 '윤곽까지 거리'를 구한 뒤, 거리를 0~1로 맞춘 t에 원형 단면 √(2t−t²)를 씌우면 가장자리는 얇고 중심은 두툼한 풍선 모양 높이가 됩니다. 실제 코드는 여기에 라플라시안 평활을 더해 능선을 지웁니다.",
        "For each cell inside the mask it computes the distance to the outline; applying √(2t−t²) to the distance normalized to 0..1 gives thin edges and a thick center, like a balloon. The real code adds Laplacian smoothing to erase ridge artifacts.",
      ),
      source: `${LIFT_DIR}/studio-lift3d-depth.ts`,
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("'닫힘'을 두 조건으로 판정하기", "Judging \"closed\" with two conditions"),
      language: "ts",
      code: `interface MeshStats {
  boundaryEdgeCount: number; // 한쪽 면만 가진 변(구멍)
}

/** 위상 진단: 비다양체 변·나비 정점처럼 error 등급인 항목 수 */
export function countTopologyErrors(severities: readonly ("error" | "warning")[]): number {
  return severities.filter((s) => s === "error").length;
}

/** 열린 변이 0이어도 위상 오류가 남을 수 있다. 둘 다 0일 때만 '닫힌 solid'라고 보고한다. */
export function isClosedSolid(stats: MeshStats, topologyErrors: number): boolean {
  return stats.boundaryEdgeCount === 0 && topologyErrors === 0;
}`,
      codeEn: `interface MeshStats {
  boundaryEdgeCount: number; // edges used by only one face (holes)
}

/** Topology diagnostics: how many items are error grade, such as non-manifold edges or butterfly vertices */
export function countTopologyErrors(severities: readonly ("error" | "warning")[]): number {
  return severities.filter((s) => s === "error").length;
}

/** Zero open edges can still hide topology errors. Report a closed solid only when both are zero. */
export function isClosedSolid(stats: MeshStats, topologyErrors: number): boolean {
  return stats.boundaryEdgeCount === 0 && topologyErrors === 0;
}`,
      explain: t(
        "예전에는 열린 변 개수만 보고 닫힘을 선언했습니다. 얇은 부위에서 면이 겹쳐 붙은 메시도 열린 변은 0이라 통과했고, 나중에 불리언이 조용히 깨졌습니다. 성공 지표를 둘로 쪼갠 이유입니다.",
        "It used to declare closure from the open-edge count alone. A mesh whose faces overlapped on thin parts still had zero open edges and passed, and booleans broke silently later. That is why the success metric was split in two.",
      ),
      source: `${LIFT_DIR}/studio-lift3d-pipeline.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "Khronos · glTF 2.0 Specification",
      url: "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html",
      kind: "spec",
      note: t("GLB 컨테이너와 좌표계(미터·Y-up) 규약", "The GLB container and the metre, Y-up conventions"),
    },
    {
      title: "Khronos · KHR_materials_unlit",
      url: "https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_unlit",
      kind: "spec",
      note: t("조명 없이 원화 색 그대로 보이게 하는 확장", "The extension that shows artwork colors with no lighting"),
    },
    {
      title: "OpenCV · Distance Transform tutorial",
      url: "https://docs.opencv.org/4.x/d2/dbd/tutorial_distance_transform.html",
      kind: "guide",
      note: t("거리 변환이 무엇인지 그림으로 설명", "A visual explanation of distance transforms"),
    },
  ],
  chapterIds: ["web-3d-engine", "browser-local-compute"],
  talk: {
    pitch: t(
      "그림 한 장을 올리면 AI 없이 규칙만으로 돌려 볼 수 있는 3D 모델이 나옵니다. 캐릭터는 윤곽에서 멀수록 두껍게 부풀리고, 배경은 밝은 곳을 앞으로 내밀어 부조로 세웁니다. 같은 그림이면 매번 같은 파일이 나오고 원본은 서버로 나가지 않습니다. 정면 밖의 형태는 추정이라는 한계도 함께 말씀드립니다.",
      "Upload one drawing and rules alone, with no AI, turn it into a 3D model you can rotate. Characters are puffed out thicker the farther they are from the outline, and backgrounds push bright areas forward as a relief. The same drawing always gives the same file, and the original never leaves the browser. I will also be upfront that anything beyond the front view is an estimate.",
    ),
    analogy: t(
      "종이 인형을 풍선처럼 살짝 부풀린 것입니다. 가장자리는 얇고 한가운데가 통통합니다.",
      "It is a paper doll gently inflated like a balloon: thin at the edge, plump in the middle.",
    ),
    questions: [
      {
        question: t("AI 3D 생성과 무엇이 다른가요?", "How is this different from AI 3D generation?"),
        answer: t(
          "AI가 뒷모습을 상상하는 대신 윤곽 거리와 밝기로 두께를 계산합니다. 그래서 결과가 재현되고(같은 해시) 비용과 외부 전송이 없습니다. 대신 뒷면은 추정 두께입니다.",
          "Instead of an AI imagining the back, thickness is computed from outline distance and brightness. Results are reproducible (same hash) with no cost or upload, but the back side is only an estimated thickness.",
        ),
      },
      {
        question: t("옆모습이나 뒷모습은 어떻게 되나요?", "What about side and back views?"),
        answer: t(
          "원화에 없는 정보라 두께 프로파일로 추정합니다. 정확한 복원은 여러 방향의 그림(턴어라운드)이 필요한데, 설계 문서가 다음 과제로 적어 두었고 아직 구현하지 않았습니다.",
          "That information is not in the drawing, so thickness is estimated from a profile. Accurate recovery needs several views (a turnaround sheet); the design doc lists it as future work and it is not built yet.",
        ),
      },
      {
        question: t("왜 '닫힌 solid'를 따로 검사하나요?", "Why check for a closed solid separately?"),
        answer: t(
          "열린 변이 0이어도 한 모서리에 면이 넷 붙는 구조가 남으면 불리언·서브디비전이 조용히 깨집니다. 위상 오류까지 센 뒤에 닫힘을 보고합니다.",
          "Even with zero open edges, a structure where four faces meet at one edge silently breaks booleans and subdivision, so topology errors are counted before closure is reported.",
        ),
      },
    ],
    pitfall: t(
      "'AI 3D 변환'으로 소개하지 마세요. 정면 밖 형태는 추정이고 다중 뷰 복원은 미구현입니다. 결과 품질은 원화(배경을 지운 PNG 권장)에 크게 좌우됩니다.",
      "Do not call it \"AI 3D conversion\". Anything beyond the front view is an estimate and multi-view reconstruction is not built. Quality depends heavily on the artwork; a background-removed PNG is recommended.",
    ),
  },
  technologies: ["GLB / glTF", "Three.js", "SHA-256", "KHR_materials_unlit"],
  facts: [
    { value: "248", label: t("작업 격자 한 변 최대 칸 수(편집 메시 예산에서 역산)", "Largest work-grid side in cells, derived from the editable-mesh budget"), source: `${LIFT_DIR}/studio-lift3d-contract.ts` },
    { value: "0.82", label: t("대칭 보정을 거는 최소 확신도", "Minimum confidence to apply symmetry correction"), source: `${LIFT_DIR}/studio-lift3d-symmetry.ts` },
    { value: "24", label: t("시차 카드로 자를 수 있는 깊이 밴드 최대 수", "Maximum depth bands for parallax cards"), source: `${LIFT_DIR}/studio-lift3d-depth.ts` },
  ],
  reviewedAt: "2026-10-07",
};

const BG3D_DIR = "apps/web/src/domains/creator/bg3d";
const SPECIALIST_DIR = "apps/web/src/domains/creator/scene3d/specialists";

export const GLB_OPTIMIZATION_PIPELINE: EngineeringAtlasEntry = {
  id: "glb-optimization-pipeline",
  category: "three-d",
  name: "glTF / GLB",
  title: t("낯선 3D 파일을 검증된 GLB 하나로 들이고, 가볍게 내보내는 길", "Bringing strange 3D files in as one verified GLB, and sending light ones out"),
  status: "live",
  tagline: t(
    "9가지 형식을 하나의 GLB로 정규화해 검사한 뒤 쓰고, 압축·LOD·KTX2는 원본을 둔 파생물로만 만듭니다.",
    "Nine formats are normalized into one GLB and checked first; compression, LOD and KTX2 only ever make derivatives.",
  ),
  background: [
    t(
      "3D 파일은 이삿짐 상자와 같습니다. 상자(파일 형식)가 제각각이면 풀 때마다 방식이 달라지고, 낯선 상자에는 무엇이 들었는지 알 수 없습니다. GLB는 모델·재질·텍스처를 한 상자에 담는 표준 형식(glTF의 바이너리판)입니다. ToonStudio는 .glb·.gltf·.obj·.fbx·.dae·.stl·.ply·.3ds·.skp 아홉 형식을 받아 모두 자체 포함 GLB 한 개로 바꾼 뒤, 렌더러가 보기 전에 크기·구조·확장 목록을 검사하고서야 라이브러리에 넣습니다.",
      "A 3D file is like a moving box. If boxes come in every shape, unpacking differs each time, and you cannot tell what a strange box holds. GLB is a standard format (the binary form of glTF) that packs model, materials and textures into one box. ToonStudio accepts nine formats (.glb, .gltf, .obj, .fbx, .dae, .stl, .ply, .3ds, .skp), turns each into one self-contained GLB, and checks size, structure and extension list before the renderer sees it and before it enters the library.",
    ),
    t(
      "순서는 이렇습니다. ① 선택한 파일과 동반 파일(.bin·.mtl·텍스처)을 안전한 상대 경로로만 해석하고(상위 경로나 외부 주소는 거부) ② 파서에 넘기기 전에 선언된 노드·메시·정점·삼각형 수를 검사하며 ③ Worker에서 파싱한 뒤 한도(노드 2,048·정점 4,000,000·삼각형 2,000,000 등)를 다시 검사하고 ④ GLB로 쓰고 ⑤ 별도 검증기가 100MiB·JSON 4MiB·모바일/데스크톱 예산·필수 확장 허용 목록을 확인합니다. .skp는 브라우저 안의 openskp(MIT)로 GLB로 바꾼 뒤 같은 길에 합류합니다.",
      "The order is: (1) resolve the chosen file and its companions (.bin, .mtl, textures) only through safe relative paths, rejecting parent paths and external addresses; (2) check declared node, mesh, vertex and triangle counts before handing to a parser; (3) parse in a Worker, then check the limits again (2,048 nodes, 4,000,000 vertices, 2,000,000 triangles and so on); (4) write the GLB; (5) a separate validator checks 100 MiB, 4 MiB of JSON, the mobile or desktop budget and the required-extension allowlist. A .skp is converted to GLB in the browser with openskp (MIT) and joins the same path.",
    ),
    t(
      "압축은 '지원'과 '실제 출하'를 구분해야 합니다. 메시 압축(meshopt)은 디코더를 지연 로드해 읽을 수 있고, 번들 환경 GLB 31개 중 Tripo로 만든 10개는 glTF-Transform으로 meshopt와 WebP 텍스처를 적용했으며 나머지 21개는 PNG 텍스처에 meshopt를 쓰지 않습니다. KTX2(GPU용 압축 텍스처)는 읽는 런타임(변환기 실행 코드를 SHA-256으로 고정·증명)과 만드는 도구(ktx2-encoder)까지 있지만, apps/web/public 아래 독립 .ktx2 파일은 0개입니다. Draco는 지원하지 않고 가져올 때 거부합니다.",
      "Compression needs 'supported' kept apart from 'actually shipped'. Mesh compression (meshopt) can be read through a lazily loaded decoder; of the 31 bundled environment GLBs, the 10 made with Tripo were optimized with glTF-Transform using meshopt and WebP textures, while the other 21 use PNG textures without meshopt. KTX2 (a GPU-compressed texture) has a reading runtime (the transcoder's executable code pinned and attested by SHA-256) and a writing tool (ktx2-encoder), yet there are 0 standalone .ktx2 files under apps/web/public. Draco is not supported and is rejected on import.",
    ),
    t(
      "내보내는 쪽은 Scene3D 전문가 도구가 맡습니다. GLB 한 개를 받아 압축·LOD 3단계·탄젠트·KTX2 변환 같은 파생물을 만들되 원본은 건드리지 않고, 만든 파일을 다시 열어 검증한 뒤 SHA-256 영수증과 함께 돌려줍니다. 작업 1건당 Worker 1개를 띄우고 취소나 120초 시간 초과면 Worker를 종료합니다. KTX2는 손실 압축이라 화질을 확인해야 하고, 압축률 같은 수치는 합성 샘플 기준입니다.",
      "The outbound side belongs to the Scene3D specialist tools. They take one GLB and produce derivatives such as compression, three LOD levels, tangents and KTX2 conversion without touching the original, reopen the output to verify it, and return it with a SHA-256 receipt. Each job gets its own Worker, terminated on cancel or a 120-second timeout. KTX2 is lossy so quality must be checked, and figures like compression ratios come from synthetic samples.",
    ),
  ],
  keyPoints: [
    t("9가지 형식을 하나의 검증된 GLB로 합칩니다", "Nine formats are merged into one verified GLB"),
    t("렌더러가 보기 전에 크기·구조·확장 목록부터 검사합니다", "Size, structure and extensions are checked before the renderer sees it"),
    t("압축: meshopt는 출하, KTX2는 도구만, Draco는 거부", "Compression: meshopt ships, KTX2 is tooling only, Draco is rejected"),
    t("내보내기 도구는 원본을 두고 파생물과 SHA-256 영수증을 만듭니다", "Export tools leave the original and make derivatives with SHA-256 receipts"),
  ],
  diagram: {
    id: "glb-optimization-pipeline-diagram",
    kind: "graph",
    title: t("낯선 파일이 라이브러리에 들어오기까지", "How a strange file reaches the library"),
    caption: t(
      "모든 입력이 같은 GLB 검증 관문을 지나고, 내보내기는 라이브러리의 원본을 건드리지 않습니다.",
      "Every input passes the same GLB gate, and exporting never touches the original in the library.",
    ),
    alt: t(
      "아홉 형식의 파일이 경로와 선언 수 검사를 거쳐 Worker에서 파싱되고 GLB로 쓰입니다. SketchUp 파일은 openskp로 GLB가 되어 파싱 단계에 합류합니다. GLB 검증 관문은 확장 허용 목록과 예산을 확인하고, 통과한 모델만 라이브러리에 등록됩니다. 라이브러리에서 전문가 도구가 파생물을 만듭니다.",
      "Files in nine formats go through path and declared-count checks, are parsed in a Worker and written as GLB. A SketchUp file becomes GLB through openskp and joins at the parsing step. The GLB gate checks the extension allowlist and budgets, and only passing models are registered in the library, from which specialist tools make derivatives.",
    ),
    nodes: [
      { id: "files", label: t("파일 9형식", "9 formats"), sub: t("glb·obj·fbx·skp 등", "glb, obj, fbx, skp..."), tone: "local", shape: "pill", at: [0, 0] },
      { id: "plan", label: t("경로·선언 수 검사", "Path and count check"), sub: t("파서 이전", "Before any parser"), tone: "local", at: [1, 0] },
      { id: "parse", label: t("Worker 파싱", "Worker parse"), sub: t("한도 재검사", "Limits checked again"), tone: "local", at: [2, 0] },
      { id: "write", label: t("GLB로 쓰기", "Write GLB"), sub: t("Phong→PBR 승급", "Phong to PBR"), tone: "local", at: [3, 0] },
      { id: "gate", label: t("GLB 검증 관문", "GLB gate"), sub: t("100MiB·예산·해시", "100 MiB, budgets, hash"), tone: "warn", at: [4, 0] },
      { id: "lib", label: t("모델 라이브러리", "Model library"), sub: t("SHA-256 중복 제거", "SHA-256 de-duplication"), tone: "local", shape: "cylinder", at: [5, 0] },
      { id: "skp", label: t("SketchUp .skp", "SketchUp .skp"), sub: t("openskp로 GLB 변환", "openskp to GLB"), tone: "local", shape: "pill", at: [2, 1] },
      { id: "ext", label: t("확장 허용 목록", "Extension allowlist"), sub: t("meshopt·basisu·webp", "meshopt, basisu, webp"), tone: "warn", at: [4, 1] },
      { id: "tools", label: t("전문가 도구", "Specialist tools"), sub: t("LOD·KTX2 파생물", "LOD and KTX2 derivatives"), tone: "local", at: [5, 1] },
    ],
    edges: [
      { from: "files", to: "plan", label: t("선택", "pick") },
      { from: "plan", to: "parse", label: t("통과", "pass") },
      { from: "parse", to: "write", label: t("상한 재검사", "recheck") },
      { from: "write", to: "gate", label: t("GLB 바이트", "GLB bytes") },
      { from: "gate", to: "lib", label: t("통과 시 등록", "register") },
      { from: "skp", to: "parse", label: t("GLB로 변환", "to GLB") },
      { from: "ext", to: "gate", label: t("허용만", "allowed only") },
      { from: "lib", to: "tools", label: t("원본은 그대로", "original kept") },
    ],
  },
  usage: [
    {
      feature: t("3D 배경 편집기 · 모델 가져오기", "3D background editor · model import"),
      role: t(
        "9형식을 계획 → Worker 파싱 → GLB 쓰기 → 검증 순서로 하나의 GLB로 정규화해 라이브러리에 등록합니다.",
        "Normalizes nine formats into one GLB through plan, Worker parse, GLB write and validation, then registers it in the library.",
      ),
      paths: [
        `${BG3D_DIR}/studio-bg3d-model-import.ts#STUDIO_BG3D_IMPORT_PRIMARY_FORMATS`,
        `${BG3D_DIR}/studio-bg3d-model-import-shared.ts`,
        `${BG3D_DIR}/studio-bg3d-glb-validation.ts`,
        `${BG3D_DIR}/bg3d-model-library.ts`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("SketchUp(.skp) 가져오기", "SketchUp (.skp) import"),
      role: t(
        "openskp를 지연 로드해 buildScene → toGLB로 바꾸고 GLB 머리말을 확인한 뒤 같은 경로에 합류합니다. 변환기 로드 실패와 파싱 실패를 다른 오류로 알리고, 가짜 변환은 하지 않습니다.",
        "Lazy-loads openskp, converts via buildScene then toGLB, checks the GLB header and joins the same path. Converter-load failure and parse failure are reported as different errors, with no fake conversion.",
      ),
      paths: [`${BG3D_DIR}/studio-bg3d-skp-converter.ts`, `${BG3D_DIR}/studio-bg3d-skp-converter.test.ts`],
    },
    {
      feature: t("압축 자산 읽기 (meshopt · KTX2)", "Reading compressed assets (meshopt, KTX2)"),
      role: t(
        "meshopt 디코더는 3D 작업 공간에 들어갈 때 지연 로드하고, KTX2는 Basis 변환기 JS/WASM을 SHA-256으로 고정·증명한 뒤에만 가동합니다.",
        "The meshopt decoder loads lazily when the 3D workspace opens, and KTX2 runs only after the Basis transcoder JS and WASM are pinned and attested by SHA-256.",
      ),
      paths: [
        `${BG3D_DIR}/studio-bg3d-meshopt.ts`,
        `${BG3D_DIR}/studio-bg3d-ktx2-transcoder-contract.ts`,
        `${BG3D_DIR}/studio-bg3d-ktx2-transcoder-assets.ts`,
      ],
    },
    {
      feature: t("3D 자산 고급 가공 (LOD · 압축 · KTX2)", "Advanced 3D asset tools (LOD, compression, KTX2)"),
      role: t(
        "GLB를 원본 불변 파생물로 만듭니다. 작업당 Worker 1개, 120초 제한, 결과를 다시 열어 검증, SHA-256 영수증을 남깁니다.",
        "Makes GLB derivatives while the original stays unchanged: one Worker per job, a 120-second limit, the result reopened for verification, and a SHA-256 receipt.",
      ),
      paths: [
        `${SPECIALIST_DIR}/specialist-client.ts`,
        `${SPECIALIST_DIR}/specialist-gltf.ts`,
        `${SPECIALIST_DIR}/specialist-textures.ts`,
        `${SPECIALIST_DIR}/StudioScene3dAssetToolsPanel.tsx`,
      ],
      route: "/studio/bg3d",
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("GLB 바이트를 로더에 넘기기 전의 머리말 검사", "Header check on GLB bytes before handing them to a loader"),
      language: "ts",
      code: `const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

/** 로더는 관대하므로, 구조를 먼저 확인하고 JSON 청크만 꺼내 본다. */
export function inspectGlb(bytes: Uint8Array, maxBytes = 100 * 1024 * 1024, maxJson = 4 * 1024 * 1024) {
  if (bytes.byteLength < 20 || bytes.byteLength > maxBytes) throw new Error("size");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) throw new Error("not glb 2.0");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("length mismatch");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || jsonLength > maxJson || 20 + jsonLength > bytes.byteLength) {
    throw new Error("json chunk");
  }
  const json = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  return JSON.parse(json) as { extensionsRequired?: string[] };
}`,
      codeEn: `const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

/** Loaders are forgiving, so check the structure first and pull out only the JSON chunk. */
export function inspectGlb(bytes: Uint8Array, maxBytes = 100 * 1024 * 1024, maxJson = 4 * 1024 * 1024) {
  if (bytes.byteLength < 20 || bytes.byteLength > maxBytes) throw new Error("size");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) throw new Error("not glb 2.0");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("length mismatch");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || jsonLength > maxJson || 20 + jsonLength > bytes.byteLength) {
    throw new Error("json chunk");
  }
  const json = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  return JSON.parse(json) as { extensionsRequired?: string[] };
}`,
      explain: t(
        "GLB는 12바이트 머리말(매직·버전·전체 길이) 뒤에 JSON 청크와 BIN 청크가 이어집니다. 실제 검증기는 이 확인 뒤에 접근자·버퍼 범위·텍스처 메모리·애니메이션 예산까지 따집니다.",
        "A GLB is a 12-byte header (magic, version, total length) followed by a JSON chunk and a BIN chunk. The real validator goes on past this to accessor and buffer ranges, texture memory and animation budgets.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("필수 확장은 허용 목록 안에서만, KTX2는 증명이 있을 때만", "Required extensions only from an allowlist, KTX2 only with attestation"),
      language: "ts",
      code: `const ALLOWED_REQUIRED = new Set([
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_texture_basisu",
  "EXT_texture_webp",
]);

/** extensionsRequired 는 "이해하지 못하면 읽으면 안 된다"는 선언이다. 모르는 것은 거절한다. */
export function checkRequiredExtensions(
  required: readonly string[] | undefined,
  transcoderAttested: boolean, // 변환기 JS/WASM 해시를 이 실행 공간에서 확인했는가
): "ok" | "unsupported-required-extension" {
  for (const name of required ?? []) {
    if (!ALLOWED_REQUIRED.has(name)) return "unsupported-required-extension"; // 예: KHR_draco_mesh_compression
    if (name === "KHR_texture_basisu" && !transcoderAttested) return "unsupported-required-extension";
  }
  return "ok";
}`,
      codeEn: `const ALLOWED_REQUIRED = new Set([
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_texture_basisu",
  "EXT_texture_webp",
]);

/** extensionsRequired declares "do not read this if you cannot understand it". Refuse what is unknown. */
export function checkRequiredExtensions(
  required: readonly string[] | undefined,
  transcoderAttested: boolean, // were the transcoder JS and WASM hashes verified in this realm?
): "ok" | "unsupported-required-extension" {
  for (const name of required ?? []) {
    if (!ALLOWED_REQUIRED.has(name)) return "unsupported-required-extension"; // e.g. KHR_draco_mesh_compression
    if (name === "KHR_texture_basisu" && !transcoderAttested) return "unsupported-required-extension";
  }
  return "ok";
}`,
      explain: t(
        "실제 검증기도 같은 모양입니다. 허용 목록은 meshopt·quantization·basisu·webp 네 개로 고정돼 있고, Draco는 목록에 없어 거절됩니다. 증명은 구조화 복제를 지나면 사라지게 만들어, Worker가 스스로 다시 증명해야 합니다.",
        "The real validator has the same shape. The allowlist is fixed at four entries (meshopt, quantization, basisu, webp), and Draco is absent so it is refused. The attestation is made to vanish through structured cloning, so a Worker must attest again itself.",
      ),
      source: `${BG3D_DIR}/studio-bg3d-glb-validation.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "Khronos · glTF 2.0 Specification (GLB container)",
      url: "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html",
      kind: "spec",
      note: t("GLB 머리말·청크 구조", "The GLB header and chunk layout"),
    },
    {
      title: "Khronos · EXT_meshopt_compression",
      url: "https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression",
      kind: "spec",
    },
    {
      title: "Khronos · KHR_texture_basisu",
      url: "https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu",
      kind: "spec",
      note: t("KTX2(Basis) 텍스처를 glTF에서 쓰는 확장", "The extension for using KTX2 (Basis) textures in glTF"),
    },
    {
      title: "glTF Transform",
      url: "https://gltf-transform.dev/",
      kind: "docs",
      note: t("GLB를 읽고 변환하는 라이브러리", "A library that reads and transforms GLB"),
    },
    {
      title: "zeux · meshoptimizer",
      url: "https://github.com/zeux/meshoptimizer",
      kind: "repo",
      note: t("메시 압축과 단순화(LOD)", "Mesh compression and simplification (LOD)"),
    },
    {
      title: "openskp",
      url: "https://openskp.com/",
      kind: "docs",
      note: t("브라우저에서 SketchUp 파일을 읽는 TypeScript 파서", "A TypeScript parser that reads SketchUp files in the browser"),
    },
  ],
  chapterIds: ["web-3d-engine", "skp-model-import", "worker-architecture"],
  talk: {
    pitch: t(
      "3D 파일 업로드는 입력이 아니라 공격 표면이라고 봅니다. 그래서 아홉 가지 형식을 GLB 한 가지로 바꾸고, 렌더러가 보기 전에 크기·구조·확장 목록을 검사합니다. 압축은 meshopt를 읽을 수 있고 번들 환경 31개 중 10개에 적용돼 있으며, KTX2는 읽는 런타임과 만드는 도구까지 있지만 저장소에 실린 KTX2 파일은 아직 없습니다. 내보낼 때는 원본을 두고 파생물과 SHA-256 영수증을 만듭니다.",
      "We treat a 3D upload as an attack surface, not just input. So nine formats become one GLB, and size, structure and extensions are checked before the renderer sees anything. Meshopt compression can be read and is applied to 10 of the 31 bundled environments; KTX2 has a reading runtime and a writing tool, but no KTX2 file ships in the repository yet. When exporting, the original is kept and a derivative with a SHA-256 receipt is produced.",
    ),
    analogy: t(
      "이삿짐센터가 모든 짐을 규격 상자 하나로 다시 포장하고, 집에 들이기 전에 현관에서 무게와 내용물 목록부터 확인하는 것과 같습니다.",
      "It is like a moving company repacking everything into one standard box and checking weight and the contents list at the door before it comes into the house.",
    ),
    questions: [
      {
        question: t("왜 FBX를 그대로 쓰지 않고 GLB로 바꾸나요?", "Why convert FBX to GLB instead of using it as is?"),
        answer: t(
          "검증·저장·렌더·내보내기를 한 형식에만 맞추면 감사 대상이 줄고 모델 해시로 중복 제거도 됩니다. 대신 변환 품질은 형식마다 다릅니다. FBX·DAE·3DS는 생성한 회귀 파일로 검사했을 뿐 실제 외부 파일 전체의 호환을 보증하지 않습니다.",
          "Fitting verification, storage, rendering and export to one format shrinks the audit surface and enables de-duplication by model hash. Conversion quality differs per format, though: FBX, DAE and 3DS are tested with generated regression files and full compatibility with real external files is not guaranteed.",
        ),
      },
      {
        question: t("Draco 압축 glTF는 되나요?", "Does Draco-compressed glTF work?"),
        answer: t(
          "지원하지 않고 가져올 때 거부합니다. 표준 glTF/GLB로 다시 내보내 달라고 안내합니다.",
          "No. It is refused on import, with guidance to re-export as standard glTF or GLB.",
        ),
      },
      {
        question: t("KTX2를 쓰나요?", "Do you use KTX2?"),
        answer: t(
          "읽는 런타임(실행 코드 해시 증명)과 만드는 도구는 있지만, 현재 apps/web/public에는 독립 .ktx2 파일이 없습니다. 번들 환경 GLB 31개 중 Tripo로 만든 10개는 meshopt와 WebP 텍스처이고 나머지 21개는 PNG 텍스처입니다. GLB 안에 KTX2가 들어 있는지는 전수 조사하지 않았습니다.",
          "There is a reading runtime (with hash attestation of executable code) and a writing tool, but no standalone .ktx2 file is in apps/web/public today. Of the 31 bundled environment GLBs, the 10 made with Tripo use meshopt and WebP textures and the other 21 use PNG textures. I did not audit every GLB for embedded KTX2.",
        ),
      },
    ],
    pitfall: t(
      "'KTX2·Draco까지 다 지원'이라고 말하지 마세요. Draco는 거부이고 KTX2 출하 자산은 0개입니다. 압축률·LOD 삼각형 수는 합성 샘플 기준이며 실제 작품 자산으로 재지 않았습니다. .skp는 젊은 파서라 일부 구형 파일이 실패할 수 있습니다.",
      "Do not say KTX2 and Draco are fully supported: Draco is refused and no KTX2 asset ships. Compression ratios and LOD triangle counts come from synthetic samples, not measured on real production assets. The .skp parser is young, so some legacy files can fail.",
    ),
  },
  technologies: ["GLB / glTF", "glTF Transform", "Meshoptimizer", "KTX2", "openskp", "Web Workers", "SHA-256"],
  facts: [
    { value: "9", label: t("가져오기 기본 형식 수", "Primary import formats"), source: `${BG3D_DIR}/studio-bg3d-model-import.ts` },
    { value: "100 MiB / 4 MiB", label: t("GLB 파일 / JSON 청크 최대 크기", "Largest GLB file / JSON chunk"), source: `${BG3D_DIR}/studio-bg3d-glb-validation.ts` },
    { value: "64 MiB / 256 MiB", label: t("KTX2 변환 입력 / 디코딩 결과 최대 크기", "Largest KTX2 transcode input / decoded output"), source: `${BG3D_DIR}/studio-bg3d-ktx2-transcoder-contract.ts` },
    { value: "120 s", label: t("전문가 도구 작업 제한 시간", "Specialist job time limit"), source: `${SPECIALIST_DIR}/specialist-contract.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const BG3D_BACKGROUND_CATALOG: EngineeringAtlasEntry = {
  id: "bg3d-background-catalog",
  category: "three-d",
  name: "BG3D Environment Catalog",
  title: t("출처와 지문이 붙은 3D 배경 세트장 창고", "A set-storage warehouse with provenance and fingerprints on every item"),
  status: "live",
  tagline: t(
    "교실·카페·골목 등 배경 31개를 크기·출처·SHA-256과 함께 담고, 검증을 거쳐 장면에 놓습니다.",
    "Holds 31 backgrounds such as classrooms, cafes and alleys with size, origin and SHA-256, placed only after checks.",
  ),
  background: [
    t(
      "배경 카탈로그는 영화 세트장 창고와 같습니다. 만화가는 교실·카페·골목 같은 3D 세트를 골라 배치하고 카메라를 잡아 컷의 밑그림으로 씁니다. 세트마다 이름표(출처·라이선스 문구·크기·지문)가 붙어 있어서, 나중에 '이 배경은 어디서 왔고 어떤 조건인가'를 따로 찾아 헤매지 않아도 됩니다. 라이선스 문구는 코드에 선언된 값일 뿐 법률 자문은 아닙니다.",
      "The background catalog is like a film-set warehouse. A comic artist picks 3D sets such as a classroom, cafe or alley, places them and frames a camera as the underdrawing of a panel. Each set carries a tag (origin, license wording, size, fingerprint), so there is no hunting later for where a background came from and on what terms. The license wording is a value declared in code, not legal advice.",
    ),
    t(
      "카탈로그는 코드에 박힌 목록입니다. 항목마다 id·이름·테마·태그·파일 크기·SHA-256·크기(너비×높이×깊이, 미터)·추천 카메라·출처가 있습니다. 사용자가 고르면 로더가 GLB를 받아 응답 종류(HTML이나 JSON이면 거부)와 선언된 크기, GLB 머리말을 확인합니다. 그 뒤의 SHA-256·구조·기기 예산 검사는 사용자가 올린 모델과 똑같은 경로를 지납니다. 같은 모델을 여러 번 눌러도 요청은 하나로 합쳐지고, 호출자마다 바이트 복사본을 받습니다.",
      "The catalog is a list baked into code. Each item has an id, name, theme, tags, file size, SHA-256, dimensions (width by height by depth, in metres), a suggested camera and its origin. When a user picks one, the loader fetches the GLB and checks the response type (HTML or JSON is refused), the declared size and the GLB header. SHA-256, structure and device-budget checks then follow the same path as a model the user uploaded. Clicking the same model repeatedly coalesces into one request, and each caller gets its own byte copy.",
    ),
    t(
      "대안은 서버 API에서 에셋을 받아 오거나 사용자가 올리는 것만 허용하는 방식입니다. 서버를 거치면 오프라인이 안 되고 비용이 생기며, 업로드만 있으면 빈 화면에서 시작해야 합니다. 그래서 정적 파일로 배포하되 지문과 출처를 코드에 박았고, 로컬 저장소(SQLite/OPFS)가 막혀 있어도 모델 패널은 번들 목록을 보여 줍니다. 이때 저장과 업로드만 실패로 닫힙니다.",
      "The alternatives are fetching assets from a server API or allowing only user uploads. A server breaks offline use and costs money, and uploads alone leave you starting from a blank screen. So the sets ship as static files with fingerprints and origin pinned in code, and the model panel still shows the bundled list when local storage (SQLite/OPFS) is blocked, with only saving and uploading failing closed.",
    ),
    t(
      "예산은 이렇습니다. 모델 하나는 데스크톱 100MiB(모바일 64MiB) 이하이고, 모바일 프로파일은 삼각형 500,000·노드 256·텍스처 64장·텍스처 합계 128MiB, 데스크톱은 삼각형 2,000,000·노드 1,024·텍스처 256장입니다. 출처는 정직하게 갈립니다. 31개 중 21개는 Blender 스크립트로 만든 CC0 세트(그중 18개는 Poly Haven의 CC0 모델·재질을 소스로 합성, 3개는 순수 절차 생성)이고, 10개는 Tripo 무료 API 지갑으로 생성한 AI 생성물(비독점, 공급자가 권리 보유)입니다. 실제 기기에서의 로딩 시간과 메모리는 이 카드에서 측정하지 못했습니다.",
      "The budgets are: one model up to 100 MiB on desktop (64 MiB on mobile); the mobile profile allows 500,000 triangles, 256 nodes, 64 textures and 128 MiB of textures in total; desktop allows 2,000,000 triangles, 1,024 nodes and 256 textures. Origins split honestly: 21 of the 31 are CC0 sets made with Blender scripts (18 of them composed from Poly Haven CC0 models and materials, 3 purely procedural), and 10 are AI-generated through Tripo's free API wallet (non-exclusive, with the provider retaining rights). Loading time and memory on real devices were not measured for this card.",
    ),
  ],
  keyPoints: [
    t("배경 31개: 21개는 Blender로 만든 CC0 세트, 10개는 AI 생성(Tripo)", "31 sets: 21 CC0 built with Blender, 10 AI-generated (Tripo)"),
    t("항목마다 SHA-256·크기·출처·추천 카메라를 코드에 박았습니다", "Each item pins SHA-256, size, origin and a suggested camera in code"),
    t("받은 바이트는 사용자 업로드와 같은 검증 경로를 지납니다", "Fetched bytes take the same validation path as a user upload"),
    t("저장소가 막혀도 번들 목록은 보이고 저장·업로드만 닫힙니다", "If storage is blocked the bundled list still shows; only save and upload close"),
  ],
  diagram: {
    id: "bg3d-background-catalog-diagram",
    kind: "graph",
    title: t("카탈로그에서 장면까지", "From the catalog to the scene"),
    caption: t(
      "카탈로그의 번들 세트도 사용자 업로드와 같은 GLB 검증 관문을 지나야 장면에 놓입니다.",
      "A bundled set also has to pass the same GLB gate as a user upload before it enters a scene.",
    ),
    alt: t(
      "카탈로그의 출처 선언이 항목에 붙고, 사용자가 고르면 번들 로더가 응답과 GLB 머리말을 확인합니다. 로더와 사용자 업로드가 같은 GLB 검증을 거친 뒤 모델 라이브러리에 등록되고 장면에 미터 크기로 놓입니다.",
      "Origin declarations are attached to each catalog item, and when a user picks one the bundled loader checks the response and GLB header. The loader output and a user upload then go through the same GLB validation before registration in the model library and placement at metre scale in the scene.",
    ),
    nodes: [
      { id: "catalog", label: t("카탈로그 31개", "31-item catalog"), sub: t("지문·크기·카메라", "Fingerprint, size, camera"), tone: "local", shape: "cylinder", at: [0, 0] },
      { id: "prov", label: t("출처·라이선스", "Origin and license"), sub: t("CC0 21 · Tripo 10", "CC0 21, Tripo 10"), tone: "external", shape: "cloud", at: [0, 1] },
      { id: "loader", label: t("번들 로더", "Bundled loader"), sub: t("응답·크기·GLB 머리말", "Response, size, header"), tone: "local", at: [1, 0] },
      { id: "upload", label: t("내 파일 업로드", "My file upload"), sub: t("사용자 모델", "User model"), tone: "local", shape: "pill", at: [1, 1] },
      { id: "verify", label: t("GLB 검증", "GLB validation"), sub: t("SHA-256·구조·기기 예산", "SHA-256, structure, budget"), tone: "warn", at: [2, 0] },
      { id: "lib", label: t("모델 라이브러리", "Model library"), sub: t("SQLite/OPFS", "SQLite/OPFS"), tone: "local", shape: "cylinder", at: [3, 0] },
      { id: "scene", label: t("장면에 배치", "Place in scene"), sub: t("미터 크기·추천 카메라", "Metre scale, camera"), tone: "good", at: [4, 0] },
    ],
    edges: [
      { from: "prov", to: "catalog", label: t("항목마다 선언", "declared per item") },
      { from: "catalog", to: "loader", label: t("선택", "pick") },
      { from: "loader", to: "verify", label: t("바이트", "bytes") },
      { from: "upload", to: "verify", label: t("같은 관문", "same gate") },
      { from: "verify", to: "lib", label: t("통과 시 등록", "register") },
      { from: "lib", to: "scene", label: t("배치", "place") },
    ],
  },
  usage: [
    {
      feature: t("3D 배경 편집기 · 모델/환경 패널", "3D background editor · models and environments panel"),
      role: t(
        "번들 환경 세트를 목록으로 보여 주고, 고르면 로더가 받아 검증한 뒤 원본 미터 크기로 장면에 배치합니다.",
        "Lists the bundled environment sets and, when one is picked, fetches it, validates it and places it in the scene at its authored metre size.",
      ),
      paths: [
        `${BG3D_DIR}/studio-bg3d-environment-catalog.ts#STUDIO_BG3D_ENVIRONMENT_ASSETS`,
        `${BG3D_DIR}/studio-bg3d-bundled-environment-library.ts`,
        `${BG3D_DIR}/studio-bg3d-bundled-environment-loader.ts#loadStudioBg3dBundledEnvironmentSource`,
        `${BG3D_DIR}/StudioBg3dAssetLibraryPanel.tsx`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("내 모델 라이브러리", "My model library"),
      role: t(
        "올린 모델을 SQLite/OPFS에 SHA-256 기준으로 중복 없이 저장하고, 권리 상태(소유·라이선스·퍼블릭 도메인·미확인, 기본은 미확인)를 함께 기록합니다.",
        "Stores uploaded models in SQLite/OPFS de-duplicated by SHA-256, with a rights status (owned, licensed, public domain or unknown, defaulting to unknown).",
      ),
      paths: [`${BG3D_DIR}/bg3d-model-library.ts`, `${BG3D_DIR}/studio-bg3d-libraries-sqlite-opfs-authority.ts`],
    },
    {
      feature: t("기기별 GLB 예산", "Per-device GLB budgets"),
      role: t(
        "모바일·데스크톱 프로파일로 삼각형·노드·텍스처 수와 디코딩 메모리 상한을 나눕니다.",
        "Splits triangle, node, texture and decoded-memory ceilings between mobile and desktop profiles.",
      ),
      paths: [`${BG3D_DIR}/studio-bg3d-glb-validation.ts#DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES`],
    },
    {
      feature: t("런타임 텍스처 품질", "Runtime texture quality"),
      role: t(
        "화면에 올릴 때 이방성 필터링을 기기 상한(최대 16) 안에서 조절합니다. 품질 예산은 이방성만 낮춥니다.",
        "When shown on screen it tunes anisotropic filtering within the device ceiling (at most 16); the quality budget only lowers anisotropy.",
      ),
      paths: [`${BG3D_DIR}/studio-bg3d-runtime-asset-quality.ts#applyStudioBg3dRuntimeAssetQuality`],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("번들 GLB를 받아 응답·크기·머리말만 확인하기", "Fetch a bundled GLB and check only response, size and header"),
      language: "ts",
      code: `export interface CatalogAsset { url: string; byteSize: number }

const GLB_MAGIC = 0x46546c67; // "glTF"

/** 응답 종류·크기·GLB 머리말만 본다. SHA-256과 구조 검사는 이후 공통 경로가 맡는다. */
export async function loadBundledGlb(asset: CatalogAsset, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const response = await fetcher(asset.url, { cache: "force-cache", credentials: "same-origin" });
  if (!response.ok) throw new Error("request-failed");
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  // 없는 파일 대신 앱 셸 HTML이 200으로 돌아오는 경우를 막는다
  if (type.includes("text/html") || type.includes("application/json")) throw new Error("unexpected-response");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.byteSize) throw new Error("byte-size-mismatch");
  if (bytes.byteLength < 12) throw new Error("invalid-glb");
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error("invalid-glb");
  }
  return bytes;
}`,
      codeEn: `export interface CatalogAsset { url: string; byteSize: number }

const GLB_MAGIC = 0x46546c67; // "glTF"

/** Looks only at response type, size and GLB header. SHA-256 and structure checks follow on the shared path. */
export async function loadBundledGlb(asset: CatalogAsset, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const response = await fetcher(asset.url, { cache: "force-cache", credentials: "same-origin" });
  if (!response.ok) throw new Error("request-failed");
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  // Guards against the app-shell HTML coming back as 200 instead of the missing file
  if (type.includes("text/html") || type.includes("application/json")) throw new Error("unexpected-response");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.byteSize) throw new Error("byte-size-mismatch");
  if (bytes.byteLength < 12) throw new Error("invalid-glb");
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error("invalid-glb");
  }
  return bytes;
}`,
      explain: t(
        "실제 로더는 여기에 더해 같은 에셋의 중복 요청을 하나로 합치고, 호출자마다 바이트 복사본을 돌려주며, 검증이 끝나면 캐시를 해제합니다.",
        "The real loader additionally coalesces duplicate requests for the same asset, hands each caller its own byte copy, and releases the cache once validation finishes.",
      ),
      source: `${BG3D_DIR}/studio-bg3d-bundled-environment-loader.ts`,
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("출처를 타입으로 구분해 문구를 고르기", "Telling origins apart by type to pick the wording"),
      language: "ts",
      code: `type Provenance =
  | { origin: "original-procedural"; license: "CC0-1.0"; generator: string }
  | {
      origin: "ai-generated-free-wallet";
      license: "Tripo Terms of Service - Free User Output";
      nonExclusive: true; // 비독점
      providerRetainsRights: true; // 공급자가 권리를 보유
      paymentMethodUsed: false; // 무료 지갑만 사용
    };

export interface EnvironmentAsset {
  id: string;
  sha256: \`sha256:\${string}\`;
  bounds: readonly [number, number, number]; // 너비·높이·깊이 (미터, glTF Y-up)
  provenance: Provenance;
}

/** 출처 종류마다 사용자에게 보일 문구가 다르다. 정의되지 않은 출처는 타입이 막는다. */
export function statusText(asset: EnvironmentAsset): string {
  return asset.provenance.origin === "original-procedural"
    ? "CC0 번들 · 안전 검사 후 배치"
    : "AI 생성물 · 비독점 조건과 안전 검사를 확인";
}`,
      codeEn: `type Provenance =
  | { origin: "original-procedural"; license: "CC0-1.0"; generator: string }
  | {
      origin: "ai-generated-free-wallet";
      license: "Tripo Terms of Service - Free User Output";
      nonExclusive: true; // non-exclusive
      providerRetainsRights: true; // the provider keeps its rights
      paymentMethodUsed: false; // only the free wallet was used
    };

export interface EnvironmentAsset {
  id: string;
  sha256: \`sha256:\${string}\`;
  bounds: readonly [number, number, number]; // width, height, depth (metres, glTF Y-up)
  provenance: Provenance;
}

/** Each origin shows different wording to the user. The type blocks any undefined origin. */
export function statusText(asset: EnvironmentAsset): string {
  return asset.provenance.origin === "original-procedural"
    ? "CC0 bundle - placed after safety checks"
    : "AI-generated - non-exclusive terms and safety checks confirmed";
}`,
      explain: t(
        "실제 카탈로그도 출처를 'original-procedural', 'ai-generated-free-wallet' 같은 닫힌 값으로 두고, 항목마다 라이선스 URL과 생성 스크립트를 함께 기록합니다. 문구는 이 값에서만 만들어집니다.",
        "The real catalog also keeps origin as closed values such as original-procedural and ai-generated-free-wallet, recording a license URL and generator script per item. The wording is derived only from those values.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "Creative Commons · CC0 1.0 Universal",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      kind: "spec",
      note: t("CC0 세트 21개에 선언된 라이선스", "The license declared for the 21 CC0 sets"),
    },
    {
      title: "Tripo · Terms of Service",
      url: "https://www.tripo3d.ai/terms",
      kind: "docs",
      note: t("AI 생성 10개에 선언된 약관(코드 기록 기준)", "The terms declared for the 10 AI-generated items, per the code record"),
    },
    {
      title: "Khronos · glTF 2.0 Specification",
      url: "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html",
      kind: "spec",
      note: t("미터·Y-up 좌표 규약", "The metre and Y-up conventions"),
    },
    {
      title: "MDN · SubtleCrypto.digest()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest",
      kind: "docs",
      note: t("브라우저에서 SHA-256 지문 만들기", "Computing a SHA-256 fingerprint in the browser"),
    },
  ],
  chapterIds: ["web-3d-engine", "content-addressing", "storage"],
  talk: {
    pitch: t(
      "배경 3D 카탈로그는 세트장 창고입니다. 교실·카페·골목 등 31개 세트가 들어 있고, 21개는 Blender 스크립트로 만든 CC0 세트(대부분 Poly Haven의 CC0 모델·재질을 소스로 합성), 10개는 Tripo 무료 API로 생성한 AI 세트입니다. 세트마다 지문, 크기, 출처, 추천 카메라가 코드에 박혀 있고, 받은 파일은 사용자가 올린 파일과 똑같은 안전 검사를 거쳐야 장면에 놓입니다.",
      "The 3D background catalog is a set warehouse. It holds 31 sets such as classrooms, cafes and alleys: 21 are CC0 sets built with Blender scripts (most composed from Poly Haven's CC0 models and materials) and 10 are AI sets generated through Tripo's free API. Each set has its fingerprint, size, origin and suggested camera pinned in code, and a fetched file must pass the same safety checks as a user upload before it enters a scene.",
    ),
    analogy: t(
      "영화 세트장 창고의 재고 장부입니다. 장부에는 세트마다 크기·출처·검수 지문이 적혀 있고, 꺼낼 때도 입구에서 같은 검수를 거칩니다.",
      "It is the inventory ledger of a film-set warehouse. The ledger records size, origin and an inspection fingerprint for each set, and the same inspection happens at the door whenever one is taken out.",
    ),
    questions: [
      {
        question: t("AI 생성 세트는 상업적으로 써도 되나요?", "Can the AI-generated sets be used commercially?"),
        answer: t(
          "코드에는 Tripo 무료 사용자 출력 약관(비독점·상업 이용 허용, 공급자가 권리 보유)이 선언돼 있고 결제 수단은 쓰지 않았다고 기록합니다. 다만 이것은 코드의 선언이지 법률 자문이 아니며, 약관이 바뀌면 다시 확인해야 합니다.",
          "The code declares Tripo's free user-output terms (non-exclusive, commercial use allowed, provider retains rights) and records that no payment method was used. That is a declaration in code, not legal advice, and it must be rechecked if the terms change.",
        ),
      },
      {
        question: t("세트의 크기는 어떻게 맞추나요?", "How is the size of a set matched?"),
        answer: t(
          "카탈로그의 크기(bounds)는 glTF 규약(Y축이 위, 단위는 미터)으로 적고 정규화 방식은 '만들 때부터 미터(authored-metres)'입니다. 그래서 번들 세트는 업로드 소품에 쓰는 긴 변 2m 맞춤을 건너뛰고 1배로 놓입니다. 자세한 내용은 좌표·단위 카드를 보세요.",
          "Catalog dimensions (bounds) follow the glTF convention (Y up, metres) and the normalization is authored-metres, meaning made in metres from the start. That is why a bundled set skips the 2 m longest-side fit used for uploaded props and is placed at scale 1. See the coordinate and unit card for details.",
        ),
      },
      {
        question: t("로컬 저장소가 막혀 있으면요?", "What if local storage is blocked?"),
        answer: t(
          "번들 세트 목록은 계속 보이고, 저장과 업로드만 실패로 닫힙니다.",
          "The bundled list still shows, and only saving and uploading fail closed.",
        ),
      },
    ],
    pitfall: t(
      "'31개 모두 직접 제작'이라고 말하지 마세요. 10개는 AI 생성물이고, 나머지 21개도 18개는 Poly Haven CC0 모델·재질을 소스로 합성한 세트입니다. 31이라는 숫자는 현재 코드와 테스트 기준이며, 라이선스 문구는 법률 자문이 아닙니다. 기기별 로딩 시간·메모리 측정값은 이 카드에서 제시하지 못합니다.",
      "Do not say all 31 were made in-house: 10 are AI-generated, and 18 of the other 21 are sets composed from Poly Haven CC0 models and materials. The number 31 reflects the current code and tests, and the license wording is not legal advice. This card has no per-device loading time or memory measurements.",
    ),
  },
  technologies: ["GLB / glTF", "Three.js", "OPFS", "SQLite WASM", "SHA-256", "Blender bpy"],
  facts: [
    { value: "31", label: t("번들 환경 세트 수(테스트가 단언)", "Bundled environment sets (asserted by a test)"), source: `${BG3D_DIR}/studio-bg3d-environment-mcp-free-v1.test.ts` },
    { value: "21 / 10", label: t("Blender 스크립트로 만든 CC0 세트(18개는 Poly Haven CC0 소스 합성) / Tripo AI 생성 세트 수", "CC0 sets built with Blender scripts (18 composed from Poly Haven CC0 sources) / Tripo AI-generated sets"), source: `${BG3D_DIR}/studio-bg3d-environment-catalog.ts` },
    { value: "500,000 / 2,000,000", label: t("삼각형 예산: 모바일 / 데스크톱", "Triangle budget: mobile / desktop"), source: `${BG3D_DIR}/studio-bg3d-glb-validation.ts` },
  ],
  reviewedAt: "2026-10-07",
};

/** three-d 카테고리의 자산 계열 카드. */
export const THREE_D_ASSET_CARDS: readonly EngineeringAtlasEntry[] = [
  LIFT_2D_TO_3D,
  GLB_OPTIMIZATION_PIPELINE,
  BG3D_BACKGROUND_CATALOG,
];
