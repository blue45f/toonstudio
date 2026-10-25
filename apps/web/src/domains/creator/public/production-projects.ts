// 연재 센터·참여 알림 등 다른 도메인이 제작 허브의 프로젝트 목록과 개인 할 일함을 읽을 때 거치는 공개 경계.
export {
  getProductionPersonalInbox,
  getProductionProject,
  listProductionProjects,
} from "../production-hub/production-api";
export type {
  ProductionProjectRecord,
  ProductionProjectSummary,
} from "../production-hub/production-api";
