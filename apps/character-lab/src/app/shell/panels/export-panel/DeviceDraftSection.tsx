import { useEffect, useRef, useState } from "react";

import { failVisible, isLabFailure } from "../../../../contracts";
import { exportRecipe } from "../../../../export/export-session";
import { MAX_RECIPE_FILE_BYTES } from "../../../../export/recipe-file";
import { deviceDraftKey, readDeviceDraft, writeDeviceDraft } from "../../../../state/device-draft.browser";
import { captureCharacterWorkBackup, capturedWorkCheckpoint, markCapturedWorkSaved } from "../../unsaved-work";

import type { LabStore } from "../../../../contracts";
import type { ExportReceipt } from "../../../../export/export-session";
import type { PaintSession } from "../../../../paint/paint-session";

type StorageAction = "draft-load" | "draft-save" | "recipe";

interface StorageOptions {
  readonly store: LabStore;
  readonly session: PaintSession;
  readonly now: () => number;
  readonly run: (action: StorageAction, task: () => Promise<void>) => Promise<void>;
  readonly saveFile: (result: { ok: true; bytes: Uint8Array; receipt: ExportReceipt }) => boolean;
  readonly openDraft: (text: string) => Promise<void>;
  readonly onSaved: (device: boolean) => void;
}

export function useRecipeStorage({ store, session, now, run, saveFile, openDraft, onSaved }: StorageOptions) {
  const mounted = useRef(true);
  const [draftKey, setDraftKey] = useState<number | null | undefined>(undefined);
  const [draftUnavailable, setDraftUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void deviceDraftKey().then(
      (key) => { if (active) setDraftKey(key); },
      () => { if (active) setDraftUnavailable(true); },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);

  const save = (device: boolean): void => {
    void run(device ? "draft-save" : "recipe", async () => {
      const state = store.getState();
      const snapshot = captureCharacterWorkBackup(state.recipe, state.capabilities, session, now());
      const checkpoint = capturedWorkCheckpoint(snapshot);
      const result = await exportRecipe(snapshot.recipe, snapshot.paintLayers, { now, sublayers: snapshot.paintSublayers });
      if (!result.ok) throw result.failure;
      if (device) {
        if (result.bytes.byteLength > MAX_RECIPE_FILE_BYTES) throw failVisible("draft-too-large", "작업이 레시피 용량 한도(64 MiB)를 넘습니다.");
        try {
          const key = await writeDeviceDraft(new TextDecoder().decode(result.bytes), draftKey ?? null);
          if (mounted.current) {
            setDraftKey(key);
            setDraftUnavailable(false);
          }
        } catch (error) {
          if (isLabFailure(error) && error.code === "draft-changed") {
            const latest = await deviceDraftKey();
            if (mounted.current) {
              setDraftKey(latest);
              setDraftUnavailable(false);
            }
          }
          throw error;
        }
      } else if (!saveFile(result)) return;
      markCapturedWorkSaved(store, checkpoint);
      if (mounted.current) onSaved(device);
    });
  };
  const loadDraft = (): void => {
    void run("draft-load", async () => {
      const draft = await readDeviceDraft();
      if (!mounted.current) return;
      setDraftKey(draft.key);
      setDraftUnavailable(false);
      await openDraft(draft.text);
    });
  };
  return { draftKey, draftUnavailable, loadDraft, saveRecipe: () => save(false), saveDraft: () => save(true) };
}

export function DeviceDraftSection({ storage, busy }: { readonly storage: ReturnType<typeof useRecipeStorage>; readonly busy: boolean }) {
  const { draftUnavailable, draftKey, saveDraft, loadDraft } = storage;
  return (
      <fieldset className="cl-export-psd">
        <legend>이 기기의 작업</legend>
        <p>{draftUnavailable ? "브라우저 저장소를 열 수 없습니다. 레시피 파일로도 보관할 수 있습니다." : draftKey === undefined ? "저장본 확인 중…" : draftKey === null ? "아직 이 브라우저에 저장한 작업이 없습니다." : "캐릭터와 페인트 레이어가 저장되어 있습니다."}</p>
        <div className="cl-export-row">
          <button type="button" onClick={saveDraft} disabled={busy || (draftKey === undefined && !draftUnavailable)}>
            {typeof draftKey === "number" ? "현재 작업으로 덮어쓰기" : "이 기기에 작업 저장"}
          </button>
          <button type="button" onClick={loadDraft} disabled={busy || typeof draftKey !== "number"}>저장한 작업 열기</button>
        </div>
      </fieldset>
  );
}
