/**
 * Krita 브러시 개념 적용기(개념 재구현, 원본 코드 미참조).
 * 원형 dab 마스크를 생성하고, mask × color를 캔버스(RGBA interleaved)에 합성한다.
 *
 * GPL 원본(Krita Core)의 코드·식별자·주석·오프셋을 복사하지 않으며,
 * 개념·파라미터·수식 아이디어만 사용한다(license-policy.md 4.5절).
 * 새 컬러 믹서는 만들지 않는다(license-policy.md 4절).
 * 모든 연산은 Math.fround로 f32 정확도를 유지한다(km-mix.ts 관례).
 *
 * 캔버스 가정: 정사각형, 변의 길이 = Math.sqrt(canvas.length / 4).
 * 오프셋이 캔버스 범위를 벗어나면 해당 픽셀은 클리핑되고 예외를 던지지 않는다(paint device와 동일).
 */

import { SumiError } from "../core/errors";
import { smoothColor } from "../pigment/krita-dynamics";

export type DabMode = "additive" | "multiply" | "erase";

export interface EllipticalDabOptions {
  /** 단축/장축 비율 (0, 1]. 1이면 정원, 작을수록 납작한 치즐/캘리그라피 팁. */
  readonly aspect?: number;
  /** 회전 각도(라디안). */
  readonly angleRad?: number;
  /** 픽셀 경계 날카로움 [0, 1]. 1에 가까울수록 픽셀아트/단단한 펜촉처럼 양자화됨. */
  readonly sharpness?: number;
}

const SUPPORTED_MODES: readonly DabMode[] = ["additive", "multiply", "erase"];

function isDabMode(mode: unknown): mode is DabMode {
  return typeof mode === "string" && (SUPPORTED_MODES as readonly string[]).includes(mode);
}

/**
 * 원형 dab 마스크. size는 픽셀 변 길이, hardness 0(soft) .. 1(hard edge).
 * 중심 픽셀은 항상 1.0, 가장자리 밖은 0.0.
 */
export function generateDabMask(size: number, hardness: number): Float32Array {
  return generateEllipticalDabMask(size, hardness);
}

/**
 * 타원형·회전·샤프니스 지원 dab 마스크(Krita AutoBrush 타원/각도/샤프니스 개념 재구현).
 */
export function generateEllipticalDabMask(
  size: number,
  hardness: number,
  options: EllipticalDabOptions = {},
): Float32Array {
  if (!Number.isFinite(size) || size < 1 || size !== Math.trunc(size)) {
    throw new SumiError("kc-invalid-mask", "size는 1 이상의 정수여야 한다", { size });
  }
  if (!Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
    throw new SumiError("kc-invalid-mask", "hardness는 [0, 1]이어야 한다", { hardness });
  }
  const aspect = options.aspect ?? 1;
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect > 1) {
    throw new SumiError("kc-invalid-mask", "aspect는 (0, 1]이어야 한다", { aspect });
  }
  const angleRad = options.angleRad ?? 0;
  const sharpness = options.sharpness ?? 0;
  if (!Number.isFinite(sharpness) || sharpness < 0 || sharpness > 1) {
    throw new SumiError("kc-invalid-mask", "sharpness는 [0, 1]이어야 한다", { sharpness });
  }

  const mask = new Float32Array(size * size);
  const center = (size - 1) / 2;
  const radius = size / 2;
  const hard = Math.fround(hardness);
  const soft = Math.fround(1 - hardness);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const rx = dx * cosA + dy * sinA;
      const ry = (-dx * sinA + dy * cosA) / aspect;
      const dist = Math.hypot(rx, ry);
      const hardValue = dist <= radius ? 1 : 0;
      const softValue = Math.max(0, 1 - dist / radius);
      const rawVal = Math.fround(hard * hardValue + soft * softValue);
      const quantized = rawVal >= 0.5 ? 1 : 0;
      mask[y * size + x] = Math.fround(rawVal * (1 - sharpness) + quantized * sharpness);
    }
  }
  return mask;
}

/**
 * 캔버스 하부 영역의 평균 색을 샘플링해 K/S 안료 공간(smoothColor)에서 브러시 색과 스머지 혼색한다.
 */
export function smudgeDabColor(
  canvas: Float32Array,
  offsetX: number,
  offsetY: number,
  maskSize: number,
  brushColor: readonly [number, number, number, number],
  smudgeRate: number,
): readonly [number, number, number, number] {
  const rate = smudgeRate < 0 ? 0 : smudgeRate > 1 ? 1 : smudgeRate;
  if (rate === 0) return brushColor;
  const dim = Math.trunc(Math.sqrt(canvas.length / 4));
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let aSum = 0;
  let count = 0;

  for (let my = 0; my < maskSize; my += 1) {
    const cy = offsetY + my;
    if (cy < 0 || cy >= dim) continue;
    for (let mx = 0; mx < maskSize; mx += 1) {
      const cx = offsetX + mx;
      if (cx < 0 || cx >= dim) continue;
      const base = (cy * dim + cx) * 4;
      const a = canvas[base + 3] ?? 0;
      if (a > 0.001) {
        rSum += Math.min(1, Math.max(0, canvas[base] ?? 0));
        gSum += Math.min(1, Math.max(0, canvas[base + 1] ?? 0));
        bSum += Math.min(1, Math.max(0, canvas[base + 2] ?? 0));
        aSum += Math.min(1, Math.max(0, a));
        count += 1;
      }
    }
  }
  if (count === 0) return brushColor;

  const avg: readonly [number, number, number] = [rSum / count, gSum / count, bSum / count];
  const [mr, mg, mb] = smoothColor(
    [brushColor[0], brushColor[1], brushColor[2]],
    avg,
    rate,
  );
  const ma = Math.fround(brushColor[3] * (1 - rate) + (aSum / count) * rate);
  return [mr, mg, mb, ma];
}

/**
 * mask × color를 canvas(RGBA interleaved, 정사각형)에 합성한다.
 * mode:
 * - additive: canvas += mask × color
 * - multiply: canvas *= (1 - mask + mask × color)
 * - erase: canvas *= (1 - mask)
 * offset이 범위를 벗어나면 해당 픽셀을 건너뛴다(클리핑, 예외 없음).
 */
export function applyDab(
  mask: Float32Array,
  color: readonly [number, number, number, number],
  canvas: Float32Array,
  offsetX: number,
  offsetY: number,
  mode: DabMode,
): void {
  if (!isDabMode(mode)) {
    throw new SumiError("kc-invalid-mode", `지원하지 않는 합성 모드: ${String(mode)}`, { mode });
  }
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    throw new SumiError("kc-invalid-offset", "offsetX/offsetY는 유한값이어야 한다", {
      offsetX,
      offsetY,
    });
  }

  const dim = Math.sqrt(canvas.length / 4);
  if (!Number.isFinite(dim) || dim !== Math.trunc(dim)) {
    throw new SumiError("kc-invalid-canvas", "canvas는 정사각형 RGBA interleaved 버퍼여야 한다", {
      length: canvas.length,
    });
  }

  const maskSize = Math.sqrt(mask.length);
  if (!Number.isFinite(maskSize) || maskSize !== Math.trunc(maskSize)) {
    throw new SumiError("kc-invalid-mask", "mask는 정사각형이어야 한다", { length: mask.length });
  }

  const cr = color[0];
  const cg = color[1];
  const cb = color[2];
  const ca = color[3];

  for (let my = 0; my < maskSize; my += 1) {
    const cy = offsetY + my;
    if (cy < 0 || cy >= dim) continue;
    const maskRow = my * maskSize;
    for (let mx = 0; mx < maskSize; mx += 1) {
      const cx = offsetX + mx;
      if (cx < 0 || cx >= dim) continue;
      const m = mask[maskRow + mx];
      if (m === 0) continue;
      const base = (cy * dim + cx) * 4;
      if (mode === "additive") {
        canvas[base] = Math.fround(canvas[base] + m * cr);
        canvas[base + 1] = Math.fround(canvas[base + 1] + m * cg);
        canvas[base + 2] = Math.fround(canvas[base + 2] + m * cb);
        canvas[base + 3] = Math.fround(canvas[base + 3] + m * ca);
      } else if (mode === "multiply") {
        canvas[base] = Math.fround(canvas[base] * (1 - m + m * cr));
        canvas[base + 1] = Math.fround(canvas[base + 1] * (1 - m + m * cg));
        canvas[base + 2] = Math.fround(canvas[base + 2] * (1 - m + m * cb));
        canvas[base + 3] = Math.fround(canvas[base + 3] * (1 - m + m * ca));
      } else {
        // erase
        const factor = Math.fround(1 - m);
        canvas[base] = Math.fround(canvas[base] * factor);
        canvas[base + 1] = Math.fround(canvas[base + 1] * factor);
        canvas[base + 2] = Math.fround(canvas[base + 2] * factor);
        canvas[base + 3] = Math.fround(canvas[base + 3] * factor);
      }
    }
  }
}
