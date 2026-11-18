import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { getAuthUserId, useSession } from "@/domains/auth/public/session/auth-session-store";
import { getGuestIdentity, isGuestIdentityPersisted, startGuestSession, useGuestSession } from "@/domains/auth/public/session/guest-session";
import { accessWorkstationNotebook, mergeWorkstationMarks, type WorkstationMark } from "./studio-workstation-notebook";

export interface WorkstationSpace { readonly id: string; readonly personal: boolean }
export const WorkstationSpaceContext = createContext<WorkstationSpace | null>(null);

export function useWorkstationOwner(station: string) {
  const space = useContext(WorkstationSpaceContext);
  const session = useSession();
  const { guest } = useGuestSession();
  const account = session.data?.user.id ?? null;
  const [identityFailed, setIdentityFailed] = useState(false);
  useEffect(() => {
    if (session.ready && !account && space?.personal && !guest) {
      try { startGuestSession(); } catch { setIdentityFailed(true); }
    }
  }, [account, guest, session.ready, space?.personal]);
  const guestId = !account && space?.personal && guest && isGuestIdentityPersisted(guest.id) ? guest.id : null;
  const key = space && session.ready && (account || guestId)
    ? JSON.stringify([account ? "account" : "guest", account ?? guestId, space.id, station]) : null;
  return { key, waiting: Boolean(space && (!session.ready || (!account && space.personal && !guest && !identityFailed))),
    current: () => getAuthUserId() === account && (account !== null || (guestId !== null && getGuestIdentity()?.id === guestId && isGuestIdentityPersisted(guestId))) };
}

type Status = "local" | "loading" | "ready" | "saving" | "read-error" | "write-error";

export function useWorkstationNotebook(key: string | null, currentOwner: () => boolean) {
  const [marks, setMarks] = useState<readonly WorkstationMark[]>([]);
  const [status, setStatus] = useState<Status>(key ? "loading" : "local");
  const owner = useRef(currentOwner);
  owner.current = currentOwner;
  const pending = useRef<WorkstationMark[]>([]);
  const generation = useRef(0);
  const mounted = useRef(false);
  const sync = useCallback((retry = false) => {
    if (!key) return;
    const batch = pending.current.slice();
    const serial = ++generation.current;
    setStatus(batch.length ? "saving" : "loading");
    void accessWorkstationNotebook(key, batch, () => owner.current(), retry).then(saved => {
      if (serial !== generation.current || !mounted.current) return;
      pending.current = [];
      setMarks(saved);
      setStatus("ready");
    }, () => {
      if (serial === generation.current && mounted.current) setStatus(batch.length ? "write-error" : "read-error");
    });
  }, [key]);
  useEffect(() => {
    mounted.current = true;
    sync();
    return () => { mounted.current = false; };
    // 상위 컴포넌트가 기기 사용자·공간·스테이션 키 변경마다 이 노트를 새로 마운트한다.
  }, [sync]);
  const append = (entry: WorkstationMark) => {
    if (key && (!owner.current() || status === "loading" || status === "read-error")) return;
    setMarks(previous => mergeWorkstationMarks(previous, [entry]));
    if (!key) return;
    pending.current.push(entry);
    sync();
  };
  return { marks, status, append, retry: () => sync(true) };
}
