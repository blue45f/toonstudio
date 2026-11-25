/**
 * 터치 화면 첫 사용 조작 안내(뷰포트 최하단 슬림 바).
 *
 * 목록은 `character-shaper-gestures.ts`가 소유한다(소개 페이지의 조작법 탭과 같은 목록).
 * 닫은 기록은 이 브라우저에만 남기며, 저장소를 쓸 수 없으면 매번 안내해도 편집은 막지 않는다.
 */
import { useId } from "react";

import { CHARACTER_SHAPER_GESTURES } from "./character-shaper-gestures";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function CharacterShaperGestureGuide({ onDismiss }: { readonly onDismiss: () => void }) {
  const bt = useBilingual("CharacterShaperGestureGuide");
  const headingId = useId();
  const rows = CHARACTER_SHAPER_GESTURES.map((row) => ({
    id: row.id,
    icon: row.icon,
    gesture: bt(row.gesture[0], row.gesture[1]),
    result: bt(row.result[0], row.result[1]),
  }));
  return (
    <section
      aria-labelledby={headingId}
      data-character-gesture-guide="true"
      data-character-gesture-guide-layout="slim-bar"
      className="character-gesture-guide"
    >
      <div className="character-gesture-guide__content">
        <h3 id={headingId} className="character-gesture-guide__title [word-break:keep-all]">
          {bt("화면 조작 안내", "Touch controls")}
        </h3>
        <ul className="character-gesture-guide__chips">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.id} className="character-gesture-guide__chip [word-break:keep-all]">
                <span className="character-gesture-guide__icon" aria-hidden>
                  <Icon size={13} aria-hidden />
                </span>
                <strong className="character-gesture-guide__gesture">{row.gesture}</strong>
                <span aria-hidden className="character-gesture-guide__sep">·</span>
                <span className="character-gesture-guide__result">{row.result}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        className="character-gesture-guide__confirm min-h-11 min-w-11 [word-break:keep-all]"
        onClick={onDismiss}
      >
        {bt("확인", "Got it")}
      </button>
    </section>
  );
}
