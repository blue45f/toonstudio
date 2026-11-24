/**
 * 공간 컴퓨팅 플로팅 멀티컷 라이트박스 · 3D 피드백 스티커 · 동료 포인터 섹션.
 *
 * - 공중 컷 배치 모드(곡면 아크 / 2열 그리드), 컷 추가, 핀 고정, 단계 순환,
 *   3D 좌표 고정 피드백 스티커 작성/해결, 동료 3D 포인터 동기화 현황을 표시한다.
 * - Calm Atelier 시맨틱 토큰 전용.
 */

import { CheckCircle2, MousePointer2, Pin, PinOff, Plus, StickyNote } from "lucide-react";
import type { ReactElement } from "react";

import {
  CUT_STAGE_LABEL_KO,
  STICKER_CATEGORY_LABEL_KO,
  type FeedbackStickerCategory,
  type FloatingLightboxCut,
  type LightboxLayoutMode,
  type SpatialDeskSnapshot,
  type SpatialFeedbackSticker,
} from "./spatial-computing-desk";

export interface SpatialLightboxDeskSectionProps {
  readonly deskSnapshot: SpatialDeskSnapshot;
  readonly selectedCut: FloatingLightboxCut | null;
  readonly visibleStickers: readonly SpatialFeedbackSticker[];
  readonly stickerCategory: FeedbackStickerCategory;
  readonly stickerDraft: string;
  readonly onSelectCut: (cutId: string) => void;
  readonly onArrangeLightbox: (mode: LightboxLayoutMode) => void;
  readonly onAddFloatingCut: () => void;
  readonly onToggleCutPin: (cutId: string) => void;
  readonly onAdvanceCutStage: (cutId: string) => void;
  readonly onChangeStickerCategory: (category: FeedbackStickerCategory) => void;
  readonly onChangeStickerDraft: (draft: string) => void;
  readonly onAttachSticker: () => void;
  readonly onToggleStickerResolved: (stickerId: string) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE_CHIP = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

export function SpatialLightboxDeskSection({
  deskSnapshot,
  selectedCut,
  visibleStickers,
  stickerCategory,
  stickerDraft,
  onSelectCut,
  onArrangeLightbox,
  onAddFloatingCut,
  onToggleCutPin,
  onAdvanceCutStage,
  onChangeStickerCategory,
  onChangeStickerDraft,
  onAttachSticker,
  onToggleStickerResolved,
}: SpatialLightboxDeskSectionProps): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      {/* 공중 플로팅 멀티컷 라이트박스 */}
      <div className="rounded-xl border border-line bg-canvas p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <div>
            <h4 className="text-xs font-bold text-fg">
              공중 플로팅 멀티컷 라이트박스 스토리보드
            </h4>
            <p className="text-[11px] tabular-nums text-fg-3">
              CRDT Clock #{deskSnapshot.lamportClock} · 수렴 해시 {deskSnapshot.convergenceDigest} ·
              고정 {deskSnapshot.pinnedCutCount}컷
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={deskSnapshot.layoutMode === "curved-arc"}
              onClick={() => onArrangeLightbox("curved-arc")}
              className={deskSnapshot.layoutMode === "curved-arc" ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
            >
              <span>곡면 아크</span>
            </button>
            <button
              type="button"
              aria-pressed={deskSnapshot.layoutMode === "dual-row-grid"}
              onClick={() => onArrangeLightbox("dual-row-grid")}
              className={
                deskSnapshot.layoutMode === "dual-row-grid" ? BTN_ACTIVE_CHIP : BTN_OUTLINE
              }
            >
              <span>2열 그리드</span>
            </button>
            <button type="button" onClick={onAddFloatingCut} className={BTN_PRIMARY}>
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>컷 배치</span>
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {deskSnapshot.cuts.map((cut) => {
            const isSelected = cut.cutId === selectedCut?.cutId;
            return (
              <div
                key={cut.cutId}
                className={`flex flex-col gap-2 rounded-lg border p-2.5 transition-colors motion-reduce:transition-none ${
                  isSelected ? "border-accent bg-accent-soft" : "border-line bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectCut(cut.cutId)}
                    className={`flex-1 cursor-pointer text-left ${FOCUS_RING}`}
                  >
                    <div className="text-xs font-bold text-fg">
                      #{cut.cutNumber} {cut.titleKo}
                    </div>
                    <div className="text-[11px] text-fg-3">{cut.sceneTagKo}</div>
                  </button>

                  <button
                    type="button"
                    aria-label={`${cut.titleKo} 핀 고정 전환`}
                    aria-pressed={cut.pinned}
                    onClick={() => onToggleCutPin(cut.cutId)}
                    className={cut.pinned ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
                  >
                    {cut.pinned ? (
                      <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{cut.pinned ? "고정됨" : "핀 고정"}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] tabular-nums text-fg-2">
                  <span>
                    3D ({cut.pose.position.x.toFixed(2)}, {cut.pose.position.y.toFixed(2)},{" "}
                    {cut.pose.position.z.toFixed(2)}m) · Yaw {cut.pose.rotationYDeg}°
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdvanceCutStage(cut.cutId)}
                    className={`cursor-pointer rounded-md border border-line bg-raised px-2 py-1 text-[11px] font-semibold text-fg hover:border-line-strong ${FOCUS_RING}`}
                  >
                    {CUT_STAGE_LABEL_KO[cut.stage]}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3D 공간 고정 피드백 스티커 */}
      <div className="rounded-xl border border-line bg-canvas p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <StickyNote className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <h4 className="text-xs font-bold text-fg">
              3D 공간 고정 피드백 스티커{selectedCut ? ` · #${selectedCut.cutNumber}` : ""}
            </h4>
          </div>
          <span className="text-[11px] tabular-nums text-fg-3">
            미해결 {deskSnapshot.unresolvedStickerCount}건
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            aria-label="피드백 스티커 분류"
            value={stickerCategory}
            onChange={(e) => onChangeStickerCategory(e.target.value as FeedbackStickerCategory)}
            className={`min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg ${FOCUS_RING}`}
          >
            {(Object.keys(STICKER_CATEGORY_LABEL_KO) as FeedbackStickerCategory[]).map((key) => (
              <option key={key} value={key}>
                {STICKER_CATEGORY_LABEL_KO[key]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={stickerDraft}
            onChange={(e) => onChangeStickerDraft(e.target.value)}
            placeholder="3D 좌표에 고정할 피드백 메모 입력"
            aria-label="3D 피드백 스티커 내용"
            className={`min-h-11 flex-1 rounded-lg border border-line bg-card px-3 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
          />
          <button
            type="button"
            onClick={onAttachSticker}
            disabled={stickerDraft.trim().length === 0}
            className={BTN_PRIMARY}
          >
            <span>스티커 고정</span>
          </button>
        </div>

        <ul className="mt-2.5 flex flex-col gap-2">
          {visibleStickers.length === 0 ? (
            <li className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-3">
              선택한 컷에 고정된 3D 피드백 스티커가 없습니다.
            </li>
          ) : (
            visibleStickers.map((sticker) => (
              <li
                key={sticker.stickerId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-raised px-1.5 py-0.5 font-semibold text-accent">
                      {STICKER_CATEGORY_LABEL_KO[sticker.category]}
                    </span>
                    <span className="font-semibold text-fg">{sticker.authorNameKo}</span>
                    <span className="tabular-nums text-fg-3">
                      ({sticker.anchorPosition.x.toFixed(2)},{" "}
                      {sticker.anchorPosition.y.toFixed(2)},{" "}
                      {sticker.anchorPosition.z.toFixed(2)}m)
                    </span>
                  </div>
                  <p
                    className={`text-xs ${
                      sticker.resolved ? "line-through text-fg-3" : "text-fg"
                    }`}
                  >
                    {sticker.bodyKo}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleStickerResolved(sticker.stickerId)}
                  className={sticker.resolved ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{sticker.resolved ? "해결됨" : "해결 표시"}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* 동료 실시간 3D 포인터 / 드로잉 테이블 동기화 */}
      <div className="rounded-xl border border-line bg-canvas p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MousePointer2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
            <h4 className="text-xs font-bold text-fg">
              동료 실시간 3D 포인터 · 드로잉 테이블 동기화
            </h4>
          </div>
          <span className="text-[11px] tabular-nums text-good">
            작업 중 {deskSnapshot.activeDrawingPeerCount}명
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {deskSnapshot.pointers.map((ptr) => (
            <div
              key={ptr.peerId}
              className="rounded-lg border border-line bg-card px-3 py-2 text-[11px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-fg">{ptr.displayNameKo}</span>
                <span className="text-accent">{ptr.activeToolKo}</span>
              </div>
              <div className="mt-1 tabular-nums text-fg-3">
                포인터 대상: {ptr.hoveredCutId ?? "테이블"} · 데스크 (
                {ptr.deskContactM.x.toFixed(2)}, {ptr.deskContactM.z.toFixed(2)}m)
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
