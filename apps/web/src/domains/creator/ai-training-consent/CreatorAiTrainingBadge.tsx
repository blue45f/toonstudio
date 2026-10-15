import { Ban, BrainCircuit, CircleQuestionMark, type LucideIcon } from "lucide-react";

import {
  getCreatorAiTrainingCopy,
  getCreatorAiTrainingLimitNotice,
} from "./creator-ai-training-copy";

import {
  resolveCreatorCommunityAiTraining,
  type CreatorCommunityAiTrainingConsent,
} from "@/shared/lib/creator-community-publication-contract";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface CreatorAiTrainingBadgeProps {
  /** 표시할 값. 저장된 메타데이터라면 `resolveCreatorCommunityAiTraining`으로 읽은 값을 넘긴다. */
  readonly consent: CreatorCommunityAiTrainingConsent;
  /**
   * `chip`은 독자 화면 배지 줄에 놓는 한 줄 표시, `detail`은 칩에 독자용 설명과 한계 고지를
   * 눈에 보이게 덧붙인 블록이다. 색만으로 구분하지 않도록 아이콘과 문구가 항상 함께 나간다.
   */
  readonly variant?: "chip" | "detail";
  readonly className?: string;
}

const ICON: Record<CreatorCommunityAiTrainingConsent, LucideIcon> = {
  unspecified: CircleQuestionMark,
  allowed: BrainCircuit,
  prohibited: Ban,
};

/**
 * 미지정은 "밝히지 않음"이므로 실선 대신 점선 테두리로 허용·불허와 구분한다. 색은 테마마다 값이
 * 달라지는 의미 토큰(`cool`·`warn`)만 쓰되 테두리·배경·아이콘에만 입히고, 글자는 본문색(`text-fg`)을
 * 쓴다. 의미 토큰 색 글자는 라이트·세피아 테마에서 칩 배경 위 대비가 AA(4.5:1)에 못 미쳤다
 * (`text-cool` 글자는 colorjs 계산으로 3.6~4.3:1). 색 하나에 의존하지 않도록 아이콘과 문구가 항상 함께 나간다.
 * 점선 테두리도 3:1 이상이 되도록 `fg-3`를 쓴다(`line-strong`은 기본 테마에서 약 2:1).
 */
const TONE: Record<CreatorCommunityAiTrainingConsent, string> = {
  unspecified: "border-dashed border-fg-3 bg-card text-fg-2",
  allowed: "border-cool/40 bg-cool/10 text-fg",
  prohibited: "border-warn/40 bg-warn/10 text-fg",
};

const ICON_TONE: Record<CreatorCommunityAiTrainingConsent, string> = {
  unspecified: "text-fg-3",
  allowed: "text-cool",
  prohibited: "text-warn",
};

/** 저장된 메타데이터·릴리스 manifest·영수증(구버전 포함)에서 바로 배지를 그리는 편의 래퍼. */
export function CreatorAiTrainingBadgeFor({
  community,
  ...rest
}: Omit<CreatorAiTrainingBadgeProps, "consent"> & {
  readonly community: Parameters<typeof resolveCreatorCommunityAiTraining>[0];
}) {
  return <CreatorAiTrainingBadge consent={resolveCreatorCommunityAiTraining(community)} {...rest} />;
}

export function CreatorAiTrainingBadge({
  consent,
  variant = "chip",
  className,
}: CreatorAiTrainingBadgeProps) {
  useBilingualI18nRevision();
  const copy = getCreatorAiTrainingCopy(consent);
  const Icon = ICON[consent];
  const chip = (
    <span
      data-ai-training={consent}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold",
        TONE[consent],
        variant === "chip" && className,
      )}
    >
      <Icon size={12} className={ICON_TONE[consent]} aria-hidden />
      {copy.badgeLabel}
      {variant === "chip" ? <span className="sr-only">. {copy.readerNote}</span> : null}
    </span>
  );
  if (variant === "chip") return chip;
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      {chip}
      <p className="text-xs leading-relaxed text-fg-2">{copy.readerNote}</p>
      <p className="text-[0.7rem] leading-relaxed text-fg-3">{getCreatorAiTrainingLimitNotice()}</p>
    </div>
  );
}
