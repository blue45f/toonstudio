import { ChevronRight } from "lucide-react";

import { deckPageBi as bi } from "./engineering-deck-ui";
import { ENGINEERING_SEMINAR_MODULES } from "./engineering-playbook-content";

import { formatI18nTemplate, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

/* ── 워크숍 확장 모듈 ──────────────────────────────────────── */

export function WorkshopModules() {
  useBilingualI18nRevision();
  const totalMinutes = ENGINEERING_SEMINAR_MODULES.reduce((sum, module) => sum + module.minutes, 0);
  return (
    <details data-eng-disclosure="" className="group mt-4 rounded-3xl border border-line/70 bg-panel/60">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-3xl px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-xs font-black uppercase tracking-[0.12em] text-accent">{bi("워크숍으로 확장", "Extend into a workshop")}</span>
          <span className="mt-1 block text-base font-black text-fg">
            {formatI18nTemplate(String(bi("모듈형 실습 {value0}개 · 권장 {value1}분", "{value0} modular sessions · about {value1} minutes")), { value0: ENGINEERING_SEMINAR_MODULES.length, value1: totalMinutes })}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-accent transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t border-line/70 p-5">
        <p className="max-w-3xl text-sm leading-7 text-fg-2">
          {bi(
            "세미나 뒤 스터디나 사내 워크숍으로 이어갈 때 쓰는 모듈입니다. 표시 시간은 토론과 데모를 포함한 권장 범위이며, 필요한 모듈만 골라도 흐름이 이어집니다.",
            "Use these modules to continue into a study group or internal workshop. Times are recommendations including discussion and demos; any subset keeps the flow coherent.",
          )}
        </p>
        <ol className="mt-5 grid gap-3 lg:grid-cols-2">
          {ENGINEERING_SEMINAR_MODULES.map((module, moduleIndex) => (
            <li key={module.id} className="grid gap-3 rounded-2xl border border-line bg-card/70 p-4">
              <p className="flex items-center justify-between gap-3">
                <span className="text-base font-black text-fg">
                  <span className="mr-2 font-display text-accent">{String(moduleIndex + 1).padStart(2, "0")}</span>
                  {bi(module.title.ko, module.title.en)}
                </span>
                <span className="shrink-0 font-display text-xs font-bold text-fg-3">{formatI18nTemplate(String(bi("{value0}분", "{value0} min")), { value0: module.minutes })}</span>
              </p>
              <ul className="grid gap-1.5 text-sm leading-6 text-fg-2">
                {module.learning.map((item) => <li key={item.ko} className="flex gap-2"><span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{bi(item.ko, item.en)}</li>)}
              </ul>
              <p className="text-xs leading-6 text-fg-3"><strong className="text-fg-2">{bi("데모: ", "Demo: ")}</strong>{bi(module.demo.ko, module.demo.en)}</p>
              <p className="rounded-xl bg-raised/70 p-3 text-xs font-bold leading-6 text-fg-2">{bi(module.discussion.ko, module.discussion.en)}</p>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
