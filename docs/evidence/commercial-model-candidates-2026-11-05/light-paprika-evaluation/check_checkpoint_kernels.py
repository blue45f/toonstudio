import pathlib,json,numpy as np,onnx,hashlib
from onnx import numpy_helper
r=pathlib.Path('/tmp/toonstudio-light-paprika-evaluation')
m=onnx.load(r/'light-paprika-512-evaluation.onnx')
init={x.name:numpy_helper.to_array(x) for x in m.graph.initializer}
raw=(r/'light_paprika_ckpt/generator.data-00000-of-00001').read_bytes()
saved=b''.join((r/'exported_models/light_paprika_SavedModel/variables'/x).read_bytes() for x in ['variables.data-00000-of-00002','variables.data-00001-of-00002'])
rows=[]
for n in m.graph.node:
    if n.op_type!='Conv':continue
    a=init[n.input[1]]
    groups=next((x.i for x in n.attribute if x.name=='group'),1)
    source=np.ascontiguousarray(a.transpose(2,3,0,1) if groups>1 else a.transpose(2,3,1,0))
    b=source.tobytes()
    rows.append({'node':n.name,'onnx_shape':list(a.shape),'source_shape':list(source.shape),'bytes':len(b),'source_sha256':hashlib.sha256(b).hexdigest(),'present_in_raw_light_checkpoint':b in raw,'present_in_savedmodel_variables':b in saved})
result={'state':'lightweight static array byte-presence evidence, no TF or inference import','conv_kernels':len(rows),'matched_in_both':sum(x['present_in_raw_light_checkpoint'] and x['present_in_savedmodel_variables'] for x in rows),'scope':'All converted convolution kernels after undoing standard tf2onnx HWIO/depthwise layout conversion. Not complete checkpoint variable/metadata identity.','kernels':rows}
(r/'checkpoint-kernel-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
assert result['conv_kernels']==result['matched_in_both']==44
print(json.dumps({k:v for k,v in result.items() if k!='kernels'}))
