import "../styles/admin.css";
import { OperationPolicyPanel } from "../../domains/operations/operation-policy/OperationPolicyPanel";

export function AdminApp() {
  return <main className="admin-shell">
    <header className="admin-brand" aria-label="ToonStudio 관리자">
      <a href="https://www.toonstudio.cloud/" aria-label="ToonStudio 서비스로 돌아가기">Toon<span>Studio</span></a>
      <span className="admin-brand__label">운영 정책·라이선스</span>
      <span className="admin-brand__security">관리자 전용</span>
    </header>
    <nav className="policy-card" aria-label="관리 화면 이동">
      <p>이 화면에서는 운영 정책과 라이선스 근거를 관리합니다. 회원·신고·정산 등 다른 업무는 웹 관리자에서 이어가세요.</p>
      <a href="https://www.toonstudio.cloud/admin/platform/operations?view=policy">웹 관리자 · 운영 정책으로 돌아가기</a>
    </nav>
    <OperationPolicyPanel />
  </main>;
}
