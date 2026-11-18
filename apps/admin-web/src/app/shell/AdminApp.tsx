import "../styles/admin.css";
import { OperationPolicyPanel } from "../../domains/operations/operation-policy/OperationPolicyPanel";

import { AiOperationsAccess } from "./AiOperationsAccess";
import { CiQualityAccess } from "./CiQualityAccess";
import { WorkspaceAccess } from "./WorkspaceAccess";

export function AdminApp() {
  const pathname = window.location.pathname.replace(/\/+$/u, "");
  const isQuality = pathname === "/admin/platform/quality";
  const isAiOperations = pathname === "/admin/platform/ai-operations";
  const isWorkspace = pathname === "/admin/workspace";
  const isPolicy = !isQuality && !isAiOperations && !isWorkspace;
  return <main className="admin-shell">
    <header className="admin-brand" aria-label="ToonStudio 관리자">
      <a href="https://www.toonstudio.cloud/" aria-label="ToonStudio 서비스로 돌아가기">Toon<span>Studio</span></a>
      <span className="admin-brand__label">{isWorkspace ? "통합 작업실" : isAiOperations ? "AI·인프라 운영" : isQuality ? "CI·QA 검증" : "운영 정책·라이선스"}</span>
      <span className="admin-brand__security" data-testid="admin-edge-gate-badge">{isPolicy ? "관리자 전용" : "서버 관리자 권한 확인"}</span>
    </header>
    <nav className="admin-local-navigation" aria-label="독립 관리자 메뉴">
      <a href="/admin/platform/operations?view=policy" aria-current={isPolicy ? "page" : undefined}>운영 모드·라이선스</a>
      <a href="/admin/platform/quality/" aria-current={isQuality ? "page" : undefined}>CI·QA 검증</a>
      <a href="/admin/platform/ai-operations/" aria-current={isAiOperations ? "page" : undefined}>AI·인프라 운영</a>
      <a href="/admin/workspace/" aria-current={isWorkspace ? "page" : undefined}>통합 작업실</a>
    </nav>
    {isWorkspace ? <WorkspaceAccess /> : isAiOperations ? <AiOperationsAccess /> : isQuality ? <CiQualityAccess /> : <OperationPolicyPanel />}
    {isPolicy && <details className="policy-card">
      <summary>다른 관리 업무로 이동</summary>
      <nav aria-label="관리 화면 이동">
        <p>이 화면에서는 운영 정책과 라이선스 근거를 관리합니다. 회원·신고·정산 등 다른 업무는 웹 관리자에서 이어가세요.</p>
        <a href="https://www.toonstudio.cloud/admin/platform/operations?view=policy">웹 관리자 · 운영 정책으로 돌아가기</a>
      </nav>
    </details>}
  </main>;
}
