/**
 * 내 이야기 화면의 문구 도우미 — 순수 함수. 컴포넌트가 useBilingual의 bt를 넘겨 쓴다.
 * 문구를 한곳에 모아 컴포넌트가 길어지지 않게 하고, 경고 코드 → 안내 문장 매핑을 테스트할 수 있게 한다.
 */

import type { MyStoryDraftWarning } from "./my-story-draft";
import type { MyStorySensitiveKind } from "./my-story-text";

export type MyStoryBilingual = (ko: string, en: string) => string;

export function myStorySensitiveKindLabel(bt: MyStoryBilingual, kind: MyStorySensitiveKind): string {
  switch (kind) {
    case "phone": return bt("전화번호", "phone number");
    case "email": return bt("이메일", "email address");
    case "resident-id": return bt("주민등록번호", "national ID number");
    case "account": return bt("계좌번호", "account number");
  }
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
    case "sensitive-text":
      return bt(
        `개인 정보처럼 보이는 숫자나 주소가 있어요(${warning.kinds.map((kind) => myStorySensitiveKindLabel(bt, kind)).join(", ")}). 꼭 필요한 게 아니라면 지우는 걸 권해요.`,
        `Something looks like personal information (${warning.kinds.map((kind) => myStorySensitiveKindLabel(bt, kind)).join(", ")}). Consider removing it unless it is needed.`,
      );
  }
}
