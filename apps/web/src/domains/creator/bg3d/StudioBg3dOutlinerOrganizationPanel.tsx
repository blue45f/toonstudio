import { ChevronRight, Tags } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useT } from "@/shared/lib/i18n";

import { FOCUS_RING, cx } from "./studio-bg3d-asset-panel-styles";
import { StudioBg3dOutlinerComponentSection } from "./StudioBg3dOutlinerComponentSection";
import { StudioBg3dOutlinerSceneInfoSection } from "./StudioBg3dOutlinerSceneInfoSection";
import {
  StudioBg3dOutlinerSkpSourceSection,
  type StudioBg3dSkpSidecarLoader,
} from "./StudioBg3dOutlinerSkpSourceSection";
import { StudioBg3dOutlinerTagSection } from "./StudioBg3dOutlinerTagSection";

import type { StudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";
import type { StudioBg3dSkpSourceRef } from "./studio-bg3d-skp-sidecar";

interface StudioBg3dOutlinerOrganizationPanelProps {
  readonly organization: StudioBg3dOrganizationController;
  /** 장면에 있는 모든 오브젝트 id. 선택 중 장면에 없는 id(공유 캐릭터 등)를 걸러 내는 데 쓴다. */
  readonly entityIds: readonly string[];
  readonly selectedIds: ReadonlySet<string>;
  readonly variant: "dock" | "panel";
  /** 시험이 .skp 이름 기록 저장소 대신 가짜를 주입한다. */
  readonly loadSidecar?: StudioBg3dSkpSidecarLoader;
}

/**
 * 아웃라이너 아래에 접어 두는 "태그와 장면 정보" 영역: 태그, 컴포넌트 묶기, 장면 이름·메모, 선택한 .skp 소재의 원본 이름.
 * 접힌 채로도 목록의 각 행은 자기 태그를 보여 주므로 이 영역은 편집을 위한 자리다.
 */
export function StudioBg3dOutlinerOrganizationPanel({
  organization,
  entityIds,
  selectedIds,
  variant,
  loadSidecar,
}: StudioBg3dOutlinerOrganizationPanelProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const savedMemo = organization.view.meta.memo;
  const [memoDraft, setMemoDraft] = useState(savedMemo);
  const previousSavedMemo = useRef(savedMemo);
  const regionId = useId();

  // 되돌리기·다시 하기·협업으로 저장된 메모가 바뀌면, 사용자가 손대지 않은 초안만 따라간다.
  useEffect(() => {
    const previous = previousSavedMemo.current;
    previousSavedMemo.current = savedMemo;
    setMemoDraft((current) => (current === previous ? savedMemo : current));
  }, [savedMemo]);

  const selectedEntityIds = useMemo(() => {
    const known = new Set(entityIds);
    return [...selectedIds].filter((id) => known.has(id));
  }, [entityIds, selectedIds]);

  // 선택한 .skp 모델을 해시별로 한 번씩 모은다(같은 소재를 여러 번 놓았어도 이름 기록은 하나다).
  const skpSources = useMemo(() => {
    const byHash = new Map<string, StudioBg3dSkpSourceRef>();
    for (const id of selectedEntityIds) {
      const source = organization.skpSourceByEntityId.get(id);
      if (source && !byHash.has(source.contentHash)) byHash.set(source.contentHash, source);
    }
    return [...byHash.values()];
  }, [organization.skpSourceByEntityId, selectedEntityIds]);

  const appendMemoLine = (line: string) => {
    setMemoDraft((current) => (current.trim() === "" ? line : current.split("\n").includes(line) ? current : `${current}\n${line}`));
    setOpen(true);
  };

  const tagCount = organization.view.tags.length;

  return (
    <div
      className={cx("shrink-0 border-t border-line", variant === "dock" ? "px-3 pb-3 pt-2" : "mt-2 pt-2")}
      data-studio-bg3d-organization=""
    >
      <button
        type="button"
        className={cx(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-xs font-bold text-fg",
          "hover:bg-raised sm:min-h-9",
          FOCUS_RING,
        )}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Tags size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate">{t("studio.bg3dScene.panel.title", "태그와 장면 정보")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-fg-3">
          <span className="tabular-nums">
            {t("studio.bg3dScene.panel.tagCount", { count: tagCount }, "태그 {count}개")}
          </span>
          <ChevronRight size={13} className={cx("transition-transform motion-reduce:transition-none", open && "rotate-90")} aria-hidden />
        </span>
      </button>
      {open ? (
        <div id={regionId} className="mt-2 max-h-[min(28rem,55vh)] space-y-4 overflow-y-auto overscroll-contain pr-1">
          <StudioBg3dOutlinerTagSection organization={organization} selectedEntityIds={selectedEntityIds} />
          <StudioBg3dOutlinerComponentSection organization={organization} selectedEntityIds={selectedEntityIds} />
          <StudioBg3dOutlinerSkpSourceSection
            organization={organization}
            sources={skpSources}
            selectedEntityIds={selectedEntityIds}
            onAppendMemoLine={appendMemoLine}
            {...(loadSidecar ? { loadSidecar } : {})}
          />
          <StudioBg3dOutlinerSceneInfoSection
            organization={organization}
            memoDraft={memoDraft}
            onMemoDraftChange={setMemoDraft}
          />
        </div>
      ) : null}
    </div>
  );
}
