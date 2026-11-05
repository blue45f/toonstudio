import { OPEN_SOURCE_ROWS } from "./engineering-map-open-source-rows";
import type { EngineeringMap } from "./engineering-map-types";

/**
 * 기술 지도 · open-source — 서비스에 쓰인 오픈소스 전체 지도. 계약과 작성 규칙은 engineering-map-types.ts 를 따른다.
 * 행 데이터는 engineering-map-open-source-rows.ts 에 있다(2026-10-07 스냅샷에 2026-11-05 두 외부 의존성 제거 반영).
 */
export const ENGINEERING_MAP_OPEN_SOURCE: EngineeringMap = {
  id: "open-source",
  title: { ko: "서비스에 쓰인 오픈소스 지도", en: "Open-source map of the service" },
  intro: {
    ko: "2026-10-07에 측정한 직접 의존성 스냅샷 117개에서 2026-11-05 외부 Mixbox와 wasm-vips를 제거해 현재 이 목록에는 115개가 남아 있습니다. 전체 직접 의존성을 새로 수집한 수치는 아닙니다. 이 표는 그중 역할이 큰 것을 묶음으로 보여 주며, 무엇을 하는지·어떤 라이선스(사용 조건)인지·어떻게 연결했는지·우리가 무엇을 고쳤는지를 담았습니다. QR·모바일 셸 같은 작은 부품은 빌드가 만드는 전체 라이브러리 고지에 있습니다.",
    en: "The direct-dependency snapshot measured on 2026-10-07 contained 117 packages; this list now retains 115 after removing external Mixbox and wasm-vips on 2026-11-05. This is an updated historical snapshot, not a fresh census of all current direct dependencies. This table groups the ones with the biggest roles and shows what each does, its license (terms of use), how it is wired in and what we changed. Small parts such as QR codes or the mobile shell are in the full library notices the build generates.",
  },
  takeaway: {
    ko: "오픈소스를 쓰기만 하지 않고 지연 로드·Worker로 격리하고, 버전과 해시로 고정하고, 필요한 곳은 패치 7개와 포크 2개(wgpu-toon·braces)로 고쳐 쓰며, 아직 확인하지 못한 라이선스 지점은 숨기지 않고 표시합니다.",
    en: "We do not just consume open source: we isolate it with lazy loading and Workers, pin it by version and hash, adapt it with 7 patches and two forks (wgpu-toon and braces) where needed, and mark license points we have not verified instead of hiding them.",
  },
  columns: [
    { id: "role", label: { ko: "무엇을 하나 · 쓰인 곳", en: "What it does · where it is used" } },
    { id: "license", label: { ko: "라이선스(SPDX)", en: "License (SPDX)" }, narrow: true },
    { id: "mode", label: { ko: "연결 방식", en: "How it is wired" }, narrow: true },
    { id: "note", label: { ko: "주의 · 대안 · 우리가 한 일", en: "Caveats · alternatives · what we did" } },
  ],
  rows: OPEN_SOURCE_ROWS,
  diagram: {
    id: "open-source-stack-diagram",
    kind: "layers",
    title: { ko: "오픈소스 스택 한눈에", en: "The open-source stack at a glance" },
    caption: {
      ko: "여러 층의 오픈소스 위에 서 있고, 무거운 것은 필요할 때만 불러오며 버전과 해시로 고정합니다.",
      en: "The service stands on layers of open source; heavy parts load only when needed and are pinned by version and hash.",
    },
    alt: {
      ko: "위에서 아래로 여섯 층입니다. 앱 기반(React, NestJS), 협업·저장(Yjs, SQLite WASM), 2D 편집·렌더(Konva, CanvasKit, Hokusai), 3D(three.js, Babylon.js), AI·비전(ONNX Runtime Web, MediaPipe), 출력·변환(자체 Lanczos3, Remotion) 순서이며, 층마다 대표 오픈소스를 칩으로 보여 줍니다.",
      en: "Six layers from top to bottom: app foundation (React, NestJS), collaboration and storage (Yjs, SQLite WASM), 2D editing and rendering (Konva, CanvasKit, Hokusai), 3D (three.js, Babylon.js), AI and vision (ONNX Runtime Web, MediaPipe) and output and conversion (ToonStudio Lanczos3, Remotion). Each layer shows its representative open-source projects as chips.",
    },
    layers: [
      {
        id: "foundation",
        label: { ko: "앱 기반", en: "App foundation" },
        sub: { ko: "화면·서버 뼈대와 개발 도구", en: "Screens, server and dev tools" },
        tone: "neutral",
        chips: ["React", "Vite", "Zustand", "Zod", "NestJS", "Drizzle ORM"],
      },
      {
        id: "collaboration-storage",
        label: { ko: "협업·저장", en: "Collaboration and storage" },
        sub: { ko: "함께 편집하고 기기 안에 저장", en: "Co-editing and on-device storage" },
        tone: "server",
        chips: ["Yjs", "Automerge", "Socket.IO", "SQLite WASM", "multiformats"],
      },
      {
        id: "two-d",
        label: { ko: "2D 편집·렌더", en: "2D editing and rendering" },
        sub: { ko: "캔버스·브러시·벡터 계산", en: "Canvas, brushes and vector math" },
        tone: "local",
        chips: ["Konva", "CanvasKit", "PixiJS", "perfect-freehand", "Hokusai", "Paper.js"],
      },
      {
        id: "three-d",
        label: { ko: "3D", en: "3D" },
        sub: { ko: "장면·캐릭터·모델 가공", en: "Scenes, characters and model processing" },
        tone: "local",
        chips: ["Three.js", "Babylon.js", "glTF Transform", "Manifold", "Rapier", "OpenCascade.js"],
      },
      {
        id: "ai-vision",
        label: { ko: "AI·비전", en: "AI and vision" },
        sub: { ko: "기기 안에서 도는 AI와 영상 분석", en: "On-device AI and image analysis" },
        tone: "ai",
        chips: ["ONNX Runtime Web", "Transformers.js", "MediaPipe", "OpenCV.js"],
      },
      {
        id: "output-conversion",
        label: { ko: "출력·변환", en: "Output and conversion" },
        sub: { ko: "내보내기·파일 형식·영상", en: "Export, file formats and video" },
        tone: "neutral",
        chips: ["ToonStudio Lanczos3", "ag-psd", "pdf-lib", "Remotion"],
      },
    ],
  },
  notes: [
    {
      ko: "라이선스 열은 법률 판단이 아니라 저장소가 설치본 package.json과 문서에 기록한 SPDX 라벨입니다. 법적 적합성은 이 표로 결론 내지 않습니다.",
      en: "The license column is not legal advice; it shows the SPDX labels the repository records in installed package.json files and docs. This table does not decide legal compliance.",
    },
    {
      ko: "2026-11-05 변경에서 외부 Mixbox 의존성을 제거하고 자체 잠재 안료로 연결했습니다. 실행 프로필 검사와 빌드 산출물 검사는 별개입니다. 과거 wasm-vips는 래퍼만 MIT이고 내장 libvips 등은 LGPL이었습니다. 현재 축소 기능은 표준 수식으로 독립 구현한 자체 Lanczos3로 이관했으며, 2026-11-05 고지 수집 수정도 완료했습니다. Remotion 4.0.536은 설명된 개인·1인 운영 전제에서 무료 상업 사용이 가능해 유지합니다. 조직 전체 인원은 독립 검증하지 않았습니다.",
      en: "The 2026-11-05 change removes the external Mixbox dependency and connects the project-authored latent pigment engine. Runtime profile validation and build artifact inspection are separate checks. Former wasm-vips use involved an MIT wrapper with bundled LGPL libraries. Current downscaling uses first-party Lanczos3 independently authored from standard equations, and the notice collection fix was completed on 2026-11-05. Remotion 4.0.536 is retained for free commercial use under the stated individual, one-person premise. Total organizational headcount was not independently verified.",
    },
    {
      ko: "모델은 코드의 라이선스와 별도로 확인합니다. Tag2Pix 가중치의 비상업·재배포 제한과 Paprika 원본의 비상업 조건 충돌은 배포 차단 두 항목입니다. Face Paint v2는 저자 관리 저장소에서 root MIT와 함께 배포되는 체크포인트로 분류하며, 일부만 공개된 학습 출처는 추가 검토 한 항목으로 남깁니다. 이는 전체 모델의 상용 권리를 해결했다는 뜻이 아닙니다.",
      en: "Model weights are reviewed separately from code licenses. Tag2Pix weight restrictions on commercial use and redistribution and the conflicting upstream non-commercial Paprika terms are two distribution blockers. Face Paint v2 is classified as a checkpoint distributed with the root MIT license in the author's maintained repository; its partially documented training provenance remains one review item. This does not resolve commercial rights for all models.",
    },
    {
      ko: "2026-10-07 스냅샷과 비교한 손으로 쓴 THIRD_PARTY_NOTICES.md는 당시 직접 의존성 117개 중 22개만 실린 부분 목록이었습니다(95개 누락). 현재 설치 라이브러리의 전체 고지는 빌드가 생성합니다(dist/legal/THIRD_PARTY_NOTICES.generated.md, scripts/generate-third-party-notices.mjs).",
      en: "Compared with the 2026-10-07 snapshot, the hand-written THIRD_PARTY_NOTICES.md was a partial list covering 22 of the then-117 direct dependencies (95 missing). The build generates the full notices for currently installed libraries (dist/legal/THIRD_PARTY_NOTICES.generated.md, scripts/generate-third-party-notices.mjs).",
    },
    {
      ko: "'전부 로컬, 전부 고지'는 사실이 아닙니다. MediaPipe 모델은 Google 스토리지에서 런타임에 내려받고(SHA-256 고정은 임베더 1개뿐), 번역 모델(약 123MB)은 배포 때 따로 놓아야 켜지며, Python 추론 서비스의 모델 가중치는 저장소에 없고 라이선스를 수락한 뒤 직접 받습니다.",
      en: "\"Everything local, everything disclosed\" is not true. MediaPipe models are downloaded from Google storage at runtime (only the embedder is pinned by SHA-256), the translation model (about 123 MB) must be placed separately at deploy time, and the Python inference service's model weights are not in the repository and are fetched after accepting their licenses.",
    },
  ],
  reviewedAt: "2026-11-05",
};
