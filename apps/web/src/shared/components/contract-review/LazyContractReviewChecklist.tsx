import { useEffect, useState, type ComponentType } from "react";

import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { ContractReviewChecklistProps } from "./ContractReviewChecklist";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly Checklist: ComponentType<ContractReviewChecklistProps> }
  | { readonly status: "error" };

/**
 * 체크리스트 본문은 항목 데이터가 커서 화면에 들어올 때 불러온다(학습·제작 화면의 첫 묶음에서 뺀다).
 * 불러오는 중·실패(다시 시도) 상태를 직접 보여 주고, 실패하면 새로고침 없이 다시 불러온다.
 */
export function LazyContractReviewChecklist(props: ContractReviewChecklistProps) {
  const bt = useBilingual("LazyContractReviewChecklist");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    import("./ContractReviewChecklist").then(
      (module) => {
        if (!cancelled) setState({ status: "ready", Checklist: module.ContractReviewChecklist });
      },
      () => {
        if (!cancelled) setState({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry(): void {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  if (state.status === "ready") {
    const { Checklist } = state;
    return <Checklist {...props} />;
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-2xl border border-bad/40 bg-bad-soft p-4 text-sm text-fg sm:p-5">
        <p className="font-bold">{bt("체크리스트를 불러오지 못했어요.", "The checklist could not be loaded.")}</p>
        <p className="mt-1 leading-relaxed text-fg-2">
          {bt(
            "네트워크 연결을 확인한 뒤 다시 시도해 주세요. 이미 답한 내용은 이 브라우저에 그대로 남아 있어요.",
            "Check your network connection and try again. Answers you already gave are still saved in this browser.",
          )}
        </p>
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={retry}>
          {bt("다시 시도", "Try again")}
        </Button>
      </div>
    );
  }

  return (
    <div role="status" className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div aria-hidden="true" className="space-y-3 animate-pulse motion-reduce:animate-none">
        <div className="h-4 w-48 rounded bg-raised" />
        <div className="h-3 w-full max-w-xl rounded bg-raised" />
        <div className="h-3 w-full max-w-lg rounded bg-raised" />
      </div>
      <p className="mt-3 text-sm text-fg-2">{bt("계약서 검토 체크리스트를 불러오는 중…", "Loading the contract review checklist…")}</p>
    </div>
  );
}
