import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { getCharacterDocumentV3Repository } from "../character-platform/document/character-document-v3-repository";
import { createStudioCharacterAsset, readStudioCharacterAssets, sceneUsesCharacterModel, type StudioCharacterAsset } from "./studio-character-asset-library";

import type { CharacterAuthoringAuthorityHookResult } from "../character-platform/ui/use-character-authoring-authority";
import type { StudioVrmPoserInsertResult } from "../scene-3d/studio-3d-insert-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function useStudioCharacterAssets(h: StudioVrmPoserHost, authoring: CharacterAuthoringAuthorityHookResult,
  activeId: string | undefined, select: (asset: StudioCharacterAsset) => void, open: boolean) {
  const bt = useBilingual("StudioCharacterAssets");
  const [entries, setEntries] = useState<readonly StudioCharacterAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const owner = useRef<typeof authoring.authority | null>(null);
  const pending = useRef(false);
  const listVersion = useRef(0);
  const bound = useRef<StudioCharacterAsset | null>(null);
  const library: readonly VrmLibraryEntry[] = h.libraryEntries ?? [];
  const model = library.find(entry => entry.id === h.activeModelId);

  useLayoutEffect(() => {
    owner.current = authoring.authority;
    bound.current = null;
    return () => { owner.current = null; };
  }, [authoring.authority]);

  useEffect(() => {
    if (!open) return;
    const version = ++listVersion.current;
    void readStudioCharacterAssets().then(items => {
      if (listVersion.current === version) { setEntries(items); setError(null); }
    }, (cause: unknown) => {
      if (listVersion.current === version) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { ++listVersion.current; };
  }, [open, retry]);

  async function saveAs(name: string) {
    if (!authoring.hydrated || !model || pending.current || authoring.authority.getSnapshot().previewDocument) return null;
    const source = authoring.authority.getSnapshot().document;
    if (source.model.assetId !== model.id) return null;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await createStudioCharacterAsset(source, name);
      if (owner.current !== authoring.authority) return null;
      ++listVersion.current;
      setEntries(result.entries);
      bound.current = result.asset;
      select(result.asset);
      return result.asset;
    } catch (cause) {
      if (owner.current === authoring.authority) setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      pending.current = false;
      if (owner.current) setBusy(false);
    }
  }

  async function openAsset(asset: StudioCharacterAsset) {
    if (pending.current || !authoring.hydrated) return false;
    const target = library.find(entry => entry.id === asset.modelId);
    if (!target) {
      setError(bt("이 캐릭터의 원본 모델을 이 기기에서 찾지 못했습니다.", "This character's source model is unavailable on this device."));
      return false;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!await authoring.saveNow() || owner.current !== authoring.authority) return false;
      const document = await getCharacterDocumentV3Repository().load(asset.documentId);
      if (!document || document.model.assetId !== target.id) throw new Error(bt("저장한 캐릭터 문서를 확인할 수 없습니다.", "The saved character document could not be verified."));
      if (owner.current !== authoring.authority) return false;
      if (target.id !== model?.id) h.loadModelFromLibraryEntry(target);
      select(asset);
      return true;
    } catch (cause) {
      if (owner.current === authoring.authority) setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      pending.current = false;
      if (owner.current) setBusy(false);
    }
  }

  async function insert(result: StudioVrmPoserInsertResult, place: StudioVrmPoserProps["onInsert"]) {
    if (!authoring.hydrated || !model || !sceneUsesCharacterModel(result.scene.model, model)) return false;
    let documentId = activeId ?? bound.current?.documentId;
    if (documentId) {
      if (authoring.authority.getSnapshot().document.documentId !== documentId || !await authoring.saveNow()
        || owner.current !== authoring.authority) return false;
    } else {
      const created = await saveAs(model.name);
      if (!created) return false;
      documentId = created.documentId;
    }
    return place({ ...result, scene: { ...result.scene, characterDocumentId: documentId } });
  }

  const reload = useCallback(() => setRetry(value => value + 1), []);
  return { entries, activeId, error, busy, reload, create: async (name: string) => Boolean(await saveAs(name)), select: openAsset, insert };
}
