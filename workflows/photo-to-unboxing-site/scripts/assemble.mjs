import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, copyFile, lstat, mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const shell = fileURLToPath(new URL('../assets/player/dist/', import.meta.url));
const ownerTag = 'photo-to-unboxing-site/v1';
const marker = '.unboxing-player';

async function exists(file) {
  try { await access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + field);
  return value.trim();
}
function color(value, field) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(field + ' requires an approved six-digit hex color');
  return value;
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex').slice(0, 20);
}
async function checkGLB(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(12);
    const {bytesRead} = await handle.read(header, 0, header.length, 0);
    const {size} = await handle.stat();
    if (bytesRead !== 12 || header.toString('ascii',0,4) !== 'glTF' ||
        header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== size) {
      throw new Error('Expected a complete binary glTF 2 model: ' + path.basename(file));
    }
    return size;
  } finally { await handle.close(); }
}
// Chunk only oversized assets. The player reassembles just the selected model.
async function writeModel(file, bytes, output) {
  const base = 'models/' + await digest(file);
  if (bytes <= 8 * 1024 * 1024) {
    const asset = base + '.glb';
    if (!(await exists(path.join(output,asset)))) await copyFile(file,path.join(output,asset));
    return {url:'./' + asset};
  }
  const parts = [];
  const stream = createReadStream(file, {highWaterMark:4 * 1024 * 1024});
  for await (const chunk of stream) {
    const asset = base + '.part' + String(parts.length + 1).padStart(4,'0') + '.bin';
    await writeFile(path.join(output,asset),chunk);
    parts.push('./' + asset);
  }
  return {parts};
}

async function assemble(manifest, checkout) {
  const sourceDir = path.dirname(path.resolve(manifest));
  const root = path.resolve(checkout);
  const live = path.join(root, 'dist');
  const run = JSON.parse((await readFile(manifest, 'utf8')).replace(/^\uFEFF/, ''));
  const project = {title:requireText(run.title,'title'), language:run.language ?? 'en',
    paper:color(run.paper,'paper'), ink:color(run.ink,'ink'), background:color(run.background,'background'), models:[]};
  if (!['en','zh'].includes(project.language)) throw new Error('language must be en or zh');
  if (!Array.isArray(run.models) || !run.models.length) throw new Error('Supply at least one optimized GLB');
  const logo = path.resolve(sourceDir, requireText(run.logo, 'logo'));
  const suffix = path.extname(logo).toLowerCase();
  if (!['.png','.jpg','.jpeg','.webp','.svg'].includes(suffix)) throw new Error('Unsupported logo file');
  await mkdir(root, {recursive:true});
  const managed = await exists(live);
  if (managed && (!(await lstat(live)).isDirectory() ||
      !(await exists(path.join(root,marker))) || (await readFile(path.join(root,marker),'utf8')).trim() !== ownerTag)) {
    throw new Error('Choose a new site directory. This dist directory belongs to a different project.');
  }
  const lock = path.join(root, '.unboxing-build.lock');
  const guard = await open(lock, 'wx');
  let workspace;
  try {
    workspace = await mkdtemp(path.join(root,'.unboxing-build-'));
    const output = path.join(workspace, 'next');
    await mkdir(path.join(output, 'models'), {recursive:true});
    for (const name of ['index.html','style.css','app.js']) await copyFile(path.join(shell,name),path.join(output,name));
    const logoName = 'logo-' + await digest(logo) + suffix;
    await copyFile(logo,path.join(output,logoName)); project.logo = './' + logoName;
    const sizes = [];
    for (const model of run.models) {
      const name = requireText(model.name,'model name');
      const file = path.resolve(sourceDir,requireText(model.path,'model path'));
      const bytes = await checkGLB(file);
      project.models.push({name,...await writeModel(file,bytes,output)}); sizes.push({name,bytes});
    }
    const htmlFile = path.join(output,'index.html');
    const html = await readFile(htmlFile,'utf8');
    const title = project.title.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    await writeFile(htmlFile,html.replace(/<title>[\s\S]*?<\/title>/i,()=>'<title>'+title+'</title>'));
    await writeFile(path.join(output,'project.json'),JSON.stringify(project,null,2)+'\n');
    if (!managed) await writeFile(path.join(root,marker),ownerTag+'\n');
    const backup = path.join(workspace,'previous');
    if (managed) await rename(live,backup);
    try { await rename(output,live); }
    catch (error) {
      if (managed) {
        try { await rename(backup,live); }
        catch { workspace = null; throw new Error('Restore previous build from ' + backup, {cause:error}); }
      }
      throw error;
    }
    console.log(JSON.stringify({staticDirectory:live,htmlBytes:(await stat(path.join(live,'index.html'))).size,models:sizes}));
  } finally {
    try {
      if (workspace && path.dirname(workspace)===root && path.basename(workspace).startsWith('.unboxing-build-'))
        await rm(workspace,{recursive:true,force:true});
    } finally { await guard.close(); await rm(lock,{force:true}); }
  }
}
const [manifest,checkout] = process.argv.slice(2);
if (!manifest || !checkout) throw new Error('Usage: node assemble.mjs <run.json> <new or managed site directory>');
await assemble(manifest, checkout);
