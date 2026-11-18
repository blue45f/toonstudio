/** 서비스 관리자 여부와 별개인 사업 자료의 명시적 접근 권한이다. */
export interface BusinessPlanAccess {
  canRead: boolean;
  canWrite: boolean;
  canExport: boolean;
  canManageAccess: boolean;
  canClaimOwnership: boolean;
}

export interface BusinessPlanAccessGrant {
  userId: string;
  canRead: true;
  canWrite: boolean;
  canExport: boolean;
  updatedAt: string;
}

export interface BusinessPlanAccessList {
  ownerUserId: string;
  grants: BusinessPlanAccessGrant[];
}

export interface ChangeBusinessPlanAccessRequest {
  mutationId: string;
  userId: string;
  canRead: boolean;
  canWrite: boolean;
  canExport: boolean;
}

export interface BusinessPlanAccessAck {
  updatedAt: string;
  replayed: boolean;
}

export function parseBusinessPlanAccess(value: unknown): BusinessPlanAccess | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = ["canRead", "canWrite", "canExport", "canManageAccess", "canClaimOwnership"] as const;
  if (Object.keys(value).length !== keys.length || !keys.every((key) => key in value && typeof Reflect.get(value, key) === "boolean")) return null;
  const result = Object.fromEntries(keys.map((key) => [key, Reflect.get(value, key)])) as unknown as BusinessPlanAccess;
  if (!result.canRead && (result.canWrite || result.canExport || result.canManageAccess)) return null;
  if (result.canManageAccess && (!result.canWrite || !result.canExport)) return null;
  if (result.canClaimOwnership && (result.canRead || result.canWrite || result.canExport || result.canManageAccess)) return null;
  return result;
}
