import type { StudioBg3dSceneSnapshotPorts } from "./studio-bg3d-scene-snapshot-ports";

export function StudioBg3dSceneSnapshotPanel({
  ports,
  hidden,
}: {
  readonly ports: StudioBg3dSceneSnapshotPorts;
  readonly hidden?: boolean;
}) {
  if (hidden) return null;

  return (
    <section
      aria-label="재배치 전 씬 설정 스냅샷"
      data-testid="bg3d-scene-snapshot-panel"
      className="mt-3 rounded-xl border border-line bg-raised/60 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-fg-3">
            SCENE SNAPSHOT · 씬 복제 보호
          </p>
          <h3 className="text-xs font-semibold text-fg">
            재배치 전 씬 설정 스냅샷 (카메라·조명·가구 배치)
          </h3>
        </div>
        <span className="rounded-md bg-card px-2 py-0.5 text-[11px] text-fg-3">
          {ports.snapshots.length}/{ports.maxSnapshots}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
        컷 보드와 달리 가구·도형·GLB 배치와 카메라·조명을 깊은 복제본으로 함께 보존합니다.
        복제본으로 되돌려도 현재 씬과 저장본이 서로 오염되지 않습니다.
      </p>
      <p
        data-testid="bg3d-scene-snapshot-live-summary"
        className="mt-2 rounded-lg border border-line/70 bg-card/80 px-2.5 py-1.5 text-[11px] text-fg-2"
      >
        {ports.liveSummary}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          data-testid="bg3d-scene-snapshot-capture"
          disabled={ports.disabled}
          onClick={ports.onCaptureSnapshot}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          현재 씬 스냅샷 저장
        </button>
      </div>
      {ports.notice ? (
        <p
          role="status"
          data-testid="bg3d-scene-snapshot-notice"
          className="mt-2 text-[11px] text-fg-2"
        >
          {ports.notice}
        </p>
      ) : null}
      {ports.snapshots.length > 0 ? (
        <ul
          aria-label="저장된 씬 스냅샷 목록"
          className="mt-2.5 space-y-2"
        >
          {ports.snapshots.map((item, index) => (
            <li
              key={item.id}
              data-testid={`bg3d-scene-snapshot-item-${index}`}
              className="rounded-lg border border-line/80 bg-card p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs font-semibold text-fg">
                  {item.name}
                </strong>
                {item.isClone ? (
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-medium text-fg-3">
                    복제본
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-fg-3">{item.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-testid={`bg3d-scene-snapshot-duplicate-${index}`}
                  disabled={
                    ports.disabled || ports.snapshots.length >= ports.maxSnapshots
                  }
                  onClick={() => ports.onDuplicateSnapshot(item.id)}
                  className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] font-medium text-fg hover:bg-card disabled:opacity-50"
                >
                  복제본 만들기
                </button>
                <button
                  type="button"
                  data-testid={`bg3d-scene-snapshot-restore-${index}`}
                  disabled={ports.disabled}
                  onClick={() => ports.onRestoreSnapshot(item.id)}
                  className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] font-semibold text-fg hover:bg-card disabled:opacity-50"
                >
                  이 스냅샷으로 되돌리기
                </button>
                <button
                  type="button"
                  data-testid={`bg3d-scene-snapshot-delete-${index}`}
                  disabled={ports.disabled}
                  onClick={() => ports.onDeleteSnapshot(item.id)}
                  className="rounded-md border border-line px-2 py-1 text-[11px] text-fg-3 hover:text-fg disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
