# AnimeGANv2 Paprika 모델 자산 고지

- 파일: `animegan2-paprika.onnx` (8,702,673 bytes)
- SHA-256: `7cb5bf08d7778a8f4e25f1e654fdc24d56dc9b6cbb9c1db42e4f9d0425e7fe62`
- 모델: AnimeGANv2 생성망의 Paprika 스타일 가중치 — 사진·스케치·기존 컷을
  극장 애니메이션풍(굵은 색면, 단순화된 음영)으로 변환하는 스타일 변환망.
  Paprika 스타일은 풍경·컷 전반 변환용으로, 인물 얼굴 전용 변환은
  `animegan2-face-paint-512-v2.onnx`가 맡는다.
- 권리 상태: **상용 이용 권한 미확인 — 고위험 검토 항목** (2026-11-05).
  PyTorch 구현의 MIT 라이선스만으로 변환된 원본 체크포인트의 상용 권한을
  확정할 수 없다. 원본 TensorFlow 저장소는 별도 LICENSE 파일 유무와 무관하게
  README의 License 절에서 비상업 목적 이용과 상업 이용 시 별도 허가를 명시한다.
  - 원본 조건: https://github.com/TachibanaYoshino/AnimeGANv2#license
  - 변환 경위: https://github.com/bryandlee/animegan2-pytorch#weight-conversion-from-the-original-repo-tensorflow
  - PyTorch 구현 라이선스: https://github.com/bryandlee/animegan2-pytorch/blob/main/LICENSE
  이 저장소에서 해당 Paprika 가중치의 별도 상용 허가서는 확인하지 못했다.
  ONNX 변환은 원본 조건을 해소하는 근거가 아니다. 학습 자료는 원본 README상
  영화 "파프리카"(2006)의 BD 프레임 1,284장이며, 데이터 권리도 별도 검토 대상이다.
  사용자가 요구한 대체 구현 검증 전 제거 금지 순서에 따라 파일과 동작은 보존했다.
  상용 배포 가능 판정 또는 동등 대체 완료를 의미하지 않는다.
- 이 파일은 위 PyTorch 배포본의 체크포인트 `weights/paprika.pt`
  (8,603,556 bytes, SHA-256
  `3eaba1b6d01e88ea32b16a6006b04eb3f60327c1dcc841de640d3196898da344`)를
  직접 ONNX 변환한 것으로, 가중치 값은 원본과 동일하다(state_dict
  누락·초과 0으로 로드 검증, 자연 이미지형 합성 입력에서 PyTorch 참조
  출력과 최대 절대 오차 2.9e-4 — 8비트 1단계 3.9e-3 미만). 변환 자체는
  추가 조건을 부과하지 않는다.
- 텐서 계약: 입력 `image` float32 `[1,3,512,512]` (RGB, -1..1 —
  공식 `face2paint` 전처리와 동일한 정규화), 출력 `anime` float32
  `[1,3,512,512]` (tanh 범위 -1..1). 입력 해상도는 원본 생성망의
  전결합 없는 구조와 달리 이 배포에서는 제공자(provider)의 고정
  차원 계약에 맞춰 512×512로 고정했다.
- 런타임: onnxruntime-web (MIT License, Microsoft).
