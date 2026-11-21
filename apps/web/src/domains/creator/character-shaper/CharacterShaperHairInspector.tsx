/**
 * Character Shaper — 헤어 슬롯 정밀 조절.
 *
 * 앞머리 형태·길이, 팔레트(기본·끝 색 + 그라데이션 위치·경계), 하이라이트(브릿지·이너 컬러),
 * 형태(길이·볼륨·모발 굵기·컬·웨이브·윤기·삐침머리·묶음 높이), 원본 헤어 감추기.
 * 모든 변경은 `binding.commitHairParams` 한 번 = 되돌리기 한 단계이고, 포지 상태로 저장된다.
 */
import { useState } from "react";

import {
  AVATAR_FORGE_BANG_STYLE_OPTIONS,
  AVATAR_FORGE_HAIR_LIMITS,
  DEFAULT_AVATAR_FORGE_STATE,
} from "../vrm/studio-vrm-avatar-forge";
import {
  AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR,
  AVATAR_FORGE_HAIR_ACCENT_MODE_OPTIONS,
  AVATAR_FORGE_HAIR_GRADIENT_LIMITS,
  AVATAR_FORGE_TIED_HAIR_STYLES,
  resolveAvatarForgeHairGradient,
} from "../vrm/studio-vrm-avatar-forge-hair-color";

import { frozenStatus3Text } from "../studio-frozen3-status-i18n";
import { CHARACTER_HAIR_PALETTES } from "./character-shaper-catalog";
import { resolveHairCommitPatch } from "./character-shaper-custom-quality";
import { applyHairSpringBoneToVrm } from "./character-shaper-mtoon-uniforms";
import { characterSlotSelection } from "./character-shaper-ui-model";
import { CharacterChipGroup, CharacterColorControl, CharacterRangeControl } from "./CharacterShaperControls";
import { InspectorNote, InspectorSection, InspectorToggleRow } from "./CharacterShaperInspectorParts";
import {
  BACK_HAIR_PART_OPTIONS,
  FRONT_HAIR_PART_OPTIONS,
  SIDE_HAIR_PART_OPTIONS,
} from "./studio-webtoon-21-body-and-3part-hair";

import type { CharacterColorSwatch } from "./CharacterShaperControls";
import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";
import type {
  AvatarForgeHairLimitKey,
  AvatarForgeHairParams,
  AvatarForgeState,
} from "../vrm/studio-vrm-avatar-forge";
import type { AvatarForgeHairAccentMode, AvatarForgeHairGradientKey } from "../vrm/studio-vrm-avatar-forge-hair-color";

/** 카탈로그의 "원본 유지" 헤어 항목(`hair:original`). 이 항목이면 절차형 헤어 조절은 보이지 않는다. */
const ORIGINAL_HAIR_ENTRY_ID = "hair:original";

/** 형태 슬라이더 순서. 묶음 높이는 묶는 스타일에서만 따로 보인다. */
const HAIR_SHAPE_KEYS: readonly AvatarForgeHairLimitKey[] = [
  "length",
  "volume",
  "strandWidth",
  "curl",
  "wave",
  "shine",
  "ahoge",
];

type HairSliderKey = AvatarForgeHairLimitKey | AvatarForgeHairGradientKey;

const HAIR_SLIDER_HINTS: Partial<Record<HairSliderKey, string>> = {
  strandWidth: "가닥 하나하나의 폭. 작게 하면 가늘고 날카로운 머리카락",
  ahoge: "정수리에서 튀어나온 한 가닥. 0이면 없음",
  tailHeight: "포니테일·트윈테일·번·땋은 머리가 묶이는 높이",
  fringe: "앞머리가 내려오는 길이. 눈을 덮을 만큼 길게도 짧게도",
  gradientPosition: "끝 색이 시작되는 지점. 0은 뿌리부터, 1은 끝만 물듭니다",
  gradientSoftness: "기본색과 끝 색의 경계. 0이면 또렷한 투톤, 1이면 부드러운 그라데이션",
};

/** 하이라이트 추천 색 — 애니풍 브릿지·이너 컬러에 자주 쓰는 밝은 색. */
const HAIR_ACCENT_SWATCHES: readonly CharacterColorSwatch[] = [
  { color: "#f2a7c3", label: "로즈" },
  { color: "#c4b5fd", label: "라벤더" },
  { color: "#7dd3fc", label: "스카이" },
  { color: "#5eead4", label: "민트" },
  { color: "#fde68a", label: "골드" },
  { color: "#fb923c", label: "오렌지" },
  { color: "#ef4444", label: "레드" },
  { color: "#f5f5f4", label: "실버 화이트" },
];

function HairRange({
  hair,
  limitKey,
  locked,
  onCommit,
}: {
  readonly hair: AvatarForgeHairParams;
  readonly limitKey: HairSliderKey;
  readonly locked: boolean;
  readonly onCommit: (key: HairSliderKey, value: number, label: string) => void;
}) {
  const gradient = resolveAvatarForgeHairGradient(hair);
  const isGradient = limitKey === "gradientPosition" || limitKey === "gradientSoftness";
  const limit = isGradient ? AVATAR_FORGE_HAIR_GRADIENT_LIMITS[limitKey] : AVATAR_FORGE_HAIR_LIMITS[limitKey];
  const fallback = limitKey === "gradientPosition" ? 0.5
    : limitKey === "gradientSoftness" ? 1
      : DEFAULT_AVATAR_FORGE_STATE.hair[limitKey];
  const value = limitKey === "gradientPosition" ? gradient.position
    : limitKey === "gradientSoftness" ? gradient.softness
      : hair[limitKey];
  return (
    <CharacterRangeControl
      label={limit.label}
      hint={HAIR_SLIDER_HINTS[limitKey]}
      value={typeof value === "number" ? value : fallback}
      min={limit.min}
      max={limit.max}
      step={limit.step}
      unit={limit.unit}
      defaultValue={fallback}
      disabled={locked}
      onCommit={(next) => onCommit(limitKey, next, limit.label)}
    />
  );
}

export function CharacterShaperHairInspector({
  h,
  binding,
  locked,
}: Pick<CharacterShaperInspectorProps, "h" | "binding"> & { readonly locked: boolean }) {
  const forgeState = (h.avatarForgeState ?? null) as AvatarForgeState | null;
  const hair = forgeState?.hair ?? DEFAULT_AVATAR_FORGE_STATE.hair;
  const baseColor = binding.snapshot.hairBaseColor ?? hair.baseColor;
  const tipColor = binding.snapshot.hairTipColor ?? hair.tipColor;
  const activePalette = CHARACTER_HAIR_PALETTES.find(
    (palette) =>
      palette.baseColor.toLowerCase() === String(baseColor).toLowerCase() &&
      palette.tipColor.toLowerCase() === String(tipColor).toLowerCase(),
  );
  const replaceOriginal = binding.snapshot.hairReplaceOriginal ?? hair.replaceOriginal;
  const originalHairCount = binding.profile.originalHairMeshCount ?? 0;
  // 원본 헤어를 쓰는 동안 아래 설정은 절차형 헤어에만 반영되어 화면에 보이지 않는다. 먼저 알린다.
  const usingOriginalHair = characterSlotSelection(binding.recipe, "hair").includes(ORIGINAL_HAIR_ENTRY_ID);
  const accentMode: AvatarForgeHairAccentMode = hair.accentMode ?? "none";
  const accentColor = hair.accentColor ?? AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR;
  const tied = AVATAR_FORGE_TIED_HAIR_STYLES.has(hair.style);
  const commitNumber = (key: HairSliderKey, value: number, label: string) =>
    binding.commitHairParams({ [key]: value }, `헤어: ${label}`);
  const [lockMainColor, setLockMainColor] = useState(true);
  const [springStiffness, setSpringStiffness] = useState(1.0);
  const [springGravity, setSpringGravity] = useState(0.35);
  const [springDrag, setSpringDrag] = useState(0.4);
  const [springUpdatedCount, setSpringUpdatedCount] = useState(0);

  const applyHairSpringBone = (next: { stiffness: number; gravity: number; drag: number }) => {
    setSpringStiffness(next.stiffness);
    setSpringGravity(next.gravity);
    setSpringDrag(next.drag);
    const updated = applyHairSpringBoneToVrm(h.vrm, {
      stiffness: next.stiffness,
      gravityPower: next.gravity,
      dragForce: next.drag,
    });
    setSpringUpdatedCount(updated);
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };

  return (
    <>
      {usingOriginalHair ? (
        <div className="px-3 pt-3" data-character-hair-original-note="true">
          <InspectorNote>
            지금은 모델의 원본 헤어를 쓰고 있어 앞머리·팔레트·형태 조절이 화면에 보이지 않습니다. 위에서 헤어 스타일 카드를 고르면 바로 적용됩니다.
          </InspectorNote>
        </div>
      ) : null}
      <InspectorSection title="앞머리" hint="스타일과 따로 조합합니다.">
        <CharacterChipGroup
          label="앞머리 형태"
          value={binding.snapshot.hairBangStyle ?? hair.bangStyle}
          disabled={locked}
          columns={3}
          options={AVATAR_FORGE_BANG_STYLE_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            hint: option.hint,
          }))}
          onSelect={(id) => binding.commitHairParams({ bangStyle: id }, `헤어: 앞머리 ${id}`)}
        />
        <HairRange hair={hair} limitKey="fringe" locked={locked} onCommit={commitNumber} />
      </InspectorSection>
      <InspectorSection title="헤어 팔레트">
        <CharacterChipGroup
          label="헤어 팔레트"
          appearance="swatches"
          value={activePalette?.id ?? null}
          disabled={locked}
          options={CHARACTER_HAIR_PALETTES.map((palette) => ({
            id: palette.id,
            label: palette.label,
            swatch: palette.baseColor,
            swatchTip: palette.tipColor,
          }))}
          onSelect={(id) => {
            const palette = CHARACTER_HAIR_PALETTES.find((item) => item.id === id);
            if (!palette) return;
            binding.commitHairParams(
              { baseColor: palette.baseColor, tipColor: palette.tipColor },
              `헤어: ${palette.label}`,
            );
          }}
        />
        <CharacterColorControl
          label="헤어 기본색"
          value={baseColor}
          disabled={locked}
          onCommit={(color) => {
            if (color === null) return;
            binding.commitHairParams({ baseColor: color }, "헤어: 기본색");
          }}
        />
        <CharacterColorControl
          label="모발 끝 색"
          value={tipColor}
          disabled={locked}
          onCommit={(color) => {
            if (color === null) return;
            binding.commitHairParams({ tipColor: color }, "헤어: 끝 색");
          }}
        />
        <HairRange hair={hair} limitKey="gradientPosition" locked={locked} onCommit={commitNumber} />
        <HairRange hair={hair} limitKey="gradientSoftness" locked={locked} onCommit={commitNumber} />
      </InspectorSection>
      <InspectorSection
        title="하이라이트·브릿지"
        hint="브릿지는 앞머리·옆머리 한 갈래와 가르마 쪽 줄무늬를, 이너 컬러는 겉머리 안쪽과 늘어진 머리 아래쪽을 물들입니다."
      >
        <CharacterChipGroup
          label="하이라이트 방식"
          value={accentMode}
          disabled={locked}
          columns={3}
          options={AVATAR_FORGE_HAIR_ACCENT_MODE_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            hint: option.hint,
          }))}
          onSelect={(id) => {
            const mode = id as AvatarForgeHairAccentMode;
            binding.commitHairParams(
              mode === "none"
                ? { accentMode: undefined }
                : { accentMode: mode, accentColor },
              `헤어: 하이라이트 ${AVATAR_FORGE_HAIR_ACCENT_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? mode}`,
            );
          }}
        />
        <CharacterColorControl
          label="하이라이트 색"
          value={accentColor}
          swatches={HAIR_ACCENT_SWATCHES}
          disabled={locked || accentMode === "none"}
          hint={accentMode === "none" ? "방식을 고르면 이 색이 적용됩니다." : undefined}
          onCommit={(color) => {
            if (color === null) return;
            binding.commitHairParams({ accentColor: color }, "헤어: 하이라이트 색");
          }}
        />
      </InspectorSection>
      <InspectorSection title="헤어 형태">
        <div
          data-testid="shaper-hair-inspector-shortcuts"
          className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-line/60 bg-raised/60 p-1.5 text-[11px]"
        >
          <span
            data-testid="shaper-hair-scalp-zones"
            className="w-full text-[10px] text-fg-3"
          >
            두피 4구역 UV 보정: Zone 0 0.87x · Zone 1 1.00x · Zone 2 0.85x · Zone 3 0.85x (v+0.025)
          </span>
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              commitNumber(
                "length",
                Math.min(AVATAR_FORGE_HAIR_LIMITS.length.max, Number((hair.length + 0.1).toFixed(2))),
                AVATAR_FORGE_HAIR_LIMITS.length.label,
              )
            }
            className="rounded border border-line bg-card px-2 py-0.5 text-[10px] font-medium text-fg-2 hover:bg-raised disabled:opacity-45"
          >
            Shift+휠 길이 +0.1
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              commitNumber(
                "curl",
                Math.min(AVATAR_FORGE_HAIR_LIMITS.curl.max, Number((hair.curl + 0.05).toFixed(2))),
                AVATAR_FORGE_HAIR_LIMITS.curl.label,
              )
            }
            className="rounded border border-line bg-card px-2 py-0.5 text-[10px] font-medium text-fg-2 hover:bg-raised disabled:opacity-45"
          >
            Alt+휠 컬 +0.05
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              commitNumber(
                "strandWidth",
                Math.min(AVATAR_FORGE_HAIR_LIMITS.strandWidth.max, Number((hair.strandWidth + 0.01).toFixed(2))),
                AVATAR_FORGE_HAIR_LIMITS.strandWidth.label,
              )
            }
            className="rounded border border-line bg-card px-2 py-0.5 text-[10px] font-medium text-fg-2 hover:bg-raised disabled:opacity-45"
          >
            = 가닥 폭 +0.01
          </button>
        </div>
        {HAIR_SHAPE_KEYS.map((key) => (
          <HairRange key={key} hair={hair} limitKey={key} locked={locked} onCommit={commitNumber} />
        ))}
        {tied ? (
          <HairRange hair={hair} limitKey="tailHeight" locked={locked} onCommit={commitNumber} />
        ) : (
          <InspectorNote>묶음 높이는 포니테일·트윈테일·번·땋은 머리·반묶음에서 조절할 수 있습니다.</InspectorNote>
        )}
        <InspectorToggleRow
          label="원본 헤어 감추기"
          hint={
            originalHairCount > 0
              ? `모델이 가진 헤어 메시 ${originalHairCount}개를 숨기고 절차형 헤어만 남깁니다.`
              : frozenStatus3Text("studio.frozenStatus3.shaper.noOriginalHairMesh", "이 모델에는 감출 원본 헤어 메시가 없습니다.")
          }
          checked={Boolean(replaceOriginal)}
          disabled={locked || originalHairCount === 0}
          onToggle={() =>
            binding.commitHairParams(
              { replaceOriginal: !replaceOriginal },
              replaceOriginal ? "헤어: 원본 헤어 표시" : "헤어: 원본 헤어 감추기",
            )}
        />
      </InspectorSection>
      <InspectorSection
        title="3분할 헤어 파츠 & 메인 색 고정"
        hint="Tooning Plus처럼 앞·옆·뒷머리를 독립 조합하면서 메인 머리색을 유지합니다."
        collapsible
        defaultOpen={false}
      >
        <InspectorToggleRow
          label="메인 헤어 색 고정 (isKeepMainColor)"
          hint="파츠를 교체해도 현재 머리 기본색과 끝 색을 그대로 유지합니다."
          checked={lockMainColor}
          disabled={locked}
          onToggle={() => setLockMainColor((prev) => !prev)}
        />
        <div data-testid="shaper-hair-three-part-strip" className="grid grid-cols-3 gap-1.5 text-xs">
          <label className="flex flex-col gap-1 text-fg-2">
            <span>앞머리</span>
            <select
              aria-label="3분할 앞머리 파츠"
              disabled={locked}
              defaultValue={FRONT_HAIR_PART_OPTIONS[0]?.id}
              onChange={(event) =>
                binding.commitHairParams(
                  {
                    bangStyle: event.currentTarget.value.includes("split") || event.currentTarget.value.includes("center")
                      ? "split"
                      : event.currentTarget.value.includes("side")
                        ? "side-swept"
                        : event.currentTarget.value.includes("curtain")
                          ? "curtain"
                          : "full",
                    ...(lockMainColor ? { baseColor, tipColor } : {}),
                  },
                  "헤어: 3분할 앞머리",
                )
              }
              className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
            >
              {FRONT_HAIR_PART_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.labelKo}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-fg-2">
            <span>옆머리</span>
            <select
              aria-label="3분할 옆머리 파츠"
              disabled={locked}
              defaultValue={SIDE_HAIR_PART_OPTIONS[0]?.id}
              onChange={() =>
                binding.commitHairParams(
                  { volume: Number(Math.min(1.5, Math.max(0.6, hair.volume)).toFixed(2)), ...(lockMainColor ? { baseColor, tipColor } : {}) },
                  "헤어: 3분할 옆머리",
                )
              }
              className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
            >
              {SIDE_HAIR_PART_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.labelKo}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-fg-2">
            <span>뒷머리</span>
            <select
              aria-label="3분할 뒷머리 파츠"
              disabled={locked}
              defaultValue={BACK_HAIR_PART_OPTIONS[0]?.id}
              onChange={(event) => {
                const nextStyle = event.currentTarget.value.includes("ponytail")
                  ? "ponytail"
                  : event.currentTarget.value.includes("twintail")
                    ? "twintail"
                    : event.currentTarget.value.includes("bob")
                      ? "bob"
                      : event.currentTarget.value.includes("long")
                        ? "long"
                        : hair.style;
                const patch = resolveHairCommitPatch(
                  {
                    style: nextStyle,
                    ...(lockMainColor ? { baseColor, tipColor } : {}),
                  },
                  { style: usingOriginalHair ? "none" : hair.style, replaceOriginal: Boolean(replaceOriginal) },
                );
                binding.commitHairParams(patch, "헤어: 3분할 뒷머리");
              }}
              className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
            >
              {BACK_HAIR_PART_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.labelKo}</option>
              ))}
            </select>
          </label>
        </div>
      </InspectorSection>
      <InspectorSection
        title="헤어 번들 SpringBone 탄성 · 중력"
        hint="VRoid처럼 머리카락 가닥의 흔들림 탄성·중력·저항을 실시간으로 조절합니다."
        collapsible
        defaultOpen={false}
      >
        <div data-testid="shaper-hair-springbone-controls" className="space-y-2">
          <CharacterRangeControl
            label="탄성 (Stiffness)"
            hint="값이 클수록 머리카락이 원래 형태로 빠르게 복원됩니다."
            value={springStiffness}
            min={0.1}
            max={4.0}
            step={0.05}
            defaultValue={1.0}
            disabled={locked}
            onCommit={(stiffness) => applyHairSpringBone({ stiffness, gravity: springGravity, drag: springDrag })}
          />
          <CharacterRangeControl
            label="중력 (Gravity)"
            hint="머리카락이 아래로 처지는 무게감입니다."
            value={springGravity}
            min={0}
            max={1.5}
            step={0.05}
            defaultValue={0.35}
            disabled={locked}
            onCommit={(gravity) => applyHairSpringBone({ stiffness: springStiffness, gravity, drag: springDrag })}
          />
          <CharacterRangeControl
            label="공기 저항 (Drag)"
            hint="흔들림이 잦아드는 감쇠 속도입니다."
            value={springDrag}
            min={0.05}
            max={1.0}
            step={0.05}
            defaultValue={0.4}
            disabled={locked}
            onCommit={(drag) => applyHairSpringBone({ stiffness: springStiffness, gravity: springGravity, drag })}
          />
          <p role="status" className="text-xs text-fg-3">
            {springUpdatedCount > 0
              ? `실시간 SpringBone 헤어 조인트 ${springUpdatedCount}개 반영됨`
              : "모델에 VRM SpringBone 헤어 조인트가 있으면 즉시 실시간 반영됩니다."}
          </p>
        </div>
      </InspectorSection>
    </>
  );
}
