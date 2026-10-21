/**
 * AI 연결 상태 배지 — E1 공통 표기 부품.
 *
 * 모든 AI 패널은 제목 옆에 이 배지 하나를 달아 연결 상태를 통일 표기한다.
 * 판정 기준·전수 표는 studio-ai-connection-status.ts가 정본이다.
 * 색만으로 상태를 전하지 않도록 항상 한국어 상태 문구를 함께 렌더한다.
 */
import {
  STUDIO_AI_CONNECTION_STATUS_META,
  studioAiConnectionKindForConfigured,
  type StudioAiConnectionStatusKind,
} from "./studio-ai-connection-status";

import { cn } from "@/shared/lib/utils";

const KIND_CLASS: Readonly<Record<StudioAiConnectionStatusKind, string>> = Object.freeze({
  "provider-ready": "border-good/35 bg-good/10 text-good",
  local: "border-accent/40 bg-accent/10 text-accent",
  "provider-unconfigured": "border-warn/35 bg-warn/10 text-warn",
  "not-connected": "border-warn/35 bg-warn/10 text-warn",
  "editor-only": "border-line bg-raised text-fg-3",
});

export function StudioAiConnectionBadge({
  kind,
  configured,
  label,
  detail,
  className,
}: {
  /** 직접 지정. `configured`와 함께 주면 configured가 우선한다. */
  kind?: StudioAiConnectionStatusKind;
  /** 제공자형 패널용 — true=실행 가능, false=연결 필요. */
  configured?: boolean;
  label?: string;
  detail?: string;
  className?: string;
}) {
  const resolved: StudioAiConnectionStatusKind =
    configured !== undefined
      ? studioAiConnectionKindForConfigured(configured)
      : (kind ?? "editor-only");
  const meta = STUDIO_AI_CONNECTION_STATUS_META[resolved];
  return (
    <span
      data-studio-ai-connection-status={resolved}
      role="status"
      title={detail ?? meta.detailKo}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold leading-tight",
        KIND_CLASS[resolved],
        className,
      )}
    >
      {label ?? meta.labelKo}
    </span>
  );
}

/** 배지 + 비활성 사유를 한 줄로 보여줘야 하는 표면용 (E2 '연결 전' 명시 등). */
export function StudioAiConnectionNotice({
  kind,
  configured,
  detail,
  className,
}: {
  kind?: StudioAiConnectionStatusKind;
  configured?: boolean;
  detail?: string;
  className?: string;
}) {
  const resolved: StudioAiConnectionStatusKind =
    configured !== undefined
      ? studioAiConnectionKindForConfigured(configured)
      : (kind ?? "editor-only");
  const meta = STUDIO_AI_CONNECTION_STATUS_META[resolved];
  return (
    <div
      data-studio-ai-connection-notice={resolved}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <StudioAiConnectionBadge kind={resolved} />
      <span className="text-[0.62rem] leading-relaxed text-fg-3">
        {detail ?? meta.detailKo}
      </span>
    </div>
  );
}
