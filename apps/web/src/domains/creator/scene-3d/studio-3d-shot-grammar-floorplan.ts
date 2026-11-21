/**
 * Wonder Unit Storyboarder · Previs Pro 클린룸 텍스트 샷 그래머 컴파일러,
 * 2D 평면도(XZ Floorplan), 180도 가상선(Line-of-Action) 가드 및 2D 러프 스냅샷 명세 엔진.
 *
 * - LLM 의존성 0%: 한글/영문 단문 프롬프트를 결정론적 샷 IR(화각·구도·고도·더치·배우 위치/자세/시선)로 컴파일
 * - 2D 평면도(XZ)에서 배우 시선 벡터, 카메라 프러스텀, 가상선 부호 sign((C - A) × (B - A)) 계산
 * - 직전 컷 대비 가상선 월선(axis-cross) 감지 및 의도적 월선 승인 플래그(intentionalAxisCrossApproved) 처리
 * - 원클릭 2D 스토리보드 러프 스케치(LT 3패스 추출) 투하 명세 생성
 */

export type ShotSizeCode = "ECU" | "CU" | "MCU" | "MS" | "MLS" | "WS" | "EWS";
export type ShotFramingStyle = "single" | "two-shot" | "ots" | "group";
export type CameraElevationPreset = "worms-eye" | "low" | "eye" | "high" | "birds-eye";
export type ActorPosturePreset = "standing" | "seated" | "kneeling";
export type ActorStageSlot =
  | "left"
  | "center"
  | "right"
  | "foreground-left"
  | "foreground-right";

export type Vec2XZ = readonly [number, number];

export interface CompiledActorPlacement {
  readonly id: string;
  readonly label: string;
  readonly slot: ActorStageSlot;
  readonly posture: ActorPosturePreset;
  readonly positionXZ: Vec2XZ;
  readonly eyeHeightM: number;
  readonly facingYawDeg: number;
}

export interface ActorLookAtPair {
  readonly observerId: string;
  readonly targetId: string;
}

export interface CompiledShotGrammarIR {
  readonly rawPrompt: string;
  readonly shotSize: ShotSizeCode;
  readonly framingStyle: ShotFramingStyle;
  readonly focalLengthMm: number;
  readonly cameraElevation: CameraElevationPreset;
  readonly dutchDeg: number;
  readonly cameraPositionXZ: Vec2XZ;
  readonly cameraHeightM: number;
  readonly cameraTargetXZ: Vec2XZ;
  readonly actors: readonly CompiledActorPlacement[];
  readonly lookAtPairs: readonly ActorLookAtPair[];
  readonly recognizedTokens: readonly string[];
}

export interface OverheadFloorplanActorMarker {
  readonly actorId: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly posture: ActorPosturePreset;
  readonly gazeVectorXZ: Vec2XZ;
}

export interface OverheadFloorplanCameraMarker {
  readonly x: number;
  readonly z: number;
  readonly targetX: number;
  readonly targetZ: number;
  readonly focalLengthMm: number;
  readonly horizontalFovDeg: number;
  readonly frustumPolygonXZ: readonly [Vec2XZ, Vec2XZ, Vec2XZ];
}

export interface OverheadFloorplan2D {
  readonly actors: readonly OverheadFloorplanActorMarker[];
  readonly camera: OverheadFloorplanCameraMarker;
  readonly lineOfActionSegment: readonly [Vec2XZ, Vec2XZ] | null;
  readonly cameraSideSign: -1 | 0 | 1;
  readonly boundsXZ: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
}

export interface LineOfActionGuardResult {
  readonly hasLineOfAction: boolean;
  readonly previousSideSign: -1 | 0 | 1;
  readonly currentSideSign: -1 | 0 | 1;
  readonly axisCrossed: boolean;
  readonly status:
    | "safe"
    | "axis-cross-warning"
    | "intentional-override-approved"
    | "insufficient-actors";
  readonly message: string;
}

export interface StoryboardCutSnapshotSpec {
  readonly cutId: string;
  readonly shotGrammar: CompiledShotGrammarIR;
  readonly floorplan: OverheadFloorplan2D;
  readonly axisGuard: LineOfActionGuardResult;
  readonly ltExtractionPreset: {
    readonly passSet: readonly ["main-line", "shadow-mask", "depth-map"];
    readonly focalLengthMm: number;
    readonly aspectRatio: number;
    readonly roughSketchOpacity01: number;
  };
  readonly captionSummaryKo: string;
}

const POSTURE_EYE_HEIGHT_M: Record<ActorPosturePreset, number> = {
  standing: 1.62,
  seated: 1.15,
  kneeling: 1.05,
};

const SHOT_SIZE_CAMERA_DISTANCE_M: Record<ShotSizeCode, number> = {
  ECU: 0.9,
  CU: 1.45,
  MCU: 2.1,
  MS: 2.9,
  MLS: 4.1,
  WS: 6.2,
  EWS: 10.5,
};

const SHOT_SIZE_DEFAULT_FOCAL_MM: Record<ShotSizeCode, number> = {
  ECU: 85,
  CU: 65,
  MCU: 50,
  MS: 40,
  MLS: 35,
  WS: 28,
  EWS: 21,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function yawFromDeltaXZ(dx: number, dz: number): number {
  const deg = (Math.atan2(dx, dz) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function detectShotSize(lower: string, tokens: string[]): ShotSizeCode {
  if (/익스트림\s*클로즈업|\becu\b|extreme\s+close/.test(lower)) {
    tokens.push("shot:ECU");
    return "ECU";
  }
  if (/익스트림\s*와이드|\bews\b|extreme\s+wide|초광각\s*전경/.test(lower)) {
    tokens.push("shot:EWS");
    return "EWS";
  }
  if (/미디엄\s*클로즈업|\bmcu\b|medium\s+close|바스트/.test(lower)) {
    tokens.push("shot:MCU");
    return "MCU";
  }
  if (/클로즈업|\bcu\b|close[-\s]?up/.test(lower)) {
    tokens.push("shot:CU");
    return "CU";
  }
  if (/니샷|미디엄\s*롱|\bmls\b|medium\s+long/.test(lower)) {
    tokens.push("shot:MLS");
    return "MLS";
  }
  if (/와이드|풀샷|전신|\bws\b|\bwide\b|full\s+shot/.test(lower)) {
    tokens.push("shot:WS");
    return "WS";
  }
  if (/미디엄|\bms\b|\bmedium\b|웨이스트/.test(lower)) {
    tokens.push("shot:MS");
    return "MS";
  }
  return "MS";
}

function detectFramingStyle(lower: string, tokens: string[]): ShotFramingStyle {
  if (/오버\s*더\s*숄더|어깨\s*너머|\bots\b|over[-\s]?the[-\s]?shoulder/.test(lower)) {
    tokens.push("framing:ots");
    return "ots";
  }
  if (/3인|4인|단체|군중|\bgroup\b|three[-\s]?shot|crowd/.test(lower)) {
    tokens.push("framing:group");
    return "group";
  }
  if (/2인|두\s*사람|대치|투샷|마주|2[-\s]?shot|two[-\s]?shot/.test(lower)) {
    tokens.push("framing:two-shot");
    return "two-shot";
  }
  if (/1인|단독|솔로|\bsingle\b|one[-\s]?shot/.test(lower)) {
    tokens.push("framing:single");
    return "single";
  }
  return "single";
}

function detectCameraElevation(lower: string, tokens: string[]): CameraElevationPreset {
  if (/버즈아이|부감|탑뷰|수직\s*하향|bird'?s?[-\s]?eye|top[-\s]?down/.test(lower)) {
    tokens.push("elevation:birds-eye");
    return "birds-eye";
  }
  if (/웜즈아이|극단\s*로우|바닥\s*앙각|worm'?s?[-\s]?eye/.test(lower)) {
    tokens.push("elevation:worms-eye");
    return "worms-eye";
  }
  if (/하이\s*앵글|내려다보|high[-\s]?angle/.test(lower)) {
    tokens.push("elevation:high");
    return "high";
  }
  if (/로우\s*앵글|올려다보|앙각|low[-\s]?angle/.test(lower)) {
    tokens.push("elevation:low");
    return "low";
  }
  if (/아이\s*레벨|눈높이|eye[-\s]?level/.test(lower)) {
    tokens.push("elevation:eye");
    return "eye";
  }
  return "eye";
}

function detectPostureForSide(
  lower: string,
  sidePattern: RegExp,
  globalFallback: boolean,
): ActorPosturePreset {
  const sideMatch = lower.match(sidePattern);
  const targetSlice = sideMatch ? sideMatch[0] : globalFallback ? lower : "";
  if (/무릎|꿇|kneel/.test(targetSlice)) return "kneeling";
  if (/착석|앉|의자|seat|sit/.test(targetSlice)) return "seated";
  return "standing";
}

/**
 * 한글·영문 단문 샷 설명을 오프라인 결정론적 3D 샷 그래머 IR로 컴파일한다. (LLM 미사용)
 */
export function parseShotGrammar(prompt: string): CompiledShotGrammarIR {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const recognizedTokens: string[] = [];

  const shotSize = detectShotSize(lower, recognizedTokens);
  const framingStyle = detectFramingStyle(lower, recognizedTokens);
  const cameraElevation = detectCameraElevation(lower, recognizedTokens);

  const focalMatch = lower.match(/(\d{2,3})\s*mm/);
  const focalLengthMm = focalMatch
    ? clamp(Number.parseInt(focalMatch[1], 10), 14, 200)
    : SHOT_SIZE_DEFAULT_FOCAL_MM[shotSize];
  if (focalMatch) {
    recognizedTokens.push(`lens:${focalLengthMm}mm`);
  }

  const dutchMatch = lower.match(/(?:더치|dutch)(?:\s*앵글|\s*tilt)?\s*(-?\d{1,2})?/);
  let dutchDeg = 0;
  if (dutchMatch) {
    dutchDeg = clamp(dutchMatch[1] ? Number.parseInt(dutchMatch[1], 10) : 15, -45, 45);
    recognizedTokens.push(`dutch:${dutchDeg}deg`);
  }

  const leftPosture = detectPostureForSide(
    lower,
    /(?:왼쪽|좌측|left)[^,.;\n]*/,
    framingStyle === "single",
  );
  const rightPosture = detectPostureForSide(
    lower,
    /(?:오른쪽|우측|right)[^,.;\n]*/,
    false,
  );

  const actors: CompiledActorPlacement[] = [];
  const lookAtPairs: ActorLookAtPair[] = [];

  if (framingStyle === "single") {
    actors.push({
      id: "actor-a",
      label: "인물 A",
      slot: "center",
      posture: leftPosture,
      positionXZ: [0, 0],
      eyeHeightM: POSTURE_EYE_HEIGHT_M[leftPosture],
      facingYawDeg: 0,
    });
  } else if (framingStyle === "two-shot" || framingStyle === "ots") {
    const ax = -1.1;
    const bx = 1.1;
    actors.push(
      {
        id: "actor-a",
        label: "인물 A (좌)",
        slot: framingStyle === "ots" ? "foreground-left" : "left",
        posture: leftPosture,
        positionXZ: [ax, 0],
        eyeHeightM: POSTURE_EYE_HEIGHT_M[leftPosture],
        facingYawDeg: yawFromDeltaXZ(bx - ax, 0),
      },
      {
        id: "actor-b",
        label: "인물 B (우)",
        slot: "right",
        posture: rightPosture,
        positionXZ: [bx, 0],
        eyeHeightM: POSTURE_EYE_HEIGHT_M[rightPosture],
        facingYawDeg: yawFromDeltaXZ(ax - bx, 0),
      },
    );
    lookAtPairs.push(
      { observerId: "actor-a", targetId: "actor-b" },
      { observerId: "actor-b", targetId: "actor-a" },
    );
  } else {
    actors.push(
      {
        id: "actor-a",
        label: "인물 A (좌)",
        slot: "left",
        posture: leftPosture,
        positionXZ: [-1.4, -0.35],
        eyeHeightM: POSTURE_EYE_HEIGHT_M[leftPosture],
        facingYawDeg: 35,
      },
      {
        id: "actor-b",
        label: "인물 B (중앙)",
        slot: "center",
        posture: "standing",
        positionXZ: [0, 0.35],
        eyeHeightM: POSTURE_EYE_HEIGHT_M.standing,
        facingYawDeg: 180,
      },
      {
        id: "actor-c",
        label: "인물 C (우)",
        slot: "right",
        posture: rightPosture,
        positionXZ: [1.4, -0.35],
        eyeHeightM: POSTURE_EYE_HEIGHT_M[rightPosture],
        facingYawDeg: 325,
      },
    );
    lookAtPairs.push(
      { observerId: "actor-a", targetId: "actor-b" },
      { observerId: "actor-c", targetId: "actor-b" },
    );
  }

  const baseDist = SHOT_SIZE_CAMERA_DISTANCE_M[shotSize];
  let cameraPositionXZ: Vec2XZ;
  let cameraTargetXZ: Vec2XZ;

  if (framingStyle === "ots" && actors.length >= 2) {
    // 전경 인물 A 어깨 뒤(+Z 쪽)에서 인물 B를 바라보는 오버더숄더 카메라
    cameraPositionXZ = [actors[0].positionXZ[0] - 0.65, 1.35];
    cameraTargetXZ = [actors[1].positionXZ[0], actors[1].positionXZ[1]];
  } else {
    cameraPositionXZ = [0, baseDist];
    cameraTargetXZ = [0, 0];
  }

  const avgEyeHeight =
    actors.reduce((sum, actor) => sum + actor.eyeHeightM, 0) / Math.max(1, actors.length);
  const cameraHeightM =
    cameraElevation === "worms-eye"
      ? 0.25
      : cameraElevation === "low"
        ? Math.max(0.45, avgEyeHeight - 0.55)
        : cameraElevation === "high"
          ? avgEyeHeight + 1.15
          : cameraElevation === "birds-eye"
            ? avgEyeHeight + 3.4
            : avgEyeHeight;

  return {
    rawPrompt: trimmed,
    shotSize,
    framingStyle,
    focalLengthMm,
    cameraElevation,
    dutchDeg,
    cameraPositionXZ,
    cameraHeightM: Number(cameraHeightM.toFixed(3)),
    cameraTargetXZ,
    actors,
    lookAtPairs,
    recognizedTokens,
  };
}

/**
 * 180도 가상선(Actor A -> Actor B) 대비 카메라의 좌/우 반평면 부호 sign((C - A) × (B - A))를 반환한다.
 */
export function computeLineOfActionSideSign(
  actorAXZ: Vec2XZ,
  actorBXZ: Vec2XZ,
  cameraXZ: Vec2XZ,
): -1 | 0 | 1 {
  const cax = cameraXZ[0] - actorAXZ[0];
  const caz = cameraXZ[1] - actorAXZ[1];
  const bax = actorBXZ[0] - actorAXZ[0];
  const baz = actorBXZ[1] - actorAXZ[1];
  const cross = cax * baz - caz * bax;
  if (Math.abs(cross) <= 1e-5) return 0;
  return cross > 0 ? 1 : -1;
}

/**
 * 샷 그래머 IR에서 2D 평면도(XZ) 배우 마커, 시선 벡터, 카메라 프러스텀, 가상선 부호를 계산한다.
 */
export function buildOverheadFloorplan(
  ir: CompiledShotGrammarIR,
  options?: { readonly frustumDepthM?: number; readonly sensorWidthMm?: number },
): OverheadFloorplan2D {
  const sensorW = clamp(options?.sensorWidthMm ?? 36, 12, 70);
  const frustumDepth = clamp(options?.frustumDepthM ?? 4.5, 1, 25);
  const halfFovRad = Math.atan(sensorW / (2 * ir.focalLengthMm));
  const horizontalFovDeg = Number(((halfFovRad * 2 * 180) / Math.PI).toFixed(2));

  const camX = ir.cameraPositionXZ[0];
  const camZ = ir.cameraPositionXZ[1];
  const dirX = ir.cameraTargetXZ[0] - camX;
  const dirZ = ir.cameraTargetXZ[1] - camZ;
  const dirLen = Math.hypot(dirX, dirZ) || 1;
  const fx = dirX / dirLen;
  const fz = dirZ / dirLen;
  const rx = -fz;
  const rz = fx;
  const halfSpan = Math.tan(halfFovRad) * frustumDepth;

  const farLeft: Vec2XZ = [
    camX + fx * frustumDepth - rx * halfSpan,
    camZ + fz * frustumDepth - rz * halfSpan,
  ];
  const farRight: Vec2XZ = [
    camX + fx * frustumDepth + rx * halfSpan,
    camZ + fz * frustumDepth + rz * halfSpan,
  ];

  const actorMarkers: OverheadFloorplanActorMarker[] = ir.actors.map((actor) => {
    const yawRad = (actor.facingYawDeg * Math.PI) / 180;
    return {
      actorId: actor.id,
      label: actor.label,
      x: actor.positionXZ[0],
      z: actor.positionXZ[1],
      posture: actor.posture,
      gazeVectorXZ: [Number(Math.sin(yawRad).toFixed(4)), Number(Math.cos(yawRad).toFixed(4))],
    };
  });

  const lineOfActionSegment: readonly [Vec2XZ, Vec2XZ] | null =
    ir.actors.length >= 2
      ? [ir.actors[0].positionXZ, ir.actors[1].positionXZ]
      : null;

  const cameraSideSign: -1 | 0 | 1 = lineOfActionSegment
    ? computeLineOfActionSideSign(
        lineOfActionSegment[0],
        lineOfActionSegment[1],
        ir.cameraPositionXZ,
      )
    : 0;

  const allX = [camX, farLeft[0], farRight[0], ...actorMarkers.map((a) => a.x)];
  const allZ = [camZ, farLeft[1], farRight[1], ...actorMarkers.map((a) => a.z)];

  return {
    actors: actorMarkers,
    camera: {
      x: camX,
      z: camZ,
      targetX: ir.cameraTargetXZ[0],
      targetZ: ir.cameraTargetXZ[1],
      focalLengthMm: ir.focalLengthMm,
      horizontalFovDeg,
      frustumPolygonXZ: [[camX, camZ], farLeft, farRight],
    },
    lineOfActionSegment,
    cameraSideSign,
    boundsXZ: {
      minX: Math.min(...allX) - 1,
      maxX: Math.max(...allX) + 1,
      minZ: Math.min(...allZ) - 1,
      maxZ: Math.max(...allZ) + 1,
    },
  };
}

/**
 * 직전 컷과 현재 컷의 평면도를 비교해 180도 가상선 월선(axis-cross) 여부를 판정한다.
 */
export function evaluateLineOfAction180Guard(
  previousFloorplan: OverheadFloorplan2D | null,
  currentFloorplan: OverheadFloorplan2D,
  options?: { readonly intentionalAxisCrossApproved?: boolean },
): LineOfActionGuardResult {
  if (!currentFloorplan.lineOfActionSegment || !previousFloorplan?.lineOfActionSegment) {
    return {
      hasLineOfAction: Boolean(currentFloorplan.lineOfActionSegment),
      previousSideSign: previousFloorplan?.cameraSideSign ?? 0,
      currentSideSign: currentFloorplan.cameraSideSign,
      axisCrossed: false,
      status: "insufficient-actors",
      message: "180도 가상선 비교를 위해 직전·현재 컷 모두 2인 이상 배치가 필요합니다.",
    };
  }

  const prevSign = previousFloorplan.cameraSideSign;
  const currSign = currentFloorplan.cameraSideSign;
  const axisCrossed = prevSign !== 0 && currSign !== 0 && prevSign !== currSign;

  if (!axisCrossed) {
    return {
      hasLineOfAction: true,
      previousSideSign: prevSign,
      currentSideSign: currSign,
      axisCrossed: false,
      status: "safe",
      message: "180도 가상선 반평면이 일관되게 유지되고 있습니다.",
    };
  }

  if (options?.intentionalAxisCrossApproved) {
    return {
      hasLineOfAction: true,
      previousSideSign: prevSign,
      currentSideSign: currSign,
      axisCrossed: true,
      status: "intentional-override-approved",
      message: "의도적 가상선 월선이 승인되어 연출 전환으로 기록되었습니다.",
    };
  }

  return {
    hasLineOfAction: true,
    previousSideSign: prevSign,
    currentSideSign: currSign,
    axisCrossed: true,
    status: "axis-cross-warning",
    message:
      "경고: 직전 컷과 반대쪽 반평면으로 카메라가 넘어가 인물 좌우 시선이 역전됩니다(180도 가상선 월선).",
  };
}

/**
 * 현재 3D 샷 구도를 2D 스토리보드 러프 스케치 레이어(LT 추출 연동)로 투하하기 위한 스냅샷 명세를 생성한다.
 */
export function createStoryboardCutSnapshotSpec(
  cutId: string,
  ir: CompiledShotGrammarIR,
  previousFloorplan: OverheadFloorplan2D | null = null,
  options?: {
    readonly aspectRatio?: number;
    readonly roughSketchOpacity01?: number;
    readonly intentionalAxisCrossApproved?: boolean;
  },
): StoryboardCutSnapshotSpec {
  const floorplan = buildOverheadFloorplan(ir);
  const axisGuard = evaluateLineOfAction180Guard(previousFloorplan, floorplan, {
    intentionalAxisCrossApproved: options?.intentionalAxisCrossApproved,
  });

  const elevationLabel: Record<CameraElevationPreset, string> = {
    "worms-eye": "극단 로우앵글",
    low: "로우앵글",
    eye: "아이레벨",
    high: "하이앵글",
    "birds-eye": "부감",
  };

  const captionSummaryKo = `${ir.shotSize} · ${ir.framingStyle} · ${ir.focalLengthMm}mm · ${elevationLabel[ir.cameraElevation]} (${ir.actors.length}인)`;

  return {
    cutId,
    shotGrammar: ir,
    floorplan,
    axisGuard,
    ltExtractionPreset: {
      passSet: ["main-line", "shadow-mask", "depth-map"],
      focalLengthMm: ir.focalLengthMm,
      aspectRatio: clamp(options?.aspectRatio ?? 16 / 9, 0.4, 3),
      roughSketchOpacity01: clamp(options?.roughSketchOpacity01 ?? 0.55, 0.1, 1),
    },
    captionSummaryKo,
  };
}
