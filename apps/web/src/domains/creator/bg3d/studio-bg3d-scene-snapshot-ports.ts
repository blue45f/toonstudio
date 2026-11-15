export interface StudioBg3dSceneSnapshotListItem {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly isClone: boolean;
}

export interface StudioBg3dSceneSnapshotPorts {
  readonly liveSummary: string;
  readonly snapshots: readonly StudioBg3dSceneSnapshotListItem[];
  readonly maxSnapshots: number;
  readonly disabled: boolean;
  readonly notice: string | null;
  readonly onCaptureSnapshot: () => void;
  readonly onDuplicateSnapshot: (id: string) => void;
  readonly onRestoreSnapshot: (id: string) => void;
  readonly onDeleteSnapshot: (id: string) => void;
}
