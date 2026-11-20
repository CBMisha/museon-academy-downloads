// Runtime contrast is derived from the user's confirmed colors, never from a
// selectable preset palette. Branding remains intact; only UI/backplates adapt.
const mix=(a,b,t)=>a.map((value,index)=>value*(1-t)+b[index]*t);
const css=rgb=>'rgb('+rgb.map(x=>Math.round(x)).join(' ')+')';
const linear=value=>{const x=value/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
export const luminance=rgb=>.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
export function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function bestForeground(background,preferred){
  if(preferred&&contrastRatio(background,preferred)>=7)return preferred;
  return contrastRatio(background,[0,0,0])>=contrastRatio(background,[255,255,255])?[0,0,0]:[255,255,255];
}
function softened(foreground,background,target){
  let answer=foreground;
  for(let t=.02;t<=.88;t+=.02){const candidate=mix(foreground,background,t);if(contrastRatio(candidate,background)>=target)answer=candidate;else break;}
  return answer;
}
export function readColor(value){
  if(typeof value!=='string'||!CSS.supports('color',value))throw new Error('Provide valid opaque paper, ink and background colors.');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const context=canvas.getContext('2d');context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);
  const pixel=Array.from(context.getImageData(0,0,1,1).data);
  if(pixel[3]!==255)throw new Error('Paper, ink and background colors must be opaque.');
  return pixel.slice(0,3);
}
export function applyTheme(design){
  const background=readColor(design.background),paper=readColor(design.paper),ink=readColor(design.ink);
  const text=bestForeground(background,ink),surfaceText=bestForeground(paper,ink);
  const surface=paper,root=document.documentElement;
  const errorCandidate=luminance(surface)>.35?[145,42,48]:[255,185,189];
  const error=contrastRatio(errorCandidate,surface)>=4.5?errorCandidate:surfaceText;
  const variables={
    '--backdrop':css(background),'--text':css(text),'--muted':css(softened(text,background,4.7)),
    '--surface':css(surface),'--surface-text':css(surfaceText),'--surface-muted':css(softened(surfaceText,surface,4.7)),
    '--surface-hover':css(mix(surface,surfaceText,.055)),
    '--surface-border':css(softened(surfaceText,surface,3.1)),
    '--page-border':css(softened(text,background,3.1)),
    '--progress-track':css(mix(background,text,.18)),'--focus':css(text),'--error':css(error),
  };
  for(const [name,value]of Object.entries(variables))root.style.setProperty(name,value);
  root.style.colorScheme=luminance(background)<.2?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',css(background));
}
export function prepareLogoArtwork(image,paperColor){
  const sample=document.createElement('canvas');sample.width=sample.height=64;
  const context=sample.getContext('2d');context.drawImage(image,0,0,64,64);
  const pixels=context.getImageData(0,0,64,64).data,paper=readColor(paperColor);
  let onBlack=0,onWhite=0,onPaper=0,weight=0;
  for(let i=0;i<pixels.length;i+=4){
    const alpha=pixels[i+3]/255;if(alpha<.06)continue;
    const rgb=[pixels[i],pixels[i+1],pixels[i+2]];
    // Log contrast weights a broad range of logo colors rather than allowing a
    // single very bright pixel to decide the backing for the whole mark.
    onBlack+=Math.log(contrastRatio(rgb,[0,0,0]))*alpha;
    onWhite+=Math.log(contrastRatio(rgb,[255,255,255]))*alpha;
    onPaper+=Math.log(contrastRatio(rgb,paper))*alpha;weight+=alpha;
  }
  const backing=onWhite>=onBlack?'#ffffff':'#101215';
  document.documentElement.style.setProperty('--logo-surface',backing);
  if(!weight||Math.exp(onPaper/weight)>=3.2)return image;
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  const scale=Math.min(1,1024/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const padding=Math.max(12,Math.round(Math.min(w,h)*.065));
  const artwork=document.createElement('canvas');artwork.width=w+padding*2;artwork.height=h+padding*2;
  const output=artwork.getContext('2d');output.fillStyle=backing;output.fillRect(0,0,artwork.width,artwork.height);output.drawImage(image,padding,padding,w,h);
  return artwork;
}
