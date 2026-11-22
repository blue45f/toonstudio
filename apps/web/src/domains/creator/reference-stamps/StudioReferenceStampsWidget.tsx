/**
 * 캐릭터 4방향 턴어라운드 비율 시트 & 손 포즈 24종 밑그림 스탬프 위젯.
 *
 * 6~8등신 선택(눈·턱·어깨·허리·무릎 기준선)과 정면·반측면·측면·후면 4방향 시트,
 * 그리고 웹툰 빈출 손 포즈 24종 와이어프레임 스탬프를 생성·복사·저장·삽입한다.
 */

import { Check, Copy, Download, FlipHorizontal2, Hand, Layers2, Search, UserRound } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type ReactElement } from "react";

import {
  buildHandPoseStampSvg,
  filterHandPoseStamps,
  HAND_POSE_STAMP_CATEGORY_LABELS,
  HAND_POSE_WIREFRAME_STAMPS,
  type HandPoseStampCategory,
} from "./hand-pose-stamps-catalog";
import {
  buildTurnaroundSheetSvg,
  REFERENCE_STAMP_PALETTES,
  TURNAROUND_HEAD_RATIOS,
  TURNAROUND_VIEWS,
  type ReferenceStampInkStyle,
  type TurnaroundHeadRatio,
} from "./turnaround-sheet-svg";

import { cn } from "@/shared/lib/utils";

export interface ReferenceStampInsertPayload {
  readonly kind: "turnaround-sheet" | "hand-pose-stamp";
  readonly id: string;
  readonly nameKo: string;
  readonly svg: string;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface StudioReferenceStampsWidgetProps {
  readonly initialTab?: "turnaround" | "hand-stamps";
  readonly onInsertStamp?: (payload: ReferenceStampInsertPayload) => void;
  readonly className?: string;
}

const INK_STYLES: readonly ReferenceStampInkStyle[] = ["blueprint", "graphite", "magenta-rough"];
const HAND_CATEGORIES: readonly (HandPoseStampCategory | "all")[] = [
  "all",
  "basic",
  "emotion",
  "prop-action",
  "portrait",
];

function triggerSvgDownload(fileName: string, svg: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

export function StudioReferenceStampsWidget({
  initialTab = "turnaround",
  onInsertStamp,
  className,
}: StudioReferenceStampsWidgetProps): ReactElement {
  const [activeTab, setActiveTab] = useState<"turnaround" | "hand-stamps">(initialTab);
  const [headRatio, setHeadRatio] = useState<TurnaroundHeadRatio>(7);
  const [inkStyle, setInkStyle] = useState<ReferenceStampInkStyle>("blueprint");
  const [showLabels, setShowLabels] = useState(true);
  const [showJoints, setShowJoints] = useState(true);
  const [handCategory, setHandCategory] = useState<HandPoseStampCategory | "all">("all");
  const [handQuery, setHandQuery] = useState("");
  const [selectedHandId, setSelectedHandId] = useState<string>(
    HAND_POSE_WIREFRAME_STAMPS[0]?.id ?? "fist",
  );
  const [flipHandHorizontal, setFlipHandHorizontal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const turnaroundSheet = useMemo(
    () =>
      buildTurnaroundSheetSvg({
        headRatio,
        style: inkStyle,
        showLabels,
        showJoints,
      }),
    [headRatio, inkStyle, showJoints, showLabels],
  );

  const filteredHandStamps = useMemo(
    () => filterHandPoseStamps(handCategory, handQuery),
    [handCategory, handQuery],
  );

  const selectedHandStamp = useMemo(() => {
    const matched = HAND_POSE_WIREFRAME_STAMPS.find((item) => item.id === selectedHandId);
    return matched ?? HAND_POSE_WIREFRAME_STAMPS[0];
  }, [selectedHandId]);

  const selectedHandSvg = useMemo(
    () =>
      selectedHandStamp
        ? buildHandPoseStampSvg(selectedHandStamp, {
            flipHorizontal: flipHandHorizontal,
            style: inkStyle,
            showJoints,
            showLabel: showLabels,
          })
        : null,
    [flipHandHorizontal, inkStyle, selectedHandStamp, showJoints, showLabels],
  );

  const handPreviewMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const stamp of filteredHandStamps) {
      map.set(
        stamp.id,
        buildHandPoseStampSvg(stamp, {
          flipHorizontal: flipHandHorizontal,
          style: inkStyle,
          showJoints: false,
          showLabel: false,
        }).dataUrl,
      );
    }
    return map;
  }, [filteredHandStamps, flipHandHorizontal, inkStyle]);

  async function copySvgMarkup(key: string, label: string, svg: string): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(svg);
      }
      setCopiedKey(key);
      setStatusMessage(`${label} SVG 밑그림을 클립보드에 복사했습니다.`);
    } catch {
      setStatusMessage("클립보드 권한이 없어 복사하지 못했습니다. SVG 저장을 이용해 주세요.");
    }
  }

  function handleInsertTurnaround(): void {
    const payload: ReferenceStampInsertPayload = {
      kind: "turnaround-sheet",
      id: `turnaround-${headRatio}h-${inkStyle}`,
      nameKo: `4방향 턴어라운드 ${headRatio}등신 시트`,
      svg: turnaroundSheet.svg,
      dataUrl: turnaroundSheet.dataUrl,
      width: turnaroundSheet.width,
      height: turnaroundSheet.height,
    };
    onInsertStamp?.(payload);
    setStatusMessage(`${payload.nameKo} 밑그림을 적용했습니다.`);
  }

  function handleInsertHandStamp(): void {
    if (!selectedHandStamp || !selectedHandSvg) return;
    const payload: ReferenceStampInsertPayload = {
      kind: "hand-pose-stamp",
      id: `${selectedHandStamp.id}${flipHandHorizontal ? "-flipped" : ""}`,
      nameKo: `${selectedHandStamp.nameKo} 손 포즈 스탬프`,
      svg: selectedHandSvg.svg,
      dataUrl: selectedHandSvg.dataUrl,
      width: selectedHandSvg.width,
      height: selectedHandSvg.height,
    };
    onInsertStamp?.(payload);
    setStatusMessage(`${payload.nameKo} 밑그림을 적용했습니다.`);
  }

  return (
    <section
      aria-label="캐릭터 턴어라운드 및 손 포즈 24종 스탬프"
      data-testid="studio-reference-stamps-widget"
      className={cn(
        "space-y-3 rounded-xl border border-line bg-panel p-3 text-xs text-fg",
        className,
      )}
    >
      {/* 상단 탭 전환 */}
      <div
        role="tablist"
        aria-label="밑그림 스탬프 종류"
        className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-card/70 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "turnaround"}
          onClick={() => setActiveTab("turnaround")}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            activeTab === "turnaround"
              ? "bg-accent text-on-accent"
              : "text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <UserRound size={14} aria-hidden />
          4방향 턴어라운드
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "hand-stamps"}
          onClick={() => setActiveTab("hand-stamps")}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            activeTab === "hand-stamps"
              ? "bg-accent text-on-accent"
              : "text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <Hand size={14} aria-hidden />
          손 포즈 {HAND_POSE_WIREFRAME_STAMPS.length}종
        </button>
      </div>

      {/* 공통 선화 스타일 & 옵션 */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="밑그림 선색">
        {INK_STYLES.map((styleId) => {
          const palette = REFERENCE_STAMP_PALETTES[styleId];
          const active = inkStyle === styleId;
          return (
            <button
              key={styleId}
              type="button"
              aria-pressed={active}
              onClick={() => setInkStyle(styleId)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: palette.strokePrimary }}
              />
              {palette.labelKo}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={showJoints}
          onClick={() => setShowJoints((prev) => !prev)}
          className={cn(
            "inline-flex min-h-11 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            showJoints
              ? "border-accent/60 bg-accent-soft text-accent"
              : "border-line bg-card text-fg-3 hover:bg-raised",
          )}
        >
          관절 표시
        </button>
        <button
          type="button"
          aria-pressed={showLabels}
          onClick={() => setShowLabels((prev) => !prev)}
          className={cn(
            "inline-flex min-h-11 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            showLabels
              ? "border-accent/60 bg-accent-soft text-accent"
              : "border-line bg-card text-fg-3 hover:bg-raised",
          )}
        >
          기준선 표기
        </button>
      </div>

      {activeTab === "turnaround" ? (
        <div role="tabpanel" aria-label="캐릭터 4방향 턴어라운드 시트" className="space-y-3">
          {/* 6~8등신 선택 */}
          <div className="space-y-1.5">
            <span className="block text-[0.68rem] font-semibold text-fg-2">
              등신 비율 (6~8등신)
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="등신 비율 선택">
              {TURNAROUND_HEAD_RATIOS.map((ratio) => {
                const active = headRatio === ratio;
                return (
                  <button
                    key={ratio}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setHeadRatio(ratio)}
                    className={cn(
                      "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-2.5 text-xs font-bold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised",
                    )}
                  >
                    {ratio}등신
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4방향 + 핵심 기준선 요약 */}
          <div className="flex flex-wrap gap-1 text-[0.64rem] text-fg-3">
            {TURNAROUND_VIEWS.map((view) => (
              <span
                key={view.id}
                className="rounded-md border border-line bg-card px-2 py-1 font-medium text-fg-2"
              >
                {view.labelKo}
              </span>
            ))}
            <span className="rounded-md border border-line/70 bg-raised/70 px-2 py-1">
              기준선: 눈 · 턱 · 어깨 · 허리 · 무릎
            </span>
          </div>

          {/* 시트 미리보기 */}
          <div className="overflow-hidden rounded-xl border border-line bg-card p-2">
            <img
              src={turnaroundSheet.dataUrl}
              alt={`캐릭터 4방향 턴어라운드 ${headRatio}등신 비율 시트`}
              className="h-auto w-full rounded-lg border border-line/60"
            />
          </div>

          {/* 시트 액션 */}
          <div className="flex flex-wrap gap-1.5">
            {onInsertStamp ? (
              <button
                type="button"
                onClick={handleInsertTurnaround}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Layers2 size={14} aria-hidden />
                밑그림 스탬프 삽입
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                void copySvgMarkup(
                  `turnaround-${headRatio}`,
                  `4방향 턴어라운드 ${headRatio}등신`,
                  turnaroundSheet.svg,
                )
              }
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {copiedKey === `turnaround-${headRatio}` ? (
                <Check size={14} aria-hidden />
              ) : (
                <Copy size={14} aria-hidden />
              )}
              SVG 복사
            </button>
            <button
              type="button"
              onClick={() => {
                triggerSvgDownload(
                  `turnaround-${headRatio}h-sheet.svg`,
                  turnaroundSheet.svg,
                );
                setStatusMessage(`4방향 턴어라운드 ${headRatio}등신 SVG를 저장했습니다.`);
              }}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Download size={14} aria-hidden />
              SVG 저장
            </button>
          </div>
        </div>
      ) : (
        <div role="tabpanel" aria-label="손 포즈 24종 밑그림 스탬프" className="space-y-3">
          {/* 검색 + 좌우 반전 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">손 포즈 스탬프 검색</span>
              <Search
                size={14}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              />
              <input
                type="search"
                value={handQuery}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setHandQuery(event.target.value)}
                placeholder="주먹, 펜잡기, 검잡기, 기도, 턱괴기 검색"
                className="min-h-11 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent"
              />
            </label>
            <button
              type="button"
              aria-pressed={flipHandHorizontal}
              onClick={() => setFlipHandHorizontal((prev) => !prev)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                flipHandHorizontal
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              <FlipHorizontal2 size={14} aria-hidden />
              {flipHandHorizontal ? "왼손 반전" : "좌우 반전"}
            </button>
          </div>

          {/* 카테고리 필터 */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="손 포즈 분류">
            {HAND_CATEGORIES.map((category) => {
              const active = handCategory === category;
              const label =
                category === "all"
                  ? `전체 ${HAND_POSE_WIREFRAME_STAMPS.length}`
                  : HAND_POSE_STAMP_CATEGORY_LABELS[category];
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setHandCategory(category)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 24종 스탬프 그리드 */}
          {filteredHandStamps.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-xs text-fg-3">
              검색 조건에 맞는 손 포즈 스탬프가 없습니다.
            </p>
          ) : (
            <div
              className="grid max-h-60 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-4"
              role="listbox"
              aria-label="손 포즈 밑그림 목록"
            >
              {filteredHandStamps.map((stamp) => {
                const selected = stamp.id === selectedHandStamp?.id;
                const previewUrl = handPreviewMap.get(stamp.id);
                return (
                  <button
                    key={stamp.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setSelectedHandId(stamp.id)}
                    className={cn(
                      "flex min-h-11 flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      selected
                        ? "border-accent bg-accent-soft/60 text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised",
                    )}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt=""
                        aria-hidden="true"
                        className="size-12 rounded border border-line/50 object-contain"
                      />
                    ) : null}
                    <span className="line-clamp-1 text-[0.65rem] font-semibold">
                      {stamp.nameKo}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 선택 손 포즈 확대 미리보기 & 액션 */}
          {selectedHandStamp && selectedHandSvg ? (
            <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
              <div className="flex items-start gap-3">
                <img
                  src={selectedHandSvg.dataUrl}
                  alt={`${selectedHandStamp.nameKo} 손 포즈 와이어프레임 스탬프`}
                  className="size-24 shrink-0 rounded-lg border border-line/60"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-xs font-bold text-fg">
                      {selectedHandStamp.nameKo}
                    </strong>
                    <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.6rem] font-semibold text-fg-3">
                      {HAND_POSE_STAMP_CATEGORY_LABELS[selectedHandStamp.category]}
                    </span>
                  </div>
                  <p className="text-[0.68rem] leading-relaxed text-fg-3">
                    {selectedHandStamp.summaryKo}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {onInsertStamp ? (
                  <button
                    type="button"
                    onClick={handleInsertHandStamp}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Layers2 size={14} aria-hidden />
                    손 스탬프 삽입
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    void copySvgMarkup(
                      `hand-${selectedHandStamp.id}`,
                      `${selectedHandStamp.nameKo} 손 포즈`,
                      selectedHandSvg.svg,
                    )
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {copiedKey === `hand-${selectedHandStamp.id}` ? (
                    <Check size={14} aria-hidden />
                  ) : (
                    <Copy size={14} aria-hidden />
                  )}
                  SVG 복사
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerSvgDownload(
                      `hand-pose-${selectedHandStamp.id}${flipHandHorizontal ? "-flipped" : ""}.svg`,
                      selectedHandSvg.svg,
                    );
                    setStatusMessage(`${selectedHandStamp.nameKo} SVG를 저장했습니다.`);
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Download size={14} aria-hidden />
                  SVG 저장
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {statusMessage ? (
        <p role="status" aria-live="polite" className="text-[0.68rem] font-medium text-accent">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
