import "../styles/admin.css";
import { OperationPolicyPanel } from "../../domains/operations/operation-policy/OperationPolicyPanel";

import { CiQualityAccess } from "./CiQualityAccess";

export function AdminApp() {
  const isQuality = window.location.pathname.replace(/\/+$/u, "") === "/admin/platform/quality";
  return <main className="admin-shell">
    <header className="admin-brand" aria-label="ToonStudio 관리자">
      <a href="https://www.toonstudio.cloud/" aria-label="ToonStudio 서비스로 돌아가기">Toon<span>Studio</span></a>
      <span className="admin-brand__label">{isQuality ? "CI·QA 검증" : "운영 정책·라이선스"}</span>
      <span className="admin-brand__security" data-testid="admin-edge-gate-badge">{isQuality ? "서버 관리자 권한 확인" : "관리자 전용"}</span>
    </header>
    <nav className="admin-local-navigation" aria-label="독립 관리자 메뉴">
      <a href="/admin/platform/operations?view=policy" aria-current={isQuality ? undefined : "page"}>운영 모드·라이선스</a>
      <a href="/admin/platform/quality/" aria-current={isQuality ? "page" : undefined}>CI·QA 검증</a>
    </nav>
    {!isQuality && <nav className="policy-card" aria-label="관리 화면 이동">
      <p>이 화면에서는 운영 정책과 라이선스 근거를 관리합니다. 회원·신고·정산 등 다른 업무는 웹 관리자에서 이어가세요.</p>
      <a href="https://www.toonstudio.cloud/admin/platform/operations?view=policy">웹 관리자 · 운영 정책으로 돌아가기</a>
    </nav>}
    {isQuality ? <CiQualityAccess /> : <OperationPolicyPanel />}
  </main>;
}
