/** Lightweight, synchronous data contract for GLB model texture paint.
 * Kept separate from the canvas painter so opening/normalizing a scene does not load the paint engine.
 */
import {
  STUDIO_BG3D_TEXTURE_PAINT_MAX_TOTAL_POINTS,
  countStudioBg3dTexturePaintPoints,
  normalizeStudioBg3dTexturePaint,
  type StudioBg3dTexturePaint,
} from "./bg3d/studio-bg3d-texture-paint";
import type {
  StudioBg3dModelTexturePaint,
  StudioBg3dModelTexturePaintTarget,
} from "./bg3d/studio-bg3d-scene-document-types";

export type { StudioBg3dModelTexturePaint, StudioBg3dModelTexturePaintTarget } from "./bg3d/studio-bg3d-scene-document-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ── 대상 키 ─────────────────────────────────────────────────────────────── */

/** 모델 1개가 가질 수 있는 페인트 대상 상한. 문서 예산(320KiB) 보호. */
export const STUDIO_BG3D_MODEL_TEXTURE_PAINT_MAX_TARGETS = 16;

const TARGET_KEY_PATTERN = /^mesh-(\d+)(?::slot-(\d+))?$/;

export function createStudioBg3dModelTexturePaintTargetKey(
  meshOrdinal: number,
  slot = 0,
): string {
  const ordinal = Number.isSafeInteger(meshOrdinal) && meshOrdinal >= 0 ? meshOrdinal : 0;
  const safeSlot = Number.isSafeInteger(slot) && slot > 0 ? slot : 0;
  return safeSlot > 0 ? `mesh-${ordinal}:slot-${safeSlot}` : `mesh-${ordinal}`;
}

export function parseStudioBg3dModelTexturePaintTargetKey(
  value: unknown,
): { readonly meshOrdinal: number; readonly slot: number } | null {
  if (typeof value !== "string") return null;
  const match = TARGET_KEY_PATTERN.exec(value);
  if (!match) return null;
  const meshOrdinal = Number(match[1]);
  const slot = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isSafeInteger(meshOrdinal) || !Number.isSafeInteger(slot)) return null;
  // 정규형만 허용한다(mesh-01, mesh-0:slot-0 같은 별칭 키가 문서에 남지 않게).
  if (createStudioBg3dModelTexturePaintTargetKey(meshOrdinal, slot) !== value) return null;
  return { meshOrdinal, slot };
}

/* ── 정규화 ──────────────────────────────────────────────────────────────── */


/**
 * 문서/외부 입력에서 모델 페인트를 정규화한다. 대상 키가 정규형이 아니거나 획이 비는 대상은
 * 버리고, 전체 점 수는 1단계와 같은 총량 한도(8192)를 대상 합산으로 강제한다 —
 * 대상이 여럿이어도 문서 예산은 모델 1개 기준으로 지켜야 하기 때문이다.
 * 유효한 대상이 하나도 없으면 null("페인트 없음"과 구분하지 않음, 1단계와 같은 계약).
 */
export function normalizeStudioBg3dModelTexturePaint(
  raw: unknown,
): StudioBg3dModelTexturePaint | null {
  if (!isRecord(raw) || !Array.isArray(raw.targets)) return null;
  const targets: StudioBg3dModelTexturePaintTarget[] = [];
  const seenKeys = new Set<string>();
  let totalPoints = 0;
  for (const candidate of raw.targets) {
    if (targets.length >= STUDIO_BG3D_MODEL_TEXTURE_PAINT_MAX_TARGETS) break;
    if (!isRecord(candidate)) continue;
    if (!parseStudioBg3dModelTexturePaintTargetKey(candidate.targetKey)) continue;
    const targetKey = candidate.targetKey as string;
    if (seenKeys.has(targetKey)) continue;
    const paint = normalizeStudioBg3dTexturePaint(candidate.paint);
    if (!paint) continue;
    const points = countStudioBg3dTexturePaintPoints(paint);
    if (totalPoints + points > STUDIO_BG3D_TEXTURE_PAINT_MAX_TOTAL_POINTS) continue;
    seenKeys.add(targetKey);
    targets.push({ targetKey, paint });
    totalPoints += points;
  }
  if (targets.length === 0) return null;
  return { version: 1, targets };
}

export function getStudioBg3dModelTexturePaintForTarget(
  paint: StudioBg3dModelTexturePaint | null | undefined,
  targetKey: string,
): StudioBg3dTexturePaint | null {
  if (!paint) return null;
  return paint.targets.find((target) => target.targetKey === targetKey)?.paint ?? null;
}

/**
 * 대상 1개의 페인트를 교체한다. `targetPaint`가 null이면 대상을 제거하고,
 * 남은 대상이 없으면 전체가 null이 된다(문서에서 필드 생략과 동등).
 * 한도를 넘는 교체는 null을 돌려줘 호출자(패널)가 사용자에게 알릴 수 있게 한다.
 */
export function upsertStudioBg3dModelTexturePaintTarget(
  paint: StudioBg3dModelTexturePaint | null | undefined,
  targetKey: string,
  targetPaint: StudioBg3dTexturePaint | null,
): StudioBg3dModelTexturePaint | null {
  if (!parseStudioBg3dModelTexturePaintTargetKey(targetKey)) return paint ?? null;
  const rest = (paint?.targets ?? []).filter((target) => target.targetKey !== targetKey);
  if (!targetPaint) {
    return rest.length > 0 ? { version: 1, targets: rest } : null;
  }
  if (rest.length + 1 > STUDIO_BG3D_MODEL_TEXTURE_PAINT_MAX_TARGETS) return null;
  const candidate: StudioBg3dModelTexturePaint = {
    version: 1,
    targets: [...rest, { targetKey, paint: targetPaint }],
  };
  return normalizeStudioBg3dModelTexturePaint(candidate);
}

export function countStudioBg3dModelTexturePaintPoints(
  paint: StudioBg3dModelTexturePaint | null | undefined,
): number {
  if (!paint) return 0;
  return paint.targets.reduce(
    (sum, target) => sum + countStudioBg3dTexturePaintPoints(target.paint),
    0,
  );
}
