import { Link } from "react-router-dom";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { READINGS, TERMS } from "./learning-content";
import type { Lesson } from "./learning-model";

/** 개념·용어·출처는 실습 완료 조건에 포함하지 않는 선택 자료다. */
export function LessonReference({ lesson }: { lesson: Lesson }) {
  const t = useBilingual("domains.learn.LessonReference");
  return (
    <>
      <p>{t("필요한 내용을 골라 읽으세요. 참고 자료를 모두 열어야 수업이 완료되는 것은 아닙니다.", "Read the material you need. Opening every reference is not required to complete this lesson.")}</p>
      {lesson.sections.map((section, index) => (
        <section key={section.title} id={`${lesson.id}-concept-${index + 1}`} className="learn-prose learn-anchor-target" tabIndex={-1}>
          <h3>{section.title}</h3>
          <p>{section.text}</p>
        </section>
      ))}
      <section className="learn-side-card">
        <h3>{t("함께 알아둘 용어", "Useful terms")}</h3>
        <div className="learn-term-links">
          {lesson.terms.map((termId) => {
            const term = TERMS.find((entry) => entry.id === termId);
            return term ? <Link key={term.id} to={`/learn/glossary?term=${encodeURIComponent(term.id)}`}>{term.name} <span aria-hidden="true">↗</span></Link> : null;
          })}
        </div>
      </section>
      <section className="learn-side-card">
        <h3>{t("공식 참고 자료", "Official references")}</h3>
        <p>{t("본문과 도식은 별도로 작성했습니다. 아래 출처는 새 탭에서 열립니다.", "The lesson text and diagrams were written separately. These sources open in a new tab.")}</p>
        {lesson.sources.map((sourceId) => {
          const source = READINGS[sourceId];
          return source ? <a key={sourceId} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span><span className="learn-visually-hidden">{t("새 탭", "New tab")}</span></a> : null;
        })}
      </section>
      {lesson.track === "studio" && <p>{t("저장소 매뉴얼을 참고하는 자율 실습입니다. 앱의 메뉴 위치가 다를 수 있으며, 화면 하이라이트나 자동 채점은 제공하지 않습니다.", "This is self-guided practice based on the repository manual. Menu locations may differ; guided highlights and automatic grading are not provided.")}</p>}
      <details className="learn-lesson-disclosure">
        <summary>{t("키보드 단축키", "Keyboard shortcuts")}</summary>
        <p><kbd>[</kbd> {t("이전 강좌", "Previous lesson")} · <kbd>]</kbd> {t("다음 강좌", "Next lesson")} · <kbd>1</kbd>–<kbd>{lesson.checks.length}</kbd> {t("실습 체크", "Practice checks")} · <kbd>C</kbd> {t("완료 기록 켜고 끄기", "Toggle completion")}</p>
        <p>{t("메모 입력 중에는 동작하지 않습니다.", "Shortcuts are inactive while typing notes.")}</p>
      </details>
    </>
  );
}
