import json,math,base64
from PIL import Image
N=24
def features(im):
 im=im.convert('RGBA');w,h=im.size;px=list(im.getdata());mask=[]
 for r,g,b,a in px:
  hi=max(r,g,b);lo=min(r,g,b)
  mask.append(a>180 and ((hi-lo>38 and lo<215) or hi<160))
 # Use largest connected colored component so count pills and lock labels are excluded.
 seen=set();parts=[]
 for i,m in enumerate(mask):
  if not m or i in seen:continue
  seen.add(i);part=[i];stack=[i]
  while stack:
   j=stack.pop();x=j%w;y=j//w
   for k in [j-1 if x else -1,j+1 if x<w-1 else -1,j-w if y else -1,j+w if y<h-1 else -1]:
    if k>=0 and mask[k] and k not in seen:seen.add(k);part.append(k);stack.append(k)
  parts.append(part)
 if not parts:return None
 part=max(parts,key=len)
 x0=min(i%w for i in part);x1=max(i%w for i in part);y0=min(i//w for i in part);y1=max(i//w for i in part)
 if len(part)<30 or min(x1-x0,y1-y0)<8:return None
 scale=max(x1-x0+1,y1-y0+1)/(N-2);cx=(x0+x1)/2;cy=(y0+y1)/2;out=[]
 for y in range(N):
  for x in range(N):
   vals=[0,0,0]
   for sy in [.25,.75]:
    for sx in [.25,.75]:
     ix=math.floor(cx+(x+sx-N/2)*scale+.5);iy=math.floor(cy+(y+sy-N/2)*scale+.5)
     rgb=px[iy*w+ix][:3] if x0<=ix<=x1 and y0<=iy<=y1 and mask[iy*w+ix] else (255,255,255)
     for j,v in enumerate(rgb):vals[j]+=v/4
   out.extend(math.floor(v+.5) for v in vals)
 return bytes(out)
if __name__=='__main__':
 import argparse
 from pathlib import Path
 parser=argparse.ArgumentParser();parser.add_argument('index',help='JSON icon index: name, path');parser.add_argument('output');args=parser.parse_args()
 entries=[]
 for row in json.load(open(args.index)):
  im=Image.open(row['path']).convert('RGBA')
  for opacity in [1,.65,.45]:
   bg=Image.new('RGBA',im.size,(245,245,245,255));variant=im.copy();variant.putalpha(im.getchannel('A').point(lambda a:round(a*opacity)))
   descriptor=features(Image.alpha_composite(bg,variant))
   if descriptor:entries.append({'species':row['name'],'opacity':opacity,'pixels':base64.b64encode(descriptor).decode()})
 Path(args.output).write_text(json.dumps({'size':N,'sourceCommit':'ef1b1e6ce11ea809bef7b9a7249f574b1eb43561','entries':entries},separators=(',',':')))
