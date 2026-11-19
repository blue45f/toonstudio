import { useCallback, useEffect, useRef, useState } from "react";
import { studioSpacePollSnapshot, type StudioSpacePollCommand, type StudioSpacePollSnapshot } from "@toonstudio/contracts/studio-space-poll";
import { apiFetch } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioVirtualSpacePoll } from "./StudioVirtualSpacePoll";
import { readStudioGuestSession } from "./studio-virtual-space-guest-session";
import { useStudioSpacePoll, type StudioPollDraft } from "./use-studio-space-poll";

interface Props {
  workId: string;
  world: string;
  actor: string | null;
  localOnly: boolean;
  name: string;
}

export function StudioSpacePollPanel(props: Props) {
  const guest = !props.actor && readStudioGuestSession();
  const voter = props.actor ?? (guest && guest.spaceId === props.workId ? guest.sessionId : "device");
  const key = JSON.stringify(["studio-space-poll-v1", props.workId, props.world, voter]);
  if (props.localOnly) return <LocalPoll key={key} storageKey={key} voter={voter} name={props.name} />;
  if (!props.actor) return <PollLoading />;
  return <TeamPoll key={key} {...props} />;
}

function PollLoading() {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <p role="status">{bt("공간의 투표를 불러오는 중이에요.", "Loading the room poll.")}</p>;
}

function LocalPoll({ storageKey, voter, name }: { storageKey: string; voter: string; name: string }) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  const { state, retry, keepCopyAndRestart, create, vote, close } = useStudioSpacePoll(storageKey, voter, name);
  return <div className="studio-poll-local">
    <p className="space-panel-note">{bt("이 기기에 저장하는 개인 투표예요.", "This personal poll is saved on this device.")}</p>
    {state.failed && <div role="alert">{state.corrupt ? bt("저장된 투표 파일을 읽을 수 없어요.", "The saved poll file could not be read.") :
      bt("이 기기의 투표를 읽거나 저장하지 못했어요.", "Could not read or save the poll on this device.")}
      <button type="button" onClick={retry}>{bt("다시 시도", "Try again")}</button>
      {state.corrupt && <button type="button" onClick={keepCopyAndRestart}>
        {bt("손상된 사본 보관하고 새로 시작", "Keep the damaged copy and start again")}</button>}
    </div>}
    {(!state.failed || state.poll) && <StudioVirtualSpacePoll poll={state.poll} canCreate canClose={state.poll?.createdBySessionId === voter}
      voterSessionId={voter} onCreate={create} onVote={vote} onClose={close} />}
  </div>;
}

type Failure = "access" | "changed" | "network";
class PollRequestError extends Error {
  constructor(readonly status: number) { super(String(status)); }
}
function reason(error: unknown): Failure {
  if (error instanceof PollRequestError && [401, 403, 404].includes(error.status)) return "access";
  return error instanceof PollRequestError && error.status === 409 ? "changed" : "network";
}

function TeamPoll({ workId, world }: Props) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  const path = `/studio-project-graph/works/${encodeURIComponent(workId)}/space-poll`;
  const [data, setData] = useState<StudioSpacePollSnapshot | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const writing = useRef(false);
  const retryCommand = useRef<StudioSpacePollCommand | null>(null);
  const refresh = useCallback(async () => {
    if (writing.current) return;
    const ticket = ++generation.current;
    try {
      const response = await apiFetch(`${path}?world=${encodeURIComponent(world)}`);
      if (!response.ok) throw new PollRequestError(response.status);
      const next = studioSpacePollSnapshot.parse(await response.json());
      if (ticket === generation.current) {
        setData(next);
        if (!retryCommand.current) setError(prior => prior === "changed" ? prior : null);
      }
    } catch (e) {
      if (ticket !== generation.current) return;
      const why = reason(e);
      if (why === "access") setData(null);
      setError(why);
    }
  }, [path, world]);
  const invalidate = useCallback(() => { generation.current += 1; }, []);
  useEffect(() => {
    void refresh();
    const foreground = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(foreground, 4_000);
    window.addEventListener("focus", foreground);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener("focus", foreground);
    };
  }, [refresh, invalidate]);

  async function submit(command: StudioSpacePollCommand) {
    if (writing.current) return;
    writing.current = true;
    const ticket = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (!response.ok) throw new PollRequestError(response.status);
      const next = studioSpacePollSnapshot.parse(await response.json());
      if (ticket === generation.current) { retryCommand.current = null; setData(next); }
    } catch (e) {
      if (ticket === generation.current) {
        const why = reason(e);
        retryCommand.current = why === "network" ? command : null;
        if (why === "access") setData(null);
        setError(why);
        if (why === "changed") {
          writing.current = false;
          void refresh();
        }
      }
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  function create(draft: StudioPollDraft) {
    void submit({ action: "create", world, id: crypto.randomUUID(), previousId: data?.poll?.id ?? null,
      question: draft.question, options: [...draft.options], anonymous: draft.anonymous, closesInMs: draft.closesInMs ?? null });
  }
  const retry = () => {
    const command = retryCommand.current;
    setError(null);
    if (command) void submit(command);
    else void refresh();
  };
  const poll = data?.poll;
  return <>
    <p className="space-panel-note">{bt("이 공간의 작품 팀이 함께 쓰는 투표예요.", "This poll is shared with the work’s team in this room.")}</p>
    {error && <div role="alert">{error === "access" ? bt("이 작품의 투표를 열 권한이 없어요.", "You do not have access to this work’s poll.") :
      error === "changed" ? bt("투표가 바뀌었어요. 최신 결과를 확인해 주세요.", "The poll changed. Check the latest result.") :
        bt("서버 응답을 확인하지 못했어요.", "The server did not confirm the request.")}
      <button type="button" disabled={busy} onClick={retry}>{bt("다시 확인", "Check again")}</button></div>}
    {!data && !error && <PollLoading />}
    {data && <fieldset disabled={busy || Boolean(retryCommand.current)} aria-busy={busy} className="studio-poll-fields">
      <StudioVirtualSpacePoll poll={null} shared={data} canCreate={data.canCreate} canClose={data.canClose}
        voterSessionId="" onCreate={create}
        onVote={option => { if (poll) void submit({ action: "vote", id: poll.id, world, optionIndex: Number(option) }); }}
        onClose={() => { if (poll) void submit({ action: "close", id: poll.id, world }); }} />
    </fieldset>}
  </>;
}
