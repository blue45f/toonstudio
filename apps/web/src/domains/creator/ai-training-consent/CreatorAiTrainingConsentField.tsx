import { useId, useState } from "react";

import {
  CREATOR_AI_TRAINING_OPTION_ORDER,
  getCreatorAiTrainingChangeNotice,
  getCreatorAiTrainingCopy,
  getCreatorAiTrainingFieldCopy,
  getCreatorAiTrainingLimitNotice,
  getCreatorAiTrainingOptionDescription,
  type CreatorAiTrainingContext,
} from "./creator-ai-training-copy";

import {
  DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT,
  type CreatorCommunityAiTrainingConsent,
} from "@/shared/lib/creator-community-publication-contract";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface CreatorAiTrainingConsentFieldProps {
  readonly value: CreatorCommunityAiTrainingConsent;
  readonly onChange: (next: CreatorCommunityAiTrainingConsent) => void;
  readonly disabled?: boolean;
  /** 표기가 기록되는 곳. 기본은 작품 게시(독자 화면), `package`는 내보내는 패키지 manifest. */
  readonly context?: CreatorAiTrainingContext;
  /** 이미 게시된 작품이면 변경이 다음 게시부터 독자에게 반영될 수 있음을 변경 확인 문구에 덧붙인다. */
  readonly published?: boolean;
  readonly className?: string;
}

/**
 * 작품·회차 AI 학습 허용 표기 선택(미지정·불허·허용).
 *
 * - 기본값은 미지정이고 선택지 순서도 보수적인 값이 먼저다. 허용은 항상 작가가 직접 고른 경우만이다.
 * - 네이티브 라디오 그룹이라 방향키·Tab·그룹 이름이 브라우저 기본 동작으로 제공된다.
 * - 값을 바꾸면 변경 확인 문구를 `role="status"` 영역에 알린다. 한계 고지(별도 계약을 대체하지
 *   않고 외부 AI 사업자에게 강제할 수 없음)는 선택과 무관하게 항상 눈에 보인다.
 */
export function CreatorAiTrainingConsentField({
  value,
  onChange,
  disabled = false,
  context = "publication",
  published = false,
  className,
}: CreatorAiTrainingConsentFieldProps) {
  useBilingualI18nRevision();
  const groupName = useId();
  const hintId = useId();
  const [changedTo, setChangedTo] = useState<CreatorCommunityAiTrainingConsent | null>(null);
  const fieldCopy = getCreatorAiTrainingFieldCopy(context);
  // 사용자가 방금 고른 값이 현재 값과 같을 때만 보여 준다. 외부에서 값이 바뀌면 문구가 사라진다.
  const notice =
    changedTo !== null && changedTo === value
      ? getCreatorAiTrainingChangeNotice(value, { context, published })
      : "";

  const select = (next: CreatorCommunityAiTrainingConsent) => {
    if (disabled || next === value) return;
    setChangedTo(next);
    onChange(next);
  };

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={hintId}
      className={cn("min-w-0 disabled:opacity-60", className)}
    >
      <legend className="mb-0.5 text-xs font-bold text-fg">{fieldCopy.legend}</legend>
      <p id={hintId} className="text-[0.7rem] leading-relaxed text-fg-3">
        {fieldCopy.hint}
      </p>

      <div className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card/25">
        {CREATOR_AI_TRAINING_OPTION_ORDER.map((option) => {
          const copy = getCreatorAiTrainingCopy(option);
          const titleId = `${groupName}-${option}-title`;
          const descriptionId = `${groupName}-${option}-description`;
          return (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-raised/45 has-[:checked]:bg-accent-soft/70 has-[:disabled]:cursor-not-allowed motion-reduce:transition-none"
            >
              <input
                type="radio"
                name={groupName}
                value={option}
                checked={value === option}
                disabled={disabled}
                onChange={() => select(option)}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="mt-0.5 size-5 shrink-0 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <span className="min-w-0">
                <span id={titleId} className="block text-xs font-semibold text-fg">
                  {copy.valueLabel}
                  {option === DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT
                    ? fieldCopy.defaultSuffix
                    : null}
                </span>
                <span
                  id={descriptionId}
                  className="mt-0.5 block text-[0.7rem] leading-relaxed text-fg-3"
                >
                  {getCreatorAiTrainingOptionDescription(option, context)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p
        role="status"
        aria-live="polite"
        data-ai-training-change-notice={notice ? changedTo : undefined}
        className="mt-2 rounded-lg border border-accent/30 bg-accent-soft/70 px-3 py-2 text-[0.72rem] leading-relaxed text-fg-2 empty:hidden"
      >
        {notice}
      </p>
      <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">
        {getCreatorAiTrainingLimitNotice()}
      </p>
    </fieldset>
  );
}
