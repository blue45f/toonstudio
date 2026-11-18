/**
 * 클립스튜디오 페인트 5.1.5 `모서리를 뾰족하게` (`BrushSharpenCorner`, `toolbrushsharpencorner`) 기하 엔진.
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `BrushSharpenCorner` 컬럼 및 메인 바이너리 `toolbrushsharpencorner` 식별자.
 *
 * 둥근 브러시 스탬프로 급격한 꺾임(V자·예각 옷주름·머리카락 끝)을 그릴 때 모서리가 뭉툭해지는 현상을 막기 위해,
 * 회전각 임계값(`minTurnAngleDeg`) 이상으로 꺾이는 꼭짓점을 검출하고 제한된 마이터(Miter) 외곽 정점을 합성한다.
 */

export interface StudioStrokePointWidth {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly speedPxPerMs?: number;
}

export interface StudioSharpCornerConfig {
  readonly enabled: boolean;
  /** 모서리로 판정할 최소 방향 전환 각도(도, 25..165). 0도는 직진, 120도는 예리한 V자 꺾임. */
  readonly minTurnAngleDeg: number;
  /** 반지름 대비 최대 마이터 돌출 배수 (1.1..4.5). */
  readonly miterLimitRatio: number;
}

export interface StudioDetectedSharpCorner {
  readonly vertexIndex: number;
  readonly turnAngleDeg: number;
  readonly apexX: number;
  readonly apexY: number;
  readonly bisectorX: number;
  readonly bisectorY: number;
  readonly extensionPx: number;
}

export const DEFAULT_STUDIO_SHARP_CORNER_CONFIG: StudioSharpCornerConfig = Object.freeze({
  enabled: false,
  minTurnAngleDeg: 55,
  miterLimitRatio: 2.4,
});

export function normalizeStudioSharpCornerConfig(
  input?: Partial<StudioSharpCornerConfig> | null,
): StudioSharpCornerConfig {
  if (!input) return DEFAULT_STUDIO_SHARP_CORNER_CONFIG;
  const minTurnAngleDeg =
    typeof input.minTurnAngleDeg === "number" && Number.isFinite(input.minTurnAngleDeg)
      ? Math.min(165, Math.max(25, input.minTurnAngleDeg))
      : DEFAULT_STUDIO_SHARP_CORNER_CONFIG.minTurnAngleDeg;
  const miterLimitRatio =
    typeof input.miterLimitRatio === "number" && Number.isFinite(input.miterLimitRatio)
      ? Math.min(4.5, Math.max(1.1, input.miterLimitRatio))
      : DEFAULT_STUDIO_SHARP_CORNER_CONFIG.miterLimitRatio;
  return {
    enabled: Boolean(input.enabled),
    minTurnAngleDeg,
    miterLimitRatio,
  };
}

/**
 * 연속 선분에서 급격히 꺾이는 내부 정점과 바깥쪽 마이터 꼭짓점(Apex)을 계산한다.
 */
export function detectSharpStrokeCorners(
  samples: readonly StudioStrokePointWidth[],
  config: StudioSharpCornerConfig,
): StudioDetectedSharpCorner[] {
  const normalized = normalizeStudioSharpCornerConfig(config);
  if (!normalized.enabled || samples.length < 3) return [];

  const corners: StudioDetectedSharpCorner[] = [];
  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1]!;
    const curr = samples[i]!;
    const next = samples[i + 1]!;

    const inDx = curr.x - prev.x;
    const inDy = curr.y - prev.y;
    const outDx = next.x - curr.x;
    const outDy = next.y - curr.y;
    const inLen = Math.hypot(inDx, inDy);
    const outLen = Math.hypot(outDx, outDy);
    if (inLen < 1e-4 || outLen < 1e-4) continue;

    const ux1 = inDx / inLen;
    const uy1 = inDy / inLen;
    const ux2 = outDx / outLen;
    const uy2 = outDy / outLen;

    const dot = Math.min(1, Math.max(-1, ux1 * ux2 + uy1 * uy2));
    const turnAngleRad = Math.acos(dot);
    const turnAngleDeg = (turnAngleRad * 180) / Math.PI;
    if (turnAngleDeg < normalized.minTurnAngleDeg) continue;

    // 바깥쪽으로 돌출하는 외각 이등분선 방향: (u1 - u2) 정규화
    const bxRaw = ux1 - ux2;
    const byRaw = uy1 - uy2;
    const bLen = Math.hypot(bxRaw, byRaw);
    if (bLen < 1e-5) continue;

    const bisectorX = bxRaw / bLen;
    const bisectorY = byRaw / bLen;

    const radius = Math.max(0.5, curr.width * 0.5);
    const interiorHalfAngle = Math.max(0.08, (Math.PI - turnAngleRad) * 0.5);
    const rawMiter = radius / Math.sin(interiorHalfAngle);
    const clampedMiter = Math.min(radius * normalized.miterLimitRatio, Math.max(radius, rawMiter));
    const extensionPx = clampedMiter - radius;

    corners.push({
      vertexIndex: i,
      turnAngleDeg,
      apexX: curr.x + bisectorX * clampedMiter,
      apexY: curr.y + bisectorY * clampedMiter,
      bisectorX,
      bisectorY,
      extensionPx,
    });
  }

  return corners;
}

/**
 * 꺾임 정점에 뾰족한 보강 테이퍼 마이크로 샘플을 삽입해 기존 스탬프/리본 렌더러에서도
 * 날카로운 모서리 실루엣이 살아나도록 보정한다.
 */
export function sharpenStrokeCornerSamples(
  samples: readonly StudioStrokePointWidth[],
  config: StudioSharpCornerConfig,
): StudioStrokePointWidth[] {
  const corners = detectSharpStrokeCorners(samples, config);
  if (corners.length === 0) return [...samples];

  const cornerByIndex = new Map<number, StudioDetectedSharpCorner>();
  for (const corner of corners) {
    cornerByIndex.set(corner.vertexIndex, corner);
  }

  const output: StudioStrokePointWidth[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const corner = cornerByIndex.get(index);
    if (!corner || corner.extensionPx <= 0.15) {
      output.push(sample);
      continue;
    }
    const midSpikeX = sample.x + corner.bisectorX * (corner.extensionPx * 0.55);
    const midSpikeY = sample.y + corner.bisectorY * (corner.extensionPx * 0.55);
    const tipSpikeX = sample.x + corner.bisectorX * corner.extensionPx;
    const tipSpikeY = sample.y + corner.bisectorY * corner.extensionPx;

    output.push(sample);
    output.push({
      x: midSpikeX,
      y: midSpikeY,
      width: Math.max(0.75, sample.width * 0.52),
      speedPxPerMs: sample.speedPxPerMs,
    });
    output.push({
      x: tipSpikeX,
      y: tipSpikeY,
      width: Math.max(0.45, sample.width * 0.18),
      speedPxPerMs: sample.speedPxPerMs,
    });
    output.push(sample);
  }
  return output;
}
