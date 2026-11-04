/**
 * @file csp-hand-setup-pad.ts
 * @description Clip Studio Paint 5.1.5 3D 핸드 셋업 컨트롤러 6종 포즈 프리셋(`handsetup_gu00..03.pep`, `handsetup_pa00..01.pep`) 및
 * 2D 핸드 포즈 패드(가로: 손가락 벌림 `pa01`↔`pa00`, 세로: 주먹 쥐기 `gu00..03`) 구면 선형 보간(SLERP) 엔진.
 */

export type CspHandFingerJointName =
  | "lefthandthumb1_bb_"
  | "lefthandthumb2_bb_"
  | "lefthandthumb3_bb_"
  | "lefthandindex1_bb_"
  | "lefthandindex2_bb_"
  | "lefthandindex3_bb_"
  | "lefthandmiddle1_bb_"
  | "lefthandmiddle2_bb_"
  | "lefthandmiddle3_bb_"
  | "lefthandring1_bb_"
  | "lefthandring2_bb_"
  | "lefthandring3_bb_"
  | "lefthandpinky1_bb_"
  | "lefthandpinky2_bb_"
  | "lefthandpinky3_bb_";

export type CspWxyzQuaternion = readonly [number, number, number, number];

export type CspHandSetupPresetId = "gu00" | "gu01" | "gu02" | "gu03" | "pa00" | "pa01";

export interface CspHandSetupPresetSpec {
  readonly presetId: CspHandSetupPresetId;
  readonly fileName: string;
  readonly aliasName: string;
  readonly descriptionKo: string;
  readonly joints: Readonly<Record<CspHandFingerJointName, CspWxyzQuaternion>>;
}

export const CSP_HAND_FINGER_JOINT_NAMES: readonly CspHandFingerJointName[] = [
  "lefthandthumb1_bb_",
  "lefthandthumb2_bb_",
  "lefthandthumb3_bb_",
  "lefthandindex1_bb_",
  "lefthandindex2_bb_",
  "lefthandindex3_bb_",
  "lefthandmiddle1_bb_",
  "lefthandmiddle2_bb_",
  "lefthandmiddle3_bb_",
  "lefthandring1_bb_",
  "lefthandring2_bb_",
  "lefthandring3_bb_",
  "lefthandpinky1_bb_",
  "lefthandpinky2_bb_",
  "lefthandpinky3_bb_",
] as const;

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/handsetup_*.pep` 6종에서
 * 직접 추출한 15개 손가락 관절 회전 쿼터니언(`[w, x, y, z]`) 테이블.
 */
export const CSP_HAND_SETUP_PEP_PRESETS: Readonly<
  Record<CspHandSetupPresetId, CspHandSetupPresetSpec>
> = {
  pa00: {
    presetId: "pa00",
    fileName: "handsetup_pa00.pep",
    aliasName: "パー修正_石田",
    descriptionKo: "손가락을 넓게 펼친 보(Open Spread Palm) 기준 포즈 (상단 우측 코너)",
    joints: {
      lefthandthumb1_bb_: [0.87021, 0.474778, -0.100285, 0.085226],
      lefthandthumb2_bb_: [0.981718, 0.0, 0.0, -0.190343],
      lefthandthumb3_bb_: [0.991445, 0.0, 0.0, 0.130526],
      lefthandindex1_bb_: [0.996957, 0.006221, 0.07339, -0.025531],
      lefthandindex2_bb_: [0.997945, 0.0, 0.0, 0.064084],
      lefthandindex3_bb_: [0.999601, 0.0, 0.0, 0.02826],
      lefthandmiddle1_bb_: [0.998835, -0.001661, 0.045686, -0.015429],
      lefthandmiddle2_bb_: [0.997564, 0.0, 0.0, 0.069756],
      lefthandmiddle3_bb_: [0.999734, 0.0, 0.0, 0.023078],
      lefthandring1_bb_: [0.998877, -0.003086, 0.036793, -0.029687],
      lefthandring2_bb_: [0.997564, 0.0, 0.0, 0.069756],
      lefthandring3_bb_: [0.998415, 0.0, 0.0, 0.056288],
      lefthandpinky1_bb_: [0.999099, -0.003146, 0.01628, -0.03906],
      lefthandpinky2_bb_: [0.99823, 0.0, 0.0, 0.059465],
      lefthandpinky3_bb_: [0.999243, 0.0, 0.0, 0.038906],
    },
  },
  pa01: {
    presetId: "pa01",
    fileName: "handsetup_pa01.pep",
    aliasName: "平手",
    descriptionKo: "손가락을 가지런히 모은 평손(Closed Flat Palm) 기준 포즈 (상단 좌측 코너)",
    joints: {
      lefthandthumb1_bb_: [0.751581, 0.49883, -0.398714, 0.165293],
      lefthandthumb2_bb_: [0.997564, 0.0, 0.0, 0.069756],
      lefthandthumb3_bb_: [0.991445, 0.0, 0.0, 0.130526],
      lefthandindex1_bb_: [0.994261, 0.0, -0.106983, 0.000207],
      lefthandindex2_bb_: [0.997564, 0.0, 0.0, 0.069757],
      lefthandindex3_bb_: [0.991445, 0.0, 0.0, 0.130526],
      lefthandmiddle1_bb_: [0.998942, -0.007309, 0.025273, 0.037708],
      lefthandmiddle2_bb_: [0.997564, 0.0, 0.0, 0.069756],
      lefthandmiddle3_bb_: [0.991695, 0.0, 0.0, 0.128612],
      lefthandring1_bb_: [0.993406, 0.0, 0.11217, 0.023697],
      lefthandring2_bb_: [0.997564, 0.0, 0.0, 0.069756],
      lefthandring3_bb_: [0.991445, 0.0, 0.0, 0.130526],
      lefthandpinky1_bb_: [0.949552, -0.000671, 0.30217, -0.083927],
      lefthandpinky2_bb_: [0.997564, 0.0, 0.0, 0.069756],
      lefthandpinky3_bb_: [0.991445, 0.0, 0.0, 0.130526],
    },
  },
  gu00: {
    presetId: "gu00",
    fileName: "handsetup_gu00.pep",
    aliasName: "グー003",
    descriptionKo: "기본 주먹 쥐기(Standard Clenched Fist) 프리셋 1",
    joints: {
      lefthandthumb1_bb_: [0.628695, 0.678739, -0.32333, -0.19878],
      lefthandthumb2_bb_: [0.870364, 0.0, 0.0, -0.49241],
      lefthandthumb3_bb_: [0.869974, 0.0, 0.0, -0.493097],
      lefthandindex1_bb_: [0.710968, 0.05732, 0.0061, -0.700858],
      lefthandindex2_bb_: [0.559192, 0.0, 0.0, -0.829038],
      lefthandindex3_bb_: [0.67363, 0.175655, 0.169629, -0.697563],
      lefthandmiddle1_bb_: [0.679109, -0.000626, 0.030809, -0.73339],
      lefthandmiddle2_bb_: [0.573576, 0.0, 0.0, -0.819152],
      lefthandmiddle3_bb_: [0.694658, 0.0, 0.0, -0.71934],
      lefthandring1_bb_: [0.697373, -0.091626, 0.056963, -0.708541],
      lefthandring2_bb_: [0.601815, 0.0, 0.0, -0.798636],
      lefthandring3_bb_: [0.694658, 0.0, 0.0, -0.71934],
      lefthandpinky1_bb_: [0.653746, -0.137339, 0.008617, -0.744097],
      lefthandpinky2_bb_: [0.608761, 0.0, 0.0, -0.793353],
      lefthandpinky3_bb_: [0.694658, 0.0, 0.0, -0.71934],
    },
  },
  gu01: {
    presetId: "gu01",
    fileName: "handsetup_gu01.pep",
    aliasName: "猫手改",
    descriptionKo: "고양이 손/갈퀴 오므리기(Cat Paw / Half-Curled) 프리셋 2",
    joints: {
      lefthandthumb1_bb_: [0.696421, 0.630242, -0.341823, -0.030812],
      lefthandthumb2_bb_: [0.944383, 0.0, 0.0, -0.328846],
      lefthandthumb3_bb_: [0.989016, 0.0, 0.0, -0.147812],
      lefthandindex1_bb_: [0.915759, 0.051132, 0.05778, -0.394248],
      lefthandindex2_bb_: [0.882464, 0.0, 0.0, -0.47038],
      lefthandindex3_bb_: [0.760457, 0.0, 0.0, -0.649389],
      lefthandmiddle1_bb_: [0.912477, -0.003097, 0.081193, -0.400979],
      lefthandmiddle2_bb_: [0.838722, 0.0, 0.0, -0.54456],
      lefthandmiddle3_bb_: [0.705438, 0.0, 0.0, -0.708771],
      lefthandring1_bb_: [0.920611, -0.0523, 0.084658, -0.377588],
      lefthandring2_bb_: [0.797301, 0.0, 0.0, -0.603582],
      lefthandring3_bb_: [0.781993, 0.0, 0.0, -0.623287],
      lefthandpinky1_bb_: [0.902721, -0.091638, 0.047405, -0.417673],
      lefthandpinky2_bb_: [0.84267, 0.0, 0.0, -0.53843],
      lefthandpinky3_bb_: [0.699597, 0.0, 0.0, -0.714538],
    },
  },
  gu02: {
    presetId: "gu02",
    fileName: "handsetup_gu02.pep",
    aliasName: "筒５",
    descriptionKo: "원통/봉 쥐기(Cylinder Grip) 프리셋 3",
    joints: {
      lefthandthumb1_bb_: [0.543668, 0.707388, -0.411633, -0.185971],
      lefthandthumb2_bb_: [0.910767, 0.0, 0.0, -0.412921],
      lefthandthumb3_bb_: [0.900326, 0.0, 0.0, -0.435215],
      lefthandindex1_bb_: [0.862773, 0.044765, 0.000231, -0.503606],
      lefthandindex2_bb_: [0.796273, 0.0, 0.0, -0.604938],
      lefthandindex3_bb_: [0.864241, 0.0, 0.0, -0.503078],
      lefthandmiddle1_bb_: [0.842275, -0.003446, 0.048959, -0.53681],
      lefthandmiddle2_bb_: [0.760052, 0.0, 0.0, -0.649863],
      lefthandmiddle3_bb_: [0.840091, 0.0, 0.0, -0.542445],
      lefthandring1_bb_: [0.856787, -0.041421, 0.056666, -0.51087],
      lefthandring2_bb_: [0.737156, 0.0, 0.0, -0.675723],
      lefthandring3_bb_: [0.935121, 0.0, 0.0, -0.354329],
      lefthandpinky1_bb_: [0.856718, -0.100426, 0.074304, -0.500428],
      lefthandpinky2_bb_: [0.687224, 0.0, 0.0, -0.726445],
      lefthandpinky3_bb_: [0.979105, 0.0, 0.0, -0.203356],
    },
  },
  gu03: {
    presetId: "gu03",
    fileName: "handsetup_gu03.pep",
    aliasName: "差し棒３",
    descriptionKo: "검지 가리키기/지휘봉 그립(Pointing Index / Baton Grip) 프리셋 4",
    joints: {
      lefthandthumb1_bb_: [0.813257, 0.559895, -0.158497, -0.003141],
      lefthandthumb2_bb_: [0.981028, 0.0, 0.0, -0.193866],
      lefthandthumb3_bb_: [0.999279, 0.0, 0.0, 0.037956],
      lefthandindex1_bb_: [0.961242, 0.006696, 0.082269, -0.263058],
      lefthandindex2_bb_: [0.718516, 0.0, 0.0, -0.695511],
      lefthandindex3_bb_: [0.694658, 0.0, 0.0, -0.71934],
      lefthandmiddle1_bb_: [0.870458, -0.015193, 0.078727, -0.48567],
      lefthandmiddle2_bb_: [0.578751, 0.0, 0.0, -0.815505],
      lefthandmiddle3_bb_: [0.695855, 0.0, 0.0, -0.718182],
      lefthandring1_bb_: [0.77259, -0.053173, 0.066992, -0.629118],
      lefthandring2_bb_: [0.606795, 0.0, 0.0, -0.794858],
      lefthandring3_bb_: [0.712742, 0.0, 0.0, -0.701426],
      lefthandpinky1_bb_: [0.72396, -0.104284, 0.067099, -0.678605],
      lefthandpinky2_bb_: [0.608761, 0.0, 0.0, -0.793354],
      lefthandpinky3_bb_: [0.697495, 0.0, 0.0, -0.71659],
    },
  },
};

function slerpWxyz(
  q0: CspWxyzQuaternion,
  q1: CspWxyzQuaternion,
  t01: number,
): CspWxyzQuaternion {
  const t = Math.max(0, Math.min(1, t01));
  const [w0, x0, y0, z0] = q0;
  let [w1, x1, y1, z1] = q1;

  let dot = w0 * w1 + x0 * x1 + y0 * y1 + z0 * z1;
  if (dot < 0) {
    dot = -dot;
    w1 = -w1;
    x1 = -x1;
    y1 = -y1;
    z1 = -z1;
  }

  let s0: number;
  let s1: number;
  if (dot > 0.9995) {
    s0 = 1 - t;
    s1 = t;
  } else {
    const theta0 = Math.acos(Math.min(1, dot));
    const sinTheta0 = Math.sin(theta0);
    s0 = Math.sin((1 - t) * theta0) / sinTheta0;
    s1 = Math.sin(t * theta0) / sinTheta0;
  }

  const rw = s0 * w0 + s1 * w1;
  const rx = s0 * x0 + s1 * x1;
  const ry = s0 * y0 + s1 * y1;
  const rz = s0 * z0 + s1 * z1;
  const norm = Math.hypot(rw, rx, ry, rz) || 1;
  return [rw / norm, rx / norm, ry / norm, rz / norm];
}

export type CspHandFingerGroup = "thumb" | "index" | "middle" | "ring" | "pinky";

export interface CspHandSetupPadPoseResult {
  readonly spreadX01: number;
  readonly fistY01: number;
  readonly fistPresetId: "gu00" | "gu01" | "gu02" | "gu03";
  readonly handSide: "left" | "right";
  readonly boneQuaternionsWxyz: Readonly<Record<string, CspWxyzQuaternion>>;
}

/**
 * 클립스튜디오 3D 데생 인형의 2D 핸드 셋업 패드(가로: 손가락 벌림 `pa01`↔`pa00`, 세로: 주먹 쥐기 `gu00..03`)를
 * 구면 선형 보간(SLERP)하여 15개 관절 쿼터니언을 산출합니다.
 */
export function interpolateCspHandSetupPadPose(params: {
  readonly spreadX01: number;
  readonly fistY01: number;
  readonly fistPresetId?: "gu00" | "gu01" | "gu02" | "gu03";
  readonly handSide?: "left" | "right";
  readonly lockedFingers?: Readonly<Partial<Record<CspHandFingerGroup, CspWxyzQuaternion>>>;
}): CspHandSetupPadPoseResult {
  const spreadX01 = Math.max(0, Math.min(1, params.spreadX01));
  const fistY01 = Math.max(0, Math.min(1, params.fistY01));
  const fistPresetId = params.fistPresetId ?? "gu00";
  const handSide = params.handSide ?? "left";

  const paClosed = CSP_HAND_SETUP_PEP_PRESETS.pa01.joints;
  const paSpread = CSP_HAND_SETUP_PEP_PRESETS.pa00.joints;
  const guTarget = CSP_HAND_SETUP_PEP_PRESETS[fistPresetId].joints;

  const out: Record<string, CspWxyzQuaternion> = {};

  for (const jointName of CSP_HAND_FINGER_JOINT_NAMES) {
    const fingerGroup: CspHandFingerGroup = jointName.includes("thumb")
      ? "thumb"
      : jointName.includes("index")
        ? "index"
        : jointName.includes("middle")
          ? "middle"
          : jointName.includes("ring")
            ? "ring"
            : "pinky";

    const lockedQuat = params.lockedFingers?.[fingerGroup];
    let qFinal: CspWxyzQuaternion;
    if (lockedQuat) {
      qFinal = lockedQuat;
    } else {
      const qTop = slerpWxyz(paClosed[jointName], paSpread[jointName], spreadX01);
      qFinal = slerpWxyz(qTop, guTarget[jointName], fistY01);
    }

    if (handSide === "right") {
      const rightName = jointName.replace(/^lefthand/, "righthand");
      out[rightName] = [qFinal[0], qFinal[1], -qFinal[2], -qFinal[3]];
    } else {
      out[jointName] = qFinal;
    }
  }

  return {
    spreadX01,
    fistY01,
    fistPresetId,
    handSide,
    boneQuaternionsWxyz: out,
  };
}

function readPepXmlAttr(tagText: string, attrName: string): string {
  const regex = new RegExp(`${attrName}="([^"]*)"`, "i");
  const match = regex.exec(tagText);
  return match?.[1] ?? "";
}

function findPepOpenTag(xmlText: string, tagName: string): string {
  const lower = xmlText.toLowerCase();
  const needle = `<${tagName.toLowerCase()}`;
  let pos = 0;
  while (pos < lower.length) {
    const idx = lower.indexOf(needle, pos);
    if (idx < 0) return "";
    const nextChar = lower[idx + needle.length];
    if (nextChar === ">" || nextChar === "/" || (nextChar !== undefined && /\s/.test(nextChar))) {
      const endIdx = xmlText.indexOf(">", idx + needle.length);
      return endIdx >= 0 ? xmlText.slice(idx, endIdx + 1) : "";
    }
    pos = idx + needle.length;
  }
  return "";
}

/**
 * `handsetup_*.pep` (`<celsysdocument><pose><node rotquat="...">`) XML을 파싱합니다.
 */
export function parseCspHandSetupPepXml(xmlText: string): {
  readonly aliasName: string;
  readonly searchTags: string;
  readonly tool: string;
  readonly joints: Readonly<Record<string, CspWxyzQuaternion>>;
} {
  const infoTag = findPepOpenTag(xmlText, "info");
  const poseTag = findPepOpenTag(xmlText, "pose");
  const joints: Record<string, CspWxyzQuaternion> = {};

  const lower = xmlText.toLowerCase();
  let pos = 0;
  while (pos < lower.length) {
    const idx = lower.indexOf("<node", pos);
    if (idx < 0) break;
    const nextChar = lower[idx + 5];
    if (nextChar !== undefined && /\s/.test(nextChar)) {
      const endIdx = xmlText.indexOf(">", idx + 5);
      if (endIdx < 0) break;
      const attrs = xmlText.slice(idx + 5, endIdx);
      const name = readPepXmlAttr(attrs, "name");
      const rqStr = readPepXmlAttr(attrs, "rotquat");
      if (name.length > 0 && rqStr.length > 0) {
        const nums = rqStr.trim().split(/\s+/).map((s) => Number.parseFloat(s));
        if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
          joints[name] = [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
        }
      }
      pos = endIdx + 1;
    } else {
      pos = idx + 5;
    }
  }

  return {
    aliasName: poseTag ? readPepXmlAttr(poseTag, "alias_name") : "",
    searchTags: poseTag ? readPepXmlAttr(poseTag, "search_tags") : "",
    tool: infoTag ? readPepXmlAttr(infoTag, "tool") : "Celsys PoseStudio 1.0",
    joints,
  };
}
