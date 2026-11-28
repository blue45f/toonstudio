import "../styles/admin.css";
import { OperationPolicyPanel } from "../../domains/operations/operation-policy/OperationPolicyPanel";

import { AiOperationsAccess } from "./AiOperationsAccess";
import { BusinessPlanAccess } from "./BusinessPlanAccess";
import { CiQualityAccess } from "./CiQualityAccess";
import { FinalSubmissionAccess } from "./FinalSubmissionAccess";
import { OpsOverviewAccess } from "./OpsOverviewAccess";
import { ProductionChangeAccess } from "./ProductionChangeAccess";
import { WorkspaceAccess } from "./WorkspaceAccess";

export function AdminApp() {
  const pathname = window.location.pathname.replace(/\/+$/u, "");
  const queryView = new URLSearchParams(window.location.search).get("view");
  const isOpsOverview = pathname === "/admin/platform/operations" && queryView === "ops-overview";
  const isQuality = pathname === "/admin/platform/quality";
  const isCloudWork = isQuality && queryView === "cloud-work";
  const isNest = isQuality && queryView === "nestjs";
  const isWorkspace = pathname === "/admin/workspace";
  const isBusinessPlan = pathname === "/admin/growth/business-plan";
  const isFinalSubmission = isBusinessPlan && queryView === "final-submission";
  const isCoordination = isBusinessPlan && queryView === "evidence-coordination";
  const isAiOperations = pathname === "/admin/platform/ai-operations";
  const isProductionChanges = pathname === "/admin/production/changes";
  const isPolicy = !isOpsOverview && !isQuality && !isWorkspace && !isBusinessPlan && !isAiOperations && !isProductionChanges;
  return <main className="admin-shell">
    <header className="admin-brand" aria-label="ToonStudio 관리자">
      <a href="https://www.toonstudio.cloud/" aria-label="ToonStudio 서비스로 돌아가기">Toon<span>Studio</span></a>
      <span className="admin-brand__label">{isOpsOverview ? "운영·배포 원장" : isProductionChanges ? "제작 변경·충돌·검증" : isAiOperations ? "AI·인프라 운영" : isCoordination ? "증빙·승인 조정" : isFinalSubmission ? "1R 최종 제출 점검" : isBusinessPlan ? "사업계획서·제출 준비" : isWorkspace ? "통합 작업실" : isCloudWork ? "클라우드 작업" : isNest ? "NestJS 호환성" : isQuality ? "CI·QA 검증" : "운영 정책·라이선스"}</span>
      <span className="admin-brand__security" data-testid="admin-edge-gate-badge">{isPolicy ? "관리자 전용" : "서버 관리자 권한 확인"}</span>
    </header>
    <nav className="admin-local-navigation" aria-label="독립 관리자 메뉴">
      <a href="/admin/platform/operations?view=policy" aria-current={isPolicy ? "page" : undefined}>운영 모드·라이선스</a>
      <a href="/admin/platform/operations?view=ops-overview" aria-current={isOpsOverview ? "page" : undefined}>운영·배포 원장</a>
      <a href="/admin/platform/quality/" aria-current={isQuality && !isCloudWork && !isNest ? "page" : undefined}>CI·QA 검증</a>
      <a href="/admin/platform/quality/?view=cloud-work" aria-current={isCloudWork ? "page" : undefined}>클라우드 작업</a>
      <a href="/admin/platform/quality/?view=nestjs" aria-current={isNest ? "page" : undefined}>NestJS 호환성</a>
      <a href="/admin/workspace/" aria-current={isWorkspace ? "page" : undefined}>통합 작업실</a>
      <a href="/admin/production/changes/" aria-current={isProductionChanges ? "page" : undefined}>제작 변경</a>
      <a href="/admin/growth/business-plan/" aria-current={isBusinessPlan && !isFinalSubmission && !isCoordination ? "page" : undefined}>사업계획서·제출 준비</a>
      <a href="/admin/growth/business-plan/?view=final-submission" aria-current={isFinalSubmission ? "page" : undefined}>1R 최종 제출</a>
      <a href="/admin/growth/business-plan/?view=evidence-coordination" aria-current={isCoordination ? "page" : undefined}>증빙·승인 조정</a>
      <a href="/admin/platform/ai-operations/" aria-current={isAiOperations ? "page" : undefined}>AI·인프라 운영</a>
    </nav>
    {isOpsOverview ? <OpsOverviewAccess /> : isProductionChanges ? <ProductionChangeAccess /> : isAiOperations ? <AiOperationsAccess /> : (isFinalSubmission || isCoordination) ? <FinalSubmissionAccess coordination={isCoordination} /> : isBusinessPlan ? <BusinessPlanAccess /> : isWorkspace ? <WorkspaceAccess /> : isQuality ? <CiQualityAccess view={isCloudWork ? "cloud-work" : isNest ? "nestjs" : "quality"} /> : <OperationPolicyPanel />}
    {isPolicy && <details className="policy-card">
      <summary>다른 관리 업무로 이동</summary>
      <nav aria-label="관리 화면 이동">
        <p>이 화면에서는 운영 정책과 라이선스 근거를 관리합니다. 회원·신고·정산 등 다른 업무는 웹 관리자에서 이어가세요.</p>
        <a href="https://www.toonstudio.cloud/admin/platform/operations?view=policy">웹 관리자 · 운영 정책으로 돌아가기</a>
      </nav>
    </details>}
  </main>;
}
