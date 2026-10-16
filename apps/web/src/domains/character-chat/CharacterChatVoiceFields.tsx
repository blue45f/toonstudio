/**
 * 작가용 낭독 선호 입력 — 캐릭터 챗 프로필 편집 폼 안의 "음성 낭독(선택)" 묶음.
 *
 * 여기서 정하는 것은 "어떤 느낌으로 읽을지"(음성 선택·음색 힌트·속도·높낮이)뿐이고, 모두
 * 프로필의 `voice`로 저장된다. 음성 파일은 만들지도 저장하지도 않는다 — 소리는 듣는 사람 기기의
 * 브라우저 내장 음성이 그 자리에서 낸다. 속도·높낮이는 알아듣기 어려운 극단값을 막으려고
 * `character-chat-voice.ts`의 범위로 제한한다.
 *
 * 음성 목록은 이 기기에 설치된 음성이다. 팬의 기기에 같은 음성이 없으면 음색 힌트로 순위를 매긴
 * 한국어 음성으로 대신 읽는다는 점을 폼에서 먼저 알린다.
 */

import { Square, Volume2 } from "lucide-react";
import { useId, useMemo } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { rankNaturalKoreanVoices, type NaturalVoiceGender } from "@/shared/lib/natural-browser-speech";
import { cn } from "@/shared/lib/utils";

import { characterChatSpeechFailureText } from "./character-chat-speech-copy";
import type { CharacterChatVoicePreference } from "./character-chat-types";
import {
  CHARACTER_CHAT_VOICE_PITCH_MAX,
  CHARACTER_CHAT_VOICE_PITCH_MIN,
  CHARACTER_CHAT_VOICE_RATE_MAX,
  CHARACTER_CHAT_VOICE_RATE_MIN,
  CHARACTER_CHAT_VOICE_STEP,
} from "./character-chat-voice";
import { useCharacterChatSpeech } from "./use-character-chat-speech";

/** 미리듣기 전용 재생 대상 id — 실제 프로필·메시지 id와 겹치지 않는 고정값. */
const PREVIEW_MESSAGE_ID = "character-chat-voice-preview";
const PREVIEW_PROFILE_ID = "character-chat-voice-preview-profile";

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg focus:border-accent focus:outline-none";

const GENDER_OPTIONS: readonly NaturalVoiceGender[] = ["neutral", "female", "male"];

function formatMultiplier(value: number): string {
  return value.toFixed(2);
}

export function CharacterChatVoiceFields({
  value,
  onChange,
  previewText,
}: {
  readonly value: CharacterChatVoicePreference;
  readonly onChange: (next: CharacterChatVoicePreference) => void;
  /** 미리듣기로 읽을 문장(첫 인사말이 있으면 그것). */
  readonly previewText: string;
}) {
  const t = useBilingual("characterChat");
  const speech = useCharacterChatSpeech({ id: PREVIEW_PROFILE_ID, voice: value });
  const voiceId = useId();
  const genderId = useId();
  const rateId = useId();
  const pitchId = useId();
  const onlineLabelId = useId();
  const onlineHintId = useId();

  const allowOnline = speech.settings.allowOnlineVoices;
  const candidates = useMemo(
    () => rankNaturalKoreanVoices(speech.voices, { preferLocal: true, localOnly: !allowOnline }),
    [speech.voices, allowOnline],
  );
  const savedVoiceMissing =
    value.voiceURI !== null
    && !candidates.some((voice) => (voice.voiceURI || voice.name) === value.voiceURI);
  // 목록에서 빠진 이유를 가른다: 이 기기에 아예 없는 음성인지, 있지만 온라인 음성이라 숨겨졌는지.
  const savedVoiceHiddenOnline =
    savedVoiceMissing
    && speech.voices.some((voice) => (voice.voiceURI || voice.name) === value.voiceURI);

  const previewing = speech.speakingMessageId === PREVIEW_MESSAGE_ID;
  const failed = speech.lastEvent?.type === "failed" ? speech.lastEvent : null;
  const genderLabel: Record<NaturalVoiceGender, string> = {
    neutral: t("자동 선택", "Automatic"),
    female: t("여성 음색 우선", "Prefer a female voice"),
    male: t("남성 음색 우선", "Prefer a male voice"),
  };

  return (
    <fieldset className="rounded-xl border border-line p-4">
      <legend className="px-1 text-xs font-bold text-fg-2">
        {t("음성 낭독 (선택)", "Read-aloud voice (optional)")}
      </legend>
      <p className="mb-3 text-[0.65rem] leading-relaxed text-fg-3">
        {t(
          "팬이 ‘듣기’를 누르면 브라우저 내장 음성이 이 캐릭터의 답변을 읽어요. 음성 파일은 만들지도 저장하지도 않아요. 팬의 기기에 같은 음성이 없으면 음색 힌트에 맞는 다른 한국어 음성으로 읽어요.",
          "When a fan presses Listen, their browser's built-in voice reads this character's replies. No audio file is created or stored. If a fan's device doesn't have the same voice, a Korean voice that matches the tone hint is used instead.",
        )}
      </p>
      {!speech.supported ? (
        <p
          role="note"
          className="mb-3 rounded-lg border border-line bg-panel px-3 py-2 text-[0.65rem] leading-relaxed text-fg-3"
        >
          {t(
            "이 브라우저는 음성 낭독을 지원하지 않아 음성 목록을 불러오거나 미리 들을 수 없어요. 아래 값은 그대로 저장되고, 낭독을 지원하는 기기의 팬 화면에서 쓰여요.",
            "This browser doesn't support reading aloud, so the voice list and preview aren't available. The values below are still saved and used on fans' devices that support it.",
          )}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={voiceId} className="mb-1 block text-xs font-bold text-fg-2">
            {t("읽는 음성", "Voice")}
          </label>
          <select
            id={voiceId}
            value={value.voiceURI ?? ""}
            disabled={!speech.supported}
            onChange={(event) => onChange({ ...value, voiceURI: event.target.value || null })}
            className={cn(FIELD_CLASS, "disabled:opacity-60")}
          >
            <option value="">
              {t("자동 — 이 기기에서 가장 자연스러운 한국어 음성", "Auto — the most natural Korean voice here")}
            </option>
            {savedVoiceMissing && value.voiceURI !== null ? (
              <option value={value.voiceURI}>
                {savedVoiceHiddenOnline
                  ? t("저장된 음성 (온라인 음성이라 숨겨 둠)", "Saved voice (online voice, hidden)")
                  : t("저장된 음성 (이 기기에는 없음)", "Saved voice (not on this device)")}
              </option>
            ) : null}
            {candidates.map((voice) => (
              <option key={voice.voiceURI || voice.name} value={voice.voiceURI || voice.name}>
                {voice.name} · {voice.localService === true ? t("이 기기 안", "on-device") : t("온라인(원격)", "online (remote)")}
              </option>
            ))}
          </select>
          {speech.supported && candidates.length === 0 ? (
            <span className="mt-1 block text-[0.65rem] leading-relaxed text-fg-3">
              {speech.voices.length === 0
                ? t("음성 목록을 불러오는 중이거나, 이 기기에 설치된 음성이 없어요.", "The voice list is still loading, or this device has no voices installed.")
                : t("보여 줄 한국어 음성이 없어요. 아래 ‘온라인 음성도 보기’를 켜면 더 나올 수 있어요.", "No Korean voices to show. Turn on “Show online voices” below to see more.")}
            </span>
          ) : null}
        </div>

        <div>
          <label htmlFor={genderId} className="mb-1 block text-xs font-bold text-fg-2">
            {t("음색 힌트", "Tone hint")}
          </label>
          <select
            id={genderId}
            value={value.gender}
            onChange={(event) => {
              const next = GENDER_OPTIONS.find((option) => option === event.target.value) ?? "neutral";
              onChange({ ...value, gender: next });
            }}
            className={FIELD_CLASS}
          >
            {GENDER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {genderLabel[option]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[0.65rem] leading-relaxed text-fg-3">
            {t(
              "고른 음성이 팬 기기에 없을 때, 비슷한 음색의 음성을 고르는 데만 쓰여요.",
              "Used only to pick a similar voice when the chosen one isn't on a fan's device.",
            )}
          </span>
        </div>

        <div>
          <label htmlFor={rateId} className="mb-1 flex items-baseline justify-between gap-2 text-xs font-bold text-fg-2">
            <span>{t("말하는 속도", "Speaking speed")}</span>
            {/* 값은 슬라이더의 aria-valuetext가 읽어 주므로, 눈에 보이는 표시는 중복 낭독을 피하려고 숨긴다. */}
            <span aria-hidden="true" className="tabular-nums text-fg-3">
              {formatMultiplier(value.rate)}×
            </span>
          </label>
          <input
            id={rateId}
            type="range"
            min={CHARACTER_CHAT_VOICE_RATE_MIN}
            max={CHARACTER_CHAT_VOICE_RATE_MAX}
            step={CHARACTER_CHAT_VOICE_STEP}
            value={value.rate}
            aria-valuetext={`${formatMultiplier(value.rate)}×`}
            onChange={(event) => onChange({ ...value, rate: Number(event.target.value) })}
            className="min-h-11 w-full accent-[var(--color-accent)]"
          />
        </div>

        <div>
          <label htmlFor={pitchId} className="mb-1 flex items-baseline justify-between gap-2 text-xs font-bold text-fg-2">
            <span>{t("목소리 높낮이", "Voice pitch")}</span>
            <span aria-hidden="true" className="tabular-nums text-fg-3">
              {formatMultiplier(value.pitch)}×
            </span>
          </label>
          <input
            id={pitchId}
            type="range"
            min={CHARACTER_CHAT_VOICE_PITCH_MIN}
            max={CHARACTER_CHAT_VOICE_PITCH_MAX}
            step={CHARACTER_CHAT_VOICE_STEP}
            value={value.pitch}
            aria-valuetext={`${formatMultiplier(value.pitch)}×`}
            onChange={(event) => onChange({ ...value, pitch: Number(event.target.value) })}
            className="min-h-11 w-full accent-[var(--color-accent)]"
          />
        </div>
      </div>
      <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
        {t(
          `알아듣기 어려운 소리가 되지 않도록 속도는 ${formatMultiplier(CHARACTER_CHAT_VOICE_RATE_MIN)}~${formatMultiplier(CHARACTER_CHAT_VOICE_RATE_MAX)}배, 높낮이는 ${formatMultiplier(CHARACTER_CHAT_VOICE_PITCH_MIN)}~${formatMultiplier(CHARACTER_CHAT_VOICE_PITCH_MAX)}배로 제한돼요.`,
          `To keep the voice intelligible, speed is limited to ${formatMultiplier(CHARACTER_CHAT_VOICE_RATE_MIN)}–${formatMultiplier(CHARACTER_CHAT_VOICE_RATE_MAX)}× and pitch to ${formatMultiplier(CHARACTER_CHAT_VOICE_PITCH_MIN)}–${formatMultiplier(CHARACTER_CHAT_VOICE_PITCH_MAX)}×.`,
        )}
      </p>

      {speech.supported ? (
        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => {
              if (previewing) speech.stop();
              else speech.speak({ id: PREVIEW_MESSAGE_ID, text: previewText });
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {previewing ? <Square size={13} aria-hidden /> : <Volume2 size={14} aria-hidden />}
            {previewing ? t("미리듣기 정지", "Stop preview") : t("미리 듣기", "Preview")}
          </button>
          <div className="flex items-start gap-2">
            <Switch
              checked={allowOnline}
              onCheckedChange={speech.setAllowOnlineVoices}
              aria-labelledby={onlineLabelId}
              aria-describedby={onlineHintId}
            />
            <div className="min-w-0 pt-2.5">
              <p id={onlineLabelId} className="text-xs font-bold text-fg">
                {t("온라인 음성도 보기", "Show online voices")}
              </p>
              <p id={onlineHintId} className="mt-0.5 max-w-sm text-[0.65rem] leading-relaxed text-fg-3">
                {t(
                  "끄면(기본) 이 기기 안에서 합성하는 음성만 보여요. 브라우저가 ‘원격’으로 표시한 음성은 읽을 문장을 외부 서버로 보낼 수 있고, 이 선택은 이 기기에만 적용돼요.",
                  "Off by default — only voices synthesized on this device are listed. Voices your browser marks as remote may send the text to an outside server. This choice applies to this device only.",
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(failed ? "mt-2 text-xs leading-relaxed text-warn" : "sr-only")}
      >
        {failed ? characterChatSpeechFailureText(t, failed.reason) : ""}
      </p>
    </fieldset>
  );
}
