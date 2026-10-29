export interface StudioBg3dSceneGlbExportRequest {
  readonly name: string;
  readonly signal: AbortSignal;
}

export type StudioBg3dSceneGlbExportResult = {
  readonly ok: true;
  readonly fileName: string;
  readonly byteSize: number;
  readonly contentHash: string;
  readonly exportedNodeCount: number;
  readonly hiddenNodeCount: number;
} | {
  readonly ok: false;
  readonly code: "unavailable" | "aborted" | "source-changed" | "unsupported-scene" | "asset-invalid" | "export-failed" | "download-failed" | "rights-restricted" | "rights-unavailable";
  readonly messageKo: string;
};

export interface StudioBg3dSceneGlbExportPorts {
  readonly sceneGlbExportUnavailableReason?: string | null;
  readonly onExportCurrentSceneGlb?: (request: StudioBg3dSceneGlbExportRequest) => Promise<StudioBg3dSceneGlbExportResult>;
}
