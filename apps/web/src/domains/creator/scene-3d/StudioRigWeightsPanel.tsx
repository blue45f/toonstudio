import { useMemo, useState } from "react";
import type { StudioRigFile, StudioRigJoint } from "./studio-asset3d-rig-file";
import {
  planStudioRigWeightTransfer,
  readStudioRigWeightRegion,
  studioRigWeightRegions,
} from "./studio-asset3d-rig-weights";

const field = "mt-1 block min-h-11 w-full rounded border border-line bg-panel px-2";
function inspect<T>(read: () => T): { value: T; error: null } | { value: null; error: string } {
  try {
    return { value: read(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "웨이트 정보를 확인할 수 없어요." };
  }
}
interface Props {
  readonly model: StudioRigFile;
  readonly skin: number;
  readonly target: StudioRigJoint;
  readonly busy: boolean;
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly onApply: (edit: () => StudioRigFile) => void;
}
export function StudioRigWeightsPanel({ model, skin, target, busy, canUndo, onUndo, onApply }: Props) {
  const [regionKey, setRegionKey] = useState(""),
    [sourceId, setSourceId] = useState<number | null>(null),
    [ratio, setRatio] = useState("50");
  const regions = useMemo(() => inspect(() => studioRigWeightRegions(model, skin)), [model, skin]);
  const region = regions.value?.find((r) => r.key === regionKey);
  const surface = useMemo(
    () => (region ? inspect(() => readStudioRigWeightRegion(model, skin, region)) : null),
    [model, skin, region],
  );
  const { weighted, source, plan } = useMemo(() => {
    const data = surface?.value;
    const weighted =
      data?.joints.filter((joint, index) => joint.id !== target.id && (data.influenced[index] ?? 0) > 0) ?? [];
    const source = weighted.find((joint) => joint.id === sourceId) ?? weighted[0];
    const plan =
      data && source ? inspect(() => planStudioRigWeightTransfer(data, source.id, target.id, Number(ratio))) : null;
    return { weighted, source, plan };
  }, [surface, sourceId, target.id, ratio]);
  const issue = regions.error ?? surface?.error ?? plan?.error;
  const edit = plan?.value;
  return (
    <details className="rounded-lg border border-line p-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">스킨 웨이트 옮기기</summary>
      <p className="text-xs text-fg-2">
        선택한 메시에서 기존 관절의 영향을 <strong>{target.name}</strong>에 나눕니다. 다음 파일 변경 전까지 마지막
        변경을 되돌릴 수 있어요.
      </p>
      <label className="mt-2 block text-xs">
        메시 영역
        <select
          className={field}
          aria-label="메시 영역"
          value={region?.key ?? ""}
          disabled={busy}
          onChange={(e) => {
            setRegionKey(e.currentTarget.value);
            setSourceId(null);
          }}
        >
          <option value="">편집할 메시 선택</option>
          {regions.value?.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {surface?.value && (
        <>
          <label className="mt-2 block text-xs">
            웨이트를 줄 관절
            <select
              className={field}
              aria-label="웨이트를 줄 관절"
              value={source?.id ?? ""}
              disabled={busy || !source}
              onChange={(e) => setSourceId(Number(e.currentTarget.value))}
            >
              {!source && <option value="">다른 관절의 웨이트가 없어요</option>}
              {weighted.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-xs">
            옮길 비율 (%)
            <input
              className={field}
              type="number"
              min={1}
              max={100}
              step={1}
              value={ratio}
              disabled={busy || !source}
              onChange={(e) => setRatio(e.currentTarget.value)}
            />
          </label>
          <p className="my-2 text-xs" aria-live="polite">
            {edit
              ? `${surface.value.count.toLocaleString()}개 중 ${edit.affected.toLocaleString()}개 정점 변경`
              : !source
                ? "다른 관절을 받을 본으로 선택하거나 메시 영역을 바꿔 주세요."
                : ""}
          </p>
          {edit?.blocked ? (
            <p className="text-xs">
              정점 {edit.blocked}개에 빈 본 슬롯이 없어요. 비율을 100%로 바꾸거나 다른 관절을 선택해 주세요.
            </p>
          ) : null}
          {edit?.belowPrecision ? (
            <p className="text-xs">정점 {edit.belowPrecision}개는 파일의 웨이트 정밀도보다 변화량이 작아요.</p>
          ) : null}
          <button
            className="min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50"
            type="button"
            disabled={busy || !edit || !edit.affected || Boolean(edit.blocked)}
            onClick={() => {
              if (edit) onApply(edit.apply);
            }}
          >
            웨이트 적용
          </button>
        </>
      )}
      {issue && (
        <p role="alert" className="text-xs">
          {issue}
        </p>
      )}
      {canUndo && (
        <button
          className="ml-1 min-h-11 rounded-lg border border-line px-3 text-sm"
          type="button"
          disabled={busy}
          onClick={onUndo}
        >
          마지막 웨이트 되돌리기
        </button>
      )}
    </details>
  );
}
