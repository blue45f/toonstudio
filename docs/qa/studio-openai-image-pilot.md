# Studio BYOK 이미지 파일럿

## 현재 상태 · 2026-11-26

로컬 변경은 Studio 이미지 모델 설정이 없거나 비어 있을 때 `gpt-image-2.6-flare`를 선택한다. Flare는 빠른 시안 생성용이며, Sunburst는 세부 묘사가 중요한 작업용이다. 두 모델 모두 Images API의 생성과 편집을 지원한다. 이 작업에서 보낸 생성 요청은 0건이다. QA 프로젝트에서 앞서 보고된 `GET /v1/models/gpt-image-1.5-2025-12-16`의 404는 해당 모델 조회 결과다. 두 대체 모델의 프로젝트 접근 권한과 출력 품질은 미검증 상태다. [Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare) · [Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst)

저장된 BYOK 모델 ID는 그대로 읽는다. OpenAI 직접 연결에서 `dall-e-3`를 쓰던 사용자는 이미지 모델을 직접 변경해야 한다(2026-05-12 종료). `gpt-image-1.5`와 `gpt-image-1.5-2025-12-16`의 종료 예정일은 2026-12-01이다. 사설 제공자의 모델 별칭은 해당 제공자의 안내를 따른다. [OpenAI 모델 종료 일정](https://developers.openai.com/api/docs/deprecations)

## 예정 · QA 프로젝트에서 한 장 생성

승인된 이미지 예산 안에서 실행 담당자가 다음 JSON을 `POST https://api.openai.com/v1/images/generations`에 한 번 보낸다. 본문 형식은 `application/json`이다. 인증은 QA 프로젝트의 Bearer 인증을 사용한다. 스트리밍, 재시도, 다른 모델로의 재전송은 끈다. 실패하거나 시간 초과로 결과를 알 수 없어도 두 번째 요청을 보내지 않는다. [Images API 요청·응답 명세](https://developers.openai.com/api/reference/resources/images/methods/generate)

```json
{
  "model": "gpt-image-2.6-flare",
  "prompt": "흰 바탕 한가운데 검은 원 하나를 그려 주세요.",
  "n": 1,
  "quality": "low",
  "size": "1024x1024",
  "output_format": "png"
}
```

**예산 근거.** OpenAI의 표준 동기 요금은 두 모델 모두 100만 토큰당 텍스트 입력 5 USD, 이미지 출력 30 USD다. 실행 시점에 공식 계산기에서 GPT Image 2.6, low, 1024×1024를 선택해 이미지 한 장의 예상 출력 비용을 기록하고 텍스트 입력 예상액을 더한다. 예상액과 QA 프로젝트에서 이미지용으로 승인받은 USD 한도를 별도로 기록한다. 이 요청에 승인된 지출은 0 USD이며, 저장소의 1 USD 크레딧 평가는 텍스트 모델 전용이다. [공식 요금표](https://developers.openai.com/api/docs/pricing) · [이미지 출력 비용 계산기](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs) · [저장소 텍스트 평가 예산](../../scripts/studio-openai-credit-evaluation-core.ts)

**실측 판정.** 실행 담당자가 직접 받은 HTTP 상태와 요청 ID를 기록한다. 성공 조건은 2xx, `data` 배열 길이 1, `data[0].b64_json`을 디코딩한 PNG의 실제 크기 1024×1024다. 이미지를 열어 흰 바탕과 중앙의 검은 원을 확인한다. 응답의 `usage`가 있으면 보관하고 예상 비용과 프로젝트 청구액을 구분한다. 결과가 불명확하면 해당 상태로 기록한다. 아래 테스트는 로컬 PNG를 돌려주는 모의 응답을 사용한다. [요청 본문·PNG 테스트](../../apps/web/src/domains/creator/ai/studio-ai-openai-image.test.ts)

## 2026-11-26 실제 공급자 확인
별도의 책정·잠금이 적용된 합성 배경 사례에서 Flare를 요청해 HTTP 200, 1024×1024 PNG 한 장과 사용량 871토큰(텍스트 입력 47, 이미지 출력 824)을 받았습니다. 직접 확인한 이미지의 왼쪽에는 빨간 의자 하나, 오른쪽에는 파란 정사각 창 하나가 있고 사람이나 글자는 없습니다. 요청에는 low 렌더링 품질과 low 복잡도를 지정했습니다. 응답에 모델명이 없어 요청 모델과 응답 모델을 별도로 표시합니다. 공개 단가의 계산값은 $0.024955이며 실제 청구액은 미확인입니다. 이는 직접 공급자 시험으로, 앱 UI의 캔버스 반영·저장·재열기 통과로 세지 않습니다.
