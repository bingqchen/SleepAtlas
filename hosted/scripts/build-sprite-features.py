import json,math,base64
from pathlib import Path
from PIL import Image
N=24
def features(im):
 im=im.convert('RGBA');w,h=im.size;px=list(im.getdata());mask=[]
 for r,g,b,a in px:
  hi=max(r,g,b);lo=min(r,g,b)
  mask.append(a>180 and ((hi-lo>25 and lo<230) or hi<200))
 pts=[(i%w,i//w) for i,m in enumerate(mask) if m]
 if not pts:return None
 x0=min(x for x,y in pts);x1=max(x for x,y in pts);y0=min(y for x,y in pts);y1=max(y for x,y in pts)
 bw=x1-x0+1;bh=y1-y0+1;scale=max(bw,bh)/(N-2);cx=(x0+x1)/2;cy=(y0+y1)/2;out=[]
 for y in range(N):
  for x in range(N):
   vals=[0,0,0]
   for sy in [.25,.75]:
    for sx in [.25,.75]:
     ix=round(cx+(x+sx-N/2)*scale);iy=round(cy+(y+sy-N/2)*scale)
     rgb=px[iy*w+ix][:3] if 0<=ix<w and 0<=iy<h and mask[iy*w+ix] else (255,255,255)
     for j,v in enumerate(rgb):vals[j]+=v/4
   out.extend(round(v) for v in vals)
 return bytes(out)
if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('index',help='JSON sprite index: species, shiny, path');parser.add_argument('output');args=parser.parse_args()
 entries=json.load(open(args.index));result=[]
 for row in entries:
  f=features(Image.open(row['path']))
  if f:result.append({'species':row['species'],'shiny':row['shiny'],'pixels':base64.b64encode(f).decode()})
 Path(args.output).write_text(json.dumps({'size':N,'sourceCommit':'ef1b1e6ce11ea809bef7b9a7249f574b1eb43561','entries':result},separators=(',',':')))
