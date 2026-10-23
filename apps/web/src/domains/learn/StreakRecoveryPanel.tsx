import { Archive, CalendarClock, Flame, ShieldCheck, Snowflake } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react"; import { r44LearnStatusText } from "./r44-cat1-status-i18n";

import {
  STREAK_STORAGE_KEY,
  STREAK_TRACK_META,
  applyDailyCheck,
  buildPortfolioSnapshot,
  buildStreakBoard,
  declareHiatus,
  emptyStreakState,
  endHiatusEarly,
  evaluateSignupGate,
  parseStreakState,
  recordActivity,
  serializeStreakState,
  toDateKey,
  type StreakState,
  type StreakTrack,
} from "./streak-recovery";

function loadInitialState(): StreakState {
  if (typeof window === "undefined") return emptyStreakState();
  try {
    const parsed = parseStreakState(window.localStorage.getItem(STREAK_STORAGE_KEY));
    return applyDailyCheck(parsed, toDateKey(new Date()));
  } catch {
    return emptyStreakState();
  }
}

const TRACK_ORDER: readonly StreakTrack[] = ["learning", "serialization"];

/**
 * 연속 기록 회복 장치 패널.
 * 학습 연속 기록과 연재 기록을 분리된 두 섹션으로 표시하고,
 * 각 섹션에서 프리즈 잔량 확인·휴재 선언/종료·오늘 기록을 처리한다.
 * 중단·리셋과 무관하게 남는 포트폴리오 스냅샷을 함께 보여준다.
 */
export function StreakRecoveryPanel({ hasAccount = true }: { hasAccount?: boolean }) {
  const [state, setState] = useState<StreakState>(loadInitialState);
  const [hiatusDraft, setHiatusDraft] = useState<Record<StreakTrack, { startsOn: string; endsOn: string; reason: string }>>({
    learning: { startsOn: "", endsOn: "", reason: "" },
    serialization: { startsOn: "", endsOn: "", reason: "" },
  });
  const [notice, setNotice] = useState("");

  const today = toDateKey(new Date());
  const board = useMemo(() => buildStreakBoard(state, today), [state, today]);
  // 가입 후순위: 첫 기록(첫 성공)이 생긴 뒤에만 가입 이유를 보여준다.
  const signupGate = evaluateSignupGate({
    firstSuccessDate: buildPortfolioSnapshot(state, "learning").firstActivityDate,
    hasAccount,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STREAK_STORAGE_KEY, serializeStreakState(state));
    } catch {
      // 저장 실패는 기록 자체를 막지 않는다 (메모리 상태로 계속 동작).
    }
  }, [state]);

  function handleRecord(track: StreakTrack) {
    setState((current) => recordActivity(current, track, today));
    setNotice(`${STREAK_TRACK_META[track].label}에 오늘 활동을 기록했어요.`);
  }

  function handleDeclareHiatus(track: StreakTrack) {
    const draft = hiatusDraft[track];
    const next = declareHiatus(state, track, {
      id: `hiatus-${track}-${draft.startsOn}-${draft.endsOn}`,
      startsOn: draft.startsOn,
      endsOn: draft.endsOn,
      reason: draft.reason,
    }, today);
    if (!next) {
      setNotice("휴재 기간을 확인해 주세요. 오늘 이후 기간, 최대 90일까지 선언할 수 있어요.");
      return;
    }
    setState(next);
    setNotice(r44LearnStatusText("r44cat1.learn.streakRecovery.hiatusDeclared", { track: STREAK_TRACK_META[track].label }, "{track} 휴재를 선언했어요. 그 기간은 기록이 끊기지 않습니다."));
  }

  function handleEndHiatus(track: StreakTrack, hiatusId: string) {
    const next = endHiatusEarly(state, track, hiatusId, today);
    if (next) setState(next);
  }

  return (
    <section className="learn-streak-panel" aria-labelledby="streak-recovery-title">
      <header>
        <p className="learn-eyebrow">STREAK RECOVERY</p>
        <h2 id="streak-recovery-title">끊겨도 괜찮은 연속 기록</h2>
        <p>
          하루 비어도 기록은 리셋되지 않아요. 프리즈가 빈 날을 지켜주고,
          휴재를 선언하면 그 기간은 건너뛰어 셉니다. 학습 기록과 연재 기록은 따로 표시됩니다.
        </p>
      </header>
      {notice && <p className="learn-caution" role="status">{notice}</p>}
      {signupGate.showSignupPrompt && signupGate.promptReason && (
        <p className="learn-hero-note" role="status">{signupGate.promptReason}</p>
      )}
      {TRACK_ORDER.map((track) => {
        const view = board[track];
        const meta = STREAK_TRACK_META[track];
        const portfolio = buildPortfolioSnapshot(state, track);
        const draft = hiatusDraft[track];
        return (
          <article key={track} className="learn-streak-track" aria-label={meta.label}>
            <h3>
              <Flame aria-hidden size={18} /> {meta.label}
            </h3>
            <p className="learn-streak-status" role="status">{view.statusLine}</p>
            <dl className="learn-streak-stats">
              <div><dt>현재 기록</dt><dd className="numeral">{view.currentStreak}일</dd></div>
              <div><dt>최장 기록</dt><dd className="numeral">{view.longestStreak}일</dd></div>
              <div><dt>누적 활동일</dt><dd className="numeral">{view.totalActiveDays}일</dd></div>
              <div>
                <dt><Snowflake aria-hidden size={14} /> 프리즈</dt>
                <dd className="numeral">{view.freezeBalance}개</dd>
              </div>
            </dl>
            <p className="learn-streak-gentle">{meta.gentleNote}</p>
            <p className="learn-actions">
              <button type="button" className="learn-primary" onClick={() => handleRecord(track)}>
                {meta.activityLabel}
              </button>
            </p>
            <fieldset className="learn-streak-hiatus">
              <legend><CalendarClock aria-hidden size={14} /> 휴재 선언</legend>
              <label>
                시작일
                <input type="date" value={draft.startsOn}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setHiatusDraft((current) => ({
                    ...current, [track]: { ...current[track], startsOn: event.target.value },
                  }))} />
              </label>
              <label>
                종료일
                <input type="date" value={draft.endsOn}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setHiatusDraft((current) => ({
                    ...current, [track]: { ...current[track], endsOn: event.target.value },
                  }))} />
              </label>
              <label>
                사유 (선택)
                <input type="text" maxLength={200} value={draft.reason}
                  placeholder="예: 작품 재정비"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setHiatusDraft((current) => ({
                    ...current, [track]: { ...current[track], reason: event.target.value },
                  }))} />
              </label>
              <button type="button" className="learn-secondary" onClick={() => handleDeclareHiatus(track)}>
                이 기간 휴재로 선언
              </button>
              {state.tracks[track].hiatuses.length > 0 && (
                <ul>
                  {state.tracks[track].hiatuses.map((hiatus) => (
                    <li key={hiatus.id}>
                      {hiatus.startsOn} ~ {hiatus.endsOn}
                      {hiatus.reason ? ` · ${hiatus.reason}` : ""}
                      <button type="button" onClick={() => handleEndHiatus(track, hiatus.id)}>
                        오늘까지로 종료
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            <p className="learn-streak-portfolio">
              <Archive aria-hidden size={14} />
              <ShieldCheck aria-hidden size={14} />
              포트폴리오 보존 중: 누적 {portfolio.totalActiveDays}일 · 최장 {portfolio.longestStreak}일
              {portfolio.firstActivityDate ? ` · ${portfolio.firstActivityDate}부터` : ""}
              — 중단하거나 휴재해도 이 성과는 사라지지 않아요.
            </p>
          </article>
        );
      })}
    </section>
  );
}
