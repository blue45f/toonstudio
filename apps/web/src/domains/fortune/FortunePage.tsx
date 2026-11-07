import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { apiFetch } from "@/platform/api";
import { observeApiResponse } from "@/platform/api-error";
import { FortuneObservatory } from "./FortuneObservatory";
import { drawFortuneTarotSpread, getCharacters, type TarotSpreadId } from "@toonstudio/core/fortune";
import { MotionConfig } from "motion/react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useFortuneStore, computeStreak } from "./fortune-store";
import { charThemeVars } from "./fortune-theme";
import { FortuneCharacterPickerSection } from "./FortuneCharacterPickerSection";
import { FortuneCharacterSidebar } from "./FortuneCharacterSidebar";
import { FortuneLoading } from "./FortuneLoading";
import { FortunePageHeader } from "./FortunePageHeader";
import { FortuneResultPanel } from "./FortuneResultPanel";
import { FortuneShareModal } from "./FortuneShareModal";
import { FortuneToolInputForms } from "./FortuneToolInputForms";
import { useFortunePlayback } from "./useFortunePlayback";
import { FortunePeriodPanel } from "./FortunePeriodPanel";
import {
  drawCompatibilityLocal,
  drawSajuLocal,
  drawTodayLocal,
  drawZodiacLocal,
  reportFortuneUse,
  type FortuneLocalMode,
} from "./fortune-client-draw";
import { FortuneBirthGate } from "./FortuneBirthGate";

import type { SavedFortune } from "./fortune-store";

import { cn } from "@/shared/lib/utils";
import { getCurrentUiLocale, translateAuthoredSourceText, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

import {
  FORTUNE_TAB_META,
  FORTUNE_TAB_ORDER,
  fortuneSummary,
  kstDateString,
  type Character,
  type FortuneResult,
  type FortuneTab,
} from "./fortune-page-data";

export type {
  CompatData,
  FortuneResult,
  FortuneTab,
  IljinData,
  SajuAnalysisData,
  YearLuckData,
  ZodiacData,
} from "./fortune-page-data";

function CharacterFortunePage({ routeTab }: { routeTab?: FortuneTab }) {
  useBilingualI18nRevision();
  const locale = getCurrentUiLocale();
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "FortunePage", source);

  // 재방문 영속화 — 저장된 프로필로 입력 초기값을 채운다(재입력 제거)
  const savedProfile = useFortuneStore.getState();
  const setProfile = useFortuneStore((s) => s.setProfile);
  const recordView = useFortuneStore((s) => s.recordView);
  const viewedDates = useFortuneStore((s) => s.viewedDates);
  const streak = computeStreak(viewedDates);
  const addToHistory = useFortuneStore((s) => s.addToHistory);
  const history = useFortuneStore((s) => s.history);
  const clearHistory = useFortuneStore((s) => s.clearHistory);
  const removeFromHistory = useFortuneStore((s) => s.removeFromHistory);
  const clearBirthProfile = useFortuneStore((s) => s.clearBirthProfile);
  const hasSavedBirthProfile = useFortuneStore((s) =>
    Boolean(s.birthDate || s.birthTime || s.partnerBirthDate || s.partnerBirthTime)
  );

  // 캐릭터 목록은 @toonstudio/core 의 정적 데이터(웹·API 단일 출처)로 즉시 채운다 —
  // API(/api/fortune/characters, 로컬은 dev:api 필요)가 없거나 실패해도 피커가 동작한다.
  const [characters, setCharacters] = useState<Character[]>(() => getCharacters());
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  // 도구 하위 라우트(/fortune/<tool>)로 열리면 활성 도구가 URL을 따르고 전환도 URL 이동이 된다.
  // 라우트 없이(관측소 ?content=character) 열리면 기존처럼 내부 상태로 전환한다.
  const navigate = useNavigate();
  const [activeTab, setLocalTab] = useState<FortuneTab>(routeTab ?? "today");
  useEffect(() => { if (routeTab) setLocalTab(routeTab); }, [routeTab]);
  const setActiveTab = (tab: FortuneTab) => {
    setLocalTab(tab);
    if (routeTab !== undefined && typeof window !== "undefined") window.history.replaceState(window.history.state, "", `/fortune/${tab}`);
  };
  // 브라우저 탭 제목은 하드코딩된 document.title 대신 공용 SEO 훅으로 관리한다.
  // 활성 도구(탭 또는 하위 라우트) 라벨을 제목에 반영한다.
  useDocumentTitle(`${FORTUNE_TAB_META[activeTab].labelKo} · ToonStudio`);

  // 사주 입력 상태 (저장값으로 초기화)
  const [birthDate, setBirthDate] = useState(savedProfile.birthDate);
  const [birthTime, setBirthTime] = useState(savedProfile.birthTime);
  const [gender, setGender] = useState(savedProfile.gender);

  // 궁합 입력 상태
  const [partnerBirthDate, setPartnerBirthDate] = useState(savedProfile.partnerBirthDate);
  const [partnerBirthTime, setPartnerBirthTime] = useState(savedProfile.partnerBirthTime);

  // 처방전 입력 상태
  const [prescriptionQuery, setPrescriptionQuery] = useState("");

  // 타로 상태
  const [tarotStep, setTarotStep] = useState<"idle" | "shuffling" | "spread" | "revealed">("idle");
  const [tarotSpread, setTarotSpread] = useState<TarotSpreadId>("one");

  // 결과 상태 — 탭별로 캐시해 탭을 옮겨도 이전 결과가 유지된다
  const [isLoading, setIsLoading] = useState(false);
  const [resultsByTab, setResultsByTab] = useState<Partial<Record<FortuneTab, FortuneResult>>>({});
  const fortuneResult = resultsByTab[activeTab] ?? null;
  const setActiveTabResult = (tab: FortuneTab, data: FortuneResult | null) =>
    setResultsByTab((prev) => ({ ...prev, [tab]: data ?? undefined }));

  // 저장된 생년월일 삭제 (LOW-2) — 저장분과 입력 상태를 함께 비우고,
  // 생년월일로 계산한 결과 캐시를 버려 표면이 재입력 동선으로 돌아가게 한다.
  const handleClearBirthProfile = () => {
    clearBirthProfile();
    setBirthDate("");
    setBirthTime("");
    setGender("none");
    setPartnerBirthDate("");
    setPartnerBirthTime("");
    setResultsByTab((prev) => {
      const next = { ...prev };
      delete next.today;
      delete next.saju;
      delete next.compatibility;
      return next;
    });
  };

  // 월간/연간 게이트 입력 — 제출 버튼 없이 입력 즉시 계산하는 흐름이라, 제출형
  // 도구들의 callFortune/computeFortuneLocally가 하던 로컬 프로필 저장을 입력
  // 시점에 대신 한다. 저장은 LOW-2 정책대로 이 기기(localStorage)에만 하고
  // 서버로는 보내지 않는다 — 그래야 리로드 후에도 재입력 없이 패널이 열린다.
  const handlePeriodBirthDateChange = (v: string) => {
    setBirthDate(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      setProfile({ birthDate: v, birthTime, lastCharacterId: selectedChar?.id ?? null });
    }
  };
  const handlePeriodBirthTimeChange = (v: string) => {
    setBirthTime(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setProfile({ birthDate, birthTime: v, lastCharacterId: selectedChar?.id ?? null });
    }
  };

  // 운세 {tx("웹툰 재생")} 오케스트레이터 — 음성(Web Speech) + 컷 애니메이션 동기
  const playback = useFortunePlayback(fortuneResult?.panels);

  // 결과 공유/저장 모달
  const [shareOpen, setShareOpen] = useState(false);
  const shareTriggerRef = useRef<HTMLButtonElement>(null);

  // 에러·재시도 (운세 호출 실패 시)
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [charLoadFailed, setCharLoadFailed] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  // 결과 헤딩 포커스용(접근성) + 라이브 안내
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const [liveMsg, setLiveMsg] = useState("");

  // 운세 API 공용 호출 — 로딩/에러/재시도/낭독정지를 일관 처리
  const callFortune = async (
    url: string,
    body: Record<string, unknown>,
    retry: () => void,
    onSuccess?: (data: FortuneResult) => void
  ): Promise<FortuneResult | null> => {
    playback.stop();
    // 입력 프로필 영속화 — 다음 방문 시 재입력 제거
    setProfile({
      birthDate,
      birthTime,
      gender,
      partnerBirthDate,
      partnerBirthTime,
      lastCharacterId: selectedChar?.id ?? null,
    });
    setErrorMsg(null);
    setLiveMsg("");
    setIsLoading(true);
    setActiveTabResult(activeTab, null);
    retryRef.current = retry;
    try {
      const response = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = await observeApiResponse(
          response.clone(),
          "운세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
        setErrorMsg(
          failure?.message
          ?? "운세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
        return null;
      }
      const data: FortuneResult = await response.json();
      return applyDrawnFortune(data, onSuccess);
    } catch (error) {
      console.error("운세 호출 실패:", error);
      setErrorMsg("네트워크 오류로 운세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // 계산된 운세 결과 반영 — 결과 캐시·후처리·출석·보관함 기록을 서버/로컬 계산이 공유한다.
  const applyDrawnFortune = (
    data: FortuneResult,
    onSuccess?: (data: FortuneResult) => void
  ): FortuneResult => {
    setActiveTabResult(activeTab, data);
    onSuccess?.(data);
    recordView(); // 출석(스트릭)은 실제 새 조회에서만
    if (selectedChar) {
      addToHistory({
        tab: activeTab,
        characterId: selectedChar.id,
        characterName: selectedChar.name,
        characterAvatar: selectedChar.avatarUrl,
        summary: fortuneSummary(activeTab, data),
        result: data,
      });
    }
    return data;
  };

  // 로컬 계산 공용 처리 — 생년월일이 필요한 도구는 서버로 보내지 않고 기기에서 계산한다.
  // (프로필 저장·로딩·에러·재시도·결과 반영은 callFortune과 같은 수명주기를 따른다.)
  const computeFortuneLocally = async (
    mode: FortuneLocalMode,
    compute: () => Promise<FortuneResult>,
    retry: () => void,
    onSuccess?: (data: FortuneResult) => void
  ): Promise<FortuneResult | null> => {
    playback.stop();
    // 입력 프로필 영속화 — 다음 방문 시 재입력 제거 (이 기기에만 저장)
    setProfile({
      birthDate,
      birthTime,
      gender,
      partnerBirthDate,
      partnerBirthTime,
      lastCharacterId: selectedChar?.id ?? null,
    });
    setErrorMsg(null);
    setLiveMsg("");
    setIsLoading(true);
    setActiveTabResult(activeTab, null);
    retryRef.current = retry;
    try {
      const data = await compute();
      const applied = applyDrawnFortune(data, onSuccess);
      reportFortuneUse(mode); // 리워드 기록은 mode만 보낸다 — 생년월일은 어떤 필드에도 없다.
      return applied;
    } catch (error) {
      console.error("운세 계산 실패:", error);
      setErrorMsg("운세를 계산하지 못했어요. 생년월일을 확인하고 다시 시도해 주세요.");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // 1. 캐릭터 리스트 — 정적 데이터가 이미 채워져 있으니, API 는 최신본으로 "갱신"만 시도한다.
  // API 가 유효한 배열을 주면 반영하고, 실패해도 정적 목록이 남아 피커는 계속 동작한다(에러 UI 억제).
  const loadCharacters = () => {
    setCharLoadFailed(false);
    apiFetch("/api/fortune/characters")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setCharacters(data);
      })
      .catch((err) => {
        // 정적 폴백이 이미 있으므로 사용자에겐 에러를 띄우지 않는다(콘솔에만 기록).
        console.error("캐릭터 정보 API 로드 실패 — 내장 정적 목록 사용:", err);
        setCharacters((prev) => (prev.length > 0 ? prev : getCharacters()));
      });
  };
  useEffect(() => {
    loadCharacters();
  }, []);

  // 결과 도착 시 결과 헤딩으로 포커스 이동 + 스크린리더 안내(접근성)
  useEffect(() => {
    if (!fortuneResult) return;
    const name = selectedChar?.name ?? "캐릭터";
    const score = fortuneResult.today?.score ?? fortuneResult.score;
    setLiveMsg(`${name}의 운세 결과가 도착했어요.${score != null ? ` 지수 ${score}점.` : ""}`);
    resultHeadingRef.current?.focus();
  }, [fortuneResult, selectedChar]);

  // 보관함에서 운세 복원
  const restoreFortune = (saved: SavedFortune) => {
    const char =
      characters.find((c) => c.id === saved.characterId) ?? {
        id: saved.characterId,
        name: saved.characterName,
        origin: "ToonStudio",
        greeting: "",
        avatarUrl: saved.characterAvatar,
      };
    playback.stop();
    setErrorMsg(null);
    setSelectedChar(char);
    setActiveTab(saved.tab);
    setTarotStep(saved.tab === "tarot" ? "revealed" : "idle");
    setResultsByTab({ [saved.tab]: saved.result }); // 복원은 단일 결과로 교체(이전 캐시 제거)
  };

  // 재생/{tx("일시정지")}/이어듣기 토글
  const handleTogglePlay = () => {
    if (playback.status === "playing") playback.pause();
    else if (playback.status === "paused") playback.resume();
    else playback.play();
  };

  // 오늘의 운세 — 생년월일 입력 시 사주 오행으로 개인화(같은 날·같은 사람은 항상 동일).
  // 생년월일은 서버로 보내지 않고 이 기기에서 계산한다(F-B10-1).
  const handleAnalyzeToday = () => {
    if (!selectedChar) return;
    computeFortuneLocally(
      "today",
      () =>
        drawTodayLocal({
          characterId: selectedChar.id,
          birthDate: birthDate || undefined,
          birthTime: birthTime || undefined,
          gender,
        }),
      handleAnalyzeToday
    );
  };

  // 별자리(서양 점성) — 생년월일의 월/일만 사용. 역시 기기에서 계산한다.
  const handleAnalyzeZodiac = () => {
    if (!selectedChar || !birthDate) return;
    const [, m, d] = birthDate.split("-").map(Number);
    computeFortuneLocally(
      "zodiac",
      () => drawZodiacLocal({ characterId: selectedChar.id, month: m, day: d }),
      handleAnalyzeZodiac
    );
  };

  // 궁합
  const handleAnalyzeCompatibility = (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate || !partnerBirthDate || !selectedChar) return;
    computeFortuneLocally(
      "compatibility",
      () =>
        drawCompatibilityLocal({
          myBirthDate: birthDate,
          myBirthTime: birthTime || undefined,
          partnerBirthDate,
          partnerBirthTime: partnerBirthTime || undefined,
          characterId: selectedChar.id,
        }),
      () => handleAnalyzeCompatibility(e)
    );
  };

  // 독서 처방
  const handleAnalyzePrescription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prescriptionQuery.trim() || !selectedChar) return;
    callFortune(
      "/api/fortune/prescription",
      { query: prescriptionQuery, characterId: selectedChar.id },
      () => handleAnalyzePrescription(e)
    );
  };

  // 사주 분석
  const handleAnalyzeSaju = (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate || !selectedChar) return;
    computeFortuneLocally(
      "saju",
      () =>
        drawSajuLocal({
          birthDate,
          birthTime: birthTime || undefined,
          gender,
          characterId: selectedChar.id,
        }),
      () => handleAnalyzeSaju(e)
    );
  };

  // 타로 셔플 시작
  const startTarotShuffle = () => {
    setTarotStep("shuffling");
    setTimeout(() => {
      setTarotStep("spread");
    }, 1800);
  };

  // 심층 스프레드(켈틱 크로스·관계)는 백엔드 없이 @toonstudio/core로 직접 뽑는다
  const drawClientTarotSpread = (cardIdx: number, spread: TarotSpreadId) => {
    const cards = drawFortuneTarotSpread("full-78", kstDateString(), cardIdx, spread);
    const interpretation = cards
      .map((c) => `[${c.position}] ${c.name}(${c.type === "upright" ? "정방향" : "역방향"}) — ${c.positionMeaningKo}. 키워드: ${c.keywords.slice(0, 3).join(", ")}`)
      .join("\n");
    setActiveTabResult("tarot", {
      interpretation,
      cards: cards.map((c) => ({
        id: c.id,
        name: c.name,
        nameEn: c.nameEn,
        position: c.position,
        positionMeaningKo: c.positionMeaningKo,
        type: c.type,
        keywords: c.keywords,
        description: c.description,
      })),
      spread,
      card: {
        id: cards[0].id,
        name: cards[0].name,
        nameEn: cards[0].nameEn,
        type: cards[0].type,
        keywords: cards[0].keywords,
        description: cards[0].description,
      },
      recommendations: [],
    });
    setTarotStep("revealed");
    const spreadKo = spread === "celtic-cross" ? "켈틱 크로스" : "관계 스프레드";
    setLiveMsg(`${spreadKo} ${cards.length}장을 펼쳤어요.`);
    resultHeadingRef.current?.focus();
  };

  // 타로 카드 선택 및 해석 요청 — 고른 카드 위치(cardIdx)가 결과를 결정한다
  const handleSelectTarotCard = (cardIdx: number) => {
    if (!selectedChar || tarotStep !== "spread") return;
    if (tarotSpread === "celtic-cross" || tarotSpread === "relationship") {
      setIsLoading(true);
      try {
        drawClientTarotSpread(cardIdx, tarotSpread);
      } catch {
        setErrorMsg("타로 카드를 펼치지 못했어요. 다시 시도해 주세요.");
      } finally {
        setIsLoading(false);
      }
      return;
    }
    callFortune(
      "/api/fortune/tarot",
      { characterId: selectedChar.id, cardIdx, spread: tarotSpread },
      () => {
        setTarotStep("spread");
        handleSelectTarotCard(cardIdx);
      },
      () => setTarotStep("revealed")
    );
  };

  // 1단계(캐릭터 없이 바로 보는 오늘의 운세) → 2단계(캐릭터 선택) 연결 —
  // 계속 버튼을 누르면 캐릭터 피커로 부드럽게 스크롤해 상세 운세 동선으로 이어진다.
  const scrollToCharacterPicker = () => {
    document.getElementById("fortune-character-picker")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 상태 초기화
  const handleReset = () => {
    playback.stop();
    setResultsByTab({});
    setTarotStep("idle");
    setBirthDate("");
    setBirthTime("");
    setPartnerBirthDate("");
    setPartnerBirthTime("");
    setPrescriptionQuery("");
    setGender("none");
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      {/* 스크린리더 전용 라이브 영역 — 운세 결과 도착 안내 */}
      <p className="sr-only" role="status" aria-live="polite">{liveMsg}</p>

      {/* 타이틀 헤더 — 현재 도구의 이름·맥락을 보여 준다 */}
      <FortunePageHeader tx={tx} activeTab={activeTab} />

      {/* 1단계: 캐릭터 에이전트 선택 */}
      {!selectedChar ? (
        <FortuneCharacterPickerSection
          characters={characters}
          charLoadFailed={charLoadFailed}
          history={history}
          onContinueQuickToday={scrollToCharacterPicker}
          onRestoreFortune={restoreFortune}
          onClearHistory={clearHistory}
          onRemoveFromHistory={removeFromHistory}
          onRetryLoadCharacters={loadCharacters}
          onSelectCharacter={(char) => {
            setSelectedChar(char);
            setResultsByTab({});
          }}
          tx={tx}
        />
      ) : (
        /* 캐릭터가 선택되었을 때의 본문 인터페이스 — 캐릭터 무드색을 CSS 변수로 주입 */
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12" style={charThemeVars(selectedChar.id)}>

          {/* 왼쪽: 에이전트 정보 및 말풍선 (3/12 cols) */}
          <FortuneCharacterSidebar
            selectedChar={selectedChar}
            streak={streak}
            hasPanels={Boolean(fortuneResult?.panels?.length)}
            playback={playback}
            onTogglePlay={handleTogglePlay}
            onResetCharacter={() => {
              setSelectedChar(null);
              handleReset();
            }}
            tx={tx}
          />

          {/* 오른쪽: 메인 입력 및 결과창 (8/12 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">

            {/* 탭 네비게이션 — 항상 노출(결과를 보면서도 전환, 탭별 결과 유지) · 모바일 가로 스크롤 + ARIA */}
            <div role="tablist" aria-label={tx("운세 종류")} className="rail flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel/30 p-1">
              {FORTUNE_TAB_ORDER.map((key, idx) => (
                <button
                  key={key}
                  id={`fortune-tab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  aria-controls={`fortune-tabpanel-${key}`}
                  tabIndex={activeTab === key ? 0 : -1}
                  onClick={() => { playback.stop(); setActiveTab(key); }}
                  onKeyDown={(e) => {
                    const len = FORTUNE_TAB_ORDER.length;
                    const nextIdx = e.key === "ArrowRight" ? (idx + 1) % len : e.key === "ArrowLeft" ? (idx - 1 + len) % len : e.key === "Home" ? 0 : e.key === "End" ? len - 1 : -1;
                    if (nextIdx < 0) return;
                    e.preventDefault();
                    const nextKey = FORTUNE_TAB_ORDER[nextIdx];
                    playback.stop();
                    setActiveTab(nextKey);
                    document.getElementById(`fortune-tab-${nextKey}`)?.focus();
                  }}
                  className={cn("min-h-11 min-w-fit shrink-0 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition-all", activeTab === key ? "bg-accent text-on-accent shadow" : "text-fg-3 hover:text-fg")}
                >
                  {FORTUNE_TAB_META[key].labelKo}
                </button>
              ))}
            </div>

            {/* 컨텐츠 카드 영역 */}
            <div id={`fortune-tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`fortune-tab-${activeTab}`} tabIndex={0} className="rounded-2xl border border-line bg-panel/20 p-6 min-h-[400px] flex flex-col justify-center" aria-live="polite" aria-busy={isLoading}>

              {/* 에러 + 재시도 */}
              {!isLoading && errorMsg && (
                <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="rounded-full border border-bad/30 bg-bad/10 px-4 py-2 text-sm text-fg-2">{errorMsg}</div>
                  <button
                    type="button"
                    onClick={() => retryRef.current?.()}
                    className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-on-accent hover:bg-accent-2"
                  >
                    다시 시도
                  </button>
                </div>
              )}

              {/* 로딩 — 탭별 스켈레톤(DESIGN.md: 스피너 금지) */}
              {isLoading && (
                <div role="status">
                  <FortuneLoading tab={activeTab} characterName={selectedChar.name} avatarUrl={selectedChar.avatarUrl} />
                </div>
              )}

              {/* 결과 출력창 */}
              {!isLoading && fortuneResult && (
                <FortuneResultPanel
                  activeTab={activeTab}
                  fortuneResult={fortuneResult}
                  selectedChar={selectedChar}
                  characters={characters}
                  playback={playback}
                  onTogglePlay={handleTogglePlay}
                  onOpenShare={() => setShareOpen(true)}
                  onReset={handleReset}
                  resultHeadingRef={resultHeadingRef}
                  shareTriggerRef={shareTriggerRef}
                  tx={tx}
                />
              )}

              {/* 월간 운세 결과 — 생년월일이 있으면 명리 월운으로 클라이언트에서 직접 계산 */}
              {!isLoading && activeTab === "monthly" && birthDate && (
                <FortunePeriodPanel kind="monthly" birthDate={birthDate} birthTime={birthTime} characterId={selectedChar?.id} />
              )}

              {/* 연간 운세 결과 — 생년월일이 있으면 세운+12개월 월운으로 클라이언트에서 직접 계산 */}
              {!isLoading && activeTab === "yearly" && birthDate && (
                <FortunePeriodPanel kind="yearly" birthDate={birthDate} birthTime={birthTime} characterId={selectedChar?.id} />
              )}

              {/* 빈 상태: 월간 운세 — 일러스트 + 단계 안내 + 생년월일 입력 */}
              {!isLoading && activeTab === "monthly" && !birthDate && (
                <FortuneBirthGate
                  kind="monthly"
                  birthDate={birthDate}
                  birthTime={birthTime}
                  onBirthDateChange={handlePeriodBirthDateChange}
                  onBirthTimeChange={handlePeriodBirthTimeChange}
                />
              )}

              {/* 빈 상태: 연간 운세 — 일러스트 + 단계 안내 + 생년월일 입력 */}
              {!isLoading && activeTab === "yearly" && !birthDate && (
                <FortuneBirthGate
                  kind="yearly"
                  birthDate={birthDate}
                  birthTime={birthTime}
                  onBirthDateChange={handlePeriodBirthDateChange}
                  onBirthTimeChange={handlePeriodBirthTimeChange}
                />
              )}

              {/* 도구별 입력 폼 및 타로 셔플·드로우 인터랙션 */}
              {!isLoading && !fortuneResult && (
                <FortuneToolInputForms
                  activeTab={activeTab}
                  selectedChar={selectedChar}
                  birthDate={birthDate}
                  birthTime={birthTime}
                  gender={gender}
                  onBirthDateChange={setBirthDate}
                  onBirthTimeChange={setBirthTime}
                  onGenderChange={setGender}
                  hasSavedBirthProfile={hasSavedBirthProfile}
                  onClearBirthProfile={handleClearBirthProfile}
                  partnerBirthDate={partnerBirthDate}
                  partnerBirthTime={partnerBirthTime}
                  onPartnerBirthDateChange={setPartnerBirthDate}
                  onPartnerBirthTimeChange={setPartnerBirthTime}
                  prescriptionQuery={prescriptionQuery}
                  onPrescriptionQueryChange={setPrescriptionQuery}
                  tarotStep={tarotStep}
                  tarotSpread={tarotSpread}
                  onTarotSpreadChange={setTarotSpread}
                  onStartTarotShuffle={startTarotShuffle}
                  onSelectTarotCard={handleSelectTarotCard}
                  onAnalyzeToday={handleAnalyzeToday}
                  onAnalyzeZodiac={handleAnalyzeZodiac}
                  onAnalyzePrescription={handleAnalyzePrescription}
                  onAnalyzeCompatibility={handleAnalyzeCompatibility}
                  onAnalyzeSaju={handleAnalyzeSaju}
                  onNavigateObservatorySaju={() => navigate("/fortune?content=saju")}
                  tx={tx}
                />
              )}

            </div>
          </div>

        </div>
      )}

      {/* 결과 {tx("공유·저장")} 모달 */}
      {shareOpen && fortuneResult && selectedChar && (
        <FortuneShareModal result={fortuneResult} character={selectedChar} tab={activeTab} onClose={() => { setShareOpen(false); shareTriggerRef.current?.focus(); }} />
      )}

      {/* 법적 면책 조항 및 자체 캐릭터 안내문 (Disclaimer) */}
      <footer className="mt-16 border-t border-line/40 pt-6 text-center max-w-2xl mx-auto space-y-2">
        <p className="text-[10px] text-fg-3 leading-relaxed">
          <strong>법적 고지</strong>: 본 운세 서비스는 가벼운 엔터테인먼트와 도서 큐레이션을 목적으로 제공됩니다.
          풀이 내용 및 행운 지수는 인공지능 기반 가상의 결과이며 법적·과학적 효력을 지니지 않습니다.
        </p>
        <p className="text-xs text-fg-3 leading-relaxed">
          본 서비스에 등장하는 에이전트(사서 아라, 도깨비 단우, 점술가 레오나, 검객 가온)는 ToonStudio이 독자적으로 기획·창작한 고유 캐릭터이며,
          특정 실존 인물, 단체 또는 타사 웹툰 저작물과 무관합니다.
        </p>
      </footer>
    </div>
    </MotionConfig>
  );
}

export function FortunePage({ tool }: { tool?: FortuneTab } = {}) {
  useDocumentTitle("운세 관측소");
  return (
    <FortuneObservatory
      characterContent={<CharacterFortunePage routeTab={tool} />}
      forceCharacter={tool !== undefined}
    />
  );
}
