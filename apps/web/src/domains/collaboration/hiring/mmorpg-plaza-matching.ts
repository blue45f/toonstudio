/**
 * MMORPG 스타일 구인 광장(실시간 파티 매칭) 및 웹툰 어시스턴트 직군 초세분화(28개 전문 직군) 모델.
 *
 * 기존 17개 표준 공정(`WEBTOON_SPECIALIZATION_PARTS`)을 100% 보존하면서,
 * 실무 분업화에 맞춘 11개 신규 전문 직군을 추가하고 MMORPG 파티/레이드형 실시간 매칭 엔진을 제공한다.
 */

import {
  WEBTOON_SPECIALIZATION_PARTS,
  type WebtoonGenreTag,
  type WebtoonProductionTool,
} from "./webtoon-assistant-outsourcing-model";

export type ExtendedWebtoonRoleCode =
  | (typeof WEBTOON_SPECIALIZATION_PARTS)[number]["code"]
  | "001.018"
  | "001.019"
  | "001.020"
  | "001.021"
  | "001.022"
  | "001.023"
  | "001.024"
  | "001.025"
  | "001.026"
  | "001.027"
  | "001.028";

export type RoleGuildCategory =
  | "story-directing"
  | "character-art"
  | "coloring-vfx"
  | "bg3d-rigging"
  | "lettering-global"
  | "production-ip";

export interface DetailedWebtoonRole {
  readonly code: ExtendedWebtoonRoleCode;
  readonly slug: string;
  readonly labelKo: string;
  readonly guild: RoleGuildCategory;
  readonly summaryKo: string;
  readonly primaryTools: readonly WebtoonProductionTool[];
}

export type PlazaPresenceStatus = "online-ready" | "in-party" | "urgent-sub-ready" | "away";

export interface PlazaAssistantAvatar {
  readonly id: string;
  readonly nickname: string;
  readonly roleCode: ExtendedWebtoonRoleCode;
  readonly secondaryRoleCodes: readonly ExtendedWebtoonRoleCode[];
  readonly tier: "rookie" | "pro" | "veteran" | "master";
  readonly status: PlazaPresenceStatus;
  readonly preferredGenres: readonly WebtoonGenreTag[];
  readonly tools: readonly WebtoonProductionTool[];
  readonly cutRateKrw: number;
  readonly weeklyCapacityCuts: number;
  readonly responseMinutes: number;
  readonly completedEpisodes: number;
  readonly urgentSubAvailable: boolean;
}

export interface PlazaPartySlot {
  readonly slotId: string;
  readonly roleCode: ExtendedWebtoonRoleCode;
  readonly requiredCount: number;
  readonly filledAvatarIds: readonly string[];
  readonly budgetPerCutKrw: number;
  readonly urgent: boolean;
}

export interface PlazaRecruitmentParty {
  readonly partyId: string;
  readonly title: string;
  readonly studioName: string;
  readonly genre: WebtoonGenreTag;
  readonly zone: "main-square" | "urgent-sub-gate" | "bg3d-forge" | "rofan-salon";
  readonly slots: readonly PlazaPartySlot[];
  readonly createdAt: string;
}

export interface PlazaMatchResult {
  readonly avatarId: string;
  readonly nickname: string;
  readonly roleCode: ExtendedWebtoonRoleCode;
  readonly score: number;
  readonly compatible: boolean;
  readonly highlightsKo: readonly string[];
  readonly blockersKo: readonly string[];
}

const EXTRA_SPECIALIZED_ROLES: readonly DetailedWebtoonRole[] = Object.freeze([
  {
    code: "001.018",
    slug: "action-storyboard",
    labelKo: "액션 콘티 전문 (합·카메라 워킹)",
    guild: "story-directing",
    summaryKo: "전투 시퀀스 타격감, 동선, 종스크롤 속도 완급 조절 전담",
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.019",
    slug: "rofan-ornament",
    labelKo: "로판 드레스·장신구·원꾸 전문",
    guild: "coloring-vfx",
    summaryKo: "레이스·보석·프릴·화려한 이펙트 브러시 및 원고 꾸미기 전담",
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.020",
    slug: "creature-mecha",
    labelKo: "몬스터·크리처·메카 디자인",
    guild: "character-art",
    summaryKo: "보스 몬스터, 이수, 병기 및 메카닉 시트·작화 전담",
    primaryTools: ["clip-studio-ex", "blender"],
  },
  {
    code: "001.021",
    slug: "bg3d-architect",
    labelKo: "3D 건축·인테리어 모델러",
    guild: "bg3d-rigging",
    summaryKo: "판타지 성곽·현대 실내·거리 3D 모델링 및 툰 셰이더 최적화",
    primaryTools: ["sketchup", "blender", "snaptoon"],
  },
  {
    code: "001.022",
    slug: "vrm-posing-rigging",
    labelKo: "VRM·3D 캐릭터 포징/리깅 어시",
    guild: "bg3d-rigging",
    summaryKo: "3D 인체 포징, 군중 엑스트라 배치 및 콘티 앵글 맞춤 추출",
    primaryTools: ["blender", "clip-studio-ex"],
  },
  {
    code: "001.023",
    slug: "ai-retouch-upscale",
    labelKo: "AI 보조 원고 리터칭·정합성 마감",
    guild: "coloring-vfx",
    summaryKo: "AI 생성 배경/소품의 손가락·선화·작화풍 통일 리터칭 전담",
    primaryTools: ["photoshop", "clip-studio-ex"],
  },
  {
    code: "001.024",
    slug: "global-localization",
    labelKo: "글로벌 다국어 번역·현지화 식자",
    guild: "lettering-global",
    summaryKo: "영문·일문·동남아 현지화 번역, 말풍선 재조판 및 SFX 리드로잉",
    primaryTools: ["photoshop", "illustrator"],
  },
  {
    code: "001.025",
    slug: "motion-pv-editor",
    labelKo: "웹툰 모션·PV/쇼츠 트레일러 편집",
    guild: "production-ip",
    summaryKo: "런칭 프로모션 영상, 컷 분리 모션 그래픽 및 BGM 싱크 편집",
    primaryTools: ["photoshop"],
  },
  {
    code: "001.026",
    slug: "ip-expansion-pd",
    labelKo: "IP 확장·2차 사업 매니저",
    guild: "production-ip",
    summaryKo: "애니·드라마·굿즈·게임 OSMU 피치 바이블 및 권리 BOM 관리",
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.027",
    slug: "urgent-multi-sub",
    labelKo: "긴급 마감 대타 멀티 어시스턴트",
    guild: "character-art",
    summaryKo: "마감 24~48시간 전 선화·밑색·명암 긴급 투입 전담",
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.028",
    slug: "brush-material-crafter",
    labelKo: "전용 브러시·소품·텍스처 제작자",
    guild: "coloring-vfx",
    summaryKo: "작품 전용 무기·문양·배경 패턴·효과 브러시 에셋 커스텀 제작",
    primaryTools: ["clip-studio-ex", "illustrator"],
  },
]);

function inferGuild(code: string): RoleGuildCategory {
  if (code === "001.001" || code === "001.002") return "story-directing";
  if (code === "001.003" || code === "001.009" || code === "001.010") return "character-art";
  if (code === "001.004" || code === "001.005" || code === "001.006" || code === "001.011" || code === "001.017") {
    return "coloring-vfx";
  }
  if (code === "001.007" || code === "001.008") return "bg3d-rigging";
  if (code === "001.012" || code === "001.013" || code === "001.014") return "lettering-global";
  return "production-ip";
}

export const DETAILED_WEBTOON_ROLES: readonly DetailedWebtoonRole[] = Object.freeze([
  ...WEBTOON_SPECIALIZATION_PARTS.map((part) => ({
    code: part.code as ExtendedWebtoonRoleCode,
    slug: part.slug,
    labelKo: part.labelKo,
    guild: inferGuild(part.code),
    summaryKo: part.defaultScopeKo,
    primaryTools: part.primaryTools,
  })),
  ...EXTRA_SPECIALIZED_ROLES,
]);

export function getDetailedWebtoonRole(code: ExtendedWebtoonRoleCode): DetailedWebtoonRole {
  return DETAILED_WEBTOON_ROLES.find((r) => r.code === code) ?? DETAILED_WEBTOON_ROLES[2];
}

/**
 * MMORPG 구인 광장 실시간 매칭 엔진: 특정 파티 슬롯에 가장 적합한 온라인 어시스턴트 아바타를 랭킹한다.
 */
export function matchPlazaAvatarsForSlot(
  party: PlazaRecruitmentParty,
  slot: PlazaPartySlot,
  avatars: readonly PlazaAssistantAvatar[],
): readonly PlazaMatchResult[] {
  const roleMeta = getDetailedWebtoonRole(slot.roleCode);

  return avatars
    .map((avatar): PlazaMatchResult => {
      const highlights: string[] = [];
      const blockers: string[] = [];
      let score = 0;

      if (avatar.status === "away" || avatar.status === "in-party") {
        blockers.push("현재 다른 파티 작업 중이거나 자리비움 상태입니다.");
      } else if (avatar.status === "urgent-sub-ready") {
        score += 15;
        highlights.push("긴급 대타 즉시 투입 가능");
      } else {
        score += 10;
        highlights.push("광장 온라인 대기 중");
      }

      if (avatar.roleCode === slot.roleCode) {
        score += 40;
        highlights.push(`주력 직군 일치 (${roleMeta.labelKo})`);
      } else if (avatar.secondaryRoleCodes.includes(slot.roleCode)) {
        score += 26;
        highlights.push(`서브 직군 지원 가능 (${roleMeta.labelKo})`);
      } else {
        blockers.push("모집 직군과 일치하지 않습니다.");
      }

      if (avatar.preferredGenres.includes(party.genre)) {
        score += 15;
        highlights.push("선호 장르 일치");
      }

      if (roleMeta.primaryTools.some((t) => avatar.tools.includes(t))) {
        score += 10;
        highlights.push("필수 제작 툴 보유");
      }

      if (avatar.cutRateKrw <= slot.budgetPerCutKrw) {
        score += 10;
        highlights.push(`예산 적합 (컷당 ${avatar.cutRateKrw.toLocaleString("ko-KR")}원)`);
      } else if (avatar.cutRateKrw <= slot.budgetPerCutKrw * 1.15) {
        score += 4;
        highlights.push("협의 가능 단가 범위");
      } else {
        blockers.push("희망 컷당 단가가 파티 예산을 초과합니다.");
      }

      if (slot.urgent && !avatar.urgentSubAvailable) {
        blockers.push("긴급 마감 대타 불가 설정");
      } else if (avatar.responseMinutes <= 15) {
        score += 10;
        highlights.push(`평균 응답 ${avatar.responseMinutes}분 이내`);
      }

      const compatible = blockers.length === 0;
      return {
        avatarId: avatar.id,
        nickname: avatar.nickname,
        roleCode: avatar.roleCode,
        score: compatible ? Math.min(100, score) : 0,
        compatible,
        highlightsKo: highlights,
        blockersKo: blockers,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * 파티 슬롯에 어시스턴트를 배치(초대 수락)한 새 파티 상태를 반환한다.
 */
export function assignAvatarToPartySlot(
  party: PlazaRecruitmentParty,
  slotId: string,
  avatarId: string,
): PlazaRecruitmentParty {
  return {
    ...party,
    slots: party.slots.map((slot) => {
      if (slot.slotId !== slotId) return slot;
      if (slot.filledAvatarIds.includes(avatarId)) return slot;
      if (slot.filledAvatarIds.length >= slot.requiredCount) return slot;
      return {
        ...slot,
        filledAvatarIds: [...slot.filledAvatarIds, avatarId],
      };
    }),
  };
}
