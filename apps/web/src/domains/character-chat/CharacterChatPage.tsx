/**
 * 캐릭터 토크 — 팬 채팅 페이지 (`/character-chat`, 파일럿).
 *
 * 작가가 챗 공개를 켠(opt-in) 캐릭터와 대화한다. 대화의 근거는 작가가 승인한
 * 캐논 프로필(성격·말투·세계관·금지 주제)뿐이다. 엔진은 어댑터 뒤에 있다 —
 * 파일럿에서는 독자·작가가 등록한 자기 AI 키(BYOK)로 동작하고, 키가 없으면
 * "준비 중/키 등록 안내"를 보여준다. 캐릭터 목록과 인사말은 로그인 없이도
 * 볼 수 있다.
 */

import { KeyRound, MessageCircle, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { USER_AI_SETTINGS_HREF } from "@/shared/ai/user-ai-types";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { CharacterAvatar, CharacterChatThread } from "./CharacterChatThread";
import {
  findPublicProfileForWork,
  selectPublicCharacterChatProfiles,
} from "./character-chat-profile";
import { useCharacterChatHydrated, useCharacterChatStore } from "./character-chat-store";
import { useCharacterChatEngine } from "./use-character-chat-engine";

type SpoilerFenceId = "ep10-canon-lock" | "season1-finale-sync" | "au-whatif-sandbox";
type PersonaToneId = "canon-dialogue-strict" | "affection-stage-reactive" | "voice-tts-prosody";

const SPOILER_FENCE_OPTIONS: readonly {
  readonly id: SpoilerFenceId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "ep10-canon-lock",
    ko: "10화 정사 스포일러 잠금",
    en: "Ep.10 Canon Spoiler Lock",
    detailKo: "10화 이전 공개 설정만 로어북에 주입하고 이후 전개 복선은 차단합니다.",
    detailEn: "Injects lorebook facts up to Episode 10 only and blocks later plot twists.",
  },
  {
    id: "season1-finale-sync",
    ko: "시즌1 완결 기억 동기화",
    en: "Season 1 Finale Memory Sync",
    detailKo: "시즌1 완결 시점의 관계 변화와 사건 기억을 모두 열어 깊은 대화를 지원합니다.",
    detailEn: "Unlocks full Season 1 finale relationship shifts and episodic memories.",
  },
  {
    id: "au-whatif-sandbox",
    ko: "IF 외전 멀티버스 샌드박스",
    en: "AU What-If Sandbox",
    detailKo: "본편 정사를 해치지 않는 독립 IF 세계관 분기에서 자유로운 상황극을 허용합니다.",
    detailEn: "Allows alternate-universe roleplay in an isolated branch without mutating canon.",
  },
];

const PERSONA_TONE_OPTIONS: readonly {
  readonly id: PersonaToneId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "canon-dialogue-strict",
    ko: "원작 대사 말투 고정",
    en: "Strict Canon Dialogue",
    detailKo: "작가가 승인한 어미·호칭·금칙어 가드레일을 엄격히 유지합니다.",
    detailEn: "Strictly enforces author-approved honorifics, speech endings, and taboo filters.",
  },
  {
    id: "affection-stage-reactive",
    ko: "호감도 단계별 반응",
    en: "Affection-Stage Reactive",
    detailKo: "누적 대화 친밀도에 따라 경계심에서 신뢰 단계로 말투 온도를 전환합니다.",
    detailEn: "Gradually shifts persona warmth from guarded to trusted based on chat affinity.",
  },
  {
    id: "voice-tts-prosody",
    ko: "보이스 TTS 감정 운율",
    en: "Voice TTS Prosody",
    detailKo: "캐릭터 보이스 낭독을 위한 호흡·감정 태그와 짧은 호흡 문장 구조를 최적화합니다.",
    detailEn: "Optimizes sentence cadence and emotion tags for expressive character TTS playback.",
  },
];

export function CharacterChatPage() {
  const t = useBilingual("characterChat");
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const { engine, ready } = useCharacterChatEngine();
  const hydrated = useCharacterChatHydrated();
  const [searchParams] = useSearchParams();
  const profiles = useCharacterChatStore((state) => state.profiles);
  const [characterQuery, setCharacterQuery] = useState("");
  const [spoilerFence, setSpoilerFence] = useState<SpoilerFenceId>("ep10-canon-lock");
  const [personaTone, setPersonaTone] = useState<PersonaToneId>("canon-dialogue-strict");

  const activeFence = SPOILER_FENCE_OPTIONS.find((item) => item.id === spoilerFence) ?? SPOILER_FENCE_OPTIONS[0];
  const activeTone = PERSONA_TONE_OPTIONS.find((item) => item.id === personaTone) ?? PERSONA_TONE_OPTIONS[0];

  const publicProfiles = useMemo(
    () => selectPublicCharacterChatProfiles(profiles),
    [profiles],
  );

  const filteredProfiles = useMemo(() => {
    const q = characterQuery.trim().toLowerCase();
    if (!q) return publicProfiles;
    return publicProfiles.filter((profile) =>
      [profile.characterName, profile.workTitle, profile.authorName, profile.description]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [publicProfiles, characterQuery]);

  const workSlugParam = searchParams.get("work");
  const characterParam = searchParams.get("character");
  const workMatched = useMemo(
    () => findPublicProfileForWork(profiles, workSlugParam),
    [profiles, workSlugParam],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedProfile = useMemo(() => {
    const bySelection = selectedId
      ? publicProfiles.find((profile) => profile.id === selectedId)
      : undefined;
    const byParam = characterParam
      ? publicProfiles.find((profile) => profile.id === characterParam)
      : undefined;
    // 직접 고른 캐릭터가 진입 파라미터보다 우선한다(파라미터는 첫 진입용).
    return bySelection ?? byParam ?? workMatched ?? publicProfiles[0] ?? null;
  }, [characterParam, publicProfiles, selectedId, workMatched]);

  return (
    <Container size="wide" className="py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">
            <Sparkles size={13} className="mr-1 inline" aria-hidden />
            {t("파일럿", "Pilot")}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-fg">
            {t("캐릭터 토크", "Character Talk")}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-2">
            {t(
              "작가가 승인한 설정 그대로, 작품 속 캐릭터와 대화해 보세요. 작가가 금지한 주제는 대화에 나오지 않아요.",
              "Chat with characters exactly as their authors approved. Topics the author marked off-limits never come up.",
            )}
          </p>
        </div>
        <Link
          href="/character-chat/manage"
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
        >
          <MessageCircle size={14} aria-hidden />
          {t("작가이신가요? 캐릭터 챗 열기", "Are you an author? Open a character chat")}
        </Link>
      </header>

      <section
        data-testid="character-chat-rea-lorebook-bar"
        aria-label={pickLang("캐릭터 로어북·페르소나 제어 워크벤치", "Character lorebook and persona control workbench")}
        className="mb-5 rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-accent">
            {pickLang("REA 로어북 스포일러 펜스 · 페르소나 톤 제어", "REA Lorebook Spoiler Fence & Persona Tone Control")}
          </span>
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-3">
            Character.AI · Zeta · Wrtn · SillyTavern Lorebook
          </span>
        </div>
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("회차 스포일러 펜스", "Episode spoiler fence")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("스포일러 펜스", "Spoiler Fence")}
          </span>
          {SPOILER_FENCE_OPTIONS.map((item) => {
            const active = item.id === spoilerFence;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`char-chat-rea-fence-${item.id}`}
                aria-pressed={active}
                onClick={() => setSpoilerFence(item.id)}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("페르소나 발화 톤", "Persona speech tone")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("페르소나 톤", "Persona Tone")}
          </span>
          {PERSONA_TONE_OPTIONS.map((item) => {
            const active = item.id === personaTone;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`char-chat-rea-tone-${item.id}`}
                aria-pressed={active}
                onClick={() => setPersonaTone(item.id)}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <p
          data-testid="character-chat-rea-status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg"
        >
          {pickLang(
            `${activeFence.ko} + ${activeTone.ko} · ${activeFence.detailKo} (${activeTone.detailKo})`,
            `${activeFence.en} + ${activeTone.en} · ${activeFence.detailEn} (${activeTone.detailEn})`,
          )}
        </p>
      </section>

      {!ready ? (
        <section
          aria-label={t("AI 키 등록 안내", "AI key setup notice")}
          className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
            <KeyRound size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-fg">
              {t("지금은 파일럿 기간이에요", "We're in pilot for now")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
              {t(
                "캐릭터 토크는 등록한 AI 키로 동작해요. 키를 등록하면 바로 대화를 시작할 수 있고, 등록 전에는 캐릭터와 인사말까지만 볼 수 있어요.",
                "Character Talk runs on your own registered AI key. Register a key to start chatting — until then, you can still meet the characters and read their greetings.",
              )}
            </p>
          </div>
          <Link
            href={USER_AI_SETTINGS_HREF}
            className={buttonClass({ size: "sm", className: "min-h-11" })}
          >
            {t("AI 키 등록하러 가기", "Register an AI key")}
          </Link>
        </section>
      ) : null}

      {hydrated && workSlugParam && !workMatched ? (
        <p role="status" className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 text-xs text-fg-2">
          {t(
            "이 작품은 아직 캐릭터 챗을 열지 않았어요. 대신 지금 열린 캐릭터들과 대화할 수 있어요.",
            "This work hasn't opened a character chat yet. You can still talk with the characters below.",
          )}
        </p>
      ) : null}

      {publicProfiles.length === 0 ? (
        <ActionableEmptyState
          art="generic"
          icon={MessageCircle}
          title={t("아직 열린 캐릭터 챗이 없어요", "No character chats are open yet")}
          description={t(
            "작가가 캐릭터 챗을 공개하면 여기에 나타나요. 작가라면 먼저 내 캐릭터부터 열어 보세요.",
            "When an author opens a character chat, it shows up here. If you're an author, try opening your own character first.",
          )}
          primary={{ href: "/character-chat/manage", label: t("캐릭터 챗 관리로 가기", "Go to chat management") }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <section aria-label={t("대화할 캐릭터", "Characters to chat with")}>
            <label className="mb-2.5 flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2 focus-within:border-accent">
              <Search size={14} className="shrink-0 text-fg-3" aria-hidden />
              <span className="sr-only">{t("대화할 캐릭터 검색", "Search characters")}</span>
              <input
                type="search"
                value={characterQuery}
                onChange={(event) => setCharacterQuery(event.target.value)}
                placeholder={t("캐릭터·작품명 검색…", "Search character or title…")}
                aria-label={t("대화할 캐릭터 검색", "Search characters")}
                className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3"
              />
            </label>
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {filteredProfiles.map((profile) => {
                const active = profile.id === selectedProfile?.id;
                return (
                  <li key={profile.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => setSelectedId(profile.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-56 items-center gap-3 rounded-2xl border p-3 text-left lg:w-full",
                        active
                          ? "border-accent bg-accent-soft/50"
                          : "border-line bg-card hover:border-accent/40",
                      )}
                    >
                      <CharacterAvatar profile={profile} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <strong className="truncate text-sm text-fg">{profile.characterName}</strong>
                          {profile.isDemo ? (
                            <span className="rounded-full bg-fg-3/10 px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-3">
                              {t("데모", "Demo")}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-fg-3">
                          {profile.workTitle} · {profile.authorName}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-fg-2">
                          {profile.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {selectedProfile ? (
            <section
              aria-label={t(`${selectedProfile.characterName}와의 대화`, `Chat with ${selectedProfile.characterName}`)}
              className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel"
            >
              <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-3">
                <CharacterAvatar profile={selectedProfile} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fg">
                    {selectedProfile.characterName}
                    <span className="ml-2 text-xs font-medium text-fg-3">{selectedProfile.workTitle}</span>
                  </p>
                  <p className="truncate text-xs text-fg-3">
                    {t("작가가 승인한 설정으로 대화해요", "Chatting with author-approved canon")}
                  </p>
                </div>
                {selectedProfile.workSlug ? (
                  <Link
                    href={`/title/${encodeURIComponent(selectedProfile.workSlug)}`}
                    className="text-xs font-semibold text-accent hover:text-accent-2"
                  >
                    {t("작품 보러 가기", "View work")}
                  </Link>
                ) : null}
              </div>
              <details className="border-b border-line bg-card/60 px-4 py-2 text-xs text-fg-2">
                <summary className="cursor-pointer font-semibold text-fg-2">
                  {t("캐릭터 성격·말투·금지 주제 안내 보기", "View character personality, tone & off-limits topics")}
                </summary>
                <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="font-bold text-fg">{t("성격", "Personality")}</dt>
                    <dd className="text-fg-2">{selectedProfile.personality}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-fg">{t("말투", "Speech style")}</dt>
                    <dd className="text-fg-2">{selectedProfile.speechStyle}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-fg">{t("금지 주제", "Off-limits topics")}</dt>
                    <dd className="text-fg-2">
                      {selectedProfile.forbiddenTopics.length > 0
                        ? selectedProfile.forbiddenTopics.join(", ")
                        : t("지정된 금지 주제 없음", "None")}
                    </dd>
                  </div>
                </dl>
              </details>
              <CharacterChatThread profile={selectedProfile} engine={engine} ready={ready} />
            </section>
          ) : null}
        </div>
      )}
    </Container>
  );
}
