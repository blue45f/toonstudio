/**
 * 3D 배경 시그니처 웹툰 카메라 앵글 12종 프리셋 & 사용자 북마크 패널.
 *
 * `StudioBg3dCompositionLensPanel` 내부에서 3D 배경 카메라 런타임에 연결되어
 * 원클릭 12종 시그니처 구도 적용 및 현재 3D 뷰의 사용자 북마크 저장·전환을 수행한다.
 */

import { Bookmark, BookmarkPlus, Camera, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { StudioBg3dCameraSettings } from "../bg3d/studio-bg3d-scene-document";
import {
  WEBTOON_CAMERA_CATEGORY_LABELS,
  WEBTOON_SIGNATURE_CAMERA_ANGLES,
  createCameraAngleBookmark,
  extractCameraAnglePose,
  loadCameraAngleBookmarks,
  removeCameraAngleBookmark,
  resolveCameraSettingsFromAnglePose,
  saveCameraAngleBookmarks,
  upsertCameraAngleBookmark,
  type WebtoonCameraAngleBookmark,
  type WebtoonCameraAngleCategory,
  type WebtoonSignatureAngleId,
  type WebtoonSignatureCameraPreset,
} from "./webtoon-camera-angles";

import { cn } from "@/shared/lib/utils";

export interface StudioCameraAngleBookmarkPanelProps {
  readonly baseCamera?: StudioBg3dCameraSettings;
  readonly disabled?: boolean;
  readonly onApplyCamera?: (camera: StudioBg3dCameraSettings) => void;
  readonly onCaptureCurrentShot?: () => void;
}

const CATEGORIES: readonly ("all" | WebtoonCameraAngleCategory)[] = [
  "all",
  "action",
  "dialogue",
  "drama",
  "establishing",
];

function formatPoseSummary(pose: {
  readonly fovDeg: number;
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly rollDeg: number;
  readonly distance: number;
}): string {
  const parts = [
    `FOV ${Math.round(pose.fovDeg)}°`,
    `피치 ${pose.pitchDeg >= 0 ? "+" : ""}${Math.round(pose.pitchDeg)}°`,
    `요 ${Math.round(pose.yawDeg)}°`,
    `거리 ${pose.distance.toFixed(1)}m`,
  ];
  if (Math.abs(pose.rollDeg) >= 0.5) {
    parts.push(`롤 ${pose.rollDeg >= 0 ? "+" : ""}${Math.round(pose.rollDeg)}°`);
  }
  return parts.join(" · ");
}

export function StudioCameraAngleBookmarkPanel({
  baseCamera,
  disabled = false,
  onApplyCamera,
  onCaptureCurrentShot,
}: StudioCameraAngleBookmarkPanelProps) {
  const [category, setCategory] = useState<"all" | WebtoonCameraAngleCategory>("all");
  const [activePresetId, setActivePresetId] = useState<WebtoonSignatureAngleId | null>(null);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<readonly WebtoonCameraAngleBookmark[]>(() =>
    loadCameraAngleBookmarks(),
  );
  const [bookmarkName, setBookmarkName] = useState("");
  const [bookmarkCutLabel, setBookmarkCutLabel] = useState("컷 1");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const visiblePresets = useMemo(
    () =>
      category === "all"
        ? WEBTOON_SIGNATURE_CAMERA_ANGLES
        : WEBTOON_SIGNATURE_CAMERA_ANGLES.filter((preset) => preset.category === category),
    [category],
  );

  const canApply = !disabled && Boolean(baseCamera) && Boolean(onApplyCamera);

  const handleApplyPreset = (preset: WebtoonSignatureCameraPreset) => {
    if (!canApply || !baseCamera || !onApplyCamera) return;
    const nextCamera = resolveCameraSettingsFromAnglePose(preset, baseCamera);
    onApplyCamera(nextCamera);
    setActivePresetId(preset.id);
    setActiveBookmarkId(null);
    setStatusMessage(`"${preset.nameKo}" 구도를 3D 카메라에 적용했습니다.`);
  };

  const handleApplyBookmark = (bookmark: WebtoonCameraAngleBookmark) => {
    if (!canApply || !baseCamera || !onApplyCamera) return;
    const nextCamera = resolveCameraSettingsFromAnglePose(bookmark, baseCamera, [0, 0, 0]);
    onApplyCamera(nextCamera);
    setActiveBookmarkId(bookmark.id);
    setActivePresetId(bookmark.sourcePresetId);
    setStatusMessage(`저장한 북마크 "${bookmark.name}" 시점으로 전환했습니다.`);
  };

  const handleSaveCurrentBookmark = () => {
    if (!baseCamera || disabled) return;
    const fallbackName =
      bookmarkName.trim()
      || (activePresetId
        ? `${WEBTOON_SIGNATURE_CAMERA_ANGLES.find((p) => p.id === activePresetId)?.nameKo ?? "앵글"} 커스텀`
        : `내 구도 ${bookmarks.length + 1}`);
    const pose = extractCameraAnglePose(baseCamera, [0, 0, 0]);
    const created = createCameraAngleBookmark({
      name: fallbackName,
      cutLabel: bookmarkCutLabel.trim() || "공통 컷",
      pose,
      sourcePresetId: activePresetId,
    });
    const nextList = upsertCameraAngleBookmark(bookmarks, created);
    setBookmarks(nextList);
    saveCameraAngleBookmarks(nextList);
    setActiveBookmarkId(created.id);
    setBookmarkName("");
    setStatusMessage(`현재 3D 앵글을 "${created.name}" 북마크로 저장했습니다.`);
  };

  const handleDeleteBookmark = (bookmarkId: string) => {
    const nextList = removeCameraAngleBookmark(bookmarks, bookmarkId);
    setBookmarks(nextList);
    saveCameraAngleBookmarks(nextList);
    if (activeBookmarkId === bookmarkId) {
      setActiveBookmarkId(null);
    }
  };

  return (
    <section
      aria-label="웹툰 시그니처 3D 카메라 앵글 12종 북마크"
      data-testid="studio-camera-angle-bookmark-panel"
      className="space-y-3 border-t border-line pt-3 text-fg"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-fg [word-break:keep-all]">
            <Camera className="size-4 shrink-0 text-accent" aria-hidden="true" />
            웹툰 시그니처 앵글 12종 & 북마크
          </h4>
          <p className="mt-0.5 text-xs leading-5 text-fg-2 [word-break:keep-all]">
            원클릭으로 대표 웹툰 카메라 구도를 적용하고 자주 쓰는 각도를 로컬 북마크로 전환합니다.
          </p>
        </div>
        <span className="rounded-lg border border-line bg-panel px-2 py-1 text-[0.6875rem] font-semibold tabular-nums text-fg-2">
          12종 · 북마크 {bookmarks.length}
        </span>
      </header>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="카메라 앵글 분류">
        {CATEGORIES.map((cat) => {
          const selected = category === cat;
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategory(cat)}
              className={cn(
                "min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all] motion-reduce:transition-none",
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              {WEBTOON_CAMERA_CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* 12종 시그니처 앵글 프리셋 그리드 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="signature-angle-grid">
        {visiblePresets.map((preset) => {
          const selected = activePresetId === preset.id && activeBookmarkId === null;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={!canApply}
              aria-pressed={selected}
              title={preset.descriptionKo}
              onClick={() => handleApplyPreset(preset)}
              className={cn(
                "flex min-h-11 flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 [word-break:keep-all] motion-reduce:transition-none",
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg hover:bg-raised",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2 text-xs font-bold">
                <span>{preset.nameKo}</span>
                <span className="shrink-0 text-[0.6875rem] font-medium text-fg-3">
                  {preset.sceneCueKo}
                </span>
              </span>
              <span className="text-[0.6875rem] tabular-nums text-fg-2">
                {formatPoseSummary(preset)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 사용자 북마크 저장 */}
      <div className="space-y-2 border-t border-line/60 pt-3">
        <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Bookmark className="size-3.5 text-accent" aria-hidden="true" />
          내 카메라 앵글 북마크 (₩0 로컬 저장)
        </span>
        <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
          <input
            type="text"
            aria-label="새 북마크 이름"
            value={bookmarkName}
            maxLength={32}
            disabled={disabled || !baseCamera}
            onChange={(event) => setBookmarkName(event.target.value)}
            placeholder="북마크 이름 (예: 옥상 대치 앵글)"
            className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs text-fg outline-none focus:border-accent disabled:opacity-50"
          />
          <input
            type="text"
            aria-label="북마크 컷 메모"
            value={bookmarkCutLabel}
            maxLength={16}
            disabled={disabled || !baseCamera}
            onChange={(event) => setBookmarkCutLabel(event.target.value)}
            placeholder="컷 번호"
            className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="button"
            disabled={disabled || !baseCamera}
            onClick={handleSaveCurrentBookmark}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-xs font-bold text-on-accent hover:opacity-90 disabled:opacity-50 [word-break:keep-all]"
          >
            <BookmarkPlus className="size-4" aria-hidden="true" />
            현재 앵글 저장
          </button>
        </div>

        {bookmarks.length > 0 ? (
          <ul className="space-y-1.5" data-testid="camera-angle-bookmark-list">
            {bookmarks.map((bm) => {
              const selected = activeBookmarkId === bm.id;
              return (
                <li
                  key={bm.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5",
                    selected ? "border-accent bg-accent-soft" : "border-line bg-panel",
                  )}
                >
                  <button
                    type="button"
                    disabled={!canApply}
                    onClick={() => handleApplyBookmark(bm)}
                    className="min-h-11 min-w-0 flex-1 text-left disabled:opacity-50"
                  >
                    <span className="block truncate text-xs font-bold text-fg">
                      {bm.name} <span className="font-normal text-fg-3">· {bm.cutLabel}</span>
                    </span>
                    <span className="block text-[0.6875rem] tabular-nums text-fg-2">
                      {formatPoseSummary(bm)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${bm.name} 북마크 삭제`}
                    onClick={() => handleDeleteBookmark(bm.id)}
                    className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 hover:border-bad hover:text-bad"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-fg-3">
            아직 저장한 북마크가 없습니다. 원하는 구도로 카메라를 맞춘 뒤 &lsquo;현재 앵글 저장&rsquo;을 눌러 반복 호출하세요.
          </p>
        )}

        {onCaptureCurrentShot ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onCaptureCurrentShot}
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg hover:bg-raised disabled:opacity-50 [word-break:keep-all]"
          >
            적용된 앵글을 장면 컷 목록에 고정
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <p role="status" className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg-2">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
