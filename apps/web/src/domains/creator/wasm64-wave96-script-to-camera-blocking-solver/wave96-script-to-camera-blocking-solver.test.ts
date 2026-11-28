import { describe, expect, it } from "vitest";
import {
  auditCameraBlockingContinuity,
  parseKoreanWebtoonScript,
  recommendShotGrammarForBeat,
  renderBlockingFloorplanSvg,
  solveCameraBlockingPlan,
  solveThreePointLightingForBeat,
  summarizeCameraBlockingSheetKo,
  type BlockingActorSpec,
  type CameraBlockingPlan,
  type ScriptBeat,
} from "./index";

const ROOFTOP_ACTORS: readonly BlockingActorSpec[] = [
  { actorId: "서연", displayNameKo: "서연", position: { x: -1.6, y: 0, z: 0 } },
  { actorId: "민재", displayNameKo: "민재", position: { x: 1.6, y: 0, z: 0 } },
];

const SIX_CUT_ROOFTOP_SCRIPT = [
  "[장면: 옥상 야경]",
  '서연 (분노): "여기서 끝내자!"',
  '민재 (속삭임): "잠깐, 뒤에 누군가 있어..."',
  "(지문: 서연이 검을 뽑아 든다)",
  '서연 (냉소, 위압): "변명은 그만해."',
  '민재 (경악): "설마... 그날의 진실을 알고 있었어?!"',
  '서연 (단호): "이제 도망칠 곳은 없어!"',
].join("\n");

function vec3Length(v: { readonly x: number; readonly y: number; readonly z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe("Wave 96 — Korean Script Beat Parser", () => {
  it("infers night-neon, sunset, interior-warm, and daylight time-of-day from Korean scene headers", () => {
    const night = parseKoreanWebtoonScript('[장면: 옥상 야경]\n서연: "왔구나."');
    const sunset = parseKoreanWebtoonScript('[장면: 한강 둔치 석양]\n서연: "해가 진다."');
    const cafe = parseKoreanWebtoonScript('[장면: 오래된 카페]\n서연: "커피 식는다."');
    const day = parseKoreanWebtoonScript('[장면: 학교 운동장 낮]\n서연: "안녕!"');

    expect(night.sceneTimeOfDay).toBe("night-neon");
    expect(night.sceneTitle).toBe("옥상 야경");
    expect(sunset.sceneTimeOfDay).toBe("sunset");
    expect(cafe.sceneTimeOfDay).toBe("interior-warm");
    expect(day.sceneTimeOfDay).toBe("daylight");
  });

  it("parses alternating speakers, listeners, emotion cues, and participant order", () => {
    const scene = parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT, { sceneId: "ep12-rooftop" });

    expect(scene.sceneId).toBe("ep12-rooftop");
    expect(scene.participantIds).toEqual(["서연", "민재"]);
    expect(scene.beats).toHaveLength(6);
    expect(scene.beats[0]?.speakerId).toBe("서연");
    expect(scene.beats[0]?.listenerId).toBe("민재");
    expect(scene.beats[0]?.cueText).toBe("분노");
    expect(scene.beats[0]?.dialogueText).toBe("여기서 끝내자!");
    expect(scene.beats[1]?.speakerId).toBe("민재");
    expect(scene.beats[1]?.listenerId).toBe("서연");
    expect(scene.beats[1]?.cueText).toBe("속삭임");
  });

  it("turns Korean stage directions into kinetic action-impact beats attributed to the acting character", () => {
    const scene = parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT);
    const stageBeat = scene.beats[2];

    expect(stageBeat?.kind).toBe("stage-direction");
    expect(stageBeat?.speakerId).toBe("서연");
    expect(stageBeat?.emotionTag).toBe("action-impact");
    expect(stageBeat?.actionIntensity).toBeGreaterThanOrEqual(0.85);
    expect(stageBeat?.stageDirectionText).toBe("서연이 검을 뽑아 든다");
  });

  it("extracts explicit [카메라: 축 전환] flags both on standalone lines and inline", () => {
    const script = [
      "[장면: 골목 밤]",
      '서연 (차분): "여기서 기다렸어."',
      "[카메라: 축 전환]",
      '민재 (경악): "설마 네가 함정을 판 거야?!"',
      '서연 (냉소) [카메라: 축 전환]: "이제야 알았나?"',
    ].join("\n");
    const scene = parseKoreanWebtoonScript(script);

    expect(scene.beats).toHaveLength(3);
    expect(scene.beats[0]?.intentionalAxisReset).toBe(false);
    expect(scene.beats[1]?.intentionalAxisReset).toBe(true);
    expect(scene.beats[2]?.intentionalAxisReset).toBe(true);
  });

  it("classifies all 6 emotion tags and 3 power dynamics accurately", () => {
    const script = [
      "[장면: 아틀리에]",
      '지수 (차분): "자료는 책상 위에 정리해 두었어."',
      '서연 (분노, 내려다보며): "당장 비켜!"',
      '민재 (경악, 떨리며): "설마 그게 진짜 정체였어?!"',
      "(지문: 서연이 검을 뽑아 돌진한다)",
      '지수 (다정하게 미소): "괜찮아, 이제 안심해도 돼."',
      '민재 (쓸쓸히 눈물): "결국 혼자 남겨졌네..."',
    ].join("\n");
    const scene = parseKoreanWebtoonScript(script);

    expect(scene.beats.map((b) => b.emotionTag)).toEqual([
      "calm-dialogue",
      "tension",
      "shock-reveal",
      "action-impact",
      "intimate-warmth",
      "melancholy-isolation",
    ]);
    expect(scene.beats[0]?.powerDynamics).toBe("neutral");
    expect(scene.beats[1]?.powerDynamics).toBe("speaker-dominant");
    expect(scene.beats[2]?.powerDynamics).toBe("speaker-vulnerable");
  });

  it("handles empty scripts and single-speaker monologues safely", () => {
    const empty = parseKoreanWebtoonScript("   \n\n  ");
    expect(empty.beats).toHaveLength(0);
    expect(empty.sceneTimeOfDay).toBe("daylight");

    const mono = parseKoreanWebtoonScript('[장면: 비 오는 방]\n서연 (쓸쓸히): "아무도 돌아오지 않는다..."');
    expect(mono.beats).toHaveLength(1);
    expect(mono.beats[0]?.speakerId).toBe("서연");
    expect(mono.beats[0]?.listenerId).toBeNull();
  });

  it("attaches stage direction text onto the next dialogue beat when includeStageDirectionsAsBeats is false", () => {
    const scene = parseKoreanWebtoonScript(
      '[장면: 옥상 야경]\n(지문: 서연이 검을 뽑아 든다)\n서연 (분노): "시작하자!"',
      { includeStageDirectionsAsBeats: false },
    );
    expect(scene.beats).toHaveLength(1);
    expect(scene.beats[0]?.stageDirectionText).toBe("서연이 검을 뽑아 든다");
    expect(scene.beats[0]?.dialogueText).toBe("시작하자!");
  });
});

describe("Wave 96 — Cinematographic Shot Grammar Recommender", () => {
  const makeBeat = (overrides: Partial<ScriptBeat>): ScriptBeat => ({
    beatId: "test-beat-01",
    beatIndex: 0,
    kind: "dialogue",
    speakerId: "서연",
    listenerId: "민재",
    dialogueText: "대사",
    cueText: "",
    stageDirectionText: "",
    emotionTag: "calm-dialogue",
    powerDynamics: "neutral",
    actionIntensity: 0.2,
    intentionalAxisReset: false,
    explicitShotScaleHint: null,
    lineNumber: 1,
    ...overrides,
  });

  it("maps dominant speakers to low-angle, vulnerable speakers to high-angle, and neutral to eye-level", () => {
    const dominant = recommendShotGrammarForBeat(
      makeBeat({ powerDynamics: "speaker-dominant", emotionTag: "tension", actionIntensity: 0.75 }), 1, 5,
    );
    const vulnerable = recommendShotGrammarForBeat(
      makeBeat({ powerDynamics: "speaker-vulnerable", emotionTag: "tension", actionIntensity: 0.75 }), 2, 5,
    );
    const neutral = recommendShotGrammarForBeat(makeBeat({ powerDynamics: "neutral" }), 1, 5);

    expect(dominant.verticalPitchBias).toBe("low-angle");
    expect(dominant.verticalPitchOffsetDeg).toBeGreaterThan(0);
    expect(dominant.cameraHeightOffsetMeters).toBeLessThan(0);
    expect(vulnerable.verticalPitchBias).toBe("high-angle");
    expect(vulnerable.verticalPitchOffsetDeg).toBeLessThan(0);
    expect(vulnerable.cameraHeightOffsetMeters).toBeGreaterThan(0);
    expect(neutral.verticalPitchBias).toBe("eye-level");
    expect(neutral.verticalPitchOffsetDeg).toBe(0);
  });

  it("assigns wide lenses (<= 35mm) to action-impact and telephoto lenses (>= 75mm) to intimate/shock close-ups", () => {
    const action = recommendShotGrammarForBeat(makeBeat({ emotionTag: "action-impact", actionIntensity: 0.94 }), 2, 6);
    const intimate = recommendShotGrammarForBeat(makeBeat({ emotionTag: "intimate-warmth", actionIntensity: 0.3 }), 3, 6);
    const shock = recommendShotGrammarForBeat(makeBeat({ emotionTag: "shock-reveal", actionIntensity: 0.88 }), 4, 6);

    expect(action.focalLengthMm).toBeLessThanOrEqual(35);
    expect(action.focalLengthMm).toBeGreaterThanOrEqual(24);
    expect(intimate.focalLengthMm).toBeGreaterThanOrEqual(75);
    expect(intimate.focalLengthMm).toBeLessThanOrEqual(135);
    expect(shock.focalLengthMm).toBeGreaterThanOrEqual(75);
    expect(shock.focalLengthMm).toBeLessThanOrEqual(135);
  });

  it("enforces zero Dutch roll for calm/intimate beats and bounded non-zero roll (<= 14°) for shock/action", () => {
    const calm = recommendShotGrammarForBeat(makeBeat({ emotionTag: "calm-dialogue" }), 1, 6);
    const intimate = recommendShotGrammarForBeat(makeBeat({ emotionTag: "intimate-warmth" }), 2, 6);
    const shock = recommendShotGrammarForBeat(makeBeat({ emotionTag: "shock-reveal", actionIntensity: 0.85 }), 3, 6);
    const action = recommendShotGrammarForBeat(makeBeat({ emotionTag: "action-impact", actionIntensity: 0.95 }), 4, 6);

    expect(calm.dutchRollDeg).toBe(0);
    expect(intimate.dutchRollDeg).toBe(0);
    expect(Math.abs(shock.dutchRollDeg)).toBeGreaterThan(0);
    expect(Math.abs(shock.dutchRollDeg)).toBeLessThanOrEqual(14);
    expect(Math.abs(action.dutchRollDeg)).toBeGreaterThan(0);
    expect(Math.abs(action.dutchRollDeg)).toBeLessThanOrEqual(14);
  });

  it("opens calm multi-beat scenes with an establishing wide shot before tightening to OTS/MCU", () => {
    expect(recommendShotGrammarForBeat(makeBeat({ emotionTag: "calm-dialogue" }), 0, 4).shotScale).toBe("wide");
    expect(recommendShotGrammarForBeat(makeBeat({ emotionTag: "calm-dialogue" }), 1, 4).shotScale).toBe("over-the-shoulder");
    expect(recommendShotGrammarForBeat(makeBeat({ emotionTag: "calm-dialogue" }), 2, 4).shotScale).toBe("medium-closeup");
  });

  it("honors explicit shot scale hints and bounds lead-room screen offset", () => {
    const explicit = recommendShotGrammarForBeat(makeBeat({ explicitShotScaleHint: "extreme-closeup" }), 0, 4);
    expect(explicit.shotScale).toBe("extreme-closeup");
    expect(explicit.focalLengthMm).toBeGreaterThanOrEqual(90);
    expect(Math.abs(explicit.leadRoomScreenOffset)).toBeLessThanOrEqual(0.24);
  });
});

describe("Wave 96 — 180° Line-of-Action & 3D Camera Blocking Solver", () => {
  it("keeps all 6 shots of a dramatic dialogue on the locked 180° half-plane with consistent left-to-right order and 0 audit violations", () => {
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT), ROOFTOP_ACTORS);
    const audit = auditCameraBlockingContinuity(plan, ROOFTOP_ACTORS);

    expect(plan.shots).toHaveLength(6);
    expect(plan.axis.lockedSideSign).toBe(1);
    expect(audit.passed).toBe(true);
    expect(audit.violationCount).toBe(0);
    for (const shot of plan.shots) {
      expect(shot.camera.cameraHalfPlaneSign).toBe(1);
      expect(shot.camera.signedDistanceToAxisMeters).toBeGreaterThan(0.2);
      expect(shot.screenOrderLeftToRight).toEqual(["서연", "민재"]);
    }
  });

  it("supports preferredSideSign = -1 cleanly reversing locked half-plane and screen order across all cuts", () => {
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT), ROOFTOP_ACTORS, {
      preferredSideSign: -1,
    });
    const audit = auditCameraBlockingContinuity(plan, ROOFTOP_ACTORS);

    expect(plan.axis.lockedSideSign).toBe(-1);
    expect(audit.passed).toBe(true);
    for (const shot of plan.shots) {
      expect(shot.camera.cameraHalfPlaneSign).toBe(-1);
      expect(shot.screenOrderLeftToRight).toEqual(["민재", "서연"]);
    }
  });

  it("gives left-side and right-side speakers positive lead room ahead of their gaze direction", () => {
    const script = [
      "[장면: 카페 오후]",
      '서연 (차분): "네 생각은 어때?"',
      '민재 (차분): "조금 더 지켜보자."',
      '서연 (다정하게): "그래, 천천히 결정하자."',
    ].join("\n");
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(script), ROOFTOP_ACTORS);

    const minjaeShot = plan.shots[1];
    const seoyeonShot = plan.shots[2];
    const minjaeProj = minjaeShot?.actorProjections.find((p) => p.actorId === "민재");
    const seoyeonProj = seoyeonShot?.actorProjections.find((p) => p.actorId === "서연");

    expect(minjaeShot?.leadRoomMarginNormalized).toBeGreaterThanOrEqual(0.5);
    expect(seoyeonShot?.leadRoomMarginNormalized).toBeGreaterThanOrEqual(0.5);
    expect(minjaeProj?.ndcX ?? 0).toBeGreaterThanOrEqual(-0.02);
    expect(seoyeonProj?.ndcX ?? 0).toBeLessThanOrEqual(0.02);
  });

  it("permits intentional [카메라: 축 전환] flips and locks subsequent cuts on the new half-plane cleanly", () => {
    const script = [
      "[장면: 옥상 야경]",
      '서연 (분노): "더는 못 참아!"',
      '민재 (긴장): "진정해, 서연아."',
      "[카메라: 축 전환]",
      '서연 (경악): "방금 뭐라고 했어?!"',
      '민재 (차분): "네 뒤를 봐."',
    ].join("\n");
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(script), ROOFTOP_ACTORS);
    const audit = auditCameraBlockingContinuity(plan, ROOFTOP_ACTORS);

    expect(audit.passed).toBe(true);
    expect(audit.violationCount).toBe(0);
    expect(audit.intentionalAxisResetCount).toBe(1);
    expect(plan.shots.map((s) => s.camera.cameraHalfPlaneSign)).toEqual([1, 1, -1, -1]);
    expect(plan.shots[0]?.screenOrderLeftToRight).toEqual(["서연", "민재"]);
    expect(plan.shots[2]?.screenOrderLeftToRight).toEqual(["민재", "서연"]);
  });

  it("avoids camera-actor personal cylinder collisions even in tight 1.3m close-quarters staging", () => {
    const tightActors: readonly BlockingActorSpec[] = [
      { actorId: "서연", position: { x: -0.65, y: 0, z: 0 }, personalRadiusMeters: 0.35 },
      { actorId: "민재", position: { x: 0.65, y: 0, z: 0 }, personalRadiusMeters: 0.35 },
    ];
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT), tightActors);
    const audit = auditCameraBlockingContinuity(plan, tightActors);

    expect(audit.passed).toBe(true);
    expect(audit.minCameraActorDistanceMeters).toBeGreaterThanOrEqual(0.35);
  });

  it("produces finite 3D coordinates and accurate 36mm-sensor horizontal FOV for 1-actor and 3-actor scenes", () => {
    const soloPlan = solveCameraBlockingPlan(
      parseKoreanWebtoonScript('[장면: 서재]\n서연 (쓸쓸히): "혼자 남았어."'),
      [ROOFTOP_ACTORS[0]!],
    );
    const soloCam = soloPlan.shots[0]!.camera;
    expect(Number.isFinite(soloCam.position.x)).toBe(true);
    const expectedFov = (2 * Math.atan(36 / (2 * soloCam.focalLengthMm)) * 180) / Math.PI;
    expect(Math.abs(soloCam.horizontalFovDeg - expectedFov)).toBeLessThan(0.05);

    const trioActors: readonly BlockingActorSpec[] = [
      ...ROOFTOP_ACTORS,
      { actorId: "지수", position: { x: 0, y: 0, z: -2.0 } },
    ];
    const trioPlan = solveCameraBlockingPlan(
      parseKoreanWebtoonScript('[장면: 공원 낮]\n서연 (차분): "지수야."\n지수 (미소): "안녕."\n민재 (차분): "가자."'),
      trioActors,
    );
    expect(auditCameraBlockingContinuity(trioPlan, trioActors).passed).toBe(true);
    expect(trioPlan.shots[0]?.actorProjections).toHaveLength(3);
  });
});

describe("Wave 96 — 30° Cut Rule & Continuity Auditor", () => {
  it("enforces >= 30° angular separation (or >= 2 shot-scale jump) across consecutive same-subject beats", () => {
    const script = [
      "[장면: 옥상 야경]",
      '서연 (긴장): "한 발짝도 움직이지 마."',
      '서연 (긴장): "네가 숨긴 열쇠를 내놔."',
      '서연 (분노): "마지막 경고야!"',
    ].join("\n");
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(script), ROOFTOP_ACTORS);
    const audit = auditCameraBlockingContinuity(plan, ROOFTOP_ACTORS);

    expect(audit.passed).toBe(true);
    expect(audit.violationCount).toBe(0);
    if (audit.minAngularSeparationDegOnSameSubject !== null) {
      expect(audit.minAngularSeparationDegOnSameSubject).toBeGreaterThanOrEqual(30);
    }
  });

  it("flags a hand-crafted 12° same-subject same-scale jump cut with jump-cut-under-30-deg", () => {
    const plan = solveCameraBlockingPlan(
      parseKoreanWebtoonScript('[장면: 카페]\n서연 (긴장): "왜 대답을 안 해?"\n서연 (긴장): "솔직히 말해."'),
      ROOFTOP_ACTORS,
    );
    const s0 = plan.shots[0]!;
    const s1 = plan.shots[1]!;
    const subjectPos = ROOFTOP_ACTORS[0]!.position;
    const dx = s0.camera.position.x - subjectPos.x;
    const dz = s0.camera.position.z - subjectPos.z;
    const rad12 = (12 * Math.PI) / 180;

    const mutatedPlan: CameraBlockingPlan = {
      ...plan,
      shots: [
        s0,
        {
          ...s1,
          camera: {
            ...s1.camera,
            position: {
              x: subjectPos.x + dx * Math.cos(rad12) - dz * Math.sin(rad12),
              y: s0.camera.position.y,
              z: subjectPos.z + dx * Math.sin(rad12) + dz * Math.cos(rad12),
            },
            shotScale: s0.camera.shotScale,
            shotScaleRank: s0.camera.shotScaleRank,
          },
        },
      ],
    };

    const audit = auditCameraBlockingContinuity(mutatedPlan, ROOFTOP_ACTORS);
    expect(audit.passed).toBe(false);
    expect(audit.violations.some((v) => v.code === "jump-cut-under-30-deg")).toBe(true);
  });

  it("flags accidental 180° crossing with axis-180-violation and clears it when intentionalAxisReset is true", () => {
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT), ROOFTOP_ACTORS);
    const s2 = plan.shots[2]!;
    const flippedPos = { x: s2.camera.position.x, y: s2.camera.position.y, z: -Math.abs(s2.camera.position.z) - 0.5 };

    const accidentalAudit = auditCameraBlockingContinuity(
      {
        ...plan,
        shots: plan.shots.map((shot, idx) =>
          idx === 2 ? { ...shot, intentionalAxisReset: false, camera: { ...shot.camera, position: flippedPos } } : shot,
        ),
      },
      ROOFTOP_ACTORS,
    );
    expect(accidentalAudit.passed).toBe(false);
    expect(accidentalAudit.violations.some((v) => v.code === "axis-180-violation")).toBe(true);

    const intentionalAudit = auditCameraBlockingContinuity(
      {
        ...plan,
        shots: plan.shots.map((shot, idx) =>
          idx >= 2
            ? {
                ...shot,
                intentionalAxisReset: idx === 2,
                camera: {
                  ...shot.camera,
                  position: { x: shot.camera.position.x, y: shot.camera.position.y, z: -Math.abs(shot.camera.position.z) - 0.5 },
                },
              }
            : shot,
        ),
      },
      ROOFTOP_ACTORS,
    );
    expect(intentionalAudit.violations.some((v) => v.code === "axis-180-violation")).toBe(false);
  });

  it("flags camera placement inside an actor personal cylinder (< 0.35m) with camera-actor-collision", () => {
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript('[장면: 옥상 낮]\n서연 (차분): "안녕."'), ROOFTOP_ACTORS);
    const s0 = plan.shots[0]!;
    const collidingAudit = auditCameraBlockingContinuity(
      {
        ...plan,
        shots: [
          {
            ...s0,
            camera: {
              ...s0.camera,
              position: { x: ROOFTOP_ACTORS[0]!.position.x + 0.12, y: 1.6, z: ROOFTOP_ACTORS[0]!.position.z + 0.15 },
            },
          },
        ],
      },
      ROOFTOP_ACTORS,
    );
    expect(collidingAudit.passed).toBe(false);
    expect(collidingAudit.violations.some((v) => v.code === "camera-actor-collision")).toBe(true);
  });

  it("flags extreme Dutch roll (> 25°) with unreadable-extreme-roll", () => {
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript('[장면: 옥상 야경]\n서연 (경악): "말도 안 돼?!"'), ROOFTOP_ACTORS);
    const s0 = plan.shots[0]!;
    const audit = auditCameraBlockingContinuity(
      { ...plan, shots: [{ ...s0, camera: { ...s0.camera, rollDeg: 32 } }] },
      ROOFTOP_ACTORS,
    );
    expect(audit.passed).toBe(false);
    expect(audit.violations.some((v) => v.code === "unreadable-extreme-roll")).toBe(true);
    expect(audit.maxAbsRollDeg).toBe(32);
  });
});

describe("Wave 96 — 3-Point Lighting Physics Solver", () => {
  const samplePlan = solveCameraBlockingPlan(parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT), ROOFTOP_ACTORS);
  const sampleCam = samplePlan.shots[0]!.camera;
  const sampleSubjectPos = ROOFTOP_ACTORS[0]!.position;

  it("returns exact unit-length 3D direction vectors for key, fill, and rim lights", () => {
    for (const shot of samplePlan.shots) {
      expect(vec3Length(shot.lighting.keyLight.direction)).toBeCloseTo(1, 3);
      expect(vec3Length(shot.lighting.fillLight.direction)).toBeCloseTo(1, 3);
      expect(vec3Length(shot.lighting.rimLight.direction)).toBeCloseTo(1, 3);
      expect(shot.lighting.keyLight.direction.y).toBeGreaterThan(0);
      expect(shot.lighting.rimLight.direction.y).toBeGreaterThan(0);
    }
  });

  it("produces high contrast (>= 5:1) for tension/night-neon and soft contrast (<= 3:1) for calm daylight and intimate warmth", () => {
    const tensionBeat = samplePlan.shots[0]!.beat;
    const calmBeat: ScriptBeat = { ...tensionBeat, emotionTag: "calm-dialogue", actionIntensity: 0.2 };
    const intimateBeat: ScriptBeat = { ...tensionBeat, emotionTag: "intimate-warmth", actionIntensity: 0.25 };

    const nightTension = solveThreePointLightingForBeat(tensionBeat, "night-neon", sampleCam, sampleSubjectPos);
    const daylightCalm = solveThreePointLightingForBeat(calmBeat, "daylight", sampleCam, sampleSubjectPos);
    const cafeIntimate = solveThreePointLightingForBeat(intimateBeat, "interior-warm", sampleCam, sampleSubjectPos);

    expect(nightTension.keyToFillRatio).toBeGreaterThanOrEqual(5.0);
    expect(daylightCalm.keyToFillRatio).toBeLessThanOrEqual(3.0);
    expect(cafeIntimate.keyToFillRatio).toBeLessThanOrEqual(3.0);
    expect(nightTension.keyToFillRatio).toBeGreaterThan(daylightCalm.keyToFillRatio);
  });

  it("keeps all Kelvin color temperatures within [2700K, 9000K] and distinguishes sunset vs night-neon hues", () => {
    const beat = samplePlan.shots[0]!.beat;
    const sunsetRig = solveThreePointLightingForBeat(beat, "sunset", sampleCam, sampleSubjectPos);
    const nightRig = solveThreePointLightingForBeat(beat, "night-neon", sampleCam, sampleSubjectPos);
    const daylightRig = solveThreePointLightingForBeat(beat, "daylight", sampleCam, sampleSubjectPos);

    for (const rig of [sunsetRig, nightRig, daylightRig]) {
      for (const light of [rig.keyLight, rig.fillLight, rig.rimLight]) {
        expect(light.colorTemperatureK).toBeGreaterThanOrEqual(2700);
        expect(light.colorTemperatureK).toBeLessThanOrEqual(9000);
      }
    }
    expect(sunsetRig.keyLight.colorTemperatureK).toBeLessThan(4000);
    expect(nightRig.keyLight.colorTemperatureK).toBeGreaterThan(6500);
  });

  it("gives hard crisp shadows for night-neon tension and softer shadows for intimate warm scenes", () => {
    const tensionBeat = samplePlan.shots[0]!.beat;
    const intimateBeat: ScriptBeat = { ...tensionBeat, emotionTag: "intimate-warmth", actionIntensity: 0.22 };

    expect(solveThreePointLightingForBeat(tensionBeat, "night-neon", sampleCam, sampleSubjectPos).shadowSoftness).toBeLessThan(0.35);
    expect(solveThreePointLightingForBeat(intimateBeat, "interior-warm", sampleCam, sampleSubjectPos).shadowSoftness).toBeGreaterThan(0.65);
  });
});

describe("Wave 96 — Blocking Floorplan SVG & Korean Shot Sheet", () => {
  it("renders a valid print-safe top-down floorplan SVG with 0 NaN/Infinity, camera frustums, 180° axis, and lighting arrows", () => {
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT), ROOFTOP_ACTORS);
    const svg = renderBlockingFloorplanSvg(plan);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toContain('id="line-of-action-180"');
    expect(svg).toContain('id="safe-180-halfplane"');
    expect(svg).toContain("C1");
    expect(svg).toContain("C6");
    expect(svg).toContain("Key ");
    expect(svg).toContain("Fill ");
    expect(svg).toContain("Rim ");
    expect(svg).toContain("서연");
    expect(svg).toContain("민재");
    expect(svg).toContain("oklch(");
  });

  it("strictly XML-escapes unsafe characters in scene titles and actor labels", () => {
    const scene = parseKoreanWebtoonScript('[장면: <옥상> & "네온" \'야경\']\n서연: "테스트"');
    const actors: readonly BlockingActorSpec[] = [
      { actorId: "서연", displayNameKo: '서연<검객>&"1"', position: { x: -1, y: 0, z: 0 } },
      { actorId: "민재", displayNameKo: "민재", position: { x: 1, y: 0, z: 0 } },
    ];
    const svg = renderBlockingFloorplanSvg(solveCameraBlockingPlan(scene, actors));

    expect(svg).not.toContain("<옥상>");
    expect(svg).not.toContain("<검객>");
    expect(svg).toContain("&lt;옥상&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;검객&gt;");
    expect(svg).not.toContain("NaN");
  });

  it("generates a natural Korean blocking sheet summarizing camera plan, audit status, lighting contrast, and warnings without translationese", () => {
    const plan = solveCameraBlockingPlan(parseKoreanWebtoonScript(SIX_CUT_ROOFTOP_SCRIPT), ROOFTOP_ACTORS);
    const cleanSheet = summarizeCameraBlockingSheetKo(plan, auditCameraBlockingContinuity(plan, ROOFTOP_ACTORS));

    expect(cleanSheet).toContain("# 카메라·조명 블록킹 시트 — 옥상 야경");
    expect(cleanSheet).toContain("연속성 감사 통과");
    expect(cleanSheet).toContain("C1");
    expect(cleanSheet).toContain("C6");
    expect(cleanSheet).toContain("명암비");
    expect(cleanSheet).not.toContain("하는 것을 가능하게 합니다");
    expect(cleanSheet).not.toContain("직관적인 경험을 제공합니다");
    expect(cleanSheet).not.toContain("원활한 워크플로우를 보장합니다");

    const brokenPlan: CameraBlockingPlan = {
      ...plan,
      shots: plan.shots.map((shot, idx) => (idx === 0 ? { ...shot, camera: { ...shot.camera, rollDeg: 35 } } : shot)),
    };
    const warningSheet = summarizeCameraBlockingSheetKo(brokenPlan, auditCameraBlockingContinuity(brokenPlan, ROOFTOP_ACTORS));
    expect(warningSheet).toContain("### 수정이 필요한 경고");
    expect(warningSheet).toContain("unreadable-extreme-roll");
  });
});
