/**
 * Studio Hybrid DCC 지속성 훅 재수출 창구.
 * 정본 계약은 `../contracts/studio-hybrid-dcc-persistence` 에 두어
 * 호스트 진입 경로가 hybrid-dcc 금지 도메인으로 정적 엣지를 만들지 않도록 격리한다.
 */
export {
  useStudioHybridDccPersistence,
  type StudioHybridDccPersistenceContext,
  type StudioHybridDccPersistenceReceiptEvidence,
  type StudioHybridDccPersistenceResult,
} from "../contracts/studio-hybrid-dcc-persistence";
