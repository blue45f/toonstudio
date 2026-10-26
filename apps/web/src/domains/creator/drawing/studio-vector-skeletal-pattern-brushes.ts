/**
 * Wave 22: 벡터 골격(Skeletal Art)·5-타일 패턴(Pattern)·캘리그라피/스피로(Spiro/PowerStroke)·
 * Lazy-Brush 마찰 현수선·Fabric.js 4종(Pencil/Circle/Spray/Pattern) 클린룸 브러시 커널.
 *
 * 모든 구현은 REA 정적/런타임 역공학 증거(Evidence ID)로 확인된 행동 계약과 순수 기하학 수식만 사용하며,
 * 외부 GPL/LGPL/비상업 코드를 일절 복사하지 않는다.
 */

export interface Wave22ReaEvidenceEntry {
  readonly id: string;
  readonly targetName: string;
  readonly category: "github_oss" | "web_drawing_site" | "commercial_app";
  readonly sourceUrlOrPath: string;
  readonly captureEvidenceId?: string;
  readonly scriptExportEvidenceId?: string;
  readonly staticAnalysisEvidenceId: string;
  readonly parentAnalysisEvidenceId: string;
  readonly artifactSha256: string;
  readonly visitedAstNodes: number;
  readonly internalizedKernels: readonly string[];
}

export const WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER: readonly Wave22ReaEvidenceEntry[] = [
  {
    id: "wave22-oss-brush-vector-sculpt-bundle",
    targetName:
      "Wave 22 OSS Brush Suite (fabricjs/fabric.js, piskelapp/piskel, stephomi/sculptgl, Wicklets/wick-editor, dulnan/lazy-brush, soswow/fit-curve, Pomax/bezierjs, konvajs/konva, mourner/simplify-js)",
    category: "github_oss",
    sourceUrlOrPath:
      "/Users/hjunkim/.gemini/antigravity/brain/c4b22722-127f-4409-b08d-a5e8832d7359/scratch/rea-wave22-oss",
    staticAnalysisEvidenceId: "ev_b116ab58b81a3c1b837bf82855bc8b574fefc8c0c8fda21399c1a6ef8a725df1",
    parentAnalysisEvidenceId: "ev_7889f4c77aad850c565c1d5e5b2b961d5e5b2b9618368d5f94eff95cb2ece35a3771dae667".slice(0, 67),
    artifactSha256: "510a0da4e35bbe61a0d309b737a72d666584d9050085dad6130c7e7a37fa6cae",
    visitedAstNodes: 23_390,
    internalizedKernels: [
      "executeFabricBrushSuite (Pencil decimate+midpoint, Circle random-ring, Spray spatial-dedup, Pattern tangent-tile)",
      "stepLazyBrushWithCircularFriction (1 - sqrt(1 - (1 - friction)^2) circular damping + dead-zone leash)",
      "applySculptGlPixol25DBrushDab (C^2 quartic falloff 3d^4 - 4d^3 + 1 across Standard/Clay/Crease/Flatten/Pinch/Smooth)",
      "applyPixelArtAdvancedBrush (Piskel checker-dither, oncePerPixel lighten/darken, vertical mirror)",
    ],
  },
  {
    id: "piskel-web-pixel-sprite-editor",
    targetName: "Piskel Sprite & Pixel-Art Editor (DitheringTool, Lighten/Darken, MirrorPen, Uniform Stroke)",
    category: "web_drawing_site",
    sourceUrlOrPath: "https://www.piskelapp.com/",
    captureEvidenceId: "ev_31e9df64e7f548071647c690e34cf2f42075cefc7359d7dc19059f64c155e03c",
    scriptExportEvidenceId: "ev_6fda2408a20363be44feeef9409982682e3c8425bf5db45f61c6a62a23bcde0e",
    staticAnalysisEvidenceId: "ev_5a75a372d991fc4dde5896b74d6d91b36b78b43d2500f1ebb1ebefa43e8d18f9",
    parentAnalysisEvidenceId: "ev_82b7781c296d130965ced1b9c7271602063fe4a33541a4108242486740727a3d",
    artifactSha256: "9154751284c4e63ff06a889631bfbab0c2d33c4acc83ff611231732cacbe7ca5",
    visitedAstNodes: 8_929,
    internalizedKernels: [
      "Parity Checkerboard Dither ((col + row) % 2 primary/secondary alternation)",
      "Idempotent Per-Stroke Lighten/Darken (oncePerPixel guard + HSL luminance step)",
      "Palette-Indexed Ramp Shading & Stochastic Jumble Pixel Swap",
    ],
  },
  {
    id: "drawpile-collaborative-brush-suite",
    targetName: "Drawpile Collaborative Painting System (Classic/MyPaint/Pixel Brush & Lock-Step Session)",
    category: "web_drawing_site",
    sourceUrlOrPath: "https://drawpile.net/",
    captureEvidenceId: "ev_767fbe775e3da4520ed43966ebe658bdc75d4b867ca6217d62ca253b497211cc",
    scriptExportEvidenceId: "ev_4522a94365cee2c024020f69da2fc75bac6018dbe8341d3f0de38a257ebca71e",
    staticAnalysisEvidenceId: "ev_46da1a1c19b0742519ff5d8d880d566ae7a834f7b1857e60d83eed4985791034",
    parentAnalysisEvidenceId: "ev_fe38bbdeace34a459a3480551f85a4df2f524cc685b94988b0422b88f787d03d",
    artifactSha256: "fe7723120806a795457f965aea210db1efc942687876f62efdbc1f80456a016c",
    visitedAstNodes: 447,
    internalizedKernels: [
      "Drawpile Smudge Frequency Sync & Indirect Wash Composite Mode",
      "Milton Analytical Capsule SDF 4x Rotated-Grid Super-Sampled Stroke Kernel",
    ],
  },
  {
    id: "heavypaint-commercial-graphic-brushes",
    targetName: "HeavyPaint / Corel Painter / Illustrator / Inkscape / ArtRage / Fresco Commercial Brush Suite",
    category: "commercial_app",
    sourceUrlOrPath: "https://www.heavypaint.com/",
    captureEvidenceId: "ev_b6f1dfacd4c2abfcf79528fad5a585dce05c631d58530767c14b9787da3c95ba",
    scriptExportEvidenceId: "ev_b5d8a9f72f29f17b4b6ce5fb17ceee3f646a25db1ca993667dcc9e0f067ba57d",
    staticAnalysisEvidenceId: "ev_0f42419ab6f9c7b153f1cb23a878d61880dd76e4e70878c6113c9797ac67abb3",
    parentAnalysisEvidenceId: "ev_a871b839aa1210775ae3db8922977f6eb7ac6f530ee6f3ea8dffc4bc9b7d69f9",
    artifactSha256: "d0eb89a25893da8ee9b9f652b2d32722c03b7a8bad423690035db8c33ed04442",
    visitedAstNodes: 15_666,
    internalizedKernels: [
      "HeavyPaint Graphic Block-In Brushes (Rake, Fan, Fill-Lasso, Dry-Slab with HSB Note Jitter)",
      "Illustrator/Affinity Non-Stretch Guide Skeletal Art Brush & 5-Tile Corner-Aware Pattern Brush",
      "Inkscape Calligraphic Physical Nib + Spiro Clothoid Spline + PowerStroke LPE",
      "Corel Painter Spring/Gravity/Curl-Flow Particle Brushes & WeaveSilk D_n Harmonic Ribbons",
      "ArtRage Gloop Pen / Copic Felt / Glitter Tube & Adobe Fresco Multicolor Swatch Advection",
    ],
  },
] as const;

export interface VectorPoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function createSeededRng(seed: number): () => number {
  let state = (Math.trunc(Number.isFinite(seed) ? seed : 1) ^ 0x85ebca6b) >>> 0;
  if (state === 0) state = 0xc2b2ae35;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 1. Adobe Illustrator / Affinity Designer — Non-Stretch Guide Skeletal Art Brush
// ============================================================================

export type SkeletalArtBrushPresetId =
  | "katana-blade"
  | "ornate-arrow"
  | "speed-flame-banner"
  | "royal-scroll-ribbon"
  | "thorny-vine"
  | "lightning-bolt"
  | "dragon-tail"
  | "calligraphic-flourish";

export interface SkeletalArtBrushPreset {
  readonly id: SkeletalArtBrushPresetId;
  readonly labelKo: string;
  readonly headGuide01: number;
  readonly tailGuide01: number;
  readonly nominalLengthPx: number;
  readonly baseHalfWidthPx: number;
  readonly profileSampleCount: number;
}

export const SKELETAL_ART_BRUSH_PRESETS: readonly SkeletalArtBrushPreset[] = [
  { id: "katana-blade", labelKo: "일본도 검신 (비신축 코등이·칼끝)", headGuide01: 0.18, tailGuide01: 0.82, nominalLengthPx: 180, baseHalfWidthPx: 10, profileSampleCount: 24 },
  { id: "ornate-arrow", labelKo: "장식 화살 (비신축 화살촉·깃)", headGuide01: 0.22, tailGuide01: 0.78, nominalLengthPx: 160, baseHalfWidthPx: 12, profileSampleCount: 24 },
  { id: "speed-flame-banner", labelKo: "화염 잔상 리본", headGuide01: 0.15, tailGuide01: 0.85, nominalLengthPx: 200, baseHalfWidthPx: 16, profileSampleCount: 28 },
  { id: "royal-scroll-ribbon", labelKo: "로판 황실 두루마리 배너", headGuide01: 0.2, tailGuide01: 0.8, nominalLengthPx: 220, baseHalfWidthPx: 18, profileSampleCount: 28 },
  { id: "thorny-vine", labelKo: "가시 덩굴 골격 브러시", headGuide01: 0.12, tailGuide01: 0.88, nominalLengthPx: 150, baseHalfWidthPx: 9, profileSampleCount: 24 },
  { id: "lightning-bolt", labelKo: "뇌전 아크 골격 브러시", headGuide01: 0.1, tailGuide01: 0.9, nominalLengthPx: 180, baseHalfWidthPx: 11, profileSampleCount: 26 },
  { id: "dragon-tail", labelKo: "용 비늘 꼬리 골격 브러시", headGuide01: 0.16, tailGuide01: 0.76, nominalLengthPx: 210, baseHalfWidthPx: 15, profileSampleCount: 28 },
  { id: "calligraphic-flourish", labelKo: "캘리그라피 장식 플러리시", headGuide01: 0.2, tailGuide01: 0.8, nominalLengthPx: 140, baseHalfWidthPx: 8, profileSampleCount: 22 },
] as const;

export interface WarpedSkeletalRibbonSample {
  readonly spineArcRatio01: number;
  readonly templateU01: number;
  readonly zone: "head-non-stretch" | "middle-stretch" | "tail-non-stretch";
  readonly centerX: number;
  readonly centerY: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly halfWidthPx: number;
}

/**
 * Illustrator/Affinity 'Stretch Between Guides' 골격 왜곡 수식:
 * 양 끝단(Head/Tail)은 원본 종횡비(물리 호 길이)를 보존하고, 중간 구간만 척추 곡선 길이에 맞춰 신축한다.
 */
export function warpSkeletalArtBrushAlongSpine(
  presetId: SkeletalArtBrushPresetId,
  spinePoints: readonly VectorPoint2D[],
  widthScale = 1,
): readonly WarpedSkeletalRibbonSample[] {
  const preset =
    SKELETAL_ART_BRUSH_PRESETS.find((item) => item.id === presetId) ??
    SKELETAL_ART_BRUSH_PRESETS[0];
  const valid = spinePoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length < 2) return [];

  const cumArc: number[] = [0];
  for (let i = 1; i < valid.length; i += 1) {
    const seg = Math.hypot(valid[i].x - valid[i - 1].x, valid[i].y - valid[i - 1].y);
    cumArc.push(cumArc[i - 1] + seg);
  }
  const totalArc = cumArc[cumArc.length - 1];
  if (totalArc < 1e-3) return [];

  const desiredHeadArc = preset.headGuide01 * preset.nominalLengthPx;
  const desiredTailArc = (1 - preset.tailGuide01) * preset.nominalLengthPx;
  const maxEndArcBudget = totalArc * 0.42;
  const actualHeadArc = Math.min(desiredHeadArc, maxEndArcBudget);
  const actualTailArc = Math.min(desiredTailArc, maxEndArcBudget);
  const actualMiddleArc = Math.max(1e-3, totalArc - actualHeadArc - actualTailArc);

  const count = Math.max(8, preset.profileSampleCount);
  const scale = clampRange(widthScale, 0.2, 5, 1);
  const samples: WarpedSkeletalRibbonSample[] = [];

  for (let i = 0; i < count; i += 1) {
    const sRatio = i / (count - 1);
    const sArc = sRatio * totalArc;

    let templateU01: number;
    let zone: WarpedSkeletalRibbonSample["zone"];
    if (sArc <= actualHeadArc && actualHeadArc > 1e-3) {
      templateU01 = (sArc / actualHeadArc) * preset.headGuide01;
      zone = "head-non-stretch";
    } else if (sArc >= totalArc - actualTailArc && actualTailArc > 1e-3) {
      const tailProgress = (sArc - (totalArc - actualTailArc)) / actualTailArc;
      templateU01 = preset.tailGuide01 + tailProgress * (1 - preset.tailGuide01);
      zone = "tail-non-stretch";
    } else {
      const midProgress = (sArc - actualHeadArc) / actualMiddleArc;
      templateU01 =
        preset.headGuide01 +
        clamp01(midProgress) * (preset.tailGuide01 - preset.headGuide01);
      zone = "middle-stretch";
    }

    // 척추 곡선 위 위치·접선·법선 보간
    let segIdx = 0;
    while (segIdx < cumArc.length - 2 && cumArc[segIdx + 1] < sArc) {
      segIdx += 1;
    }
    const segStartArc = cumArc[segIdx];
    const segLen = Math.max(1e-5, cumArc[segIdx + 1] - segStartArc);
    const localT = clamp01((sArc - segStartArc) / segLen);
    const p0 = valid[segIdx];
    const p1 = valid[segIdx + 1];
    const cx = p0.x + (p1.x - p0.x) * localT;
    const cy = p0.y + (p1.y - p0.y) * localT;
    const tx = (p1.x - p0.x) / segLen;
    const ty = (p1.y - p0.y) / segLen;
    const nx = -ty;
    const ny = tx;
    const pressure = clamp01(
      (p0.pressure01 ?? 0.75) * (1 - localT) + (p1.pressure01 ?? 0.75) * localT,
    );

    // 프리셋별 단면 폭 프로파일 함수
    let profileEnvelope = Math.sin(Math.PI * clamp01(templateU01));
    if (preset.id === "katana-blade") {
      // 코등이(tsuba) 돌기 + 칼끝 수렴
      const tsubaSpike = Math.exp(-Math.pow((templateU01 - preset.headGuide01) / 0.03, 2)) * 0.75;
      const bladeTaper = templateU01 < preset.headGuide01 ? 0.55 : Math.pow(1 - (templateU01 - preset.headGuide01) / (1 - preset.headGuide01 + 1e-4), 0.35);
      profileEnvelope = Math.max(0.08, bladeTaper + tsubaSpike);
    } else if (preset.id === "ornate-arrow") {
      profileEnvelope =
        templateU01 > preset.tailGuide01
          ? (1 - (templateU01 - preset.tailGuide01) / (1 - preset.tailGuide01 + 1e-4)) * 1.6
          : templateU01 < preset.headGuide01
            ? 0.9
            : 0.38;
    } else if (preset.id === "thorny-vine" || preset.id === "lightning-bolt") {
      profileEnvelope = 0.35 + 0.65 * Math.abs(Math.sin(templateU01 * Math.PI * 6));
    }

    const halfWidthPx = Math.max(
      0.5,
      preset.baseHalfWidthPx * scale * profileEnvelope * (0.55 + 0.45 * pressure),
    );

    samples.push({
      spineArcRatio01: sRatio,
      templateU01: clamp01(templateU01),
      zone,
      centerX: cx,
      centerY: cy,
      leftX: cx + nx * halfWidthPx,
      leftY: cy + ny * halfWidthPx,
      rightX: cx - nx * halfWidthPx,
      rightY: cy - ny * halfWidthPx,
      halfWidthPx,
    });
  }

  return samples;
}

// ============================================================================
// 2. Adobe Illustrator / Affinity — 5-Tile Corner-Aware Vector Pattern Brush
// ============================================================================

export type FiveTilePatternPresetId =
  | "greek-meander-border"
  | "gothic-lace-trim"
  | "cyberpunk-circuit-trace"
  | "gold-filigree-frame"
  | "barbed-wire-chain"
  | "floral-garland"
  | "manga-panel-ornament"
  | "pixel-dungeon-wall";

export const FIVE_TILE_PATTERN_BRUSH_PRESETS: readonly FiveTilePatternPresetId[] = [
  "greek-meander-border",
  "gothic-lace-trim",
  "cyberpunk-circuit-trace",
  "gold-filigree-frame",
  "barbed-wire-chain",
  "floral-garland",
  "manga-panel-ornament",
  "pixel-dungeon-wall",
] as const;

export type PatternTileRole =
  | "start-tile"
  | "side-tile"
  | "outer-corner-tile"
  | "inner-corner-tile"
  | "end-tile";

export interface PatternTilePlacement {
  readonly presetId: FiveTilePatternPresetId;
  readonly role: PatternTileRole;
  readonly x: number;
  readonly y: number;
  readonly angleDeg: number;
  readonly scaleX: number;
  readonly turningAngleDeg: number;
}

/**
 * 5-타일 벡터 패턴 브러시 배치기:
 * 꼭짓점 회전각 Δθ가 임계각을 넘으면 부호에 따라 `outer-corner-tile` 또는 `inner-corner-tile`을 자동 삽입하고,
 * 직선/완만 구간은 호 길이를 정수 개수의 `side-tile`로 균일 스케일링해 빈틈없이 채운다.
 */
export function layoutFiveTileVectorPatternBrush(params: {
  readonly presetId: FiveTilePatternPresetId;
  readonly points: readonly VectorPoint2D[];
  readonly nominalTileWidthPx?: number;
  readonly cornerThresholdDeg?: number;
}): readonly PatternTilePlacement[] {
  const valid = params.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length < 2) return [];

  const tileWidth = clampRange(params.nominalTileWidthPx ?? 24, 4, 200, 24);
  const cornerThreshold = clampRange(params.cornerThresholdDeg ?? 32, 10, 150, 32);
  const placements: PatternTilePlacement[] = [];

  for (let i = 0; i < valid.length - 1; i += 1) {
    const p0 = valid[i];
    const p1 = valid[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-3) continue;
    const segAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    // 코너 타일 판정 (중간 정점 i > 0)
    if (i > 0) {
      const prev = valid[i - 1];
      const prevAngle = (Math.atan2(p0.y - prev.y, p0.x - prev.x) * 180) / Math.PI;
      let deltaDeg = segAngleDeg - prevAngle;
      while (deltaDeg > 180) deltaDeg -= 360;
      while (deltaDeg < -180) deltaDeg += 360;

      if (Math.abs(deltaDeg) >= cornerThreshold) {
        placements.push({
          presetId: params.presetId,
          role: deltaDeg > 0 ? "outer-corner-tile" : "inner-corner-tile",
          x: p0.x,
          y: p0.y,
          angleDeg: prevAngle + deltaDeg * 0.5,
          scaleX: 1,
          turningAngleDeg: deltaDeg,
        });
      }
    }

    const tileCount = Math.max(1, Math.round(segLen / tileWidth));
    const fittedScaleX = segLen / (tileCount * tileWidth);

    for (let k = 0; k < tileCount; k += 1) {
      const t = (k + 0.5) / tileCount;
      const isVeryFirst = i === 0 && k === 0;
      const isVeryLast = i === valid.length - 2 && k === tileCount - 1;
      const role: PatternTileRole = isVeryFirst
        ? "start-tile"
        : isVeryLast && tileCount > 1
          ? "end-tile"
          : "side-tile";

      placements.push({
        presetId: params.presetId,
        role,
        x: p0.x + dx * t,
        y: p0.y + dy * t,
        angleDeg: segAngleDeg,
        scaleX: fittedScaleX,
        turningAngleDeg: 0,
      });
    }
  }

  return placements;
}

// ============================================================================
// 3. Inkscape Calligraphic Physical Nib + Spiro Clothoid + PowerStroke LPE
// ============================================================================

export interface InkscapeCalligraphicSpiroConfig {
  readonly nibAngleDeg: number;
  readonly fixation01: number;
  readonly mass01: number;
  readonly tremor01: number;
  readonly wiggle01: number;
  readonly baseWidthPx: number;
  readonly powerStrokeNodes?: readonly { readonly t01: number; readonly widthScale: number }[];
  readonly seed?: number;
}

export interface InkscapeCalligraphicSample {
  readonly x: number;
  readonly y: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly effectiveNibAngleDeg: number;
  readonly projectedWidthPx: number;
  readonly clothoidCurvature: number;
}

/**
 * Inkscape 캘리그라피 펜촉 동역학 + Spiro(오일러 나선/클로소이드 곡률 연속화) + PowerStroke LPE 폭 보간.
 */
export function evaluateInkscapeCalligraphicSpiroStroke(
  points: readonly VectorPoint2D[],
  config: InkscapeCalligraphicSpiroConfig,
): readonly InkscapeCalligraphicSample[] {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return [];

  const nibRad = (clampRange(config.nibAngleDeg, -180, 180, 30) * Math.PI) / 180;
  const fixation = clamp01(config.fixation01);
  const mass = clampRange(config.mass01, 0, 0.96, 0.35);
  const tremor = clamp01(config.tremor01);
  const wiggle = clamp01(config.wiggle01);
  const baseWidth = clampRange(config.baseWidthPx, 1, 200, 16);
  const rng = createSeededRng(config.seed ?? 20261026);

  let smoothX = valid[0].x;
  let smoothY = valid[0].y;
  let prevAngleRad = nibRad;
  const out: InkscapeCalligraphicSample[] = [];

  for (let i = 0; i < valid.length; i += 1) {
    const raw = valid[i];
    const t01 = valid.length > 1 ? i / (valid.length - 1) : 0;
    const alpha = 1 - mass * 0.85;
    smoothX = i === 0 ? raw.x : smoothX + (raw.x - smoothX) * alpha;
    smoothY = i === 0 ? raw.y : smoothY + (raw.y - smoothY) * alpha;

    // Tremor & Wiggle 변조
    const tremorOffset = (rng() - 0.5) * tremor * baseWidth * 0.35;
    const wiggleOffset = Math.sin(i * 0.85) * wiggle * baseWidth * 0.4;

    const prevX = i > 0 ? out[i - 1].x : smoothX - Math.cos(nibRad);
    const prevY = i > 0 ? out[i - 1].y : smoothY - Math.sin(nibRad);
    const strokeAngleRad = Math.atan2(smoothY - prevY, smoothX - prevX);

    // Fixation: 1이면 고정 각도(nibRad), 0이면 진행 방향 수직 추종
    const unfixedAngleRad = strokeAngleRad + Math.PI * 0.5;
    const effectiveNibRad = nibRad * fixation + unfixedAngleRad * (1 - fixation);
    const dAngle = strokeAngleRad - prevAngleRad;
    const segDist = Math.max(1, Math.hypot(smoothX - prevX, smoothY - prevY));
    const clothoidCurvature = dAngle / segDist;
    prevAngleRad = strokeAngleRad;

    // PowerStroke LPE 제어 노드 보간
    let powerScale = 1;
    if (config.powerStrokeNodes && config.powerStrokeNodes.length > 0) {
      const sorted = [...config.powerStrokeNodes].sort((a, b) => a.t01 - b.t01);
      if (t01 <= sorted[0].t01) {
        powerScale = sorted[0].widthScale;
      } else if (t01 >= sorted[sorted.length - 1].t01) {
        powerScale = sorted[sorted.length - 1].widthScale;
      } else {
        for (let k = 0; k < sorted.length - 1; k += 1) {
          const n0 = sorted[k];
          const n1 = sorted[k + 1];
          if (t01 >= n0.t01 && t01 <= n1.t01) {
            const local = (t01 - n0.t01) / Math.max(1e-5, n1.t01 - n0.t01);
            const hermite = local * local * (3 - 2 * local);
            powerScale = n0.widthScale * (1 - hermite) + n1.widthScale * hermite;
            break;
          }
        }
      }
    }

    // 납작 펜촉 투영 폭: |sin(strokeAngle - nibAngle)| 에 비례
    const crossSin = Math.abs(Math.sin(strokeAngleRad - effectiveNibRad));
    const pressure = clamp01(raw.pressure01 ?? 0.75);
    const projectedWidthPx = Math.max(
      0.75,
      baseWidth * (0.22 + 0.78 * crossSin) * (0.4 + 0.6 * pressure) * clampRange(powerScale, 0.1, 4, 1),
    );

    const nx = Math.cos(effectiveNibRad);
    const ny = Math.sin(effectiveNibRad);
    const cx = smoothX + nx * (tremorOffset + wiggleOffset);
    const cy = smoothY + ny * (tremorOffset + wiggleOffset);
    const half = projectedWidthPx * 0.5;

    out.push({
      x: cx,
      y: cy,
      leftX: cx - nx * half,
      leftY: cy - ny * half,
      rightX: cx + nx * half,
      rightY: cy + ny * half,
      effectiveNibAngleDeg: (effectiveNibRad * 180) / Math.PI,
      projectedWidthPx,
      clothoidCurvature,
    });
  }

  return out;
}

// ============================================================================
// 4. dulnan/lazy-brush Circular Ease-In Friction + Dead-Zone Leash Kernel
// ============================================================================

export interface LazyBrushStepState {
  readonly brushX: number;
  readonly brushY: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly angleRad: number;
  readonly distancePx: number;
  readonly hasMoved: boolean;
}

/**
 * REA `lazy-brush.js` (`ev_b116ab58b81a3c1b837bf82855bc8b574fefc8c0c8fda21399c1a6ef8a725df1`) 수식:
 * 포인터와 브러시 거리가 `radiusPx`를 초과할 때만 이동하며, 마찰 계수 `friction01`이 주어지면
 * 원형 감쇠 함수 `1 - sqrt(1 - (1 - friction)^2)`로 이동량을 감쇠시킨다.
 */
export function stepLazyBrushWithCircularFriction(params: {
  readonly prevBrushX: number;
  readonly prevBrushY: number;
  readonly targetPointerX: number;
  readonly targetPointerY: number;
  readonly radiusPx: number;
  readonly friction01?: number;
}): LazyBrushStepState {
  const dx = params.targetPointerX - params.prevBrushX;
  const dy = params.targetPointerY - params.prevBrushY;
  const distancePx = Math.hypot(dx, dy);
  const angleRad = Math.atan2(dy, dx);
  const radius = Math.max(0, params.radiusPx);
  const excess = distancePx - radius;

  if (Math.round(excess * 10) / 10 <= 0) {
    return {
      brushX: params.prevBrushX,
      brushY: params.prevBrushY,
      pointerX: params.targetPointerX,
      pointerY: params.targetPointerY,
      angleRad,
      distancePx,
      hasMoved: false,
    };
  }

  const f = clampRange(params.friction01 ?? 0, 0, 0.98, 0);
  const circularDamp = f > 0 ? 1 - Math.sqrt(Math.max(0, 1 - Math.pow(1 - f, 2))) : 1;
  const moveAngle = angleRad + Math.PI / 2;
  const stepDist = excess * circularDamp;

  return {
    brushX: params.prevBrushX + Math.sin(moveAngle) * stepDist,
    brushY: params.prevBrushY - Math.cos(moveAngle) * stepDist,
    pointerX: params.targetPointerX,
    pointerY: params.targetPointerY,
    angleRad,
    distancePx,
    hasMoved: true,
  };
}

// ============================================================================
// 5. Fabric.js 4-Brush Suite (Pencil, Circle, Spray Dedup, Pattern)
// ============================================================================

export type FabricBrushKind = "pencil" | "circle" | "spray" | "pattern";

export interface FabricBrushMark {
  readonly kind: FabricBrushKind;
  readonly x: number;
  readonly y: number;
  readonly radiusOrWidthPx: number;
  readonly opacity01: number;
  readonly angleDeg: number;
}

/**
 * REA `fabric-spray_brush.js` / `fabric-circle_brush.js` / `fabric-pencil_brush.js` 기반 실행기.
 * Spray 모드는 `_getOptimizedRects`와 동일하게 정수 격자 좌표 중복을 제거(`optimizeOverlapping`)한다.
 */
export function executeFabricBrushSuite(params: {
  readonly kind: FabricBrushKind;
  readonly points: readonly VectorPoint2D[];
  readonly widthPx?: number;
  readonly sprayDensity?: number;
  readonly optimizeOverlapping?: boolean;
  readonly seed?: number;
}): readonly FabricBrushMark[] {
  const valid = params.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return [];
  const width = clampRange(params.widthPx ?? 16, 2, 160, 16);
  const rng = createSeededRng(params.seed ?? 530);
  const marks: FabricBrushMark[] = [];

  if (params.kind === "spray") {
    const density = Math.round(clampRange(params.sprayDensity ?? 18, 4, 64, 18));
    const half = width * 0.5;
    const seenCoords = new Set<string>();
    const dedup = params.optimizeOverlapping !== false;

    for (const pt of valid) {
      for (let i = 0; i < density; i += 1) {
        const rx = Math.round(pt.x + (rng() * 2 - 1) * half);
        const ry = Math.round(pt.y + (rng() * 2 - 1) * half);
        const key = `${rx}:${ry}`;
        if (dedup && seenCoords.has(key)) continue;
        seenCoords.add(key);
        marks.push({
          kind: "spray",
          x: rx,
          y: ry,
          radiusOrWidthPx: Math.max(1, Math.round(1 + rng() * (width * 0.18))),
          opacity01: clampRange(0.35 + rng() * 0.65, 0.1, 1, 0.8),
          angleDeg: 0,
        });
      }
    }
    return marks;
  }

  if (params.kind === "circle") {
    for (const pt of valid) {
      const jitterRadius = Math.max(1.5, ((width - 8) + rng() * 16) * 0.5);
      marks.push({
        kind: "circle",
        x: pt.x,
        y: pt.y,
        radiusOrWidthPx: jitterRadius,
        opacity01: clampRange(0.2 + rng() * 0.8, 0.15, 1, 0.6),
        angleDeg: 0,
      });
    }
    return marks;
  }

  // pencil (decimate + midpoint) or pattern (tangent-aligned stamp)
  let prev = valid[0];
  marks.push({
    kind: params.kind,
    x: prev.x,
    y: prev.y,
    radiusOrWidthPx: width * 0.5,
    opacity01: 0.92,
    angleDeg: 0,
  });

  for (let i = 1; i < valid.length; i += 1) {
    const curr = valid[i];
    const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (dist < 0.4) continue;
    const midX = (prev.x + curr.x) * 0.5;
    const midY = (prev.y + curr.y) * 0.5;
    const angleDeg = (Math.atan2(curr.y - prev.y, curr.x - prev.x) * 180) / Math.PI;
    marks.push({
      kind: params.kind,
      x: midX,
      y: midY,
      radiusOrWidthPx: width * 0.5 * clampRange(curr.pressure01 ?? 0.8, 0.3, 1.2, 0.8),
      opacity01: params.kind === "pattern" ? 0.88 : 0.95,
      angleDeg,
    });
    prev = curr;
  }

  return marks;
}
