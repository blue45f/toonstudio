/**
 * Wave 38F — 2.5D 임파스토+3채널 종이결 및 Face Shadow SDF 6패스 3D->2D 합성 `<canvas>` 프리뷰 렌더러.
 * Calm Atelier CSS 시맨틱 토큰과 OKLCH 색공간만 사용한다(원시 hex/rgb/hsl 0건).
 */

import type {
  ExtremeBrushStrokeResult,
  RakingLightConfig,
} from "./extreme-brush-texture-engine";
import {
  formatOklchColor,
  type ContactLockIkResult,
  type PerspectivePnPResult,
  type SixPassBakeManifest,
  type SixPassCompositeResult,
} from "./perfect-3d-npr-suite";

interface CanvasThemeChrome {
  readonly fg: string;
  readonly fgMuted: string;
  readonly accent: string;
  readonly good: string;
  readonly line: string;
}

const DEG_TO_RAD = Math.PI / 180;

function resolveCanvasThemeChrome(canvas: HTMLCanvasElement): CanvasThemeChrome {
  const rootStyle =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const elStyle = typeof getComputedStyle === "function" ? getComputedStyle(canvas) : null;
  const fallbackFg = elStyle?.color.trim() || "CanvasText";

  const pick = (token: string, fallback: string): string => {
    const fromEl = elStyle?.getPropertyValue(token).trim() ?? "";
    if (fromEl.length > 0) return fromEl;
    const fromRoot = rootStyle?.getPropertyValue(token).trim() ?? "";
    return fromRoot.length > 0 ? fromRoot : fallback;
  };

  const fg = pick("--color-fg", fallbackFg);
  const accent = pick("--color-accent", fg);
  return {
    fg,
    fgMuted: pick("--color-fg-2", fg),
    accent,
    good: pick("--color-good", accent),
    line: pick("--color-line", fg),
  };
}

/**
 * 2.5D 임파스토 두께 버퍼 + 3채널 종이 요철 + 사선 광원 스펙큘러 결과를 `<canvas>`에 그린다.
 */
export function renderImpastoBrushPreviewCanvas(
  canvas: HTMLCanvasElement,
  result: ExtremeBrushStrokeResult,
  rakingLight: RakingLightConfig,
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const chrome = resolveCanvasThemeChrome(canvas);
  const width = canvas.width || 360;
  const height = canvas.height || 220;
  ctx.clearRect(0, 0, width, height);

  const gridW = result.impasto.width;
  const gridH = result.impasto.height;
  const cellW = width / Math.max(1, gridW);
  const cellH = height / Math.max(1, gridH);

  // 1) 2.5D 임파스토 + 종이 요철 + 사선 광원 셰이딩 셀 래스터 출력
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      const idx = y * gridW + x;
      const thick = result.impasto.thickness[idx] ?? 0;
      const lum = result.shading.luminance[idx] ?? 0.93;
      const spec = result.shading.specular[idx] ?? 0;
      const cVal = result.impasto.pigmentC[idx] ?? 0.012;
      const hVal = result.impasto.pigmentH[idx] ?? 85;
      const paperH = result.paper.heightField[idx] ?? 0.5;

      const finalL =
        thick > 0.02 ? lum : Math.min(0.98, Math.max(0.84, 0.92 + (paperH - 0.5) * 0.08));
      const finalC = thick > 0.02 ? Math.max(0, cVal * (1 - spec * 0.45)) : 0.014;

      ctx.fillStyle = formatOklchColor({ l: finalL, c: finalC, h: hVal });
      ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);

      if (spec > 0.14) {
        ctx.fillStyle = formatOklchColor({ l: 0.99, c: 0.015, h: 75 }, Math.min(0.85, spec));
        ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }

  // 2) 사선 광원(Raking Light) 방향 인디케이터 (좌상단 컴퍼스)
  const azRad = rakingLight.azimuthDeg * DEG_TO_RAD;
  const dialX = 28;
  const dialY = 28;
  const dialR = 14;
  ctx.save();
  ctx.strokeStyle = chrome.line;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(dialX, dialY, dialR, 0, Math.PI * 2);
  ctx.stroke();

  const sunX = dialX + Math.cos(azRad) * dialR * 0.85;
  const sunY = dialY + Math.sin(azRad) * dialR * 0.85;
  ctx.strokeStyle = chrome.accent;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(dialX, dialY);
  ctx.lineTo(sunX, sunY);
  ctx.stroke();

  ctx.fillStyle = chrome.accent;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // 3) 하단 물리 HUD 요약 라벨
  ctx.fillStyle = chrome.fg;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText(
    `${result.paper.labelKo} · 두께 ${result.impasto.peakThickness.toFixed(2)}mm · 광원 ${Math.round(rakingLight.elevationDeg)}°`,
    10,
    height - 10,
  );
  ctx.restore();

  return true;
}

/**
 * 3D -> 2D 6패스 합성 결과 + Face Shadow SDF 광원 방향 + Contact-Lock IK 0mm 지면 프리뷰를 그린다.
 */
export function renderSixPassFacePreviewCanvas(
  canvas: HTMLCanvasElement,
  composite: SixPassCompositeResult,
  manifest: SixPassBakeManifest,
  ikResult: ContactLockIkResult,
  pnpResult: PerspectivePnPResult,
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const chrome = resolveCanvasThemeChrome(canvas);
  const width = canvas.width || 360;
  const height = canvas.height || 240;
  ctx.clearRect(0, 0, width, height);

  // 좌측 64% 영역: 6패스 얼굴 SDF 합성, 우측 36% 영역: Contact-Lock IK 0mm 지면 골격 프리뷰
  const faceBoxSize = Math.min(height - 20, Math.floor(width * 0.6));
  const faceOriginX = 12;
  const faceOriginY = Math.floor((height - faceBoxSize) * 0.5);

  const cellW = faceBoxSize / Math.max(1, composite.width);
  const cellH = faceBoxSize / Math.max(1, composite.height);

  // 1) 6패스 합성 래스터 렌더
  for (let y = 0; y < composite.height; y += 1) {
    for (let x = 0; x < composite.width; x += 1) {
      const idx = y * composite.width + x;
      const l = composite.outL[idx] ?? 0.95;
      const c = composite.outC[idx] ?? 0.01;
      const h = composite.outH[idx] ?? 85;
      ctx.fillStyle = formatOklchColor({ l, c, h });
      ctx.fillRect(
        faceOriginX + Math.floor(x * cellW),
        faceOriginY + Math.floor(y * cellH),
        Math.ceil(cellW) + 1,
        Math.ceil(cellH) + 1,
      );
    }
  }

  // PnP 수평선 오버레이 (얼굴 뷰포트 위 점선 가이드)
  if (pnpResult.valid) {
    const horizonY = faceOriginY + Math.min(0.92, Math.max(0.08, pnpResult.horizonYRatio)) * faceBoxSize;
    ctx.save();
    ctx.strokeStyle = chrome.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(faceOriginX, horizonY);
    ctx.lineTo(faceOriginX + faceBoxSize, horizonY);
    ctx.stroke();
    ctx.restore();
  }

  // 얼굴 SDF 광원 위치 표시
  const azRad = manifest.faceSdf.azimuthDeg * DEG_TO_RAD;
  const elFactor = 1 - Math.max(0, manifest.faceSdf.elevationDeg) / 110;
  const lightDotX = faceOriginX + faceBoxSize * 0.5 + Math.sin(azRad) * faceBoxSize * 0.42;
  const lightDotY = faceOriginY + faceBoxSize * (0.2 + 0.35 * elFactor);
  ctx.save();
  ctx.fillStyle = chrome.accent;
  ctx.beginPath();
  ctx.arc(lightDotX, lightDotY, 5, 0, Math.PI * 2);
  ctx.fill();

  // 2) 우측 미니 Contact-Lock IK 골격 + 0mm 지면선
  const ikAreaX = faceOriginX + faceBoxSize + 14;
  const ikAreaW = Math.max(76, width - ikAreaX - 10);
  const floorY = height - 28;
  const scale = (height - 56) / 1.85;
  const centerX = ikAreaX + ikAreaW * 0.5;

  // 지면 0mm 라인
  ctx.strokeStyle = chrome.good;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(ikAreaX, floorY);
  ctx.lineTo(ikAreaX + ikAreaW, floorY);
  ctx.stroke();

  const toCanvas = (pos: readonly [number, number, number]): readonly [number, number] => [
    centerX + pos[0] * scale + pos[2] * scale * 0.28,
    floorY - pos[1] * scale,
  ];

  const bonePairs: ReadonlyArray<readonly [keyof typeof ikResult.joints, keyof typeof ikResult.joints]> = [
    ["pelvis", "spine"],
    ["spine", "chest"],
    ["chest", "head"],
    ["chest", "leftShoulder"],
    ["leftShoulder", "leftElbow"],
    ["leftElbow", "leftHand"],
    ["chest", "rightShoulder"],
    ["rightShoulder", "rightElbow"],
    ["rightElbow", "rightHand"],
    ["pelvis", "leftHip"],
    ["leftHip", "leftKnee"],
    ["leftKnee", "leftAnkle"],
    ["leftAnkle", "leftToe"],
    ["pelvis", "rightHip"],
    ["rightHip", "rightKnee"],
    ["rightKnee", "rightAnkle"],
    ["rightAnkle", "rightToe"],
  ];

  ctx.strokeStyle = chrome.fg;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const [aId, bId] of bonePairs) {
    const [ax, ay] = toCanvas(ikResult.joints[aId]);
    const [bx, by] = toCanvas(ikResult.joints[bId]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // 머리 원 및 지면 발 접지 포인트
  const [hx, hy] = toCanvas(ikResult.joints.head);
  ctx.beginPath();
  ctx.arc(hx, hy, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = chrome.good;
  for (const footId of ["leftAnkle", "rightAnkle"] as const) {
    const [fx, fy] = toCanvas(ikResult.joints[footId]);
    ctx.beginPath();
    ctx.arc(fx, fy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = chrome.fgMuted;
  ctx.font = "600 10px system-ui, sans-serif";
  ctx.fillText(`IK 0.00mm`, ikAreaX + 4, floorY + 14);
  ctx.restore();

  return true;
}
