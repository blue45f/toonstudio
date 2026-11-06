/**
 * SlotPanel v3 커스터마이즈 섹션: 겹쳐 입기 층(`wardrobe/set`), 추가 소품 인스턴스(`accessory/add|remove|set`), 코디 세트(`look-preset/apply`).
 */
import { useState } from "react";

import {
  ACCESSORY_ANCHORS,
  ACCESSORY_ANCHOR_LABELS_KO,
  MAX_EXTRA_ACCESSORIES,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  WARDROBE_LAYER_SLOT,
  isLayerPreset,
  isPresetId,
  presetSlot,
} from "../../../contracts";
import { LOOK_SET_GENRES, LOOK_SET_GENRE_LABELS_KO, composeLookSetLook, lookSetsForGenre } from "../../../presets";
import { useCatalog, useDispatch, useLabState } from "../lab-store-context";

import type { AccessoryAnchor, PresetId, WardrobeLayer } from "../../../contracts";
import type { LookSet, LookSetGenre } from "../../../presets";

function isAccessoryAnchor(value: string): value is AccessoryAnchor {
  return (ACCESSORY_ANCHORS as readonly string[]).includes(value);
}

export function SlotCustomizeSections() {
  const { recipe } = useLabState();
  const dispatch = useDispatch();
  const catalog = useCatalog();

  const accessoryEntries = catalog.bySlot("accessory");
  const [newAccPreset, setNewAccPreset] = useState<PresetId | "">(accessoryEntries[0]?.id ?? "accessory/glasses");
  const [newAccAnchor, setNewAccAnchor] = useState<AccessoryAnchor>("head-top");
  const [activeGenre, setActiveGenre] = useState<LookSetGenre>("school");

  const handleLayerChange = (layer: WardrobeLayer, raw: string): void => {
    if (raw === "") {
      dispatch({ type: "wardrobe/set", layer, presetId: null });
      return;
    }
    if (isLayerPreset(layer, raw)) {
      dispatch({ type: "wardrobe/set", layer, presetId: raw });
    }
  };

  const handleAddAccessory = (): void => {
    if (recipe.wardrobe.accessories.length >= MAX_EXTRA_ACCESSORIES) return;
    const candidate = newAccPreset || accessoryEntries[0]?.id || "accessory/glasses";
    if (!isPresetId(candidate) || presetSlot(candidate) !== "accessory") return;
    dispatch({
      type: "accessory/add",
      presetId: candidate,
      anchor: newAccAnchor,
    });
  };

  const handleApplyLookSet = (set: LookSet): void => {
    const composed = composeLookSetLook(set, recipe);
    if (composed.ok) {
      dispatch({ type: "look-preset/apply", look: composed.look });
    }
  };

  const genreSets = lookSetsForGenre(activeGenre);

  return (
    <div className="cl-slot-customize" data-testid="slot-customize-sections">
      <div className="cl-slot-customize-group" role="group" aria-label="겹쳐 입기 층">
        <h3 className="cl-slot-subtitle">겹쳐 입기 층 (이너·아우터·레그웨어)</h3>
        {WARDROBE_LAYERS.map((layer) => {
          const baseSlot = WARDROBE_LAYER_SLOT[layer];
          const options = catalog.bySlot(baseSlot);
          const current = recipe.wardrobe[layer] ?? "";
          return (
            <div key={layer} className="cl-slot-customize-row">
              <label htmlFor={`cl-wardrobe-layer-${layer}`}>{WARDROBE_LAYER_LABELS_KO[layer]} 층</label>
              <select
                id={`cl-wardrobe-layer-${layer}`}
                aria-label={`${WARDROBE_LAYER_LABELS_KO[layer]} 층 프리셋`}
                data-testid={`wardrobe-layer-${layer}`}
                value={current}
                onChange={(event) => handleLayerChange(layer, event.target.value)}
              >
                <option value="">없음 (미착용)</option>
                {options.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.labelKo} ({entry.id})
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="cl-slot-customize-group" role="group" aria-label="추가 소품 인스턴스">
        <h3 className="cl-slot-subtitle">
          추가 소품 ({recipe.wardrobe.accessories.length}/{MAX_EXTRA_ACCESSORIES})
        </h3>
        <div className="cl-slot-customize-row">
          <label htmlFor="cl-extra-acc-preset">소품 종류</label>
          <select
            id="cl-extra-acc-preset"
            aria-label="추가할 소품 프리셋"
            data-testid="extra-accessory-preset-select"
            value={newAccPreset}
            onChange={(event) => {
              if (isPresetId(event.target.value)) setNewAccPreset(event.target.value);
            }}
          >
            {accessoryEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.labelKo}
              </option>
            ))}
          </select>
          <label htmlFor="cl-extra-acc-anchor">부착 위치</label>
          <select
            id="cl-extra-acc-anchor"
            aria-label="추가할 소품 부착 위치"
            data-testid="extra-accessory-anchor-select"
            value={newAccAnchor}
            onChange={(event) => {
              if (isAccessoryAnchor(event.target.value)) setNewAccAnchor(event.target.value);
            }}
          >
            {ACCESSORY_ANCHORS.map((anchor) => (
              <option key={anchor} value={anchor}>
                {ACCESSORY_ANCHOR_LABELS_KO[anchor]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cl-button cl-button-small"
            data-testid="extra-accessory-add-btn"
            disabled={recipe.wardrobe.accessories.length >= MAX_EXTRA_ACCESSORIES || accessoryEntries.length === 0}
            onClick={handleAddAccessory}
          >
            소품 추가
          </button>
        </div>

        {recipe.wardrobe.accessories.length > 0 ? (
          <ul className="cl-slot-accessory-list" aria-label="착용 중인 추가 소품">
            {recipe.wardrobe.accessories.map((inst) => {
              const entry = catalog.get(inst.presetId);
              return (
                <li key={inst.id} className="cl-slot-accessory-item" data-testid={`extra-accessory-item-${inst.id}`}>
                  <span>
                    {inst.id}: {entry?.labelKo ?? inst.presetId}
                  </span>
                  <select
                    aria-label={`${inst.id} 앵커 변경`}
                    data-testid={`extra-accessory-anchor-${inst.id}`}
                    value={inst.anchor}
                    onChange={(event) => {
                      if (isAccessoryAnchor(event.target.value)) {
                        dispatch({ type: "accessory/set", id: inst.id, anchor: event.target.value });
                      }
                    }}
                  >
                    {ACCESSORY_ANCHORS.map((anchor) => (
                      <option key={anchor} value={anchor}>
                        {ACCESSORY_ANCHOR_LABELS_KO[anchor]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="cl-button cl-button-small"
                    aria-label={`${inst.id} 소품 제거`}
                    data-testid={`extra-accessory-remove-${inst.id}`}
                    onClick={() => dispatch({ type: "accessory/remove", id: inst.id })}
                  >
                    소품 제거
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="cl-slot-customize-group" role="group" aria-label="코디 세트 프리셋">
        <h3 className="cl-slot-subtitle">코디 세트 (24종 · 의상 구역 일괄 적용)</h3>
        <div className="cl-slot-customize-row">
          <label htmlFor="cl-look-set-genre">코디 장르</label>
          <select
            id="cl-look-set-genre"
            aria-label="코디 장르 선택"
            data-testid="look-set-genre-select"
            value={activeGenre}
            onChange={(event) => setActiveGenre(event.target.value as LookSetGenre)}
          >
            {LOOK_SET_GENRES.map((genre) => (
              <option key={genre} value={genre}>
                {LOOK_SET_GENRE_LABELS_KO[genre]}
              </option>
            ))}
          </select>
        </div>
        <div className="cl-slot-look-set-grid" role="group" aria-label="장르별 코디 세트">
          {genreSets.map((set) => (
            <button
              key={set.id}
              type="button"
              className="cl-button cl-button-small"
              data-testid={`look-set-apply-${set.id}`}
              title={set.descriptionKo}
              onClick={() => handleApplyLookSet(set)}
            >
              코디 세트: {set.nameKo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
