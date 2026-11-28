import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";

export const UNIT_CAP_RADIUS = [0.56, 0.46, 0.54] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const FLOWING_BACK_SHELL_IDS = new Set(["back", "wavy-back", "hime-back", "halfup-back"]);

/** 귀를 드러내고 한쪽으로 넘긴 픽시 커트. 슬라이더로 정한 길이에 비례해 끝선을 다듬는다. */
export function cropPixieHairPart(part: AvatarForgeHairPart, swept: boolean): AvatarForgeHairPart {
  if (part.role === "cap") return { ...part, id: "cap-pixie" };
  const [x, y, z] = part.position;
  const [width, length, depth] = part.scale;
  if (part.role === "bang" && swept) {
    const across = clamp((x + 0.35) / 0.7, 0, 1);
    return { ...part, rotation: [part.rotation[0], part.rotation[1], 0.52 + across * 0.29],
      scale: [width * 1.11, length * (1.12 + across * 0.78), depth], taper: Math.max(0.68, part.taper) };
  }
  if (part.role === "side" && y < 0.18) {
    return { ...part, position: [x, 0.18 + (y - 0.18) * 0.5, z], scale: [width, length * 0.55, depth] };
  }
  return part;
}

const SOFTENED_SIDE_PILLAR_IDS = new Set([
  "side-left",
  "side-right",
  "wavy-side-left",
  "wavy-side-right",
  "halfup-side-left",
  "halfup-side-right",
]);

export function refineBasePartForRender(part: AvatarForgeHairPart): AvatarForgeHairPart {
  if (part.id === "wolf-layer") {
    // 뒤통수에 달린 구 대신 윗머리 아래로 조각난 목덜미 층이 이어지게 한다.
    return { ...part, position: [0, -0.13, -0.24], scale: [part.scale[0], part.scale[1] * 1.3, part.scale[2]] };
  }
  if (part.id.startsWith("wolf-nape-")) {
    const [width, length, depth] = part.scale;
    const [x, y, z] = part.position;
    return { ...part, position: [x, y * 0.64, z], scale: [width * 1.32, length * 0.73, depth] };
  }
  // 기본 캡이 헬멧 돔처럼 부풀어 보이지 않도록 렌더 캡의 과잉 볼륨을 두상 밀착 비율(약 3.0~3.5%)로 다듬는다.
  if (part.role === "cap") {
    const tightCapAxis = (value: number, unitRadius: number) => {
      const ratio = Math.abs(value) / unitRadius;
      const tightened = ratio <= 1
        ? clamp(0.68 * ratio, 0.55, 0.68)
        : 0.68 + (ratio - 1) * 1.12;
      return unitRadius * tightened;
    };
    return {
      ...part,
      scale: [
        tightCapAxis(part.scale[0], UNIT_CAP_RADIUS[0]),
        tightCapAxis(part.scale[1], UNIT_CAP_RADIUS[1]),
        tightCapAxis(part.scale[2], UNIT_CAP_RADIUS[2]),
      ],
    };
  }
  // 딱딱한 직사각형 기둥처럼 보이던 기본 사이드락을 부드러운 S-웨이브·테이퍼 리본으로 다듬는다.
  if (SOFTENED_SIDE_PILLAR_IDS.has(part.id)) {
    return {
      ...part,
      scale: [part.scale[0] * 0.84, part.scale[1], part.scale[2] * 0.86],
      taper: Math.max(part.taper, 0.56),
      curl: Math.max(part.curl, 0.2),
      wave: Math.max(part.wave ?? 0, 0.26),
      waveFrequency: part.waveFrequency ?? 2.5,
    };
  }
  if (part.id === "hime-lock-left" || part.id === "hime-lock-right") {
    return {
      ...part,
      scale: [part.scale[0] * 0.88, part.scale[1], part.scale[2] * 0.84],
      taper: Math.max(part.taper, 0.14),
    };
  }
  // 뒷머리 타원체는 가닥 사이 빈틈을 막는 내피 코어 역할로 줄이고 외곽 실루엣은 다층 드레이프 리본이 맡는다.
  if (part.role === "back" && part.primitive === "ellipsoid" && FLOWING_BACK_SHELL_IDS.has(part.id)) {
    return {
      ...part,
      scale: [part.scale[0] * 0.88, part.scale[1] * 0.88, part.scale[2] * 0.82],
    };
  }
  return part;
}
