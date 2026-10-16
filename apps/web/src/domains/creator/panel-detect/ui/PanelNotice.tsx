import { AlertTriangle, CheckCircle2, Info, OctagonX } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { PANEL_TONE_CLASS, type PanelTone } from "./panel-import-styles";

import type { ReactElement, ReactNode } from "react";

const ICONS = { info: Info, good: CheckCircle2, warn: AlertTriangle, bad: OctagonX } as const;

interface PanelNoticeProps {
  readonly tone: PanelTone;
  readonly children: ReactNode;
  /** 오류는 즉시 읽히도록 alert, 나머지는 status(정중한 알림). */
  readonly live?: "alert" | "status" | "off";
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly id?: string;
}

/** 상태·오류·경고 안내 한 줄. 색만으로 전달하지 않도록 아이콘과 문장을 함께 둔다. */
export function PanelNotice({ tone, children, live, actions, className, id }: PanelNoticeProps): ReactElement {
  const Icon = ICONS[tone];
  const role = live ?? (tone === "bad" ? "alert" : "status");
  return (
    <div
      id={id}
      role={role === "off" ? undefined : role}
      className={cn("flex flex-wrap items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-5", PANEL_TONE_CLASS[tone], className)}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words text-fg-2 [overflow-wrap:anywhere]">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
