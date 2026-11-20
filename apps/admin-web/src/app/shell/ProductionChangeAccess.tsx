import { lazy, Suspense } from "react";

import { AdminAccess } from "./AdminAccess";

const ProductionChangeBoard = lazy(() => import("../../domains/production/changes/ProductionChangeBoard")
  .then((module) => ({ default: module.ProductionChangeBoard })));

export function ProductionChangeAccess() {
  return <AdminAccess label="제작 변경 관리자 권한 확인">
    {(actor, { verified, deny }) => <Suspense fallback={<p role="status">제작 변경 화면을 불러오고 있습니다.</p>}>
      <ProductionChangeBoard actor={actor} verified={verified} onUnauthorized={deny} />
    </Suspense>}
  </AdminAccess>;
}
