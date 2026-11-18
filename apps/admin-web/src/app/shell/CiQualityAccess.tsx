import { lazy, Suspense } from "react";

import { CiQualityBoard } from "../../domains/operations/ci-quality/CiQualityBoard";

import { AdminAccess } from "./AdminAccess";

import type { AdminIdentity } from "../../platform/http/admin-identity";

const CloudWorkBoard = lazy(() => import("../../domains/operations/cloud-work/CloudWorkBoard").then(module => ({ default: module.CloudWorkBoard })));
const NestQualityBoard = lazy(() => import("../../domains/operations/nestjs-quality/NestQualityBoard").then(module => ({ default: module.NestQualityBoard })));
const cloudAccessError = (actor: AdminIdentity) => actor.role === "admin" ? null : "클라우드 작업 보드는 관리자 권한이 필요합니다. 운영자 권한으로는 열 수 없습니다.";

export function CiQualityAccess({ view }: { view?: "quality" | "cloud-work" | "nestjs" }) {
  const queryView = new URLSearchParams(window.location.search).get("view");
  const selectedView = view ?? (queryView === "cloud-work" || queryView === "nestjs" ? queryView : "quality");
  const isCloudWork = selectedView === "cloud-work";
  return <AdminAccess key={selectedView} label={isCloudWork ? "클라우드 작업 관리자 권한 확인" : "CI·QA 관리자 권한 확인"} authorize={isCloudWork ? cloudAccessError : undefined}>
    {(actor, { deny, verified }) => isCloudWork ? <Suspense fallback={<p role="status">클라우드 작업 화면을 불러오고 있습니다.</p>}>
      <CloudWorkBoard onAccessDenied={deny} />
    </Suspense> : selectedView === "nestjs" ? <Suspense fallback={<p role="status">NestJS 보드 화면을 준비하고 있습니다.</p>}>
      <NestQualityBoard userIdentity={actor.id} role={actor.role} verified={verified} onUnauthorized={deny} />
    </Suspense> : <CiQualityBoard userIdentity={actor.id} />}
  </AdminAccess>;
}
