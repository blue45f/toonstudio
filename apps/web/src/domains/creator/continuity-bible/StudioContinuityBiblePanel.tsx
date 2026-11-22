/**
 * 장기 연재 작화 일관성 바이블 (Continuity Bible) 패널 (Calm Atelier · ₩0 로컬).
 *
 * StudioCharacterSheetPanel(캐릭터 시트 진입점)에서 지연 마운트되며,
 * 캐릭터별 외형·복장·상처·소품·상태 변화 이력과 직전 화 대비 누락 경고를 관리한다.
 */
import { AlertTriangle, BookMarked, CheckCircle2, Copy, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { StudioStoryCharacter } from "../studio-story-bible";
import { ContinuityMiniReferenceCard } from "./ContinuityMiniReferenceCard";
import {
  addCharacterOutfit,
  addCharacterProp,
  addCharacterScar,
  createStarterContinuityBible,
  evaluateSeriesContinuity,
  formatContinuityChecksheetMarkdown,
  loadContinuityBible,
  saveContinuityBible,
  syncContinuityBibleCharacters,
  toggleContinuityCheckItem,
  updateCharacterVisualAnchors,
  type ContinuityBibleState,
  type ContinuityHandPreference,
  type ContinuityScarSeverity,
} from "./continuity-bible-model";

export interface StudioContinuityBiblePanelProps {
  readonly projectId: string;
  readonly characters?: readonly StudioStoryCharacter[];
  readonly selectedCharacterId?: string | null;
}

const INPUT_CLASS =
  "mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioContinuityBiblePanel({
  projectId,
  characters,
  selectedCharacterId,
}: StudioContinuityBiblePanelProps) {
  const [bible, setBible] = useState<ContinuityBibleState>(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const saved = loadContinuityBible(storage, projectId);
    if (saved) {
      return characters && characters.length > 0
        ? syncContinuityBibleCharacters(saved, characters)
        : saved;
    }
    return createStarterContinuityBible(projectId, characters);
  });

  const [focusedCharacterId, setFocusedCharacterId] = useState<string>(
    selectedCharacterId ?? bible.characters[0]?.characterId ?? "",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 상처·소품·복장 추가 폼 로컬 입력
  const [newScarLocation, setNewScarLocation] = useState("");
  const [newScarEpisode, setNewScarEpisode] = useState<number>(bible.currentEpisodeNumber);
  const [newScarSeverity, setNewScarSeverity] = useState<ContinuityScarSeverity>("permanent");
  const [newScarNote, setNewScarNote] = useState("");

  const [newPropLabel, setNewPropLabel] = useState("");
  const [newPropHand, setNewPropHand] = useState<ContinuityHandPreference>("left");

  const [newOutfitLabel, setNewOutfitLabel] = useState("");
  const [newOutfitDetails, setNewOutfitDetails] = useState("");

  // 호스트 캐릭터 목록 변경 동기화
  const syncedBible = useMemo(
    () =>
      characters && characters.length > 0
        ? syncContinuityBibleCharacters(bible, characters)
        : bible,
    [bible, characters],
  );

  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    saveContinuityBible(storage, syncedBible);
  }, [syncedBible]);

  const summary = useMemo(() => evaluateSeriesContinuity(syncedBible), [syncedBible]);

  const activeCharacterId =
    syncedBible.characters.some((c) => c.characterId === focusedCharacterId)
      ? focusedCharacterId
      : selectedCharacterId &&
          syncedBible.characters.some((c) => c.characterId === selectedCharacterId)
        ? selectedCharacterId
        : (syncedBible.characters[0]?.characterId ?? "");

  const activeProfile =
    syncedBible.characters.find((c) => c.characterId === activeCharacterId) ?? null;

  const setEpisodeNumber = (nextEpisode: number) => {
    const clamped = Math.max(1, Math.min(999, Math.round(nextEpisode)));
    setBible((prev) => ({ ...prev, currentEpisodeNumber: clamped }));
    setNewScarEpisode(clamped);
  };

  const handleToggleItem = (characterId: string, itemId: string) => {
    setBible((prev) => toggleContinuityCheckItem(prev, characterId, itemId));
  };

  const handleAddScar = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProfile || !newScarLocation.trim()) return;
    setBible((prev) =>
      addCharacterScar(prev, activeProfile.characterId, {
        locationKo: newScarLocation.trim(),
        sinceEpisode: Math.max(1, Math.round(newScarEpisode)),
        severity: newScarSeverity,
        note: newScarNote.trim() || `${newScarEpisode}화부터 유지`,
      }),
    );
    setStatusMessage(
      `${activeProfile.characterName}의 ${newScarEpisode}화 '${newScarLocation.trim()}' 항목을 바이블에 추가했어요.`,
    );
    setNewScarLocation("");
    setNewScarNote("");
  };

  const handleAddProp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProfile || !newPropLabel.trim()) return;
    setBible((prev) =>
      addCharacterProp(prev, activeProfile.characterId, {
        label: newPropLabel.trim(),
        sinceEpisode: syncedBible.currentEpisodeNumber,
        handPreference: newPropHand,
        carriedByDefault: true,
      }),
    );
    setStatusMessage(
      `${activeProfile.characterName}의 핵심 소품 '${newPropLabel.trim()}'을(를) 등록했어요.`,
    );
    setNewPropLabel("");
  };

  const handleAddOutfit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProfile || !newOutfitLabel.trim()) return;
    setBible((prev) =>
      addCharacterOutfit(prev, activeProfile.characterId, {
        label: newOutfitLabel.trim(),
        activeFromEpisode: syncedBible.currentEpisodeNumber,
        isDefault: false,
        details: newOutfitDetails.trim() || `${syncedBible.currentEpisodeNumber}화 환복 기준`,
      }),
    );
    setStatusMessage(
      `${activeProfile.characterName}의 ${syncedBible.currentEpisodeNumber}화 복장 '${newOutfitLabel.trim()}'을(를) 등록했어요.`,
    );
    setNewOutfitLabel("");
    setNewOutfitDetails("");
  };

  const handleCopyChecksheet = async () => {
    const markdown = formatContinuityChecksheetMarkdown(summary);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
        setStatusMessage(`${summary.episodeNumber}화 작화 체크시트를 클립보드에 복사했어요.`);
        return;
      }
    } catch {
      // 클립보드 차단 환경에서는 상태 안내로 마무리한다.
    }
    setStatusMessage(`${summary.episodeNumber}화 체크시트 요약을 준비했어요.`);
  };

  return (
    <section
      aria-label="장기 연재 작화 일관성 바이블"
      data-testid="continuity-bible-panel"
      className="space-y-5 rounded-2xl border border-line bg-panel p-4 text-fg sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <BookMarked size={14} aria-hidden="true" />
            작화 일관성 바이블 · ₩0 로컬
          </p>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            장기 연재 캐릭터 복장·상처·소품 체크시트
          </h2>
          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            화수를 넘길 때마다 눈 색·헤어·상처·교복·소품이 빠지거나 뒤바뀌지 않도록 직전 화 대비 경고를 띄웁니다.
          </p>
        </div>

        {/* 현재 작업 화수 스테퍼 */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="작업 화수 선택"
            className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
          >
            <button
              type="button"
              aria-label="이전 화"
              data-testid="continuity-prev-episode-btn"
              onClick={() => setEpisodeNumber(syncedBible.currentEpisodeNumber - 1)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Minus size={15} aria-hidden="true" />
            </button>
            <span
              data-testid="continuity-current-episode"
              className="min-w-[5.5rem] px-2 text-center text-sm font-bold tabular-nums text-fg"
            >
              {syncedBible.currentEpisodeNumber}화 작업
            </span>
            <button
              type="button"
              aria-label="다음 화"
              data-testid="continuity-next-episode-btn"
              onClick={() => setEpisodeNumber(syncedBible.currentEpisodeNumber + 1)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Plus size={15} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            data-testid="continuity-copy-checksheet-btn"
            onClick={() => void handleCopyChecksheet()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Copy size={14} aria-hidden="true" />
            체크시트 복사
          </button>
        </div>
      </header>

      {/* 이전 화 대비 변경·누락 경고 스트립 */}
      <section
        aria-label="이전 화 대비 변경 경고"
        data-testid="continuity-warnings-strip"
        className={`space-y-2.5 rounded-xl border p-3.5 ${
          summary.errorCount > 0
            ? "border-bad/45 bg-bad/10"
            : summary.warnCount > 0
              ? "border-warn/45 bg-warn/10"
              : "border-good/40 bg-good/10"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-bold text-fg">
            {summary.errorCount > 0 || summary.warnCount > 0 ? (
              <AlertTriangle
                size={15}
                className={summary.errorCount > 0 ? "text-bad" : "text-warn"}
                aria-hidden="true"
              />
            ) : (
              <CheckCircle2 size={15} className="text-good" aria-hidden="true" />
            )}
            {summary.allWarnings.length > 0
              ? `이전 화(${Math.max(1, summary.episodeNumber - 1)}화) 대비 확인 필요 ${summary.allWarnings.length}건 (필수 누락 ${summary.errorCount} · 주의 ${summary.warnCount})`
              : `${summary.episodeNumber}화 작화 일관성 체크 완료 (일치율 ${summary.overallScore}%)`}
          </h3>
          <span className="text-xs font-bold tabular-nums text-fg-2">
            일치율 {summary.overallScore}%
          </span>
        </div>

        {summary.allWarnings.length > 0 ? (
          <ul className="space-y-1.5">
            {summary.allWarnings.map((warning) => (
              <li
                key={warning.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-bold text-fg [word-break:keep-all]">
                    [{warning.characterName}] {warning.headlineKo}
                  </p>
                  <p className="text-fg-2 [word-break:keep-all]">{warning.actionHintKo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleItem(warning.characterId, warning.itemId)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-accent/45 bg-accent-soft px-3 text-xs font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <CheckCircle2 size={13} aria-hidden="true" />
                  확인 완료
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Calm Atelier 미니 참조 카드 그리드 */}
      <div className="grid gap-3 md:grid-cols-2">
        {syncedBible.characters.map((profile) => {
          const evaluation = summary.characterEvaluations.find(
            (ev) => ev.characterId === profile.characterId,
          );
          if (!evaluation) return null;
          return (
            <ContinuityMiniReferenceCard
              key={profile.characterId}
              profile={profile}
              evaluation={evaluation}
              selected={profile.characterId === activeCharacterId}
              onSelect={() => setFocusedCharacterId(profile.characterId)}
              onToggleCheckItem={(itemId) => handleToggleItem(profile.characterId, itemId)}
            />
          );
        })}
      </div>

      {/* 선택 캐릭터 항목 편집 & 상태 변화 이력 */}
      {activeProfile ? (
        <div className="space-y-4 rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <h3 className="text-sm font-bold text-fg">
              {activeProfile.characterName} — 유지 스펙·상처·소품·이력 관리
            </h3>
            <span className="text-xs text-fg-3">
              저장 즉시 {syncedBible.currentEpisodeNumber}화 경고에 반영됩니다
            </span>
          </div>

          {/* 눈 색 · 헤어 즉시 편집 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-fg-2">
              눈 색·하이라이트 규칙
              <input
                value={activeProfile.eyeColorLabel}
                onChange={(event) =>
                  setBible((prev) =>
                    updateCharacterVisualAnchors(prev, activeProfile.characterId, {
                      eyeColorLabel: event.target.value,
                    }),
                  )
                }
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-xs font-semibold text-fg-2">
              헤어 스타일·가르마 고정
              <input
                value={activeProfile.hairStyleAndColor}
                onChange={(event) =>
                  setBible((prev) =>
                    updateCharacterVisualAnchors(prev, activeProfile.characterId, {
                      hairStyleAndColor: event.target.value,
                    }),
                  )
                }
                className={INPUT_CLASS}
              />
            </label>
          </div>

          {/* 상처·흉터 / 소품 / 복장 빠른 등록 3열 */}
          <div className="grid gap-3 lg:grid-cols-3">
            <form
              onSubmit={handleAddScar}
              className="space-y-2 rounded-xl border border-line bg-panel/70 p-3"
            >
              <h4 className="text-xs font-bold text-fg">상처·흉터 추가</h4>
              <label className="block text-xs text-fg-2">
                위치·특징
                <input
                  data-testid="continuity-add-scar-location"
                  value={newScarLocation}
                  onChange={(event) => setNewScarLocation(event.target.value)}
                  placeholder="예: 오른팔 팔꿈치 긁힘"
                  className={INPUT_CLASS}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-fg-2">
                  발생 화수
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={newScarEpisode}
                    onChange={(event) => setNewScarEpisode(Number(event.target.value) || 1)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block text-xs text-fg-2">
                  유지 구분
                  <select
                    value={newScarSeverity}
                    onChange={(event) => {
                      const val = event.target.value;
                      if (val === "permanent" || val === "temporary" || val === "healed") {
                        setNewScarSeverity(val);
                      }
                    }}
                    className={INPUT_CLASS}
                  >
                    <option value="permanent">영구 유지</option>
                    <option value="temporary">임시 유지</option>
                    <option value="healed">완치 종료</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs text-fg-2">
                작화 메모
                <input
                  value={newScarNote}
                  onChange={(event) => setNewScarNote(event.target.value)}
                  placeholder="반전 방향·길이 등"
                  className={INPUT_CLASS}
                />
              </label>
              <button
                type="submit"
                data-testid="continuity-add-scar-submit"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-3 text-xs font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                상처·흉터 등록
              </button>
            </form>

            <form
              onSubmit={handleAddProp}
              className="space-y-2 rounded-xl border border-line bg-panel/70 p-3"
            >
              <h4 className="text-xs font-bold text-fg">핵심 소품 추가</h4>
              <label className="block text-xs text-fg-2">
                소품명
                <input
                  data-testid="continuity-add-prop-label"
                  value={newPropLabel}
                  onChange={(event) => setNewPropLabel(event.target.value)}
                  placeholder="예: 검은 가죽 팔찌"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="block text-xs text-fg-2">
                착용/지참 방향
                <select
                  value={newPropHand}
                  onChange={(event) => {
                    const val = event.target.value;
                    if (val === "left" || val === "right" || val === "either") {
                      setNewPropHand(val);
                    }
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="left">왼손/좌측</option>
                  <option value="right">오른손/우측</option>
                  <option value="either">양손/가변</option>
                </select>
              </label>
              <button
                type="submit"
                data-testid="continuity-add-prop-submit"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {syncedBible.currentEpisodeNumber}화 소품 등록
              </button>
            </form>

            <form
              onSubmit={handleAddOutfit}
              className="space-y-2 rounded-xl border border-line bg-panel/70 p-3"
            >
              <h4 className="text-xs font-bold text-fg">화수 복장 추가</h4>
              <label className="block text-xs text-fg-2">
                복장명
                <input
                  data-testid="continuity-add-outfit-label"
                  value={newOutfitLabel}
                  onChange={(event) => setNewOutfitLabel(event.target.value)}
                  placeholder="예: 비 오는 날 노란 우비"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="block text-xs text-fg-2">
                디테일 규칙
                <input
                  value={newOutfitDetails}
                  onChange={(event) => setNewOutfitDetails(event.target.value)}
                  placeholder="단추·배지·액세서리 규칙"
                  className={INPUT_CLASS}
                />
              </label>
              <button
                type="submit"
                data-testid="continuity-add-outfit-submit"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {syncedBible.currentEpisodeNumber}화부터 복장 등록
              </button>
            </form>
          </div>

          {/* 상태 변화 이력 타임라인 */}
          <div className="space-y-2 border-t border-line pt-3">
            <h4 className="text-xs font-bold text-fg">
              화수별 상태 변화 이력 ({activeProfile.stateHistory.length}건)
            </h4>
            <ol className="space-y-1.5">
              {activeProfile.stateHistory.map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-wrap items-baseline gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs"
                >
                  <span className="font-mono font-bold tabular-nums text-accent">
                    {ev.episodeNumber}화
                  </span>
                  <span className="font-semibold text-fg">{ev.summaryKo}</span>
                  <span className="text-fg-3">{ev.detailKo}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}

      {statusMessage ? (
        <p
          role="status"
          data-testid="continuity-bible-status"
          className="rounded-lg border border-good/35 bg-good/10 px-3 py-2 text-xs font-semibold text-good"
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
