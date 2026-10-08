import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";

import { IsolatedStrokeLane } from "./isolated-stroke-lane";
import { supportedReport, unavailableReport } from "./lane";

import type { EngineSample } from "./isolated-stroke-lane";
import type { LaneCapabilityReport, LaneDescriptor, LaneEnvironment, LaneId, LaneInit, LaneKind, LaneStatus } from "./lane";
import type { MypaintMapping } from "./mypaint-settings-map";
import type { Rgba } from "../engine/core/types";

/**
 * Hokusai 비교 레인. Hokusai 0.3.0(Rust, MIT OR Apache-2.0)의 자연 매체 래스터를 `studio-hokusai-wasm` 래퍼로 쓴다.
 * 래퍼는 straight-alpha sRGB RGBA8을 돌려주고 내부는 선형 premultiplied fix15 타일이다.
 *
 * - 프로그램 → 엔진 설정: libmypaint 레인과 **같은 `.myb` 설정 문서**(`mypaint-settings-map.ts`)를 `new HokusaiBrush(JSON)`에 준다.
 *   Hokusai는 libmypaint v3 브러시 JSON을 파싱해 같은 설정을 평가하므로 두 엔진 차이만 A/B로 드러난다.
 *   옮기지 못한 기능은 `mappingReceipt()`에 남고, 습식·임파스토·smudge는 거부한다.
 * - 입력 공급: 래퍼가 절대 시간(ms)에서 dtime을 유도한다. **첫 표본은 엔진 위치만 심고 칠하지 않는다**(래퍼 계약). 꼬리는 `finishStroke`가 푼다.
 * - 로드: 기본은 번들러가 해석하는 `pkg/studio_hokusai_wasm.js`의 동적 import + 기본 wasm URL(브라우저 경로, 브라우저 미검증)이다.
 *   Node에는 URL fetch가 없어 기본 경로가 불가하므로 probe가 `wasm-artifact-missing`을 돌려준다. Node 검증은 `loadRuntime`으로 바이트를 주입한다.
 * - 결정성: 래퍼 README가 '같은 캔버스·브러시·시드·표본 열이면 바이트 결정적'이라 명시한다.
 * - 한계: 입력 파이프라인·물리·테이퍼·종이 그레인은 없다. 영수증 `dabCount`는 엔진에 공급한 정본 표본 수다(엔진이 dab 수를 노출하지 않는다).
 */
export const HOKUSAI_LANE_ID: LaneId = "hokusai";

/** 래퍼 `HokusaiBrush` 중 이 레인이 쓰는 면. */
export interface HokusaiBrushHandle {
  free(): void;
}

/** 래퍼 `HokusaiCanvas` 중 이 레인이 쓰는 면. */
export interface HokusaiCanvasHandle {
  beginStroke(brush: HokusaiBrushHandle, seed?: number | null): void;
  addSample(brush: HokusaiBrushHandle, x: number, y: number, pressure: number, tiltX: number, tiltY: number, timeMs: number): boolean;
  finishStroke(brush: HokusaiBrushHandle): boolean;
  fullFrame(): Uint8Array;
  dispose(): void;
  free(): void;
}

/** 초기화가 끝난(`default()` 호출 뒤) Hokusai wasm 모듈. */
export interface HokusaiRuntime {
  HokusaiBrush: new (mybJson: string) => HokusaiBrushHandle;
  HokusaiCanvas: new (width: number, height: number, seed: number) => HokusaiCanvasHandle;
}

export interface HokusaiLaneOptions {
  /** Hokusai 런타임 로더 주입(Node 테스트·스크립트가 wasm 바이트를 넣을 때). 기본은 번들러 경로(브라우저). */
  loadRuntime?: () => Promise<HokusaiRuntime>;
  /** 획 색(sRGB straight). 기본 검정 불투명. */
  color?: Rgba;
}

let defaultRuntime: Promise<HokusaiRuntime> | undefined;

/** 기본 로더: pkg 모듈을 동적 import하고 기본 URL로 wasm을 초기화한다. 실패하면 캐시를 비워 다시 시도할 수 있게 한다. */
export function loadHokusaiRuntimeDefault(): Promise<HokusaiRuntime> {
  if (!defaultRuntime) {
    const pending = (async (): Promise<HokusaiRuntime> => {
      const module = await import("../../../../packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");
      if (typeof module.default !== "function" || typeof module.HokusaiBrush !== "function" || typeof module.HokusaiCanvas !== "function") {
        throw new Error("Hokusai wasm 내보내기가 불완전하다");
      }
      await module.default();
      return { HokusaiBrush: module.HokusaiBrush, HokusaiCanvas: module.HokusaiCanvas };
    })();
    defaultRuntime = pending;
    pending.catch(() => {
      if (defaultRuntime === pending) defaultRuntime = undefined;
    });
  }
  return defaultRuntime;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 이 레인이 만드는 설정 문서를 래퍼가 읽는 `.myb` v3 JSON으로 직렬화한다(키 정렬 → 같은 프로그램 = 같은 바이트). */
export function hokusaiBrushJson(mapping: MypaintMapping): string {
  const settings: Record<string, unknown> = {};
  for (const name of Object.keys(mapping.document.settings).sort()) settings[name] = mapping.document.settings[name];
  return JSON.stringify({ version: 3, settings });
}

export class HokusaiLane extends IsolatedStrokeLane {
  readonly id: LaneId = HOKUSAI_LANE_ID;
  readonly label = "Hokusai 0.3.0(자연 매체 래스터, wasm 비교)";
  readonly kind: LaneKind = "comparison";
  readonly status: LaneStatus = "browser-verification-required";
  readonly engineVersion = `${SUMI_ENGINE_VERSION}+hokusai-0.3.0`;

  private runtime: HokusaiRuntime | null = null;
  private brush: HokusaiBrushHandle | null = null;
  private canvas: HokusaiCanvasHandle | null = null;
  private readonly options: HokusaiLaneOptions;

  constructor(options: HokusaiLaneOptions = {}) {
    super(options.color ?? [0, 0, 0, 1]);
    this.options = options;
  }

  private loadRuntime(): Promise<HokusaiRuntime> {
    return (this.options.loadRuntime ?? loadHokusaiRuntimeDefault)();
  }

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    if (typeof WebAssembly !== "object") return unavailableReport(this.id, ["wasm-artifact-missing"]);
    try {
      await this.loadRuntime();
    } catch {
      return unavailableReport(this.id, ["wasm-artifact-missing"]);
    }
    const report = supportedReport(this.id);
    report.features = ["hokusai-0.3.0"];
    return report;
  }

  /** Hokusai는 선형 광량으로 합성하고 sRGB로 인코딩해 돌려주므로 색 설정(color_h/s/v)도 선형이어야 sRGB 색이 그대로 나온다. */
  protected override get colorSpace(): "srgb" | "linear" {
    return "linear";
  }

  protected async prepareEngine(_env: LaneEnvironment, _config: LaneInit): Promise<void> {
    if (typeof WebAssembly !== "object") {
      throw new LaneUnavailableError("wasm-artifact-missing", "WebAssembly 전역이 없어 Hokusai를 로드할 수 없다");
    }
    try {
      this.runtime = await this.loadRuntime();
    } catch (error) {
      throw new LaneUnavailableError("wasm-artifact-missing", `Hokusai wasm 로드 실패: ${messageOf(error)}`);
    }
  }

  protected openStroke(mapping: MypaintMapping, seed: number): void {
    const runtime = this.runtime;
    if (!runtime) throw new InvalidStateError("beginStroke: Hokusai가 로드되지 않았다");
    let brush: HokusaiBrushHandle | null = null;
    let canvas: HokusaiCanvasHandle | null = null;
    try {
      brush = new runtime.HokusaiBrush(hokusaiBrushJson(mapping));
      canvas = new runtime.HokusaiCanvas(this.width, this.height, seed);
      canvas.beginStroke(brush, seed);
    } catch (error) {
      this.freeHandles(brush, canvas);
      throw new InvalidStateError(`Hokusai 획을 열 수 없다: ${messageOf(error)}`);
    }
    this.brush = brush;
    this.canvas = canvas;
  }

  protected pushSamples(samples: readonly EngineSample[]): void {
    const { brush, canvas } = this;
    if (!brush || !canvas) throw new InvalidStateError("addSamples: Hokusai 획이 열려 있지 않다");
    for (const s of samples) canvas.addSample(brush, s.x, s.y, s.pressure, s.tiltX, s.tiltY, s.tMs);
  }

  protected finishStroke(): Uint8Array {
    const { brush, canvas } = this;
    if (!brush || !canvas) throw new InvalidStateError("endStroke: Hokusai 획이 열려 있지 않다");
    canvas.finishStroke(brush);
    const frame = canvas.fullFrame();
    if (frame.byteLength !== this.width * this.height * 4) {
      throw new InvalidStateError(`Hokusai가 잘못된 크기의 프레임을 돌려줬다: ${frame.byteLength} B`);
    }
    return frame;
  }

  protected closeStroke(): void {
    const { brush, canvas } = this;
    this.brush = null;
    this.canvas = null;
    this.freeHandles(brush, canvas);
  }

  protected releaseEngine(): void {
    this.runtime = null;
  }

  /** 캔버스(타일 메모리)를 먼저 폐기하고 래퍼 객체를 해제한다. 한쪽이 던져도 나머지를 해제한 뒤 첫 오류를 다시 던진다. */
  private freeHandles(brush: HokusaiBrushHandle | null, canvas: HokusaiCanvasHandle | null): void {
    let failure: unknown = null;
    const attempt = (release: () => void): void => {
      try {
        release();
      } catch (error) {
        failure ??= error;
      }
    };
    if (canvas) {
      attempt(() => canvas.dispose());
      attempt(() => canvas.free());
    }
    if (brush) attempt(() => brush.free());
    if (failure !== null) throw failure;
  }
}

export function createHokusaiLane(options: HokusaiLaneOptions = {}): HokusaiLane {
  return new HokusaiLane(options);
}

export const HOKUSAI_LANE: LaneDescriptor = {
  id: HOKUSAI_LANE_ID,
  label: "Hokusai 0.3.0(자연 매체 래스터, wasm 비교)",
  kind: "comparison",
  status: "browser-verification-required",
  nodeVerification:
    "주입한 wasm 바이트로 실제 실행: 지그재그/곡선 렌더 비어 있지 않음·결정성·addSamples 분할 = 일괄·abortStroke 문서 보존·dispose 오류·미지원 거부·libmypaint와 같은 설정 문서(두 엔진 알파 커버리지 IoU ≥ 0.99: 256² 프리셋 6종 × fixture 2종 12건); Node에서 기본 로드 경로(번들러 URL)는 불가해 probe가 wasm-artifact-missing",
  browserVerification:
    "헤드리스 Chromium 141 + Vite dev(2026-10-08, scripts/browser-probe.mjs): pkg 동적 import·기본 wasm URL 초기화로 프리셋 4종 × fixture 2종 8건 실행·재실행 결정성, Node(주입 바이트)와 픽셀 해시 8/8 동일; 프로덕션 번들(vite build) 실행·실기기 브라우저는 미검증. 입력 파이프라인·물리·종이 그레인이 없어 Sumi와 같은 브러시가 아니다(유사한 의도의 비교)",
  create: () => createHokusaiLane(),
};
