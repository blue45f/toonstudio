import {
  productionChangeCreateSchema,
  productionChangeListResponseSchema,
  productionChangeResponseSchema,
  productionChangeSaveSchema,
  productionChangeTransitionSchema,
} from "@toonstudio/contracts/admin-production-change";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";

import { AdminApiError, requestAdminJson } from "../../../platform/http/admin-api";

import type { ProductionChangeCreate, ProductionChangeSave, ProductionChangeTransition, RequestRecord } from "@toonstudio/contracts/admin-production-change";

const BASE = "/api/admin/production-changes";

/** 형식 확인에 실패한 응답을 빈 목록이나 저장 성공으로 대체하지 않는다. */
export async function loadProductionChanges(signal?: AbortSignal): Promise<RequestRecord[]> {
  const parsed = productionChangeListResponseSchema.safeParse(await requestAdminJson<unknown>(BASE, { signal }));
  if (!parsed.success) throw new AdminApiError(502, "제작 변경 목록의 서버 응답을 확인하지 못했습니다.");
  return parsed.data.requests;
}

function requestPath(id: string, action: string): string {
  if (!id.trim() || id.length > 256) throw new Error("변경 요청 식별자를 확인해 주세요.");
  return `${BASE}/${encodeURIComponent(id)}/${action}`;
}

async function recordResponse(path: string, body: unknown, signal?: AbortSignal): Promise<RequestRecord> {
  const parsed = productionChangeResponseSchema.safeParse(await requestAdminJson<unknown>(path, { body, signal }));
  if (!parsed.success) throw new AdminApiError(502, "저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요.");
  return parsed.data.request;
}

export function createProductionChange(input: ProductionChangeCreate, signal?: AbortSignal): Promise<RequestRecord> {
  return recordResponse(BASE, productionChangeCreateSchema.parse(input), signal);
}

export function saveProductionChange(id: string, input: ProductionChangeSave, signal?: AbortSignal): Promise<RequestRecord> {
  return recordResponse(requestPath(id, "save"), productionChangeSaveSchema.parse(input), signal);
}

export function transitionProductionChange(id: string, input: ProductionChangeTransition, signal?: AbortSignal): Promise<RequestRecord> {
  return recordResponse(requestPath(id, "transition"), productionChangeTransitionSchema.parse(input), signal);
}

export async function uploadProductionCapture(file: File, signal?: AbortSignal): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("PNG, JPEG, WebP 이미지만 등록할 수 있습니다.");
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error("캡처 파일은 0바이트보다 크고 5MiB 이하여야 합니다.");
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE}/captures`, {
    method: "POST", body, signal, credentials: "same-origin", redirect: "error", cache: "no-store",
    headers: { [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE },
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = value && typeof value === "object" && "message" in value && typeof value.message === "string" ? value.message : "캡처를 등록하지 못했습니다.";
    throw new AdminApiError(response.status, message);
  }
  if (!value || typeof value !== "object" || !("url" in value) || typeof value.url !== "string"
    || !/^\/api\/admin\/production-changes\/captures\/[0-9a-f-]{36}$/iu.test(value.url)) {
    throw new AdminApiError(502, "업로드한 캡처의 주소를 확인하지 못했습니다.");
  }
  return value.url;
}
