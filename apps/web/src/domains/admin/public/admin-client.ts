/**
 * 다른 도메인(auth 메뉴, collaboration 신고 검토 등)이 관리자 권한 확인 및
 * 게이트 상태 훅을 사용할 때 거치는 명시적 공개 경계.
 */
export {
  adminFetch,
  type AdminMe,
} from "../components/admin-client";
export {
  AdminGateOverrideProvider,
  useAdminGate,
  type AdminGateState,
} from "../components/admin-gate-state";
