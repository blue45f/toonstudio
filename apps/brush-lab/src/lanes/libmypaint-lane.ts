import { createLibMypaintIncrementalStrokeSession } from "@toonstudio/studio-brush-platform/libmypaint";

// 핀된 libmypaint 로더는 패키지 exports에 없어 apps/web의 네이티브 프로브 워커와 같은 상대 경로로 가져온다(통합 담당 요청 참고).
import { loadLibMypaint } from "../../../../packages/studio-brush-platform/src/libmypaint/index";
import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";

import { IsolatedStrokeLane } from "./isolated-stroke-lane";
import { supportedReport, unavailableReport } from "./lane";

import type { EngineSample } from "./isolated-stroke-lane";
import type { LaneCapabilityReport, LaneDescriptor, LaneEnvironment, LaneId, LaneInit, LaneKind, LaneStatus } from "./lane";
import type { MypaintMapping } from "./mypaint-settings-map";
import type { LibMypaintRaw } from "../../../../packages/studio-brush-platform/src/libmypaint/index";
import type { Rgba } from "../engine/core/types";
import type { LibMypaintIncrementalStrokeSession } from "@toonstudio/studio-brush-platform/libmypaint";

/**
 * libmypaint 비교 레인. MyPaint의 브러시 엔진(libmypaint v1.6.1, ISC, 핀된 wasm)을 Sumi와 같은 fixture·같은 입력으로 나란히 본다.
 *
 * - 프로그램 → 엔진 설정: `mypaint-settings-map.ts`가 Sumi 프로그램에서 `.myb` 설정(지름·경도·흐름·간격·압력 동역학·색)을 계산하고
 *   `applyMybSettings` 주입 API로 브러시를 프로그램한다. 옮기지 못한 기능은 `mappingReceipt()`에 남고, 습식·임파스토·smudge는 거부한다.
 * - 입력 공급: 플랫폼 세션의 계약 그대로다 — 첫 표본 dtime 0.0001 s, 이후 tMs 차/1000, 획이 끝나면 16 ms idle 8회로 꼬리를 푼다.
 *   표본은 Sumi 입력 파이프라인을 거치지 않고 원시 값으로 공급한다.
 * - 출력: 엔진 표면(straight RGBA8, 값은 엔진의 비선형 sRGB 공간에서 누적)을 선형 premultiplied 문서로 합성해 `readback`·`readbackLinear`로 정규화한다.
 * - 결정성: 같은 입력·같은 시드의 재생은 같은 픽셀이다(libc rand를 획마다 재시드, 세션 테스트가 분할 불변을 고정). 한 wasm 인스턴스는
 *   동시에 획 하나만 연다(두 레인이 획을 섞으면 `invalid-state`로 드러난다).
 * - 한계: dab 수를 엔진이 노출하지 않아 영수증 `dabCount`는 엔진에 공급한 정본 표본 수다(엔진 반환값 '그림' 플래그는 표본별 dab 수가 아니다). 입력 파이프라인·물리·테이퍼·종이 그레인은 없다.
 */
export const LIBMYPAINT_LANE_ID: LaneId = "libmypaint";

/** libmypaint 표면 한도(플랫폼 세션과 같다): 한 변 ≤ 4096, 면적 ≤ 4,194,304 px. */
export const LIBMYPAINT_MAX_DIMENSION = 4096;
export const LIBMYPAINT_MAX_PIXELS = 4_194_304;

export interface LibMypaintLaneOptions {
  /** wasm 로더 주입(테스트·별도 인스턴스용). 기본은 핀된 모듈을 한 번 로드해 공유한다. */
  loadRaw?: () => Promise<LibMypaintRaw>;
  /** 획 색(sRGB straight). 기본 검정 불투명. */
  color?: Rgba;
  /** 획 끝 idle 펌프 횟수(기본 8, 0..64). */
  finishTailSteps?: number;
}

function reasonOfLoad(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class LibMypaintLane extends IsolatedStrokeLane {
  readonly id: LaneId = LIBMYPAINT_LANE_ID;
  readonly label = "libmypaint 1.6.1(MyPaint 브러시 엔진, wasm 비교)";
  readonly kind: LaneKind = "comparison";
  readonly status: LaneStatus = "implemented";
  readonly engineVersion = `${SUMI_ENGINE_VERSION}+libmypaint-1.6.1`;

  private raw: LibMypaintRaw | null = null;
  private session: LibMypaintIncrementalStrokeSession | null = null;
  private readonly options: LibMypaintLaneOptions;

  constructor(options: LibMypaintLaneOptions = {}) {
    super(options.color ?? [0, 0, 0, 1]);
    this.options = options;
  }

  private loadRaw(): Promise<LibMypaintRaw> {
    return (this.options.loadRaw ?? loadLibMypaint)();
  }

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    if (typeof WebAssembly !== "object") return unavailableReport(this.id, ["wasm-artifact-missing"]);
    try {
      const raw = await this.loadRaw();
      const report = supportedReport(this.id);
      report.features = [raw.version()];
      report.limits = { maxSurfaceDimension: LIBMYPAINT_MAX_DIMENSION, maxSurfacePixels: LIBMYPAINT_MAX_PIXELS };
      return report;
    } catch {
      return unavailableReport(this.id, ["wasm-artifact-missing"]);
    }
  }

  protected async prepareEngine(_env: LaneEnvironment, config: LaneInit): Promise<void> {
    if (typeof WebAssembly !== "object") {
      throw new LaneUnavailableError("wasm-artifact-missing", "WebAssembly 전역이 없어 libmypaint를 로드할 수 없다");
    }
    if (config.width > LIBMYPAINT_MAX_DIMENSION || config.height > LIBMYPAINT_MAX_DIMENSION || config.width * config.height > LIBMYPAINT_MAX_PIXELS) {
      throw new LaneUnavailableError(
        "limit-exceeded",
        `libmypaint 표면 한도 초과: ${config.width}×${config.height} (한 변 ≤ ${LIBMYPAINT_MAX_DIMENSION}, 면적 ≤ ${LIBMYPAINT_MAX_PIXELS} px)`,
      );
    }
    try {
      this.raw = await this.loadRaw();
    } catch (error) {
      throw new LaneUnavailableError("wasm-artifact-missing", `libmypaint wasm 로드 실패: ${reasonOfLoad(error)}`);
    }
  }

  protected openStroke(mapping: MypaintMapping, seed: number): void {
    const raw = this.raw;
    if (!raw) throw new InvalidStateError("beginStroke: libmypaint가 로드되지 않았다");
    try {
      const options: Parameters<typeof createLibMypaintIncrementalStrokeSession>[2] = { width: this.width, height: this.height, seed };
      if (this.options.finishTailSteps !== undefined) options.finishTailSteps = this.options.finishTailSteps;
      this.session = createLibMypaintIncrementalStrokeSession(raw, mapping.document, options);
    } catch (error) {
      // 같은 wasm 인스턴스에 이미 열린 획이 있으면 세션이 던진다. 사유를 한글로 덧붙여 드러낸다(다른 레인으로 전환하지 않는다).
      throw new InvalidStateError(`libmypaint 획을 열 수 없다: ${reasonOfLoad(error)}`);
    }
    const unknown = [...this.session.settings.unknownSettings, ...this.session.settings.unknownInputs];
    if (unknown.length > 0) {
      const session = this.session;
      this.session = null;
      session.dispose();
      throw new InvalidStateError(`libmypaint가 모르는 설정: ${unknown.join(", ")}`);
    }
  }

  protected pushSamples(samples: readonly EngineSample[]): void {
    const session = this.session;
    if (!session) throw new InvalidStateError("addSamples: libmypaint 획이 열려 있지 않다");
    session.append(samples);
  }

  protected finishStroke(): Uint8Array {
    const session = this.session;
    if (!session) throw new InvalidStateError("endStroke: libmypaint 획이 열려 있지 않다");
    return session.finish();
  }

  protected closeStroke(): void {
    const session = this.session;
    this.session = null;
    if (session) session.dispose();
  }

  protected releaseEngine(): void {
    this.raw = null;
  }
}

export function createLibMypaintLane(options: LibMypaintLaneOptions = {}): LibMypaintLane {
  return new LibMypaintLane(options);
}

export const LIBMYPAINT_LANE: LaneDescriptor = {
  id: LIBMYPAINT_LANE_ID,
  label: "libmypaint 1.6.1(MyPaint 브러시 엔진, wasm 비교)",
  kind: "comparison",
  status: "implemented",
  nodeVerification:
    "핀된 wasm 실제 로드·지그재그/곡선 렌더 비어 있지 않음·결정성(같은 입력 두 번 = 같은 해시)·addSamples 분할 = 일괄·abortStroke 문서 보존·dispose 오류·미지원(습식·임파스토·smudge) 거부·매핑 영수증",
  browserVerification:
    "헤드리스 Chromium 141 + Vite dev(2026-10-08, scripts/browser-probe.mjs, CPU wasm이라 GPU와 무관): 프리셋 4종 × fixture 2종 8건 실행·재실행 결정성, Node와 픽셀 해시 8/8 동일; 프로덕션 번들(vite build) 실행·실기기 브라우저는 미검증. 입력 파이프라인·물리·종이 그레인이 없어 Sumi와 같은 브러시가 아니다(유사한 의도의 비교)",
  create: () => createLibMypaintLane(),
};
