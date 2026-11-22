import { useMemo, useState } from "react";

import type { BubbleVariant } from "../studio-assets";
import {
  DEFAULT_DEMO_VOICE_PROFILES,
  MOBILE_VIEWPORT_WIDTH_PX,
  SFX_CULTURAL_DICTIONARY,
  SPEECH_REGISTER_LABELS,
  detectCharacterVoiceMismatches,
  evaluateMobileBubbleCadence,
  extractAndTranslateSfxInText,
  lookupSfxCulturalAdaptation,
  type CharacterVoiceProfile,
  type DialogueUtteranceInput,
} from "./dialogue-voice-cadence-guard";
import type { WritingPolishDocument } from "./studio-writing-polish";

export interface StudioDialogueVoiceCadenceSectionProps {
  readonly documents: readonly WritingPolishDocument[];
  readonly voiceProfiles?: readonly CharacterVoiceProfile[];
  readonly onApplySplitDocument?: (documentId: string, splitJoinedText: string) => void;
}

const BUBBLE_VARIANT_PREVIEW_OPTIONS: readonly {
  readonly id: BubbleVariant;
  readonly labelKo: string;
}[] = [
  { id: "speech", labelKo: "일반 (18~36자, >38자 분할)" },
  { id: "thought", labelKo: "독백 (16~44자, >48자 분할)" },
  { id: "box", labelKo: "내레이션 (20~54자, >60자 분할)" },
  { id: "whisper", labelKo: "속삭임 (6~22자, >26자 분할)" },
];

const BUTTON_CLASS =
  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 축 29 · 캐릭터 말투 일관성 · 모바일 390px 말풍선 호흡 · 한국어→영/일 의성어 문화권 사전 UI (#141–#145).
 */
export function StudioDialogueVoiceCadenceSection({
  documents,
  voiceProfiles,
  onApplySplitDocument,
}: StudioDialogueVoiceCadenceSectionProps) {
  const effectiveProfiles =
    voiceProfiles && voiceProfiles.length > 0 ? voiceProfiles : DEFAULT_DEMO_VOICE_PROFILES;

  const [selectedVariantOverride, setSelectedVariantOverride] = useState<BubbleVariant>("speech");
  const [sfxQuery, setSfxQuery] = useState<string>("두근");
  const [sfxLocale, setSfxLocale] = useState<"en" | "ja">("en");

  const dialogueDocs = useMemo(
    () => documents.filter((doc) => doc.kind === "dialogue"),
    [documents],
  );

  const utterances = useMemo<readonly DialogueUtteranceInput[]>(
    () =>
      dialogueDocs.map((doc) => ({
        id: doc.id,
        documentId: doc.id,
        characterId: doc.characterId ?? effectiveProfiles[0]?.characterId ?? "",
        text: doc.text,
        bubbleVariant: doc.bubbleVariant ?? selectedVariantOverride,
        addresseeName: doc.addresseeName,
      })),
    [dialogueDocs, effectiveProfiles, selectedVariantOverride],
  );

  const voiceReport = useMemo(
    () => detectCharacterVoiceMismatches(utterances, effectiveProfiles),
    [utterances, effectiveProfiles],
  );

  const cadenceReports = useMemo(
    () =>
      utterances.map((utterance) => ({
        docLabel:
          dialogueDocs.find((doc) => doc.id === utterance.id)?.label ?? utterance.id,
        report: evaluateMobileBubbleCadence({
          utteranceId: utterance.id,
          text: utterance.text,
          bubbleVariant: utterance.bubbleVariant,
        }),
      })),
    [dialogueDocs, utterances],
  );

  const inlineSfxMatches = useMemo(
    () => documents.flatMap((doc) => extractAndTranslateSfxInText(doc.text)),
    [documents],
  );

  const lookupMatch = useMemo(() => lookupSfxCulturalAdaptation(sfxQuery), [sfxQuery]);

  return (
    <section
      aria-label="캐릭터 말투 일관성, 모바일 390px 말풍선 호흡 및 의성어 문화권 사전"
      data-testid="studio-dialogue-voice-cadence-section"
      className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-panel/60 p-3"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-xs font-bold text-fg">
          캐릭터 말투 일관성 · 모바일 {MOBILE_VIEWPORT_WIDTH_PX}px 호흡 · 의성어 사전
        </h3>
        <p className="text-xs text-fg-3">
          말투 프로파일(반말/존댓말·호칭·금지어) 이탈, 말풍선 종류별 과밀 2분할, 한→영/일 의성어 문화권 대체를 로컬에서 즉시 점검해요.
        </p>
      </header>

      {/* 1. 캐릭터 말투 일관성 검사 */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card/70 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg">
            말투 일관성 점수:{" "}
            <strong data-testid="voice-consistency-score" className="tabular-nums">
              {voiceReport.consistencyScore}점
            </strong>
          </span>
          <span className="text-[0.7rem] text-fg-3">
            검사 대사 {voiceReport.totalUtterancesChecked}건 · 불일치{" "}
            <strong data-testid="voice-mismatch-count" className="tabular-nums">
              {voiceReport.mismatchCount}
            </strong>
            건
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {effectiveProfiles.map((profile) => (
            <span
              key={profile.characterId}
              className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg-2"
            >
              {profile.name} · {SPEECH_REGISTER_LABELS[profile.speechRegister]}
            </span>
          ))}
        </div>

        {voiceReport.mismatches.length > 0 ? (
          <ul className="flex flex-col gap-1.5" data-testid="voice-mismatch-list">
            {voiceReport.mismatches.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-line bg-panel p-2 text-xs text-fg-2"
              >
                <p className="font-semibold text-fg">
                  [{item.characterName}] {item.detectedSummaryKo} → {item.expectedSummaryKo}
                </p>
                <p className="mt-0.5 text-fg-3">{item.reasonKo}</p>
                <p className="mt-0.5 text-fg">권장: {item.suggestionKo}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-fg-3" data-testid="voice-mismatch-empty">
            등록된 캐릭터 말투 프로파일과 어긋난 대사가 없어요.
          </p>
        )}
      </div>

      {/* 2. 모바일 390px 말풍선 호흡 & BubbleVariant 차등 임계치 */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card/70 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg">
            모바일 {MOBILE_VIEWPORT_WIDTH_PX}px 말풍선 호흡 검사
          </span>
          <label className="flex items-center gap-1.5 text-xs text-fg-2">
            <span>기본 말풍선 유형</span>
            <select
              aria-label="기본 말풍선 유형 선택"
              data-testid="cadence-bubble-variant-select"
              value={selectedVariantOverride}
              onChange={(event) =>
                setSelectedVariantOverride(event.currentTarget.value as BubbleVariant)
              }
              className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
            >
              {BUBBLE_VARIANT_PREVIEW_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.labelKo}
                </option>
              ))}
            </select>
          </label>
        </div>

        {cadenceReports.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="bubble-cadence-list">
            {cadenceReports.map(({ docLabel, report }) => (
              <li
                key={report.utteranceId}
                data-testid={`bubble-cadence-item-${report.utteranceId}`}
                className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <strong className="text-fg">
                    {docLabel} ({report.threshold.labelKo})
                  </strong>
                  <span className="tabular-nums text-fg-3">
                    {report.visualCharCount}자 · 약 {report.estimatedLinesAt390px}줄 (분할 기준 &gt;
                    {report.threshold.splitOverChars}자)
                  </span>
                </div>
                <p className="text-fg-2">{report.guidanceKo}</p>
                {report.splitProposal ? (
                  <div
                    className="flex flex-col gap-1 rounded-md border border-line bg-card p-2"
                    data-testid={`bubble-split-proposal-${report.utteranceId}`}
                  >
                    <p className="text-fg">1번 말풍선: {report.splitProposal.firstBubble}</p>
                    <p className="text-fg">2번 말풍선: {report.splitProposal.secondBubble}</p>
                    {onApplySplitDocument ? (
                      <div>
                        <button
                          type="button"
                          className={BUTTON_CLASS}
                          data-testid={`bubble-apply-split-${report.utteranceId}`}
                          onClick={() =>
                            onApplySplitDocument(
                              report.utteranceId,
                              `${report.splitProposal?.firstBubble}\n${report.splitProposal?.secondBubble}`,
                            )
                          }
                        >
                          2개 말풍선 줄바꿈 분할 적용
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-fg-3">대사 문서를 추가하면 모바일 390px 과밀도를 자동 계산해요.</p>
        )}
      </div>

      {/* 3. 한국어→영어/일본어 의성어·의태어 문화권 사전 */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card/70 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg">
            의성어·의태어 문화권 대체 사전 ({SFX_CULTURAL_DICTIONARY.length}종)
          </span>
          <div className="flex gap-1" role="group" aria-label="의성어 번역 언어 선택">
            <button
              type="button"
              className={BUTTON_CLASS}
              aria-pressed={sfxLocale === "en"}
              data-testid="sfx-locale-en"
              onClick={() => setSfxLocale("en")}
            >
              영어 (EN)
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              aria-pressed={sfxLocale === "ja"}
              data-testid="sfx-locale-ja"
              onClick={() => setSfxLocale("ja")}
            >
              일본어 (JA)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label="한국어 의성어 조회"
            data-testid="sfx-lookup-input"
            value={sfxQuery}
            onChange={(event) => setSfxQuery(event.currentTarget.value)}
            placeholder="예: 두근, 쿵, 철컥, 와장창"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
          />
          <div
            className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg"
            data-testid="sfx-lookup-result"
          >
            {lookupMatch
              ? `${lookupMatch.entry.korean} → ${
                  sfxLocale === "en" ? lookupMatch.entry.english : lookupMatch.entry.japanese
                } (${lookupMatch.entry.meaningKo})`
              : "사전에 등록된 표현을 입력해 보세요."}
          </div>
        </div>

        {inlineSfxMatches.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" data-testid="sfx-inline-matches">
            {inlineSfxMatches.map((item, idx) => (
              <span
                key={`${item.entry.id}-${idx}`}
                className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[0.7rem] text-fg-2"
              >
                {item.matchedKorean} → {item.english} / {item.japanese}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
