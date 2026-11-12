import { requestAdminJson } from "./admin-api";

export interface AdminIdentity {
  readonly id: string;
  readonly role: "admin" | "operator";
}

export function parseAdminIdentity(value: unknown): AdminIdentity {
  if (!value || typeof value !== "object" || !("id" in value) || !("role" in value)
    || typeof value.id !== "string" || !value.id.trim() || value.id.length > 256
    || (value.role !== "admin" && value.role !== "operator")) {
    throw new Error("관리자 권한을 확인할 수 없습니다. 로그인과 계정 권한을 확인하세요.");
  }
  return { id: value.id, role: value.role };
}

export async function loadAdminIdentity(signal?: AbortSignal): Promise<AdminIdentity> {
  return parseAdminIdentity(await requestAdminJson<unknown>("/api/admin/me", { signal }));
}
