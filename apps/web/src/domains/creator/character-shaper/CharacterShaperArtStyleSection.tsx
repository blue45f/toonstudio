/**
 * Character Shaper — 8종 화풍 팩 · 27채널 OKLab 색 조화 인스펙터 섹션.
 *
 * `@toonstudio/studio-project-model/character-art-style`로 승격된 화풍 팩과 27채널 색 상속 규칙을
 * 본 서비스 3D 셰이퍼 인스펙터 안에서 바로 적용할 수 있게 한다.
 * 기본 상태는 접힘(`<details>`)으로 두어 작업실의 5–9개 핵심 조작 밀도를 지킨다.
 */
import { Palette, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  ART_STYLE_PACKS,
  artStylePack,
  buildShaperMtoonSettingsFromArtStylePack,
  resolveShaper27ChannelPalette,
  summarizeArtStylePackKo,
  type ArtStyleId,
} from "./character-shaper-art-style-bridge";
import { useCharacterShaperMaterialSettings } from "./character-shaper-session-settings";
import { InspectorSection } from "./CharacterShaperInspectorParts";

import type { CharacterShaperBinding } from "./character-shaper-ui-contract";

import { cn } from "@/shared/lib/utils";

export function CharacterShaperArtStyleSection({
  binding,
  locked,
  defaultOpen = false,
}: {
  readonly binding: CharacterShaperBinding;
  readonly locked: boolean;
  readonly defaultOpen?: boolean;
}) {
  const { setShaperMaterial } = useCharacterShaperMaterialSettings();
  const [activePackId, setActivePackId] = useState<ArtStyleId | null>(null);
  const [applyPaletteWithStyle, setApplyPaletteWithStyle] = useState(false);

  const selectedPack = activePackId ? artStylePack(activePackId) : null;
  const harmony = useMemo(
    () => resolveShaper27ChannelPalette(binding.recipe.colors, activePackId ?? "kr-webtoon-romance"),
    [binding.recipe.colors, activePackId],
  );

  const handleSelectPack = (packId: ArtStyleId) => {
    if (locked) return;
    const pack = artStylePack(packId);
    setActivePackId(packId);
    const targetSkin = applyPaletteWithStyle
      ? (pack.palette.skin[0] ?? binding.recipe.colors.skin)
      : binding.recipe.colors.skin;
    const targetHair = applyPaletteWithStyle
      ? (pack.palette.hair[0] ?? binding.recipe.colors.hairBase)
      : binding.recipe.colors.hairBase;

    const nextMaterial = buildShaperMtoonSettingsFromArtStylePack(pack, {
      skinHex: targetSkin,
      hairHex: targetHair,
    });
    setShaperMaterial(nextMaterial);

    if (applyPaletteWithStyle) {
      if (pack.palette.skin[0]) binding.commitColor("skin", pack.palette.skin[0]);
      if (pack.palette.hair[0]) binding.commitColor("hairBase", pack.palette.hair[0]);
    }
  };

  return (
    <InspectorSection
      title="화풍 팩 · 27채널 색 조화"
      hint="8종 장르 화풍을 실시간 3D 셰이더에 바로 입히고, 기본 색에서 파생된 27채널 OKLab 조화 색상을 확인·적용합니다."
      collapsible
      defaultOpen={defaultOpen}
    >
      <div
        data-testid="shaper-art-style-section"
        className="space-y-3 rounded-xl border border-line/70 bg-card/70 p-2.5 text-[0.7rem]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg [word-break:keep-all]">
            <Sparkles size={13} aria-hidden className="text-accent" />
            장르 화풍 팩 (8종)
          </span>
          {selectedPack ? (
            <span
              data-testid="shaper-art-style-active-badge"
              className="rounded-md border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-semibold text-accent"
            >
              {selectedPack.labelKo}
            </span>
          ) : null}
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line/70 bg-panel px-2.5 py-1.5 text-[0.66rem] text-fg-2 [word-break:keep-all]">
          <input
            type="checkbox"
            aria-label="추천 피부·헤어 색도 함께 맞추기"
            data-testid="shaper-art-style-apply-palette"
            checked={applyPaletteWithStyle}
            disabled={locked}
            onChange={(event) => setApplyPaletteWithStyle(event.currentTarget.checked)}
            className="size-4 shrink-0 rounded border-line accent-accent"
          />
          <span>추천 피부·헤어 색도 함께 맞추기 (기본은 현재 캐릭터 색 보존)</span>
        </label>

        <div role="group" aria-label="화풍 팩 8종 선택" className="grid grid-cols-2 gap-1.5">
          {ART_STYLE_PACKS.map((pack) => {
            const active = activePackId === pack.id;
            return (
              <button
                key={pack.id}
                type="button"
                data-testid={`shaper-art-style-pack-${pack.id}`}
                aria-pressed={active}
                disabled={locked}
                onClick={() => handleSelectPack(pack.id)}
                className={cn(
                  "flex min-h-11 flex-col items-start justify-center rounded-xl border px-2.5 py-1.5 text-left [word-break:keep-all]",
                  "transition-[transform,border-color,background-color] duration-150 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none",
                  STUDIO_FOCUS_RING,
                  active
                    ? "shaper-spectrum-active border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
                )}
              >
                <span className="truncate text-[0.72rem] font-bold leading-tight">{pack.labelKo}</span>
                <span className="mt-0.5 line-clamp-1 text-[0.58rem] tabular-nums text-fg-3">
                  {summarizeArtStylePackKo(pack)}
                </span>
              </button>
            );
          })}
        </div>

        {selectedPack ? (
          <div
            data-testid="shaper-art-style-pack-palette"
            className="space-y-2 rounded-lg border border-line/70 bg-panel p-2"
          >
            <p className="text-[0.64rem] font-semibold text-fg-2 [word-break:keep-all]">
              {selectedPack.labelKo} 추천 팔레트 · 누르면 바로 칠합니다
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-8 shrink-0 text-[0.62rem] text-fg-3">피부</span>
                <div className="flex flex-wrap gap-1">
                  {selectedPack.palette.skin.map((hex) => (
                    <button
                      key={`skin-${hex}`}
                      type="button"
                      disabled={locked}
                      aria-label={`${selectedPack.labelKo} 피부색 ${hex}`}
                      title={`피부 ${hex}`}
                      onClick={() => binding.commitColor("skin", hex)}
                      className={cn(
                        "group/swatch grid size-[44px] shrink-0 place-items-center rounded-md disabled:opacity-45",
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none grid size-7 place-items-center rounded-md border border-line transition-transform duration-150 group-hover/swatch:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                      >
                        <span
                          className="size-5 rounded-sm outline-1 -outline-offset-1 outline-black/15"
                          style={{ backgroundColor: hex }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-8 shrink-0 text-[0.62rem] text-fg-3">헤어</span>
                <div className="flex flex-wrap gap-1">
                  {selectedPack.palette.hair.map((hex) => (
                    <button
                      key={`hair-${hex}`}
                      type="button"
                      disabled={locked}
                      aria-label={`${selectedPack.labelKo} 헤어색 ${hex}`}
                      title={`헤어 ${hex}`}
                      onClick={() => binding.commitColor("hairBase", hex)}
                      className={cn(
                        "group/swatch grid size-[44px] shrink-0 place-items-center rounded-md disabled:opacity-45",
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none grid size-7 place-items-center rounded-md border border-line transition-transform duration-150 group-hover/swatch:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                      >
                        <span
                          className="size-5 rounded-sm outline-1 -outline-offset-1 outline-black/15"
                          style={{ backgroundColor: hex }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div
          data-testid="shaper-oklab-27-harmony"
          className="space-y-2 border-t border-line/60 pt-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg [word-break:keep-all]">
              <Palette size={13} aria-hidden className="text-accent" />
              27채널 OKLab 자동 색 조화
            </span>
            <button
              type="button"
              data-testid="shaper-oklab-apply-hair-tip"
              disabled={locked}
              onClick={() => binding.commitColor("hairTip", harmony.recommendedHairTipHex)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[0.64rem] font-semibold text-fg-2 [word-break:keep-all]",
                "transition-[background-color,border-color,color] duration-150 hover:border-line-strong hover:bg-raised hover:text-fg disabled:opacity-45 motion-reduce:transition-none",
                STUDIO_FOCUS_RING,
              )}
            >
              <span
                className="size-3 rounded-full outline-1 -outline-offset-1 outline-black/15"
                style={{ backgroundColor: harmony.recommendedHairTipHex }}
              />
              헤어 끝색 맞춤
            </button>
          </div>

          <div className="space-y-1.5">
            {harmony.groups.map((group) => (
              <div key={group.id} className="rounded-lg border border-line/60 bg-panel/80 p-2">
                <p className="text-[0.62rem] font-semibold text-fg-3 [word-break:keep-all]">{group.titleKo}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.swatches.map((swatch) => (
                    <span
                      key={swatch.key}
                      data-testid={`shaper-oklab-swatch-${swatch.key}`}
                      title={`${swatch.labelKo} ${swatch.hex} (${swatch.originLabelKo})`}
                      className="inline-flex items-center gap-1 rounded-md border border-line/70 bg-card px-1.5 py-0.5 text-[0.6rem] text-fg-2"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full outline-1 -outline-offset-1 outline-black/15"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      <span>{swatch.labelKo}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </InspectorSection>
  );
}
