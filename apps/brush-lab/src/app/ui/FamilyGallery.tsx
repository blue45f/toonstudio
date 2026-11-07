import { useEffect, useMemo, useState } from "react";

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { useLab, useLabSelector } from "../shell/lab-context";
import { messageOf } from "../state/run-compare";

import { PresetCard } from "./PresetCard";

import type { BrushFamily } from "../../engine/presets/program-schema";
import type { GalleryRenderer } from "../../platform/worker-client";
import type { LabActions, LabStore } from "../state/lab-store";

type GalleryGroupFilter = "all" | "ink" | "dry" | "wet" | "tone-fx" | "utility";

const GALLERY_GROUPS: readonly {
  id: GalleryGroupFilter;
  label: string;
  guide: string;
  families?: readonly BrushFamily[];
}[] = [
  {
    id: "all",
    label: `전체 (${PRESET_CATALOG.length})`,
    guide: "전체 브러시 카탈로그입니다. 아래 매체군 칩이나 검색창으로 작업 목적에 맞는 브러시를 빠르게 좁혀 보세요.",
  },
  {
    id: "ink",
    label: "선화·잉크·볼펜",
    guide: "웹툰 인물 펜선·외곽선·말풍선 테두리·해칭 명암 작화에 최적화된 탄성 잉크 브러시군입니다.",
    families: ["ink", "ballpoint", "hatch"],
  },
  {
    id: "dry",
    label: "연필·목탄·건식",
    guide: "콘티·러프 스케치·종이 요철이 살아 있는 드로잉 질감 표현에 적합한 건식 브러시군입니다.",
    families: ["pencil", "charcoal", "chalk", "conte", "crayon"],
  },
  {
    id: "wet",
    label: "수채·수묵·유화",
    guide: "배경 감성 채색·수분 번짐·두꺼운 불투명 물감 혼색(Kubelka-Munk K/S)에 적합한 습식 브러시군입니다.",
    families: ["watercolor", "sumi", "gouache", "oil", "acrylic"],
  },
  {
    id: "tone-fx",
    label: "마커·망점·특수",
    guide: "스크린톤 망점·에어브러시 그라데이션·하이라이트 특수 효과 연출에 쓰이는 브러시군입니다.",
    families: ["marker", "halftone", "texture", "airbrush", "spray", "special"],
  },
  {
    id: "utility",
    label: "문지르기·지우개",
    guide: "경계선 블렌딩(스머지)과 깔끔한 선 정리용 지우개 도구군입니다.",
    families: ["smudge", "eraser"],
  },
];

/** 동시에 띄우는 Worker 요청 수. Worker 1개이므로 큐 길이만 제한한다. */
const GALLERY_CONCURRENCY = 2;

/**
 * 모든 프리셋을 같은 fixture·크기로 Worker에 순차 요청한다. 결과는 저장소에 쌓여 탭 전환 후에도 남는다.
 * Worker 실패는 해당 카드의 오류로 남고 다음 프리셋으로 넘어간다(무음 대체 없음).
 */
export async function renderGallery(
  gallery: GalleryRenderer,
  store: LabStore,
  actions: LabActions,
  presetIds: readonly string[],
): Promise<void> {
  const { fixtureId, size } = store.get().gallery;
  actions.setGalleryStatus("running");
  for (const id of presetIds) actions.setGalleryEntry(id, { status: "pending", result: null, error: null });
  const queue = [...presetIds];
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const result = await gallery.render(id, fixtureId, size);
        actions.setGalleryEntry(id, { status: "done", result, error: null });
      } catch (error) {
        actions.setGalleryEntry(id, { status: "error", result: null, error: messageOf(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: GALLERY_CONCURRENCY }, () => worker()));
  actions.setGalleryStatus("done");
}

export function FamilyGallery() {
  const { gallery, galleryError, store, actions } = useLab();
  const state = useLabSelector((s) => s.gallery);
  const [groupFilter, setGroupFilter] = useState<GalleryGroupFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    if (!gallery || state.status !== "idle") return;
    void renderGallery(gallery, store, actions, PRESET_CATALOG.map((p) => p.id));
  }, [gallery, state.status, store, actions]);

  const activeGroup = useMemo(
    () => GALLERY_GROUPS.find((g) => g.id === groupFilter) ?? GALLERY_GROUPS[0],
    [groupFilter],
  );

  const filteredPresets = useMemo(() => {
    const allowed = activeGroup?.families ? new Set<BrushFamily>(activeGroup.families) : null;
    const q = searchQuery.trim().toLowerCase();
    return PRESET_CATALOG.filter((p) => {
      if (allowed && !allowed.has(p.family)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.family.toLowerCase().includes(q)
      );
    });
  }, [activeGroup, searchQuery]);

  const entries = Object.values(state.entries);
  const done = entries.filter((e) => e.status === "done").length;
  const failed = entries.filter((e) => e.status === "error").length;
  const open = (presetId: string): void => {
    actions.setPreset(presetId);
    actions.setTab("compare");
  };
  return (
    <div className="lab-tabpanel">
      <div className="lab-button-row">
        <span aria-live="polite">
          {gallery
            ? `${state.status === "idle" ? "대기" : state.status === "running" ? "렌더 중" : "완료"} · ${done}/${PRESET_CATALOG.length} 완료${failed > 0 ? ` · 실패 ${failed}` : ""} · fixture ${state.fixtureId} ${state.size}² · cpu-reference 경로(Worker)`
            : "갤러리 Worker를 만들 수 없다."}
        </span>
        <button
          type="button"
          className="lab-button"
          disabled={!gallery || state.status === "running"}
          onClick={() => actions.resetGallery()}
        >
          다시 렌더
        </button>
      </div>
      <div className="lab-chip-row" role="group" aria-label="갤러리 매체군 빠른 필터">
        {GALLERY_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className="lab-chip"
            aria-pressed={groupFilter === group.id}
            onClick={() => setGroupFilter(group.id)}
          >
            {group.label}
          </button>
        ))}
      </div>
      <div className="lab-button-row" data-testid="lab-gallery-group-guide">
        <span className="lab-muted">{activeGroup?.guide}</span>
        <input
          type="search"
          className="lab-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="브러시 이름·ID 검색 (예: G펜, 수채, 6b)"
          aria-label="브러시 이름 또는 ID 검색"
          data-testid="lab-gallery-search-input"
        />
        {searchQuery.trim().length > 0 ? (
          <button type="button" className="lab-button" onClick={() => setSearchQuery("")}>
            검색 지우기
          </button>
        ) : null}
      </div>
      {!gallery ? (
        <p className="lab-error-list" role="alert">
          갤러리 렌더러 없음: {galleryError ?? "사유 없음"} (무음 대체 없음 — 메인 스레드로 대체 렌더하지 않는다)
        </p>
      ) : null}
      <div className="lab-gallery" role="list" aria-label="브러시 가족 갤러리">
        {filteredPresets.map((preset) => (
          <div role="listitem" key={preset.id}>
            <PresetCard preset={preset} entry={state.entries[preset.id]} onOpen={open} />
          </div>
        ))}
      </div>
    </div>
  );
}
