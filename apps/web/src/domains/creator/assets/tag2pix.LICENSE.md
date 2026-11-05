# Tag2Pix 모델 자산 고지

- 파일: `tag2pix.onnx` (79,269,994 bytes)
- SHA-256: `ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc`
- 모델: Tag2Pix — Kim et al., "Tag2Pix: Line Art Colorization Using Text
  Tag With SECat and Changing Loss", ICCV 2019. 선화 + 색 태그 조건 채색용.
- 권리 상태: **배포 가중치의 비상업 조건 및 재배포 제한 확인** (2026-11-05).
  원본 프로젝트 https://github.com/blandocs/Tag2Pix#license 는 학습·시험 코드는
  MIT로 제공하지만 release의 학습 가중치·네트워크 덤프 `model.pth`와
  `tag2pix_512.pkl`는 비상업 목적이며 재배포를 명시적으로 제한한다.
  이 ONNX 파일은 아래 두 자산의 변환본이므로 코드의 MIT 고지만으로 상용 이용과
  재배포가 허용된다고 판단할 수 없다. 별도 허가서는 확인하지 못했다.
  기능을 유지하는 동등 대체가 검증될 때까지 파일을 보존하며, 현재 상용 배포
  가능 또는 문제 해결 완료를 뜻하지 않는다.
- 이 파일은 원본 가중치 2종(생성망 `tag2pix_512.pkl`, 특징 추출망
  `model.pth` — SEResNeXt-Half)을 하나의 ONNX 그래프로 직접 변환한 것으로,
  가중치 값은 원본과 동일하다. 소스 자산 SHA-256:
  - `tag2pix_512.pkl`: `f929bba53e16992097fff82d2a42fbb7bc611d6170b6cac81b37bf940340cf59`
  - `model.pth`: `e59efdfa6e4fe883acfb3fe7e5a6abd0da6363554d67fe8f526e143d64a960df`
  변환 시 생성망 state_dict 전량(누락·초과 0)과 특징망 384/384 텐서가
  바인딩됨을 확인했다. 변환은 위 원본 가중치의 이용·재배포 제한을 해소하지 않는다.
- 학습 데이터: Danbooru2017 일러스트 (저자 논문·저장소 명시). 모델 출력의
  색감 경향(옅은 파스텔)이 이 학습 분포를 따른다.
- 텐서 계약: 입력 `line` float32 `[1,1,512,512]` (흑백 선화, 흰 배경·검은
  선, 0..1), 입력 `tags` float32 `[1,115]` (색 태그 다중핫, 어휘 순서는
  `studio-onnx-tag2pix.ts`의 `STUDIO_TAG2PIX_TAG_NAMES`가 정본), 출력
  `color` float32 `[1,3,512,512]` (tanh 범위 -1..1).
- 런타임: onnxruntime-web (MIT License, Microsoft).
