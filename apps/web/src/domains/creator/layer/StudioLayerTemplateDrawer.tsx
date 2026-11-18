/**
 * 레이어 구조 템플릿 등록·불러오기 및 벡터 SVG 클립보드 직렬화 드로어 (`StudioLayerCompsPanel` 내부 마운트).
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */
import { useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  captureLayerStructureAsTemplate,
  instantiateLayerTemplate,
  listAllLayerTemplates,
  saveLayerTemplateToStorage,
  serializeVectorsToClipboardSvg,
} from "./studio-layer-template";

import type { StudioLayerCompGroupLike, StudioLayerLikeItem } from "./studio-layer-comps";
import type {
  InstantiatedLayerTemplateResult,
  StudioLayerTemplate,
  VectorClipboardStrokeInput,
} from "./studio-layer-template";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioLayerTemplateDrawerProps {
  readonly layers: readonly StudioLayerLikeItem[];
  readonly groups?: readonly StudioLayerCompGroupLike[];
  readonly vectorStrokes?: readonly VectorClipboardStrokeInput[];
  readonly onApplyLayerTemplate?: (
    instantiated: InstantiatedLayerTemplateResult,
    template: StudioLayerTemplate,
  ) => void;
}

function readGroupName(group: StudioLayerCompGroupLike): string {
  if ("name" in group && typeof group.name === "string" && group.name.trim()) {
    return group.name;
  }
  return group.id;
}

export function StudioLayerTemplateDrawer({
  layers,
  groups,
  vectorStrokes,
  onApplyLayerTemplate,
}: StudioLayerTemplateDrawerProps): ReactElement {
  const [layerTemplates, setLayerTemplates] = useState<readonly StudioLayerTemplate[]>(() =>
    listAllLayerTemplates(),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleCopyVectorSvg = async () => {
    const strokesToExport: readonly VectorClipboardStrokeInput[] =
      vectorStrokes && vectorStrokes.length > 0
        ? vectorStrokes
        : layers.map((layer, index) => ({
            id: layer.id,
            points: [24, 24 + index * 18, 296, 24 + index * 18],
            stroke: "#111827",
            strokeWidth: 2,
            opacity: layer.opacity ?? 1,
          }));
    const svgMarkup = serializeVectorsToClipboardSvg(strokesToExport, {
      title: `레이어 벡터 구조 (${strokesToExport.length}개)`,
    });
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(svgMarkup);
        setStatusMessage(`벡터 선화 SVG를 클립보드에 복사했어요 (${strokesToExport.length}개 획)`);
        return;
      }
    } catch {
      // 클립보드 권한 차단 환경에서는 상태 안내로 폴백한다.
    }
    setStatusMessage(`벡터 선화 SVG 마크업을 생성했어요 (${svgMarkup.length}자)`);
  };

  return (
    <details className="rounded-lg border border-line/70 bg-card/55 px-2.5 py-1.5 text-xs [word-break:keep-all]">
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-fg-2",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
        )}
      >
        <span>레이어 구조 템플릿</span>
        <span className="tabular-nums text-xs text-fg-3">{layerTemplates.length}종</span>
      </summary>
      <div className="space-y-2 border-t border-line/50 pt-2">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <button
            type="button"
            disabled={layers.length === 0}
            onClick={() => {
              const captured = captureLayerStructureAsTemplate({
                name: `내 구조 (${layers.length}층)`,
                groups: (groups ?? []).map((g) => ({
                  id: g.id,
                  name: readGroupName(g),
                  collapsed: false,
                })),
                elements: layers.map((item) => ({
                  id: item.id,
                  opacity: item.opacity,
                  hidden: item.visible === false,
                  groupId: item.groupId,
                })),
              });
              saveLayerTemplateToStorage(captured);
              setLayerTemplates(listAllLayerTemplates());
              setStatusMessage(`‘${captured.name}’ 템플릿을 등록했어요.`);
            }}
            className={cn(
              "flex min-h-11 w-full items-center justify-center rounded-md border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-45",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            현재 레이어 구조를 템플릿으로 등록
          </button>
          <button
            type="button"
            disabled={layers.length === 0 && (!vectorStrokes || vectorStrokes.length === 0)}
            onClick={() => {
              void handleCopyVectorSvg();
            }}
            className={cn(
              "flex min-h-11 w-full items-center justify-center rounded-md border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-45",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            벡터 선화 SVG 복사
          </button>
        </div>

        {statusMessage ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-accent/35 bg-accent-soft/35 px-2.5 py-1.5 text-xs font-medium text-fg"
          >
            {statusMessage}
          </p>
        ) : null}

        <div className="max-h-44 space-y-1.5 overflow-y-auto overscroll-contain">
          {layerTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center justify-between gap-2 rounded-md border border-line/50 bg-canvas/60 px-2.5 py-1"
            >
              <span className="min-w-0 truncate text-xs font-medium text-fg">{tpl.name}</span>
              <button
                type="button"
                onClick={() => {
                  const inst = instantiateLayerTemplate(tpl, {
                    existingLayerIds: layers.map((l) => l.id),
                    existingGroupIds: (groups ?? []).map((g) => g.id),
                  });
                  onApplyLayerTemplate?.(inst, tpl);
                  setStatusMessage(
                    onApplyLayerTemplate
                      ? `‘${tpl.name}’ 구조를 페이지에 적용했어요 (${inst.layers.length}개 레이어).`
                      : `‘${tpl.name}’ 구조를 준비했어요 (${inst.layers.length}개 레이어).`,
                  );
                }}
                className={cn(
                  "min-h-11 shrink-0 rounded border border-line bg-card px-3 text-xs font-semibold tabular-nums text-fg-2 hover:bg-raised hover:text-fg",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                )}
              >
                적용 ({tpl.layers.length})
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
