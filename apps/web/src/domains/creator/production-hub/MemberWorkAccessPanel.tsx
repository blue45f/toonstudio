import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  TeamWorkspaceMember,
  TeamWorkspaceProject,
  TeamWorkspaceRole,
} from "@toonstudio/contracts/production-workspace";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioTeam, type StudioTeamSnapshot } from "../studio-team-client";
import {
  buildMemberWorkAccessOverview,
  PROJECT_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
  type MemberWorkAccessEntry,
} from "./member-work-access-model";
import { ProductionAvatar } from "./production-ui";

interface RoleLabel {
  readonly ko: string;
  readonly en: string;
}

function AccessEntryLine({ entry }: { entry: MemberWorkAccessEntry }) {
  const bt = useBilingual("MemberWorkAccessPanel");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line p-3">
      <Link className="font-semibold underline" to={`/production/projects/${entry.projectId}/overview`}>
        {entry.title}
      </Link>
      {entry.load === "failed" ? (
        <span className="text-sm text-warn">
          {bt("작품 권한 확인 불가 — 이 작품의 권한 정보를 불러오지 못했습니다.", "Couldn't check this project's permissions.")}
        </span>
      ) : entry.projectRole === null ? (
        <span className="text-sm text-fg-2">{bt("작품 권한 없음 — 이 작품은 열 수 없습니다.", "No project permission — can't open this project.")}</span>
      ) : (
        <span className="text-sm">
          <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-xs font-bold">
            {bt(`작품 권한: ${PROJECT_ROLE_LABELS[entry.projectRole].ko}`, `Project role: ${PROJECT_ROLE_LABELS[entry.projectRole].en}`)}
          </span>{" "}
          {entry.status && bt(PROJECT_STATUS_LABELS[entry.status].ko, PROJECT_STATUS_LABELS[entry.status].en)}
        </span>
      )}
    </li>
  );
}

/**
 * 구성원별 작품 접근 범위 한눈 보기.
 *
 * 팀 상세(소속·팀 역할)와 연결 작품별 팀 스냅샷(작품 권한)을 조인해 구성원 행마다
 * 작품별 접근 범위를 펼칠 수 있게 보여 준다. 팀 소속만으로는 원고를 열 수 없다는
 * 기존 고지를 실제 데이터로 뒷받침하는 표면이다: 게스트·외주가 어느 작품에
 * 어떤 역할로 접근 중인지(대기·거절·확인 불가 포함) 팀 화면에서 바로 확인한다.
 *
 * 조회에 실패한 작품은 "권한 없음"으로 단정하지 않고 확인 불가로 표시한다
 * (내가 볼 권한이 없는 작품은 작품 서버가 스냅샷 자체를 거부할 수 있다).
 */
export function MemberWorkAccessPanel({
  members,
  projects,
  workspaceRoleLabels,
}: {
  readonly members: readonly TeamWorkspaceMember[];
  readonly projects: readonly TeamWorkspaceProject[];
  readonly workspaceRoleLabels: Readonly<Record<TeamWorkspaceRole, RoleLabel>>;
}) {
  const bt = useBilingual("MemberWorkAccessPanel");
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, StudioTeamSnapshot | null> | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (projects.length === 0) {
      setSnapshots(new Map());
      return;
    }
    const controller = new AbortController();
    let active = true;
    setSnapshots(null);
    void (async () => {
      const loaded = await Promise.all(
        projects.map(async (project) => {
          try {
            const snapshot = await getStudioTeam(project.workId, controller.signal);
            return [project.workId, snapshot] as const;
          } catch {
            // 작품 하나가 실패해도 나머지는 보여 준다. 실패는 null = 확인 불가.
            return [project.workId, null] as const;
          }
        }),
      );
      if (active) setSnapshots(new Map(loaded));
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [projects, refresh]);

  const overview = snapshots ? buildMemberWorkAccessOverview({ members, projects, snapshots }) : null;
  const loading = snapshots === null;

  return (
    <section
      aria-labelledby="member-work-access-title"
      className="creator-workflow-panel rounded-2xl border border-line bg-card p-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="member-work-access-title" className="text-lg font-bold">
          {bt("구성원별 작품 접근 범위", "Per-member project access")}
        </h2>
        <p className="text-xs text-fg-3">
          {bt(
            "팀 소속과 작품 권한은 별개입니다. 구성원 행을 펼치면 작품마다 어떤 역할로 접근 중인지 볼 수 있습니다.",
            "Team membership and project permission are separate. Expand a member to see their role on each project.",
          )}
        </p>
      </div>

      {projects.length === 0 && (
        <p className="text-sm text-fg-2">
          {bt(
            "연결된 작품이 없어 표시할 작품 접근 범위가 없습니다. 작품을 연결하면 구성원별 권한이 여기에 모입니다.",
            "No linked projects yet, so there's no project access to show. Link a project and per-member permissions will gather here.",
          )}
        </p>
      )}
      {projects.length > 0 && loading && (
        <p role="status">{bt("작품별 접근 범위를 불러오는 중입니다.", "Loading per-project access…")}</p>
      )}
      {overview && projects.length > 0 && (
        <>
          <p className="mb-3 text-sm text-fg-2" role="status">
            {bt(
              `연결 작품 ${overview.projectCount}개 기준 · 작품 권한이 확인된 구성원 ${overview.rows.length}명`,
              `Across ${overview.projectCount} linked projects · ${overview.rows.length} members`,
            )}
            {overview.membersWithNoAccessCount > 0 &&
              bt(
                ` · 작품 접근이 없는 구성원 ${overview.membersWithNoAccessCount}명`,
                ` · ${overview.membersWithNoAccessCount} with no project access`,
              )}
          </p>
          {overview.failedProjectCount > 0 && (
            <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
              <span>
                {bt(
                  `작품 ${overview.failedProjectCount}개의 권한 정보를 불러오지 못해 해당 작품은 '확인 불가'로 표시합니다.`,
                  `Couldn't load permissions for ${overview.failedProjectCount} project(s); they are shown as unchecked.`,
                )}
              </span>
              <button
                type="button"
                className={buttonClass({ variant: "outline", size: "sm" })}
                onClick={() => setRefresh((value) => value + 1)}
              >
                {bt("다시 불러오기", "Retry")}
              </button>
            </div>
          )}
          <ul className="space-y-3">
            {overview.rows.map((row) => (
              <li key={row.userId} className="rounded-lg border border-line">
                <details data-testid="member-work-access-row">
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3 p-3 outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <ProductionAvatar name={row.displayName} />
                    <strong className="mr-auto">{row.displayName}</strong>
                    <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-xs font-bold">
                      {bt(
                        `팀 소속: ${workspaceRoleLabels[row.workspaceRole].ko}`,
                        `Team: ${workspaceRoleLabels[row.workspaceRole].en}`,
                      )}
                    </span>
                    <span className="text-sm text-fg-2">
                      {bt(`작품 접근 ${row.activeCount}/${overview.projectCount}개`, `Project access ${row.activeCount}/${overview.projectCount}`)}
                      {row.pendingCount > 0 && bt(` · 대기 ${row.pendingCount}건`, ` · ${row.pendingCount} pending`)}
                      {row.unknownCount > 0 && bt(` · 확인 불가 ${row.unknownCount}개`, ` · ${row.unknownCount} unchecked`)}
                      {row.activeCount === 0 && row.pendingCount === 0 && row.unknownCount === 0 &&
                        bt(" · 작품 권한 없음", " · no project permission")}
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-line p-3">
                    <p className="text-sm text-fg-2">
                      {bt("팀 소속", "Team membership")}:{" "}
                      {bt(workspaceRoleLabels[row.workspaceRole].ko, workspaceRoleLabels[row.workspaceRole].en)}
                      {bt(
                        " — 팀 역할은 워크스페이스 서버가 강제하고, 이것만으로는 원고를 열 수 없습니다.",
                        " — the team role is enforced by the workspace server and alone doesn't open manuscripts.",
                      )}
                    </p>
                    <div>
                      <p className="mb-2 text-sm font-bold">{bt("작품별 접근 범위", "Per-project access")}</p>
                      <ul className="space-y-2">
                        {row.entries.map((entry) => (
                          <AccessEntryLine key={entry.workId} entry={entry} />
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
