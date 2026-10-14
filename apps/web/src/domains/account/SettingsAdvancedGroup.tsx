import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 접힌 고급 설정 그룹 — 일상 설정만 기본으로 보이고, 가끔만 쓰는 설정은
 * 이 펼침 하나로 모인다. 접힌 동안에는 내용을 렌더하지 않아 첫 화면 밀도를
 * 실제로 낮추고, 검색·딥링크로 도착하면 부모가 open을 켜서 보여 준다.
 */
export function SettingsAdvancedGroup({
  id,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  const panelId = `${id}-panel`;
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line bg-panel/25">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-fg-3">{description}</span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`shrink-0 text-fg-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-line/60 px-5 pb-2 pt-1">
          {children}
        </div>
      ) : null}
    </div>
  );
}
