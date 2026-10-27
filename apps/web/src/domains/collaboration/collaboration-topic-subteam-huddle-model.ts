/**
 * Slack (@subteam 직무 그룹 멘션 + Live Huddle 캔버스 음성/화면 공유 + Workflow Builder 인계 런북)
 * + 잔디 JANDI (회차·공정별 토픽 폴더 구조 + 준회원/외주 어시스턴트 격리 + 미열람 읽음 확인 & 할일(Todo) 트래커)
 * REA 역공학 기반 협업 토픽·서브팀 허들·준회원 권한 격리 모델.
 *
 * - Slack (`ev_cc32ff3ec6303d4e08b8095d2cb4608fffca1956e98bb76e703b302ed91f7ad2`):
 *   `@lineart-crew`, `@bg3d-crew`, `@color-crew`, `@editorial-qa` 서브팀 핸들 호출,
 *   활성 컷 화면 공유 허들(Huddle) 세션, 인계 런북 자동 호출.
 * - 잔디 JANDI (`ev_ce6352c54ea0d05bc8f3da06fae26d55fd8314d998d3340e42ae8f3e002ec7e6`):
 *   회차별 토픽 폴더(Topic Folder), 준회원(Associate Member) 초청 토픽 외 열람 차단,
 *   지시사항 메시지별 읽음 확인(Read Receipt) 미열람자 수 및 Todo 완료율 집계.
 */

export type StudioTopicAccessScope = "regular-member-only" | "associate-guest-allowed";

export interface StudioCollaborationTopic {
  readonly id: string;
  readonly folderNameKo: string;
  readonly folderNameEn: string;
  readonly topicTitleKo: string;
  readonly topicTitleEn: string;
  readonly subteamHandle: string;
  readonly accessScope: StudioTopicAccessScope;
  readonly huddleActive: boolean;
  readonly huddleCutCode: string;
  readonly totalMembers: number;
  readonly readReceiptCount: number;
  readonly todoCompletedCount: number;
  readonly todoTotalCount: number;
  readonly associateLeakBlocked: boolean;
}

export interface TopicSubteamHuddleSummary {
  readonly topics: readonly StudioCollaborationTopic[];
  readonly activeHuddleCount: number;
  readonly totalUnreadReceipts: number;
  readonly overallTodoCompletionRatePct: number;
  readonly associateSafeCount: number;
  readonly allReceiptsAcknowledged: boolean;
}

export const DEFAULT_STUDIO_COLLABORATION_TOPICS: readonly StudioCollaborationTopic[] = [
  {
    id: "topic-ep12-storyboard",
    folderNameKo: "[EP.12] 01_연출·콘티 본부",
    folderNameEn: "[EP.12] 01_Storyboard & Direction",
    topicTitleKo: "#ep12-글그림콘티-연출확정",
    topicTitleEn: "#ep12-storyboard-lock",
    subteamHandle: "@storyboard-crew",
    accessScope: "regular-member-only",
    huddleActive: true,
    huddleCutCode: "EP12-C014",
    totalMembers: 4,
    readReceiptCount: 4,
    todoCompletedCount: 5,
    todoTotalCount: 5,
    associateLeakBlocked: true,
  },
  {
    id: "topic-ep12-lineart-bg3d",
    folderNameKo: "[EP.12] 02_선화·3D배경 분업방",
    folderNameEn: "[EP.12] 02_Lineart & 3D BG Division",
    topicTitleKo: "#ep12-펜선-스케치업-블렌더-동기화",
    topicTitleEn: "#ep12-lineart-bg3d-sync",
    subteamHandle: "@lineart-bg3d-crew",
    accessScope: "associate-guest-allowed",
    huddleActive: true,
    huddleCutCode: "EP12-C027",
    totalMembers: 6,
    readReceiptCount: 5,
    todoCompletedCount: 7,
    todoTotalCount: 8,
    associateLeakBlocked: true,
  },
  {
    id: "topic-ep12-color-fx",
    folderNameKo: "[EP.12] 03_밑색·명암·후보정 외주방",
    folderNameEn: "[EP.12] 03_Color & FX Associate Room",
    topicTitleKo: "#ep12-밑색-조명LUT-준회원전용",
    topicTitleEn: "#ep12-color-lut-associate",
    subteamHandle: "@color-fx-crew",
    accessScope: "associate-guest-allowed",
    huddleActive: false,
    huddleCutCode: "EP12-C041",
    totalMembers: 5,
    readReceiptCount: 3,
    todoCompletedCount: 4,
    todoTotalCount: 6,
    associateLeakBlocked: true,
  },
  {
    id: "topic-ep12-editorial-qa",
    folderNameKo: "[EP.12] 04_식자·최종검수·유통 데스크",
    folderNameEn: "[EP.12] 04_Lettering & Final QA Desk",
    topicTitleKo: "#ep12-말풍선-식자-마스터검수",
    topicTitleEn: "#ep12-lettering-master-qa",
    subteamHandle: "@editorial-qa-crew",
    accessScope: "regular-member-only",
    huddleActive: false,
    huddleCutCode: "EP12-C068",
    totalMembers: 3,
    readReceiptCount: 3,
    todoCompletedCount: 4,
    todoTotalCount: 4,
    associateLeakBlocked: true,
  },
];

export function evaluateTopicSubteamHuddleSummary(
  topics: readonly StudioCollaborationTopic[],
): TopicSubteamHuddleSummary {
  let activeHuddleCount = 0;
  let totalUnreadReceipts = 0;
  let completedTodos = 0;
  let totalTodos = 0;
  let associateSafeCount = 0;

  for (const topic of topics) {
    if (topic.huddleActive) activeHuddleCount += 1;
    totalUnreadReceipts += Math.max(0, topic.totalMembers - topic.readReceiptCount);
    completedTodos += topic.todoCompletedCount;
    totalTodos += topic.todoTotalCount;
    if (topic.associateLeakBlocked) associateSafeCount += 1;
  }

  const overallTodoCompletionRatePct =
    totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 100;

  return {
    topics,
    activeHuddleCount,
    totalUnreadReceipts,
    overallTodoCompletionRatePct,
    associateSafeCount,
    allReceiptsAcknowledged: totalUnreadReceipts === 0,
  };
}

export function acknowledgeTopicReadAndTodos(
  topics: readonly StudioCollaborationTopic[],
  topicId: string,
): readonly StudioCollaborationTopic[] {
  return topics.map((topic) => {
    if (topic.id !== topicId) return topic;
    return {
      ...topic,
      readReceiptCount: topic.totalMembers,
      todoCompletedCount: topic.todoTotalCount,
    };
  });
}

export function toggleTopicLiveHuddle(
  topics: readonly StudioCollaborationTopic[],
  topicId: string,
  cutCode?: string,
): readonly StudioCollaborationTopic[] {
  return topics.map((topic) => {
    if (topic.id !== topicId) return topic;
    const nextCode = cutCode?.trim() ? cutCode.trim() : topic.huddleCutCode;
    return {
      ...topic,
      huddleActive: !topic.huddleActive,
      huddleCutCode: nextCode,
    };
  });
}
