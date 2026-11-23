/**
 * 교실(/learn/classroom) 과제 배포 → 학생 제출 → 붉은펜·음성 첨삭 → 5축 실기 루브릭 →
 * 학생 학기 포트폴리오 패키지 폐루프 워크벤치 패널.
 */

import "./classroom-critique-rubric.css";

import { Award, CheckCircle2, Download, Layers, MapPin, Mic, Plus, Volume2 } from "lucide-react";
import { useMemo, useState, type FormEvent, type MouseEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";

import { ClassroomPortfolioExportCard } from "./ClassroomPortfolioExportCard";
import {
  FIVE_AXIS_RUBRIC_SPECS,
  addRedlinePin,
  buildNonExportableOverlayModel,
  buildStudentPortfolioBundle,
  createInitialClassroomSubmissions,
  evaluateFiveAxisRubric,
  getRubricAxisSpec,
  toggleRedlinePinResolved,
  type ClassroomSubmissionRecord,
  type RubricAxisId,
  type RubricGrade,
  type RubricScoreValue,
} from "./classroom-critique-rubric";
import type { ClassroomAssignment } from "./learning-classroom";

export interface ClassroomCritiqueRubricPanelProps {
  readonly assignments?: readonly ClassroomAssignment[];
  readonly classroomName?: string;
}

const SCORE_CHOICES: readonly RubricScoreValue[] = [1, 2, 3, 4, 5];
const HANGUL_REGEX = /[가-힣]/u;

function gradePillClass(grade: RubricGrade): string {
  if (grade === "S" || grade === "A") return "ccr-pill ccr-pill-good ccr-num";
  if (grade === "B") return "ccr-pill ccr-pill-accent ccr-num";
  return "ccr-pill ccr-pill-bad ccr-num";
}

function downloadJsonFile(filename: string, jsonText: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ClassroomCritiqueRubricPanel({
  assignments = [],
  classroomName = "웹툰 제작 입문 · 8주",
}: ClassroomCritiqueRubricPanelProps): ReactElement {
  const lang = useI18n((state) => state.lang);
  const isKo = lang.toLowerCase().startsWith("ko");
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [roleView, setRoleView] = useState<"instructor" | "student">("instructor");
  const [submissions, setSubmissions] = useState<readonly ClassroomSubmissionRecord[]>(() =>
    createInitialClassroomSubmissions(),
  );
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("sub-w4-persp");
  const [selectedPinId, setSelectedPinId] = useState<string>("pin-02");
  const [draftCoord, setDraftCoord] = useState<{ readonly xPct: number; readonly yPct: number }>({
    xPct: 45,
    yPct: 35,
  });
  const [draftAxisId, setDraftAxisId] = useState<RubricAxisId>("lineart-pressure");
  const [draftNote, setDraftNote] = useState("");
  const [draftVoiceTranscript, setDraftVoiceTranscript] = useState("");
  const [newCutTitle, setNewCutTitle] = useState("");
  const [showOverlayJson, setShowOverlayJson] = useState(false);
  const [activeVoicePinId, setActiveVoicePinId] = useState<string | null>(null);

  const activeSubmission =
    submissions.find((item) => item.id === selectedSubmissionId) ?? submissions[0];
  const activeRubric = useMemo(
    () => evaluateFiveAxisRubric(activeSubmission.rubricScores),
    [activeSubmission.rubricScores],
  );
  const activeOverlay = useMemo(
    () => buildNonExportableOverlayModel(activeSubmission),
    [activeSubmission],
  );
  const activePin =
    activeSubmission.redlinePins.find((pin) => pin.id === selectedPinId) ??
    activeSubmission.redlinePins[0] ??
    null;

  const safeClassroomNameEn = HANGUL_REGEX.test(classroomName)
    ? "Webtoon Production Studio · Classroom"
    : classroomName;
  const portfolioBundle = useMemo(
    () =>
      buildStudentPortfolioBundle(submissions, {
        studentId: activeSubmission.studentId,
        studentNameKo: activeSubmission.studentNameKo,
        studentNameEn: activeSubmission.studentNameEn,
        classroomNameKo: classroomName,
        classroomNameEn: safeClassroomNameEn,
      }),
    [activeSubmission.studentId, activeSubmission.studentNameEn, activeSubmission.studentNameKo, classroomName, safeClassroomNameEn, submissions],
  );

  const resolvedCount = activeSubmission.redlinePins.filter((pin) => pin.resolved).length;

  function updateSubmission(
    submissionId: string,
    updater: (prev: ClassroomSubmissionRecord) => ClassroomSubmissionRecord,
  ): void {
    setSubmissions((current) =>
      current.map((item) => (item.id === submissionId ? updater(item) : item)),
    );
  }

  function handleStageClick(event: MouseEvent<HTMLButtonElement>): void {
    if (roleView !== "instructor") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPct = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
    const yPct = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;
    setDraftCoord({ xPct: Math.max(0, Math.min(100, xPct)), yPct: Math.max(0, Math.min(100, yPct)) });
  }

  function handleAddPin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const cleaned = draftNote.trim();
    if (!cleaned) return;
    const nextId = `pin-${Date.now().toString(36)}`;
    const voiceText = draftVoiceTranscript.trim();
    updateSubmission(activeSubmission.id, (prev) => ({
      ...prev,
      status: "critiqued",
      redlinePins: addRedlinePin(prev.redlinePins, {
        id: nextId,
        cutId: prev.cutLabel,
        xPct: draftCoord.xPct,
        yPct: draftCoord.yPct,
        axisId: draftAxisId,
        severity: "must-fix",
        noteKo: cleaned,
        noteEn: HANGUL_REGEX.test(cleaned) ? "Instructor redline revision requested." : cleaned,
        checklistItemKo: cleaned,
        checklistItemEn: HANGUL_REGEX.test(cleaned) ? "Complete instructor redline revision" : cleaned,
        voiceNote: voiceText
          ? {
              durationSec: Math.max(8, Math.min(90, Math.ceil(voiceText.length * 0.6))),
              transcriptKo: voiceText,
              transcriptEn: HANGUL_REGEX.test(voiceText) ? "Instructor voice critique recorded." : voiceText,
              recordedAtIso: "2026-11-23T12:40:00Z",
            }
          : undefined,
      }),
    }));
    setSelectedPinId(nextId);
    setDraftNote("");
    setDraftVoiceTranscript("");
  }

  function handleTogglePinResolved(pinId: string): void {
    updateSubmission(activeSubmission.id, (prev) => {
      const nextPins = toggleRedlinePinResolved(prev.redlinePins, pinId, "2026-11-23T12:45:00Z");
      const allResolved = nextPins.length > 0 && nextPins.every((item) => item.resolved);
      return { ...prev, status: allResolved ? "revised" : prev.status, redlinePins: nextPins };
    });
  }

  function handleScoreChange(axisId: RubricAxisId, score: RubricScoreValue): void {
    updateSubmission(activeSubmission.id, (prev) => {
      const nextScores = { ...prev.rubricScores, [axisId]: score };
      const evaluated = evaluateFiveAxisRubric(nextScores);
      return { ...prev, status: evaluated.portfolioEligible ? "passed" : "critiqued", rubricScores: nextScores };
    });
  }

  function handleQuickSubmitCut(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = newCutTitle.trim();
    if (!trimmed) return;
    const nextIndex = submissions.length + 1;
    const createdId = `sub-custom-${nextIndex}`;
    const created: ClassroomSubmissionRecord = {
      id: createdId,
      assignmentId: assignments[0]?.id ?? `asg-custom-${nextIndex}`,
      week: assignments[0]?.week ?? nextIndex,
      titleKo: trimmed,
      titleEn: HANGUL_REGEX.test(trimmed) ? `Student Cut Submission #${nextIndex}` : trimmed,
      studentId: activeSubmission.studentId,
      studentNameKo: activeSubmission.studentNameKo,
      studentNameEn: activeSubmission.studentNameEn,
      instructorNameKo: activeSubmission.instructorNameKo,
      instructorNameEn: activeSubmission.instructorNameEn,
      cutLabel: `CUT-0${nextIndex}-01`,
      status: "submitted",
      submittedAtIso: "2026-11-23T12:50:00Z",
      rubricScores: {
        "direction-composition": 3,
        "perspective-anatomy": 3,
        "lineart-pressure": 3,
        "balloon-readability": 3,
        "finish-polish": 3,
      },
      redlinePins: [],
    };
    setSubmissions((current) => [...current, created]);
    setSelectedSubmissionId(createdId);
    setSelectedPinId("");
    setNewCutTitle("");
  }

  const flowSteps = [
    { step: "01", ko: "과제 배포", en: "Assign", active: assignments.length > 0 || submissions.length > 0 },
    { step: "02", ko: "학생 제출", en: "Submit", active: submissions.length > 0 },
    { step: "03", ko: "붉은펜·음성 첨삭", en: "Redline & Voice", active: activeSubmission.redlinePins.length > 0 },
    { step: "04", ko: "5축 루브릭", en: "5-Axis Rubric", active: activeRubric.totalScore > 0 },
    { step: "05", ko: "포트폴리오", en: "Portfolio", active: portfolioBundle.includedWorks.length > 0 },
  ];

  return (
    <section
      className="ccr-panel"
      data-testid="classroom-critique-rubric-panel"
      aria-labelledby="ccr-heading"
      lang={isKo ? "ko" : "en"}
    >
      <div className="ccr-header">
        <div>
          <p className="learn-eyebrow">{pick("실기 첨삭 · 평가 · 포트폴리오 폐루프", "Closed-Loop Practical Critique & Portfolio")}</p>
          <h2 id="ccr-heading">
            {pick("붉은펜·음성 첨삭, 5축 루브릭 & 학기 포트폴리오", "Redline & Voice Critique, 5-Axis Rubric & Portfolio")}
          </h2>
          <p className="ccr-subtitle">
            {pick(
              "강사가 제출 컷 좌표에 붉은펜 핀과 음성 코멘트를 남기면 학생이 1클릭으로 수정 완료하고, B등급 이상 통과 과제를 학기 포트폴리오 패키지로 자동 묶습니다.",
              "Instructors drop redline pins and voice notes at exact cut coordinates; students resolve fixes in one click and bundle Grade B+ works into a term portfolio.",
            )}
          </p>
        </div>
        <div className="ccr-row-actions" role="group" aria-label={pick("교실 첨삭 역할 전환", "Switch classroom critique role")}>
          <button type="button" className="ccr-btn" data-testid="ccr-role-instructor" aria-pressed={roleView === "instructor"} onClick={() => setRoleView("instructor")}>
            {pick("강사 첨삭 모드", "Instructor Mode")}
          </button>
          <button type="button" className="ccr-btn" data-testid="ccr-role-student" aria-pressed={roleView === "student"} onClick={() => setRoleView("student")}>
            {pick("학생 수정·포트폴리오", "Student Mode")}
          </button>
        </div>
      </div>

      <ol className="ccr-flow-strip" aria-label={pick("실기 수업 폐루프 단계", "Closed-loop studio class stages")}>
        {flowSteps.map((item) => (
          <li key={item.step} className="ccr-flow-step" data-active={item.active ? "true" : "false"}>
            <span className="ccr-num">{item.step}</span>
            <strong>{pick(item.ko, item.en)}</strong>
          </li>
        ))}
      </ol>

      <div className="ccr-subcard">
        <div className="ccr-head-inline">
          <strong>{pick("학생 제출 컷 선택", "Student Cut Submissions")}</strong>
          <span className="ccr-pill ccr-pill-accent ccr-num">
            {pick(`총 ${submissions.length}편 · 과제 ${assignments.length}건 연동`, `${submissions.length} submissions · ${assignments.length} class assignments`)}
          </span>
        </div>
        <div className="ccr-chip-row" role="group" aria-label={pick("제출 과제 목록", "Submitted works")}>
          {submissions.map((sub) => {
            const subEval = evaluateFiveAxisRubric(sub.rubricScores);
            return (
              <button
                key={sub.id}
                type="button"
                className="ccr-btn ccr-num"
                data-testid={`ccr-submission-${sub.id}`}
                aria-pressed={sub.id === activeSubmission.id}
                onClick={() => { setSelectedSubmissionId(sub.id); setSelectedPinId(sub.redlinePins[0]?.id ?? ""); }}
              >
                W{String(sub.week).padStart(2, "0")} · {pick(sub.titleKo, sub.titleEn)} ({subEval.grade})
              </button>
            );
          })}
        </div>
        <form className="ccr-row-actions" onSubmit={handleQuickSubmitCut}>
          <label className="ccr-field" htmlFor="ccr-new-cut-input">
            {pick("새 학생 컷 제출 등록", "Submit New Student Cut")}
            <input
              id="ccr-new-cut-input"
              maxLength={120}
              value={newCutTitle}
              placeholder={pick("예: 6주차 대사·말풍선 완성 컷", "e.g. Week 6 Balloon & Lettering Cut")}
              onChange={(event) => setNewCutTitle(event.currentTarget.value)}
            />
          </label>
          <button type="submit" className="ccr-btn" disabled={!newCutTitle.trim()}>
            <Plus size={15} aria-hidden="true" />
            {pick("컷 제출", "Submit Cut")}
          </button>
        </form>
      </div>

      <div className="ccr-grid-2">
        <article className="ccr-card" data-testid="ccr-redline-panel">
          <div className="ccr-head-inline">
            <div>
              <h3>{pick("붉은펜 핀 & 음성 첨삭 캔버스", "Redline Pins & Voice Critique Canvas")}</h3>
              <p className="ccr-meta ccr-num">
                {activeSubmission.cutLabel} · {pick(`수정 완료 ${resolvedCount}/${activeSubmission.redlinePins.length}`, `Resolved ${resolvedCount}/${activeSubmission.redlinePins.length}`)} · {activeOverlay.layerName}
              </p>
            </div>
            <button type="button" className="ccr-btn" data-testid="ccr-toggle-overlay-btn" aria-pressed={showOverlayJson} onClick={() => setShowOverlayJson((v) => !v)}>
              <Layers size={15} aria-hidden="true" />
              {pick("비출력 오버레이 모델", "Non-Print Overlay")}
            </button>
          </div>

          <div className="ccr-cut-stage" data-testid="ccr-cut-stage" role="region" aria-label={pick("붉은펜 좌표 첨삭 컷 영역", "Redline coordinate critique cut stage")}>
            {roleView === "instructor" && (
              <button
                type="button"
                className="ccr-cut-hit-surface"
                data-testid="ccr-cut-coord-picker"
                aria-label={pick("컷 위 클릭으로 붉은펜 좌표 지정", "Click cut canvas to set redline pin coordinates")}
                onClick={handleStageClick}
              />
            )}
            <span className="ccr-cut-watermark ccr-num">
              {activeSubmission.cutLabel} · {pick("비출력 가이드(exportable: false)", "Non-Print Guide (exportable: false)")}
            </span>
            {activeSubmission.redlinePins.map((pin, index) => (
              <button
                key={pin.id}
                type="button"
                className="ccr-pin-btn ccr-num"
                style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
                data-testid={`ccr-pin-${pin.id}`}
                data-resolved={pin.resolved ? "true" : "false"}
                data-selected={activePin?.id === pin.id ? "true" : "false"}
                aria-label={pick(
                  `붉은펜 핀 ${index + 1}, 좌표 X ${pin.xPct}%, Y ${pin.yPct}%, ${pin.resolved ? "완료됨" : "수정 필요"}`,
                  `Redline pin ${index + 1}, coordinates X ${pin.xPct}%, Y ${pin.yPct}%, ${pin.resolved ? "resolved" : "open"}`,
                )}
                onClick={(event) => { event.stopPropagation(); setSelectedPinId(pin.id); }}
              >
                {index + 1}
              </button>
            ))}
          </div>

          {activePin ? (
            <div className="ccr-subcard" data-testid="ccr-active-pin-detail">
              <div className="ccr-head-inline">
                <strong className="ccr-num">
                  <MapPin size={14} aria-hidden="true" /> X {activePin.xPct}% · Y {activePin.yPct}% · {pick(getRubricAxisSpec(activePin.axisId).shortKo, getRubricAxisSpec(activePin.axisId).shortEn)}
                </strong>
                <span className={activePin.resolved ? "ccr-pill ccr-pill-good" : "ccr-pill ccr-pill-bad"}>
                  {activePin.resolved ? pick("수정 완료", "Resolved") : pick("수정 대기", "Action Needed")}
                </span>
              </div>
              <p className="ccr-meta">{pick(activePin.noteKo, activePin.noteEn)}</p>
              <p className="ccr-meta">
                <strong>{pick("체크리스트:", "Checklist:")}</strong> {pick(activePin.checklistItemKo, activePin.checklistItemEn)}
              </p>
              {activePin.voiceNote && (
                <div className="ccr-subcard" data-testid="ccr-voice-note-card">
                  <div className="ccr-head-inline">
                    <span className="ccr-pill ccr-pill-accent ccr-num">
                      <Mic size={13} aria-hidden="true" />
                      {pick(`음성 첨삭 ${activePin.voiceNote.durationSec}초`, `Voice Note ${activePin.voiceNote.durationSec}s`)}
                    </span>
                    <button type="button" className="ccr-btn" aria-pressed={activeVoicePinId === activePin.id} onClick={() => setActiveVoicePinId((cur) => (cur === activePin.id ? null : activePin.id))}>
                      <Volume2 size={14} aria-hidden="true" />
                      {activeVoicePinId === activePin.id ? pick("재생 중지", "Stop Preview") : pick("음성 노트 듣기", "Play Voice Note")}
                    </button>
                  </div>
                  <p className="ccr-meta">{pick(activePin.voiceNote.transcriptKo, activePin.voiceNote.transcriptEn)}</p>
                </div>
              )}
              <button type="button" className="ccr-btn ccr-btn-primary" data-testid="ccr-toggle-pin-resolved-btn" onClick={() => handleTogglePinResolved(activePin.id)}>
                <CheckCircle2 size={15} aria-hidden="true" />
                {activePin.resolved ? pick("수정 완료 취소", "Reopen Pin") : pick("1클릭 수정 완료 처리", "Mark Revision Done")}
              </button>
            </div>
          ) : (
            <p className="ccr-meta">{pick("아직 등록된 붉은펜 핀이 없습니다.", "No redline pins recorded on this cut yet.")}</p>
          )}

          {roleView === "instructor" && (
            <form className="ccr-subcard" onSubmit={handleAddPin} data-testid="ccr-add-pin-form">
              <div className="ccr-head-inline">
                <strong>{pick("새 붉은펜 핀 · 음성 노트 남기기", "Add Redline Pin & Voice Note")}</strong>
                <span className="ccr-pill ccr-num">X {draftCoord.xPct}% · Y {draftCoord.yPct}%</span>
              </div>
              <div className="ccr-form-grid">
                <label className="ccr-field" htmlFor="ccr-pin-axis">
                  {pick("연결 루브릭 축", "Rubric Axis")}
                  <select id="ccr-pin-axis" value={draftAxisId} onChange={(event) => setDraftAxisId(event.currentTarget.value as RubricAxisId)}>
                    {FIVE_AXIS_RUBRIC_SPECS.map((axis) => (
                      <option key={axis.id} value={axis.id}>{pick(axis.labelKo, axis.labelEn)}</option>
                    ))}
                  </select>
                </label>
                <label className="ccr-field" htmlFor="ccr-pin-note">
                  {pick("붉은펜 수정 지시", "Redline Critique Note")}
                  <input id="ccr-pin-note" maxLength={160} value={draftNote} placeholder={pick("예: 턱선 외곽 틈새 봉합", "e.g. Seal jaw contour gap")} onChange={(event) => setDraftNote(event.currentTarget.value)} />
                </label>
                <label className="ccr-field ccr-field-full" htmlFor="ccr-pin-voice">
                  {pick("음성 첨삭 메모 (선택)", "Voice Critique Transcript (Optional)")}
                  <input id="ccr-pin-voice" maxLength={200} value={draftVoiceTranscript} placeholder={pick("예: 외곽선 필압만 강하게 주면 입체감이 살아납니다.", "e.g. Boost outer pen pressure for stronger depth.")} onChange={(event) => setDraftVoiceTranscript(event.currentTarget.value)} />
                </label>
              </div>
              <button type="submit" className="ccr-btn" disabled={!draftNote.trim()}>
                <MapPin size={15} aria-hidden="true" />
                {pick("좌표에 붉은펜 핀 추가", "Drop Redline Pin")}
              </button>
            </form>
          )}

          {showOverlayJson && (
            <div className="ccr-subcard" data-testid="ccr-overlay-export-preview">
              <div className="ccr-head-inline">
                <strong className="ccr-num">{activeOverlay.layerName} (exportable: false)</strong>
                <button type="button" className="ccr-btn" onClick={() => downloadJsonFile(`${activeSubmission.cutLabel}-redline-overlay.json`, JSON.stringify(activeOverlay, null, 2))}>
                  <Download size={14} aria-hidden="true" />
                  {pick("오버레이 JSON 저장", "Download Overlay JSON")}
                </button>
              </div>
              <pre className="ccr-code-preview ccr-num">{JSON.stringify(activeOverlay, null, 2)}</pre>
            </div>
          )}
        </article>

        <article className="ccr-card" data-testid="ccr-rubric-panel">
          <div className="ccr-head-inline">
            <div>
              <h3>{pick("5축 실기 루브릭 평가기 (25점 만점)", "5-Axis Practical Rubric (25-Pt Scale)")}</h3>
              <p className="ccr-meta">{pick(activeRubric.gradeLabelKo, activeRubric.gradeLabelEn)}</p>
            </div>
            <span data-testid="ccr-rubric-grade-badge" className={gradePillClass(activeRubric.grade)}>
              <Award size={14} aria-hidden="true" />
              {activeRubric.totalScore}/25 · {activeRubric.grade}
            </span>
          </div>

          <ul className="ccr-axis-list">
            {FIVE_AXIS_RUBRIC_SPECS.map((axis) => {
              const score = activeRubric.scores[axis.id];
              return (
                <li key={axis.id} className="ccr-subcard">
                  <div className="ccr-head-inline">
                    <strong>{pick(axis.labelKo, axis.labelEn)}</strong>
                    <span className="ccr-pill ccr-num">{score} / 5</span>
                  </div>
                  <p className="ccr-meta">{pick(axis.criteriaKo, axis.criteriaEn)}</p>
                  <div className="ccr-score-row" role="group" aria-label={pick(`${axis.labelKo} 점수 선택`, `Select score for ${axis.labelEn}`)}>
                    {SCORE_CHOICES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="ccr-score-btn ccr-num"
                        data-testid={`rubric-${axis.id}-${value}`}
                        aria-pressed={score === value}
                        onClick={() => handleScoreChange(axis.id, value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="ccr-subcard" data-testid="ccr-improvement-guides">
            <strong>{pick("자동 보완 가이드 & 추천 강좌", "Automated Improvement Guides")}</strong>
            <ul className="ccr-pin-list">
              {activeRubric.improvementGuides.map((guide) => (
                <li key={guide.axisId} className="ccr-meta">
                  <strong>{pick(guide.labelKo, guide.labelEn)} ({guide.score}/5):</strong>{" "}
                  {pick(guide.guideKo, guide.guideEn)}{" "}
                  <Link to={`/learn/lessons/${guide.suggestedLessonId}`}>
                    {pick("보완 강좌 열기 →", "Open lesson →")}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>

      <ClassroomPortfolioExportCard bundle={portfolioBundle} isKo={isKo} onDownloadJson={downloadJsonFile} />
    </section>
  );
}
