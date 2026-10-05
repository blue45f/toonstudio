/**
 * AI 슈퍼 스위트의 공용 표시 컴포넌트 — 복사 버튼과 입력 부족 안내.
 *
 * StudioAiSuperSuiteModal.tsx에서 분리했다(파일 크기 래칫 해소). 복사 버튼은
 * useStudioCopyFeedback이 확정한 결과만 표시한다 — 실패를 "복사됨"으로 표시하지 않는다.
 */
import {
  AlertTriangle,
  Check,
  Copy,
} from "lucide-react";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
  StudioEmptyState,
} from "../studio-panel-ui";

import type { StudioCopyFeedbackStatus } from "../use-studio-copy-feedback";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * 복사 버튼 — useStudioCopyFeedback 이 확정한 결과만 표시한다.
 * 클립보드가 막힌 환경에서 "복사됨"을 띄우면 사용자는 붙여넣기가 될 거라 믿고 창을 닫는다.
 */
export function StudioCopyTextButton({
  copyKey,
  text,
  statusFor,
  onCopy,
  variant = "solid",
  label,
}: {
  readonly copyKey: string;
  readonly text: string;
  readonly statusFor: (id: string) => StudioCopyFeedbackStatus | null;
  readonly onCopy: (id: string, text: string) => void;
  readonly variant?: "solid" | "quiet";
  readonly label: string;
}): ReactElement {
  const status = statusFor(copyKey);
  const copied = status === "copied";
  const failed = status === "failed";
  const Icon = copied ? Check : failed ? AlertTriangle : Copy;
  return (
    <button
      type="button"
      onClick={() => onCopy(copyKey, text)}
      aria-label={`${label} 복사`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[0.62rem] font-bold",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        STUDIO_TOUCH_TARGET,
        failed
          ? "border-bad/35 bg-bad/10 text-bad"
          : variant === "solid"
            ? "border-transparent bg-accent text-on-accent"
            : "border-line bg-card text-fg hover:bg-raised"
      )}
    >
      <Icon size={12} aria-hidden />
      <span>{copied ? "복사됨" : failed ? "복사 실패" : "복사"}</span>
    </button>
  );
}

/** 입력이 모자랄 때 결과 자리에 세우는 안내. 빈 결과를 그리지 않는다. */
export function StudioAiSuiteInputNeeded({
  icon,
  description,
}: {
  readonly icon: ReactElement;
  readonly description: string;
}): ReactElement {
  return <StudioEmptyState icon={icon} title="입력이 더 필요해요" description={description} />;
}

