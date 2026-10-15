import type { CollabAggregateInput } from "./collab-notification-landing-source";

import { api } from "@/platform/api";

export type ProductionCollaborationModel =
  | "solo"
  | "co-creator"
  | "story-led-commission"
  | "art-led-commission"
  | "adaptation"
  | "studio-production"
  | "anthology"
  | "replacement";

export interface ProductionProjectAccess {
  readonly view: boolean;
  readonly comment: boolean;
  readonly edit: boolean;
  readonly manage: boolean;
  readonly owner: boolean;
  readonly role: "owner" | "admin" | "editor" | "commenter" | "viewer" | null;
}

export interface ProductionProjectSummary {
  readonly projectId: string;
  readonly workId: string;
  readonly title: string;
  readonly coverImageUrl: string | null;
  readonly collaborationModel: ProductionCollaborationModel;
  readonly revision: number;
  readonly updatedAt: string;
  readonly access: ProductionProjectAccess;
  readonly healthScore: number;
  readonly activeEpisodeCount: number;
  readonly readyBufferCount: number;
  readonly criticalRiskCount: number;
  readonly overdueTaskCount: number;
  readonly blockedTaskCount: number;
  readonly unassignedTaskCount: number;
  readonly reviewTaskCount: number;
  readonly nextReleaseAt: string | null;
  readonly forecastFinishAt: string | null;
  readonly scheduleConfidencePercent: number | null;
}

export interface ProductionProjectListResponse {
  readonly projects: readonly ProductionProjectSummary[];
}

export interface ProductionPersonalInboxItem {
  readonly bucket: "dueToday" | "inProgress" | "review" | "ready" | "waitingInput" | "blockingOthers";
  readonly projectId: string;
  readonly projectTitle: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly processKey: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly estimateHours: number;
  readonly episodeId: string | null;
}
export interface ProductionPersonalInboxResponse {
  readonly items: readonly ProductionPersonalInboxItem[];
  readonly counts: Readonly<Record<ProductionPersonalInboxItem["bucket"], number>>;
}

export function listProductionProjects(): Promise<ProductionProjectListResponse> {
  return api.get("/production/projects");
}

export function getProductionPersonalInbox(): Promise<ProductionPersonalInboxResponse> {
  return api.get("/production/inbox");
}

/**
 * 프로젝트 기록 중 랜딩의 협업 알림 투영이 읽는 부분집합.
 * 서버 응답은 프로젝트 전체 기록이지만, 랜딩은 알림·검수 결정·인계만 읽는다. 전체 도메인 타입을
 * 이 얇은 클라이언트에 끌어오지 않도록 알림 어댑터가 정의한 구조적 입력 타입만 쓴다.
 */
export interface ProductionProjectCollabRecord {
  readonly aggregate: CollabAggregateInput;
}

/** 같은 엔드포인트의 얇은 읽기. 프로젝트 워크스페이스용 전체 클라이언트(production-api)를 랜딩이 가져오지 않게 한다. */
export function getProductionProjectCollabRecord(projectId: string): Promise<ProductionProjectCollabRecord> {
  return api.get(`/production/projects/${encodeURIComponent(projectId)}`);
}
