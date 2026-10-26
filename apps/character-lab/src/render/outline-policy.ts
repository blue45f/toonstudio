/**
 * 툰 hull 외곽선 정책(순수). 엔진 `applyMaterialsForMode`가 파츠 메시마다 `renderOutline`을 켤지, 얼마나 두껍게 그릴지 이 표로 정한다.
 *
 * - 절차 소스·제작 패키지: 모든 파츠 메시에 hull을 켠다(기존 거동 유지).
 * - 키트 소스: 눈·입 안 계열 역할, **머리**, **속옷**(`KIT_OUTLINE_EXEMPT_ROLES`)에는 켜지 않는다. 몸(`skin`)은 켜되 더 얇게 그린다(`KIT_SKIN_OUTLINE_WIDTH_SCALE`).
 *   근거 1(A-5, 리드가 키트 뷰어로 확인): 반지름 약 12 mm 눈 메시에 4 mm hull(`TOON_OUTLINE_WIDTH`)이 붙으면 눈이 검은 고리로 덮여 공막·홍채가 보이지 않는다.
 *   입 안(치아·혀)·속눈썹·눈썹도 같은 이유로 제외한다.
 *   근거 2(A-9, KT-04가 실제 엔진으로 확인): Babylon 외곽선 렌더러는 메시를 그린 뒤 부풀린 껍질의 깊이를 다시 써서, 머리 표면보다 4 mm 앞의 깊이가
 *   이후에 그려지는 눈·눈썹·속눈썹을 깊이 테스트에서 떨어뜨린다(머리 hull 폭을 0.5 mm로 줄여도 눈썹이 가려진다). 그래서 머리 hull도 켜지 않는다.
 *   근거 3(2026-10-11, 실제 GPU 브라우저 실측, **해소**): 몸 hull이 Apple M2 Max(ANGLE Metal, WebGL2)에서 맨팔·손에 빨강·초록·파랑 삼각형 줄무늬를 만들었다.
 *   원인은 hull이 아니라 **몸의 SubMesh가 둘 이상**인 것이었다: 스킨(본 텍스처) 메시에 `renderOutline`을 켠 채 SubMesh가 둘 이상이면 Babylon 외곽선 렌더러가
 *   두 번째 이후 SubMesh를 깨뜨린다(SubMesh 하나는 인덱스 시작이 0이 아니어도 정상, 같은 경계로 나눠도 재현, morph 매니저를 떼도 남고 스켈레톤을 떼면 사라짐, WebGPU는 정상).
 *   `render/babylon/kit-region-mask.ts`가 가린 영역을 SubMesh로 빼는 대신 보이는 구간만 이어 붙인 인덱스 버퍼 하나로 만들어 해소했다. 그래서 몸 hull을 다시 켠다.
 *   몸 hull은 의상 아래 몸과 의상이 가까운 곳(가슴 옆·겨드랑이)에서 hull이 천을 뚫고 비치므로 4 mm가 아니라 2 mm(0.5배)로 그린다(실측: 4 mm는 점이 생기고 2 mm는 깨끗).
 *   근거 4(2026-10-11, 실제 GPU 브라우저 실측): 속옷 hull은 의상 아래에서 의상 hull과 깊이를 주고받아, 의상을 갈아입은 뒤처럼 그리기 순서가 바뀌면 가슴에 hull 색(어두운 보라)
 *   얼룩이 의상을 뚫고 비친다(속옷 hull만 끄거나 의상 hull만 꺼도 사라짐). 속옷은 보통 가려져 있어 선이 필요 없으므로 hull을 켜지 않는다.
 *   근거 5(2026-10-11, 실측): Babylon 외곽선 렌더러의 기본 깊이 오프셋(`zOffset` 1·`zOffsetUnits` 4, 카메라 쪽으로 당김)이 몸 hull을 꽉 낀 신발(남성 부츠 발끝)·의상 앞으로 내밀어 어두운 얼룩으로 비쳤다.
 *   키트 리그에서는 엔진이 둘 다 0으로 둔다(`character-engine.ts` `applyMaterialsForMode`). 절차 소스는 기본값을 그대로 쓴다.
 *   에셋 쪽에서 눈 메시를 키우거나 외곽선용 우회 지오메트리를 넣지 않는다(계약 4.8: `_Outline` 셸 금지).
 *   알려진 한계: 키트 머리(얼굴)의 실루엣 선이 없다(헤어·의상·신발·액세서리·몸은 hull 유지). 엣지·후처리 방식의 머리 윤곽은 후속 과제다.
 *
 * `edge`(EdgesRenderer) 외곽선은 이 정책의 대상이 아니다 — 부드러운 눈 구면에는 각도 임계(cos 0.95)를 넘는 모서리가 거의 없어 고리가 생기지 않는다.
 */
import type { PartRole } from "../contracts";

export type OutlineRigKind = "procedural" | "package" | "kit";

/** 키트 소스에서 hull 외곽선을 켜지 않는 역할 */
export const KIT_OUTLINE_EXEMPT_ROLES: ReadonlySet<PartRole> = new Set<PartRole>(["head", "eyeball", "iris", "pupil", "eye-highlight", "lash", "brow", "teeth", "tongue", "underwear"]);

/** 키트 몸(피부) hull 폭 배율(기본 폭 대비). 의상이 몸에 가까운 곳에서 hull이 천을 뚫고 비치지 않도록 얇게 그린다. */
export const KIT_SKIN_OUTLINE_WIDTH_SCALE = 0.5;

/** 이 리그 종류의 이 역할 메시에 hull 외곽선을 켜도 되는지. 키트의 머리·눈·입 안 계열·속옷 역할만 false다. */
export function hullOutlineAllowed(kind: OutlineRigKind, role: PartRole): boolean {
  return kind !== "kit" || !KIT_OUTLINE_EXEMPT_ROLES.has(role);
}

/** hull 폭 배율(기본 `TOON_OUTLINE_WIDTH` × 이 값). 키트 몸만 얇고 나머지는 1이다. */
export function hullOutlineWidthScale(kind: OutlineRigKind, role: PartRole): number {
  return kind === "kit" && role === "skin" ? KIT_SKIN_OUTLINE_WIDTH_SCALE : 1;
}

export interface OutlinePressureAspect {
  /** 가로 법선 방향 외곽선 배율 (_Outline_W) */
  readonly widthScale: number;
  /** 세로 법선 방향 외곽선 배율 (_Outline_H) */
  readonly heightScale: number;
}

/** SHAPER MaterialData::SetValuesFromUI(0x06000235): 필압 외곽선 ON 시 5:1 비등방성 배율(_Outline_W=1.5, _Outline_H=0.3) */
export const SHAPER_OUTLINE_PRESSURE_ON_ASPECT: OutlinePressureAspect = Object.freeze({
  widthScale: 1.5,
  heightScale: 0.3,
});

/** SHAPER MaterialData::SetValuesFromUI(0x06000235): 필압 외곽선 OFF 시 등방성 배율(_Outline_W=1.0, _Outline_H=1.0) */
export const SHAPER_OUTLINE_PRESSURE_OFF_ASPECT: OutlinePressureAspect = Object.freeze({
  widthScale: 1.0,
  heightScale: 1.0,
});

/**
 * SHAPER outlinePressure 토글에 따른 비등방성 만화 펜선 외곽선 가로·세로 배율을 반환한다.
 */
export function resolveOutlinePressureAspect(outlinePressure: boolean): OutlinePressureAspect {
  return outlinePressure ? SHAPER_OUTLINE_PRESSURE_ON_ASPECT : SHAPER_OUTLINE_PRESSURE_OFF_ASPECT;
}

/**
 * 뷰 공간 법선(nx, ny)과 기본 두께(sliderValue * outlineRatio), 필압 토글 여부로부터
 * 비등방성 외곽선 오프셋 벡터를 계산한다.
 */
export function computeAnisotropicOutlineOffset(
  normalViewXY: readonly [number, number],
  baseBold: number,
  outlinePressure: boolean,
): readonly [number, number] {
  const aspect = resolveOutlinePressureAspect(outlinePressure);
  return [
    normalViewXY[0] * baseBold * aspect.widthScale,
    normalViewXY[1] * baseBold * aspect.heightScale,
  ];
}

/**
 * SHAPER disableHairInline(hID) 토글: 머리카락 내부 겹침 윤곽선(inline) 억제 여부.
 */
export function shouldSuppressHairInline(role: PartRole, disableHairInline: boolean): boolean {
  return disableHairInline && (role === "hair" || role === "hair-accessory");
}

export type ShaperSelectionOutlineColorSlot = 0 | 1 | 2;

export interface ShaperSelectionOutlineEffectInput {
  /** 기본 실루엣 선 두께 (SHAPER cakeslice.OutlineEffect.lineThickness, 기본 1.25) */
  readonly lineThickness?: number;
  /** 실루엣 강도 (lineIntensity, 기본 0.5) */
  readonly lineIntensity?: number;
  /** 선택 영역 내부 채움 투명도 (fillAmount 0..1, 기본 0.2) */
  readonly fillAmount?: number;
  /** 3-슬롯 색상 인덱스 (cakeslice.Outline.color: 0 = 주 선택 주황, 1 = 보조 선택 청록, 2 = 대칭/참조 노랑) */
  readonly colorIndex?: ShaperSelectionOutlineColorSlot;
  /** 화면 높이 비례 두께 스케일링 여부 (scaleWithScreenSize, 기본 true) */
  readonly scaleWithScreenSize?: boolean;
  /** 현재 뷰포트 세로 픽셀 높이 (scaleWithScreenSize 기준 1080px 정규화) */
  readonly viewportHeightPx?: number;
  /** 코너 대각선 샘플링 확장 여부 (cornerOutlines, 기본 false) */
  readonly cornerOutlines?: boolean;
}

export interface ShaperSelectionOutlineEffectConfig {
  readonly effectiveLineThickness: number;
  readonly lineIntensity: number;
  readonly fillAmount: number;
  readonly colorHex: string;
  readonly cornerSampleMultiplier: 1 | 2;
}

/**
 * SHAPER cakeslice.OutlineEffect (0x0200001e: lineColor0, lineColor1, lineColor2) 기본 3-슬롯 선택 실루엣 팔레트:
 * - Slot 0 (`lineColor0`): 주 선택 파츠/케이지 하이라이트 (`#ff8000`)
 * - Slot 1 (`lineColor1`): 보조/그룹 선택 하이라이트 (`#00bfff`)
 * - Slot 2 (`lineColor2`): 대칭(Mirror) 또는 참조 선택 하이라이트 (`#ffd93d`)
 */
export const SHAPER_SELECTION_OUTLINE_COLORS: Readonly<Record<ShaperSelectionOutlineColorSlot, string>> =
  Object.freeze({
    0: "#ff8000",
    1: "#00bfff",
    2: "#ffd93d",
  });

/**
 * SHAPER cakeslice.OutlineEffect (Assembly-CSharp.dll 0x0200001e) & cakeslice.Outline (0x0200001d) 역공학 내재화:
 * 선택된 파츠/헤어/장신구 메시의 포스트프로세싱 선택 실루엣 두께(해상도 비례 보정), 내부 채움 강도(`fillAmount`),
 * 코너 샘플 배수(`cornerOutlines`), 3-슬롯 색상 팔레트를 계산한다.
 */
export function computeShaperSelectionOutlineEffect(
  input: ShaperSelectionOutlineEffectInput = {},
): ShaperSelectionOutlineEffectConfig {
  const baseThickness = Math.min(6, Math.max(0, input.lineThickness ?? 1.25));
  const lineIntensity = Math.min(2, Math.max(0, input.lineIntensity ?? 0.5));
  const fillAmount = Math.min(1, Math.max(0, input.fillAmount ?? 0.2));
  const colorIndex: ShaperSelectionOutlineColorSlot = input.colorIndex ?? 0;
  const scaleWithScreenSize = input.scaleWithScreenSize ?? true;
  const viewportHeightPx = Math.max(1, input.viewportHeightPx ?? 1080);
  const cornerOutlines = input.cornerOutlines ?? false;

  const screenScale = scaleWithScreenSize
    ? Math.min(4, Math.max(0.5, viewportHeightPx / 1080))
    : 1;

  return {
    effectiveLineThickness: Number((baseThickness * screenScale).toFixed(4)),
    lineIntensity,
    fillAmount,
    colorHex: SHAPER_SELECTION_OUTLINE_COLORS[colorIndex],
    cornerSampleMultiplier: cornerOutlines ? 2 : 1,
  };
}
