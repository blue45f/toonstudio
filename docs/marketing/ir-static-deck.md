# 정적 IR 발표자료 재생성

상태: **current** · 문안 기준일: **2026-11-21**

정적 발표자료는 웹 발표(`/ir/present`)와 같은 24개 주제·순서의 검토본이다.
PPTX는 이미지 한 장으로 고정한 과거 30장 덱을 교체하여 텍스트와 도형을 편집할 수 있게 만들었다.
PDF는 같은 PPTX에서 변환하며, 멘토 전달·기관 제출·운영 배포·고객 실증 완료를 뜻하지 않는다.

## 권위와 입력

- 제목·장면 순서: `ir-present-scene-data.ts`, `ir-present-scenes-a.tsx`, `ir-present-scenes-b.tsx`.
- 기능·사업모델·고객 검증 계획: `ir-pitch-data.ts`의 공유 데이터.
- 투어 길이·10개 챕터·시작 시간·개념 도해 구분: `product-tour-content.ts`.
- 발표자 노트: `tools/media/ir-present/narration.ko.json`의 24개 최신 대본. 노트가 있다고 음원 재생성을 뜻하지 않는다.
- 제품 이미지는 기존 투어 촬영 시점의 캡처다. 기준일에 새로 촬영한 화면이라고 표시하지 않는다.
- 국내 시장은 기존 웹 발표의 2024년 실적·2025년 조사 인용이며, 글로벌 수치는 과거 기관별 2030년 전망이다. 현재 점유율이나 확정 성과로 바꾸지 않는다.

공유 문안과 자료 기준일은 TypeScript에서 직접 읽는다. 덱에 맞춘 요약 설명·배치는
`scripts/generate-ir-deck.py`가 소유한다. 시장·경쟁 분석의 새로운 근거가 확보되면 웹 정본과
요약 설명을 함께 검토한 후 재생성한다.

## 생성과 읽기 전용 검사

저장소 루트에서 실행한다. Node와 설치된 `tsx`, Python의 `python-pptx`·`lxml`·`PyMuPDF`,
LibreOffice, `Noto Sans CJK KR` 글꼴이 필요하다. 외부 생성 API·유료 서비스는 사용하지 않는다.

```bash
python scripts/generate-ir-deck.py
python scripts/generate-ir-deck.py --check
python scripts/generate-ir-deck.test.py
pnpm exec vitest run scripts/ir-static-deck.test.ts
```

생성은 임시 디렉터리에서 PPTX와 PDF 변환이 모두 성공한 뒤 기존 두 자산을 교체한다.
`--output-dir <경로>`로 검토용 출력을 만들 수 있다. `--check`는 기존 산출물을 수정하지 않는다.

출력은 `apps/web/public/brand/toonstudio-ir-deck.pptx`, `.pdf`, `.manifest.json`이다.
Manifest에는 입력 파일·이미지·대본과 두 산출물의 SHA-256, 24장 수, 558초 투어 및 개념 도해
챕터를 기록한다. 입력이 바뀌거나 산출물 해시가 다르면 검사에서 실패한다.

## 확인 범위

검사기는 웹과 덱의 장면 순서, 24개 발표자 노트, PDF 텍스트 누락, 과거 수량·일정 문구,
10개 PDF 챕터 링크, 도형 경계를 확인한다. 배치 변경 후에는 PDF를 렌더링하여
한글 줄바꿈·텍스트 넘침·링크 대비도 시각적으로 확인한다.

일반 CI에서는 `scripts/ir-static-deck.test.ts`가 Python·LibreOffice 없이 실제 추적 파일의
입력·출력 SHA-256, 두 파일의 실제 24장 수, 현재 웹 정본의 기준일·상태·투어 구성을 확인한다.
이 시험과 내레이션 계약 시험은 core 필수 Vitest 목록에 등록되어 있다.

생성 실패 시 기존 자산을 배포하지 않고 오류를 해결해 재생성한다. 생성·검증 이후의
Git 병합과 운영 반영은 저장소 배포 정책과 필수 검증을 별도로 따른다.

## 2026-11-22 최신 기술·라이선스·경쟁 비교 보강 문서

- `2026-11-21` 정적 24장 발표자료 이후 반영된 WebGPU 7밴드 분광 안료, Wasm64 동적 3D 한도, Knuth-Plass 타원 식자, 1인 기업 상용화 라이선스 감사(`mixbox` 제거·Rapier Apache-2.0), 베타 ₩0 하이브리드 인프라 및 경쟁 도구 7종 비교(`/about/compare`) 근거는 [ToonStudio IR · 제품 기술 현황 브리프 (2026-11-22)](../ir/toonstudio-ir-brief-20261122.md)에서 관리한다.

