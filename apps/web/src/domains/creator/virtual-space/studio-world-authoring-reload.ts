import { readStudioWorldAuthoringDraftRecord, writeStudioWorldAuthoringDraft } from "./studio-virtual-space-world-authoring";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

interface RecoveryPorts {
  write: typeof writeStudioWorldAuthoringDraft;
  read: typeof readStudioWorldAuthoringDraftRecord;
  reload(): void;
}
const browser: RecoveryPorts = { write: writeStudioWorldAuthoringDraft, read: readStudioWorldAuthoringDraftRecord, reload: () => window.location.reload() };
/** A cached module failure may require a document reload. Never reload before verifying the saved draft. */
export async function reloadStudioWorldAfterDraftSave(projectId: string, manifest: StudioVirtualSpaceWorldManifest,
  basePublishedRevisionId?: string | null, ports: RecoveryPorts = browser, isCurrent: () => boolean = () => true): Promise<boolean> {
  try {
    if (!isCurrent() || !await ports.write(projectId, manifest, basePublishedRevisionId)) return false;
    const saved = await ports.read(projectId);
    if (!isCurrent() || !saved || saved.basePublishedRevisionId !== basePublishedRevisionId || JSON.stringify(saved.manifest) !== JSON.stringify(manifest)) return false;
    ports.reload(); return true;
  } catch { return false; }
}
