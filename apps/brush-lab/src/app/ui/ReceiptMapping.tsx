/**
 * 레인 영수증이 밝히는 "프로그램의 일부만 그렸다"는 사실을 화면에 보인다(R-B-2, 무음 대체 금지 ADR-0018).
 * 붓털 물리 레인은 프로그램에서 팁 지름·흐름 정도만 옮기고 나머지는 `unmappedKo`로 남기는데, 영수증을 읽는 UI가 없으면 사용자는
 * 둥근 털 dab 결과를 그 브러시의 모습으로 오해한다. 공통 `StrokeReceipt`에는 이 필드가 없어 구조를 확인하고 읽는다.
 */

/** 영수증에서 문자열 배열 필드(`unmappedKo`·`mappedKo`·`notesKo`)를 꺼낸다. 없거나 모양이 다르면 빈 배열. */
export function receiptStringList(receipt: unknown, key: "unmappedKo" | "mappedKo" | "notesKo"): string[] {
  if (typeof receipt !== "object" || receipt === null) return [];
  const value = (receipt as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export interface ReceiptMappingProps {
  receipt: unknown;
}

/** 옮기지 못한 항목(`unmappedKo`)과 옮긴 항목(`mappedKo`)을 접이식으로 보인다. 둘 다 없으면 아무것도 그리지 않는다. */
export function ReceiptMapping({ receipt }: ReceiptMappingProps) {
  const unmapped = receiptStringList(receipt, "unmappedKo");
  const mapped = receiptStringList(receipt, "mappedKo");
  if (unmapped.length === 0 && mapped.length === 0) return null;
  return (
    <div className="lab-receipt-mapping" data-testid="lab-draw-hud-mapping">
      {unmapped.length > 0 ? (
        <details data-testid="lab-draw-hud-unmapped">
          <summary>이 레인이 옮기지 못한 항목 {unmapped.length}건 — 이 브러시의 일부만 그려졌다</summary>
          <ul className="lab-muted">
            {unmapped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {mapped.length > 0 ? (
        <details data-testid="lab-draw-hud-mapped">
          <summary>이 레인이 옮긴 항목 {mapped.length}건</summary>
          <ul className="lab-muted">
            {mapped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
