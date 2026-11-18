import {
  emptyStudioVirtualDecorationState,
  validateStudioVirtualDecorationSave,
  type StudioVirtualDistrictId,
} from "@toonstudio/contracts/studio-virtual-space-placement-contract";

import { apiFetch } from "@/platform/api";

import {
  readStudioVirtualDecorationState,
  writeStudioVirtualDecorationState,
  type StudioVirtualDecorationState,
} from "./studio-virtual-space-customization";

/**
 * 서버가 정본이고 localStorage는 캐시다. 그래서 읽을 때 서버를 먼저 보되, 서버가
 * 닿지 않으면 조용히 로컬로 내려온다. 오프라인에서 방이 비어 보이면 사용자는 자기
 * 공간을 잃은 것으로 알고 전부 다시 배치한다.
 *
 * 저장은 반대로 로컬을 먼저 갱신한 뒤 서버에 올린다. 서버가 죽어도 배치는 화면에
 * 남고, 다음 성공적인 저장이 그 값을 서버로 올린다.
 */
export type StudioVirtualDecorationSyncStatus = "server" | "local" | "conflict";

export interface StudioVirtualDecorationSyncResult {
  readonly status: StudioVirtualDecorationSyncStatus;
  readonly state: StudioVirtualDecorationState;
  /** conflict일 때만 채워진다. 서버가 지금 가진 상태. */
  readonly current?: StudioVirtualDecorationState;
}

export interface StudioVirtualDecorationTransport {
  load(scopeKey: string, districtKey: string): Promise<unknown>;
  save(scopeKey: string, districtKey: string, body: unknown): Promise<StudioVirtualDecorationTransportSave>;
}

export type StudioVirtualDecorationTransportSave =
  | { readonly kind: "ok"; readonly body: unknown }
  | { readonly kind: "conflict"; readonly body: unknown }
  | { readonly kind: "unavailable" };

function path(scopeKey: string, districtKey: string): string {
  return `/studio/space/decoration/${encodeURIComponent(scopeKey)}/${encodeURIComponent(districtKey)}`;
}

/** 서버가 돌려준 JSON을 계약으로 다시 거른다. 서버 응답도 신뢰하지 않는다. */
function acceptServerState(
  value: unknown,
  scopeKey: string,
  districtKey?: StudioVirtualDistrictId,
): StudioVirtualDecorationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (districtKey !== undefined && candidate.districtKey !== districtKey) return null;
  if (candidate.scopeKey !== scopeKey) return null;
  if (typeof candidate.revision !== "number" || !Number.isInteger(candidate.revision)) return null;

  const check = validateStudioVirtualDecorationSave({
    scopeKey,
    districtKey: candidate.districtKey,
    presetKey: candidate.presetKey,
    presentationMode: candidate.presentationMode,
    placements: candidate.placements,
    expectedRevision: candidate.revision,
    layoutWidth: candidate.layoutWidth,
    layoutHeight: candidate.layoutHeight,
  });
  if (!check.ok) return null;

  return Object.freeze({
    scopeKey,
    districtKey: check.value.districtKey,
    presetKey: check.value.presetKey,
    presentationMode: check.value.presentationMode,
    placements: Object.freeze([...check.value.placements]),
    revision: check.value.expectedRevision,
    layoutWidth: check.value.layoutWidth,
    layoutHeight: check.value.layoutHeight,
  });
}

export function createDefaultStudioVirtualDecorationTransport(): StudioVirtualDecorationTransport {
  return {
    async load(scopeKey, districtKey) {
      const response = await apiFetch(path(scopeKey, districtKey), { method: "GET" });
      if (!response.ok) throw new Error(`decoration load failed: ${response.status}`);
      return response.json();
    },
    async save(scopeKey, districtKey, body) {
      let response: Response;
      try {
        response = await apiFetch(path(scopeKey, districtKey), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } catch {
        return { kind: "unavailable" };
      }
      if (response.status === 409) return { kind: "conflict", body: await safeJson(response) };
      if (!response.ok) return { kind: "unavailable" };
      return { kind: "ok", body: await safeJson(response) };
    },
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createStudioVirtualDecorationSync(
  transport: StudioVirtualDecorationTransport,
  mirrorLocal = true,
): {
  load(scopeKey: string, districtKey: StudioVirtualDistrictId, followStoredDistrict?: boolean): Promise<StudioVirtualDecorationSyncResult>;
  save(
    scopeKey: string,
    districtKey: StudioVirtualDistrictId,
    next: StudioVirtualDecorationState,
    expectedRevision?: number,
  ): Promise<StudioVirtualDecorationSyncResult>;
} {
  return {
    async load(scopeKey, districtKey, followStoredDistrict = false) {
      const local = readStudioVirtualDecorationState(scopeKey);
      let body: unknown;
      try {
        body = await transport.load(scopeKey, districtKey);
      } catch {
        return { status: "local", state: local };
      }

      // 서버 행은 계정과 공간 단위이며 districtKey는 최초 빈 배치의 힌트다.
      const accepted = acceptServerState(body, scopeKey, followStoredDistrict ? undefined : districtKey);
      if (!accepted) return { status: "local", state: local };

      if (mirrorLocal) writeStudioVirtualDecorationState(accepted, scopeKey);
      return { status: "server", state: accepted };
    },

    async save(scopeKey, districtKey, next, expectedRevision = next.revision) {
      const outgoing = validateStudioVirtualDecorationSave({
        scopeKey,
        districtKey,
        presetKey: next.presetKey,
        presentationMode: next.presentationMode,
        placements: next.placements,
        expectedRevision,
        layoutWidth: next.layoutWidth ?? 1280,
        layoutHeight: next.layoutHeight ?? 960,
      });
      if (!outgoing.ok) return { status: "local", state: readStudioVirtualDecorationState(scopeKey) };

      const optimistic: StudioVirtualDecorationState = Object.freeze({
        scopeKey,
        districtKey,
        presetKey: outgoing.value.presetKey,
        presentationMode: outgoing.value.presentationMode,
        placements: Object.freeze([...outgoing.value.placements]),
        revision: next.revision,
        layoutWidth: outgoing.value.layoutWidth,
        layoutHeight: outgoing.value.layoutHeight,
      });
      if (mirrorLocal) writeStudioVirtualDecorationState(optimistic, scopeKey);

      const result = await transport.save(scopeKey, districtKey, {
        scopeKey: outgoing.value.scopeKey,
        districtKey: outgoing.value.districtKey,
        presetKey: outgoing.value.presetKey,
        presentationMode: outgoing.value.presentationMode,
        placements: outgoing.value.placements,
        expectedRevision: outgoing.value.expectedRevision,
        layoutWidth: outgoing.value.layoutWidth,
        layoutHeight: outgoing.value.layoutHeight,
      });

      if (result.kind === "unavailable") return { status: "local", state: optimistic };

      if (result.kind === "conflict") {
        const payload = result.body;
        const current = payload && typeof payload === "object" && "current" in payload ? payload.current : payload;
        let serverState = acceptServerState(current, scopeKey);
        if (!serverState) {
          // 최초 INSERT 경합 응답은 본문에 현재 행이 없어 한 번 조회한다.
          try { serverState = acceptServerState(await transport.load(scopeKey, districtKey), scopeKey); }
          catch { /* 재조회할 수 없어도 충돌 상태와 기기의 편집본을 유지한다. */ }
          if (serverState?.revision === expectedRevision) return { status: "local", state: optimistic };
        }
        if (mirrorLocal && serverState) writeStudioVirtualDecorationState(serverState, scopeKey);
        return { status: "conflict", state: optimistic, ...(serverState ? { current: serverState } : {}) };
      }
      const serverState = acceptServerState(result.body, scopeKey, districtKey);
      if (!serverState) return { status: "local", state: optimistic };

      if (mirrorLocal) writeStudioVirtualDecorationState(serverState, scopeKey);
      return { status: "server", state: serverState };
    },
  };
}

export function emptyServerDecorationState(
  scopeKey: string,
  districtKey: StudioVirtualDistrictId,
): StudioVirtualDecorationState {
  const empty = emptyStudioVirtualDecorationState(scopeKey, districtKey);
  return Object.freeze({ ...empty, placements: Object.freeze([]) });
}
