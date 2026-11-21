# IR 발표 내레이션

## 2026-11-21 상태

`narration.ko.json`에 웹 발표와 같은 순서의 한국어 대본 24개를 작성했다.
대본은 3,717자이며, 실제 렌더링한 각 장면과 관련 소스 7개 파일의 해시로 검토 시점을 고정한다.
기본 화면에 표시되지 않는 파이프라인 탭 문안도 소스 파일 해시로 확인한다.
제품 투어 9분 18초·10개 챕터, CH4·CH6의 개념 도해, AI 5:54·협업 6:48,
개인 Pro 예시 가격과 팀 가격 미정, 전문가·제작팀부터의 고객 검증을 반영했다.

**대본 준비는 완료했지만 새 음원은 생성하지 못했다.** 기존 `n01.mp3`~`n24.mp3`는
검증 완료로 바꾸지 않았으며 플레이어에서도 로드하지 않는다. 현재 연결 도구에
기존 Muse 합성 파이프라인이 없고, Desktop Commander의 연결된 Mac은 오프라인이다.
브라우저 내장 음성이나 다른 TTS로 표준 음성을 바꾸지 않았다.

표준 음성은 Meta AI **Helio**, `avocado_v2:MAI_03`, 한국어다. 지정 근거는
[`VOICE-RIGHTS.md`의 2026-10-21 교체 기록](../../../apps/web/public/brand/product-tour/VOICE-RIGHTS.md#2026-10-21-교체-실행--표준-음성helio-채택)이다.
이 기록은 소유자 지정에 관한 것이며 공급자의 현재 이용 조건과 요금 확인을 대신하지 않는다.

## 대본 확인과 내보내기

저장소 루트에서 실행한다. 어느 명령도 합성 API를 호출하거나 과금을 발생시키지 않는다.

```sh
node --import tsx scripts/prepare-ir-present-narration.mts --check-script
node --import tsx scripts/prepare-ir-present-narration.mts --export /tmp/toonstudio-ir-narration
```

내보내기는 `n01.txt`~`n24.txt`와 `receipt.template.json`을 만든다. 템플릿의
미확인 항목은 빈 값·false로 남는다. 이를 생성·검수 완료 증빙으로 사용하면 검증에 실패한다.
`--check-script` 성공은 화면과 대본의 정합성만 뜻하며, 음원 상태도 별도로 출력한다.

화면 문안이 바뀌면 검사에 실패한다. 변경 내용을 대본에 반영하고 확인한 뒤 다음 명령으로
새 화면 해시를 기록한다. 원래 음원 증빙은 새 화면·대본 해시와 일치해야 다시 사용할 수 있다.

```sh
node --import tsx scripts/prepare-ir-present-narration.mts --refresh-source
```

## 표준 음성 생성 연결이 복구되면

1. 기존 Muse 음성 도구의 현재 사용법과 Helio·한국어 지원, 추가 요금 없는 실행 범위를 확인한다.
   과거 명령을 추측해 실행하거나 유료 플랜으로 전환하지 않는다.
2. 내보낸 24개 대본을 그대로 합성한다. 새 음성 파일은 별도 입력 폴더에 모은다.
3. 실행자가 각 파일을 청취해 숫자·고유명사·누락·장면 일치를 확인한다. 공급자 생성 기록과
   입력 파일 SHA-256, 검수자·시각, 현재 이용 조건과 추가 요금 확인 근거를 수령 템플릿에 기록한다.
   이는 실제 확인 결과를 적는 절차이며 사용자에게 별도 승인을 요청하는 단계가 아니다.
   토큰·API 키·서명된 다운로드 URL은 증빙에 넣지 않는다.
4. 아래 읽기 전용 검사 후 조립한다. 원본 증빙은 입력 경로에 보존한다.

```sh
node --import tsx scripts/prepare-ir-present-narration.mts --receipt /tmp/ir-receipt.json --input-dir /tmp/ir-clips --dry-run
node --import tsx scripts/prepare-ir-present-narration.mts --receipt /tmp/ir-receipt.json --input-dir /tmp/ir-clips
node --import tsx scripts/prepare-ir-present-narration.mts --check
```

조립은 대본·화면·음원 해시와 24개 장면 순서, 표준 음성 및 검수 기록을 확인한다.
FFprobe로 길이와 스트림을 검사하고 FFmpeg로 전체 디코딩한 뒤, 모노 48kHz·96kbps MP3와
-16 LUFS 기준으로 정규화한다. 모든 파일 처리가 끝난 뒤에만 런타임 상태를 `verified`로 쓴다.
공개 매니페스트에는 원본 수령 증빙의 해시를 남기고, 개인정보·공급자 기록 원문은 복사하지 않는다.
플레이어는 음원 SHA-256을 URL에 포함해 이전 MP3 캐시와 구분한다.

조립 후 관련 테스트와 실제 브라우저 재생을 확인한다. `--check`는 실제 설치 음원 24개가
현재 화면과 대본에 맞을 때만 통과한다. 음원이 없는 현재 상태에서는 실패하는 것이 맞다.

```sh
pnpm exec vitest run scripts/prepare-ir-present-narration.test.ts apps/web/src/domains/marketing/IrPresentPage.test.tsx
```

## 대체 음성 조사 기록

기존 표준 음성 연결을 기다리는 동안 유료 TTS를 호출하거나 음성을 임의로 변경하지 않았다.
MeloTTS-Korean의 공식 모델 카드는 MIT를 표시하지만, 한국어 인코더가 사용하는
`kykim/bert-kor-base`의 원저자 LMkor README는 상업 사용 시 무료 MOU 절차를 안내한다.
따라서 모델 카드의 MIT 표기만으로 대체 음원을 생성·배포하지 않았다.

- [MeloTTS-Korean 공식 모델 카드](https://huggingface.co/myshell-ai/MeloTTS-Korean)
- [MeloTTS 한국어 인코더 소스](https://github.com/myshell-ai/MeloTTS/blob/main/melo/text/korean_bert.py)
- [LMkor 원저자 사용 안내](https://github.com/kiyoungkim1/LMkor)
