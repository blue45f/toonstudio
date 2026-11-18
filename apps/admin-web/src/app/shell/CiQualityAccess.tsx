import { lazy, Suspense } from "react";

import { CiQualityBoard } from "../../domains/operations/ci-quality/CiQualityBoard";

import { AdminAccess } from "./AdminAccess";

const NestQualityBoard = lazy(() => import("../../domains/operations/nestjs-quality/NestQualityBoard").then((module) => ({ default: module.NestQualityBoard })));

export function CiQualityAccess() {
  const isNest = new URLSearchParams(window.location.search).get("view") === "nestjs";
  return <AdminAccess label="CI·QA 관리자 권한 확인">
    {(actor, { verified, onUnauthorized }) => isNest
      ? <Suspense fallback={<p role="status">NestJS 보드 화면을 준비하고 있습니다.</p>}>
        <NestQualityBoard userIdentity={actor.id} role={actor.role} verified={verified} onUnauthorized={onUnauthorized} />
      </Suspense>
      : <CiQualityBoard userIdentity={actor.id} />}
  </AdminAccess>;
}
