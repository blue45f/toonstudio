import { BarChart3, LockKeyhole, Plus, Vote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ProcessCompareItem } from "./process-compare-model";
import { ProductionPill } from "./production-ui";
import {
  buildTeamVoteDecisionRecord,
  castTeamVote,
  closeTeamVote,
  createTeamVoteSession,
  parseTeamVoteSessions,
  serializeTeamVoteSessions,
  tallyTeamVote,
  teamVoteOptionsFromCompareItems,
  teamVoteStorageKey,
  validateTeamVoteOptions,
  type TeamVoteOption,
  type TeamVoteSession,
} from "./team-vote-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface TeamVotePanelProps {
  readonly projectId: string;
  readonly episodeId: string;
  /** 투표자 식별자. 없으면(팀 배정 없음) 투표할 수 없고 사유를 보여준다. */
  readonly currentUserId: string | null;
  /** 세션 개설·마감 권한. 투표 자체는 식별자만 있으면 된다. */
  readonly canEdit: boolean;
  /** 비교 탭 소스. 선택지 후보로 제시한다. */
  readonly compareItems?: readonly ProcessCompareItem[];
}

function loadSessions(storageKey: string): { sessions: readonly TeamVoteSession[]; broken: boolean } {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey) ?? null;
    if (raw === null) return { sessions: [], broken: false };
    const parsed = parseTeamVoteSessions(raw);
    return parsed ? { sessions: parsed, broken: false } : { sessions: [], broken: true };
  } catch {
    return { sessions: [], broken: true };
  }
}

/**
 * 팀 시안 투표: 표지 시안·콘티 방향 같은 팀 결정을 세션 투표로 집계한다.
 * 선택지는 비교 소스(시안 ref)를 그대로 가져올 수 있고, 마감하면 득표·동률이
 * 결정 기록으로 남으며 마감 후 투표는 모델이 거부한다(동일 객체 반환).
 * 세션은 이 기기의 회차 단위 localStorage에 저장된다.
 */
export function TeamVotePanel({ projectId, episodeId, currentUserId, canEdit, compareItems = [] }: TeamVotePanelProps) {
  const bt = useBilingual("TeamVotePanel");
  const storageKey = teamVoteStorageKey(projectId, episodeId);
  const [loaded, setLoaded] = useState(() => loadSessions(storageKey));
  const [sessions, setSessions] = useState<readonly TeamVoteSession[]>(loaded.sessions);
  const [title, setTitle] = useState("");
  const [customOptions, setCustomOptions] = useState("");
  const [pickedCompareIds, setPickedCompareIds] = useState<readonly string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const next = loadSessions(storageKey);
    setLoaded(next);
    setSessions(next.sessions);
  }, [storageKey]);

  useEffect(() => {
    if (loaded.broken) return;
    try {
      globalThis.localStorage?.setItem(storageKey, serializeTeamVoteSessions(sessions));
    } catch {
      // 저장 실패(용량 등)는 화면 상태를 막지 않는다.
    }
  }, [loaded.broken, sessions, storageKey]);

  const compareOptions = useMemo(() => teamVoteOptionsFromCompareItems(compareItems), [compareItems]);

  const replaceSession = (next: TeamVoteSession) => {
    setSessions((previous) => previous.map((session) => (session.id === next.id ? next : session)));
  };

  const createSession = () => {
    const options: TeamVoteOption[] = [
      ...compareOptions.filter((option) => option.refId && pickedCompareIds.includes(option.refId)),
      ...customOptions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((label, index) => ({ id: `custom:${index}:${label}`, label })),
    ];
    const validation = validateTeamVoteOptions(options);
    if (!title.trim()) {
      setFormError(bt("투표 주제를 입력하세요.", "Enter a vote topic."));
      return;
    }
    if (!validation.ok) {
      setFormError(validation.reason);
      return;
    }
    const session = createTeamVoteSession({
      id: `vote:${Date.now().toString(36)}`,
      title: title.trim(),
      options,
      anonymous,
    });
    setSessions((previous) => [session, ...previous]);
    setTitle("");
    setCustomOptions("");
    setPickedCompareIds([]);
    setAnonymous(false);
    setFormError(null);
  };

  return (
    <section aria-labelledby="team-vote-title" className="mt-4 rounded-2xl border border-line bg-panel p-4">
      <h3 id="team-vote-title" className="flex items-center gap-2 text-sm font-black text-fg">
        <Vote className="size-4 text-accent" aria-hidden="true" />
        {bt("팀 시안 투표", "Team design vote")}
      </h3>
      <p className="mt-1 text-xs leading-5 text-fg-2">
        {bt(
          "표지 시안·콘티 방향 같은 팀 결정을 투표로 모읍니다. 마감하면 득표와 동률이 결정 기록으로 남고, 마감 뒤에는 표를 바꿀 수 없습니다.",
          "Collect team decisions such as cover drafts or storyboard direction. Closing keeps counts and ties as a decision record, and ballots lock afterwards.",
        )}
      </p>

      {loaded.broken ? (
        <p className="mt-3 rounded-xl border border-bad/35 bg-bad/10 p-3 text-xs leading-5 text-fg" role="alert">
          {bt(
            "저장된 투표 데이터를 읽을 수 없어 표시하지 않습니다. 기존 데이터를 덮지 않으려면 이 화면에서 새 투표를 만들지 마세요.",
            "Saved vote data could not be read, so it is not shown. Avoid creating new votes here so the stored data is not overwritten.",
          )}
        </p>
      ) : null}

      {!currentUserId ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-fg-3" role="status">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {bt("이 회차의 팀 배정이 있어야 투표할 수 있습니다.", "You need a team assignment on this episode to vote.")}
        </p>
      ) : null}

      {sessions.map((session) => {
        const tally = tallyTeamVote(session);
        const record = buildTeamVoteDecisionRecord(session);
        const myBallot = currentUserId ? session.ballots[currentUserId] : undefined;
        const closed = session.status === "closed";
        return (
          <article key={session.id} className="mt-3 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="min-w-0 text-sm font-bold text-fg">{session.title}</h4>
              <span className="flex items-center gap-1.5">
                {session.anonymous ? <ProductionPill tone="neutral">{bt("익명", "Anonymous")}</ProductionPill> : null}
                <ProductionPill tone={closed ? "neutral" : "accent"}>
                  {closed ? bt("마감", "Closed") : bt("진행 중", "Open")}
                </ProductionPill>
                {closed && record.isTie ? <ProductionPill tone="warning">{bt("동률", "Tie")}</ProductionPill> : null}
                {closed && record.decided ? <ProductionPill tone="success">{bt("결정됨", "Decided")}</ProductionPill> : null}
              </span>
            </div>
            <p className="mt-1 text-[0.6875rem] text-fg-3">
              {bt(`참여 ${tally.totalVoters}명`, `${tally.totalVoters} voters`)}
              {myBallot ? bt(" · 내 표 반영됨", " · your vote counted") : ""}
            </p>
            <ul className="mt-2 space-y-2">
              {tally.tallies.map((entry) => {
                const option = session.options.find((o) => o.id === entry.optionId);
                if (!option) return null;
                const isMine = myBallot === option.id;
                const voters = session.anonymous
                  ? []
                  : Object.entries(session.ballots).filter(([, optionId]) => optionId === option.id).map(([userId]) => userId);
                return (
                  <li key={option.id} className={cn("rounded-xl border px-3 py-2", isMine ? "border-accent/40 bg-accent-soft" : "border-line bg-panel")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-xs font-bold text-fg">
                        {option.label}
                        {tally.leaders.includes(option.id) && tally.totalVoters > 0 ? (
                          <span className="ml-1 font-normal text-accent">· {record.isTie ? bt("동률 선두", "Tied lead") : bt("선두", "Leading")}</span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[0.6875rem] text-fg-3">
                          {bt(`${entry.count}표 · ${Math.round(entry.ratio * 100)}%`, `${entry.count} votes · ${Math.round(entry.ratio * 100)}%`)}
                        </span>
                        <button
                          type="button"
                          disabled={closed || !currentUserId}
                          onClick={() => {
                            if (!currentUserId) return;
                            // 마감 세션은 모델이 동일 객체를 돌려주므로 상태가 바뀌지 않는다(이중 방어).
                            replaceSession(castTeamVote(session, currentUserId, option.id));
                          }}
                          className={buttonClass({ size: "sm", variant: isMine ? "solid" : "outline", className: "min-h-9" })}
                        >
                          {isMine ? bt("내 선택", "My pick") : bt("투표", "Vote")}
                        </button>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(entry.ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={option.label}>
                      <div className="h-full bg-accent" style={{ width: `${Math.round(entry.ratio * 100)}%` }} />
                    </div>
                    {voters.length ? (
                      <p className="mt-1.5 text-[0.6875rem] text-fg-3">{voters.join(", ")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {closed ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-line bg-panel p-3 text-xs leading-5 text-fg-2" role="status">
                <BarChart3 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                {record.decided
                  ? bt(`결정 기록: "${record.leaderLabels[0]}" — ${tally.totalVoters}명 참여`, `Decision record: "${record.leaderLabels[0]}" — ${tally.totalVoters} voters`)
                  : record.isTie
                    ? bt(`결정 기록: 동률(${record.leaderLabels.join(", ")}) — 결정 보류`, `Decision record: tie (${record.leaderLabels.join(", ")}) — undecided`)
                    : bt("결정 기록: 표가 없어 결정 없음", "Decision record: no ballots, no decision")}
              </p>
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => replaceSession(closeTeamVote(session))}
                className={buttonClass({ size: "sm", variant: "outline", className: "mt-2 min-h-9 gap-1.5" })}
              >
                <LockKeyhole className="size-3.5" aria-hidden="true" />
                {bt("투표 마감", "Close vote")}
              </button>
            ) : null}
          </article>
        );
      })}

      {sessions.length === 0 && !loaded.broken ? (
        <p className="mt-3 rounded-xl border border-dashed border-line p-3 text-xs text-fg-3">
          {bt("아직 투표가 없습니다. 시안 결정이 필요하면 아래에서 새 투표를 여세요.", "No votes yet. Open one below when the team needs to decide.")}
        </p>
      ) : null}

      {canEdit && !loaded.broken ? (
        <div className="mt-3 rounded-xl border border-line bg-card p-3">
          <h4 className="text-xs font-black text-fg">{bt("새 투표 열기", "Open a new vote")}</h4>
          <label className="mt-2 block text-[0.6875rem] font-bold text-fg-2">
            {bt("주제", "Topic")}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={bt("예: 표지 시안 결정", "e.g. Cover draft decision")}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg"
            />
          </label>
          {compareOptions.length ? (
            <fieldset className="mt-3">
              <legend className="text-[0.6875rem] font-bold text-fg-2">{bt("비교 소스를 선택지로", "Use compare sources as options")}</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {compareOptions.map((option) => {
                  const picked = option.refId ? pickedCompareIds.includes(option.refId) : false;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => {
                        if (!option.refId) return;
                        setPickedCompareIds((previous) =>
                          picked ? previous.filter((id) => id !== option.refId) : [...previous, option.refId as string],
                        );
                      }}
                      className={buttonClass({ size: "sm", variant: picked ? "solid" : "outline", className: "min-h-9" })}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <label className="mt-3 block text-[0.6875rem] font-bold text-fg-2">
            {bt("직접 입력 선택지 (한 줄에 하나)", "Custom options (one per line)")}
            <textarea
              value={customOptions}
              onChange={(event) => setCustomOptions(event.target.value)}
              rows={3}
              placeholder={bt("시안 A\n시안 B", "Draft A\nDraft B")}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg"
            />
          </label>
          <label className="mt-2 flex min-h-9 items-center gap-2 text-xs font-bold text-fg-2">
            <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
            {bt("익명 투표 (누가 어디에 표를 던졌는지 숨김)", "Anonymous (hide who voted for what)")}
          </label>
          {formError ? (
            <p className="mt-2 text-xs font-bold text-bad" role="alert">{formError}</p>
          ) : null}
          <button type="button" onClick={createSession} className={buttonClass({ size: "sm", className: "mt-2 min-h-11 gap-1.5" })}>
            <Plus className="size-4" aria-hidden="true" />
            {bt("투표 열기", "Open vote")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
