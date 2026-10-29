import { useEffect, useRef, useState, type ComponentType } from "react";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { ProductionCommandExecutor } from "./production-command-execution";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly canManage: boolean;
  readonly execute: ProductionCommandExecutor;
  readonly refresh?: () => Promise<void>;
  readonly hasUnconfirmedCommand?: boolean;
}

/** 실제 역할 관리는 관리자가 열 때만 로드한다. workspace의 프리셋 체험과 연결하지 않는다. */
export function ProductionCollaborationRoleSection(props: Props) {
  const bt = useBilingual("ProductionCollaborationRoleSection");
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const [Editor, setEditor] = useState<ComponentType<Props> | null>(null), pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = async () => {
    if (Editor || pending.current) return;
    pending.current = true; setLoading(true); setFailed(false);
    try {
      const module = await import("./ProductionCollaborationRoleEditor");
      if (mounted.current) setEditor(() => module.ProductionCollaborationRoleEditor);
    } catch { if (mounted.current) setFailed(true); }
    finally { pending.current = false; if (mounted.current) setLoading(false); }
  };
  if (!props.canManage) return null;
  return <details className="rounded-2xl border border-line bg-card p-4" onToggle={(event) => {
    setOpen(event.currentTarget.open); if (event.currentTarget.open) void load();
  }}>
    <summary className="cursor-pointer rounded-lg text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      {bt("참여 계정과 공정 역할 관리", "Manage participant accounts and production roles")}
    </summary>
    {open ? <div className="mt-4 space-y-3">
      <p className="text-sm leading-6 text-fg-2">{bt("작품 초대를 수락한 실제 계정에 역할을 배정합니다. 원고의 담당 편집 범위는 아래에서 별도로 배정하세요.", "Assign roles to actual accounts that accepted the work invitation. Assign their manuscript editing ranges separately below.")}</p>
      {loading ? <p role="status">{bt("참여 역할 관리를 불러오고 있습니다.", "Loading participant role management.")}</p> : null}
      {failed ? <div role="alert"><p>{bt("참여 역할 관리를 불러오지 못했습니다.", "Could not load participant role management.")}</p>
        <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void load()}>{bt("다시 불러오기", "Reload")}</button></div> : null}
      {Editor ? <Editor key={JSON.stringify([props.aggregate.projectId, props.aggregate.workId])} {...props} /> : null}
    </div> : null}
  </details>;
}
