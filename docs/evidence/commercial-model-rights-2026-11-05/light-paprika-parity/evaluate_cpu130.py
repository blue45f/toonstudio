import os
os.environ.update(OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1')
import hashlib,json,pathlib,platform,statistics,time,resource,importlib.metadata
import numpy as np
import onnxruntime as ort
root=pathlib.Path('/tmp/toonstudio-light-paprika-evaluation')
outroot=pathlib.Path('/tmp/toonstudio-light-paprika-parity-followup')
evidence=pathlib.Path('/workspace/toonstudio/docs/evidence/commercial-model-rights-2026-11-05/light-paprika-parity')
sha=lambda b:hashlib.sha256(b).hexdigest()
model=root/'light-paprika-512-evaluation.onnx'
assert sha(model.read_bytes())=='431f2b1c7a3ab31fbee32fcae193e4e65b2304484e0a646a481d1a61351a17a8'
assert ort.__version__=='1.30.0',ort.__version__
assert str(outroot/'ort130') in ort.__file__,ort.__file__
opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1
start=time.perf_counter();sess=ort.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider']);load=time.perf_counter()-start
cases=[]
for name in ['usgs-mountain-lake-original.jpg','synthetic-city.png']:
 inp=np.load(root/'inputs'/(name+'.npy'));raw=(root/'inputs'/(name+'.f32')).read_bytes()
 assert inp.shape==(1,3,512,512) and inp.dtype==np.float32
 assert inp.tobytes()==raw
 tf=np.load(root/(name+'.tf-output.npy'));cpu120=np.fromfile(root/(name+'.cpu-output.f32'),dtype=np.float32).reshape(1,3,512,512)
 hashes=[];times=[];outputs=[]
 for trial in range(4):
  start=time.perf_counter();out=sess.run(None,{'image':inp})[0];times.append(time.perf_counter()-start)
  assert out.shape==(1,3,512,512) and out.dtype==np.float32 and np.isfinite(out).all()
  hashes.append(sha(out.tobytes()));outputs.append(out)
 out.tofile(outroot/(name+'.cpu130-output.f32'))
 def compare(ref):
  diff=np.abs(out-ref)
  return {'max_absolute_error':float(diff.max()),'mean_absolute_error':float(diff.mean()),'threshold':2/255,'passed_strict_less_than':bool(diff.max()<2/255)}
 cases.append({'image':name,'input_sha256':sha(raw),'output_sha256_each_trial':hashes,'bitwise_deterministic':len(set(hashes))==1,'shape':list(out.shape),'dtype':str(out.dtype),'nonfinite':int((~np.isfinite(out)).sum()),'first_seconds':times[0],'warm_seconds':times[1:],'warm_median_seconds':statistics.median(times[1:]),'error_vs_tf2162':compare(tf),'error_vs_cpu1201':compare(cpu120),'min':float(out.min()),'max':float(out.max())})
report={'runtime':ort.__version__,'runtime_import_path':ort.__file__,'python':platform.python_version(),'dependencies':{n:importlib.metadata.version(n) for n in ['numpy','protobuf','flatbuffers','packaging']},'provider':sess.get_providers(),'intra_op_threads':1,'inter_op_threads':1,'graph_optimization':str(opts.graph_optimization_level),'model_sha256':sha(model.read_bytes()),'load_seconds':load,'cases':cases,'maxrss_KiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'limitation':'Numerical parity only; no visual quality acceptance or product integration.'}
(evidence/'cpu130-result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
