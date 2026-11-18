import { createAdminWorkspace, createOperationsWorkspace, parseAdminWorkspace, validateWorkspaceTransition } from "@toonstudio/contracts/admin-workspace";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminApiError } from "../../platform/http/admin-api";
import { exportAdminWorkspace, loadAdminWorkspace, saveAdminWorkspace } from "../../platform/http/workspace-api";

import type { AdminWorkspace, AdminWorkspaceAccess, AdminWorkspaceSave, AdminWorkspaceScope } from "@toonstudio/contracts/admin-workspace";

export interface WorkspaceActor { id: string; role: "admin" | "operator" }
type Phase = "loading" | "ready" | "error" | "denied";
interface WorkspaceSession {
  phase: Phase; state: AdminWorkspace | null; revision: number; updatedAt: string | null;
  scope: AdminWorkspaceScope; access: AdminWorkspaceAccess | null;
  hasPersistedState: boolean;
  serverCanEdit: boolean; dirty: boolean; saving: boolean; loading: boolean; conflict: boolean; error: string; notice: string;
}
const initial: WorkspaceSession = {
  phase: "loading", state: null, revision: 0, updatedAt: null, serverCanEdit: false,
  scope: "operations", access: null,
  hasPersistedState: false,
  dirty: false, saving: false, loading: true, conflict: false, error: "", notice: "",
};

export function workspaceId(prefix: string): string {
  return prefix + "-" + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
}

function failureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "연결을 확인한 후 다시 시도해 주세요.";
}

export function useAdminWorkspace(actor: WorkspaceActor) {
  const [session, setSession] = useState<WorkspaceSession>(initial);
  const [now, setNow] = useState(() => new Date());
  const current = useRef(session);
  const pending = useRef<AdminWorkspaceSave | null>(null);
  const active = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const inFlight = useRef(false);
  const operation = useRef(0);

  const update = useCallback((change: Partial<WorkspaceSession>) => {
    current.current = { ...current.current, ...change };
    setSession(current.current);
  }, []);

  const reload = useCallback(async (scope: AdminWorkspaceScope = current.current.scope): Promise<boolean> => {
    if (inFlight.current) return false;
    const controller = new AbortController();
    requests.current.add(controller);
    inFlight.current = true;
    const token = ++operation.current;
    update({ loading: true, error: "" });
    try {
      const result = await loadAdminWorkspace(controller.signal, scope);
      if (!active.current || controller.signal.aborted) return false;
      pending.current = null;
      update({
        phase: "ready", state: result.state ?? (scope === "business" ? createAdminWorkspace() : createOperationsWorkspace()), revision: result.revision,
        scope: result.scope, access: result.access,
        hasPersistedState: result.state !== null,
        updatedAt: result.updatedAt, serverCanEdit: result.canEdit, dirty: false, saving: false, loading: false,
        conflict: false, error: "", notice: result.state ? "공유 저장본을 불러왔습니다." : "일반 초기 템플릿입니다. 근거와 원문을 등록한 뒤 저장하세요.",
      });
      return true;
    } catch (cause) {
      if (!active.current || controller.signal.aborted) return false;
      const denied = cause instanceof AdminApiError && [401, 403].includes(cause.status);
      if (denied) pending.current = null;
      update({ phase: denied ? "denied" : current.current.state ? "ready" : "error", loading: false, error: failureMessage(cause) });
      if (denied) update({ state: null, access: null, serverCanEdit: false, dirty: false, conflict: false });
      return false;
    } finally {
      requests.current.delete(controller);
      if (operation.current === token) inFlight.current = false;
    }
  }, [update]);

  useEffect(() => {
    active.current = true;
    void reload();
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    const controllers = requests.current;
    return () => {
      active.current = false;
      operation.current += 1;
      inFlight.current = false;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      window.clearInterval(timer);
    };
  }, [reload]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!current.current.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const send = useCallback(async (input: AdminWorkspaceSave, message: string): Promise<string | null> => {
    if (inFlight.current) return "이전 저장을 마친 뒤 다시 시도해 주세요.";
    const controller = new AbortController();
    requests.current.add(controller);
    inFlight.current = true;
    const token = ++operation.current;
    update({ saving: true, error: "", notice: "공유 기록을 저장하고 있습니다." });
    try {
      const saved = await saveAdminWorkspace(input, controller.signal);
      if (!active.current || controller.signal.aborted) return "화면이 바뀌어 저장 결과를 적용하지 않았습니다.";
      pending.current = null;
      update({ revision: saved.revision, updatedAt: saved.updatedAt, dirty: false, saving: false, conflict: false, hasPersistedState: true, error: "", notice: message });
      setNow(new Date());
      return null;
    } catch (cause) {
      if (!active.current || controller.signal.aborted) return "요청을 중단했습니다.";
      const conflict = cause instanceof AdminApiError && cause.status === 409;
      const denied = cause instanceof AdminApiError && [401, 403].includes(cause.status);
      if (denied) pending.current = null;
      const error = conflict
        ? "다른 관리자가 먼저 저장했습니다. 현재 편집은 유지했습니다. 백업 후 최신 저장본을 불러와 차이를 검토하세요."
        : "저장 결과를 확인하지 못했습니다. 현재 편집은 이 화면에 유지됩니다. " + failureMessage(cause);
      update({ phase: denied ? "denied" : "ready", dirty: true, saving: false, conflict, error, notice: "" });
      if (denied) update({ state: null, access: null, serverCanEdit: false, dirty: false, conflict: false });
      return error;
    } finally {
      requests.current.delete(controller);
      if (operation.current === token) inFlight.current = false;
    }
  }, [update]);

  const commit = useCallback(async (next: AdminWorkspace, message: string): Promise<string | null> => {
    const previous = current.current;
    if ((actor.role !== "admin" && previous.scope === "operations") || !previous.serverCanEdit || previous.phase !== "ready") return "관리자 편집 권한을 확인해 주세요.";
    if (inFlight.current) return "이전 저장을 마친 뒤 다시 시도해 주세요.";
    if (previous.conflict) return "현재 편집을 백업한 뒤 최신 저장본을 먼저 불러와 주세요.";
    if (previous.dirty) return "미저장 변경을 먼저 재시도하거나 백업 후 최신 기록을 불러와 주세요.";
    if (typeof globalThis.crypto?.randomUUID !== "function") return "안전한 저장 식별자를 만들 수 없습니다. HTTPS 관리자 화면에서 다시 시도해 주세요.";
    const parsed = parseAdminWorkspace(next);
    if (!parsed.ok) return parsed.errors.join("\n");
    const errors = validateWorkspaceTransition(previous.hasPersistedState ? previous.state : null, parsed.value);
    if (errors.length) return errors.join("\n");
    const input: AdminWorkspaceSave = { expectedRevision: previous.revision, mutationId: globalThis.crypto.randomUUID(), scope: previous.scope, state: parsed.value };
    pending.current = input;
    update({ state: parsed.value, dirty: true });
    return send(input, message);
  }, [actor.role, send, update]);

  const retry = useCallback(async (): Promise<string | null> => {
    if ((actor.role !== "admin" && current.current.scope === "operations") || !current.current.serverCanEdit || current.current.phase !== "ready") return "관리자 편집 권한을 확인해 주세요.";
    if (current.current.conflict) return "충돌한 기록을 백업하고 최신 내용을 먼저 확인하세요.";
    if (!pending.current) return null;
    return send(pending.current, "대기 중이던 변경을 저장했습니다.");
  }, [actor.role, send]);

  const authorizeExport = useCallback(async (): Promise<boolean> => {
    const snapshot = current.current;
    if (snapshot.phase !== "ready" || !snapshot.access?.[snapshot.scope].canExport || inFlight.current) return false;
    const controller = new AbortController();
    requests.current.add(controller);
    inFlight.current = true;
    const token = ++operation.current;
    update({ loading: true });
    try {
      const view = await exportAdminWorkspace(snapshot.scope, controller.signal);
      if (!active.current || controller.signal.aborted || view.scope !== snapshot.scope || !view.access[view.scope].canExport) return false;
      update({ access: view.access, serverCanEdit: view.canEdit, error: "" });
      return true;
    } catch (cause) {
      if (!active.current || controller.signal.aborted) return false;
      const denied = cause instanceof AdminApiError && [401, 403].includes(cause.status);
      if (denied) {
        pending.current = null;
        update({ phase: "denied", state: null, access: null, serverCanEdit: false, dirty: false, conflict: false });
      }
      update({ error: failureMessage(cause) });
      return false;
    } finally {
      requests.current.delete(controller);
      if (operation.current === token) {
        inFlight.current = false;
        if (active.current) update({ loading: false });
      }
    }
  }, [update]);

  const claimArchive = useCallback(async (): Promise<string | null> => {
    if (actor.role !== "admin" || inFlight.current || current.current.dirty) return "편집을 마친 뒤 관리자 계정으로 비공개 보관함을 만드세요.";
    if (typeof globalThis.crypto?.randomUUID !== "function") return "안전한 저장 식별자를 만들 수 없습니다.";
    const controller = new AbortController(); requests.current.add(controller); inFlight.current = true;
    const token = ++operation.current;
    update({ saving: true, error: "" });
    try {
      await saveAdminWorkspace({ scope: "business", claimBusinessOwnership: true, expectedRevision: 0, mutationId: crypto.randomUUID(), state: createOperationsWorkspace() }, controller.signal);
      if (!active.current || controller.signal.aborted) return "보관함 확인을 중단했습니다.";
    } catch (cause) {
      if (!active.current || controller.signal.aborted) return "보관함 확인을 중단했습니다.";
      const message = "보관함 생성 결과를 확인하지 못했습니다. 기존 비공개 자료는 변경하지 않았습니다. 최신 기록에서 권한을 다시 확인하세요. " + failureMessage(cause);
      update({ error: message });
      return message;
    } finally {
      requests.current.delete(controller);
      if (operation.current === token) {
        inFlight.current = false;
        if (active.current) update({ saving: false });
      }
    }
    return await reload("business") ? null : current.current.error;
  }, [actor.role, reload, update]);

  return {
    ...session, now, commit, retry, reload, authorizeExport, claimArchive,
    canExport: session.phase === "ready" && Boolean(session.access?.[session.scope].canExport) && !session.loading && !session.saving,
    canEdit: (actor.role === "admin" || session.scope === "business") && session.serverCanEdit && session.phase === "ready" && !session.saving && !session.loading && !session.conflict && !session.dirty,
  };
}
