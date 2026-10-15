from pathlib import Path
from PIL import Image,ImageOps
import numpy as np
import sys,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
try:
 from classifier import recognize
except FileNotFoundError:
 # Development checkout can reuse the existing model; the D drive installation
 # ships its own model in assets and never needs this fallback.
 sys.path.insert(0,r'D:\PoE2AI\assistant')
 from recognizer import recognize

def corner(tile,box):
 a=np.asarray(tile.crop(box).convert('RGB')).astype(float)
 mask=(a.min(2)>155)&(a.max(2)-a.min(2)<75)
 # Retain tall components starting on the numeric text line. White highlights
 # inside an item icon otherwise merge into the OCR text and create extra digits.
 seen=set();clean=np.zeros_like(mask)
 for y,x in zip(*np.where(mask)):
  p=(int(y),int(x))
  if p in seen:continue
  todo=[p];seen.add(p);points=[]
  while todo:
   yy,xx=todo.pop();points.append((yy,xx))
   for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
    ny,nx=yy+dy,xx+dx
    if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and mask[ny,nx] and (ny,nx) not in seen:
     seen.add((ny,nx));todo.append((ny,nx))
  ys,xs=zip(*points)
  if len(points)>=7 and max(ys)-min(ys)>=8 and min(ys)<=8:
   for yy,xx in points:clean[yy,xx]=True
 mask=clean
 im=Image.fromarray(np.uint8(~mask)*255).resize((mask.shape[1]*6,mask.shape[0]*6))
 return ImageOps.expand(im,20,'white')

def scan(file,out,reference):
 im=Image.open(file).convert('RGB');ref=Image.open(reference).convert('RGB')
 if im.size!=(2560,1440):raise ValueError('当前仅验证2560×1440游戏窗口，其他分辨率需适配')
 anchors=[(1970,72,2270,115),(1689,770,2538,786)]
 errors=[float(np.abs(np.asarray(im.crop(b)).astype(float)-np.asarray(ref.crop(b)).astype(float)).mean()) for b in anchors]
 correlations=[float(np.corrcoef(np.asarray(im.crop(b)).ravel(),np.asarray(ref.crop(b)).ravel())[0,1]) for b in anchors]
 # Independent WGC and Electron captures have different antialiasing. Match
 # structure as well as pixels, while retaining an absolute error bound.
 if max(errors)>25 or min(correlations)<.9:return {'validPage':False,'reason':'背包未打开、被遮挡或布局发生变化','anchorErrors':errors,'anchorCorrelations':correlations,'cells':[]}
 out.mkdir(parents=True,exist_ok=True)
 tiles=[];locations=[]
 for area,x,cols in [('main',1696,12),('extension',1244,6)]:
  for row in range(5):
   for col in range(cols):
    b=(round(x+col*70.25),round(788+row*70.25),round(x+(col+1)*70.25),round(788+(row+1)*70.25))
    tiles.append(im.crop(b).resize((70,70)));locations.append((area,row,col))
 preds=recognize(tiles)
 empty=ref.crop((1767,789,1836,858)).resize((70,70))
 ea=np.asarray(empty)[5:65,5:65].astype(float)
 cells=[]
 groups=[]
 for i,(tile,pred,loc) in enumerate(zip(tiles,preds,locations)):
  a=np.asarray(tile)[5:65,5:65].astype(float)
  difference=float(np.abs(a-ea).mean())
  if difference<7:
   cells.append({'index':i,'area':loc[0],'row':loc[1]+1,'col':loc[2]+1,'status':'empty','quantity':None});continue
  tile.save(out/f'{i}.png');corner(tile,(2,2,36,25)).save(out/f'{i}-top.png');corner(tile,(34,45,69,69)).save(out/f'{i}-bottom.png')
  # Never use the old classifier's quantity or default-one behavior.
  pixels=np.asarray(tile).astype(float)/255
  group=None
  # Group repeated icons while retaining the lower-right level badge. Only
  # upper-left stack text is masked. Every candidate must match the first
  # member, preventing similarity chains from merging different grades.
  for gid,reference_pixels in groups:
   best=1
   for dy in (-1,0,1):
    for dx in (-1,0,1):
     shifted=np.roll(reference_pixels,(dy,dx),(0,1))
     diff=np.abs(pixels-shifted).mean(2)
     valid=np.ones((70,70),dtype=bool);valid[:4]=False;valid[-4:]=False;valid[:,:4]=False;valid[:,-4:]=False;valid[:25,:36]=False
     body=float(diff[valid].mean());badge=float(diff[45:65,43:65].mean())
     if badge<.055:best=min(best,body)
   if best<.045:group=gid;break
  if group is None:group=len(groups);groups.append((group,pixels))
  cells.append({'index':i,'group':group,'area':loc[0],'row':loc[1]+1,'col':loc[2]+1,'status':pred['status'],
   'item':pred['item'],'suggested_item':pred['suggested_item'],'name':pred['name'],
   'alternatives':pred['alternatives'],'similarity':pred['similarity'],'quantity':None,'confirmed':False,
   'image':str(out/f'{i}.png'),'top':str(out/f'{i}-top.png'),'bottom':str(out/f'{i}-bottom.png'),
   'visualKey':hashlib.sha256(np.uint8(a/16).tobytes()).hexdigest()})
 return {'validPage':True,'scope':'backpack:main12x5+extension6x5:2560x1440','anchorErrors':errors,'anchorCorrelations':correlations,'cells':cells}
if __name__=='__main__':
 try:
  result=scan(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]));print(json.dumps(result,ensure_ascii=True))
 except Exception as e:print(json.dumps({'validPage':False,'reason':str(e),'cells':[]}));sys.exit(1)
