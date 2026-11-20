import { useCallback, useEffect, useState } from "react";

export interface StudioCreatorGovernanceAlert {
  readonly alertId: string;
  readonly slug: string;
  readonly kind: "revocation-hold" | "reissuance-restored";
  readonly reasonCode: string;
  readonly title: string;
  readonly remediationGuide: string;
  readonly createdAtIso: string;
}

/**
 * 실제 백엔드 `GET /api/ip-governance/titles/:slug/creator-alerts`에서
 * 정산 보류·배지 재발급 복구 알림을 실시간으로 조회하는 훅.
 */
export function useCreatorGovernanceAlerts(slug: string): {
  readonly alerts: readonly StudioCreatorGovernanceAlert[];
  readonly loading: boolean;
  readonly refresh: () => void;
} {
  const [alerts, setAlerts] = useState<readonly StudioCreatorGovernanceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setRevision((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (typeof fetch !== "function" || !slug.trim()) return;
    const controller = new AbortController();
    setLoading(true);
    const url = `/api/ip-governance/titles/${encodeURIComponent(slug)}/creator-alerts`;

    void fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as unknown;
        if (Array.isArray(json)) {
          setAlerts(json as StudioCreatorGovernanceAlert[]);
        }
      })
      .catch(() => {
        // 오프라인·로컬 테스트 환경에서는 기존 상태를 유지한다.
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [slug, revision]);

  return { alerts, loading, refresh };
}
