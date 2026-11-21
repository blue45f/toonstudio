/**
 * 캐릭터 토크 1탭 연출 제어 & 장면 스타터 바.
 *
 * - 1탭으로 "스포일러 안전선"(10화 잠금 / 시즌1 동기화 / IF 외전)과
 *   "말투 온도"(원작 고정 / 친밀도 반응 / 보이스 운율)를 조절하며,
 *   변경된 설정은 대화 엔진 시스템 프롬프트와 게스트 미리보기에 즉시 반영된다.
 * - AI 키가 등록된 경우 장면 카드를 누르면 입력창에 장면 프롬프트를 채우고
 *   원클릭으로 바로 대화를 시작할 수 있다.
 * - AI 키 미등록 게스트는 작가 승인 설정 기반 정사 샘플 티키타카를
 *   OKLCH 말풍선으로 즉시 체험한 뒤 내 AI 키 연결로 이어갈 수 있다.
 */

import { ArrowRight, KeyRound, Play, ShieldCheck, Sparkles, Volume2 } from "lucide-react";
import { useMemo } from "react";

import { USER_AI_SETTINGS_HREF } from "@/shared/ai/user-ai-types";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  buildCharacterChatSceneStarters,
  PERSONA_TONE_OPTIONS,
  SPOILER_FENCE_OPTIONS,
  type CharacterChatSceneStarter,
  type PersonaToneId,
  type SceneStarterKind,
  type SpoilerFenceId,
} from "./character-chat-scene-starter";
import type { CharacterChatProfile } from "./character-chat-types";
import "./character-chat-scene-starter.css";

export interface CharacterChatSceneStarterBarProps {
  readonly profile: CharacterChatProfile;
  readonly ready: boolean;
  readonly spoilerFence: SpoilerFenceId;
  readonly personaTone: PersonaToneId;
  readonly activeSceneKind: SceneStarterKind | null;
  readonly onChangeSpoilerFence: (next: SpoilerFenceId) => void;
  readonly onChangePersonaTone: (next: PersonaToneId) => void;
  readonly onSelectScene: (starter: CharacterChatSceneStarter, promptText: string) => void;
  readonly onStartSceneNow: (promptText: string) => void;
}

export function CharacterChatSceneStarterBar({
  profile,
  ready,
  spoilerFence,
  personaTone,
  activeSceneKind,
  onChangeSpoilerFence,
  onChangePersonaTone,
  onSelectScene,
  onStartSceneNow,
}: CharacterChatSceneStarterBarProps) {
  const t = useBilingual("characterChatSceneStarter");

  const starters = useMemo(
    () => buildCharacterChatSceneStarters(profile, { spoilerFence, personaTone }),
    [personaTone, profile, spoilerFence],
  );

  const selectedStarter = useMemo(
    () => (activeSceneKind ? starters.find((item) => item.kind === activeSceneKind) ?? null : null),
    [activeSceneKind, starters],
  );

  const activePrompt = selectedStarter ? t(selectedStarter.promptKo, selectedStarter.promptEn) : "";
  const activePreviewReply = selectedStarter
    ? t(selectedStarter.previewReplyKo, selectedStarter.previewReplyEn)
    : "";

  return (
    <section
      data-testid="character-chat-scene-starter-bar"
      aria-label={t("대화 연출 조절 및 1탭 장면 시작", "Scene direction controls and one-tap starters")}
      className="char-scene-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="shrink-0 text-accent" aria-hidden="true" />
          <h2 className="text-xs font-bold text-fg [word-break:keep-all]">
            {t("장면 1탭 체험 · 스포일러 안전선 & 말투 온도", "One-Tap Scene Starters · Spoiler Fence & Tone")}
          </h2>
        </div>
        <span className="text-[0.7rem] font-medium text-fg-3 [word-break:keep-all]">
          {ready
            ? t("고른 설정이 다음 답변 프롬프트에 바로 반영돼요", "Applied directly to the next AI reply")
            : t("AI 키 없이도 정사 미리보기 대화를 먼저 체험해 보세요", "Preview canon banter before adding an AI key")}
        </span>
      </div>

      {/* 1탭 연출 조절: 스포일러 안전선 + 말투 온도 */}
      <div className="mt-2.5 flex flex-col gap-2">
        <div
          role="group"
          aria-label={t("스포일러 안전선 선택", "Spoiler safety line")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-fg-2 [word-break:keep-all]">
            <ShieldCheck size={13} className="shrink-0 text-accent" aria-hidden="true" />
            {t("스포일러 안전선", "Spoiler line")}
          </span>
          {SPOILER_FENCE_OPTIONS.map((option) => {
            const pressed = option.id === spoilerFence;
            return (
              <button
                key={option.id}
                type="button"
                data-testid={`scene-starter-fence-${option.id}`}
                data-tone={option.tone}
                aria-pressed={pressed}
                onClick={() => onChangeSpoilerFence(option.id)}
                className="char-scene-pill inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold [word-break:keep-all]"
              >
                <span aria-hidden="true" className="char-scene-dot" />
                <span>{t(option.shortKo, option.shortEn)}</span>
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label={t("캐릭터 말투 온도 선택", "Character voice tone")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-fg-2 [word-break:keep-all]">
            <Volume2 size={13} className="shrink-0 text-cool" aria-hidden="true" />
            {t("말투 온도", "Voice warmth")}
          </span>
          {PERSONA_TONE_OPTIONS.map((option) => {
            const pressed = option.id === personaTone;
            return (
              <button
                key={option.id}
                type="button"
                data-testid={`scene-starter-tone-${option.id}`}
                data-tone={option.tone}
                aria-pressed={pressed}
                onClick={() => onChangePersonaTone(option.id)}
                className="char-scene-pill inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold [word-break:keep-all]"
              >
                <span aria-hidden="true" className="char-scene-dot" />
                <span>{t(option.shortKo, option.shortEn)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3종 원클릭 장면 스타터 카드 */}
      <div
        role="group"
        aria-label={t("대화 시작 장면 선택", "Choose a starting scene")}
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {starters.map((starter) => {
          const pressed = starter.kind === activeSceneKind;
          const promptText = t(starter.promptKo, starter.promptEn);
          return (
            <button
              key={starter.kind}
              type="button"
              data-testid={`scene-starter-card-${starter.kind}`}
              data-tone={starter.tone}
              aria-pressed={pressed}
              onClick={() => onSelectScene(starter, promptText)}
              className="char-scene-card flex min-h-11 flex-col items-start gap-1 rounded-xl p-3 text-left [word-break:keep-all]"
            >
              <span className="char-scene-badge inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold tabular-nums">
                {t(starter.badgeKo, starter.badgeEn)}
              </span>
              <span className="text-xs font-bold text-fg">
                {t(starter.titleKo, starter.titleEn)}
              </span>
              <span className="line-clamp-2 text-[0.72rem] leading-snug text-fg-2">
                {promptText}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 장면 피드백: 키 등록 사용자 -> 1탭 시작 / 미등록 게스트 -> 정사 티키타카 미리보기 */}
      {selectedStarter && ready ? (
        <div
          data-testid="scene-starter-ready-action"
          aria-live="polite"
          className="char-scene-preview mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5"
          data-tone={selectedStarter.tone}
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-fg [word-break:keep-all]">
              {t("장면 프롬프트를 입력창에 채웠어요", "Scene prompt loaded into the message box")}
            </p>
            <p className="mt-0.5 text-[0.7rem] text-fg-2 [word-break:keep-all]">
              {t(selectedStarter.canonBasisKo, selectedStarter.canonBasisEn)}
            </p>
          </div>
          <button
            type="button"
            data-testid="scene-starter-instant-trigger"
            onClick={() => onStartSceneNow(activePrompt)}
            className="char-scene-cta inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold [word-break:keep-all]"
          >
            <Play size={13} aria-hidden="true" />
            <span>{t("바로 대화 시작", "Start scene now")}</span>
          </button>
        </div>
      ) : null}

      {selectedStarter && !ready ? (
        <div
          data-testid="scene-starter-guest-preview"
          data-tone={selectedStarter.tone}
          aria-live="polite"
          className="char-scene-preview mt-3 rounded-2xl p-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.7rem] font-bold text-accent [word-break:keep-all]">
              {t("정사 샘플 미리보기 · 작가 승인 설정 기반", "Canon Sample Preview · Author-Approved")}
            </span>
            <span className="text-[0.68rem] font-medium text-fg-3 [word-break:keep-all]">
              {t(selectedStarter.canonBasisKo, selectedStarter.canonBasisEn)}
            </span>
          </div>

          <div className="mt-2.5 flex flex-col gap-2">
            <div className="flex justify-end">
              <p className="char-scene-bubble-fan max-w-[90%] rounded-2xl rounded-br-md px-3 py-2 text-xs leading-relaxed [word-break:keep-all]">
                {activePrompt}
              </p>
            </div>
            <div className="flex justify-start">
              <div className="char-scene-bubble-char max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <p className="text-[0.68rem] font-bold text-fg-2">{profile.characterName}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg [word-break:keep-all]">
                  {activePreviewReply}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2.5">
            <p className="min-w-0 flex-1 text-[0.72rem] leading-snug text-fg-2 [word-break:keep-all]">
              {t(
                "이 장면에서 자유롭게 대화를 이어 가려면 내 AI 키를 한 번만 연결해 주세요.",
                "Connect your AI key once to continue this scene freely in your own words.",
              )}
            </p>
            <Link
              href={USER_AI_SETTINGS_HREF}
              data-testid="scene-starter-connect-key-cta"
              className="char-scene-cta inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold [word-break:keep-all]"
            >
              <KeyRound size={13} aria-hidden="true" />
              <span>{t("내 AI 키 연결해서 이어 말하기", "Connect my AI key to keep talking")}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
