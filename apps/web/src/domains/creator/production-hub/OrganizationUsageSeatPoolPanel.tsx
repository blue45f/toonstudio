import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TeamWorkspaceSummary, WorkspaceUsageResponse } from "@toonstudio/contracts/production-workspace";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getTeamUsage } from "./team-workspace-api";
import { buildOrganizationUsagePreview, type SeatPoolStatus } from "./organization-usage-model";

const STATUS_LABELS: Record<SeatPoolStatus, { readonly ko: string; readonly en: string }> = {
  available: { ko: "여유 있음", en: "Seats available" },
  "near-full": { ko: "거의 참", en: "Nearly full" },
  full: { ko: "가득 참", en: "Full" },
  over: { ko: "한도 초과", en: "Over limit" },
};

/**
 * 조직 사용량·좌석 풀 카드 본문.
 * 좌석 풀 미리보기는 팀 목록 요약 카운터만으로 즉시 계산한다(추가 API 호출 없음).
 * 팀별 사용량 상세는 사용자가 눌렀을 때만 불러오며, 실패한 팀은 조용히 빠지지 않고
 * 이름과 함께 실패로 표시하고 요약 카운터 값을 유지한다.
 */
export function OrganizationUsageSeatPoolPanel({ linkedTeams }: { linkedTeams: readonly TeamWorkspaceSummary[] }) {
  const bt = useBilingual("OrganizationUsageSeatPoolPanel");
  const [usages, setUsages] = useState<ReadonlyMap<string, WorkspaceUsageResponse>>(new Map());
  const [failedTeamNames, setFailedTeamNames] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => buildOrganizationUsagePreview(linkedTeams, usages), [linkedTeams, usages]);
  const seatPercent = preview.seatCapacity > 0 ? Math.min(100, Math.round((preview.seatsUsed / preview.seatCapacity) * 100)) : 0;

  async function loadDetails() {
    setLoading(true); setError("");
    const results = await Promise.allSettled(linkedTeams.map(async (team) => ({ team, usage: await getTeamUsage(team.id) })));
    const next = new Map<string, WorkspaceUsageResponse>();
    const failed: string[] = [];
    let firstFailure: unknown = null;
    for (const result of results) {
      if (result.status === "fulfilled") next.set(result.value.team.id, result.value.usage);
      else if (firstFailure === null) firstFailure = result.reason;
    }
    results.forEach((result, index) => {
      if (result.status === "rejected") failed.push(linkedTeams[index]?.name ?? "");
    });
    setUsages(next);
    setFailedTeamNames(failed.filter(Boolean));
    setLoaded(true);
    setLoading(false);
    if (failed.length > 0 && firstFailure !== null) {
      setError(await getApiErrorMessage(firstFailure, bt("일부 팀의 사용량 상세를 불러오지 못했습니다.", "Couldn't load usage details for some teams.")));
    }
  }

  if (linkedTeams.length === 0) {
    return <p className="text-sm leading-6 text-fg-2">{bt("연결한 팀이 없어 합산할 사용량이 없습니다. 아래 팀 연결에서 팀을 연결하면 조직 좌석 풀이 여기에 미리보기로 표시됩니다.", "No linked teams yet, so there is no usage to roll up. Link a team below and the organization seat pool preview will appear here.")}</p>;
  }

  return (
    <div>
      <p className="rounded-lg border border-warn/50 bg-raised p-3 text-sm leading-6 text-fg-2">
        {bt("미리보기·모의 표면입니다. 조직 좌석 풀은 아직 실제 제도가 아닙니다 — 실제 한도는 지금처럼 팀(워크스페이스)별로 적용되고, 조직 단위 좌석 배분·포인트 풀·결제는 제공하지 않습니다. 아래 수치는 연결 팀의 서버 카운터를 합산한 미리보기일 뿐 어떤 차단·과금에도 쓰이지 않습니다.",
          "Preview / mock surface. An organization seat pool is not a real plan yet — actual limits still apply per team (workspace), and organization-level seat allocation, a point pool, and billing are not offered. The figures below only add up your linked teams' server counters as a preview; they never block or charge anything.")}
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        <div><dt className="text-sm text-fg-2">{bt("좌석 풀 사용 (미리보기)", "Seat pool used (preview)")}</dt><dd className="mt-1 text-xl font-black">{preview.seatsUsed} / {preview.seatCapacity}</dd></div>
        <div><dt className="text-sm text-fg-2">{bt("남은 좌석 (미리보기)", "Seats left (preview)")}</dt><dd className="mt-1 text-xl font-black">{preview.seatsLeft}</dd></div>
        <div><dt className="text-sm text-fg-2">{bt("작품 합산", "Projects rolled up")}</dt><dd className="mt-1 text-xl font-black">{preview.projectsUsed} / {preview.projectCapacity}</dd></div>
        <div><dt className="text-sm text-fg-2">{bt("풀 상태", "Pool status")}</dt><dd className="mt-1 text-xl font-black">{bt(STATUS_LABELS[preview.status].ko, STATUS_LABELS[preview.status].en)}</dd></div>
      </dl>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" role="img" aria-label={bt(`좌석 풀 사용률 ${seatPercent}%`, `Seat pool ${seatPercent}% used`)}>
        <div className="h-full bg-accent" style={{ width: `${seatPercent}%` }} />
      </div>
      <p className="mt-2 text-xs leading-6 text-fg-3">
        {bt(`좌석 = 구성원 ${preview.membersTotal}명 + 대기 초대 ${preview.pendingInvitesTotal}건 (대기 초대가 팀 한도에 산입되는 현행 정책 기준). 구성원 수는 팀별 합계라 같은 사람이 여러 팀에 있으면 중복 계산됩니다.`,
          `Seats = ${preview.membersTotal} members + ${preview.pendingInvitesTotal} pending invites (pending invites count toward team limits under the current policy). Member counts are per-team sums, so a person in several teams is counted more than once.`)}
      </p>

      <ul className="mt-4 space-y-3">
        {preview.teams.map((row) => (
          <li key={row.workspaceId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
            <strong className="mr-auto">{row.name}</strong>
            <span className="text-sm text-fg-2">{bt(`좌석 ${row.seatsUsed}/${row.seatLimit} · 남은 좌석 ${row.seatsLeft} · 작품 ${row.projectsUsed}/${row.projectLimit}`, `Seats ${row.seatsUsed}/${row.seatLimit} · ${row.seatsLeft} left · Projects ${row.projectsUsed}/${row.projectLimit}`)}</span>
            <span className={`rounded-full border px-2 py-1 text-xs ${row.status === "available" ? "border-accent/45 bg-accent-soft text-fg" : "border-warn/60 text-fg"}`}>{bt(STATUS_LABELS[row.status].ko, STATUS_LABELS[row.status].en)}</span>
            <Link className="underline" to={`/team/people/${row.workspaceId}`}>{bt("팀 열기", "Open team")}</Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={loading} className={buttonClass({ variant: "outline" })} onClick={() => void loadDetails()}>
          {loading ? bt("불러오는 중…", "Loading…") : loaded ? bt("사용량 상세 다시 불러오기", "Reload usage details") : bt("팀별 사용량 상세 불러오기", "Load per-team usage details")}
        </button>
        {loaded && preview.operationMode && (
          <span className="text-xs text-fg-3">{bt(`정책 ${preview.policyVersion} · ${preview.operationMode === "free" ? "무료 운영 — 실제 결제는 제공하지 않습니다." : "유료 운영 정책 표기 중이나 실제 결제는 아직 제공하지 않습니다."}`, `Policy ${preview.policyVersion} · ${preview.operationMode === "free" ? "Free operation — no actual billing." : "A paid policy label is in effect, but actual billing is not available yet."}`)}</span>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-warn">{error}{failedTeamNames.length > 0 && bt(` 상세 실패 팀: ${failedTeamNames.join(", ")} — 이 팀들은 요약 카운터로 표시 중입니다.`, ` Teams that failed: ${failedTeamNames.join(", ")} — those teams are shown from summary counters.`)}</p>}
      <p className="mt-3 text-xs leading-6 text-fg-3">{bt("원고 저장량은 아직 측정되지 않아 사용량에 숫자로 표시하지 않습니다(0이 아닙니다). 조직 단위 합산 한도와 좌석 배분은 서버 정책 확장이 필요한 미래 항목입니다.", "Manuscript storage is not metered yet, so it is not shown as a number (it is not zero). Organization-level aggregate limits and seat allocation remain future items that need a server policy extension.")}</p>
    </div>
  );
}
