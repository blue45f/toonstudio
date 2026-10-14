import { describe, expect, it } from "vitest";

import {
  STUDIO_MANNEQUIN_ARCHETYPE_PRESETS,
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_FINGER_NAMES,
  STUDIO_MANNEQUIN_JOINT_IDS,
  STUDIO_MANNEQUIN_JOINT_LIMITS,
  STUDIO_MANNEQUIN_MATERIAL_STYLES,
  STUDIO_MANNEQUIN_PARAM_RANGES,
  buildStudioMannequinSpec,
  canonicalizeStudioMannequinAngle,
  clampStudioMannequinBodyParams,
  clampStudioMannequinFingerPose,
  isStudioMannequinArchetypePresetId,
  resolveStudioMannequinArchetypeParams,
  studioMannequinFingerPoseFromCurls,
  clampStudioMannequinJointRotation,
  getStudioMannequinJointLimit,
  mirrorStudioMannequinJointLimit,
  studioMannequinRestJointPosition,
  studioMannequinRestStature,
  type StudioMannequinBodyParams,
} from "./studio-mannequin-model";

const STATURE_EPSILON = 1e-9;

function params(overrides: Partial<StudioMannequinBodyParams> = {}): StudioMannequinBodyParams {
  return { ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS, ...overrides };
}

describe("studio-mannequin-model 비례 수학", () => {
  it("두신 단위는 신장/두신 비율이고 머리 프리미티브 길이와 일치한다", () => {
    const spec = buildStudioMannequinSpec(params({ heightCm: 180, headCount: 6 }));
    expect(spec.headUnit).toBeCloseTo(1.8 / 6, 12);

    const head = spec.primitives.find(
      (primitive) => primitive.kind === "sphere" && primitive.jointId === "head",
    );
    expect(head).toBeDefined();
    if (head?.kind === "sphere") {
      // 정수리~턱 길이 = 지름(스케일 Y 1) = 두신 단위.
      expect(head.radius * 2).toBeCloseTo(spec.headUnit, 12);
    }
  });

  it("rest 자세 정수리 높이는 파라미터와 무관하게 신장과 일치한다(불변식)", () => {
    const cases: StudioMannequinBodyParams[] = [
      params(),
      params({ headCount: 4 }),
      params({ headCount: 9, heightCm: 200 }),
      params({ legLength: 0.8 }),
      params({ legLength: 1.2, armLength: 1.2 }),
      params({ build: 0 }),
      params({ build: 3, shoulderWidth: 1.3, pelvisWidth: 1.3 }),
      ...Object.values(STUDIO_MANNEQUIN_BODY_PRESETS).map((preset) => preset.params),
    ];
    for (const bodyParams of cases) {
      const spec = buildStudioMannequinSpec(bodyParams);
      expect(Math.abs(studioMannequinRestStature(spec) - spec.heightM)).toBeLessThan(
        STATURE_EPSILON,
      );
    }
  });

  it("두신 비율이 커지면 같은 신장에서 두신 단위는 줄고 다리 비중은 커진다", () => {
    const low = buildStudioMannequinSpec(params({ headCount: 5 }));
    const high = buildStudioMannequinSpec(params({ headCount: 9 }));
    expect(high.headUnit).toBeLessThan(low.headUnit);

    const lowHip = studioMannequinRestJointPosition(low, "pelvis")[1] / low.heightM;
    const highHip = studioMannequinRestJointPosition(high, "pelvis")[1] / high.heightM;
    expect(highHip).toBeGreaterThan(lowHip);
  });

  it("legLength 는 신장을 바꾸지 않고 다리/몸통 비율만 재분배한다", () => {
    const short = buildStudioMannequinSpec(params({ legLength: 0.8 }));
    const long = buildStudioMannequinSpec(params({ legLength: 1.2 }));
    expect(studioMannequinRestJointPosition(long, "pelvis")[1]).toBeGreaterThan(
      studioMannequinRestJointPosition(short, "pelvis")[1],
    );
    expect(studioMannequinRestStature(short)).toBeCloseTo(short.heightM, 9);
    expect(studioMannequinRestStature(long)).toBeCloseTo(long.heightM, 9);
  });

  it("armLength 는 체인 본 길이를 비례 확장한다", () => {
    const base = buildStudioMannequinSpec(params({ armLength: 1 }));
    const stretched = buildStudioMannequinSpec(params({ armLength: 1.2 }));
    expect(stretched.chains.leftArm.upperLength).toBeCloseTo(
      base.chains.leftArm.upperLength * 1.2,
      12,
    );
    expect(stretched.chains.leftArm.lowerLength).toBeCloseTo(
      base.chains.leftArm.lowerLength * 1.2,
      12,
    );
  });

  it("해부학 세부 파라미터가 신장을 바꾸지 않고 각 실루엣 축에 독립적으로 반영된다", () => {
    const base = buildStudioMannequinSpec(params());
    const tuned = buildStudioMannequinSpec(params({
      torsoDepth: 1.3, waistWidth: 1.2, limbThickness: 1.25,
      handScale: 1.2, footScale: 1.2, neckThickness: 1.2,
    }));
    expect(studioMannequinRestStature(tuned)).toBeCloseTo(base.heightM, 12);

    const sphere = (spec: ReturnType<typeof buildStudioMannequinSpec>, jointId: string) =>
      spec.primitives.find((p) => p.kind === "sphere" && p.jointId === jointId && p.center[1] !== 0);
    const capsule = (spec: ReturnType<typeof buildStudioMannequinSpec>, jointId: string) =>
      spec.primitives.find((p) => p.kind === "capsule" && p.jointId === jointId);
    const baseChest = sphere(base, "chest");
    const tunedChest = sphere(tuned, "chest");
    expect(baseChest?.kind).toBe("sphere");
    expect(tunedChest?.kind).toBe("sphere");
    if (baseChest?.kind === "sphere" && tunedChest?.kind === "sphere") {
      expect(tunedChest.scale?.[2]).toBeGreaterThan(baseChest.scale?.[2] ?? 0);
    }
    const baseSpine = capsule(base, "spine");
    const tunedSpine = capsule(tuned, "spine");
    if (baseSpine?.kind === "capsule" && tunedSpine?.kind === "capsule") {
      expect(tunedSpine.radius).toBeGreaterThan(baseSpine.radius);
    }
    const baseArm = capsule(base, "leftUpperArm");
    const tunedArm = capsule(tuned, "leftUpperArm");
    if (baseArm?.kind === "capsule" && tunedArm?.kind === "capsule") {
      expect(tunedArm.radius).toBeGreaterThan(baseArm.radius);
    }
    const baseDigits = base.primitives.filter(
      (primitive) => primitive.kind === "capsule" && primitive.jointId === "leftHand",
    );
    const tunedDigits = tuned.primitives.filter(
      (primitive) => primitive.kind === "capsule" && primitive.jointId === "leftHand",
    );
    const baseDigit = baseDigits[0];
    const tunedDigit = tunedDigits[0];
    if (baseDigit?.kind !== "capsule" || tunedDigit?.kind !== "capsule") {
      throw new Error("left-hand digit primitives are missing");
    }
    expect(Math.abs(tunedDigit.to[1])).toBeGreaterThan(Math.abs(baseDigit.to[1]));
    const baseFoot = sphere(base, "leftFoot");
    const tunedFoot = sphere(tuned, "leftFoot");
    if (baseFoot?.kind === "sphere" && tunedFoot?.kind === "sphere") {
      expect(tunedFoot.radius).toBeGreaterThan(baseFoot.radius);
    }
    const baseNeck = capsule(base, "neck");
    const tunedNeck = capsule(tuned, "neck");
    if (baseNeck?.kind === "capsule" && tunedNeck?.kind === "capsule") {
      expect(tunedNeck.radius).toBeGreaterThan(baseNeck.radius);
    }
  });

  it("체인 길이는 관절 오프셋과 정합한다", () => {
    const spec = buildStudioMannequinSpec(params());
    const lowerArm = spec.joints.find((joint) => joint.id === "leftLowerArm");
    const hand = spec.joints.find((joint) => joint.id === "leftHand");
    expect(Math.abs(lowerArm!.offset[1])).toBeCloseTo(spec.chains.leftArm.upperLength, 12);
    expect(Math.abs(hand!.offset[1])).toBeCloseTo(spec.chains.leftArm.lowerLength, 12);

    const lowerLeg = spec.joints.find((joint) => joint.id === "leftLowerLeg");
    const foot = spec.joints.find((joint) => joint.id === "leftFoot");
    expect(Math.abs(lowerLeg!.offset[1])).toBeCloseTo(spec.chains.leftLeg.upperLength, 12);
    expect(Math.abs(foot!.offset[1])).toBeCloseTo(spec.chains.leftLeg.lowerLength, 12);
  });

  it("남성 프리셋 어깨는 여성 프리셋보다 넓다", () => {
    const male = buildStudioMannequinSpec(STUDIO_MANNEQUIN_BODY_PRESETS.male.params);
    const female = buildStudioMannequinSpec(STUDIO_MANNEQUIN_BODY_PRESETS.female.params);
    const shoulderX = (spec: ReturnType<typeof buildStudioMannequinSpec>) =>
      studioMannequinRestJointPosition(spec, "leftUpperArm")[0] / spec.heightM;
    expect(shoulderX(male)).toBeGreaterThan(shoulderX(female));
  });

  it("모든 체형 프리셋은 클램프 왕복에서 조용히 변형되지 않는다", () => {
    for (const [presetId, preset] of Object.entries(STUDIO_MANNEQUIN_BODY_PRESETS)) {
      expect(clampStudioMannequinBodyParams(preset.params), presetId).toEqual(preset.params);
    }
    expect(buildStudioMannequinSpec(STUDIO_MANNEQUIN_BODY_PRESETS.chibi3.params).params.headCount)
      .toBe(3.2);
  });

  it("고령·단단한 체형·무용수·판타지 거인 프리셋을 서로 다른 실루엣으로 제공한다", () => {
    const presets = STUDIO_MANNEQUIN_BODY_PRESETS;
    expect(Object.keys(presets)).toEqual(expect.arrayContaining([
      "senior",
      "stocky",
      "dancer",
      "fantasyGiant",
    ]));
    expect(presets.senior.params.legLength).toBeLessThan(presets.dancer.params.legLength);
    expect(presets.stocky.params.shoulderWidth).toBeGreaterThan(presets.dancer.params.shoulderWidth);
    expect(presets.fantasyGiant.params.heightCm).toBe(200);

    const signatures = ["senior", "stocky", "dancer", "fantasyGiant"].map((id) => {
      const preset = presets[id as keyof typeof presets];
      const spec = buildStudioMannequinSpec(preset.params);
      return JSON.stringify({
        params: spec.params,
        pelvis: studioMannequinRestJointPosition(spec, "pelvis"),
        shoulder: studioMannequinRestJointPosition(spec, "leftUpperArm"),
      });
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("어깨·팔꿈치·손목·고관절·무릎·발목에 데생용 관절구를 만든다", () => {
    const spec = buildStudioMannequinSpec(params());
    const jointBallIds = [
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightUpperArm",
      "rightLowerArm",
      "rightHand",
      "leftUpperLeg",
      "leftLowerLeg",
      "leftFoot",
      "rightUpperLeg",
      "rightLowerLeg",
      "rightFoot",
    ] as const;
    for (const jointId of jointBallIds) {
      expect(
        spec.primitives.some((primitive) =>
          primitive.kind === "sphere"
          && primitive.jointId === jointId
          && primitive.center.every((value) => value === 0)
          && primitive.radius > 0),
        jointId,
      ).toBe(true);
    }
  });

  it("손과 발은 방향을 읽기 쉬운 비균등 타원체이고 양발 바닥은 y=0이다", () => {
    const spec = buildStudioMannequinSpec(params());
    for (const handId of ["leftHand", "rightHand"] as const) {
      const palm = spec.primitives.find((primitive) =>
        primitive.kind === "sphere"
        && primitive.jointId === handId
        && primitive.center[1] < 0);
      expect(palm?.kind).toBe("sphere");
      if (palm?.kind === "sphere") {
        expect(palm.scale?.[0]).not.toBe(palm.scale?.[1]);
        expect(palm.scale?.[2]).not.toBe(palm.scale?.[1]);
      }
    }

    for (const footId of ["leftFoot", "rightFoot"] as const) {
      const foot = spec.primitives.find((primitive) =>
        primitive.kind === "sphere"
        && primitive.jointId === footId
        && primitive.center[1] < 0);
      expect(foot?.kind).toBe("sphere");
      if (foot?.kind !== "sphere" || !foot.scale) continue;
      const footJointY = studioMannequinRestJointPosition(spec, footId)[1];
      expect(footJointY + foot.center[1] - foot.radius * foot.scale[1]).toBeCloseTo(0, 12);
    }
  });

  it("각 손은 네 손가락과 엄지를 3마디로 만들고 좌우 디테일이 X축 미러다", () => {
    const spec = buildStudioMannequinSpec(params());
    const digits = (jointId: "leftHand" | "rightHand") => spec.primitives.filter(
      (primitive) => primitive.kind === "capsule" && primitive.jointId === jointId,
    );
    const digitJoints = (jointId: "leftHand" | "rightHand") => spec.primitives.filter(
      (primitive) => primitive.kind === "sphere"
        && primitive.jointId === jointId
        && primitive.materialRole === "joint"
        && primitive.center[1] < 0,
    );
    const left = digits("leftHand");
    const right = digits("rightHand");
    expect(left).toHaveLength(15);
    expect(right).toHaveLength(15);
    expect(digitJoints("leftHand")).toHaveLength(10);
    expect(digitJoints("rightHand")).toHaveLength(10);

    for (let index = 0; index < left.length; index += 1) {
      const leftDigit = left[index];
      const rightDigit = right[index];
      if (leftDigit?.kind !== "capsule" || rightDigit?.kind !== "capsule") continue;
      expect(rightDigit.from).toEqual([-leftDigit.from[0], leftDigit.from[1], leftDigit.from[2]]);
      expect(rightDigit.to).toEqual([-leftDigit.to[0], leftDigit.to[1], leftDigit.to[2]]);
      expect(rightDigit.radius).toBe(leftDigit.radius);
      expect(rightDigit.endRadius).toBe(leftDigit.endRadius);
    }
  });

  it("헤드 슬라이더가 실제 얼굴 형상에 반영되고 신장 불변식은 유지된다", () => {
    const base = buildStudioMannequinSpec(params());
    const tuned = buildStudioMannequinSpec(params({
      faceWidth: 1.2,
      chinLength: 1.25,
      eyeScale: 1.18,
      noseHeight: 1.2,
    }));

    const headSpheres = (spec: ReturnType<typeof buildStudioMannequinSpec>) =>
      spec.primitives.filter((primitive) => primitive.kind === "sphere" && primitive.jointId === "head");
    const baseHead = headSpheres(base);
    const tunedHead = headSpheres(tuned);
    const mainHeadBase = baseHead.find((primitive) => primitive.kind === "sphere" && primitive.scale?.[1] === 1);
    const mainHeadTuned = tunedHead.find((primitive) => primitive.kind === "sphere" && primitive.scale?.[1] === 1);
    if (mainHeadBase?.kind === "sphere" && mainHeadTuned?.kind === "sphere") {
      expect(mainHeadTuned.scale?.[0]).toBeGreaterThan(mainHeadBase.scale?.[0] ?? 0);
    }

    const eyeBase = baseHead.find((primitive) => primitive.materialRole === "eye");
    const eyeTuned = tunedHead.find((primitive) => primitive.materialRole === "eye");
    if (eyeBase?.kind === "sphere" && eyeTuned?.kind === "sphere") {
      expect(eyeTuned.radius).toBeGreaterThan(eyeBase.radius);
      expect(Math.abs(eyeTuned.center[0])).toBeGreaterThan(Math.abs(eyeBase.center[0]));
    }

    const noseBase = baseHead.find((primitive) =>
      primitive.kind === "sphere"
      && primitive.materialRole === "landmark"
      && primitive.center[0] === 0);
    const noseTuned = tunedHead.find((primitive) =>
      primitive.kind === "sphere"
      && primitive.materialRole === "landmark"
      && primitive.center[0] === 0);
    if (noseBase?.kind === "sphere" && noseTuned?.kind === "sphere") {
      expect(noseTuned.scale?.[2]).toBeGreaterThan(noseBase.scale?.[2] ?? 0);
      expect(noseTuned.center[2]).toBeGreaterThan(noseBase.center[2]);
    }

    const jawBase = baseHead.find((primitive) =>
      primitive.kind === "sphere"
      && primitive.materialRole === "body"
      && primitive.center[0] === 0
      && primitive.scale?.[1] !== 1);
    const jawTuned = tunedHead.find((primitive) =>
      primitive.kind === "sphere"
      && primitive.materialRole === "body"
      && primitive.center[0] === 0
      && primitive.scale?.[1] !== 1);
    if (jawBase?.kind === "sphere" && jawTuned?.kind === "sphere") {
      expect(jawTuned.scale?.[0]).toBeGreaterThan(jawBase.scale?.[0] ?? 0);
      expect(jawTuned.scale?.[1]).toBeGreaterThan(jawBase.scale?.[1] ?? 0);
    }

    expect(studioMannequinRestStature(tuned)).toBeCloseTo(tuned.heightM, 12);
  });

  it("두 눈 가이드는 좌우 대칭이고 머리와 함께 정수리 신장 불변식을 보존한다", () => {
    const spec = buildStudioMannequinSpec(params());
    const eyes = spec.primitives.filter((primitive) =>
      primitive.kind === "sphere"
      && primitive.jointId === "head"
      && primitive.materialRole === "eye",
    );
    expect(eyes).toHaveLength(2);
    if (eyes[0]?.kind === "sphere" && eyes[1]?.kind === "sphere") {
      expect(eyes[0].center[0]).toBe(-eyes[1].center[0]);
      expect(eyes[0].center.slice(1)).toEqual(eyes[1].center.slice(1));
    }
    expect(studioMannequinRestStature(spec)).toBeCloseTo(spec.heightM, 12);
  });

  it("몸체·관절구·해부학 랜드마크·시선 가이드를 서로 다른 재질 역할로 분리한다", () => {
    const spec = buildStudioMannequinSpec(params());
    const roles = new Set(spec.primitives.map((primitive) => primitive.materialRole ?? "body"));
    expect(roles).toEqual(new Set(["body", "joint", "landmark", "eye"]));

    for (const jointId of ["leftLowerArm", "rightLowerArm", "leftLowerLeg", "rightLowerLeg"] as const) {
      const landmark = spec.primitives.find((primitive) =>
        primitive.kind === "sphere"
        && primitive.jointId === jointId
        && primitive.materialRole === "landmark");
      expect(landmark, jointId).toBeDefined();
      if (landmark?.kind === "sphere") expect(landmark.center[2]).toBeGreaterThan(0);
    }
  });
});

describe("studio-mannequin-model 재질 다양성", () => {
  it("청동과 백자를 포함한 재질 id/label이 중복 없이 노출된다", () => {
    const ids = STUDIO_MANNEQUIN_MATERIAL_STYLES.map((style) => style.id);
    const labels = STUDIO_MANNEQUIN_MATERIAL_STYLES.map((style) => style.label);
    expect(ids).toEqual(expect.arrayContaining(["bronze", "porcelain", "skin"]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("studio-mannequin-model 파라미터 클램프", () => {
  it("범위 밖·비수치 입력을 항상 유효한 값으로 정규화한다", () => {
    const clamped = clampStudioMannequinBodyParams({
      heightCm: 999,
      headCount: -3,
      shoulderWidth: Number.NaN,
      pelvisWidth: Number.POSITIVE_INFINITY,
      armLength: "wide",
      legLength: 0,
      build: 100,
    });
    expect(clamped.heightCm).toBe(STUDIO_MANNEQUIN_PARAM_RANGES.heightCm[1]);
    expect(clamped.headCount).toBe(STUDIO_MANNEQUIN_PARAM_RANGES.headCount[0]);
    expect(clamped.shoulderWidth).toBe(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS.shoulderWidth);
    // 비유한값(Infinity/NaN)은 클램프가 아니라 기본값 폴백 — 손상 입력이 극단값이 되지 않게.
    expect(clamped.pelvisWidth).toBe(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS.pelvisWidth);
    expect(clamped.armLength).toBe(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS.armLength);
    expect(clamped.legLength).toBe(STUDIO_MANNEQUIN_PARAM_RANGES.legLength[0]);
    expect(clamped.build).toBe(STUDIO_MANNEQUIN_PARAM_RANGES.build[1]);
  });

  it("null/비객체 입력은 기본 파라미터가 된다", () => {
    expect(clampStudioMannequinBodyParams(null)).toEqual(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    expect(clampStudioMannequinBodyParams("x")).toEqual(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
  });
});

describe("studio-mannequin-model 결정성", () => {
  it("같은 파라미터는 항상 동일한 스펙을 만든다", () => {
    const input = STUDIO_MANNEQUIN_BODY_PRESETS.male.params;
    const first = buildStudioMannequinSpec(input);
    const second = buildStudioMannequinSpec(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("studio-mannequin-model 관절 한계", () => {
  it("모든 관절에 한계가 정의되어 있다", () => {
    for (const jointId of STUDIO_MANNEQUIN_JOINT_IDS) {
      const jointLimit = STUDIO_MANNEQUIN_JOINT_LIMITS[jointId];
      expect(jointLimit).toBeDefined();
      for (const axis of ["x", "y", "z"] as const) {
        expect(jointLimit[axis][0]).toBeLessThanOrEqual(jointLimit[axis][1]);
      }
    }
  });

  it("우측 한계는 좌측의 미러다(X 유지, Y/Z 반전)", () => {
    const left = STUDIO_MANNEQUIN_JOINT_LIMITS.leftUpperArm;
    const right = STUDIO_MANNEQUIN_JOINT_LIMITS.rightUpperArm;
    expect(right).toEqual(mirrorStudioMannequinJointLimit(left));
    expect(right.x).toEqual(left.x);
    expect(right.z[0]).toBeCloseTo(-left.z[1], 12);
    expect(right.z[1]).toBeCloseTo(-left.z[0], 12);
  });

  it("클램프는 한계를 벗어난 회전을 잘라내고 비정상 입력을 0으로 만든다", () => {
    const clamped = clampStudioMannequinJointRotation("leftLowerLeg", [-Math.PI, 99, "x"]);
    const jointLimit = getStudioMannequinJointLimit("leftLowerLeg");
    expect(clamped[0]).toBeCloseTo(jointLimit.x[0], 9);
    expect(clamped[1]).toBeLessThanOrEqual(jointLimit.y[1]);
    expect(clamped[2]).toBe(0);
  });

  it("알 수 없는 관절은 보수적 폴백 한계를 쓴다", () => {
    const fallback = getStudioMannequinJointLimit("tail");
    expect(fallback.x[0]).toBeCloseTo(-Math.PI, 9);
    expect(fallback.x[1]).toBeCloseTo(Math.PI, 9);
  });

  it("표준 각도 접기는 결정적이고 -0 을 만들지 않는다", () => {
    expect(canonicalizeStudioMannequinAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 5);
    expect(Object.is(canonicalizeStudioMannequinAngle(-0), -0)).toBe(false);
    expect(canonicalizeStudioMannequinAngle(Number.NaN)).toBe(0);
  });
});

describe("studio-mannequin-model 손가락 관절 분리", () => {
  const handCapsules = (
    spec: ReturnType<typeof buildStudioMannequinSpec>,
    jointId: "leftHand" | "rightHand",
  ) => spec.primitives.filter(
    (primitive) => primitive.kind === "capsule" && primitive.jointId === jointId,
  );

  it("컬 0에서는 기존 rest 끝점과 정확히 일치한다", () => {
    const spec = buildStudioMannequinSpec(params());
    // 손가락 끝점(가장 먼 캡슐 to)의 y/z는 2마디 시절과 같은 위치여야 한다.
    const capsules = handCapsules(spec, "leftHand");
    const maxReach = Math.max(...capsules.map((capsule) => (
      capsule.kind === "capsule" ? -capsule.to[1] : 0
    )));
    // 중지 끝점: knuckle -0.77 → end -1.17 (handLen 배율 전 비율).
    expect(maxReach / (0.085 * 1.7)).toBeCloseTo(1.17, 6);
    expect(spec.fingerPose?.left.index).toEqual([0, 0, 0]);
  });

  it("손가락별 컬이 해당 손가락 끝점만 손바닥(+Z) 쪽으로 감는다", () => {
    const rest = buildStudioMannequinSpec(params());
    const curled = buildStudioMannequinSpec(
      params(),
      studioMannequinFingerPoseFromCurls({ left: { index: 100 } }),
    );
    const restCapsules = handCapsules(rest, "leftHand");
    const curledCapsules = handCapsules(curled, "leftHand");
    expect(curledCapsules).toHaveLength(restCapsules.length);
    // 검지 체인(엄지보다 먼저 등장하는 순서: little, ring, middle, index, thumb —
    // index는 10~12번째 캡슐)만 달라지고 나머지는 동일해야 한다.
    for (let index = 0; index < restCapsules.length; index += 1) {
      const before = restCapsules[index];
      const after = curledCapsules[index];
      if (before?.kind !== "capsule" || after?.kind !== "capsule") continue;
      if (index >= 9 && index <= 11) continue;
      expect(after.from).toEqual(before.from);
      expect(after.to).toEqual(before.to);
    }
    const restIndexTip = restCapsules[11];
    const curledIndexTip = curledCapsules[11];
    if (restIndexTip?.kind === "capsule" && curledIndexTip?.kind === "capsule") {
      // 굽히면 끝점이 손바닥 쪽(+Z)으로 이동하고 뻗은 길이는 짧아진다.
      expect(curledIndexTip.to[2]).toBeGreaterThan(restIndexTip.to[2]);
      expect(Math.abs(curledIndexTip.to[1])).toBeLessThan(Math.abs(restIndexTip.to[1]));
    } else {
      throw new Error("index finger chain is missing");
    }
  });

  it("마디별 컬은 지정한 관절만 굽힌다(끝 마디만 굽히면 앞부분은 그대로)", () => {
    const rest = buildStudioMannequinSpec(params());
    const tipOnly = buildStudioMannequinSpec(params(), {
      left: { middle: [0, 0, 100] },
    });
    const restCapsules = handCapsules(rest, "leftHand");
    const tipCapsules = handCapsules(tipOnly, "leftHand");
    // 중지 체인은 6~8번째 캡슐. 앞 두 마디는 rest와 동일, 끝 마디만 달라진다.
    for (const index of [6, 7]) {
      const before = restCapsules[index];
      const after = tipCapsules[index];
      if (before?.kind === "capsule" && after?.kind === "capsule") {
        expect(after.from).toEqual(before.from);
        expect(after.to).toEqual(before.to);
      }
    }
    const before = restCapsules[8];
    const after = tipCapsules[8];
    if (before?.kind === "capsule" && after?.kind === "capsule") {
      expect(after.to[2]).toBeGreaterThan(before.to[2]);
    } else {
      throw new Error("middle finger chain is missing");
    }
  });

  it("손가락 포즈 정규화는 범위를 벗어난 값을 클램프하고 비정상 입력을 0으로 만든다", () => {
    const resolved = clampStudioMannequinFingerPose({
      left: { index: [150, -5, Number.NaN] },
      right: "nope",
    });
    expect(resolved.left.index).toEqual([100, 0, 0]);
    expect(resolved.right.thumb).toEqual([0, 0, 0]);
    for (const name of STUDIO_MANNEQUIN_FINGER_NAMES) {
      expect(resolved.left[name]).toHaveLength(3);
    }
    expect(clampStudioMannequinFingerPose(undefined).left.middle).toEqual([0, 0, 0]);
  });

  it("양손 미러: 오른손 컬은 왼손과 X축 미러 형상을 만든다", () => {
    const spec = buildStudioMannequinSpec(
      params(),
      studioMannequinFingerPoseFromCurls({ left: { ring: 80 }, right: { ring: 80 } }),
    );
    const left = handCapsules(spec, "leftHand");
    const right = handCapsules(spec, "rightHand");
    for (let index = 0; index < left.length; index += 1) {
      const l = left[index];
      const r = right[index];
      if (l?.kind !== "capsule" || r?.kind !== "capsule") continue;
      expect(r.from).toEqual([-l.from[0], l.from[1], l.from[2]]);
      expect(r.to).toEqual([-l.to[0], l.to[1], l.to[2]]);
    }
  });
});

describe("studio-mannequin-model 체형 archetype 프리셋", () => {
  it("모든 archetype은 전 파라미터가 유효 범위 안에 있어 클램프 왕복이 항등이다", () => {
    for (const [presetId, preset] of Object.entries(STUDIO_MANNEQUIN_ARCHETYPE_PRESETS)) {
      expect(isStudioMannequinArchetypePresetId(presetId)).toBe(true);
      expect(resolveStudioMannequinArchetypeParams(presetId)).toEqual(preset.params);
      // archetype은 핵심 7 + 얼굴 4 + 해부 12 = 23종을 모두 명시한다.
      expect(Object.keys(preset.params)).toHaveLength(23);
    }
  });

  it("대표 archetype의 두신·체형이 라벨과 일치한다", () => {
    expect(STUDIO_MANNEQUIN_ARCHETYPE_PRESETS.hero8.params.headCount).toBe(8);
    expect(STUDIO_MANNEQUIN_ARCHETYPE_PRESETS.boy6.params.headCount).toBe(6);
    expect(STUDIO_MANNEQUIN_ARCHETYPE_PRESETS.sd5.params.headCount).toBe(5);
    const villain = STUDIO_MANNEQUIN_ARCHETYPE_PRESETS.muscleVillain.params;
    expect(villain.build).toBeGreaterThanOrEqual(2.5);
    expect(villain.shoulderWidth).toBeGreaterThanOrEqual(1.25);
    expect(villain.upperArmThickness ?? 0).toBeGreaterThan(1.3);
  });

  it("archetype 적용 스펙은 신장 불변식을 유지하고 알 수 없는 id는 기본 체형이다", () => {
    const hero = buildStudioMannequinSpec(resolveStudioMannequinArchetypeParams("hero8"));
    expect(studioMannequinRestStature(hero)).toBeCloseTo(1.86, 9);
    expect(resolveStudioMannequinArchetypeParams("nope")).toBe(
      STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
    );
    expect(isStudioMannequinArchetypePresetId("nope")).toBe(false);
  });
});
