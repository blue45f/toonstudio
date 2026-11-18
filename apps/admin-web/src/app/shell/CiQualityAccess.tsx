import { CiQualityBoard } from "../../domains/operations/ci-quality/CiQualityBoard";

import { AdminAccess } from "./AdminAccess";

export function CiQualityAccess() {
  return <AdminAccess label="CI·QA 관리자 권한 확인">
    {(actor) => <CiQualityBoard userIdentity={actor.id} />}
  </AdminAccess>;
}
