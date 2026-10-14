import { AlertTriangle, RefreshCw } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { ErrorCopy } from "@/shared/language/error-pattern";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

// 데이터 로드 실패 시 페이지들이 공통으로 쓰는 에러 안내 + 재시도 블록.
// role="alert"로 등장 시점에 스크린리더에 실패를 즉시 공지한다.
// 새 표면은 원인+다음 행동이 강제되는 GuidedErrorState를 쓴다 (shared/language/error-pattern).
export function ErrorState({
  title,
  message,
  cause,
  nextStep,
  dataSafetyNote,
  onRetry,
  className,
}: {
  title: string;
  message?: string | null;
  /** 무엇이 왜 안 됐는지. message보다 우선한다. */
  cause?: string;
  /** 사용자가 지금 바로 할 수 있는 다음 행동 */
  nextStep?: string;
  /** 입력·작업 데이터가 어떻게 됐는지 */
  dataSafetyNote?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();

  return (
    <div
      data-slot="error-state"
      className={cn(
        "rounded-2xl border border-bad/40 bg-bad/12 p-12 text-center",
        className
      )}
      role="alert"
    >
      <AlertTriangle size={24} className="mx-auto mb-3 text-bad" />
      <p className="text-sm font-medium text-fg">{title}</p>
      {/* 틴트된 에러 표면 위에서 본문 대비 확보 — fg-3은 이 배경에서 흐릿함 → fg-2 */}
      <p className="mt-1 text-sm text-fg-2">{cause ?? message ?? t("common.loading.empty")}</p>
      {dataSafetyNote ? <p className="mt-1 text-sm text-fg-2">{dataSafetyNote}</p> : null}
      {nextStep ? <p className="mt-2 text-sm font-medium text-fg">{nextStep}</p> : null}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={buttonClass({ size: "sm", variant: "outline", className: "mt-4 min-h-11 gap-1.5" })}
        >
          <RefreshCw size={14} />
          {t("common.retry.short")}
        </button>
      )}
    </div>
  );
}

/**
 * 에러 문형(원인+다음 행동+데이터 안전)이 타입으로 강제되는 변형.
 * 새 에러 표면은 이쪽을 쓴다 — copy를 ErrorCopy로 넘겨야 컴파일된다.
 */
export function GuidedErrorState({
  title,
  copy,
  onRetry,
  className,
}: {
  title: string;
  copy: ErrorCopy;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <ErrorState
      title={title}
      cause={copy.cause}
      nextStep={copy.action}
      dataSafetyNote={copy.dataSafety}
      onRetry={onRetry}
      className={className}
    />
  );
}
