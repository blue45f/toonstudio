/**
 * 노션(Notion) REA 역공학(`RecordModel` / `RecordStore` / Relation & Rollup / Wiki Verification) 기반
 * 웹툰 콘텐츠 연재·프로모션 멀티뷰 캘린더 및 관계형 작품 설정집(Lore Bible) 아카이빙 데이터베이스 모델.
 *
 * - 단일 컬렉션 레코드 위 다중 뷰 프로젝션(`calendar`, `table`, `board`, `timeline`)
 * - 연재 캘린더(`NotionContentCalendarRecord`)와 작품 설정집(`NotionLoreRecord`) 간 양방향 `Relation` 및
 *   등장 회차 수·첫 등장/최근 등장·설정 충돌 위험을 자동 집계하는 `Rollup` 계산기
 * - 노션 위키 문서 검증(`verified` / `expiring_soon` / `expired`) 만료 추적 및 원클릭 표준 템플릿 인스턴스화
 */

export type NotionDatabaseViewMode = "calendar" | "table" | "board" | "timeline";

export type ContentCalendarCategory =
  | "regular_episode"
  | "special_spin_off"
  | "global_launch"
  | "sns_promo";

export type ReleasePlatformCode =
  | "naver_webtoon"
  | "kakao_page"
  | "line_webtoon_en"
  | "youtube_shorts";

export type ContentPublishStatus =
  | "drafting"
  | "ready_buffer"
  | "scheduled"
  | "published";

export type LoreCategoryKind =
  | "character"
  | "location_3d"
  | "artifact_prop"
  | "timeline_event";

export type WikiVerificationState = "verified" | "expiring_soon" | "expired";

export interface NotionContentCalendarRecord {
  readonly recordId: string;
  readonly episodeCode: string;
  readonly title: string;
  readonly category: ContentCalendarCategory;
  readonly platforms: readonly ReleasePlatformCode[];
  readonly publishStatus: ContentPublishStatus;
  readonly releaseDateIso: string;
  /** 작품 설정집(`NotionLoreRecord.loreId`)과의 양방향 Relation ID 목록 */
  readonly relatedLoreIds: readonly string[];
  readonly manuscriptReadyPercent: number;
}

export interface NotionLoreRecord {
  readonly loreId: string;
  readonly loreCategory: LoreCategoryKind;
  readonly title: string;
  readonly canonicalTag: string;
  readonly summaryBlock: string;
  readonly outfitOrVisualSpec: string;
  readonly continuityWarning: string | null;
  readonly verification: {
    readonly verifiedBy: string;
    readonly verifiedUntilIso: string;
  };
}

export interface LoreBibleRollupRow {
  readonly lore: NotionLoreRecord;
  readonly linkedEpisodeCodes: readonly string[];
  readonly appearanceCount: number;
  readonly firstAppearanceEpisode: string | null;
  readonly latestAppearanceEpisode: string | null;
  readonly verificationState: WikiVerificationState;
  readonly daysUntilVerificationExpiry: number;
  readonly hasContinuityRisk: boolean;
}

export interface ContentCalendarBufferSummary {
  readonly totalRecords: number;
  readonly readyBufferEpisodeCount: number;
  readonly upcomingSevenDaysCount: number;
  readonly bufferHealthStatus: "healthy" | "warning" | "critical";
  readonly bufferSummaryLabel: string;
  readonly sortedRecords: readonly NotionContentCalendarRecord[];
}

function diffDaysIso(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(fromIso.slice(0, 10));
  const toMs = Date.parse(toIso.slice(0, 10));
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function getLoreCategoryLabelKo(category: LoreCategoryKind): string {
  switch (category) {
    case "character":
      return "캐릭터(Character)";
    case "location_3d":
      return "배경·3D 장소(Location)";
    case "artifact_prop":
      return "소품·아티팩트(Prop)";
    case "timeline_event":
      return "세계관 사건 연표(Timeline)";
  }
}

export function getPublishStatusLabelKo(status: ContentPublishStatus): string {
  switch (status) {
    case "drafting":
      return "원고 제작 중";
    case "ready_buffer":
      return "세이브 원고 확보";
    case "scheduled":
      return "예약 업로드 완료";
    case "published":
      return "연재 공개 완료";
  }
}

export function getPlatformLabelKo(platform: ReleasePlatformCode): string {
  switch (platform) {
    case "naver_webtoon":
      return "네이버웹툰";
    case "kakao_page":
      return "카카오페이지";
    case "line_webtoon_en":
      return "글로벌 WEBTOON(EN)";
    case "youtube_shorts":
      return "유튜브 쇼츠 PV";
  }
}

/**
 * 노션 위키 문서 검증(`Verification`) 만료일과 기준일을 비교하여
 * `verified`(유효), `expiring_soon`(7일 이내 만료 임박), `expired`(만료됨) 상태를 판정한다.
 */
export function evaluateWikiVerificationStatus(
  verifiedUntilIso: string,
  referenceDateIso: string,
): {
  readonly state: WikiVerificationState;
  readonly daysRemaining: number;
} {
  const daysRemaining = diffDaysIso(referenceDateIso, verifiedUntilIso);
  if (daysRemaining < 0) {
    return { state: "expired", daysRemaining };
  }
  if (daysRemaining <= 7) {
    return { state: "expiring_soon", daysRemaining };
  }
  return { state: "verified", daysRemaining };
}

/**
 * 작품 설정집(`NotionLoreRecord`)과 콘텐츠 캘린더(`NotionContentCalendarRecord`) 간의
 * 양방향 `Relation`을 순회하여 등장 회차 수, 첫 등장/최근 등장 회차, 설정 검증 만료 및
 * 작화 설정 충돌 위험(`hasContinuityRisk`)을 `Rollup` 집계한다.
 */
export function computeLoreBibleRollups(
  loreRecords: readonly NotionLoreRecord[],
  calendarRecords: readonly NotionContentCalendarRecord[],
  referenceDateIso: string,
): readonly LoreBibleRollupRow[] {
  const sortedCalendar = [...calendarRecords].sort((a, b) =>
    a.releaseDateIso.localeCompare(b.releaseDateIso),
  );

  return loreRecords.map((lore) => {
    const linkedRecords = sortedCalendar.filter((cal) =>
      cal.relatedLoreIds.includes(lore.loreId),
    );
    const linkedEpisodeCodes = linkedRecords.map((cal) => cal.episodeCode);
    const appearanceCount = linkedEpisodeCodes.length;
    const firstAppearanceEpisode =
      linkedEpisodeCodes.length > 0 ? linkedEpisodeCodes[0]! : null;
    const latestAppearanceEpisode =
      linkedEpisodeCodes.length > 0
        ? linkedEpisodeCodes[linkedEpisodeCodes.length - 1]!
        : null;

    const verificationCheck = evaluateWikiVerificationStatus(
      lore.verification.verifiedUntilIso,
      referenceDateIso,
    );

    const hasUpcomingUnpublishedLink = linkedRecords.some(
      (cal) => cal.publishStatus !== "published",
    );
    const hasContinuityRisk =
      Boolean(lore.continuityWarning) ||
      (verificationCheck.state === "expired" && hasUpcomingUnpublishedLink);

    return {
      lore,
      linkedEpisodeCodes,
      appearanceCount,
      firstAppearanceEpisode,
      latestAppearanceEpisode,
      verificationState: verificationCheck.state,
      daysUntilVerificationExpiry: verificationCheck.daysRemaining,
      hasContinuityRisk,
    };
  });
}

/**
 * 콘텐츠 캘린더에서 세이브 원고 버퍼(100% 완성된 미공개 회차 수)와 향후 7일 내 공개 일정을 집계한다.
 */
export function computeContentCalendarBufferMetrics(
  calendarRecords: readonly NotionContentCalendarRecord[],
  referenceDateIso: string,
): ContentCalendarBufferSummary {
  const sortedRecords = [...calendarRecords].sort((a, b) =>
    a.releaseDateIso.localeCompare(b.releaseDateIso),
  );

  const readyBufferEpisodeCount = sortedRecords.filter(
    (rec) =>
      rec.category === "regular_episode" &&
      (rec.publishStatus === "ready_buffer" || rec.publishStatus === "scheduled") &&
      rec.manuscriptReadyPercent >= 100,
  ).length;

  const upcomingSevenDaysCount = sortedRecords.filter((rec) => {
    const diff = diffDaysIso(referenceDateIso, rec.releaseDateIso);
    return diff >= 0 && diff <= 7 && rec.publishStatus !== "published";
  }).length;

  let bufferHealthStatus: "healthy" | "warning" | "critical" = "healthy";
  if (readyBufferEpisodeCount === 0) {
    bufferHealthStatus = "critical";
  } else if (readyBufferEpisodeCount < 3) {
    bufferHealthStatus = "warning";
  }

  const bufferSummaryLabel =
    bufferHealthStatus === "healthy"
      ? `세이브 원고 ${readyBufferEpisodeCount}회차 확보 (안정권)`
      : bufferHealthStatus === "warning"
        ? `세이브 원고 ${readyBufferEpisodeCount}회차 (최소 권장 3회차 미만 · 주의)`
        : "세이브 원고 버퍼 소진 (긴급 마감 체제)";

  return {
    totalRecords: sortedRecords.length,
    readyBufferEpisodeCount,
    upcomingSevenDaysCount,
    bufferHealthStatus,
    bufferSummaryLabel,
    sortedRecords,
  };
}

/**
 * 특정 캘린더 회차 레코드와 작품 설정집(`loreId`) 간의 양방향 `Relation` 연결을 토글한다.
 */
export function toggleCalendarLoreRelation(
  calendarRecords: readonly NotionContentCalendarRecord[],
  recordId: string,
  loreId: string,
): readonly NotionContentCalendarRecord[] {
  return calendarRecords.map((rec) => {
    if (rec.recordId !== recordId) return rec;
    const exists = rec.relatedLoreIds.includes(loreId);
    const nextLoreIds = exists
      ? rec.relatedLoreIds.filter((id) => id !== loreId)
      : [...rec.relatedLoreIds, loreId];
    return {
      ...rec,
      relatedLoreIds: nextLoreIds,
    };
  });
}

/**
 * 만료되었거나 만료 임박한 설정집 문서의 위키 검증 기한(`verifiedUntilIso`)을 기준일로부터 +30일 연장한다.
 */
export function renewLoreVerification(
  loreRecords: readonly NotionLoreRecord[],
  loreId: string,
  verifiedBy: string,
  nextVerifiedUntilIso: string,
): readonly NotionLoreRecord[] {
  return loreRecords.map((lore) =>
    lore.loreId === loreId
      ? {
          ...lore,
          verification: {
            verifiedBy,
            verifiedUntilIso: nextVerifiedUntilIso,
          },
        }
      : lore,
  );
}

/**
 * 노션 데이터베이스 원클릭 표준 템플릿으로 신규 작품 설정집 레코드 또는 연재 캘린더 레코드를 생성한다.
 */
export function instantiateStudioLoreTemplate(
  templateKind: LoreCategoryKind,
  sequenceNumber: number,
): NotionLoreRecord {
  const num = Math.max(1, Math.trunc(sequenceNumber));
  switch (templateKind) {
    case "character":
      return {
        loreId: `lore-char-tpl-${num}`,
        loreCategory: "character",
        title: `[신규 캐릭터 시트 #${num}] 북부 감찰관 세라핀`,
        canonicalTag: `CHR-TPL-${num}`,
        summaryBlock: "황실 직속 마도 감찰관. 4화 후반부에 북부 성채 검열관으로 첫 등장.",
        outfitOrVisualSpec: "백은색 롱코트 + 좌측 흉부 황실 감찰국 금장 브로치 + 청록색 안광",
        continuityWarning: null,
        verification: {
          verifiedBy: "설정작가 오유진",
          verifiedUntilIso: "2026-11-30",
        },
      };
    case "location_3d":
      return {
        loreId: `lore-loc-tpl-${num}`,
        loreCategory: "location_3d",
        title: `[신규 3D 배경 #${num}] 지하 봉인 수로 제3수문`,
        canonicalTag: `LOC-TPL-${num}`,
        summaryBlock: "성채 지하 40m에 위치한 고대 수로. 청록색 발광 이끼와 석조 아치 구조.",
        outfitOrVisualSpec: "Blender 4.2 세트 v1 · 카메라 기본 화각 35mm · 환경 안개 밀도 0.18",
        continuityWarning: null,
        verification: {
          verifiedBy: "배경3D팀 박도윤",
          verifiedUntilIso: "2026-11-30",
        },
      };
    case "artifact_prop":
      return {
        loreId: `lore-prop-tpl-${num}`,
        loreCategory: "artifact_prop",
        title: `[신규 소품 시트 #${num}] 고대 왕국의 첫 번째 열쇠`,
        canonicalTag: `ART-TPL-${num}`,
        summaryBlock: "봉인석 코어를 개방하는 팔각 황동 아티팩트.",
        outfitOrVisualSpec: "평상시 무광 청동색, 마력 주입 시 내부 룬 문양 금색 발광",
        continuityWarning: null,
        verification: {
          verifiedBy: "총괄작화 김서연",
          verifiedUntilIso: "2026-11-30",
        },
      };
    case "timeline_event":
      return {
        loreId: `lore-evt-tpl-${num}`,
        loreCategory: "timeline_event",
        title: `[신규 사건 연표 #${num}] 제국력 412년 붉은 달의 서약식`,
        canonicalTag: `EVT-TPL-${num}`,
        summaryBlock: "4대 기사단이 북부 성채에 집결해 봉인석 수호 맹세를 갱신한 사건.",
        outfitOrVisualSpec: "전원 동계 정복 착용 필수, 성채 중앙 첨탑 붉은 달 배경 고정",
        continuityWarning: null,
        verification: {
          verifiedBy: "설정작가 오유진",
          verifiedUntilIso: "2026-11-30",
        },
      };
  }
}
