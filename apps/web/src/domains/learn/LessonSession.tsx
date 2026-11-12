import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { getLessonMeta, getLessonRequirementProgress, SKILLS } from "./learning-paths";
import { canComplete, EMPTY_LESSON, type Lesson } from "./learning-model";
import { lessonUrlInContext, resolveLessonNavigation } from "./learning-lesson-navigation";
import { buildStudioPracticeUrl, getMissionStatus, getPracticeMission, suggestNextMission, type MissionStatus } from "./learning-practice";
import { LessonDiagram, LessonLab } from "./LessonLab";
import { LAB_CONFIGS } from "./learning-lab-state";
import { LessonReference } from "./LessonReference";
import { useLessonStep } from "./use-lesson-step";
import { useLearningPractice } from "./use-learning-practice";
import type { LearningStore } from "./use-learning-progress";
import { learnStatusText } from "./learn-status-i18n";
import { r44LearnStatusText } from "./r44-cat1-status-i18n";
import "./learning-lesson-steps.css";

const LEVEL_LABELS = { starter: "처음 시작", growing: "기초를 익힌 뒤", advanced: "완성·게시 단계" } as const;
const MISSION_STATUS_LABELS: Readonly<Record<MissionStatus, string>> = {
  "not-started": "시작 전", "in-progress": "진행 중", ready: "완료할 수 있음", completed: "실습 완료",
};

export function LessonSession({ lesson, store }: { lesson: Lesson; store: LearningStore }) {
  const t = useBilingual("domains.learn.LearnContent");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = useId();
  const { step, goToStep, rootRef, stepHeadingRef, hash } = useLessonStep(lesson.id);
  const [notesOpen, setNotesOpen] = useState(hash === `#${lesson.id}-notes`);
  const [exampleOpen, setExampleOpen] = useState(hash === `#${lesson.id}-lab`
    || ["labValue", "labFrame", "labView"].some((key) => searchParams.has(key)));
  const [shortcutNotice, setShortcutNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const entryNavigation = useRef(useNavigationType());
  const finishHeadingRef = useRef<HTMLHeadingElement>(null);
  const practice = useLearningPractice();
  const saved = store.progress.lessons[lesson.id] ?? EMPTY_LESSON;
  useEffect(() => {
    if (hash === `#${lesson.id}-notes`) setNotesOpen(true);
    if (hash === `#${lesson.id}-lab`) setExampleOpen(true);
  }, [hash, lesson.id]);

  // 이전 완료 값 — false→true 전이일 때만 완료 제목으로 포커스를 옮긴다.
  const prevCompletedRef = useRef(saved.completed);
  const ready = canComplete(lesson, saved);
  const navigation = resolveLessonNavigation(lesson.id, searchParams.get("from"));
  const { previous, next, previousUrl, nextUrl } = navigation;
  const meta = getLessonMeta(lesson.id);
  const progress = getLessonRequirementProgress(lesson, store.progress);
  const checkedCount = lesson.checks.reduce((count, _, index) => count + (saved.checks.includes(index) ? 1 : 0), 0);
  const quizCorrect = saved.answer === lesson.quiz.answer;
  const status = saved.completed ? "완료" : progress > 0 ? "학습 중" : "시작 전";
  const skillLabels = meta.skills.map((skillId) => SKILLS.find((skill) => skill.id === skillId)?.label).filter(Boolean);
  const mission = getPracticeMission(lesson.id);
  const missionStatus = mission ? getMissionStatus(mission, practice.progress, store.progress) : null;
  const suggestedMission = saved.completed ? suggestNextMission(store.progress, practice.progress, lesson.id) : null;
  const nextMission = navigation.path && suggestedMission && !navigation.path.lessonIds.includes(suggestedMission.lessonId)
    ? navigation.lessons.map((item) => getPracticeMission(item.id)).find((candidate) =>
      candidate && getMissionStatus(candidate, practice.progress, store.progress) !== "completed") ?? null
    : suggestedMission;

  // key가 다른 강좌의 PUSH는 제목을 알리고, POP·native 복귀와 같은 강좌의 query는 초점을 유지한다.
  useEffect(() => {
    if (entryNavigation.current !== "PUSH") return;
    const focused = document.activeElement;
    if (focused?.matches("input,textarea,select,[contenteditable]:not([contenteditable='false'])")
      || focused?.closest("[data-active-project-context]")) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [lesson.id]);

  // 완료 버튼을 누른 순간 완료 제목으로 포커스를 옮긴다.
  useEffect(() => {
    if (saved.completed && !prevCompletedRef.current) {
      finishHeadingRef.current?.focus({ preventScroll: true });
    }
    prevCompletedRef.current = saved.completed;
  }, [saved.completed]);

  // 강좌 상세 키보드 동선 — 마우스 없이 강좌를 순회하고 체크·완료를 토글한다.
  //   [ 또는 Alt+← : 이전 강좌 · ] 또는 Alt+→ : 다음 강좌
  //   1~9 : n번째 실습 체크 토글 · C : 완료 기록 토글
  // 입력 필드(메모·검색 등)·선택 요소 안에서는 가로채지 않고, IME 조합 중·
  // 키 반복·브라우저/시스템 조합(Ctrl·Meta, AltGr=Ctrl+Alt)도 건드리지 않는다.
  // 이동 목적지는 화면의 이전·다음 링크와 같은 순서(previous/next)를 쓰고,
  // 검증한 경로 맥락과 링크 목적지를 키보드 이동에서도 그대로 사용한다.
  useEffect(() => {
    const toggleCheck = (index: number) => {
      const checked = saved.checks.includes(index);
      store.patchLesson(lesson.id, {
        checks: checked
          ? saved.checks.filter((value) => value !== index)
          : [...saved.checks, index],
      });
      const nextCount = checked ? checkedCount - 1 : checkedCount + 1;
      setShortcutNotice(`${index + 1}번 체크를 ${checked ? "해제" : "완료"}했습니다. 실습 체크리스트 ${nextCount}/${lesson.checks.length}`);
    };
    const toggleCompleted = () => {
      if (saved.completed) {
        store.patchLesson(lesson.id, { completed: false });
        setShortcutNotice("학습 완료 기록을 해제했습니다.");
      } else if (ready) {
        store.patchLesson(lesson.id, { completed: true });
        setShortcutNotice("강좌를 완료로 기록했습니다.");
      } else {
        setShortcutNotice("실습 체크리스트를 모두 체크하고 퀴즈에 정답을 선택해야 완료할 수 있습니다.");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if (event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (
        target?.closest('[role="dialog"], [aria-modal="true"], dialog') ||
        active?.closest('[role="dialog"], [aria-modal="true"], dialog') ||
        document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]')
      ) {
        return;
      }
      const tag = target?.tagName ?? "";
      if (target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.altKey && !event.ctrlKey) {
        if (event.key === "ArrowLeft" && previousUrl) {
          event.preventDefault();
          navigate(previousUrl);
        } else if (event.key === "ArrowRight" && nextUrl) {
          event.preventDefault();
          navigate(nextUrl);
        }
        return;
      }
      if (event.ctrlKey || event.altKey) return;
      if (event.key === "[" || event.key === "{") {
        if (previousUrl) {
          event.preventDefault();
          navigate(previousUrl);
        }
      } else if (event.key === "]" || event.key === "}") {
        if (nextUrl) {
          event.preventDefault();
          navigate(nextUrl);
        }
      } else if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (index < lesson.checks.length) {
          event.preventDefault();
          goToStep("check");
          toggleCheck(index);
        }
      } else if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        goToStep("check");
        toggleCompleted();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checkedCount, lesson.checks.length, lesson.id, navigate, nextUrl, previousUrl, ready, saved.checks, saved.completed, store, goToStep]);

  return (
    <article ref={rootRef} className="learn-stepped-lesson">
      <header className="learn-lesson-header learn-guided-lesson-header">
        <Link className="learn-back" to={navigation.backUrl}>← {navigation.path ? t(`${navigation.path.title} 경로로`, `Back to ${navigation.path.title} path`) : "전체 강좌"}</Link>
        <p className="learn-eyebrow">
          {navigation.path ? t(`${navigation.path.title} · ${navigation.index + 1}/${navigation.lessons.length} 수업`, `${navigation.path.title} · Lesson ${navigation.index + 1}/${navigation.lessons.length}`) : t(`강좌 · 약 ${lesson.minutes}분`, `Lesson · About ${lesson.minutes} min`)}
        </p>
        <h1 ref={headingRef} tabIndex={-1} className="learn-focus-heading">{lesson.title}</h1>
        <p className="learn-intro">{lesson.summary}</p>
        <p className="learn-lesson-record-status">{t(`자가 점검 ${progress}% · ${status}`, `Self-check ${progress}% · ${saved.completed ? "Complete" : progress > 0 ? "In progress" : "Not started"}`)}</p>
        <p className="learn-visually-hidden" role="status">{shortcutNotice}</p>
      </header>

      <nav className="learn-step-navigation" aria-label={t("수업 단계", "Lesson steps")}>
        <ol>{([
          ["goal", t("목표", "Goal")],
          ["practice", t("한 과제", "One task")],
          ["check", t("자가 확인", "Self-check")],
        ] as const).map(([value, label], index) => <li key={value}>
          <button type="button" aria-current={step === value ? "step" : undefined} onClick={(event) => goToStep(value, event.currentTarget)}>
            <span aria-hidden="true">{index + 1}</span>{label}
          </button>
        </li>)}</ol>
      </nav>

      <div className="learn-step-content">
        <section hidden={step !== "goal"} aria-labelledby={`${id}-goal`}>
          <h2 id={`${id}-goal`} ref={step === "goal" ? stepHeadingRef : undefined} tabIndex={-1} className="learn-step-heading">{t("이번에 만들 결과", "What you will make")}</h2>
          <div className="learn-step-outcome">
            <strong>{meta.outcome}</strong>
            <div className="learn-step-actions"><button type="button" className="learn-primary" onClick={(event) => goToStep("practice", event.currentTarget)}>{t("한 과제 시작", "Start the task")} →</button></div>
          </div>
          <h3>{t("오늘의 한 과제", "Today's one task")}</h3>
          <p className="learn-step-task">{lesson.task}</p>
          <figure className="learn-goal-diagram">
            <LessonDiagram kind={lesson.lab} value={LAB_CONFIGS[lesson.lab].initial} frame={100} />
            <figcaption>{t("학습용 개념도 · 다음 단계에서 직접 조절할 수 있습니다.", "Learning diagram · Adjust the example in the next step.")}</figcaption>
          </figure>
        </section>

        <section hidden={step !== "practice"} aria-labelledby={`${id}-task-heading`}>
          <h2 id={`${id}-task-heading`} ref={step === "practice" ? stepHeadingRef : undefined} tabIndex={-1} className="learn-step-heading">{t("직접 만들어 보세요", "Make it yourself")}</h2>
          <div id={`${lesson.id}-practice`} className="learn-step-task-card learn-anchor-target" tabIndex={-1}>
            {mission && <h3>{mission.title}</h3>}
            <p className="learn-step-task">{lesson.task}</p>
            <p>{t("종이나 평소 쓰는 도구로 해도 괜찮습니다.", "Use paper or your usual tools.")}</p>
            <div className="learn-actions">
              <a className="learn-primary" href={mission ? buildStudioPracticeUrl(mission) : "/studio"} target="_blank" rel="noopener noreferrer" onClick={() => practice.startMission(lesson.id)}>{t("스튜디오에서 실습하기", "Practice in Studio")} <span aria-hidden="true">↗</span></a>
            </div>
            <p className="learn-small">{r44LearnStatusText("r44cat1.learn.learnContent.missionIdleNote", "새 탭에서 열립니다. 기존 작업을 자동 변경하지 않습니다.")} {t("실습 결과를 자동 채점하지 않습니다.", "Practice is not automatically graded.")}</p>
          </div>
          <details className="learn-lesson-disclosure" open={exampleOpen} onToggle={(event) => setExampleOpen(event.currentTarget.open)}>
            <summary onClick={(event) => { event.preventDefault(); setExampleOpen(!exampleOpen); }}>{t("예제 움직여 보며 이해하기", "Explore the interactive example")}</summary>
            <div hidden={!exampleOpen} id={`${lesson.id}-lab`} className="learn-anchor-target" tabIndex={-1}><LessonLab key={lesson.id} kind={lesson.lab} active={step === "practice" && exampleOpen} /></div>
          </details>
          <details className="learn-lesson-disclosure"><summary>{t("실습에 필요한 자료 찾기", "Find references for your task")}</summary><p>{t("장면에 필요한 자료를 출처와 함께 모을 수 있습니다.", "Collect references for your scene together with their sources.")}</p><Link className="learn-secondary" to="/research">{t("장면 자료 찾기", "Find scene references")} →</Link></details>
          <aside className="learn-caution"><h3>{t("이것만 주의하세요", "Keep this in mind")}</h3><p>{lesson.mistake}</p></aside>
          <div className="learn-step-actions"><button type="button" className="learn-primary" onClick={(event) => goToStep("check", event.currentTarget)}>{t("실습 후 자가 확인", "Review your practice")} →</button><button type="button" className="learn-secondary" onClick={(event) => goToStep("goal", event.currentTarget)}>{t("목표 다시 보기", "Review the goal")}</button></div>
        </section>

        <section hidden={step !== "check"} aria-labelledby={`${id}-check-heading`}>
          <h2 id={`${id}-check-heading`} ref={step === "check" ? stepHeadingRef : undefined} tabIndex={-1} className="learn-step-heading">{t("내가 만든 결과 확인", "Check what you made")}</h2>
          <p>{t("직접 만든 결과를 보며 체크하세요. 이 기록은 작품 저장이나 자동 채점 결과가 아닙니다.", "Check your own work. These records do not save your artwork and are not automatic grading results.")}</p>
          <div className="learn-practice learn-guided-practice">
            <fieldset>
              <legend>실습 체크리스트 <span>{checkedCount} / {lesson.checks.length}</span></legend>
              {lesson.checks.map((check, index) => {
                const checked = saved.checks.includes(index);
                return (
                  <label className="learn-check" data-checked={checked ? "true" : "false"} key={check}>
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-keyshortcuts={String(index + 1)}
                      onChange={(event) => store.patchLesson(lesson.id, {
                        checks: event.currentTarget.checked
                          ? [...saved.checks, index]
                          : saved.checks.filter((value) => value !== index),
                      })}
                    />
                    <span>{check}</span>
                    <kbd className="learn-check-key" aria-hidden="true">{index + 1}</kbd>
                  </label>
                );
              })}
            </fieldset>
            {mission && missionStatus && <div className="learn-mission-card">
              <div className="learn-mission-heading"><h3>{t("스튜디오 실습 기록", "Studio practice record")}</h3><span className="learn-mission-status" data-status={missionStatus}>{missionStatus === "completed" && practice.warning ? t("이 화면에서만 완료", "Completed on this screen only") : MISSION_STATUS_LABELS[missionStatus]}</span></div>
              <button type="button" className="learn-secondary" disabled={missionStatus !== "ready" && missionStatus !== "completed"} onClick={() => missionStatus === "completed" ? practice.reopenCurrentMission(lesson.id) : practice.completeCurrentMission(mission, store.progress)}>{missionStatus === "completed" ? "실습 완료 취소" : "실습 완료로 표시"}</button>
              <p className="learn-small" role="status">{missionStatus === "completed" ? t("직접 완료로 표시한 실습입니다. 체크를 해제하면 실습 완료도 풀립니다.", "You marked this practice as complete. Clearing a check also clears practice completion.") : t("모든 체크를 채운 뒤, 실습을 마쳤다면 직접 완료로 표시하세요.", "After checking every item, mark practice complete when you have finished it.")}</p>
              {practice.warning && <div role="status"><p>{practice.warning}</p><button type="button" onClick={() => missionStatus === "completed" ? practice.completeCurrentMission(mission, store.progress) : practice.startMission(lesson.id)}>{t("실습 기록 저장 다시 시도", "Retry saving practice records")}</button></div>}
            </div>}
          </div>
          <section
            id={`${lesson.id}-quiz`}
            className="learn-quiz learn-guided-quiz learn-anchor-target"
            aria-labelledby={`${id}-quiz`}
            tabIndex={-1}
          >
            <p className="learn-eyebrow">CHECK YOUR UNDERSTANDING</p>
            <h2 id={`${id}-quiz`}>확인 퀴즈</h2>
            <fieldset>
              <legend>{lesson.quiz.question}</legend>
              {lesson.quiz.options.map((option, index) => (
                <label className="learn-check" data-checked={saved.answer === index ? "true" : "false"} key={option}>
                  <input
                    type="radio"
                    name={`${id}-answer`}
                    checked={saved.answer === index}
                    onChange={() => store.patchLesson(lesson.id, { answer: index })}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
            {saved.answer !== null && (
              <p className="learn-caption" data-correct={quizCorrect ? "true" : "false"} role="status">
                <strong>{quizCorrect ? "정답입니다. " : "다시 생각해 보세요. "}</strong>{lesson.quiz.explanation}
              </p>
            )}
          </section>

          <section className="learn-finish learn-guided-finish">
            <div>
              <p className="learn-eyebrow">COMPLETE THE LESSON</p>
              <h2 ref={finishHeadingRef} tabIndex={-1} className="learn-focus-heading">{saved.completed ? "수업을 완료했습니다" : "배운 내용을 기록으로 남기세요"}</h2>
            </div>
            <button
              type="button"
              className="learn-primary"
              disabled={!ready || saved.completed}
              aria-keyshortcuts="C"
              onClick={() => store.patchLesson(lesson.id, { completed: true })}
            >
              {saved.completed ? "학습 완료됨" : "이 강좌 학습 완료"}
            </button>
            <p className="learn-small" role="status">
              {saved.completed
                ? store.warning
                  ? learnStatusText("learn.status.content.saveFailed", "이 화면에서 완료했습니다. 저장에 실패했으므로 새로고침 전에 기록을 백업하세요.")
                  : "완료 기록을 저장했습니다. 언제든 다시 열어 복습할 수 있습니다."
                : ready
                  ? "체크리스트와 정답을 확인했습니다. 완료 버튼으로 기록을 남기세요."
                  : "실습 체크리스트를 모두 체크하고 퀴즈에 정답을 선택해야 완료할 수 있습니다."}
            </p>
            {saved.completed && nextMission && (
              <div className="learn-mission-next">
                <p className="learn-eyebrow">NEXT PRACTICE MISSION</p>
                <h3>다음 실습 미션 · {nextMission.title}</h3>
                <p>목표 · {nextMission.goal}</p>
                <Link className="learn-secondary" to={`${lessonUrlInContext(nextMission.lessonId, navigation.path)}#${nextMission.lessonId}-practice`}>
                  {nextMission.lessonId === lesson.id ? "이 강좌의 실습으로 이동" : "미션 강좌로 이동"} <span aria-hidden="true">→</span>
                </Link>
              </div>
            )}
          </section>

          <button type="button" className="learn-secondary" onClick={(event) => goToStep("practice", event.currentTarget)}>{t("과제로 돌아가 보완하기", "Return to improve your task")}</button>
        </section>

        <section hidden={step !== "reference"} aria-labelledby={`${id}-reference-heading`}>
          <h2 id={`${id}-reference-heading`} ref={step === "reference" ? stepHeadingRef : undefined} tabIndex={-1} className="learn-step-heading">{t("개념·용어·출처", "Concepts, terms and sources")}</h2>
          <LessonReference lesson={lesson} />
          <button type="button" className="learn-secondary" onClick={(event) => goToStep("practice", event.currentTarget)}>{t("한 과제로 돌아가기", "Return to the task")}</button>
        </section>
      </div>

      <div className="learn-lesson-tools">
        <button type="button" className="learn-reference-trigger" aria-current={step === "reference" ? "page" : undefined} onClick={(event) => goToStep("reference", event.currentTarget)}>{t("개념·용어·출처", "Concepts, terms and sources")} <span>{t("선택 자료", "Optional reading")}</span></button>
        <details className="learn-lesson-disclosure" open={notesOpen} onToggle={(event) => setNotesOpen(event.currentTarget.open)}>
          <summary onClick={(event) => { event.preventDefault(); setNotesOpen(!notesOpen); }}>{t("실습 메모", "Practice notes")}{saved.notes ? t(" · 작성한 메모 있음", " · Notes entered") : ""}</summary>
          <section hidden={!notesOpen} id={`${lesson.id}-notes`} className="learn-notes learn-anchor-target" tabIndex={-1}>
            <div className="learn-section-heading">
              <div><p className="learn-eyebrow">REFLECTION</p><h2><label htmlFor={`${id}-notes`}>나의 실습 메모</label></h2></div>
              <span className="learn-small">{store.dirty ? t("저장되지 않은 변경 있음", "Unsaved changes") : t("현재 브라우저에 자동 저장", "Autosaved in this browser")}</span>
            </div>
            <textarea
              id={`${id}-notes`}
              maxLength={4000}
              rows={6}
              value={saved.notes}
              onChange={(event) => store.patchLesson(lesson.id, { notes: event.currentTarget.value })}
              placeholder="내가 바꾼 점, 달라진 결과, 다음에 확인할 점을 적어 보세요."
            />
            <p className="learn-small">{saved.notes.length.toLocaleString("ko-KR")} / 4,000자 · 이 브라우저에만 저장됩니다. 계정·다른 기기로 동기화되지 않습니다.</p>
            {store.warning && <div role="status"><p>{store.warning}</p><button type="button" onClick={() => store.retrySave()}>{t("기록 저장 다시 시도", "Retry saving records")}</button><Link to="/learn/records">{t("기록 백업·복구", "Back up or restore records")}</Link></div>}
          </section>

        </details>
        <details className="learn-lesson-disclosure">
          <summary>{t("강좌 정보와 이 기기 기록", "Lesson details and records on this device")}</summary>
          <p>{LEVEL_LABELS[meta.level]} · {t(`약 ${lesson.minutes}분`, `About ${lesson.minutes} min`)} · {skillLabels.join(" · ")}</p>
          <progress value={progress} max={100} aria-label={`${lesson.title} 자가 점검 진행률`} />
          <p>{t("진도와 메모는 현재 브라우저에만 저장됩니다. 작품 파일은 스튜디오에서 따로 저장하세요.", "Progress and notes stay in this browser. Save your artwork separately in Studio.")}</p>
          <Link className="learn-secondary" to="/learn/records">{t("학습 기록 백업·복구", "Back up or restore learning records")}</Link>
        </details>
      </div>
          <nav className="learn-prev-next" aria-label="이전·다음 강좌">
            {previous && previousUrl
              ? <Link to={previousUrl} aria-keyshortcuts="[ Alt+ArrowLeft"><span>← 이전 수업</span><strong>{previous.title}</strong></Link>
              : <Link to={navigation.path ? navigation.backUrl : "/learn#learning-paths"}><span>학습 경로</span><strong>{navigation.path ? t("선택한 경로 보기", "View selected path") : "목표별 경로 선택하기"}</strong></Link>}
            {next && nextUrl
              ? <Link to={nextUrl} aria-keyshortcuts="] Alt+ArrowRight"><span>다음 수업 →</span><strong>{next.title}</strong></Link>
              : <Link to={navigation.path ? navigation.backUrl : "/learn"}><span>{navigation.path ? t("경로의 마지막 수업", "Last lesson in this path") : "커리큘럼"}</span><strong>{navigation.path ? t("경로 학습 현황 보기 →", "View path progress →") : "전체 강좌 다시 보기 →"}</strong></Link>}
          </nav>
    </article>
  );
}
