import { useLayoutEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioHybridDccFileToolsModel } from "./useStudioHybridDccFileTools";

const BUTTON = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

function WorkfileReplacement({ model }: { readonly model: StudioHybridDccFileToolsModel }) {
  const bt = useBilingual("StudioHybridDccFileTools");
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); };
  }, []);
  return createPortal(<dialog ref={dialog} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-studio-escape-scope="true" className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-5 text-fg shadow-2xl backdrop:bg-black/60" onCancel={(event) => { event.preventDefault(); model.cancel(); }}>
    <h3 id={`${id}-title`} className="text-base font-bold">{bt("3D 작업파일을 열까요?", "Open this 3D workfile?")}</h3>
    <div id={`${id}-description`} className="mt-3 space-y-2 text-sm leading-relaxed text-fg-2">
      <p className="break-all">{model.pending?.name}</p>
      <p>{bt("파일 검증을 마쳤습니다. 현재 3D 작업과 편집 이력을 이 파일의 검증된 내용으로 교체합니다. 지금 작업을 보관하려면 취소한 뒤 .toon3d 작업파일을 먼저 저장하세요.", "File validation is complete. The current 3D workspace and edit history will be replaced with the file's validated contents. Cancel and save the current .toon3d workfile first if you want to keep it.")}</p>
    </div>
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <button ref={cancel} type="button" className={BUTTON} onClick={model.cancel}>{bt("취소", "Cancel")}</button>
      <button type="button" className={BUTTON} onClick={() => { void model.confirm(); }}>{bt("현재 작업을 교체하고 열기", "Replace current work and open")}</button>
    </div>
  </dialog>, document.body);
}

/** 모델 추가와 전체 작업파일 교체를 별도 파일 선택기로 제공한다. */
export function StudioHybridDccFileTools({ model, modelFileRef, onModelFile }: {
  readonly model: StudioHybridDccFileToolsModel;
  readonly modelFileRef: RefObject<HTMLInputElement | null>;
  readonly onModelFile: (file: File) => void;
}) {
  const bt = useBilingual("StudioHybridDccFileTools");
  const file = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" className={BUTTON} disabled={model.disabled} onClick={model.save}>{bt("작업파일 저장", "Save workfile")}</button>
    <button type="button" className={BUTTON} disabled={model.disabled} onClick={() => file.current?.click()}>{bt("작업파일 열기", "Open workfile")}</button>
    <button type="button" className={BUTTON} disabled={model.disabled || !model.canSaveObj} title={bt("선택한 원본 메시를 로컬 좌표의 OBJ로 저장합니다. 변형 스택이 있으면 먼저 적용하세요.", "Save the selected source mesh as local-coordinate OBJ. Apply its modifier stack first.")} onClick={model.saveObj}>{bt("OBJ 저장", "Save OBJ")}</button>
    <input ref={file} type="file" accept=".toon3d" className="sr-only" tabIndex={-1} aria-label={bt("열 .toon3d 작업파일 선택", "Choose a .toon3d workfile to open")} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void model.open(selected); }} />
    <input ref={modelFileRef} type="file" accept=".stl,.ply,.dae,.dxf,.off,.3mf,.bvh,.ifc,.obj,.glb,.gltf,.vrm,.fbx,.3dm,.step,.stp" className="sr-only" tabIndex={-1} aria-label={bt("가져올 3D 파일 선택", "Choose a 3D file to import")} data-studio-hybrid-dcc-import="true" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) onModelFile(selected); }} />
    {model.reading ? <span role="status" className="text-xs text-fg-2">{bt("작업파일 읽기·검증 중", "Reading and validating workfile")} <button type="button" className={BUTTON} onClick={model.cancel}>{bt("파일 읽기 취소", "Cancel file reading")}</button></span> : null}
    {model.opening ? <span role="status" className="text-xs text-fg-2">{bt("작업파일 여는 중", "Opening workfile")}</span> : null}
    {model.error ? <p role="alert" className="basis-full text-xs text-bad">{model.error}</p> : null}
    {model.notice ? <p role="status" className="basis-full text-xs text-fg-2">{model.notice}</p> : null}
    {model.pending ? <WorkfileReplacement model={model} /> : null}
  </>;
}
