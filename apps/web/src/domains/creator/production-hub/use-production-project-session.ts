import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { getAuthSession, getAuthSessionRevision, listeners } from "@/domains/auth/public/session/auth-session-state";
import { getApiErrorMessage, httpStatus } from "@/platform/api";
import { executeProductionCommand, getProductionProject, recoverProductionCommand, type ProductionClientCommand, type ProductionProjectAccess, type ProductionProjectRecord } from "./production-api";
import { clearProductionCommandRecoveriesForActor, clearProductionCommandRecovery, loadProductionCommandRecovery, saveProductionCommandRecovery, type PendingProductionCommand } from "./production-command-recovery";
import { useT } from "@/shared/lib/i18n";
import { defineBilingualText } from "@/shared/lib/i18n-bilingual-copy";
import { ProductionCommandRevisionChangedError, type ProductionCommandExecutionOptions } from "./production-command-execution";

import type { ProductionDemoTranslate } from "./production-demo-adapter";

export type ProductionSaveState = "idle" | "saving" | "saved" | "error";
const subscribeToSession = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
const NO_ACCESS: ProductionProjectAccess = { view: false, comment: false, edit: false, manage: false, owner: false, role: null };
const DEMO_ACCESS: ProductionProjectAccess = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" };
const unconfirmedSaveKey = defineBilingualText("productionHub.session", "unconfirmedSave",
  "이전 저장의 응답을 확인하지 못했습니다. 최신 상태 확인으로 저장 결과를 복구한 뒤 다시 진행하세요.",
  "The previous save response could not be confirmed. Refresh the project to recover its result before continuing.");
const recoveredSaveKey = defineBilingualText("productionHub.session", "recoveredSave",
  "응답을 받지 못했던 저장 결과를 확인했습니다. 현재 상태를 확인한 뒤 남은 단계를 진행하세요.",
  "The unconfirmed save was recovered. Check the current state before continuing the remaining steps.");
const staleRecoveryReadKey = defineBilingualText("productionHub.session", "staleRecoveryRead",
  "확인된 저장보다 오래된 조회 응답입니다. 최신 상태를 다시 확인하세요.",
  "The project response is older than the confirmed save. Refresh the latest state again.");
const recoveryStorageFailedKey = defineBilingualText("productionHub.session", "recoveryStorageFailed",
  "이 저장 요청을 새로고침 복구 영역에 보관하지 못했습니다. 결과를 확인할 때까지 이 탭을 유지하세요.",
  "This save could not be preserved for reload recovery. Keep this tab open until its result is confirmed.");
const roleRecoveryBlockedKey = defineBilingualText("productionHub.session", "roleRecoveryBlocked",
  "참여 역할 요청을 기기 복구 영역에서 확인하지 못해 전송하지 않았습니다. 원래 입력을 유지하며 저장 상태 확인을 다시 진행하세요.",
  "The role request was not sent because its recovery record could not be verified. Keep the original input and check its save status again.");
const roleRevisionChangedKey = defineBilingualText("productionHub.session", "roleRevisionChanged",
  "참여 역할을 읽은 뒤 프로젝트가 갱신되어 전송하지 않았습니다. 현재 내용을 확인한 뒤 다시 저장하세요.",
  "The role request was not sent because the project changed after it was read. Review its current state before saving again.");
const roleManageDeniedKey = defineBilingualText("productionHub.session", "roleManageDenied",
  "참여 계정과 공정 역할을 관리할 권한이 없습니다.",
  "You do not have permission to manage participant accounts and production roles.");
const restoredSaveKey = defineBilingualText("productionHub.session", "restoredSave",
  "응답을 확인하지 못한 이전 저장 요청을 복원했습니다. 현재 권한을 확인했으며, 최신 상태 확인을 눌러 같은 요청의 저장 결과를 확인하세요.",
  "An unconfirmed save was restored and current access was checked. Refresh the project to confirm the result of the same request.");
function isUnconfirmedWrite(cause: unknown): boolean {
  const status = httpStatus(cause);
  return status == null || status === 408 || status >= 500;
}
interface Snapshot {
  readonly scope: string;
  readonly record: ProductionProjectRecord | null;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  readonly saveState: ProductionSaveState;
}
interface DemoAdapter {
  readonly create: () => ProductionProjectAggregate;
  readonly reduce: (current: ProductionProjectAggregate, command: ProductionClientCommand, translate?: ProductionDemoTranslate) => ProductionProjectAggregate;
}
export function useProductionProjectSession(projectId: string | undefined, actorId: string | null, demo: DemoAdapter) {
  const t = useT();
  const inputs = useRef({ t, demo });
  inputs.current = { t, demo };
  const demoTranslate: ProductionDemoTranslate = useCallback((key: string, fallback: string, values?: Readonly<Record<string, string | number>>) => values ? t(key, values, fallback) : t(key, fallback), [t]);
  const staleMessage = t("productionHub.session.stale", "계정이나 프로젝트가 변경되어 요청을 중지했습니다. 현재 화면에서 다시 시도하세요.");
  const isDemo = !projectId || projectId === "sample-project";
  const authRevision = useSyncExternalStore(subscribeToSession, getAuthSessionRevision, getAuthSessionRevision);
  const scope = JSON.stringify([projectId, actorId, authRevision]);
  const empty: Snapshot = { scope, record: null, loading: true, refreshing: false, error: null, notice: null, saveState: "idle" };
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const state = snapshot.scope === scope ? snapshot : empty;
  const authority = useRef<ProductionProjectRecord | null>(null);
  const authorityScope = useRef<string | null>(null);
  const generation = useRef(0), reads = useRef(0), pendingWrites = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const queueEpoch = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const unconfirmedWrite = useRef<PendingProductionCommand | null>(null);
  const recoveryStored = useRef(false);
  const previousActor = useRef(actorId);
  const previousProject = useRef(projectId);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    const epoch = ++generation.current;
    const translate = (key: string, fallback?: string) => inputs.current.t(key, fallback);
    const inMemory = getAuthSession()?.user.id === actorId && previousActor.current === actorId && previousProject.current === projectId ? unconfirmedWrite.current : null;
    if (previousActor.current && previousActor.current !== actorId) clearProductionCommandRecoveriesForActor(previousActor.current);
    previousActor.current = actorId;
    previousProject.current = projectId;
    authorityScope.current = scope;
    const current = () => generation.current === epoch && getAuthSessionRevision() === authRevision;
    const stored = !isDemo && actorId && projectId ? loadProductionCommandRecovery(actorId, projectId) : null;
    authority.current = null; unconfirmedWrite.current = stored ?? inMemory;
    recoveryStored.current = stored !== null;
    let checkRestoredAccess = unconfirmedWrite.current !== null;
    pendingWrites.current = 0; queueEpoch.current += 1; queue.current = Promise.resolve();
    if (isDemo) {
      const record = { aggregate: inputs.current.demo.create(), access: DEMO_ACCESS };
      authority.current = record;
      setSnapshot({ scope, record, loading: false, refreshing: false, error: null, notice: null, saveState: "idle" });
      return () => { generation.current += 1; authority.current = null; };
    }
    setSnapshot({ scope, record: null, loading: Boolean(actorId), refreshing: false,
      error: actorId ? null : "로그인 후 제작 프로젝트를 열어 주세요.", notice: null, saveState: "idle" });
    if (!actorId || !projectId) return () => { generation.current += 1; };
    const clearRecovery = () => { unconfirmedWrite.current = null; recoveryStored.current = false; clearProductionCommandRecovery(actorId, projectId); };
    const refresh = async (explicit = false) => {
      if (!current() || pendingWrites.current > 0) return;
      const sequence = ++reads.current;
      const recovery = unconfirmedWrite.current;
      let recovered = recovery?.confirmedRevision != null;
      const holdRoleRecovery = !explicit && recovery?.confirmedRevision === null && recovery.command !== null
        && typeof recovery.command === "object" && "type" in recovery.command && recovery.command.type === "configure-collaboration";
      // 원래 본문·버전·식별자로만 재전송하여 서버 영수증과 정확히 일치시킨다.
      if (recovery) pendingWrites.current += 1;
      setSnapshot((value) => value.scope === scope ? { ...value, refreshing: true } : value);
      try {
        if (recovery && !checkRestoredAccess && !holdRoleRecovery && recovery.confirmedRevision == null) {
          try {
            if (actorId && recovery.command !== null && typeof recovery.command === "object" && "type" in recovery.command
              && recovery.command.type === "configure-collaboration") {
              recoveryStored.current = saveProductionCommandRecovery(actorId, projectId, recovery);
              if (!recoveryStored.current) throw new Error(translate(roleRecoveryBlockedKey));
            }
            const response = await recoverProductionCommand(projectId, recovery);
            if (!current()) return;
            if (response.aggregate.projectId !== projectId || response.aggregate.revision <= recovery.expectedRevision) throw new Error("저장 응답의 프로젝트나 버전을 확인하지 못했습니다.");
            unconfirmedWrite.current = { ...recovery, confirmedRevision: response.aggregate.revision };
            recoveryStored.current = saveProductionCommandRecovery(actorId, projectId, unconfirmedWrite.current);
            recovered = true;
          } catch (cause) {
            if (!current()) return;
            if (isUnconfirmedWrite(cause)) throw cause;
            clearRecovery();
            if ([401, 403, 404].includes(httpStatus(cause) ?? 0)) throw cause;
            // 확정 거부된 요청은 새 버전으로 바꿔 재실행하지 않고 최신 상태만 읽는다.
          }
        }
        const record = await getProductionProject(projectId);
        if (!current() || sequence !== reads.current) return;
        if (record.aggregate.projectId !== projectId || !record.access.view) { authority.current = null; throw new Error("프로젝트 접근 정보를 확인하지 못했습니다."); }
        const confirmedRevision = unconfirmedWrite.current?.confirmedRevision;
        if (confirmedRevision != null && record.aggregate.revision < confirmedRevision) throw new Error(translate(staleRecoveryReadKey));
        if (authority.current && record.aggregate.revision < authority.current.aggregate.revision) return;
        authority.current = record;
        // 자동 갱신은 현재 상태만 읽는다. 역할 원문의 재전송은 명시적인 저장 상태 확인에 한정한다.
        if ((checkRestoredAccess || holdRoleRecovery) && recovery && recovery.confirmedRevision === null) {
          const notice = checkRestoredAccess ? translate(restoredSaveKey) : translate(unconfirmedSaveKey);
          checkRestoredAccess = false;
          setSnapshot((value) => ({ ...value, scope, record, loading: false, refreshing: false, error: null,
            saveState: "error", notice: `${notice}${recoveryStored.current ? "" : ` ${translate(recoveryStorageFailedKey)}`}` }));
          return;
        }
        clearRecovery();
        setSnapshot((value) => ({ ...value, scope, record, loading: false, refreshing: false, error: null,
          saveState: value.saveState === "error" ? "idle" : value.saveState,
          notice: recovered ? translate(recoveredSaveKey) : value.saveState === "error" ? translate("productionHub.session.recoveredNotice", "최신 상태를 불러왔습니다. 저장 실패했던 입력은 확인 후 다시 저장해 주세요.") : value.notice }));
      } catch (cause) {
        const message = await getApiErrorMessage(cause, translate("productionHub.session.loadLatestFailed", "최신 프로젝트를 불러오지 못했습니다. 다시 시도해 주세요."));
        if (!current() || sequence !== reads.current) return;
        if ([401, 403, 404].includes(httpStatus(cause) ?? 0)) authority.current = null;
        if ([401, 403, 404].includes(httpStatus(cause) ?? 0)) clearRecovery();
        setSnapshot((value) => ({ ...value, scope, record: authority.current, loading: false,
          refreshing: false, error: authority.current ? null : message,
          notice: `${recovered ? `${translate(recoveredSaveKey)} ${message}` : unconfirmedWrite.current ? `${message} ${translate(unconfirmedSaveKey)}` : message}${unconfirmedWrite.current && !recoveryStored.current ? ` ${translate(recoveryStorageFailedKey)}` : ""}`, saveState: "error" }));
      } finally {
        if (current() && recovery) pendingWrites.current = Math.max(0, pendingWrites.current - 1);
        if (current() && sequence === reads.current) setSnapshot((value) => ({ ...value, refreshing: false }));
      }
    };
    refreshRef.current = () => refresh(true);
    const warn = (event: BeforeUnloadEvent) => {
      if (!unconfirmedWrite.current || recoveryStored.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    const onWake = () => { if (document.visibilityState !== "hidden" && navigator.onLine !== false) void refresh(); };
    window.addEventListener("online", onWake); window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const timer = window.setInterval(onWake, 30_000);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel.current = new BroadcastChannel("toonstudio-production-projects-v1");
        channel.current.onmessage = (event: MessageEvent<unknown>) => {
          const value = event.data;
          if (value && typeof value === "object" && "projectId" in value && value.projectId === projectId) onWake();
        };
      }
    } catch { /* 교차 탭 채널을 사용할 수 없어도 재접속·주기적 조회로 갱신한다. */ }
    void refresh();
    return () => {
      generation.current += 1; reads.current += 1; authority.current = null;
      window.clearInterval(timer); window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake); document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("beforeunload", warn);
      channel.current?.close(); channel.current = null;
    };
  }, [scope, projectId, actorId, authRevision, isDemo]);
  const queueCommand = useCallback((command: ProductionClientCommand, message: string, strict: boolean, options?: ProductionCommandExecutionOptions): Promise<void> => {
    const capturedCommand = command.type === "configure-collaboration" ? structuredClone(command) : command;
    const requestedRevision = options?.expectedRevision;
    const epoch = generation.current, session = getAuthSessionRevision(), batch = queueEpoch.current;
    const current = () => authorityScope.current === scope && generation.current === epoch && getAuthSessionRevision() === session && session === authRevision;
    const run = async () => {
      if (!current()) { if (strict) throw new Error(staleMessage); return; }
      if (batch !== queueEpoch.current) { if (strict) throw new Error(t("productionHub.session.previousSaveFailed", "이전 저장이 실패하여 대기 중인 변경을 적용하지 않았습니다. 최신 내용을 확인한 뒤 다시 저장하세요.")); return; }
      if (unconfirmedWrite.current || pendingWrites.current > 0) { if (strict) throw new Error(t(unconfirmedSaveKey)); return; }
      const record = authority.current;
      if (!record || (!isDemo && record.aggregate.projectId !== projectId)) {
        if (strict) throw new Error(t("productionHub.session.noProjectToSave", "저장할 프로젝트가 없습니다. 다시 불러온 뒤 시도하세요."));
        return;
      }
      if (!record.access.view || (!record.access.edit && !record.access.comment && !record.access.manage)) {
        if (strict) throw new Error(t("productionHub.session.noChangePermission", "프로젝트 변경 권한이 없습니다."));
        return;
      }
      if (capturedCommand.type === "configure-collaboration" && !record.access.manage) {
        if (strict) throw new Error(t(roleManageDeniedKey));
        return;
      }
      if (!isDemo && capturedCommand.type === "configure-collaboration"
        && (!Number.isSafeInteger(requestedRevision) || requestedRevision !== record.aggregate.revision)) {
        throw new ProductionCommandRevisionChangedError(t(roleRevisionChangedKey));
      }
      const mutationCommand = structuredClone(capturedCommand);
      const mutation: PendingProductionCommand = { mutationId: globalThis.crypto.randomUUID(), expectedRevision: record.aggregate.revision, command: mutationCommand, confirmedRevision: null, queuedAt: Date.now() };
      if (!isDemo && actorId && projectId) {
        unconfirmedWrite.current = mutation;
        recoveryStored.current = saveProductionCommandRecovery(actorId, projectId, mutation);
      }
      if (!isDemo && mutationCommand.type === "configure-collaboration" && !recoveryStored.current) {
        setSnapshot((value) => ({ ...value, saveState: "error", notice: t(roleRecoveryBlockedKey), refreshing: false }));
        if (strict) throw new Error(t(roleRecoveryBlockedKey));
        return;
      }
      pendingWrites.current += 1; reads.current += 1;
      setSnapshot((value) => ({ ...value, saveState: "saving", notice: !isDemo && !recoveryStored.current ? t(recoveryStorageFailedKey) : null, refreshing: false }));
      try {
        const next = isDemo ? demo.reduce(record.aggregate, capturedCommand, demoTranslate)
          : (await executeProductionCommand(record.aggregate.projectId, mutation.expectedRevision, mutationCommand, mutation.mutationId)).aggregate;
        if (!current()) throw new Error(staleMessage);
        if (next.projectId !== record.aggregate.projectId || next.revision < record.aggregate.revision) throw new Error("저장 응답의 프로젝트나 버전을 확인하지 못했습니다.");
        authority.current = { aggregate: next, access: record.access };
        unconfirmedWrite.current = null; recoveryStored.current = false;
        if (!isDemo && actorId && projectId) clearProductionCommandRecovery(actorId, projectId);
        setSnapshot((value) => ({ ...value, record: authority.current, saveState: "saved", notice: message }));
        try { channel.current?.postMessage({ projectId: next.projectId, revision: next.revision }); }
        catch { /* 저장 성공은 유지하고 다른 탭은 주기적 재조회로 확인한다. */ }
      } catch (cause) {
        if (current()) queueEpoch.current += 1;
        let failure = await getApiErrorMessage(cause, "변경 내용을 저장하지 못했습니다.");
        if (!current()) { if (strict) throw new Error(staleMessage, { cause }); return; }
        if (!isDemo && isUnconfirmedWrite(cause)) {
          unconfirmedWrite.current = mutation;
          failure += ` ${t(unconfirmedSaveKey)}`;
          if (!recoveryStored.current) failure += ` ${t(recoveryStorageFailedKey)}`;
        } else if (!isDemo && actorId && projectId) {
          unconfirmedWrite.current = null; recoveryStored.current = false;
          clearProductionCommandRecovery(actorId, projectId);
        }
        if (!isDemo && httpStatus(cause) === 409) {
          try {
            const latest = await getProductionProject(record.aggregate.projectId);
            if (!current()) throw new Error(staleMessage, { cause });
            if (latest.aggregate.projectId !== projectId || !latest.access.view) { authority.current = null; throw new Error("프로젝트 접근 정보가 변경되었습니다.", { cause }); }
            authority.current = latest;
            failure += " 최신 상태를 불러왔습니다. 편집 내용을 확인한 뒤 다시 저장하세요.";
          } catch (refreshError) {
            if ([401, 403, 404].includes(httpStatus(refreshError) ?? 0)) authority.current = null;
            failure += ` ${t("productionHub.session.refreshFailed", "최신 상태를 불러오지 못했습니다. 새로고침이 필요합니다.")}`;
          }
        }
        if (!current()) { if (strict) throw new Error(staleMessage, { cause }); return; }
        if ([401, 403, 404].includes(httpStatus(cause) ?? 0)) authority.current = null;
        setSnapshot((value) => ({ ...value, record: authority.current, saveState: "error", notice: failure,
          error: authority.current ? null : failure }));
        if (strict) throw new Error(failure, { cause });
      } finally { if (current()) pendingWrites.current = Math.max(0, pendingWrites.current - 1); }
    };
    const operation = queue.current.then(run, run);
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [scope, authRevision, isDemo, projectId, actorId, demo, demoTranslate, staleMessage, t]);
  const execute = useCallback((command: ProductionClientCommand, message: string) => queueCommand(command, message, false), [queueCommand]);
  const executeStrict = useCallback((command: ProductionClientCommand, message: string, options?: ProductionCommandExecutionOptions) => queueCommand(command, message, true, options), [queueCommand]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { aggregate: state.record?.aggregate ?? null, access: state.record?.access ?? NO_ACCESS,
    loading: state.loading, error: state.error, saveState: state.saveState, notice: state.notice,
    refreshing: state.refreshing, refresh, execute, executeStrict, isDemo,
    hasUnconfirmedCommand: !isDemo && state.scope === scope && unconfirmedWrite.current !== null };
}
