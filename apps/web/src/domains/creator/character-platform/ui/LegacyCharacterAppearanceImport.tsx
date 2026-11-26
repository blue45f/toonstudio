import { useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { LEGACY_LOOK_LIBRARY_KEY, MAX_LEGACY_RECIPE_BYTES, legacyAppearancePresets, readLegacyAppearance, readLegacyLookLibrary } from "../presets/legacy-character-appearance";
import { readLegacyCharacterDraft } from "../presets/legacy-character-draft";

import type { CharacterSlotCatalog } from "../../character-shaper/character-shaper-contract";
import type { LegacyAppearance } from "../presets/legacy-character-appearance";

interface Props {
  readonly catalog: CharacterSlotCatalog;
  readonly importPresets: (json: string) => Promise<number>;
  readonly download: (text: string, name: string) => boolean;
  readonly buttonClass: string;
}

export function LegacyCharacterAppearanceImport({ catalog, importPresets, download, buttonClass }: Props) {
  const bt = useBilingual("LegacyCharacterAppearanceImport");
  const input = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<ReturnType<typeof readLegacyLookLibrary>>([]);
  const [preview, setPreview] = useState<{ appearance: LegacyAppearance; raw: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setNotice("");
    setError("");
    try { await action(); }
    catch { setError(bt("열 수 없습니다. 원본 작업을 저장한 브라우저에서 내보낸 JSON인지 확인하세요.", "Could not open this source. Check the JSON exported from the browser where you saved it.")); }
    finally { setBusy(false); }
  };

  const open = (raw: string, name: string) => {
    if (raw.length > MAX_LEGACY_RECIPE_BYTES) throw new Error("source-too-large");
    const appearance = readLegacyAppearance(JSON.parse(raw.replace(/^\uFEFF/u, "")), name, catalog);
    setPreview({ appearance, raw, name });
  };

  return <details className="rounded-2xl border border-line bg-card/70 p-3">
    <summary className="cursor-pointer text-sm font-bold text-fg">{bt("이전 캐릭터 작업 가져오기", "Import older character work")}</summary>
    <p className="my-2 text-xs text-fg-2">{bt(
      "이전에 저장한 룩이나 레시피에서 호환 파츠와 색을 내 프리셋으로 가져옵니다. 원본 모델, 페인트, 물리 설정은 원본 JSON으로 보관할 수 있습니다.",
      "Import compatible parts and colors as personal presets. Keep the original JSON for its model settings, paint, and physics.",
    )}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={busy} onClick={() => input.current?.click()}>{bt("JSON 파일 열기", "Open JSON file")}</button>
      <input type="file" ref={input} accept=".json,application/json" hidden onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        void run(async () => {
          setPreview(null);
          if (file.size > MAX_LEGACY_RECIPE_BYTES) throw new Error("source-too-large");
          open(await file.text(), file.name);
        });
      }} />
      <button type="button" disabled={busy} className={buttonClass} onClick={() => void run(() => {
        setPreview(null);
        setSaved([]);
        const looks = readLegacyLookLibrary(window.localStorage.getItem(LEGACY_LOOK_LIBRARY_KEY));
        setSaved(looks);
        if (!looks.length) setNotice(bt("이 주소에 저장된 룩이 없습니다.", "No older looks were saved on this origin."));
      })}>{bt("이 기기의 내 룩 찾기", "Find saved looks")}</button>
      <button type="button" disabled={busy} className={buttonClass} onClick={() => void run(async () => {
        setPreview(null);
        const raw = await readLegacyCharacterDraft();
        if (raw === null) setNotice(bt("이 주소에 저장된 이전 작업이 없습니다.", "No older draft was saved on this origin."));
        else open(raw, "device-draft.character.json");
      })}>{bt("이 기기의 작업 열기", "Open saved draft")}</button>
    </div>
    {saved.length > 0 && <label className="mt-2 block text-xs text-fg-2">
      {bt("저장된 룩", "Saved looks")}
      <select className="block min-h-11 w-full" disabled={busy} value="" onChange={(event) => {
        if (!event.currentTarget.value) return;
        const item = saved[Number(event.currentTarget.value)];
        if (item) void run(() => { setPreview(null); open(JSON.stringify(item.look), `${item.name}.look.json`); });
      }}>
        <option value="">{bt("룩 선택", "Choose a look")}</option>
        {saved.map((item, index) => <option key={index} value={index}>{item.name}</option>)}
      </select>
    </label>}
    {preview && <div className="mt-2 space-y-2">
      <p className="text-xs font-semibold text-fg">{preview.appearance.name} · {preview.appearance.parts.length} {bt("호환 항목", "compatible items")}</p>
      {preview.appearance.parts.length > 0 && <p className="text-xs text-fg-2">{preview.appearance.parts.map((part) => part.label).join(" · ")}</p>}
      <button type="button" className={buttonClass} disabled={busy || !preview.appearance.parts.length} onClick={() => void run(async () => {
        const presets = await legacyAppearancePresets(preview.appearance);
        if (await importPresets(JSON.stringify(presets)) !== presets.length) {
          setError(bt("프리셋을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도하세요.", "Could not save presets. Check your storage and try again."));
          return;
        }
        setNotice(bt("내 프리셋에 저장했습니다. 각 항목의 적용 버튼으로 캐릭터에 반영하세요.", "Saved to personal presets. Use Apply on an item to update your character."));
        setPreview(null);
      })}>{bt("호환 항목 가져오기", "Import compatible items")}</button>
      <button type="button" className={buttonClass} disabled={busy} onClick={() => {
        if (!download(preview.raw, preview.name)) setError(bt("원본 파일을 저장하지 못했습니다.", "Could not save the source file."));
      }}>{bt("원본 JSON 저장", "Save original JSON")}</button>
    </div>}
    {notice && <p role="status" className="mt-2 text-xs text-fg-2">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
  </details>;
}
