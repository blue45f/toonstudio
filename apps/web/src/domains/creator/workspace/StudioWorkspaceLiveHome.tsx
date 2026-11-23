import type { ReactNode } from "react";
import { VibrantPageIdentityBanner } from "@/shared/ui/vibrant-identity/VibrantPageIdentityBanner";
import { StudioVirtualSpacePage } from "../virtual-space/StudioVirtualSpacePage";

/** Personal space is local-only. It never creates a server work, membership or media session. */
export const PERSONAL_STUDIO_HOME_ID = "virtual-demo:personal-home";

export function StudioWorkspaceLiveHome({ projectId, header }: {
  readonly projectId: string | null;
  readonly header: ReactNode;
}) {
  const enhancedHeader = (
    <div className="space-y-3">
      {header}
      <VibrantPageIdentityBanner
        pageId="studio"
        compact
        activeStep={projectId === null ? 1 : 2}
      />
    </div>
  );

  return (
    <StudioVirtualSpacePage
      projectIdOverride={projectId ?? PERSONAL_STUDIO_HOME_ID}
      personal={projectId === null}
      homeHeader={enhancedHeader}
    />
  );
}
