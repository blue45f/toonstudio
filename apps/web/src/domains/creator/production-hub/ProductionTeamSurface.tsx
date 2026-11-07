import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { ArrowRight, Eye, MessageSquare, PenLine, Settings2, ShieldCheck } from "lucide-react";
import { useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";

import { ProductionIntegrationsPanel } from "./ProductionIntegrationsPanel";
import type { ProductionClientCommand } from "./production-api";
import { ProductionProjectCoverSettings } from "./ProductionProjectCoverSettings";
import { ProductionScopedWriteSection } from "./ProductionScopedWriteSection";
import { ProductionCollaborationRoleSection } from "./ProductionCollaborationRoleSection";
import { ProductionCrewCoverage } from "./ProductionRoleWorkspace";
import type { ProductionProjectAccess } from "./production-dashboard-api";
import type { ProductionCommandExecutor } from "./production-command-execution";
import { assignmentStatusLabel, projectAccessRoleLabel, roleTypeLabel, type BilingualLabel } from "./production-labels";
import { ProductionAvatar, ProductionPill, ProductionSectionCard } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type AccessRole = NonNullable<ProductionProjectAccess["role"]>;

const ACCESS_GUIDE: readonly { readonly role: AccessRole; readonly icon: typeof Eye; readonly can: BilingualLabel }[] = [
  { role: "owner", icon: ShieldCheck, can: { ko: "모든 설정·권한과 프로젝트 연결을 책임집니다.", en: "Owns every setting, permission and link." } },
  { role: "admin", icon: Settings2, can: { ko: "공정 설정, 팀 보기 저장, 참여자 배정을 관리합니다.", en: "Manages workflow, shared views and assignments." } },
  { role: "editor", icon: PenLine, can: { ko: "작업을 만들고 상태를 옮기며 원고를 고칩니다.", en: "Creates tasks, moves status and edits pages." } },
  { role: "commenter", icon: MessageSquare, can: { ko: "코멘트와 질문을 남깁니다. 별도 배정한 담당 범위는 원고를 편집할 수 있습니다.", en: "Leaves comments and questions. Explicitly assigned manuscript ranges can be edited." } },
  { role: "viewer", icon: Eye, can: { ko: "진행 상황과 원고를 열람합니다. 별도 배정한 담당 범위는 원고를 편집할 수 있습니다.", en: "Views progress and manuscripts. Explicitly assigned manuscript ranges can be edited." } },
];

const SAFETY_RULES: readonly BilingualLabel[] = [
  { ko: "파일을 올린 사람을 저작권자로 자동 판정하지 않습니다.", en: "Uploading a file never makes someone the rights holder." },
  { ko: "관리자 권한을 창작 최종 결정권으로 해석하지 않습니다.", en: "Admin rights are not final creative authority." },
  { ko: "검수 기한이 지나도 자동으로 승인하지 않습니다.", en: "Reviews are never auto-approved after a deadline." },
  { ko: "기여량으로 수익 배분율을 자동 변경하지 않습니다.", en: "Contribution counts never change revenue shares." },
  { ko: "작업자 생산성 순위나 감시 지표를 만들지 않습니다.", en: "No productivity rankings or surveillance metrics." },
  { ko: "AI 추천은 계약 선정·게시 승인·지급을 대신하지 않습니다.", en: "AI suggestions never replace contracts, approvals or payment." },
];

export function ProductionTeamSurface({
  aggregate,
  access,
  execute,
  executeStrict,
  refresh,
  hasUnconfirmedCommand = false,
  isDemo = false,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
  readonly execute?: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly executeStrict?: ProductionCommandExecutor;
  readonly refresh?: () => Promise<void>;
  readonly hasUnconfirmedCommand?: boolean;
  readonly isDemo?: boolean;
}) {
  const bt = useBilingual("ProductionTeamSurface");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [Preview, setPreview] = useState<ComponentType | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewPending = useRef(false);
  const loadPreview = async () => {
    if (previewPending.current || Preview) return;
    previewPending.current = true;
    setPreviewLoading(true);
    setPreviewFailed(false);
    try {
      const module = await import("./ProductionTeamFeaturePreview");
      setPreview(() => module.ProductionTeamFeaturePreview);
    } catch {
      setPreviewFailed(true);
    } finally {
      previewPending.current = false;
      setPreviewLoading(false);
    }
  };
  return (
    <div className="space-y-4">
      <ProductionProjectCoverSettings aggregate={aggregate} execute={execute} canEdit={access.edit} />
      {!isDemo && access.manage && executeStrict ? <ProductionCollaborationRoleSection aggregate={aggregate} canManage={access.manage}
        execute={executeStrict} refresh={refresh} hasUnconfirmedCommand={hasUnconfirmedCommand} /> : null}
      {!isDemo && aggregate.projectId !== "sample-project" && access.view ? <ProductionScopedWriteSection aggregate={aggregate} /> : null}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <ProductionSectionCard
          title={bt("참여자와 담당 역할", "Members and assigned roles")}
          description={bt("담당 역할 배정은 실제 기여·저작권·보상과 따로 기록합니다.", "Assigned roles are recorded separately from contribution, rights and pay.")}
          action={
            <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })} to="/team/people">
              {bt("사람·권한 관리", "People & access")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          <ul className="space-y-2">
            {aggregate.parties.map((party) => {
              const assignments = aggregate.assignments.filter((entry) => entry.partyId === party.id && entry.status === "active");
              const roles = assignments.map((entry) => entry.publicCreditRole ?? roleTypeLabel(entry.roleType, bt));
              return (
                <li key={party.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3">
                  <ProductionAvatar name={party.publicDisplayName} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{party.publicDisplayName}</p>
                    <p className="truncate text-xs text-fg-2">{roles.join(" · ") || bt("참여자", "Member")}</p>
                  </div>
                  <ProductionPill tone={party.status === "active" ? "success" : "neutral"}>{assignmentStatusLabel(party.status, bt)}</ProductionPill>
                </li>
              );
            })}
          </ul>
        </ProductionSectionCard>

        <div className="space-y-4">
          <ProductionSectionCard
            title={bt("프로젝트 권한 — 누가 무엇을 할 수 있나요", "Project access — who can do what")}
            description={bt(`지금 내 권한은 '${projectAccessRoleLabel(access.role, bt)}'입니다.`, `Your access: ${projectAccessRoleLabel(access.role, bt)}.`)}
          >
            <ul className="space-y-2">
              {ACCESS_GUIDE.map((entry) => {
                const Icon = entry.icon;
                const mine = access.role === entry.role;
                return (
                  <li key={entry.role} className={cn("flex items-start gap-3 rounded-xl border p-3", mine ? "border-accent/45 bg-accent-soft" : "border-line bg-panel")}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised text-accent"><Icon className="size-4" aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
                        {projectAccessRoleLabel(entry.role, bt)}
                        {mine ? <ProductionPill tone="accent">{bt("내 권한", "You")}</ProductionPill> : null}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-fg-2">{bt(entry.can.ko, entry.can.en)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </ProductionSectionCard>
          <ProductionSectionCard
            title={bt("운영 안전 경계", "Safety boundaries")}
            description={bt("창작 협업에서 자동화가 넘지 않는 선입니다.", "Lines automation never crosses in creative collaboration.")}
          >
            <ul className="space-y-2 text-xs leading-6 text-fg-2">
              {SAFETY_RULES.map((rule) => <li key={rule.ko} className="rounded-xl border border-line bg-panel px-3 py-2">{bt(rule.ko, rule.en)}</li>)}
            </ul>
          </ProductionSectionCard>
        </div>
      </div>
      <ProductionCrewCoverage aggregate={aggregate} />
      <ProductionIntegrationsPanel
        key={`${aggregate.projectId}:${isDemo && aggregate.projectId === "sample-project" ? "sample" : "real"}`}
        aggregate={aggregate}
      />
      {isDemo && aggregate.projectId === "sample-project" ? (
        <details className="rounded-2xl border border-line bg-card p-4" onToggle={(event) => {
          const open = event.currentTarget.open;
          setPreviewOpen(open);
          if (open) void loadPreview();
        }}>
          <summary className="cursor-pointer rounded-lg text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            {bt("팀 운영 기능 체험 열기", "Open team feature preview")}
          </summary>
          <p className="mt-3 text-sm font-bold text-warn">{bt("기능 체험 · 서버에 적용되지 않음", "Feature preview · Changes are not applied to the server")}</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">{bt(
            "아래는 예시 데이터로 살펴보는 화면입니다. 배정·계약·권한·공유 차단·라이선스·알림을 실제로 변경하지 않으며, 화면의 완료 표시는 체험 결과입니다.",
            "These screens use example data. Assignments, contracts, access, share blocking, licenses and notifications do not change. Completion messages describe preview results.",
          )}</p>
          {previewOpen ? <div className="mt-4 space-y-4">
            {previewLoading ? <p role="status" className="text-xs text-fg-2">{bt("체험 화면을 불러오는 중입니다.", "Loading feature preview.")}</p> : null}
            {previewFailed ? <div role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-fg">
              <p>{bt("체험 화면을 불러오지 못했습니다.", "Could not load the feature preview.")}</p>
              <button type="button" className={buttonClass({ variant: "outline", size: "sm", className: "mt-2" })} onClick={() => void loadPreview()}>
                {bt("체험 다시 불러오기", "Retry feature preview")}
              </button>
            </div> : null}
            {Preview ? <Preview /> : null}
          </div> : null}
        </details>
      ) : null}
    </div>
  );
}
