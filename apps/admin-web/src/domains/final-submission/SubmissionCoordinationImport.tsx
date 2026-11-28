import { FINAL_SUBMISSION_MAX_BYTES, parseCoordinationItems, type CoordinationItem } from "@toonstudio/contracts/final-submission";
import { useRef, useState } from "react";

import { SubmissionDialog, SubmissionError } from "./final-submission-ui";

interface ImportProps {
  existing: CoordinationItem[];
  onApply: (items: CoordinationItem[]) => string | null;
  onClose: () => void;
}

const sizeError = "조정 JSON 파일은 2 MiB까지 가져올 수 있습니다.";

function parseExport(text: string): CoordinationItem[] {
  if (new TextEncoder().encode(text).byteLength > FINAL_SUBMISSION_MAX_BYTES) throw new Error(sizeError);
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error("JSON 문법을 확인해 주세요."); }
  if (!data || typeof data !== "object" || !("format" in data) || data.format !== "toonstudio-coordination"
    || !("version" in data) || data.version !== 1 || !("items" in data)) {
    throw new Error("증빙·승인 추적 보드의 ‘어드민용 JSON’ 파일을 선택해 주세요.");
  }
  const rows = parseCoordinationItems(data.items);
  if (!rows) throw new Error("항목 필드·ID 중복·주소·해시 형식을 확인해 주세요. 최대 300개 항목을 지원합니다.");
  return rows.map(row => ({ ...row, status: "미확인", latestVerified: false, evidenceAt: "", checkedAt: "" }));
}

export function SubmissionCoordinationImport({ existing, onApply, onClose }: ImportProps) {
  const [review, setReview] = useState<{ name: string; rows: CoordinationItem[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const knownIds = new Set(existing.map(row => row.id));
  const incoming = review?.rows.filter(row => !knownIds.has(row.id)) ?? [];
  const skipped = (review?.rows.length ?? 0) - incoming.length;

  async function inspect(file?: File) {
    const run = ++sequence.current;
    setError("");
    setReview(null);
    setLoading(Boolean(file));
    if (!file) return;
    try {
      if (file.size > FINAL_SUBMISSION_MAX_BYTES) throw new Error(sizeError);
      const rows = parseExport(await file.text());
      if (run === sequence.current) setReview({ name: file.name, rows });
    } catch (cause) {
      if (run === sequence.current) setError(cause instanceof Error ? cause.message : "파일을 읽지 못했습니다.");
    } finally {
      if (run === sequence.current) setLoading(false);
    }
  }

  function apply() {
    if (!incoming.length) return;
    if (!parseCoordinationItems([...existing, ...incoming])) {
      setError("기존 기록과 합친 항목 수·용량이 한도를 넘거나 기록 형식이 올바르지 않습니다.");
      return;
    }
    const failure = onApply(incoming);
    if (failure) setError(failure);
    else onClose();
  }

  return <SubmissionDialog title="조정 항목 가져오기" description="증빙·승인 추적 보드에서 ‘어드민용 JSON’으로 내보낸 파일을 선택하세요." onClose={onClose}>
    <div className="fs-dialog-body">
      <label className="fs-field"><span>어드민용 조정 JSON</span>
        <input type="file" accept=".json,application/json" onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void inspect(file);
        }} />
      </label>
      {loading && <p role="status">조정 항목을 확인하고 있습니다.</p>}
      <SubmissionError error={error} />
      {review && <section aria-label="가져오기 미리보기" className="fs-import-review">
        <h3>가져오기 미리보기</h3>
        <p>{review.name} · 추가 {incoming.length}건 · 기존 ID 유지 {skipped}건</p>
        <ul>{review.rows.map(row => <li key={row.id}>{row.title} · {row.id} · {knownIds.has(row.id) ? "기존 항목 유지" : "미확인으로 추가"}</li>)}</ul>
        <p>같은 ID의 항목은 관리자 화면에서 직접 편집할 수 있습니다. 새 항목의 근거와 확인 시점은 가져온 뒤 다시 대조하세요.</p>
        <p>현재 원장에서 찾을 수 없는 원본 ID는 출처 메모에 남깁니다. 원본 운영·제출 항목은 그대로 유지됩니다.</p>
      </section>}
    </div>
    <footer className="fs-dialog-footer">
      <span>새 항목을 반영한 뒤 서버에 저장할 수 있습니다.</span>
      <button type="button" className="fs-button fs-button--primary" disabled={!incoming.length || loading} onClick={apply}>새 항목 반영</button>
    </footer>
  </SubmissionDialog>;
}
