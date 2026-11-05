# AnimeGANv2 Face Paint 512 v2 모델 자산 고지

- 파일: `animegan2-face-paint-512-v2.onnx` (8,702,673 bytes)
- SHA-256: `54ce55c73dc974c24fa55cf1204577a6181c7e86d312a3a07f798bbbd99d4ee2`
- 모델: AnimeGANv2 생성망의 Face Paint 512 v2 가중치 — 실사 인물
  사진을 애니메이션풍 얼굴로 변환하도록 학습된 스타일 변환망. 풍경·컷
  전반 변환은 `animegan2-paprika.onnx`가 맡고, 이 모델은 인물
  중심 컷용이다.
- 배포 프로젝트: https://github.com/bryandlee/animegan2-pytorch
  - 고정 commit: `25d7b017267208dfaf34026aa3425e518372aa2f`
  - 선언 라이선스: **MIT (repository checkpoint)**, Copyright (c) 2021 Bryan Lee.
  - 권리 상태: **declared-permissive**, 학습 출처는 일부 확인·추가 검토 상태(2026-11-05).
  저자 관리 저장소에서 아래 실제 체크포인트를 root MIT LICENSE와 함께 추적하며,
  공식 hubconf.py가 이를 기본 모델로 제공한다. 따라서 저장소의 MIT가 해당 체크포인트에도
  적용된다는 합리적 근거가 있다. 개별 파일의 별도 라이선스 부재를 무허가 근거로 삼지 않는다.
  이는 저장소 배포 범위에 근거한 분류이며 모든 학습 데이터·제3자 권리의 해결을 보증하지 않는다.
  이 모델에 대한 별도 비상업 조건은 확인하지 못했으며, 변환 가중치 Paprika의 조건을 자동 적용하지 않는다.
  - 고정 모델 설명: https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/README.md#additional-model-weights
  - 고정 라이선스: https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/LICENSE
  - 고정 체크포인트: https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/weights/face_paint_512_v2.pt
- 학습·업로드 출처의 구별:
  repository OWNER `bryandlee`는 Face Portrait v1/v2가 private dataset으로 학습됐으며
  얼굴은 FFHQ-trained StyleGAN2에서 생성했다고 설명했다.
  https://github.com/bryandlee/animegan2-pytorch/issues/30#issuecomment-982134241
  저자는 별도 얼굴 모델의 pix2pix·network blending 절차도 설명했으나,
  v1에서 시작한 이 스레드를 exact v2 전체 학습 계보로 일반화하지 않는다.
  https://github.com/bryandlee/animegan2-pytorch/issues/3#issuecomment-931984741
  Git의 체크포인트 추가 commit `f9b71ce9e53fa125c57434ea87780cbdab1c86d5`의 author 이름은
  `xhlulu`이고 메시지는 `Add weights from gdrive`다. 이 업로드를 저자 본인의 학습 발언과 혼동하지 않는다.
  당시 root MIT LICENSE도 현재와 동일하다. exact v2의 private 자료와 teacher checkpoint·생성물 조건은
  완전히 재현되지 않았으며, 이 공백만으로 FacePaint나 그 출력이 자동 비상업이라고 단정하지 않는다.
  후속 증거: `docs/evidence/commercial-model-rights-2026-11-05/facepaint-rights.json`.
- 이 파일은 위 PyTorch 배포본의 체크포인트
  `weights/face_paint_512_v2.pt` (8,601,086 bytes, SHA-256
  `06b88a204eb230889444ad868ee5608f4fce5d4ff7b7738acaa4209c2b8fdca7`)를
  직접 ONNX 변환한 것으로, 가중치 값은 원본과 동일하다(state_dict
  누락·초과 0으로 로드 검증, 자연 이미지형 합성 입력에서 PyTorch 참조
  출력과 최대 절대 오차 2.3e-3 — 8비트 1단계 3.9e-3 미만). 변환 자체는
  추가 조건을 부과하지 않는다.
- 텐서 계약: 입력 `image` float32 `[1,3,512,512]` (RGB, -1..1 —
  공식 `face2paint` 전처리와 동일한 정규화), 출력 `anime` float32
  `[1,3,512,512]` (tanh 범위 -1..1). 입력 해상도는 제공자(provider)의
  고정 차원 계약에 맞춰 512×512로 고정했다.
- 런타임: onnxruntime-web (MIT License, Microsoft).
