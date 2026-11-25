/**
 * 스토리 씨앗 빌더 — 장르+키워드로 회차 기획 초안을 만드는 시작 동선.
 *
 * 투닝 Stories는 씨앗에서 "이야기 글"을 만들지만, 그 글이 제작 단계의
 * 구조화 필드로 인계되는 경로는 공개 자료에 없다. 이 빌더의 산출은 처음부터
 * EpisodePlan 정본 필드(로그라인·목표·시놉시스·훅·갈등·전환점·절벽·감정선)
 * 패치라서, 적용 즉시 기획 표면·콘티 시딩·인계 카드가 같은 초안을 읽는다.
 *
 * 상태 전수:
 * - 빈 상태: 장르를 고르기 전에는 만들기 버튼이 비활성 + 먼저 고르라는 안내.
 * - 로딩: 제공자 생성 중 (버튼 비활성, 진행 문구).
 * - 에러: 제공자 실패 시 사유 + [기본 제안으로 만들기](로컬 폴백) + [다시 시도].
 * - 준비: 로그라인 후보 3개 중 선택 → 초안 미리보기 → 적용.
 * - 덮어쓰기 확인: 대상 회차에 이미 줄거리가 있으면 한 번 더 확인하고 적용.
 * - 적용 완료: 넣었다는 확인 + 아래 기획 표면에서 이어 쓰라는 안내.
 * - 엣지: 키워드 5개 상한 안내, 미등록 장르는 폴백 키트 안내 문구.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import { GENRES } from "@/shared/lib/taxonomy";

import { StudioAiConnectionBadge, StudioAiConnectionNotice } from "../ai/StudioAiConnectionBadge";

import {
  buildLocalStorySeed,
  createTextAiStorySeedProvider,
  localStorySeedProvider,
  StorySeedAiError,
  storySeedPlanPatch,
  type StorySeedDraft,
  type StorySeedPlanPatch,
  type StorySeedProvider,
  type StorySeedSettingRef,
} from "./studio-story-seed";

const TONE_PRESETS = ["차분하게", "숨 가쁘게", "따뜻하게", "냉혹하게", "유쾌하게"] as const;

/** AI 씨앗 확장: 통합 AI 경로(등록한 내 키 → ToonStudio AI 순)로 보낸다. 기획 화면 첫 로드에 서버 AI 모듈을 싣지 않는다. */
const textAiStorySeedProvider = createTextAiStorySeedProvider(async (prompt, options) => {
  const { completeAutomaticFreeText } = await import("../studio-server-ai-client");
  const result = await completeAutomaticFreeText(prompt.system, prompt.user, options?.signal);
  return result.ok ? { ok: true, content: result.data.content } : { ok: false, error: result.error };
});
const KEYWORD_LIMIT = 5;

const SETTING_KIND_LABELS: Readonly<Record<StorySeedSettingRef["kind"], string>> = {
  character: "캐릭터",
  location: "장소",
  lore: "세계관 설정",
};

type SeedPhase = "editing" | "loading" | "ready" | "error" | "applied";

export interface StorySeedEpisodeSnapshot {
  readonly revision?: number;
  readonly logline?: string;
  readonly goal?: string;
  readonly synopsis?: string;
}

interface LockedSeedTarget {
  readonly episodeId?: string;
  readonly label?: string;
  readonly hasContent: boolean;
  readonly snapshot: StorySeedEpisodeSnapshot | null;
}

export interface StudioStorySeedBuilderProps {
  /** 세계관 허브·캐릭터 시트에서 온 설정 인용. 주인공·무대 기본값과 출처 표시에 쓴다. */
  readonly settingRefs?: readonly StorySeedSettingRef[];
  /** 적용 대상 회차에 이미 줄거리가 있으면 덮어쓰기 확인을 거친다. */
  readonly targetHasContent?: boolean;
  /** 현재 선택된 대상 회차 ID. 요청 시작 시점에 고정해 회차 이동 시에도 대상이 바뀌지 않는다. */
  readonly targetEpisodeId?: string;
  /** 현재 선택된 대상 회차 표시 이름 (예: "2화 · 빗속의 약속"). */
  readonly targetEpisodeLabel?: string;
  /** 원문과 제안 비교를 위한 대상 회차의 기존 기획 요약. */
  readonly targetCurrentSnapshot?: StorySeedEpisodeSnapshot | null;
  /** 기본은 로컬 결정적 제공자. AI 제공자는 같은 계약으로 갈아 끼운다. */
  readonly provider?: StorySeedProvider;
  /** AI 씨앗 확장 버튼에 연결되는 제공자 (기본: 서버 자동 무료/등록 키 텍스트 AI). */
  readonly aiProvider?: StorySeedProvider;
  readonly onApplySeed: (
    patch: StorySeedPlanPatch,
    draft: StorySeedDraft,
    targetEpisodeId?: string,
    expectedRevision?: number,
  ) => boolean | void;
  readonly onUndoAppliedSeed?: (targetEpisodeId: string) => false | void | {
    readonly snapshot: StorySeedEpisodeSnapshot;
    readonly hasContent: boolean;
    readonly changed: boolean;
  };
}

export function StudioStorySeedBuilder({
  settingRefs = [],
  targetHasContent = false,
  targetEpisodeId,
  targetEpisodeLabel,
  targetCurrentSnapshot = null,
  provider = localStorySeedProvider,
  aiProvider = textAiStorySeedProvider,
  onApplySeed,
  onUndoAppliedSeed,
}: StudioStorySeedBuilderProps) {
  const [genre, setGenre] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<readonly string[]>([]);
  const [tone, setTone] = useState("");
  const [protagonist, setProtagonist] = useState("");
  const [stage, setStage] = useState("");
  const [phase, setPhase] = useState<SeedPhase>("editing");
  const [draft, setDraft] = useState<StorySeedDraft | null>(null);
  const [loglineIndex, setLoglineIndex] = useState<0 | 1 | 2>(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  // "다시 시도"는 방금 실패한 쪽(기본 제안·AI 확장)으로 다시 보낸다.
  const lastProviderRef = useRef<StorySeedProvider>(provider);
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const [lockedTarget, setLockedTarget] = useState<LockedSeedTarget | null>(null);
  const [appliedTarget, setAppliedTarget] = useState<LockedSeedTarget | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  useEffect(() => {
    return () => {
      inFlightAbortRef.current?.abort();
      inFlightAbortRef.current = null;
    };
  }, []);
  // 설정 인용 선택: 기본은 전부 인용, 작가가 뺀 항목만 기억한다.
  // 새 설정이 허브·시트에 생기면 자동으로 인용 목록에 들어온다.
  const [deselectedSettingIds, setDeselectedSettingIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const citedRefs = settingRefs.filter((ref) => !deselectedSettingIds.has(ref.id));
  const toggleSettingRef = (id: string, cited: boolean) => {
    setDeselectedSettingIds((prev) => {
      const next = new Set(prev);
      if (cited) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const keywordCapped = keywords.length >= KEYWORD_LIMIT;
  const genreKnown = useMemo(
    () => genre.trim() !== "" && GENRES.some((known) => known === genre.trim()),
    [genre],
  );

  const addKeyword = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setKeywords((prev) => {
      if (prev.includes(value) || prev.length >= KEYWORD_LIMIT) return prev;
      return [...prev, value];
    });
    setKeywordInput("");
  };

  const runGenerate = async (useProvider: StorySeedProvider) => {
    if (phase === "loading") return;
    inFlightAbortRef.current?.abort();
    const controller = new AbortController();
    inFlightAbortRef.current = controller;
    const capturedTarget: LockedSeedTarget = {
      episodeId: targetEpisodeId,
      label: targetEpisodeLabel,
      hasContent: targetHasContent,
      snapshot: targetCurrentSnapshot,
    };
    setLockedTarget(capturedTarget);
    lastProviderRef.current = useProvider;
    setPhase("loading");
    setConfirmOverwrite(false);
    setStatusNotice(null);
    try {
      const result = await useProvider.generate(
        {
          genre,
          keywords,
          tone: tone || undefined,
          protagonist: protagonist || undefined,
          stage: stage || undefined,
          settingRefs: citedRefs,
        },
        { signal: controller.signal },
      );
      if (inFlightAbortRef.current !== controller || controller.signal.aborted) {
        return;
      }
      inFlightAbortRef.current = null;
      if (!result) {
        setErrorMessage("장르를 먼저 골라 주세요.");
        setPhase("error");
        return;
      }
      setDraft(result);
      setLoglineIndex(0);
      setPhase("ready");
    } catch (error) {
      if (inFlightAbortRef.current !== controller || controller.signal.aborted) {
        return;
      }
      inFlightAbortRef.current = null;
      setErrorMessage(
        error instanceof StorySeedAiError
          ? error.message
          : r3c04StatusText("studio.r3c04Status.planning.storySeed.generateFailed", "제안을 만들지 못했어요. 네트워크나 제공자 상태를 확인하거나, 기본 제안으로 만들어 보세요."),
      );
      setPhase("error");
    }
  };

  const handleCancelGenerate = () => {
    inFlightAbortRef.current?.abort();
    inFlightAbortRef.current = null;
    setPhase("editing");
    setStatusNotice("씨앗 초안 생성을 취소했어요. 선택한 장르와 키워드는 그대로 남아 있습니다.");
  };

  const effectiveTarget: LockedSeedTarget = lockedTarget ?? {
    episodeId: targetEpisodeId,
    label: targetEpisodeLabel,
    hasContent: targetHasContent,
    snapshot: targetCurrentSnapshot,
  };
  const switchedAwayFromLockedEpisode = Boolean(
    lockedTarget?.episodeId &&
      targetEpisodeId &&
      lockedTarget.episodeId !== targetEpisodeId,
  );

  const handleApply = () => {
    if (!draft) return;
    if (effectiveTarget.hasContent && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    const saved = onApplySeed(
      storySeedPlanPatch(draft, loglineIndex),
      draft,
      effectiveTarget.episodeId,
      effectiveTarget.snapshot?.revision,
    );
    if (saved === false) {
      setConfirmOverwrite(false);
      return;
    }
    setAppliedTarget(effectiveTarget);
    setConfirmOverwrite(false);
    setStatusNotice(null);
    setPhase("applied");
  };

  const handleUndoApply = () => {
    if (!onUndoAppliedSeed || !appliedTarget?.episodeId) return;
    const result = onUndoAppliedSeed(appliedTarget.episodeId);
    if (result === false) return;
    if (result) {
      setLockedTarget({ ...appliedTarget, snapshot: result.snapshot, hasContent: result.hasContent });
    }
    setStatusNotice(
      result && !result.changed
        ? "이후에 수정한 회차 내용은 그대로 유지했어요."
        : "방금 반영한 씨앗 초안만 되돌렸어요.",
    );
    setAppliedTarget(null);
    setPhase("ready");
  };

  return (
    <section aria-label="스토리 씨앗 빌더" className="rounded-2xl border border-line bg-panel p-4">
      <header className="mb-3">
        <h3 className="text-base font-bold text-fg">이야기의 씨앗으로 시작하기</h3>
        <p className="mt-0.5 text-sm text-fg-3">
          장르와 키워드 몇 개면 회차 기획의 첫 초안이 만들어져요. 초안은 골격이에요 — 고르고, 채우고, 고치는 건 작가 몫입니다.
        </p>
        {provider.kind === "ai" ? (
          <div className="mt-2">
            <StudioAiConnectionBadge kind="provider-ready" />
          </div>
        ) : (
          <StudioAiConnectionNotice
            kind="not-connected"
            className="mt-2"
            detail={r3c04StatusText("studio.r3c04Status.planning.storySeed.providerNotConnected", "외부 AI 제공자는 연결 전입니다. 대신 기본 제안(로컬·결정적)이 지금 바로 동작합니다 — 같은 입력은 항상 같은 초안이고, 횟수 제한이 없습니다.")}
          />
        )}
      </header>

      <div className="grid gap-3">
        <div>
          <span className="mb-1 block text-xs font-semibold text-fg-2">장르</span>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={genre === candidate}
                onClick={() => setGenre(candidate)}
                className={
                  genre === candidate
                    ? "min-h-11 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    : "min-h-11 rounded-lg border border-line bg-card px-3.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                }
              >
                {candidate}
              </button>
            ))}
          </div>
          {genre.trim() !== "" && !genreKnown && (
            <p className="mt-1 text-xs text-fg-3">목록에 없는 장르예요. 기본 골격으로 초안을 만듭니다.</p>
          )}
        </div>

        <div>
          <label htmlFor="seed-keyword-input" className="mb-1 block text-xs font-semibold text-fg-2">
            키워드 (최대 {KEYWORD_LIMIT}개)
          </label>
          <div className="flex gap-2">
            <input
              id="seed-keyword-input"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addKeyword(keywordInput);
                }
              }}
              placeholder="예: 저주받은 검, 왕위, 배신"
              className="min-h-11 flex-1 rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            />
            <button
              type="button"
              onClick={() => addKeyword(keywordInput)}
              disabled={keywordCapped}
              title={keywordCapped ? `키워드는 최대 ${KEYWORD_LIMIT}개까지 넣을 수 있습니다` : undefined}
              className="min-h-11 rounded-lg border border-line bg-card px-3.5 text-sm font-medium text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              추가
            </button>
          </div>
          {keywordCapped && (
            <p className="mt-1 text-xs text-fg-3">키워드는 {KEYWORD_LIMIT}개까지만 넣을 수 있어요. 가장 중요한 것만 남겨 보세요.</p>
          )}
          {keywords.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="고른 키워드">
              {keywords.map((keyword) => (
                <li key={keyword}>
                  <button
                    type="button"
                    onClick={() => setKeywords((prev) => prev.filter((item) => item !== keyword))}
                    className="min-h-9 rounded-lg border border-line bg-raised px-2.5 text-xs text-fg-2 hover:text-fg"
                    aria-label={`키워드 ${keyword} 빼기`}
                  >
                    {keyword} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-fg-2">분위기 (선택)</span>
            <select
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-sm text-fg"
            >
              <option value="">고르지 않음</option>
              {TONE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-fg-2">주인공 (선택)</span>
            <input
              value={protagonist}
              onChange={(event) => setProtagonist(event.target.value)}
              placeholder="비우면 장르 기본값이나 캐릭터 설정을 써요"
              className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-fg-2">무대 (선택)</span>
            <input
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              placeholder="비우면 장르 기본값이나 장소 설정을 써요"
              className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            />
          </label>
        </div>

        {settingRefs.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-fg-2">
              설정 인용 ({settingRefs.length}개 중 {citedRefs.length}개 인용)
            </legend>
            <p className="mb-2 text-xs text-fg-3">
              세계관 허브·캐릭터 시트에서 가져온 설정이에요. 주인공·무대를 비우면 캐릭터·장소
              이름으로 초안을 만들고, 세계관 설정은 줄거리의 배경으로 반영돼요. 인용한 설정은
              초안의 출처로 남아 회차 인계 카드에도 표시됩니다.
            </p>
            <ul className="grid gap-1.5" aria-label="설정 인용 목록">
              {settingRefs.map((ref) => {
                const cited = !deselectedSettingIds.has(ref.id);
                return (
                  <li key={ref.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm text-fg hover:bg-raised">
                      <input
                        type="checkbox"
                        checked={cited}
                        onChange={(event) => toggleSettingRef(ref.id, event.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-semibold">{ref.name}</span>
                        <span className="ml-2 rounded-lg bg-raised px-2 py-0.5 text-xs font-semibold text-fg-2">
                          {ref.sourceLabel ?? SETTING_KIND_LABELS[ref.kind]}
                        </span>
                        {ref.detail && (
                          <span className="mt-0.5 block text-xs text-fg-3">{ref.detail}</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={genre.trim() === "" || phase === "loading"}
            title={genre.trim() === "" ? "장르를 먼저 골라 주세요" : undefined}
            onClick={() => void runGenerate(provider)}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === "loading" ? "초안 만드는 중…" : "씨앗 초안 만들기"}
          </button>
          <button
            type="button"
            disabled={genre.trim() === "" || phase === "loading"}
            title={genre.trim() === "" ? "장르를 먼저 골라 주세요" : undefined}
            onClick={() => void runGenerate(aiProvider)}
            data-testid="story-seed-ai-expand-btn"
            className="min-h-11 rounded-lg border border-accent/40 bg-accent-soft px-4 text-sm font-semibold text-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            AI 씨앗 확장 만들기
          </button>
          {phase === "loading" && (
            <button
              type="button"
              data-testid="story-seed-cancel-btn"
              onClick={handleCancelGenerate}
              className="min-h-11 rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-fg hover:bg-raised"
            >
              요청 취소
            </button>
          )}
          {targetEpisodeLabel && (
            <span
              data-testid="story-seed-target-badge"
              className="inline-flex min-h-9 items-center rounded-full border border-line bg-card px-3 text-xs font-semibold text-fg-2 [word-break:keep-all]"
            >
              {phase === "ready" || phase === "loading"
                ? `적용 대상 고정: ${effectiveTarget.label ?? targetEpisodeLabel}`
                : `현재 대상: ${targetEpisodeLabel}`}
            </span>
          )}
          {genre.trim() === "" && (
            <span className="text-xs text-fg-3">장르를 먼저 골라 주세요.</span>
          )}
          <span className="text-xs text-fg-3">
            {provider.kind === "ai" ? "AI 제안" : "기본 제안(규칙 기반) — 횟수 제한 없이 쓸 수 있어요"}
          </span>
        </div>
        {statusNotice && (
          <p role="status" className="text-xs font-semibold text-fg-2 [word-break:keep-all]">
            {statusNotice}
          </p>
        )}
      </div>

      {phase === "error" && (
        <div role="alert" className="mt-3 rounded-xl border border-danger/50 bg-danger-soft/20 px-3 py-2">
          <p className="text-sm text-fg">{errorMessage}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const local = buildLocalStorySeed({
                  genre,
                  keywords,
                  tone: tone || undefined,
                  protagonist: protagonist || undefined,
                  stage: stage || undefined,
                  settingRefs: citedRefs,
                });
                if (local) {
                  setDraft(local);
                  setLoglineIndex(0);
                  setPhase("ready");
                }
              }}
              className="min-h-11 rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-fg hover:bg-raised"
            >
              기본 제안으로 만들기
            </button>
            <button
              type="button"
              onClick={() => void runGenerate(lastProviderRef.current)}
              className="min-h-11 rounded-lg border border-line px-3.5 text-xs text-fg-2 hover:bg-raised hover:text-fg"
            >
              {r3c04StatusText("studio.r3c04Status.planning.storySeed.retry", "다시 시도")}
            </button>
          </div>
        </div>
      )}

      {phase === "ready" && draft && (
        <div className="mt-4 grid gap-3">
          {switchedAwayFromLockedEpisode && effectiveTarget.label && (
            <p
              role="status"
              data-testid="story-seed-target-lock-warning"
              className="rounded-xl border border-accent/40 bg-accent-soft/40 px-3 py-2 text-xs font-semibold text-fg [word-break:keep-all]"
            >
              다른 회차로 이동했지만, 이 초안은 요청을 시작한 <strong>{effectiveTarget.label}</strong>에 안전하게 고정되어 있어요.
            </p>
          )}
          {effectiveTarget.snapshot &&
            (effectiveTarget.snapshot.logline?.trim() ||
              effectiveTarget.snapshot.synopsis?.trim()) && (
              <div
                data-testid="story-seed-original-vs-suggestion"
                className="grid gap-2 rounded-xl border border-line bg-card p-3 text-xs sm:grid-cols-2 [word-break:keep-all]"
              >
                <div>
                  <span className="font-bold text-fg-3">
                    기존 원문 ({effectiveTarget.label ?? "현재 회차"})
                  </span>
                  {effectiveTarget.snapshot.logline?.trim() ? (
                    <p className="mt-1 font-semibold text-fg-2">
                      {effectiveTarget.snapshot.logline}
                    </p>
                  ) : null}
                  {effectiveTarget.snapshot.synopsis?.trim() ? (
                    <p className="mt-1 text-fg-3">{effectiveTarget.snapshot.synopsis}</p>
                  ) : null}
                </div>
                <div className="border-t border-line pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                  <span className="font-bold text-accent">새 씨앗 제안</span>
                  <p className="mt-1 font-semibold text-fg">
                    {draft.loglineCandidates[loglineIndex]}
                  </p>
                  <p className="mt-1 text-fg-2">{draft.synopsisDraft}</p>
                </div>
              </div>
            )}
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-fg-2">로그라인 후보 — 하나를 고르세요</legend>
            <div className="grid gap-1.5">
              {draft.loglineCandidates.map((candidate, index) => (
                <label
                  key={candidate}
                  className="flex cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm text-fg hover:bg-raised"
                >
                  <input
                    type="radio"
                    name="seed-logline"
                    checked={loglineIndex === index}
                    onChange={() => setLoglineIndex(index as 0 | 1 | 2)}
                    className="mt-1"
                  />
                  <span>{candidate}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {draft.referencedSettingIds.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-fg-2">이 초안이 인용한 설정 (출처)</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="초안이 인용한 설정">
                {draft.referencedSettingIds.map((id) => {
                  const ref = settingRefs.find((candidate) => candidate.id === id);
                  return (
                    <li
                      key={id}
                      className="rounded-full bg-raised px-2.5 py-1 text-xs text-fg-2"
                    >
                      {ref ? `${ref.name} · ${ref.sourceLabel ?? SETTING_KIND_LABELS[ref.kind]}` : id}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <details className="rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-fg">초안 전체 보기</summary>
            <dl className="mt-2 grid gap-2 text-sm text-fg-2">
              <div>
                <dt className="font-semibold text-fg">줄거리</dt>
                <dd>{draft.synopsisDraft}</dd>
              </div>
              <div>
                <dt className="font-semibold text-fg">첫 장면(훅)</dt>
                <dd>{draft.openingHookDraft}</dd>
              </div>
              <div>
                <dt className="font-semibold text-fg">핵심 갈등</dt>
                <dd>{draft.coreConflictDraft}</dd>
              </div>
              <div>
                <dt className="font-semibold text-fg">감정선</dt>
                <dd>
                  {draft.emotionalArc.from} → {draft.emotionalArc.to}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-fg">마지막 절벽</dt>
                <dd>{draft.cliffhangerDraft}</dd>
              </div>
              <div>
                <dt className="font-semibold text-fg">다음 전개 제안</dt>
                <dd>
                  <ul className="list-inside list-disc">
                    {draft.expansionProposals.map((proposal) => (
                      <li key={proposal}>{proposal}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </details>
          {confirmOverwrite ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/60 px-3 py-2.5">
              <p className="text-sm text-fg">이 회차에는 이미 줄거리가 있어요. 씨앗 초안으로 덮을까요?</p>
              <button
                type="button"
                onClick={handleApply}
                className="min-h-11 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent"
              >
                덮어쓰기
              </button>
              <button
                type="button"
                onClick={() => setConfirmOverwrite(false)}
                className="min-h-11 rounded-lg border border-line bg-panel px-3.5 text-xs text-fg-2 hover:bg-raised"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleApply}
              className="min-h-11 justify-self-start rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent"
            >
              이 초안을 회차 기획에 넣기
            </button>
          )}
        </div>
      )}

      {phase === "applied" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-sm text-fg [word-break:keep-all]">
          <span>
            {appliedTarget?.label
              ? `${appliedTarget.label} 기획에 넣었어요. 아래 줄거리 표면에서 전환점 골격을 채우고 다듬어 보세요.`
              : "회차 기획에 넣었어요. 아래 줄거리 표면에서 전환점 골격을 채우고 다듬어 보세요."}
          </span>
          {onUndoAppliedSeed && appliedTarget?.episodeId && (
            <button
              type="button"
              data-testid="story-seed-undo-btn"
              onClick={handleUndoApply}
              className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-panel"
            >
              방금 반영만 되돌리기
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setLockedTarget(null);
              setPhase("editing");
            }}
            className="text-accent underline"
          >
            새 씨앗 만들기
          </button>
        </div>
      )}
    </section>
  );
}
