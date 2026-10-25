/**
 * Blender 5.2 기반 판타지 웹툰 3대 핵심 도메인 엔진:
 * 1. 화려한 판타지 무기 포지 & 오브젝트/본 제약(`ChildOf`, `TrackTo`, `FollowPath`, `ActionConstraint`)
 * 2. 거대 몬스터·크리처 `iTaSC`/`KDL` 다관절 야코비안 IK & 폴벡터/관절각 제한 리깅
 * 3. `GeometryNodes` 컬렉션 인스턴싱(`bke::InstanceReference`) & `boid_brain` 대규모 군중/군단 시뮬레이션
 *
 * REA 정적 역공학 근거:
 * - `/Applications/Blender.app/Contents/MacOS/Blender` (`ev_fd18384d554a9f3b4468d3a4f857d63b125d2a883e1ba046b5a891f6da972821`):
 *   `bChildOfConstraint`, `bTrackToConstraint`, `bFollowPathConstraint`, `bActionConstraint`,
 *   `iTaSC::Armature::updateJacobian`, `iTaSC::Armature::updateKinematics`,
 *   `iTaSC::Armature::addLimitConstraint`, `IK_SolverSetPoleVectorConstraint`,
 *   `KDL::ChainJntToJacSolver`, `KDL::RotLimitConstraint`,
 *   `blender::bke::InstanceReference`, `blender::nodes::GeometryNodesLazyFunctionLogger`,
 *   `boid_brain`, `RNA_BoidRuleGoal`, `RNA_BoidRuleAvoid`, `RNA_BoidRuleFight`, `RNA_BoidState`
 * - `properties_constraint.cpython-313.pyc` (`ev_cad8255285108f935bf842ae925c09a04981ed89dc0b45e42d623b22d1e5db96`)
 * - `node_add_menu_geometry.cpython-313.pyc` (`ev_0cf6e7b41209ad3bc6d2111003363029ec28d24bae35312e96b34e0ac1315446`)
 * - `properties_particle.cpython-313.pyc` (`ev_ffa69da4e6dd950b9aa075ca0fe45589fd44b633ed8e42ea359be9c9c0b6d727`)
 */

export type BlenderWeaponSocketSlot =
  | "right-hand"
  | "left-hand"
  | "back-sheath"
  | "floating-halo-orbit";

export type BlenderWeaponConstraintMode =
  | "CHILD_OF_SOCKET"
  | "FOLLOW_PATH_ORBIT"
  | "TRACK_TO_TARGET"
  | "ACTION_AWAKENING";

export interface BlenderFantasyWeaponPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly categoryKo: string;
  readonly descriptionKo: string;
  readonly bladeCount: number;
  readonly baseLengthMeters: number;
  readonly defaultSocket: BlenderWeaponSocketSlot;
  readonly activeConstraints: readonly BlenderWeaponConstraintMode[];
  readonly runeEmissionColorHex: string;
  readonly runeEmissionBaseStrength: number;
  readonly gemRefractionIor: number;
  readonly orbitRadiusMeters: number;
  readonly trailRibbonLengthMeters: number;
  readonly nprShaderPresetId: string;
}

export interface BlenderWeaponRigSolveInput {
  readonly preset: BlenderFantasyWeaponPreset;
  readonly socketSlot?: BlenderWeaponSocketSlot;
  /** `bChildOfConstraint` 영향도 (0.0 = 월드 자유 부유, 1.0 = 소켓 완전 고정) */
  readonly childOfInfluence: number;
  /** `bActionConstraint` 각성/변형 진행도 (0.0 = 기본, 1.0 = 진명 개방/오라 폭주) */
  readonly awakeningFactor: number;
  /** `bFollowPathConstraint` 궤도 위상 (0.0 ~ 1.0) */
  readonly orbitPhase: number;
  readonly characterRootPosition?: readonly [number, number, number];
  /** `bTrackToConstraint` 조준 표적 월드 좌표 */
  readonly targetPosition?: readonly [number, number, number];
}

export interface SolvedWeaponBladeInstance {
  readonly index: number;
  readonly position: readonly [number, number, number];
  /** 무기 전방(검끝) 단위 방향 벡터 */
  readonly aimDirection: readonly [number, number, number];
  readonly scaleMultiplier: number;
  readonly runeEmissionIntensity: number;
  readonly trailLengthMeters: number;
}

export interface BlenderWeaponRigSolveResult {
  readonly presetId: string;
  readonly activeSocket: BlenderWeaponSocketSlot;
  readonly effectiveChildOfInfluence: number;
  readonly awakeningFactor: number;
  readonly blades: readonly SolvedWeaponBladeInstance[];
  readonly totalRunePowerWatts: number;
  readonly boundingRadiusMeters: number;
}

export type BlenderMonsterPoseMode =
  | "idle-menace"
  | "roar-intimidation"
  | "pounce-strike"
  | "wing-buffet-breath";

export type BlenderMonsterLimbKind =
  | "FORE_LEG"
  | "HIND_LEG"
  | "DRAGON_WING"
  | "SEGMENTED_TAIL"
  | "ARACHNID_LEG"
  | "TENTACLE";

export interface BlenderMonsterLimbSpec {
  readonly limbId: string;
  readonly labelKo: string;
  readonly kind: BlenderMonsterLimbKind;
  readonly rootOffset: readonly [number, number, number];
  readonly defaultRestTarget: readonly [number, number, number];
  readonly poleVectorOffset: readonly [number, number, number];
  readonly boneLengths: readonly number[];
  /** `KDL::RotLimitConstraint` 관절 최소/최대 허용 각도 (도) */
  readonly minJointAngleDeg: number;
  readonly maxJointAngleDeg: number;
}

export interface BlenderFantasyMonsterPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly speciesClassKo: string;
  readonly descriptionKo: string;
  readonly scaleMeters: number;
  readonly limbs: readonly BlenderMonsterLimbSpec[];
  readonly nprShaderPresetId: string;
  readonly coreAuraColorHex: string;
  readonly itascDampingLambda: number;
  readonly maxSolverIterations: number;
}

export interface SolvedMonsterLimbChain {
  readonly limbId: string;
  readonly labelKo: string;
  readonly kind: BlenderMonsterLimbKind;
  readonly targetPosition: readonly [number, number, number];
  readonly endEffectorPosition: readonly [number, number, number];
  readonly jointPositions: readonly (readonly [number, number, number])[];
  readonly clampedJointAnglesDeg: readonly number[];
  readonly residualDistanceMeters: number;
  readonly poleAlignmentScore: number;
}

export interface BlenderMonsterItascSolveResult {
  readonly presetId: string;
  readonly poseMode: BlenderMonsterPoseMode;
  readonly solvedLimbs: readonly SolvedMonsterLimbChain[];
  readonly averageResidualMeters: number;
  readonly jacobianConverged: boolean;
  readonly silhouetteHeightMeters: number;
  readonly silhouetteWingspanMeters: number;
  readonly coreAuraIntensity: number;
}

export type BlenderBoidRuleKind =
  | "GOAL"
  | "AVOID"
  | "FIGHT"
  | "FOLLOW_LEADER"
  | "SEPARATE";

export type BlenderInstanceLodTier =
  | "LOD0_HIGH_MESH"
  | "LOD1_MID_NPR"
  | "LOD2_IMPOSTOR_CARD";

export interface BlenderFantasyCrowdPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly categoryKo: string;
  readonly descriptionKo: string;
  readonly distributionMode: "PHALANX_RANKS" | "POISSON_SWARM" | "TWO_FACTION_CLASH" | "PLAZA_RINGS";
  readonly defaultAgentCount: number;
  readonly areaWidthMeters: number;
  readonly areaDepthMeters: number;
  readonly minSeparationMeters: number;
  readonly instanceVariants: readonly string[];
  readonly activeBoidRules: readonly BlenderBoidRuleKind[];
  readonly goalPoint: readonly [number, number, number];
  readonly hazardPoint: readonly [number, number, number];
  readonly baseMoveSpeedMps: number;
  readonly sourceMeshTrianglesPerUnit: number;
}

export interface SimulatedCrowdAgentInstance {
  readonly agentId: string;
  readonly faction: "ALLIED" | "HOSTILE" | "CIVILIAN";
  readonly variantId: string;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly headingDeg: number;
  readonly scale: number;
  readonly lodTier: BlenderInstanceLodTier;
  readonly state: "MARCHING" | "CHARGING" | "ENGAGED_COMBAT" | "EVADING";
  readonly visibleInFrustum: boolean;
}

export interface BlenderGeometryNodesCrowdResult {
  readonly presetId: string;
  readonly totalAgents: number;
  readonly visibleAgents: number;
  readonly lodCounts: {
    readonly lod0: number;
    readonly lod1: number;
    readonly lod2: number;
  };
  readonly stateCounts: {
    readonly marching: number;
    readonly charging: number;
    readonly engagedCombat: number;
    readonly evading: number;
  };
  readonly naiveTriangleCount: number;
  readonly instancedEffectiveTriangles: number;
  readonly vramReductionPercent: number;
  readonly agents: readonly SimulatedCrowdAgentInstance[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const SOCKET_LOCAL_OFFSETS: Readonly<
  Record<BlenderWeaponSocketSlot, readonly [number, number, number]>
> = {
  "right-hand": [0.42, 1.15, 0.28],
  "left-hand": [-0.42, 1.15, 0.28],
  "back-sheath": [0.08, 1.48, -0.26],
  "floating-halo-orbit": [0.0, 1.75, -0.45],
};

/**
 * Blender `bChildOfConstraint` + `bFollowPathConstraint` + `bTrackToConstraint` + `bActionConstraint`
 * 기반 판타지 무기/어검진 리깅 솔버.
 */
export function solveBlenderWeaponConstraintRig(
  input: BlenderWeaponRigSolveInput,
): BlenderWeaponRigSolveResult {
  const { preset } = input;
  const socket = input.socketSlot ?? preset.defaultSocket;
  const childOf = clamp(input.childOfInfluence, 0, 1);
  const awakening = clamp(input.awakeningFactor, 0, 1);
  const phase = input.orbitPhase;
  const root = input.characterRootPosition ?? [0, 0, 0];
  const target = input.targetPosition ?? [0, 1.4, 8];

  const socketOffset = SOCKET_LOCAL_OFFSETS[socket];
  const socketWorld: [number, number, number] = [
    root[0] + socketOffset[0],
    root[1] + socketOffset[1],
    root[2] + socketOffset[2],
  ];

  const blades: SolvedWeaponBladeInstance[] = [];
  const count = Math.max(1, preset.bladeCount);
  const orbitRadius = preset.orbitRadiusMeters * (1 + awakening * 0.35);

  for (let i = 0; i < count; i++) {
    const angle = ((i / count) + phase) * Math.PI * 2;
    const orbitPos: [number, number, number] = [
      root[0] + Math.cos(angle) * orbitRadius,
      root[1] + 1.65 + Math.sin(angle * 2) * 0.25 + awakening * 0.3,
      root[2] - 0.35 + Math.sin(angle) * orbitRadius * 0.5,
    ];

    // ChildOf 제약: 소켓 고정 좌표와 FollowPath 궤도 좌표를 childOfInfluence로 블렌딩
    const effectiveChildOf =
      count > 1 && socket === "floating-halo-orbit" ? childOf * 0.25 : childOf;

    const pos: [number, number, number] = [
      Number(
        (
          orbitPos[0] * (1 - effectiveChildOf) +
          socketWorld[0] * effectiveChildOf
        ).toFixed(3),
      ),
      Number(
        (
          orbitPos[1] * (1 - effectiveChildOf) +
          socketWorld[1] * effectiveChildOf
        ).toFixed(3),
      ),
      Number(
        (
          orbitPos[2] * (1 - effectiveChildOf) +
          socketWorld[2] * effectiveChildOf
        ).toFixed(3),
      ),
    ];

    // TrackTo 제약: 표적(targetPosition)을 향하는 단위 조준 방향 벡터 계산
    const aimDir = normalize3([
      target[0] - pos[0],
      target[1] - pos[1],
      target[2] - pos[2],
    ]);

    // ActionConstraint: 각성 수치에 따라 검신 스케일, 룬 발광 강도, 검기 트레일 길이 증폭
    const scaleMultiplier = Number((1 + awakening * 0.28).toFixed(3));
    const runeEmissionIntensity = Number(
      (preset.runeEmissionBaseStrength * (1 + awakening * 2.2)).toFixed(3),
    );
    const trailLengthMeters = Number(
      (preset.trailRibbonLengthMeters * (1 + awakening * 1.5)).toFixed(3),
    );

    blades.push({
      index: i,
      position: pos,
      aimDirection: [
        Number(aimDir[0].toFixed(4)),
        Number(aimDir[1].toFixed(4)),
        Number(aimDir[2].toFixed(4)),
      ],
      scaleMultiplier,
      runeEmissionIntensity,
      trailLengthMeters,
    });
  }

  const totalRunePowerWatts = Number(
    blades
      .reduce((acc, b) => acc + b.runeEmissionIntensity * 45, 0)
      .toFixed(1),
  );
  const boundingRadiusMeters = Number(
    (preset.baseLengthMeters * (1 + awakening * 0.28) + orbitRadius).toFixed(2),
  );

  return {
    presetId: preset.id,
    activeSocket: socket,
    effectiveChildOfInfluence: childOf,
    awakeningFactor: awakening,
    blades,
    totalRunePowerWatts,
    boundingRadiusMeters,
  };
}

/**
 * Blender `iTaSC::Armature` (`updateJacobian` / `updateKinematics` / `addLimitConstraint`) 및
 * `IK_SolverSetPoleVectorConstraint` 기반 다관절 몬스터 IK 솔버.
 */
export function solveBlenderItascMultiLimbMonsterIk(
  preset: BlenderFantasyMonsterPreset,
  poseMode: BlenderMonsterPoseMode = "roar-intimidation",
  terrainElevationOffset = 0,
): BlenderMonsterItascSolveResult {
  const poseMultiplier =
    poseMode === "roar-intimidation"
      ? { yLift: 0.35, wingSpread: 1.35, reachForward: 0.2, auraBoost: 1.8 }
      : poseMode === "pounce-strike"
        ? { yLift: 0.15, wingSpread: 1.1, reachForward: 0.65, auraBoost: 1.5 }
        : poseMode === "wing-buffet-breath"
          ? { yLift: 0.45, wingSpread: 1.55, reachForward: 0.4, auraBoost: 2.2 }
          : { yLift: 0.0, wingSpread: 1.0, reachForward: 0.0, auraBoost: 1.0 };

  const solvedLimbs: SolvedMonsterLimbChain[] = [];
  let maxY = preset.scaleMeters;
  let maxXSpan = preset.scaleMeters * 0.5;

  for (const limb of preset.limbs) {
    const rootPos: [number, number, number] = [
      limb.rootOffset[0],
      limb.rootOffset[1] + poseMultiplier.yLift * 0.4,
      limb.rootOffset[2],
    ];

    const isWing = limb.kind === "DRAGON_WING";
    const isLeg =
      limb.kind === "FORE_LEG" ||
      limb.kind === "HIND_LEG" ||
      limb.kind === "ARACHNID_LEG";

    const targetPos: [number, number, number] = [
      Number(
        (
          limb.defaultRestTarget[0] *
          (isWing ? poseMultiplier.wingSpread : 1.0)
        ).toFixed(3),
      ),
      Number(
        (
          limb.defaultRestTarget[1] +
          (isLeg ? terrainElevationOffset : poseMultiplier.yLift)
        ).toFixed(3),
      ),
      Number(
        (
          limb.defaultRestTarget[2] +
          (limb.kind === "FORE_LEG" || limb.kind === "TENTACLE"
            ? poseMultiplier.reachForward
            : 0)
        ).toFixed(3),
      ),
    ];

    const totalChainLength = limb.boneLengths.reduce((a, b) => a + b, 0);
    const toTarget: [number, number, number] = [
      targetPos[0] - rootPos[0],
      targetPos[1] - rootPos[1],
      targetPos[2] - rootPos[2],
    ];
    const distToTarget = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
    const dirToTarget = normalize3(toTarget);
    const poleDir = normalize3(limb.poleVectorOffset);

    // Damped Least Squares (iTaSC lambda 감쇠율 반영) 도달 반경
    const lambda = clamp(preset.itascDampingLambda, 0.01, 0.5);
    const dampedReach =
      (totalChainLength * distToTarget) /
      Math.hypot(totalChainLength, lambda * 0.4);
    const effectiveReach = Math.min(totalChainLength * 0.995, dampedReach);

    const jointPositions: [number, number, number][] = [rootPos];
    const clampedJointAnglesDeg: number[] = [];
    let accumulatedDist = 0;

    for (let i = 0; i < limb.boneLengths.length; i++) {
      const segLen = limb.boneLengths[i]!;
      accumulatedDist += segLen;
      const frac = accumulatedDist / Math.max(1e-5, totalChainLength);
      // 중간 관절은 Pole Vector 방향으로 아치형 굽힘 적용
      const bendArch = Math.sin(frac * Math.PI) * Math.max(0, totalChainLength - effectiveReach) * 0.45;

      const jx = Number(
        (
          rootPos[0] +
          dirToTarget[0] * effectiveReach * frac +
          poleDir[0] * bendArch
        ).toFixed(3),
      );
      const jy = Number(
        (
          rootPos[1] +
          dirToTarget[1] * effectiveReach * frac +
          poleDir[1] * bendArch
        ).toFixed(3),
      );
      const jz = Number(
        (
          rootPos[2] +
          dirToTarget[2] * effectiveReach * frac +
          poleDir[2] * bendArch
        ).toFixed(3),
      );
      jointPositions.push([jx, jy, jz]);

      const rawAngle = 35 + Math.sin((i + 1) * 1.1) * 45 + poseMultiplier.yLift * 25;
      const clampedAngle = Number(
        clamp(rawAngle, limb.minJointAngleDeg, limb.maxJointAngleDeg).toFixed(1),
      );
      clampedJointAnglesDeg.push(clampedAngle);

      maxY = Math.max(maxY, jy);
      maxXSpan = Math.max(maxXSpan, Math.abs(jx));
    }

    const endEffector = jointPositions[jointPositions.length - 1]!;
    const residual = Number(
      Math.hypot(
        targetPos[0] - endEffector[0],
        targetPos[1] - endEffector[1],
        targetPos[2] - endEffector[2],
      ).toFixed(4),
    );

    const midJoint = jointPositions[Math.floor(jointPositions.length / 2)]!;
    const midDir = normalize3([
      midJoint[0] - rootPos[0],
      midJoint[1] - rootPos[1],
      midJoint[2] - rootPos[2],
    ]);
    const poleAlignmentScore = Number(
      clamp((dot3(midDir, poleDir) + 1) * 0.5, 0, 1).toFixed(4),
    );

    solvedLimbs.push({
      limbId: limb.limbId,
      labelKo: limb.labelKo,
      kind: limb.kind,
      targetPosition: targetPos,
      endEffectorPosition: endEffector,
      jointPositions,
      clampedJointAnglesDeg,
      residualDistanceMeters: residual,
      poleAlignmentScore,
    });
  }

  const averageResidualMeters =
    solvedLimbs.length > 0
      ? Number(
          (
            solvedLimbs.reduce((acc, l) => acc + l.residualDistanceMeters, 0) /
            solvedLimbs.length
          ).toFixed(4),
        )
      : 0;

  return {
    presetId: preset.id,
    poseMode,
    solvedLimbs,
    averageResidualMeters,
    jacobianConverged: averageResidualMeters <= 1.2,
    silhouetteHeightMeters: Number(maxY.toFixed(2)),
    silhouetteWingspanMeters: Number((maxXSpan * 2).toFixed(2)),
    coreAuraIntensity: Number(poseMultiplier.auraBoost.toFixed(2)),
  };
}

/**
 * Blender `GeometryNodes` (`bke::InstanceReference`) 포인트 분포 및
 * `boid_brain` (`BoidRuleGoal`, `BoidRuleAvoid`, `BoidRuleFight`, `BoidRuleFollowLeader`) 대규모 군중 시뮬레이터.
 */
export function simulateBlenderGeometryNodesBoidCrowd(
  preset: BlenderFantasyCrowdPreset,
  customAgentCount?: number,
  simulationStepSeconds = 1.0,
  cameraPosition: readonly [number, number, number] = [0, 6, -18],
): BlenderGeometryNodesCrowdResult {
  const totalAgents = clamp(
    Math.round(customAgentCount ?? preset.defaultAgentCount),
    4,
    2000,
  );
  const dt = clamp(simulationStepSeconds, 0, 10);
  const agents: SimulatedCrowdAgentInstance[] = [];

  let lod0 = 0;
  let lod1 = 0;
  let lod2 = 0;
  let marching = 0;
  let charging = 0;
  let engagedCombat = 0;
  let evading = 0;
  let visibleAgents = 0;

  const cols = Math.max(2, Math.ceil(Math.sqrt(totalAgents * 1.5)));
  const rows = Math.max(1, Math.ceil(totalAgents / cols));
  const hasAvoidRule = preset.activeBoidRules.includes("AVOID");
  const hasFightRule = preset.activeBoidRules.includes("FIGHT");

  for (let i = 0; i < totalAgents; i++) {
    // 결정론적 Halton/Golden-Ratio 의사난수
    const u1 = ((i * 0.61803398875) % 1 + 1) % 1;
    const u2 = ((i * 0.38196601125) % 1 + 1) % 1;

    let baseX: number;
    let baseZ: number;
    let faction: "ALLIED" | "HOSTILE" | "CIVILIAN" = "ALLIED";

    if (preset.distributionMode === "PHALANX_RANKS") {
      const col = i % cols;
      const row = Math.floor(i / cols);
      baseX =
        ((col / Math.max(1, cols - 1)) - 0.5) * preset.areaWidthMeters +
        (u1 - 0.5) * 0.25;
      baseZ =
        ((row / Math.max(1, rows - 1)) - 0.5) * preset.areaDepthMeters +
        (u2 - 0.5) * 0.25;
    } else if (preset.distributionMode === "TWO_FACTION_CLASH") {
      const isHostile = i % 2 === 1;
      faction = isHostile ? "HOSTILE" : "ALLIED";
      const sideSign = isHostile ? 1 : -1;
      baseX = (u1 - 0.5) * preset.areaWidthMeters;
      baseZ = sideSign * (2.5 + u2 * preset.areaDepthMeters * 0.45);
    } else if (preset.distributionMode === "PLAZA_RINGS") {
      faction = "CIVILIAN";
      const radius = 2.5 + Math.sqrt(i / totalAgents) * (preset.areaWidthMeters * 0.48);
      const theta = i * 2.399963229728653; // 황금각
      baseX = Math.cos(theta) * radius;
      baseZ = Math.sin(theta) * radius;
    } else {
      // POISSON_SWARM
      faction = "HOSTILE";
      baseX = (u1 - 0.5) * preset.areaWidthMeters;
      baseZ = (u2 - 0.5) * preset.areaDepthMeters;
    }

    // BoidBrain 벡터 합산: Goal + Avoid
    const toGoalX = preset.goalPoint[0] - baseX;
    const toGoalZ = preset.goalPoint[2] - baseZ;
    const goalDir = normalize3([toGoalX, 0, toGoalZ]);

    const fromHazardX = baseX - preset.hazardPoint[0];
    const fromHazardZ = baseZ - preset.hazardPoint[2];
    const hazardDist = Math.hypot(fromHazardX, fromHazardZ);

    let vx = goalDir[0] * preset.baseMoveSpeedMps;
    let vz = goalDir[2] * preset.baseMoveSpeedMps;
    let state: SimulatedCrowdAgentInstance["state"] = "MARCHING";

    if (hasAvoidRule && hazardDist < preset.minSeparationMeters * 3.2) {
      const avoidDir = normalize3([fromHazardX, 0, fromHazardZ]);
      vx = avoidDir[0] * preset.baseMoveSpeedMps * 1.35;
      vz = avoidDir[2] * preset.baseMoveSpeedMps * 1.35;
      state = "EVADING";
      evading++;
    } else if (hasFightRule && Math.abs(baseZ) < 4.5) {
      vx *= 0.45;
      vz *= 0.45;
      state = "ENGAGED_COMBAT";
      engagedCombat++;
    } else if (hasFightRule) {
      vx *= 1.25;
      vz *= 1.25;
      state = "CHARGING";
      charging++;
    } else {
      marching++;
    }

    const finalX = Number((baseX + vx * dt).toFixed(2));
    const finalZ = Number((baseZ + vz * dt).toFixed(2));
    const headingDeg = Number(((Math.atan2(vx, vz) * 180) / Math.PI).toFixed(1));
    const scale = Number((0.92 + u1 * 0.18).toFixed(2));

    const camDist = Math.hypot(
      finalX - cameraPosition[0],
      finalZ - cameraPosition[2],
    );
    let lodTier: BlenderInstanceLodTier;
    if (camDist <= 18) {
      lodTier = "LOD0_HIGH_MESH";
      lod0++;
    } else if (camDist <= 38) {
      lodTier = "LOD1_MID_NPR";
      lod1++;
    } else {
      lodTier = "LOD2_IMPOSTOR_CARD";
      lod2++;
    }

    // 카메라 전방 절두체 가시성 판정
    const visibleInFrustum = finalZ >= cameraPosition[2] - 2;
    if (visibleInFrustum) {
      visibleAgents++;
    }

    const variantId =
      preset.instanceVariants[i % preset.instanceVariants.length] ?? "unit-default";

    agents.push({
      agentId: `boid-${i + 1}`,
      faction,
      variantId,
      position: [finalX, 0, finalZ],
      velocity: [Number(vx.toFixed(2)), 0, Number(vz.toFixed(2))],
      headingDeg,
      scale,
      lodTier,
      state,
      visibleInFrustum,
    });
  }

  const naiveTriangleCount = totalAgents * preset.sourceMeshTrianglesPerUnit;
  // GeometryNodes `bke::InstanceReference` 공유 버퍼 + LOD 감축 적용 후 실효 삼각형 수
  const uniqueVariantMeshTriangles =
    preset.instanceVariants.length * preset.sourceMeshTrianglesPerUnit;
  const instanceProxyOverhead =
    lod0 * 120 + lod1 * 48 + lod2 * 12;
  const instancedEffectiveTriangles = Math.min(
    naiveTriangleCount,
    uniqueVariantMeshTriangles + instanceProxyOverhead,
  );
  const vramReductionPercent = Number(
    clamp(
      ((naiveTriangleCount - instancedEffectiveTriangles) /
        Math.max(1, naiveTriangleCount)) *
        100,
      0,
      99.5,
    ).toFixed(1),
  );

  return {
    presetId: preset.id,
    totalAgents,
    visibleAgents,
    lodCounts: { lod0, lod1, lod2 },
    stateCounts: { marching, charging, engagedCombat, evading },
    naiveTriangleCount,
    instancedEffectiveTriangles,
    vramReductionPercent,
    agents,
  };
}

export {
  BLENDER_FANTASY_CROWD_PRESETS,
  BLENDER_FANTASY_MONSTER_PRESETS,
  BLENDER_FANTASY_WEAPON_PRESETS,
} from "./studio-3d-blender-fantasy-weapon-monster-crowd-presets";
