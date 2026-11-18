/** 사업 자료의 권한은 서버가 확인하며 브라우저가 제출하는 역할·owner는 신뢰하지 않는다. */
export type AdminWorkspaceScope = "operations" | "business";

export interface AdminWorkspaceAreaAccess {
  canRead: boolean;
  canWrite: boolean;
  canExport: boolean;
  canManageAccess: boolean;
}

export interface AdminWorkspaceAccess {
  operations: AdminWorkspaceAreaAccess;
  business: AdminWorkspaceAreaAccess;
}

export interface AdminWorkspaceGrantInput {
  mutationId: string;
  userId: string;
  canRead: boolean;
  canWrite: boolean;
  canExport: boolean;
}

export interface AdminWorkspaceGrantAck {
  updatedAt: string;
  replayed: boolean;
}
