import { useState } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { ProductionRolePreset } from "./production-manuscript-competitive-model";
import {
  buildOnboardingPackage,
  buildOnboardingPackageText,
  type OnboardingPackageReferenceCut,
} from "./onboarding-package-model";

/**
 * 외주·어시 온보딩 패키지 패널 (REPORT T-3).
 * 초대하는 쪽(TeamWorkspacePage 프리셋·링크 준비 카드)에서는 보내기 전에 패키지를
 * 미리 보고 링크와 함께 복사해 직접 전달하고, 초대받은 쪽(합류 시트)에서는
 * 초대 링크 프래그먼트가 실어 온 프리셋으로 같은 패키지를 수락 전에 열람한다.
 * 패키지 끝의 브리프 링크가 첫 작업으로 이어진다.
 */
export function OnboardingPackagePanel({
  preset,
  projectTitle,
  briefProjectId,
  referenceCuts,
  inviteLink,
}: {
  readonly preset: ProductionRolePreset;
  readonly projectTitle?: string | null;
  readonly briefProjectId?: string | null;
  readonly referenceCuts?: readonly OnboardingPackageReferenceCut[];
  /** 링크 준비 카드에서만 전달 — 복사 텍스트 맨 위에 초대 링크를 함께 붙인다. */
  readonly inviteLink?: string | null;
}) {
  const bt = useBilingual("OnboardingPackagePanel");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const pkg = buildOnboardingPackage({ preset, projectTitle, briefProjectId, referenceCuts });
  const packageText = buildOnboardingPackageText(pkg, "ko", inviteLink);

  return (
    <section
      data-testid="onboarding-package-panel"
      aria-label={bt("외주·어시 온보딩 패키지", "Outsourcing & assistant onboarding package")}
      className="mt-3 rounded-xl border border-accent/40 bg-accent-soft/30 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black">
          {bt(`온보딩 패키지 · ${pkg.roleLabel.ko}`, `Onboarding package · ${pkg.roleLabel.en}`)}
        </h3>
        <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-bold text-fg-2">
          {bt(`담당 공정: ${pkg.processScope.ko}`, `Stage: ${pkg.processScope.en}`)}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-fg-2">
        {bt(
          "역할 규칙·참조 컷·일정 규칙·첫 작업 브리프가 초대에 함께 묶입니다. 수락하면 아래 순서대로 확인하세요.",
          "Role rules, reference cuts, schedule rules, and the first-task brief travel with this invite. After accepting, go through them in order.",
        )}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-black text-fg">{bt("역할 규칙", "Role rules")}</h4>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-fg-2">
            {pkg.allowedActions.map((action) => (
              <li key={`allow-${action}`}>✓ {action}</li>
            ))}
            {pkg.blockedActions.map((action) => (
              <li key={`block-${action}`} className="text-fg-3">✕ {action}</li>
            ))}
            {pkg.workingRules.map((rule) => (
              <li key={rule.ko}>· {bt(rule.ko, rule.en)}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-black text-fg">{bt("참조 컷", "Reference cuts")}</h4>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-fg-2">
            {pkg.referenceGuide.map((guide) => (
              <li key={guide.ko}>· {bt(guide.ko, guide.en)}</li>
            ))}
            {pkg.suppliedCuts.map((cut) => (
              <li key={cut.id}>✓ {cut.title}{cut.note ? ` — ${cut.note}` : ""}</li>
            ))}
          </ul>
          {pkg.referenceCutsMissing && (
            <p className="mt-1 text-[0.6875rem] leading-5 text-warn">
              {bt(
                "연결된 참조 컷이 아직 없습니다. 작품 참조 보드에서 위 안내에 맞는 컷을 골라 주세요 — 없는 컷을 패키지가 지어내지 않습니다.",
                "No reference cuts are linked yet. Pick cuts matching the guide from the project reference board — the package never invents cuts.",
              )}
            </p>
          )}
        </div>
        <div>
          <h4 className="text-xs font-black text-fg">{bt("일정 규칙", "Schedule rules")}</h4>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-fg-2">
            {pkg.scheduleRules.map((rule) => (
              <li key={rule.ko}>· {bt(rule.ko, rule.en)}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-black text-fg">{bt("첫 작업 브리프", "First-task brief")}</h4>
          <dl className="mt-1 space-y-1 text-xs leading-5 text-fg-2">
            {pkg.briefFields.map((field) => (
              <div key={field.label.ko} className="flex gap-2">
                <dt className="shrink-0 font-bold">{bt(field.label.ko, field.label.en)}</dt>
                <dd>{field.value || bt("(브리프에서 확인)", "(see brief)")}</dd>
              </div>
            ))}
          </dl>
          {pkg.briefHref ? (
            <Link className={`${buttonClass({ variant: "outline", size: "sm" })} mt-2`} to={pkg.briefHref}>
              {bt("브리프 열고 첫 작업 확인", "Open the brief & first task")}
            </Link>
          ) : (
            <p className="mt-1 text-[0.6875rem] leading-5 text-fg-3">
              {bt(
                "작품을 함께 초대하면 브리프가 그 작품의 제작 보드로 바로 이어집니다.",
                "Invite with a project and the brief links straight to that project's production board.",
              )}
            </p>
          )}
        </div>
      </div>

      <ol className="mt-3 list-decimal space-y-1 border-t border-line pt-2 pl-5 text-xs leading-5 text-fg-2">
        {pkg.firstSteps.map((step) => (
          <li key={step.ko}>{bt(step.ko, step.en)}</li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass({ variant: "outline", size: "sm" })}
          onClick={() => {
            setCopied(false);
            setCopyFailed(false);
            void navigator.clipboard
              .writeText(packageText)
              .then(() => setCopied(true))
              .catch(() => setCopyFailed(true));
          }}
        >
          {bt("패키지 복사", "Copy package")}
        </button>
        {copied && (
          <span role="status" className="text-xs font-bold text-accent">
            {bt("패키지를 복사했습니다. 초대 링크와 함께 전달하세요.", "Package copied. Send it together with the invite link.")}
          </span>
        )}
        {copyFailed && (
          <span role="alert" className="text-xs font-bold text-bad">
            {bt("복사 권한이 없습니다. 아래 텍스트를 선택해 직접 복사하세요.", "No clipboard permission. Select the text below and copy it manually.")}
          </span>
        )}
      </div>
      {copyFailed && (
        <textarea
          readOnly
          aria-label={bt("온보딩 패키지 텍스트", "Onboarding package text")}
          value={packageText}
          rows={8}
          className="mt-2 w-full rounded-lg border border-line bg-canvas p-2 text-xs text-fg"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </section>
  );
}
