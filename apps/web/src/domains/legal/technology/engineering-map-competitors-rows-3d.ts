import { CREATOR, D, listed, row, t, watch } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 3D·캐릭터 영역의 추가분(포즈·모션, 3D 스타트업, 공간(XR) 도구, 캐릭터 제작 참고).
 * 앞부분의 대표 제품(Blender·SketchUp·VRoid Studio 등)은 engineering-map-competitors-rows.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 */

const STARTUP_3D = "docs/studio-3d-startup-comprehensive-benchmark-2026-09-03.md";
const WAVE_3D = "docs/studio-3d-benchmark-productization-wave-2026-09-04.md";
const SHAPER_BENCH = "docs/reports/shaper-competitive-benchmark-2026-09-12.md";
const XR = "docs/studio-xr-research-and-spatial-storyboard-2026-09-06.md";
const INTAKE = "docs/benchmarks/studio-competitive-intake-2026-09-02.md";
const RADAR = "docs/studio-commercial-clean-room-radar-2026-07-28.md";
const COMPETITOR_REGISTRY = "docs/benchmarks/studio-competitor-registry.json";
const CHARACTER_REFS = "docs/engines/labs-character-engine-references-2026-10-01.md";

export const COMPETITOR_ROWS_3D: readonly EngineeringMapRow[] = [
  row({
    id: "magic-poser",
    name: "Magic Poser",
    domain: D.threeD,
    url: "https://magicposer.com/",
    what: t(
      "스마트폰·태블릿에서 3D 인형으로 포즈를 잡는 앱입니다. 손 포즈, 조명, 카메라가 관찰 초점이었고, 코드 머리말이 이 제품 벤치마크에서 나온 모듈 여덟 개를 직접 밝힙니다.",
      "An app for posing 3D mannequins on phones and tablets. Hand poses, lighting and camera were the focus, and code headers name eight modules that came from this benchmark.",
    ),
    learned: t(
      "배움: 손 포즈 프리셋, 포즈 강도 슬라이더, 라이팅 스튜디오, 카메라 북마크·화각, 신체 모프, 포즈 복제, 조작 핸들 가이드, VRM 표정(MP1~MP8). 상용 소재는 가져오지 않음.",
      "Learned: hand-pose presets, a pose-intensity slider, a lighting studio, camera bookmarks and FOV, body morphs, pose cloning, handle guides and VRM expressions (MP1 to MP8). No commercial materials are imported.",
    ),
    overlap: t("3D 데생 인형의 Magic Poser 패널(손 포즈·조명·카메라 북마크).", "The 3D drawing mannequin's Magic Poser panel (hand poses, lighting, camera bookmarks)."),
    evidence: [INTAKE, COMPETITOR_REGISTRY, `${CREATOR}/scene-3d/StudioMagicPoserPanel.tsx`, `${CREATOR}/scene-3d/studio-mannequin-hand-presets.ts`, `${CREATOR}/scene-3d/studio-camera-bookmarks.ts`],
  }),
  row({
    id: "posemy-art",
    name: "PoseMy.Art",
    domain: D.threeD,
    url: "https://posemy.art/",
    what: t(
      "브라우저에서 캐릭터 포즈와 카메라를 잡아 그림 참고를 만드는 웹 도구입니다. 포즈·카메라·참고 이미지가 관찰 초점이었습니다.",
      "A web tool for setting character poses and cameras to make drawing references in the browser. Pose, camera and reference images were the focus.",
    ),
    learned: t(
      "배움(제품군 기록): 여러 캐릭터 포즈와 정확한 카메라·렌즈, 표면 붙이기·부모-자식 부착·제약. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (group-level record): multi-character poses with accurate cameras and lenses, surface snap, parent-child attachment and constraints. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("3D 데생 인형의 포즈·카메라 도구(제품군 단위로 비교).", "The 3D drawing mannequin's pose and camera tools (compared at group level)."),
    evidence: [INTAKE, COMPETITOR_REGISTRY, `${CREATOR}/scene-3d/StudioMannequinPoserPanel.tsx`],
  }),
  row({
    id: "justsketchme",
    name: "JustSketchMe",
    domain: D.threeD,
    url: "https://justsketch.me/",
    what: t(
      "웹에서 관절·손 포즈, 소품, 지면, 빛·그림자·화각을 잡아 참고 장면을 만드는 포즈 도구입니다. 적은 조작으로 참고 장면을 만드는 기준으로 비교했습니다.",
      "A web pose tool for building reference scenes with joints, hand poses, props, ground, light, shadow and field of view. It was compared as the standard for making a reference scene with few steps.",
    ),
    learned: t(
      "배움: 포즈 참고는 적은 조작으로 끝나야 함. 실제 장면 저장 지연과 구독별 제한은 확인하지 못함(미확인). 엔진·메뉴를 더 넣는 것만으로는 개선 근거가 아니라는 판단.",
      "Learned: pose reference should take few steps. Real scene-save latency and per-plan limits were not checked (unconfirmed). Adding engines or menus alone is not evidence of improvement.",
    ),
    overlap: t("3D 데생 인형의 포즈·소품 부착·지면 배치 흐름.", "The 3D drawing mannequin's pose, prop attachment and ground placement flow."),
    evidence: [SHAPER_BENCH, `${CREATOR}/scene-3d/StudioMannequinPoserPanel.tsx`],
  }),
  row({
    id: "mixamo",
    name: "Adobe Mixamo",
    domain: D.threeD,
    url: "https://www.mixamo.com/",
    what: t(
      "몇 개의 표식만 찍으면 사람형 모델에 뼈대를 자동으로 붙여 주고 애니메이션 라이브러리를 검색해 쓰는 서비스입니다.",
      "A service that adds a skeleton to a humanoid model from a few markers and lets you search an animation library.",
    ),
    learned: t(
      "배움: 자동 리깅은 사람형·중립 자세 메시에 한정되므로, 지원 못 하는 구조는 리타깃 전에 검사해 알리고 신뢰도 낮은 결과를 만들지 않음. 본 이름은 Mixamo 규칙도 인식.",
      "Learned: its auto-rigger is limited to humanoid, neutral-pose meshes, so unsupported structures are checked and reported before retargeting rather than producing low-confidence results. Mixamo bone naming is also recognized.",
    ),
    overlap: t("리타깃 전 자산 검사(지원 불가 구조 보고)와 본 이름 매핑.", "Pre-retarget asset checks (reporting unsupported topologies) and bone-name mapping."),
    evidence: [WAVE_3D, COMPETITOR_REGISTRY, "apps/character-lab/docs/parity/vision.md"],
  }),
  row({
    id: "plask",
    name: "Plask",
    domain: D.threeD,
    url: "https://plask.ai/",
    what: t(
      "카메라 영상 한 대로 사람의 움직임을 읽어 3D 캐릭터 동작을 만드는 웹 기반 AI 모션 캡처 서비스입니다.",
      "A web-based AI motion-capture service that reads a person's movement from a single camera video to produce 3D character motion.",
    ),
    learned: t(
      "배움: 발이 바닥을 뚫거나 뜨지 않게 지면에 붙이는 락, 두 뼈 IK, 골반 높이 자동 보정, 발끝 롤링. 추정한 움직임과 고칠 수 있는 키프레임을 분리하는 방향(레지스트리 메모).",
      "Learned: a foot-contact lock so feet neither sink nor float, two-bone IK, automatic pelvis leveling and toe roll. Inferred motion is kept apart from editable keyframes (registry note).",
    ),
    overlap: t("지면 착지 락(foot contact lock)과 두 뼈 IK.", "The foot-contact lock and two-bone IK."),
    evidence: [STARTUP_3D, WAVE_3D, "docs/benchmarks/studio-webtoon-ecosystem-registry.json", `${CREATOR}/scene-3d/studio-3d-foot-contact-lock.ts`],
  }),
  row({
    id: "womp",
    name: "Womp",
    domain: D.threeD,
    url: "https://womp.com/",
    what: t(
      "브라우저에서 둥근 3D 형태를 빠르게 만들고 재질을 입히는 3D 디자인 도구입니다. 문서가 Spline과 묶어 서술했습니다.",
      "A browser 3D design tool for shaping rounded forms quickly and applying materials. The document describes it together with Spline.",
    ),
    learned: t(
      "배움(Spline과 묶음 서술): 중력·반발로 물건을 자연스럽게 떨어뜨려 놓는 물리 배치, 글자의 입체 돌출(효과음), 매트캡·유리·툰 재질. 이 서술은 자체 평가표와 함께 적혀 있어 우열 근거로 쓰지 않음.",
      "Learned (described together with Spline): physics placement that drops objects naturally, extruded 3D lettering for sound effects, and MatCap, glass and toon materials. The write-up sits beside a self-assessment table, so it is not used as proof of superiority.",
    ),
    overlap: t("물리 배치(Rapier), 3D 효과음 글자 돌출, 매트캡 셰이더 스튜디오.", "Physics placement (Rapier), 3D sound-effect text extrusion and the MatCap shader studio."),
    evidence: [STARTUP_3D, `${CREATOR}/bg3d/StudioBg3dPhysicsControls.tsx`, `${CREATOR}/bg3d/StudioBg3dTextExtruderPanel.tsx`, `${CREATOR}/bg3d/StudioBg3dMatCapStudioPanel.tsx`],
  }),
  row({
    id: "substance-3d-painter",
    name: "Adobe Substance 3D Painter",
    domain: D.threeD,
    url: "https://www.adobe.com/products/substance3d/apps/painter.html",
    what: t(
      "3D 모델 표면에 직접 재질을 그리는 텍스처 페인팅 도구입니다. 스마트 재질·마스크, UV 재투영, 큰 텍스처를 나눠 다루는 방식이 비교 대상이었습니다.",
      "A texture-painting tool for painting materials directly on 3D model surfaces. Smart materials and masks, UV reprojection and handling large textures in tiles were compared.",
    ),
    learned: t(
      "배움: 표면 맞힘 → UV·월드·삼평면 투영 → 재질 채널 스택 → 희소 텍스처 타일 → 굽기 영수증으로 이어지는 계약. 3D 표면 페인트의 기초는 있고 BVH·glTF 제공자를 추가 중.",
      "Learned: a contract from surface hit to UV, world and triplanar projection, a material-channel stack, sparse texture tiles and bake receipts. Basic 3D surface painting exists and BVH and glTF providers are being added.",
    ),
    overlap: t("VRM 표면 브러시 제공자와 텍스처 팽창(dilation), 3D 텍스처 페인트 패널.", "The VRM surface-brush provider, texture dilation and the 3D texture-paint panel."),
    evidence: [RADAR, INTAKE, `${CREATOR}/vrm/studio-vrm-surface-brush-provider.ts`, `${CREATOR}/vrm/StudioVrmTexturePaintPanel.tsx`],
  }),
  row({
    id: "shapesxr",
    name: "ShapesXR",
    domain: D.threeD,
    url: "https://www.shapesxr.com/",
    what: t(
      "공간(XR)에서 장면을 설계하고 프레임으로 콘티를 짜는 도구입니다. 프레임 기반 공간 스토리보드와 브라우저 편집, 실제 크기 검토가 비교 대상이었습니다.",
      "A tool for designing scenes in space (XR) and building storyboards from frames. Its frame-based spatial storyboard, browser editing and real-size review were compared.",
    ),
    learned: t(
      "배움: PC에서 콘티를 계획하고 XR 검토로 잇기, 헤드셋 없이도 편집 가능하게. 공간 앵커·동일 장소 공동 작업은 미구현이고 헤드셋 전용 편집기는 만들지 않음.",
      "Learned: plan the storyboard on a PC and connect it to XR review, editable without a headset. Spatial anchors and same-place collaboration are not built, and no headset-only editor is made.",
    ),
    overlap: t("3D 배경 편집기의 공간 콘티·XR 배치 계획과 WebXR 세션 브리지.", "The 3D background editor's spatial-storyboard layout plan and WebXR session bridge."),
    evidence: [XR, "docs/spatial-webtoon-reader-2026-09-13.md", `${CREATOR}/studio-webxr-session.ts`, `${CREATOR}/bg3d/StudioBg3dSpatialStoryboardPanel.tsx`],
  }),
  row({
    id: "quill",
    name: "Quill",
    domain: D.threeD,
    url: "https://quill.art/",
    what: t(
      "VR에서 그리고 프레임 애니메이션을 만드는 도구입니다. 관객 속도에 맞춰 장면을 넘기는 VR 그림책 사례(Beyond the Fence)가 참고였습니다.",
      "A tool for drawing and frame animation in VR. A VR picture-book case (Beyond the Fence) that advances scenes at the audience's pace was the reference.",
    ),
    learned: t(
      "배움: 자동 카메라 이동보다 수동 컷 선택, 장면별 연출과 제작 콘티 재사용. VR 애니메이션은 미구현.",
      "Learned: manual cut selection instead of automatic camera moves, and reuse of per-scene direction and production storyboards. VR animation is not built.",
    ),
    overlap: t("공간 콘티의 수동 컷 선택과 명시적 샷 적용.", "Manual cut selection and explicit shot application in the spatial storyboard."),
    evidence: [XR],
  }),
  row({
    id: "gravity-sketch",
    name: "Gravity Sketch",
    domain: D.threeD,
    url: "https://gravitysketch.com/",
    what: t(
      "공간에서 스케치하고 곡면·메시를 다루며 함께 검토하는 3D 설계 도구입니다.",
      "A 3D design tool for sketching in space, working with surfaces and meshes, and reviewing together.",
    ),
    learned: t(
      "배움: 3D 배경 배치·포즈·실척 검토 UX를 참고. 이번 범위에 새 모델링 엔진은 만들지 않고 기존 메시 파이프라인을 유지.",
      "Learned: its 3D layout, pose and real-scale review UX was a reference. No new modeling engine is built; the existing mesh pipeline stays.",
    ),
    overlap: t("공간 콘티·XR 검토 흐름(새 모델링 엔진 없음).", "The spatial-storyboard and XR review flow (no new modeling engine)."),
    evidence: [XR],
  }),
  row({
    id: "open-brush",
    name: "Open Brush",
    domain: D.threeD,
    url: "https://openbrush.app/",
    what: t(
      "VR 공간에 그리고 GLB 등으로 내보내는 오픈소스 3D 그림 도구입니다.",
      "An open-source 3D painting tool that draws in VR space and exports formats such as GLB.",
    ),
    learned: t(
      "배움: 3D 효과선·공간 필기용 확장 후보로만 보고 브러시 재질·알파·애니메이션 호환 검증이 필요하다고 기록. 아직 통합하지 않음.",
      "Learned: considered only as a candidate for 3D effect lines and spatial annotation, with brush material, alpha and animation compatibility still to verify. It is not integrated.",
    ),
    overlap: t("공간 드로잉 후속 후보(미통합).", "A follow-up candidate for spatial drawing (not integrated)."),
    evidence: [XR, "docs/candidates/natural-media/commercial-open-engines.md"],
  }),
  row({
    id: "adobe-aero",
    name: "Adobe Aero",
    domain: D.threeD,
    what: t(
      "증강현실(AR) 콘텐츠를 만드는 서비스였습니다. 문서는 2025년 말 서비스 종료 일정을 근거로 적었습니다.",
      "A service for building augmented-reality (AR) content. The document records its end-of-service schedule from late 2025.",
    ),
    learned: t(
      "배움: 종료된 서비스는 신규 의존성에서 제외하고, 내보낼 수 있는 사용자 소유 데이터 형식을 지향. 도입하지 않음.",
      "Learned: a shut-down service is excluded from new dependencies, and user-owned exportable data formats are preferred. Not adopted.",
    ),
    overlap: t("겹치는 기능 없음(도입하지 않은 사례로만 기록).", "No overlapping feature (recorded only as a not-adopted case)."),
    evidence: [XR],
  }),
  row({
    id: "8th-wall",
    name: "8th Wall",
    domain: D.threeD,
    url: "https://8thwall.org/blog/8th-wall-open-source",
    urlTitle: "8th Wall open-source announcement",
    what: t(
      "웹 AR 제작 플랫폼이었습니다. 문서는 편집 플랫폼 접근 종료와 오픈소스 도구 전환 일정을 근거로 적었습니다.",
      "A web AR creation platform. The document records the end of its editing-platform access and its shift to open-source tools.",
    ),
    learned: t(
      "배움: 종료된 클라우드 편집 서비스에 신규 통합 금지, 오픈소스와 바이너리 라이선스를 나눠 재검토. 도입하지 않음.",
      "Learned: no new integrations with a discontinued cloud editing service, and open-source and binary licenses are reviewed separately. Not adopted.",
    ),
    overlap: t("겹치는 기능 없음(도입하지 않은 사례로만 기록).", "No overlapping feature (recorded only as a not-adopted case)."),
    evidence: [XR],
  }),
  row({
    id: "makehuman",
    name: "MakeHuman",
    domain: D.threeD,
    what: t(
      "오픈소스 사람 캐릭터 제작 도구입니다. 캐릭터 실험실이 바디 기준 메시를 정할 때 비교한 후보였습니다.",
      "An open-source human-character creation tool. It was a candidate the character lab compared when choosing a body base mesh.",
    ),
    learned: t(
      "결정: 코드는 AGPL·GPL이라 열람·복제 금지, 에셋은 정책상 미포함. 순수 절차 메시를 채택해 외부 에셋 0으로 유지(CC0 도입은 ADR로만 재결정).",
      "Decision: its code is AGPL or GPL so it is neither read nor copied, and its assets are excluded by policy. A purely procedural mesh was chosen to keep external assets at zero (CC0 use needs a new ADR).",
    ),
    overlap: t("캐릭터 실험실의 절차 휴머노이드 메시.", "The character lab's procedural humanoid mesh."),
    evidence: [CHARACTER_REFS, "docs/reports/character-lab-engine-alternatives-2026-10-01.md", "docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md"],
  }),
  row({
    id: "mb-lab",
    name: "MB-Lab",
    domain: D.threeD,
    what: t(
      "Blender에서 쓰는 오픈소스 캐릭터 생성 애드온입니다. 캐릭터 실험실의 참고 코드 목록에 ‘프록시 피팅’ 개념 참고로만 올랐습니다.",
      "An open-source character-generation add-on for Blender. It appears in the character lab's reference-code list only for its 'proxy fitting' concept.",
    ),
    learned: t(
      "결정: AGPL·GPL이라 코드 열람·복제 금지, 개념만 참고. 어떤 코드도 가져오지 않음.",
      "Decision: AGPL or GPL, so its code is neither read nor copied and only the concept is referenced. No code is taken.",
    ),
    overlap: t("캐릭터 실험실의 의상·바디 피팅 설계(개념만).", "The character lab's garment and body fitting design (concept only)."),
    evidence: [CHARACTER_REFS],
  }),
  row({
    id: "sculptgl",
    name: "SculptGL",
    domain: D.threeD,
    url: "https://stephaneginier.com/sculptgl/",
    what: t(
      "브라우저에서 점토처럼 3D 형태를 빚는 스컬프트 도구입니다. 코드 머리말이 ‘경쟁 제품에서 영감을 받은 정보 구조’의 하나로 적었습니다.",
      "A browser sculpting tool for shaping 3D forms like clay. A code header lists it among the 'competitor-inspired information structures'.",
    ),
    learned: t(
      "배움: 브라우저 스컬프트라는 장르를 하이브리드 DCC 스컬프트 커널의 참고로 둠. 별도 비교 문서는 없고 코드 머리말이 근거(미확인 범위 큼).",
      "Learned: the browser-sculpt genre was a reference for the hybrid DCC sculpt kernel. There is no separate comparison document; the code header is the evidence, so most detail is unconfirmed.",
    ),
    overlap: t("하이브리드 DCC의 스컬프트 커널.", "The hybrid DCC sculpt kernel."),
    evidence: [`${CREATOR}/studio-creative-ux.ts`],
  }),

  /* ── 감시 목록·대상 목록에만 있는 3D 제품 ── */
  listed({
    id: "vectary",
    name: "Vectary",
    domain: D.threeD,
    url: "https://www.vectary.com/",
    what: t(
      "웹에서 3D 모델을 편집하는 도구입니다. 3D 에디터 스타트업 벤치마크의 대상 목록에 이름이 올랐습니다.",
      "A tool for editing 3D models on the web. Its name is on the target list of the 3D-editor startup benchmark.",
    ),
    evidence: [STARTUP_3D, WAVE_3D],
    note: t("묶음 서술은 재질·웹 3D 편집·의상 비교 수준.", "The group note stays at materials, web 3D editing and garments."),
  }),
  listed({
    id: "bezi",
    name: "Bezi",
    domain: D.threeD,
    url: "https://www.bezi.com/",
    what: t(
      "3D·공간 콘텐츠를 만드는 서비스입니다. 3D 에디터 스타트업 벤치마크의 대상 목록에 이름이 올랐습니다.",
      "A service for building 3D and spatial content. Its name is on the target list of the 3D-editor startup benchmark.",
    ),
    evidence: [STARTUP_3D],
  }),
  listed({
    id: "clo",
    name: "CLO",
    domain: D.threeD,
    url: "https://www.clo3d.com/",
    what: t(
      "3D 가상 의상을 만드는 패션 디자인 도구입니다. 3D 에디터 스타트업 벤치마크의 대상 목록에 이름이 올랐습니다.",
      "A fashion design tool for making 3D virtual garments. Its name is on the target list of the 3D-editor startup benchmark.",
    ),
    evidence: [STARTUP_3D],
    note: t("묶음 서술은 의상 비교.", "The group note mentions garments."),
  }),
  listed({
    id: "toondy",
    name: "Toondy",
    domain: D.threeD,
    what: t(
      "국내 스타트업의 웹툰 제작 도구로 문서가 ‘툰디(Toondy)’라고 적었습니다. 3D 에디터 스타트업 벤치마크의 대상 목록에 이름이 올랐습니다.",
      "A webtoon production tool from a Korean startup that the document names 'Toondy'. Its name is on the target list of the 3D-editor startup benchmark.",
    ),
    evidence: [STARTUP_3D],
    note: t("공식 링크는 저장소에 없어 달지 않음.", "The repository holds no official link, so none is attached."),
  }),
  watch({
    id: "nomad-sculpt",
    name: "Nomad Sculpt",
    domain: D.threeD,
    url: "https://nomadsculpt.com/",
    registry: "competitor",
    category: "3d-dcc",
    priority: "P1",
    focus: t("모바일 스컬프트, 버텍스 페인트, PBR, 리메시, 내보내기", "mobile sculpting, vertex paint, PBR, remeshing and export"),
  }),
  watch({
    id: "cascadeur",
    name: "Cascadeur",
    domain: D.threeD,
    url: "https://cascadeur.com/",
    registry: "competitor",
    category: "3d-dcc",
    priority: "P1",
    focus: t("애니메이션, 물리, 포징, 자동 포징, 궤적", "animation, physics, posing, auto-posing and trajectories"),
  }),
];
