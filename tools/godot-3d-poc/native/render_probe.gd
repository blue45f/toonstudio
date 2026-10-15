extends SceneTree
## 모드 B 확인용 프로브: 이 실행 환경에서 Godot 가 실제로 그려서 이미지를 읽을 수 있는지 확인한다.
## `--headless`(더미 디스플레이·렌더 드라이버)와 Xvfb + Mesa 소프트웨어 GL 두 경우를 같은 스크립트로 비교하는 용도다(run-native.sh 참고).
## 프로젝트(res://) 밖의 파일이라 웹 pck 에 들어가지 않는다. 결과는 표준 출력의 `[render-probe] {json}` 한 줄이다.
##
## 판정: 뷰포트에 빨간 사각형을 그린 뒤 N 프레임 안에 `RenderingServer.frame_post_draw` 가 오고 중앙 픽셀이 빨강이면 "그려진다".
## 오지 않거나 픽셀이 비어 있으면 그 환경에서는 PNG 캡처 도구를 만들 수 없다.

const WAIT_FRAMES := 20

var _post_draw := 0

func _initialize() -> void:
	call_deferred("_run")

func _on_post_draw() -> void:
	_post_draw += 1

func _run() -> void:
	var vp := SubViewport.new()
	vp.size = Vector2i(64, 64)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(vp)
	var rect := ColorRect.new()
	rect.color = Color(1, 0, 0, 1)
	rect.size = Vector2(64, 64)
	vp.add_child(rect)
	RenderingServer.frame_post_draw.connect(_on_post_draw)
	for _i in range(WAIT_FRAMES):
		await process_frame
	var tex := vp.get_texture()
	var image: Image = tex.get_image() if tex != null else null
	var center := "n/a"
	var empty := true
	var size_text := "null"
	if image != null:
		empty = image.is_empty()
		size_text = "%dx%d" % [image.get_width(), image.get_height()]
		if not empty:
			center = image.get_pixel(32, 32).to_html(false)
	var info := {
		"engine": Engine.get_version_info().get("string", ""),
		"displayDriver": DisplayServer.get_name(),
		"renderingMethod": RenderingServer.get_current_rendering_method(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"processFrames": WAIT_FRAMES,
		"framesDrawn": Engine.get_frames_drawn(),
		"framePostDrawSignals": _post_draw,
		"image": size_text,
		"imageEmpty": empty,
		"centerPixelHex": center,
		"drawsRed": center == "ff0000",
	}
	print("[render-probe] ", JSON.stringify(info))
	quit(0)
