import {createScene} from './src/scene.js';
import {makePackaging} from './src/packaging.js';
import {setupRecording} from './src/recording.js';
import {readModel,disposeModel} from './src/models.js';
import {uniformIndex} from './src/random.js';
import {applyTheme,prepareLogoArtwork,readColor} from './src/theme.js';

const $=id=>document.getElementById(id);
let project=null,scene=null,recording=null,language='en',phase='wrap';
let current=null,loading=true,loadError=false,sound=true,revision=0,noticeTimer=0;
let loadedEntry=null,loadedBlob=null;
const say=(en,zh)=>language==='zh'?zh:en;

function notice(message,{error=false,persistent=false}={}){
  clearTimeout(noticeTimer);
  $('status').textContent=message;
  $('status').classList.toggle('error',error);
  if(message&&!persistent)noticeTimer=setTimeout(()=>{$('status').textContent='';},4400);
}
function render(){
  document.documentElement.lang=language==='zh'?'zh-CN':'en';
  $('language').textContent=language==='zh'?'English':'中文';
  $('language').lang=language==='zh'?'en':'zh-CN';
  $('sound').textContent=sound?say('Sound on','声音 开'):say('Sound off','声音 关');
  $('sound').setAttribute('aria-pressed',String(sound));
  $('stage').dataset.loading=String(loading||loadError);
  $('stage').setAttribute('aria-busy',String(loading));
  $('interaction').hidden=phase==='reveal'&&!loading&&!loadError;
  $('result').hidden=phase!=='reveal'||loading||loadError;
  $('result-name').textContent=current?.name??'';
  $('inspect-hint').textContent=say('Drag to rotate · Release to return · Scroll to zoom','拖动旋转 · 松手回正 · 滚轮缩放');
  $('again').textContent=say('Open another','再拆一盒');
  $('again').disabled=loading;
  $('download-model').textContent=say('Download model','下载模型');
  $('download-model').hidden=phase!=='reveal'||loading||loadError||current!==loadedEntry||!loadedBlob;
  $('course-link').textContent=say('Course & downloads','课程与下载');
  $('course-link').hidden=!project?.courseUrl;
  if(project?.courseUrl)$('course-link').href=project.courseUrl;
  $('interaction-hint').textContent=loadError?say('The selected model was not changed. Retry when ready.','保留本次抽中的款式，稍后可以重试。'):say('Drag with your mouse or finger, or use the button.','用鼠标或手指拖动，也可以点击按钮。');
  $('odds-note').textContent=project?.models?.length>1?say(`Each model: 1/${project.models.length} · Independent draws`,`每款概率 1/${project.models.length} · 每次独立抽取`):'';
  const copy=loading?[say('Preparing your box…','正在准备盒子…'),say('Loading…','正在加载…')]:loadError?[say('This model could not load.','模型暂时无法加载。'),say('Try again','重试')]:({
    wrap:[say('Grab the wrap. Pull it away.','捏住薄膜，向外撕开'),say('Peel the wrap','撕开薄膜')],
    tear:[say('Pull the paper strip.','拉开盒身纸条'),say('Pull the strip','拉开纸条')],
    opening:[say('Opening…','正在开盒…'),say('Opening…','正在开盒…')],
    reveal:['',''],
  }[phase]);
  $('instruction').textContent=copy[0];$('action').textContent=copy[1];
  $('action').disabled=loading||(!loadError&&phase==='opening')||!project?.models?.length;
  scene?.setLabels({grabWrap:say('Peel','撕膜'),grabTear:say('Pull','拉条')});
  recording?.refresh();
}

function validateProject(input){
  if(!input||typeof input!=='object'||!Array.isArray(input.models)||!input.models.length)throw new Error('project.json must include at least one model.');
  const resourceURL=value=>{
    if(typeof value!=='string'||!value.trim())throw new Error('A model resource is missing its URL.');
    const url=new URL(value,document.baseURI);
    if(!['http:','https:'].includes(url.protocol))throw new Error('Models must be served over HTTP or HTTPS.');
    return url.href;
  };
  const models=input.models.map((item,index)=>{
    if(!item||typeof item!=='object')throw new Error('Invalid model entry.');
    const hasURL=typeof item.url==='string'&&Boolean(item.url.trim());
    const hasParts=Array.isArray(item.parts)&&item.parts.length>0;
    if(hasURL===hasParts)throw new Error('Each model needs exactly one URL or a nonempty ordered parts array.');
    const resources=hasParts?{parts:item.parts.map(resourceURL)}:{url:resourceURL(item.url)};
    return {name:typeof item.name==='string'&&item.name.trim()?item.name.trim():`Model ${index+1}`,...resources};
  });
  const logo=typeof input.logo==='string'&&input.logo.trim()?new URL(input.logo,document.baseURI).href:'';
  let courseUrl='';
  if(typeof input.courseUrl==='string'&&input.courseUrl.trim()){
    const course=new URL(input.courseUrl,document.baseURI);
    if(['http:','https:'].includes(course.protocol)&&course.origin===location.origin)courseUrl=course.href;
    else console.warn('The optional course URL must be on the same origin; hiding its link.');
  }
  const colors={};
  for(const key of ['paper','ink','background']){
    if(typeof input[key]!=='string'||!input[key].trim())throw new Error(`Confirm and supply ${key} in project.json.`);
    colors[key]='#'+readColor(input[key]).map(channel=>channel.toString(16).padStart(2,'0')).join('');
  }
  return {title:typeof input.title==='string'?input.title.trim():'Unboxing',language:input.language==='zh'?'zh':'en',...colors,logo,courseUrl,models};
}

async function beginRound({retry=false}={}){
  if(loading&&current)return;
  if(!project?.models?.length)return;
  const request=++revision;
  loading=true;loadError=false;notice('');
  if(!retry)current=project.models[uniformIndex(project.models.length)];
  phase='wrap';scene.replay();render();
  try{
    // Repeated independent draws may legitimately select the same model. Its
    // existing scene object and Blob remain usable, so no retransmission or
    // decoding is needed for that round.
    if(current===loadedEntry&&loadedBlob){loading=false;loadError=false;render();return;}
    // Fetch exactly the selected GLB. Browser caching may reuse it on a repeat;
    // unselected models are never prefetched or parsed.
    const chunks=[];
    for(const url of current.parts??[current.url]){
      const response=await fetch(url,{cache:'default'});
      if(!response.ok)throw new Error(`Model resource HTTP ${response.status}`);
      chunks.push(await response.blob());
      if(request!==revision)return;
    }
    // Ordered concatenation restores the original binary GLB without base64 or
    // embedding it in the page. No other model's parts are requested.
    const blob=new Blob(chunks,{type:'model/gltf-binary'});
    const object=await readModel(blob);
    if(request!==revision){disposeModel(object);return;}
    scene.setModel(object);
    loadedEntry=current;loadedBlob=blob;
    loading=false;loadError=false;render();
  }catch(error){
    if(request!==revision)return;
    console.error('Selected model could not load:',error);
    loading=false;loadError=true;render();
  }
}

async function logoImage(url){
  if(!url)return null;
  const image=new Image();image.crossOrigin='anonymous';image.src=url;
  await image.decode();return image;
}
function showFatal(error){
  console.error(error);loading=false;loadError=true;
  $('fatal').hidden=false;$('interaction').hidden=true;$('result').hidden=true;
  $('fatal-message').textContent=say('The experience could not start. Check project.json, the model paths, and WebGL support, then reload.','体验暂时无法启动。请检查 project.json、模型路径及浏览器 WebGL 支持，然后重新加载。');
  $('reload').textContent=say('Reload','重新加载');
}

$('language').onclick=()=>{language=language==='en'?'zh':'en';render();};
$('sound').onclick=()=>{sound=!sound;scene?.setSound(sound);render();};
$('again').onclick=()=>beginRound();
$('download-model').onclick=()=>{
  if(loading||loadError||phase!=='reveal'||current!==loadedEntry||!loadedBlob)return;
  const safeName=(current.name||'model').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,160)||'model';
  const link=document.createElement('a'),url=URL.createObjectURL(loadedBlob);
  link.href=url;link.download=/\.glb$/i.test(safeName)?safeName:safeName+'.glb';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};
$('action').onclick=()=>{if(loadError){beginRound({retry:true});return;}if(!loading){scene?.advance();$('action').disabled=true;}};
$('reload').onclick=()=>location.reload();
document.addEventListener('keydown',event=>{
  if((event.code==='Space'||event.code==='Enter')&&event.target===$('scene')){event.preventDefault();if(phase==='reveal')beginRound();else $('action').click();}
});

async function start(){
  const response=await fetch('./project.json',{cache:'no-cache'});
  if(!response.ok)throw new Error(`Project HTTP ${response.status}`);
  project=validateProject(await response.json());language=project.language;
  applyTheme(project);
  document.title=project.title||'Unboxing';$('brand-name').textContent=project.title||'Unboxing';
  let logo=null;
  try{logo=await logoImage(project.logo);}catch(error){console.warn('Logo unavailable; using the title.',error);}
  let artwork=logo;
  if(logo){
    try{artwork=prepareLogoArtwork(logo,project.paper);}catch(error){console.warn('Logo contrast sampling unavailable; preserving the supplied artwork.',error);}
    $('brand-logo').src=project.logo;$('brand-logo').alt=project.title||'Brand';$('brand-logo').hidden=false;
  }
  scene=createScene({onPhase:next=>{phase=next;render();},onProgress:p=>{$('progress').style.width=`${p*100}%`;}});
  scene.setPackaging(makePackaging({...project,art:artwork}));
  recording=setupRecording({canvas:$('scene'),button:$('record'),labels:()=>language,status:message=>notice(message)});
  render();await beginRound();
}
start().catch(showFatal);
