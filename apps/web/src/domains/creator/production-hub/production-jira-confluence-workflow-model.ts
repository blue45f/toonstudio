/**
 * Atlassian Jira Cloud (REST API v3) 및 Confluence Cloud (REST API v2) 역공학 기반
 * 웹툰·노블코믹스 스튜디오 애자일 일감 티켓(PD 발행 → 담당자 가져가기 → 완료 시 PD 자동 검수 알림) 및
 * Confluence 설정집·컬러 스크립트 양방향 스마트 링크 도메인 모델.
 */

import type { ShotGridPipelineStep } from "./production-shotgrid-version-lineage-model";

export type WebtoonTicketStatus =
  | "READY_FOR_PULL"
  | "IN_PROGRESS"
  | "PENDING_PD_REVIEW"
  | "RETAKE_REQUESTED"
  | "PD_APPROVED";

export type WebtoonTicketPriority = "highest" | "high" | "medium" | "low";

export type NotificationDeliveryChannel = "in-app" | "push" | "webhook";

export interface WebtoonTicketRecord {
  readonly id: string;
  readonly issueKey: string;
  readonly projectKey: string;
  readonly workTitle: string;
  readonly episodeNumber: number;
  readonly step: ShotGridPipelineStep;
  readonly title: string;
  readonly cutRange: readonly [number, number];
  readonly status: WebtoonTicketStatus;
  readonly priority: WebtoonTicketPriority;
  readonly reporterPdId: string;
  readonly reporterPdName: string;
  readonly assigneeWorkerId: string | null;
  readonly assigneeWorkerName: string | null;
  readonly blockedByIssueKeys: readonly string[];
  readonly blocksIssueKeys: readonly string[];
  readonly linkedVersionCode: string | null;
  readonly linkedConfluencePageIds: readonly string[];
  readonly acknowledgedConfluenceVersions: Readonly<Record<string, number>>;
  readonly dueDate: string;
  readonly claimedAt: string | null;
  readonly submittedForReviewAt: string | null;
  readonly approvedAt: string | null;
  readonly retakeReason: string | null;
}

export interface PdReviewAutoNotification {
  readonly id: string;
  readonly issueKey: string;
  readonly ticketTitle: string;
  readonly episodeNumber: number;
  readonly step: ShotGridPipelineStep;
  readonly recipientPdId: string;
  readonly recipientPdName: string;
  readonly submittedByWorkerId: string;
  readonly submittedByWorkerName: string;
  readonly linkedVersionCode: string;
  readonly createdAt: string;
  readonly channels: readonly NotificationDeliveryChannel[];
  readonly acknowledged: boolean;
  readonly message: string;
}

export interface ConfluenceLoreSwatch {
  readonly label: string;
  readonly hex: string;
}

export interface ConfluenceLorePage {
  readonly id: string;
  readonly spaceKey: string;
  readonly title: string;
  readonly category: "color-script" | "character-sheet" | "background-3d" | "episode-direction";
  readonly versionNumber: number;
  readonly lastUpdatedBy: string;
  readonly updatedAt: string;
  readonly paletteSwatches: readonly ConfluenceLoreSwatch[];
  readonly summaryRules: readonly string[];
  readonly inlineCommentsCount: number;
}

export interface EvaluatedConfluenceSmartLink {
  readonly page: ConfluenceLorePage;
  readonly acknowledgedVersion: number;
  readonly isOutdatedSpec: boolean;
  readonly versionDelta: number;
}

export interface WebtoonTicketJqlFilter {
  readonly status?: WebtoonTicketStatus | "ALL";
  readonly step?: ShotGridPipelineStep | "all";
  readonly episodeNumber?: number | null;
  readonly onlyPullableUnassigned?: boolean;
  readonly searchText?: string;
}

export const WEBTOON_TICKET_STATUS_META: Readonly<
  Record<
    WebtoonTicketStatus,
    { readonly labelKo: string; readonly labelEn: string; readonly bg: string; readonly color: string }
  >
> = {
  READY_FOR_PULL: {
    labelKo: "일감 대기열 (가져가기 가능)",
    labelEn: "Ready for Pull",
    bg: "#e0f2fe",
    color: "#0369a1",
  },
  IN_PROGRESS: {
    labelKo: "담당자 작업 중 (In Progress)",
    labelEn: "In Progress",
    bg: "#dbeafe",
    color: "#1d4ed8",
  },
  PENDING_PD_REVIEW: {
    labelKo: "PD 자동 검수 대기 (In Review)",
    labelEn: "Pending PD Review",
    bg: "#fef3c7",
    color: "#b45309",
  },
  RETAKE_REQUESTED: {
    labelKo: "리테이크 요청됨 (Retake)",
    labelEn: "Retake Requested",
    bg: "#fee2e2",
    color: "#b91c1c",
  },
  PD_APPROVED: {
    labelKo: "PD 최종 승인 완료 (Done)",
    labelEn: "PD Approved",
    bg: "#dcfce7",
    color: "#15803d",
  },
};

export const WEBTOON_TICKET_PRIORITY_LABELS: Readonly<Record<WebtoonTicketPriority, string>> = {
  highest: "긴급 (Highest)",
  high: "높음 (High)",
  medium: "보통 (Medium)",
  low: "낮음 (Low)",
};

const STEP_TICKET_SUFFIX_KO: Readonly<Record<ShotGridPipelineStep, string>> = {
  storyboard: "콘티·각색 요청",
  "line-art": "선화·펜터치 요청",
  "base-color": "밑색·지정색 요청",
  shading: "채색 요청",
  "background-3d": "배경·3D 합성 요청",
  "lighting-fx": "후보정·이펙트 요청",
  typesetting: "식자·최종 편집 요청",
};

/**
 * 메인 PD가 작품명·회차·공정을 선택해 표준 웹툰 일감 티켓 제목(예: '화산귀환 48화 채색 요청')을 생성한다.
 */
export function formatStandardWebtoonTicketTitle(
  workTitle: string,
  episodeNumber: number,
  step: ShotGridPipelineStep,
  customDetail?: string,
): string {
  const cleanWork = workTitle.trim() || "작품";
  const suffix = STEP_TICKET_SUFFIX_KO[step];
  const detail = customDetail?.trim();
  return detail
    ? `${cleanWork} ${episodeNumber}화 ${suffix} (${detail})`
    : `${cleanWork} ${episodeNumber}화 ${suffix}`;
}

/**
 * 메인 PD가 새로운 공정 일감 티켓을 발행한다.
 * 연결된 Confluence 설정 문서들의 현재 버전을 스냅샷으로 기록한다.
 */
export function issueWebtoonProductionTicket(
  tickets: readonly WebtoonTicketRecord[],
  confluencePages: readonly ConfluenceLorePage[],
  input: {
    readonly projectKey?: string;
    readonly workTitle: string;
    readonly episodeNumber: number;
    readonly step: ShotGridPipelineStep;
    readonly customTitle?: string;
    readonly cutRange: readonly [number, number];
    readonly priority: WebtoonTicketPriority;
    readonly reporterPdId: string;
    readonly reporterPdName: string;
    readonly dueDate: string;
    readonly linkedConfluencePageIds: readonly string[];
    readonly blockedByIssueKeys?: readonly string[];
  },
): {
  readonly createdTicket: WebtoonTicketRecord;
  readonly tickets: readonly WebtoonTicketRecord[];
} {
  const projectKey = (input.projectKey?.trim() || "HSGH").toUpperCase();
  const sequenceNumber = tickets.length + 1;
  const issueKey = `${projectKey}-${input.episodeNumber}${String(sequenceNumber).padStart(2, "0")}`;
  const pageVersionMap: Record<string, number> = {};
  for (const pageId of input.linkedConfluencePageIds) {
    const page = confluencePages.find((item) => item.id === pageId);
    if (page) {
      pageVersionMap[pageId] = page.versionNumber;
    }
  }

  const createdTicket: WebtoonTicketRecord = {
    id: `ticket-${issueKey.toLowerCase()}`,
    issueKey,
    projectKey,
    workTitle: input.workTitle.trim() || "화산귀환",
    episodeNumber: input.episodeNumber,
    step: input.step,
    title:
      input.customTitle?.trim() ||
      formatStandardWebtoonTicketTitle(input.workTitle, input.episodeNumber, input.step),
    cutRange: input.cutRange,
    status: "READY_FOR_PULL",
    priority: input.priority,
    reporterPdId: input.reporterPdId,
    reporterPdName: input.reporterPdName,
    assigneeWorkerId: null,
    assigneeWorkerName: null,
    blockedByIssueKeys: input.blockedByIssueKeys ?? [],
    blocksIssueKeys: [],
    linkedVersionCode: null,
    linkedConfluencePageIds: input.linkedConfluencePageIds,
    acknowledgedConfluenceVersions: pageVersionMap,
    dueDate: input.dueDate,
    claimedAt: null,
    submittedForReviewAt: null,
    approvedAt: null,
    retakeReason: null,
  };

  return {
    createdTicket,
    tickets: [createdTicket, ...tickets],
  };
}

/**
 * 담당자(예: 채색 담당자)가 대기열의 티켓을 스스로 가져가 작업 시작(Claim & Start)한다.
 * 선행 블로커 티켓(blockedByIssueKeys)이 아직 승인 완료(PD_APPROVED)되지 않았으면 차단을 반환한다.
 */
export function claimWebtoonTicket(
  tickets: readonly WebtoonTicketRecord[],
  issueKey: string,
  worker: {
    readonly workerId: string;
    readonly workerName: string;
    readonly claimedAtIso?: string;
  },
): {
  readonly ok: boolean;
  readonly reason?: "not-found" | "blocked-by-upstream" | "already-approved";
  readonly unresolvedBlockers?: readonly string[];
  readonly tickets: readonly WebtoonTicketRecord[];
} {
  const target = tickets.find((item) => item.issueKey === issueKey);
  if (!target) {
    return { ok: false, reason: "not-found", tickets };
  }
  if (target.status === "PD_APPROVED") {
    return { ok: false, reason: "already-approved", tickets };
  }

  const byKey = new Map(tickets.map((item) => [item.issueKey, item]));
  const unresolvedBlockers = target.blockedByIssueKeys.filter((blockerKey) => {
    const blocker = byKey.get(blockerKey);
    return blocker ? blocker.status !== "PD_APPROVED" : false;
  });

  if (unresolvedBlockers.length > 0) {
    return {
      ok: false,
      reason: "blocked-by-upstream",
      unresolvedBlockers,
      tickets,
    };
  }

  const claimedAt = worker.claimedAtIso ?? new Date().toISOString();
  return {
    ok: true,
    tickets: tickets.map((item) =>
      item.issueKey === issueKey
        ? {
            ...item,
            assigneeWorkerId: worker.workerId,
            assigneeWorkerName: worker.workerName,
            status: "IN_PROGRESS",
            claimedAt,
            retakeReason: null,
          }
        : item,
    ),
  };
}

/**
 * 담당 작업자가 작업을 완료하고 ShotGrid 버전(예: v003)을 첨부해 제출하면,
 * 티켓 상태를 PENDING_PD_REVIEW로 전환하고 담당 메인 PD에게 자동으로 검수 알림을 생성한다.
 */
export function submitWebtoonTicketForPdReview(
  tickets: readonly WebtoonTicketRecord[],
  notifications: readonly PdReviewAutoNotification[],
  input: {
    readonly issueKey: string;
    readonly workerId: string;
    readonly workerName: string;
    readonly linkedVersionCode: string;
    readonly submittedAtIso?: string;
    readonly channels?: readonly NotificationDeliveryChannel[];
  },
): {
  readonly ok: boolean;
  readonly reason?: "not-found";
  readonly tickets: readonly WebtoonTicketRecord[];
  readonly notifications: readonly PdReviewAutoNotification[];
  readonly createdNotification?: PdReviewAutoNotification;
} {
  const target = tickets.find((item) => item.issueKey === input.issueKey);
  if (!target) {
    return { ok: false, reason: "not-found", tickets, notifications };
  }

  const submittedAt = input.submittedAtIso ?? new Date().toISOString();
  const versionCode = input.linkedVersionCode.trim() || "v001";
  const channels = input.channels ?? ["in-app", "push", "webhook"];

  const createdNotification: PdReviewAutoNotification = {
    id: `pd-notif-${target.issueKey.toLowerCase()}-${notifications.length + 1}`,
    issueKey: target.issueKey,
    ticketTitle: target.title,
    episodeNumber: target.episodeNumber,
    step: target.step,
    recipientPdId: target.reporterPdId,
    recipientPdName: target.reporterPdName,
    submittedByWorkerId: input.workerId,
    submittedByWorkerName: input.workerName,
    linkedVersionCode: versionCode,
    createdAt: submittedAt,
    channels,
    acknowledged: false,
    message: `[자동 검수 알림] ${input.workerName} 담당자가 '${target.title}' (${target.issueKey}) 작업을 완료하고 ShotGrid 버전 ${versionCode}을(를) 제출했습니다. ${target.reporterPdName} PD님의 검수가 필요합니다.`,
  };

  const nextTickets = tickets.map((item) =>
    item.issueKey === input.issueKey
      ? {
          ...item,
          assigneeWorkerId: input.workerId,
          assigneeWorkerName: input.workerName,
          linkedVersionCode: versionCode,
          status: "PENDING_PD_REVIEW" as const,
          submittedForReviewAt: submittedAt,
        }
      : item,
  );

  return {
    ok: true,
    tickets: nextTickets,
    notifications: [createdNotification, ...notifications],
    createdNotification,
  };
}

/**
 * 담당 메인 PD가 검수 대기 티켓을 승인(PD_APPROVED)하거나 리테이크(RETAKE_REQUESTED)로 반려한다.
 * 승인 시 후속 공정 티켓(blocksIssueKeys)의 선행 블로커가 자동으로 해제된다.
 */
export function reviewWebtoonTicketByPd(
  tickets: readonly WebtoonTicketRecord[],
  input: {
    readonly issueKey: string;
    readonly decision: "approve" | "retake";
    readonly retakeReason?: string;
    readonly reviewedAtIso?: string;
  },
): {
  readonly ok: boolean;
  readonly unblockedIssueKeys: readonly string[];
  readonly tickets: readonly WebtoonTicketRecord[];
} {
  const target = tickets.find((item) => item.issueKey === input.issueKey);
  if (!target) {
    return { ok: false, unblockedIssueKeys: [], tickets };
  }

  const reviewedAt = input.reviewedAtIso ?? new Date().toISOString();
  if (input.decision === "retake") {
    return {
      ok: true,
      unblockedIssueKeys: [],
      tickets: tickets.map((item) =>
        item.issueKey === input.issueKey
          ? {
              ...item,
              status: "RETAKE_REQUESTED",
              retakeReason: input.retakeReason?.trim() || "수정 전·후 비교 결과 보완이 필요합니다.",
            }
          : item,
      ),
    };
  }

  const unblockedIssueKeys: string[] = [];
  const nextTickets = tickets.map((item) => {
    if (item.issueKey === input.issueKey) {
      return {
        ...item,
        status: "PD_APPROVED" as const,
        approvedAt: reviewedAt,
        retakeReason: null,
      };
    }
    if (item.blockedByIssueKeys.includes(input.issueKey)) {
      const remainingBlockers = item.blockedByIssueKeys.filter((key) => key !== input.issueKey);
      if (remainingBlockers.length === 0) {
        unblockedIssueKeys.push(item.issueKey);
      }
      return {
        ...item,
        blockedByIssueKeys: remainingBlockers,
      };
    }
    return item;
  });

  return {
    ok: true,
    unblockedIssueKeys,
    tickets: nextTickets,
  };
}

/**
 * 티켓에 연결된 Confluence 설정집·컬러 가이드 스마트 링크를 평가하고,
 * 문서가 새 버전으로 개정되었는지(isOutdatedSpec) 계산한다.
 */
export function evaluateConfluenceSmartLinks(
  ticket: WebtoonTicketRecord,
  confluencePages: readonly ConfluenceLorePage[],
): readonly EvaluatedConfluenceSmartLink[] {
  const byId = new Map(confluencePages.map((page) => [page.id, page]));
  const results: EvaluatedConfluenceSmartLink[] = [];

  for (const pageId of ticket.linkedConfluencePageIds) {
    const page = byId.get(pageId);
    if (!page) continue;
    const acknowledgedVersion = ticket.acknowledgedConfluenceVersions[pageId] ?? page.versionNumber;
    const versionDelta = Math.max(0, page.versionNumber - acknowledgedVersion);
    results.push({
      page,
      acknowledgedVersion,
      isOutdatedSpec: versionDelta > 0,
      versionDelta,
    });
  }

  return results;
}

/**
 * 티켓 담당자가 업데이트된 Confluence 설정집 최신 버전을 확인·동기화한다.
 */
export function syncTicketConfluenceSpecVersions(
  tickets: readonly WebtoonTicketRecord[],
  issueKey: string,
  confluencePages: readonly ConfluenceLorePage[],
): readonly WebtoonTicketRecord[] {
  const byId = new Map(confluencePages.map((page) => [page.id, page]));
  return tickets.map((ticket) => {
    if (ticket.issueKey !== issueKey) return ticket;
    const updatedAck: Record<string, number> = { ...ticket.acknowledgedConfluenceVersions };
    for (const pageId of ticket.linkedConfluencePageIds) {
      const page = byId.get(pageId);
      if (page) {
        updatedAck[pageId] = page.versionNumber;
      }
    }
    return {
      ...ticket,
      acknowledgedConfluenceVersions: updatedAck,
    };
  });
}

/**
 * JQL 스타일 조건(상태, 공정, 회차 번호, 미배정 가져가기 가능 여부, 텍스트 검색)으로 티켓 목록을 필터링한다.
 */
export function queryTicketsWithJqlFilter(
  tickets: readonly WebtoonTicketRecord[],
  filter: WebtoonTicketJqlFilter,
): readonly WebtoonTicketRecord[] {
  const text = (filter.searchText ?? "").trim().toLowerCase();
  return tickets.filter((ticket) => {
    if (filter.status && filter.status !== "ALL" && ticket.status !== filter.status) {
      return false;
    }
    if (filter.step && filter.step !== "all" && ticket.step !== filter.step) {
      return false;
    }
    if (typeof filter.episodeNumber === "number" && ticket.episodeNumber !== filter.episodeNumber) {
      return false;
    }
    if (filter.onlyPullableUnassigned) {
      const pullable =
        ticket.status === "READY_FOR_PULL" &&
        ticket.assigneeWorkerId === null &&
        ticket.blockedByIssueKeys.length === 0;
      if (!pullable) return false;
    }
    if (text.length > 0) {
      const haystack = [
        ticket.issueKey,
        ticket.workTitle,
        ticket.title,
        ticket.reporterPdName,
        ticket.assigneeWorkerName ?? "",
        ticket.linkedVersionCode ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

export const INITIAL_CONFLUENCE_PAGES: readonly ConfluenceLorePage[] = [
  {
    id: "conf-page-hsgh-palette",
    spaceKey: "HSGH-LORE",
    title: "화산귀환 청명·매화검기 표준 컬러 시트 & 광원 규칙",
    category: "color-script",
    versionNumber: 4,
    lastUpdatedBy: "김현준 메인 PD",
    updatedAt: "2026-10-26 04:10",
    paletteSwatches: [
      { label: "청명 흑색 도복 본색", hex: "#1E293B" },
      { label: "화산파 매화 문양 자수", hex: "#F43F5E" },
      { label: "이십사수매화검법 코어 발광", hex: "#FFF1F2" },
      { label: "매화검기 외곽 잔상 글로우", hex: "#FB7185" },
    ],
    summaryRules: [
      "매화검기 시전 컷에서는 인물 피부톤에 #FB7185 반사광을 15~22% 스크린(Screen)으로 얹는다.",
      "야간 전투 씬에서도 청명 눈동자 하이라이트(#E11D48)는 명도를 낮추지 않는다.",
    ],
    inlineCommentsCount: 7,
  },
  {
    id: "conf-page-ep48-lighting",
    spaceKey: "HSGH-LORE",
    title: "화산귀환 48화 야간 객잔 기습 씬 조명·배경 3D 합성 가이드",
    category: "episode-direction",
    versionNumber: 2,
    lastUpdatedBy: "박서연 배경 팀장",
    updatedAt: "2026-10-25 22:30",
    paletteSwatches: [
      { label: "객잔 실내 호롱불 주광", hex: "#F59E0B" },
      { label: "창밖 달빛 역광(림라이트)", hex: "#38BDF8" },
      { label: "안개·연기 그림자 톤", hex: "#334155" },
    ],
    summaryRules: [
      "1~30컷 실내 대치 구간은 호롱불 난색(#F59E0B) 70% + 창가 달빛(#38BDF8) 30% 대비를 유지한다.",
      "31~65컷 지붕 위 결투 구간은 달빛 청색 역광을 메인 광원으로 전환한다.",
    ],
    inlineCommentsCount: 4,
  },
];

export const INITIAL_WEBTOON_TICKETS: readonly WebtoonTicketRecord[] = [
  {
    id: "ticket-hsgh-4801",
    issueKey: "HSGH-4801",
    projectKey: "HSGH",
    workTitle: "화산귀환",
    episodeNumber: 48,
    step: "line-art",
    title: "화산귀환 48화 선화·펜터치 요청",
    cutRange: [1, 65],
    status: "PD_APPROVED",
    priority: "highest",
    reporterPdId: "pd-main-1",
    reporterPdName: "김현준 메인 PD",
    assigneeWorkerId: "worker-line-1",
    assigneeWorkerName: "정선우 (메인 선화)",
    blockedByIssueKeys: [],
    blocksIssueKeys: ["HSGH-4802"],
    linkedVersionCode: "v002",
    linkedConfluencePageIds: ["conf-page-hsgh-palette"],
    acknowledgedConfluenceVersions: { "conf-page-hsgh-palette": 4 },
    dueDate: "2026-10-25",
    claimedAt: "2026-10-24T09:00:00.000Z",
    submittedForReviewAt: "2026-10-25T11:00:00.000Z",
    approvedAt: "2026-10-25T13:30:00.000Z",
    retakeReason: null,
  },
  {
    id: "ticket-hsgh-4802",
    issueKey: "HSGH-4802",
    projectKey: "HSGH",
    workTitle: "화산귀환",
    episodeNumber: 48,
    step: "shading",
    title: "화산귀환 48화 채색 요청",
    cutRange: [1, 65],
    status: "READY_FOR_PULL",
    priority: "highest",
    reporterPdId: "pd-main-1",
    reporterPdName: "김현준 메인 PD",
    assigneeWorkerId: null,
    assigneeWorkerName: null,
    blockedByIssueKeys: [],
    blocksIssueKeys: ["HSGH-4803"],
    linkedVersionCode: null,
    linkedConfluencePageIds: ["conf-page-hsgh-palette", "conf-page-ep48-lighting"],
    acknowledgedConfluenceVersions: { "conf-page-hsgh-palette": 3, "conf-page-ep48-lighting": 2 },
    dueDate: "2026-10-27",
    claimedAt: null,
    submittedForReviewAt: null,
    approvedAt: null,
    retakeReason: null,
  },
  {
    id: "ticket-hsgh-4803",
    issueKey: "HSGH-4803",
    projectKey: "HSGH",
    workTitle: "화산귀환",
    episodeNumber: 48,
    step: "lighting-fx",
    title: "화산귀환 48화 후보정·이펙트 요청",
    cutRange: [1, 65],
    status: "READY_FOR_PULL",
    priority: "high",
    reporterPdId: "pd-main-1",
    reporterPdName: "김현준 메인 PD",
    assigneeWorkerId: null,
    assigneeWorkerName: null,
    blockedByIssueKeys: ["HSGH-4802"],
    blocksIssueKeys: [],
    linkedVersionCode: null,
    linkedConfluencePageIds: ["conf-page-hsgh-palette", "conf-page-ep48-lighting"],
    acknowledgedConfluenceVersions: { "conf-page-hsgh-palette": 4, "conf-page-ep48-lighting": 2 },
    dueDate: "2026-10-28",
    claimedAt: null,
    submittedForReviewAt: null,
    approvedAt: null,
    retakeReason: null,
  },
];

export const INITIAL_PD_NOTIFICATIONS: readonly PdReviewAutoNotification[] = [
  {
    id: "pd-notif-hsgh-4801-1",
    issueKey: "HSGH-4801",
    ticketTitle: "화산귀환 48화 선화·펜터치 요청",
    episodeNumber: 48,
    step: "line-art",
    recipientPdId: "pd-main-1",
    recipientPdName: "김현준 메인 PD",
    submittedByWorkerId: "worker-line-1",
    submittedByWorkerName: "정선우 (메인 선화)",
    linkedVersionCode: "v002",
    createdAt: "2026-10-25T11:00:00.000Z",
    channels: ["in-app", "push", "webhook"],
    acknowledged: true,
    message:
      "[자동 검수 알림] 정선우 (메인 선화) 담당자가 '화산귀환 48화 선화·펜터치 요청' (HSGH-4801) 작업을 완료하고 ShotGrid 버전 v002을(를) 제출했습니다. 김현준 메인 PD님의 검수가 필요합니다.",
  },
];
