import {
  archiveStudioReviewSession,
  readStudioReviewHistory,
  type StudioReviewHistoryDocument,
  type StudioReviewHistoryStorage,
} from "../studio-review-history-store";
import {
  addStudioReviewThread,
  createStudioReviewSession,
  submitStudioReview,
  type StudioReviewCollaboratorRole,
  type StudioReviewSession,
} from "../studio-review-workflow";

export type WebtoonJobPresetId = "lead-author" | "line-color-assist" | "editor-pd" | "external-viewer";

export interface WebtoonJobPreset {
  readonly id: WebtoonJobPresetId;
  readonly reviewRole: StudioReviewCollaboratorRole;
  readonly actorId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly layerGuardKo: string;
  readonly layerGuardEn: string;
}

export const WEBTOON_JOB_PRESETS: readonly WebtoonJobPreset[] = [
  {
    id: "lead-author",
    reviewRole: "editor",
    actorId: "demo-lead-author",
    titleKo: "총괄 작가",
    titleEn: "Lead Creator",
    summaryKo: "전체 레이어 편집 · 최종 승인 · 이력 복원",
    summaryEn: "Full layer edit · final approval · history restore",
    layerGuardKo: "전 레이어 잠금 해제 가능",
    layerGuardEn: "All layers unlocked",
  },
  {
    id: "line-color-assist",
    reviewRole: "editor",
    actorId: "demo-color-assist",
    titleKo: "선화·채색 어시",
    titleEn: "Line & Color Assist",
    summaryKo: "배정된 채색·명암 레이어 편집 · 스냅샷 저장",
    summaryEn: "Edit assigned color/shade layers · save snapshots",
    layerGuardKo: "말풍선·식자·원본 콘티 자동 잠금",
    layerGuardEn: "Speech & storyboard layers locked",
  },
  {
    id: "editor-pd",
    reviewRole: "reviewer",
    actorId: "demo-reviewer-pd",
    titleKo: "편집자 · 담당 PD",
    titleEn: "Editor / PD",
    summaryKo: "컷 좌표 핀 댓글 · 전후 비교 · 검수 승인",
    summaryEn: "Coordinate pin comments · diff · review approval",
    layerGuardKo: "원고 화소 편집·이력 덮어쓰기 잠금",
    layerGuardEn: "Canvas pixels & restore locked",
  },
  {
    id: "external-viewer",
    reviewRole: "viewer",
    actorId: "demo-external-guest",
    titleKo: "외부 열람자",
    titleEn: "External Viewer",
    summaryKo: "워터마크 열람 전용 · 외부 공유 보호",
    summaryEn: "Watermarked read-only view",
    layerGuardKo: "편집 · 댓글 · 원본 반출 전체 잠금",
    layerGuardEn: "Edits, comments & export locked",
  },
];

export interface CutOccupancyCard {
  readonly cutId: string;
  readonly cutBadgeKo: string;
  readonly cutBadgeEn: string;
  readonly memberKo: string;
  readonly memberEn: string;
  readonly activityKo: string;
  readonly activityEn: string;
  readonly episodeHref: string;
}

export const CUT_OCCUPANCY_CARDS: readonly CutOccupancyCard[] = [
  {
    cutId: "cut-01",
    cutBadgeKo: "#12컷",
    cutBadgeEn: "Cut #12",
    memberKo: "민서 (채색 어시)",
    memberEn: "Minseo (Color)",
    activityKo: "역광 림라이트 채색 중",
    activityEn: "Painting rim-light layer",
    episodeHref: "/production/projects/sample-project/episodes/episode-12",
  },
  {
    cutId: "cut-02",
    cutBadgeKo: "#13컷",
    cutBadgeEn: "Cut #13",
    memberKo: "준호 (선화 어시)",
    memberEn: "Junho (Line art)",
    activityKo: "클로즈업 펜터치 마감",
    activityEn: "Finishing close-up inking",
    episodeHref: "/production/projects/sample-project/episodes/episode-12",
  },
  {
    cutId: "cut-03",
    cutBadgeKo: "#14컷",
    cutBadgeEn: "Cut #14",
    memberKo: "현우 PD (담당 편집)",
    memberEn: "Hyunwoo PD",
    activityKo: "액션 컷 핀 피드백 확인 중",
    activityEn: "Checking action cut pins",
    episodeHref: "/production/projects/sample-project/review",
  },
];

export const COLLAB_HUB_PROJECT_ID = "demo-collab-hub-ep12";

export const REVISION_NOTES: Readonly<
  Record<string, { readonly authorKo: string; readonly memoKo: string; readonly memoEn: string }>
> = {
  "v12-lineart-pass": {
    authorKo: "준호 · 선화 어시",
    memoKo: "12~14컷 메인 펜선 및 속도선 정리",
    memoEn: "Cleaned up main ink lines and speedlines on cuts 12-14",
  },
  "v13-bubble-align": {
    authorKo: "지훈 · 총괄 작가",
    memoKo: "대사 말풍선 여백 조정 및 식자 레이어 잠금",
    memoEn: "Adjusted dialogue balloon margins and locked lettering layer",
  },
  "v14-color-fix": {
    authorKo: "민서 · 채색 어시",
    memoKo: "PD 피드백 반영 — 12컷 야경 역광 대비 보강",
    memoEn: "Applied PD feedback — boosted night rim-light contrast on cut 12",
  },
};

function createMemoryFallbackStorage(): StudioReviewHistoryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

export function resolveSafeStorage(): StudioReviewHistoryStorage {
  if (typeof window !== "undefined") {
    try {
      return window.localStorage;
    } catch {
      // 브라우저 저장소 접근이 제한된 환경에서는 메모리 저장소를 사용한다.
    }
  }
  return createMemoryFallbackStorage();
}

export function buildInitialCollabState(storage: StudioReviewHistoryStorage): {
  readonly session: StudioReviewSession;
  readonly history: StudioReviewHistoryDocument;
} {
  let base = createStudioReviewSession({
    documentId: "ep12-demo-manuscript",
    versionId: "v14-color-fix",
    requiredReviewerIds: ["demo-reviewer-pd"],
    createdAt: "2026-11-14T09:00:00.000Z",
    basedOnVersionId: "v13-bubble-align",
  });
  base = submitStudioReview(base, "2026-11-14T09:10:00.000Z");
  base = addStudioReviewThread(
    base,
    {
      id: "pin-ep12-cut01",
      kind: "change-request",
      targetId: "cut-01 @ (62%, 38%)",
      status: "open",
      pinCoordinate: { cutId: "cut-01", xPercent: 62, yPercent: 38 },
      resolvedBy: null,
      resolvedAt: null,
      messages: [
        {
          id: "msg-ep12-1",
          authorId: "demo-reviewer-pd",
          body: "우측 가로등 역광 톤을 조금 더 밝히면 인물이 선명하게 살아납니다.",
          createdAt: "2026-11-14T09:15:00.000Z",
        },
      ],
    },
    "2026-11-14T09:15:00.000Z",
  );
  base = addStudioReviewThread(
    base,
    {
      id: "pin-ep12-cut02",
      kind: "comment",
      targetId: "cut-02 @ (34%, 66%)",
      status: "resolved",
      pinCoordinate: { cutId: "cut-02", xPercent: 34, yPercent: 66 },
      resolvedBy: "demo-lead-author",
      resolvedAt: "2026-11-14T09:25:00.000Z",
      messages: [
        {
          id: "msg-ep12-2",
          authorId: "demo-lead-author",
          body: "말풍선 꼬리 위치를 시선 동선에 맞춰 조정 완료했습니다.",
          createdAt: "2026-11-14T09:20:00.000Z",
        },
      ],
    },
    "2026-11-14T09:25:00.000Z",
  );

  let history = readStudioReviewHistory(storage, COLLAB_HUB_PROJECT_ID);
  if (history.sessions.length === 0) {
    const v12 = submitStudioReview(
      createStudioReviewSession({
        documentId: "ep12-demo-manuscript",
        versionId: "v12-lineart-pass",
        requiredReviewerIds: ["demo-reviewer-pd"],
        createdAt: "2026-11-14T07:30:00.000Z",
      }),
      "2026-11-14T07:35:00.000Z",
    );
    const v13 = submitStudioReview(
      createStudioReviewSession({
        documentId: "ep12-demo-manuscript",
        versionId: "v13-bubble-align",
        requiredReviewerIds: ["demo-reviewer-pd"],
        createdAt: "2026-11-14T08:20:00.000Z",
        basedOnVersionId: "v12-lineart-pass",
      }),
      "2026-11-14T08:25:00.000Z",
    );
    archiveStudioReviewSession(storage, COLLAB_HUB_PROJECT_ID, v12);
    archiveStudioReviewSession(storage, COLLAB_HUB_PROJECT_ID, v13);
    history = archiveStudioReviewSession(storage, COLLAB_HUB_PROJECT_ID, base);
  }
  return { session: base, history };
}
