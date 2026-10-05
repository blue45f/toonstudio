import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  loadProductionVersionActivity,
  type ProductionVersionActivityLoadResult,
} from "./production-version-activity";

export type ProductionVersionActivityState =
  | { readonly status: "disabled" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly result: ProductionVersionActivityLoadResult }
  | { readonly status: "error"; readonly message: string };

/**
 * 활동 피드에 합류시킬 버전·공유 기록을 서버에서 불러온다.
 * 비활성(데모 등)이면 네트워크를 타지 않고 disabled로 남는다.
 * 실패해도 감사 이벤트 본체는 그대로 보여야 하므로 오류는 이 상태 안에만 둔다.
 */
export function useProductionVersionActivity(input: {
  readonly enabled: boolean;
  readonly aggregate: ProductionProjectAggregate;
  readonly viewerUserId: string | null;
}): {
  readonly state: ProductionVersionActivityState;
  readonly retry: () => void;
} {
  const { enabled, aggregate, viewerUserId } = input;
  const [state, setState] = useState<ProductionVersionActivityState>(
    enabled ? { status: "loading" } : { status: "disabled" },
  );
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "disabled" });
      return;
    }
    const current = ++generation.current;
    const controller = new AbortController();
    setState({ status: "loading" });
    loadProductionVersionActivity({
      workId: aggregate.workId,
      aggregate,
      viewerUserId,
      signal: controller.signal,
    }).then(
      (result) => {
        if (generation.current === current) setState({ status: "ready", result });
      },
      (error: unknown) => {
        if (controller.signal.aborted || generation.current !== current) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "버전 활동을 불러오지 못했습니다.",
        });
      },
    );
    return () => controller.abort();
  }, [enabled, aggregate, viewerUserId, attempt]);

  return { state, retry };
}
