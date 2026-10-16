/**
 * 캐릭터 챗 낭독 UI — 메시지별 듣기/정지 버튼, 낭독 설정 도구줄, 스크린 리더용 상태 안내.
 *
 * 접근성 약속
 *  - 버튼 이름에 보이는 글자("듣기"/"정지")를 포함한다(WCAG 2.5.3 Label in Name). 이름이 같은
 *    버튼이 메시지마다 생기므로 캐릭터 이름을 이름에 붙여 구분한다.
 *  - 시작·종료·정지·오류는 하나의 `role="status"` 영역이 알린다. 오류일 때만 그 영역이 눈에도 보인다.
 *  - 자동 낭독과 온라인 음성은 기본 꺼짐이고, 각각 왜 꺼져 있는지 곁에 적는다.
 *  - 브라우저가 음성 합성을 지원하지 않으면 듣기 버튼을 만들지 않고 이유를 한 줄로 알린다.
 */

import { ChevronDown, Square, Volume2 } from "lucide-react";
import { useId, useState } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { CharacterChatSpeechEvent } from "./character-chat-speech";
import { characterChatSpeechFailureText, type CharacterChatTranslate } from "./character-chat-speech-copy";
import type { CharacterChatSpeech } from "./use-character-chat-speech";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const SMALL_BUTTON = cn(
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2",
  "hover:border-accent/50 hover:text-accent",
  FOCUS_RING,
);

function announcementText(t: CharacterChatTranslate, characterName: string, event: CharacterChatSpeechEvent | null): string {
  if (!event) return "";
  switch (event.type) {
    case "started":
      return t(`${characterName}의 답변을 읽어요`, `Reading ${characterName}'s reply aloud`);
    case "finished":
      return t("낭독이 끝났어요", "Finished reading");
    case "stopped":
      return t("낭독을 멈췄어요", "Stopped reading");
    case "failed":
      return characterChatSpeechFailureText(t, event.reason);
  }
}

/** 캐릭터 메시지 아래의 듣기/정지 버튼. 브라우저가 낭독을 지원하지 않으면 아무것도 그리지 않는다. */
export function CharacterMessageSpeakButton({
  speech,
  messageId,
  text,
  characterName,
}: {
  readonly speech: CharacterChatSpeech;
  readonly messageId: string;
  readonly text: string;
  readonly characterName: string;
}) {
  const t = useBilingual("characterChat");
  if (!speech.supported) return null;
  const speaking = speech.speakingMessageId === messageId;
  return (
    <button
      type="button"
      onClick={() => {
        if (speaking) speech.stop();
        else speech.speak({ id: messageId, text });
      }}
      aria-label={
        speaking
          ? t(`${characterName}의 답변 낭독 정지`, `Stop reading ${characterName}'s reply`)
          : t(`${characterName}의 답변 듣기`, `Listen to ${characterName}'s reply`)
      }
      className={cn(SMALL_BUTTON, "mt-1")}
    >
      {speaking ? <Square size={13} aria-hidden /> : <Volume2 size={14} aria-hidden />}
      {speaking ? t("정지", "Stop") : t("듣기", "Listen")}
    </button>
  );
}

function SettingRow({
  checked,
  onCheckedChange,
  label,
  hint,
}: {
  readonly checked: boolean;
  readonly onCheckedChange: (next: boolean) => void;
  readonly label: string;
  readonly hint: string;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="flex items-start gap-2">
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={labelId}
        aria-describedby={hintId}
      />
      <div className="min-w-0 pt-2.5">
        <p id={labelId} className="text-xs font-bold text-fg">
          {label}
        </p>
        <p id={hintId} className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
          {hint}
        </p>
      </div>
    </div>
  );
}

/**
 * 낭독 도구줄 — 낭독 설정 펼침, 읽는 중 정지 버튼, 상태 안내를 담는다.
 * 지원하지 않는 브라우저에서는 설정 대신 안내 한 줄만 보인다.
 */
export function CharacterChatSpeechToolbar({
  speech,
  characterName,
}: {
  readonly speech: CharacterChatSpeech;
  readonly characterName: string;
}) {
  const t = useBilingual("characterChat");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!speech.supported) {
    return (
      <p
        role="note"
        className="mb-2.5 rounded-xl border border-line bg-panel px-3 py-2 text-[0.65rem] leading-relaxed text-fg-3"
      >
        {t(
          "이 브라우저는 음성 낭독을 지원하지 않아 듣기 버튼을 숨겼어요. 대화는 글로 그대로 이어 갈 수 있고, 음성 합성을 지원하는 다른 브라우저에서는 소리로 들을 수 있어요.",
          "This browser doesn't support reading aloud, so the Listen buttons are hidden. You can keep chatting in text, and a browser with speech synthesis can read replies out loud.",
        )}
      </p>
    );
  }

  const choice = speech.choice;
  const speaking = speech.speakingMessageId !== null;
  const failed = speech.lastEvent?.type === "failed";
  const statusText = announcementText(t, characterName, speech.lastEvent);
  const voiceLine =
    choice.kind === "voice"
      ? t(
          `읽는 음성: ${choice.voice.name} · ${choice.online ? "온라인(원격)" : "이 기기 안"}`,
          `Voice: ${choice.voice.name} · ${choice.online ? "online (remote)" : "on this device"}`,
        )
      : choice.kind === "default"
        ? t("읽는 음성: 브라우저 기본 음성", "Voice: browser default")
        : characterChatSpeechFailureText(t, choice.reason);

  return (
    <div className="mb-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className={SMALL_BUTTON}
        >
          <Volume2 size={14} aria-hidden />
          {t("음성 낭독 설정", "Read-aloud settings")}
          <ChevronDown size={13} aria-hidden className={cn(open && "rotate-180")} />
        </button>
        {speaking ? (
          <button type="button" onClick={speech.stop} aria-keyshortcuts="Escape" className={SMALL_BUTTON}>
            <Square size={13} aria-hidden />
            {t("낭독 멈추기", "Stop reading")}
          </button>
        ) : null}
      </div>

      {/* 시작·종료·오류를 한 곳에서 알린다. 오류일 때만 눈에 보이고, 평소에는 스크린 리더 전용이다. */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(failed ? "mt-2 text-xs leading-relaxed text-warn" : "sr-only")}
      >
        {statusText}
      </p>

      {open ? (
        <div id={panelId} className="mt-2 space-y-1 rounded-xl border border-line bg-panel px-3 py-2">
          <SettingRow
            checked={speech.settings.autoRead}
            onCheckedChange={speech.setAutoRead}
            label={t("새 답변을 자동으로 읽기", "Read new replies automatically")}
            hint={t(
              "끄면(기본) 듣기 버튼을 누를 때만 읽어요. 스크린 리더를 쓰고 있다면 두 소리가 겹칠 수 있어요. 일부 브라우저는 직접 누르지 않은 낭독을 막을 수 있어요.",
              "Off by default — replies are read only when you press Listen. If you use a screen reader, the two voices can overlap. Some browsers block speech you didn't start yourself.",
            )}
          />
          <SettingRow
            checked={speech.settings.allowOnlineVoices}
            onCheckedChange={speech.setAllowOnlineVoices}
            label={t("온라인 음성도 허용", "Allow online voices")}
            hint={t(
              "끄면(기본) 이 기기 안에서 합성하는 음성만 써요. 브라우저가 ‘원격’으로 표시한 음성은 읽을 문장을 외부 서버로 보내 합성할 수 있어요.",
              "Off by default — only voices synthesized on this device are used. Voices your browser marks as remote may send the text to an outside server to be synthesized.",
            )}
          />
          <p className="pb-1 text-[0.65rem] leading-relaxed text-fg-3">{voiceLine}</p>
          <p className="pb-1 text-[0.65rem] leading-relaxed text-fg-3">
            {t("낭독 중에는 Esc 키로 멈출 수 있어요.", "Press Esc to stop while it is reading.")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
