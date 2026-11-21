/**
 * CSP EX 케즈리(톤 깎기 / Tone Scraping) 전용 브러시 엔진.
 *
 * 만화 원고에서 스크린톤을 칼날·거즈·크로스해치·구름 스펀지로 긁어내어
 * 머리카락 하이라이트, 금속 광택, 공기 원근을 연출하는 4종 팁을 비파괴
 * `LiveScreentoneMaskLayer`의 `scrapeMask` 및 `densityBias` 채널에 적용한다.
 */

import type { LiveScreentoneMaskLayer } from "./studio-screentone-live-mask";

export const SCREENTONE_SCRAPE_TIP_KINDS = [
  "soft-gauze",
  "parallel-blade",
  "cross-hatch",
  "cloud-sponge",
] as const;

export type ScreentoneScrapeTipKind = (typeof SCREENTONE_SCRAPE_TIP_KINDS)[number];

export type ScreentoneScrapeMode = "scrape" | "restore" | "darken";

export interface ScreentoneScrapeBrushSettings {
  readonly tipKind: ScreentoneScrapeTipKind;
  readonly mode: ScreentoneScrapeMode;
  /** 브러시 반경(px, 2..200). */
  readonly radiusPx: number;
  /** 강도 (0.05..1). */
  readonly strength: number;
  /** 경도 (0..0.95). */
  readonly hardness: number;
  /** 스탬프 간격 비율 (0.1..1.0). */
  readonly spacingRatio: number;
  /** 평행 칼날·크로스해치 각도(도). */
  readonly bladeAngleDeg: number;
  /** 칼날/해치 줄 수 (2..16). */
  readonly featherCount: number;
  readonly pressureAffectsStrength: boolean;
  readonly pressureAffectsRadius: boolean;
  /** 결정론적 입자 시드. */
  readonly seed: number;
}

export interface ScreentoneScrapePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly settings: ScreentoneScrapeBrushSettings;
}

export interface ScreentoneScrapePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly angleDeg?: number;
}

export interface ScreentoneScrapeDirtyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreentoneScrapeStrokeResult {
  readonly layer: LiveScreentoneMaskLayer;
  readonly dabCount: number;
  readonly affectedPixels: number;
  readonly dirtyRect: ScreentoneScrapeDirtyRect | null;
}

export const SCREENTONE_SCRAPE_PRESETS: readonly ScreentoneScrapePreset[] = Object.freeze([
  {
    id: "soft-gauze-highlight",
    labelKo: "부드러운 거즈 깎기",
    descriptionKo: "피부·배경 경계를 부드럽게 날리는 기본 거즈 케즈리",
    settings: {
      tipKind: "soft-gauze",
      mode: "scrape",
      radiusPx: 24,
      strength: 0.45,
      hardness: 0.25,
      spacingRatio: 0.28,
      bladeAngleDeg: 45,
      featherCount: 6,
      pressureAffectsStrength: true,
      pressureAffectsRadius: false,
      seed: 101,
    },
  },
  {
    id: "parallel-blade-hair",
    labelKo: "평행 칼날 깎기",
    descriptionKo: "머리카락 하이라이트·금속 광택용 날카로운 평행 긁기",
    settings: {
      tipKind: "parallel-blade",
      mode: "scrape",
      radiusPx: 18,
      strength: 0.72,
      hardness: 0.55,
      spacingRatio: 0.2,
      bladeAngleDeg: 30,
      featherCount: 8,
      pressureAffectsStrength: true,
      pressureAffectsRadius: true,
      seed: 202,
    },
  },
  {
    id: "cross-hatch-etch",
    labelKo: "크로스해치 깎기",
    descriptionKo: "거친 아날로그 소묘 느낌의 교차 해칭 케즈리",
    settings: {
      tipKind: "cross-hatch",
      mode: "scrape",
      radiusPx: 22,
      strength: 0.58,
      hardness: 0.4,
      spacingRatio: 0.3,
      bladeAngleDeg: 45,
      featherCount: 6,
      pressureAffectsStrength: true,
      pressureAffectsRadius: false,
      seed: 303,
    },
  },
  {
    id: "cloud-sponge-atmosphere",
    labelKo: "구름 스펀지 깎기",
    descriptionKo: "역광·안개·구름 연출용 유기적 텍스처 스펀지",
    settings: {
      tipKind: "cloud-sponge",
      mode: "scrape",
      radiusPx: 32,
      strength: 0.5,
      hardness: 0.2,
      spacingRatio: 0.35,
      bladeAngleDeg: 0,
      featherCount: 5,
      pressureAffectsStrength: true,
      pressureAffectsRadius: true,
      seed: 404,
    },
  },
]);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = Math.max(1e-5, edge1 - edge0);
  const t = clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}

function hash01(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/**
 * 팁 종류별 절차적 케즈리 질감 계수(0..1)를 결정론적으로 계산한다.
 */
export function evaluateScrapeTipTexture(
  tipKind: ScreentoneScrapeTipKind,
  dx: number,
  dy: number,
  radius: number,
  settings: ScreentoneScrapeBrushSettings,
  dabIndex: number,
): number {
  const rad = (settings.bladeAngleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;
  const count = Math.max(2, Math.min(16, Math.round(settings.featherCount)));

  if (tipKind === "soft-gauze") {
    const grain = hash01(Math.round(dx * 1.5), Math.round(dy * 1.5), settings.seed + dabIndex * 17);
    return 0.65 + 0.35 * grain;
  }

  if (tipKind === "parallel-blade") {
    const wave = 0.5 + 0.5 * Math.cos((ry / Math.max(1, radius)) * Math.PI * count);
    const jitter = hash01(Math.round(ry), Math.round(rx * 0.25), settings.seed + dabIndex * 13);
    return clamp(smoothstep(0.25, 0.85, wave) * (0.75 + 0.25 * jitter), 0, 1);
  }

  if (tipKind === "cross-hatch") {
    const w1 = 0.5 + 0.5 * Math.cos((ry / Math.max(1, radius)) * Math.PI * count);
    const w2 = 0.5 + 0.5 * Math.cos((rx / Math.max(1, radius)) * Math.PI * count);
    return clamp(Math.max(smoothstep(0.35, 0.9, w1), smoothstep(0.35, 0.9, w2) * 0.85), 0, 1);
  }

  // cloud-sponge: 다중 스케일 유기적 뭉침
  const coarse = hash01(Math.floor(dx / 3), Math.floor(dy / 3), settings.seed + dabIndex * 31);
  const fine = hash01(Math.round(dx), Math.round(dy), settings.seed + dabIndex * 7 + 53);
  return smoothstep(0.22, 0.88, coarse * 0.65 + fine * 0.35);
}

/**
 * 입력 포인트 열을 브러시 스페이싱 간격에 맞춰 등간격 보간 리샘플한다.
 */
export function resampleScrapeStroke(
  points: readonly ScreentoneScrapePoint[],
  spacingPx: number,
): readonly ScreentoneScrapePoint[] {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length <= 1) return valid;

  const step = Math.max(1, Number.isFinite(spacingPx) ? spacingPx : 4);
  const out: ScreentoneScrapePoint[] = [valid[0]!];
  let carry = 0;

  for (let i = 1; i < valid.length; i += 1) {
    const prev = valid[i - 1]!;
    const curr = valid[i]!;
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (segLen < 1e-4) continue;

    let dist = step - carry;
    while (dist <= segLen) {
      const t = dist / segLen;
      const p0 = clamp(prev.pressure ?? 1, 0.05, 1);
      const p1 = clamp(curr.pressure ?? 1, 0.05, 1);
      out.push({
        x: prev.x + (curr.x - prev.x) * t,
        y: prev.y + (curr.y - prev.y) * t,
        pressure: p0 + (p1 - p0) * t,
        angleDeg: curr.angleDeg ?? prev.angleDeg,
      });
      dist += step;
    }
    carry = segLen - (dist - step);
  }

  const last = valid[valid.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 0.5) {
    out.push(last);
  }
  return out;
}

/**
 * 케즈리 브러시 스트로크 전체를 비파괴 `LiveScreentoneMaskLayer`에 적용한다.
 * 원본 마스크 배열은 변경하지 않고 새 레이어 스냅샷과 변경 ROI(`dirtyRect`)를 반환한다.
 */
export function applyScreentoneScrapeStroke(
  layer: LiveScreentoneMaskLayer,
  points: readonly ScreentoneScrapePoint[],
  settings: ScreentoneScrapeBrushSettings,
): ScreentoneScrapeStrokeResult {
  const baseRadius = clamp(settings.radiusPx, 2, 200);
  const baseStrength = clamp(settings.strength, 0.05, 1);
  const hardness = clamp(settings.hardness, 0, 0.95);
  const spacingRatio = clamp(settings.spacingRatio, 0.1, 1);

  const dabs = resampleScrapeStroke(points, Math.max(1, baseRadius * spacingRatio));
  if (dabs.length === 0) {
    return { layer, dabCount: 0, affectedPixels: 0, dirtyRect: null };
  }

  const nextScrape = new Float32Array(layer.scrapeMask);
  const nextBias = new Float32Array(layer.densityBias);
  const { width, height } = layer;

  let dirtyMinX = width;
  let dirtyMinY = height;
  let dirtyMaxX = -1;
  let dirtyMaxY = -1;
  const touched = new Uint8Array(width * height);
  let affectedPixels = 0;

  for (let dIdx = 0; dIdx < dabs.length; dIdx += 1) {
    const dab = dabs[dIdx]!;
    const pressure = clamp(dab.pressure ?? 1, 0.05, 1);
    const radius = settings.pressureAffectsRadius
      ? Math.max(1.5, baseRadius * (0.35 + 0.65 * pressure))
      : baseRadius;
    const strength = settings.pressureAffectsStrength ? baseStrength * pressure : baseStrength;
    const innerRadius = radius * hardness;

    const effectiveSettings: ScreentoneScrapeBrushSettings =
      dab.angleDeg !== undefined
        ? { ...settings, bladeAngleDeg: dab.angleDeg }
        : settings;

    const minX = Math.max(0, Math.floor(dab.x - radius));
    const maxX = Math.min(width - 1, Math.ceil(dab.x + radius));
    const minY = Math.max(0, Math.floor(dab.y - radius));
    const maxY = Math.min(height - 1, Math.ceil(dab.y + radius));

    if (minX > maxX || minY > maxY) continue;
    if (minX < dirtyMinX) dirtyMinX = minX;
    if (minY < dirtyMinY) dirtyMinY = minY;
    if (maxX > dirtyMaxX) dirtyMaxX = maxX;
    if (maxY > dirtyMaxY) dirtyMaxY = maxY;

    for (let y = minY; y <= maxY; y += 1) {
      const rowOffset = y * width;
      const dy = y - dab.y;
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - dab.x;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;

        const falloff = 1 - smoothstep(innerRadius, radius, dist);
        const tex = evaluateScrapeTipTexture(
          effectiveSettings.tipKind,
          dx,
          dy,
          radius,
          effectiveSettings,
          dIdx,
        );
        const effect = clamp(falloff * tex * strength, 0, 1);
        if (effect <= 1e-4) continue;

        const idx = rowOffset + x;
        if (settings.mode === "scrape") {
          const cur = nextScrape[idx] ?? 1;
          const updated = clamp(cur * (1 - effect), 0, 1);
          if (Math.abs(updated - cur) > 1e-5) {
            nextScrape[idx] = updated;
            if (touched[idx] === 0) {
              touched[idx] = 1;
              affectedPixels += 1;
            }
          }
        } else if (settings.mode === "restore") {
          const cur = nextScrape[idx] ?? 1;
          const updated = clamp(cur + (1 - cur) * effect, 0, 1);
          const curBias = nextBias[idx] ?? 0;
          const nextB = curBias * (1 - effect);
          if (Math.abs(updated - cur) > 1e-5 || Math.abs(nextB - curBias) > 1e-5) {
            nextScrape[idx] = updated;
            nextBias[idx] = nextB;
            if (touched[idx] === 0) {
              touched[idx] = 1;
              affectedPixels += 1;
            }
          }
        } else {
          // darken: 톤 깎기를 살짝 복구하면서 국소 농도 오프셋을 가산
          const curBias = nextBias[idx] ?? 0;
          const updatedBias = clamp(curBias + 0.45 * effect, -0.8, 0.8);
          if (Math.abs(updatedBias - curBias) > 1e-5) {
            nextBias[idx] = updatedBias;
            if (touched[idx] === 0) {
              touched[idx] = 1;
              affectedPixels += 1;
            }
          }
        }
      }
    }
  }

  const dirtyRect: ScreentoneScrapeDirtyRect | null =
    dirtyMaxX >= dirtyMinX && dirtyMaxY >= dirtyMinY
      ? {
          x: dirtyMinX,
          y: dirtyMinY,
          width: dirtyMaxX - dirtyMinX + 1,
          height: dirtyMaxY - dirtyMinY + 1,
        }
      : null;

  return {
    layer: {
      ...layer,
      scrapeMask: nextScrape,
      densityBias: nextBias,
    },
    dabCount: dabs.length,
    affectedPixels,
    dirtyRect,
  };
}
