import type { AvatarForgeBangStyle, AvatarForgeHairPart, AvatarForgeHairStyle } from "./studio-vrm-avatar-forge";
import type { AvatarForgeHairAccentMode } from "./studio-vrm-avatar-forge-hair-color";

export const FRONT_HAIR_PART_OPTIONS = Object.freeze([
  { id: "front-full-bang", labelKo: "풀뱅" },
  { id: "front-see-through", labelKo: "시스루 뱅" },
  { id: "front-center-part", labelKo: "가운데 가르마" },
  { id: "front-side-swept", labelKo: "사이드 스웹" },
  { id: "front-curtain", labelKo: "커튼 뱅" },
  { id: "front-m-bang", labelKo: "M자 뱅" },
  { id: "front-slick-back", labelKo: "올백" },
  { id: "front-asym-bang", labelKo: "비대칭 뱅" },
] as const);

export const SIDE_HAIR_PART_OPTIONS = Object.freeze([
  { id: "side-hime", labelKo: "히메컷" },
  { id: "side-layered", labelKo: "레이어드" },
  { id: "side-tucked", labelKo: "귀 뒤 넘김" },
  { id: "side-short-burn", labelKo: "짧은 구레나룻" },
  { id: "side-wave", labelKo: "웨이브 사이드" },
  { id: "side-none", labelKo: "옆머리 없음" },
] as const);

export const BACK_HAIR_PART_OPTIONS = Object.freeze([
  { id: "back-short", labelKo: "숏컷" },
  { id: "back-bob", labelKo: "단발 보브" },
  { id: "back-wolf", labelKo: "울프컷" },
  { id: "back-long-straight", labelKo: "롱 스트레이트" },
  { id: "back-long-wave", labelKo: "웨이브 롱" },
  { id: "back-high-ponytail", labelKo: "하이 포니테일" },
  { id: "back-twintail", labelKo: "트윈테일" },
  { id: "back-low-bun", labelKo: "로우 번" },
] as const);

type FrontHairPart = typeof FRONT_HAIR_PART_OPTIONS[number]["id"];
type SideHairPart = typeof SIDE_HAIR_PART_OPTIONS[number]["id"];
type BackHairPart = typeof BACK_HAIR_PART_OPTIONS[number]["id"];
export type AvatarForgeHairParams = {
  style: AvatarForgeHairStyle;
  frontPart?: FrontHairPart;
  sidePart?: SideHairPart;
  backPart?: BackHairPart;
  frontTint?: string;
  sideTint?: string;
  backTint?: string;
  replaceOriginal: boolean;
  volume: number;
  length: number;
  strandWidth: number;
  fringe: number;
  curl: number;
  shine: number;
  baseColor: string;
  /** 기존 문서에 셀 음영 색상이 없으면 기본색으로 계산한다. */
  shadowColor?: string;
  tipColor: string;
  /** v2: 앞머리 형태. "full"이 v1과 동일한 3가닥 뱅. */
  bangStyle: AvatarForgeBangStyle;
  /** v2: 웨이브 진폭(0=직모). 0일 때 파츠에 wave 키가 생기지 않는다. */
  wave: number;
  /** v2: 삐침머리 길이(0=없음). */
  ahoge: number;
  /** v2: 묶음(포니/트윈/번/하프업) 높이. 0.5가 v1 위치. */
  tailHeight: number;
  /** 하이라이트 방식(브릿지·이너 컬러). 생략 = 없음. 색 확장 필드는 전부 기본값이면 키가 없다. */
  accentMode?: Exclude<AvatarForgeHairAccentMode, "none">;
  /** 하이라이트 색. 방식을 꺼도 남겨 다시 켤 때 쓴다. */
  accentColor?: string;
  /** 끝 색이 시작되는 길이 비율(0 뿌리 ~ 1 끝). 생략 = 0.5(예전 선형 그라데이션). */
  gradientPosition?: number;
  /** 기본색→끝 색 경계 폭(0 또렷한 투톤 ~ 1 예전 선형). 생략 = 1. */
  gradientSoftness?: number;
};

export type HairSection = "front" | "side" | "back";

export const HAIR_SECTIONS = [
  { id: "front", name: "앞머리", options: FRONT_HAIR_PART_OPTIONS },
  { id: "side", name: "옆머리", options: SIDE_HAIR_PART_OPTIONS },
  { id: "back", name: "뒷머리", options: BACK_HAIR_PART_OPTIONS },
] as const;

export function sanitizeHairSections(raw: Record<string, unknown>): Partial<AvatarForgeHairParams> {
  const sections: Partial<AvatarForgeHairParams> = {};
  for (const section of HAIR_SECTIONS) {
    const partKey = `${section.id}Part` as const;
    const value = raw[partKey];
    if (section.options.some((option) => option.id === value)) Object.assign(sections, { [partKey]: value });
    const tintKey = `${section.id}Tint` as const;
    const tint = raw[tintKey];
    if (typeof tint === "string" && /^#[0-9a-f]{6}$/i.test(tint)) sections[tintKey] = tint.toLowerCase();
  }
  return sections;
}

/** 전체 실루엣·앞머리 카드를 바꾸면 그 카드에 해당하는 부분만 기본 모양으로 돌린다. */
export function mergeAvatarForgeHair(current: AvatarForgeHairParams, patch: Partial<AvatarForgeHairParams>): AvatarForgeHairParams {
  const next = { ...current };
  if (patch.style !== undefined) {
    for (const { id } of HAIR_SECTIONS) {
      delete next[`${id}Part`];
      delete next[`${id}Tint`];
    }
  } else if (patch.bangStyle !== undefined) {
    delete next.frontPart;
  }
  return { ...next, ...patch };
}

const FRONT_CUT: Record<FrontHairPart, AvatarForgeBangStyle> = {
  "front-full-bang": "blunt", "front-see-through": "full", "front-center-part": "split",
  "front-side-swept": "side-swept", "front-curtain": "curtain", "front-m-bang": "split",
  "front-slick-back": "none", "front-asym-bang": "side-swept",
};
const SIDE_CUT: Record<SideHairPart, AvatarForgeHairStyle> = {
  "side-hime": "hime", "side-layered": "half-up", "side-tucked": "short",
  "side-short-burn": "pixie", "side-wave": "wavy", "side-none": "none",
};
const BACK_CUT: Record<BackHairPart, AvatarForgeHairStyle> = {
  "back-short": "pixie", "back-bob": "bob", "back-wolf": "wolf", "back-long-straight": "long",
  "back-long-wave": "wavy", "back-high-ponytail": "ponytail", "back-twintail": "twintail", "back-low-bun": "bun",
};

function sectionOf(role: AvatarForgeHairPart["role"]): HairSection | undefined {
  if (role === "bang") return "front";
  if (role === "side") return "side";
  if (role === "back" || role === "tail" || role === "braid" || role === "bun") return "back";
  return undefined;
}

type BuildHair = (hair: AvatarForgeHairParams) => AvatarForgeHairPart[];

/** 선택된 부위만 다시 만든다. 렌더용 보조 가닥과 내보내기용 파츠가 같은 영역 규칙을 따른다. */
export function composeHairSections(hair: AvatarForgeHairParams, build: BuildHair): AvatarForgeHairPart[] {
  const base = build(hair);
  if (!HAIR_SECTIONS.some(({ id }) => hair[`${id}Part`] || hair[`${id}Tint`])) return base;
  const result = base.filter((part) => !sectionOf(part.role));
  for (const { id } of HAIR_SECTIONS) {
    let source = base;
    if (id === "front" && hair.frontPart) {
      source = build({ ...hair, bangStyle: FRONT_CUT[hair.frontPart] });
    } else if (id === "side" && hair.sidePart) {
      const style = SIDE_CUT[hair.sidePart];
      source = style === "none" ? [] : build({ ...hair, style });
    } else if (id === "back" && hair.backPart) {
      const tailHeight = hair.backPart === "back-low-bun" ? Math.max(0, hair.tailHeight - 0.45)
        : hair.backPart === "back-high-ponytail" ? Math.min(1, hair.tailHeight + 0.3) : hair.tailHeight;
      source = build({ ...hair, style: BACK_CUT[hair.backPart], tailHeight });
    }
    for (const part of source) {
      if (sectionOf(part.role) !== id) continue;
      const tint = hair[`${id}Tint`];
      const shaped = shapeSectionPart(hair, part);
      result.push(tint ? { ...shaped, baseColor: tint } : shaped);
    }
  }
  return result;
}

function shapeSectionPart(hair: AvatarForgeHairParams, part: AvatarForgeHairPart): AvatarForgeHairPart {
  const [x, y, z] = part.position;
  const [width, length, thickness] = part.scale;
  if (part.role === "side" && hair.sidePart === "side-tucked") {
    return { ...part, position: [x * 1.03, y + 0.04, z - 0.24], rotation: [-0.38, part.rotation[1], part.rotation[2]],
      scale: [width * 0.82, length * 0.85, thickness] };
  }
  if (part.role === "bun" && hair.backPart === "back-low-bun") {
    return { ...part, position: [x, y - 0.52, z - 0.38] };
  }
  if (part.role !== "bang") return part;
  if (hair.frontPart === "front-see-through") return { ...part, scale: [width * 0.48, length, thickness * 0.75] };
  if (hair.frontPart === "front-m-bang") {
    const inner = Math.abs(x) < 0.14;
    return { ...part, position: [x * 0.88, y, z], scale: [width, length * (inner ? 1.28 : 0.84), thickness],
      rotation: [part.rotation[0], part.rotation[1], inner ? -part.rotation[2] : part.rotation[2]] };
  }
  if (hair.frontPart === "front-asym-bang") {
    return { ...part, scale: [width, length * (x < 0 ? 0.65 : 1.25), thickness] };
  }
  return part;
}
