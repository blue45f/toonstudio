import { parseStudioVirtualDecorationState, type StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { studioDecorationCheckpointStore, type StudioDecorationCheckpoint } from "./studio-virtual-space-decoration-checkpoint";
import type { createStudioVirtualDecorationSync, StudioVirtualDecorationSyncResult } from "./studio-virtual-space-decoration-sync";

type DecorationSync = ReturnType<typeof createStudioVirtualDecorationSync>;

function sameLayout(left: StudioVirtualDecorationState, right: StudioVirtualDecorationState) {
  const normalized = (state: StudioVirtualDecorationState) => parseStudioVirtualDecorationState({
    ...state, revision: 0, layoutWidth: state.layoutWidth ?? 1280, layoutHeight: state.layoutHeight ?? 960,
  });
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

/** 한 공간의 편집을 순서대로 저장한다. 화면의 실행 취소 번호와 DB 행의 버전은 독립적이다. */
export class StudioVirtualDecorationSession {
  private queue: Promise<void> = Promise.resolve();
  private base: number | null = null;
  private conflict: StudioVirtualDecorationSyncResult | null = null;
  private edit = 0;
  private lifetime = 0;
  private readonly store;
  private checkpoint: StudioDecorationCheckpoint | null;
  readonly initialState: StudioVirtualDecorationState | undefined;

  constructor(private readonly scope: string, private readonly sync: DecorationSync, owner?: string) {
    this.store = owner ? studioDecorationCheckpointStore(owner, scope) : null;
    this.checkpoint = this.store?.read() ?? null;
    this.initialState = this.checkpoint?.state;
    this.base = this.checkpoint?.base ?? null;
  }

  get editCount(): number { return this.edit; }
  get cachedState() { return this.checkpoint?.state; }
  get hasPendingDraft() { return this.checkpoint?.pending === true; }
  get hasConflict() { return Boolean(this.conflict?.current); }
  get cachedLocally() { return !this.store || this.store.read()?.id === this.checkpoint?.id; }

  /** 로그아웃·범위 변경 뒤 남은 요청이 새 계정의 쿠키로 출발하지 않게 한다. */
  cancelPending(): void { this.lifetime += 1; }

  private record(state: StudioVirtualDecorationState, pending: boolean, owned = false) {
    // 이전 요청의 늦은 응답이 다른 탭에서 저장한 새 초안을 지우지 않는다.
    const persist = !owned || !this.store || this.store.read()?.id === this.checkpoint?.id;
    this.checkpoint = { state, pending, base: this.base, id: crypto.randomUUID() };
    if (persist) this.store?.write(this.checkpoint);
  }

  private accept(result: StudioVirtualDecorationSyncResult, generation: number) {
    if (result.status === "server") {
      this.base = result.state.revision;
      this.conflict = null;
      if (generation === this.edit) this.record(result.state, false, true);
      else if (this.checkpoint) this.record(this.checkpoint.state, true, true);
    } else if (result.status === "conflict") {
      this.conflict = result;
    }
    return result;
  }

  load(local: StudioVirtualDecorationState): Promise<StudioVirtualDecorationSyncResult> {
    const lifetime = this.lifetime;
    const generation = this.edit;
    const before = this.checkpoint;
    const pending = this.queue.then(async (): Promise<StudioVirtualDecorationSyncResult> => {
      const draft = this.edit === generation ? this.checkpoint : before;
      const state = draft?.state ?? local;
      if (this.lifetime !== lifetime) return { status: "local", state };
      const result = await this.sync.load(this.scope, state.districtKey, true);
      if (this.lifetime !== lifetime || result.status !== "server") return { status: "local", state };
      const latest = result.state;
      if (draft?.pending) {
        if (sameLayout(draft.state, latest)) return this.accept(result, generation);
        if ((draft.base ?? 0) !== latest.revision) {
          this.conflict = { status: "conflict", state: draft.state, current: latest };
          return this.conflict;
        }
        if (this.edit !== generation) return { status: "local", state };
        const saved = await this.sync.save(this.scope, state.districtKey, state, draft.base ?? 0);
        return this.lifetime === lifetime ? this.accept(saved, generation) : { status: "local", state };
      }
      if (this.edit !== generation && latest.revision > 0 && latest.revision !== (this.base ?? local.revision)) {
        this.conflict = { status: "conflict", state, current: latest };
        return this.conflict;
      }
      this.base = latest.revision;
      if (this.edit === generation) this.record(latest.revision ? latest : state, false, true);
      return result;
    });
    this.queue = pending.then(() => undefined);
    return pending;
  }

  save(next: StudioVirtualDecorationState): Promise<StudioVirtualDecorationSyncResult> {
    const generation = ++this.edit;
    const lifetime = this.lifetime;
    this.record(next, true);
    const pending = this.queue.then(async (): Promise<StudioVirtualDecorationSyncResult> => {
      if (this.lifetime !== lifetime) return { status: "local", state: next };
      if (this.conflict) return { ...this.conflict, state: next };
      const result = await this.sync.save(this.scope, next.districtKey, next, this.base ?? 0);
      return this.lifetime === lifetime ? this.accept(result, generation) : { status: "local", state: next };
    });
    this.queue = pending.then(() => undefined);
    return pending;
  }

  resolveConflict(choice: "device" | "server"): Promise<StudioVirtualDecorationSyncResult> | undefined {
    const server = this.conflict?.current;
    if (!server || !this.checkpoint) return;
    this.conflict = null;
    this.base = server.revision;
    if (choice === "device") return this.save(this.checkpoint.state);
    ++this.edit;
    this.record(server, false);
    return Promise.resolve({ status: "server", state: server });
  }
}
