import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { readStudioCharacterPreview, subscribeStudioCharacterPreview, type StudioCharacterAsset } from "./studio-character-asset-library";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface CharacterAssetLibraryActions {
  readonly entries: readonly StudioCharacterAsset[];
  readonly activeId?: string;
  readonly error: string | null;
  readonly busy: boolean;
  readonly create: (name: string) => Promise<boolean>;
  readonly select: (asset: StudioCharacterAsset) => Promise<boolean>;
  readonly reload: () => void;
}

function CharacterAssetThumbnail({ id }: { readonly id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      void readStudioCharacterPreview(id).then(value => {
        if (current === generation) setSrc(value);
      }).catch(() => { if (current === generation) setSrc(null); });
    };
    const unsubscribe = subscribeStudioCharacterPreview(id, refresh);
    refresh();
    return () => { ++generation; unsubscribe(); };
  }, [id]);
  return <span className="character-library__portrait">{src
    ? <img src={src} alt="" loading="lazy" decoding="async" /> : <UserRound size={25} aria-hidden />}</span>;
}

export function CharacterAssetLibraryControls({ assets, disabled, query }: {
  readonly assets: CharacterAssetLibraryActions;
  readonly disabled: boolean;
  readonly query: string;
}) {
  const bt = useBilingual("CharacterAssetLibraryControls");
  const [name, setName] = useState("");
  const matches = assets.entries.filter((asset) => asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="grid gap-2 px-1 py-2" aria-label={bt("저장한 3D 캐릭터", "Saved 3D characters")}>
    <form className="grid gap-1" onSubmit={async (event) => {
      event.preventDefault();
      if (!disabled && !assets.busy && name.trim() && await assets.create(name)) setName("");
    }}>
      <label className="grid gap-1 text-xs text-fg-2">
        {bt("새 캐릭터 이름", "New character name")}
        <input className="min-h-11 rounded border border-line bg-panel px-2 text-fg" maxLength={80}
          value={name} onChange={(event) => setName(event.currentTarget.value)} />
      </label>
      <button type="submit" className="character-library__import" disabled={disabled || assets.busy || !name.trim()}>
        {bt("현재 외형으로 3D 캐릭터 만들기", "Create a 3D character from this look")}
      </button>
    </form>
    {matches.length > 0 && <ul className="character-library__list">{matches.map((asset) => <li key={asset.documentId}>
      <button type="button" aria-pressed={assets.activeId === asset.documentId} disabled={disabled || assets.busy}
        onClick={() => void assets.select(asset)}><CharacterAssetThumbnail id={asset.documentId} />{asset.name}</button>
    </li>)}</ul>}
    {assets.error && <div role="alert" className="text-xs text-bad">{assets.error}
      <button type="button" className="block min-h-11 underline" onClick={assets.reload}>{bt("목록 다시 읽기", "Reload list")}</button>
    </div>}
  </section>;
}
