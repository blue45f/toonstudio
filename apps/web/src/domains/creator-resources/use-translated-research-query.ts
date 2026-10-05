import { useEffect, useMemo, useState } from "react";

import { resolveResearchQueryTranslation, translateResearchQuerySync } from "./research-query-translation";

import type { ResearchQueryTranslation, ResearchQueryTranslator } from "./research-query-translation";

export interface UseTranslatedResearchQueryOptions {
  /** false면 변환 계층을 완전히 끄고 입력을 그대로 통과시킨다 (한글 네이티브 제공처용). */
  enabled?: boolean;
  /** 테스트·자체 호스팅 주입용 번역기 로더. 기본값은 research-query-mt의 lazy 로더. */
  loadTranslator?: () => Promise<ResearchQueryTranslator | null>;
}

export interface TranslatedResearchQuery {
  /** 현재 적용 중인 변환 결과 (사용자 수정이 있으면 effectiveQuery가 교체된 상태) */
  translation: ResearchQueryTranslation;
  effectiveQuery: string;
  /** 사용자가 변환어를 직접 고친 상태인지 */
  overridden: boolean;
  /** 2차 번역 모델 해석이 진행 중인지 */
  modelPending: boolean;
  applyOverride: (value: string) => void;
  clearOverride: () => void;
}

function passthrough(input: string): ResearchQueryTranslation {
  return { original: input, effectiveQuery: input, source: "not-needed", unresolved: [], modelAttempted: false };
}

/**
 * 리서치 데스크 검색 표면 공용 훅.
 * 제출된 검색어를 받아 사전 변환을 즉시 적용하고, 사전으로 풀리지 않은 한글이
 * 남으면 번역 모델 층으로 비동기 보강한다. 사용자가 변환어를 직접 고치면
 * 그 값이 모델·사전 결과보다 우선한다.
 */
export function useTranslatedResearchQuery(
  input: string,
  options?: UseTranslatedResearchQueryOptions,
): TranslatedResearchQuery {
  const enabled = options?.enabled ?? true;
  const loadTranslator = options?.loadTranslator;
  const sync = useMemo(
    () => (enabled ? translateResearchQuerySync(input) : passthrough(input)),
    [enabled, input],
  );
  const [modelResult, setModelResult] = useState<{ forOriginal: string; translation: ResearchQueryTranslation } | null>(null);
  const [modelPending, setModelPending] = useState(false);
  const [override, setOverride] = useState<{ forOriginal: string; value: string } | null>(null);

  const needsModel = enabled && (sync.source === "original" || sync.unresolved.length > 0);
  const modelSettled = modelResult?.forOriginal === sync.original;

  useEffect(() => {
    if (!needsModel || modelSettled) {
      setModelPending(false);
      return;
    }
    let disposed = false;
    setModelPending(true);
    void resolveResearchQueryTranslation(sync.original, loadTranslator).then((translation) => {
      if (disposed) return;
      setModelResult({ forOriginal: sync.original, translation });
      setModelPending(false);
    });
    return () => {
      disposed = true;
    };
  }, [needsModel, modelSettled, sync.original, loadTranslator]);

  const base = modelSettled && modelResult ? modelResult.translation : sync;
  const activeOverride = override?.forOriginal === sync.original ? override.value : null;
  const effectiveQuery = activeOverride ?? base.effectiveQuery;

  return {
    translation: activeOverride ? { ...base, effectiveQuery: activeOverride } : base,
    effectiveQuery,
    overridden: activeOverride !== null,
    modelPending,
    applyOverride: (value: string) => {
      const cleaned = value.normalize("NFC").trim().replace(/\s+/gu, " ");
      if (!cleaned) return;
      setOverride({ forOriginal: sync.original, value: cleaned });
    },
    clearOverride: () => setOverride(null),
  };
}
