import { useEffect, useMemo, useRef } from "react";

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { useDrawSelector, useLab } from "../shell/lab-context";
import { catalogFamilies, FAMILY_LABELS, filterPresets } from "../state/draw-program";
import { messageOf } from "../state/run-compare";

import { ImageCanvas } from "./LaneCanvas";

import type { BrushProgram } from "../../engine/presets/program-schema";
import type { GalleryRenderer } from "../../platform/worker-client";
import type { DrawActions, DrawPreviewEntry, DrawStore } from "../state/draw-store";

/** 미리보기용 짧은 획: `curve` fixture를 128²로 렌더한다(갤러리 Worker, cpu-reference 경로). */
export const DRAW_PREVIEW_FIXTURE = "curve";
export const DRAW_PREVIEW_SIZE = 128;
/** 동시에 요청하는 미리보기 수(Worker는 1개라 큐 길이만 제한한다). */
const PREVIEW_CONCURRENCY = 2;
/** 첫 요청을 이 시간(ms)만큼 미뤄 탭 첫 화면·입력 반응을 먼저 보여 준다(지연 생성). */
const PREVIEW_START_DELAY_MS = 60;

/**
 * 보이는 항목 중 아직 캐시에 없는 브러시의 미리보기를 Worker에 지연 요청해 `draw-store`에 캐시한다.
 * Worker 실패는 항목마다 오류로 남기고 다음으로 넘어간다(메인 스레드 대체 렌더 없음 — 무음 대체 금지).
 */
export async function renderPreviews(
  renderer: GalleryRenderer,
  store: DrawStore,
  actions: DrawActions,
  presetIds: readonly string[],
  isCancelled: () => boolean,
): Promise<void> {
  const queue = presetIds.filter((id) => store.get().previews[id] === undefined);
  for (const id of queue) actions.setPreview(id, { status: "pending", result: null, error: null });
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      if (isCancelled()) return;
      try {
        const result = await renderer.render(id, DRAW_PREVIEW_FIXTURE, DRAW_PREVIEW_SIZE);
        actions.setPreview(id, { status: "done", result, error: null });
      } catch (error) {
        actions.setPreview(id, { status: "error", result: null, error: messageOf(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: PREVIEW_CONCURRENCY }, () => worker()));
}

/**
 * 브러시 선택: 가족 칩(카탈로그에서 읽는다) + 검색 + 최근 사용. 항목마다 한글 이름과 작은 미리보기.
 */
export function DrawBrushPicker() {
  const { gallery, galleryError, drawStore, drawActions } = useLab();
  const presetId = useDrawSelector((s) => s.presetId);
  const filter = useDrawSelector((s) => s.familyFilter);
  const search = useDrawSelector((s) => s.search);
  const recentIds = useDrawSelector((s) => s.recentPresetIds);
  const previews = useDrawSelector((s) => s.previews);
  const families = useMemo(() => catalogFamilies(), []);
  const visible = useMemo(() => filterPresets(PRESET_CATALOG, filter, search, recentIds), [filter, search, recentIds]);
  const visibleKey = visible.map((p) => p.id).join(",");
  // 선택된 브러시를 먼저 요청하는 우선순위에만 쓴다(선택이 바뀌어도 효과를 다시 돌리지 않는다).
  const presetRef = useRef(presetId);
  presetRef.current = presetId;

  // 보이는 항목의 미리보기를 지연 요청한다(선택된 브러시를 맨 앞으로).
  useEffect(() => {
    if (!gallery) return undefined;
    let cancelled = false;
    const ids = visibleKey.split(",").filter((id) => id.length > 0);
    const first = presetRef.current;
    ids.sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
    const timer = setTimeout(() => {
      void renderPreviews(gallery, drawStore, drawActions, ids, () => cancelled);
    }, PREVIEW_START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gallery, visibleKey, drawStore, drawActions]);

  const chip = (id: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={id}
      type="button"
      className="lab-draw-chip"
      aria-pressed={active}
      data-testid={`lab-draw-chip-${id}`}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <section className="lab-draw-section" aria-label="브러시 선택" data-testid="lab-draw-brushes">
      <h3>브러시 ({PRESET_CATALOG.length}종)</h3>
      <div className="lab-field">
        <label htmlFor="lab-draw-search">
          <span>브러시 검색</span>
        </label>
        <input
          id="lab-draw-search"
          type="search"
          autoComplete="off"
          placeholder="이름·가족·설명(예: 수채, 연필)"
          value={search}
          onChange={(e) => drawActions.setSearch(e.target.value)}
        />
      </div>
      <div className="lab-draw-chips" role="group" aria-label="브러시 가족">
        {chip("all", "전체", filter === "all", () => drawActions.setFamilyFilter("all"))}
        {chip("recent", `최근 사용 (${recentIds.length})`, filter === "recent", () => drawActions.setFamilyFilter("recent"))}
        {families.map((f) => chip(f, FAMILY_LABELS[f], filter === f, () => drawActions.setFamilyFilter(f)))}
      </div>
      {!gallery ? (
        <p className="lab-draw-note" role="status">
          미리보기 Worker를 만들 수 없어 이름만 보여 준다: {galleryError ?? "사유 없음"} (메인 스레드로 대체 렌더하지 않는다)
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="lab-muted" role="status">
          {filter === "recent" && search.trim().length === 0
            ? "아직 고른 브러시가 없다. 목록에서 브러시를 고르면 여기에 쌓인다."
            : "조건에 맞는 브러시가 없다."}
        </p>
      ) : (
        <ul className="lab-draw-brush-list" aria-label="브러시 목록">
          {visible.map((preset) => (
            <li key={preset.id}>
              <BrushItem
                preset={preset}
                selected={preset.id === presetId}
                entry={previews[preset.id]}
                onPick={() => drawActions.setPreset(preset.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface BrushItemProps {
  preset: BrushProgram;
  selected: boolean;
  entry: DrawPreviewEntry | undefined;
  onPick: () => void;
}

function BrushItem({ preset, selected, entry, onPick }: BrushItemProps) {
  const image = entry?.status === "done" ? (entry.result?.image ?? null) : null;
  return (
    <button
      type="button"
      className="lab-draw-brush"
      aria-pressed={selected}
      data-testid={`lab-draw-brush-${preset.id}`}
      title={preset.description}
      onClick={onPick}
    >
      <span className="lab-draw-thumb" data-status={entry?.status ?? "idle"}>
        <ImageCanvas image={image} size={DRAW_PREVIEW_SIZE} label={`${preset.name} 미리보기`} />
        {entry?.status === "error" ? (
          <span className="lab-draw-thumb-note" role="img" aria-label={`미리보기 실패: ${entry.error ?? ""}`}>
            !
          </span>
        ) : null}
      </span>
      <span className="lab-draw-brush-text">
        <span className="lab-draw-brush-name">{preset.name}</span>
        <span className="lab-muted">{FAMILY_LABELS[preset.family]}</span>
      </span>
    </button>
  );
}
