/**
 * 썸네일 스케줄러: 직렬 큐(동시 1개)로 engine.renderThumbnail을 호출하고 결과를 store에 반영한다.
 * 가시 카드 우선, 같은 cacheKey 중복 제거, 실패는 ThumbnailEntry.failed(reasonKo)로 노출한다.
 * 지오메트리 프리셋은 엔진이 `thumbnailSources`를 지원할 때 프리셋을 적용한 임시 소스(`sourceFor`)와 함께 요청한다.
 *
 * 다시 그리는 동안의 표시(stale-while-revalidate): 이미 그려진(ready) 카드를 새 cacheKey로 다시 요청하면 새 그림이 나올 때까지 옛 그림을 그대로 둔다
 * (`pending`으로 바꾸면 슬라이더를 움직일 때마다 카드 그림이 "생성 중" 글자로 사라졌다). 처음 그리는 카드·실패한 카드만 `pending`이다.
 *
 * 메인 스레드 양보(`pacing`, 셸 런타임이 켠다): 반응성 결함 P-01(2026-10-23 실측: 슬라이더 1회 뒤 long task 최대 1.9초·합계 4.3초, 드래그 24스텝에 76초)은
 * 큐 전체가 마이크로태스크 체인으로 이어져 한 태스크 안에서 썸네일 수십 장을 연달아 그린 탓이었다. `pacing`이 있으면
 *  - 다시 그릴 요청이 들어온 뒤 `quietMs` 동안 새 요청이 없을 때까지 작업을 시작하지 않는다(슬라이더 드래그 중에는 썸네일을 멈추고
 *    끝난 뒤 마지막 레시피로 한 번만 그린다),
 *  - 작업마다(그리고 임시 소스 만들기와 렌더 사이에) 다음 매크로태스크로 양보해 입력·뷰포트 프레임이 끼어들게 하고,
 *  - 보이지 않는 카드는 유휴 시간(`whenIdle`)에만 하나씩 그리고, 이미 그림이 있으면 그 슬롯이 보일 때까지 다시 그리지 않으며,
 *  - 시작 직전·단계 사이에 cacheKey가 바뀐(레시피가 그새 바뀐) 작업은 그리지 않고 버린다(드라이버가 revision마다 새 키로 다시 요청한다).
 * `pacing`이 없으면 기존처럼 바로 이어서 실행한다(단위 테스트·Node 하네스).
 */
import { DEFAULT_FRAMING, isLabFailure } from "../../contracts";

import type { ApplyPlan, CameraFraming, CharacterEngine, CharacterSource, PresetId, ThumbnailEntry, ThumbnailSize } from "../../contracts";

/** 메인 스레드 양보 정책(브라우저 셸 기본값은 `createBrowserThumbnailPacing`). */
export interface ThumbnailPacing {
  /** 다시 그릴 요청이 들어온 뒤 이 시간(ms) 동안 새 요청이 없어야 작업을 시작한다. 0이면 기다리지 않는다. */
  readonly quietMs: number;
  /** ms 뒤 콜백을 부른다. 반환 함수로 취소한다. 시계를 읽지 않고 타이머로만 판정한다(멈춘 시계를 주입한 테스트에서도 끝난다). */
  readonly schedule: (callback: () => void, ms: number) => () => void;
  /** 다음 매크로태스크까지 기다린다(보이는 카드 작업 시작 전·단계 사이). */
  readonly yieldToMain: () => Promise<void>;
  /** 보이지 않는 카드 작업 시작 전: 메인 스레드가 한가해질 때까지 기다린다. 없으면 `yieldToMain`. */
  readonly whenIdle?: () => Promise<void>;
}

export interface ThumbnailSchedulerDeps {
  readonly engine: () => CharacterEngine | null;
  /** 프리셋을 현재 레시피에 임시 적용한 플랜(state/apply-plan + catalog) */
  readonly planForPreset: (presetId: PresetId) => ApplyPlan;
  /** state/thumbnail-cache.ts thumbnailCacheKey */
  readonly cacheKeyFor: (presetId: PresetId) => string;
  readonly framingFor?: (presetId: PresetId) => CameraFraming;
  /**
   * 지오메트리 프리셋(헤어·의상 등)의 임시 미리보기 소스. `engine.thumbnailSources === true`일 때만 호출한다.
   * null·undefined를 돌려주면 현재 로드된 소스를 그린다. 던지면 그 카드만 failed(reasonKo)가 된다.
   */
  readonly sourceFor?: (presetId: PresetId) => CharacterSource | null | undefined | Promise<CharacterSource | null | undefined>;
  /** store의 현재 항목(ready + 같은 cacheKey면 건너뛴다) */
  readonly currentEntry: (presetId: PresetId) => ThumbnailEntry | undefined;
  /** store.applyEvent({ type: "thumbnail/update" }) 연결 */
  readonly onUpdate: (presetId: PresetId, entry: ThumbnailEntry) => void;
  readonly size?: ThumbnailSize;
  /** 메인 스레드 양보 정책. 없으면 작업을 바로 이어서 실행한다. */
  readonly pacing?: ThumbnailPacing;
}

export interface ThumbnailRequestOptions {
  readonly visible?: boolean;
}

export interface ThumbnailScheduler {
  /** 필요하면 큐에 넣는다. 이미 ready이고 cacheKey가 같으면 아무것도 하지 않는다. */
  request(presetId: PresetId, options?: ThumbnailRequestOptions): void;
  /** 가시 카드 집합 갱신(대기 중 우선순위 재정렬) */
  setVisible(presetIds: readonly PresetId[]): void;
  cancel(presetId: PresetId): void;
  pending(): number;
  isRunning(): boolean;
  /** 큐가 비고 실행 중인 작업이 없을 때까지(양보 정책이 있으면 보일 때까지 미룬 카드는 기다리지 않는다) */
  idle(): Promise<void>;
  clear(): void;
}

interface QueuedJob {
  readonly presetId: PresetId;
  readonly cacheKey: string;
  visible: boolean;
  readonly order: number;
}

/** 다시 그리는 동안 옛 그림을 둘 수 있는 항목(그림이 있는 ready) */
function hasRaster(entry: ThumbnailEntry | undefined): boolean {
  return entry !== undefined && entry.status === "ready" && entry.raster !== undefined;
}

export function createThumbnailScheduler(deps: ThumbnailSchedulerDeps): ThumbnailScheduler {
  const size: ThumbnailSize = deps.size ?? 128;
  const pacing = deps.pacing;
  const queue: QueuedJob[] = [];
  const visibleSet = new Set<PresetId>();
  const idleWaiters: Array<() => void> = [];
  let running: QueuedJob | null = null;
  let order = 0;
  /** 마지막 요청 뒤 `quietMs`가 지났는지(타이머가 true로 되돌린다) */
  let quiet = true;
  let cancelQuietTimer: (() => void) | null = null;

  /**
   * 지금 그릴 수 있는 작업인지. 양보 정책이 있으면 **보이지 않으면서 이미 그림이 있는** 카드는 보일 때까지 미룬다(옛 그림을 둔다) —
   * 슬라이더 1회마다 다른 슬롯 카드 수십 장(지오메트리 카드는 임시 모델 빌드만 장당 약 0.1초)을 다시 그리지 않는다. 그 슬롯을 열면
   * 드라이버가 보이는 카드로 다시 요청해 그때 그린다(늦게라도 올바르게 갱신). 처음 그리는 카드는 보이지 않아도 유휴 시간에 미리 그린다.
   */
  const isRunnable = (job: QueuedJob): boolean => !pacing || job.visible || !hasRaster(deps.currentEntry(job.presetId));

  const resolveIdle = (): void => {
    if (running || queue.some(isRunnable)) return;
    const waiters = idleWaiters.splice(0);
    for (const waiter of waiters) waiter();
  };

  const nextJob = (): QueuedJob | undefined => {
    let bestIndex = -1;
    for (let i = 0; i < queue.length; i += 1) {
      const candidate = queue[i] as QueuedJob;
      if (!isRunnable(candidate)) continue;
      const best = bestIndex >= 0 ? (queue[bestIndex] as QueuedJob) : null;
      if (!best || (candidate.visible && !best.visible) || (candidate.visible === best.visible && candidate.order < best.order)) bestIndex = i;
    }
    return bestIndex >= 0 ? queue.splice(bestIndex, 1)[0] : undefined;
  };

  /**
   * 그새 레시피가 바뀌었거나(cacheKey 불일치) 같은 카드의 새 요청이 큐에 들어왔으면 이 작업은 그리지 않고 버린다. 카드 항목은 그대로 둔다
   * (옛 그림 또는 pending) — 레시피 변경은 항상 history revision을 올리고(계약 HistoryInfo) 드라이버가 revision 변경마다 새 키로 다시 요청한다.
   */
  const isStale = (job: QueuedJob): boolean => queue.some((queued) => queued.presetId === job.presetId) || deps.cacheKeyFor(job.presetId) !== job.cacheKey;

  /** 새로 그릴 요청이 들어왔다: `quietMs` 동안 조용할 때까지 다음 작업을 시작하지 않는다(타이머를 다시 건다). */
  const markActivity = (): void => {
    if (!pacing || !(pacing.quietMs > 0)) return;
    quiet = false;
    cancelQuietTimer?.();
    cancelQuietTimer = pacing.schedule(() => {
      cancelQuietTimer = null;
      quiet = true;
      pump();
    }, pacing.quietMs);
  };

  const runOne = async (job: QueuedJob): Promise<void> => {
    const engine = deps.engine();
    if (!engine) {
      deps.onUpdate(job.presetId, { status: "failed", cacheKey: job.cacheKey, reasonKo: "엔진이 준비되지 않아 썸네일을 만들 수 없습니다." });
      return;
    }
    try {
      const source = engine.thumbnailSources === true ? await deps.sourceFor?.(job.presetId) : undefined;
      if (pacing && source) {
        // 임시 소스 만들기(CPU)와 렌더(GPU 제출)를 다른 태스크로 나눈다.
        await pacing.yieldToMain();
        if (isStale(job)) return;
      }
      const raster = await engine.renderThumbnail({
        presetId: job.presetId,
        plan: deps.planForPreset(job.presetId),
        size,
        framing: deps.framingFor?.(job.presetId) ?? DEFAULT_FRAMING,
        ...(source ? { source } : {}),
      });
      deps.onUpdate(job.presetId, { status: "ready", cacheKey: job.cacheKey, raster });
    } catch (error) {
      const reasonKo = isLabFailure(error) ? error.reasonKo : `썸네일 렌더 중 오류: ${error instanceof Error ? error.message : String(error)}`;
      deps.onUpdate(job.presetId, { status: "failed", cacheKey: job.cacheKey, reasonKo });
    }
  };

  /**
   * 양보 정책이 있을 때: 시작 전에 양보(보이지 않는 카드는 유휴 대기)한다. 그새 오래된 작업이면 버리고, 그새 새 요청이 들어왔거나
   * (조용하지 않음) 보이는 카드가 기다리면 보이지 않는 작업은 큐에 되돌린다.
   */
  const runPaced = async (job: QueuedJob, policy: ThumbnailPacing): Promise<void> => {
    await (job.visible ? policy.yieldToMain() : (policy.whenIdle ?? policy.yieldToMain)());
    if (isStale(job)) return;
    if (!quiet || (!job.visible && queue.some((queued) => queued.visible))) {
      queue.push(job);
      return;
    }
    await runOne(job);
  };

  const pump = (): void => {
    if (running) return;
    if (!queue.some(isRunnable)) {
      resolveIdle();
      return;
    }
    // 조용해지면 타이머가 다시 부른다.
    if (pacing && !quiet) return;
    const job = nextJob();
    if (!job) return;
    running = job;
    void (pacing ? runPaced(job, pacing) : runOne(job)).finally(() => {
      running = null;
      pump();
    });
  };

  return {
    request(presetId, options = {}) {
      const cacheKey = deps.cacheKeyFor(presetId);
      const visible = options.visible ?? visibleSet.has(presetId);
      const current = deps.currentEntry(presetId);
      if (current && current.cacheKey === cacheKey && current.status === "ready") return;
      if (running && running.presetId === presetId && running.cacheKey === cacheKey) return;
      const queued = queue.find((job) => job.presetId === presetId);
      if (queued) {
        if (queued.cacheKey === cacheKey) {
          queued.visible = queued.visible || visible;
          // 미뤄 둔 카드가 이제 보이면 바로 그릴 수 있다.
          pump();
          return;
        }
        queue.splice(queue.indexOf(queued), 1);
      }
      order += 1;
      queue.push({ presetId, cacheKey, visible, order });
      // 이미 그려진 카드는 새 그림이 나올 때까지 옛 그림을 둔다(stale-while-revalidate). 처음·실패 카드만 pending.
      if (!hasRaster(current)) deps.onUpdate(presetId, { status: "pending", cacheKey });
      markActivity();
      pump();
    },
    setVisible(presetIds) {
      visibleSet.clear();
      for (const id of presetIds) visibleSet.add(id);
      for (const job of queue) job.visible = visibleSet.has(job.presetId);
      pump();
    },
    cancel(presetId) {
      const index = queue.findIndex((job) => job.presetId === presetId);
      if (index >= 0) queue.splice(index, 1);
      resolveIdle();
    },
    pending: () => queue.length,
    isRunning: () => running !== null,
    /** 큐가 비거나(양보 정책이 있으면 보일 때까지 미룬 카드만 남거나) 실행 중인 작업이 없을 때까지 */
    idle() {
      if (!running && !queue.some(isRunnable)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    },
    clear() {
      queue.length = 0;
      resolveIdle();
    },
  };
}

interface IdleHost {
  readonly requestIdleCallback?: (callback: () => void, options?: { readonly timeout: number }) => number;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly MessageChannel?: typeof MessageChannel;
  readonly document?: unknown;
  readonly navigator?: { readonly userAgent?: string };
}

/** 다시 그릴 요청 뒤 이만큼(ms) 조용해야 썸네일 작업을 시작한다(드래그 입력 간격 ~16 ms·숫자 타이핑 간격보다 길게). */
export const THUMBNAIL_QUIET_MS = 160;
/** 보이지 않는 카드가 유휴 콜백을 기다리는 최대 시간(ms). 계속 바쁘면 이 시간 뒤에라도 하나는 그린다(늦게라도 갱신). */
export const THUMBNAIL_IDLE_TIMEOUT_MS = 1500;

/**
 * 셸 런타임 기본 정책: 실제 브라우저(문서·`MessageChannel`이 있고 jsdom이 아닌 환경)면 `createBrowserThumbnailPacing`, 아니면 null(양보 없음).
 * `requestIdleCallback`이 없는 브라우저(Safari)도 켠다(유휴 대기는 setTimeout으로 대신한다).
 * Node·jsdom 테스트는 마이크로태스크만으로 끝나는 기존 흐름을 그대로 쓰고, 양보 동작은 정책을 직접 주입한 단위 테스트와 실브라우저 측정으로 검증한다.
 */
export function defaultThumbnailPacing(host: IdleHost = globalThis as unknown as IdleHost): ThumbnailPacing | null {
  const browser = typeof host.MessageChannel === "function" && typeof host.document === "object" && host.document !== null && !/jsdom/iu.test(host.navigator?.userAgent ?? "");
  return browser ? createBrowserThumbnailPacing(host) : null;
}

/**
 * 브라우저 기본 양보 정책: 매크로태스크 양보는 `MessageChannel`(setTimeout 0의 최소 지연 누적 없음), 유휴 대기는 `requestIdleCallback`.
 * 없는 환경(Node·jsdom·구형 브라우저)은 setTimeout으로 대신한다.
 */
export function createBrowserThumbnailPacing(host: IdleHost = globalThis as unknown as IdleHost, quietMs: number = THUMBNAIL_QUIET_MS): ThumbnailPacing {
  const timeout = (callback: () => void, ms: number): void => {
    host.setTimeout(callback, ms);
  };
  const yieldToMain = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const Channel = host.MessageChannel;
      if (typeof Channel !== "function") {
        timeout(resolve, 0);
        return;
      }
      const channel = new Channel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  const requestIdle = host.requestIdleCallback;
  const whenIdle = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (typeof requestIdle !== "function") {
        timeout(resolve, 0);
        return;
      }
      requestIdle.call(host, () => resolve(), { timeout: THUMBNAIL_IDLE_TIMEOUT_MS });
    });
  return {
    quietMs,
    schedule(callback, ms) {
      const handle = host.setTimeout(callback, ms);
      return () => host.clearTimeout(handle);
    },
    yieldToMain,
    whenIdle,
  };
}
