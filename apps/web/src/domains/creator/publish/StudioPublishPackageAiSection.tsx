import { Sparkles, XCircle } from "lucide-react";
import { useId } from "react";

import { CreatorAiTrainingConsentField } from "../ai-training-consent/CreatorAiTrainingConsentField";
import {
  STUDIO_PUBLISH_PACKAGE_LIMITS,
  type StudioPublishPackageSettings,
} from "../studio-publish-package";
import { AI_USAGE_META } from "./studio-publish-package-ai-usage-meta";

export interface StudioPublishPackageAiSectionProps {
  readonly settings: StudioPublishPackageSettings;
  readonly onChange: (patch: Partial<StudioPublishPackageSettings>) => void;
  /** 목적지 이름. AI 생성 콘텐츠 금지 안내에 쓴다. */
  readonly presetLabel: string;
  /** 현재 목적지의 정책 스냅샷이 AI 생성 콘텐츠 게시를 금지하는가. */
  readonly generatedProhibited: boolean;
  /** AI 사용 고지 문구가 필수인데 비어 있는가(검증 오류 `AI_DISCLOSURE_REQUIRED`). */
  readonly disclosureInvalid: boolean;
  /** 패널의 입력 필드와 같은 클래스. 패널이 소유한 스타일을 그대로 받아 어긋나지 않게 한다. */
  readonly fieldClassName: string;
}

/**
 * 게시 패키지 설정의 "AI 사용 공개"와 "AI 학습 허용 표기" 묶음.
 *
 * 패널(`StudioPublishPackagePanel`)이 파일 크기 래칫 천장에 닿아 있어, AI 사용 공개 섹션을 동작 변경
 * 없이 이 파일로 옮기고 같은 묶음에 학습 허용 표기를 더했다. 표기는 패키지 manifest의
 * `rights.aiTraining`으로만 내보내며, ToonStudio에 게시한 작품의 표기는 게시 설정에서 따로 정한다.
 */
export function StudioPublishPackageAiSection({
  settings,
  onChange,
  presetLabel,
  generatedProhibited,
  disclosureInvalid,
  fieldClassName,
}: StudioPublishPackageAiSectionProps) {
  const aiUsageIdPrefix = useId();
  const disclosureId = useId();
  return (
    <>
      <section aria-labelledby="publish-ai-title">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cool/10 text-cool">
            <Sparkles size={17} aria-hidden />
          </span>
          <div>
            <h3 id="publish-ai-title" className="text-sm font-bold text-fg">AI 사용 공개</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
              사용 여부는 자동 추정하지 않습니다. 창작자가 실제 제작 과정을 기준으로 직접 선택합니다.
            </p>
          </div>
        </div>
        <fieldset className="mt-3">
          <legend className="sr-only">AI 사용 범위</legend>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card/25">
            {(["none", "assisted", "generated"] as const).map((usage) => {
              const meta = AI_USAGE_META[usage];
              return (
                <label
                  key={usage}
                  htmlFor={`${aiUsageIdPrefix}-${usage}`}
                  aria-label={meta.label}
                  className="flex min-h-14 cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-raised/45"
                >
                  <input
                    id={`${aiUsageIdPrefix}-${usage}`}
                    type="radio"
                    name="publish-package-ai-usage"
                    value={usage}
                    checked={settings.aiUsage === usage}
                    onChange={() => onChange({ aiUsage: usage })}
                    className="mt-0.5 size-5 shrink-0 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-fg">{meta.label}</span>
                    <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-fg-3">
                      {meta.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {settings.aiUsage !== "none" && (
          <label htmlFor={disclosureId} className="mt-3 block text-xs font-semibold text-fg-2">
            공개 고지 문구 <span className="text-bad">필수</span>
            <textarea
              id={disclosureId}
              value={settings.aiDisclosure}
              onChange={(event) => onChange({ aiDisclosure: event.target.value })}
              maxLength={STUDIO_PUBLISH_PACKAGE_LIMITS.maxDisclosureCodeUnits}
              rows={4}
              placeholder="예: 배경 아이디어 탐색에 AI를 보조적으로 사용했으며, 최종 구성과 작화는 작가가 직접 완성했습니다."
              className={`${fieldClassName} mt-1.5 min-h-28 resize-y leading-relaxed`}
              aria-invalid={disclosureInvalid}
            />
            <span className="mt-1 flex justify-between gap-3 text-[0.65rem] font-normal text-fg-3">
              <span>독자가 이해할 수 있게 사용 범위와 최종 결정 주체를 적으세요.</span>
              <span className="shrink-0 tabular-nums">
                {settings.aiDisclosure.length}/{STUDIO_PUBLISH_PACKAGE_LIMITS.maxDisclosureCodeUnits}
              </span>
            </span>
          </label>
        )}

        {generatedProhibited && settings.aiUsage === "generated" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/35 bg-bad/10 px-3 py-2 text-[0.7rem] leading-relaxed text-bad">
            <XCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
            현재 벤치마크한 {presetLabel} 정책에서는 AI 생성 콘텐츠 게시가 금지됩니다. 공식 원문을 직접 확인하세요.
          </div>
        )}
      </section>

      <div className="my-5 border-t border-line" />

      <CreatorAiTrainingConsentField
        context="package"
        value={settings.aiTraining}
        onChange={(aiTraining) => onChange({ aiTraining })}
      />
    </>
  );
}
