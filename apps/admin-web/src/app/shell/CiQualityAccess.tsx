import { lazy, Suspense } from "react";

import { CiQualityBoard } from "../../domains/operations/ci-quality/CiQualityBoard";

import { AdminAccess } from "./AdminAccess";

const CloudWorkBoard = lazy(() => import("../../domains/operations/cloud-work/CloudWorkBoard").then(module => ({ default: module.CloudWorkBoard })));

export function CiQualityAccess({ view = "quality" }: { view?: "quality" | "cloud-work" }) {
  const isCloudWork = view === "cloud-work";
  return <AdminAccess key={view} label={isCloudWork ? "클라우드 작업 관리자 권한 확인" : "CI·QA 관리자 권한 확인"} adminOnly={isCloudWork}>
    {(actor, onAccessDenied) => isCloudWork
      ? <Suspense fallback={<p role="status">클라우드 작업 화면을 불러오고 있습니다.</p>}><CloudWorkBoard onAccessDenied={onAccessDenied} /></Suspense>
      : <CiQualityBoard userIdentity={actor.id} />}
  </AdminAccess>;
}
