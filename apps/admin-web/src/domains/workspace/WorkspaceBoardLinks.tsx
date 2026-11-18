import { WorkspaceBadge } from "./workspace-ui";

import type { WorkspaceModule } from "@toonstudio/contracts/admin-workspace";

const boards = [
  { id: "quality", title: "CI·QA 검증", href: "/admin/platform/quality/", storage: "브라우저 로컬", access: "관리자별 기록", detail: "검증 상태·실패 분석·외부 QA·승인 대기를 기존 검증 보드에서 관리합니다." },
  { id: "ai", title: "AI·무료 운영", href: "/admin/platform/ai-operations/", storage: "전문 보드", access: "보드에서 권한 확인", detail: "모델 종료·서비스 한도와 무료 운영 대응 기록을 확인합니다." },
  { id: "dependency", title: "의존성·CI", href: "/admin/platform/quality/?view=dependency-review", storage: "브라우저 로컬", access: "관리자별 기록", detail: "의존성 충돌과 회귀 검증은 기존 CI·QA의 의존성 검토 탭에서 관리합니다." },
  { id: "nestjs", title: "NestJS 호환성", href: "/admin/platform/quality/?view=nestjs", storage: "서버 공동 저장", access: "관리자 편집·운영자 조회", detail: "버전 행렬과 실시간 협업 검증의 상세 결과를 확인합니다." },
  { id: "cloud", title: "클라우드 작업", href: "/admin/platform/quality/?view=cloud-work", storage: "서버 개인 저장", access: "본인 관리자 기록", detail: "PR·커밋·CI·배포의 상태와 다음 조치를 관리합니다." },
  { id: "business", title: "사업계획·제출", href: "/admin/growth/business-plan/", storage: "서버 비공개 저장", access: "소유자·명시적 허용 계정", detail: "주장·원문·제출 후보와 문서 이력을 비공개 보드에서 관리합니다." },
] as const;

export function WorkspaceBoardLinks({ module }: { module: WorkspaceModule }) {
  const visible = module === "coordination" ? boards : boards.filter(board => board.id === module);
  return <section aria-label="전문 작업 보드 연결">
    <div className="workspace-section-heading"><div><h2>{module === "coordination" ? "업무별 작업 보드" : "상세 작업 이어가기"}</h2><p>상세 기록은 각 보드에서 편집합니다. 통합 검토에는 연결 관계와 현재 확인한 증거를 기록하세요.</p></div></div>
    <div className="workspace-source-grid">{visible.map(board => <article key={board.id} className="workspace-panel">
      <header className="workspace-panel-header"><h3><a href={board.href}>{board.title}</a></h3><WorkspaceBadge tone="info">{board.storage}</WorkspaceBadge></header>
      <div className="workspace-panel-body"><p>{board.detail}</p><p className="workspace-muted">{board.access}</p><a href={board.href}>상세 보드 열기</a></div>
    </article>)}</div>
    {module === "coordination" ? <p className="workspace-alert">브라우저 로컬 기록은 기기·브라우저 사이에 공유되지 않습니다. JSON 백업은 해당 보드에서 내보내세요. 이 화면은 CI 실행·PR 생성·배포·유료 전환을 수행하지 않습니다.</p>
      : <p className="workspace-alert">아래 이전 기록은 가져온 당시의 참조 자료입니다. 현재 상태는 전문 보드에서 확인하며, 참조 자료를 새 상세 작업으로 복제하지 않습니다.</p>}
  </section>;
}
