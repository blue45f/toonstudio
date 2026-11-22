import { useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { formatStudio3dByteLimit, resolveStudio3dUploadLimitPolicy } from "../import-safety/studio-3d-upload-limit-policy";
import { STUDIO_VRM_EXPORT_MAX_BYTES } from "../vrm/studio-vrm-export-glb-container";
import {
  addStudioRigChild,
  readStudioRigFile,
  renameStudioRigJoint,
  studioRigJoints,
  studioRigSkinNames,
  writeStudioRigFile,
  type StudioRigFile,
} from "./studio-asset3d-rig-file";
import { StudioRigWeightsPanel } from "./StudioRigWeightsPanel";
import {
  loadStudioRigWork,
  loadStudioRigWeightUndo,
  saveStudioRigWork,
  type StudioRigReceipt,
} from "./studio-asset3d-rig-storage";

const BUILTIN = "/models/mannequin/toonstudio_ecorche_mannequin_v3.glb";
const button = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";
interface Work {
  readonly model: StudioRigFile;
  readonly name: string;
}
function reason(error: unknown): string {
  return error instanceof Error ? error.message : "다시 시도해 주세요.";
}

function RigFileEditor({ scope }: { readonly scope: string }) {
  const [work, setWork] = useState<Work | null>(null),
    [saved, setSaved] = useState<StudioRigReceipt | null>(null);
  const [skin, setSkin] = useState(0),
    [selection, setSelection] = useState<number | null>(null),
    [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true),
    [dirty, setDirty] = useState(false),
    [notice, setNotice] = useState("작업 파일을 여는 중…"),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0),
    [replacement, setReplacement] = useState<File | null>(null);
  const pendingWeightUndo = useRef<StudioRigFile | undefined>(undefined);
  const running = useRef(false),
    fileInput = useRef<HTMLInputElement>(null);
  const joints = useMemo(() => (work ? studioRigJoints(work.model, skin) : []), [work, skin]);
  const joint = joints.find((item) => item.id === selection) ?? joints[0];
  function select(model: StudioRigFile, index: number, id?: number) {
    const list = studioRigJoints(model, index),
      item = list.find((candidate) => candidate.id === id) ?? list[0]!;
    setSkin(index);
    setSelection(item.id);
    setDraft(item.name);
  }
  useEffect(() => {
    const stop = new AbortController();
    setBusy(true);
    setError("");
    setNotice("작업 파일을 여는 중…");
    void (async () => {
      const local = await loadStudioRigWork(scope);
      let bytes: Uint8Array;
      if (local) bytes = local.bytes;
      else {
        const result = await fetch(BUILTIN, { signal: stop.signal });
        if (!result.ok) throw new Error("기본 데생인형 파일을 열지 못했어요.");
        bytes = new Uint8Array(await result.arrayBuffer());
      }
      if (stop.signal.aborted) return;
      const model = readStudioRigFile(bytes);
      setWork({ model, name: local?.saved.name ?? "데생인형.glb" });
      setSaved(local?.saved ?? null);
      select(model, 0);
      setDirty(false);
      setNotice(local ? "기기에 저장한 작업 파일을 열었어요." : "기본 데생인형의 골격을 열었어요.");
    })()
      .catch((e) => {
        if (!stop.signal.aborted) {
          setNotice("");
          setError(reason(e));
        }
      })
      .finally(() => {
        if (!stop.signal.aborted) setBusy(false);
      });
    return () => stop.abort();
  }, [scope, retry]);
  async function commit(next: Work, index: number, id?: number, beforeWeightEdit?: StudioRigFile) {
    pendingWeightUndo.current = beforeWeightEdit;
    setWork(next);
    select(next.model, index, id);
    setDirty(true);
    setNotice("기기에 작업 파일을 저장하는 중…");
    try {
      const data = writeStudioRigFile(next.model);
      setSaved(
        await saveStudioRigWork(
          scope,
          saved,
          next.name,
          data,
          beforeWeightEdit ? writeStudioRigFile(beforeWeightEdit) : undefined,
        ),
      );
      setDirty(false);
      pendingWeightUndo.current = undefined;
      setNotice("기기에 작업 파일을 저장했어요.");
    } catch (e) {
      setNotice("");
      setError(`작업 파일을 저장하지 못했어요. 닫기 전에 GLB 사본을 받아 주세요. ${reason(e)}`);
    }
  }
  async function run(action: () => Promise<void>) {
    if (running.current || busy) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(reason(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function importFile(file: File) {
    void run(async () => {
      const maxBytes = Math.min(STUDIO_VRM_EXPORT_MAX_BYTES, resolveStudio3dUploadLimitPolicy().maxLocalModelBytes);
      if (!file.size || file.size > maxBytes)
        throw new Error(`현재 로컬 환경 기준 ${formatStudio3dByteLimit(maxBytes)} 이하의 GLB를 선택해 주세요.`);
      const model = readStudioRigFile(new Uint8Array(await file.arrayBuffer()));
      setReplacement(null);
      await commit({ model, name: file.name }, 0);
    });
  }
  function download() {
    if (!work) return;
    try {
      const bytes = writeStudioRigFile(work.model),
        url = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = work.name.replace(/(?:-rig)?\.glb$/i, "") + "-rig.glb";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(reason(e));
    }
  }
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="GLB 골격 편집">
      <h3 className="text-sm font-semibold">골격 작업 파일{work ? ` · ${work.name}` : ""}</h3>
      <p className="text-xs text-fg-2">
        관절 이름과 웨이트를 GLB에 저장합니다. 새 보조 관절에 정점을 연결하려면 메시 영역을 선택해 웨이트를 옮기세요.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".glb,model/gltf-binary"
        className="sr-only"
        tabIndex={-1}
        aria-label="골격 GLB 파일"
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (selected) {
            if (work && (saved || dirty)) setReplacement(selected);
            else importFile(selected);
          }
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => fileInput.current?.click()}>
          GLB 열기
        </button>
        <button type="button" className={button} disabled={!work || busy} onClick={download}>
          편집한 GLB 받기
        </button>
      </div>
      {replacement && (
        <div className="text-sm">
          <p>현재 기기 작업 파일을 {replacement.name}(으)로 바꿀까요?</p>
          <button type="button" className={button} disabled={busy} onClick={() => importFile(replacement)}>
            파일 바꾸기
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => setReplacement(null)}>
            현재 파일 유지
          </button>
        </div>
      )}
      {work && (
        <>
          <label className="text-xs">
            편집할 골격{" "}
            <select disabled={busy} value={skin} onChange={(e) => select(work.model, Number(e.currentTarget.value))}>
              {studioRigSkinNames(work.model).map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            관절 {joints.length}개
            <select
              className="mt-1 block min-h-11 w-full"
              aria-label="리깅 본 목록"
              value={joint?.id}
              disabled={busy}
              onChange={(e) => select(work.model, skin, Number(e.currentTarget.value))}
            >
              {joints.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.parent ? ` · 부모 ${item.parent}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            관절 이름
            <input
              className="mt-1 block min-h-11 w-full rounded border border-line px-2"
              aria-label="선택된 본 이름 변경"
              disabled={busy}
              maxLength={128}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || !joint || !draft.trim() || draft.trim() === joint.name}
              onClick={() =>
                void run(async () => {
                  if (joint)
                    await commit(
                      { ...work, model: renameStudioRigJoint(work.model, skin, joint.id, draft) },
                      skin,
                      joint.id,
                    );
                })
              }
            >
              이름 변경
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || !joint}
              onClick={() =>
                void run(async () => {
                  if (!joint) return;
                  const model = addStudioRigChild(work.model, skin, joint.id);
                  await commit({ ...work, model }, skin, studioRigJoints(model, skin).at(-1)!.id);
                })
              }
            >
              자식 관절 추가
            </button>
          </div>
          {joint && (
            <StudioRigWeightsPanel
              key={skin}
              model={work.model}
              skin={skin}
              target={joint}
              busy={busy}
              canUndo={dirty ? Boolean(pendingWeightUndo.current) : Boolean(saved?.weightUndo)}
              onApply={(edit) => void run(() => commit({ ...work, model: edit() }, skin, joint.id, work.model))}
              onUndo={() =>
                void run(async () => {
                  const previous =
                    pendingWeightUndo.current ??
                    (saved ? readStudioRigFile(await loadStudioRigWeightUndo(scope, saved)) : null);
                  if (!previous) throw new Error("되돌릴 웨이트 편집이 없어요.");
                  await commit({ ...work, model: previous }, skin, joint.id);
                })
              }
            />
          )}
        </>
      )}
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs">
          {error}
        </p>
      )}
      {dirty && !busy && work && (
        <button
          type="button"
          className={button}
          onClick={() => void run(() => commit(work, skin, joint?.id, pendingWeightUndo.current))}
        >
          기기에 다시 저장
        </button>
      )}
      {!work && !busy && (
        <button type="button" className={button} onClick={() => setRetry((x) => x + 1)}>
          작업 파일 다시 열기
        </button>
      )}
    </section>
  );
}
export function StudioAsset3dRigFilePanel() {
  const session = useSession();
  if (!session.ready) return <p role="status">로컬 작업 파일의 사용자 확인 중…</p>;
  const scope = session.data ? `actor:${session.data.user.id}` : "guest";
  return <RigFileEditor key={scope} scope={scope} />;
}
