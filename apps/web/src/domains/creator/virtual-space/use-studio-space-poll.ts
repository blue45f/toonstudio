import { useEffect, useRef, useState } from "react";
import {
  castStudioPollVote, closeStudioPoll, createStudioPoll, parseStudioPoll, serializeStudioPoll, studioPollStatus,
  type StudioPoll, type StudioPollCreateInput,
} from "./studio-virtual-space-poll";

export type StudioPollDraft = Omit<StudioPollCreateInput, "id" | "createdBySessionId" | "createdByName" | "nowMs">;
type LocalState = { poll: StudioPoll | null; failed: boolean; corrupt?: boolean };

function read(key: string): LocalState {
  try {
    const raw = localStorage.getItem(key);
    const poll = raw === null ? null : parseStudioPoll(raw);
    const corrupt = raw !== null && !poll;
    return { poll, failed: corrupt, corrupt };
  } catch {
    return { poll: null, failed: true };
  }
}

/** 상위 패널은 계정과 공간이 바뀌면 새 key로 열린다. */
export function useStudioSpacePoll(key: string, voterId: string, voterName: string) {
  const [state, setState] = useState(() => read(key));
  const pending = useRef<StudioPoll | null>(null);
  const save = (poll: StudioPoll) => {
    try {
      localStorage.setItem(key, serializeStudioPoll(poll));
      pending.current = null;
      setState({ poll, failed: false });
    } catch {
      pending.current = poll;
      setState({ poll, failed: true });
    }
  };
  useEffect(() => {
    function sync(event: StorageEvent) {
      if ((!event.key || event.key === key) && !pending.current) setState(read(key));
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);

  const latest = () => pending.current ? { poll: pending.current, failed: false } : read(key);
  return {
    state,
    retry() {
      if (pending.current) save(pending.current);
      else setState(read(key));
    },
    keepCopyAndRestart() {
      if (!state.corrupt) return;
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null && !parseStudioPoll(raw)) {
          localStorage.setItem(`${key}:recovery:${crypto.randomUUID()}`, raw);
          localStorage.removeItem(key);
        }
        setState(read(key));
      } catch {
        setState(read(key));
      }
    },
    create(input: StudioPollDraft) {
      const current = latest();
      if (current.failed || current.poll?.id !== state.poll?.id || (current.poll && studioPollStatus(current.poll) === "open")) {
        setState(current);
        return;
      }
      const result = createStudioPoll({ ...input, createdBySessionId: voterId, createdByName: voterName });
      if (result.ok) save(result.poll);
    },
    vote(optionId: string) {
      const current = latest();
      if (!current.poll || current.poll.id !== state.poll?.id) { setState(current); return; }
      const result = castStudioPollVote(current.poll, { optionId, voterSessionId: voterId, voterName });
      if (result.ok) save(result.poll);
      else setState(current);
    },
    close() {
      const current = latest();
      if (current.poll?.createdBySessionId === voterId && current.poll.id === state.poll?.id) save(closeStudioPoll(current.poll));
      else setState(current);
    },
  };
}
