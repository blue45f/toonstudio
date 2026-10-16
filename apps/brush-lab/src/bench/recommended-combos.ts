/**
 * 추천 조합의 측정 근거(Node 22 단일 스레드, 2026-10-16, 154셀 전수).
 *
 * 방법: 레인 7종(cpu-reference·platform-baseline·wasm-cpu·bristle-pbd·bristle-rapier·libmypaint·mpm-paint) ×
 * 프리셋 11종 × fixture 2종(zigzag 256²·나선 30초 512²). 같은 입력 2회 재생 해시 일치(결정성)를 통과하고
 * 두 fixture 모두 잉크가 남은 레인만 후보로 삼았다. 26셀은 설계상 거부(not-implemented·비교 레인의 습식 제외)다.
 * 값은 같은 머신 단일 측정이라 성능 증거가 아니며, 실 GPU·실기기·브라우저 검증 전까지 승격 근거로 쓰지 않는다.
 *
 * 결과 요약: wasm-cpu는 cpu-reference와 픽셀 동일(분산까지 일치)인 채 대부분 더 빠르다.
 * libmypaint는 3~10배 빠르지만 입력 파이프라인·종이 그레인·닙 홈이 없어 다른 그림이다(비교용).
 * 습식 4종은 CPU 경로가 30초 나선에 수십 초라 실시간 불가이며, GPU 습식 미러 검증이 열리면 교체한다.
 */

/** 가족별 추천 조합 1행. */
export interface FamilyRecommendation {
  /** 브러시 가족(프리셋 id). */
  presetId: string;
  /** 추천 레인. */
  laneId: string;
  /** 추천 이유(한글 한 줄). */
  reasonKo: string;
  /** 지그재그 256² 측정 소요(ms). */
  zigzagMs: number;
  /** 30초 나선 측정 소요(ms). */
  spiralMs: number;
  /** 주의점(없으면 null). */
  noteKo: string | null;
}

/** 측정 출처. */
export const COMBO_PROVENANCE = "Node 22 단일 스레드·2026-10-16·154셀 전수(통과 128·설계거부 26·실패 0·비결정적 0)";

export const RECOMMENDED_COMBOS: readonly FamilyRecommendation[] = [
  { presetId: "pencil-hb", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀, 나선 4배 빠름", zigzagMs: 46, spiralMs: 629, noteKo: "종이 그레인 기준선(var 0.05)" },
  { presetId: "charcoal", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀, 목탄 그레인 유지", zigzagMs: 60, spiralMs: 842, noteKo: "속도 대안 libmypaint(14ms)는 그레인이 없다" },
  { presetId: "ink-g-pen", laneId: "wasm-cpu", reasonKo: "닙 홈 포함 동일 픽셀", zigzagMs: 82, spiralMs: 1388, noteKo: null },
  { presetId: "ink-brush-pen", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀, 나선 1.4배 빠름", zigzagMs: 98, spiralMs: 1380, noteKo: "손맛 대안 bristle-pbd(실험)" },
  { presetId: "ink-maru-pen", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀", zigzagMs: 38, spiralMs: 858, noteKo: null },
  { presetId: "marker-alcohol", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀", zigzagMs: 48, spiralMs: 1009, noteKo: null },
  { presetId: "airbrush", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀", zigzagMs: 554, spiralMs: 13231, noteKo: "대형 획은 실시간 불가. bristle 레인은 airbrush를 그리지 못한다(잉크 0)" },
  { presetId: "watercolor-wet", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀", zigzagMs: 2253, spiralMs: 38750, noteKo: "실시간 불가·오프라인 렌더용. GPU 습식 미러 검증 후 교체" },
  { presetId: "sumi-ink-wet", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀", zigzagMs: 2801, spiralMs: 55056, noteKo: "실시간 불가·오프라인 렌더용. GPU 습식 미러 검증 후 교체" },
  { presetId: "oil-impasto", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀", zigzagMs: 2185, spiralMs: 107146, noteKo: "실시간 불가·오프라인 렌더용" },
  { presetId: "gouache", laneId: "wasm-cpu", reasonKo: "CPU 참조와 동일 픽셀", zigzagMs: 3227, spiralMs: 67217, noteKo: "실시간 불가·오프라인 렌더용" },
];
