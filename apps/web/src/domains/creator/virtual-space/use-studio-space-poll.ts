import { useCallback, useEffect, useRef, useState } from "react";
import { resetFailedStudioLocalDatabaseOwnership } from "../studio-local-database-runtime";
import { accessStudioSpaceRecord, observeStudioSpaceRecords } from "./studio-space-device-record";
import {
  castStudioPollVote, closeStudioPoll, createStudioPoll, parseStudioPoll, serializeStudioPoll, studioPollStatus,
  type StudioPoll, type StudioPollCreateInput,
} from "./studio-virtual-space-poll";

export type StudioPollDraft = Omit<StudioPollCreateInput, "id" | "createdBySessionId" | "createdByName" | "nowMs">;
type LocalState = { poll: StudioPoll | null; failed: boolean; corrupt?: boolean; loading?: boolean };
type Change = (current: StudioPoll | null) => StudioPoll | null;
function decode(raw: string | null): LocalState {
  const poll = raw === null ? null : parseStudioPoll(raw);
  const corrupt = raw !== null && !poll;
  return { poll, failed: corrupt, corrupt };
}

/** 상위 패널은 계정과 공간이 바뀌면 새 key로 열린다. */
export function useStudioSpacePoll(key: string, voterId: string, voterName: string, mayWrite: () => boolean = () => true) {
  const [state, setState] = useState<LocalState>({ poll: null, failed: false, loading: true });
  const active = useRef(false);
  const pending = useRef<Change | null>(null);
  const saving = useRef(false);
  const reads = useRef(0);
  const current = () => active.current;
  const reload = useCallback(() => {
    const ticket = ++reads.current;
    void accessStudioSpaceRecord(key, undefined, current).then(
      raw => { if (current() && ticket === reads.current && !pending.current) setState(decode(raw)); },
      () => { if (current() && ticket === reads.current && !pending.current) setState(previous => ({ ...previous, loading: false, failed: true })); },
    );
  }, [key]);
  useEffect(() => {
    active.current = true;
    reload();
    const stop = observeStudioSpaceRecords(changed => { if (changed === key && !pending.current) reload(); });
    return () => { active.current = false; stop(); };
  }, [key, reload]);

  const apply = async (change: Change, preserveDamaged = false) => {
    if (saving.current) return;
    pending.current = change;
    saving.current = true;
    let attempted = state;
    try {
      const raw = await accessStudioSpaceRecord(key, previous => {
        const persisted = decode(previous);
        if (persisted.corrupt && !preserveDamaged) return { value: previous };
        if (preserveDamaged) return { value: persisted.corrupt ? null : previous, preserveDamaged: !!persisted.corrupt };
        const next = change(persisted.poll);
        if (next === persisted.poll) return { value: previous };
        attempted = { poll: next, failed: false };
        return { value: next ? serializeStudioPoll(next) : null };
      }, mayWrite);
      pending.current = null;
      if (current()) setState(decode(raw));
    } catch {
      if (preserveDamaged) pending.current = null;
      if (current()) setState({ ...attempted, loading: false, failed: true });
    } finally { saving.current = false; }
  };

  return {
    state,
    async retry() {
      await resetFailedStudioLocalDatabaseOwnership();
      if (!current() || !mayWrite()) return;
      if (pending.current) return apply(pending.current);
      reload();
    },
    keepCopyAndRestart() { if (state.corrupt) return apply(poll => poll, true); },
    create(input: StudioPollDraft) {
      if (state.failed || state.loading) return;
      const result = createStudioPoll({ ...input, createdBySessionId: voterId, createdByName: voterName });
      if (result.ok) return apply(poll => poll?.id === state.poll?.id && (!poll || studioPollStatus(poll) !== "open") ? result.poll : poll);
    },
    vote(optionId: string) {
      if (state.failed || state.loading) return;
      return apply(poll => {
        if (!poll || poll.id !== state.poll?.id) return poll;
        const result = castStudioPollVote(poll, { optionId, voterSessionId: voterId, voterName });
        return result.ok ? result.poll : poll;
      });
    },
    close() {
      if (state.failed || state.loading) return;
      return apply(poll => poll?.createdBySessionId === voterId && poll.id === state.poll?.id ? closeStudioPoll(poll) : poll);
    },
  };
}
