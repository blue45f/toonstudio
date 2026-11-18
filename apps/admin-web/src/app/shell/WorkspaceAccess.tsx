import { AdminWorkspace } from "../../domains/workspace/AdminWorkspace";

import { AdminAccess } from "./AdminAccess";

export function WorkspaceAccess() {
  return <AdminAccess label="통합 작업실 관리자 권한 확인">
    {(actor) => <AdminWorkspace actor={actor} />}
  </AdminAccess>;
}
