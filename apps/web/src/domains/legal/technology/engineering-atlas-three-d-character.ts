import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · three-d 카테고리 중 "캐릭터" 계열 카드: VRM 뼈대, 웹캠 추적.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const VRM_DIR = "apps/web/src/domains/creator/vrm";
const CREATOR_DIR = "apps/web/src/domains/creator";

export const VRM_HUMANOID_RIG: EngineeringAtlasEntry = {
  id: "vrm-humanoid-rig",
  category: "three-d",
  name: "VRM Humanoid",
  title: t("모든 캐릭터가 같은 뼈 이름을 쓰는 약속", "One shared set of bone names for every character"),
  status: "live",
  tagline: t(
    "VRM의 표준 뼈 이름 덕분에 포즈·손발 IK·웹캠 추적이 어떤 캐릭터에도 그대로 적용됩니다.",
    "VRM's standard bone names let poses, hand-and-foot IK and webcam tracking work on any character.",
  ),
  background: [
    t(
      "사람마다 키와 몸집이 달라도 '팔꿈치'와 '무릎'이라는 이름은 같습니다. VRM은 3D 캐릭터의 뼈에 이 같은 이름표를 붙이기로 한 약속입니다. 뼈 이름이 캐릭터마다 제각각이면 동작 하나를 만들 때마다 캐릭터별 번역표가 필요하지만, 표준 이름이 있으면 한 번 만든 포즈를 어느 캐릭터에든 입힐 수 있습니다. 앱에 번들된(apps/web/public/vrm) VRM 파일은 113개입니다.",
      "People differ in height and build, yet everyone's elbow and knee have the same names. VRM is the agreement to put those same labels on the bones of 3D characters. If every character named its bones differently, each motion would need its own translation table; with standard names, a pose made once can be put on any character. 113 VRM files are bundled with the app (apps/web/public/vrm).",
    ),
    t(
      "VRM은 glTF 파일에 휴머노이드 확장을 얹은 형식입니다. 필수 뼈 15개(엉덩이·척추·머리·팔다리 관절)와 선택 뼈(목·가슴·어깨·손가락 등)를 '이름 → 모델 안의 뼈 노드'로 이어 둡니다. three-vrm은 이를 '정규화 뼈'로 한 겹 더 감싸 기본 자세가 다른 모델도 같은 기준(회전 0)에서 다루게 해 줍니다. 포즈 소재는 이 정규화 뼈의 회전(기준 자세 대비 변화량)만 저장하고 이동·크기·임의 노드 경로는 담지 않습니다.",
      "VRM is a glTF file with a humanoid extension on top. It links 15 required bones (hips, spine, head, arm and leg joints) and optional ones (neck, chest, shoulders, fingers and so on) as name-to-bone-node pairs. three-vrm wraps them as normalized bones so models with different rest poses can be handled from the same baseline (zero rotation). A pose material stores only those normalized rotations, as change from the rest pose, and never translation, scale or arbitrary node paths.",
    ),
    t(
      "대안은 모델마다 뼈 이름을 직접 번역하는 방식이나 특정 엔진 전용 리그입니다. 표준을 쓰면 모델이 바뀌어도 포즈 도구·IK·웹캠 추적·셰이퍼가 같은 코드로 움직이고, 신뢰할 수 없는 파일이 엉뚱한 노드를 건드리는 일도 55개 이름의 허용 목록으로 막습니다. 대가는 모델이 필수 뼈를 갖춰야 하고, 관절 가동 범위와 표정 구성은 모델마다 달라 모델별 검증이 필요하다는 점입니다.",
      "The alternatives are translating bone names model by model or using an engine-specific rig. With a standard, the pose tool, IK, webcam tracking and shaper run the same code when the model changes, and an allowlist of 55 names stops an untrusted file from touching unrelated nodes. The cost is that a model must supply the required bones, and joint ranges and expression sets differ per model, so each needs its own validation.",
    ),
    t(
      "VRM 0.x 파일은 읽을 때 회전 보정(rotateVRM0)을 거쳐 열 수 있지만, 새로 쓰는 파일은 1.0만 만듭니다. 1.0은 휴머노이드를 노드 번호로 가리켜 브라우저 안에서 파일만 보고 검증할 수 있고, 라이선스 URL도 로더가 받아들이는 값으로 맞춰야 하기 때문입니다.",
      "VRM 0.x files open after a rotation fix (rotateVRM0), but newly written files are VRM 1.0 only. Version 1.0 refers to the humanoid by node index, so a file can be checked in the browser from its bytes alone, and its license URL must match a value the loader accepts.",
    ),
  ],
  keyPoints: [
    t("표준 뼈 이름 55개가 포즈·IK·웹캠의 공통 언어입니다", "55 standard bone names are the shared language of poses, IK and webcam"),
    t("포즈 소재는 정규화 뼈의 회전만 저장합니다(이동·임의 노드 금지)", "Pose materials store normalized bone rotations only, no translation or arbitrary nodes"),
    t("읽기는 VRM 0.x·1.0, 새로 쓰는 파일은 1.0만 만듭니다", "Reads VRM 0.x and 1.0; writes VRM 1.0 only"),
    t("필수 뼈 15개가 빠진 모델은 내보내지 않습니다", "A model missing any of the 15 required bones is not exported"),
  ],
  diagram: {
    id: "vrm-humanoid-rig-diagram",
    kind: "layers",
    title: t("같은 뼈 이름으로 이어지는 네 계층", "Four layers linked by the same bone names"),
    caption: t(
      "표준 뼈 이름이 가운데에 있어, 동작을 만드는 쪽과 받는 쪽이 서로를 몰라도 연결됩니다.",
      "Standard bone names sit in the middle, so makers and receivers connect without knowing each other.",
    ),
    alt: t(
      "맨 위에 웹캠, 사진 포즈, 손발 IK, 저장된 포즈가 있고, 그 아래 표준 뼈 이름 계층이 있습니다. 그 아래에 번들 VRM과 생성형 리그가 있고, 마지막으로 필수 뼈를 검사하는 내보내기 관문이 있습니다.",
      "At the top are the webcam, photo pose, hand-and-foot IK and saved poses. Below them is the standard bone-name layer, then the bundled VRMs and generated rigs, and finally an export gate that checks the required bones.",
    ),
    layers: [
      {
        id: "makers",
        label: t("동작을 만드는 쪽", "Who produces motion"),
        sub: t("웹캠 · 사진 포즈 · 손발 IK · 저장된 포즈", "Webcam, photo pose, hand and foot IK, saved poses"),
        tone: "local",
        chips: ["MediaPipe Tasks Vision", "getUserMedia"],
      },
      {
        id: "names",
        label: t("공통 언어: 표준 뼈 이름", "Common language: bone names"),
        sub: t("허용 목록 55개 이름 · 필수 15개", "55-name allowlist, 15 required"),
        tone: "good",
        chips: ["VRM", "@pixiv/three-vrm"],
      },
      {
        id: "rigs",
        label: t("뼈를 가진 캐릭터", "Characters that carry bones"),
        sub: t("번들 VRM 113개 · 생성형 리그 45본", "113 bundled VRMs, a generated 45-bone rig"),
        tone: "local",
        chips: ["GLB / glTF", "Three.js"],
      },
      {
        id: "gate",
        label: t("내보내기 관문", "Export gate"),
        sub: t("필수 뼈 15개를 확인한 뒤 VRM 1.0으로 기록", "Writes VRM 1.0 after checking all 15 required bones"),
        tone: "warn",
        chips: ["VRM"],
      },
    ],
    brackets: [
      { label: t("같은 이름표로 연결", "Linked by the same names"), layerIds: ["makers", "names", "rigs"] },
    ],
  },
  usage: [
    {
      feature: t("3D 캐릭터 편집기 · 포즈 도구", "3D character editor · pose tool"),
      role: t(
        "손·발 핸들로 만든 포즈를 정규화 뼈 회전으로 저장하고 불러옵니다. 적용 범위는 전신·상체·하체·양손·시선으로 나눕니다.",
        "Saves and loads poses made with hand and foot handles as normalized bone rotations, with scopes for full body, upper, lower, each hand and gaze.",
      ),
      paths: [
        `${CREATOR_DIR}/studio-humanoid-bones.ts#STUDIO_HUMANOID_BONE_NAMES`,
        `${CREATOR_DIR}/studio-pose-material.ts`,
        `${VRM_DIR}/studio-vrm-pose-material-adapter.ts`,
      ],
      route: "/studio/poser",
    },
    {
      feature: t("웹캠 모션 캡처", "Webcam motion capture"),
      role: t(
        "MediaPipe가 읽은 관절을 같은 뼈 이름의 회전값으로 바꿔 캐릭터의 정규화 뼈에 씁니다.",
        "Turns the joints MediaPipe reads into rotations under the same bone names and writes them to the character's normalized bones.",
      ),
      paths: [`${VRM_DIR}/StudioVrmActor.tsx`, `${VRM_DIR}/studio-vrm-pose-solver.ts#solvePoseToVrmBones`],
    },
    {
      feature: t("캐릭터 생성 · VRM 내보내기", "Character generation · VRM export"),
      role: t(
        "생성형 캐릭터는 필수 15본에 손가락 30본을 얹은 리그로 만들고, 필수 뼈가 빠지면 내보내기를 거부합니다.",
        "Generated characters get a rig of the 15 required bones plus 30 finger bones, and export is refused if a required bone is missing.",
      ),
      paths: [`${VRM_DIR}/studio-vrm-humanoid-rig.ts#STUDIO_VRM_RIG_BONES`, `${VRM_DIR}/studio-vrm-export-vrm-extension.ts`],
    },
    {
      feature: t("VRM 불러오기", "VRM loading"),
      role: t(
        "VRMLoaderPlugin으로 읽고, 0.x 파일은 회전을 보정하며, 라이선스 메타를 읽어 둡니다.",
        "Reads files with VRMLoaderPlugin, fixes the rotation of 0.x files, and records the license metadata.",
      ),
      paths: [`${VRM_DIR}/studio-vrm-asset-runtime.ts#loadStudioVrmAsset`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("표준 뼈 이름으로 포즈 입히기", "Applying a pose by standard bone name"),
      language: "ts",
      code: `import type { VRM, VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";

type Rotation = [number, number, number, number]; // x, y, z, w 쿼터니언

/** 이름이 표준이라 어느 캐릭터에든 같은 포즈를 입힐 수 있다. 없는 뼈는 건너뛴다. */
export function applyPose(vrm: VRM, rotations: Partial<Record<VRMHumanBoneName, Rotation>>): void {
  const pose: VRMPose = {};
  for (const [name, rotation] of Object.entries(rotations) as [VRMHumanBoneName, Rotation][]) {
    if (vrm.humanoid.getNormalizedBoneNode(name)) pose[name] = { rotation };
  }
  vrm.humanoid.setNormalizedPose(pose); // 기준 자세 대비 변화량으로 적용된다
}`,
      codeEn: `import type { VRM, VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";

type Rotation = [number, number, number, number]; // x, y, z, w quaternion

/** Names are standard, so one pose fits any character. Bones a model lacks are skipped. */
export function applyPose(vrm: VRM, rotations: Partial<Record<VRMHumanBoneName, Rotation>>): void {
  const pose: VRMPose = {};
  for (const [name, rotation] of Object.entries(rotations) as [VRMHumanBoneName, Rotation][]) {
    if (vrm.humanoid.getNormalizedBoneNode(name)) pose[name] = { rotation };
  }
  vrm.humanoid.setNormalizedPose(pose); // applied as change from the rest pose
}`,
      explain: t(
        "three-vrm의 정규화 뼈는 모델이 달라도 기준 자세가 같아서, 이름과 회전값만 있으면 포즈를 옮길 수 있습니다. ToonStudio의 포즈 소재도 같은 규약(기준 자세 대비 변화량)을 저장 형식으로 씁니다.",
        "three-vrm's normalized bones share one rest baseline across models, so a name plus a rotation is enough to move a pose. ToonStudio's pose material uses the same convention, change from the rest pose, as its storage format.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("필수 뼈 15개 완결성 검사", "Completeness check for the 15 required bones"),
      language: "ts",
      code: `const REQUIRED_BONES = [
  "hips", "spine", "head",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand",
] as const;

/** 필수 뼈가 하나라도 빠졌으면 VRM으로 내보내지 않는다(빈 뼈를 몰래 채우지 않는다). */
export function assertCompleteHumanoid(humanBones: Readonly<Record<string, number | undefined>>): void {
  const missing = REQUIRED_BONES.filter((name) => humanBones[name] === undefined);
  if (missing.length > 0) throw new Error(\`humanoid-bone-missing: \${missing.join(", ")}\`);
}`,
      codeEn: `const REQUIRED_BONES = [
  "hips", "spine", "head",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand",
] as const;

/** If any required bone is missing, do not export VRM (never fill in empty bones silently). */
export function assertCompleteHumanoid(humanBones: Readonly<Record<string, number | undefined>>): void {
  const missing = REQUIRED_BONES.filter((name) => humanBones[name] === undefined);
  if (missing.length > 0) throw new Error(\`humanoid-bone-missing: \${missing.join(", ")}\`);
}`,
      explain: t(
        "내보내기 직전에 필수 뼈 목록과 대조해 하나라도 없으면 오류를 냅니다. 불완전한 VRM이 다른 앱에서 몸이 꺾인 채 열리는 일을 만들지 않으려는 관문입니다.",
        "Just before export it compares against the required list and raises an error if any bone is absent. This gate keeps an incomplete VRM from opening with a twisted body in another app.",
      ),
      source: `${VRM_DIR}/studio-vrm-export-vrm-extension.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "VRM Consortium · vrm.dev",
      url: "https://vrm.dev/",
      kind: "docs",
      note: t("VRM 형식과 라이선스 소개", "Introduction to the VRM format and licenses"),
    },
    {
      title: "VRM specification · VRMC_vrm-1.0",
      url: "https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0",
      kind: "spec",
      note: t("휴머노이드 뼈 목록과 표정 프리셋 정의", "Defines the humanoid bone list and expression presets"),
    },
    {
      title: "pixiv · three-vrm",
      url: "https://github.com/pixiv/three-vrm",
      kind: "repo",
      note: t("three.js에서 VRM을 읽고 정규화 뼈를 다루는 라이브러리", "The library that loads VRM into three.js and handles normalized bones"),
    },
  ],
  chapterIds: ["web-3d-engine"],
  talk: {
    pitch: t(
      "VRM은 3D 캐릭터의 뼈에 '팔꿈치', '무릎' 같은 표준 이름표를 붙이는 약속입니다. ToonStudio의 포즈 도구, 손발 IK, 웹캠 추적이 모두 이 이름표를 공통 언어로 써서, 캐릭터를 바꿔도 같은 동작이 그대로 적용됩니다. 앱에 번들된(apps/web/public/vrm) VRM은 113개이고, 파일을 쓸 때도 필수 뼈 15개가 갖춰졌는지 먼저 검사합니다.",
      "VRM is an agreement to put standard labels like elbow and knee on the bones of 3D characters. ToonStudio's pose tool, hand-and-foot IK and webcam tracking all use those labels as a common language, so the same motion applies when the character changes. 113 VRMs are bundled with the app (apps/web/public/vrm), and when writing a file the app first checks that all 15 required bones are present.",
    ),
    analogy: t(
      "누구에게나 '오른팔'은 오른팔인 것처럼, 모든 캐릭터에 같은 부위 이름표를 붙인 지도입니다.",
      "Just as a right arm is a right arm on anyone, it is a map that gives every character the same body-part labels.",
    ),
    questions: [
      {
        question: t("모델마다 관절이 다르면 어떻게 되나요?", "What if joints differ between models?"),
        answer: t(
          "표준은 이름과 연결 구조까지만 보장합니다. 관절 가동 범위와 표정 구성은 모델마다 달라서, ToonStudio는 관절 한계 표(부드러운 한계·하드 한계)를 두고 모델별로 검증해야 한다고 안내합니다.",
          "The standard guarantees names and hierarchy only. Joint ranges and expression sets differ, so ToonStudio keeps a joint-limit table (soft and hard limits) and says each model still needs its own validation.",
        ),
      },
      {
        question: t("VRM 0.x 파일도 되나요?", "Do VRM 0.x files work?"),
        answer: t(
          "읽을 때는 회전 보정(rotateVRM0)을 거쳐 열 수 있고, 새로 만드는 파일은 1.0만 씁니다.",
          "They open after a rotation fix (rotateVRM0), but new files are written as VRM 1.0 only.",
        ),
      },
      {
        question: t("뼈 이름이 왜 55개 허용 목록인가요?", "Why an allowlist of 55 bone names?"),
        answer: t(
          "저장된 포즈나 외부 파일이 임의의 노드 이름을 가리키지 못하게 하려는 안전장치입니다. VRM 1.0의 휴머노이드 어휘만 받습니다.",
          "It is a safeguard so a saved pose or an external file cannot address arbitrary node names. Only the VRM 1.0 humanoid vocabulary is accepted.",
        ),
      },
    ],
    pitfall: t(
      "'VRM이면 모든 캐릭터가 똑같이 움직인다'고 말하지 마세요. 이름과 뼈대 구조가 같을 뿐 체형·관절 한계·표정은 모델마다 다릅니다. 또 파일을 열 수 있는 것과 작품에 쓸 수 있는 것은 별개의 질문입니다(라이선스 메타 게이트).",
      "Do not say every character moves identically just because it is VRM. Only names and hierarchy are shared; body shape, joint limits and expressions differ per model. Also, being able to open a file is a different question from being allowed to use it in a work (the license-metadata gate).",
    ),
  },
  technologies: ["VRM", "@pixiv/three-vrm", "Three.js", "GLB / glTF"],
  facts: [
    { value: "55", label: t("허용 목록의 휴머노이드 뼈 이름 수", "Humanoid bone names in the allowlist"), source: `${CREATOR_DIR}/studio-humanoid-bones.ts` },
    { value: "15", label: t("VRM 필수 뼈 수", "Required VRM bones"), source: `${VRM_DIR}/studio-vrm-export-vrm-extension.ts` },
    { value: "45", label: t("생성형 리그의 뼈 수(필수 15 + 손가락 30)", "Bones in the generated rig (15 required + 30 finger)"), source: `${VRM_DIR}/studio-vrm-humanoid-rig.ts` },
    { value: "113", label: t("앱에 번들된(apps/web/public/vrm) VRM 파일 수", "VRM files bundled with the app (apps/web/public/vrm)"), source: "apps/web/public/vrm" },
  ],
  reviewedAt: "2026-10-07",
};

export const MEDIAPIPE_WEBCAM_POSE: EngineeringAtlasEntry = {
  id: "mediapipe-webcam-pose",
  category: "three-d",
  name: "MediaPipe Tasks Vision",
  title: t("웹캠이 본 얼굴과 몸짓을 브라우저 안에서 캐릭터 동작으로", "Turning what the webcam sees into character motion, inside the browser"),
  status: "live",
  tagline: t(
    "얼굴 표정·머리·상체·손가락을 웹캠으로 읽어 VRM 캐릭터에 실시간으로 옮깁니다.",
    "Reads face, head, body and fingers from a webcam and moves a VRM character in real time.",
  ),
  background: [
    t(
      "웹캠 영상을 '고개가 어디를 향하고 팔이 어디에 있는지'라는 숫자로 바꿔 읽는 기술입니다. 인형극에서 내 손짓을 인형이 따라 하듯, 내가 고개를 끄덕이고 눈을 깜빡이면 화면의 캐릭터가 같은 동작을 합니다. 영상을 읽는 일은 서버가 아니라 내 브라우저 안(WASM과 GPU)에서 일어나고, 추적 코드에는 영상 프레임을 올리는 네트워크 호출이 없습니다. 다만 인식 모델 파일(.task)은 Google 저장소에서 내려받습니다.",
      "It converts webcam video into numbers for where the head points and where the arms are. Like a puppet copying your hand, the on-screen character nods and blinks when you do. Reading the video happens in your browser (WASM and GPU), not on a server, and the tracking code has no network call that uploads video frames. The recognition model files (.task), however, are downloaded from a Google storage bucket.",
    ),
    t(
      "한 프레임이 지나는 길은 이렇습니다. ① MediaPipe 모델 세 개가 얼굴(표정 수치와 머리 회전 행렬)·몸(관절 33점)·손(21점)을 찾고 ② 중립 자세를 20프레임 재서 오프셋으로 빼고 ③ One-Euro 필터로 떨림을 지우고 ④ 눈 깜빡임은 히스테리시스(열림·닫힘 기준을 다르게 두는 방식)로 안정시킨 뒤 ⑤ VRM 표준 뼈의 회전값과 표정 값으로 바꿔 캐릭터에 적용합니다. 이 순서는 코드에 주석으로 고정돼 있습니다.",
      "A frame travels like this. (1) Three MediaPipe models find the face (expression scores and a head-rotation matrix), body (33 joints) and hands (21 points). (2) A neutral pose measured over 20 frames is subtracted as an offset. (3) A One-Euro filter removes jitter. (4) Blinks are stabilized with hysteresis, using different thresholds for opening and closing. (5) Everything becomes VRM standard-bone rotations and expression values on the character. This order is fixed by comments in the code.",
    ),
    t(
      "고정 비율 평균은 천천히 움직일 때 떨리고 빠르게 움직일 때 늦는 절충이 고정되어, 속도에 따라 필터 세기가 바뀌는 One-Euro 필터로 바꿨습니다. 기기가 느리면 추론 시간 중앙값이 34ms를 넘을 때 품질 단계를 낮추고(손은 격프레임, 그다음 손 끄기와 포즈 격프레임), 20ms 아래가 4초 이어지면 한 단계씩 올립니다. MediaPipe를 고른 이유는 얼굴·몸·손을 같은 런타임에서 브라우저로 돌릴 수 있고 WASM을 같은 출처에 둘 수 있어서입니다. 다른 추적 라이브러리와의 비교 평가 문서는 저장소에서 확인하지 못했습니다.",
      "A fixed-ratio average is stuck with a trade-off: jittery when slow, laggy when fast. So the filter was replaced with One-Euro, whose strength changes with speed. On slow devices the quality tier drops when the median inference time exceeds 34 ms (hands every other frame, then hands off and pose every other frame) and rises one step after 4 seconds below 20 ms. MediaPipe was chosen because face, body and hands run in one browser runtime and its WASM can be served from the same origin. No comparison against other tracking libraries was found in the repository.",
    ),
    t(
      "한계도 분명합니다. 웹캠 한 대로는 가려진 관절과 빠른 동작이 부정확하고, 앞뒤(깊이) 값은 노이즈가 커서 0.85배로 줄여 씁니다. 실제 기기·브라우저별 프레임 시간과 발열 측정은 아직 없어 '구현됨, 기기 매트릭스는 미증명' 상태입니다. 프로덕션 보안 정책(CSP)이 외부 스크립트와 WASM 실행을 막으므로 WASM은 같은 출처의 해시 파일로 쓰고, 지원되면 SIMD 빌드를 한 번만 고릅니다.",
      "The limits are clear too. One webcam is inaccurate for hidden joints and fast motion, and the depth value is noisy, so it is damped to 0.85. Frame-time and thermal measurements on real devices and browsers do not exist yet, so the status is implemented, device matrix unproven. The production security policy (CSP) blocks external scripts and WASM execution, so the WASM is served as same-origin hashed files, and the SIMD build is chosen once when supported.",
    ),
  ],
  keyPoints: [
    t("영상은 브라우저 안에서 읽습니다(추적 코드에 업로드 호출 없음)", "Video is read in the browser; the tracking code has no upload call"),
    t("원본 → 보정 → One-Euro → 깜빡임 → VRM 변환 순서를 고정했습니다", "Fixed order: raw, calibration, One-Euro, blink, VRM conversion"),
    t("느린 기기는 손 추적부터 줄이는 3단계 품질을 씁니다", "Three quality tiers cut hand tracking first on slow devices"),
    t("모델 파일 3종은 외부에서 받고 해시 고정은 없습니다", "The three model files come from outside and are not hash-pinned"),
  ],
  diagram: {
    id: "mediapipe-webcam-pose-diagram",
    kind: "graph",
    title: t("웹캠 한 프레임이 캐릭터 동작이 되기까지", "From one webcam frame to character motion"),
    caption: t(
      "영상은 기기 안에서만 흐르고, 바깥에서 오는 것은 모델 파일뿐입니다.",
      "Video flows only inside the device; the only thing coming from outside is the model files.",
    ),
    alt: t(
      "웹캠 프레임이 MediaPipe 세 모델에 들어가 채널 값이 되고, 중립 보정과 One-Euro 필터, 깜빡임 안정화를 거쳐 VRM의 뼈와 표정에 적용됩니다. MediaPipe 아래에는 추론 시간을 재서 품질 단계를 조절하는 판단이 있고, 위에는 모델 파일을 내려받는 외부 저장소가 있습니다.",
      "A webcam frame enters the three MediaPipe models and becomes channel values, then passes through neutral calibration, a One-Euro filter and blink stabilization before landing on the VRM's bones and expressions. Below MediaPipe a decision measures inference time to adjust the quality tier, and above it an external bucket supplies the model files.",
    ),
    nodes: [
      { id: "model", label: t("모델 파일 3종", "3 model files"), sub: t("storage.googleapis.com", "storage.googleapis.com"), tone: "external", shape: "cloud", at: [1, 0] },
      { id: "cam", label: t("웹캠", "Webcam"), sub: t("640×480 · 30fps 요청", "640x480 at 30 fps requested"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "mp", label: t("MediaPipe 3종", "MediaPipe x3"), sub: t("얼굴·몸·손 (WASM/GPU)", "Face, body, hands (WASM/GPU)"), tone: "ai", at: [1, 1] },
      { id: "cal", label: t("중립 보정", "Calibration"), sub: t("20프레임 오프셋", "20-frame offset"), tone: "local", at: [2, 1] },
      { id: "euro", label: t("One-Euro", "One-Euro"), sub: t("떨림↓ 지연↓", "Less jitter, less lag"), tone: "local", at: [3, 1] },
      { id: "blink", label: t("깜빡임 안정화", "Blink filter"), sub: t("닫힘 0.5 · 열림 0.35", "close 0.5, open 0.35"), tone: "local", at: [4, 1] },
      { id: "vrm", label: t("VRM 뼈·표정", "VRM bones, faces"), sub: t("좌우 반전은 한 곳에서", "Mirror flip in one place"), tone: "good", at: [5, 1] },
      { id: "tier", label: t("34ms 초과?", "Over 34 ms?"), tone: "warn", shape: "diamond", at: [1, 2] },
    ],
    edges: [
      { from: "model", to: "mp", label: t("내려받기", "download"), style: "dashed" },
      { from: "cam", to: "mp", label: t("프레임", "frames") },
      { from: "mp", to: "cal", label: t("채널 15개", "15 channels") },
      { from: "cal", to: "euro", label: t("보정값", "offsets") },
      { from: "euro", to: "blink", label: t("평활값", "smoothed") },
      { from: "blink", to: "vrm", label: t("본·표정", "bones, faces") },
      { from: "mp", to: "tier", label: t("추론 시간", "inference time"), both: true },
    ],
    groups: [
      {
        id: "device",
        label: t("내 기기 안에서 처리", "Processed on your device"),
        tone: "local",
        nodeIds: ["cam", "mp", "cal", "euro", "blink", "vrm", "tier"],
      },
    ],
  },
  usage: [
    {
      feature: t("3D 캐릭터 편집기 · 웹캠 모션", "3D character editor · webcam motion"),
      role: t(
        "웹캠을 켜면 얼굴 표정·머리·상체·하체·손가락이 VRM 캐릭터에 실시간 반영됩니다. 탭이 숨겨지면 카메라를 끄고, 돌아오면 다시 켭니다.",
        "Turning the webcam on mirrors face, head, upper and lower body and fingers onto the VRM character in real time. The camera is released when the tab is hidden and restarted on return.",
      ),
      paths: [
        `${VRM_DIR}/use-studio-vrm-webcam-session.ts#useStudioVrmWebcamSession`,
        `${VRM_DIR}/studio-vrm-webcam-tracking.ts`,
        `${VRM_DIR}/studio-vrm-pose-solver.ts#solvePoseToVrmBones`,
      ],
      route: "/studio/poser",
    },
    {
      feature: t("떨림·깜빡임·중립 보정", "Jitter, blink and neutral calibration"),
      role: t(
        "채널 15개마다 One-Euro 필터를 따로 두고, 깜빡임은 히스테리시스로 안정시키며, 중립 자세 오프셋은 SQLite/OPFS에 저장합니다(실패하면 탭 메모리에만 적용).",
        "Each of 15 channels has its own One-Euro filter, blinks are stabilized by hysteresis, and the neutral-pose offset is saved to SQLite/OPFS (applied to the tab only if saving fails).",
      ),
      paths: [
        `${VRM_DIR}/studio-vrm-one-euro.ts`,
        `${VRM_DIR}/studio-vrm-blink-stabilizer.ts`,
        `${VRM_DIR}/studio-vrm-tracking-calibration.ts`,
        `${VRM_DIR}/studio-vrm-tracking-calibration-sqlite-repository.ts`,
      ],
    },
    {
      feature: t("적응형 품질 단계", "Adaptive quality tiers"),
      role: t(
        "추론 시간 중앙값으로 full·reduced·minimal 세 단계를 오갑니다. 저사양 기기는 reduced에서 시작합니다.",
        "Moves between full, reduced and minimal tiers using the median inference time. Low-end devices start at reduced.",
      ),
      paths: [`${VRM_DIR}/studio-vrm-tracking-quality.ts#AdaptiveQualityController`],
    },
    {
      feature: t("MediaPipe 자산 정책", "MediaPipe asset policy"),
      role: t(
        "운영 보안 정책이 외부 스크립트·WASM을 막으므로 WASM을 같은 출처로 쓰고, SIMD 지원 여부로 한 번만 고르며, 초기화를 한 줄로 세웁니다.",
        "Because production security policy blocks external scripts and WASM, it serves WASM from the same origin, picks SIMD once, and queues initialization one at a time.",
      ),
      paths: [
        `${CREATOR_DIR}/studio-mediapipe-vision-assets.ts`,
        `${CREATOR_DIR}/studio-mediapipe-vision-init-arbiter.ts`,
        "apps/web/public/_headers",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("One-Euro 필터: 가만히 있으면 부드럽게, 빠르면 날렵하게", "One-Euro filter: smooth when still, snappy when fast"),
      language: "ts",
      code: `const alpha = (cutoffHz: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz) / dt);

export class OneEuro {
  private t = NaN;
  private x = 0;
  private dx = 0;
  constructor(private minCutoff = 1.5, private beta = 0.3, private dCutoff = 1) {}

  /** 시간은 초 단위 실제 시간이어야 한다. 프레임 번호를 넣으면 가변 fps에서 왜곡된다. */
  filter(value: number, tSec: number): number {
    if (Number.isNaN(this.t)) {
      this.t = tSec;
      this.x = value;
      return value;
    }
    const dt = tSec - this.t;
    if (dt <= 0) return this.x; // 시간이 멈추거나 거꾸로 가면 이전 출력을 유지
    this.dx += ((value - this.x) / dt - this.dx) * alpha(this.dCutoff, dt); // 평활한 속도
    this.x += (value - this.x) * alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt);
    this.t = tSec;
    return this.x;
  }
}`,
      codeEn: `const alpha = (cutoffHz: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz) / dt);

export class OneEuro {
  private t = NaN;
  private x = 0;
  private dx = 0;
  constructor(private minCutoff = 1.5, private beta = 0.3, private dCutoff = 1) {}

  /** Time must be real seconds. A frame index would distort the cutoff at variable fps. */
  filter(value: number, tSec: number): number {
    if (Number.isNaN(this.t)) {
      this.t = tSec;
      this.x = value;
      return value;
    }
    const dt = tSec - this.t;
    if (dt <= 0) return this.x; // if time stalls or runs backwards, keep the previous output
    this.dx += ((value - this.x) / dt - this.dx) * alpha(this.dCutoff, dt); // smoothed speed
    this.x += (value - this.x) * alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt);
    this.t = tSec;
    return this.x;
  }
}`,
      explain: t(
        "빠르게 움직일수록 컷오프가 올라가 지연이 줄고, 멈추면 컷오프가 낮아 떨림이 사라집니다. 저장소는 머리(1.5/0.3)·표정 수치(1.2/0.05)·시선(0.8/0.01)에 서로 다른 minCutoff/beta를 씁니다.",
        "The faster the motion, the higher the cutoff and the smaller the lag; when still, a low cutoff removes jitter. The repository uses different minCutoff/beta pairs for head (1.5/0.3), expression scores (1.2/0.05) and gaze (0.8/0.01).",
      ),
      source: `${VRM_DIR}/studio-vrm-one-euro.ts`,
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("브라우저 안에서 표정 점수 읽기", "Reading expression scores inside the browser"),
      language: "ts",
      code: `import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/** 영상은 이 브라우저 안에서만 읽는다. 새 비디오 프레임이 나올 때만 깨어나 추론한다. */
export async function trackFace(video: HTMLVideoElement, onScores: (scores: Map<string, number>) => void) {
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm"); // 같은 출처의 WASM 폴더
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
    numFaces: 1,
  });
  const loop = () => {
    const result = landmarker.detectForVideo(video, performance.now()); // 시간은 단조 증가해야 한다
    const scores = new Map<string, number>();
    for (const c of result.faceBlendshapes[0]?.categories ?? []) scores.set(c.categoryName, c.score);
    onScores(scores); // 예: scores.get("eyeBlinkLeft"), scores.get("jawOpen")
    video.requestVideoFrameCallback(loop);
  };
  video.requestVideoFrameCallback(loop);
}`,
      codeEn: `import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/** Video is read only inside this browser. It wakes for inference only when a new video frame arrives. */
export async function trackFace(video: HTMLVideoElement, onScores: (scores: Map<string, number>) => void) {
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm"); // same-origin WASM folder
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
    numFaces: 1,
  });
  const loop = () => {
    const result = landmarker.detectForVideo(video, performance.now()); // time must be monotonic
    const scores = new Map<string, number>();
    for (const c of result.faceBlendshapes[0]?.categories ?? []) scores.set(c.categoryName, c.score);
    onScores(scores); // e.g. scores.get("eyeBlinkLeft"), scores.get("jawOpen")
    video.requestVideoFrameCallback(loop);
  };
  video.requestVideoFrameCallback(loop);
}`,
      explain: t(
        "실제 코드는 모델을 Google 저장소 주소로 받지만, 이 예제는 같은 출처 경로로 단순화했습니다. 점수 이름(eyeBlinkLeft, jawOpen 등)이 곧 캐릭터 표정 채널의 재료가 됩니다.",
        "The real code downloads models from a Google bucket address; this sample simplifies that to a same-origin path. Score names such as eyeBlinkLeft and jawOpen become the raw material for the character's expression channels.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "Google AI Edge · Face Landmarker (Web)",
      url: "https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js",
      kind: "docs",
      note: t("얼굴 랜드마크·표정 점수를 웹에서 쓰는 법", "Using face landmarks and expression scores on the web"),
    },
    {
      title: "Google AI Edge · Pose Landmarker (Web)",
      url: "https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js",
      kind: "docs",
      note: t("몸 관절 33점과 worldLandmarks", "33 body joints and worldLandmarks"),
    },
    {
      title: "Google AI Edge · Hand Landmarker (Web)",
      url: "https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js",
      kind: "docs",
    },
    {
      title: "1€ Filter · Casiez, Roussel, Vogel",
      url: "https://gery.casiez.net/1euro/",
      kind: "article",
      note: t("One-Euro 필터의 원 논문과 구현", "The original paper and implementations of the One-Euro filter"),
    },
    {
      title: "MDN · HTMLVideoElement.requestVideoFrameCallback()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback",
      kind: "docs",
      note: t("새 비디오 프레임에만 깨어나는 루프", "A loop that wakes only for new video frames"),
    },
  ],
  chapterIds: ["web-3d-engine", "on-device-inference", "browser-local-compute"],
  talk: {
    pitch: t(
      "웹캠을 켜면 얼굴 표정, 고개, 팔과 다리, 손가락까지 내 움직임이 VRM 캐릭터에 실시간으로 옮겨집니다. 영상을 읽는 AI는 서버가 아니라 내 브라우저 안에서 돌고, 추적 코드에는 영상을 올리는 호출이 없습니다. 떨림은 속도에 맞춰 세기가 바뀌는 필터로 지우고, 기기가 느리면 손 추적부터 줄여 끊김을 막습니다.",
      "Turn on the webcam and your expression, head, arms, legs and even fingers move a VRM character in real time. The AI that reads the video runs inside your browser, not on a server, and the tracking code has no call that uploads video. Jitter is removed by a filter whose strength follows your speed, and on a slow device hand tracking is reduced first to avoid stutter.",
    ),
    analogy: t(
      "내 동작을 인형의 관절 언어로 통역해 주는 실시간 통역사입니다. 통역이 더듬지 않게 앞뒤 말을 다듬는 일이 필터입니다.",
      "A live interpreter that translates my movements into the puppet's joint language. The filter is what smooths the phrasing so the interpreter does not stammer.",
    ),
    questions: [
      {
        question: t("내 얼굴 영상이 서버로 가나요?", "Does my face video go to a server?"),
        answer: t(
          "추적은 브라우저 안(WASM/GPU)에서 하고, 추적 코드에는 영상을 올리는 네트워크 호출이 없습니다. 다만 인식 모델 파일은 Google 저장소에서 내려받습니다. 영상이 아니라 모델이 내려옵니다. 탭이 숨겨지면 카메라도 꺼집니다.",
          "Tracking runs in the browser (WASM/GPU) and the tracking code has no network call that uploads video. The recognition model files are downloaded from a Google bucket, so the model comes down, not the video. The camera is also released when the tab is hidden.",
        ),
      },
      {
        question: t("왜 MediaPipe인가요?", "Why MediaPipe?"),
        answer: t(
          "얼굴·몸·손을 같은 런타임으로 브라우저에서 돌릴 수 있고, WASM을 같은 출처에 두어 운영 보안 정책을 지킬 수 있습니다. 다른 라이브러리와의 비교 평가 문서는 저장소에서 확인하지 못했습니다.",
          "Face, body and hands run in one browser runtime, and the WASM can sit on the same origin to respect the production security policy. No comparison document against other libraries was found in the repository.",
        ),
      },
      {
        question: t("단순 평균 대신 One-Euro를 쓴 이유는?", "Why One-Euro instead of a simple average?"),
        answer: t(
          "고정 평균은 떨림을 줄이면 빠른 동작이 늦어지고, 빠른 동작을 살리면 떨립니다. One-Euro는 속도가 빠를수록 필터를 약하게 해서 둘 사이의 절충을 자동으로 바꿉니다.",
          "A fixed average either lags on fast motion when it removes jitter or jitters when it keeps fast motion. One-Euro weakens the filter as speed rises, shifting that trade-off automatically.",
        ),
      },
    ],
    pitfall: t(
      "'모든 AI 모델은 해시로 고정'이라고 말하면 틀립니다. 얼굴·포즈·손 모델 3종은 바이트 길이나 SHA-256 고정이 없고, 같은 앱의 이미지 임베더만 고정돼 있습니다. 실제 기기·브라우저별 프레임 시간과 발열 측정도 문서상 미완료이므로 '구현됨, 기기 매트릭스는 미증명'으로 말하세요.",
      "Saying every AI model is hash-pinned would be wrong: the three face, pose and hand models have no byte-length or SHA-256 pin, and only the app's image embedder is pinned. Frame-time and thermal measurements per real device and browser are also marked incomplete in the docs, so say implemented, device matrix unproven.",
    ),
  },
  technologies: ["MediaPipe Tasks Vision", "getUserMedia", "WebAssembly", "VRM", "SQLite WASM", "OPFS"],
  facts: [
    { value: "34 ms", label: t("추론 시간 중앙값이 이를 넘으면 품질을 한 단계 낮춤", "Median inference time above which quality drops one tier"), source: `${VRM_DIR}/studio-vrm-tracking-quality.ts` },
    { value: "20 frames", label: t("중립 자세 보정에 쓰는 프레임 수", "Frames measured for neutral-pose calibration"), source: `${VRM_DIR}/studio-vrm-tracking-calibration.ts` },
    { value: "0.10.35", label: t("앱이 직접 쓰는 @mediapipe/tasks-vision 설치 버전(lock 파일 기준, drei 가 끌어오는 0.10.17 은 별도)", "Installed @mediapipe/tasks-vision version the app uses directly (per the lockfile; the 0.10.17 pulled in by drei is separate)"), source: "pnpm-lock.yaml" },
  ],
  reviewedAt: "2026-10-07",
};

/** three-d 카테고리의 캐릭터 계열 카드. */
export const THREE_D_CHARACTER_CARDS: readonly EngineeringAtlasEntry[] = [VRM_HUMANOID_RIG, MEDIAPIPE_WEBCAM_POSE];
