/**
 * Wave 148 — 웹툰 말풍선 꼬리 4대 결함 감지기(타인 얼굴 관통, 꼬리-꼬리 교차,
 * 화자 얼굴 침범, 화자 조준 모호성) 및 충돌 판정 헬퍼.
 */

import {
  clamp,
  distancePointToRect,
  distancePointToSegment,
  doBoundsOverlap,
  isPointInsideRect,
  polylineIntersectsRect2D,
  polylinesIntersect2D,
  radToDeg,
  rectToBounds,
  roundFixed,
  sanitizePoint,
  sanitizeRect,
  vecDistance,
  vecDot,
  vecLength,
  vecLerp,
  vecScale,
  vecSub,
} from "./balloon-tail-math-and-sha256";
import type {
  BalloonTailDefect,
  BuiltBalloonTailGeometry,
  PanelBalloonTailAudit,
  PanelBalloonTailDocument,
  Rect2D,
  SpeakerAimDiagnostic,
  SpeakerAnchorSpec,
  Vec2,
} from "./balloon-tail-types";

export function isOnPanelSpeaker(speaker: SpeakerAnchorSpec): boolean {
  if (speaker.isOffPanel) return false;
  const face = sanitizeRect(speaker.faceBounds);
  return face.width > 0 && face.height > 0;
}

export function tailIntersectsFaceRect(
  tail: BuiltBalloonTailGeometry,
  faceRect: Rect2D,
): Vec2 | null {
  if (faceRect.width <= 0 || faceRect.height <= 0) return null;
  if (!doBoundsOverlap(tail.bounds, rectToBounds(faceRect))) return null;

  if (tail.tailStyle === "thought-bubble-dots" && tail.thoughtDots.length > 0) {
    for (let i = 0; i < tail.thoughtDots.length; i += 1) {
      const dot = tail.thoughtDots[i];
      if (!dot) continue;
      if (distancePointToRect(dot.center, faceRect) < dot.radius - 0.25) {
        return dot.center;
      }
    }
    const centerHit = polylineIntersectsRect2D(tail.centerlineSamples, faceRect);
    return centerHit.intersects ? centerHit.point : null;
  }

  const centerHit = polylineIntersectsRect2D(tail.centerlineSamples, faceRect);
  if (centerHit.intersects) return centerHit.point;

  const outlineClosed =
    tail.outlinePolygon.length >= 2
      ? [...tail.outlinePolygon, tail.outlinePolygon[0] as Vec2]
      : tail.outlinePolygon;
  const outlineHit = polylineIntersectsRect2D(outlineClosed, faceRect);
  return outlineHit.intersects ? outlineHit.point : null;
}

export function tailsCross2D(
  a: BuiltBalloonTailGeometry,
  b: BuiltBalloonTailGeometry,
): Vec2 | null {
  if (!doBoundsOverlap(a.bounds, b.bounds)) return null;

  const centerHit = polylinesIntersect2D(a.centerlineSamples, b.centerlineSamples);
  if (centerHit.intersects) return centerHit.point;

  if (a.tailStyle !== "thought-bubble-dots" && b.tailStyle !== "thought-bubble-dots") {
    const aClosed =
      a.outlinePolygon.length >= 2
        ? [...a.outlinePolygon, a.outlinePolygon[0] as Vec2]
        : a.outlinePolygon;
    const bClosed =
      b.outlinePolygon.length >= 2
        ? [...b.outlinePolygon, b.outlinePolygon[0] as Vec2]
        : b.outlinePolygon;
    const outlineHit = polylinesIntersect2D(aClosed, bClosed);
    if (outlineHit.intersects) return outlineHit.point;
  }

  if (a.thoughtDots.length > 0 && b.thoughtDots.length > 0) {
    for (let i = 0; i < a.thoughtDots.length; i += 1) {
      const da = a.thoughtDots[i];
      if (!da) continue;
      for (let j = 0; j < b.thoughtDots.length; j += 1) {
        const db = b.thoughtDots[j];
        if (!db) continue;
        if (vecDistance(da.center, db.center) < da.radius + db.radius - 0.25) {
          return vecLerp(da.center, db.center, 0.5);
        }
      }
    }
  } else if (a.thoughtDots.length > 0 || b.thoughtDots.length > 0) {
    const dotTail = a.thoughtDots.length > 0 ? a : b;
    const lineTail = a.thoughtDots.length > 0 ? b : a;
    for (let i = 0; i < dotTail.thoughtDots.length; i += 1) {
      const dot = dotTail.thoughtDots[i];
      if (!dot) continue;
      for (let j = 1; j < lineTail.centerlineSamples.length; j += 1) {
        const p1 = lineTail.centerlineSamples[j - 1];
        const p2 = lineTail.centerlineSamples[j];
        if (!p1 || !p2) continue;
        if (distancePointToSegment(dot.center, p1, p2) < dot.radius - 0.25) {
          return dot.center;
        }
      }
    }
  }
  return null;
}

export function evaluateSpeakerAim(
  tail: BuiltBalloonTailGeometry,
  speaker: SpeakerAnchorSpec,
  allOnPanelSpeakers: readonly SpeakerAnchorSpec[],
): SpeakerAimDiagnostic {
  const mouth = sanitizePoint(speaker.mouthPos);
  const toSpeaker = vecSub(mouth, tail.tip);
  const distSpeaker = vecLength(toSpeaker);
  const forwardSpeaker = vecDot(toSpeaker, tail.tipDirectionUnit);
  const projSpeaker = Math.max(0, forwardSpeaker);
  const perpSpeaker = vecLength(vecSub(toSpeaker, vecScale(tail.tipDirectionUnit, projSpeaker)));
  const cosAngle = distSpeaker > 1e-6 ? clamp(forwardSpeaker / distSpeaker, -1, 1) : 1;
  const aimAngleErrorDeg = roundFixed(radToDeg(Math.acos(cosAngle)), 2);
  const speakerRayCost = forwardSpeaker > 0 ? perpSpeaker + 0.35 * forwardSpeaker : distSpeaker + 1000;

  let closestOtherId: string | null = null;
  let closestOtherCost = Number.POSITIVE_INFINITY;
  let competitorClearlyAhead = false;

  for (let i = 0; i < allOnPanelSpeakers.length; i += 1) {
    const other = allOnPanelSpeakers[i];
    if (!other || other.speakerId === speaker.speakerId) continue;
    const otherMouth = sanitizePoint(other.mouthPos);
    const toOther = vecSub(otherMouth, tail.tip);
    const distOther = vecLength(toOther);
    const forwardOther = vecDot(toOther, tail.tipDirectionUnit);
    if (forwardOther <= 0) continue;

    const perpOther = vecLength(vecSub(toOther, vecScale(tail.tipDirectionUnit, forwardOther)));
    const otherRayCost = perpOther + 0.35 * forwardOther;
    if (otherRayCost < closestOtherCost) {
      closestOtherCost = otherRayCost;
      closestOtherId = other.speakerId;
    }

    const otherFace = sanitizeRect(other.faceBounds);
    const captureBand = Math.max(32, 0.55 * Math.max(otherFace.width, otherFace.height));
    const cosOther = distOther > 1e-6 ? clamp(forwardOther / distOther, -1, 1) : 1;
    const otherAngleDeg = radToDeg(Math.acos(cosOther));

    if (
      (perpOther <= captureBand && forwardOther < forwardSpeaker - 8) ||
      otherRayCost < speakerRayCost * 0.8 ||
      (distOther < distSpeaker * 0.72 && otherAngleDeg <= 34)
    ) {
      competitorClearlyAhead = true;
    }
  }

  const misAimedAway = (forwardSpeaker <= 0 || aimAngleErrorDeg > 52) && distSpeaker > 34;
  const isAmbiguous = competitorClearlyAhead || misAimedAway;

  return {
    balloonId: tail.balloonId,
    speakerId: speaker.speakerId,
    aimAngleErrorDeg,
    speakerForwardDistPx: roundFixed(forwardSpeaker, 2),
    speakerPerpDistPx: roundFixed(perpSpeaker, 2),
    closestCompetingSpeakerId: closestOtherId,
    closestCompetingRayCostPx: Number.isFinite(closestOtherCost)
      ? roundFixed(closestOtherCost, 2)
      : null,
    speakerRayCostPx: roundFixed(speakerRayCost, 2),
    isAmbiguous,
  };
}

export function auditPanelBalloonTails(
  doc: PanelBalloonTailDocument,
  tails: readonly BuiltBalloonTailGeometry[],
): PanelBalloonTailAudit {
  const speakerById = new Map<string, SpeakerAnchorSpec>();
  const onPanelSpeakers: SpeakerAnchorSpec[] = [];
  for (let i = 0; i < doc.speakers.length; i += 1) {
    const sp = doc.speakers[i];
    if (!sp) continue;
    speakerById.set(sp.speakerId, sp);
    if (isOnPanelSpeaker(sp)) onPanelSpeakers.push(sp);
  }

  const defects: BalloonTailDefect[] = [];
  const speakerAimDiagnostics: SpeakerAimDiagnostic[] = [];
  const missingSpeakerBalloonIds: string[] = [];

  for (let i = 0; i < doc.balloons.length; i += 1) {
    const spec = doc.balloons[i];
    if (spec && !speakerById.has(spec.speakerId)) {
      missingSpeakerBalloonIds.push(spec.balloonId);
    }
  }

  for (let i = 0; i < tails.length; i += 1) {
    const tail = tails[i];
    if (!tail) continue;
    const owner = speakerById.get(tail.speakerId);
    if (!owner) continue;

    for (let s = 0; s < onPanelSpeakers.length; s += 1) {
      const other = onPanelSpeakers[s];
      if (!other || other.speakerId === owner.speakerId) continue;
      const hitPt = tailIntersectsFaceRect(tail, sanitizeRect(other.faceBounds));
      if (hitPt) {
        defects.push({
          kind: "tail-crosses-other-face",
          severity: "error",
          balloonId: tail.balloonId,
          otherBalloonId: null,
          speakerId: owner.speakerId,
          blockingSpeakerId: other.speakerId,
          intersectionPoint: hitPt,
          detailKo: `'${owner.nameKo}' 말풍선(${tail.balloonId}) 꼬리가 '${other.nameKo}' 얼굴 영역을 가로지릅니다.`,
        });
      }
    }

    if (isOnPanelSpeaker(owner)) {
      const ownerFace = sanitizeRect(owner.faceBounds);
      let piercePoint: Vec2 | null = null;
      if (isPointInsideRect(tail.tip, ownerFace)) {
        piercePoint = tail.tip;
      } else if (tail.tailStyle === "thought-bubble-dots") {
        for (let d = 0; d < tail.thoughtDots.length; d += 1) {
          const dot = tail.thoughtDots[d];
          if (dot && distancePointToRect(dot.center, ownerFace) < dot.radius - 0.25) {
            piercePoint = dot.center;
            break;
          }
        }
      } else {
        const startIdx = Math.floor(tail.centerlineSamples.length * 0.4);
        for (let k = startIdx; k < tail.centerlineSamples.length; k += 1) {
          const pt = tail.centerlineSamples[k];
          if (pt && isPointInsideRect(pt, ownerFace)) {
            piercePoint = pt;
            break;
          }
        }
      }

      if (piercePoint) {
        defects.push({
          kind: "tail-pierces-speaker-face",
          severity: "error",
          balloonId: tail.balloonId,
          otherBalloonId: null,
          speakerId: owner.speakerId,
          blockingSpeakerId: owner.speakerId,
          intersectionPoint: piercePoint,
          detailKo: `'${owner.nameKo}' 말풍선(${tail.balloonId}) 꼬리 끝점이 화자 얼굴 안쪽을 침범합니다.`,
        });
      }

      if (tail.tailStyle !== "off-panel-edge-arrow") {
        const aimDiag = evaluateSpeakerAim(tail, owner, onPanelSpeakers);
        speakerAimDiagnostics.push(aimDiag);
        if (aimDiag.isAmbiguous) {
          const competitor = aimDiag.closestCompetingSpeakerId
            ? speakerById.get(aimDiag.closestCompetingSpeakerId)
            : undefined;
          const detailKo = competitor
            ? `'${owner.nameKo}' 말풍선(${tail.balloonId}) 꼬리 연장선에서 '${competitor.nameKo}'가 더 가까워 화자 귀속이 모호합니다.`
            : `'${owner.nameKo}' 말풍선(${tail.balloonId}) 꼬리 끝 방향이 화자 입에서 크게 벗어나 있습니다(오차 ${aimDiag.aimAngleErrorDeg}°).`;
          defects.push({
            kind: "ambiguous-speaker-aim",
            severity: "error",
            balloonId: tail.balloonId,
            otherBalloonId: null,
            speakerId: owner.speakerId,
            blockingSpeakerId: competitor ? competitor.speakerId : null,
            intersectionPoint: tail.tip,
            detailKo,
          });
        }
      }
    }
  }

  for (let i = 0; i < tails.length; i += 1) {
    const tailA = tails[i];
    if (!tailA) continue;
    for (let j = i + 1; j < tails.length; j += 1) {
      const tailB = tails[j];
      if (!tailB) continue;
      const crossPt = tailsCross2D(tailA, tailB);
      if (crossPt) {
        defects.push({
          kind: "tail-tail-crossing",
          severity: "error",
          balloonId: tailA.balloonId,
          otherBalloonId: tailB.balloonId,
          speakerId: tailA.speakerId,
          blockingSpeakerId: null,
          intersectionPoint: crossPt,
          detailKo: `말풍선 '${tailA.balloonId}' 꼬리와 '${tailB.balloonId}' 꼬리가 서로 교차합니다.`,
        });
      }
    }
  }

  let faceCrossingCount = 0;
  let tailCrossingCount = 0;
  let speakerFacePiercingCount = 0;
  let ambiguousAimCount = 0;
  for (let i = 0; i < defects.length; i += 1) {
    const d = defects[i];
    if (!d) continue;
    if (d.kind === "tail-crosses-other-face") faceCrossingCount += 1;
    else if (d.kind === "tail-tail-crossing") tailCrossingCount += 1;
    else if (d.kind === "tail-pierces-speaker-face") speakerFacePiercingCount += 1;
    else if (d.kind === "ambiguous-speaker-aim") ambiguousAimCount += 1;
  }

  const totalDefectCount = defects.length;
  const passed = totalDefectCount === 0 && missingSpeakerBalloonIds.length === 0;
  const verdict = passed ? "pass" : totalDefectCount > 0 ? "fail" : "warn";

  return {
    panelId: doc.panelId,
    passed,
    verdict,
    totalDefectCount,
    faceCrossingCount,
    tailCrossingCount,
    speakerFacePiercingCount,
    ambiguousAimCount,
    missingSpeakerBalloonIds,
    defects,
    speakerAimDiagnostics,
  };
}
