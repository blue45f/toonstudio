import { lazy, Suspense } from "react";

import { CiQualityBoard } from "../../domains/operations/ci-quality/CiQualityBoard";

import { AdminAccess } from "./AdminAccess";

const CloudWorkBoard = lazy(() => import("../../domains/operations/cloud-work/CloudWorkBoard").then(module => ({ default: module.CloudWorkBoard })));
const NestQualityBoard = lazy(() => import("../../domains/operations/nestjs-quality/NestQualityBoard").then((module) => ({ default: module.NestQualityBoard })));

export function CiQualityAccess({ view }: { view?: "quality" | "cloud-work" | "nestjs" }) {
  const selectedView = view ?? (new URLSearchParams(window.location.search).get("view") === "nestjs" ? "nestjs" : "quality");
  const isCloudWork = selectedView === "cloud-work";
  const isNest = selectedView === "nestjs";
  return <AdminAccess key={selectedView} label={isCloudWork ? "클라우드 작업 관리자 권한 확인" : "CI·QA 관리자 권한 확인"} adminOnly={isCloudWork}>
    {(actor, { verified, onUnauthorized }) => isCloudWork
      ? <Suspense fallback={<p role="status">클라우드 작업 화면을 불러오고 있습니다.</p>}><CloudWorkBoard onAccessDenied={onUnauthorized} /></Suspense>
      : isNest
        ? <Suspense fallback={<p role="status">NestJS 보드 화면을 준비하고 있습니다.</p>}>
          <NestQualityBoard userIdentity={actor.id} role={actor.role} verified={verified} onUnauthorized={onUnauthorized} />
        </Suspense>
        : <CiQualityBoard userIdentity={actor.id} />}
  </AdminAccess>;
}
