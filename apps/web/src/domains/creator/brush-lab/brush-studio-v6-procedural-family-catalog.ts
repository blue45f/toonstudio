import type { BrushStudioV6TopologyControl, BrushStudioV6TopologyDescriptor } from "./brush-studio-v6-topology-catalog";

/**
 * 절차(제너레이티브) 브러시 계열 — 다른 드로잉 프로그램의 절차 브러시 계열을 결정적 위상 모델로 내재화한다.
 *
 * 출처와 라이선스 경계(ADR-0026 §D):
 * - `harmony-*`: mrdoob/harmony(GPL)의 코드는 열람·복제하지 않았다. "지난 획 점과 반경 안에서 옅은 선으로 잇는다"처럼
 *   널리 알려진 생성 드로잉 개념 설명만 보고 독자 구현했으며, 수치·구조는 이 저장소의 결정성 계약에 맞춰 새로 정했다.
 * - `klecks-*`: Klecks(MIT, Copyright (c) 2026 bitbof)의 `sketchy-brush.ts`·`chemy-brush.ts` 알고리즘을 이식했다.
 *   MIT 고지는 `third_party/klecks/`에 있고, 이식 범위와 차이는 커널 파일 머리말에 적었다.
 * - `hatching`·`cell-grid`·`curve-trail`·`particle-spray`: Krita(GPL) 코드는 열람하지 않았다. 공개 사용자 매뉴얼에 설명된
 *   해칭·그리드·커브·스프레이 브러시 엔진의 개념(평행선·격자 칸·지난 점 곡선·입자 분포)만 사용했다.
 *
 * 영속 식별자(carrier id·recipe id)는 저장된 영수증이 참조하므로 의미를 바꾸지 말고, 바꿀 때는 -v2 로 새로 만든다.
 */
export const BRUSH_STUDIO_V6_PROCEDURAL_MODELS = [
  "harmony-sketchy", "harmony-shaded", "harmony-chrome", "harmony-fur", "harmony-longfur",
  "harmony-web", "harmony-squares", "harmony-ribbon", "harmony-circles", "harmony-grid",
  "klecks-sketchy", "klecks-chemy",
  "hatching", "cell-grid", "curve-trail", "particle-spray",
] as const;
export type BrushStudioV6ProceduralModel = typeof BRUSH_STUDIO_V6_PROCEDURAL_MODELS[number];
export function isBrushStudioV6ProceduralModel(model: string): model is BrushStudioV6ProceduralModel {
  return (BRUSH_STUDIO_V6_PROCEDURAL_MODELS as readonly string[]).includes(model);
}

/** Klecks 이식 커널은 MIT 코드 이식이므로 내부 커널과 구분된 허용형 제공자로 기록한다. */
export const BRUSH_STUDIO_V6_KLECKS_PORT_NODE_IDS = Object.freeze([
  "carrier-cpu-klecks-sketchy-v1", "carrier-cpu-klecks-chemy-v1",
]);

/** 덥 간격 하한(크기 비율). 지난 점 기억이 획 몇 굵기 이상을 덮고, 빠른 입력에서도 덥 상한에 걸려 잘리지 않게 한다. */
const MIN_STEP_RATIO = 0.05;

export function brushStudioV6ProceduralStep(size: number, fallback: number): number {
  const bounded = Number.isFinite(size) ? Math.max(1, Math.min(240, size)) : 1;
  return Math.max(fallback, bounded * MIN_STEP_RATIO);
}

const unit = (key: BrushStudioV6TopologyControl["key"], label: string): BrushStudioV6TopologyControl =>
  ({ key, label, min: 0, max: 1, step: 0.01 });
const scale = (label: string): BrushStudioV6TopologyControl =>
  ({ key: "patternScale", label, min: 0.1, max: 4, step: 0.01 });
const choice = (key: BrushStudioV6TopologyControl["key"], label: string): BrushStudioV6TopologyControl =>
  ({ key, label, min: 0, max: 1, step: 0.5 });

// 묶음 이름은 레시피 선반의 용도 분류이자 제품 재질 탭 판정(studioV6BrushMaterialGroup)의 단서다:
// 건식→연필, 자연·프로시저럴→질감, FX→효과, 만화·해칭→톤, 분사(spray 운반체)→에어브러시, 선화→잉크.
const SKETCH = "스케치·건식";
const FUR = "자연·털결";
const FX = "FX·제너레이티브";
const GEOMETRY = "프로시저럴·기하";

/** 같은 묘사 문구를 위상 선택기와 레시피 선반이 함께 쓴다. 출처 개념을 설명에 정직하게 밝힌다. */
type ProceduralDescriptor = BrushStudioV6TopologyDescriptor & { readonly model: BrushStudioV6ProceduralModel };
const DESCRIPTORS: readonly ProceduralDescriptor[] = [
  { model: "harmony-sketchy", id: "carrier-cpu-harmony-sketchy-v1", recipeId: "harmony-sketchy", group: SKETCH, label: "하모니 스케치",
    description: "Harmony의 sketchy 개념을 설명만 보고 재구현했습니다. 지나온 획 점 가운데 연결 반경 안의 점과, 양 끝을 줄인 옅은 실선을 확률적으로 잇습니다.",
    controls: [scale("연결 반경"), unit("patternDensity", "연결 빈도"), unit("patternJitter", "선 끝 흔들림")],
    tuning: { size: 24, spacing: 0.22, flow: 0.9, patternScale: 1, patternDensity: 0.7, patternJitter: 0.5,
      primaryColor: "#1f2430", secondaryColor: "#6b7a90" } },
  { model: "harmony-shaded", id: "carrier-cpu-harmony-shaded-v1", recipeId: "harmony-shaded", group: SKETCH, label: "하모니 음영",
    description: "Harmony의 shaded 개념 재구현입니다. 반경 안의 지난 점을 끝 줄임 없이 잇고, 멀수록 옅게 그어 부드러운 음영을 쌓습니다.",
    controls: [scale("음영 반경"), unit("patternDensity", "음영 농도")],
    tuning: { size: 24, spacing: 0.2, flow: 0.9, patternScale: 1, patternDensity: 0.55,
      primaryColor: "#222833", secondaryColor: "#8a96a8" } },
  { model: "harmony-chrome", id: "carrier-cpu-harmony-chrome-v1", recipeId: "harmony-chrome", group: FX, label: "하모니 크롬",
    description: "Harmony의 chrome 개념 재구현입니다. 스케치 연결선 위에 보조색 강조선을 어긋나게 겹쳐 금속 같은 명암 대비를 만듭니다.",
    controls: [scale("연결 반경"), unit("patternDensity", "강조선 비율"), unit("patternJitter", "강조선 어긋남")],
    tuning: { size: 28, spacing: 0.22, flow: 0.9, patternScale: 1, patternDensity: 0.45, patternJitter: 0.4,
      primaryColor: "#1d2633", secondaryColor: "#bde6ff" } },
  { model: "harmony-fur", id: "carrier-cpu-harmony-fur-v1", recipeId: "harmony-fur", group: FUR, label: "하모니 털",
    description: "Harmony의 fur 개념 재구현입니다. 가까운 지난 점 너머 바깥쪽으로 짧은 털을 뻗고, 획 옆으로 솟는 보호털을 더합니다.",
    controls: [scale("털 반경"), unit("patternDensity", "털 밀도"), unit("patternJitter", "털 결 흐트러짐")],
    tuning: { size: 30, spacing: 0.2, flow: 0.9, patternScale: 0.9, patternDensity: 0.6, patternJitter: 0.45,
      primaryColor: "#3b2a1e", secondaryColor: "#c89b6d" } },
  { model: "harmony-longfur", id: "carrier-cpu-harmony-longfur-v1", recipeId: "harmony-longfur", group: FUR, label: "하모니 긴 털",
    description: "Harmony의 longfur 개념 재구현입니다. 지난 점을 지나 길이·각도가 시드 고정 무작위인 긴 털을 뻗습니다.",
    controls: [scale("털 반경"), unit("reservoir", "털 길이"), unit("patternJitter", "털 결 흐트러짐")],
    tuning: { size: 32, spacing: 0.22, flow: 0.9, patternScale: 0.9, reservoir: 0.55, patternJitter: 0.4,
      primaryColor: "#2f2620", secondaryColor: "#d9b28a" } },
  { model: "harmony-web", id: "carrier-cpu-harmony-web-v1", recipeId: "harmony-web", group: SKETCH, label: "하모니 거미줄",
    description: "Harmony의 web 개념 재구현입니다. 반경 안의 모든 지난 점을 일정한 농도의 직선으로 이어 그물을 짭니다.",
    controls: [scale("거미줄 반경"), unit("patternDensity", "선 농도")],
    tuning: { size: 22, spacing: 0.24, flow: 0.9, patternScale: 1, patternDensity: 0.35,
      primaryColor: "#24303f", secondaryColor: "#7d8ea6" } },
  { model: "harmony-squares", id: "carrier-cpu-harmony-squares-v1", recipeId: "harmony-squares", group: GEOMETRY, label: "하모니 사각형",
    description: "Harmony의 squares 개념 재구현입니다. 획 방향으로 회전한 사각형 윤곽을 그리고, 크기는 거리 기준 운동량(직진성)과 필압으로 정합니다.",
    controls: [scale("사각형 크기"), unit("patternDensity", "사각형 빈도"), unit("patternJitter", "회전 흔들림")],
    tuning: { size: 28, spacing: 0.16, flow: 0.9, patternScale: 1, patternDensity: 0.6, patternJitter: 0.3,
      primaryColor: "#1e293b", secondaryColor: "#f97316" } },
  { model: "harmony-ribbon", id: "carrier-cpu-harmony-ribbon-v1", recipeId: "harmony-ribbon", group: FX, label: "하모니 리본",
    description: "Harmony의 ribbon 개념 재구현입니다. 감쇠 스프링으로 펜을 뒤따르는 여러 가닥을 잇고, 이웃 가닥 사이를 가로질러 리본 면을 만듭니다.",
    controls: [{ key: "bristleStrands", label: "리본 가닥 수", min: 8, max: 128, step: 4 },
      unit("friction", "스프링 탄성"), unit("viscosity", "흔들림 감쇠"), scale("리본 폭")],
    tuning: { size: 34, spacing: 0.1, flow: 0.9, bristleStrands: 60, friction: 0.45, viscosity: 0.35, patternScale: 1,
      primaryColor: "#0f172a", secondaryColor: "#e879f9" } },
  { model: "harmony-circles", id: "carrier-cpu-harmony-circles-v1", recipeId: "harmony-circles", group: GEOMETRY, label: "하모니 동심원",
    description: "Harmony의 circles 개념 재구현입니다. 운동량과 필압으로 크기가 정해지는 동심원과 중심이 어긋난 원을 그립니다.",
    controls: [scale("원 크기"), unit("patternDensity", "동심원 수"), unit("patternJitter", "중심 어긋남")],
    tuning: { size: 30, spacing: 0.3, flow: 0.9, patternScale: 1, patternDensity: 0.5, patternJitter: 0.35,
      primaryColor: "#1e3a5f", secondaryColor: "#38bdf8" } },
  { model: "harmony-grid", id: "carrier-cpu-harmony-grid-v1", recipeId: "harmony-grid", group: GEOMETRY, label: "하모니 격자",
    description: "Harmony의 grid 개념 재구현입니다. 문서에 고정된 거친 격자선 가운데 획 가까운 칸 모서리만 축 정렬 선분으로 드러냅니다.",
    controls: [scale("격자 크기"), unit("patternDensity", "격자 농도"), unit("patternJitter", "드러남 범위")],
    tuning: { size: 26, spacing: 0.12, flow: 0.9, patternScale: 1, patternDensity: 0.6, patternJitter: 0.4,
      primaryColor: "#1f2937", secondaryColor: "#64748b" } },
  { model: "klecks-sketchy", id: "carrier-cpu-klecks-sketchy-v1", recipeId: "klecks-sketchy", group: SKETCH, label: "클렉스 스케치", rights: "permissive",
    description: "Klecks(MIT)의 sketchy 브러시 이식입니다. 반경 안의 지난 점을 확률적으로 잇고 양 끝 30%를 줄입니다. 캔버스 색 읽기 대신 보조색과 섞습니다.",
    controls: [scale("연결 반경(Scale)"), unit("pickup", "블렌딩(보조색 혼합)")],
    tuning: { size: 20, spacing: 0.2, opacity: 1, flow: 1, patternScale: 1, pickup: 0.5,
      primaryColor: "#111111", secondaryColor: "#d9d4c7" } },
  { model: "klecks-chemy", id: "carrier-cpu-klecks-chemy-v1", recipeId: "klecks-chemy", group: FX, label: "클렉스 케미", rights: "permissive",
    description: "Klecks(MIT)의 chemy 브러시 이식입니다. 제스처를 시작점에 닫힌 도형으로 채우고 좌우·상하 대칭 사본을 만듭니다. 채움은 촘촘한 캡슐로 근사합니다.",
    controls: [choice("patternDensity", "대칭(없음·좌우·상하좌우)"), unit("patternJitter", "왜곡(Distort)"),
      unit("reservoir", "채움 농도"), unit("relief", "윤곽선 두께")],
    tuning: { size: 24, spacing: 0.12, opacity: 1, flow: 1, patternDensity: 0.5, patternJitter: 0, reservoir: 0.9, relief: 0.25,
      primaryColor: "#7c3aed", secondaryColor: "#1e1b4b" } },
  { model: "hatching", id: "carrier-cpu-hatching-v1", recipeId: "hatching-crosshatch", group: "만화·해칭 톤", label: "교차 해칭 펜",
    description: "Krita 공개 매뉴얼의 해칭 브러시 개념을 재구현했습니다. 문서에 고정된 평행선을 붓 범위 안에서만 드러내고, 필압으로 교차 해칭 층을 더합니다.",
    controls: [unit("patternJitter", "해칭 각도"), scale("선 간격"), unit("patternDensity", "교차 해칭 단계"), unit("relief", "선 두께")],
    tuning: { size: 36, spacing: 0.1, flow: 0.9, patternJitter: 0.2, patternScale: 1, patternDensity: 0.4, relief: 0.4,
      primaryColor: "#111827", secondaryColor: "#475569" } },
  { model: "cell-grid", id: "carrier-cpu-cell-grid-v1", recipeId: "cell-grid-tone", group: "만화·격자 톤", label: "격자 셀 톤",
    description: "Krita 공개 매뉴얼의 그리드 브러시 개념 재구현입니다. 붓이 지나간 문서 고정 격자 칸을 원·고리·사선 도형으로 한 번씩 채웁니다.",
    controls: [scale("격자 칸 크기"), unit("patternDensity", "칸 채움 비율"), choice("relief", "칸 도형(원·고리·사선)"), unit("patternJitter", "칸 흔들림")],
    tuning: { size: 30, spacing: 0.12, flow: 0.9, patternScale: 1, patternDensity: 0.6, relief: 0, patternJitter: 0.15,
      primaryColor: "#111827", secondaryColor: "#9ca3af" } },
  { model: "curve-trail", id: "carrier-cpu-curve-trail-v1", recipeId: "curve-trail", group: "선화·곡선", label: "곡선 잔상",
    description: "Krita 공개 매뉴얼의 커브 브러시 개념 재구현입니다. 현재 점과 지난 점들을 부드러운 이차 곡선으로 이어 실 같은 잔상을 남깁니다.",
    controls: [scale("곡선 길이"), unit("patternDensity", "곡선 겹 수"), unit("patternJitter", "곡선 휨")],
    tuning: { size: 24, spacing: 0.18, flow: 0.9, patternScale: 1, patternDensity: 0.5, patternJitter: 0.4,
      primaryColor: "#1e293b", secondaryColor: "#a78bfa" } },
  { model: "particle-spray", id: "carrier-cpu-particle-spray-v1", recipeId: "particle-spray", group: "분사·입자", label: "입자 스프레이",
    description: "Krita 공개 매뉴얼의 스프레이 브러시 개념 재구현입니다. 시드 고정 입자를 균일·가우시안 분포로 뿌리고 입자 크기와 회전을 무작위로 바꿉니다.",
    controls: [{ key: "particleCount", label: "입자 수", min: 128, max: 4096, step: 128 }, scale("분사 반경"),
      unit("diffusion", "가우시안 분포"), unit("granulation", "입자 크기 편차"), unit("patternJitter", "회전 무작위")],
    tuning: { size: 36, spacing: 0.2, flow: 0.9, particleCount: 1536, patternScale: 1, diffusion: 0.6, granulation: 0.5, patternJitter: 0.7,
      primaryColor: "#0f172a", secondaryColor: "#f59e0b" } },
];
export const BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES: readonly ProceduralDescriptor[] = Object.freeze(DESCRIPTORS.map((entry) =>
  Object.freeze({ ...entry, controls: Object.freeze(entry.controls.map((control) => Object.freeze({ ...control }))),
    tuning: Object.freeze({ ...entry.tuning }) })));
