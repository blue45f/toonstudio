import { SubmissionBadge, SubmissionLink, SubmissionPanel, submissionDate, submissionValue } from "./final-submission-ui";

import type { BoardState, DocumentRecord } from "@toonstudio/contracts/final-submission";

export function FinalSubmissionDocuments({ board, onEdit, disabled }: { board: BoardState; onEdit: (document: DocumentRecord) => void; disabled: boolean }) {
  return <SubmissionPanel id="fs-documents" title="최신 파일 · 플랫폼 제출 비교" description="관리 중인 후보와 실제 플랫폼 관찰을 나란히 봅니다. 확인하지 못한 파일·제출 여부는 미확인으로 유지합니다.">
    <div className="fs-table-wrap" tabIndex={0} role="region" aria-label="최신 파일과 실제 플랫폼 제출 비교 표">
      <table className="fs-comparison"><thead><tr><th scope="col">관리 문서</th><th scope="col">최신 관리 후보</th><th scope="col">플랫폼에서 실제 확인한 기록</th><th scope="col">대조 결과</th></tr></thead><tbody>
        {board.documents.map((document) => <tr key={document.id}>
          <th scope="row"><strong>{document.label}</strong><span className="fs-meta">{document.availability}</span><button type="button" className="fs-button" disabled={disabled} onClick={() => onEdit(document)}>{document.label} 기록</button></th>
          <td><strong className="fs-file-name">{submissionValue(document.fileName)}</strong><p className="fs-version">버전 {submissionValue(document.version)} <SubmissionBadge status={document.candidateState} /></p>
            <dl className="fs-facts"><div><dt>작성</dt><dd>{submissionDate(document.authoredAt)}</dd></div><div><dt>수정</dt><dd>{submissionDate(document.modifiedAt)}</dd></div><div><dt>형식</dt><dd><SubmissionBadge status={document.formatStatus} /></dd></div></dl>
            {document.versionBasis && <p className="fs-meta">버전 근거 · {document.versionBasis}</p>}
            {document.sourceUrl && <SubmissionLink href={document.sourceUrl}>관리 파일 근거</SubmissionLink>}
          </td>
          <td><SubmissionBadge status={document.platform.status} /><strong className="fs-file-name">{submissionValue(document.platform.fileName)}</strong><p className="fs-meta">버전 {submissionValue(document.platform.version)}</p>
            <dl className="fs-facts"><div><dt>제출</dt><dd>{submissionDate(document.platform.submittedAt)}</dd></div><div><dt>관찰</dt><dd>{submissionDate(document.platform.observedAt)}</dd></div><div><dt>접수</dt><dd>{submissionValue(document.platform.receipt)}</dd></div></dl>
            {document.platform.evidenceUrl ? <SubmissionLink href={document.platform.evidenceUrl}>플랫폼 관찰 근거</SubmissionLink> : <p className="fs-meta">제출 근거 미등록</p>}
          </td>
          <td><SubmissionBadge status={document.platform.comparison} /><p>{document.platform.comparisonNote || "실제 첨부 파일을 확인한 근거가 필요합니다."}</p><p className="fs-meta">파일 최종 확인<br />{submissionDate(document.lastConfirmedAt)}</p></td>
        </tr>)}
      </tbody></table>
    </div>
  </SubmissionPanel>;
}
