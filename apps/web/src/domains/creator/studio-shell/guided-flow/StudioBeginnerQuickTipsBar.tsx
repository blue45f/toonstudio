import { ChevronDown, Keyboard, WandSparkles } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_ESSENTIAL_SHORTCUTS } from "./studio-guided-flow-catalog";

/**
 * 처음 진입한 창작자가 메뉴를 헤매지 않도록 필수 6대 단축키·제스처와
 * 빠른 기능 검색(⌘/Ctrl+K)을 한 곳에서 열어 주는 접이식 안내 바.
 */
export function StudioBeginnerQuickTipsBar() {
  const bt = useBilingual("StudioBeginnerQuickTipsBar");

  return (
    <details
      data-testid="studio-beginner-quick-tips"
      className="group mt-4 rounded-2xl border border-line bg-card"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Keyboard size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm text-fg">
              {bt("처음이라도 10초 만에 익히는 핵심 단축키 · 기능 검색", "10-second essential shortcuts & feature finder")}
            </strong>
            <span className="block truncate text-xs text-fg-3">
              {bt("브러시(B) · 말풍선(T) · 이동(Space) 등 자주 쓰는 조작만 모았어요", "Quick cheat-sheet for Brush (B), Balloon (T), Pan (Space) and search")}
            </span>
          </span>
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-fg-3 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="border-t border-line p-4">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {STUDIO_ESSENTIAL_SHORTCUTS.map((item) => (
            <div
              key={item.keys}
              className="flex items-start justify-between gap-2 rounded-xl border border-line bg-panel/45 p-3"
            >
              <div className="min-w-0">
                <strong className="block text-xs font-black text-fg">
                  {bt(item.labelKo, item.labelEn)}
                </strong>
                <span className="mt-0.5 block text-[0.68rem] leading-5 text-fg-2">
                  {bt(item.hintKo, item.hintEn)}
                </span>
              </div>
              <kbd className="shrink-0 rounded-lg border border-line bg-card px-2 py-1 font-mono text-[0.68rem] font-extrabold text-accent">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 px-3.5 py-2.5">
          <p className="text-xs text-fg-2">
            {bt(
              "찾는 도구 이름을 바로 입력해 실행하고 싶다면 오른쪽 버튼을 눌러 보세요.",
              "Want to jump straight to any tool by name? Open the quick finder.",
            )}
          </p>
          <button
            type="button"
            onClick={() =>
              globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"))
            }
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10 gap-1.5" })}
          >
            <WandSparkles size={15} aria-hidden="true" />
            {bt("기능 찾기 열기", "Open feature finder")}
          </button>
        </div>
      </div>
    </details>
  );
}
