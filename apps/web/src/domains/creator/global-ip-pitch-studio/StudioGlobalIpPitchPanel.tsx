/**
 * Wave 45D — 글로벌 IP·OTT·출판 피칭 바이블 자동 조판 스튜디오 패널.
 *
 * - 3종 장르 스타터(`액션 판타지` · `현대 로맨스` · `미스터리 스릴러`) 즉시 전환
 * - 12장 에디토리얼 슬라이드 내비게이터 + 전 슬라이드 실시간 편집 & 조판 미리보기
 * - 25~45자 로그라인 검증 · 시즌 1(12부작/60화) 정합성 · 누락/과장 감사 리포트(0~100점)
 * - 모든 시장·예산 범위 및 감사 지표에 `추정` 배지(`dataSourceKind: "estimate"`) 명시
 * - 에디토리얼 Markdown 바이블 / JSON 패키지 미리보기 및 복사
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색·광범위 트랜지션·기본 빈 객체 props·Web Storage·장식 아이콘 미사용)
 */

import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Code2, Copy,
  FileText, Globe, RotateCcw, ShieldAlert,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";

import {
  AVAILABLE_RIGHTS_OPTIONS, LOGLINE_MAX_CHARS, LOGLINE_MIN_CHARS, PITCH_GENRE_METAS,
  PITCH_SLIDE_IDS, PITCH_SLIDE_METAS, auditPitchBibleReadiness, buildPitchBibleDeck,
  createPitchBibleStarter, exportPitchBibleJson, exportPitchBibleMarkdown,
  formatEstimateRangeLabel,
  type PitchAuditIssue, type PitchBibleDeck, type PitchBibleInput,
  type PitchBibleReadinessAudit, type PitchEstimateRange, type PitchGenreId,
  type PitchReadinessGrade, type PitchSlideId, type SlideAuditStatus,
} from "./global-ip-pitch-engine";

export interface StudioGlobalIpPitchPanelProps {
  readonly initialGenreId?: PitchGenreId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onDeckChange?: (deck: PitchBibleDeck, audit: PitchBibleReadinessAudit) => void;
  readonly onExportMarkdown?: (markdown: string, deck: PitchBibleDeck) => void;
  readonly onExportJson?: (json: string, deck: PitchBibleDeck) => void;
}

type ExportPreviewTab = "markdown" | "json" | "hidden";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg placeholder:text-fg-3 transition-colors motion-reduce:transition-none hover:border-line-strong [word-break:keep-all] ${FOCUS_RING}`;
const TEXTAREA_CLS = `min-h-20 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs leading-relaxed text-fg placeholder:text-fg-3 transition-colors motion-reduce:transition-none hover:border-line-strong [word-break:keep-all] ${FOCUS_RING}`;

function parseNonNegNumber(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function scoreTone(score: number): string {
  if (score >= 85) return "text-good";
  return score >= 60 ? "text-warn" : "text-bad";
}

function gradeLabel(grade: PitchReadinessGrade, isEn: boolean): string {
  if (grade === "pitch-ready") return isEn ? "Pitch Ready" : "피칭 준비 완료";
  return grade === "needs-polish" ? (isEn ? "Needs Polish" : "보완 권장") : (isEn ? "Draft Incomplete" : "초안 보강 필요");
}

function slideStatusMeta(status: SlideAuditStatus, isEn: boolean): { readonly label: string; readonly cls: string } {
  if (status === "ready") return { label: isEn ? "OK" : "완료", cls: "border-good bg-good-soft text-good" };
  return status === "warning"
    ? { label: isEn ? "Check" : "주의", cls: "border-warn bg-warning-soft text-warn" }
    : { label: isEn ? "Fix" : "누락", cls: "border-bad bg-bad-soft text-bad" };
}

function EstimateBadge(props: { readonly isEn: boolean; readonly testId?: string }): ReactElement {
  const { isEn, testId } = props;
  return (
    <span
      data-testid={testId}
      data-data-source="estimate"
      className="inline-flex items-center rounded-md border border-warn bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warn [word-break:keep-all]"
    >
      {isEn ? "Estimate" : "추정"}
    </span>
  );
}

function KpiCard(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string; readonly badge?: ReactElement;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg", badge } = props;
  return (
    <div className="rounded-xl border border-line bg-raised px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</span>
        {badge}
      </div>
      <div data-testid={testId} className={`mt-1 text-base font-bold tabular-nums [word-break:keep-all] ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

function TextField(props: {
  readonly id: string; readonly testId: string; readonly label: string;
  readonly value: string; readonly onChange: (next: string) => void; readonly multiline?: boolean;
}): ReactElement {
  const { id, testId, label, value, onChange, multiline = false } = props;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{label}</label>
      {multiline ? (
        <textarea id={id} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className={TEXTAREA_CLS} />
      ) : (
        <input id={id} data-testid={testId} type="text" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS} />
      )}
    </div>
  );
}

function EstimateRangeEditor(props: {
  readonly idPrefix: string; readonly testPrefix: string; readonly title: string;
  readonly range: PitchEstimateRange; readonly isEn: boolean; readonly onChange: (next: PitchEstimateRange) => void;
}): ReactElement {
  const { idPrefix, testPrefix, title, range, isEn, onChange } = props;
  return (
    <div className="space-y-2.5 rounded-xl border border-line bg-raised p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">{title}</span>
          <EstimateBadge isEn={isEn} testId={`${testPrefix}-badge`} />
        </div>
        <span data-testid={`${testPrefix}-summary`} className="text-xs font-semibold text-fg-2 tabular-nums [word-break:keep-all]">
          {formatEstimateRangeLabel(range, isEn ? "en" : "ko")}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-min`} className="block text-[11px] font-medium text-fg-3 [word-break:keep-all]">
            {isEn ? `Min (${range.unitEn})` : `하한 (${range.unitKo})`}
          </label>
          <input
            id={`${idPrefix}-min`} data-testid={`${testPrefix}-min`} type="number" min={0} step={0.5} value={range.minAmount}
            onChange={(e) => onChange({ ...range, minAmount: parseNonNegNumber(e.target.value, range.minAmount) })}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-max`} className="block text-[11px] font-medium text-fg-3 [word-break:keep-all]">
            {isEn ? `Max (${range.unitEn})` : `상한 (${range.unitKo})`}
          </label>
          <input
            id={`${idPrefix}-max`} data-testid={`${testPrefix}-max`} type="number" min={0} step={0.5} value={range.maxAmount}
            onChange={(e) => onChange({ ...range, maxAmount: parseNonNegNumber(e.target.value, range.maxAmount) })}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </div>
      </div>
      <TextField
        id={`${idPrefix}-assumption`} testId={`${testPrefix}-assumption`}
        label={isEn ? "Planning Assumption (dataSourceKind: estimate)" : "추정 가정 근거 (실측 확정치 아님)"}
        value={range.assumptionKo} onChange={(v) => onChange({ ...range, assumptionKo: v })}
      />
      {range.minAmount > range.maxAmount ? (
        <p className="text-[11px] font-medium text-bad [word-break:keep-all]">
          {isEn ? "Minimum cannot exceed maximum." : "하한값이 상한값보다 큽니다. 범위를 조정하세요."}
        </p>
      ) : null}
    </div>
  );
}

/** 글로벌 IP·OTT·출판 피칭 바이블 12장 자동 조판 스튜디오 단독 패널. */
export function StudioGlobalIpPitchPanel(props: StudioGlobalIpPitchPanelProps): ReactElement {
  const { initialGenreId = "action-fantasy", locale = "ko", className, onDeckChange, onExportMarkdown, onExportJson } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [genreId, setGenreId] = useState<PitchGenreId>(initialGenreId);
  const [input, setInput] = useState<PitchBibleInput>(() => createPitchBibleStarter(initialGenreId));
  const [activeSlideId, setActiveSlideId] = useState<PitchSlideId>("cover");
  const [selectedCharIndex, setSelectedCharIndex] = useState<number>(0);
  const [exportTab, setExportTab] = useState<ExportPreviewTab>("markdown");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const deck = useMemo<PitchBibleDeck>(() => buildPitchBibleDeck(input), [input]);
  const audit = useMemo<PitchBibleReadinessAudit>(() => auditPitchBibleReadiness(deck), [deck]);
  const markdownDoc = useMemo<string>(() => exportPitchBibleMarkdown(deck, audit, { locale }), [deck, audit, locale]);
  const jsonDoc = useMemo<string>(() => exportPitchBibleJson(deck, audit, { locale }), [deck, audit, locale]);

  useEffect(() => { onDeckChange?.(deck, audit); }, [deck, audit, onDeckChange]);

  const activeSlideIndex = Math.max(0, PITCH_SLIDE_IDS.indexOf(activeSlideId));
  const activeSlide = deck.slides[activeSlideIndex] ?? deck.slides[0];
  const activeSlideAudit = audit.slideAudits[activeSlideIndex];
  const activeChar = input.coreCharacters[selectedCharIndex] ?? input.coreCharacters[0];

  const handleSelectGenre = (nextGenre: PitchGenreId): void => {
    const starter = createPitchBibleStarter(nextGenre);
    const meta = PITCH_GENRE_METAS.find((g) => g.id === nextGenre);
    setGenreId(nextGenre);
    setInput(starter);
    setSelectedCharIndex(0);
    setStatusMessage(pick(`${meta?.labelKo ?? nextGenre} 12장 피칭 바이블 스타터(${starter.cover.titleKo})를 불러왔습니다.`, `Loaded ${meta?.labelEn ?? nextGenre} starter (${starter.cover.titleEn}).`));
  };

  const handleReset = (): void => {
    setInput(createPitchBibleStarter(genreId));
    setSelectedCharIndex(0);
    setStatusMessage(pick("현재 장르 스타터 기본 원고로 복원했습니다.", "Restored current genre starter defaults."));
  };

  const handleStepSlide = (delta: -1 | 1): void => {
    const nextId = PITCH_SLIDE_IDS[Math.max(0, Math.min(PITCH_SLIDE_IDS.length - 1, activeSlideIndex + delta))];
    if (nextId) setActiveSlideId(nextId);
  };

  const copySafely = (text: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  const handleCopyMarkdown = (): void => {
    onExportMarkdown?.(markdownDoc, deck);
    copySafely(markdownDoc);
    setExportTab("markdown");
    setStatusMessage(pick(`에디토리얼 Markdown 피칭 바이블(${markdownDoc.length.toLocaleString("ko-KR")}자)을 복사했습니다.`, `Copied Markdown pitch bible (${markdownDoc.length.toLocaleString("en-US")} chars).`));
  };

  const handleCopyJson = (): void => {
    onExportJson?.(jsonDoc, deck);
    copySafely(jsonDoc);
    setExportTab("json");
    setStatusMessage(pick(`JSON 피칭 패키지(${jsonDoc.length.toLocaleString("ko-KR")}자)를 복사했습니다.`, `Copied JSON pitch package (${jsonDoc.length.toLocaleString("en-US")} chars).`));
  };

  const toggleAvailableRight = (rightLabel: string): void => {
    setInput((prev) => ({
      ...prev,
      contact: {
        ...prev.contact,
        availableRights: prev.contact.availableRights.includes(rightLabel)
          ? prev.contact.availableRights.filter((item) => item !== rightLabel)
          : [...prev.contact.availableRights, rightLabel],
      },
    }));
  };

  const loglineTone = deck.loglineValidation.isOptimal ? "text-good" : deck.loglineValidation.status === "empty" ? "text-bad" : "text-warn";
  const loglinePct = Math.min(100, Math.round((deck.loglineValidation.charCount / LOGLINE_MAX_CHARS) * 100));

  const renderSlideEditor = (): ReactElement => {
    switch (activeSlideId) {
      case "cover":
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField id={`${uid}-title-ko`} testId="pitch-input-title-ko" label={pick("작품명 (국문)", "Title (Korean)")} value={input.cover.titleKo} onChange={(v) => setInput((p) => ({ ...p, cover: { ...p.cover, titleKo: v } }))} />
            <TextField id={`${uid}-title-en`} testId="pitch-input-title-en" label={pick("영문 제목", "Title (English)")} value={input.cover.titleEn} onChange={(v) => setInput((p) => ({ ...p, cover: { ...p.cover, titleEn: v } }))} />
            <div className="sm:col-span-2">
              <TextField id={`${uid}-tagline`} testId="pitch-input-tagline" label={pick("표지 태그라인", "Cover Tagline")} value={input.cover.taglineKo} onChange={(v) => setInput((p) => ({ ...p, cover: { ...p.cover, taglineKo: v } }))} />
            </div>
            <TextField id={`${uid}-genre-badge`} testId="pitch-input-genre-badge" label={pick("장르 태그", "Genre Tag")} value={input.cover.genreBadgeKo} onChange={(v) => setInput((p) => ({ ...p, cover: { ...p.cover, genreBadgeKo: v } }))} />
            <TextField id={`${uid}-format-target`} testId="pitch-input-format-target" label={pick("제안 포맷", "Target Format")} value={input.cover.formatTargetKo} onChange={(v) => setInput((p) => ({ ...p, cover: { ...p.cover, formatTargetKo: v } }))} />
            <TextField id={`${uid}-studio`} testId="pitch-input-studio" label={pick("권리사 / 스튜디오", "Rights Holder / Studio")} value={input.cover.studioName} onChange={(v) => setInput((p) => ({ ...p, cover: { ...p.cover, studioName: v } }))} />
            <TextField id={`${uid}-status`} testId="pitch-input-status" label={pick("원고·개발 현황", "Development Status")} value={input.cover.serializationStatusKo} onChange={(v) => setInput((p) => ({ ...p, cover: { ...p.cover, serializationStatusKo: v } }))} />
          </div>
        );

      case "logline":
        return (
          <div className="space-y-3">
            <TextField
              id={`${uid}-logline`} testId="pitch-input-logline" multiline
              label={pick(`핵심 로그라인 (권장 ${LOGLINE_MIN_CHARS}~${LOGLINE_MAX_CHARS}자)`, `Core Logline (${LOGLINE_MIN_CHARS}-${LOGLINE_MAX_CHARS} chars)`)}
              value={input.logline.loglineKo} onChange={(v) => setInput((p) => ({ ...p, logline: { ...p.logline, loglineKo: v } }))}
            />
            <div className="rounded-xl border border-line bg-raised p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-fg-2 [word-break:keep-all]">{pick("25~45자 호흡 검증", "25-45 Char Pitch Check")}</span>
                <span data-testid="pitch-logline-counter" className={`font-bold tabular-nums ${loglineTone}`}>
                  {deck.loglineValidation.charCount}{pick("자", " chars")} ({pick(`공백 제외 ${deck.loglineValidation.charCountNoSpaces}자`, `${deck.loglineValidation.charCountNoSpaces} no-space`)})
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-canvas">
                <div className={`h-full rounded-full transition-colors motion-reduce:transition-none ${deck.loglineValidation.isOptimal ? "bg-good" : deck.loglineValidation.status === "empty" ? "bg-bad" : "bg-warn"}`} style={{ width: `${loglinePct}%` }} />
              </div>
              <p data-testid="pitch-logline-feedback" className="mt-2 text-xs text-fg-2 [word-break:keep-all]">
                {isEn ? deck.loglineValidation.messageEn : deck.loglineValidation.messageKo}
              </p>
            </div>
            <TextField id={`${uid}-hook`} testId="pitch-input-hook" label={pick("하이컨셉 후크 1줄", "High-Concept Hook")} value={input.logline.highConceptHookKo} onChange={(v) => setInput((p) => ({ ...p, logline: { ...p.logline, highConceptHookKo: v } }))} multiline />
          </div>
        );

      case "creative-intent":
        return (
          <div className="grid grid-cols-1 gap-3">
            <TextField id={`${uid}-origin`} testId="pitch-input-origin" label={pick("창작 출발점", "Origin Motif")} value={input.creativeIntent.originMotifKo} onChange={(v) => setInput((p) => ({ ...p, creativeIntent: { ...p.creativeIntent, originMotifKo: v } }))} multiline />
            <TextField id={`${uid}-theme`} testId="pitch-input-theme" label={pick("글로벌 보편 정서", "Universal Theme")} value={input.creativeIntent.universalThemeKo} onChange={(v) => setInput((p) => ({ ...p, creativeIntent: { ...p.creativeIntent, universalThemeKo: v } }))} multiline />
            <TextField id={`${uid}-timeliness`} testId="pitch-input-timeliness" label={pick("시의성 및 글로벌 확장 이유", "Global Timeliness")} value={input.creativeIntent.globalTimelinessKo} onChange={(v) => setInput((p) => ({ ...p, creativeIntent: { ...p.creativeIntent, globalTimelinessKo: v } }))} multiline />
            <TextField id={`${uid}-promise`} testId="pitch-input-promise" label={pick("연출 약속", "Director Promise")} value={input.creativeIntent.directorPromiseKo} onChange={(v) => setInput((p) => ({ ...p, creativeIntent: { ...p.creativeIntent, directorPromiseKo: v } }))} multiline />
          </div>
        );

      case "world-rules":
        return (
          <div className="space-y-3">
            <TextField id={`${uid}-setting`} testId="pitch-input-setting" label={pick("시대·공간 배경 요약", "World Setting Summary")} value={input.worldRules.settingSummaryKo} onChange={(v) => setInput((p) => ({ ...p, worldRules: { ...p.worldRules, settingSummaryKo: v } }))} multiline />
            <TextField id={`${uid}-conflict`} testId="pitch-input-conflict" label={pick("핵심 갈등 메커니즘", "Conflict Mechanism")} value={input.worldRules.conflictMechanismKo} onChange={(v) => setInput((p) => ({ ...p, worldRules: { ...p.worldRules, conflictMechanismKo: v } }))} multiline />
            {input.worldRules.rules.map((rule, idx) => (
              <div key={rule.id} className="space-y-2 rounded-xl border border-line bg-raised p-3">
                <div className="text-xs font-semibold text-fg tabular-nums [word-break:keep-all]">{pick(`규칙 ${idx + 1}`, `Rule ${idx + 1}`)}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <TextField id={`${uid}-rt-${rule.id}`} testId={`pitch-world-rule-title-${idx}`} label={pick("규칙명", "Rule Title")} value={rule.titleKo} onChange={(v) => setInput((p) => ({ ...p, worldRules: { ...p.worldRules, rules: p.worldRules.rules.map((r) => (r.id === rule.id ? { ...r, titleKo: v } : r)) } }))} />
                  <TextField id={`${uid}-rc-${rule.id}`} testId={`pitch-world-rule-cost-${idx}`} label={pick("대가·제약 조건", "Cost / Constraint")} value={rule.costLimitKo} onChange={(v) => setInput((p) => ({ ...p, worldRules: { ...p.worldRules, rules: p.worldRules.rules.map((r) => (r.id === rule.id ? { ...r, costLimitKo: v } : r)) } }))} />
                </div>
                <TextField id={`${uid}-rb-${rule.id}`} testId={`pitch-world-rule-body-${idx}`} label={pick("규칙 설명", "Rule Detail")} value={rule.ruleKo} onChange={(v) => setInput((p) => ({ ...p, worldRules: { ...p.worldRules, rules: p.worldRules.rules.map((r) => (r.id === rule.id ? { ...r, ruleKo: v } : r)) } }))} />
              </div>
            ))}
          </div>
        );

      case "core-characters":
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={pick("핵심 캐릭터 4인 선택", "Select 4 core characters")}>
              {input.coreCharacters.map((ch, idx) => (
                <button key={ch.id} type="button" role="tab" aria-selected={selectedCharIndex === idx} data-testid={`pitch-char-tab-${idx}`} onClick={() => setSelectedCharIndex(idx)} className={selectedCharIndex === idx ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span className="tabular-nums">0{idx + 1}</span>
                  <span>{ch.nameKo || pick("미정", "Unnamed")}</span>
                </button>
              ))}
            </div>
            {activeChar ? (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-raised p-3.5 sm:grid-cols-2">
                <TextField id={`${uid}-cname`} testId="pitch-char-name" label={pick("캐릭터 이름", "Character Name")} value={activeChar.nameKo} onChange={(v) => setInput((p) => ({ ...p, coreCharacters: p.coreCharacters.map((c, i) => (i === selectedCharIndex ? { ...c, nameKo: v } : c)) }))} />
                <TextField id={`${uid}-crole`} testId="pitch-char-role" label={pick("역할·포지션", "Role")} value={activeChar.roleKo} onChange={(v) => setInput((p) => ({ ...p, coreCharacters: p.coreCharacters.map((c, i) => (i === selectedCharIndex ? { ...c, roleKo: v } : c)) }))} />
                <TextField id={`${uid}-cdes`} testId="pitch-char-desire" label={pick("핵심 욕망", "Core Desire")} value={activeChar.desireKo} onChange={(v) => setInput((p) => ({ ...p, coreCharacters: p.coreCharacters.map((c, i) => (i === selectedCharIndex ? { ...c, desireKo: v } : c)) }))} />
                <TextField id={`${uid}-cflaw`} testId="pitch-char-flaw" label={pick("치명적 결함", "Fatal Flaw")} value={activeChar.fatalFlawKo} onChange={(v) => setInput((p) => ({ ...p, coreCharacters: p.coreCharacters.map((c, i) => (i === selectedCharIndex ? { ...c, fatalFlawKo: v } : c)) }))} />
                <div className="sm:col-span-2">
                  <TextField id={`${uid}-carc`} testId="pitch-char-arc" label={pick("시즌 1 변화 아크", "Season 1 Character Arc")} value={activeChar.seasonArcKo} onChange={(v) => setInput((p) => ({ ...p, coreCharacters: p.coreCharacters.map((c, i) => (i === selectedCharIndex ? { ...c, seasonArcKo: v } : c)) }))} multiline />
                </div>
              </div>
            ) : null}
          </div>
        );

      case "season-arc":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField id={`${uid}-s-title`} testId="pitch-season-title" label={pick("시즌 1 부제", "Season 1 Title")} value={input.seasonArc.seasonTitleKo} onChange={(v) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, seasonTitleKo: v } }))} />
              <TextField id={`${uid}-s-fmt`} testId="pitch-season-format" label={pick("12부작/60화 변환 구조", "12-Ep / 60-Ch Mapping")} value={input.seasonArc.formatNoteKo} onChange={(v) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, formatNoteKo: v } }))} />
            </div>
            {input.seasonArc.blocks.map((block, idx) => (
              <div key={block.id} className="space-y-2 rounded-xl border border-line bg-raised p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-fg [word-break:keep-all]">{block.actLabelKo} · {block.episodeRangeLabel}</span>
                  <span className="text-fg-3 tabular-nums">{block.episodeCount}{pick("부작", " ep")} / {block.chapterStart}~{block.chapterEnd}{pick("화", " ch")}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label htmlFor={`${uid}-ep-${block.id}`} className="block text-[11px] font-medium text-fg-3">{pick("부작 수", "Episodes")}</label>
                    <input id={`${uid}-ep-${block.id}`} data-testid={`pitch-arc-episodes-${idx}`} type="number" min={1} max={24} value={block.episodeCount} onChange={(e) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, blocks: p.seasonArc.blocks.map((b) => (b.id === block.id ? { ...b, episodeCount: Math.round(parseNonNegNumber(e.target.value, b.episodeCount)) } : b)) } }))} className={`${INPUT_CLS} tabular-nums`} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${uid}-cs-${block.id}`} className="block text-[11px] font-medium text-fg-3">{pick("시작 화", "Start Ch")}</label>
                    <input id={`${uid}-cs-${block.id}`} data-testid={`pitch-arc-start-${idx}`} type="number" min={1} value={block.chapterStart} onChange={(e) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, blocks: p.seasonArc.blocks.map((b) => (b.id === block.id ? { ...b, chapterStart: Math.round(parseNonNegNumber(e.target.value, b.chapterStart)) } : b)) } }))} className={`${INPUT_CLS} tabular-nums`} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${uid}-ce-${block.id}`} className="block text-[11px] font-medium text-fg-3">{pick("종료 화", "End Ch")}</label>
                    <input id={`${uid}-ce-${block.id}`} data-testid={`pitch-arc-end-${idx}`} type="number" min={1} value={block.chapterEnd} onChange={(e) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, blocks: p.seasonArc.blocks.map((b) => (b.id === block.id ? { ...b, chapterEnd: Math.round(parseNonNegNumber(e.target.value, b.chapterEnd)) } : b)) } }))} className={`${INPUT_CLS} tabular-nums`} />
                  </div>
                </div>
                <TextField id={`${uid}-as-${block.id}`} testId={`pitch-arc-summary-${idx}`} label={pick("핵심 사건", "Core Beat")} value={block.summaryKo} onChange={(v) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, blocks: p.seasonArc.blocks.map((b) => (b.id === block.id ? { ...b, summaryKo: v } : b)) } }))} />
                <TextField id={`${uid}-ac-${block.id}`} testId={`pitch-arc-cliff-${idx}`} label={pick("클리프행어", "Cliffhanger")} value={block.cliffhangerKo} onChange={(v) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, blocks: p.seasonArc.blocks.map((b) => (b.id === block.id ? { ...b, cliffhangerKo: v } : b)) } }))} />
              </div>
            ))}
            <TextField id={`${uid}-s2`} testId="pitch-season2-hook" label={pick("시즌 2 확장 훅", "Season 2 Hook")} value={input.seasonArc.season2HookKo} onChange={(v) => setInput((p) => ({ ...p, seasonArc: { ...p.seasonArc, season2HookKo: v } }))} />
          </div>
        );

      case "visual-tone":
        return (
          <div className="space-y-3">
            <TextField id={`${uid}-vstyle`} testId="pitch-visual-style" label={pick("작화 스타일", "Art Direction")} value={input.visualTone.artStyleKo} onChange={(v) => setInput((p) => ({ ...p, visualTone: { ...p.visualTone, artStyleKo: v } }))} multiline />
            <TextField id={`${uid}-vlight`} testId="pitch-visual-lighting" label={pick("조명·명암 기조", "Lighting & Contrast")} value={input.visualTone.lightingMoodKo} onChange={(v) => setInput((p) => ({ ...p, visualTone: { ...p.visualTone, lightingMoodKo: v } }))} />
            <TextField id={`${uid}-vcam`} testId="pitch-visual-camera" label={pick("카메라·연출 문법", "Camera Grammar")} value={input.visualTone.cameraGrammarKo} onChange={(v) => setInput((p) => ({ ...p, visualTone: { ...p.visualTone, cameraGrammarKo: v } }))} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {input.visualTone.paletteNotes.map((note) => (
                <div key={note.id} className="rounded-xl border border-line bg-raised p-3">
                  <div className="text-xs font-semibold text-fg [word-break:keep-all]">{note.roleKo}</div>
                  <div className="mt-1 font-mono text-[11px] text-accent tabular-nums">{note.oklchSpec}</div>
                  <div className="mt-1 text-[11px] text-fg-2 [word-break:keep-all]">{note.usageKo}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case "target-positioning":
        return (
          <div className="space-y-3">
            <TextField id={`${uid}-aud1`} testId="pitch-target-primary" label={pick("코어 타깃 독자·시청층", "Primary Audience")} value={input.targetPositioning.primaryAudienceKo} onChange={(v) => setInput((p) => ({ ...p, targetPositioning: { ...p.targetPositioning, primaryAudienceKo: v } }))} />
            <TextField id={`${uid}-aud2`} testId="pitch-target-secondary" label={pick("확장 타깃층", "Secondary Audience")} value={input.targetPositioning.secondaryAudienceKo} onChange={(v) => setInput((p) => ({ ...p, targetPositioning: { ...p.targetPositioning, secondaryAudienceKo: v } }))} />
            <TextField id={`${uid}-vhook`} testId="pitch-target-hook" label={pick("시청·구독 전환 포인트", "Viewer Hook")} value={input.targetPositioning.viewerHookKo} onChange={(v) => setInput((p) => ({ ...p, targetPositioning: { ...p.targetPositioning, viewerHookKo: v } }))} multiline />
            <TextField
              id={`${uid}-ott`} testId="pitch-target-ott" label={pick("적합 OTT·플랫폼 채널 (쉼표 구분)", "OTT & Platform Channels (comma-separated)")}
              value={input.targetPositioning.ottChannels.join(", ")}
              onChange={(v) => setInput((p) => ({ ...p, targetPositioning: { ...p.targetPositioning, ottChannels: v.split(",").map((s) => s.trim()).filter((s) => s.length > 0) } }))}
            />
            <EstimateRangeEditor
              idPrefix={`${uid}-target-est`} testPrefix="pitch-target-estimate"
              title={pick("타깃 코어 풀 규모 범위", "Estimated Target Core Pool")}
              range={input.targetPositioning.addressableRangeEstimate} isEn={isEn}
              onChange={(next) => setInput((p) => ({ ...p, targetPositioning: { ...p.targetPositioning, addressableRangeEstimate: next } }))}
            />
          </div>
        );

      case "comp-positioning":
        return (
          <div className="space-y-3">
            <TextField id={`${uid}-cf`} testId="pitch-comp-formula" label={pick("유사 흥행 비교 공식", "Comparable Positioning Formula")} value={input.compPositioning.positioningFormulaKo} onChange={(v) => setInput((p) => ({ ...p, compPositioning: { ...p.compPositioning, positioningFormulaKo: v } }))} />
            {input.compPositioning.entries.map((entry, idx) => (
              <div key={entry.id} className="space-y-2 rounded-xl border border-line bg-raised p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <TextField id={`${uid}-cr-${entry.id}`} testId={`pitch-comp-ref-${idx}`} label={pick(`레퍼런스 축 ${idx + 1}`, `Comparable Axis ${idx + 1}`)} value={entry.referenceTitleKo} onChange={(v) => setInput((p) => ({ ...p, compPositioning: { ...p.compPositioning, entries: p.compPositioning.entries.map((e) => (e.id === entry.id ? { ...e, referenceTitleKo: v } : e)) } }))} />
                  <TextField id={`${uid}-cs-${entry.id}`} testId={`pitch-comp-shared-${idx}`} label={pick("공통 흥행 문법", "Shared DNA")} value={entry.sharedAxisKo} onChange={(v) => setInput((p) => ({ ...p, compPositioning: { ...p.compPositioning, entries: p.compPositioning.entries.map((e) => (e.id === entry.id ? { ...e, sharedAxisKo: v } : e)) } }))} />
                </div>
                <TextField id={`${uid}-cd-${entry.id}`} testId={`pitch-comp-diff-${idx}`} label={pick("본 IP 차별화 지점", "Differentiation")} value={entry.differentiationKo} onChange={(v) => setInput((p) => ({ ...p, compPositioning: { ...p.compPositioning, entries: p.compPositioning.entries.map((e) => (e.id === entry.id ? { ...e, differentiationKo: v } : e)) } }))} />
              </div>
            ))}
          </div>
        );

      case "secondary-rights":
        return (
          <div className="space-y-3">
            <TextField id={`${uid}-rthesis`} testId="pitch-rights-thesis" label={pick("2차 판권 통합 확장 논리", "Secondary Rights Expansion Thesis")} value={input.secondaryRights.expansionThesisKo} onChange={(v) => setInput((p) => ({ ...p, secondaryRights: { ...p.secondaryRights, expansionThesisKo: v } }))} multiline />
            {input.secondaryRights.tracks.map((track) => (
              <div key={track.id} className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? track.labelEn : track.labelKo}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] font-medium text-fg-2">{track.priority}</span>
                    <EstimateBadge isEn={isEn} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <TextField id={`${uid}-rw-${track.id}`} testId={`pitch-rights-window-${track.id}`} label={pick("전개 시점", "Rollout Window")} value={track.windowLabelKo} onChange={(v) => setInput((p) => ({ ...p, secondaryRights: { ...p.secondaryRights, tracks: p.secondaryRights.tracks.map((t) => (t.id === track.id ? { ...t, windowLabelKo: v } : t)) } }))} />
                  <TextField id={`${uid}-rd-${track.id}`} testId={`pitch-rights-deliverable-${track.id}`} label={pick("핵심 산출물", "Key Deliverable")} value={track.deliverableKo} onChange={(v) => setInput((p) => ({ ...p, secondaryRights: { ...p.secondaryRights, tracks: p.secondaryRights.tracks.map((t) => (t.id === track.id ? { ...t, deliverableKo: v } : t)) } }))} />
                </div>
                <EstimateRangeEditor
                  idPrefix={`${uid}-re-${track.id}`} testPrefix={`pitch-rights-est-${track.id}`}
                  title={pick(`${track.labelKo} 예산 범위`, `${track.labelEn} Budget Band`)}
                  range={track.budgetRangeEstimate} isEn={isEn}
                  onChange={(next) => setInput((p) => ({ ...p, secondaryRights: { ...p.secondaryRights, tracks: p.secondaryRights.tracks.map((t) => (t.id === track.id ? { ...t, budgetRangeEstimate: next } : t)) } }))}
                />
              </div>
            ))}
          </div>
        );

      case "production-schedule":
        return (
          <div className="space-y-3">
            <TextField id={`${uid}-cadence`} testId="pitch-schedule-cadence" label={pick("제작 리듬 요약", "Production Cadence")} value={input.productionSchedule.cadenceSummaryKo} onChange={(v) => setInput((p) => ({ ...p, productionSchedule: { ...p.productionSchedule, cadenceSummaryKo: v } }))} />
            <EstimateRangeEditor
              idPrefix={`${uid}-sbud`} testPrefix="pitch-schedule-budget"
              title={pick("시즌 1 총 제작·패키징 예산 범위", "Season 1 Total Production Budget Band")}
              range={input.productionSchedule.totalBudgetEstimate} isEn={isEn}
              onChange={(next) => setInput((p) => ({ ...p, productionSchedule: { ...p.productionSchedule, totalBudgetEstimate: next } }))}
            />
            {input.productionSchedule.milestones.map((ms, idx) => (
              <div key={ms.id} className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-raised p-3 sm:grid-cols-3">
                <TextField id={`${uid}-mt-${ms.id}`} testId={`pitch-ms-time-${idx}`} label={pick("일정", "Timeframe")} value={ms.timeframeKo} onChange={(v) => setInput((p) => ({ ...p, productionSchedule: { ...p.productionSchedule, milestones: p.productionSchedule.milestones.map((m) => (m.id === ms.id ? { ...m, timeframeKo: v } : m)) } }))} />
                <TextField id={`${uid}-mp-${ms.id}`} testId={`pitch-ms-phase-${idx}`} label={pick("마일스톤", "Phase")} value={ms.phaseKo} onChange={(v) => setInput((p) => ({ ...p, productionSchedule: { ...p.productionSchedule, milestones: p.productionSchedule.milestones.map((m) => (m.id === ms.id ? { ...m, phaseKo: v } : m)) } }))} />
                <TextField id={`${uid}-mg-${ms.id}`} testId={`pitch-ms-gate-${idx}`} label={pick("산출물 게이트", "Deliverable Gate")} value={ms.deliverableGateKo} onChange={(v) => setInput((p) => ({ ...p, productionSchedule: { ...p.productionSchedule, milestones: p.productionSchedule.milestones.map((m) => (m.id === ms.id ? { ...m, deliverableGateKo: v } : m)) } }))} />
              </div>
            ))}
          </div>
        );

      case "contact":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField id={`${uid}-cholder`} testId="pitch-contact-holder" label={pick("권리 보유 주체", "Rights Holder")} value={input.contact.rightsHolderKo} onChange={(v) => setInput((p) => ({ ...p, contact: { ...p.contact, rightsHolderKo: v } }))} />
              <TextField id={`${uid}-crep`} testId="pitch-contact-rep" label={pick("담당자", "Representative")} value={input.contact.representativeKo} onChange={(v) => setInput((p) => ({ ...p, contact: { ...p.contact, representativeKo: v } }))} />
              <TextField id={`${uid}-cemail`} testId="pitch-contact-email" label={pick("문의 이메일", "Contact Email")} value={input.contact.contactEmail} onChange={(v) => setInput((p) => ({ ...p, contact: { ...p.contact, contactEmail: v } }))} />
              <TextField id={`${uid}-cresp`} testId="pitch-contact-response" label={pick("회신 리드타임", "Response Window")} value={input.contact.responseWindowKo} onChange={(v) => setInput((p) => ({ ...p, contact: { ...p.contact, responseWindowKo: v } }))} />
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("협의 가능 판권 범위", "Available Licensing Scope")}</div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_RIGHTS_OPTIONS.map((rightLabel) => {
                  const selected = input.contact.availableRights.includes(rightLabel);
                  return (
                    <button key={rightLabel} type="button" aria-pressed={selected} data-testid={`pitch-right-toggle-${rightLabel}`} onClick={() => toggleAvailableRight(rightLabel)} className={selected ? BTN_ACTIVE : BTN_OUTLINE}>
                      {rightLabel}
                    </button>
                  );
                })}
              </div>
            </div>
            <TextField id={`${uid}-cmats`} testId="pitch-contact-materials" label={pick("열람 가능 자료 패키지", "Ready Materials")} value={input.contact.materialsReadyKo} onChange={(v) => setInput((p) => ({ ...p, contact: { ...p.contact, materialsReadyKo: v } }))} multiline />
          </div>
        );
    }
  };

  return (
    <section data-testid="studio-global-ip-pitch-panel" className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg [word-break:keep-all] ${className ?? ""}`}>
      <header className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg [word-break:keep-all]">{pick("글로벌 IP·OTT·출판 피칭 바이블 스튜디오", "Global IP · OTT · Publishing Pitch Bible Studio")}</h2>
            <EstimateBadge isEn={isEn} testId="pitch-estimate-badge" />
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">{pick("12장 에디토리얼 피칭 바이블 조판 · 25~45자 로그라인 검증 · 누락/과장 감사 · Markdown/JSON 내보내기", "12-slide editorial pitch bible composer · 25-45 char logline check · readiness audit · Markdown/JSON export")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PITCH_GENRE_METAS.map((genre) => (
            <button key={genre.id} type="button" data-testid={`pitch-starter-${genre.id}`} aria-pressed={genreId === genre.id} onClick={() => handleSelectGenre(genre.id)} className={genreId === genre.id ? BTN_ACTIVE : BTN_OUTLINE}>
              {isEn ? genre.labelEn : genre.labelKo}
            </button>
          ))}
          <button type="button" data-testid="pitch-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("기본 복원", "Reset")}</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard testId="pitch-kpi-score" label={pick("피칭 완성도 감사", "Pitch Readiness")} value={`${audit.score}/100`} subtext={`${gradeLabel(audit.grade, isEn)} · ${audit.readySlideCount}/${audit.totalSlideCount}${pick("장 준비", " slides ready")}`} valueTone={scoreTone(audit.score)} badge={<EstimateBadge isEn={isEn} />} />
        <KpiCard testId="pitch-kpi-logline" label={pick("로그라인 호흡 (25~45자)", "Logline Length (25-45)")} value={`${deck.loglineValidation.charCount}${pick("자", " chars")}`} subtext={deck.loglineValidation.isOptimal ? pick("권장 범위 적합", "Within target range") : pick("글자수 조정 권장", "Needs length trim")} valueTone={loglineTone} />
        <KpiCard testId="pitch-kpi-season" label={pick("시즌 1 포맷 대응", "Season 1 Mapping")} value={`${deck.seasonTotals.totalEpisodes}${pick("부작", " ep")} / ${deck.seasonTotals.totalChapters}${pick("화", " ch")}`} subtext={deck.seasonTotals.matchesStandard12x60 ? pick("12부작·60화 표준 일치", "Matches 12-ep / 60-ch") : pick("표준 12부작/60화 불일치", "Off 12-ep / 60-ch spec")} valueTone={deck.seasonTotals.matchesStandard12x60 ? "text-good" : "text-warn"} />
        <KpiCard testId="pitch-kpi-warnings" label={pick("누락 · 과장 진단", "Missing & Hype Flags")} value={`${audit.blockerCount}${pick(" 차단", " blockers")} · ${audit.warningCount}${pick(" 경고", " warns")}`} subtext={`${pick("누락", "Missing")} ${audit.missingIssues.length} · ${pick("과장 감지", "Hype")} ${audit.exaggerationIssues.length}`} valueTone={audit.blockerCount > 0 ? "text-bad" : audit.warningCount > 0 ? "text-warn" : "text-good"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <nav aria-label={pick("12장 피칭 바이블 슬라이드 목록", "12-slide pitch bible navigation")} className="space-y-1.5 rounded-xl border border-line bg-raised p-3 lg:col-span-4">
          <div className="flex items-center justify-between px-1 pb-1 text-xs font-semibold text-fg-2">
            <span>{pick("12장 슬라이드 구성", "12-Slide Deck Outline")}</span>
            <span className="tabular-nums text-fg-3">{activeSlideIndex + 1}/12</span>
          </div>
          {PITCH_SLIDE_METAS.map((meta, idx) => {
            const statusMeta = slideStatusMeta(audit.slideAudits[idx]?.status ?? "ready", isEn);
            const active = meta.id === activeSlideId;
            return (
              <button
                key={meta.id} type="button" data-testid={`pitch-nav-${meta.id}`} aria-current={active ? "step" : undefined} onClick={() => setActiveSlideId(meta.id)}
                className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-accent" : "border-transparent bg-card text-fg hover:border-line-strong hover:bg-canvas"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 font-mono text-[11px] font-bold tabular-nums text-fg-3">{String(meta.slideNumber).padStart(2, "0")}</span>
                  <span className="truncate font-semibold">{isEn ? meta.titleEn : meta.titleKo}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {meta.hasEstimateData ? <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] font-medium text-fg-3">{pick("추정", "Est")}</span> : null}
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.cls}`}>{statusMeta.label}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-4 rounded-xl border border-line bg-canvas p-4 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span data-testid="pitch-active-slide-num" className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-xs font-bold text-accent tabular-nums">{String(activeSlide?.slideNumber ?? 1).padStart(2, "0")} / 12</span>
                <h3 data-testid="pitch-active-slide-title" className="text-sm font-bold text-fg [word-break:keep-all]">{isEn ? activeSlide?.titleEn : activeSlide?.titleKo}</h3>
                {activeSlide?.hasEstimateData ? <EstimateBadge isEn={isEn} /> : null}
              </div>
              <p className="mt-1 text-xs text-fg-3 [word-break:keep-all]">{isEn ? activeSlide?.subtitleEn : activeSlide?.subtitleKo}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" data-testid="pitch-prev-slide-btn" disabled={activeSlideIndex <= 0} onClick={() => handleStepSlide(-1)} className={BTN_OUTLINE}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("이전", "Prev")}</span>
              </button>
              <button type="button" data-testid="pitch-next-slide-btn" disabled={activeSlideIndex >= PITCH_SLIDE_IDS.length - 1} onClick={() => handleStepSlide(1)} className={BTN_OUTLINE}>
                <span>{pick("다음", "Next")}</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div data-testid="pitch-slide-preview" className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
                <BookOpen className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("실시간 조판 미리보기", "Live Editorial Card Preview")}</span>
              </div>
              {activeSlideAudit ? <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${slideStatusMeta(activeSlideAudit.status, isEn).cls}`}>{slideStatusMeta(activeSlideAudit.status, isEn).label}</span> : null}
            </div>
            <p className="mt-1.5 text-sm font-bold text-fg [word-break:keep-all]">{activeSlide?.headlineKo}</p>
            <ul className="mt-2 space-y-1 text-xs text-fg-2">
              {activeSlide?.summaryBulletsKo.map((bullet, idx) => (
                <li key={`${activeSlide.id}-b-${idx}`} className="flex items-start gap-1.5 [word-break:keep-all]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div data-testid={`pitch-editor-${activeSlideId}`}>{renderSlideEditor()}</div>
        </div>
      </div>

      <div data-testid="pitch-audit-report" className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {audit.blockerCount > 0 ? <ShieldAlert className="h-4 w-4 text-bad" aria-hidden="true" /> : audit.warningCount > 0 ? <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" />}
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("피칭 완성도·누락·과장 감사 리포트", "Pitch Readiness & Exaggeration Audit")}</h3>
            <EstimateBadge isEn={isEn} />
          </div>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? audit.disclaimerEn : audit.disclaimerKo}</span>
        </div>
        {audit.issues.length === 0 ? (
          <div data-testid="pitch-audit-clean" className="rounded-lg border border-good bg-good-soft px-3.5 py-2.5 text-xs font-medium text-good [word-break:keep-all]">
            {pick("12장 구성 누락·과장 문구·허구 통계 경고가 없습니다. 글로벌 출판·OTT 피칭 전달 준비가 완료되었습니다.", "Zero missing or exaggeration issues detected. Deck is ready for global pitch review.")}
          </div>
        ) : (
          <ul className="space-y-2">
            {audit.issues.map((issue: PitchAuditIssue) => (
              <li key={issue.id} data-testid={`pitch-audit-issue-${issue.code}`} className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${issue.severity === "blocker" ? "border-bad bg-bad-soft text-bad" : "border-warn bg-warning-soft text-warn"}`}>
                      {issue.severity === "blocker" ? pick("차단", "Blocker") : pick("경고", "Warning")}
                    </span>
                    <span className="text-xs font-semibold text-fg [word-break:keep-all]">{isEn ? issue.titleEn : issue.titleKo}</span>
                  </div>
                  <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? issue.detailEn : issue.detailKo}</p>
                  <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? issue.fixHintEn : issue.fixHintKo}</p>
                </div>
                <button type="button" data-testid={`pitch-jump-${issue.slideId}-${issue.code}`} onClick={() => setActiveSlideId(issue.slideId)} className={`${BTN_OUTLINE} shrink-0`}>
                  {pick("슬라이드 이동", "Go to Slide")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="pitch-export-tab-markdown" onClick={() => setExportTab("markdown")} className={exportTab === "markdown" ? BTN_ACTIVE : BTN_OUTLINE}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("Markdown 바이블", "Markdown Bible")}</span>
            </button>
            <button type="button" data-testid="pitch-export-tab-json" onClick={() => setExportTab("json")} className={exportTab === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 패키지", "JSON Package")}</span>
            </button>
            <button type="button" data-testid="pitch-export-tab-hidden" onClick={() => setExportTab("hidden")} className={exportTab === "hidden" ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{pick("미리보기 접기", "Hide Preview")}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="pitch-copy-markdown-btn" onClick={handleCopyMarkdown} className={BTN_SOLID}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("Markdown 복사", "Copy Markdown")}</span>
            </button>
            <button type="button" data-testid="pitch-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 복사", "Copy JSON")}</span>
            </button>
          </div>
        </div>
        {statusMessage ? (
          <div role="status" aria-live="polite" data-testid="pitch-status-message" className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">{statusMessage}</div>
        ) : null}
        {exportTab !== "hidden" ? (
          <pre data-testid="pitch-export-preview" className="max-h-72 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {exportTab === "markdown" ? markdownDoc : jsonDoc}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
