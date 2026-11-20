/**
 * Character Shaper — VRoid급 레이어드 의상 중첩(`inner` + `top` + `outer` + `legwear`)
 * 및 모델 원본 의상 다중 채널 리컬러·표시 토글 섹션.
 */
import { Eye, EyeOff, Layers } from "lucide-react";
import { useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { COSTUME_PALETTES, COSTUME_SLOT_LABELS } from "../vrm/studio-vrm-costume";
import { WARDROBE_FIT_MAX, WARDROBE_FIT_MIN, WARDROBE_ITEMS, WARDROBE_SLOT_LABELS } from "../vrm/studio-vrm-wardrobe";
import { frozenStatus3Text } from "../studio-frozen3-status-i18n";

import { CharacterColorControl, CharacterRangeControl } from "./CharacterShaperControls";
import { InspectorNote as Note, InspectorSection as Section } from "./CharacterShaperInspectorParts";

import type { CharacterSlotKind } from "./character-shaper-contract";
import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";
import type { CostumeSlot } from "../vrm/studio-vrm-costume";
import type { StudioVrmCostumeMeshEntry } from "../vrm/studio-vrm-costume-runtime";
import type { WardrobeEquip, WardrobeSlot } from "../vrm/studio-vrm-wardrobe";

import { cn } from "@/shared/lib/utils";

const WARDROBE_SLOTS_BY_SLOT: Partial<Record<CharacterSlotKind, readonly WardrobeSlot[]>> = {
  top: ["top", "outer"],
  bottom: ["bottom"],
  shoes: ["shoes"],
};

const COSTUME_SLOTS_BY_SLOT: Partial<Record<CharacterSlotKind, readonly CostumeSlot[]>> = {
  top: ["innerwear", "tops", "outer", "onepiece"],
  bottom: ["bottoms"],
  shoes: ["shoes"],
};

const LAYERED_OVERLAY_CHANNELS = Object.freeze([
  { id: "inner", labelKo: "이너웨어", costumeSlot: "innerwear" as CostumeSlot, wardrobeSlot: "top" as WardrobeSlot },
  { id: "top", labelKo: "상의", costumeSlot: "tops" as CostumeSlot, wardrobeSlot: "top" as WardrobeSlot },
  { id: "outer", labelKo: "아우터", costumeSlot: "outer" as CostumeSlot, wardrobeSlot: "outer" as WardrobeSlot },
  { id: "legwear", labelKo: "하의·레그웨어", costumeSlot: "bottoms" as CostumeSlot, wardrobeSlot: "bottom" as WardrobeSlot },
]);

const SWATCH_TONE =
  "grid size-11 min-h-11 min-w-11 place-items-center rounded-lg border border-line transition-colors duration-150 hover:border-line-strong motion-reduce:transition-none";

export function CharacterShaperGarmentSection({
  h,
  slot,
  locked,
}: Pick<CharacterShaperInspectorProps, "h" | "slot"> & { readonly locked: boolean }) {
  const [activeOverlayChannel, setActiveOverlayChannel] = useState<(typeof LAYERED_OVERLAY_CHANNELS)[number]["id"]>(
    slot === "bottom" ? "legwear" : "top",
  );
  const wardrobeSlots = WARDROBE_SLOTS_BY_SLOT[slot] ?? [];
  const costumeSlots = COSTUME_SLOTS_BY_SLOT[slot] ?? [];
  const wardrobeState = (h.wardrobeState ?? {}) as Partial<Record<WardrobeSlot, WardrobeEquip>>;
  const costumeMeshes: readonly StudioVrmCostumeMeshEntry[] = Array.isArray(h.costumeMeshes) ? h.costumeMeshes : [];
  const hiddenKeys: readonly string[] = Array.isArray(h.costumeState?.hidden) ? h.costumeState.hidden : [];

  const equipped = wardrobeSlots
    .map((wardrobeSlot) => ({ wardrobeSlot, equip: wardrobeState[wardrobeSlot] ?? null }))
    .filter((row): row is { wardrobeSlot: WardrobeSlot; equip: WardrobeEquip } => row.equip !== null);
  const meshes = costumeMeshes.filter((entry) => costumeSlots.includes(entry.slot));
  const presentCostumeSlots = costumeSlots.filter((costumeSlot) =>
    meshes.some((entry) => entry.slot === costumeSlot),
  );

  const selectedOverlay =
    LAYERED_OVERLAY_CHANNELS.find((channel) => channel.id === activeOverlayChannel) ?? LAYERED_OVERLAY_CHANNELS[1]!;
  const overlayWardrobeItems = WARDROBE_ITEMS.filter((item) => item.slot === selectedOverlay.wardrobeSlot).slice(0, 4);

  return (
    <>
      <Section
        title="레이어드 의상 중첩 (이너 · 상의 · 아우터 · 레그웨어)"
        hint="VRoid처럼 여러 층의 의상을 겹쳐 입고 층별 색·품을 독립 조절합니다."
        collapsible
        defaultOpen={false}
      >
        <div
          data-testid="shaper-layered-outfit-overlay"
          className="space-y-2 rounded-xl border border-line/70 bg-card/70 p-2.5"
        >
          <div role="tablist" aria-label="레이어드 의상 층" className="grid grid-cols-2 gap-1">
            {LAYERED_OVERLAY_CHANNELS.map((channel) => {
              const active = channel.id === activeOverlayChannel;
              const isEquipped = Boolean(wardrobeState[channel.wardrobeSlot]);
              return (
                <button
                  key={channel.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={locked}
                  onClick={() => setActiveOverlayChannel(channel.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-between gap-1 rounded-lg border px-2 text-xs font-semibold transition-colors disabled:opacity-45",
                    STUDIO_FOCUS_RING,
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised",
                  )}
                >
                  <span className="inline-flex items-center gap-1 truncate">
                    <Layers size={12} aria-hidden />
                    {channel.labelKo}
                  </span>
                  <span className="text-[0.68rem] text-fg-3">{isEquipped ? "착용" : "원본"}</span>
                </button>
              );
            })}
          </div>
          {overlayWardrobeItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-1">
              {overlayWardrobeItems.map((item) => {
                const currentId = wardrobeState[selectedOverlay.wardrobeSlot]?.itemId ?? null;
                const active = currentId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    disabled={locked}
                    onClick={() => h.equipWardrobeItem?.(selectedOverlay.wardrobeSlot, active ? null : item.id)}
                    className={cn(
                      "min-h-11 truncate rounded-lg border px-2 text-xs font-medium transition-colors disabled:opacity-45",
                      STUDIO_FOCUS_RING,
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel text-fg-2 hover:bg-raised",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div role="group" aria-label={`${selectedOverlay.labelKo} 채널 리컬러`} className="flex flex-wrap gap-1">
            {COSTUME_PALETTES.slice(0, 6).map((palette) => (
              <button
                key={palette.id}
                type="button"
                disabled={locked}
                aria-label={`${selectedOverlay.labelKo} ${palette.label} 색 적용`}
                title={`${selectedOverlay.labelKo}: ${palette.label}`}
                onClick={() => {
                  if (wardrobeState[selectedOverlay.wardrobeSlot]) {
                    h.updateWardrobeEquip?.(selectedOverlay.wardrobeSlot, { color: palette.color });
                  }
                  h.recolorCostumeSlot?.(selectedOverlay.costumeSlot, palette.color);
                }}
                className={cn(SWATCH_TONE, STUDIO_FOCUS_RING, "disabled:cursor-not-allowed disabled:opacity-45")}
              >
                <span
                  aria-hidden
                  className="size-7 rounded-md border border-line/60"
                  style={{ backgroundColor: palette.color }}
                />
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="입힌 옷" hint="셰이퍼가 입힌 옷의 색과 품을 조절합니다.">
        {equipped.length === 0 ? (
          <Note>
            {frozenStatus3Text(
              "studio.frozenStatus3.shaper.emptyNoCostume",
              "아직 이 슬롯에 입힌 옷이 없습니다. 왼쪽 카드에서 하나 골라 보세요.",
            )}
          </Note>
        ) : (
          equipped.map(({ wardrobeSlot, equip }) => (
            <div key={wardrobeSlot} className="space-y-2">
              <p className="text-[0.66rem] font-bold text-fg-3">{WARDROBE_SLOT_LABELS[wardrobeSlot]}</p>
              <CharacterColorControl
                label={`${WARDROBE_SLOT_LABELS[wardrobeSlot]} 색`}
                value={equip.color ?? null}
                disabled={locked}
                onCommit={(color) => {
                  if (color === null) return;
                  h.updateWardrobeEquip(wardrobeSlot, { color });
                }}
              />
              {typeof equip.fit === "number" ? (
                <CharacterRangeControl
                  label={`${WARDROBE_SLOT_LABELS[wardrobeSlot]} 품`}
                  hint="몸에 붙게(작게) 또는 헐렁하게(크게)"
                  value={equip.fit}
                  min={WARDROBE_FIT_MIN}
                  max={WARDROBE_FIT_MAX}
                  step={0.01}
                  unit="×"
                  defaultValue={1}
                  disabled={locked}
                  onCommit={(fit) => h.updateWardrobeEquip(wardrobeSlot, { fit })}
                />
              ) : null}
            </div>
          ))
        )}
      </Section>

      <Section title="모델 원본 의상" hint="모델이 원래 입고 있던 메시를 켜고 끄거나 색을 덮습니다.">
        {meshes.length === 0 ? (
          <Note>
            {frozenStatus3Text(
              "studio.frozenStatus3.shaper.emptyNoOriginalCostume",
              "이 모델에는 이 부위로 분류된 원본 의상 메시가 없습니다.",
            )}
          </Note>
        ) : (
          <>
            {presentCostumeSlots.map((costumeSlot) => (
              <div
                key={costumeSlot}
                role="group"
                aria-label={`${COSTUME_SLOT_LABELS[costumeSlot]} 색 덮기`}
                className="flex flex-wrap items-center gap-1"
              >
                <span className="mr-1 text-[0.66rem] font-bold text-fg-3">{COSTUME_SLOT_LABELS[costumeSlot]}</span>
                {COSTUME_PALETTES.slice(0, 6).map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    disabled={locked}
                    aria-label={`${COSTUME_SLOT_LABELS[costumeSlot]} ${palette.label}으로 덮기`}
                    title={`${palette.label} ${palette.color.toUpperCase()}`}
                    onClick={() => h.recolorCostumeSlot(costumeSlot, palette.color)}
                    className={cn(SWATCH_TONE, STUDIO_FOCUS_RING, "disabled:cursor-not-allowed disabled:opacity-45")}
                  >
                    <span
                      aria-hidden
                      className="size-7 rounded-md border border-line/60"
                      style={{ backgroundColor: palette.color }}
                    />
                  </button>
                ))}
              </div>
            ))}
            <ul className="space-y-1">
              {meshes.map((entry) => {
                const hidden = hiddenKeys.includes(entry.key);
                return (
                  <li key={entry.key}>
                    <button
                      type="button"
                      aria-pressed={!hidden}
                      disabled={locked}
                      title={hidden ? `${entry.label} 다시 표시` : `${entry.label} 숨기기`}
                      onClick={() => h.toggleCostumeMesh(entry.key)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-xl border px-2.5 text-left text-[0.7rem] font-semibold",
                        "transition-colors disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                        STUDIO_FOCUS_RING,
                        hidden
                          ? "border-line bg-card text-fg-3"
                          : "border-accent/45 bg-accent-soft/60 text-accent",
                      )}
                    >
                      {hidden ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      <span className="shrink-0 text-[0.62rem] font-bold">{hidden ? "숨김" : "표시"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}
