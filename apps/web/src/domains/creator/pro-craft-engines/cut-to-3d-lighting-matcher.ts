/**
 * 2D 웹툰 컷 RGBA 버퍼에서 주광(Key)·보조광(Fill)·림라이트(Rim)와
 * 색온도·음영 경계를 추출해 3D 씬(/studio/3d) 3점 조명과 툰 셰이더에
 * 원클릭 동기화하는 클린룸 광원 추정 엔진.
 */

export interface RgbNormalized {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Studio3dLightSource {
  readonly color: RgbNormalized;
  readonly intensity: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
}

export interface CutTo3dLightingRig {
  readonly keyLight: Studio3dLightSource;
  readonly fillLight: Studio3dLightSource;
  readonly rimLight: Studio3dLightSource;
  readonly ambientColor: RgbNormalized;
  readonly ambientIntensity: number;
  readonly keyTemperatureKelvin: number;
  readonly shadowRampThresholds: readonly [number, number, number];
  readonly contrastRatio: number;
  readonly moodId: "golden-hour" | "cool-night" | "soft-daylight" | "dramatic-noir" | "vivid-neon";
  readonly moodLabelKo: string;
  readonly moodLabelEn: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function estimateKelvin(rgb: RgbNormalized): number {
  const rbRatio = (rgb.r + 0.05) / (rgb.b + 0.05);
  // Warm light (R >> B) -> ~2800K-4200K; Cool light (B >> R) -> ~6800K-10500K
  const kelvin = 5600 / Math.pow(clampRange(rbRatio, 0.45, 2.4), 0.72);
  return Math.round(clampRange(kelvin, 2400, 11000));
}

function normalizeColor(rSum: number, gSum: number, bSum: number, weight: number): RgbNormalized {
  if (weight <= 0) return { r: 0.92, g: 0.92, b: 0.92 };
  return {
    r: Number(clamp01(rSum / weight).toFixed(4)),
    g: Number(clamp01(gSum / weight).toFixed(4)),
    b: Number(clamp01(bSum / weight).toFixed(4)),
  };
}

/**
 * 2D 컷 RGBA 픽셀 버퍼로부터 3D 씬 3점 조명과 툰 음영 파라미터를 추정한다.
 * - 상위 20% 휘도 픽셀의 무게중심으로 Key Light 방향(방위각·고도각)과 색온도를 추정
 * - 하위 35% 암부 픽셀 평균으로 Fill/Ambient 음영 톤 추출
 * - 외곽 테두리(12% 밴드) 고휘도 픽셀로 Rim Light 강도 및 색상 계산
 */
export function extract3dLightingRigFrom2dCut(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): CutTo3dLightingRig {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const expectedLen = safeW * safeH * 4;

  if (rgba.length < expectedLen || safeW * safeH === 0) {
    return {
      keyLight: { color: { r: 1, g: 0.96, b: 0.9 }, intensity: 1.2, azimuthDeg: 35, elevationDeg: 42 },
      fillLight: { color: { r: 0.72, g: 0.82, b: 0.96 }, intensity: 0.45, azimuthDeg: -135, elevationDeg: 20 },
      rimLight: { color: { r: 0.95, g: 0.97, b: 1 }, intensity: 0.55, azimuthDeg: -145, elevationDeg: 35 },
      ambientColor: { r: 0.58, g: 0.62, b: 0.7 },
      ambientIntensity: 0.35,
      keyTemperatureKelvin: 5500,
      shadowRampThresholds: [0.22, 0.54, 0.84],
      contrastRatio: 2.5,
      moodId: "soft-daylight",
      moodLabelKo: "부드러운 자연광",
      moodLabelEn: "Soft Daylight",
    };
  }

  // Stride sampling keeps 4K buffers under ~2ms
  const pixelCount = safeW * safeH;
  const stride = Math.max(1, Math.floor(Math.sqrt(pixelCount / 16384)));

  let brightWeight = 0;
  let brightX = 0;
  let brightY = 0;
  let brightR = 0;
  let brightG = 0;
  let brightB = 0;

  let darkWeight = 0;
  let darkR = 0;
  let darkG = 0;
  let darkB = 0;

  let rimWeight = 0;
  let rimR = 0;
  let rimG = 0;
  let rimB = 0;

  let totalWeight = 0;
  let sumLuma = 0;
  let sumLumaSq = 0;
  let maxSaturation = 0;

  const borderX = Math.max(1, Math.floor(safeW * 0.14));
  const borderY = Math.max(1, Math.floor(safeH * 0.14));

  for (let y = 0; y < safeH; y += stride) {
    const ny = (y + 0.5) / safeH;
    const isBorderY = y < borderY || y >= safeH - borderY;
    for (let x = 0; x < safeW; x += stride) {
      const idx = (y * safeW + x) * 4;
      const a = rgba[idx + 3]! / 255;
      if (a < 0.08) continue;

      const r = rgba[idx]! / 255;
      const g = rgba[idx + 1]! / 255;
      const b = rgba[idx + 2]! / 255;
      const yVal = luma(r, g, b);
      const maxCh = Math.max(r, g, b);
      const minCh = Math.min(r, g, b);
      const sat = maxCh > 0.001 ? (maxCh - minCh) / maxCh : 0;
      if (sat > maxSaturation) maxSaturation = sat;

      totalWeight += a;
      sumLuma += yVal * a;
      sumLumaSq += yVal * yVal * a;

      const nx = (x + 0.5) / safeW;

      if (yVal >= 0.52) {
        const w = (yVal - 0.45) * (yVal - 0.45) * a;
        brightWeight += w;
        brightX += (nx * 2 - 1) * w;
        brightY += (1 - ny * 2) * w; // +1 top, -1 bottom
        brightR += r * w;
        brightG += g * w;
        brightB += b * w;
      }

      if (yVal <= 0.45) {
        const w = (0.5 - yVal) * a;
        darkWeight += w;
        darkR += r * w;
        darkG += g * w;
        darkB += b * w;
      }

      const isBorder = isBorderY || x < borderX || x >= safeW - borderX;
      if (isBorder && yVal >= 0.62) {
        const w = yVal * a;
        rimWeight += w;
        rimR += r * w;
        rimG += g * w;
        rimB += b * w;
      }
    }
  }

  const meanLuma = totalWeight > 0 ? sumLuma / totalWeight : 0.5;
  const variance = totalWeight > 0 ? Math.max(0, sumLumaSq / totalWeight - meanLuma * meanLuma) : 0.05;
  const stdLuma = Math.sqrt(variance);

  const cx = brightWeight > 0 ? clampRange(brightX / brightWeight, -1, 1) : 0.35;
  const cy = brightWeight > 0 ? clampRange(brightY / brightWeight, -1, 1) : 0.45;

  // Map normalized highlight centroid [-1,1] into 3D spherical lighting angles
  const keyAzimuthDeg = Math.round(clampRange(cx * 82, -85, 85));
  const keyElevationDeg = Math.round(clampRange(28 + cy * 46, -15, 78));

  const keyColor = normalizeColor(brightR, brightG, brightB, brightWeight);
  const darkColor = normalizeColor(darkR, darkG, darkB, darkWeight);
  const rimColor =
    rimWeight > 0
      ? normalizeColor(rimR, rimG, rimB, rimWeight)
      : {
          r: clamp01(keyColor.r * 0.85 + 0.15),
          g: clamp01(keyColor.g * 0.85 + 0.15),
          b: clamp01(keyColor.b * 0.85 + 0.15),
        };

  const keyKelvin = estimateKelvin(keyColor);
  const contrastRatio = Number(clampRange(1.3 + stdLuma * 14, 1.3, 9.5).toFixed(2));
  const keyIntensity = Number(clampRange(0.9 + meanLuma * 0.75 + stdLuma * 0.9, 0.75, 2.2).toFixed(2));
  const fillIntensity = Number(clampRange(0.22 + (1 - stdLuma * 1.6) * 0.42, 0.15, 0.75).toFixed(2));
  const rimIntensity = Number(
    clampRange(rimWeight > 0 ? 0.45 + Math.min(0.85, (rimWeight / Math.max(1, totalWeight)) * 3.2) : 0.35, 0.25, 1.35).toFixed(2),
  );

  // Opposite hemisphere fill & silhouette rim
  const fillAzimuthDeg = keyAzimuthDeg >= 0 ? keyAzimuthDeg - 135 : keyAzimuthDeg + 135;
  const rimAzimuthDeg = keyAzimuthDeg >= 0 ? keyAzimuthDeg - 165 : keyAzimuthDeg + 165;

  const lowThresh = Number(clampRange(0.16 + meanLuma * 0.18 - stdLuma * 0.15, 0.1, 0.35).toFixed(2));
  const midThresh = Number(clampRange(0.45 + meanLuma * 0.16, lowThresh + 0.15, 0.72).toFixed(2));
  const highThresh = Number(clampRange(0.76 + meanLuma * 0.12, midThresh + 0.12, 0.94).toFixed(2));

  let moodId: CutTo3dLightingRig["moodId"] = "soft-daylight";
  let moodLabelKo = "부드러운 자연광";
  let moodLabelEn = "Soft Daylight";

  if (maxSaturation > 0.78 && meanLuma < 0.48 && rimIntensity >= 0.55) {
    moodId = "vivid-neon";
    moodLabelKo = "네온 야간 림라이트";
    moodLabelEn = "Vivid Neon Rim";
  } else if (meanLuma < 0.32 && contrastRatio >= 3.2) {
    moodId = "dramatic-noir";
    moodLabelKo = "고대비 느와르";
    moodLabelEn = "Dramatic Noir";
  } else if (keyKelvin <= 4300) {
    moodId = "golden-hour";
    moodLabelKo = "황금 노을 역광";
    moodLabelEn = "Golden Hour Warmth";
  } else if (keyKelvin >= 6700 || meanLuma < 0.38) {
    moodId = "cool-night";
    moodLabelKo = "새벽·야간 한색광";
    moodLabelEn = "Cool Night Moonlight";
  }

  return {
    keyLight: {
      color: keyColor,
      intensity: keyIntensity,
      azimuthDeg: keyAzimuthDeg,
      elevationDeg: keyElevationDeg,
    },
    fillLight: {
      color: {
        r: Number(clamp01(darkColor.r * 0.65 + 0.25).toFixed(4)),
        g: Number(clamp01(darkColor.g * 0.65 + 0.27).toFixed(4)),
        b: Number(clamp01(darkColor.b * 0.65 + 0.32).toFixed(4)),
      },
      intensity: fillIntensity,
      azimuthDeg: Math.round(fillAzimuthDeg),
      elevationDeg: Math.round(clampRange(18 + (1 - cy) * 14, 8, 45)),
    },
    rimLight: {
      color: rimColor,
      intensity: rimIntensity,
      azimuthDeg: Math.round(rimAzimuthDeg),
      elevationDeg: Math.round(clampRange(keyElevationDeg * 0.85, 15, 65)),
    },
    ambientColor: darkColor,
    ambientIntensity: Number(clampRange(0.2 + meanLuma * 0.32, 0.15, 0.55).toFixed(2)),
    keyTemperatureKelvin: keyKelvin,
    shadowRampThresholds: [lowThresh, midThresh, highThresh],
    contrastRatio,
    moodId,
    moodLabelKo,
    moodLabelEn,
  };
}
