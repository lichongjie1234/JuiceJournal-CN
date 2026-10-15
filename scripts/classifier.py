from pathlib import Path
import json,numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];MODEL=ROOT/'assets/item-recognizer'
META=json.loads((MODEL/'classes.json').read_text(encoding='utf-8'));Z=np.load(MODEL/'icon-classifier.npz');EX=Z['exemplars'];LABELS=Z['labels'];DW=np.load(MODEL/'digit-classifier.npz')['weights']
def vector(im):
 a=np.asarray(im.convert('RGB').resize((12,12)),dtype=np.float32)/255;a[a.max(2)<.22]=0;a[:4,:6]=0;a[9:,7:]=0
 v=np.r_[a.ravel(),np.float32(1)];return v/max(float(np.linalg.norm(v)),1e-9)
def digit_vector(im):
 im=im.convert('L');box=im.getbbox()
 if box:im=im.crop(box)
 canvas=Image.new('L',(16,24));im.thumbnail((12,20));canvas.paste(im,((16-im.width)//2,(24-im.height)//2));return np.r_[np.asarray(canvas,dtype=np.float32).ravel()/255,np.float32(1)]
def quantity(tile):
 tile=tile.resize((64,64));a=np.asarray(tile.convert('RGB'))[:32,:34].astype(float);mask=(a.min(2)>170)&((a.max(2)-a.min(2))<65);seen=set();comps=[]
 for y,x in zip(*np.where(mask)):
  if (int(y),int(x)) in seen:continue
  todo=[(int(y),int(x))];pts=[];seen.add(todo[0])
  while todo:
   yy,xx=todo.pop();pts.append((yy,xx))
   for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
    ny,nx=yy+dy,xx+dx
    if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and mask[ny,nx] and (ny,nx) not in seen:seen.add((ny,nx));todo.append((ny,nx))
  ys,xs=zip(*pts);box=(min(xs),min(ys),max(xs)+1,max(ys)+1)
  if len(pts)>=5 and box[3]-box[1]>=7 and box[0]<30:comps.append(box)
 comps.sort();digits=[];margins=[]
 for box in comps[:3]:
  crop=Image.fromarray(mask[box[1]:box[3],box[0]:box[2]].astype('uint8')*255);scores=digit_vector(crop)@DW;order=np.argsort(scores);digit=int(order[-1]);digits.append(str(digit));margins.append(float(scores[order[-1]]-scores[order[-2]]))
 if not digits:return {'value':1,'status':'default_one','note':'未检测到左上角堆叠数字，按单个物品处理'}
 value=int(''.join(digits));return {'value':value if value>0 else None,'status':'recognized' if value>0 and min(margins)>.15 else 'uncertain','margin':round(min(margins),3)}
def recognize(tiles):
 x=np.asarray([vector(im) for im in tiles]);pred=x@EX.T;out=[]
 for tile,scores in zip(tiles,pred):
  group_scores=np.full(len(META['classes']),-1.,dtype=float);np.maximum.at(group_scores,LABELS,scores);order=np.argsort(group_scores);k=int(order[-1]);score=float(group_scores[k]);margin=score-float(group_scores[order[-2]])
  records=META['classes'][k]['items'];unique={r['id']:r for r in records};names=list(unique.values());q=quantity(tile)
  confident=score>.94 and margin>.012 and len(names)==1
  out.append({'item':names[0]['id'] if confident else None,'suggested_item':names[0]['id'],'name':names[0]['name'] if len(names)==1 else ' / '.join(r['name'] for r in names),'status':'recognized' if confident else ('ambiguous_grade' if len(names)>1 else 'uncertain'),'similarity':round(score,3),'margin':round(margin,3),'quantity':q,'alternatives':[r['id'] for r in names]})
 return out
