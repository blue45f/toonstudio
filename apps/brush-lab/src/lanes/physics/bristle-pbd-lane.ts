import { PbdWorld2D } from "../../engine/physics/world2d/pbd-world";
import { supportedReport } from "../lane";

import { BristleLaneBase } from "./bristle-dab-synthesis";

import type { PbdWorldOptions } from "../../engine/physics/world2d/pbd-world";
import type { PhysicsWorld2D } from "../../engine/physics/world2d/types";
import type { BrushEngineLane, LaneCapabilityReport, LaneDescriptor, LaneEnvironment, LaneId, LaneMaturity } from "../lane";
import type { BristleLaneOptions } from "./bristle-dab-synthesis";

/**
 * 자체 PBD 물리 붓털 레인(실험, `maturity: "experimental"`).
 *
 * 붓 손잡이는 지면 항력 스프링 펜, 털은 손잡이 슬롯에 매달린 오일러 스프링 + PBD 접촉 원(`engine/physics/world2d`)이고
 * 털끝 경로를 따라 작은 둥근 dab를 찍는다(`bristle-dab-synthesis.ts`). 외부 의존 0, 순수 TS, 완전 결정적(같은 입력 → 같은 해시).
 * 무거운 로드가 없어 `init`이 실패할 일이 없고 `probe`는 항상 지원이다.
 *
 * 한계(정직 보고): 2D 상면 모델이라 3D 붓털의 좌굴 비단조는 압력 곡선 표(`buckling-3d`)로만 흉내 낸다. 털이 많을수록(N=128) 겹침이
 * 늘고 비용이 오른다. 성능 수치는 Node 22 단일 스레드이며 브라우저·실펜 손맛은 미검증이다.
 */
export const BRISTLE_PBD_LANE_ID: LaneId = "bristle-pbd";

export interface BristlePbdLaneOptions extends BristleLaneOptions {
  /** PBD 월드 설정(접촉 반복·보정 비율 등). */
  world?: PbdWorldOptions;
}

export class BristlePbdLane extends BristleLaneBase {
  readonly id: LaneId = BRISTLE_PBD_LANE_ID;
  readonly label = "물리 붓털(자체 PBD, 실험)";
  readonly maturity: LaneMaturity = "experimental";

  private readonly worldOptions: PbdWorldOptions;

  constructor(options: BristlePbdLaneOptions = {}) {
    super(options);
    this.worldOptions = options.world ?? {};
  }

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    // CPU 전용(외부 의존 0)이라 항상 지원된다.
    return supportedReport(this.id);
  }

  protected async prepareWorldFactory(_env: LaneEnvironment): Promise<() => PhysicsWorld2D> {
    const options = this.worldOptions;
    return () => new PbdWorld2D(options);
  }

  protected backendId(): string {
    return "pbd";
  }
}

export function createBristlePbdLane(options?: BristlePbdLaneOptions): BrushEngineLane {
  return new BristlePbdLane(options);
}

/** 레지스트리 디스크립터(실험 레인: 인증 판정·기본 경로에서 제외하고 UI는 `maturity`로 배지를 보인다). */
export const BRISTLE_PBD_LANE: LaneDescriptor = {
  id: BRISTLE_PBD_LANE_ID,
  label: "물리 붓털(자체 PBD, 실험)",
  kind: "candidate",
  status: "implemented",
  maturity: "experimental",
  nodeVerification:
    "엔진 PBD 월드(결정성 해시·접촉 비침투·큰 dt 서브스텝 분할·진단 카운터)·붓털 다발(압력 곡선 표·방향 회전·적재량 소진·고정 틱 구동)·월드 비교 지표(퍼짐 일관성·dt 스파이크·결정성) + 레인 계약(같은 입력 같은 해시·addSamples 분할 = 일괄·abortStroke 문서 보존·획 색·거부 프로그램·dispose 오류)",
  browserVerification: "없음(CPU 전용 순수 TS라 Node 값만 있다. 성능 수치는 Node 22 단일 스레드 기준이며 브라우저·워커·실펜 손맛 미검증)",
  create: () => createBristlePbdLane(),
};
