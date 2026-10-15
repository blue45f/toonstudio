/**
 * 내 이야기 화면의 문구 도우미 — 순수 함수. 컴포넌트가 useBilingual의 bt를 넘겨 쓴다.
 * 문구를 한곳에 모아 컴포넌트가 길어지지 않게 하고, 경고 코드 → 안내 문장 매핑을 테스트할 수 있게 한다.
 *
 * 번역 규칙: bt(ko, en)의 두 인자는 둘 다 "원문"이어야 한다. 다른 bt 호출의 결과(이미 현재 언어로
 * 풀린 조각)를 문장 안에 끼우면 언어가 바뀌거나 번역이 늦게 도착할 때 문구 키가 달라져 번역을 다시
 * 받게 된다. 그래서 조각은 ko/en 한 쌍으로 따로 조립해 각 인자에 넣는다.
 */

import type { MyStoryDraftWarning } from "./my-story-draft";
import type { MyStorySensitiveKind } from "./my-story-text";

export type MyStoryBilingual = (ko: string, en: string) => string;

/** 한국어·영어 원문 한 쌍. */
export interface MyStoryKoEn {
  readonly ko: string;
  readonly en: string;
}

const SENSITIVE_KIND_NAMES: Readonly<Record<MyStorySensitiveKind, MyStoryKoEn>> = Object.freeze({
  phone: { ko: "전화번호", en: "phone number" },
  email: { ko: "이메일", en: "email address" },
  "resident-id": { ko: "주민등록번호", en: "national ID number" },
  account: { ko: "계좌번호", en: "account number" },
});

/** 감지된 개인 정보 종류의 이름을 쉼표로 이어, 문장 안에 끼울 ko/en 한 쌍으로 돌려준다. */
export function myStorySensitiveKindNames(kinds: readonly MyStorySensitiveKind[]): MyStoryKoEn {
  return {
    ko: kinds.map((kind) => SENSITIVE_KIND_NAMES[kind].ko).join(", "),
    en: kinds.map((kind) => SENSITIVE_KIND_NAMES[kind].en).join(", "),
  };
}

function cutList(indexes: readonly number[]): string {
  return indexes.join(", ");
}

/** 초안 경고 한 건을 사용자에게 보여 줄 한 문장으로 바꾼다. */
export function myStoryWarningMessage(bt: MyStoryBilingual, warning: MyStoryDraftWarning): string {
  switch (warning.code) {
    case "blank-cuts":
      return bt(
        `빈칸으로 남은 컷이 ${warning.count}장 있어요. 질문으로 돌아가 채우거나, 스튜디오에서 직접 채워도 돼요.`,
        `${warning.count} panel(s) are still blank. Go back to fill them in, or fill them in the studio.`,
      );
    case "few-answers":
      return bt(
        `답한 질문이 ${warning.total}개 중 ${warning.answered}개예요. 조금 더 적으면 초안이 더 풍성해져요.`,
        `You answered ${warning.answered} of ${warning.total} questions. A few more answers make the draft richer.`,
      );
    case "narration-overflow":
      return bt(
        `컷 ${cutList(warning.cutIndexes)}의 나레이션이 상자 한 칸보다 길어서 여러 상자로 나눴어요. 글은 줄이지 않았어요.`,
        `The narration for panel ${cutList(warning.cutIndexes)} is longer than one box, so it was split across boxes. Nothing was cut.`,
      );
    case "balloon-overflow":
      return bt(
        `컷 ${cutList(warning.cutIndexes)}의 말풍선 대사가 권장 글자 수보다 길어요. 글은 줄이지 않고 그대로 두었어요.`,
        `The balloon line for panel ${cutList(warning.cutIndexes)} is longer than recommended. It was left as written.`,
      );
    case "sensitive-text": {
      const names = myStorySensitiveKindNames(warning.kinds);
      return bt(
        `개인 정보처럼 보이는 숫자나 주소가 있어요(${names.ko}). 꼭 필요한 게 아니라면 지우는 걸 권해요.`,
        `Something looks like personal information (${names.en}). Consider removing it unless it is needed.`,
      );
    }
  }
}
