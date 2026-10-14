import { useId, useMemo, useState } from "react";

import {
  assembleSceneDraft,
  type StudioSceneAssemblyResult,
  type StudioSceneCatalogEntry,
} from "./studio-scene-catalog-assembly";
import {
  structureSceneWithFallback,
  type StudioSceneStructureProvider,
} from "./studio-scene-provider";
import type { StudioSceneSlotDocument } from "./studio-scene-slot-contract";

/**
 * 문장→장면 조립 패널 — 문장 1개를 넣으면 슬롯 구조와 카탈로그 매칭을
 * 눈으로 확인한 뒤, 한 번의 클릭으로 빈 캔버스에 장면 초안을 올린다.
 *
 * 동선: 문장 입력 → [장면 초안 만들기] → 슬롯 미리보기(배경 쿼리·캐릭터
 * 슬롯·소품·대사·나레이션 + 슬롯별 매칭 자산/미매칭 사유) → [초안 올리기].
 * 구조화는 제공자(기본: 규칙 기반 로컬 제공자)가 맡고, 원격 AI 제공자는
 * 호스트가 provider prop으로 주입한다(연결 지점 명세는
 * studio-scene-provider.ts). 이 패널은 캔버스를 직접 만지지 않는다 —
 * onApply로 조립 결과(seeds + 이미지 배치)를 호스트에 넘긴다.
 */

const CONTROL =
  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";
const INPUT =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const POSITION_LABELS: Readonly<Record<string, string>> = {
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
  foreground: "앞쪽",
  background: "뒤쪽",
};

interface DraftState {
  readonly document: StudioSceneSlotDocument;
  readonly result: StudioSceneAssemblyResult;
  readonly providerId: string;
  readonly usedFallback: boolean;
}

export function StudioSceneAssemblyPanel({
  catalog,
  provider,
  characterNames,
  onApply,
}: {
  /** 어댑터를 거친 우리 자산 카탈로그(studio-scene-catalog-assembly). */
  readonly catalog: readonly StudioSceneCatalogEntry[];
  /** 미지정 시 규칙 기반 로컬 제공자로 구조화한다(비용 없음). */
  readonly provider?: StudioSceneStructureProvider;
  /** 프로젝트 캐릭터 명단 — 화자 귀속·캐릭터 슬롯 근거. */
  readonly characterNames?: readonly string[];
  /** [초안 올리기] — 호스트가 seeds를 El로, images를 ImageEl로 바꾼다. */
  readonly onApply: (result: StudioSceneAssemblyResult) => void | Promise<void>;
}) {
  const sentenceId = useId();
  const rosterId = useId();
  const [sentence, setSentence] = useState("");
  const [rosterText, setRosterText] = useState((characterNames ?? []).join(", "));
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busy, setBusy] = useState<"structure" | "apply" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roster = useMemo(
    () =>
      rosterText
        .split(/[,\n]/)
        .map((name) => name.trim())
        .filter(Boolean)
        .slice(0, 12),
    [rosterText]
  );

  const canStructure = sentence.trim().length > 0 && busy === null;

  async function handleStructure(): Promise<void> {
    if (!canStructure) return;
    setBusy("structure");
    setError(null);
    setNotice(null);
    try {
      const outcome = await structureSceneWithFallback(
        { sentence: sentence.trim(), characterNames: roster },
        provider
      );
      const result = assembleSceneDraft(outcome.document, catalog);
      setDraft({
        document: outcome.document,
        result,
        providerId: outcome.providerId,
        usedFallback: outcome.usedFallback,
      });
      setNotice(
        outcome.usedFallback
          ? "AI 구조화에 실패해 규칙 기반으로 초안을 만들었어요."
          : outcome.document.source === "fallback"
            ? "규칙 기반으로 장면 초안을 만들었어요. 슬롯을 확인하고 올려 주세요."
            : "장면 초안을 만들었어요. 슬롯을 확인하고 올려 주세요."
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "장면 초안을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleApply(): Promise<void> {
    if (!draft || busy !== null) return;
    setBusy("apply");
    setError(null);
    try {
      await onApply(draft.result);
      setNotice("장면 초안을 캔버스에 올렸습니다. 위치와 크기는 자유롭게 다듬어 주세요.");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "초안을 올리지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const doc = draft?.document;
  const matchBySlot = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const match of draft?.result.matches ?? []) {
      map.set(`${match.slotKind}:${match.slotIndex}`, match.entryTitle);
    }
    return map;
  }, [draft]);

  return (
    <section aria-label="문장으로 장면 만들기" className="space-y-3">
      <header>
        <h3 className="text-sm font-bold text-fg">문장으로 장면 만들기</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          장면을 설명하는 문장 하나를 쓰면 배경·캐릭터·소품·대사를 슬롯으로 나눠
          우리 자산에서 찾아 초안을 조립합니다.
        </p>
      </header>

      <div>
        <label htmlFor={sentenceId} className="sr-only">
          장면 문장
        </label>
        <textarea
          id={sentenceId}
          value={sentence}
          rows={3}
          maxLength={1000}
          className={INPUT}
          placeholder="예: 노을 진 옥상에서 지훈이 서 있었다. “조금만 더 기다릴게.” 지훈이 말했다."
          onChange={(event) => setSentence(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor={rosterId} className="block text-xs font-semibold text-fg-2">
          캐릭터 이름 (쉼표로 구분, 선택)
        </label>
        <input
          id={rosterId}
          type="text"
          value={rosterText}
          className={`${INPUT} mt-1`}
          placeholder="지훈, 민지"
          onChange={(event) => setRosterText(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button type="button" className={CONTROL} disabled={!canStructure} onClick={() => void handleStructure()}>
          {busy === "structure" ? "만드는 중…" : "장면 초안 만들기"}
        </button>
        {draft && (
          <button type="button" className={CONTROL} disabled={busy !== null} onClick={() => setDraft(null)}>
            지우기
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="text-xs text-fg-3">
          {notice}
        </p>
      )}

      {doc && draft && (
        <div className="space-y-3 rounded-xl border border-line bg-card p-3">
          <p className="text-xs text-fg-3">
            구조화: {draft.providerId}
            {doc.source === "fallback" ? " (규칙 기반)" : ""} · 요소{" "}
            {draft.result.seeds.length + draft.result.images.length}개 · 미매칭{" "}
            {draft.result.unmatched.length}개
          </p>

          <div>
            <h4 className="text-xs font-bold text-fg">배경</h4>
            {doc.background ? (
              <p className="mt-1 text-xs text-fg-2">
                “{doc.background.query}”
                {doc.background.timeOfDay ? ` · ${doc.background.timeOfDay}` : ""}
                {" → "}
                {matchBySlot.get("background:0") ?? "매칭 자산 없음 (단색 프레임)"}
              </p>
            ) : (
              <p className="mt-1 text-xs text-fg-3">문장에서 장소를 찾지 못했습니다. 단색 프레임으로 시작합니다.</p>
            )}
          </div>

          {doc.characters.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-fg">캐릭터</h4>
              <ul className="mt-1 space-y-1">
                {doc.characters.map((character, index) => (
                  <li key={`${character.label}-${index}`} className="text-xs text-fg-2">
                    {character.label}
                    {character.pose ? ` · ${character.pose}` : ""}
                    {character.expression ? ` · 표정 ${character.expression}` : ""} ·{" "}
                    {POSITION_LABELS[character.position] ?? character.position}
                    {" → "}
                    {matchBySlot.get(`character:${index}`) ?? "매칭 자산 없음"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {doc.props.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-fg">소품</h4>
              <p className="mt-1 text-xs text-fg-2">
                {doc.props
                  .map((prop, index) => `${prop.query} → ${matchBySlot.get(`prop:${index}`) ?? "없음"}`)
                  .join(" · ")}
              </p>
            </div>
          )}

          {doc.dialogues.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-fg">대사</h4>
              <ul className="mt-1 space-y-1">
                {doc.dialogues.map((dialogue, index) => (
                  <li key={index} className="text-xs text-fg-2">
                    {dialogue.speaker ? `${dialogue.speaker}: ` : ""}“{dialogue.text}”
                  </li>
                ))}
              </ul>
            </div>
          )}

          {doc.narrations.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-fg">나레이션</h4>
              <ul className="mt-1 space-y-1">
                {doc.narrations.map((narration, index) => (
                  <li key={index} className="text-xs text-fg-2">
                    {narration.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draft.result.warnings.length > 0 && (
            <ul className="space-y-0.5">
              {draft.result.warnings.map((warning, index) => (
                <li key={index} className="text-[0.7rem] text-fg-3">
                  주의: {warning}
                </li>
              ))}
            </ul>
          )}

          <button type="button" className={CONTROL} disabled={busy !== null} onClick={() => void handleApply()}>
            {busy === "apply" ? "올리는 중…" : "빈 캔버스에 초안 올리기"}
          </button>
        </div>
      )}
    </section>
  );
}
