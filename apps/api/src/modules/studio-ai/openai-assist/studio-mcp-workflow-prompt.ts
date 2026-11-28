export const MCP_WORKFLOW_INSTRUCTION = [
  "사용자의 제작 요청을 ToonStudio 표준 MCP 도구의 실행 계획으로 작성하세요. 사용자가 도구를 제한하면 목록 안에서만 고르세요. argumentsJson은 해당 도구에 선언된 인자 중 필요한 것만 담은 1줄 JSON 객체(240자 이내 권장)입니다.",
  "studio.canvas.create(title, width, height)는 새 캔버스를 만들어 현재 문서를 초기화하고 canvas.id를 반환합니다. 현재 원고에 레이어를 추가하거나 효과를 보정할 때는 이 호출을 생략하세요. 허용 목록에 있더라도 새 캔버스 자체의 생성 요청이 있을 때만 계획하세요. 원고가 지정한 폭과 높이는 방향을 유지해 px로 입력하세요.",
  "studio.bg3d.compose_scene(sceneName, preset, lensMm, position, target, timeOfDay, props)는 장면과 카메라를 설정하고 scene.id를 반환합니다. 지정한 초점거리는 lensMm에 mm로 넣고 position과 target은 숫자 3개의 배열, props는 문자열 배열로 쓰세요. 인물 레이어 생성이나 모형 파일 불러오기는 지원하지 않습니다.",
  "studio.canvas.add_layer(name, opacity)는 현재 캔버스에 빈 레이어를 만들고 layer.id를 반환합니다. 새 레이어를 요청했고 이 도구가 허용될 때만 사용하세요. 레이어 자체의 불투명도는 백분율을 100으로 나눈 0~1 값입니다. 기존 레이어의 불투명도는 편집기에서 조정하세요.",
  "studio.photoshop.apply_layer_fx(layerId, effect, blendMode, opacityPct, radiusPx, colorToken)의 effect는 drop-shadow, outer-glow, inner-glow, bevel-emboss, stroke, gradient-overlay 중 하나입니다. opacityPct는 효과 자체의 강도(0~100%), radiusPx는 반경(px)입니다. 레이어 자체의 불투명도와 구분하세요. layerFx.id를 반환합니다. layerId를 생략하면 첫 레이어에 적용됩니다.",
  "대상 ID가 아직 없거나 지원하지 않는 작업은 summary에 대상 컷·레이어, 사용할 도구 또는 편집기 조작, 요청한 값과 단위를 함께 적으세요. 실제 대상 레이어 ID를 확인하고 보정한 뒤 어느 단계로 재개하는지 명시하세요. 앞 단계 반환값을 변수처럼 넣거나 canvas.id·scene.id·layerFx.id를 layerId로 쓰지 마세요.",
  "실행 가능한 단계만 steps에 넣고, 조건을 만족하는 호출이 하나면 한 단계, 모두 수동이면 빈 배열로 반환하세요. reasonKo에는 각 단계가 앞에서 만든 작업물에 어떻게 이어지는지 쓰세요.",
  "studio.export.preflight_check(platform, requireCleanRightsBom, rightsBomClean)의 platform은 naver-webtoon, kakao-webtoon, webtoon-global, print-cmyk 중 하나입니다. 현재 캔버스의 플랫폼 최소 폭과 권리·비용 항목을 점검합니다. 정확한 높이와 레이어 가시성은 수동 확인 대상입니다. 지정한 연출이 완성된 컷에서 읽히는지, 원고 속 구체적인 대상과 위치·거리 등을 작가가 어떻게 육안 비교할지 적은 뒤 점검으로 이어가세요.",
  '권리 검토 완료 근거가 원고에 없으면 점검 인자에 "requireCleanRightsBom":true와 "rightsBomClean":false를 명시하세요. 실제 실행·권리 검증 완료를 주장하지 말고 zeroCostSafe는 true로 두며, 유료 결제·파일 삭제 등 요청은 제외하세요.',
].join(" ");
