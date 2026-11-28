import { describe, expect, it } from "vitest";

import {
  auditPanelBalloonTails,
  BALLOON_TAIL_STYLE_IDS,
  BALLOON_TAIL_STYLE_PRESETS,
  buildBalloonTailGeometry,
  computeTailRoutingSha256Hex,
  distancePointToRect,
  escapeSvgXml,
  inferOffPanelEdge,
  isPointInsideRect,
  polylinesIntersect2D,
  renderBalloonTailRoutingSvg,
  routeCollisionFreeBalloonTails,
  segmentIntersectsRect2D,
  segmentsIntersect2D,
  sha256Utf8Hex,
  summarizeBalloonTailRoutingKo,
  type PanelBalloonTailDocument,
  type Rect2D,
  type SpeakerAnchorSpec,
  type SpeechBalloonTailSpec,
} from "./index";

const PANEL_STD: Rect2D = { x: 0, y: 0, width: 640, height: 480 };

function sp(
  speakerId: string,
  nameKo: string,
  faceX: number,
  faceY: number,
  faceW = 76,
  faceH = 88,
  extra?: Partial<SpeakerAnchorSpec>,
): SpeakerAnchorSpec {
  return {
    speakerId,
    nameKo,
    faceBounds: { x: faceX, y: faceY, width: faceW, height: faceH },
    mouthPos: { x: faceX + faceW * 0.5, y: faceY + faceH * 0.72 },
    ...extra,
  };
}

function bl(
  balloonId: string,
  speakerId: string,
  centerX: number,
  centerY: number,
  tailStyle: SpeechBalloonTailSpec["tailStyle"] = "classic-curved-pointer",
  extra?: Partial<SpeechBalloonTailSpec>,
): SpeechBalloonTailSpec {
  return { balloonId, speakerId, centerX, centerY, rx: 84, ry: 42, tailStyle, ...extra };
}

function makeXCrossDoc(panelId: string, b2Style: SpeechBalloonTailSpec["tailStyle"] = "classic-curved-pointer"): PanelBalloonTailDocument {
  return {
    panelId,
    titleKo: "2인 대화 X자 꼬리 교차 해소",
    panelBounds: PANEL_STD,
    speakers: [sp("sp-l", "하윤", 85, 325), sp("sp-r", "도진", 480, 325)],
    balloons: [
      bl("b1", "sp-r", 190, 110, "classic-curved-pointer", { dialoguePreviewKo: "여기로 와!" }),
      bl("b2", "sp-l", 430, 185, b2Style, { dialoguePreviewKo: "지금 가는 중이야." }),
    ],
  };
}

describe("Wave 148 — 5종 말풍선 꼬리 기하 생성 및 스탠드오프 불변량", () => {
  it("classic-curved-pointer는 타원 경계 앵커에서 닫힌 2차 베지어 꼬리 경로를 생성한다", () => {
    const speaker = sp("sp-a", "하윤", 260, 320);
    const balloon = bl("b-classic", "sp-a", 180, 120, "classic-curved-pointer");
    const tail = buildBalloonTailGeometry(balloon, speaker, PANEL_STD);

    expect(tail.tailStyle).toBe("classic-curved-pointer");
    expect(tail.svgPathD.startsWith("M ")).toBe(true);
    expect(tail.svgPathD).toContain(" Q ");
    expect(tail.svgPathD.endsWith(" Z")).toBe(true);
    expect(tail.thoughtDots).toHaveLength(0);
    expect(tail.dashedStroke).toBe(false);
    expect(tail.tipInsideSpeakerFace).toBe(false);

    for (const pt of [tail.anchorPoint, tail.baseLeft, tail.baseRight]) {
      const norm =
        Math.pow((pt.x - balloon.centerX) / balloon.rx, 2) +
        Math.pow((pt.y - balloon.centerY) / balloon.ry, 2);
      expect(norm).toBeCloseTo(1, 3);
    }

    const half = Math.floor(tail.outlinePolygon.length / 2);
    expect(
      polylinesIntersect2D(tail.outlinePolygon.slice(0, half - 1), tail.outlinePolygon.slice(half + 1))
        .intersects,
    ).toBe(false);
  });

  it("sharp-shout-spike는 넓은 기저 폭과 직선형 외침 꼬리를 생성한다", () => {
    const speaker = sp("sp-a", "도진", 300, 310);
    const classic = buildBalloonTailGeometry(bl("b1", "sp-a", 200, 120, "classic-curved-pointer"), speaker, PANEL_STD);
    const shout = buildBalloonTailGeometry(bl("b2", "sp-a", 200, 120, "sharp-shout-spike"), speaker, PANEL_STD);
    expect(shout.baseHalfWidthPx).toBeGreaterThan(classic.baseHalfWidthPx);
    expect(shout.curveOffsetPx).toBe(0);
    expect(shout.dashedStroke).toBe(false);
    expect(shout.tipInsideSpeakerFace).toBe(false);
  });

  it("thought-bubble-dots는 3~5개 원의 반지름이 화자 방향으로 엄격히 단조 감소한다", () => {
    const speaker = sp("sp-a", "서연", 420, 320);
    const tail = buildBalloonTailGeometry(bl("b-thought", "sp-a", 180, 120, "thought-bubble-dots"), speaker, PANEL_STD);
    expect(tail.thoughtDots.length).toBeGreaterThanOrEqual(3);
    expect(tail.thoughtDots.length).toBeLessThanOrEqual(5);
    expect(tail.svgPathD).toBe("");
    for (let i = 1; i < tail.thoughtDots.length; i += 1) {
      expect((tail.thoughtDots[i - 1]?.radius ?? 0) > (tail.thoughtDots[i]?.radius ?? 0)).toBe(true);
    }
    for (const dot of tail.thoughtDots) {
      expect(dot.radius).toBeGreaterThan(0);
      expect(distancePointToRect(dot.center, speaker.faceBounds)).toBeGreaterThan(dot.radius - 0.5);
    }
  });

  it("thought-bubble-dots의 도트 개수는 3~5 범위로 결정론적 클램프된다", () => {
    const speaker = sp("sp-a", "서연", 420, 320);
    const c1 = buildBalloonTailGeometry(bl("b-min", "sp-a", 180, 120, "thought-bubble-dots", { thoughtDotCount: 1 }), speaker, PANEL_STD);
    const c3 = buildBalloonTailGeometry(bl("b-3", "sp-a", 180, 120, "thought-bubble-dots", { thoughtDotCount: 3 }), speaker, PANEL_STD);
    const c9 = buildBalloonTailGeometry(bl("b-max", "sp-a", 180, 120, "thought-bubble-dots", { thoughtDotCount: 9 }), speaker, PANEL_STD);
    expect(c1.thoughtDots).toHaveLength(3);
    expect(c3.thoughtDots).toHaveLength(3);
    expect(c9.thoughtDots).toHaveLength(5);
  });

  it("off-panel-edge-arrow는 4개 컷 경계(left/right/top/bottom) 각각으로 정확히 지시한다", () => {
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      const offSpeaker: SpeakerAnchorSpec = {
        speakerId: `off-${edge}`,
        nameKo: `화면밖-${edge}`,
        faceBounds: { x: -100, y: -100, width: 0, height: 0 },
        mouthPos: { x: 320, y: 240 },
        isOffPanel: true,
        offPanelEdge: edge,
      };
      const tail = buildBalloonTailGeometry(bl(`b-${edge}`, offSpeaker.speakerId, 320, 220, "off-panel-edge-arrow"), offSpeaker, PANEL_STD);
      expect(tail.offPanelEdge).toBe(edge);
      expect(tail.tipInsideSpeakerFace).toBe(false);
      if (edge === "left") expect(tail.tip.x).toBeLessThan(20);
      if (edge === "right") expect(tail.tip.x).toBeGreaterThan(PANEL_STD.width - 20);
      if (edge === "top") expect(tail.tip.y).toBeLessThan(20);
      if (edge === "bottom") expect(tail.tip.y).toBeGreaterThan(PANEL_STD.height - 20);
    }
  });

  it("off-panel-edge-arrow에서 offPanelEdge가 없으면 mouthPos 기준 가장 가까운 경계를 추론한다", () => {
    expect(inferOffPanelEdge({ x: 635, y: 210 }, PANEL_STD)).toBe("right");
    expect(inferOffPanelEdge({ x: 10, y: 210 }, PANEL_STD)).toBe("left");
    expect(inferOffPanelEdge({ x: 310, y: 4 }, PANEL_STD)).toBe("top");
    expect(inferOffPanelEdge({ x: 310, y: 476 }, PANEL_STD)).toBe("bottom");

    const autoOff: SpeakerAnchorSpec = {
      speakerId: "off-auto",
      nameKo: "복도 목소리",
      faceBounds: { x: 0, y: 0, width: 0, height: 0 },
      mouthPos: { x: 660, y: 180 },
      isOffPanel: true,
    };
    const tail = buildBalloonTailGeometry(bl("b-off", "off-auto", 430, 140, "off-panel-edge-arrow"), autoOff, PANEL_STD);
    expect(tail.offPanelEdge).toBe("right");
  });

  it("whisper-thin-curve는 얇은 기저 폭과 점선 스트로크 속성을 유지한다", () => {
    const tail = buildBalloonTailGeometry(bl("b-w", "sp-w", 240, 140, "whisper-thin-curve"), sp("sp-w", "유진", 420, 320), PANEL_STD);
    expect(tail.baseHalfWidthPx).toBeLessThanOrEqual(8);
    expect(tail.dashedStroke).toBe(true);
    expect(tail.curveOffsetPx).not.toBe(0);
    expect(BALLOON_TAIL_STYLE_IDS).toHaveLength(5);
    expect(BALLOON_TAIL_STYLE_PRESETS["whisper-thin-curve"].dashedStroke).toBe(true);
  });

  it("기본 스탠드오프(16~24px)에서 팁은 화자 얼굴 밖 안전 거리에 놓인다", () => {
    const speaker = sp("sp-a", "하윤", 280, 310, 80, 92);
    for (const style of BALLOON_TAIL_STYLE_IDS) {
      if (style === "off-panel-edge-arrow") continue;
      const preset = BALLOON_TAIL_STYLE_PRESETS[style];
      expect(preset.defaultStandoffPx).toBeGreaterThanOrEqual(16);
      expect(preset.defaultStandoffPx).toBeLessThanOrEqual(24);
      const tail = buildBalloonTailGeometry(bl(`b-${style}`, "sp-a", 160, 110, style), speaker, PANEL_STD);
      expect(tail.tipInsideSpeakerFace).toBe(false);
      expect(isPointInsideRect(tail.tip, speaker.faceBounds)).toBe(false);
      expect(tail.tipStandoffPx).toBeGreaterThanOrEqual(12);
    }
  });

  it("입 좌표가 큰 얼굴 박스 정중앙에 있어도 팁은 얼굴 박스 내부를 찌르지 않는다", () => {
    const bigFace: SpeakerAnchorSpec = {
      speakerId: "sp-big",
      nameKo: "클로즈업",
      faceBounds: { x: 240, y: 240, width: 160, height: 180 },
      mouthPos: { x: 320, y: 330 },
    };
    const tail = buildBalloonTailGeometry(bl("b-close", "sp-big", 140, 90, "classic-curved-pointer", { tipStandoffPx: 18 }), bigFace, PANEL_STD);
    expect(tail.tipInsideSpeakerFace).toBe(false);
    expect(distancePointToRect(tail.tip, bigFace.faceBounds)).toBeGreaterThan(4);
    expect(tail.distanceTipToMouthPx).toBeGreaterThan(18);
  });

  it("말풍선이 화자 얼굴에 바짝 붙은 좁은 간격에서도 팁이 얼굴 안을 찌르지 않는다", () => {
    const speaker = sp("sp-tight", "민수", 260, 260, 76, 84);
    const tail = buildBalloonTailGeometry(bl("b-tight", "sp-tight", 298, 195, "classic-curved-pointer", { rx: 64, ry: 34 }), speaker, PANEL_STD);
    expect(tail.tipInsideSpeakerFace).toBe(false);
    expect(isPointInsideRect(tail.tip, speaker.faceBounds)).toBe(false);
  });

  it("NaN·Infinity 등 오염 입력에서도 예외 없이 유한한 좌표를 생성한다", () => {
    const dirty: SpeakerAnchorSpec = {
      speakerId: "sp-dirty",
      nameKo: "오염입력",
      faceBounds: { x: Number.NaN, y: 280, width: 70, height: 80 },
      mouthPos: { x: 40, y: Number.POSITIVE_INFINITY },
    };
    const tail = buildBalloonTailGeometry(
      bl("b-dirty", "sp-dirty", Number.NaN, 100, "classic-curved-pointer", { rx: -10, ry: Number.NaN, tipStandoffPx: Number.NaN }),
      dirty,
      PANEL_STD,
    );
    expect(Number.isFinite(tail.tip.x)).toBe(true);
    expect(Number.isFinite(tail.tip.y)).toBe(true);
    expect(Number.isFinite(tail.arcLengthPx)).toBe(true);
    expect(tail.svgPathD).not.toMatch(/NaN|Infinity/);
  });
});

describe("Wave 148 — 2D 교차 프리미티브 및 4대 꼬리 결함 감지기", () => {
  it("segmentsIntersect2D와 segmentIntersectsRect2D가 교차·비교차·공선 중첩을 정확히 판정한다", () => {
    const hit = segmentsIntersect2D({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 });
    expect(hit.intersects).toBe(true);
    expect(hit.point?.x).toBeCloseTo(50, 2);
    expect(hit.point?.y).toBeCloseTo(50, 2);
    expect(segmentsIntersect2D({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 10 }, { x: 100, y: 10 }).intersects).toBe(false);
    expect(segmentsIntersect2D({ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 }).intersects).toBe(true);

    const rectHit = segmentIntersectsRect2D({ x: 0, y: 50 }, { x: 200, y: 50 }, { x: 80, y: 20, width: 40, height: 60 });
    expect(rectHit.intersects).toBe(true);
    expect(rectHit.point?.x).toBeCloseTo(100, 1);
  });

  it("결함 1(tail-crosses-other-face): 직선 꼬리가 타인 얼굴 박스를 가로지르면 탐지한다", () => {
    const spA = sp("sp-a", "하윤", 450, 320);
    const spMid = sp("sp-mid", "중간인물", 290, 210, 82, 90);
    const b1 = bl("b1", "sp-a", 140, 110);
    const audit = auditPanelBalloonTails(
      { panelId: "cut-face-cross", panelBounds: PANEL_STD, speakers: [spA, spMid], balloons: [b1] },
      [buildBalloonTailGeometry(b1, spA, PANEL_STD, { curveOffsetPx: 0 })],
    );
    expect(audit.passed).toBe(false);
    expect(audit.faceCrossingCount).toBe(1);
    expect(audit.defects[0]?.kind).toBe("tail-crosses-other-face");
    expect(audit.defects[0]?.blockingSpeakerId).toBe("sp-mid");
  });

  it("결함 1(tail-crosses-other-face): 속마음 도트 체인이 타인 얼굴을 가로질러도 탐지한다", () => {
    const spA = sp("sp-a", "하윤", 460, 320);
    const spMid = sp("sp-mid", "지나가는인물", 295, 215, 84, 90);
    const b1 = bl("b-thought", "sp-a", 140, 110, "thought-bubble-dots");
    const audit = auditPanelBalloonTails(
      { panelId: "cut-thought-cross", panelBounds: PANEL_STD, speakers: [spA, spMid], balloons: [b1] },
      [buildBalloonTailGeometry(b1, spA, PANEL_STD, { curveOffsetPx: 0 })],
    );
    expect(audit.faceCrossingCount).toBe(1);
  });

  it("결함 2(tail-tail-crossing): 두 말풍선 꼬리가 X자로 교차하면 정확히 탐지한다", () => {
    const doc = makeXCrossDoc("cut-x-cross");
    const spL = doc.speakers[0] as SpeakerAnchorSpec;
    const spR = doc.speakers[1] as SpeakerAnchorSpec;
    const t1 = buildBalloonTailGeometry(doc.balloons[0] as SpeechBalloonTailSpec, spR, PANEL_STD, { curveOffsetPx: 0 });
    const t2 = buildBalloonTailGeometry(doc.balloons[1] as SpeechBalloonTailSpec, spL, PANEL_STD, { curveOffsetPx: 0 });
    const audit = auditPanelBalloonTails(doc, [t1, t2]);
    expect(audit.tailCrossingCount).toBe(1);
    const defect = audit.defects.find((d) => d.kind === "tail-tail-crossing");
    expect(defect?.balloonId).toBe("b1");
    expect(defect?.otherBalloonId).toBe("b2");
  });

  it("결함 2(tail-tail-crossing): 속마음 도트 체인과 곡선 꼬리가 겹쳐도 교차로 탐지한다", () => {
    const doc = makeXCrossDoc("cut-thought-tail-cross", "thought-bubble-dots");
    const spL = doc.speakers[0] as SpeakerAnchorSpec;
    const spR = doc.speakers[1] as SpeakerAnchorSpec;
    const t1 = buildBalloonTailGeometry(doc.balloons[0] as SpeechBalloonTailSpec, spR, PANEL_STD, { curveOffsetPx: 0 });
    const t2 = buildBalloonTailGeometry(doc.balloons[1] as SpeechBalloonTailSpec, spL, PANEL_STD, { curveOffsetPx: 0 });
    expect(auditPanelBalloonTails(doc, [t1, t2]).tailCrossingCount).toBe(1);
  });

  it("결함 3(tail-pierces-speaker-face): 꼬리 팁이 화자 얼굴 안쪽을 찌르면 탐지한다", () => {
    const speaker = sp("sp-a", "하윤", 280, 300, 84, 92);
    const b1 = bl("b1", "sp-a", 180, 110);
    const pierced = buildBalloonTailGeometry(b1, speaker, PANEL_STD, { customTip: speaker.mouthPos });
    expect(pierced.tipInsideSpeakerFace).toBe(true);
    const audit = auditPanelBalloonTails(
      { panelId: "cut-pierce", panelBounds: PANEL_STD, speakers: [speaker], balloons: [b1] },
      [pierced],
    );
    expect(audit.speakerFacePiercingCount).toBe(1);
    expect(audit.defects.some((d) => d.kind === "tail-pierces-speaker-face")).toBe(true);
  });

  it("결함 3(tail-pierces-speaker-face): 팁은 반대편 밖이어도 꼬리 중간이 화자 얼굴을 관통하면 탐지한다", () => {
    const speaker = sp("sp-a", "하윤", 260, 220, 84, 92);
    const b1 = bl("b1", "sp-a", 300, 90);
    const through = buildBalloonTailGeometry(b1, speaker, PANEL_STD, {
      curveOffsetPx: 0,
      customTip: { x: 302, y: 345 },
    });
    const audit = auditPanelBalloonTails(
      { panelId: "cut-through", panelBounds: PANEL_STD, speakers: [speaker], balloons: [b1] },
      [through],
    );
    expect(audit.speakerFacePiercingCount).toBe(1);
  });

  it("결함 4(ambiguous-speaker-aim): 꼬리 연장선에 다른 캐릭터가 훨씬 가까이 놓이면 탐지한다", () => {
    const spTrue = sp("sp-true", "진짜화자", 480, 320);
    const spWrong = sp("sp-wrong", "옆사람", 260, 280);
    const b1 = bl("b1", "sp-true", 150, 120);
    const misAimed = buildBalloonTailGeometry(b1, spTrue, PANEL_STD, {
      curveOffsetPx: 0,
      customTip: { x: 265, y: 255 },
    });
    const audit = auditPanelBalloonTails(
      { panelId: "cut-ambig", panelBounds: PANEL_STD, speakers: [spTrue, spWrong], balloons: [b1] },
      [misAimed],
    );
    expect(audit.ambiguousAimCount).toBe(1);
    expect(audit.defects.some((d) => d.kind === "ambiguous-speaker-aim")).toBe(true);
  });

  it("결함 4(ambiguous-speaker-aim): 꼬리 끝 방향이 화자 입과 정반대로 크게 빗나가면 탐지한다", () => {
    const speaker = sp("sp-a", "하윤", 450, 320);
    const b1 = bl("b1", "sp-a", 240, 130);
    const backward = buildBalloonTailGeometry(b1, speaker, PANEL_STD, {
      anchorAngleDeg: 180,
      curveOffsetPx: 0,
      customTip: { x: 90, y: 130 },
    });
    const audit = auditPanelBalloonTails(
      { panelId: "cut-back", panelBounds: PANEL_STD, speakers: [speaker], balloons: [b1] },
      [backward],
    );
    expect(audit.ambiguousAimCount).toBe(1);
  });

  it("결함이 없는 컷은 pass를 반환하고 화자 ID가 누락된 말풍선은 warn과 누락 목록을 기록한다", () => {
    const speaker = sp("sp-a", "하윤", 260, 310);
    const bOk = bl("b-ok", "sp-a", 290, 120);
    const cleanTail = buildBalloonTailGeometry(bOk, speaker, PANEL_STD);
    const cleanAudit = auditPanelBalloonTails(
      { panelId: "cut-clean", panelBounds: PANEL_STD, speakers: [speaker], balloons: [bOk] },
      [cleanTail],
    );
    expect(cleanAudit.passed).toBe(true);
    expect(cleanAudit.verdict).toBe("pass");

    const missingAudit = auditPanelBalloonTails(
      { panelId: "cut-missing", panelBounds: PANEL_STD, speakers: [speaker], balloons: [bOk, bl("b-orphan", "sp-missing", 460, 120)] },
      [cleanTail],
    );
    expect(missingAudit.passed).toBe(false);
    expect(missingAudit.verdict).toBe("warn");
    expect(missingAudit.missingSpeakerBalloonIds).toEqual(["b-orphan"]);
  });
});

describe("Wave 148 — 교차 제로 자동 라우터(routeCollisionFreeBalloonTails)", () => {
  it("3인 대화 컷: 단순 직선 꼬리의 타인 얼굴 관통을 자동 우회해 0건으로 해소한다", () => {
    const doc: PanelBalloonTailDocument = {
      panelId: "cut-3p-face-avoid",
      titleKo: "3인 대화 — 타인 얼굴 우회 검증",
      panelBounds: PANEL_STD,
      speakers: [sp("sp-l", "하윤", 60, 315), sp("sp-m", "태오", 282, 225, 80, 92), sp("sp-r", "도진", 475, 315)],
      balloons: [
        bl("b-to-right", "sp-r", 150, 105, "classic-curved-pointer", { dialoguePreviewKo: "방금 그 소리 들었어?" }),
        bl("b-to-left", "sp-l", 125, 215, "whisper-thin-curve", { rx: 72, ry: 34, dialoguePreviewKo: "조용히 해..." }),
      ],
    };
    const result = routeCollisionFreeBalloonTails(doc);
    expect(result.baselineAudit.faceCrossingCount).toBeGreaterThanOrEqual(1);
    expect(result.routedAudit.faceCrossingCount).toBe(0);
    expect(result.routedAudit.tailCrossingCount).toBe(0);
    expect(result.routedAudit.speakerFacePiercingCount).toBe(0);
    expect(result.routedAudit.ambiguousAimCount).toBe(0);
    expect(result.routedAudit.passed).toBe(true);
    expect(result.comparison.resolvedFaceCrossings).toBeGreaterThanOrEqual(1);
    expect(result.comparison.defectReductionRatio).toBe(1);
  });

  it("2인 대화 X자 꼬리 교차 컷: 기준선 교차 1건 → 자동 라우팅 후 교차 0건으로 해소한다", () => {
    const result = routeCollisionFreeBalloonTails(makeXCrossDoc("cut-2p-x-crossing"));
    expect(result.baselineAudit.tailCrossingCount).toBe(1);
    expect(result.routedAudit.tailCrossingCount).toBe(0);
    expect(result.routedAudit.faceCrossingCount).toBe(0);
    expect(result.routedAudit.speakerFacePiercingCount).toBe(0);
    expect(result.routedAudit.totalDefectCount).toBe(0);
    expect(result.comparison.resolvedTailCrossings).toBe(1);
    expect(result.comparison.allDefectsResolved).toBe(true);
  });

  it("같은 높이의 대칭 X자 교차 컷에서도 확장 곡률 탐색으로 꼬리 교차를 0건으로 해소한다", () => {
    const doc: PanelBalloonTailDocument = {
      panelId: "cut-sym-x-crossing",
      panelBounds: PANEL_STD,
      speakers: [sp("sp-l", "지민", 80, 330), sp("sp-r", "현우", 485, 330)],
      balloons: [
        bl("b1", "sp-r", 175, 135, "classic-curved-pointer", { rx: 78, ry: 38 }),
        bl("b2", "sp-l", 465, 135, "classic-curved-pointer", { rx: 78, ry: 38 }),
      ],
    };
    const result = routeCollisionFreeBalloonTails(doc);
    expect(result.baselineAudit.tailCrossingCount).toBe(1);
    expect(result.routedAudit.tailCrossingCount).toBe(0);
    expect(result.routedAudit.faceCrossingCount).toBe(0);
    expect(result.routedAudit.speakerFacePiercingCount).toBe(0);
    expect(result.routedAudit.passed).toBe(true);
  });

  it("3말풍선 밀집 다인 컷(얼굴 장애물 + 꼬리 교차 + 속마음 도트)을 결함 0건으로 라우팅한다", () => {
    const doc: PanelBalloonTailDocument = {
      panelId: "cut-dense-3balloons",
      panelBounds: PANEL_STD,
      speakers: [sp("sp-l", "하윤", 60, 330), sp("sp-m", "태오", 280, 295), sp("sp-r", "도진", 495, 330)],
      balloons: [
        bl("b1", "sp-r", 185, 100, "classic-curved-pointer", { rx: 76, ry: 36 }),
        bl("b2", "sp-l", 430, 175, "sharp-shout-spike", { rx: 76, ry: 36 }),
        bl("b3", "sp-m", 320, 92, "thought-bubble-dots", { rx: 70, ry: 32 }),
      ],
    };
    const result = routeCollisionFreeBalloonTails(doc);
    expect(result.baselineAudit.totalDefectCount).toBeGreaterThanOrEqual(1);
    expect(result.routedAudit.totalDefectCount).toBe(0);
    expect(result.routedAudit.passed).toBe(true);
    for (const tail of result.routedTails) expect(tail.tipInsideSpeakerFace).toBe(false);
  });

  it("5종 꼬리 스타일을 모두 포함하는 다인 대화 컷을 결함 0건으로 라우팅한다", () => {
    const spOff: SpeakerAnchorSpec = {
      speakerId: "sp-off",
      nameKo: "문 밖 감독",
      faceBounds: { x: 0, y: 0, width: 0, height: 0 },
      mouthPos: { x: 640, y: 120 },
      isOffPanel: true,
      offPanelEdge: "right",
    };
    const doc: PanelBalloonTailDocument = {
      panelId: "cut-all-5-styles",
      panelBounds: { x: 0, y: 0, width: 680, height: 480 },
      speakers: [
        sp("sp-1", "하윤", 58, 340, 68, 78),
        sp("sp-2", "도진", 230, 345, 68, 78),
        sp("sp-3", "서연", 405, 340, 68, 78),
        sp("sp-4", "유진", 545, 340, 68, 78),
        spOff,
      ],
      balloons: [
        bl("b-classic", "sp-1", 110, 120, "classic-curved-pointer", { rx: 68, ry: 34 }),
        bl("b-shout", "sp-2", 265, 115, "sharp-shout-spike", { rx: 68, ry: 34 }),
        bl("b-thought", "sp-3", 420, 125, "thought-bubble-dots", { rx: 68, ry: 34 }),
        bl("b-whisper", "sp-4", 570, 215, "whisper-thin-curve", { rx: 64, ry: 32 }),
        bl("b-off", "sp-off", 565, 95, "off-panel-edge-arrow", { rx: 66, ry: 32 }),
      ],
    };
    const result = routeCollisionFreeBalloonTails(doc);
    expect(result.routedAudit.passed).toBe(true);
    expect(result.routedAudit.totalDefectCount).toBe(0);
    expect(new Set(result.routedTails.map((t) => t.tailStyle)).size).toBe(5);
  });

  it("오프패널 경계 꼬리 경로에 온패널 얼굴이 가로막혀도 같은 경계를 유지하며 우회한다", () => {
    const spOff: SpeakerAnchorSpec = {
      speakerId: "sp-off",
      nameKo: "복도 인물",
      faceBounds: { x: 0, y: 0, width: 0, height: 0 },
      mouthPos: { x: 640, y: 148 },
      isOffPanel: true,
      offPanelEdge: "right",
    };
    const doc: PanelBalloonTailDocument = {
      panelId: "cut-offpanel-dodge",
      panelBounds: PANEL_STD,
      speakers: [sp("sp-block", "문앞인물", 510, 105, 76, 86), spOff],
      balloons: [bl("b-off", "sp-off", 340, 148, "off-panel-edge-arrow")],
    };
    const result = routeCollisionFreeBalloonTails(doc);
    expect(result.baselineAudit.faceCrossingCount).toBe(1);
    expect(result.routedAudit.faceCrossingCount).toBe(0);
    expect(result.routedTails[0]?.offPanelEdge).toBe("right");
    expect(result.routedAudit.passed).toBe(true);
  });

  it("선호 앵커 각도가 잘못 지정돼도 라우터가 화자 조준 모호성 0건으로 교정한다", () => {
    const doc: PanelBalloonTailDocument = {
      panelId: "cut-bad-anchor",
      panelBounds: PANEL_STD,
      speakers: [sp("sp-a", "하윤", 450, 320), sp("sp-b", "도진", 140, 320)],
      balloons: [bl("b1", "sp-a", 300, 120, "classic-curved-pointer", { preferredAnchorAngleDeg: 180 })],
    };
    const result = routeCollisionFreeBalloonTails(doc);
    expect(result.routedAudit.ambiguousAimCount).toBe(0);
    expect(result.routedAudit.passed).toBe(true);
  });

  it("말풍선이 비어 있는 컷에서도 안전하게 결과를 반환한다", () => {
    const result = routeCollisionFreeBalloonTails({
      panelId: "cut-empty",
      panelBounds: PANEL_STD,
      speakers: [],
      balloons: [],
    });
    expect(result.routedTails).toHaveLength(0);
    expect(result.routedAudit.passed).toBe(true);
    expect(result.comparison.defectReductionRatio).toBe(1);
    expect(result.tailRoutingSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Wave 148 — SHA-256 결정론, 순수 OKLCH SVG & 한국어 식자 감독 QA 브리프", () => {
  it("순수 ES2017 SHA-256이 FIPS 180-4 표준 테스트 벡터와 정확히 일치한다", () => {
    expect(sha256Utf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Utf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Utf8Hex("말풍선-꼬리-라우터")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("동일 입력 재실행 시 tailRoutingSha256Hex가 비트 단위 동일하고 1px 변경 시 즉시 바뀐다", () => {
    const docA = makeXCrossDoc("cut-det");
    const r1 = routeCollisionFreeBalloonTails(docA);
    const r2 = routeCollisionFreeBalloonTails(docA);
    expect(r1.tailRoutingSha256Hex).toBe(r2.tailRoutingSha256Hex);
    expect(r1.routedTails).toEqual(r2.routedTails);

    const docB: PanelBalloonTailDocument = {
      ...docA,
      balloons: [bl("b1", "sp-r", 191, 110), docA.balloons[1] as SpeechBalloonTailSpec],
    };
    expect(routeCollisionFreeBalloonTails(docB).tailRoutingSha256Hex).not.toBe(r1.tailRoutingSha256Hex);
    expect(computeTailRoutingSha256Hex(docA, r1.routedTails, r1.routedAudit)).toBe(r1.tailRoutingSha256Hex);
  });

  it("라이트·다크 SVG 모두 순수 oklch(...)만 사용하고 원시 hex/rgb/hsl 및 NaN이 0건이다", () => {
    const doc = makeXCrossDoc("cut-svg-colors", "whisper-thin-curve");
    const result = routeCollisionFreeBalloonTails(doc);
    for (const theme of ["light", "dark"] as const) {
      const svg = renderBalloonTailRoutingSvg(doc, result, { theme });
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/i);
      expect(svg).not.toMatch(/\b(?:NaN|Infinity)\b/);
    }
  });

  it("SVG에 컷 프레임·화자 얼굴/입·전후 배지·고스트·속마음 도트·점선·오프패널 경계가 렌더링된다", () => {
    const spOff: SpeakerAnchorSpec = {
      speakerId: "sp-off",
      nameKo: "화면밖",
      faceBounds: { x: 0, y: 0, width: 0, height: 0 },
      mouthPos: { x: 640, y: 110 },
      isOffPanel: true,
      offPanelEdge: "right",
    };
    const doc: PanelBalloonTailDocument = {
      panelId: "cut-svg-elements",
      panelBounds: PANEL_STD,
      speakers: [sp("sp-l", "하윤", 80, 325), sp("sp-r", "도진", 470, 325), spOff],
      balloons: [
        bl("b1", "sp-r", 190, 110, "thought-bubble-dots"),
        bl("b2", "sp-l", 430, 185, "whisper-thin-curve"),
        bl("b3", "sp-off", 520, 95, "off-panel-edge-arrow", { rx: 64, ry: 30 }),
      ],
    };
    const svg = renderBalloonTailRoutingSvg(doc, routeCollisionFreeBalloonTails(doc), { showBaselineGhost: true });
    expect(svg).toContain('data-layer="panel-frame"');
    expect(svg).toContain('data-layer="speakers"');
    expect(svg).toContain('data-layer="baseline-ghost"');
    expect(svg).toContain('data-badge="before-after-status"');
    expect(svg).toContain('data-tail-style="thought-bubble-dots"');
    expect(svg).toContain('data-tail-style="whisper-thin-curve"');
    expect(svg).toContain('stroke-dasharray="5 4"');
    expect(svg).toContain('data-off-panel-edge="right"');
    expect(svg).toContain("→ 0건");
  });

  it("미해결 결함이 있는 감사 결과를 SVG로 렌더링하면 data-defect-kind 마커를 표시한다", () => {
    const doc = makeXCrossDoc("cut-unrouted-svg");
    const spL = doc.speakers[0] as SpeakerAnchorSpec;
    const spR = doc.speakers[1] as SpeakerAnchorSpec;
    const rawTails = [
      buildBalloonTailGeometry(doc.balloons[0] as SpeechBalloonTailSpec, spR, PANEL_STD, { curveOffsetPx: 0 }),
      buildBalloonTailGeometry(doc.balloons[1] as SpeechBalloonTailSpec, spL, PANEL_STD, { curveOffsetPx: 0 }),
    ];
    const svg = renderBalloonTailRoutingSvg(doc, { tails: rawTails, audit: auditPanelBalloonTails(doc, rawTails) });
    expect(svg).toContain('data-layer="defect-markers"');
    expect(svg).toContain('data-defect-kind="tail-tail-crossing"');
    expect(svg).toContain("교정 필요");
  });

  it("SVG 출력과 escapeSvgXml이 <script>, <img onerror>, &, \", ' 특수문자를 완전히 이스케이프한다", () => {
    expect(escapeSvgXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
    const xssDoc: PanelBalloonTailDocument = {
      panelId: `cut<1>&"a"`,
      titleKo: `안전 <script>alert("x")</script> & '컷'`,
      panelBounds: PANEL_STD,
      speakers: [sp("sp<1>", `<img src=x onerror='1'> & "화자"`, 260, 310)],
      balloons: [bl(`b<"1">`, "sp<1>", 290, 120, "classic-curved-pointer", { dialoguePreviewKo: `<script>boom()</script> & '대사'` })],
    };
    const svg = renderBalloonTailRoutingSvg(xssDoc, routeCollisionFreeBalloonTails(xssDoc), {
      title: `제목 <script> & "test" 'quote'`,
    });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("summarizeBalloonTailRoutingKo가 통과 컷에서 해소 수치와 스타일 구성을 한국어로 요약한다", () => {
    const doc = makeXCrossDoc("cut-qa-pass", "sharp-shout-spike");
    const brief = summarizeBalloonTailRoutingKo(doc, routeCollisionFreeBalloonTails(doc));
    expect(brief.verdictKo).toBe("통과");
    expect(brief.headlineKo).toContain("통과");
    expect(brief.beforeAfterLineKo).toContain("1건에서 0건");
    expect(brief.styleBreakdownLineKo).toContain("곡선 일반 꼬리 1건");
    expect(brief.styleBreakdownLineKo).toContain("날카로운 외침 꼬리 1건");
    expect(brief.actionLinesKo[0]).toContain("식자 출력");
  });

  it("summarizeBalloonTailRoutingKo가 미해결 결함이 남은 경우 교정 필요 판정과 상세 사유를 출력한다", () => {
    const speaker = sp("sp-a", "하윤", 260, 310);
    const b1 = bl("b1", "sp-a", 290, 120);
    const doc: PanelBalloonTailDocument = { panelId: "cut-qa-fail", panelBounds: PANEL_STD, speakers: [speaker], balloons: [b1] };
    const pierced = buildBalloonTailGeometry(b1, speaker, PANEL_STD, { customTip: speaker.mouthPos });
    const brief = summarizeBalloonTailRoutingKo(doc, {
      ...routeCollisionFreeBalloonTails(doc),
      routedTails: [pierced],
      routedAudit: auditPanelBalloonTails(doc, [pierced]),
    });
    expect(brief.verdictKo).toBe("교정 필요");
    expect(brief.headlineKo).toContain("교정 필요");
    expect(brief.actionLinesKo.some((l) => l.includes("침범"))).toBe(true);
  });

  it("한국어 QA 브리프에 기계적 번역투 표현이 전혀 포함되지 않는다", () => {
    const doc = makeXCrossDoc("cut-korean-tone", "thought-bubble-dots");
    const brief = summarizeBalloonTailRoutingKo(doc, routeCollisionFreeBalloonTails(doc));
    expect(brief.fullTextKo).not.toMatch(/하는 것을 가능하게|직관적인 경험을 제공|원활한 워크플로우를 보장/);
  });
});
