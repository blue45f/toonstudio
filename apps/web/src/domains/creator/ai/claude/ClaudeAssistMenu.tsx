/**
 * 스튜디오 검색 줄의 Claude 보조 메뉴 — 별 모양 버튼 하나로 모든 보조 기능을 이름·설명과 함께 보여 준다.
 *
 * 기능이 늘어도 줄 너비를 먹지 않고, 아이콘만 보고 짐작하지 않아도 되도록 항목마다 한 줄 설명을 붙인다.
 * 메뉴 버튼 패턴을 따른다: 화살표·Home·End로 이동, Esc로 닫고 버튼으로 돌아간다. 대화상자는 버튼에서 연다
 * (메뉴가 닫혀도 대화상자가 닫힐 때 돌아갈 곳이 남도록 포커스를 버튼에 둔 채 연다).
 */
import "@/shared/ai/claude/claude-assist-i18n";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { ClaudeBudgetMeter } from "@/shared/ai/claude/ClaudeBudgetMeter";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";

import { CLAUDE_ASSIST_FEATURES, useClaudeAssistDialogs, type ClaudeAssistFeatureId } from "./claude-assist-features";

const TRIGGER =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-fg-3 transition-colors hover:bg-raised hover:text-fg aria-expanded:bg-raised aria-expanded:text-accent";

interface Position {
  readonly top: number;
  readonly right: number;
}

export function ClaudeAssistMenu() {
  const t = useT();
  const idBase = useId();
  const menuId = `${idBase}-menu`;
  const dialogs = useClaudeAssistDialogs();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, right: 0 });

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (panelRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      closeMenu(false);
    };
    const onViewportChange = () => closeMenu(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [closeMenu, menuOpen]);

  const choose = (id: ClaudeAssistFeatureId) => {
    // 포커스를 버튼에 두고 열어야 대화상자가 닫힐 때 돌아올 곳이 남는다(메뉴 항목은 곧 사라진다).
    triggerRef.current?.focus({ preventScroll: true });
    setMenuOpen(false);
    dialogs.openFeature(id);
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    } else if (event.key === "Tab") {
      closeMenu(false);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus({ preventScroll: true });
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" && !menuOpen) {
      event.preventDefault();
      setMenuOpen(true);
    }
  };

  const label = t("claudeAssist.hub.menuLabel");
  return (
    <div className="flex shrink-0 items-center" data-claude-assist-menu="true">
      <button
        ref={triggerRef}
        type="button"
        className={cn(TRIGGER, STUDIO_FOCUS_RING)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        data-claude-assist="menu"
        onClick={() => setMenuOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
      >
        <Sparkles size={16} aria-hidden />
      </button>
      {menuOpen && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={onPanelKeyDown}
            style={{ top: position.top, right: position.right }}
            className="fixed z-[250] w-[min(20rem,calc(100vw-1rem))] space-y-1 rounded-xl border border-line bg-panel p-1.5 shadow-2xl"
          >
            {CLAUDE_ASSIST_FEATURES.map(({ id, Icon, titleKey, descriptionKey, requirementKey }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-claude-assist={id}
                onClick={() => choose(id)}
                className={cn("flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-raised", STUDIO_FOCUS_RING)}
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent" aria-hidden>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-fg">{t(titleKey)}</span>
                    <span className="rounded-full border border-line px-1.5 py-px text-[0.625rem] font-semibold text-fg-3">{t(requirementKey)}</span>
                  </span>
                  <span className="block text-xs text-fg-3">{t(descriptionKey)}</span>
                </span>
              </button>
            ))}
            <div className="space-y-1.5 border-t border-line px-2.5 pb-1 pt-2">
              <ClaudeBudgetMeter />
              <Link
                to="/settings/ai?source=studio"
                role="menuitem"
                tabIndex={-1}
                className={cn("inline-flex min-h-11 items-center text-xs font-bold text-accent", STUDIO_FOCUS_RING)}
                onClick={() => closeMenu(false)}
              >
                {t("claudeAssist.hub.settingsLink")}
              </Link>
            </div>
          </div>,
          document.body,
        )
        : null}
      {dialogs.element}
    </div>
  );
}
