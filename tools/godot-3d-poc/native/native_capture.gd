extends SceneTree
## 모드 B/C 확인용: 웹 export가 아니라 네이티브 Linux 엔진(Xvfb + Mesa 소프트웨어 GL)으로 같은 PoC 프로젝트를 돌려
## 웹과 같은 GDScript(glb_loader.gd, pass_capture.gd)로 패스를 캡처해 PNG 파일로 저장한다.
## 이 파일은 프로젝트(res://) 밖에 있어 웹 pck에 들어가지 않는다. 실행은 run-native.sh 를 쓴다.
##
## 환경 변수: TS3D_GLB(입력 GLB 절대 경로), TS3D_OUT(출력 폴더), TS3D_SIZE(예: 960x540), TS3D_REPEAT(캡처 반복 횟수, 기본 3)

func _initialize() -> void:
	call_deferred("_run")

func _fail(message: String) -> void:
	printerr("[native-capture] ", message)
	quit(1)

func _run() -> void:
	var glb_path := OS.get_environment("TS3D_GLB")
	var out_dir := OS.get_environment("TS3D_OUT")
	var size_text := OS.get_environment("TS3D_SIZE") if OS.has_environment("TS3D_SIZE") else "960x540"
	var repeat := int(OS.get_environment("TS3D_REPEAT")) if OS.has_environment("TS3D_REPEAT") else 3
	if glb_path == "" or out_dir == "":
		_fail("TS3D_GLB, TS3D_OUT 이 필요합니다.")
		return
	var size_parts := size_text.split("x")
	var size := Vector2i(int(size_parts[0]), int(size_parts[1]))
	var bytes := FileAccess.get_file_as_bytes(glb_path)
	if bytes.is_empty():
		_fail("GLB 를 읽지 못했습니다: %s" % glb_path)
		return
	DirAccess.make_dir_recursive_absolute(out_dir)

	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame

	var t0 := Time.get_ticks_usec()
	var res: Dictionary = main.loader.load_bytes(bytes, true)
	if not bool(res["ok"]):
		_fail("load_bytes 실패: %s" % str(res.get("error", "")))
		return
	main.model_root = res["root"]
	main.model_holder.add_child(main.model_root)
	main.rig.frame_aabb(main.loader.world_aabb(main.model_root))
	var load_ms := float(Time.get_ticks_usec() - t0) / 1000.0
	await process_frame
	await process_frame

	var info := {
		"engine": Engine.get_version_info().get("string", ""),
		"renderer": RenderingServer.get_current_rendering_method(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"vendor": RenderingServer.get_video_adapter_vendor(),
		"os": OS.get_name(), "threads": OS.has_feature("threads"),
		"model": main.loader.scene_stats(main.model_root),
		"loadMs": load_ms, "parseMs": res.get("parseMs", 0.0), "generateMs": res.get("generateMs", 0.0),
		"size": [size.x, size.y], "runs": [],
	}
	var meshes: Array = main.loader.collect_mesh_instances(main.model_holder)
	for i in range(repeat):
		var cap: Dictionary = await main.passes.capture(main, meshes, main.rig, main.key_light, ["beauty", "line", "tone", "depth", "normal"], size, {})
		if not bool(cap["ok"]):
			_fail("capture 실패: %s" % str(cap.get("error", "")))
			return
		info["runs"].append(cap["timingsMs"])
		if i == repeat - 1:
			for pass_name in cap["passes"]:
				var file := FileAccess.open(out_dir.path_join(str(pass_name) + ".png"), FileAccess.WRITE)
				file.store_buffer(cap["passes"][pass_name]["png"])
				file.close()
	var json_file := FileAccess.open(out_dir.path_join("native-capture.json"), FileAccess.WRITE)
	json_file.store_string(JSON.stringify(info, "\t"))
	json_file.close()
	print("[native-capture] 완료: ", out_dir)
	quit(0)
