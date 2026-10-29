import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface StudioExportSectionProps {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** 네이티브 접기: 키보드로 열고 닫으며, 접어도 내보내기 설정과 실행 상태를 보존한다. */
export function StudioExportSection({
  id, title, description, defaultOpen = false, children,
}: StudioExportSectionProps) {
  return (
    <details
      data-studio-export-section={id}
      open={defaultOpen || undefined}
      className="group mt-2 rounded-xl border border-line bg-card/30"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <strong className="block text-xs font-semibold">{title}</strong>
          {description ? <span className="mt-0.5 block text-[0.68rem] leading-snug text-fg-2">{description}</span> : null}
        </span>
        <ChevronDown size={15} aria-hidden className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-line/60 p-2.5">{children}</div>
    </details>
  );
}
