import { COMBO_PROVENANCE } from "../../bench/recommended-combos";

import type { FamilyRecommendation } from "../../bench/recommended-combos";

/**
 * 추천 조합 섹션(갤러리 상단). 측정된 `FamilyRecommendation`을 표로 보여준다.
 * 데이터가 비어 있으면 측정 전 안내만 보인다(빈 표를 그리지 않는다).
 */
export function RecommendedCombos({ combos }: { combos: readonly FamilyRecommendation[] }) {
  return (
    <section className="lab-panel" aria-label="추천 조합">
      <h2>추천 조합</h2>
      <p className="lab-muted">
        가족별 프리셋에 가장 잘 맞는 레인을 Node 실측(결정성 2회 확인)으로 골랐다. 수치는 같은 머신 단일 측정이라 성능 증거가
        아니며, 브라우저 실측 전까지 승격 근거로 쓰지 않는다. 출처: {COMBO_PROVENANCE}
      </p>
      {combos.length === 0 ? (
        <p className="lab-muted">측정된 추천 조합이 없다. 조합 실험 러너를 실행해 표를 갱신한다.</p>
      ) : (
        <table className="lab-table">
          <thead>
            <tr>
              <th scope="col">프리셋</th>
              <th scope="col">추천 레인</th>
              <th scope="col">이유</th>
              <th scope="col">지그재그(ms)</th>
              <th scope="col">나선 30초(ms)</th>
              <th scope="col">주의</th>
            </tr>
          </thead>
          <tbody>
            {combos.map((c) => (
              <tr key={`${c.presetId}/${c.laneId}`}>
                <td>{c.presetId}</td>
                <td>{c.laneId}</td>
                <td>{c.reasonKo}</td>
                <td>{c.zigzagMs}</td>
                <td>{c.spiralMs}</td>
                <td>{c.noteKo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
