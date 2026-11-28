/**
 * Wave 148 — 2차 베지어 말풍선 꼬리 기하 생성기(5종 꼬리 스타일 + 화자 얼굴 무침범 스탠드오프).
 */

import {
  clamp,
  computePointsBounds,
  computePolylineLength,
  degToRad,
  distancePointToRect,
  evalQuadraticBezier,
  isPointInsideOrOnRect,
  isPointInsideRect,
  normalizeAngleDeg,
  radToDeg,
  rayExitDistanceFromRect,
  roundFixed,
  sampleQuadraticBezier,
  sanitizeFinite,
  sanitizePoint,
  sanitizeRect,
  vecAdd,
  vecDistance,
  vecDot,
  vecLerp,
  vecNormalize,
  vecScale,
  vecSub,
} from "./balloon-tail-math-and-sha256";
import { isOnPanelSpeaker } from "./balloon-tail-audit";
import {
  BALLOON_TAIL_STYLE_PRESETS,
  type BalloonTailBuildOverride,
  type BuiltBalloonTailGeometry,
  type OffPanelEdge,
  type Rect2D,
  type SpeakerAnchorSpec,
  type SpeechBalloonTailSpec,
  type ThoughtBubbleDot,
  type Vec2,
} from "./balloon-tail-types";

function fmtNum(value: number): string {
  const r = roundFixed(value, 2);
  return Object.is(r, -0) ? "0" : String(r);
}

export function ellipsePointAtAngle(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angleRad: number,
): Vec2 {
  return { x: cx + rx * Math.cos(angleRad), y: cy + ry * Math.sin(angleRad) };
}

export function inferOffPanelEdge(point: Vec2, panelBounds: Rect2D): OffPanelEdge {
  const rect = sanitizeRect(panelBounds);
  const dLeft = Math.abs(point.x - rect.x);
  const dRight = Math.abs(point.x - (rect.x + rect.width));
  const dTop = Math.abs(point.y - rect.y);
  const dBottom = Math.abs(point.y - (rect.y + rect.height));
  let bestEdge: OffPanelEdge = "left";
  let bestDist = dLeft;
  if (dRight < bestDist) {
    bestDist = dRight;
    bestEdge = "right";
  }
  if (dTop < bestDist) {
    bestDist = dTop;
    bestEdge = "top";
  }
  if (dBottom < bestDist) bestEdge = "bottom";
  return bestEdge;
}

export function resolveOffPanelEdgeTarget(
  spec: SpeechBalloonTailSpec,
  speaker: SpeakerAnchorSpec,
  panelBounds: Rect2D,
  edgeOffsetPx = 0,
): { readonly edge: OffPanelEdge; readonly target: Vec2; readonly tip: Vec2 } {
  const rect = sanitizeRect(panelBounds);
  const mouth = sanitizePoint(speaker.mouthPos);
  const edge = speaker.offPanelEdge ?? inferOffPanelEdge(mouth, rect);
  const marginX = Math.min(20, rect.width * 0.12);
  const marginY = Math.min(20, rect.height * 0.12);
  const insetPx = 6;

  if (edge === "left" || edge === "right") {
    const baseY = Number.isFinite(mouth.y) ? mouth.y : spec.centerY;
    const y = clamp(baseY + edgeOffsetPx, rect.y + marginY, rect.y + rect.height - marginY);
    const xEdge = edge === "left" ? rect.x : rect.x + rect.width;
    const xTip = edge === "left" ? rect.x + insetPx : rect.x + rect.width - insetPx;
    return { edge, target: { x: xEdge, y }, tip: { x: xTip, y } };
  }
  const baseX = Number.isFinite(mouth.x) ? mouth.x : spec.centerX;
  const x = clamp(baseX + edgeOffsetPx, rect.x + marginX, rect.x + rect.width - marginX);
  const yEdge = edge === "top" ? rect.y : rect.y + rect.height;
  const yTip = edge === "top" ? rect.y + insetPx : rect.y + rect.height - insetPx;
  return { edge, target: { x, y: yEdge }, tip: { x, y: yTip } };
}

function computeSafeTipForOnPanelSpeaker(
  anchor: Vec2,
  speaker: SpeakerAnchorSpec,
  requestedStandoffPx: number,
  approachAngleOffsetDeg: number,
): Vec2 {
  const mouth = sanitizePoint(speaker.mouthPos);
  const face = sanitizeRect(speaker.faceBounds);
  const baseDir = vecNormalize(vecSub(anchor, mouth), { x: 0, y: -1 });
  const rotRad = degToRad(approachAngleOffsetDeg);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  const approachDir: Vec2 = {
    x: baseDir.x * cosR - baseDir.y * sinR,
    y: baseDir.x * sinR + baseDir.y * cosR,
  };

  const anchorDist = vecDistance(anchor, mouth);
  const exitDist = rayExitDistanceFromRect(mouth, approachDir, face);
  const standoff = clamp(requestedStandoffPx, 6, 48);
  const desiredFromFace = Math.min(standoff, Math.max(6, (anchorDist - exitDist) * 0.45));
  const minClearDist = exitDist + Math.max(4, Math.min(desiredFromFace, standoff));
  const targetDist = Math.max(standoff, exitDist + desiredFromFace);
  const maxBeforeAnchor = Math.max(minClearDist, anchorDist - 10);
  const finalDist = clamp(targetDist, minClearDist, maxBeforeAnchor);

  let tip = vecAdd(mouth, vecScale(approachDir, finalDist));
  if (isPointInsideOrOnRect(tip, face)) {
    const faceCenter: Vec2 = { x: face.x + face.width * 0.5, y: face.y + face.height * 0.5 };
    const escapeDir = vecNormalize(vecSub(tip, faceCenter), approachDir);
    const escapeExit = rayExitDistanceFromRect(tip, escapeDir, face);
    tip = vecAdd(tip, vecScale(escapeDir, escapeExit + Math.max(6, standoff * 0.5)));
  }
  return tip;
}

function buildThoughtDots(
  anchor: Vec2,
  centerControl: Vec2,
  tip: Vec2,
  dotCountRaw: number,
  baseHalfWidthPx: number,
  speakerFace: Rect2D | null,
): ThoughtBubbleDot[] {
  const count = Math.round(clamp(dotCountRaw, 3, 5));
  const maxRadius = clamp(baseHalfWidthPx * 0.85, 6.5, 11.5);
  const minRadius = clamp(maxRadius * 0.36, 2.8, maxRadius - 1.5);
  const dots: ThoughtBubbleDot[] = [];

  for (let i = 0; i < count; i += 1) {
    const frac = count === 1 ? 0.5 : i / (count - 1);
    const center = evalQuadraticBezier(anchor, centerControl, tip, 0.16 + frac * 0.78);
    let radius = maxRadius - frac * (maxRadius - minRadius);
    if (speakerFace && speakerFace.width > 0 && speakerFace.height > 0) {
      const distToFace = distancePointToRect(center, speakerFace);
      if (distToFace > 1.5 && radius >= distToFace - 1) {
        radius = Math.max(2.2, distToFace - 1.2);
      }
    }
    const prev = i > 0 ? dots[i - 1] : undefined;
    if (prev && radius >= prev.radius) radius = Math.max(1.8, prev.radius - 0.8);
    dots.push({
      center: { x: roundFixed(center.x, 3), y: roundFixed(center.y, 3) },
      radius: roundFixed(radius, 3),
    });
  }
  return dots;
}

export function buildBalloonTailGeometry(
  spec: SpeechBalloonTailSpec,
  speaker: SpeakerAnchorSpec,
  panelBounds: Rect2D,
  override?: BalloonTailBuildOverride,
): BuiltBalloonTailGeometry {
  const preset = BALLOON_TAIL_STYLE_PRESETS[spec.tailStyle];
  const cx = sanitizeFinite(spec.centerX, 0);
  const cy = sanitizeFinite(spec.centerY, 0);
  const rx = Math.max(12, sanitizeFinite(spec.rx, 48));
  const ry = Math.max(10, sanitizeFinite(spec.ry, 32));
  const mouth = sanitizePoint(speaker.mouthPos);
  const face = sanitizeRect(speaker.faceBounds);
  const isOffPanelMode = spec.tailStyle === "off-panel-edge-arrow" || speaker.isOffPanel === true;

  const offPanelResolved = isOffPanelMode
    ? resolveOffPanelEdgeTarget(
        spec,
        speaker,
        panelBounds,
        sanitizeFinite(override?.offPanelEdgeTargetOffsetPx ?? 0, 0),
      )
    : null;
  const aimTarget = offPanelResolved ? offPanelResolved.target : mouth;

  const directAngleDeg = normalizeAngleDeg(radToDeg(Math.atan2(aimTarget.y - cy, aimTarget.x - cx)));
  const anchorAngleDeg = normalizeAngleDeg(
    override?.anchorAngleDeg !== undefined
      ? override.anchorAngleDeg
      : spec.preferredAnchorAngleDeg !== undefined
        ? spec.preferredAnchorAngleDeg
        : directAngleDeg,
  );
  const anchorRad = degToRad(anchorAngleDeg);
  const anchorPoint = ellipsePointAtAngle(cx, cy, rx, ry, anchorRad);

  const requestedStandoff = sanitizeFinite(
    override?.tipStandoffPx !== undefined
      ? override.tipStandoffPx
      : spec.tipStandoffPx !== undefined
        ? spec.tipStandoffPx
        : preset.defaultStandoffPx,
    preset.defaultStandoffPx,
  );
  const approachOffsetDeg = sanitizeFinite(override?.tipApproachAngleOffsetDeg ?? 0, 0);

  let tip: Vec2;
  if (override?.customTip) {
    tip = sanitizePoint(override.customTip);
  } else if (offPanelResolved) {
    tip = offPanelResolved.tip;
  } else if (isOnPanelSpeaker(speaker)) {
    tip = computeSafeTipForOnPanelSpeaker(anchorPoint, speaker, requestedStandoff, approachOffsetDeg);
  } else {
    const dirToAnchor = vecNormalize(vecSub(anchorPoint, mouth), { x: 0, y: -1 });
    tip = vecAdd(mouth, vecScale(dirToAnchor, clamp(requestedStandoff, 6, 48)));
  }

  const baseHalfWidthPx = clamp(
    sanitizeFinite(spec.baseHalfWidthPx ?? preset.defaultBaseHalfWidthPx, preset.defaultBaseHalfWidthPx),
    3,
    Math.min(rx, ry) * 0.65,
  );
  const tangentMag = Math.max(1, Math.hypot(-rx * Math.sin(anchorRad), ry * Math.cos(anchorRad)));
  const deltaAngleRad = clamp(baseHalfWidthPx / tangentMag, 0.04, 0.44);
  const candA = ellipsePointAtAngle(cx, cy, rx, ry, anchorRad - deltaAngleRad);
  const candB = ellipsePointAtAngle(cx, cy, rx, ry, anchorRad + deltaAngleRad);

  const unitSpan = vecNormalize(vecSub(tip, anchorPoint), {
    x: Math.cos(anchorRad),
    y: Math.sin(anchorRad),
  });
  const leftNormal: Vec2 = { x: -unitSpan.y, y: unitSpan.x };
  const sideA = vecDot(vecSub(candA, anchorPoint), leftNormal);
  const sideB = vecDot(vecSub(candB, anchorPoint), leftNormal);
  const baseLeft = sideA >= sideB ? candA : candB;
  const baseRight = sideA >= sideB ? candB : candA;

  const curveOffsetPx = sanitizeFinite(
    override?.curveOffsetPx !== undefined
      ? override.curveOffsetPx
      : spec.curveOffsetPx !== undefined
        ? spec.curveOffsetPx
        : preset.defaultCurveOffsetPx,
    preset.defaultCurveOffsetPx,
  );

  const centerControl = vecAdd(vecLerp(anchorPoint, tip, 0.48), vecScale(leftNormal, curveOffsetPx));
  const leftControl = vecAdd(
    centerControl,
    vecScale(vecSub(baseLeft, anchorPoint), preset.taperControlRatio),
  );
  const rightControl = vecAdd(
    centerControl,
    vecScale(vecSub(baseRight, anchorPoint), preset.taperControlRatio),
  );

  const centerlineSamples = sampleQuadraticBezier(anchorPoint, centerControl, tip, 16);
  const leftSamples = sampleQuadraticBezier(baseLeft, leftControl, tip, 12);
  const rightSamples = sampleQuadraticBezier(tip, rightControl, baseRight, 12);
  const outlinePolygon: Vec2[] = [...leftSamples, ...rightSamples.slice(1)];

  const thoughtDots =
    spec.tailStyle === "thought-bubble-dots"
      ? buildThoughtDots(
          anchorPoint,
          centerControl,
          tip,
          spec.thoughtDotCount ?? preset.defaultThoughtDotCount,
          baseHalfWidthPx,
          isOnPanelSpeaker(speaker) ? face : null,
        )
      : [];

  const svgPathD =
    spec.tailStyle === "thought-bubble-dots"
      ? ""
      : [
          `M ${fmtNum(baseLeft.x)} ${fmtNum(baseLeft.y)}`,
          `Q ${fmtNum(leftControl.x)} ${fmtNum(leftControl.y)} ${fmtNum(tip.x)} ${fmtNum(tip.y)}`,
          `Q ${fmtNum(rightControl.x)} ${fmtNum(rightControl.y)} ${fmtNum(baseRight.x)} ${fmtNum(baseRight.y)}`,
          "Z",
        ].join(" ");

  const tipDirectionUnit = vecNormalize(vecSub(tip, centerControl), unitSpan);
  const tipInsideSpeakerFace = isOnPanelSpeaker(speaker) ? isPointInsideRect(tip, face) : false;
  const tipStandoffPx = isOnPanelSpeaker(speaker)
    ? roundFixed(distancePointToRect(tip, face), 3)
    : roundFixed(vecDistance(tip, aimTarget), 3);

  const boundPoints: Vec2[] = [...outlinePolygon, ...centerlineSamples];
  for (let i = 0; i < thoughtDots.length; i += 1) {
    const dot = thoughtDots[i];
    if (!dot) continue;
    boundPoints.push(
      { x: dot.center.x - dot.radius, y: dot.center.y - dot.radius },
      { x: dot.center.x + dot.radius, y: dot.center.y + dot.radius },
    );
  }

  return {
    balloonId: spec.balloonId,
    speakerId: spec.speakerId,
    tailStyle: spec.tailStyle,
    anchorAngleDeg: roundFixed(anchorAngleDeg, 3),
    anchorPoint,
    baseLeft,
    baseRight,
    baseHalfWidthPx: roundFixed(baseHalfWidthPx, 3),
    leftControl,
    rightControl,
    centerControl,
    curveOffsetPx: roundFixed(curveOffsetPx, 3),
    tip,
    aimTarget,
    tipDirectionUnit,
    tipStandoffPx,
    distanceTipToMouthPx: roundFixed(vecDistance(tip, mouth), 3),
    tipInsideSpeakerFace,
    arcLengthPx: roundFixed(computePolylineLength(centerlineSamples), 3),
    centerlineSamples,
    outlinePolygon,
    svgPathD,
    thoughtDots,
    offPanelEdge: offPanelResolved ? offPanelResolved.edge : null,
    dashedStroke: preset.dashedStroke,
    bounds: computePointsBounds(boundPoints),
  };
}
