/**
 * 글로벌 MMORPG 외주 광장 길드 존 · 동남아/글로벌 시간대 · 6종 통화 기준표 · 대규모 군중 시드 카탈로그.
 */

import type { PlazaLanguageCode } from "./webtoon-multilingual-glossary";
import type { Vec2 } from "./vspace-physics-world-presets";

export type PlazaGuildZoneId =
  | "lineart-storyboard"
  | "bg3d-modeling"
  | "color-post"
  | "global-lettering-sea";

export type GlobalRegionTimezoneId =
  | "KR-KST"
  | "VN-ICT"
  | "TH-ICT"
  | "ID-WIB"
  | "PH-PHT"
  | "JP-JST"
  | "US-PST";

export type PlazaCurrencyCode = "KRW" | "USD" | "VND" | "THB" | "IDR" | "JPY";

export type FreelancerRoleKey =
  | "lineart"
  | "storyboard"
  | "bg3d"
  | "coloring"
  | "post"
  | "lettering";

export type PortfolioVerificationTier = "S-Verified" | "A-Verified" | "B-Rising";

export type CrowdPresenceKind = "live-online" | "async-standby";

export type HybridCrowdFilterMode = "hybrid-all" | "live-only" | "async-verified-pool";

export type CrowdLodLevel = "full-bubble" | "compact-badge" | "dot-cluster";

export interface PlazaGuildZone {
  readonly id: PlazaGuildZoneId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly summaryKo: string;
  readonly accentToken: "accent" | "cool" | "good" | "warn";
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly center: Vec2;
  readonly divisionRoleFolder: "10_BG_3D" | "20_LINE" | "40_SHADE" | "60_LETTER";
}

export interface GlobalTimezoneRegion {
  readonly id: GlobalRegionTimezoneId;
  readonly countryCode: "KR" | "VN" | "TH" | "ID" | "PH" | "JP" | "US";
  readonly countryNameKo: string;
  readonly cityLabelKo: string;
  readonly tzLabel: string;
  /** 서울(KST, UTC+9) 기준 시차(시간). */
  readonly offsetFromKstHours: number;
  readonly primaryLang: PlazaLanguageCode;
  readonly localCurrency: PlazaCurrencyCode;
}

export interface OutsourcingTrustGuardrail {
  readonly portfolioTier: PortfolioVerificationTier;
  readonly portfolioBadgeKo: string;
  readonly onTimeDeliveryRatePct: number;
  readonly completedEpisodes: number;
  readonly escrowMilestonePlanKo: string;
  readonly zeroLeakWatermarkRequired: true;
  readonly scopedCutViewOnly: true;
  readonly previewMaxWidthPx: number;
}

export interface PlazaFreelancerAvatar {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly guildZoneId: PlazaGuildZoneId;
  readonly roleKey: FreelancerRoleKey;
  readonly roleKo: string;
  readonly timezoneId: GlobalRegionTimezoneId;
  readonly countryCode: GlobalTimezoneRegion["countryCode"];
  readonly countryNameKo: string;
  readonly languages: readonly PlazaLanguageCode[];
  readonly primaryLang: PlazaLanguageCode;
  readonly ratePerCutKrw: number;
  readonly availabilityStatus: "immediate" | "this-week" | "booked-soon";
  readonly availabilityLabelKo: string;
  readonly responseMinutes: number;
  readonly presenceKind: CrowdPresenceKind;
  readonly trust: OutsourcingTrustGuardrail;
  readonly x: number;
  readonly y: number;
  readonly statusBubbleKo: string;
  readonly workHoursLocal: { readonly startHour: number; readonly endHour: number };
  readonly sampleProfileLabel: "예시 프로필";
}

export interface OutsourcingQuestPost {
  readonly questId: string;
  readonly titleKo: string;
  readonly guildZoneId: PlazaGuildZoneId;
  readonly roleKey: FreelancerRoleKey;
  readonly episodeId: string;
  readonly cutRangeStart: number;
  readonly cutRangeEnd: number;
  readonly cutCount: number;
  readonly budgetPerCutKrw: number;
  readonly targetCurrency: PlazaCurrencyCode;
  readonly targetLanguages: readonly PlazaLanguageCode[];
  readonly status: "recruiting" | "matched" | "handed-off";
  readonly dispatchMode: "live-plaza-and-async-board";
  readonly matchedFreelancerId: string | null;
  readonly applicantIds: readonly string[];
  readonly trustGuardrailSummaryKo: string;
  readonly createdAtIso: string;
}

export const PLAZA_GUILD_ZONES: readonly PlazaGuildZone[] = [
  {
    id: "lineart-storyboard",
    nameKo: "선화·콘티 길드 광장",
    nameEn: "Lineart & Storyboard Guild",
    summaryKo: "주간 마감 선화·펜터치·콘티 연출 파트너 상시 대기",
    accentToken: "accent",
    bounds: { minX: 36, minY: 236, maxX: 258, maxY: 524 },
    center: { x: 148, y: 380 },
    divisionRoleFolder: "20_LINE",
  },
  {
    id: "bg3d-modeling",
    nameKo: "3D 배경·모델링 광장",
    nameEn: "3D Background & Modeling Plaza",
    summaryKo: "블렌더·스케치업 배경 추출 및 원근 라이팅 전문",
    accentToken: "cool",
    bounds: { minX: 266, minY: 236, maxX: 484, maxY: 524 },
    center: { x: 374, y: 380 },
    divisionRoleFolder: "10_BG_3D",
  },
  {
    id: "color-post",
    nameKo: "채색·보정 아틀리에 광장",
    nameEn: "Color & Post Atelier Plaza",
    summaryKo: "밑색·명암·후보정 OKLCH 톤 통일 팀 모집",
    accentToken: "good",
    bounds: { minX: 492, minY: 236, maxX: 710, maxY: 524 },
    center: { x: 600, y: 380 },
    divisionRoleFolder: "40_SHADE",
  },
  {
    id: "global-lettering-sea",
    nameKo: "글로벌 식자·동남아 파트너 광장",
    nameEn: "Global Lettering & SEA Partner Plaza",
    summaryKo: "베트남·태국·인도네시아·필리핀·일본 다국어 식자 및 대규모 분업",
    accentToken: "warn",
    bounds: { minX: 718, minY: 236, maxX: 924, maxY: 524 },
    center: { x: 820, y: 380 },
    divisionRoleFolder: "60_LETTER",
  },
];

export const GLOBAL_TIMEZONE_REGIONS: Readonly<Record<GlobalRegionTimezoneId, GlobalTimezoneRegion>> = {
  "KR-KST": { id: "KR-KST", countryCode: "KR", countryNameKo: "한국", cityLabelKo: "서울", tzLabel: "KST (UTC+9)", offsetFromKstHours: 0, primaryLang: "ko", localCurrency: "KRW" },
  "VN-ICT": { id: "VN-ICT", countryCode: "VN", countryNameKo: "베트남", cityLabelKo: "하노이 · 호치민", tzLabel: "ICT (UTC+7)", offsetFromKstHours: -2, primaryLang: "vi", localCurrency: "VND" },
  "TH-ICT": { id: "TH-ICT", countryCode: "TH", countryNameKo: "태국", cityLabelKo: "방콕", tzLabel: "ICT (UTC+7)", offsetFromKstHours: -2, primaryLang: "th", localCurrency: "THB" },
  "ID-WIB": { id: "ID-WIB", countryCode: "ID", countryNameKo: "인도네시아", cityLabelKo: "자카르타", tzLabel: "WIB (UTC+7)", offsetFromKstHours: -2, primaryLang: "id", localCurrency: "IDR" },
  "PH-PHT": { id: "PH-PHT", countryCode: "PH", countryNameKo: "필리핀", cityLabelKo: "마닐라", tzLabel: "PHT (UTC+8)", offsetFromKstHours: -1, primaryLang: "en", localCurrency: "USD" },
  "JP-JST": { id: "JP-JST", countryCode: "JP", countryNameKo: "일본", cityLabelKo: "도쿄", tzLabel: "JST (UTC+9)", offsetFromKstHours: 0, primaryLang: "ja", localCurrency: "JPY" },
  "US-PST": { id: "US-PST", countryCode: "US", countryNameKo: "미국 서부", cityLabelKo: "로스앤젤레스", tzLabel: "PST (UTC-8)", offsetFromKstHours: -17, primaryLang: "en", localCurrency: "USD" },
};

export const PLAZA_CURRENCY_CODES: readonly PlazaCurrencyCode[] = [
  "KRW",
  "USD",
  "VND",
  "THB",
  "IDR",
  "JPY",
];

/** 1 KRW당 참고 환산 계수 (오프라인 결정론 기준 환율표 · 실정산 시 고시환율 적용) */
export const PLAZA_FX_RATES_PER_KRW: Readonly<Record<PlazaCurrencyCode, number>> = {
  KRW: 1,
  USD: 0.00072,
  VND: 18.2,
  THB: 0.0252,
  IDR: 11.4,
  JPY: 0.111,
};

export const CURRENCY_META: Readonly<
  Record<PlazaCurrencyCode, { readonly symbol: string; readonly decimals: number }>
> = {
  KRW: { symbol: "₩", decimals: 0 },
  USD: { symbol: "$", decimals: 2 },
  VND: { symbol: "₫", decimals: 0 },
  THB: { symbol: "฿", decimals: 0 },
  IDR: { symbol: "Rp", decimals: 0 },
  JPY: { symbol: "¥", decimals: 0 },
};

export function formatPlazaCurrency(amount: number, currency: PlazaCurrencyCode): string {
  const meta = CURRENCY_META[currency];
  const rounded =
    meta.decimals === 0 ? Math.round(amount) : Number(amount.toFixed(meta.decimals));
  const formatted = rounded.toLocaleString("en-US", {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return `${meta.symbol}${formatted}`;
}

interface SeedCreatorBlueprint {
  readonly name: string;
  readonly timezoneId: GlobalRegionTimezoneId;
  readonly extraLang: PlazaLanguageCode;
  readonly roleKey: FreelancerRoleKey;
  readonly roleKo: string;
  readonly guildZoneId: PlazaGuildZoneId;
  readonly baseRateKrw: number;
}

const SEED_BLUEPRINTS: readonly SeedCreatorBlueprint[] = [
  { name: "Minh Nguyen", timezoneId: "VN-ICT", extraLang: "ko", roleKey: "lineart", roleKo: "선화 · 펜터치", guildZoneId: "lineart-storyboard", baseRateKrw: 14000 },
  { name: "Linh Tran", timezoneId: "VN-ICT", extraLang: "en", roleKey: "coloring", roleKo: "밑색 · 명암 채색", guildZoneId: "color-post", baseRateKrw: 12000 },
  { name: "Nattapong S.", timezoneId: "TH-ICT", extraLang: "en", roleKey: "coloring", roleKo: "채색 · 조명 보정", guildZoneId: "color-post", baseRateKrw: 13500 },
  { name: "Ploy Supaporn", timezoneId: "TH-ICT", extraLang: "ko", roleKey: "lettering", roleKo: "태국어 식자 · SFX", guildZoneId: "global-lettering-sea", baseRateKrw: 8500 },
  { name: "Raka Pratama", timezoneId: "ID-WIB", extraLang: "en", roleKey: "bg3d", roleKo: "3D 배경 · 블렌더", guildZoneId: "bg3d-modeling", baseRateKrw: 17500 },
  { name: "Sari Dewi", timezoneId: "ID-WIB", extraLang: "ko", roleKey: "lineart", roleKo: "클린 선화", guildZoneId: "lineart-storyboard", baseRateKrw: 13000 },
  { name: "Marco Santos", timezoneId: "PH-PHT", extraLang: "en", roleKey: "post", roleKo: "후보정 · 이펙트", guildZoneId: "color-post", baseRateKrw: 14500 },
  { name: "Bea Villanueva", timezoneId: "PH-PHT", extraLang: "ko", roleKey: "lettering", roleKo: "영문 식자 · 말풍선", guildZoneId: "global-lettering-sea", baseRateKrw: 9000 },
  { name: "박지훈", timezoneId: "KR-KST", extraLang: "en", roleKey: "storyboard", roleKo: "액션 콘티 연출", guildZoneId: "lineart-storyboard", baseRateKrw: 24000 },
  { name: "정유진", timezoneId: "KR-KST", extraLang: "ja", roleKey: "bg3d", roleKo: "스케치업 · 3D 실내", guildZoneId: "bg3d-modeling", baseRateKrw: 22000 },
  { name: "Yuki Sato", timezoneId: "JP-JST", extraLang: "ko", roleKey: "lettering", roleKo: "일본어 세로 식자", guildZoneId: "global-lettering-sea", baseRateKrw: 15000 },
  { name: "Alex Rivera", timezoneId: "US-PST", extraLang: "en", roleKey: "lettering", roleKo: "북미 로컬 식자·QA", guildZoneId: "global-lettering-sea", baseRateKrw: 16500 },
];

const TIER_CYCLE: readonly PortfolioVerificationTier[] = ["S-Verified", "A-Verified", "B-Rising"];

function tierBadgeKo(tier: PortfolioVerificationTier): string {
  if (tier === "S-Verified") return "S등급 포트폴리오 검증";
  if (tier === "A-Verified") return "A등급 포트폴리오 검증";
  return "B등급 신규 검증 통과";
}

export function createGlobalPlazaCrowd(count = 60): readonly PlazaFreelancerAvatar[] {
  const safeCount = Math.max(12, Math.min(200, Math.floor(count)));
  const avatars: PlazaFreelancerAvatar[] = [];

  for (let idx = 0; idx < safeCount; idx += 1) {
    const seed = SEED_BLUEPRINTS[idx % SEED_BLUEPRINTS.length]!;
    const cycle = Math.floor(idx / SEED_BLUEPRINTS.length);
    const region = GLOBAL_TIMEZONE_REGIONS[seed.timezoneId];
    const zone = PLAZA_GUILD_ZONES.find((z) => z.id === seed.guildZoneId) ?? PLAZA_GUILD_ZONES[0]!;

    const zoneW = zone.bounds.maxX - zone.bounds.minX - 28;
    const zoneH = zone.bounds.maxY - zone.bounds.minY - 40;
    const colFrac = (idx * 0.6180339887) % 1;
    const rowFrac = ((idx * 17 + 5) % 23) / 23;
    const x = Math.round(zone.bounds.minX + 14 + colFrac * zoneW);
    const y = Math.round(zone.bounds.minY + 26 + rowFrac * zoneH);

    const tier = TIER_CYCLE[idx % TIER_CYCLE.length]!;
    const ratePerCutKrw = seed.baseRateKrw + ((idx % 5) - 2) * 1000;
    const availabilityStatus: PlazaFreelancerAvatar["availabilityStatus"] =
      idx % 3 === 0 ? "immediate" : idx % 3 === 1 ? "this-week" : "booked-soon";
    const availabilityLabelKo =
      availabilityStatus === "immediate"
        ? "즉시 투입"
        : availabilityStatus === "this-week"
          ? "이번 주 가능"
          : "다음 화 예약";
    const presenceKind: CrowdPresenceKind = idx % 3 === 2 ? "async-standby" : "live-online";
    const responseMinutes = presenceKind === "live-online" ? 4 + (idx % 12) : 25 + (idx % 35);
    const onTimeDeliveryRatePct = Number((94.2 + ((idx * 7) % 56) * 0.1).toFixed(1));
    const completedEpisodes = 8 + ((idx * 5) % 42);
    const languages: readonly PlazaLanguageCode[] =
      seed.extraLang === region.primaryLang
        ? [region.primaryLang]
        : [region.primaryLang, seed.extraLang];

    const displayName = cycle === 0 ? seed.name : `${seed.name} #${cycle + 1}`;
    const handle = `@${seed.name.toLowerCase().replace(/[^a-z0-9]/gu, "")}${idx + 1}`;

    avatars.push({
      id: `plaza-freelancer-${String(idx + 1).padStart(3, "0")}`,
      handle,
      displayName,
      guildZoneId: seed.guildZoneId,
      roleKey: seed.roleKey,
      roleKo: seed.roleKo,
      timezoneId: seed.timezoneId,
      countryCode: region.countryCode,
      countryNameKo: region.countryNameKo,
      languages,
      primaryLang: region.primaryLang,
      ratePerCutKrw,
      availabilityStatus,
      availabilityLabelKo,
      responseMinutes,
      presenceKind,
      trust: {
        portfolioTier: tier,
        portfolioBadgeKo: tierBadgeKo(tier),
        onTimeDeliveryRatePct,
        completedEpisodes,
        escrowMilestonePlanKo: "30% 착수 예치 → 40% AD 검수 → 30% 최종 납품",
        zeroLeakWatermarkRequired: true,
        scopedCutViewOnly: true,
        previewMaxWidthPx: 1600,
      },
      x,
      y,
      statusBubbleKo: `${seed.roleKo} · ₩${ratePerCutKrw.toLocaleString("en-US")}/컷 · ${availabilityLabelKo}`,
      workHoursLocal: { startHour: 9, endHour: 18 },
      sampleProfileLabel: "예시 프로필",
    });
  }

  return avatars;
}

export function createInitialOutsourcingQuests(): readonly OutsourcingQuestPost[] {
  return [
    {
      questId: "quest-ep12-lineart-01",
      titleKo: "EP12 1~20컷 액션 선화 클린업 긴급 파티",
      guildZoneId: "lineart-storyboard",
      roleKey: "lineart",
      episodeId: "episode-12",
      cutRangeStart: 1,
      cutRangeEnd: 20,
      cutCount: 20,
      budgetPerCutKrw: 14500,
      targetCurrency: "VND",
      targetLanguages: ["ko", "vi", "en"],
      status: "recruiting",
      dispatchMode: "live-plaza-and-async-board",
      matchedFreelancerId: null,
      applicantIds: ["plaza-freelancer-001", "plaza-freelancer-006"],
      trustGuardrailSummaryKo: "포트폴리오 검증 필수 · 30/40/30 에스크로 · 부분 컷 워터마크 열람",
      createdAtIso: "2026-11-21T13:30:00.000Z",
    },
    {
      questId: "quest-ep12-color-02",
      titleKo: "EP12 21~45컷 야경 채색·OKLCH 톤 통일",
      guildZoneId: "color-post",
      roleKey: "coloring",
      episodeId: "episode-12",
      cutRangeStart: 21,
      cutRangeEnd: 45,
      cutCount: 25,
      budgetPerCutKrw: 13500,
      targetCurrency: "THB",
      targetLanguages: ["ko", "th", "en"],
      status: "recruiting",
      dispatchMode: "live-plaza-and-async-board",
      matchedFreelancerId: null,
      applicantIds: ["plaza-freelancer-002", "plaza-freelancer-003"],
      trustGuardrailSummaryKo: "포트폴리오 검증 필수 · 30/40/30 에스크로 · 부분 컷 워터마크 열람",
      createdAtIso: "2026-11-21T13:45:00.000Z",
    },
  ];
}
