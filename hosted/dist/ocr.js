import {initialize,savePictures} from './local-api.js';
import {assessImport} from './import-review.js';
import {parseOCR,subskillRetryGrid} from './ocr-parser.js';
import {identifySprite,contextualSpriteMatch} from './sprite-matcher.js';
import {identifyIngredients,resolveIngredients} from './ingredient-matcher.js';
export {parseOCR} from './ocr-parser.js';
function makeCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas}
async function canvasFor(file){
  const url=URL.createObjectURL(file),img=new Image();
  try{img.src=url;await img.decode();const scale=Math.min(1,2400/Math.max(img.width,img.height));const canvas=makeCanvas(Math.round(img.width*scale),Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas}
  catch{throw Error(`Cannot read ${file.name}. Use a PNG or JPG screenshot.`)}finally{URL.revokeObjectURL(url)}
}
function contrastCanvas(source){
  const canvas=makeCanvas(source.width,source.height),context=canvas.getContext('2d');context.drawImage(source,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){const value=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]<145?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value}
  context.putImageData(pixels,0,0);return canvas;
}
async function recognize(worker,canvas){
  // Shared screenshots are often reduced to ~600 px wide. Enlarge text for OCR
  // while retaining the untouched source pixels for icon/portrait matching.
  let input=canvas;
  if(Math.max(canvas.width,canvas.height)<1800){
    const scale=Math.min(2,2400/Math.max(canvas.width,canvas.height));input=makeCanvas(Math.round(canvas.width*scale),Math.round(canvas.height*scale));input.getContext('2d').drawImage(canvas,0,0,input.width,input.height);
  }
  try{
    const {data}=await worker.recognize(input,{}, {blocks:true,text:true});
    const box=l=>({text:l.text.trim(),confidence:l.confidence/100,x:l.bbox.x0/input.width,y:l.bbox.y0/input.height,w:(l.bbox.x1-l.bbox.x0)/input.width,h:(l.bbox.y1-l.bbox.y0)/input.height});
    return (data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).map(l=>({...box(l),words:(l.words||[]).map(box).filter(w=>w.text)})).filter(l=>l.text);
  }finally{if(input!==canvas)input.width=input.height=1}
}
async function readMissingCells(worker,canvas,lines,catalog,progress){
  const grid=subskillRetryGrid({lines},catalog);if(!grid||grid.every(c=>c.hit))return;
  await worker.setParameters({tessedit_pageseg_mode:'7'});
  try{for(const cell of grid.filter(c=>!c.hit)){
    progress(`Reading the Lv. ${cell.level} subskill…`);
    const crop=makeCanvas(Math.round(cell.w*canvas.width),Math.round(cell.h*canvas.height));
    crop.getContext('2d').drawImage(canvas,cell.x*canvas.width,cell.y*canvas.height,crop.width,crop.height,0,0,crop.width,crop.height);
    let cropped=await recognize(worker,crop);
    if(!parseOCR([{lines:cropped}],catalog).detectedSubskills.length){const contrast=contrastCanvas(crop);cropped.push(...await recognize(worker,contrast));contrast.width=contrast.height=1}
    const remap=l=>({...l,x:cell.x+l.x*cell.w,y:cell.y+l.y*cell.h,w:l.w*cell.w,h:l.h*cell.h});
    lines.push(...cropped.map(l=>({...remap(l),words:(l.words||[]).map(remap)})));
    crop.width=crop.height=1;
  }}finally{await worker.setParameters({tessedit_pageseg_mode:'11'})}
}
export async function readScreenshots(files,progress,sharedWorker=null,pictureIds=[]){
  const {catalog}=await initialize();let worker,index=0;
  try{
    progress('Loading on-device screenshot reader…');
    if(!globalThis.Tesseract)throw Error('The screenshot reader could not load. Connect to the internet and reload, or enter details manually.');
    worker=sharedWorker||await Tesseract.createWorker('eng',1,{workerPath:'/vendor/worker.min.js',corePath:'/vendor',langPath:'/vendor',workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')progress(`Reading screenshot ${index+1} of ${files.length} · ${Math.round(m.progress*100)}%`)}});
    await worker.setParameters({tessedit_pageseg_mode:'11'});
    const results=[],pictures=[],matches=[],ingredientMatches=[];let pictureUnavailable=false,ingredientUnavailable=false;
    for(const file of files){
      progress(`Reading screenshot ${index+1} of ${files.length}…`);const canvas=await canvasFor(file);
      const lines=await recognize(worker,canvas),rawLines=[...lines];
      progress(`Improving contrast · screenshot ${index+1} of ${files.length}…`);
      const contrast=contrastCanvas(canvas),contrastLines=await recognize(worker,contrast);lines.push(...contrastLines);contrast.width=contrast.height=1;
      await readMissingCells(worker,canvas,lines,catalog,progress);
      let portrait;try{portrait=await identifySprite(canvas,lines)}catch{pictureUnavailable=true}
      progress(`Matching ingredient icons · screenshot ${index+1} of ${files.length}…`);
      let icons=[];try{icons=await identifyIngredients(canvas,lines);ingredientMatches.push(...icons)}catch{ingredientUnavailable=true}
      const matched=portrait?.species||contextualSpriteMatch(portrait?.candidates,lines,icons,catalog);if(matched)matches.push(matched);
      results.push({lines,passes:[rawLines,contrastLines]});pictures.push({id:pictureIds[index]||crypto.randomUUID(),pendingReview:true,filename:file.name,mime:file.type||'image/png',blob:file,text:lines,createdAt:new Date().toISOString()});canvas.width=canvas.height=1;index++;
    }
    const parsed=parseOCR(results,catalog),unique=[...new Set(matches)],issues=[];
    // These are loading failures, not ambiguous artwork. Put the explanation
    // in review reasons, which the batch screen actually displays.
    if(pictureUnavailable)issues.push('Pokémon picture matching could not load. Reconnect, choose Download for offline use, and wait for Ready before uploading again.');
    if(ingredientUnavailable)issues.push('Ingredient picture matching could not load. Reconnect, choose Download for offline use, and wait for Ready before uploading again.');
    if(unique.length===1){
      const p=catalog.species.find(p=>p.name===unique[0]);
      if(!parsed.fields.species){parsed.fields.species=p.name;parsed.warnings.unshift(`Picture match: ${p.displayName}. Confirm the species before saving; nicknames do not identify a species.`)}
      else if(parsed.fields.species!==p.name){delete parsed.fields.species;issues.push('The name and portrait disagree.');parsed.warnings.unshift(`The name and picture disagree. The picture suggests ${p.displayName}; choose the correct species.`)}
    }else if(unique.length>1){delete parsed.fields.species;parsed.warnings.unshift('The screenshots appear to contain different Pokémon. Use one Pokémon per photo mode, or select photos of the same Pokémon.')}
    if(!parsed.fields.species)parsed.warnings.unshift(pictureUnavailable?'Picture matching is unavailable offline until its reference file has loaded. Choose the species manually.':'Could not confidently identify the species. Choose it manually; the other extracted fields are kept.');
    const ingredients=resolveIngredients(ingredientMatches,catalog.species.find(p=>p.name===parsed.fields.species));
    parsed.ingredientMatches=ingredientMatches;
    parsed.fields.ingredients=ingredients.ingredients;
    const p=catalog.species.find(p=>p.name===parsed.fields.species);
    if(p?.ingredient0.length===1)parsed.fields.ingredients[0]=p.ingredient0[0].ingredient.name;
    issues.push(...ingredients.warnings.filter(w=>/disagree|does not match/.test(w)));
    parsed.warnings.unshift(...ingredients.warnings);
    if(ingredientUnavailable)parsed.warnings.push('Ingredient picture references are unavailable. Confirm the ingredient slots manually.');
    if(!parsed.text.trim())parsed.warnings.unshift('No readable text found. Enter the details manually.');
    parsed.review=assessImport(parsed,results,catalog,{pictureSpecies:unique.length===1?unique[0]:null,issues});
    parsed.imageIds=await savePictures(pictures);return parsed;
  }finally{if(worker&&!sharedWorker)await worker.terminate()}
}

// Reuse one OCR worker while processing independent photos sequentially.
export function createScreenshotReader(){
  let worker,report=()=>{};
  return {
    async read(files,progress,pictureIds=[]){
      report=progress;
      if(!worker){
        report('Loading on-device screenshot reader…');
        if(!globalThis.Tesseract)throw Error('The screenshot reader could not load. Reload or enter details manually.');
        worker=await Tesseract.createWorker('eng',1,{workerPath:'/vendor/worker.min.js',corePath:'/vendor',langPath:'/vendor',workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')report(`Reading text · ${Math.round(m.progress*100)}%`)}});
      }
      return readScreenshots(files,progress,worker,pictureIds);
    },
    async close(){if(worker)await worker.terminate();worker=null}
  };
}
