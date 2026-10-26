/**
 * ClickUp (`/features/project-time-tracking`, `/features/sync-up` 번아웃 방지 워크로드 용량 뷰) +
 * 위시켓(Wishket `wishket_utility.js`, `wishket_guide.js` 표준계약·크레딧·저작재산권 분리 매트릭스) 역공학 내재화:
 * 감시·순위 지표를 배제하고 주간 컷 용량 상한(Burnout Guard)과 표준계약·크레딧 표기 합의만 검증하는 순수 모델.
 */

export interface CrewSeatContractRecord {
  readonly seatId: string;
  readonly roleTitleKo: string;
  readonly roleTitleEn: string;
  readonly assigneeNameKo: string;
  readonly assigneeNameEn: string;
  readonly weeklyMaxCutCapacity: number;
  readonly assignedEpisodeCuts: number;
  readonly mandatoryRestHoursPerWeek: number;
  readonly contractType: "co-creator-mg-rs" | "per-cut-standard" | "episode-turnkey";
  readonly creditAttributionRoleKo: string;
  readonly creditAttributionRoleEn: string;
  readonly secondaryRightsSeparated: boolean;
  readonly standardContractSigned: boolean;
}

export interface EvaluatedCrewSeatStatus extends CrewSeatContractRecord {
  readonly utilizationPercent: number;
  readonly loadState: "balanced" | "near-limit" | "overloaded";
  readonly governanceCompliant: boolean;
  readonly advisoryKo: string;
  readonly advisoryEn: string;
}

export interface CrewWorkloadContractSummary {
  readonly seats: readonly EvaluatedCrewSeatStatus[];
  readonly overloadedSeatCount: number;
  readonly compliantSeatCount: number;
  readonly readinessScore: number;
}

export const INITIAL_CREW_SEAT_CONTRACT_RECORDS: readonly CrewSeatContractRecord[] = Object.freeze([
  {
    seatId: "seat-story",
    roleTitleKo: "스토리·콘티 작가",
    roleTitleEn: "Story & Continuity Writer",
    assigneeNameKo: "김서연 작가",
    assigneeNameEn: "Seoyeon Kim",
    weeklyMaxCutCapacity: 75,
    assignedEpisodeCuts: 68,
    mandatoryRestHoursPerWeek: 24,
    contractType: "co-creator-mg-rs",
    creditAttributionRoleKo: "글·콘티 (Story & Storyboard)",
    creditAttributionRoleEn: "Story & Storyboard",
    secondaryRightsSeparated: true,
    standardContractSigned: true,
  },
  {
    seatId: "seat-lead-art",
    roleTitleKo: "메인 작화·펜선 디렉터",
    roleTitleEn: "Lead Art & Inking Director",
    assigneeNameKo: "박도윤 작가",
    assigneeNameEn: "Doyoon Park",
    weeklyMaxCutCapacity: 45,
    assignedEpisodeCuts: 50,
    mandatoryRestHoursPerWeek: 18,
    contractType: "co-creator-mg-rs",
    creditAttributionRoleKo: "그림·작화 총괄 (Lead Art)",
    creditAttributionRoleEn: "Lead Art",
    secondaryRightsSeparated: true,
    standardContractSigned: true,
  },
  {
    seatId: "seat-ink-assist",
    roleTitleKo: "선화·펜선 어시스턴트",
    roleTitleEn: "Line Art & Inking Assistant",
    assigneeNameKo: "이채원 어시",
    assigneeNameEn: "Chaewon Lee",
    weeklyMaxCutCapacity: 35,
    assignedEpisodeCuts: 18,
    mandatoryRestHoursPerWeek: 24,
    contractType: "per-cut-standard",
    creditAttributionRoleKo: "선화 협력 (Inking Assist)",
    creditAttributionRoleEn: "Inking Assist",
    secondaryRightsSeparated: true,
    standardContractSigned: true,
  },
  {
    seatId: "seat-color-fx",
    roleTitleKo: "밑색·명암·조명 후보정",
    roleTitleEn: "Flats, Shading & FX Specialist",
    assigneeNameKo: "정하늘 컬러팀",
    assigneeNameEn: "Haneul Jung",
    weeklyMaxCutCapacity: 70,
    assignedEpisodeCuts: 68,
    mandatoryRestHoursPerWeek: 20,
    contractType: "per-cut-standard",
    creditAttributionRoleKo: "채색·후보정 (Color & FX)",
    creditAttributionRoleEn: "Color & FX",
    secondaryRightsSeparated: true,
    standardContractSigned: false,
  },
  {
    seatId: "seat-bg-letter",
    roleTitleKo: "3D 배경·식자 파트너",
    roleTitleEn: "3D Background & Lettering Partner",
    assigneeNameKo: "모노리스 3D·식자",
    assigneeNameEn: "Monolith 3D & Type",
    weeklyMaxCutCapacity: 70,
    assignedEpisodeCuts: 60,
    mandatoryRestHoursPerWeek: 24,
    contractType: "episode-turnkey",
    creditAttributionRoleKo: "배경·식자 (3D BG & Lettering)",
    creditAttributionRoleEn: "3D BG & Lettering",
    secondaryRightsSeparated: true,
    standardContractSigned: true,
  },
]);

export function evaluateCrewWorkloadAndContractMatrix(
  records: readonly CrewSeatContractRecord[]
): CrewWorkloadContractSummary {
  const evaluated: EvaluatedCrewSeatStatus[] = records.map((seat) => {
    const cap = Math.max(1, seat.weeklyMaxCutCapacity);
    const utilizationPercent = Math.round((seat.assignedEpisodeCuts / cap) * 100);
    const loadState: "balanced" | "near-limit" | "overloaded" =
      utilizationPercent > 100
        ? "overloaded"
        : utilizationPercent >= 90
          ? "near-limit"
          : "balanced";

    const governanceCompliant =
      seat.standardContractSigned &&
      seat.secondaryRightsSeparated &&
      seat.mandatoryRestHoursPerWeek >= 16 &&
      Boolean(seat.creditAttributionRoleKo.trim());

    const advisoryKo =
      loadState === "overloaded"
        ? `주간 권장 상한(${seat.weeklyMaxCutCapacity}컷) 대비 ${seat.assignedEpisodeCuts - seat.weeklyMaxCutCapacity}컷 초과 — 보조 좌석으로 분담 이관 권장`
        : !seat.standardContractSigned
          ? "착수 전 표준계약서(컷당 단가·수정 횟수·크레딧 표기) 서명 필요"
          : "주간 컷 용량 및 권리·크레딧 보호 기준 충족";

    const advisoryEn =
      loadState === "overloaded"
        ? `Exceeds weekly safe cap (${seat.weeklyMaxCutCapacity} cuts) by ${seat.assignedEpisodeCuts - seat.weeklyMaxCutCapacity} cuts — rebalance to assistant seat`
        : !seat.standardContractSigned
          ? "Requires standard contract signature (unit rate, revision cap, credit role) before start"
          : "Meets weekly capacity and IP/credit protection standards";

    return {
      ...seat,
      utilizationPercent,
      loadState,
      governanceCompliant,
      advisoryKo,
      advisoryEn,
    };
  });

  const overloadedSeatCount = evaluated.filter((s) => s.loadState === "overloaded").length;
  const compliantSeatCount = evaluated.filter((s) => s.governanceCompliant).length;
  const total = Math.max(1, evaluated.length);

  const capacityScore = Math.round(((total - overloadedSeatCount) / total) * 50);
  const contractScore = Math.round((compliantSeatCount / total) * 50);

  return Object.freeze({
    seats: Object.freeze(evaluated),
    overloadedSeatCount,
    compliantSeatCount,
    readinessScore: capacityScore + contractScore,
  });
}

export function rebalanceOverloadedInkingCuts(
  records: readonly CrewSeatContractRecord[],
  transferCuts = 8
): readonly CrewSeatContractRecord[] {
  return records.map((seat) => {
    if (seat.seatId === "seat-lead-art") {
      return {
        ...seat,
        assignedEpisodeCuts: Math.max(10, seat.assignedEpisodeCuts - transferCuts),
      };
    }
    if (seat.seatId === "seat-ink-assist") {
      return {
        ...seat,
        assignedEpisodeCuts: seat.assignedEpisodeCuts + transferCuts,
      };
    }
    return seat;
  });
}
