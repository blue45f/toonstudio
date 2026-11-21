/**
 * 산업형 웹툰 9직군 × 8레이어 폴더 RBAC 권한 매트릭스 및 소규모 팀 미니 분업 프리셋 (T-002, T-011).
 * 모든 쓰기 가드는 Fail-Closed 원칙을 따르며, 권한이 없는 폴더·잠긴 슬라이스에 대한 쓰기를 원천 차단한다.
 */

export const DIVISION_ROLE_IDS = [
  "pd",
  "art_director",
  "writer",
  "storyboard",
  "bg3d",
  "line",
  "flat",
  "shade",
  "finishing_lettering",
] as const;

export type DivisionRoleId = (typeof DIVISION_ROLE_IDS)[number];

export const STANDARD_LAYER_FOLDERS = [
  "00_CONTI",
  "10_BG_3D",
  "20_LINE",
  "30_FLAT",
  "40_SHADE",
  "50_FX",
  "60_LETTERING",
  "99_AD_REDLINE",
] as const;

export type LayerFolderId = (typeof STANDARD_LAYER_FOLDERS)[number];

export type LayerAccessLevel = "none" | "read" | "comment" | "write" | "admin";

export type LayerOperation = "read" | "comment" | "write" | "lock";

export const TEAM_DIVISION_PRESET_IDS = [
  "solo-plus-bg",
  "duo-line-color",
  "studio-9-role",
] as const;

export type TeamDivisionPresetId = (typeof TEAM_DIVISION_PRESET_IDS)[number];

export interface DivisionRoleMetadata {
  readonly id: DivisionRoleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortKo: string;
  readonly shortEn: string;
  readonly primaryFolder: LayerFolderId;
}

export interface LayerFolderMetadata {
  readonly id: LayerFolderId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly ownerRole: DivisionRoleId;
}

export interface TeamPresetSeat {
  readonly seatId: string;
  readonly seatNameKo: string;
  readonly seatNameEn: string;
  readonly assignedRoles: readonly DivisionRoleId[];
}

export interface TeamDivisionPreset {
  readonly id: TeamDivisionPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly headcountRange: string;
  readonly seats: readonly TeamPresetSeat[];
}

export interface LayerWriteGuardInput {
  readonly roles: readonly DivisionRoleId[];
  readonly folder: LayerFolderId;
  readonly operation: LayerOperation;
  readonly presetId?: TeamDivisionPresetId;
  readonly sliceLockedByOther?: boolean;
  readonly lockedByHolderName?: string;
}

export interface LayerGuardDecision {
  readonly allowed: boolean;
  readonly effectiveLevel: LayerAccessLevel;
  readonly grantingRole: DivisionRoleId | null;
  readonly blockedBySliceLock: boolean;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

const ACCESS_RANK: Readonly<Record<LayerAccessLevel, number>> = {
  none: 0,
  read: 1,
  comment: 2,
  write: 3,
  admin: 4,
};

const OPERATION_MIN_RANK: Readonly<Record<LayerOperation, number>> = {
  read: 1,
  comment: 2,
  write: 3,
  lock: 4,
};

export const DIVISION_ROLE_METADATA: Readonly<Record<DivisionRoleId, DivisionRoleMetadata>> = {
  pd: {
    id: "pd",
    labelKo: "PD (총괄 프로듀서)",
    labelEn: "PD (Executive Producer)",
    shortKo: "PD",
    shortEn: "PD",
    primaryFolder: "99_AD_REDLINE",
  },
  art_director: {
    id: "art_director",
    labelKo: "AD (작화 감독)",
    labelEn: "AD (Art Director)",
    shortKo: "AD",
    shortEn: "AD",
    primaryFolder: "99_AD_REDLINE",
  },
  writer: {
    id: "writer",
    labelKo: "글·각본 작가",
    labelEn: "Script Writer",
    shortKo: "글작가",
    shortEn: "Writer",
    primaryFolder: "60_LETTERING",
  },
  storyboard: {
    id: "storyboard",
    labelKo: "콘티·연출",
    labelEn: "Storyboarder",
    shortKo: "콘티",
    shortEn: "Conti",
    primaryFolder: "00_CONTI",
  },
  bg3d: {
    id: "bg3d",
    labelKo: "3D 배경·소품",
    labelEn: "3D Background Artist",
    shortKo: "3D배경",
    shortEn: "BG3D",
    primaryFolder: "10_BG_3D",
  },
  line: {
    id: "line",
    labelKo: "선화·펜선",
    labelEn: "Line Artist",
    shortKo: "선화",
    shortEn: "Line",
    primaryFolder: "20_LINE",
  },
  flat: {
    id: "flat",
    labelKo: "밑색·마스킹",
    labelEn: "Flat Colorist",
    shortKo: "밑색",
    shortEn: "Flat",
    primaryFolder: "30_FLAT",
  },
  shade: {
    id: "shade",
    labelKo: "명암·채색",
    labelEn: "Shading & Lighting Artist",
    shortKo: "명암",
    shortEn: "Shade",
    primaryFolder: "40_SHADE",
  },
  finishing_lettering: {
    id: "finishing_lettering",
    labelKo: "후보정·식자",
    labelEn: "Finishing & Lettering",
    shortKo: "후보정·식자",
    shortEn: "FX/Letter",
    primaryFolder: "50_FX",
  },
};

export const LAYER_FOLDER_METADATA: Readonly<Record<LayerFolderId, LayerFolderMetadata>> = {
  "00_CONTI": {
    id: "00_CONTI",
    labelKo: "00_콘티 러프",
    labelEn: "00_Storyboard",
    ownerRole: "storyboard",
  },
  "10_BG_3D": {
    id: "10_BG_3D",
    labelKo: "10_3D 배경",
    labelEn: "10_BG_3D",
    ownerRole: "bg3d",
  },
  "20_LINE": {
    id: "20_LINE",
    labelKo: "20_캐릭터 선화",
    labelEn: "20_Lineart",
    ownerRole: "line",
  },
  "30_FLAT": {
    id: "30_FLAT",
    labelKo: "30_밑색 마스크",
    labelEn: "30_Flat_Color",
    ownerRole: "flat",
  },
  "40_SHADE": {
    id: "40_SHADE",
    labelKo: "40_명암·광원",
    labelEn: "40_Shading",
    ownerRole: "shade",
  },
  "50_FX": {
    id: "50_FX",
    labelKo: "50_이펙트·후보정",
    labelEn: "50_Effects_FX",
    ownerRole: "finishing_lettering",
  },
  "60_LETTERING": {
    id: "60_LETTERING",
    labelKo: "60_식자·효과음",
    labelEn: "60_Lettering",
    ownerRole: "finishing_lettering",
  },
  "99_AD_REDLINE": {
    id: "99_AD_REDLINE",
    labelKo: "99_AD 레드라인",
    labelEn: "99_AD_Redline",
    ownerRole: "art_director",
  },
};

/** 9직군 × 8레이어 폴더 표준 권한 매트릭스 */
export const LAYER_AUTHORITY_MATRIX: Readonly<
  Record<DivisionRoleId, Readonly<Record<LayerFolderId, LayerAccessLevel>>>
> = {
  pd: {
    "00_CONTI": "read",
    "10_BG_3D": "read",
    "20_LINE": "read",
    "30_FLAT": "read",
    "40_SHADE": "read",
    "50_FX": "read",
    "60_LETTERING": "comment",
    "99_AD_REDLINE": "admin",
  },
  art_director: {
    "00_CONTI": "write",
    "10_BG_3D": "write",
    "20_LINE": "write",
    "30_FLAT": "write",
    "40_SHADE": "write",
    "50_FX": "write",
    "60_LETTERING": "comment",
    "99_AD_REDLINE": "admin",
  },
  writer: {
    "00_CONTI": "comment",
    "10_BG_3D": "none",
    "20_LINE": "read",
    "30_FLAT": "none",
    "40_SHADE": "none",
    "50_FX": "none",
    "60_LETTERING": "write",
    "99_AD_REDLINE": "comment",
  },
  storyboard: {
    "00_CONTI": "write",
    "10_BG_3D": "read",
    "20_LINE": "read",
    "30_FLAT": "none",
    "40_SHADE": "none",
    "50_FX": "none",
    "60_LETTERING": "comment",
    "99_AD_REDLINE": "read",
  },
  bg3d: {
    "00_CONTI": "read",
    "10_BG_3D": "write",
    "20_LINE": "read",
    "30_FLAT": "none",
    "40_SHADE": "none",
    "50_FX": "none",
    "60_LETTERING": "none",
    "99_AD_REDLINE": "read",
  },
  line: {
    "00_CONTI": "read",
    "10_BG_3D": "read",
    "20_LINE": "write",
    "30_FLAT": "none",
    "40_SHADE": "none",
    "50_FX": "none",
    "60_LETTERING": "none",
    "99_AD_REDLINE": "read",
  },
  flat: {
    "00_CONTI": "none",
    "10_BG_3D": "none",
    "20_LINE": "read",
    "30_FLAT": "write",
    "40_SHADE": "none",
    "50_FX": "none",
    "60_LETTERING": "none",
    "99_AD_REDLINE": "read",
  },
  shade: {
    "00_CONTI": "none",
    "10_BG_3D": "read",
    "20_LINE": "read",
    "30_FLAT": "read",
    "40_SHADE": "write",
    "50_FX": "none",
    "60_LETTERING": "none",
    "99_AD_REDLINE": "read",
  },
  finishing_lettering: {
    "00_CONTI": "none",
    "10_BG_3D": "read",
    "20_LINE": "read",
    "30_FLAT": "read",
    "40_SHADE": "read",
    "50_FX": "write",
    "60_LETTERING": "write",
    "99_AD_REDLINE": "read",
  },
};

/** 1~2인 미니 / 3~5인 소팀 / 9직군 스튜디오 분업 프리셋 (T-011) */
export const TEAM_DIVISION_PRESETS: Readonly<Record<TeamDivisionPresetId, TeamDivisionPreset>> = {
  "solo-plus-bg": {
    id: "solo-plus-bg",
    labelKo: "1~2인 미니 (메인 + 배경)",
    labelEn: "1–2 Mini (Lead + BG)",
    summaryKo: "메인 작가가 콘티·선화·채색·식자를 겸임하고 3D 배경 파트너만 10_BG_3D 폴더로 격리합니다.",
    summaryEn: "Main author owns story-to-finish while isolating the 3D BG partner to 10_BG_3D.",
    headcountRange: "1–2",
    seats: [
      {
        seatId: "seat-main-author",
        seatNameKo: "메인 작가 (연출·작화·마감)",
        seatNameEn: "Main Author (All-in-One)",
        assignedRoles: [
          "pd",
          "art_director",
          "writer",
          "storyboard",
          "line",
          "flat",
          "shade",
          "finishing_lettering",
        ],
      },
      {
        seatId: "seat-bg-partner",
        seatNameKo: "3D 배경 파트너",
        seatNameEn: "3D BG Partner",
        assignedRoles: ["bg3d"],
      },
    ],
  },
  "duo-line-color": {
    id: "duo-line-color",
    labelKo: "3~5인 소팀 (선화 + 채색 + 배경)",
    labelEn: "3–5 Small Team (Line + Color + BG)",
    summaryKo: "글/콘티/선화 리드, 채색/후보정 리드, 3D 배경 전담 3축으로 중복 수정을 막습니다.",
    summaryEn: "Splits work across Story/Line Lead, Color/Finish Lead, and 3D BG Specialist.",
    headcountRange: "3–5",
    seats: [
      {
        seatId: "seat-story-line",
        seatNameKo: "스토리·선화 리드",
        seatNameEn: "Story & Line Lead",
        assignedRoles: ["pd", "art_director", "writer", "storyboard", "line"],
      },
      {
        seatId: "seat-color-finish",
        seatNameKo: "채색·후보정 리드",
        seatNameEn: "Color & Finish Lead",
        assignedRoles: ["flat", "shade", "finishing_lettering"],
      },
      {
        seatId: "seat-bg-specialist",
        seatNameKo: "3D 배경 전담",
        seatNameEn: "3D BG Specialist",
        assignedRoles: ["bg3d"],
      },
    ],
  },
  "studio-9-role": {
    id: "studio-9-role",
    labelKo: "9직군 산업형 스튜디오",
    labelEn: "9-Role Industrial Studio",
    summaryKo: "9개 전담 직군과 8개 레이어 폴더를 1:1 권한 경계로 분리해 병렬 생산합니다.",
    summaryEn: "Full 9-role studio isolation across 8 standardized layer folders for parallel output.",
    headcountRange: "6–15+",
    seats: DIVISION_ROLE_IDS.map((roleId) => ({
      seatId: `seat-${roleId}`,
      seatNameKo: DIVISION_ROLE_METADATA[roleId].labelKo,
      seatNameEn: DIVISION_ROLE_METADATA[roleId].labelEn,
      assignedRoles: [roleId],
    })),
  },
};

export function getEffectiveFolderAccess(
  roles: readonly DivisionRoleId[],
  folder: LayerFolderId,
): { readonly level: LayerAccessLevel; readonly grantingRole: DivisionRoleId | null } {
  let bestLevel: LayerAccessLevel = "none";
  let bestRole: DivisionRoleId | null = null;
  for (const role of roles) {
    const level = LAYER_AUTHORITY_MATRIX[role][folder];
    if (ACCESS_RANK[level] > ACCESS_RANK[bestLevel]) {
      bestLevel = level;
      bestRole = role;
    }
  }
  return { level: bestLevel, grantingRole: bestRole };
}

/**
 * 레이어 폴더 쓰기/읽기/잠금 가드.
 * 다중 겸임(미니 프리셋) 역할의 합집합 최고 권한을 계산하되,
 * 타 작업자 Lease가 활성화된 슬라이스에 대한 쓰기는 Fail-Closed로 차단한다.
 */
export function evaluateLayerWriteGuard(input: LayerWriteGuardInput): LayerGuardDecision {
  const { level, grantingRole } = getEffectiveFolderAccess(input.roles, input.folder);
  const folderMeta = LAYER_FOLDER_METADATA[input.folder];

  if (input.roles.length === 0) {
    return {
      allowed: false,
      effectiveLevel: "none",
      grantingRole: null,
      blockedBySliceLock: false,
      reasonKo: `${folderMeta.labelKo} 접근 차단: 배정된 직군이 없습니다.`,
      reasonEn: `Access denied to ${folderMeta.labelEn}: no assigned role.`,
    };
  }

  if (input.sliceLockedByOther && (input.operation === "write" || input.operation === "lock")) {
    const canOverrideLock = level === "admin";
    if (!canOverrideLock) {
      const holderSuffixKo = input.lockedByHolderName ? ` (${input.lockedByHolderName} 점유 중)` : "";
      const holderSuffixEn = input.lockedByHolderName ? ` (held by ${input.lockedByHolderName})` : "";
      return {
        allowed: false,
        effectiveLevel: level,
        grantingRole,
        blockedBySliceLock: true,
        reasonKo: `타 작업자 슬라이스 잠금으로 ${folderMeta.labelKo} 쓰기가 차단되었습니다${holderSuffixKo}.`,
        reasonEn: `Write to ${folderMeta.labelEn} is blocked by another holder's slice lease${holderSuffixEn}.`,
      };
    }
  }

  const requiredRank = OPERATION_MIN_RANK[input.operation];
  const allowed = ACCESS_RANK[level] >= requiredRank;
  const roleLabelKo = grantingRole ? DIVISION_ROLE_METADATA[grantingRole].shortKo : "권한 없음";
  const roleLabelEn = grantingRole ? DIVISION_ROLE_METADATA[grantingRole].shortEn : "No role";

  if (allowed) {
    return {
      allowed: true,
      effectiveLevel: level,
      grantingRole,
      blockedBySliceLock: false,
      reasonKo: `${roleLabelKo} 권한(${level})으로 ${folderMeta.labelKo} ${input.operation} 허용`,
      reasonEn: `Allowed ${input.operation} on ${folderMeta.labelEn} via ${roleLabelEn} (${level}).`,
    };
  }

  return {
    allowed: false,
    effectiveLevel: level,
    grantingRole,
    blockedBySliceLock: false,
    reasonKo: `${folderMeta.labelKo} ${input.operation} 차단: 현재 최고 권한은 ${level}입니다 (담당 직군: ${DIVISION_ROLE_METADATA[folderMeta.ownerRole].shortKo}).`,
    reasonEn: `Blocked ${input.operation} on ${folderMeta.labelEn}: current access is ${level} (owner: ${DIVISION_ROLE_METADATA[folderMeta.ownerRole].shortEn}).`,
  };
}

export function resolveSeatRolesForPreset(
  presetId: TeamDivisionPresetId,
  seatId: string,
): readonly DivisionRoleId[] {
  const preset = TEAM_DIVISION_PRESETS[presetId];
  const matched = preset.seats.find((seat) => seat.seatId === seatId);
  return matched ? matched.assignedRoles : [];
}
