import { useCallback, useState, type SetStateAction } from "react";

import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

/** URL을 기준으로 입력 초안을 분리해 뒤로가기 때 낡은 debounce가 URL을 덮지 않게 한다. */
export function useSearchQueryDraft(queryFromUrl: string) {
  const [draft, setDraft] = useState({ base: queryFromUrl, value: queryFromUrl });
  if (draft.base !== queryFromUrl) {
    setDraft({ base: queryFromUrl, value: queryFromUrl });
  }
  const q = draft.base === queryFromUrl ? draft.value : queryFromUrl;
  const debouncedQ = useDebouncedValue(q, 180);
  const setQ = useCallback((action: SetStateAction<string>) => {
    setDraft((current) => {
      const value = current.base === queryFromUrl ? current.value : queryFromUrl;
      return { base: queryFromUrl, value: typeof action === "function" ? action(value) : action };
    });
  }, [queryFromUrl]);
  return { q, setQ, debouncedQ, canCommitQuery: draft.base === queryFromUrl && debouncedQ === q };
}
