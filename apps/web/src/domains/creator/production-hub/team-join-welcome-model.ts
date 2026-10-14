import type { TeamWorkspaceRole } from "@toonstudio/contracts/production-workspace";

import type { BilingualLabel } from "./production-labels";

/**
 * 합류 직후 "먼저 할 일" 모델 — 초대 수락 뒤 도착지(/team?workspace=…&lobby=1)가
 * 이미 실어 보내는 워크스페이스 식별자를 받아, 방금 합류한 팀·내 역할·연결 작품으로
 * 첫 행동 순서를 정하는 순수 모델.
 *
 * 원칙: 첫 단계는 하나만 primary. 작품 권한이 없으면 없는 대로 정직하게
 * "요청하기"를 첫 단계로 세우고, 권한이 생기면 열리는 구조를 문구로 알린다.
 * 작품 경로는 production-hub 표면 주소(/production/projects/:id/…)를 그대로 쓴다.
 */
export interface JoinWelcomeProject {
  /** production 프로젝트 id (표면 주소용). */
  readonly id: string;
  readonly title: string;
}

export interface JoinFirstStep {
  readonly id: string;
  readonly title: BilingualLabel;
  readonly description: BilingualLabel;
  readonly href: string;
  readonly primary: boolean;
}

export interface TeamJoinWelcome {
  readonly headline: BilingualLabel;
  readonly hasProjectAccess: boolean;
  readonly steps: readonly JoinFirstStep[];
}

export function teamJoinWelcomeModel(input: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: TeamWorkspaceRole;
  readonly projects: readonly JoinWelcomeProject[];
}): TeamJoinWelcome {
  const { workspaceId, workspaceName, role, projects } = input;
  const steps: JoinFirstStep[] = [];
  const peopleHref = `/team/people/${encodeURIComponent(workspaceId)}`;
  const hasProjectAccess = projects.length > 0;

  if (hasProjectAccess) {
    const first = projects[0]!;
    if (role === "guest") {
      steps.push({
        id: "open-shared-project",
        title: { ko: "공유받은 작품 보기", en: "Open the shared work" },
        description: {
          ko: `${first.title} — 허락받은 범위에서 진행 상황과 검수본을 볼 수 있어요.`,
          en: `${first.title} — see progress and review copies within your shared scope.`,
        },
        href: `/production/projects/${encodeURIComponent(first.id)}/overview`,
        primary: true,
      });
    } else {
      steps.push({
        id: "open-first-project-board",
        title: { ko: "첫 작품의 작업 보드 열기", en: "Open your first work's board" },
        description: {
          ko: `${first.title} — 공정 보드에서 내 담당 작업을 확인하고 첫 작업부터 시작하세요.`,
          en: `${first.title} — check your assigned tasks on the process board and start with the first one.`,
        },
        href: `/production/projects/${encodeURIComponent(first.id)}/production`,
        primary: true,
      });
    }
    if (projects.length > 1) {
      steps.push({
        id: "all-projects",
        title: { ko: "연결된 작품 모두 보기", en: "See all linked works" },
        description: {
          ko: `지금 ${projects.length}개 작품에 접근할 수 있어요.`,
          en: `You can access ${projects.length} works right now.`,
        },
        href: "/production/projects",
        primary: false,
      });
    }
  } else {
    steps.push({
      id: "request-project-access",
      title: { ko: "관리자에게 작품 권한 요청하기", en: "Ask a manager for project access" },
      description: {
        ko: "아직 내 권한으로 열 수 있는 작품이 없어요. 사람·권한 화면에서 관리자를 확인해 작품 권한을 요청하세요. 권한을 받으면 이 자리에서 바로 열립니다.",
        en: "No work opens with your access yet. Find the managers under People & access and ask for project access — once granted, it opens right here.",
      },
      href: peopleHref,
      primary: true,
    });
  }

  if (role !== "guest") {
    steps.push({
      id: "meet-members",
      title: { ko: "함께할 구성원 보기", en: "Meet the members" },
      description: {
        ko: "누가 어떤 역할로 함께 만드는지 확인하세요.",
        en: "See who is creating together, and in which roles.",
      },
      href: peopleHref,
      primary: false,
    });
  }

  return {
    headline: {
      ko: `${workspaceName} 팀에 합류했어요`,
      en: `You joined ${workspaceName}`,
    },
    hasProjectAccess,
    steps: steps.slice(0, 3),
  };
}
