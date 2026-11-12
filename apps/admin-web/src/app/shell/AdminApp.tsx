import "../styles/admin.css";
import { OperationPolicyPanel } from "../../domains/operations/operation-policy/OperationPolicyPanel";

import { CiQualityAccess } from "./CiQualityAccess";

export function AdminApp() {
  const isQuality = window.location.pathname.replace(/\/+$/u, "") === "/admin/platform/quality";
  return <main className="admin-shell">
    <header className="admin-brand" aria-label="ToonStudio 관리자">
      <a href="https://www.toonstudio.cloud/" aria-label="ToonStudio 서비스로 돌아가기">Toon<span>Studio</span></a>
      <span className="admin-brand__label">운영 관리</span>
      <span className="admin-brand__security" data-testid="admin-edge-gate-badge">{isQuality ? "서버 관리자 권한 확인" : "Edge Gate 보호"}</span>
    </header>
    <nav className="admin-local-navigation" aria-label="독립 관리자 메뉴">
      <a href="/admin/platform/operations" aria-current={isQuality ? undefined : "page"}>운영 모드·라이선스</a>
      <a href="/admin/platform/quality/" aria-current={isQuality ? "page" : undefined}>CI·QA 검증</a>
    </nav>
    {isQuality ? <CiQualityAccess /> : <OperationPolicyPanel />}
  </main>;
}
