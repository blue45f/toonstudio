function quoteDirections(sentences: string[], pattern: RegExp, maxLength: number): string {
  const matching = sentences.filter((line) => pattern.test(line));
  const quoted = matching.map((line) => `「${line}」`).join(" ");
  // 보존 조건을 중간에서 잘라 의미가 바뀌면 전체 원문을 확인하도록 안내한다.
  return quoted.length <= maxLength ? quoted : "원고에 적힌 해당 조건 전체를 확인하세요.";
}

/** 원고의 국소 보정 지시를 참고해 원본과 비교할 수 있는 레이어 효과 예시를 만든다. */
export function buildLocalPhotoshopFx(inputText: string) {
  // 별도 원고가 붙은 편집 의뢰에서는 극중 발화를 보정 지시로 인용하지 않는다.
  const [brief] = inputText.split(/^\s*\[원고\]\s*$/mu, 1);
  const sentences = brief.split(/(?<=[.!?。！？])\s+|[\r\n]+/u).map((line) => line.trim());
  const local = quoteDirections(sentences, /(?:에만|에서만)\s|^(?:적용|보정)\s*(?:대상|영역)\s*[:：]/u, 205);
  const preserved = quoteDirections(sentences, /제외|보호|보존|그대로|유지|금지|안\s*(?:된|돼)|말아|마세요/u, 230);
  const scope = local ? `원고의 적용 조건 ${local}` : "보정할 부위를 원고에서 선택하세요.";
  return {
    lookNameKo: "국소 명암 비교용 레이어 레시피",
    summary: "새 Camera Raw 스마트 필터의 시작값은 모두 0입니다. 기존 현상 설정을 보존하고, 원고에서 따로 지정한 수치는 해당 마스크 안에서 조정하세요. 아래 두 스타일은 각각 껐다 켜며 필요한 쪽만 고르세요.",
    layerStyles: [
      { effect: "Inner Glow (안쪽 광선)", blendMode: "screen", opacityPct: 8,
        paramsSummary: `${scope} 선택 부위만 복제한 레이어에서 가장자리 안쪽 1px부터 빛을 비교하세요.` },
      { effect: "Inner Shadow (안쪽 그림자)", blendMode: "multiply", opacityPct: 8,
        paramsSummary: `${scope} 같은 선택 영역에서 거리 1px·크기 2px로 어두운 결을 비교하세요.` },
    ],
    cameraRaw: { exposure: 0, contrast: 0, clarity: 0, dehaze: 0, temperatureShift: 0, grainPct: 0 },
    nonDestructiveTip: `${preserved ? `원고의 보존 조건 ${preserved} ` : ""}원본을 잠그고 효과 그룹에 마스크를 씌우세요. 보정할 곳만 흰색으로 열고 보호 영역은 검게 남긴 뒤 그룹을 껐다 켜 원본과 비교하세요.`,
  };
}
