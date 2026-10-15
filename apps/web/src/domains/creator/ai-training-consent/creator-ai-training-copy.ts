/**
 * 작품·회차 AI 학습 허용 표기의 사용자 문구(한·영).
 *
 * 표기는 작가의 의사 표시이며 라이선스나 계약이 아니다. 법적 효력의 유무를 단정하는 문구를 쓰지
 * 않고, "별도 계약을 대체하지 않는다"와 "ToonStudio는 외부 AI 사업자가 따르도록 강제할 수 없다"는
 * 서비스 한계만 정직하게 적는다. 같은 문구를 편집 화면·독자 화면·게시 영수증이 함께 쓰도록 이
 * 모듈 하나가 소유한다.
 *
 * 문구는 호출 시점의 활성 로캘로 풀리므로 렌더에서 부르는 컴포넌트는 `useBilingualI18nRevision()`을
 * 함께 호출해 로캘·번역 번들 변경에 다시 그려져야 한다.
 */
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import type { CreatorCommunityAiTrainingConsent } from "@/shared/lib/creator-community-publication-contract";

const SCOPE = "CreatorAiTrainingConsent";

function bi(ko: string, en: string): string {
  return translateBilingualValueForActiveLocale(SCOPE, ko, en);
}

/** 선택지 표시 순서. 보수적인 값(미지정·불허)을 먼저, 허용은 마지막에 둔다. */
export const CREATOR_AI_TRAINING_OPTION_ORDER = [
  "unspecified",
  "prohibited",
  "allowed",
] as const satisfies readonly CreatorCommunityAiTrainingConsent[];

/** 표기가 기록되는 곳. 변경 확인 문구가 "독자 화면"인지 "패키지 manifest"인지 갈린다. */
export type CreatorAiTrainingContext = "publication" | "package";

export interface CreatorAiTrainingConsentCopy {
  /** 짧은 값 이름. 요약 행과 선택지 제목에 쓴다. */
  readonly valueLabel: string;
  /** 독자 화면 배지 문구. */
  readonly badgeLabel: string;
  /** 독자 화면 설명 한 문장. */
  readonly readerNote: string;
}

export function getCreatorAiTrainingCopy(
  consent: CreatorCommunityAiTrainingConsent,
): CreatorAiTrainingConsentCopy {
  switch (consent) {
    case "allowed":
      return {
        valueLabel: bi("허용", "Allowed"),
        badgeLabel: bi("AI 학습 허용 표기", "AI training allowed (creator's label)"),
        readerNote: bi(
          "작가가 AI 학습에 써도 좋다고 표시했습니다.",
          "The creator has said this work may be used for AI training.",
        ),
      };
    case "prohibited":
      return {
        valueLabel: bi("불허", "Not allowed"),
        badgeLabel: bi("AI 학습 불허 표기", "AI training not allowed (creator's label)"),
        readerNote: bi(
          "작가가 AI 학습에 쓰지 말아 달라고 표시했습니다.",
          "The creator has asked for this work not to be used for AI training.",
        ),
      };
    case "unspecified":
      return {
        valueLabel: bi("미지정", "Not specified"),
        badgeLabel: bi("AI 학습 미지정", "AI training not specified"),
        readerNote: bi(
          "작가가 AI 학습 허용 여부를 밝히지 않았습니다. 허용으로 해석하지 마세요.",
          "The creator has not said whether AI training is allowed. Do not read this as permission.",
        ),
      };
  }
}

/** 편집 화면 선택지 설명. 미지정은 값이 어디에 보이는지가 문맥마다 달라 문맥별로 쓴다. */
export function getCreatorAiTrainingOptionDescription(
  consent: CreatorCommunityAiTrainingConsent,
  context: CreatorAiTrainingContext = "publication",
): string {
  switch (consent) {
    case "allowed":
      return bi(
        "AI 학습에 써도 좋다는 뜻을 표시합니다.",
        "Shows that you are fine with this work being used for AI training.",
      );
    case "prohibited":
      return bi(
        "AI 학습에 쓰지 말아 달라는 뜻을 표시합니다.",
        "Shows that you ask for this work not to be used for AI training.",
      );
    case "unspecified":
      return context === "package"
        ? bi(
            "허용도 불허도 밝히지 않습니다. manifest에 '미지정'으로 기록되며 허용으로 해석되지 않습니다.",
            "You state neither. The manifest records 'unspecified', which is never read as permission.",
          )
        : bi(
            "허용도 불허도 밝히지 않습니다. 독자 화면에는 '미지정'으로 보이며 허용으로 해석되지 않습니다.",
            "You state neither. Readers see 'Not specified', which is never read as permission.",
          );
  }
}

export function getCreatorAiTrainingFieldCopy(context: CreatorAiTrainingContext = "publication"): {
  readonly legend: string;
  readonly hint: string;
  readonly defaultSuffix: string;
} {
  return {
    legend: bi("AI 학습 허용 표기", "AI training label"),
    hint:
      context === "package"
        ? bi(
            "내보내는 패키지 manifest에 기록할 작가의 의사 표시입니다. 기본값은 '미지정'이며 허용으로 해석되지 않습니다. ToonStudio에 게시한 작품의 표기는 게시 설정에서 따로 정합니다.",
            "Your intent, recorded in the exported package manifest. The default is 'Not specified' and is never read as permission. The label for a work published on ToonStudio is set separately in its publishing settings.",
          )
        : bi(
            "이 작품(회차)을 AI 학습에 쓰는 것에 대한 작가의 의사를 독자에게 표시합니다. 기본값은 '미지정'이며 허용으로 해석되지 않습니다.",
            "Shows readers your intent about using this work (episode) for AI training. The default is 'Not specified' and is never read as permission.",
          ),
    defaultSuffix: bi(" (기본)", " (default)"),
  };
}

/** 모든 표기 화면에 항상 보이는 한계 고지. 법적 효력을 단정하지 않는다. */
export function getCreatorAiTrainingLimitNotice(): string {
  return bi(
    "이 표기는 작가의 의사 표시이며 별도 계약을 대체하지 않습니다. ToonStudio는 외부 AI 사업자가 이 표시를 따르도록 강제할 수 없습니다.",
    "This label states the creator's intent and does not replace a separate agreement. ToonStudio cannot make outside AI companies follow it.",
  );
}

export interface CreatorAiTrainingChangeNoticeOptions {
  readonly context?: CreatorAiTrainingContext;
  /** 이미 게시된 작품이면 변경이 다음 게시부터 독자에게 반영될 수 있음을 덧붙인다. */
  readonly published?: boolean;
}

function packageChangeNotice(consent: CreatorCommunityAiTrainingConsent): string {
  switch (consent) {
    case "allowed":
      return bi(
        "AI 학습 '허용'으로 표기를 바꿨습니다. 내보내는 패키지의 manifest.json(rights.aiTraining)에 기록됩니다. 이미 내보낸 패키지는 바뀌지 않습니다.",
        "Label changed to 'Allowed'. It is recorded in the exported package's manifest.json (rights.aiTraining). Packages you already exported do not change.",
      );
    case "prohibited":
      return bi(
        "AI 학습 '불허'로 표기를 바꿨습니다. 내보내는 패키지의 manifest.json(rights.aiTraining)에 기록됩니다. 표기만으로 외부의 수집과 학습을 기술적으로 막을 수는 없습니다.",
        "Label changed to 'Not allowed'. It is recorded in the exported package's manifest.json (rights.aiTraining). A label alone cannot technically stop outside collection or training.",
      );
    case "unspecified":
      return bi(
        "AI 학습 '미지정'으로 표기를 바꿨습니다. 내보내는 패키지의 manifest.json(rights.aiTraining)에 '미지정'으로 기록되며 허용으로 해석되지 않습니다.",
        "Label changed to 'Not specified'. It is recorded as 'unspecified' in the exported package's manifest.json (rights.aiTraining) and is never read as permission.",
      );
  }
}

function publicationChangeNotice(consent: CreatorCommunityAiTrainingConsent): string {
  switch (consent) {
    case "allowed":
      return bi(
        "AI 학습 '허용'으로 표기를 바꿨습니다. 게시하면 독자 화면에 '허용 표기'가 보입니다. 나중에 바꿔도 이미 공개되어 수집된 사본은 되돌릴 수 없습니다.",
        "Label changed to 'Allowed'. Once published, readers see an 'allowed' label. Changing it later cannot undo copies that were already collected.",
      );
    case "prohibited":
      return bi(
        "AI 학습 '불허'로 표기를 바꿨습니다. 게시하면 독자 화면에 '불허 표기'가 보입니다. 표기만으로 외부의 수집과 학습을 기술적으로 막을 수는 없습니다.",
        "Label changed to 'Not allowed'. Once published, readers see a 'not allowed' label. A label alone cannot technically stop outside collection or training.",
      );
    case "unspecified":
      return bi(
        "AI 학습 '미지정'으로 표기를 바꿨습니다. 독자 화면에는 '미지정'으로 보이며 허용으로 해석되지 않습니다.",
        "Label changed to 'Not specified'. Readers see 'Not specified', which is never read as permission.",
      );
  }
}

/**
 * 표기를 바꾼 직후 보여 주는 변경 확인 문구. 새 값이 무엇인지, 어디에 기록되는지, 그리고 표기가
 * 해 줄 수 없는 일(이미 수집된 사본 회수·외부 수집 차단)을 한 번에 말한다.
 */
export function getCreatorAiTrainingChangeNotice(
  consent: CreatorCommunityAiTrainingConsent,
  { context = "publication", published = false }: CreatorAiTrainingChangeNoticeOptions = {},
): string {
  if (context === "package") return packageChangeNotice(consent);
  const base = publicationChangeNotice(consent);
  if (!published) return base;
  return `${base} ${bi(
    "이미 게시한 작품은 다음 게시(릴리스)부터 독자 화면에 반영될 수 있습니다.",
    "For a work that is already published, the change may reach readers with the next release.",
  )}`;
}
