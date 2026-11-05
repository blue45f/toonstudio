# Face Paint 512 v2 권리·출처 후속 확인

상태: **current / 1차 출처 확인, runtime·모델·기존 고지 변경 없음**.
기준 HEAD: `8d315c85d6fde4a3a30255612c756d3e299a95b0`, 확인일: 2026-11-05.

Face Paint v2를 Paprika와 같은 비상업 변환 가중치로 분류할 근거는 확인하지 못했다.
저자 관리 저장소에 실제 체크포인트가 MIT LICENSE와 함께 추적되고, 공식 로더가 이 파일을
기본 모델로 제공하므로 **저장소 MIT가 해당 가중치에도 적용된다는 추론은 상당한 근거가 있다**.
파일마다 별도 라이선스가 없다는 이유만으로 무허가로 취급할 필요는 없다.
다만 아래 private 학습 자료·teacher 모델의 정확한 계보는 부분 확인 상태다.
이는 확정된 FacePaint 비상업 조건과 구별해야 하며, 모든 제3자 권리를 해결했다는 법률 판단도 아니다.

구조화 증거는 [facepaint-rights.json](../evidence/commercial-model-rights-2026-11-05/facepaint-rights.json)에
있다. 모델 파일은 삭제·교체하지 않았고, restricted 모델의 학습·증류나 외부 연락도 하지 않았다.

## 정확한 체크포인트와 로컬 자산

| 항목 | 확인값 |
| --- | --- |
| 저자 관리 upstream | `bryandlee/animegan2-pytorch` |
| 고정 commit | `25d7b017267208dfaf34026aa3425e518372aa2f` |
| 체크포인트 | `weights/face_paint_512_v2.pt`, 8,601,086 bytes |
| 체크포인트 SHA-256 | `06b88a204eb230889444ad868ee5608f4fce5d4ff7b7738acaa4209c2b8fdca7` |
| 체크포인트 Git blob SHA-1 | `d75102f8f201ddaf8dbe6b913b1a97585b55f838` — 실제 받은 바이트에서 검증 |
| 로컬 ONNX | `apps/web/src/domains/creator/assets/animegan2-face-paint-512-v2.onnx`, 8,702,673 bytes |
| 로컬 ONNX SHA-256 | `54ce55c73dc974c24fa55cf1204577a6181c7e86d312a3a07f798bbbd99d4ee2` |
| MIT LICENSE SHA-256 | `0722b5505349ac7ccc5a446da532e81f0962a07a671c6cc1f2f38a4a09c80c45` |

[고정 체크포인트](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/weights/face_paint_512_v2.pt)는
Git LFS pointer가 아니라 실제 바이너리다. 공개 체크포인트를 `/tmp`로 받아 해시만 계산했다.
PyTorch ZIP의 79개 entry 이름만 확인했으며 pickle을 실행하거나 inference를 하지 않았다.
ZIP 내부 별도 LICENSE/model card는 없지만 그것이 저장소 LICENSE를 무효화하지는 않는다.

체크포인트는 [f9b71ce9의 Add weights from gdrive](https://github.com/bryandlee/animegan2-pytorch/commit/f9b71ce9e53fa125c57434ea87780cbdab1c86d5)에서
추가됐다. Git author 이름은 `xhlulu`, GitHub author 연결은 null이다. 이를 저자 본인의 직접 업로드라고
표현하지 않는다. 해당 시점에도 현재와 동일한 root MIT LICENSE가 있었다.
[고정 공식 hubconf](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/hubconf.py)는
저장소의 weights URL을 사용하고 `face_paint_512_v2`를 기본값으로 선택한다.

로컬 ONNX의 top-level metadata는 producer `pytorch`, version `2.14.1`, 빈 metadata_props다.
추가 권리 조건 또는 별도 weight grant를 담은 model card는 발견하지 못했다. 기존 로컬 고지의 원본
체크포인트 해시와 이번 upstream 바이트 해시는 일치한다. 다만 기존 변환 기록의 numerical parity는
이번 작업에서 새로 재현하지 않았다.

## 저자 발언과 권리 판단의 범위

[고정 README](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/README.md)는
TensorFlow에서 변환한 Paprika와 Additional Model Weights의 Face Portrait v2를 구별한다.
[root LICENSE](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/LICENSE)는
Bryan Lee의 MIT로, 고지 보존 조건 아래 사용·복제·수정·배포·판매 권한을 부여한다.
README/LICENSE/hubconf와 조회한 저자 댓글에서 FacePaint v2 가중치를 제외하는 조항은 확인하지 못했다.
이 co-distribution은 가중치에 대한 MIT 적용을 뒷받침하는 근거다. 다만 exact 체크포인트를 명명하며
별도로 권리를 부여하는 저자 문장을 찾았다는 주장과는 구별한다.

실제 repository OWNER인 `bryandlee`의 발언을 확인했다.

- [issue #30의 저자 답변](https://github.com/bryandlee/animegan2-pytorch/issues/30#issuecomment-982134241)은
  Face Portrait v1/v2 질문에 private dataset과 FFHQ-trained StyleGAN2에서 생성한 얼굴의 사용을 설명한다.
- [issue #3의 저자 답변](https://github.com/bryandlee/animegan2-pytorch/issues/3#issuecomment-890972600)은
  pix2pix 방식과 LPIPS/L2/GAN 학습을 설명하며,
  [후속 답변](https://github.com/bryandlee/animegan2-pytorch/issues/3#issuecomment-931984741)은
  공식 StyleGAN2-ADA PyTorch 모델을 연결하고 network blending과 segmentation으로 target을 만드는
  절차를 설명한다. v1 질문에서 시작한 스레드이므로 exact v2의 모든 학습 세부사항으로 일반화하지 않는다.
- [issue #25의 MIT weights 주장](https://github.com/bryandlee/animegan2-pytorch/issues/25#issuecomment-973645233)은
  `dressedanonymous`라는 사용자의 해석이다. `bryandlee`의 권리 부여가 아니다. GitHub UI의
  `Author`는 issue 작성자이고 repository `Owner`와 다르다.

## NVIDIA·FFHQ 조건과 자동 전파 추론의 구별

[StyleGAN2의 고정 LICENSE](https://github.com/NVlabs/stylegan2/blob/bf0fe0baba9fc7039eae0cac575c1778be1ce3e3/LICENSE.txt)와
[StyleGAN2-ADA PyTorch의 고정 LICENSE](https://github.com/NVlabs/stylegan2-ada-pytorch/blob/d72cc7d041b42ec8e806021a205ed9349f87c6a4/LICENSE.txt)는
각 Work 및 derivative works에 연구·평가 목적의 비상업 제한을 둔다. 각 공식 README는 라이선스를
안내하면서 pretrained networks를 제공한다. 따라서 teacher의 exact checkpoint·버전·별도 허가가
누락된 학습 계보는 확인할 가치가 있다.

그러나 읽은 두 LICENSE와 README에는 **생성 이미지 자체 또는 그 이미지로 학습한 별도 모델에 관한
명시적 output-license clause를 찾지 못했다**. downstream 모델이 Work의 derivative에 해당하는지와
생성 데이터에 어떤 권리가 적용되는지는 별도 문제다. 이 자료만으로 FacePaint의 가중치·출력까지
자동으로 비상업이라고 단정하지 않는다.

[FFHQ의 고정 라이선스 설명](https://github.com/NVlabs/ffhq-dataset/blob/4826aa6ea77aa7f1a7802b938ed7c40afb985cda/README.md#licenses)은
개별 이미지의 CC-BY 2.0·CC-BY-NC 2.0·Public Domain/CC0·U.S. Government 조건과,
dataset JSON metadata·download script·documentation의 CC-BY-NC-SA 4.0을 구분한다.
모든 개별 이미지가 동일한 BY-NC-SA라고 하거나, FacePaint가 FFHQ 원본 사진을 직접 재배포한다고
주장하지 않는다. 공개 저자 발언은 FFHQ-trained 모델의 생성 얼굴을 사용했다고만 고정한다.

## 대안의 실제 상태와 다음 단계

| 후보 | 권리·기능 상태 | 판단 |
| --- | --- | --- |
| 현 FacePaint v2 유지 | 저자 관리 repo의 실제 체크포인트·MIT co-distribution 확인, 현재 기능·품질 유지 | 가장 낮은 기술 변경 위험. confirmed NC 목록과 구별하고 MIT 범위 추론 및 provenance 공백을 명시 |
| [Photo2Cartoon](https://github.com/minivision-ai/photo2cartoon) | MIT repo와 ONNX 공개 경로가 있으나 공식 README는 인터넷 수집 학습 자료, 외부 인식·분할 모델과 별도 얼굴 정렬을 설명 | 더 안전한 권리 또는 현 512px 스타일·background 동등성을 입증하지 못했으므로 대체 승인하지 않음 |
| [DCT-Net](https://github.com/menyifang/DCT-Net) | 코드 Apache-2.0, 공식 README는 copyright 문제로 cartoon exemplar를 제공하지 못한다고 설명. 개별 weight·teacher·dataset 검토가 남음 | permissive 코드만으로 안전한 weight 대체라고 판단하지 않음 |
| 권리 확보 자료로 독립 학습 | 상업 학습·weight 재배포가 허용된 code/data 및 직접·위탁 제작 portrait target으로 설계 가능 | 실현 가능한 경로지만 현재 동등 체크포인트가 없다. 학습 후 portrait 다양성·background·WASM/WebGPU 품질·성능 검증 전 교체 불가 |

현재 다음 조치는 runtime 교체가 아니라 감사 분류의 정밀화다. upstream commit·체크포인트 해시·MIT
고지를 보존하고 FacePaint를 확정 비상업 Paprika와 구별한다. 추가 출처 자료를 확보할 때는 exact v2의
teacher/data와 배포 grant 범위를 확인한다. 이는 모든 파일마다 별도 허가서가 있어야 한다는 요구가
아니다. 대체가 필요하다고 결정되면 권리를 확보한 데이터로 독립 학습하고 기존 portrait corpus에서
기능·품질을 검증한 뒤 기존 모델을 제거해야 한다. 이번 작업은 외부 연락·모델 변경을 하지 않았다.

## 검증과 한계

- 원본 모델과 upstream 체크포인트 SHA-256, upstream Git blob SHA-1: 실제 바이트로 확인.
- JSON 문법·기록된 파일 해시 일치, 신규 두 파일 Secretlint, 하네스 구조 검사: 통과.
- 공개 README/LICENSE/hubconf, 지정 owner comment와 공식 NVIDIA·FFHQ 문서의 targeted 조사다.
  모든 과거 댓글·계약을 전수 조사한 것은 아니다. 일부 GitHub issue search API는 HTTP 422로 실패해
  웹 검색과 직접 issue/comment API를 사용했다.
- 새 inference·변환 parity·학습·Rea 분석·전체 앱 테스트는 실행하지 않았다. runtime 변경이 없다.
- 기존 미커밋 변경과 Remotion·Mixbox를 수정하지 않았다. commit·push·PR·merge·배포는 하지 않았다.
