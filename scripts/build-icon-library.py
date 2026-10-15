"""Preinstall the free API icon catalog, preserving same-icon identities."""
from pathlib import Path
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,urllib.request,time,shutil
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=root);parser.add_argument('--cached-only',action='store_true');args=parser.parse_args()
target=args.root/'assets';icons=target/'icons';icons.mkdir(parents=True,exist_ok=True)
raw=args.root/'price-summary.raw.json'
if not raw.exists():
 with urllib.request.urlopen('https://poecurrency.top/api/summary?version=2',timeout=25) as response:payload=response.read(5000000)
 raw.write_bytes(payload)
groups=json.loads(raw.read_text(encoding='utf-8-sig'))
items=[];urls={}
for group in groups:
 for row in group['items']:
  url=row.get('item_icon','')
  if not url.startswith('https://cdn.poe2db.tw/image/Art/2DItems/'):continue
  filename=hashlib.sha256(url.encode()).hexdigest()[:24]+'.webp'
  items.append({'id':group['category_label']+'\x1f'+row['engname'],'name':row['item_name'],'english':row['engname'],'icon':'icons/'+filename,'source':url})
  urls[url]=filename
def download(pair):
 url,name=pair;file=icons/name
 if file.exists():return None
 try:
  # The price feed contains a stale directory for this one verified asset.
  resolved=url.replace('/Currency/QuestItems/DamagedKalguuranTriskellion','/QuestItems/DamagedKalguuranTriskellion')
  request=urllib.request.Request(resolved,headers={'User-Agent':'Mozilla/5.0','Referer':'https://poe2db.tw/'})
  with urllib.request.urlopen(request,timeout=20) as res:data=res.read(1024*1024+1)
  if len(data)>1024*1024:raise ValueError('Icon too large')
  file.write_bytes(data)
 except Exception as exc:return {'url':url,'error':str(exc)}
# A cached-only pass does not repeat CDN requests previously rejected with 403.
if args.cached_only:
 errors=[{'url':url,'error':'not_cached'} for url,name in urls.items() if not (icons/name).exists()]
else:
 with ThreadPoolExecutor(max_workers=4) as pool:errors=[e for e in pool.map(download,urls.items()) if e]
(target/'catalog.json').write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
report={'items':len(items),'unique_icons':len(urls),'downloaded':len(list(icons.glob('*.webp'))),'errors':errors}
(args.root/'validation').mkdir(parents=True,exist_ok=True)
(args.root/'validation/icon-library.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='errors'}))
