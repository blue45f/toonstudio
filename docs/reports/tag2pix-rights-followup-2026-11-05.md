# Tag2Pix 권리·대체 후보 후속 확인 — 2026-11-05

상태: **current / 원문·출처 확인 완료, 대체 모델 채택 및 기존 자산 제거 미완료**.
기준 HEAD는 `8d315c85d6fde4a3a30255612c756d3e299a95b0`, 브랜치는 `work`다. 기존 dirty 변경을
보존했다. 이 작업의 파일 변경은 이 문서와
[`tag2pix-rights.json`](../evidence/commercial-model-rights-2026-11-05/tag2pix-rights.json) 두 신규 파일뿐이다.
기존 runtime·모델·고지·보고서, Mixbox·Remotion은 수정하지 않았다.

## 확인된 자산과 제한

로컬 `apps/web/src/domains/creator/assets/tag2pix.onnx`를 스트리밍 SHA-256으로 다시 확인했다.
크기는 **79,269,994 bytes**, 해시는
`ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc`로 현재 descriptor·고지와 일치한다.

| 원문 | 고정 revision / 확인 결과 |
| --- | --- |
| [원저자 README](https://github.com/blandocs/Tag2Pix/blob/733d729067608dbe2c1122c9128f2f38bc0a8edd/README.md#license) | HEAD `733d729067608dbe2c1122c9128f2f38bc0a8edd`, README SHA-256 `ae3e73e171d0305a78babe62a62a5ed758ba8891512700c268c5eba6839e1387` |
| [원저자 LICENSE](https://github.com/blandocs/Tag2Pix/blob/733d729067608dbe2c1122c9128f2f38bc0a8edd/LICENSE) | 코드 MIT, Seoul National University 2019. LICENSE SHA-256 `1b495805bab888abd3d4af9e569c1ef1c58bd377b526dd95ee6e65f4d6392fb0` |
| [원본 release](https://github.com/blandocs/Tag2Pix/releases/tag/release) | 2019-08-19 공개. README와 별개로 release 본문도 가중치의 비상업 조건·재배포 제한 명시 |
| [release 당시 README](https://github.com/blandocs/Tag2Pix/blob/be28056828bac8b386327b9b49355d0804416de6/README.md#license) | `release` tag의 commit `be28056828bac8b386327b9b49355d0804416de6`; 당시에도 코드와 가중치 조건을 구분 |

따라서 문제는 MIT 고지 누락만이 아니다. **코드 MIT와 release 가중치의 비상업·재배포 제한은
서로 다른 적용 대상**이다. 원문의 재배포 문구는 “Any redistribution is explicitly restricted.”다.
ONNX 변환·파일명 변경·MIT runtime 사용은 이 제한의 해소 근거가 아니다.

현재 고지는 생성망 `tag2pix_512.pkl`과 특징망 `model.pth`를 한 graph로 직접 변환했다고 기록한다.
원본 release API에서도 두 이름과 크기(각각 74,465,109 / 105,401,108 bytes)를 확인했다.
고지의 원본 SHA-256은 각각
`f929bba53e16992097fff82d2a42fbb7bc611d6170b6cac81b37bf940340cf59`,
`e59efdfa6e4fe883acfb3fe7e5a6abd0da6363554d67fe8f526e143d64a960df`다.

이 두 원본 해시와 tensor 전량 binding 주장은 **기존 저장소의 변환 기록**이다. 이번에는 제한된
원본 가중치를 다운로드하거나 inference하지 않았다. GitHub release metadata의 `digest`도
두 자산 모두 `null`이므로 이를 새로 원저자 파일과 독립 대조한 해시라고 보고하지 않는다.
로컬 ONNX 해시·공개 release의 두 자산·고지의 변환 출처를 구분해 증거 JSON에 기록했다.

공개 원저자 자료, 로컬 고지·source, 관련 docs/legal/scripts의 Tag2Pix 허가·계약 문구 검색에서는
별도 상용·재배포 허가서를 찾지 못했다. 저장소 밖의 비공개 계약이 존재하지 않는다는 증명은 아니다.
현재 확인 범위에서는 권리 해결 증거가 없으며, 상용 배포 문제 해결을 선언할 수 없다.

## 115개 계약과 실제 UI를 구분한 결과

원저자 [`loader/tag_dump.pkl`](https://github.com/blandocs/Tag2Pix/blob/733d729067608dbe2c1122c9128f2f38bc0a8edd/loader/tag_dump.pkl)은
111,936-byte **어휘 metadata**이며 학습 가중치가 아니다. SHA-256은
`68f2b1bccefe2c1f38b38bd31b084ba32952d3197441ad61a2988c7f83d5f09f`다. `pickle.load`나 코드를 실행하지 않고
primitive data opcode만 해석해 `cv_tag_list`의 115개 ID와 이름 순서를 얻었다.
**로컬 `STUDIO_TAG2PIX_TAG_NAMES` 115개와 순서까지 완전히 일치**한다.

현재 UI는 전체 115개를 모두 노출하지 않는다. `StudioOnnxColorizePanel.tsx`는 hair 15 / eyes 12 /
skin 4 / shirt 5 / skirt 9 / dress 7 / background 13, 합계 **65개 선택지·7개 그룹**을 큐레이션한다.
그룹마다 하나씩 선택하므로 UI의 동시 태그는 최대 7개다. 반면 public service와 tag-vector builder는
**115개 전체의 multi-hot 입력을 받으며**, 알려지지 않은 이름만 거절한다. UI subset은 전체 API
기능을 제거해도 된다는 근거가 아니다. 패널 헤더의 MIT 단독 설명은 가중치 조건을 구분하지 않는
남은 주석이며, 이 후속 문서에서는 runtime을 수정하지 않았다.

실제 경로는 패널 → `colorizeLineArtOnDeviceWithLayers` → tag vector / line 전처리 → ONNX colorizer →
원래 해상도 선·명도 합성이다. lazy loader가 `tag2pix.onnx?url`을 import/fetch한다. 결과 CHW color
plane은 layer 분리·PSD에도 전달된다. 아직 source에 포함된 배포 경로를 확인한 것이며, 현재 운영에
동일 자산이 배포돼 있다고 확인한 것은 아니다.

교체 시 보존할 계약은 `line` float32 `[1,1,512,512]` 0..1, `tags` float32 `[1,115]`, `color`
float32 `[1,3,512,512]` -1..1뿐만이 아니다. offline/no-key fallback, 외부 pixel 업로드 없음,
원래 해상도 선·음영·alpha 합성, 취소·실패·재시도·lazy load와 편집 가능한 layer/PSD도 포함한다.

## 새 후보: ControlNet anime lineart + SD1.5

이전 경량 후보 실험에서 평가하지 않은 **실제 학습 checkpoint 후보**다. 의미 태그를 영어 prompt로
전달하고 선화를 ControlNet conditioning으로 주는 방식이므로 기존 기능을 시도할 근거는 있다.
그러나 아래 권리·metadata 확인을 **115개 의미 태그의 동등성 검증 완료**로 표현하지 않는다.

| 구성 | 고정 revision | checkpoint·코드 조건 / fp16 크기 |
| --- | --- | --- |
| [저자 ControlNet anime lineart](https://huggingface.co/lllyasviel/control_v11p_sd15s2_lineart_anime/tree/9c03a1c4f055643faa78f5b6869189642b5b8f66) | `9c03a1c4f055643faa78f5b6869189642b5b8f66` | 해당 checkpoint card 본문이 CreativeML OpenRAIL-M을 명시. fp16 722,598,642 bytes |
| [저자 원본 collection](https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/69fc48b9cbd98661f6d0288dc59b59a5ccb32a6b) | `69fc48b9cbd98661f6d0288dc59b59a5ccb32a6b` | 저자 소유 원본 collection도 `openrail` metadata. 위 파일은 원본의 Diffusers 변환 경로라고 card가 명시 |
| [SD1.5 mirror](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/tree/451f4fe16113bff5a5d2269ed5ad43b0592e9a14) | `451f4fe16113bff5a5d2269ed5ad43b0592e9a14` | card가 CreativeML OpenRAIL-M을 명시. **Runway 비제휴 mirror**이며 원저자 계정으로 표기하지 않음 |
| [Diffusers 0.35.2 코드](https://github.com/huggingface/diffusers/blob/b71269675ec1b85193107a691dd35c308e46f0a5/LICENSE) | `b71269675ec1b85193107a691dd35c308e46f0a5` | Apache-2.0 |
| [Transformers 4.56.2 코드](https://github.com/huggingface/transformers/blob/cd74917ffc3e8f84e4a886052c5ab32b7ac623cc/LICENSE) | `cd74917ffc3e8f84e4a886052c5ab32b7ac623cc` | Apache-2.0 |

이는 코드 Apache만 보고 weight를 허용한 판단이 아니다. [고정 OpenRAIL-M 원문](https://github.com/CompVis/stable-diffusion/blob/21f890f9da3cfbeaba8e2ac3c425ee9e998d5229/LICENSE)은
model/checkpoint에 적용되는 grant와 재배포·hosting 조건을 정한다. 이 문서에서 일반적인 상용 이용을
일괄 금지하는 NC 조건은 확인하지 않았다. 대신 §4–5의 license·고지·변경 표시·후속 사용자 조건,
Attachment A의 용도 제한을 실제 서비스에 반영해야 한다. 원문 SHA-256은
`be351ebe7ac01bcdbb018639aadcfd38f136b7dc3f2a3d4d3a24db51d1b210ef`다.

SD1.5 card의 intended-use 부분에는 연구 목적 문구도 있다. checkpoint의 명시적 OpenRAIL-M grant와
그 서술을 구분해 기록했으며, 이 조사에서 법률 해석이 확정됐다고 주장하지 않는다. 해당 grant가
학습 corpus의 이미지별 권리를 입증하지도 않는다. 개별 데이터 출처 공백을 곧바로 checkpoint의
비상업 금지라고 판정하지는 않았다. mirror와 원본 사이의 독립 byte 대조도 미실행이다.

기존 선화를 직접 conditioning으로 전달하는 후보를 검토하므로 저자의 learned annotator나
여러 라이선스가 섞인 annotator tree를 통째로 도입할 필요는 없다. 다만 polarity·normalization과
선화 보존 품질은 실제 검증해야 한다. 후보 코드·weights·추론 의존성은 설치하지 않았다.

## 기능·실행 가능성의 구체적인 차이

증거 JSON에는 115개 모든 태그의 영어 표현 draft를 빠짐없이 기록했다. text로 표현 가능하다는
사실은 색이 올바른 부위에 적용된다는 증명이 아니다. 특히 eyes·eyewear, ribbon·bow, 겹친 의상,
`denim`, `blush`, `shiny_skin`, `gradient_background`를 별도로 검증해야 한다.

- **입력 길이:** 고정 SD1.5 tokenizer 한도는 77 tokens다. 해당 merge metadata와 CLIP byte-BPE로
  계산하면 115개 전체를 comma로 이은 원문은 BOS/EOS 포함 **476 tokens**, underscore를 공백으로
  바꾼 표현도 **362 tokens**다. 현재 UI에서 긴 표현을 그룹별로 하나씩 고른 예는 **23 tokens**로
  들어가지만, 전체 API에 단일 prompt truncation을 적용하면 태그가 사라진다. canonical tag 순서와
  nontruncating chunked `prompt_embeds`/conditioning을 설계하고 의미 보존을 검증해야 한다.
- **기능 조건:** 같은 부위에 여러 색을 켠 multi-hot 조합도 현재 API는 받는다. 후보 adapter에서
  첫 색만 남기거나 임의의 태그를 버리는 방식은 대체가 아니다. 비어 있는 태그·상충 조합의 동작도
  명시하고 회귀 corpus에서 비교해야 한다.
- **용량:** remote metadata의 fp16 ControlNet + UNet + text encoder + VAE는 **2,855,204,152 bytes**다.
  safety checker 포함 시 **3,463,222,592 bytes**이며 config/tokenizer/runtime은 별도다. 현재 79.27 MB
  단일 ONNX와 같은 전달 비용이 아니다. JSON의 LFS 해시는 원격 metadata의 주장이고 실제 weights를
  받거나 독립 해시하지 않았다. RAM/VRAM 사용량으로 바꾸어 말하지 않는다.
- **실행:** 원문 예시는 30-step denoising pipeline이다. 현재 1회 ONNX 호출과 달리 text encoder,
  ControlNet, UNet, VAE와 scheduler가 필요하다. [ORT Web 대형 모델 제한](https://onnxruntime.ai/docs/tutorials/web/large-models.html)을
  포함해 WASM/WebGPU·외부 데이터·peak memory·취소·offline 재실행을 실측해야 한다. ONNX 변환 가능성만으로
  현재 브라우저·모바일 fallback의 동등성을 주장할 수 없다. 서버 inference로 바꾸면 pixel 비업로드·offline
  계약을 보존하지 못하므로 그대로 대체 채택할 수 없다.

구체적 다음 검증은 조건을 수락할 수 있는 license/notice 구성과 immutable weight 검증, 태그를
자르지 않는 adapter, 소유·CC0 등 권리가 확인된 선화 corpus의 21개 의미 영역 annotation,
단일 태그 변경/다중 태그 색상 준수·부위 오염·선화 보존, 512² provider parity와 전체 편집 경로다.
마지막에 작가 품질 수락까지 통과한 후에만 기존 모델 제거를 검토한다. 제한 Tag2Pix weight나 그
출력의 학습·복제·distillation로 이 공백을 채우지 않는다.

## 검증·남은 차단 사유

로컬 hash/크기, 고정 README·LICENSE·release commit, 115개 vocabulary의 순서, 실제 UI 65/7,
후보 checkpoint license·크기·LFS metadata와 tokenizer 길이 검사는 완료했다. JSON에는 각 원문 URL,
취득일, bytes, SHA-256과 검증 수준을 보존했다. 배포 원본 가중치 재다운로드, 새 모델 inference,
품질·성능·browser parity·bundle/build/full type 검사는 이 문서 작업에서 실행하지 않았다.

**차단 사유는 두 가지다.** 현재 Tag2Pix release의 명시적 제한에 대응하는 허가 증거가 확인되지
않았고, 새 후보는 전체 115개 의미 조건과 현재 offline/browser·편집 기능의 동등성을 검증하지 못했다.
따라서 기존 기능·자산은 보존하며, 제거 완료나 상용 출시 권리 해결을 선언하지 않는다. 이는 확인한
자료의 기술적 권리·출처 검토이며 미확인 계약에 대한 단정 또는 법률 의견이 아니다.
