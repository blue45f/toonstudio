import type {
  TeamWorkspaceMember,
  TeamWorkspaceProject,
  TeamWorkspaceRole,
} from "@toonstudio/contracts/production-workspace";
import type {
  StudioTeamRole,
  StudioTeamSnapshot,
  StudioTeamStatus,
} from "../studio-team-client";

/**
 * 구성원별 작품 접근 범위 — 팀 화면에서 "누가 어느 작품에 어떤 작품별 역할로
 * 접근 중인지"를 한 행씩 집계하는 순수 모델.
 *
 * 데이터 경계(정직성 규칙):
 * - 팀 소속(워크스페이스 역할 4단계)은 팀 상세 계약(TeamWorkspaceDetail)이 정본이다.
 * - 작품별 역할(소유자·관리자·편집자·검토자·열람자)과 상태(접근 중·대기·거절)는
 *   작품 단위 팀 스냅샷(getStudioTeam, 작품 서버 강제)이 정본이다. 두 층을 섞지 않고
 *   행 안에서 "팀 소속"과 "작품별 접근"을 나눠 들고 있는다.
 * - 작품 스냅샷을 불러오지 못한 작품(null)은 "권한 없음"으로 위장하지 않고
 *   load="failed"(확인 불가)로 구분한다. 조회 권한이 없는 작품은 서버가 거부하므로
 *   "없음"과 "모름"을 합치면 게스트·외주 범위를 과소/과대 보고하게 된다.
 * - 스냅샷에 구성원이 없으면 그 작품에는 작품 권한이 없는 것이다(load="loaded",
 *   projectRole=null). 대기(pending)·거절(declined)은 접근 중으로 세지 않는다.
 */

export interface BilingualLabel {
  readonly ko: string;
  readonly en: string;
}

/** 작품별 역할 표시 이름. 페이지의 초대용 라벨(ASSIGNABLE_ROLE_LABELS)과 값을 맞추되,
 *  스냅샷이 돌려주는 owner까지 포함한다. */
export const PROJECT_ROLE_LABELS: Readonly<Record<StudioTeamRole, BilingualLabel>> = {
  owner: { ko: "작품 소유자", en: "Project owner" },
  admin: { ko: "관리자", en: "Admin" },
  editor: { ko: "편집자", en: "Editor" },
  commenter: { ko: "검토자", en: "Reviewer" },
  viewer: { ko: "열람자", en: "Viewer" },
};

/** 작품별 접근 상태 표시 이름. pending은 "초대만 갔고 아직 접근 전"임을 드러낸다. */
export const PROJECT_STATUS_LABELS: Readonly<Record<StudioTeamStatus, BilingualLabel>> = {
  active: { ko: "접근 중", en: "Active" },
  pending: { ko: "초대 수락 대기(아직 접근 전)", en: "Invite pending (no access yet)" },
  declined: { ko: "초대 거절됨", en: "Invite declined" },
};

export type MemberWorkAccessLoad = "loaded" | "failed";

export interface MemberWorkAccessEntry {
  /** 작품 단위 팀 API의 조회 키이자 포트폴리오 조인 키. */
  readonly workId: string;
  /** 제작 프로젝트 id. 작품 개요 경로(/production/projects/:id/overview)에 쓴다. */
  readonly projectId: string;
  readonly title: string;
  readonly load: MemberWorkAccessLoad;
  /** load="loaded"인데 null이면 이 작품에 대한 작품 권한이 없다는 뜻이다. */
  readonly projectRole: StudioTeamRole | null;
  readonly status: StudioTeamStatus | null;
}

export interface MemberWorkAccessRow {
  readonly userId: string;
  readonly displayName: string;
  /** 팀 소속 층의 역할(워크스페이스 서버 강제 4단계). 작품 권한과 섞지 않는다. */
  readonly workspaceRole: TeamWorkspaceRole;
  readonly entries: readonly MemberWorkAccessEntry[];
  /** 실제로 접근 중인 작품 수(status="active"만). */
  readonly activeCount: number;
  /** 초대를 보냈지만 아직 수락 전인 작품 수. 접근 수에 포함하지 않는다. */
  readonly pendingCount: number;
  /** 스냅샷을 불러오지 못해 판정할 수 없는 작품 수. */
  readonly unknownCount: number;
}

export interface MemberWorkAccessOverview {
  readonly rows: readonly MemberWorkAccessRow[];
  readonly projectCount: number;
  /** 스냅샷 조회에 실패한 작품 수(중복 workId 제거 후 기준). */
  readonly failedProjectCount: number;
  /** 확인 불가 작품이 없으면서 접근 중 작품이 하나도 없는 구성원 수.
   *  대기(pending)는 아직 접근이 아니므로 이 수에 포함된다. */
  readonly membersWithNoAccessCount: number;
}

export function buildMemberWorkAccessOverview(input: {
  readonly members: readonly TeamWorkspaceMember[];
  readonly projects: readonly TeamWorkspaceProject[];
  /** workId → 작품 팀 스냅샷. null(또는 키 없음)은 조회 실패 = 확인 불가. */
  readonly snapshots: ReadonlyMap<string, StudioTeamSnapshot | null>;
}): MemberWorkAccessOverview {
  const projects: TeamWorkspaceProject[] = [];
  const seenProjects = new Set<string>();
  for (const project of input.projects) {
    if (seenProjects.has(project.workId)) continue;
    seenProjects.add(project.workId);
    projects.push(project);
  }

  const rows: MemberWorkAccessRow[] = [];
  const seenMembers = new Set<string>();
  for (const member of input.members) {
    if (seenMembers.has(member.userId)) continue;
    seenMembers.add(member.userId);
    const entries: MemberWorkAccessEntry[] = projects.map((project) => {
      const snapshot = input.snapshots.get(project.workId) ?? null;
      if (!snapshot) {
        return {
          workId: project.workId,
          projectId: project.id,
          title: project.title,
          load: "failed" as const,
          projectRole: null,
          status: null,
        };
      }
      const projectMember = snapshot.members.find((candidate) => candidate.userId === member.userId);
      return {
        workId: project.workId,
        projectId: project.id,
        title: project.title,
        load: "loaded" as const,
        projectRole: projectMember?.role ?? null,
        status: projectMember?.status ?? null,
      };
    });
    rows.push({
      userId: member.userId,
      displayName: member.displayName,
      workspaceRole: member.role,
      entries,
      activeCount: entries.filter((entry) => entry.load === "loaded" && entry.status === "active").length,
      pendingCount: entries.filter((entry) => entry.load === "loaded" && entry.status === "pending").length,
      unknownCount: entries.filter((entry) => entry.load === "failed").length,
    });
  }

  return {
    rows,
    projectCount: projects.length,
    failedProjectCount: projects.filter((project) => !input.snapshots.get(project.workId)).length,
    membersWithNoAccessCount: rows.filter(
      (row) => row.activeCount === 0 && row.unknownCount === 0,
    ).length,
  };
}
