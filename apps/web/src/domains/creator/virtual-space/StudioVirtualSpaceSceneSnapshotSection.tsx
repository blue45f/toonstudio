import { Camera, Copy, RotateCcw, Trash2 } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX,
  summarizeStudioVirtualSceneState,
  type StudioVirtualSceneSnapshotBinding,
} from "./studio-virtual-space-scene-snapshot";

export function StudioVirtualSpaceSceneSnapshotSection({
  binding,
  fallbackHour = 12,
}: {
  readonly binding: StudioVirtualSceneSnapshotBinding;
  readonly fallbackHour?: number;
}) {
  const bt = useBilingual("StudioVirtualSpaceSceneSnapshotSection");

  return (
    <fieldset
      className="studio-vspace-scene-snapshots"
      data-testid="vs-scene-snapshot-panel"
    >
      <legend>
        {bt(
          "재배치 전 씬 설정 스냅샷 (카메라·조명·가구)",
          "Pre-rearrangement scene snapshots (camera, lighting & furniture)",
        )}
      </legend>
      <p>
        {bt(
          "재배치 전에 현재 카메라 배율·시점, 조명 시간대·기구, 공간 테마와 가구 배치를 복제 가능한 스냅샷으로 보존합니다.",
          "Save a clonable snapshot of camera zoom/view, lighting, theme, and furniture layout before rearranging.",
        )}
      </p>
      <p
        className="studio-vspace-scene-snapshot-summary"
        data-testid="vs-scene-snapshot-live-summary"
      >
        {binding.liveSummary}
      </p>
      <div className="studio-vspace-customization-options">
        <button
          type="button"
          data-testid="vs-scene-snapshot-capture"
          onClick={binding.onCapture}
        >
          <Camera size={14} aria-hidden />
          <span>
            {bt(
              "현재 씬 스냅샷 저장",
              "Save current scene snapshot",
            )}
          </span>
        </button>
      </div>
      {binding.notice ? (
        <p role="status" data-testid="vs-scene-snapshot-notice">
          {binding.notice}
        </p>
      ) : null}
      {binding.snapshots.length > 0 ? (
        <ul
          className="studio-vspace-customization-placed"
          aria-label={bt("저장된 씬 스냅샷", "Saved scene snapshots")}
        >
          {binding.snapshots.map((snapshot, index) => (
            <li
              key={snapshot.id}
              data-testid={`vs-scene-snapshot-item-${index}`}
            >
              <div>
                <strong>{snapshot.name}</strong>
                <small>{summarizeStudioVirtualSceneState(snapshot, fallbackHour)}</small>
              </div>
              <div className="studio-vspace-customization-options">
                <button
                  type="button"
                  data-testid={`vs-scene-snapshot-duplicate-${index}`}
                  disabled={binding.snapshots.length >= STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX}
                  onClick={() => binding.onDuplicate(snapshot.id)}
                >
                  <Copy size={13} aria-hidden />
                  <span>{bt("복제본 만들기", "Duplicate")}</span>
                </button>
                <button
                  type="button"
                  data-testid={`vs-scene-snapshot-restore-${index}`}
                  onClick={() => binding.onRestore(snapshot.id)}
                >
                  <RotateCcw size={13} aria-hidden />
                  <span>{bt("이 스냅샷으로 되돌리기", "Restore")}</span>
                </button>
                <button
                  type="button"
                  data-testid={`vs-scene-snapshot-delete-${index}`}
                  onClick={() => binding.onDelete(snapshot.id)}
                >
                  <Trash2 size={13} aria-hidden />
                  <span>{bt("삭제", "Delete")}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
