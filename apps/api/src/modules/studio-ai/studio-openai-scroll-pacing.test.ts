import { describe, expect, it, vi } from "vitest";

import { StudioOpenAiCreativeAssistService } from "./studio-openai-creative-assist.service";

const mode = "scroll-pacing-auditor";
const multilineEnding = "1컷: 복도를 걷는다.\n2컷: 민서가 손잡이를 잡는다.\n\n민서: “문 뒤에 누가 있어.”";
const proseQuestion = "[원고]\n불 꺼진 방에서 전화벨이 울린다. 죽은 동생이 전화를 건 걸까?";
const beat = {
  section: "도입",
  pacing: "tight" as const,
  recommendedGapPx: 16,
  readerRetentionNote: "첫 컷에서 시선을 잡으세요.",
};
const output = {
  rhythmVerdict: "마지막 컷 앞에서 호흡을 늦추세요.",
  averageGapPx: 16,
  cliffhangerScore: 0,
  cliffhangerTip: "「문을 연다」로 사건이 마무리됩니다. 문 너머에서 보이는 것을 보여 줄지 결정하세요.",
  beatPacing: [beat, { ...beat, section: "엔딩", pacing: "drop" as const, recommendedGapPx: 16 }],
};

function requestWithOutput(data: unknown, inputText = "1컷: 계단을 오른다.\n2컷: 문을 연다.") {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }],
  }));
  const result = new StudioOpenAiCreativeAssistService().assist(
    "user:scroll-pacing-test",
    { mode, inputText },
    { env: { OPENAI_API_KEY: "test-placeholder", OPENAI_MODEL: "gpt-4.1-mini" }, fetchImpl },
  );
  return { fetchImpl, result };
}

describe("스크롤 호흡 감사 응답 계약", () => {
  it("전송 스키마에 간격·점수·구간 수 범위를 싣고 경계값을 그대로 반환한다", async () => {
    const { fetchImpl, result } = requestWithOutput(output);
    await expect(result).resolves.toMatchObject({ provider: "openai", result: { mode, data: output } });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const gap = { type: "integer", minimum: 16, maximum: 1600 };
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        strict: true,
        schema: {
          properties: {
            averageGapPx: gap,
            cliffhangerScore: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            beatPacing: { minItems: 2, maxItems: 8, items: { properties: { recommendedGapPx: gap } } },
          },
        },
      },
    });
    const systemPrompt = body.messages[0].content;
    expect(systemPrompt).toMatch(/rhythmVerdict[^.]*1~320자/);
    expect(systemPrompt).toMatch(/section[^.]*1~100자/);
    expect(systemPrompt).toMatch(/readerRetentionNote[^.]*1~280자/);
    expect(systemPrompt).toMatch(/cliffhangerTip[^.]*1~320자/);
  });

  it("점수를 유보한 모델의 조언과 구간 제안은 보존한다", async () => {
    const data = { ...output, cliffhangerScore: null, cliffhangerTip: "점검할 엔딩 컷의 행동을 알려 주세요." };
    await expect(requestWithOutput(data, "도입 장면의 여백을 검토해 주세요.").result)
      .resolves.toMatchObject({ result: { mode, data } });
  });

  it("인용 없는 조언은 남기고 점수만 보류하며, 미평가와 함께 온 잘못된 인용은 제거한다", async () => {
    const tip = "문이 열리기 전후의 여백을 바꿔 두 버전을 비교하세요.";
    await expect(requestWithOutput({ ...output, cliffhangerTip: tip }).result)
      .resolves.toMatchObject({ result: { data: { cliffhangerScore: null, cliffhangerTip: tip } } });
    const { result } = await requestWithOutput({ ...output, cliffhangerScore: null, cliffhangerTip: "「창문이 깨진다」로 끝납니다." }).result;
    if (result.mode !== mode) throw new Error("스크롤 호흡 결과 누락");
    expect(result.data.cliffhangerTip).not.toContain("창문");
    expect(result.data.cliffhangerScore).toBeNull();
  });

  it("미평가 결과에서 서술형 엔딩 점수만 빼고 실제 경기 점수와 여백 제안을 보존한다", async () => {
    const rhythm = "전광판의 2점이 보인 뒤 한 박자 쉽니다.";
    const tip = "공이 바닥에 닿기 직전의 여백을 넓혀 보세요.";
    const data = { ...output, cliffhangerScore: 82, rhythmVerdict: `엔딩의 흡인력은 82점입니다. ${rhythm}`,
      cliffhangerTip: `82점은 현재 마지막 컷 기준입니다. ${tip}` };
    await expect(requestWithOutput(data, "1컷: 지호가 공을 놓친다. 2컷: 불 꺼진 전광판의 2점이 깜빡인다.").result)
      .resolves.toMatchObject({ result: { data: {
      cliffhangerScore: null, rhythmVerdict: rhythm, cliffhangerTip: tip,
    } } });
  });

  it.each([
    ["인용 속 마지막 컷", "1컷: 복도를 걷는다.\n2컷: 민서가 필름을 들며 말한다. “이 필름의 마지막 컷 뒤에 진실이 있어.”", "이 필름의 마지막 컷 뒤에 진실이 있어.", true],
    ["인용 속 회차·컷 번호", "1화 1컷: 필름을 감는다.\n2컷: 민서가 ‘원래 2화 8컷 뒤에 붙었어’라고 속삭인다.", "원래 2화 8컷 뒤에 붙었어", true],
    ["인용 속 구역 표기", "[원고]\n1컷: 동전이 떨어진다.\n2컷: 수아가 읽는다. 「🎞 처음에\n[메모]\n마지막 컷: 빈 의자\n[원고]\n라 쓰였어」\n[요청]\n다음 컷은 별도 원고.", "🎞 처음에 [메모] 마지막 컷: 빈 의자 [원고] 라 쓰였어", true],
    ["인용이 끝난 뒤 실제 요청", "[원고]\n2컷: 수아가 읽는다. 「메모야.\n[요청]\n여우가 왔어」\n[메모]\n다음 컷에는 늑대가 온다.", "늑대가 온다", false],
    ["인용이 끝난 뒤 실제 컷", "1컷: 🎭 수아가 \"앞으로 9컷 정도 남았어\"라고 말한다.\n2컷: 손바닥에 눈이 떨어진다.", "앞으로 9컷 정도 남았어", false],
    ["인용 다음 컷의 원문 위치", "1컷: 🎭 수아가 \"앞으로 9컷 정도 남았어\"라고 말한다.\n2컷: 손바닥에 눈이 떨어진다.", "손바닥에 눈이 떨어진다", true],
    ["산문 앞 대사의 컷 표기", "[원고]\n수아는 “예를 들면 마지막 컷: 종소리였다.”라고 말한다. 문밖에 다른 이름이 적혀 있다.", "종소리였다", false],
    ["인용 속 원문자 번호", "① 나무가 흔들린다. ② 빈 우편함이 열린다. 수아: “메모에는 ③ 새벽이 온다고 적혔어.”", "빈 우편함이 열린다", true],
    ["표찰", "컷 1: 수아가 빈 화분을 옮긴다.\n컷 2: 표찰에서 동생의 이름을 읽는다.", "동생의 이름을 읽는다", true],
    ["폐관", "전시실의 문이 닫힌다. 마지막 컷: 반납함에서 벨이 두 번 울린다.", "벨이 두 번 울린다", true],
    ["줄바꿈", "1컷에서 수표를 편다. 2컷에서는 🎨 파란\n  도장이 번진다.", "🎨 파란 도장이 번진다", true],
    ["끝컷의 둘째 문단 대사", multilineEnding, "문 뒤에 누가 있어", true],
    ["별도 메모 앞의 둘째 문단 대사", multilineEnding + "\n\n편집 메모: 밤하늘을 추가할까요?", "문 뒤에 누가 있어", true],
    ["둘째 문단 뒤 편집 메모", multilineEnding + "\n\n편집 메모: 밤하늘을 추가할까요?", "밤하늘을 추가할까요", false],
    ["메모 구역의 삭제 지시", "1컷: 문을 연다.\n2컷: 방 안이 비어 있다.\n\n메모: 창가의 고양이는 삭제 예정.", "창가의 고양이", false],
    ["컷 안의 엽서 문구", "1컷: 문을 연다.\n2컷: 엽서를 뒤집는다.\n\n화면 속 메모: 빨간 벤치에서 기다려.", "빨간 벤치에서 기다려", true],
    ["메모와 비슷한 이름의 화자", "1컷: 문을 연다.\n2컷: 라디오가 켜진다.\n\n메모리: “다시 만날 수 있어.”", "다시 만날 수 있어", true],
    ["둘째 문단 뒤 독립 요청", multilineEnding + "\n\n보라색 그림자를 추가해 주세요.", "보라색 그림자", false],
    ["앞 컷 인용", "1컷: 복도에 젖은 발자국이 있다.\n2컷: 모래를 털고 돌아선다.", "젖은 발자국", false],
    ["새로 지어낸 대사", "1컷: 무대의 불이 꺼진다.\n2컷: 관객들이 외투를 챙긴다.", "우린 떠나지 않아", false],
    ["편집 지시 재인용", "1컷: 빨간 단추를 줍는다.\n2컷: 단추를 주머니에 넣는다.\n요청: 사라진 가방을 상상해 주세요.", "사라진 가방", false],
    ["모바일 원고의 메모", "1컷: 헬멧을 벗는다. 2컷: 이마에 반창고가 붙어 있다. 편집 메모: 엔딩 컷에 풍선을 달아 볼까?", "풍선을 달아", false],
    ["서로 다른 회차", "1화 마지막 컷: 처마에서 눈이 쏟아진다.\n2화 1컷: 처마 밑에 꽃이 핀다.", "꽃이 핀다", false],
    ["조사가 붙은 두 회차", "1화의 마지막 컷: 문이 닫힌다. 2화의 마지막 컷: 종이 울린다.", "종이 울린다", false],
    ["끝컷 뒤 독립 편집 질문", "1컷: 문이 닫힌다. 2컷: 불이 꺼진다. 검은 고양이를 추가할까요?", "검은 고양이", false],
    ["인물의 질문", "1컷: 문이 닫힌다. 2컷: 불이 꺼진다. “검은 고양이를 추가할까요?”", "검은 고양이", true],
    ["화자 표기가 있는 질문", "1컷: 서점이 비어 있다. 2컷: 인기척이 들린다.\n서현: 누구를 찾으세요?", "누구를 찾으세요", true],
    ["끝컷을 식별할 수 없는 요청", "도입부의 붉은 나비를 살려 주세요.", "붉은 나비", false],
    ["한 글자 우연 일치", "1컷: 주머니를 뒤진다.\n2컷: 문을 열고 가방을 든다.", "문", false],
    ["산문 원고 끝 문장", "도입과 결말을 점검해 주세요.\n[원고]\n바람에 신문이 구른다. 조간신문의 날짜가 내일이다.", "날짜가 내일이다", true],
    ["산문 끝의 서술형 질문", proseQuestion, "죽은 동생이 전화를 건 걸까?", true],
    ["산문 질문 직전 문장", proseQuestion, "전화벨이 울린다", false],
    ["번호 컷의 서술형 질문", "1컷: 고양이가 그림자를 본다. 2컷: 빈 의자가 흔들린다. 누가 먼저 와 있었을까?", "먼저 와 있었을까", true],
    ["산문 뒤 편집 질문", proseQuestion + "\n창문을 여는 컷을 추가할까요?", "창문을 여는 컷", false],
    ["편집 질문 앞의 서술형 질문", proseQuestion + "\n창문을 여는 컷을 추가할까요?", "죽은 동생이 전화를 건 걸까?", true],
    ["편집 간격 제안", proseQuestion + "\n컷 사이 여백을 더 넓힐까요?", "여백을 더 넓힐까요", false],
    ["원고 속 편집자 대사", "1컷: 이야기를 멈춘다. 2컷: 편집자가 묻는다. “컷 사이 여백을 더 넓힐까요?”", "여백을 더 넓힐까요", true],
    ["대괄호 요청 앞의 마지막 문장", proseQuestion + "\n[요청]\n다음 화의 화자는 우체부입니다.", "죽은 동생이 전화를 건 걸까?", true],
    ["대괄호 요청의 지시", proseQuestion + "\n[요청]\n다음 화의 화자는 우체부입니다.", "화자는 우체부", false],
    ["대괄호 메모의 편집 정보", proseQuestion + "\n[메모]\n전화벨 소리는 녹음할 예정.", "전화벨 소리", false],
    ["산문 원고 도입 인용", "유리병 속에 단풍잎이 있다. 두 사람이 다리를 건넌다.\n요청: 장면 여백을 검토하세요.", "단풍잎이 있다", false],
    ["산문과 편집 요청", "국자가 냄비에 빠진다. 그릇 하나가 식탁 끝에 남는다.\n요청: 아이들의 식탁 호흡을 분석하세요.", "식탁 끝에 남는다", true],
    ["원고 뒤 제안 인용", "1컷: 포장지를 편다.\n2컷: 빈 종이컵이 나온다. 얼음이 쏟아지는 장면을 추가해 주세요.", "얼음이 쏟아지는", false],
    ["원문자 순번", "① 끊어진 줄을 집는다. ② 줄에 푸른 매듭을 짓는다. ③ 매듭에서 물이 스민다.", "매듭에서 물이 스민다", true],
    ["원문자 앞 구간", "① 무명실을 푼다. ② 흰 구슬을 굴린다. ③ 빈 타래를 건넨다.", "흰 구슬을 굴린다", false],
  ] as const)("%s 원고에서 끝컷 인용과 점수를 함께 검증한다", async (_name, input, quote, matches) => {
    const data = { ...output, cliffhangerScore: 64, cliffhangerTip: `「${quote}」의 여운을 남기세요.` };
    const { result } = await requestWithOutput(data, input).result;
    if (result.mode !== mode) throw new Error("스크롤 호흡 결과 누락");
    expect(result.data.cliffhangerScore).toBe(matches ? 64 : null);
    expect(result.data.beatPacing).toEqual(data.beatPacing);
    if (matches) expect(result.data.cliffhangerTip).toBe(data.cliffhangerTip);
    else {
      expect(result.data.cliffhangerTip).toContain("마지막 컷");
      expect(result.data.cliffhangerTip).not.toContain(`「${quote}」`);
    }
  });

  it.each([
    ["빈 줄 뒤의 요청", "죽은 동생의 목소리가 들린다.", "\n\n", "분석해 주세요."],
    ["연속된 빈 줄과 두 요청", "죽은 동생의 목소리가 들린다.", "\n\n\n", "검토해 주세요.\n\n\t\n분석해 주세요."],
    ["탭과 CRLF 뒤의 요청 구역", "죽은 동생이 전화를 건 걸까?", "\r\n\t\r\n\r\n", "[요청]\r\n분석해 주세요."],
    ["공백 줄 뒤의 메모 구역", "죽은 동생이 전화를 건 걸까?", "\n \t\n\t\n", "메모: 분석해 주세요."],
  ])("%s에서도 산문의 마지막 서술·질문만 점수의 근거가 된다", async (_name, ending, gap, request) => {
    const input = `[원고]\n전화벨이 울린다. ${ending}${gap}${request}${gap}`;
    for (const quote of [ending, "전화벨이 울린다", "분석해 주세요"]) {
      const data = { ...output, cliffhangerScore: 62, cliffhangerTip: `「${quote}」가 마지막에 남습니다.` };
      await expect(requestWithOutput(data, input).result).resolves.toMatchObject({
        result: { mode, data: { cliffhangerScore: quote === ending ? 62 : null } },
      });
    }
  });

  it("무료 클라우드 경로에서도 이전 컷의 인용을 점수 근거에서 제외한다", async () => {
    const data = { ...output, cliffhangerScore: 91, cliffhangerTip: "「현이 끊긴다」로 다음 연주를 기다리게 합니다." };
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      choices: [{ message: { content: JSON.stringify(data) } }], usage: { total_tokens: 32 },
    }));
    const response = await new StudioOpenAiCreativeAssistService().assistWithZeroBillCascade("user:free-scroll", {
      mode, inputText: "[1컷] 바이올린 현이 끊긴다.\n[2컷] 수리를 마친 악기를 돌려준다.",
    }, { env: { STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: "test-placeholder", STUDIO_AI_FREE_GITHUB_MODELS_CONFIRMED: "true" }, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      providerTier: "cloud-free", result: { mode, data: { cliffhangerScore: null, beatPacing: data.beatPacing } },
    });
  });

  it("로컬 라우팅은 원고 평가 점수 없이 권장 예시의 실제 평균을 반환한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const response = await new StudioOpenAiCreativeAssistService().assistWithZeroBillCascade(null, {
      mode, inputText: "1컷: 레시피를 펼친다.\n2컷: 두 사람이 식탁에 앉는다.",
    }, { env: {}, fetchImpl, localOnly: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      providerTier: "local-fallback", result: { mode, data: { averageGapPx: 273, cliffhangerScore: null } },
    });
  });

  it("평균 1600px, 엔딩 100점, 8개 구간까지 허용하고 구간 평균으로 averageGapPx를 동기화한다", async () => {
    const upper = {
      ...output,
      averageGapPx: 1600,
      cliffhangerScore: 100,
      beatPacing: Array.from({ length: 8 }, () => ({ ...beat, recommendedGapPx: 1600 })),
    };
    await expect(requestWithOutput(upper).result).resolves.toMatchObject({ result: { mode, data: upper } });

    const mixed = {
      ...output,
      averageGapPx: 16,
      beatPacing: [beat, { ...beat, section: "엔딩", pacing: "drop" as const, recommendedGapPx: 1600 }],
    };
    await expect(requestWithOutput(mixed).result).resolves.toMatchObject({
      result: { mode, data: { ...mixed, averageGapPx: 808 } },
    });
  });

  it.each([
    ["평균 간격 미달", { averageGapPx: 15 }],
    ["구간 간격 미달", { beatPacing: [beat, { ...beat, recommendedGapPx: 15 }] }],
    ["구간 간격 초과", { beatPacing: [beat, { ...beat, recommendedGapPx: 1601 }] }],
    ["음수 점수", { cliffhangerScore: -1 }],
    ["100점 초과", { cliffhangerScore: 101 }],
    ["소수 점수", { cliffhangerScore: 0.5 }],
    ["구간 부족", { beatPacing: [beat] }],
    ["구간 초과", { beatPacing: Array.from({ length: 9 }, () => beat) }],
    ["빈 총평", { rhythmVerdict: "" }],
    ["긴 총평", { rhythmVerdict: "가".repeat(321) }],
    ["긴 구간 이름", { beatPacing: [beat, { ...beat, section: "가".repeat(101) }] }],
    ["긴 구간 설명", { beatPacing: [beat, { ...beat, readerRetentionNote: "가".repeat(281) }] }],
    ["긴 클리프행어 팁", { cliffhangerTip: "가".repeat(321) }],
  ] as const)("%s 응답을 거절한다", async (_label, patch) => {
    const { result } = requestWithOutput({ ...output, ...patch });
    await expect(result).rejects.toMatchObject({ status: 502, response: { code: "OPENAI_SCHEMA_MISMATCH" } });
  });
});
