shader_type spatial;
// 법선 패스: 뷰 공간 법선을 [0,1] 로 매핑해 191 단계 코드로 RGB 에 담는다.
render_mode unshaded, cull_back, depth_draw_opaque;
#include "res://shaders/pass_common.gdshaderinc"

void fragment() {
	vec3 n = normalize(NORMAL);
	ALBEDO = encode_unit(n * 0.5 + 0.5);
}
