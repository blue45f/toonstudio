"""Isolated evaluation of author-trained Apache repository light model; no product imports."""
import os
os.environ.update(TF_NUM_INTRAOP_THREADS='1', TF_NUM_INTEROP_THREADS='1', OMP_NUM_THREADS='1', CUDA_VISIBLE_DEVICES='', TF_CPP_MIN_LOG_LEVEL='2')
import json, pathlib, time, hashlib, collections
import tensorflow as tf
import tf2onnx
import onnx
import numpy as np
from PIL import Image
root = pathlib.Path('/tmp/toonstudio-light-paprika-evaluation')
tf.config.threading.set_intra_op_parallelism_threads(1)
tf.config.threading.set_inter_op_parallelism_threads(1)
t0=time.perf_counter()
module=tf.saved_model.load(str(root/'exported_models/light_paprika_SavedModel'))
fn=module.signatures['serving_default']
print('SIGNATURE', fn.structured_input_signature, fn.structured_outputs, flush=True)
keys=list(fn.structured_input_signature[1]); output_keys=list(fn.structured_outputs)
assert len(keys)==len(output_keys)==1
@tf.function(input_signature=[tf.TensorSpec([1,3,512,512], tf.float32, name='image')])
def nchw_model(x):
    y=fn(**{keys[0]:tf.transpose(x, [0,2,3,1])})[output_keys[0]]
    return tf.identity(tf.transpose(y,[0,3,1,2]), name='output')
model,_=tf2onnx.convert.from_function(nchw_model,input_signature=[tf.TensorSpec([1,3,512,512],tf.float32,name='image')],opset=13,output_path=str(root/'light-paprika-512-evaluation.onnx'))
# Match the existing product tensor names without changing production code.
old_output=model.graph.output[0].name
for node in model.graph.node:
    for i,name in enumerate(node.input):
        if name==old_output:node.input[i]='anime'
    for i,name in enumerate(node.output):
        if name==old_output:node.output[i]='anime'
model.graph.output[0].name='anime'
onnx.checker.check_model(model)
onnx.save_model(model,str(root/'light-paprika-512-evaluation.onnx'))
print('CONVERTED', time.perf_counter()-t0, flush=True)
np.save(root/'inputs/gradient-nchw.npy',np.stack(np.meshgrid(np.linspace(-1,1,512,dtype=np.float32),np.linspace(-1,1,512,dtype=np.float32))+[np.zeros((512,512),np.float32)])[None])
# References are from this permissive author model, never the excluded product model.
references=[]
for name in ['usgs-mountain-lake-original.jpg','synthetic-city.png']:
    im=Image.open(root/'inputs'/name).convert('RGB').resize((512,512),Image.Resampling.LANCZOS)
    inp=np.asarray(im,dtype=np.float32).transpose(2,0,1)[None]/127.5-1
    np.save(root/'inputs'/(name+'.npy'),inp)
    start=time.perf_counter();out=nchw_model(tf.constant(inp)).numpy(); elapsed=time.perf_counter()-start
    assert out.shape==(1,3,512,512) and np.isfinite(out).all()
    np.save(root/(name+'.tf-output.npy'),out)
    references.append({'image':name,'seconds':elapsed,'shape':list(out.shape),'min':float(out.min()),'max':float(out.max())})
p=root/'light-paprika-512-evaluation.onnx';data=p.read_bytes()
report={'state':'isolated-evaluation-no-product-change','toolchain':{'tensorflow':tf.__version__,'tf2onnx':tf2onnx.__version__,'onnx':onnx.__version__},'source_signature':str(fn.structured_input_signature),'source_outputs':str(fn.structured_outputs),'converted_bytes':len(data),'converted_sha256':hashlib.sha256(data).hexdigest(),'opset':13,'operators':dict(collections.Counter(n.op_type for n in model.graph.node)),'tf_references':references}
(root/'conversion-result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
