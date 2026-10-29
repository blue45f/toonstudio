import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import type { ProductionClientCommand } from "./production-api";
import type { ProductionProjectAccess } from "./production-dashboard-api";
import type { ProductionCommandExecutor } from "./production-command-execution";

export interface ProductionSurfaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
  readonly roleLens: CreatorRoleLens;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly executeStrict: ProductionCommandExecutor;
  readonly refresh?: () => Promise<void>;
  readonly hasUnconfirmedCommand?: boolean;
  readonly isDemo: boolean;
  readonly viewerAssignmentIds: readonly string[];
  readonly viewerUserId: string | null;
}
