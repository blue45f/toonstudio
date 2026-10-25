import { useState } from "react";

import {
  addProductionEpisode,
  addProductionVersion,
  decideProductionReview,
  EMPTY_PRODUCTION_WORKFLOW,
  handoffProductionEpisode,
  PRODUCTION_ROLE_LABELS,
  PRODUCTION_STAGES,
  productionOverview,
  productionStageLabel,
  requestProductionReview,
  resubmitProductionReview,
  type ProductionRole,
  type ProductionStage,
  type ProductionWorkflowState,
} from "./studio-production-workflow";

export interface StudioProductionWorkflowProps {
  initial?: ProductionWorkflowState;
  onActivity?: (action: string, detail: string) => void;
}

type RoleFilter = "all" | ProductionRole;

const ROLE_FILTERS: ReadonlyArray<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "pd", label: "PD" },
  { id: "reviewer", label: "검수자" },
  { id: "artist", label: "작가" },
];

const HANDOFF_TARGETS: Readonly<Record<ProductionRole, readonly ProductionRole[]>> = {
  artist: ["reviewer"],
  reviewer: ["artist", "pd"],
  pd: ["artist"],
};

export function StudioProductionWorkflow({ initial = EMPTY_PRODUCTION_WORKFLOW, onActivity }: StudioProductionWorkflowProps) {
  const [state, setState] = useState<ProductionWorkflowState>(initial);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [episodeNo, setEpisodeNo] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Readonly<Record<string, string>>>({});
  const [versionNotes, setVersionNotes] = useState<Readonly<Record<string, string>>>({});
  const [versionStages, setVersionStages] = useState<Readonly<Record<string, ProductionStage>>>({});

  const overview = productionOverview(state);
  const visibleEpisodes = roleFilter === "all"
    ? state.episodes
    : state.episodes.filter((episode) => episode.assigneeRole === roleFilter);

  function apply(result: ReturnType<typeof addProductionEpisode>) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setState(result.state);
    const latest = result.state.log[0];
    if (latest) onActivity?.(latest.action, latest.detail);
  }

  return (
    <section aria-label="제작 흐름" data-testid="studio-production-workflow" className="space-y-4">
      <div aria-label="PD 조망" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "전체 회차", value: overview.totalEpisodes },
          { label: "검수 대기", value: overview.pendingReview },
          { label: "수정 요청", value: overview.changesRequested },
          { label: "게시 준비", value: overview.ready },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-line bg-card/45 px-3 py-3 text-center">
            <p className="text-lg font-black tabular-nums text-fg">{metric.value.toLocaleString("ko-KR")}</p>
            <p className="text-[0.65rem] font-semibold text-fg-3">{metric.label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="공정 분포">
        {PRODUCTION_STAGES.map((stage) => (
          <span key={stage.id} className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2">
            {stage.label} {overview.byStage[stage.id]}편
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="직군별 보기">
        {ROLE_FILTERS.map((filter) => (
          <button key={filter.id} type="button" onClick={() => setRoleFilter(filter.id)}
            aria-pressed={roleFilter === filter.id}
            className={`min-h-11 rounded-lg border px-3 text-xs font-semibold ${roleFilter === filter.id ? "border-accent/40 bg-accent-soft/25 text-accent" : "border-line bg-panel text-fg-2 hover:bg-raised"}`}>
            {filter.label}
          </button>
        ))}
      </div>

      <form className="flex flex-wrap gap-2 rounded-xl border border-line bg-card/30 p-3" onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number.parseInt(episodeNo, 10);
        apply(addProductionEpisode(state, { episodeNo: parsed, title: episodeTitle }));
        if (episodeTitle.trim() && Number.isSafeInteger(parsed) && parsed >= 1) {
          setEpisodeNo("");
          setEpisodeTitle("");
        }
      }}>
        <label className="text-xs font-semibold text-fg-2">
          회차 번호
          <input value={episodeNo} onChange={(event) => setEpisodeNo(event.target.value)} inputMode="numeric"
            placeholder="예: 12" className="mt-1.5 min-h-11 w-24 rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent" />
        </label>
        <label className="min-w-[12rem] flex-1 text-xs font-semibold text-fg-2">
          회차 제목
          <input value={episodeTitle} onChange={(event) => setEpisodeTitle(event.target.value.slice(0, 100))} maxLength={100}
            placeholder="예: 12화 — 새로운 동료" className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent" />
        </label>
        <button type="submit" className="mt-auto inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent-hover">
          회차 추가
        </button>
      </form>

      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs leading-relaxed text-bad">{error}</p> : null}

      <div className="space-y-2" aria-label="에피소드 · 공정 · 버전 체인">
        {visibleEpisodes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-card/25 px-4 py-6 text-center text-xs leading-relaxed text-fg-3">
            아직 회차가 없습니다. 위 양식으로 회차를 추가하면 공정·버전 체인이 여기서 이어집니다.
          </p>
        ) : visibleEpisodes.map((episode) => {
          const versions = state.versions.filter((version) => version.episodeId === episode.id);
          const latest = versions[versions.length - 1];
          return (
            <article key={episode.id} className="rounded-xl border border-line bg-card/45 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-bold text-fg">{episode.episodeNo}화 {episode.title}</p>
                <span className="rounded-full border border-accent/30 bg-accent-soft/20 px-2.5 py-1 text-[0.68rem] font-semibold text-accent">
                  {productionStageLabel(episode.stage)}
                </span>
                <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2">
                  담당: {PRODUCTION_ROLE_LABELS[episode.assigneeRole]}
                </span>
              </div>
              {versions.length > 0 ? (
                <ol className="mt-2 space-y-1" aria-label={`${episode.episodeNo}화 버전 체인`}>
                  {versions.map((version) => (
                    <li key={version.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-panel px-2.5 py-2 text-xs text-fg-2">
                      <span className="font-bold text-fg">r{version.revision}</span>
                      <span>{productionStageLabel(version.stage)}</span>
                      <span>{PRODUCTION_ROLE_LABELS[version.authorRole]}</span>
                      {version.note ? <span className="min-w-0 flex-1 truncate">{version.note}</span> : null}
                      <time dateTime={version.createdAt} className="text-[0.68rem] text-fg-3">
                        {new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(version.createdAt))}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-fg-3">아직 등록된 버전이 없습니다.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
                  공정
                  <select value={versionStages[episode.id] ?? "color"}
                    onChange={(event) => setVersionStages((current) => ({ ...current, [episode.id]: event.target.value as ProductionStage }))}
                    className="min-h-11 rounded-lg border border-line bg-panel px-2 text-sm text-fg outline-none focus:border-accent">
                    {PRODUCTION_STAGES.map((stage) => (
                      <option key={stage.id} value={stage.id}>{stage.label}</option>
                    ))}
                  </select>
                </label>
                <input value={versionNotes[episode.id] ?? ""} placeholder="버전 메모 (선택)"
                  onChange={(event) => setVersionNotes((current) => ({ ...current, [episode.id]: event.target.value.slice(0, 200) }))}
                  className="min-h-11 min-w-[10rem] flex-1 rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent" />
                <button type="button" onClick={() => apply(addProductionVersion(state, {
                  episodeId: episode.id, stage: versionStages[episode.id] ?? "color", authorRole: episode.assigneeRole, note: versionNotes[episode.id] ?? "",
                }))}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised">
                  버전 등록
                </button>
                {latest ? (
                  <button type="button" onClick={() => apply(requestProductionReview(state, { episodeId: episode.id, versionId: latest.id, actorRole: episode.assigneeRole }))}
                    className="inline-flex min-h-11 items-center rounded-lg border border-accent/35 bg-accent-soft/25 px-3 text-xs font-semibold text-accent hover:bg-accent-soft/45">
                    r{latest.revision} 검수 요청
                  </button>
                ) : null}
                {HANDOFF_TARGETS[episode.assigneeRole].map((target) => (
                  <button key={target} type="button" onClick={() => apply(handoffProductionEpisode(state, { episodeId: episode.id, toRole: target }))}
                    className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised">
                    {PRODUCTION_ROLE_LABELS[target]}에게 인계
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <div aria-label="검수자 검수 큐" className="space-y-2">
        <h3 className="text-xs font-bold text-fg">검수 큐</h3>
        {state.queue.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-card/25 px-4 py-5 text-center text-xs text-fg-3">
            검수 대기 건이 없습니다. 회차에서 버전을 등록하고 검수를 요청하면 여기에 쌓입니다.
          </p>
        ) : state.queue.map((item) => {
          const episode = state.episodes.find((candidate) => candidate.id === item.episodeId);
          const version = state.versions.find((candidate) => candidate.id === item.versionId);
          const decidable = item.status === "pending" || item.status === "resubmitted";
          return (
            <article key={item.id} className="rounded-xl border border-line bg-card/45 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold text-fg">
                  {episode ? `${episode.episodeNo}화 ${episode.title}` : "회차 없음"} · r{version?.revision ?? "?"}
                </p>
                <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2">
                  {item.status === "pending" ? "검수 대기" : item.status === "resubmitted" ? "재제출 대기" : item.status === "approved" ? "승인됨" : "수정 요청됨"}
                </span>
              </div>
              {item.reviewerNote ? <p className="mt-1.5 text-xs leading-relaxed text-fg-3">검수 의견: {item.reviewerNote}</p> : null}
              {decidable ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input value={reviewNotes[item.id] ?? ""} placeholder="검수 의견 (선택)"
                    onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value.slice(0, 500) }))}
                    className="min-h-11 min-w-[10rem] flex-1 rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent" />
                  <button type="button" onClick={() => apply(decideProductionReview(state, { queueId: item.id, decision: "approved", note: reviewNotes[item.id] ?? "" }))}
                    className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent-hover">
                    승인
                  </button>
                  <button type="button" onClick={() => apply(decideProductionReview(state, { queueId: item.id, decision: "changes-requested", note: reviewNotes[item.id] ?? "" }))}
                    className="inline-flex min-h-11 items-center rounded-lg border border-bad/35 bg-bad/10 px-4 text-xs font-semibold text-bad hover:bg-bad/20">
                    수정 요청
                  </button>
                </div>
              ) : null}
              {item.status === "changes-requested" ? (
                <button type="button" onClick={() => apply(resubmitProductionReview(state, { queueId: item.id }))}
                  className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-accent/35 bg-accent-soft/25 px-3 text-xs font-semibold text-accent hover:bg-accent-soft/45">
                  수정본 재제출
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      <div aria-label="활동 로그" className="space-y-2">
        <h3 className="text-xs font-bold text-fg">활동 로그</h3>
        {state.log.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-card/25 px-4 py-5 text-center text-xs text-fg-3">
            아직 활동이 없습니다. 회차·버전·검수·인계가 일어날 때마다 여기에 남습니다.
          </p>
        ) : (
          <ol className="space-y-1">
            {state.log.slice(0, 20).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-2 rounded-lg bg-panel px-3 py-2 text-xs text-fg-2">
                <span className="font-bold text-fg">{PRODUCTION_ROLE_LABELS[entry.actorRole]}</span>
                <span className="font-semibold text-fg">{entry.action}</span>
                <span className="min-w-0 flex-1">{entry.detail}</span>
                <time dateTime={entry.at} className="text-[0.68rem] text-fg-3">
                  {new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.at))}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
