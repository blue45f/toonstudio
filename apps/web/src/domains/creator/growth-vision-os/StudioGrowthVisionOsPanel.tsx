import "./growth-vision-os.css";

import { useMemo, useRef, useState } from "react";

import { GrowthFiveWorkbench } from "./GrowthFiveWorkbench";
import { GrowthVisionMapSection } from "./GrowthVisionMapSection";
import {
  resolveVisionEcosystemMap,
  type GrowthWorkbenchTabId,
  type VisionProficiencyId,
  type VisionRoleId,
} from "./toonstudio-vision-ecosystem-map";

/**
 * ToonStudio OS 통합 비주얼 비전 지도 & 성장 단계 5대 기능 워크벤치 패널.
 *
 * - 상단: 3초 이해 ToonStudio OS 비주얼 지도 (6대 기둥 · 7대 직군 · 4대 숙련도 · 1클릭 점프)
 * - 하단: 5대 성장 엔진 워크벤치 (라이브 방송·블러 / 바이어 피치 룸 / 라이브 첨삭 / 오프라인 이어 그리기 / 휴재기 Q&A)
 */
export function StudioGrowthVisionOsPanel() {
  const [roleId, setRoleId] = useState<VisionRoleId>("all");
  const [proficiencyId, setProficiencyId] = useState<VisionProficiencyId>("all");
  const [activeTab, setActiveTab] = useState<GrowthWorkbenchTabId>("live-broadcast");
  const [jumpNotice, setJumpNotice] = useState<string>("");
  const workbenchAnchorRef = useRef<HTMLDivElement | null>(null);

  const resolution = useMemo(
    () => resolveVisionEcosystemMap({ roleId, proficiencyId }),
    [roleId, proficiencyId],
  );

  const handleJumpTarget = (target: {
    readonly label: string;
    readonly routePath: string;
    readonly growthTabId?: GrowthWorkbenchTabId;
  }) => {
    if (target.growthTabId) {
      setActiveTab(target.growthTabId);
      setJumpNotice(
        `"${target.label}" 워크벤치 탭을 바로 열었습니다. (연결 경로: ${target.routePath})`,
      );
      workbenchAnchorRef.current?.scrollIntoView?.({ behavior: "auto", block: "nearest" });
      return;
    }
    setJumpNotice(`"${target.label}" 1클릭 진입 경로가 준비되었습니다: ${target.routePath}`);
  };

  return (
    <div className="gvos-shell" data-testid="studio-growth-vision-os-panel">
      <div className="gvos-stack">
        <GrowthVisionMapSection
          resolution={resolution}
          onSelectRole={setRoleId}
          onSelectProficiency={setProficiencyId}
          onJumpTarget={handleJumpTarget}
        />

        {jumpNotice ? (
          <p className="gvos-live-banner" role="status" data-testid="gvos-jump-notice">
            {jumpNotice}
          </p>
        ) : null}

        <div ref={workbenchAnchorRef}>
          <GrowthFiveWorkbench activeTab={activeTab} onSelectTab={setActiveTab} />
        </div>
      </div>
    </div>
  );
}
