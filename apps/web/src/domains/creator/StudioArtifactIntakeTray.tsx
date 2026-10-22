/**
 * Studio Artifact Intake Tray — 에디터 안 "가져오기" 트레이 목록 UI.
 *
 * 기획 초안·3D 캡처·생성 이미지가 모드 경계를 넘어 이 트레이에 쌓이고,
 * 작가는 대상 컷을 고른 뒤 "이 컷에 배치" 한 번으로 산출물을 컷에 싣는다.
 * 배치 지시(ArtifactCutPlacement)는 호스트가 레이어/노트로 실제 생성한다 —
 * 이 컴포넌트는 트레이 표시·선택·정리 요청만 담당하는 프레젠테이션이다.
 *
 * - 콜백이 없는 동작은 아예 보이지 않는다(onDiscardArtifacts 없으면 버리기·
 *   정리 버튼 없음, onRemovePlacement 없으면 배치 취소 없음). 눌러도 아무 일
 *   없는 버튼을 만들지 않는다.
 * - 이미 대상 컷에 배치된 산출물은 버튼이 "배치됨"으로 잠긴다 — 같은 산출물을
 *   같은 컷에 두 번 싣는 중복 배치를 UI 단계에서 막는다.
 * - "오래된 미사용 정리"는 모델의 정리 후보(미사용+보관기간 경과)가 있을 때만
 *   나타나고, 후보 id 목록을 그대로 호스트에 넘긴다.
 */
import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { r4CreatorStatusText } from "./r4-cat1-status-i18n";
import { Box, FileText, Image as ImageIcon, Inbox, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  ARTIFACT_INTAKE_SOURCE_LABELS,
  buildArtifactCutPlacement,
  countArtifactIntakeItems,
  isArtifactPlacedOn,
  isArtifactUnused,
  selectArtifactIntakeItems,
  unusedArtifactPruneCandidates,
  type ArtifactCutPlacement,
  type ArtifactIntakeItem,
  type ArtifactIntakeSource,
  type ArtifactIntakeTray,
} from "./studio-artifact-intake-tray";

import { cn } from "@/shared/lib/utils";

export interface ArtifactIntakeTrayPage {
  readonly id: string;
  readonly label: string;
}

export interface StudioArtifactIntakeTrayProps {
  readonly tray: ArtifactIntakeTray;
  /** 배치 대상 컷 목록. */
  readonly pages: readonly ArtifactIntakeTrayPage[];
  /** 처음 선택될 대상 컷. 없으면 목록의 첫 컷. */
  readonly currentPageId?: string | null;
  /** 배치 지시를 호스트에 넘긴다 — 호스트가 레이어/노트를 만들고 트레이를 갱신한다. */
  readonly onPlaceArtifact: (placement: ArtifactCutPlacement) => void;
  /** 버리기/정리 요청. 없으면 버리기·정리 UI를 숨긴다. */
  readonly onDiscardArtifacts?: (artifactIds: readonly string[]) => void;
  /** 특정 컷의 배치 취소 요청. 없으면 배치 취소 UI를 숨긴다. */
  readonly onRemovePlacement?: (artifactId: string, pageId: string) => void;
}

const SOURCE_ICONS: Readonly<
  Record<ArtifactIntakeSource, typeof FileText>
> = Object.freeze({
  "plan-draft": FileText,
  "capture-3d": Box,
  "generated-image": Sparkles,
});

const SOURCE_FILTERS: readonly (ArtifactIntakeSource | "all")[] = [
  "all",
  "plan-draft",
  "capture-3d",
  "generated-image",
] as const;

export function StudioArtifactIntakeTray(
  props: StudioArtifactIntakeTrayProps,
): ReactElement {
  const { tray, pages } = props;
  const [sourceFilter, setSourceFilter] = useState<ArtifactIntakeSource | "all">("all");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [targetPageId, setTargetPageId] = useState<string>(
    props.currentPageId ?? pages[0]?.id ?? "",
  );

  const counts = useMemo(() => countArtifactIntakeItems(tray), [tray]);
  const pruneCandidates = useMemo(() => unusedArtifactPruneCandidates(tray), [tray]);
  const visibleItems = useMemo(
    () =>
      selectArtifactIntakeItems(tray, {
        source: sourceFilter,
        usage: unusedOnly ? "unused" : "all",
        query,
      }),
    [tray, sourceFilter, unusedOnly, query],
  );

  const pageLabelById = useMemo(
    () => new Map(pages.map((page) => [page.id, page.label])),
    [pages],
  );
  const targetPage = pages.find((page) => page.id === targetPageId) ?? pages[0];

  return (
    <section aria-label="가져오기 트레이" className="flex flex-col gap-3 p-3 text-white">
      <header className="flex items-center gap-2">
        <Inbox size={16} aria-hidden />
        <h3 className="text-sm font-semibold">가져오기</h3>
        <span className="text-xs text-white/60">
          전체 {counts.total} · 미사용 {counts.unused}
        </span>
        {props.onDiscardArtifacts && pruneCandidates.length > 0 ? (
          <button
            type="button"
            className="ml-auto rounded-md border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
            onClick={() => props.onDiscardArtifacts?.(pruneCandidates)}
          >
            오래된 미사용 {pruneCandidates.length}개 정리
          </button>
        ) : null}
      </header>

      <p className="text-xs leading-relaxed text-white/60">
        기획·3D·생성 모드에서 만든 산출물이 여기에 쌓여요. 골라서 컷에 배치하세요.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-white/70">
          대상 컷
          <select
            aria-label="대상 컷"
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
            value={targetPage?.id ?? ""}
            onChange={(event) => setTargetPageId(event.target.value)}
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          aria-label="산출물 검색"
          placeholder="제목·내용 검색"
          className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white placeholder:text-white/40"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="flex items-center gap-1 text-xs text-white/70">
          <input
            type="checkbox"
            checked={unusedOnly}
            onChange={(event) => setUnusedOnly(event.target.checked)}
          />
          미사용만
        </label>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="출처 필터">
        {SOURCE_FILTERS.map((source) => (
          <button
            key={source}
            type="button"
            aria-pressed={sourceFilter === source}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs",
              sourceFilter === source
                ? "border-white/60 bg-white/15 text-white"
                : "border-white/15 text-white/60 hover:bg-white/10",
            )}
            onClick={() => setSourceFilter(source)}
          >
            {source === "all" ? "전체" : ARTIFACT_INTAKE_SOURCE_LABELS[source]}
          </button>
        ))}
      </div>

      {tray.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/50">
          {r4CreatorStatusText("r4cat1.creator.artifactTray.empty", "아직 들어온 산출물이 없어요. 기획에서 초안을 쓰거나, 3D 캡처·이미지 생성을 하면 여기에 자동으로 쌓입니다.")}
        </p>
      ) : visibleItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/50">
          {r3c07StatusText("studio.panelStatus.r3c07.artifactIntake.filterEmpty", "조건에 맞는 산출물이 없어요. 필터를 바꾸거나 검색어를 지워 보세요.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleItems.map((item) => (
            <ArtifactIntakeTrayCard
              key={item.id}
              item={item}
              targetPage={targetPage}
              pageLabelById={pageLabelById}
              onPlaceArtifact={props.onPlaceArtifact}
              onDiscardArtifacts={props.onDiscardArtifacts}
              onRemovePlacement={props.onRemovePlacement}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ArtifactIntakeTrayCard(props: {
  readonly item: ArtifactIntakeItem;
  readonly targetPage: ArtifactIntakeTrayPage | undefined;
  readonly pageLabelById: ReadonlyMap<string, string>;
  readonly onPlaceArtifact: (placement: ArtifactCutPlacement) => void;
  readonly onDiscardArtifacts?: (artifactIds: readonly string[]) => void;
  readonly onRemovePlacement?: (artifactId: string, pageId: string) => void;
}): ReactElement {
  const { item, targetPage } = props;
  const SourceIcon = SOURCE_ICONS[item.source];
  const placedOnTarget = targetPage ? isArtifactPlacedOn(item, targetPage.id) : false;
  const placement = targetPage ? buildArtifactCutPlacement(item, targetPage.id) : null;

  return (
    <li className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2">
      {item.kind === "image" && item.previewSrc ? (
        <img
          src={item.previewSrc}
          alt={item.title}
          className="h-14 w-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white/5 text-white/50">
          {item.kind === "image" ? (
            <ImageIcon size={20} aria-hidden />
          ) : (
            <FileText size={20} aria-hidden />
          )}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <SourceIcon size={13} aria-hidden />
          <span className="text-[11px] text-white/60">
            {ARTIFACT_INTAKE_SOURCE_LABELS[item.source]}
          </span>
          <span className="text-[11px] text-white/40">{item.createdAt.slice(0, 10)}</span>
          {isArtifactUnused(item) ? (
            <span className="rounded-full bg-amber-400/15 px-1.5 py-px text-[11px] text-amber-200">
              미사용
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm font-medium" title={item.title}>
          {item.title}
        </p>
        {item.kind === "text" && item.text ? (
          <p className="line-clamp-2 text-xs text-white/60">{item.text}</p>
        ) : null}
        {item.placedPageIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {item.placedPageIds.map((pageId) => (
              <span
                key={pageId}
                className="rounded-full bg-emerald-400/15 px-1.5 py-px text-[11px] text-emerald-200"
              >
                {props.pageLabelById.get(pageId) ?? pageId}에 배치됨
                {props.onRemovePlacement ? (
                  <button
                    type="button"
                    aria-label={`${item.title}의 ${props.pageLabelById.get(pageId) ?? pageId} 배치 취소`}
                    className="ml-1 text-emerald-100/70 hover:text-emerald-50"
                    onClick={() => props.onRemovePlacement?.(item.id, pageId)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-auto flex gap-1.5 pt-1">
          <button
            type="button"
            disabled={!placement || placedOnTarget}
            className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-black disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
            onClick={() => {
              if (placement) props.onPlaceArtifact(placement);
            }}
          >
            {placedOnTarget
              ? "이 컷에 배치됨"
              : targetPage
                ? `${targetPage.label}에 배치`
                : "배치할 컷 없음"}
          </button>
          {props.onDiscardArtifacts ? (
            <button
              type="button"
              aria-label={`${item.title} 버리기`}
              className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={() => props.onDiscardArtifacts?.([item.id])}
            >
              <Trash2 size={12} aria-hidden />
              버리기
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
