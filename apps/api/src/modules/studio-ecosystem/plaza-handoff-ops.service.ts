/**
 * plaza-handoff-ops.service.ts — 구인 광장 객관 신뢰 지표, 대타 스타일시트 인계 팩,
 * `.clip/.psd` 규격·레이어 사전 점검(PSD 8BPS 헤더 파싱 포함), 교육기관 무상 합평 보드.
 */

import { BadRequestException, Injectable, Optional } from "@nestjs/common";

import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";

export type ObjectiveTrustBadgeTier =
  | "unverified"
  | "verified-handoff"
  | "clean-finisher"
  | "studio-anchor";

export interface ObjectiveTrustBadgeRecord {
  readonly avatarId: string;
  readonly nickname: string;
  readonly verifiedHandoffCount: number;
  readonly onTimeHandoffCount: number;
  readonly firstLockPassCount: number;
  readonly onTimeDeliveryRatePct: number;
  readonly cleanPassRatePct: number;
  readonly medianResponseMinutes: number;
  readonly badgeTier: ObjectiveTrustBadgeTier;
  readonly badgeLabelKo: string;
  readonly updatedAt: string;
}

export interface StarterKitColorChip {
  readonly roleKo: string;
  readonly hex: string;
}

export type ManuscriptColorProfile = "sRGB" | "Display-P3" | "CMYK" | "Grayscale";

export interface PartyStarterKitPack {
  readonly partyId: string;
  readonly workTitle: string;
  readonly canvasWidthPx: number;
  readonly dpi: number;
  readonly colorProfile: ManuscriptColorProfile;
  readonly brushSpecKo: string;
  readonly perspectiveGuideKo: string;
  readonly colorChips: readonly StarterKitColorChip[];
  readonly updatedAt: string;
}

export interface PlazaPreflightIssue {
  readonly code:
    | "width_mismatch"
    | "dpi_mismatch"
    | "color_profile_mismatch"
    | "no_changed_layers"
    | "unresolved_mandatory_pins";
  readonly severity: "blocker" | "warning";
  readonly messageKo: string;
}

export interface PlazaPreflightResult {
  readonly passed: boolean;
  readonly parsedFromBinary: boolean;
  readonly fileName: string;
  readonly expectedWidthPx: number;
  readonly expectedDpi: number;
  readonly expectedColorProfile: ManuscriptColorProfile;
  readonly detectedWidthPx: number | null;
  readonly detectedHeightPx: number | null;
  readonly detectedDpi: number | null;
  readonly detectedColorProfile: ManuscriptColorProfile | null;
  readonly changedLayerCount: number;
  readonly unresolvedMandatoryPinCount: number;
  readonly issues: readonly PlazaPreflightIssue[];
  readonly summaryKo: string;
}

export interface AcademySubmissionItem {
  readonly submissionId: string;
  readonly studentName: string;
  readonly episodeCutLabel: string;
  readonly unresolvedPinCount: number;
  readonly passedSpecPreflight: boolean;
  readonly approvalLocked: boolean;
  readonly submittedAt: string;
}

export interface AcademyCritiqueClassroomRecord {
  readonly classroomId: string;
  readonly institutionName: string;
  readonly courseTitle: string;
  readonly instructorName: string;
  readonly cohortSize: number;
  readonly inviteCode: string;
  readonly feeKrw: 0;
  readonly targetWidthPx: number;
  readonly targetDpi: number;
  readonly submissions: readonly AcademySubmissionItem[];
  readonly createdAt: string;
}

export function computeObjectiveBadgeTier(input: {
  readonly verifiedHandoffCount: number;
  readonly onTimeDeliveryRatePct: number;
  readonly cleanPassRatePct: number;
}): { readonly tier: ObjectiveTrustBadgeTier; readonly labelKo: string } {
  if (
    input.verifiedHandoffCount >= 25
    && input.onTimeDeliveryRatePct >= 95
    && input.cleanPassRatePct >= 85
  ) {
    return { tier: "studio-anchor", labelKo: "안정 마감 마스터" };
  }
  if (
    input.verifiedHandoffCount >= 10
    && input.onTimeDeliveryRatePct >= 90
    && input.cleanPassRatePct >= 80
  ) {
    return { tier: "clean-finisher", labelKo: "1회 승인 우수" };
  }
  if (input.verifiedHandoffCount >= 3) {
    return { tier: "verified-handoff", labelKo: "검증 인계 완료" };
  }
  return { tier: "unverified", labelKo: "신규 참여" };
}

/**
 * PSD/PSB(`8BPS`) 바이너리 헤더(최소 26바이트)에서 가로·세로 픽셀과 컬러 모드를 추출한다.
 * 구조: [0..3]="8BPS", [4..5]=version(1|2), [12..13]=channels, [14..17]=height, [18..21]=width, [24..25]=colorMode
 */
export function parsePsdHeaderBase64(headerBase64: string): {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly colorProfile: ManuscriptColorProfile;
} | null {
  try {
    const buf = Buffer.from(headerBase64, "base64");
    if (buf.length < 26) return null;
    const sig = buf.subarray(0, 4).toString("ascii");
    if (sig !== "8BPS") return null;
    const version = buf.readUInt16BE(4);
    if (version !== 1 && version !== 2) return null;
    const heightPx = buf.readUInt32BE(14);
    const widthPx = buf.readUInt32BE(18);
    const colorMode = buf.readUInt16BE(24);
    if (widthPx <= 0 || heightPx <= 0) return null;
    const colorProfile: ManuscriptColorProfile =
      colorMode === 4
        ? "CMYK"
        : colorMode === 1
          ? "Grayscale"
          : "sRGB";
    return { widthPx, heightPx, colorProfile };
  } catch {
    return null;
  }
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/u;

@Injectable()
export class PlazaHandoffOpsService {
  private readonly trustMap = new Map<string, {
    avatarId: string;
    nickname: string;
    verifiedHandoffCount: number;
    onTimeHandoffCount: number;
    firstLockPassCount: number;
    responseSamples: number[];
    updatedAt: string;
  }>([
    [
      "av-1",
      {
        avatarId: "av-1",
        nickname: "펜선장인_루나",
        verifiedHandoffCount: 112,
        onTimeHandoffCount: 110,
        firstLockPassCount: 102,
        responseSamples: [5, 6, 7],
        updatedAt: "2026-11-26T06:00:00.000Z",
      },
    ],
    [
      "av-2",
      {
        avatarId: "av-2",
        nickname: "아케인VFX_카이",
        verifiedHandoffCount: 54,
        onTimeHandoffCount: 50,
        firstLockPassCount: 45,
        responseSamples: [9, 10, 11],
        updatedAt: "2026-11-26T06:00:00.000Z",
      },
    ],
    [
      "av-3",
      {
        avatarId: "av-3",
        nickname: "블렌더건축_하율",
        verifiedHandoffCount: 140,
        onTimeHandoffCount: 136,
        firstLockPassCount: 126,
        responseSamples: [10, 12, 14],
        updatedAt: "2026-11-26T06:00:00.000Z",
      },
    ],
  ]);

  private readonly starterKits = new Map<string, PartyStarterKitPack>([
    [
      "party-gate-01",
      {
        partyId: "party-gate-01",
        workTitle: "헌터 액션 주간연재 · 게이트 브레이커",
        canvasWidthPx: 1440,
        dpi: 300,
        colorProfile: "sRGB",
        brushSpecKo: "주선 G펜 7px · 필압 최소 35% · 안티에일리어싱 중간 고정",
        perspectiveGuideKo: "실내 2점 투시 기준 · 아이레벨 캔버스 세로 42% 지점 유지",
        colorChips: [
          { roleKo: "주인공 눈동자", hex: "#2B5B84" },
          { roleKo: "기본 피부 베이스", hex: "#F6DFD0" },
          { roleKo: "마력 각성 이펙트", hex: "#38BDF8" },
        ],
        updatedAt: "2026-11-26T06:00:00.000Z",
      },
    ],
  ]);

  private readonly classrooms: AcademyCritiqueClassroomRecord[] = [
    {
      classroomId: "acad-seed-01",
      institutionName: "서울 웹툰창작 아카데미",
      courseTitle: "주간연재 콘티·선화 실전 합평반",
      instructorName: "강현우 지도강사",
      cohortSize: 24,
      inviteCode: "ACAD-SEOUL26",
      feeKrw: 0,
      targetWidthPx: 1440,
      targetDpi: 300,
      submissions: [
        {
          submissionId: "sub-seed-1",
          studentName: "수강생_정하린",
          episodeCutLabel: "3주차 과제 · 1화 08~12컷",
          unresolvedPinCount: 0,
          passedSpecPreflight: true,
          approvalLocked: false,
          submittedAt: "2026-11-26T05:30:00.000Z",
        },
      ],
      createdAt: "2026-11-26T05:00:00.000Z",
    },
  ];

  constructor(
    @Optional() private readonly events?: StudioEcosystemEventsService,
  ) {}

  private toBadgeRecord(raw: {
    avatarId: string;
    nickname: string;
    verifiedHandoffCount: number;
    onTimeHandoffCount: number;
    firstLockPassCount: number;
    responseSamples: number[];
    updatedAt: string;
  }): ObjectiveTrustBadgeRecord {
    const total = Math.max(1, raw.verifiedHandoffCount);
    const onTimeDeliveryRatePct = Math.round(
      (raw.onTimeHandoffCount / total) * 100,
    );
    const cleanPassRatePct = Math.round(
      (raw.firstLockPassCount / total) * 100,
    );
    const sorted = [...raw.responseSamples].sort((a, b) => a - b);
    const medianResponseMinutes =
      sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 15;
    const badge = computeObjectiveBadgeTier({
      verifiedHandoffCount: raw.verifiedHandoffCount,
      onTimeDeliveryRatePct,
      cleanPassRatePct,
    });
    return {
      avatarId: raw.avatarId,
      nickname: raw.nickname,
      verifiedHandoffCount: raw.verifiedHandoffCount,
      onTimeHandoffCount: raw.onTimeHandoffCount,
      firstLockPassCount: raw.firstLockPassCount,
      onTimeDeliveryRatePct,
      cleanPassRatePct,
      medianResponseMinutes,
      badgeTier: badge.tier,
      badgeLabelKo: badge.labelKo,
      updatedAt: raw.updatedAt,
    };
  }

  listTrustBadges() {
    return {
      items: [...this.trustMap.values()].map((entry) => this.toBadgeRecord(entry)),
    };
  }

  recordVerifiedHandoff(input: {
    readonly avatarId: string;
    readonly nickname?: string;
    readonly deliveredOnTime: boolean;
    readonly passedFirstLock: boolean;
    readonly responseMinutes?: number;
  }): ObjectiveTrustBadgeRecord {
    const avatarId = (input.avatarId ?? "").trim();
    if (!avatarId) {
      throw new BadRequestException("어시스턴트 식별자가 필요합니다.");
    }
    const prev = this.trustMap.get(avatarId) ?? {
      avatarId,
      nickname: (input.nickname ?? "").trim() || avatarId,
      verifiedHandoffCount: 0,
      onTimeHandoffCount: 0,
      firstLockPassCount: 0,
      responseSamples: [],
      updatedAt: new Date().toISOString(),
    };
    const nextSamples = [
      ...prev.responseSamples.slice(-19),
      Math.max(1, Math.round(input.responseMinutes ?? 10)),
    ];
    const updated = {
      avatarId,
      nickname: (input.nickname ?? "").trim() || prev.nickname,
      verifiedHandoffCount: prev.verifiedHandoffCount + 1,
      onTimeHandoffCount:
        prev.onTimeHandoffCount + (input.deliveredOnTime ? 1 : 0),
      firstLockPassCount:
        prev.firstLockPassCount + (input.passedFirstLock ? 1 : 0),
      responseSamples: nextSamples,
      updatedAt: new Date().toISOString(),
    };
    this.trustMap.set(avatarId, updated);
    const badgeRecord = this.toBadgeRecord(updated);
    this.events?.emit("plaza.trust_updated", {
      avatarId: badgeRecord.avatarId,
      badgeTier: badgeRecord.badgeTier,
      verifiedHandoffCount: badgeRecord.verifiedHandoffCount,
    });
    return badgeRecord;
  }

  getStarterKit(partyId: string): PartyStarterKitPack {
    const cleanId = (partyId ?? "").trim() || "party-gate-01";
    return (
      this.starterKits.get(cleanId) ?? {
        partyId: cleanId,
        workTitle: "공유 검수 파티 기본 인계 팩",
        canvasWidthPx: 1440,
        dpi: 300,
        colorProfile: "sRGB",
        brushSpecKo: "주선 G펜 6~8px · 안티에일리어싱 중간 고정",
        perspectiveGuideKo: "콘티 가이드 레이어 소실점 기준 유지",
        colorChips: [
          { roleKo: "주선 잉크", hex: "#1C1917" },
          { roleKo: "기본 피부톤", hex: "#F5DFD2" },
        ],
        updatedAt: new Date().toISOString(),
      }
    );
  }

  saveStarterKit(
    partyId: string,
    input: {
      readonly workTitle: string;
      readonly canvasWidthPx: number;
      readonly dpi: number;
      readonly colorProfile: ManuscriptColorProfile;
      readonly brushSpecKo: string;
      readonly perspectiveGuideKo: string;
      readonly colorChips: readonly StarterKitColorChip[];
    },
  ): PartyStarterKitPack {
    const cleanId = (partyId ?? "").trim();
    if (!cleanId) {
      throw new BadRequestException("파티 식별자가 필요합니다.");
    }
    const width = Math.round(Number(input.canvasWidthPx) || 1440);
    const dpi = Math.round(Number(input.dpi) || 300);
    if (width < 400 || width > 10_000) {
      throw new BadRequestException("원고 가로 폭은 400px~10,000px 범위여야 합니다.");
    }
    if (dpi < 72 || dpi > 1200) {
      throw new BadRequestException("원고 해상도는 72~1,200 DPI 범위여야 합니다.");
    }
    const chips = (input.colorChips ?? [])
      .filter((c) => c?.roleKo?.trim() && HEX_COLOR_RE.test(c.hex ?? ""))
      .slice(0, 12)
      .map((c) => ({ roleKo: c.roleKo.trim(), hex: c.hex.toUpperCase() }));

    const allowedProfiles: readonly ManuscriptColorProfile[] = [
      "sRGB",
      "Display-P3",
      "CMYK",
      "Grayscale",
    ];
    const profile = allowedProfiles.includes(input.colorProfile)
      ? input.colorProfile
      : "sRGB";

    const pack: PartyStarterKitPack = {
      partyId: cleanId,
      workTitle: (input.workTitle ?? "").trim() || "작품 스타일시트 인계 팩",
      canvasWidthPx: width,
      dpi,
      colorProfile: profile,
      brushSpecKo:
        (input.brushSpecKo ?? "").trim() || "주선 G펜 7px · 필압 기준 유지",
      perspectiveGuideKo:
        (input.perspectiveGuideKo ?? "").trim() || "배경 투시 가이드 레이어 준수",
      colorChips:
        chips.length > 0
          ? chips
          : [{ roleKo: "기본 주선", hex: "#1C1917" }],
      updatedAt: new Date().toISOString(),
    };
    this.starterKits.set(cleanId, pack);
    this.events?.emit("plaza.starter_kit_updated", {
      partyId: cleanId,
      canvasWidthPx: pack.canvasWidthPx,
      dpi: pack.dpi,
    });
    return pack;
  }

  inspectManuscriptPreflight(input: {
    readonly partyId?: string;
    readonly fileName: string;
    readonly headerBase64?: string;
    readonly reportedWidthPx?: number;
    readonly reportedHeightPx?: number;
    readonly reportedDpi?: number;
    readonly reportedColorProfile?: ManuscriptColorProfile;
    readonly changedLayerNames?: readonly string[];
    readonly unresolvedMandatoryPinCount?: number;
  }): PlazaPreflightResult {
    const fileName = (input.fileName ?? "").trim() || "manuscript.clip";
    const kit = this.getStarterKit(input.partyId ?? "party-gate-01");
    const binaryParsed = input.headerBase64
      ? parsePsdHeaderBase64(input.headerBase64)
      : null;

    const detectedWidthPx =
      binaryParsed?.widthPx ?? (input.reportedWidthPx ? Math.round(input.reportedWidthPx) : null);
    const detectedHeightPx =
      binaryParsed?.heightPx ?? (input.reportedHeightPx ? Math.round(input.reportedHeightPx) : null);
    const detectedDpi = input.reportedDpi ? Math.round(input.reportedDpi) : null;
    const detectedColorProfile =
      binaryParsed?.colorProfile ?? input.reportedColorProfile ?? null;
    const changedLayers = (input.changedLayerNames ?? []).filter((n) =>
      Boolean(n?.trim()),
    );
    const unresolvedPins = Math.max(
      0,
      Math.trunc(input.unresolvedMandatoryPinCount ?? 0),
    );

    const issues: PlazaPreflightIssue[] = [];
    if (detectedWidthPx !== null && detectedWidthPx !== kit.canvasWidthPx) {
      issues.push({
        code: "width_mismatch",
        severity: "blocker",
        messageKo: `가로 폭 불일치: 파티 기준 ${kit.canvasWidthPx}px ↔ 제출 파일 ${detectedWidthPx}px`,
      });
    }
    if (detectedDpi !== null && detectedDpi !== kit.dpi) {
      issues.push({
        code: "dpi_mismatch",
        severity: "warning",
        messageKo: `해상도(DPI) 차이: 파티 기준 ${kit.dpi}dpi ↔ 제출 파일 ${detectedDpi}dpi`,
      });
    }
    if (
      detectedColorProfile !== null
      && detectedColorProfile !== kit.colorProfile
    ) {
      issues.push({
        code: "color_profile_mismatch",
        severity: "blocker",
        messageKo: `컬러 모드 이탈: 파티 기준 ${kit.colorProfile} ↔ 제출 파일 ${detectedColorProfile}`,
      });
    }
    if (changedLayers.length === 0) {
      issues.push({
        code: "no_changed_layers",
        severity: "warning",
        messageKo: "이전 버전 대비 변경된 수정 레이어 목록이 감지되지 않았습니다.",
      });
    }
    if (unresolvedPins > 0) {
      issues.push({
        code: "unresolved_mandatory_pins",
        severity: "blocker",
        messageKo: `미해결 필수 수정 핀 ${unresolvedPins}건이 남아 최종 승인이 잠깁니다.`,
      });
    }

    const hasBlocker = issues.some((item) => item.severity === "blocker");
    const passed = !hasBlocker;
    const summaryKo = passed
      ? issues.length === 0
        ? "원고 규격·컬러 모드·필수 수정 핀 검사를 모두 통과했습니다."
        : `필수 규격 통과 (참고 경고 ${issues.length}건 확인 권장)`
      : `승인 보류: 필수 규격·수정 핀 미충족 ${issues.filter((i) => i.severity === "blocker").length}건`;

    this.events?.emit("plaza.preflight_checked", {
      fileName,
      passed,
      issueCount: issues.length,
    });

    return {
      passed,
      parsedFromBinary: Boolean(binaryParsed),
      fileName,
      expectedWidthPx: kit.canvasWidthPx,
      expectedDpi: kit.dpi,
      expectedColorProfile: kit.colorProfile,
      detectedWidthPx,
      detectedHeightPx,
      detectedDpi,
      detectedColorProfile,
      changedLayerCount: changedLayers.length,
      unresolvedMandatoryPinCount: unresolvedPins,
      issues,
      summaryKo,
    };
  }

  listAcademyClassrooms() {
    return { items: this.classrooms };
  }

  createAcademyClassroom(input: {
    readonly institutionName: string;
    readonly courseTitle: string;
    readonly instructorName: string;
    readonly cohortSize?: number;
    readonly targetWidthPx?: number;
    readonly targetDpi?: number;
  }): AcademyCritiqueClassroomRecord {
    const inst = (input.institutionName ?? "").trim();
    const course = (input.courseTitle ?? "").trim();
    if (inst.length < 2 || course.length < 2) {
      throw new BadRequestException("교육기관명과 수업명을 모두 2자 이상 입력해 주세요.");
    }
    const suffix = (this.classrooms.length + 1).toString().padStart(2, "0");
    const record: AcademyCritiqueClassroomRecord = {
      classroomId: `acad-${suffix}-${Date.now().toString(36)}`,
      institutionName: inst.slice(0, 60),
      courseTitle: course.slice(0, 80),
      instructorName: (input.instructorName ?? "").trim().slice(0, 40) || "담당 교수·강사",
      cohortSize: Math.max(1, Math.min(200, Math.round(input.cohortSize || 25))),
      inviteCode: `ACAD-${Date.now().toString(36).slice(-5).toUpperCase()}${suffix}`,
      feeKrw: 0,
      targetWidthPx: Math.max(600, Math.round(input.targetWidthPx || 1440)),
      targetDpi: Math.max(72, Math.round(input.targetDpi || 300)),
      submissions: [],
      createdAt: new Date().toISOString(),
    };
    this.classrooms.unshift(record);
    this.events?.emit("academy.classroom_created", {
      classroomId: record.classroomId,
      institutionName: record.institutionName,
      inviteCode: record.inviteCode,
    });
    return record;
  }

  submitClassroomCut(
    classroomId: string,
    input: {
      readonly studentName: string;
      readonly episodeCutLabel: string;
      readonly unresolvedPinCount?: number;
      readonly passedSpecPreflight?: boolean;
    },
  ): AcademySubmissionItem {
    const idx = this.classrooms.findIndex((c) => c.classroomId === classroomId);
    if (idx < 0) {
      throw new BadRequestException("존재하지 않는 합평 클래스룸입니다.");
    }
    const target = this.classrooms[idx]!;
    const unresolvedPinCount = Math.max(
      0,
      Math.trunc(input.unresolvedPinCount ?? 0),
    );
    const passedSpecPreflight = input.passedSpecPreflight !== false;
    const item: AcademySubmissionItem = {
      submissionId: `sub-${Date.now().toString(36)}`,
      studentName: (input.studentName ?? "").trim().slice(0, 40) || "수강생",
      episodeCutLabel:
        (input.episodeCutLabel ?? "").trim().slice(0, 60) || "주차 실습 원고",
      unresolvedPinCount,
      passedSpecPreflight,
      approvalLocked: unresolvedPinCount > 0 || !passedSpecPreflight,
      submittedAt: new Date().toISOString(),
    };
    this.classrooms[idx] = {
      ...target,
      submissions: [item, ...target.submissions].slice(0, 50),
    };
    return item;
  }
}
