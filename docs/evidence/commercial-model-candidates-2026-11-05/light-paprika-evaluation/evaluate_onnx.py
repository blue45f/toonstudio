"""Reference parity and repeatable CPU receipts for the isolated permissive candidate."""
import os
os.environ.update(OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1')
import pathlib,json,time,platform,statistics
import onnxruntime as ort
import numpy as np
from PIL import Image,ImageDraw
root=pathlib.Path('/tmp/toonstudio-light-paprika-evaluation')
opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1
start=time.perf_counter();sess=ort.InferenceSession(str(root/'light-paprika-512-evaluation.onnx'),sess_options=opts,providers=['CPUExecutionProvider']);load=time.perf_counter()-start
assert [(x.name,x.shape,x.type) for x in sess.get_inputs()]==[('image',[1,3,512,512],'tensor(float)')]
assert [(x.name,x.shape,x.type) for x in sess.get_outputs()]==[('anime',[1,3,512,512],'tensor(float)')]
results=[];rows=[]
for name in ['usgs-mountain-lake-original.jpg','synthetic-city.png']:
    inp=np.load(root/'inputs'/(name+'.npy'));reference=np.load(root/(name+'.tf-output.npy'))
    timings=[]
    for k in range(4):
        start=time.perf_counter();out=sess.run(None,{'image':inp})[0];timings.append(time.perf_counter()-start)
    assert out.shape==reference.shape==(1,3,512,512)
    assert np.isfinite(out).all()
    diff=np.abs(out-reference);maxdiff=float(diff.max());assert maxdiff<2/255,(name,maxdiff)
    # These are transformation and source-reference parity metrics, not style quality scores.
    results.append({'image':name,'max_absolute_error_vs_tf':maxdiff,'mean_absolute_error_vs_tf':float(diff.mean()),'first_seconds':timings[0],'warm_seconds':timings[1:],'warm_median_seconds':statistics.median(timings[1:]),'output_min':float(out.min()),'output_max':float(out.max()),'mean_change_vs_input_normalized':float(np.abs(out-inp).mean())})
    rgb=np.clip((out[0].transpose(1,2,0)+1)*127.5,0,255).astype('uint8')
    Image.fromarray(rgb).save(root/(name+'.candidate.png'))
    np.ascontiguousarray(inp).tofile(root/'inputs'/(name+'.f32'))
    np.ascontiguousarray(out).tofile(root/(name+'.cpu-output.f32'))
    row=Image.new('RGB',(1024,542),'white');row.paste(Image.fromarray(np.clip((inp[0].transpose(1,2,0)+1)*127.5,0,255).astype('uint8')),(0,30));row.paste(Image.fromarray(rgb),(512,30));ImageDraw.Draw(row).text((10,8),name+' source | independent light CartoonGAN candidate',fill='black');rows.append(row)
sheet=Image.new('RGB',(1024,len(rows)*542),'white')
for i,row in enumerate(rows):sheet.paste(row,(0,i*542))
sheet.save(root/'candidate-comparison.png')
report={'state':'isolated-evaluation-no-product-change','environment':{'python':platform.python_version(),'platform':platform.platform(),'onnxruntime':ort.__version__,'providers':sess.get_providers(),'intra_op_threads':1,'inter_op_threads':1},'load_seconds':load,'contract':{'input':'image float32[1,3,512,512] RGB -1..1','output':'anime float32[1,3,512,512] tanhRGB'},'reference':'author own light_paprika SavedModel, not excluded product weights','cases':results,'limitations':['Two smoke images do not prove product quality equivalence.','No target-style truth or artist acceptance score.','No old restricted model inference or outputs used for training.','Native resolution resize, alpha, cancellation, fallback and WebGPU not exercised by this isolated CPU script.']}
(root/'onnx-cpu-result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
