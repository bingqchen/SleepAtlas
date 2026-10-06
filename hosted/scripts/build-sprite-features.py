import json,math,base64
from pathlib import Path
from PIL import Image
N=24
RENDER_VARIANTS=[(48,.65),(80,.65)]
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
 parser=argparse.ArgumentParser();parser.add_argument('index',help='JSON sprite index: species, shiny, path');parser.add_argument('output');parser.add_argument('--source-commit',required=True,help='Pinned Neroli’s Lab commit for this sprite index');args=parser.parse_args()
 entries=json.load(open(args.index));result=[];rendered=[]
 for row in entries:
  source=Image.open(row['path']).convert('RGBA');f=features(source)
  if f:result.append({'species':row['species'],'shiny':row['shiny'],'pixels':base64.b64encode(f).decode()})
  # The compact in-game portrait can be downsampled and softened, especially
  # after a screenshot is shared. Apply the same variants to every reference.
  for size,opacity in RENDER_VARIANTS:
   image=source.resize((size,size),Image.Resampling.LANCZOS)
   image.putalpha(image.getchannel('A').point(lambda a:round(a*opacity)))
   background=Image.new('RGBA',image.size,'white');background.alpha_composite(image)
   f=features(background)
   if f:rendered.append({'species':row['species'],'shiny':row['shiny'],'renderSize':size,'renderOpacity':opacity,'pixels':base64.b64encode(f).decode()})
 result.extend(rendered)
 Path(args.output).write_text(json.dumps({'size':N,'sourceCommit':args.source_commit,'entries':result},separators=(',',':')))
