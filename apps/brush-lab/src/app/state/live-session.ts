import { SumiError } from "../../engine/core/errors";
import { applyStrokeStream } from "../../engine/input/stages/chain";
import { attachPointerCapture, splitPredicted } from "../../platform/pointer-capture";
import { FrameScheduler } from "../../platform/raf-scheduler";

import type { LabImage, RawSample } from "../../engine/core/types";
import type { RawStage } from "../../engine/input/stages/raw-stage";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { BrushEngineLane, DabBatchReceipt, LaneEnvironment, StrokeAbortReceipt, StrokeOptions, StrokeReceipt } from "../../lanes/lane";
import type { PreviewPoint } from "../../platform/canvas-present";
import type { PointerCaptureOptions } from "../../platform/pointer-capture";

/**
 * 실시간 입력 세션: 포인터 캡처 → 프레임 스케줄러 → 레인 `addSamples`(프레임당 1회) → 획 종료 시 readback.
 * - 예측 표본은 `onPreview`로만 전달한다(정본 스트림에 넣지 않는다).
 * - 배치는 `up` 표본 경계에서만 나눈다(같은 프레임에 획이 끝나고 새 획이 시작되는 경우).
 * - 레인 오류는 `onError`로 드러내고 세션은 다음 획을 받을 수 있는 상태로 돌아간다.
 *   획 도중(beginStroke 뒤 endStroke 전)에 레인이 실패하면 먼저 `lane.abortStroke()`로 진행 중인 획만 버린다.
 *   레인이 `documentPreserved: true`를 돌려주면 **레인을 유지**한다(그때까지 그린 문서가 남는다). `false`(복원할 수 없는 레인:
 *   GPU 습식·장치 손실 등)이거나 abortStroke 자체가 던지면 레인을 새로 만들어 교체한다(그 문서는 비워진다 — 두 오류와 교체 사실이 모두 드러난다).
 *   endStroke 이후의 실패는 레인이 스스로 정리하므로 레인을 유지한다.
 * - 포인터 취소(`pointercancel`)는 오류가 아니라 사용자의 중단이다: 획을 문서에 합성하지 않고 같은 abort 경로로 버린다.
 * - 레인 init이 실패하면 방금 만든 레인을 해제한다(GPU 장치 누수 방지).
 * - 획 색은 프로그램이 아니라 획의 입력이다: 세션이 가진 현재 색(`color`/`setColor`)을 획을 시작할 때 `beginStroke(program, seed, { color })`로
 *   넘긴다. 색을 바꿔도 진행 중인 획은 시작할 때의 색을 끝까지 쓰고 다음 획부터 새 색이 적용된다(`setProgram`과 같은 규칙).
 *   색을 한 번도 정하지 않으면 옵션 없이 `beginStroke`를 불러 기존(검정)과 같다.
 * - 입력 단계(`inputStage`, 끈 당김·물리 펜·코너 게이트 체인): `transformSamples`(압력 시뮬레이션) 뒤에 원시 표본에 적용한다.
 *   `up`이 들어온 배치에서는 단계의 `flush()` 표본(획 끝 따라잡기·정착)을 `up` 앞에 이어 보내 끝점이 포인터 업 위치에 닿는다.
 *   `setInputStage`는 다음 획부터 쓸 단계를 바꾼다(포인터가 눌린 채면 새 단계는 다음 `down`에서 시작한다). 획이 버려지면
 *   (`abortStroke` 경로: 오류 복구·포인터 취소) 단계의 `reset()`을 불러 보류 중인 마무리와 상태를 버린다.
 */

export interface LiveStrokeResult {
  image: LabImage;
  linear: Float32Array | null;
  receipt: StrokeReceipt;
  frames: DabBatchReceipt[];
  /** 정본 표본(raw·coalesced)만. */
  samples: RawSample[];
  /** 이 획에 쓴 시드(세션 시드 + 획 순번). */
  seed: number;
  /** 이 획의 단계별 소요(ms, `env.clock` 기준). 그리기 화면 HUD가 쓴다. */
  timings: LiveStrokeTimings;
}

/** 획 1개의 단계별 소요 시간(ms). */
export interface LiveStrokeTimings {
  /** `lane.addSamples` 호출마다의 소요(프레임당 1회). */
  addSamplesMs: number[];
  /** `lane.endStroke` 소요. */
  endStrokeMs: number;
  /** `lane.readback`(+`readbackLinear`) 소요. */
  readbackMs: number;
}

/** 세션이 진행 중이던 획을 버린 결과(`onStrokeAbort`). */
export interface LiveStrokeAbort {
  /** 버린 원인: 레인 오류 또는 포인터 취소. */
  cause: "error" | "pointercancel";
  /** 레인의 abortStroke 영수증. abortStroke가 던졌다면 null. */
  receipt: StrokeAbortReceipt | null;
  /** 문서를 보존하지 못해 레인을 교체했는가(true면 그때까지 그린 문서가 비워졌다). */
  laneReplaced: boolean;
}

export interface LiveSessionOptions {
  createLane: () => BrushEngineLane;
  env: LaneEnvironment;
  program: BrushProgram;
  seed: number;
  width: number;
  height: number;
  /** 획 색(sRGB straight RGBA, 0..1). 생략하면 `setColor` 전까지 레인 기본(검정). */
  color?: NonNullable<StrokeOptions["color"]>;
  presentCanvas?: HTMLCanvasElement;
  /** 습식 풀 용량(타일). 16 px 타일 2048개(≈720²)를 넘는 문서에서 습식·유화 가족을 쓰려면 올려야 한다(README 습식 예산). */
  wetCapacityTiles?: number;
  /** 획 레이어 풀 용량(타일). 생략하면 레인 기본값. */
  strokeCapacityTiles?: number;
  /** true면 획이 끝날 때 선형 버퍼(`readbackLinear`)를 읽지 않는다(`linear: null`). 화면 표시만 필요한 호출자의 비용 절감용. */
  skipLinear?: boolean;
  /**
   * 포인터 표본을 스케줄러에 넣기 전에 변환한다(마우스 압력 시뮬레이션 같은 입력 보정; 끈 당김·물리 펜은 `inputStage`). 정체성이 바뀔 수 있으므로
   * 취소(up) 표시는 변환 뒤 표본에 붙는다. 생략하면 변환 없음.
   */
  transformSamples?: (raw: RawSample[]) => RawSample[];
  /** 입력 단계 체인(`engine/input/stages`). 생략하거나 null이면 단계 없음. `setInputStage`로 바꾼다. */
  inputStage?: RawStage | null;
  /** 생략 시 `globalThis.requestAnimationFrame` 기반 스케줄러. */
  scheduler?: FrameScheduler;
  onPreview?: (points: PreviewPoint[]) => void;
  /** 정본 표본(raw·coalesced)이 들어올 때마다(스케줄러 큐 전). 입력 궤적 미리보기용. */
  onCanonical?: (samples: readonly RawSample[]) => void;
  onFrame?: (receipt: DabBatchReceipt) => void;
  onStrokeEnd?: (result: LiveStrokeResult) => void;
  onError?: (error: unknown) => void;
  /** 진행 중이던 획을 버렸을 때(오류 복구·포인터 취소). 레인 교체 여부와 영수증을 알려 준다. */
  onStrokeAbort?: (abort: LiveStrokeAbort) => void;
}

export class LiveStrokeSession {
  private readonly opts: LiveSessionOptions;
  private readonly scheduler: FrameScheduler;
  /** 다음 `beginStroke`부터 쓸 프로그램(`setProgram`으로 바뀐다). */
  private program: BrushProgram;
  /** 다음 `beginStroke`부터 쓸 획 색(`setColor`로 바뀐다). undefined면 옵션 없이 시작한다. */
  private color: StrokeOptions["color"];
  private lane: BrushEngineLane;
  /** 진행 중인 획의 addSamples 소요(ms). */
  private addSamplesMs: number[] = [];
  private inStroke = false;
  private strokeCount = 0;
  private strokeSeed = 0;
  private strokeSamples: RawSample[] = [];
  private frames: DabBatchReceipt[] = [];
  private chain: Promise<void> = Promise.resolve();
  private detach: (() => void) | null = null;
  private disposed = false;
  /** 현재 `lane`이 이미 dispose됐는가(clear가 이전 레인을 버린 뒤 새 레인을 대입하기 전). 같은 레인을 두 번 해제하지 않는다. */
  private laneReleased = false;
  /** beginStroke를 부른 뒤 endStroke에 들어가기 전인가. 이 구간의 오류는 레인이 획 도중 상태로 남았을 수 있다. */
  private laneMidStroke = false;
  /** 입력 단계(없으면 null). */
  private inputStage: RawStage | null;
  /** 포인터가 눌려 있는가(정본 표본의 down/up으로 추적). 눌린 채 단계를 reset하면 진행 중인 새 획의 상태를 지우므로 막는다. */
  private pointerDown = false;
  /** 포인터 취소로 끝난 up 표본(스케줄러 큐를 지나도 정체성으로 구분한다). 이 표본이 든 획은 합성하지 않고 버린다. */
  private readonly canceledUps = new WeakSet<RawSample>();
  /** `pointercancel` 디스패치 중에만 true: 플랫폼 캡처가 만드는 up 표본을 취소로 표시하라는 신호. */
  private cancelNextUp = false;

  private constructor(opts: LiveSessionOptions, lane: BrushEngineLane) {
    this.opts = opts;
    this.program = opts.program;
    this.color = opts.color;
    this.inputStage = opts.inputStage ?? null;
    this.lane = lane;
    this.scheduler = opts.scheduler ?? new FrameScheduler(undefined, opts.env.clock);
    this.scheduler.onFrame((batch) => this.enqueueBatch(batch));
  }

  /** 레인을 만들고 init까지 마친 세션. init 실패(LaneUnavailableError 등)는 레인을 해제한 뒤 그대로 던진다. */
  static async create(opts: LiveSessionOptions): Promise<LiveStrokeSession> {
    const lane = opts.createLane();
    await LiveStrokeSession.initLane(lane, opts);
    return new LiveStrokeSession(opts, lane);
  }

  /** init이 거부되면 이 레인을 가리키는 곳이 없으므로(장치·버퍼가 남지 않게) 여기서 해제하고 원 오류를 다시 던진다. */
  private static async initLane(lane: BrushEngineLane, opts: LiveSessionOptions): Promise<void> {
    const init: Parameters<BrushEngineLane["init"]>[1] = {
      width: opts.width,
      height: opts.height,
      dpr: 1,
      tileSize: 16,
      seed: opts.seed,
    };
    if (opts.presentCanvas) init.presentCanvas = opts.presentCanvas;
    if (opts.wetCapacityTiles !== undefined) init.wetCapacityTiles = opts.wetCapacityTiles;
    if (opts.strokeCapacityTiles !== undefined) init.strokeCapacityTiles = opts.strokeCapacityTiles;
    try {
      await lane.init(opts.env, init);
    } catch (error) {
      lane.dispose();
      throw error;
    }
  }

  get strokes(): number {
    return this.strokeCount;
  }

  get currentLane(): BrushEngineLane {
    return this.lane;
  }

  /**
   * 다음 획부터 쓸 프로그램을 바꾼다. 진행 중인 획은 시작할 때의 프로그램을 끝까지 쓰므로(레인 계약: 획마다 beginStroke)
   * 문서와 레인은 그대로 유지된다. 프로그램 검증은 호출자(`applyOverrides`)의 몫이다.
   */
  setProgram(program: BrushProgram): void {
    this.program = program;
  }

  /**
   * 다음 획부터 쓸 색(sRGB straight RGBA, 0..1)을 바꾼다. 진행 중인 획은 시작할 때의 색을 끝까지 쓰고 문서와 레인은 그대로 유지된다.
   * 값 검증은 레인(`beginStroke`)이 한다: 잘못된 색이면 다음 획 시작이 InvalidStateError로 드러난다.
   */
  setColor(color: NonNullable<StrokeOptions["color"]>): void {
    this.color = color;
  }

  /**
   * 다음 획부터 쓸 입력 단계를 바꾼다(null이면 단계 없음). 이전 단계는 `reset()`으로 비운다.
   * 포인터가 눌려 있는 동안 바꾸면 새 단계는 그 획의 중간부터 표본을 받으므로(`down`이 없다) 다음 `down`부터 쓰는 것이 정상 사용이다.
   */
  setInputStage(stage: RawStage | null): void {
    if (this.inputStage && this.inputStage !== stage) this.inputStage.reset();
    this.inputStage = stage;
  }

  /** 요소에 포인터 캡처를 붙인다. 반환 함수로 뗀다. */
  attach(el: HTMLElement, captureOpts: PointerCaptureOptions = {}): () => void {
    if (this.detach) this.detach();
    // 플랫폼 캡처는 pointerup과 pointercancel을 똑같이 `up` 표본으로 바꾼다. 취소는 합성이 아니라 버려야 하므로,
    // 같은 이벤트에서 그 up 표본이 만들어지는 순간을 알 수 있게 캡처 리스너의 앞(표시)과 뒤(해제)에 리스너를 하나씩 건다.
    const markCancel = (): void => {
      this.cancelNextUp = true;
    };
    const clearMark = (): void => {
      this.cancelNextUp = false;
    };
    el.addEventListener("pointercancel", markCancel);
    // 캡처를 잃은 경우(lostpointercapture)도 pointerup 없는 중단이라 같은 abort 경로로 보낸다.
    // 정상 pointerup 뒤의 lostpointercapture는 플랫폼 캡처가 무시하고(소유자 없음) clearMark가 표시를 지운다.
    el.addEventListener("lostpointercapture", markCancel);
    const offCapture = attachPointerCapture(el, (raw) => this.onSamples(raw), {
      logicalSize: { width: this.opts.width, height: this.opts.height },
      ...captureOpts,
    });
    el.addEventListener("pointercancel", clearMark);
    el.addEventListener("lostpointercapture", clearMark);
    const off = (): void => {
      el.removeEventListener("pointercancel", markCancel);
      el.removeEventListener("lostpointercapture", markCancel);
      offCapture();
      el.removeEventListener("pointercancel", clearMark);
      el.removeEventListener("lostpointercapture", clearMark);
      this.cancelNextUp = false;
    };
    this.detach = off;
    return () => {
      if (this.detach === off) this.detach = null;
      off();
    };
  }

  /**
   * 문서를 비운다: 진행 중 작업 뒤에 직렬화해 레인을 버리고 새로 init한다.
   * clear는 배치 체인에 끼므로, 새 레인 init을 기다리는 동안 들어온 표본은 체인에서 clear 뒤에 이어 붙어
   * (해제된 이전 레인이 아니라) 새 레인이 준비된 뒤 새 레인에 적용된다.
   */
  clear(): Promise<void> {
    const run = this.chain.then(() => this.replaceLane());
    // clear가 실패해도(새 레인 init 실패 등) 뒤따르는 배치가 거부된 체인에 막혀 조용히 버려지지 않게 한다.
    // 실패 자체는 `run`을 돌려받는 호출자에게 그대로 전달된다.
    this.chain = run.catch(() => undefined);
    return run;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.detach) this.detach();
    this.detach = null;
    this.scheduler.stop();
    this.releaseLane();
  }

  /** 이전 레인을 해제하고 새 레인을 init한 뒤 세션 상태를 초기화한다. */
  private async replaceLane(): Promise<void> {
    if (this.disposed) return;
    if (!this.pointerDown) this.inputStage?.reset();
    this.releaseLane();
    const lane = this.opts.createLane();
    await LiveStrokeSession.initLane(lane, this.opts);
    if (this.disposed) {
      // init을 기다리는 사이 dispose()가 불렸다. dispose()는 이미 해제된 이전 레인만 정리했으므로
      // 새로 만든 레인(GPU 버퍼·텍스처 등)은 여기서 해제하지 않으면 아무도 해제하지 않는다.
      lane.dispose();
      return;
    }
    this.lane = lane;
    this.laneReleased = false;
    this.laneMidStroke = false;
    this.inStroke = false;
    this.strokeSamples = [];
    this.frames = [];
    this.addSamplesMs = [];
  }

  /** 현재 레인을 한 번만 해제한다. */
  private releaseLane(): void {
    if (this.laneReleased) return;
    this.laneReleased = true;
    this.lane.dispose();
  }

  private onSamples(rawInput: RawSample[]): void {
    if (this.disposed) return;
    const transformed = this.opts.transformSamples ? this.opts.transformSamples(rawInput) : rawInput;
    const raw = this.inputStage ? applyStrokeStream(this.inputStage, transformed) : transformed;
    const { canonical, predicted } = splitPredicted(raw);
    for (const s of canonical) {
      if (s.phase === "down") this.pointerDown = true;
      else if (s.phase === "up") this.pointerDown = false;
    }
    if (this.opts.onPreview) {
      this.opts.onPreview(predicted.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })));
    }
    if (this.cancelNextUp) {
      const up = canonical.findLast((sample) => sample.phase === "up");
      if (up) {
        this.canceledUps.add(up);
        this.cancelNextUp = false;
        // 취소된 획은 버려지므로 입력 단계도 그 즉시 초기화한다(비동기 abort 경로를 기다리다 새 획의 상태를 지우지 않게 동기로 처리한다).
        this.inputStage?.reset();
      }
    }
    if (canonical.length > 0) {
      if (this.opts.onCanonical) this.opts.onCanonical(canonical);
      this.scheduler.enqueue(canonical);
    }
  }

  private enqueueBatch(batch: RawSample[]): void {
    this.chain = this.chain.then(() => this.processBatch(batch));
  }

  private async processBatch(batch: RawSample[]): Promise<void> {
    if (this.disposed) return;
    let start = 0;
    while (start < batch.length) {
      let end = batch.length;
      for (let i = start; i < batch.length; i += 1) {
        if (batch[i]?.phase === "up") {
          end = i + 1;
          break;
        }
      }
      try {
        await this.processStrokePart(batch.slice(start, end));
      } catch (error) {
        await this.handleFailure(error);
      }
      start = end;
    }
  }

  /**
   * 세션 쪽 획 상태를 비우고 오류를 드러낸다. 레인이 획 도중 상태로 남았을 수 있으면(beginStroke 뒤 endStroke 전)
   * 먼저 `abortStroke`로 그 획만 버린다. 문서가 보존되면 레인을 유지하고, 그렇지 않거나 abortStroke가 던지면 레인을 새로 만든다:
   * 그렇지 않으면 레인의 다음 beginStroke가 '이전 획이 끝나지 않았다'로 영구히 실패한다.
   * (체인 안이므로 `clear()`가 아니라 `replaceLane`을 직접 부른다. clear는 같은 체인을 기다려 교착한다.)
   */
  private async handleFailure(error: unknown): Promise<void> {
    this.inStroke = false;
    this.strokeSamples = [];
    this.frames = [];
    this.addSamplesMs = [];
    const failures: unknown[] = [error];
    let abort: LiveStrokeAbort | null = null;
    if (this.laneMidStroke) abort = await this.discardLaneStroke("error", failures);
    const onError = this.opts.onError;
    if (!onError) throw error;
    for (const failure of failures) onError(failure);
    if (abort && this.opts.onStrokeAbort) this.opts.onStrokeAbort(abort);
  }

  /**
   * 포인터 취소: 오류가 아니라 사용자의 중단이다. 아직 레인에 들어가지 않은 획(같은 배치 안에서 시작·취소)은 버릴 것이 없다.
   * 레인이 획 도중이면 abortStroke로 버리고, 문서를 보존하지 못하면(레인 교체) 조용히 넘기지 않고 오류로 드러낸다.
   */
  private async handleCancel(): Promise<void> {
    this.inStroke = false;
    this.strokeSamples = [];
    this.frames = [];
    this.addSamplesMs = [];
    if (!this.laneMidStroke) return;
    const failures: unknown[] = [];
    const abort = await this.discardLaneStroke("pointercancel", failures);
    if (!abort.laneReplaced && failures.length === 0) {
      if (this.opts.onPreview) this.opts.onPreview([]);
      if (this.opts.onStrokeAbort) this.opts.onStrokeAbort(abort);
      return;
    }
    if (failures.length === 0) {
      failures.push(
        new SumiError("document-not-preserved", `포인터 취소로 획을 버렸지만 레인이 문서를 보존하지 못해 교체했다: ${abort.receipt?.reasonKo ?? "사유 없음"}`),
      );
    }
    if (this.opts.onPreview) this.opts.onPreview([]);
    const onError = this.opts.onError;
    if (!onError) throw failures[0];
    for (const failure of failures) onError(failure);
    if (this.opts.onStrokeAbort) this.opts.onStrokeAbort(abort);
  }

  /**
   * 레인의 진행 중인 획을 버린다. 문서가 보존되면 레인을 유지하고, 아니면(복원 불가·abortStroke 실패) 레인을 교체한다.
   * abortStroke가 던진 오류와 레인 교체 실패는 `failures`에 쌓아 호출자가 드러낸다.
   */
  private async discardLaneStroke(cause: LiveStrokeAbort["cause"], failures: unknown[]): Promise<LiveStrokeAbort> {
    // 버린 획의 입력 단계 상태(보류한 up·붓/펜 위치)도 버린다. 포인터가 이미 새 획을 시작했으면 그 획의 상태이므로 건드리지 않는다.
    if (!this.pointerDown) this.inputStage?.reset();
    let receipt: StrokeAbortReceipt | null = null;
    try {
      receipt = this.lane.abortStroke();
    } catch (abortError) {
      failures.push(abortError);
    }
    if (receipt?.documentPreserved) {
      this.laneMidStroke = false;
      return { cause, receipt, laneReplaced: false };
    }
    try {
      await this.replaceLane();
    } catch (recoveryError) {
      failures.push(recoveryError);
    }
    return { cause, receipt, laneReplaced: true };
  }

  private async processStrokePart(part: RawSample[]): Promise<void> {
    const tail = part[part.length - 1];
    if (tail && tail.phase === "up" && this.canceledUps.has(tail)) {
      // 취소된 획: 이 부분의 표본은 레인에 넣지 않고 버린다(문서에 합성하지 않는다).
      await this.handleCancel();
      return;
    }
    let samples = part;
    if (!this.inStroke) {
      // 획 밖에서 들어온 move 잔여는 폐기하고 down부터 받는다.
      const downIdx = samples.findIndex((s) => s.phase === "down");
      if (downIdx < 0) return;
      samples = samples.slice(downIdx);
      this.strokeSeed = this.opts.seed + this.strokeCount;
      // beginStroke가 중간에 던져도 레인 상태는 알 수 없으므로 호출 전에 표시한다.
      this.laneMidStroke = true;
      if (this.color) this.lane.beginStroke(this.program, this.strokeSeed, { color: this.color });
      else this.lane.beginStroke(this.program, this.strokeSeed);
      this.inStroke = true;
      this.strokeSamples = [];
      this.frames = [];
      this.addSamplesMs = [];
    }
    if (samples.length === 0) return;
    const clock = this.opts.env.clock;
    const t0 = clock.now();
    const receipt = this.lane.addSamples(samples);
    this.addSamplesMs.push(clock.now() - t0);
    this.frames.push(receipt);
    for (const s of samples) this.strokeSamples.push(s);
    if (this.opts.onFrame) this.opts.onFrame(receipt);
    const last = samples[samples.length - 1];
    if (last && last.phase === "up") await this.finishStroke();
  }

  private async finishStroke(): Promise<void> {
    this.inStroke = false;
    this.strokeCount += 1;
    // endStroke 안의 실패는 레인이 스스로 정리한다(획 타일 비우기·상태 리셋). 여기서부터는 레인을 유지한다.
    this.laneMidStroke = false;
    const clock = this.opts.env.clock;
    const tEnd = clock.now();
    const receipt = await this.lane.endStroke();
    const tRead = clock.now();
    const image = await this.lane.readback();
    const linear = this.opts.skipLinear ? null : await this.lane.readbackLinear();
    const timings: LiveStrokeTimings = {
      addSamplesMs: this.addSamplesMs,
      endStrokeMs: tRead - tEnd,
      readbackMs: clock.now() - tRead,
    };
    this.addSamplesMs = [];
    if (this.opts.onPreview) this.opts.onPreview([]);
    const result: LiveStrokeResult = {
      image,
      linear,
      receipt,
      frames: this.frames,
      samples: this.strokeSamples,
      seed: this.strokeSeed,
      timings,
    };
    this.strokeSamples = [];
    this.frames = [];
    if (this.opts.onStrokeEnd) this.opts.onStrokeEnd(result);
  }
}
