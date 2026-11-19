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
  private checkpoint: StudioDecorationCheckpoint | null = null;
  private hydration?: Promise<void>;
  private unsaved: StudioVirtualDecorationState | null = null;
  private durableId: string | null = null;

  constructor(private readonly scope: string, private readonly sync: DecorationSync | null, owner?: string | null) {
    this.store = owner !== undefined ? studioDecorationCheckpointStore(owner, scope) : null;
  }

  private hydrate(): Promise<void> {
    if (!this.store) return Promise.resolve();
    this.hydration ??= this.store.read().then(saved => {
      this.checkpoint = saved;
      this.base = saved?.base ?? null;
      this.durableId = saved?.id === "legacy-device" ? null : saved?.id ?? null;
    }).catch(reason => { this.hydration = undefined; throw reason; });
    return this.hydration;
  }

  get editCount(): number { return this.edit; }
  get cachedState() { return this.unsaved ?? this.checkpoint?.state; }
  get hasPendingDraft() { return this.unsaved !== null || this.checkpoint?.pending === true; }
  get hasConflict() { return Boolean(this.conflict?.current); }
  get cachedLocally() { return !this.store || !this.unsaved && (this.checkpoint?.id === "legacy-device" || this.durableId !== null && this.durableId === this.checkpoint?.id); }

  /** 로그아웃·범위 변경 뒤 남은 요청이 새 계정의 쿠키로 출발하지 않게 한다. */
  cancelPending(): void { this.lifetime += 1; }

  private async record(state: StudioVirtualDecorationState, pending: boolean, owned = false) {
    const expected = this.checkpoint?.id ?? null;
    const checkpoint = { state, pending, base: this.base, id: crypto.randomUUID() };
    this.checkpoint = checkpoint;
    if (this.store && await this.store.write(checkpoint, owned ? expected : undefined)) this.durableId = checkpoint.id;
  }

  private async accept(result: StudioVirtualDecorationSyncResult, generation: number) {
    if (result.status === "server") {
      this.base = result.state.revision;
      this.conflict = null;
      if (generation === this.edit) await this.record(result.state, false, true);
      else if (this.checkpoint) await this.record(this.checkpoint.state, true, true);
    } else if (result.status === "conflict") {
      this.conflict = result;
    }
    return result;
  }

  load(local: StudioVirtualDecorationState): Promise<StudioVirtualDecorationSyncResult> {
    const lifetime = this.lifetime;
    const generation = this.edit;
    const restored = this.hydrate().then(async () => {
      if (this.lifetime === lifetime && this.unsaved) {
        const state = this.unsaved;
        this.unsaved = null;
        await this.record(state, Boolean(this.sync));
      } else if (this.store && this.checkpoint && this.checkpoint.id !== "legacy-device" && !this.cachedLocally) {
        const draft = this.checkpoint;
        if (await this.store.write(draft, this.durableId)) this.durableId = draft.id;
      }
      return { draft: this.checkpoint };
    }, () => null);
    const pending = this.queue.then(async (): Promise<StudioVirtualDecorationSyncResult> => {
      const before = await restored;
      if (!before) return { status: "local", state: this.cachedState ?? local };
      const draft = this.edit === generation ? this.checkpoint : before.draft;
      const state = draft?.state ?? local;
      if (this.lifetime !== lifetime || !this.sync) return { status: "local", state };
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
      if (this.edit === generation) await this.record(latest.revision ? latest : state, false, true);
      return result;
    });
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  save(next: StudioVirtualDecorationState): Promise<StudioVirtualDecorationSyncResult> {
    const generation = ++this.edit;
    const lifetime = this.lifetime;
    const recorded = this.hydrate().then(async () => {
      this.unsaved = null;
      await this.record(next, Boolean(this.sync));
      return true;
    }, () => { if (generation === this.edit) this.unsaved = next; return false; });
    const pending = this.queue.then(async (): Promise<StudioVirtualDecorationSyncResult> => {
      if (!await recorded || this.lifetime !== lifetime || !this.sync) return { status: "local", state: next };
      if (this.conflict) return { ...this.conflict, state: next };
      const result = await this.sync.save(this.scope, next.districtKey, next, this.base ?? 0);
      return this.lifetime === lifetime ? this.accept(result, generation) : { status: "local", state: next };
    });
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  resolveConflict(choice: "device" | "server"): Promise<StudioVirtualDecorationSyncResult> | undefined {
    const server = this.conflict?.current;
    if (!server || !this.checkpoint) return;
    this.conflict = null;
    this.base = server.revision;
    if (choice === "device") return this.save(this.checkpoint.state);
    ++this.edit;
    return this.record(server, false).then(() => ({ status: "server", state: server }));
  }
}
