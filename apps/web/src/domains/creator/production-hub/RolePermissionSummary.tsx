import { Check, ShieldAlert, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { TeamWorkspaceRole } from "@toonstudio/contracts/production-workspace";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioTeamRole } from "../studio-team-client";
import {
  permissionBlockNotice,
  projectRolePermissionExplanation,
  workspaceRolePermissionExplanation,
  type PermissionBlockAction,
  type RolePermissionExplanation,
} from "./role-permission-explain-model";

function ExplanationLists({
  explanation,
}: {
  readonly explanation: RolePermissionExplanation;
}) {
  const bt = useBilingual("RolePermissionSummary");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs font-bold text-fg-2">{bt("할 수 있는 일", "What you can do")}</p>
        <ul className="mt-1.5 space-y-1">
          {explanation.can.map((item) => (
            <li key={item.ko} className="flex items-start gap-1.5 text-sm leading-6 text-fg-2">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-accent" />
              <span>{bt(item.ko, item.en)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-bold text-fg-2">{bt("할 수 없는 일", "What you can't do")}</p>
        {explanation.cannot.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {explanation.cannot.map((item) => (
              <li key={item.ko} className="flex items-start gap-1.5 text-sm leading-6 text-fg-2">
                <X aria-hidden="true" className="mt-1 size-4 shrink-0 text-fg-3" />
                <span>{bt(item.ko, item.en)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm leading-6 text-fg-2">
            {bt("이 역할에서는 특별히 막힌 일이 없어요.", "Nothing is specifically blocked for this role.")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * "내 권한" 자기설명 — 지금 내 역할로 할 수 있는 일/없는 일을 그 자리에 자연어로 보여 준다.
 * 권한 판정 자체는 서버 계약과 기존 판정(isWorkspaceManager, StudioTeamCapabilities)이
 * 맡고, 이 부품은 role-permission-explain-model의 설명 문장만 렌더한다.
 */
export function RolePermissionSummary({
  scope,
  role,
  compact,
  className,
}: {
  readonly scope: "workspace" | "project";
  readonly role: TeamWorkspaceRole | StudioTeamRole;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const bt = useBilingual("RolePermissionSummary");
  const explanation =
    scope === "workspace"
      ? workspaceRolePermissionExplanation(role as TeamWorkspaceRole)
      : projectRolePermissionExplanation(role as StudioTeamRole);
  return (
    <section
      aria-label={bt("내 권한 안내", "Your access")}
      className={cn("rounded-xl border border-line bg-raised", compact ? "p-3" : "p-4", className)}
    >
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-fg-3">
          {bt("내 권한", "Your access")}
        </span>
        <span className="rounded-full border border-accent/40 bg-accent-soft/50 px-2 py-0.5 text-xs font-bold">
          {bt(explanation.label.ko, explanation.label.en)}
        </span>
      </p>
      <p className="mt-1.5 text-sm leading-6 text-fg-2">
        {bt(explanation.summary.ko, explanation.summary.en)}
      </p>
      <div className="mt-2">
        <ExplanationLists explanation={explanation} />
      </div>
    </section>
  );
}

/**
 * 권한 차단 안내 — 권한이 없어 표면이 조용히 사라지는 대신, 이유와 요청 방법을 보여 준다.
 * 요청 전송 기능은 없으므로, 관리자를 확인하러 가는 경로까지만 정직하게 안내한다.
 */
export function PermissionBlockedNotice({
  action,
  className,
}: {
  readonly action: PermissionBlockAction;
  readonly className?: string;
}) {
  const bt = useBilingual("RolePermissionSummary");
  const notice = permissionBlockNotice(action);
  return (
    <section
      aria-label={bt(notice.title.ko, notice.title.en)}
      className={cn(
        "creator-workflow-panel rounded-2xl border border-line bg-card p-5",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <ShieldAlert aria-hidden="true" className="size-4 text-fg-2" />
        {bt(notice.title.ko, notice.title.en)}
      </p>
      <p className="mt-1.5 text-sm leading-6 text-fg-2">
        {bt(notice.reason.ko, notice.reason.en)}
      </p>
      <p className="mt-1 text-sm leading-6 text-fg-2">
        {bt(notice.requestGuide.ko, notice.requestGuide.en)}
      </p>
      {notice.requestHref && notice.requestLinkLabel ? (
        <p className="mt-2 text-sm">
          <Link className="font-semibold underline" to={notice.requestHref}>
            {bt(notice.requestLinkLabel.ko, notice.requestLinkLabel.en)}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
