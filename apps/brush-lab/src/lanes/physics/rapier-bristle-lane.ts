import { LaneUnavailableError } from "../../engine/core/errors";
import { supportedReport, unavailableReport } from "../lane";

import { BristleLaneBase } from "./bristle-dab-synthesis";
import { RAPIER_FOOTPRINT_KO } from "./rapier-footprint";
import { loadRapier } from "./rapier-loader";
import { RapierWorld2D } from "./rapier-world";

import type { PhysicsWorld2D } from "../../engine/physics/world2d/types";
import type { BrushEngineLane, LaneCapabilityReport, LaneDescriptor, LaneEnvironment, LaneId, LaneMaturity } from "../lane";
import type { BristleLaneOptions } from "./bristle-dab-synthesis";
import type { RapierImporter, RapierModule } from "./rapier-loader";

/**
 * Rapier 2D(compat) 물리 붓털 레인(실험 배지 필수). 자체 PBD 레인과 같은 붓털 다발·dab 합성을 쓰고 월드만 Rapier로 바꾼다.
 *
 * - `@dimforge/rapier2d-compat`(Apache-2.0)는 **`init()`에서 동적 import**하고 `RAPIER.init()`까지 끝낸다. JS gzip 약 1.29 MB(wasm base64 내장),
 *   첫 로드 약 150~190 ms(Node 22)라 정적 import 금지다. 수치의 단일 출처는 `rapier-footprint.ts`다.
 * - 무음 대체 금지(ADR-0018): 로드·초기화 실패는 `LaneUnavailableError`(사유 코드 + 한글 문구)로 던지고 **자체 PBD로 바꾸지 않는다**.
 *   로더는 주입할 수 있어(`options.importer`) 실패 경로를 스텁으로 시험한다.
 * - 같은 머신 결정성은 Node에서 측정한다(같은 입력 두 번 → 같은 해시). 교차 머신·교차 브라우저·wasm SIMD 차이는 미검증이다.
 * - 브라우저(Vite 번들 청크 분리·wasm 초기화)는 미검증이다.
 */
export const BRISTLE_RAPIER_LANE_ID: LaneId = "bristle-rapier";

export interface RapierBristleLaneOptions extends BristleLaneOptions {
  /** 모듈 임포터 주입(시험용). 생략하면 `@dimforge/rapier2d-compat` 동적 import와 프로세스 캐시를 쓴다. */
  importer?: RapierImporter;
}

export class RapierBristleLane extends BristleLaneBase {
  readonly id: LaneId = BRISTLE_RAPIER_LANE_ID;
  readonly label = "물리 붓털(Rapier 2D, 실험)";
  readonly maturity: LaneMaturity = "experimental";

  private readonly importer: RapierImporter | undefined;
  private module: RapierModule | null = null;

  constructor(options: RapierBristleLaneOptions = {}) {
    super(options);
    this.importer = options.importer;
  }

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    // 무거운 모듈은 probe에서 불러오지 않는다(init에서 처음 불러온다). 여기서는 wasm 지원만 본다.
    if (typeof WebAssembly !== "object" || WebAssembly === null) return unavailableReport(this.id, ["feature-missing"]);
    return supportedReport(this.id);
  }

  protected async prepareWorldFactory(_env: LaneEnvironment): Promise<() => PhysicsWorld2D> {
    let mod: RapierModule;
    try {
      mod = await loadRapier(this.importer);
    } catch (error) {
      if (error instanceof LaneUnavailableError) throw error;
      throw new LaneUnavailableError("wasm-artifact-missing", `Rapier 물리 모듈을 불러오지 못했다: ${error instanceof Error ? error.message : String(error)}`, { laneId: this.id });
    }
    this.module = mod;
    return () => new RapierWorld2D(mod);
  }

  protected backendId(): string {
    return "rapier2d";
  }

  /** 로드된 Rapier 모듈 여부(시험용). */
  isLoaded(): boolean {
    return this.module !== null;
  }
}

export function createRapierBristleLane(options?: RapierBristleLaneOptions): BrushEngineLane {
  return new RapierBristleLane(options);
}

/** 레지스트리 디스크립터. */
export const BRISTLE_RAPIER_LANE: LaneDescriptor = {
  id: BRISTLE_RAPIER_LANE_ID,
  label: "물리 붓털(Rapier 2D, 실험)",
  kind: "candidate",
  status: "implemented",
  maturity: "experimental",
  nodeVerification:
    "실제 Rapier wasm을 Node에서 동적 import·초기화해 레인 계약(같은 머신 같은 입력 두 번 같은 해시·addSamples 분할 = 일괄·abortStroke 문서 보존·획 색·거부 프로그램·dispose 오류)과 로드 실패 경로(스텁 임포터: import·init·모양 불일치 → LaneUnavailableError, 자체 PBD로 대체 없음)를 확인",
  browserVerification: `없음(동적 import·wasm 초기화·Vite 청크 분리·교차 머신/브라우저 결정성 미검증. ${RAPIER_FOOTPRINT_KO})`,
  create: () => createRapierBristleLane(),
};
