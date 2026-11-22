import { OpsCutoverOverviewCard } from "../../domains/operations/cutover-overview/OpsCutoverOverviewCard";

import { AdminAccess } from "./AdminAccess";

export function OpsOverviewAccess() {
  return (
    <AdminAccess label="운영·배포 원장 관리자 권한 확인">
      {(actor) => <OpsCutoverOverviewCard actorLabel={`${actor.id} (${actor.role})`} />}
    </AdminAccess>
  );
}
