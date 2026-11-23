/**
 * 스마트 TV 10ft 시어터 · 거실 스토리보드 월 · 라이브 방송 오버레이 · 무선 미러링 페어링 뷰.
 *
 * - D-Pad 키보드 방향키(ArrowUp/Down/Left/Right) 및 Enter 공간 포커스 탐색 지원
 * - 원거리(3m/10ft) 가시성을 위한 황금·코랄 이중 포커스 링(`.mde-tv-tile-focused`, OKLCH CSS 토큰)
 * - BroadcastChannel 브릿지를 통한 컷 인덱스·모드·무선 페어링 상태 실시간 동기화
 */

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cast,
  Check,
  Radio,
  RefreshCw,
  Tv,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactElement } from "react";

import {
  MULTI_DEVICE_SPRITE_PATHS,
  TV_STORYBOARD_TILES,
  moveTvSpatialFocusIndex,
  type MultiDeviceSyncBridge,
  type TvDpadDirection,
  type TvMirrorModeId,
} from "./device-form-factor-engine";

export type TvPairingStatus = "idle" | "paired" | "mirroring";

const TV_MODE_OPTIONS: readonly { readonly id: TvMirrorModeId; readonly labelKo: string; readonly summaryKo: string }[] =
  Object.freeze([
    Object.freeze({
      id: "theater-4k",
      labelKo: "4K 시어터",
      summaryKo: "3m 거실 거리에서 색감·말풍선 가독·스크롤 호흡을 원고 그대로 점검합니다.",
    }),
    Object.freeze({
      id: "storyboard-wall",
      labelKo: "거실 스토리보드 월",
      summaryKo: "6컷 연출 흐름을 TV 벽면에 펼쳐 두고 D-Pad로 컷 간 리듬을 비교합니다.",
    }),
    Object.freeze({
      id: "live-broadcast",
      labelKo: "라이브 방송 오버레이",
      summaryKo: "작화 방송 송출용 16:9 세이프 프레임과 시청자용 현재 브러시·BGM 배너를 띄웁니다.",
    }),
  ]);

const TV_GRID_COLUMNS = 3;
const PAIRING_CODE_POOL = ["TS-4829", "TS-7315", "TS-9042", "TS-2684"] as const;

export interface StudioSmartTvModeViewProps {
  readonly syncBridge?: MultiDeviceSyncBridge | null;
  readonly initialMode?: TvMirrorModeId;
  readonly onActionFeedback?: (messageKo: string) => void;
}

export function StudioSmartTvModeView({
  syncBridge = null,
  initialMode = "theater-4k",
  onActionFeedback,
}: StudioSmartTvModeViewProps): ReactElement {
  const [tvMode, setTvMode] = useState<TvMirrorModeId>(initialMode);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [pairingStatus, setPairingStatus] = useState<TvPairingStatus>("idle");
  const [pairingSeed, setPairingSeed] = useState<number>(0);
  const [broadcastPrivacyMask, setBroadcastPrivacyMask] = useState<boolean>(true);
  const [statusKo, setStatusKo] = useState<string>(
    "방향키(↑↓←→)와 Enter로 TV 10ft 타일을 이동해 보세요. 황금·코랄 포커스 링이 활성 타일을 표시합니다.",
  );

  const tileRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const pairingCode = PAIRING_CODE_POOL[pairingSeed % PAIRING_CODE_POOL.length] ?? "TS-4829";
  const activeTile = TV_STORYBOARD_TILES[selectedIndex] ?? TV_STORYBOARD_TILES[0];
  const activeModeMeta = TV_MODE_OPTIONS.find((item) => item.id === tvMode) ?? TV_MODE_OPTIONS[0];

  const notify = (message: string): void => {
    setStatusKo(message);
    onActionFeedback?.(message);
  };

  const publishTvState = (mode: TvMirrorModeId, panelIndex: number, code: string): void => {
    syncBridge?.publish({
      kind: "tv.mirror",
      mode,
      panelIndex,
      pairingCode: code,
    });
  };

  const focusTile = (nextIndex: number): void => {
    setFocusedIndex(nextIndex);
    tileRefs.current.get(nextIndex)?.focus();
    const tile = TV_STORYBOARD_TILES[nextIndex];
    if (tile) {
      notify(`D-Pad 포커스 이동: ${tile.cutCode} (${tile.titleKo})`);
    }
  };

  const selectTile = (index: number): void => {
    setFocusedIndex(index);
    setSelectedIndex(index);
    publishTvState(tvMode, index, pairingCode);
    const tile = TV_STORYBOARD_TILES[index];
    if (tile) {
      notify(`TV 시어터 활성 컷 확정: ${tile.cutCode} · ${tile.titleKo}`);
    }
  };

  const handleDpadStep = (direction: TvDpadDirection): void => {
    const next = moveTvSpatialFocusIndex(focusedIndex, direction, TV_GRID_COLUMNS, TV_STORYBOARD_TILES.length);
    focusTile(next);
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight"
    ) {
      event.preventDefault();
      handleDpadStep(event.key);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTile(focusedIndex);
    }
  };

  const handleModeChange = (mode: TvMirrorModeId): void => {
    setTvMode(mode);
    publishTvState(mode, selectedIndex, pairingCode);
    const meta = TV_MODE_OPTIONS.find((item) => item.id === mode);
    notify(`스마트 TV 모드 전환: ${meta?.labelKo ?? mode}`);
  };

  const handleCyclePairing = (): void => {
    const nextStatus: TvPairingStatus =
      pairingStatus === "idle" ? "paired" : pairingStatus === "paired" ? "mirroring" : "idle";
    setPairingStatus(nextStatus);
    publishTvState(tvMode, selectedIndex, pairingCode);
    if (nextStatus === "paired") {
      notify(`무선 미러링 PIN ${pairingCode} 페어링 완료`);
    } else if (nextStatus === "mirroring") {
      notify(`4K 무선 미러링 송출 시작 (PIN ${pairingCode})`);
    } else {
      notify("무선 미러링 연결 해제됨");
    }
  };

  const handleRegeneratePin = (): void => {
    const nextSeed = pairingSeed + 1;
    setPairingSeed(nextSeed);
    const nextCode = PAIRING_CODE_POOL[nextSeed % PAIRING_CODE_POOL.length] ?? "TS-4829";
    notify(`새 무선 페어링 코드 발급: ${nextCode}`);
  };

  const pairingTone = pairingStatus === "mirroring" ? "ready" : pairingStatus === "paired" ? "opt-in" : "fallback";
  const pairingLabel =
    pairingStatus === "mirroring"
      ? "4K 무선 미러링 중"
      : pairingStatus === "paired"
        ? "거실 TV 페어링됨"
        : "페어링 대기";

  return (
    <section
      data-testid="studio-smart-tv-mode-view"
      aria-label="스마트 TV 10ft 시어터 및 듀얼스크린 모드"
      className="mde-panel-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <img
            src={MULTI_DEVICE_SPRITE_PATHS.tv}
            alt="스마트 TV 10ft 시어터 아이콘"
            width={44}
            height={44}
            className="mde-sprite-img"
            loading="lazy"
          />
          <div>
            <h3 className="text-sm font-bold text-fg">스마트 TV 10ft 시어터 · 듀얼스크린 월</h3>
            <p className="text-xs text-fg-2">{activeModeMeta?.summaryKo}</p>
          </div>
        </div>

        <div className="mde-actions-row">
          <span className="mde-badge" data-tone={pairingTone}>
            <span className="mde-dot" aria-hidden="true" />
            {pairingLabel} · <span className="mde-num">{pairingCode}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="mde-actions-row" role="group" aria-label="스마트 TV 화면 모드">
          {TV_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="mde-chip"
              aria-pressed={tvMode === option.id}
              onClick={() => handleModeChange(option.id)}
            >
              <Tv className="size-4" aria-hidden="true" />
              {option.labelKo}
            </button>
          ))}
        </div>

        <div className="mde-actions-row">
          <button
            type="button"
            data-testid="tv-wireless-pairing-toggle"
            className="mde-btn"
            aria-pressed={pairingStatus !== "idle"}
            onClick={handleCyclePairing}
          >
            <Cast className="size-4" aria-hidden="true" />
            {pairingStatus === "idle"
              ? "무선 미러링 페어링"
              : pairingStatus === "paired"
                ? "4K 미러링 시작"
                : "미러링 종료"}
          </button>
          <button
            type="button"
            className="mde-chip"
            aria-label="페어링 PIN 재발급"
            onClick={handleRegeneratePin}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            PIN 재발급
          </button>
        </div>
      </div>

      <div className="mde-tv-stage" data-tv-mode={tvMode}>
        {tvMode === "live-broadcast" ? (
          <div className="mde-tv-broadcast-overlay" data-testid="tv-live-broadcast-banner">
            <span className="inline-flex items-center gap-1.5">
              <Radio className="size-4" aria-hidden="true" />
              LIVE 16:9 세이프 프레임 · 활성 컷 {activeTile?.cutCode}
            </span>
            <button
              type="button"
              className="mde-chip"
              aria-pressed={broadcastPrivacyMask}
              onClick={() => setBroadcastPrivacyMask((prev) => !prev)}
            >
              {broadcastPrivacyMask ? "개인 폴더 마스킹 켜짐" : "개인 폴더 마스킹 꺼짐"}
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
          <span>
            현재 시어터 출력:{" "}
            <strong className="text-fg">
              {activeTile?.cutCode} · {activeTile?.titleKo}
            </strong>
          </span>
          <span className="mde-num">{activeTile?.pacingNoteKo}</span>
        </div>

        <div
          role="grid"
          tabIndex={0}
          aria-label="스마트 TV 10ft 스토리보드 공간 포커스 그리드"
          data-testid="tv-spatial-focus-grid"
          className="mde-tv-grid"
          onKeyDown={handleGridKeyDown}
        >
          {TV_STORYBOARD_TILES.map((tile) => {
            const isFocused = focusedIndex === tile.index;
            const isSelected = selectedIndex === tile.index;
            return (
              <button
                key={tile.cutCode}
                ref={(node) => {
                  if (node) tileRefs.current.set(tile.index, node);
                  else tileRefs.current.delete(tile.index);
                }}
                type="button"
                data-testid={`tv-tile-${tile.index}`}
                data-tv-focused={isFocused ? "true" : "false"}
                aria-pressed={isSelected}
                tabIndex={isFocused ? 0 : -1}
                className={isFocused ? "mde-tv-tile mde-tv-tile-focused" : "mde-tv-tile"}
                onFocus={() => setFocusedIndex(tile.index)}
                onClick={() => selectTile(tile.index)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mde-num text-xs font-extrabold text-accent">{tile.cutCode}</span>
                  {isSelected ? (
                    <span className="mde-badge" data-tone="ready">
                      출력 중
                    </span>
                  ) : null}
                </div>
                <span className="text-sm font-bold text-fg">{tile.titleKo}</span>
                <span className="text-xs text-fg-3">{tile.pacingNoteKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs text-fg-2">리모컨 D-Pad 시뮬레이터 (황금·코랄 포커스 링 이동)</p>
          <div className="mde-dpad-pad" role="group" aria-label="TV 리모컨 방향키">
            <span aria-hidden="true" />
            <button
              type="button"
              className="mde-btn"
              aria-label="D-Pad 위"
              onClick={() => handleDpadStep("ArrowUp")}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
            <span aria-hidden="true" />
            <button
              type="button"
              className="mde-btn"
              aria-label="D-Pad 왼쪽"
              onClick={() => handleDpadStep("ArrowLeft")}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mde-btn"
              aria-label="D-Pad 확인"
              onClick={() => selectTile(focusedIndex)}
            >
              <Check className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mde-btn"
              aria-label="D-Pad 오른쪽"
              onClick={() => handleDpadStep("ArrowRight")}
            >
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <span aria-hidden="true" />
            <button
              type="button"
              className="mde-btn"
              aria-label="D-Pad 아래"
              onClick={() => handleDpadStep("ArrowDown")}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </button>
            <span aria-hidden="true" />
          </div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="text-xs text-fg-2">
        {statusKo}
      </p>
    </section>
  );
}
