# 제품 투어 내레이션 음성 권리 판정

- 판정일: 2026-10-14
- 출처 항목: 라이선스 감사 REPORT 문제 8 (등급 D → 본 판정으로 확정)
- 판정: **상업 배포 불가 (not cleared)** — 교체 필요

## 대상 파일

| 파일 | 내용 |
| --- | --- |
| `apps/web/public/brand/product-tour/toonstudio-product-tour-narration.ko.m4a` | 공개 서빙 중인 한국어 내레이션 (504초, 1,701,572 bytes) |
| `tools/media/brand-film/audio/toonstudio-product-tour-narration.ko.m4a` | 동일 파일의 원본 사본 (SHA-256 동일) |
| `apps/web/public/brand/product-tour/product-tour-audio.json` | 런타임 매니페스트 — 음성 출처를 기록 |
| `tools/media/brand-film/audio/product-tour-narration.json` 외 1건 | 생성 스펙·메타데이터 |

두 오디오 파일의 SHA-256은 `6033fd24b93ab2bead9b9fcdcbf6138ab5f31ee2d308f46bbf001350d2384e79`로
매니페스트 기록과 일치한다(2026-10-14 main 기준 실측). BGM은 자체 작곡 OST
크로스페이드라 이 판정의 대상이 아니다(감사 문제 4.1에서 A 확정).

## 현재 음성의 출처

매니페스트와 메타데이터가 스스로 기록하고 있듯, 현재 내레이션은 macOS speech
synthesis의 시스템 음성 "Yuna"(ko-KR, rate 185)로 `tools/media/brand-film/
generate-product-tour-narration.mjs`가 `/usr/bin/say`를 호출해 생성했다.
합성 음성 고지(disclosure)는 이미 포함돼 있으나, 고지는 권리를 만들지 않는다.

## 근거 — Apple macOS 라이선스

Apple의 macOS Software License Agreement(Sonoma 기준, §2F "Voices; Live
Captions")는 시스템 음성 사용을 개인적·비상업적 용도로 한정한다. 요지는 다음과
같다(원문은 아래 출처에서 직접 확인).

- 시스템 음성은 소프트웨어 실행 중 사용하거나, 본인의 오리지널 콘텐츠를
  **개인적·비상업적 용도**로 만드는 데만 쓸 수 있다.
- 그 외의 사용, 특히 영리·비영리·공개 공유·상업적 맥락에서의 사용·녹음·게시·
  재배포는 라이선스가 허용하지 않는다.

ToonStudio 제품 투어는 상업 운영을 전제로 한 공개 마케팅·제품 화면이며, 웹에서
누구나 재생·전송받을 수 있는 형태로 내레이션을 배포한다. 이는 위 조항이 명시적
으로 제외하는 "공개 공유·상업적 맥락의 게시·재배포"에 해당한다. 별도 서면
라이선스를 Apple로부터 받지 않는 한, 현재 파일의 상업 배포 근거는 **없다**고
확정한다. "불명확"이 아니라 "허용 범위 밖"이 판정이다.

## 조치 (이 판정과 함께 반영된 것)

1. 기계 판독 가능한 권리 표기: 스펙·메타데이터·공개 매니페스트·생성 모듈
   (`product-tour-audio.generated.ts`)의 `narration`에 `rights` 블록
   (`status: "not-cleared"`, `commercialDistribution: false`, 근거·본 문서
   경로·교체 방법)을 추가했다. 런타임 재생 동작은 바꾸지 않는다(추가 필드만).
2. 재생성 차단: `generate-product-tour-narration.mjs`는 스펙의 `rights.status`가
   `not-cleared`인 동안 재생성을 거부한다(`--check`는 계속 동작). 같은 위반이
   무심코 재발하지 않게 하기 위한 가드다.
3. 교체 파이프라인: `tools/media/brand-film/assemble-product-tour-narration.mjs`
   (신규). 권리가 확보된 소스로 만든 큐 파일(`cue-01.wav` …)을 기존과 동일한
   타임라인·믹스·라우드니스(-16 LUFS)로 조립해 같은 출력 경로에 쓰고, 자막과
   메타데이터를 재생성한다. `rights.status`가 `cleared`가 아니거나 음성이
   macOS 시스템 음성이면 조립을 거부한다.

## 교체 음원 — 채택안

### 1안 (채택): MeloTTS-Korean — MIT

- `myshell-ai/MeloTTS-Korean` 모델 카드가 MIT 라이선스와 "상업·비상업 모두
  무료"임을 명시한다. 한국어 화자 `KR` 1종, CPU 실시간 추론이라 비용 없이
  로컬 생성 가능.
- 절차: 큐별 텍스트(스펙 `cues[].ko`, 27개)를 MeloTTS로 합성해
  `cue-NN.wav`로 저장 → 위 조립 스크립트에
  `audio/replacement-voice.example.json`·`audio/replacement-rights.example.json`
  을 실제 사용 버전으로 채운 voice/rights 기록과 함께 실행 → 런타임 생성기
  (`generate-product-tour-runtime-audio.mjs`)로 매니페스트·모듈 갱신 → 스펙의
  `voice`·`rights`를 새 기록으로 교체.
- 주의: 큐 길이 제한은 기존과 동일(다음 큐 시작 − 0.7초). 초과 큐는 속도를
  올려 재합성한다. 생성에 쓴 모델 리비전·해시를 메타데이터에 남긴다.

### 2안 (대안): 권리자 본인 또는 성우의 직접 녹음

- 운영자 본인 목소리, 또는 상업 이용·재배포를 서면으로 허락한 성우의 녹음은
  권리가 가장 명확하다. 같은 큐 단위로 녹음해 동일 조립 스크립트를 쓴다.
  성우를 쓸 경우 허락 문서를 이 폴더에 함께 보관한다.

### 검토 후 제외한 후보

- Kokoro-82M (Apache-2.0): 라이선스는 적합하나 공식 v1.0 음성 목록
  (VOICES.md)에 한국어 음성이 없어 한국어 내레이션을 만들 수 없다.
- Microsoft Edge TTS 등 무단 API 경유 합성: 재배포를 허용하는 근거 약관을
  확인하지 못해 제외.
- 클라우드 유료 TTS(ElevenLabs 유료 플랜 등): 상업 권리가 붙는 플랜이 있으나
  비용 원칙상 사용자 승인 없이 채택하지 않는다.

## 남은 리스크

- 이 판정 문서와 표기가 들어가도, **교체 음원이 실제로 생성·배포되기 전까지
  현재 Yuna 파일은 여전히 권리 미확보 상태**다. 상업 공개 전에 1안 또는 2안
  으로 교체하는 것이 이 항목의 후속 실행 과제다. 교체 전까지의 공개 유지
  여부는 사업 판단으로 별도 결정할 것.
- Apple 약관은 macOS 버전마다 갱신될 수 있다. 인용 조항은 Sonoma SLA §2F
  기준이며, 최신 macOS SLA에서도 같은 취지의 조항이 유지됨을 판정 시점에
  확인했다. Apple로부터 별도 라이선스를 취득하면 그 서면을 이 문서에 첨부하고
  `rights` 블록을 갱신한다.

## 출처

- Apple, Software License Agreement for macOS Sonoma, §2F —
  https://www.apple.com/legal/sla/docs/macOSSonoma.pdf
- MeloTTS-Korean 모델 카드 (MIT, 상업 이용 명시) —
  https://huggingface.co/myshell-ai/MeloTTS-Korean
- Kokoro-82M 공식 음성 목록 (한국어 음성 없음) —
  https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- 레포 내 근거: `apps/web/public/brand/product-tour/product-tour-audio.json`,
  `tools/media/brand-film/audio/toonstudio-product-tour-narration.ko.json`

## 2026-10-21 교체 실행 — 표준 음성(Helio) 채택

- 실행일: 2026-10-21
- 경위: 서비스 소유자가 같은 날 IR 발표 플레이어(아티팩트 `toonstudio`) 내레이션에
  쓰인 음성을 표준 음성으로 지정하고, 제품 투어를 포함한 홍보 영상 전반에 같은
  음성을 쓰도록 지시했다. 위 "교체 음원 — 채택안"의 1안(MeloTTS-Korean)은 이
  지시로 대체한다.
- 새 음성: Meta AI 음성 "Helio"(voiceId `avocado_v2:MAI_03`). 소유자의 Muse
  음성 합성 파이프라인(`tts speak --language ko`)으로 큐별 합성했다. 속도 100을
  기본으로 하고, 창(다음 큐 시작 − 0.7초)을 넘는 큐만 속도를 올려 재합성했다.
- 함께 바뀐 것: 투어 개정(558초·챕터 10개·내레이션 큐 30개)에 맞춰 전체 큐를 새
  음성으로 통일했다. 스펙·메타데이터·공개 매니페스트의 `voice`·`rights`를 새
  기록으로 교체했고, `rights.status`는 소유자 지시를 근거로 `cleared`로
  표기한다. 위 본문의 판정과 대상 파일 표(504초·구 SHA-256)는 교체 전 Yuna
  파일에 대한 2026-10-14 시점 기록으로 남긴다.
- 주의: 이 표기의 근거는 제3자 라이선스 문서가 아니라 서비스 소유자의 지정·
  지시이다. 합성 파이프라인의 제공 조건이 바뀌면 이 판정을 다시 검토한다.
