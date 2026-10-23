/**
 * 화풍 팩 T1 8종 데이터(레시피 v3, 2026-10-23 S-1). 모두 계약 `contracts/art-style.ts`의 `artStylePackSchema`를 통과한다(시험이 확인).
 *
 * - 팩은 완성품이 아니라 **슬라이더로 조절하는 초기값 묶음**이다(설계 K1, copy-on-apply). `style/apply`가 값을 레시피에 복사하고
 *   그 뒤로는 사용자가 화풍 슬라이더로 바꾼다. 그래서 이 파일의 수치를 고쳐도 이미 저장한 레시피의 그림은 바뀌지 않는다
 *   (`style.packRevision`은 출처 기록이다 — 수치를 바꾸면 그 팩의 `revision`을 올린다).
 * - 수치 출처는 설계 `docs/art-style-customization-design-20261023.md` §5.1 표다. **실측값**은 `kr-webtoon-romance`의 두신 7.8/9.0·눈폭 0.22
 *   (표의 굵은 값)와 `docs/webtoon-style-guide.md` §1 관찰 범위의 중앙값뿐이다(`ART_STYLE_PACK_PROVENANCE`). 나머지는 전부 [제안] 초기값이며
 *   접촉 시트(Metal 실GPU)를 보고 고칠 값이다. 표에 없는 칸(팔 길이·어깨·머리 너비·손·스페큘러·팔레트 견본 등)도 [제안]이다.
 * - 라벨은 장르명만 쓴다(작품·작가·경쟁 제품명 금지, 설계 O9). 한글 라벨은 계약 `ART_STYLE_LABELS_KO`와 같은 값을 쓴다.
 * - 팩과 하위 객체는 깊이 동결한다(reducer는 `cloneLook`·구조 복사로 레시피에 넣는다).
 */
import { ART_STYLE_IDS, ART_STYLE_LABELS_KO } from "../contracts";

import type { ArtStyleId, ArtStylePack, Look, Proportion, ShadeTint } from "../contracts";

/** 팩 정의를 바꾸면 그 팩의 revision을 올린다(레시피 `style.packRevision`이 어느 정의에서 복사했는지 남긴다). */
export const ART_STYLE_PACK_REVISION = 1;

type Rgb = readonly [number, number, number];

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** OKLab 그림자 틴트(밝기 차·색상각 이동·채도 배율) */
function oklab(dL: number, dHueDeg: number, chroma: number): ShadeTint {
  return { kind: "oklab", dL, dHueDeg, chroma };
}

/** 곱하기 그림자 틴트(v2 항등 표현) */
function multiply(rgb: Rgb): ShadeTint {
  return { kind: "multiply", rgb: [rgb[0], rgb[1], rgb[2]] };
}

/** 세 그림자 그룹(피부·헤어·그 외)에 같은 틴트 */
function shadeAll(tint: () => ShadeTint): Look["shade"] {
  return { skin: tint(), hair: tint(), other: tint() };
}

/** 비례 6축: 두신·다리비·팔비·어깨(머리 높이 배수)·머리 너비비·손 배율 */
function figure(headsTall: number, legRatio: number, armRatio: number, shoulderHeads: number, headWidthRatio: number, handScale: number): Proportion {
  return { headsTall, legRatio, armRatio, shoulderHeads, headWidthRatio, handScale };
}

// v2 항등(`LOOK_V2_IDENTITY`)과 같은 값의 조각. 효과가 없는 그룹(톤·종이 none, 림 끔)은 이 값을 둔다.
function identityRim(): Look["rim"] {
  return { edge0: 0.55, edge1: 0.65, strength: 1, color: [0.35, 0.35, 0.4] };
}
function noSpecular(): Look["specular"] {
  return { size: 0, strength: 0, hairBand: "none", center: 0.5, width: 0 };
}
function noInnerLine(): Look["line"]["inner"] {
  return { enabled: false, creaseDeg: 30, partBoundary: false, widthPx: 1 };
}
function noTone(): Look["tone"] {
  return { kind: "none", cellPerHead: 40, angleDeg: 45, bands: [0, 0.5, 0.8], strength: 0, ink: "shade" };
}
function noPaper(): Look["paper"] {
  return { kind: "none", strength: 0, grainPx1080: 1, bleedPx1080: 0, seed: 0 };
}

/** v2 엔진의 그림자 곱 색(`render/material-presets.ts` toonShadeTint) — 웹툰 스타일 가이드 §1이 피부 그림자를 관찰 범위 안으로 판정한 값 */
const V2_SKIN_SHADE: Rgb = [0.86, 0.6, 0.58];
const V2_HAIR_SHADE: Rgb = [0.62, 0.58, 0.72];
const V2_OTHER_SHADE: Rgb = [0.68, 0.68, 0.78];

// ---------------------------------------------------------------- 8종(설계 §5.1 표 순서 = ART_STYLE_IDS)

const JP_ANIME_CEL: ArtStylePack = {
  id: "jp-anime-cel",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-anime-cel"],
  labelEn: "Anime cel",
  // 표: 두신 7.0/7.5, 다리비 0.48. 나머지 축은 [제안].
  proportion: { feminine: figure(7.0, 0.48, 0.43, 1.6, 0.8, 1), masculine: figure(7.5, 0.48, 0.44, 2, 0.76, 1.05) },
  // 표: 눈폭 0.25. 눈 계열·개구비·홍채비·눈선·속눈썹은 [제안].
  face: { eyeFamily: "anime-round", eyeWidthToFace: 0.25, eyeOpenRatio: 0.75, irisToEye: 0.6, eyeLine: 0.55, lash: "liner" },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    // 표: 2단 경계 0.05, OKLab ΔL −0.22·Δh −20°(채도 배율 1은 [제안])
    ramp: { softness: 0.05, secondShade: null },
    shade: shadeAll(() => oklab(-0.22, -20, 1)),
    rim: identityRim(),
    // [제안] 셀 애니의 헤어 하이라이트 띠
    specular: { size: 0.3, strength: 0.6, hairBand: "band", center: 0.35, width: 0.12 },
    // 표: style-hull 3 mm, 알베도를 어둡게 한 색(어둡게 하는 양·채도는 [제안]). 굵기 균일 선이라 깊이·곡률 이득 0.
    line: { method: "style-hull", widthMm: 3, depthGain: 0, curvatureGain: 0, color: { mode: "darken-albedo", dL: 0.55, chroma: 0.6 }, inner: noInnerLine() },
    tone: noTone(),
    paper: noPaper(),
    // 표: 팔레트 채도 1.05
    grade: { saturation: 1.05, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#ffe6d8", "#f8d6c2", "#ecc0a2", "#d9a07c", "#b07656", "#7a5038"],
    hair: ["#2b1d16", "#5a3a2a", "#c98f4f", "#f0d9a0", "#4a5fa8", "#e07a8f"],
    saturation: 1.05,
  },
};

const JP_SHOUNEN_INK: ArtStylePack = {
  id: "jp-shounen-ink",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-shounen-ink"],
  labelEn: "Shounen ink",
  // 표: 두신 7.5/8.0, 다리비 0.49
  proportion: { feminine: figure(7.5, 0.49, 0.44, 1.7, 0.78, 1), masculine: figure(8, 0.49, 0.45, 2.2, 0.75, 1.05) },
  // 표: 눈폭 0.20
  face: { eyeFamily: "shounen-sharp", eyeWidthToFace: 0.2, eyeOpenRatio: 0.45, irisToEye: 0.45, eyeLine: 0.52, lash: "liner" },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    // 표: 2단, ΔL −0.30·채도 0.6. 경계를 거의 날카롭게(부드러움 0.02는 [제안]).
    ramp: { softness: 0.02, secondShade: null },
    shade: shadeAll(() => oklab(-0.3, 0, 0.6)),
    rim: identityRim(),
    specular: noSpecular(),
    // 표: 6.5 mm 흑선(Studio MToon '굵은 잉크' 0.0065 m·#000000과 같은 값), 곡률 +0.5, 내부선 30°. 깊이 이득·내부선 폭은 [제안].
    line: {
      method: "style-hull",
      widthMm: 6.5,
      depthGain: 0.4,
      curvatureGain: 0.5,
      color: { mode: "fixed", rgb: [0, 0, 0] },
      inner: { enabled: true, creaseDeg: 30, partBoundary: true, widthPx: 2 },
    },
    // 표: 하프톤 45°·머리당 22셀·밴드 [0, .55, .85]. 세기 0.85·먹색 잉크는 [제안].
    tone: { kind: "halftone", cellPerHead: 22, angleDeg: 45, bands: [0, 0.55, 0.85], strength: 0.85, ink: "line" },
    // 표: 인쇄 종이 0.15(결 크기는 [제안])
    paper: { kind: "print", strength: 0.15, grainPx1080: 1.5, bleedPx1080: 0, seed: 0 },
    // 표: 채도 0.9
    grade: { saturation: 0.9, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#f6d8c0", "#ebc6a6", "#d8a882", "#c08a64", "#93603f", "#5e3c27"],
    hair: ["#151417", "#3a2a22", "#7a4a2a", "#d9c9a0", "#b0342e", "#2f4f9f"],
    saturation: 0.9,
  },
};

const JP_SHOUJO_SOFT: ArtStylePack = {
  id: "jp-shoujo-soft",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-shoujo-soft"],
  labelEn: "Shoujo sparkle",
  // 표: 두신 7.8/8.5, 다리비 0.51
  proportion: { feminine: figure(7.8, 0.51, 0.44, 1.55, 0.8, 0.9), masculine: figure(8.5, 0.51, 0.45, 2.05, 0.76, 0.95) },
  // 표: 눈폭 0.28
  face: { eyeFamily: "shoujo-sparkle", eyeWidthToFace: 0.28, eyeOpenRatio: 0.85, irisToEye: 0.66, eyeLine: 0.56, lash: "strands" },
  toon: { rampSteps: 3, rim: true, outline: "hull" },
  look: {
    // 표: 3단 부드럽게 0.35, Δh +25°. 그림자 밝기 차·채도와 두 번째 그림자는 [제안].
    ramp: { softness: 0.35, secondShade: oklab(-0.24, 25, 0.85) },
    shade: shadeAll(() => oklab(-0.12, 25, 0.9)),
    // 표: 림 0.5~0.7(세기·색은 [제안])
    rim: { edge0: 0.5, edge1: 0.7, strength: 0.8, color: [1, 0.94, 0.97] },
    // [제안] 헤어 고리 하이라이트
    specular: { size: 0.25, strength: 0.5, hairBand: "ring", center: 0.3, width: 0.1 },
    // 표: 1.2 mm, 알베도를 0.35만큼 어둡게(채도·깊이 이득은 [제안])
    line: { method: "style-hull", widthMm: 1.2, depthGain: 0.2, curvatureGain: 0, color: { mode: "darken-albedo", dL: 0.35, chroma: 0.8 }, inner: noInnerLine() },
    // 표: 점 톤 머리당 60셀·세기 0.25(각도·밴드는 [제안])
    tone: { kind: "dots", cellPerHead: 60, angleDeg: 45, bands: [0, 0.5, 0.8], strength: 0.25, ink: "shade" },
    // 표: 인쇄 종이 0.1
    paper: { kind: "print", strength: 0.1, grainPx1080: 1, bleedPx1080: 0, seed: 0 },
    // 표: 파스텔 채도 0.65(밝기 +0.03은 [제안])
    grade: { saturation: 0.65, lightness: 0.03, accentChannels: [] },
  },
  palette: {
    skin: ["#fff0e8", "#fbe3d6", "#f4d2c0", "#e6b9a0", "#c99478", "#9a6a52"],
    hair: ["#5a4036", "#b98a6a", "#f2dcb4", "#f2b8c6", "#c9b8e8", "#a8d0e6"],
    saturation: 0.65,
  },
};

const JP_SEINEN_REAL: ArtStylePack = {
  id: "jp-seinen-real",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-seinen-real"],
  labelEn: "Seinen drama",
  // 표: 두신 7.2/7.6, 다리비 0.47
  proportion: { feminine: figure(7.2, 0.47, 0.44, 1.75, 0.72, 1.05), masculine: figure(7.6, 0.47, 0.45, 2.35, 0.7, 1.1) },
  // 표: 눈폭 0.18. 개구비·눈선은 실제 인체(가이드 §1: 약 0.32·약 47 %)보다 조금 큰 [제안].
  face: { eyeFamily: "realistic", eyeWidthToFace: 0.18, eyeOpenRatio: 0.38, irisToEye: 0.42, eyeLine: 0.48, lash: "strands" },
  toon: { rampSteps: 4, rim: false, outline: "hull" },
  look: {
    // 표: 4단, ΔL −0.35. 두 번째 그림자·채도·부드러움은 [제안].
    ramp: { softness: 0.1, secondShade: oklab(-0.5, 0, 0.7) },
    shade: shadeAll(() => oklab(-0.35, 0, 0.8)),
    rim: identityRim(),
    specular: { size: 0.15, strength: 0.3, hairBand: "none", center: 0.5, width: 0.1 },
    // 표: 3.5 mm, 깊이 0.6, 곡률 +0.8, 내부선 25°. 선 색(먹)·내부선 폭은 [제안].
    line: {
      method: "style-hull",
      widthMm: 3.5,
      depthGain: 0.6,
      curvatureGain: 0.8,
      color: { mode: "fixed", rgb: [0.03, 0.03, 0.03] },
      inner: { enabled: true, creaseDeg: 25, partBoundary: true, widthPx: 2 },
    },
    // 표: 교차선 머리당 40셀·밴드 [.35, .6, .85]. 각도·세기·먹색 잉크는 [제안].
    tone: { kind: "crosshatch", cellPerHead: 40, angleDeg: 30, bands: [0.35, 0.6, 0.85], strength: 0.7, ink: "line" },
    // 표: 인쇄 종이 0.2
    paper: { kind: "print", strength: 0.2, grainPx1080: 1.5, bleedPx1080: 0, seed: 0 },
    // 표: 채도 0.75
    grade: { saturation: 0.75, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#efd2bb", "#ddb89a", "#c79a78", "#a97b5a", "#7f5940", "#55392a"],
    hair: ["#1b1a1c", "#3b2e27", "#5f4a3c", "#8a8580", "#c9c4bc"],
    saturation: 0.75,
  },
};

const KR_WEBTOON_ROMANCE: ArtStylePack = {
  id: "kr-webtoon-romance",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["kr-webtoon-romance"],
  labelEn: "Webtoon romance",
  // **실측** 두신 여 7.8·남 9.0(관찰 7.7~7.9 / 8.7~9.5, webtoon-style-guide §1). 다리비 0.52는 표 값, 나머지 축은 [제안].
  proportion: { feminine: figure(7.8, 0.52, 0.44, 1.7, 0.75, 0.95), masculine: figure(9, 0.52, 0.45, 2.3, 0.72, 1) },
  // **실측** 눈폭/얼굴 0.22(관찰 0.21~0.23). 개구비 0.68·홍채비 0.58은 관찰 범위(0.6~0.76·0.5~0.66)의 중앙, 눈선 0.54는 관찰값(여),
  // 속눈썹은 키트 베이스와 같은 라이너(가이드 §2 lash_style).
  face: { eyeFamily: "webtoon-almond", eyeWidthToFace: 0.22, eyeOpenRatio: 0.68, irisToEye: 0.58, eyeLine: 0.54, lash: "liner" },
  // 표: 림 끔(키트 기본 툰 A-10과 같다)
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    // 표: 2단 경계 0.2
    ramp: { softness: 0.2, secondShade: null },
    // 표: 피부 붉은 그림자 — v2 피부 틴트가 관찰 범위 안(가이드 §1)이라 그대로 둔다. 헤어·그 외도 v2 틴트(키트 기본 그림과 같은 계열).
    shade: { skin: multiply(V2_SKIN_SHADE), hair: multiply(V2_HAIR_SHADE), other: multiply(V2_OTHER_SHADE) },
    rim: identityRim(),
    // [제안] 부드러운 헤어 띠
    specular: { size: 0.25, strength: 0.35, hairBand: "band", center: 0.3, width: 0.15 },
    // **실측 동등** 4 mm(690 px 폭에서 약 2 px, 가이드 §1): v2 엔진 hull·색과 같은 값이라 지금 엔진에서도 그대로 그려진다.
    line: { method: "engine-hull", widthMm: 4, depthGain: 0, curvatureGain: 0, color: { mode: "fixed", rgb: [0.05, 0.04, 0.06] }, inner: noInnerLine() },
    tone: noTone(),
    paper: noPaper(),
    // 표: 채도 0.9
    grade: { saturation: 0.9, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#fbe5d6", "#f3d3bd", "#e9c2a6", "#d7a585", "#b7825f", "#875b40"],
    hair: ["#2b1d16", "#4a3226", "#7b5a44", "#b88f6b", "#d8c3a5", "#1e2230"],
    saturation: 0.9,
  },
};

const KR_WEBTOON_ACTION: ArtStylePack = {
  id: "kr-webtoon-action",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["kr-webtoon-action"],
  labelEn: "Webtoon action",
  // 표: 두신 7.8/8.6, 다리비 0.50
  proportion: { feminine: figure(7.8, 0.5, 0.44, 1.8, 0.74, 1), masculine: figure(8.6, 0.5, 0.45, 2.4, 0.72, 1.05) },
  // 표: 눈폭 0.20. 날카로운 눈 계열은 [제안].
  face: { eyeFamily: "shounen-sharp", eyeWidthToFace: 0.2, eyeOpenRatio: 0.5, irisToEye: 0.48, eyeLine: 0.52, lash: "liner" },
  toon: { rampSteps: 3, rim: true, outline: "hull" },
  look: {
    // 표: 3단 0.6(그라데이션). 그림자 밝기 차·색상·채도는 [제안].
    ramp: { softness: 0.6, secondShade: oklab(-0.38, -8, 0.9) },
    shade: shadeAll(() => oklab(-0.24, -8, 0.95)),
    // 표: 차가운 림(경계·세기·색 수치는 [제안])
    rim: { edge0: 0.6, edge1: 0.72, strength: 1.2, color: [0.55, 0.7, 1] },
    specular: { size: 0.2, strength: 0.5, hairBand: "band", center: 0.4, width: 0.1 },
    // 표: 3.5 mm, 알베도를 어둡게, 깊이 0.5(곡률·어둡게 하는 양은 [제안])
    line: { method: "style-hull", widthMm: 3.5, depthGain: 0.5, curvatureGain: 0.2, color: { mode: "darken-albedo", dL: 0.6, chroma: 0.5 }, inner: noInnerLine() },
    tone: noTone(),
    paper: noPaper(),
    // 표: 채도 1.0
    grade: { saturation: 1, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#f0d0b6", "#e0b896", "#c99a74", "#ab7a55", "#82573a", "#573826"],
    hair: ["#121216", "#2a2a33", "#4d3a2f", "#c8c8d0", "#7a1f2a", "#25406f"],
    saturation: 1,
  },
};

const SD_CHIBI: ArtStylePack = {
  id: "sd-chibi",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["sd-chibi"],
  labelEn: "Super deformed",
  // 표: 두신 3.0/3.2(Studio 마네킹 chibi3 3.2와 같은 계열), 다리비 0.30. 팔(0.33)·어깨·머리 너비·손은 [제안].
  proportion: { feminine: figure(3, 0.3, 0.33, 1.15, 1, 0.8), masculine: figure(3.2, 0.3, 0.33, 1.25, 0.98, 0.8) },
  // 표: 눈폭 0.32
  face: { eyeFamily: "sd-dot", eyeWidthToFace: 0.32, eyeOpenRatio: 0.9, irisToEye: 0.72, eyeLine: 0.6, lash: "none" },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    // 표: 2단 0.1(그림자 틴트는 [제안] — 밝고 채도 높게)
    ramp: { softness: 0.1, secondShade: null },
    shade: shadeAll(() => oklab(-0.18, -10, 1.1)),
    rim: identityRim(),
    specular: { size: 0.35, strength: 0.4, hairBand: "band", center: 0.35, width: 0.14 },
    // 표: 3 mm, 알베도를 어둡게
    line: { method: "style-hull", widthMm: 3, depthGain: 0, curvatureGain: 0, color: { mode: "darken-albedo", dL: 0.5, chroma: 0.7 }, inner: noInnerLine() },
    tone: noTone(),
    paper: noPaper(),
    // 표: 채도 1.15(밝기 +0.02는 [제안])
    grade: { saturation: 1.15, lightness: 0.02, accentChannels: [] },
  },
  palette: {
    skin: ["#ffe8da", "#fbd9c4", "#f2c4a6", "#e0a985", "#c08060", "#8c5a3e"],
    hair: ["#3a2a22", "#a0663c", "#f5d68a", "#ff9fb8", "#8fc8ff", "#b6f2c8"],
    saturation: 1.15,
  },
};

const INK_WASH: ArtStylePack = {
  id: "ink-wash",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["ink-wash"],
  labelEn: "Ink wash",
  // 표: 두신 7.2/7.6, 다리비 0.47
  proportion: { feminine: figure(7.2, 0.47, 0.44, 1.7, 0.72, 0.95), masculine: figure(7.6, 0.47, 0.45, 2.1, 0.7, 1) },
  // 표: 눈폭 0.17
  face: { eyeFamily: "ink-narrow", eyeWidthToFace: 0.17, eyeOpenRatio: 0.35, irisToEye: 0.4, eyeLine: 0.5, lash: "liner" },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    // 표: 2단 0.5, 회색 그림자 ΔL −0.25·채도 0.2
    ramp: { softness: 0.5, secondShade: null },
    shade: shadeAll(() => oklab(-0.25, 0, 0.2)),
    rim: identityRim(),
    specular: noSpecular(),
    // 표: 3 mm 먹색, 곡률 +1.0. 먹색 값·깊이 이득·내부선은 [제안].
    line: {
      method: "style-hull",
      widthMm: 3,
      depthGain: 0.3,
      curvatureGain: 1,
      color: { mode: "fixed", rgb: [0.08, 0.08, 0.09] },
      inner: { enabled: true, creaseDeg: 35, partBoundary: false, widthPx: 2 },
    },
    tone: noTone(),
    // 표: 수묵 종이 0.6·번짐 3 px(1080p 기준). 결 크기는 [제안].
    paper: { kind: "ink-wash", strength: 0.6, grainPx1080: 2, bleedPx1080: 3, seed: 0 },
    // 표: 채도 0.12 + 강조 1채널(액세서리 — 붉은 소품 하나만 색을 남기는 수묵 관례, 채널 선택은 [제안])
    grade: { saturation: 0.12, lightness: 0, accentChannels: ["accessory"] },
  },
  palette: {
    skin: ["#f2eee6", "#e6dfd2", "#d6cdbd", "#bfb5a4"],
    hair: ["#1b1b1d", "#3a3a3d", "#5c5b5e"],
    saturation: 0.12,
  },
};

const PACKS_BY_ID: Readonly<Record<ArtStyleId, ArtStylePack>> = deepFreeze({
  "jp-anime-cel": JP_ANIME_CEL,
  "jp-shounen-ink": JP_SHOUNEN_INK,
  "jp-shoujo-soft": JP_SHOUJO_SOFT,
  "jp-seinen-real": JP_SEINEN_REAL,
  "kr-webtoon-romance": KR_WEBTOON_ROMANCE,
  "kr-webtoon-action": KR_WEBTOON_ACTION,
  "sd-chibi": SD_CHIBI,
  "ink-wash": INK_WASH,
});

/** T1 화풍 팩 8종(계약 `ART_STYLE_IDS` 순서, 깊이 동결) */
export const ART_STYLE_PACKS: readonly ArtStylePack[] = Object.freeze(ART_STYLE_IDS.map((id) => PACKS_BY_ID[id]));

/** id로 팩을 찾는다(T1 id는 항상 있다). */
export function artStylePack(id: ArtStyleId): ArtStylePack {
  return PACKS_BY_ID[id];
}

// ---------------------------------------------------------------- 수치 출처(화풍 뷰 "실측" 배지·문서용)

export interface ArtStylePackProvenance {
  /** 실측(관찰·계측)으로 정한 값의 경로(`proportion.feminine.headsTall`처럼 팩 안 경로). 나머지 값은 [제안] 초기값이다. */
  readonly measured: readonly string[];
  /** 실측은 아니지만 값을 맞춘 참고(같은 저장소의 다른 구현) */
  readonly references: readonly string[];
  readonly noteKo: string;
}

const PROPOSED_ONLY = "모든 수치가 [제안] 초기값이다(설계 §5.1). 접촉 시트로 보고 고친다.";

export const ART_STYLE_PACK_PROVENANCE: Readonly<Record<ArtStyleId, ArtStylePackProvenance>> = deepFreeze({
  "jp-anime-cel": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "jp-shounen-ink": {
    measured: [],
    references: ["apps/web/src/domains/creator/vrm/studio-vrm-mtoon-presets.ts '굵은 잉크'(외곽선 0.0065 m·#000000)"],
    noteKo: `${PROPOSED_ONLY} 선 굵기·색은 Studio MToon 프리셋과 같은 값이다.`,
  },
  "jp-shoujo-soft": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "jp-seinen-real": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "kr-webtoon-romance": {
    measured: [
      "proportion.feminine.headsTall",
      "proportion.masculine.headsTall",
      "face.eyeWidthToFace",
      "face.eyeOpenRatio",
      "face.irisToEye",
      "face.eyeLine",
      "look.line.widthMm",
      "look.shade.skin",
    ],
    references: ["apps/character-lab/docs/webtoon-style-guide.md §1(공개 무료 페이지 관찰·계측, 표본 N=1~4)"],
    noteKo: "두신 7.8/9.0·눈폭 0.22는 관찰값, 개구비·홍채비는 관찰 범위 중앙, 선 굵기·피부 그림자는 v2 값이 관찰 범위 안이라 그대로 둔 값이다. 그 밖은 [제안].",
  },
  "kr-webtoon-action": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "sd-chibi": {
    measured: [],
    references: ["apps/web/src/domains/creator/scene-3d/studio-mannequin-model.ts chibi3(headCount 3.2)"],
    noteKo: `${PROPOSED_ONLY} 남성 두신은 Studio 마네킹 SD 3.2와 같다.`,
  },
  "ink-wash": { measured: [], references: [], noteKo: PROPOSED_ONLY },
});
