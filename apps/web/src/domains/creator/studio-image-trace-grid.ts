/**
 * Studio Image Trace — 래스터 → 명도 격자 변환 + 색상 레이어 분리 (순수 코어).
 *
 * 기존 브리지(`traceStudioRasterImage`)는 디코딩·다운스케일 뒤의 픽셀 연산을 전부
 * 메인 스레드에서 돌렸다. 긴 변 1024px 샘플의 휘도 계산과 색상 양자화는 큰 로고·
 * 소품 이미지에서 프레임을 끊을 수 있는 무거운 작업이라, 이 모듈을 Worker 안에서
 * 그대로 실행할 수 있게 순수 함수로 분리한다(`studio-image-trace.worker.ts`).
 *
 * - 명도 격자: RGBA → 픽셀당 휘도 1개(BT.709 계수, `studio-image-trace`의 레이어
 *   판정과 동일). 선화 임계값 미리보기·후속 임계값 재실행이 디코딩 없이 격자만으로
 *   가능해지는 것이 목적이며, 트레이스 레이어 분리는 RGB가 필요해 같은 패스에서
 *   기존 순수 함수(`buildStudioImageTraceLayers`)를 함께 돌린다.
 * - DOM/시간/난수 의존이 없어 Worker·메인 스레드(direct)·테스트가 같은 결과를 낸다.
 *   입력 배열은 변형하지 않는다.
 */

import {
  buildStudioImageTraceLayers,
  type StudioImageTraceLayer,
  type StudioImageTracePreset,
} from "./studio-image-trace";

export interface StudioImageTraceLuminanceGrid {
  readonly width: number;
  readonly height: number;
  /** 0(어두움)~255(밝음) 휘도. 길이 width*height, 행 우선. */
  readonly luminance: Uint8Array;
}

/** BT.709 휘도 — `studio-image-trace` 내부 luma 와 같은 계수·반올림 규칙. */
export function studioImageTraceLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampLuminance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

/**
 * RGBA 픽셀 → 명도 격자. 차원이 0 이하이거나 픽셀 버퍼가 부족하면 null —
 * 호출부(Worker·클라이언트)가 실패로 수렴시킬 신호다.
 * 알파는 휘도에 반영하지 않는다(판정은 레이어 분리가 담당).
 */
export function buildStudioImageTraceLuminanceGrid(
  data: Uint8ClampedArray | readonly number[],
  width: number,
  height: number,
): StudioImageTraceLuminanceGrid | null {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w <= 0 || h <= 0) return null;
  const pixelTotal = w * h;
  if (data.length < pixelTotal * 4) return null;
  const luminance = new Uint8Array(pixelTotal);
  for (let p = 0, i = 0; p < pixelTotal; p += 1, i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    luminance[p] = clampLuminance(studioImageTraceLuma(r, g, b));
  }
  return Object.freeze({ width: w, height: h, luminance });
}

export interface StudioImageTraceGridJobResult {
  readonly grid: StudioImageTraceLuminanceGrid;
  /** 프리셋별 색상 레이어. 트레이싱할 영역이 없으면 빈 배열(실패와 구분할 것). */
  readonly layers: readonly StudioImageTraceLayer[];
}

/**
 * Worker 1회 실행의 순수 본체: 명도 격자 변환 + 색상 레이어 분리를 한 패스로.
 * 격자를 만들 수 없는 입력(차원·버퍼 부족)이면 null.
 */
export function computeStudioImageTraceGridJob(
  data: Uint8ClampedArray | readonly number[],
  width: number,
  height: number,
  preset: StudioImageTracePreset,
): StudioImageTraceGridJobResult | null {
  const grid = buildStudioImageTraceLuminanceGrid(data, width, height);
  if (!grid) return null;
  const layers = buildStudioImageTraceLayers(data, grid.width, grid.height, preset);
  return Object.freeze({ grid, layers: Object.freeze(layers) });
}
