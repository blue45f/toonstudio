import { useId } from "react";

import Link from "@/shared/navigation/router-link";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { studioProjectSectionHref } from "../studio-project-views";

import { countFilledSheetFields } from "./submission-package-story";
import type { SubmissionCharacterSheet } from "./submission-package-types";

export interface SubmissionCharacterPickerProps {
  readonly projectId: string;
  readonly sheets: readonly SubmissionCharacterSheet[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggle: (characterId: string, value: boolean) => void;
}

/** 스토리 바이블 캐릭터를 고른다. 서술 시트가 비어 있는 캐릭터는 기본으로 담지 않고 이유를 보여 준다. */
export function SubmissionCharacterPicker({ projectId, sheets, selectedIds, onToggle }: SubmissionCharacterPickerProps) {
  const bt = useBilingual("SubmissionCharacterPicker");
  const titleId = useId();
  const storyHref = (() => {
    try {
      return studioProjectSectionHref(projectId, "story", "characters");
    } catch {
      return null;
    }
  })();

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div>
        <h3 id={titleId} className="text-base font-black text-fg">
          {bt("캐릭터 시트", "Character sheets")}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-fg-2">
          {bt("스토리 바이블의 캐릭터와 서술 시트를 가져와요. 담을 인물을 골라 주세요.", "Characters and narrative sheets come from the story bible. Choose who to include.")}{" "}
          {storyHref ? (
            <Link href={storyHref} className="font-semibold text-accent underline underline-offset-2 hover:text-accent-2">
              {bt("스토리 > 캐릭터에서 시트 쓰기", "Write sheets under Story > Characters")}
            </Link>
          ) : null}
        </p>
      </div>
      {sheets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-sm text-fg-2">
          {bt("스토리 바이블에 캐릭터가 아직 없어요. 캐릭터를 만들고 시트를 적으면 여기에 나타나요.", "The story bible has no characters yet. Create characters and write their sheets to see them here.")}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sheets.map((sheet) => {
            const filled = countFilledSheetFields(sheet);
            const checked = selectedIds.has(sheet.id);
            return (
              <li key={sheet.id}>
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg",
                    "hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/80",
                  )}
                >
                  <input type="checkbox" className="mt-1 size-4 shrink-0 accent-accent" checked={checked} onChange={(event) => onToggle(sheet.id, event.target.checked)} />
                  <span className="min-w-0 font-semibold">
                    {sheet.name || bt("이름 없는 캐릭터", "Unnamed character")}
                    {sheet.aliases.length > 0 ? <span className="ml-1 font-normal text-fg-2">({sheet.aliases.join(", ")})</span> : null}
                    <span className="block text-xs font-normal text-fg-2">
                      {filled > 0
                        ? formatI18nTemplate(bt("시트 {filled}칸 작성", "{filled} sheet field(s) written"), { filled })
                        : bt("시트가 비어 있어요", "The sheet is empty")}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
