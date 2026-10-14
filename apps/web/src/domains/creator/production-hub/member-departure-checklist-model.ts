import type { TeamWorkspaceDetail, TeamWorkspaceMember } from "@toonstudio/contracts/production-workspace";

/**
 * 구성원 인계 점검 — 팀에서 제외·소유권 이전·나가기 전에 "무엇이 남고 무엇이 바뀌는지"를
 * 실행 전에 목록으로 보여 주기 위한 순수 모델.
 *
 * 서버 사실(apps/api team-workspace.repository 기준, 지어내지 않는다):
 * - 제외(remove-member)는 팀 소속만 지운다. 작품별 권한·원고·댓글·버전은 건드리지 않는다.
 * - 소유권 이전(transfer-owner)은 팀 소유권만 옮긴다. 이전한 사람은 관리자로 남고,
 *   작품 소유권은 각 작품에 그대로 남는다. 받는 사람의 소유 워크스페이스 한도도 서버가 검사한다.
 * - 모든 커맨드는 production_team_audit에 기록된다.
 *
 * 담당 작업 수치는 이 화면의 데이터에 없으므로 호출자가 신호를 줄 때만 숫자로 표시한다.
 * 신호가 없으면 0으로 위장하지 않고 "확인 필요"로 둔다.
 */

export type DepartureAction = "remove" | "transfer-owner" | "leave";
export type DepartureChecklistSeverity = "block" | "warn" | "info" | "done";

export interface DepartureCopy {
  readonly ko: string;
  readonly en: string;
}

export interface DepartureChecklistItem {
  readonly id: string;
  readonly severity: DepartureChecklistSeverity;
  readonly title: DepartureCopy;
  readonly detail: DepartureCopy;
}

/** 작품별 담당 신호. 호출자가 제작 보드 집계에서 만들며, 없으면 확인 필요로 표시한다. */
export interface MemberWorkSignal {
  /** 제작 프로젝트 id (TeamWorkspaceDetail.projects의 id와 같은 값). */
  readonly projectId: string;
  readonly openAssignedTaskCount: number;
  readonly reviewWaitingTaskCount: number;
}

export interface DepartureChecklist {
  readonly items: readonly DepartureChecklistItem[];
  /** block 항목이 하나라도 있으면 실행 버튼을 막아야 한다. */
  readonly blocked: boolean;
}

export function buildDepartureChecklist(input: {
  readonly detail: TeamWorkspaceDetail;
  readonly member: TeamWorkspaceMember;
  readonly action: DepartureAction;
  readonly workSignals?: readonly MemberWorkSignal[];
}): DepartureChecklist {
  const { detail, member, action } = input;
  const items: DepartureChecklistItem[] = [];
  const name = member.displayName;
  const linkedProjects = detail.projects.length;

  // 1. 소유권 — 소유자는 제외·나가기가 구조적으로 불가능하다(서버도 소유자 제거를 허용하지 않는다).
  if (member.role === "owner" && action !== "transfer-owner") {
    items.push({
      id: "ownership-block",
      severity: "block",
      title: { ko: "팀 소유자는 바로 제외할 수 없습니다", en: "The team owner can't be removed directly" },
      detail: {
        ko: `${name} 님은 이 팀의 소유자입니다. 먼저 다른 구성원에게 소유권을 이전한 뒤에 제외할 수 있습니다.`,
        en: `${name} owns this team. Transfer ownership to another member first, then remove them.`,
      },
    });
  }
  if (action === "transfer-owner") {
    items.push({
      id: "ownership-transfer-scope",
      severity: "info",
      title: { ko: "팀 소유권만 이전됩니다", en: "Only team ownership moves" },
      detail: {
        ko: `이전하면 ${name} 님이 소유자가 되고, 현재 소유자는 관리자로 남습니다. 각 작품의 소유권은 바뀌지 않으며, 받는 분의 소유 워크스페이스 한도도 서버가 검사합니다.`,
        en: `${name} becomes the owner and the current owner stays on as an admin. Ownership of each project stays unchanged, and the server also checks the new owner's workspace limit.`,
      },
    });
  }

  // 2·3. 담당 작업과 검수 대기 — 신호가 있을 때만 숫자로, 없으면 확인 필요.
  const signals = input.workSignals;
  const signalByProject = new Map((signals ?? []).map((signal) => [signal.projectId, signal]));
  const coveredProjects = detail.projects.filter((project) => signalByProject.has(project.id)).length;
  const signalsComplete = signals !== undefined && coveredProjects === detail.projects.length;
  if (action !== "transfer-owner") {
    if (signalsComplete) {
      const openTasks = detail.projects.reduce((sum, project) => sum + (signalByProject.get(project.id)?.openAssignedTaskCount ?? 0), 0);
      const reviewWaiting = detail.projects.reduce((sum, project) => sum + (signalByProject.get(project.id)?.reviewWaitingTaskCount ?? 0), 0);
      items.push(openTasks > 0
        ? {
            id: "assigned-work", severity: "warn",
            title: { ko: `맡은 작업 ${openTasks}건이 열려 있습니다`, en: `${openTasks} assigned task(s) still open` },
            detail: { ko: "제외하면 이 작업들은 담당자가 비게 됩니다. 제작 보드에서 다른 구성원에게 재배정한 뒤 제외하세요.", en: "Removing this member leaves those tasks unassigned. Reassign them on the production board first." },
          }
        : {
            id: "assigned-work", severity: "done",
            title: { ko: "맡은 열린 작업이 없습니다", en: "No open assigned tasks" },
            detail: { ko: "연결된 작품에서 이 구성원이 맡은 열린 작업을 확인했습니다.", en: "Checked the linked projects — this member has no open assigned tasks." },
          });
      items.push(reviewWaiting > 0
        ? {
            id: "review-waiting", severity: "warn",
            title: { ko: `검수 대기 ${reviewWaiting}건이 걸려 있습니다`, en: `${reviewWaiting} item(s) waiting on their review` },
            detail: { ko: "이 구성원의 검수를 기다리는 작업이 있습니다. 검수 담당을 바꾸거나 검수를 마친 뒤 제외하세요.", en: "Some work is waiting on this member's review. Hand the review over or finish it before removing them." },
          }
        : {
            id: "review-waiting", severity: "done",
            title: { ko: "기다리는 검수가 없습니다", en: "No reviews waiting on them" },
            detail: { ko: "연결된 작품에서 이 구성원의 검수를 기다리는 작업이 없습니다.", en: "No work in the linked projects is waiting on this member's review." },
          });
    } else {
      items.push({
        id: "assigned-work-unverified", severity: "warn",
        title: { ko: "맡은 작업을 아직 확인하지 못했습니다", en: "Assigned work hasn't been checked yet" },
        detail: { ko: "이 화면에서는 담당 작업 수를 셀 수 없습니다. 제외 전에 각 작품의 제작 보드에서 맡은 작업과 검수 대기를 재배정했는지 확인하세요.", en: "This screen can't count assigned work. Before removing, check each project's production board that their tasks and pending reviews are reassigned." },
      });
    }
  }

  // 4. 작품별 권한 잔여 — 제외·나가기 후에도 작품 권한은 남는다.
  if (action !== "transfer-owner") {
    items.push(linkedProjects > 0
      ? {
          id: "project-access-remains", severity: "warn",
          title: { ko: `작품 ${linkedProjects}개의 권한은 따로 남습니다`, en: `Access to ${linkedProjects} project(s) stays separate` },
          detail: { ko: "팀 소속과 작품 권한은 별개입니다. 제외해도 작품별로 부여한 권한은 유지되니, 끊어야 할 작품은 작품 설정에서 권한을 회수하세요.", en: "Team membership and project access are separate. Per-project access stays after removal — revoke it in each project's settings where needed." },
        }
      : {
          id: "project-access-remains", severity: "done",
          title: { ko: "남는 작품 권한이 없습니다", en: "No project access remains" },
          detail: { ko: "이 팀에 연결된 작품이 없어, 제외 후에도 남는 작품 권한이 없습니다.", en: "This team has no linked projects, so no project access remains after removal." },
        });
  }

  // 5. 자료 보존과 기록 — 무엇도 자동 삭제되지 않고, 실행 사실은 감사 기록에 남는다.
  items.push({
    id: "data-retention",
    severity: "info",
    title: { ko: "만든 자료는 삭제되지 않습니다", en: "Their work isn't deleted" },
    detail: { ko: `${name} 님이 만든 원고·댓글·버전과 작업 기록은 팀에 그대로 남습니다. 이 실행은 팀 감사 기록에도 남습니다.`,
      en: `Manuscripts, comments, versions, and work history created by ${name} stay with the team. This action is also written to the team audit log.` },
  });

  return { items, blocked: items.some((item) => item.severity === "block") };
}
