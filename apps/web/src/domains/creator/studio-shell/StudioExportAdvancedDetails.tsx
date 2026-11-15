import { ArrowRight, SlidersHorizontal } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import type { StudioExportTargetProfile } from "../studio-export-preflight";
import type { StudioExportDraftInput } from "../studio-project-export-snapshot";
import { numberValue } from "./studio-export-panel-helpers";

export interface StudioExportProjectFacts {
  readonly blockedAssets: number;
  readonly warningAssets: number;
  readonly localization: number;
  readonly comments: number;
}

export function StudioExportAdvancedDetails({
  projectId,
  draft,
  profile,
  estimatedMb,
  projectFacts,
  onPatch,
}: {
  readonly projectId: string;
  readonly draft: StudioExportDraftInput;
  readonly profile: StudioExportTargetProfile;
  readonly estimatedMb: number;
  readonly projectFacts: StudioExportProjectFacts;
  readonly onPatch: <K extends keyof StudioExportDraftInput>(
    key: K,
    value: StudioExportDraftInput[K],
  ) => void;
}) {
  const bt = useBilingual("StudioExportAdvancedDetails");

  return (
    <>
      <details
        data-testid="studio-export-advanced-settings"
        className="mt-4 rounded-2xl border border-line bg-panel/35 p-4"
      >
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <SlidersHorizontal size={15} className="text-accent" aria-hidden="true" />
          <span>
            {bt(
              "해상도·DPI·색 공간·접근성 세부 설정 (필요할 때만 변경)",
              "Detailed resolution, DPI, color space & accessibility (optional)",
            )}
          </span>
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-fg-2">
            {bt("가로 폭", "Width")}
            <input
              type="number"
              min={1}
              value={draft.width}
              onChange={(event) => onPatch("width", numberValue(event.target.value, draft.width))}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("전체 높이", "Height")}
            <input
              type="number"
              min={1}
              value={draft.height}
              onChange={(event) => onPatch("height", numberValue(event.target.value, draft.height))}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("예상 용량 (MB)", "Estimated size (MB)")}
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={estimatedMb}
              onChange={(event) =>
                onPatch("estimatedFileSizeBytes", numberValue(event.target.value, 1) * 1024 * 1024)
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            DPI
            <input
              type="number"
              min={1}
              value={draft.dpi ?? ""}
              onChange={(event) =>
                onPatch("dpi", event.target.value ? numberValue(event.target.value, 72) : null)
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
              placeholder={bt("웹 연재는 자동", "Automatic for web")}
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("색 공간", "Color space")}
            <select
              value={draft.colorSpace}
              onChange={(event) => onPatch("colorSpace", event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            >
              {(profile.allowedColorSpaces ?? ["srgb"]).map((space) => (
                <option key={space} value={space}>
                  {space.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("가장 작은 글자 (px)", "Smallest text (px)")}
            <input
              type="number"
              min={1}
              value={draft.minimumTextPx ?? ""}
              onChange={(event) =>
                onPatch(
                  "minimumTextPx",
                  event.target.value ? numberValue(event.target.value, 12) : null,
                )
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("대체 텍스트 범위", "Alt text coverage")}
            <select
              value={String(draft.altTextCoverage)}
              onChange={(event) => onPatch("altTextCoverage", Number(event.target.value))}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            >
              <option value="0">0%</option>
              <option value="0.5">50%</option>
              <option value="1">100%</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["readingOrderComplete", bt("읽기 순서 완료", "Reading order complete")],
              ["aiDisclosurePrepared", bt("AI 보조 사용 표기 준비", "AI disclosure prepared")],
              ["captionsComplete", bt("자막·대본 준비 완료", "Captions complete")],
              ["editableStructurePreserved", bt("레이어 편집 구조 유지", "Editable structure preserved")],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2"
            >
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(event) => onPatch(key, event.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </details>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            {
              id: "rights",
              label: bt("권리 확인 필요 소재", "Blocked assets"),
              count: projectFacts.blockedAssets,
              href: `/studio/p/${encodeURIComponent(projectId)}/assets?view=rights`,
              cta: bt("권리 확인하기", "Check rights"),
            },
            {
              id: "missing",
              label: bt("사용 조건 주의 소재", "Asset warnings"),
              count: projectFacts.warningAssets,
              href: `/studio/p/${encodeURIComponent(projectId)}/assets?view=missing`,
              cta: bt("소재 점검하기", "Inspect assets"),
            },
            {
              id: "localization",
              label: bt("다국어 대사 넘침", "Localization blocks"),
              count: projectFacts.localization,
              href: `/studio/p/${encodeURIComponent(projectId)}/story?view=localization`,
              cta: bt("대사 길이 보기", "Check dialogue"),
            },
            {
              id: "review",
              label: bt("남은 피드백 메모", "Open review"),
              count: projectFacts.comments,
              href: `/studio/p/${encodeURIComponent(projectId)}/review`,
              cta: bt("피드백 열기", "Open review"),
            },
          ] as const
        ).map((item) => (
          <Link
            key={item.id}
            href={item.href}
            data-testid={`studio-export-jump-${item.id}`}
            className="group flex min-h-20 flex-col justify-between rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <div>
              <p className="text-[0.68rem] text-fg-3">{item.label}</p>
              <b className={cn("mt-1 block text-lg", item.count > 0 ? "text-warning" : "text-fg")}>
                {item.count}
              </b>
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-[0.68rem] font-bold text-accent">
              <span>{item.cta}</span>
              <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
