/**
 * 캐릭터 챗 낭독 안내 문구 — 듣는 쪽 도구줄과 작가 미리듣기가 같은 문장을 쓰도록 모았다.
 * 컴포넌트 파일에서 함수를 내보내면 빠른 새로고침이 깨지므로 별도 모듈로 둔다.
 */

import type { CharacterChatSpeechFailure } from "./character-chat-speech";

export type CharacterChatTranslate = (ko: string, en: string) => string;

/** 낭독이 안 되는 이유를 사용자 문장으로 바꾼다 — 듣는 쪽 도구줄과 작가 미리듣기가 함께 쓴다. */
export function characterChatSpeechFailureText(
  t: CharacterChatTranslate,
  reason: CharacterChatSpeechFailure,
): string {
  switch (reason) {
    case "no-korean-voice":
      return t(
        "이 기기에서 한국어 음성을 찾지 못했어요. 기기 설정에서 한국어 음성을 설치하면 읽어 줄 수 있어요.",
        "No Korean voice was found on this device. Install one in your system settings to hear replies read aloud.",
      );
    case "no-local-korean-voice":
      return t(
        "기기 안에서 합성하는 한국어 음성이 없어요. ‘온라인 음성도 허용’을 켜면 브라우저의 온라인 음성으로 읽을 수 있어요.",
        "No on-device Korean voice was found. Turn on “Allow online voices” to use your browser's online voices.",
      );
    case "nothing-to-read":
      return t("읽을 수 있는 글자가 없는 메시지예요.", "There's no readable text in this message.");
    case "unsupported":
      return t(
        "이 브라우저는 음성 낭독을 지원하지 않아요.",
        "This browser doesn't support reading aloud.",
      );
    case "playback-failed":
      return t(
        "음성 낭독을 시작하지 못했어요. 듣기를 다시 눌러 주세요.",
        "Couldn't start reading aloud. Press Listen to try again.",
      );
  }
}
