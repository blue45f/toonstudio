import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { FullVrmState } from "../vrm/studio-vrm-poser-utils";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

export function CharacterShaperSavedVariants({ h, disabled, onRestore, query = "" }: {
  readonly h: StudioVrmPoserHost;
  readonly disabled: boolean;
  readonly onRestore?: () => void;
  readonly query?: string;
}) {
  const bt = useBilingual("CharacterShaperSavedVariants");
  const id = useId();
  const states: Record<string, FullVrmState> = h.savedFullStates ?? {};
  const names = Object.keys(states).filter((name) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const entries: readonly VrmLibraryEntry[] = h.libraryEntries ?? [];
  const [request, setRequest] = useState<{ name: string; source: FullVrmState; modelId: string } | null>(null);
  const [error, setError] = useState("");
  const active = useRef(request);
  const restore = useEffectEvent(async (selected: NonNullable<typeof request>) => {
    let restored: boolean;
    try { restored = await h.handleLoadFullLocal(selected.name) === true; }
    catch { restored = false; }
    if (active.current !== selected) return;
    active.current = null;
    setRequest(null);
    if (restored) onRestore?.();
    else setError(bt("저장한 변형을 불러오지 못했어요. 다시 선택해 주세요.", "Could not restore the saved look. Choose it again."));
  });
  const started = useRef(request);
  useEffect(() => {
    if (!request) return;
    if (h.activeModelId !== request.modelId || h.savedFullStates?.[request.name] !== request.source || h.status === "error") {
      active.current = null;
      setRequest(null);
      setError(bt("원본 캐릭터를 확인하지 못해 변형을 적용하지 않았어요.", "The source character could not be verified. The look was not applied."));
      return;
    }
    if (h.status !== "ready" || h.vrmCreativeReadOnly || disabled || started.current === request) return;
    started.current = request;
    void restore(request);
  }, [bt, disabled, h.activeModelId, h.savedFullStates, h.status, h.vrmCreativeReadOnly, request]);
  useEffect(() => () => { active.current = null; }, []);
  if (names.length === 0 && !request && !error) return null;
  return <label htmlFor={id} className="grid gap-1 px-1 py-2 text-xs font-medium text-fg-2">
    <span id={`${id}-label`}>{bt("저장한 변형 열기", "Open a saved look")}</span>
    <select id={id} aria-labelledby={`${id}-label`} value="" disabled={disabled || Boolean(request) || h.vrmCreativeReadOnly || h.status !== "ready"}
      className="min-h-11 w-full rounded border border-line bg-panel px-2 text-fg"
      onChange={(event) => {
        const name = event.currentTarget.value;
        if (!Object.hasOwn(states, name)) return;
        const source = states[name];
        const modelId = source.modelId ?? h.activeModelId;
        const original = entries.find((entry) => entry.id === modelId);
        if (!modelId || (modelId !== h.activeModelId && !original)) return;
        const selected = { name, source, modelId };
        active.current = selected;
        setError("");
        setRequest(selected);
        if (original && modelId !== h.activeModelId) h.loadModelFromLibraryEntry(original);
      }}>
      <option value="">{bt("변형 선택", "Choose a look")}</option>
      {names.map((name) => {
        const model = states[name]?.modelId;
        const other = Boolean(model && model !== h.activeModelId);
        const entry = entries.find((entry) => entry.id === model);
        const source = entry?.name ?? model;
        return <option key={name} value={name} disabled={other && !entry}>
          {other ? `${name} · ${bt("원본 모델", "Source model")} ${source}` : name}
        </option>;
      })}
    </select>
    {request && <span role="status">{bt("원본과 저장한 변형을 불러오는 중…", "Loading the source character and saved look…")}</span>}
    {error && <span role="alert">{error}</span>}
  </label>;
}
