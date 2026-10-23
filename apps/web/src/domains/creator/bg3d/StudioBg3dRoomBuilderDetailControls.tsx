// 방 만들기 패널(StudioBg3dRoomBuilderPanel)의 문·창 모양 컨트롤과 천장·몰딩 컨트롤(2026-10-23).
// 패널과 같은 지연 청크에서만 쓴다(편집기 활성화 번들에 넣지 않는다). 프레젠테이션 전용: 값은 모두 부모 스펙이 갖고,
// 바뀐 값은 raw 그대로 올려 부모가 clampStudioBg3dRoomSpec 으로 한곳에서 정규화한다.
//
// 1단계(늘 보임): 문·창 모양, 열림·올림, 천장. 고급(접힘): 경첩·짝 수, 몰딩 세부. 접힘은 <details> 대신
// aria-expanded 버튼 + 영역(role="group")으로 만든다(설계 P2 D3, 감사 C-03).
import { ChevronDown, Layers } from "lucide-react";
import { useId, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import "./studio-bg3d-room-builder-i18n";

import { TemplateRangeControl, TemplateToggleRow } from "./StudioBg3dTemplateControls";
import {
  resolveStudioBg3dOpeningOpenRatio,
  resolveStudioBg3dOpeningStyle,
  STUDIO_BG3D_ROOM_OPENING_STYLE_LABELS,
  STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE,
  studioBg3dOpeningStyleHasHinge,
  studioBg3dOpeningStyleHasLeafCount,
  studioBg3dOpeningStyleRaises,
  type StudioBg3dOpeningStyle,
} from "./studio-bg3d-room-openings";
import {
  DEFAULT_STUDIO_BG3D_ROOM_TRIMS,
  STUDIO_BG3D_ROOM_CEILING_LABELS,
  STUDIO_BG3D_ROOM_CEILING_STYLES,
  STUDIO_BG3D_ROOM_CROWN_LABELS,
  STUDIO_BG3D_ROOM_CROWN_STYLES,
  STUDIO_BG3D_ROOM_TRIM_LIMITS,
  type StudioBg3dRoomCeilingStyle,
  type StudioBg3dRoomCrownStyle,
  type StudioBg3dRoomTrims,
} from "./studio-bg3d-room-trims";

import { cx } from "@/shared/lib/cx";

import type { StudioBg3dRoomOpening, StudioBg3dRoomSpec } from "./studio-bg3d-room-builder";

type Translate = ReturnType<typeof useT>;

const SELECT_INPUT =
  "min-h-8 w-full min-w-0 rounded-md border border-line bg-card px-1 text-[0.68rem] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const DISCLOSURE_BUTTON =
  "inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[0.64rem] font-semibold text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

/** 스타일 이름표. 키는 문자열 그대로 둔다(사전 시험이 소스에서 키 참조를 찾는다). */
function styleLabel(t: Translate, style: StudioBg3dOpeningStyle): string {
  const fallback = STUDIO_BG3D_ROOM_OPENING_STYLE_LABELS[style];
  switch (style) {
    case "hole": return t("studio.bg3dRoomBuilder.style.hole", fallback);
    case "hinged-door": return t("studio.bg3dRoomBuilder.style.hingedDoor", fallback);
    case "sliding-door": return t("studio.bg3dRoomBuilder.style.slidingDoor", fallback);
    case "glass-door": return t("studio.bg3dRoomBuilder.style.glassDoor", fallback);
    case "window-sliding": return t("studio.bg3dRoomBuilder.style.windowSliding", fallback);
    case "window-casement": return t("studio.bg3dRoomBuilder.style.windowCasement", fallback);
    case "roller-blind": return t("studio.bg3dRoomBuilder.style.rollerBlind", fallback);
    case "shutter": return t("studio.bg3dRoomBuilder.style.shutter", fallback);
  }
}

function ceilingLabel(t: Translate, style: StudioBg3dRoomCeilingStyle): string {
  const fallback = STUDIO_BG3D_ROOM_CEILING_LABELS[style];
  switch (style) {
    case "none": return t("studio.bg3dRoomBuilder.ceilingStyle.none", fallback);
    case "flat": return t("studio.bg3dRoomBuilder.ceilingStyle.flat", fallback);
    case "rafter": return t("studio.bg3dRoomBuilder.ceilingStyle.rafter", fallback);
    case "coffered": return t("studio.bg3dRoomBuilder.ceilingStyle.coffered", fallback);
  }
}

function crownLabel(t: Translate, style: StudioBg3dRoomCrownStyle): string {
  const fallback = STUDIO_BG3D_ROOM_CROWN_LABELS[style];
  switch (style) {
    case "none": return t("studio.bg3dRoomBuilder.crownStyle.none", fallback);
    case "flat": return t("studio.bg3dRoomBuilder.crownStyle.flat", fallback);
    case "stepped": return t("studio.bg3dRoomBuilder.crownStyle.stepped", fallback);
    case "cove": return t("studio.bg3dRoomBuilder.crownStyle.cove", fallback);
  }
}

const percent = (ratio: number) => Math.round(ratio * 100);
const centimeters = (meters: number) => `${Math.round(meters * 100)}cm`;

// ── 문·창 한 줄의 모양·열림·세부 ──────────────────────────────────────────────────────────────

export interface StudioBg3dRoomOpeningStyleControlsProps {
  /** 목록에 보이는 1부터 시작하는 번호(접근성 이름에 쓴다). */
  readonly index: number;
  readonly opening: StudioBg3dRoomOpening;
  readonly disabled?: boolean;
  /** 바꾼 필드만 올린다(undefined 는 "기본값으로 되돌림" — 부모 clamp 가 키를 지운다). */
  readonly onChange: (patch: Partial<StudioBg3dRoomOpening>) => void;
}

export function StudioBg3dRoomOpeningStyleControls({
  index,
  opening,
  disabled = false,
  onChange,
}: StudioBg3dRoomOpeningStyleControlsProps) {
  const t = useT();
  const baseId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const style = resolveStudioBg3dOpeningStyle(opening);
  const ratio = resolveStudioBg3dOpeningOpenRatio(opening);
  const raises = studioBg3dOpeningStyleRaises(style);
  const hasHinge = studioBg3dOpeningStyleHasHinge(style);
  const hasLeafCount = studioBg3dOpeningStyleHasLeafCount(style);
  const sideLabel = style === "sliding-door"
    ? t("studio.bg3dRoomBuilder.pocketSide", "들어가는 쪽")
    : style === "window-sliding"
      ? t("studio.bg3dRoomBuilder.movingLeaf", "움직이는 짝")
      : t("studio.bg3dRoomBuilder.hingeSide", "경첩 쪽");
  const detailsLabel = t("studio.bg3dRoomBuilder.detailsAria", { index }, "오프닝 {index} 세부 설정");
  const leafValue = opening.divisions === undefined ? "auto" : opening.divisions >= 2 ? "2" : "1";
  return (
    <div className="mt-1.5 space-y-1">
      <label className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-1.5 text-[0.62rem] font-semibold text-fg-3">
        {t("studio.bg3dRoomBuilder.openingStyle", "모양")}
        <select
          aria-label={t("studio.bg3dRoomBuilder.openingStyleAria", { index }, "오프닝 {index} 모양")}
          className={SELECT_INPUT}
          value={style}
          disabled={disabled}
          onChange={(event) => {
            const next = STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE[opening.type].find((candidate) => candidate === event.target.value);
            if (next) onChange({ style: next });
          }}
        >
          {STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE[opening.type].map((candidate) => (
            <option key={candidate} value={candidate}>{styleLabel(t, candidate)}</option>
          ))}
        </select>
      </label>
      {style === "hole" ? null : (
        <label className="grid grid-cols-[3rem_minmax(0,1fr)_2.5rem] items-center gap-1.5 text-[0.62rem] font-semibold text-fg-3">
          {raises ? t("studio.bg3dRoomBuilder.raiseRatio", "올림") : t("studio.bg3dRoomBuilder.openRatio", "열림")}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={ratio}
            disabled={disabled}
            aria-label={raises
              ? t("studio.bg3dRoomBuilder.raiseRatioAria", { index }, "오프닝 {index} 올림 정도")
              : t("studio.bg3dRoomBuilder.openRatioAria", { index }, "오프닝 {index} 열림 정도")}
            aria-valuetext={`${percent(ratio)}%`}
            className="h-8 w-full min-w-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
            onChange={(event) => onChange({ openRatio: Number(event.target.value) })}
          />
          <output className="text-right tabular-nums">{percent(ratio)}%</output>
        </label>
      )}
      {hasHinge || hasLeafCount ? (
        <div>
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={`${baseId}-details`}
            aria-label={detailsLabel}
            disabled={disabled}
            className={DISCLOSURE_BUTTON}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <ChevronDown size={12} aria-hidden className={cx("transition-transform motion-reduce:transition-none", detailsOpen && "rotate-180")} />
            {t("studio.bg3dRoomBuilder.details", "세부 설정")}
          </button>
          <div id={`${baseId}-details`} role="group" aria-label={detailsLabel} hidden={!detailsOpen} className="mt-1 grid grid-cols-2 gap-1.5">
            {hasHinge ? (
              <label className="min-w-0 text-[0.62rem] font-semibold text-fg-3">
                {sideLabel}
                <select
                  aria-label={t("studio.bg3dRoomBuilder.sideAria", { index, label: sideLabel }, "오프닝 {index} {label}")}
                  className={SELECT_INPUT}
                  value={opening.hinge ?? "left"}
                  disabled={disabled}
                  onChange={(event) => onChange({ hinge: event.target.value === "right" ? "right" : "left" })}
                >
                  <option value="left">{t("studio.bg3dRoomBuilder.sideLeft", "왼쪽")}</option>
                  <option value="right">{t("studio.bg3dRoomBuilder.sideRight", "오른쪽")}</option>
                </select>
              </label>
            ) : null}
            {hasLeafCount ? (
              <label className="min-w-0 text-[0.62rem] font-semibold text-fg-3">
                {t("studio.bg3dRoomBuilder.leafCount", "짝 수")}
                <select
                  aria-label={t("studio.bg3dRoomBuilder.leafCountAria", { index }, "오프닝 {index} 짝 수")}
                  className={SELECT_INPUT}
                  value={leafValue}
                  disabled={disabled}
                  onChange={(event) => onChange({
                    divisions: event.target.value === "auto" ? undefined : Number(event.target.value),
                  })}
                >
                  <option value="auto">{t("studio.bg3dRoomBuilder.leafAuto", "폭에 맞춤")}</option>
                  <option value="1">{t("studio.bg3dRoomBuilder.leafOne", "한 짝")}</option>
                  <option value="2">{t("studio.bg3dRoomBuilder.leafTwo", "두 짝")}</option>
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 천장 · 몰딩 ─────────────────────────────────────────────────────────────────────────────────

export interface StudioBg3dRoomFinishControlsProps {
  readonly spec: StudioBg3dRoomSpec;
  readonly disabled?: boolean;
  readonly onSpecChange: (next: StudioBg3dRoomSpec) => void;
}

export function StudioBg3dRoomFinishControls({ spec, disabled = false, onSpecChange }: StudioBg3dRoomFinishControlsProps) {
  const t = useT();
  const baseId = useId();
  const [trimsOpen, setTrimsOpen] = useState(false);
  const ceiling = spec.ceiling ?? "none";
  const trims = spec.trims ?? DEFAULT_STUDIO_BG3D_ROOM_TRIMS;
  const limits = STUDIO_BG3D_ROOM_TRIM_LIMITS;
  const updateTrims = (patch: Partial<StudioBg3dRoomTrims>) => onSpecChange({ ...spec, trims: { ...trims, ...patch } });
  const onOff = (value: boolean) => value ? t("studio.bg3dRoomBuilder.on", "켬") : t("studio.bg3dRoomBuilder.off", "끔");
  const summary = t(
    "studio.bg3dRoomBuilder.trimSummary",
    {
      baseboard: onOff(trims.baseboard.enabled),
      crown: crownLabel(t, trims.crown.style),
      wainscot: onOff(trims.wainscot.enabled),
      chairRail: onOff(trims.chairRail),
    },
    "걸레받이 {baseboard} · 크라운 {crown} · 징두리 {wainscot} · 의자 레일 {chairRail}",
  );
  return (
    <div className="mt-3 rounded-xl border border-line bg-card/70 px-3 py-2.5">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-fg">
        <Layers size={13} className="text-accent" aria-hidden />
        {t("studio.bg3dRoomBuilder.finishHeading", "천장 · 몰딩")}
      </h4>
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <legend className="p-0 text-[0.68rem] font-semibold text-fg-2">{t("studio.bg3dRoomBuilder.ceilingLabel", "천장")}</legend>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {STUDIO_BG3D_ROOM_CEILING_STYLES.map((style) => (
            <label key={style} className="relative block min-w-0">
              <input
                type="radio"
                name={`${baseId}-ceiling`}
                value={style}
                checked={ceiling === style}
                disabled={disabled}
                className="peer sr-only"
                onChange={() => onSpecChange({ ...spec, ceiling: style })}
              />
              <span
                className={cx(
                  "flex min-h-8 cursor-pointer items-center justify-center rounded-md border border-line bg-panel px-1 text-center text-[0.64rem] font-semibold text-fg-2 transition-colors hover:bg-raised motion-reduce:transition-none",
                  "peer-checked:border-accent/55 peer-checked:bg-accent-soft peer-checked:text-accent",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent",
                  "peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
                )}
              >
                {ceilingLabel(t, style)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="pt-1 text-[0.64rem] leading-relaxed text-fg-3">
        {t("studio.bg3dRoomBuilder.ceilingHelp", "천장은 벽 위에 얹혀 실내 높이가 벽 높이와 같아요. 자동 단면을 켜고 위에서 내려다보며 추가하면 천장도 숨겨요.")}
      </p>

      <button
        type="button"
        aria-expanded={trimsOpen}
        aria-controls={`${baseId}-trims`}
        disabled={disabled}
        className={cx(DISCLOSURE_BUTTON, "mt-1.5 w-full justify-between")}
        onClick={() => setTrimsOpen((open) => !open)}
      >
        <span className="flex items-center gap-1">
          <ChevronDown size={12} aria-hidden className={cx("transition-transform motion-reduce:transition-none", trimsOpen && "rotate-180")} />
          {t("studio.bg3dRoomBuilder.trimDetails", "몰딩 세부 설정")}
        </span>
        <span className="truncate text-[0.6rem] font-normal">{summary}</span>
      </button>
      <div
        id={`${baseId}-trims`}
        role="group"
        aria-label={t("studio.bg3dRoomBuilder.trimDetails", "몰딩 세부 설정")}
        hidden={!trimsOpen}
      >
        <TemplateToggleRow
          checked={trims.baseboard.enabled}
          label={t("studio.bg3dRoomBuilder.baseboard", "걸레받이")}
          disabled={disabled}
          onChange={(enabled) => updateTrims({ baseboard: { ...trims.baseboard, enabled } })}
        />
        {trims.baseboard.enabled ? (
          <TemplateRangeControl
            id={`${baseId}-baseboard-height`}
            label={t("studio.bg3dRoomBuilder.baseboardHeight", "걸레받이 높이")}
            min={limits.minBaseboardHeight}
            max={limits.maxBaseboardHeight}
            step={0.01}
            value={trims.baseboard.heightM}
            valueText={centimeters(trims.baseboard.heightM)}
            disabled={disabled}
            onChange={(heightM) => updateTrims({ baseboard: { ...trims.baseboard, heightM } })}
          />
        ) : null}
        <label className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-line/70 py-1.5 text-xs font-semibold text-fg-2">
          {t("studio.bg3dRoomBuilder.crown", "크라운 몰딩")}
          <select
            className={SELECT_INPUT}
            value={trims.crown.style}
            disabled={disabled}
            onChange={(event) => {
              const style = STUDIO_BG3D_ROOM_CROWN_STYLES.find((candidate) => candidate === event.target.value);
              if (style) updateTrims({ crown: { ...trims.crown, style } });
            }}
          >
            {STUDIO_BG3D_ROOM_CROWN_STYLES.map((style) => (
              <option key={style} value={style}>{crownLabel(t, style)}</option>
            ))}
          </select>
        </label>
        {trims.crown.style === "none" ? null : (
          <TemplateRangeControl
            id={`${baseId}-crown-height`}
            label={t("studio.bg3dRoomBuilder.crownHeight", "크라운 높이")}
            min={limits.minCrownHeight}
            max={limits.maxCrownHeight}
            step={0.01}
            value={trims.crown.heightM}
            valueText={centimeters(trims.crown.heightM)}
            disabled={disabled}
            onChange={(heightM) => updateTrims({ crown: { ...trims.crown, heightM } })}
          />
        )}
        <TemplateToggleRow
          checked={trims.wainscot.enabled}
          label={t("studio.bg3dRoomBuilder.wainscot", "징두리 판벽")}
          disabled={disabled}
          onChange={(enabled) => updateTrims({ wainscot: { ...trims.wainscot, enabled } })}
        />
        {trims.wainscot.enabled ? (
          <TemplateRangeControl
            id={`${baseId}-wainscot-height`}
            label={t("studio.bg3dRoomBuilder.wainscotHeight", "징두리 높이")}
            min={limits.minWainscotHeight}
            max={limits.maxWainscotHeight}
            step={0.05}
            value={trims.wainscot.heightM}
            valueText={centimeters(trims.wainscot.heightM)}
            disabled={disabled}
            onChange={(heightM) => updateTrims({ wainscot: { ...trims.wainscot, heightM } })}
          />
        ) : null}
        <TemplateToggleRow
          checked={trims.chairRail}
          label={t("studio.bg3dRoomBuilder.chairRail", "의자 레일")}
          disabled={disabled}
          onChange={(chairRail) => updateTrims({ chairRail })}
        />
        <p className="py-1.5 text-[0.64rem] leading-relaxed text-fg-3">
          {t("studio.bg3dRoomBuilder.trimHelp", "몰딩은 벽 안쪽 면에 붙고 문·창 자리에서 끊겨요. 2m보다 낮은 벽에는 걸레받이만 생겨요.")}
        </p>
      </div>
    </div>
  );
}
