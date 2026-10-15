"""Match shipped public item artwork, retaining identities that share an icon."""
from pathlib import Path
import json,numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets';CACHE=ASSETS/'icon-bank.npz'
def feature(im):
 a=np.asarray(im.convert('RGB').resize((16,16)),dtype=np.float32)/255
 a[a.max(2)<.2]=0
 mask=np.ones((16,16),dtype=np.float32);mask[:1]=0;mask[-1:]=0;mask[:,:1]=0;mask[:,-1:]=0;mask[:6,:8]=0;mask[11:,8:]=0
 gray=a.mean(2);edge=np.abs(np.diff(gray,axis=0,prepend=gray[:1]))+np.abs(np.diff(gray,axis=1,prepend=gray[:,:1]))
 vector=np.r_[(a*mask[:,:,None]).ravel(),(edge*mask*.6).ravel()]
 return vector/max(float(np.linalg.norm(vector)),1e-9)
def build():
 catalog=json.loads((ASSETS/'catalog.json').read_text(encoding='utf-8'));groups={}
 for item in catalog:groups.setdefault(item['icon'],[]).append(item)
 vectors=[];labels=[];classes=[];errors=[]
 for filename,items in groups.items():
  try:
   source=Image.open(ASSETS/filename).convert('RGBA');label=len(classes)
   for size in (56,64,72):
    for dx in (-3,0,3):
     for dy in (0,4,8):
      image=source.copy();image.thumbnail((size,size));canvas=Image.new('RGBA',(70,70),(0,0,0,255));canvas.alpha_composite(image,((70-image.width)//2+dx,(70-image.height)//2+dy));vectors.append(feature(canvas));labels.append(label)
   classes.append(items)
  except Exception as e:errors.append({'icon':filename,'error':str(e)})
 np.savez_compressed(CACHE,vectors=np.asarray(vectors,dtype=np.float16),labels=np.asarray(labels,dtype=np.int32))
 (ASSETS/'icon-bank-classes.json').write_text(json.dumps(classes,ensure_ascii=False),encoding='utf-8')
 return {'icons':len(classes),'variants':len(vectors),'missing':len(errors),'cacheBytes':CACHE.stat().st_size}
def classify(tiles):
 if not CACHE.exists():return None
 data=np.load(CACHE);vectors=data['vectors'].astype(np.float32);labels=data['labels'];classes=json.loads((ASSETS/'icon-bank-classes.json').read_text(encoding='utf-8'))
 scores=np.asarray([feature(tile) for tile in tiles])@vectors.T;out=[]
 for row in scores:
  grouped=np.full(len(classes),-1.,dtype=np.float32);np.maximum.at(grouped,labels,row);order=np.argsort(grouped)[-3:][::-1];best=int(order[0]);score=float(grouped[best]);margin=score-float(grouped[int(order[1])]);items=classes[best]
  candidates=[{**item,'score':round(float(grouped[int(k)]),3)} for k in order for item in classes[int(k)]]
  confident=(score>=.9 and margin>=.018) or (score>=.85 and margin>=.055)
  out.append({'catalogId':items[0]['id'] if confident and len(items)==1 else None,'items':items,'score':round(score,3),'margin':round(margin,3),'confidentIcon':confident,'candidates':candidates[:8]})
 return out
if __name__=='__main__':print(json.dumps(build()))
