import { useCallback, useEffect, useReducer, useRef } from "react";

import { HUB_CARD_LIMIT, HUB_CARD_STEP } from "./material-hub-model";

import type { HubErrorCode, HubSlot, HubSlotState } from "./material-hub-model";
import type { CreatorResource } from "@/shared/lib/creator-resources";

import { apiFetch, apiPath } from "@/platform/api";
import { parseSearchResult } from "@/shared/lib/creator-resources";

/**
 * 문장 허브의 제공처 호출 훅.
 *
 * 기존 검색 화면과 같은 API(`GET /api/creator-resources/search`)와 같은 응답 검증(parseSearchResult)을 쓴다.
 * 이 훅은 effect 로 스스로 호출하지 않는다 — `search`·`retry`·`loadMore` 는 사용자의 명시적 행동을 처리하는
 * 이벤트 핸들러에서만 부른다. 같은 제공처·검색어의 결과는 캐시해 두고 다시 부르지 않는다.
 */

const REQUEST_TIMEOUT_MS = 30_000;

class HubFetchError extends Error {
  constructor(readonly code: HubErrorCode) {
    super(code);
  }
}

type HubAction =
  | { type: "start"; slot: Pick<HubSlot, "key" | "provider" | "query"> }
  | { type: "more-start"; key: string }
  | { type: "loaded"; key: string; page: number; status: HubSlotState["status"]; items: readonly CreatorResource[]; hasMore: boolean; total?: number; message: string }
  | { type: "failed"; key: string; code: HubErrorCode }
  | { type: "show-more"; key: string };

type HubSlots = Readonly<Record<string, HubSlotState>>;

const EMPTY_SLOTS: HubSlots = {};

function mergeItems(previous: readonly CreatorResource[], next: readonly CreatorResource[]): CreatorResource[] {
  const seen = new Set(previous.map((item) => item.id));
  return [...previous, ...next.filter((item) => !seen.has(item.id))];
}

function reducer(state: HubSlots, action: HubAction): HubSlots {
  if (action.type === "start") {
    const { key, provider, query } = action.slot;
    return {
      ...state,
      [key]: { key, provider, query, status: "loading", items: [], page: 1, hasMore: false, message: "", errorCode: null, loadingMore: false, visible: HUB_CARD_LIMIT },
    };
  }
  const current = state[action.key];
  if (!current) return state;
  switch (action.type) {
    case "more-start":
      return { ...state, [action.key]: { ...current, loadingMore: true } };
    case "show-more":
      return { ...state, [action.key]: { ...current, visible: Math.min(current.visible + HUB_CARD_STEP, current.items.length) } };
    case "loaded": {
      const items = action.page === 1 ? action.items : mergeItems(current.items, action.items);
      const status = action.status === "ready" && items.length === 0 ? "empty" : action.status;
      return {
        ...state,
        [action.key]: {
          ...current,
          status,
          items,
          page: action.page,
          hasMore: action.hasMore,
          ...(action.total !== undefined ? { total: action.total } : {}),
          message: action.message,
          errorCode: null,
          loadingMore: false,
          // 다음 페이지를 받았다면 방금 받은 만큼 바로 보여 준다. 처음 받은 페이지는 제공처당 상한만큼만 보인다.
          visible: action.page === 1 ? Math.min(HUB_CARD_LIMIT, items.length) : Math.min(current.visible + HUB_CARD_STEP, items.length),
        },
      };
    }
    case "failed":
      // 이미 받은 결과가 있으면(더 보기 실패) 지우지 않고 오류만 알린다.
      return {
        ...state,
        [action.key]: { ...current, status: current.items.length > 0 ? current.status : "error", errorCode: action.code, loadingMore: false },
      };
    default:
      return state;
  }
}

export interface MaterialHubSearch {
  readonly slots: HubSlots;
  /** 사용자가 제출·"찾기"를 눌렀을 때: 아직 받지 않았거나 실패한 제공처만 부른다. */
  readonly search: (slots: readonly HubSlot[]) => void;
  /** "다시 시도": 같은 제공처·검색어를 처음부터 다시 부른다. */
  readonly retry: (slot: Pick<HubSlot, "key" | "provider" | "query">) => void;
  /** "더 보기": 받아 둔 결과를 더 보여 주고, 다 보여 줬다면 다음 페이지를 부른다. */
  readonly loadMore: (key: string) => void;
}

export function useMaterialHubSearch(): MaterialHubSearch {
  const [slots, dispatch] = useReducer(reducer, EMPTY_SLOTS);
  const slotsRef = useRef<HubSlots>(slots);
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const controller of active.values()) controller.abort();
      active.clear();
    };
  }, []);

  const fetchPage = useCallback((slot: Pick<HubSlot, "key" | "provider" | "query">, page: number) => {
    controllers.current.get(slot.key)?.abort();
    const controller = new AbortController();
    controllers.current.set(slot.key, controller);
    const timer = window.setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
    if (page === 1) dispatch({ type: "start", slot });
    else dispatch({ type: "more-start", key: slot.key });
    const params = new URLSearchParams({ provider: slot.provider, q: slot.query, page: String(page) });
    void apiFetch(apiPath(`/api/creator-resources/search?${params}`), { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 429) throw new HubFetchError("rate_limited");
        if (!response.ok) throw new HubFetchError("http");
        // JSON 이 아닌 응답은 네트워크 오류가 아니라 형식 오류다.
        const body: unknown = await response.json().catch(() => null);
        const parsed = parseSearchResult(body);
        if (!parsed || parsed.provider !== slot.provider) throw new HubFetchError("format");
        if (controller.signal.aborted) return;
        dispatch({
          type: "loaded",
          key: slot.key,
          page,
          status: parsed.status,
          items: parsed.items,
          hasMore: parsed.hasMore,
          ...(parsed.total !== undefined ? { total: parsed.total } : {}),
          message: parsed.message,
        });
      })
      .catch((cause: unknown) => {
        // 사용자가 다시 요청했거나 화면을 떠나 취소한 요청은 오류로 알리지 않는다. 시간 초과만 오류다.
        if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
        const code: HubErrorCode = controller.signal.aborted
          ? "timeout"
          : cause instanceof HubFetchError ? cause.code : "network";
        dispatch({ type: "failed", key: slot.key, code });
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (controllers.current.get(slot.key) === controller) controllers.current.delete(slot.key);
      });
  }, []);

  const search = useCallback((requested: readonly HubSlot[]) => {
    const seen = new Set<string>();
    for (const slot of requested) {
      if (seen.has(slot.key) || controllers.current.has(slot.key)) continue;
      seen.add(slot.key);
      const known = slotsRef.current[slot.key];
      // 이미 받았거나 받는 중이면 다시 부르지 않는다. 실패·일시 불가였던 곳만 다시 부른다.
      if (known && known.status !== "error" && known.status !== "unavailable") continue;
      fetchPage(slot, 1);
    }
  }, [fetchPage]);

  const retry = useCallback((slot: Pick<HubSlot, "key" | "provider" | "query">) => {
    fetchPage(slot, 1);
  }, [fetchPage]);

  const loadMore = useCallback((key: string) => {
    const current = slotsRef.current[key];
    if (!current || current.loadingMore) return;
    if (current.visible < current.items.length) {
      dispatch({ type: "show-more", key });
      return;
    }
    if (current.hasMore) fetchPage(current, current.page + 1);
  }, [fetchPage]);

  return { slots, search, retry, loadMore };
}
