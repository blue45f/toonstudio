/**
 * 걷기·행동 프레임 등록(registration)
 *
 * 프레임마다 따로 그려진 시트(v5 스타일 팩)는 프레임 사이에 캐릭터의 발 위치·몸통 중심·크기가
 * 달라 그대로 재생하면 발이 떴다 가라앉고 몸이 좌우로 떨리며, 정지 그림보다 작아 걷기를 시작하고
 * 멈출 때 크기가 튄다. 이 모듈은 텍스처가 로드된 직후 각 프레임의 단단한 알파 외곽을 한 번 재서
 *
 * - 발 기준선과 몸통 중심을 모든 프레임에서 같은 지점에 두고,
 * - 크기를 같은 방향 정지 그림의 높이에 맞추는
 *
 * 프레임별 표시 좌표(원점·배율)를 계산한다. 파일은 바꾸지 않고(저장소 용량·출처 기록 불변) 표시
 * 좌표만 보정한다. 계산은 전부 순수 함수이며 Phaser·DOM에 의존하지 않는다.
 */

import type { StudioCharacterFramePresentation } from "./studio-virtual-space-character-skins";
import { STUDIO_CHARACTER_FOOT_ORIGIN } from "./studio-virtual-space-presentation";

/** 정지 방향 그림이 놓이는 원점(프레임 비율). 표시 좌표가 없는 단일 이미지의 기본 기하와 같다. */
const STILL_ORIGIN = Object.freeze({ x: 0.5, y: STUDIO_CHARACTER_FOOT_ORIGIN });

/** 알파가 이 값보다 큰 픽셀만 몸으로 센다(부드러운 그림자·외곽 번짐을 제외한다). */
export const STUDIO_FRAME_SOLID_ALPHA = 128;

/** 몸통 중심을 재는 띠: 외곽 높이의 25%~60%(머리카락·다리가 아니라 상체). */
const TORSO_BAND_START = 0.25;
const TORSO_BAND_END = 0.6;

/** 한 프레임의 단단한 알파 외곽(프레임 좌표, px). */
export interface StudioFrameBounds {
  /** 가장 위의 단단한 픽셀 줄(포함). */
  readonly top: number;
  /** 가장 아래의 단단한 픽셀 줄 다음(제외). 발바닥 기준선이다. */
  readonly bottom: number;
  /** 몸통 띠에서 단단한 픽셀의 평균 x. */
  readonly torsoCenterX: number;
}

export interface StudioFrameRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * RGBA 픽셀에서 영역 안의 단단한 알파 외곽과 몸통 중심을 잰다. 단단한 픽셀이 없으면 null이다.
 * `rgba`는 이미지 전체(행 우선, 픽셀당 4바이트)이고 `region`은 그 안의 프레임이다.
 */
export function measureStudioFrameBounds(
  rgba: ArrayLike<number>,
  imageWidth: number,
  region: StudioFrameRegion,
  threshold = STUDIO_FRAME_SOLID_ALPHA,
): StudioFrameBounds | null {
  if (![imageWidth, region.x, region.y, region.width, region.height].every(Number.isFinite)
    || imageWidth <= 0 || region.width <= 0 || region.height <= 0) return null;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < region.height; y += 1) {
    const rowStart = ((region.y + y) * imageWidth + region.x) * 4 + 3;
    let solid = false;
    for (let x = 0; x < region.width; x += 1) {
      if ((rgba[rowStart + x * 4] ?? 0) > threshold) { solid = true; break; }
    }
    if (!solid) continue;
    if (top < 0) top = y;
    bottom = y + 1;
  }
  if (top < 0) return null;
  const height = bottom - top;
  const bandStart = top + Math.floor(height * TORSO_BAND_START);
  const bandEnd = Math.max(bandStart + 1, top + Math.floor(height * TORSO_BAND_END));
  let sum = 0;
  let count = 0;
  for (let y = bandStart; y < bandEnd && y < region.height; y += 1) {
    const rowStart = ((region.y + y) * imageWidth + region.x) * 4 + 3;
    for (let x = 0; x < region.width; x += 1) {
      if ((rgba[rowStart + x * 4] ?? 0) > threshold) { sum += x; count += 1; }
    }
  }
  return { top, bottom, torsoCenterX: count > 0 ? sum / count : region.width / 2 };
}

/** 등록 배율이 정지 그림 높이에서 벗어날 수 있는 범위. 비정상 시트가 캐릭터를 터무니없이 키우거나 줄이지 않게 한다. */
const MIN_RATIO = 0.8;
const MAX_RATIO = 1.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface StudioFrameRegistrationInput {
  /** 시트 프레임별 외곽(측정 실패는 null). */
  readonly frames: readonly (StudioFrameBounds | null)[];
  /** 같은 방향 정지 그림의 외곽. */
  readonly still: StudioFrameBounds;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** 정지 그림이 놓이는 원점(프레임 비율). 걷기 프레임이 정지 그림과 같은 지면 위치에 오도록 맞춘다. */
  readonly stillOrigin: { readonly x: number; readonly y: number };
  /** 측정하지 못한 프레임이 쓸 기존 표시 좌표. */
  readonly fallback?: readonly (StudioCharacterFramePresentation | undefined)[] | undefined;
}

/**
 * 프레임별 표시 좌표를 계산한다. 쓸 수 있는 프레임이 하나도 없거나 정지 그림이 비정상이면 null이다.
 *
 * - 크기: 시트 프레임들의 평균 높이를 정지 그림 높이에 맞춘다(프레임 간 상대 높이 차는 유지해 자연스러운 자세 변화는 남는다).
 * - 발 기준선: 각 프레임의 발바닥을 정지 그림의 발바닥이 놓이는 지면 위치에 둔다.
 * - 몸통 중심: 각 프레임의 몸통 중심을 정지 그림의 몸통 중심 위치에 둔다.
 */
export function registerStudioFrames(input: StudioFrameRegistrationInput): readonly StudioCharacterFramePresentation[] | null {
  const { frames, still, frameWidth, frameHeight, stillOrigin, fallback } = input;
  if (!(frameWidth > 0) || !(frameHeight > 0)) return null;
  const stillHeight = still.bottom - still.top;
  if (!(stillHeight > 0)) return null;
  const measured = frames.filter((frame): frame is StudioFrameBounds => frame !== null);
  if (measured.length === 0) return null;
  const meanHeight = measured.reduce((sum, frame) => sum + (frame.bottom - frame.top), 0) / measured.length;
  if (!(meanHeight > 0)) return null;
  const ratio = clamp(stillHeight / meanHeight, MIN_RATIO, MAX_RATIO);
  // 정지 그림의 발바닥·몸통 중심이 원점에서 벗어난 만큼(프레임 px). 걷기 프레임은 같은 화면 거리만큼 벗어나게 한다.
  const footOffset = still.bottom - stillOrigin.y * frameHeight;
  const centerOffset = still.torsoCenterX - stillOrigin.x * frameWidth;
  return Object.freeze(frames.map((frame, index) => {
    const base = fallback?.[index];
    if (!frame) return Object.freeze({
      originX: base?.originX ?? stillOrigin.x,
      originY: base?.originY ?? stillOrigin.y,
      displayHeightRatio: base?.displayHeightRatio ?? ratio,
      ...(base?.seatOriginY !== undefined ? { seatOriginY: base.seatOriginY } : {}),
    });
    return Object.freeze({
      originX: clamp((frame.torsoCenterX - centerOffset / ratio) / frameWidth, 0.2, 0.8),
      originY: clamp((frame.bottom - footOffset / ratio) / frameHeight, 0.5, 1.1),
      displayHeightRatio: ratio,
      ...(base?.seatOriginY !== undefined ? { seatOriginY: base.seatOriginY } : {}),
    });
  }));
}

/**
 * 텍스처 키별 측정 결과와 그로부터 계산한 프레임별 표시 좌표를 보관한다.
 * 시트나 정지 그림 중 하나라도 아직 측정 전이면 null을 돌려주므로 호출 측은 기존 좌표로 그대로 그린다.
 */
export class StudioFrameRegistry {
  private readonly measured = new Map<string, readonly (StudioFrameBounds | null)[]>();
  private readonly resolved = new Map<string, readonly StudioCharacterFramePresentation[] | null>();

  /** 텍스처가 로드돼 측정이 끝났을 때 기록한다. 같은 키를 다시 기록하면 그 키에 의존하던 계산을 비운다. */
  record(textureKey: string, frames: readonly (StudioFrameBounds | null)[]): void {
    this.measured.set(textureKey, frames);
    this.invalidate(textureKey);
  }

  /** 텍스처를 내릴 때 호출한다. */
  forget(textureKey: string): void {
    this.measured.delete(textureKey);
    this.invalidate(textureKey);
  }

  has(textureKey: string): boolean {
    return this.measured.has(textureKey);
  }

  /**
   * 시트(sheetKey)의 프레임별 표시 좌표. 같은 방향 정지 그림(stillKey)을 기준으로 맞춘다.
   * `sheet`는 프레임 크기와 기존 표시 좌표(측정 실패 프레임의 대체값)를 가진 클립이다. 매 프레임 불러도 새 객체를 만들지 않는다.
   */
  presentation(
    sheetKey: string,
    stillKey: string,
    sheet: {
      readonly frameWidth: number;
      readonly frameHeight: number;
      readonly frames?: readonly (StudioCharacterFramePresentation | undefined)[] | undefined;
    },
  ): readonly StudioCharacterFramePresentation[] | null {
    const cacheKey = `${sheetKey}|${stillKey}`;
    const cached = this.resolved.get(cacheKey);
    if (cached !== undefined) return cached;
    const frames = this.measured.get(sheetKey);
    const still = this.measured.get(stillKey)?.[0];
    // 아직 측정 전이면 결과를 캐시하지 않는다(나중에 기록되면 다시 계산한다).
    if (!frames || !still) return null;
    const result = registerStudioFrames({
      frames, still, frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight, stillOrigin: STILL_ORIGIN, fallback: sheet.frames,
    });
    this.resolved.set(cacheKey, result);
    return result;
  }

  private invalidate(textureKey: string): void {
    for (const cacheKey of this.resolved.keys()) {
      if (cacheKey.split("|").includes(textureKey)) this.resolved.delete(cacheKey);
    }
  }
}
