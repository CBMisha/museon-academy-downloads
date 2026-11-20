#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsConstants from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const VERSION = '1.0.0';
const EXPECTED = {'@gltf-transform/core':'4.2.1','@gltf-transform/extensions':'4.2.1','@gltf-transform/functions':'4.2.1','meshoptimizer':'0.25.0','sharp':'0.35.5','draco3dgltf':'1.5.7'};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const root = path.dirname(fileURLToPath(import.meta.url));

function argumentsFor(argv) {
  const positional = [], options = {maxTextureSize:1024, quality:85};
  for (let i=0; i<argv.length; i++) {
    const value=argv[i];
    if (value==='--help'||value==='-h') return {help:true};
    if (value==='--max-texture-size') options.maxTextureSize=Number(argv[++i]);
    else if (value==='--quality') options.quality=Number(argv[++i]);
    else if (value==='--dependencies-dir') options.dependenciesDir=argv[++i];
    else if (value.startsWith('--')) throw new Error('Unknown option: '+value);
    else positional.push(value);
  }
  if (positional.length!==2) throw new Error('Usage: node optimize-glb.mjs SOURCE.glb TARGET.glb [--max-texture-size 1024] [--quality 85]');
  if (!Number.isInteger(options.maxTextureSize)||options.maxTextureSize<64||options.maxTextureSize>4096) throw new Error('--max-texture-size must be an integer from 64 to 4096.');
  if (!Number.isInteger(options.quality)||options.quality<1||options.quality>100) throw new Error('--quality must be an integer from 1 to 100.');
  if (argv.includes('--dependencies-dir')&&!options.dependenciesDir) throw new Error('--dependencies-dir requires a path.');
  return {source:path.resolve(positional[0]),target:path.resolve(positional[1]),...options};
}

function parseGLB(bytes) {
  assert.ok(bytes.length>=20,'Input is not a GLB file.');
  assert.equal(bytes.toString('utf8',0,4),'glTF','Input is not a GLB file.');
  assert.equal(bytes.readUInt32LE(4),2,'Only GLB 2.0 is supported.');
  assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB length mismatch.');
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a,'GLB must contain a JSON chunk.');
  const jsonLength=bytes.readUInt32LE(12);
  assert.ok(20+jsonLength<=bytes.length,'GLB JSON chunk exceeds file length.');
  const json=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  for (const value of [...json.buffers??[],...json.images??[]]) assert.ok(!value.uri||value.uri.startsWith('data:'),'Input must be self-contained; external buffer/image URIs are not supported.');
  return json;
}

async function exists(file) { try { await fs.access(file); return true; } catch(error) { if(error.code==='ENOENT')return false; throw error; } }

async function main() {
  const args=argumentsFor(process.argv.slice(2));
  if(args.help){console.log('Usage: node optimize-glb.mjs SOURCE.glb TARGET.glb [--max-texture-size 1024] [--quality 85] [--dependencies-dir PROJECT]');return;}
  if(path.extname(args.source).toLowerCase()!=='.glb'||path.extname(args.target).toLowerCase()!=='.glb')throw new Error('Both source and target must use the .glb extension.');
  const sourceReal=await fs.realpath(args.source);
  await fs.mkdir(path.dirname(args.target),{recursive:true});
  const targetParent=await fs.realpath(path.dirname(args.target));
  const target=path.join(targetParent,path.basename(args.target));
  if(sourceReal.toLowerCase()===target.toLowerCase())throw new Error('Source and target must be different. Original model will not be overwritten.');
  const sourceBytes=await fs.readFile(sourceReal),sourceJSON=parseGLB(sourceBytes);
  const settings={maxTextureSize:args.maxTextureSize,quality:args.quality,dataTextureMode:'lossless-webp',geometry:'meshopt-medium',simplify:false};
  const sourceHash=sha256(sourceBytes),cacheKey=sha256(JSON.stringify({sourceHash,settings,version:VERSION,dependencies:EXPECTED}));
  const resolve=createRequire(path.join(args.dependenciesDir?path.resolve(args.dependenciesDir):root,'package.json'));
  const {NodeIO,PropertyType,Logger}=resolve('@gltf-transform/core');
  const {ALL_EXTENSIONS,EXTTextureWebP}=resolve('@gltf-transform/extensions');
  const {dedup,prune,meshopt,getBounds,listTextureSlots}=resolve('@gltf-transform/functions');
  const {MeshoptEncoder,MeshoptDecoder}=resolve('meshoptimizer');
  const knownExtensions=new Set(ALL_EXTENSIONS.map(extension=>extension.EXTENSION_NAME));
  const unknownExtensions=(sourceJSON.extensionsUsed??[]).filter(name=>!knownExtensions.has(name));
  if(unknownExtensions.length)throw new Error('Cannot safely preserve unrecognized glTF extensions: '+unknownExtensions.join(', ')+'. Source was not modified.');
  // ndarray-pixels can load its own Sharp. Reuse that exact native module to avoid
  // loading incompatible libvips DLL versions in the same Windows process.
  let sharp;try{sharp=createRequire(resolve.resolve('ndarray-pixels'))('sharp');}catch{sharp=resolve('sharp');}
  const warnings=[];
  for(const [name,expected]of Object.entries(EXPECTED)){
    try {
      let folder=path.dirname(resolve.resolve(name)),found;
      for(let depth=0;depth<5&&!found;depth++){
        try{const pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));if(pkg.name===name)found=pkg.version;}catch{}
        folder=path.dirname(folder);
      }
      if(name==='sharp')found=sharp.versions.sharp;
      if(found&&found!==expected)warnings.push('Dependency '+name+' is '+found+'; pinned version is '+expected+'.');
    }catch(error){if(name!=='draco3dgltf')throw error;}
  }
  await MeshoptEncoder.ready;await MeshoptDecoder.ready;
  const dependencies={'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder};
  if(sourceJSON.extensionsUsed?.includes('KHR_draco_mesh_compression')){
    const draco=resolve('draco3dgltf');dependencies['draco3d.decoder']=await draco.createDecoderModule();
  }
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(dependencies);
  function documentSummary(doc){
    const resource=doc.getRoot();
    let triangles=0;for(const mesh of resource.listMeshes())for(const primitive of mesh.listPrimitives())if(primitive.getMode()===4)triangles+=(primitive.getIndices()?.getCount()??primitive.getAttribute('POSITION')?.getCount()??0)/3;
    const materials=resource.listMaterials().map(material=>({baseColor:!!material.getBaseColorTexture(),normal:!!material.getNormalTexture(),metallicRoughness:!!material.getMetallicRoughnessTexture(),occlusion:!!material.getOcclusionTexture(),emissive:!!material.getEmissiveTexture()}));
    const scene=resource.listScenes()[0];
    return {triangles,materials,textures:resource.listTextures().length,bounds:scene?getBounds(scene):null};
  }
  async function validate(output,reference){
    const data=await fs.readFile(output);parseGLB(data);
    const doc=await io.read(output),summary=documentSummary(doc);
    assert.ok(doc.getRoot().listMeshes().length,'Model contains no meshes.');
    if(reference){
      assert.equal(summary.triangles,reference.triangles,'Triangle count changed.');
      assert.deepEqual(summary.materials,reference.materials,'PBR material texture assignments changed.');
      // Dedup may merge byte-identical textures, but cannot remove any assigned slot.
      if(reference.bounds&&summary.bounds){
        const scale=Math.max(...reference.bounds.max.map((v,i)=>v-reference.bounds.min[i]));
        const delta=Math.max(...['min','max'].flatMap(k=>summary.bounds[k].map((v,i)=>Math.abs(v-reference.bounds[k][i]))));
        assert.ok(scale===0||delta/scale<0.001,'Model bounds changed by more than 0.1%.');summary.relativeBoundsError=scale===0?0:delta/scale;
      }
    }
    return {bytes:data.length,sha256:sha256(data),summary};
  }
  const metadata=target+'.meta.json',lock=target+'.lock';
  let handle;
  try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString(),cacheKey}));}
  catch(error){if(error.code==='EEXIST')throw new Error('Target is locked by another optimization: '+lock+'. Confirm that process has ended before removing a stale lock.');throw error;}
  const temporary=path.join(targetParent,'.'+path.basename(target,'.glb')+'.tmp-'+randomUUID()+'.glb');
  const temporaryMetadata=metadata+'.tmp-'+randomUUID();
  try{
    if(await exists(target)){
      let previous;try{previous=JSON.parse(await fs.readFile(metadata,'utf8'));}catch{}
      if(previous?.cacheKey!==cacheKey)throw new Error('Target already exists without a matching cache record; use another destination. It was not overwritten.');
      const checked=await validate(target);
      if(checked.sha256!==previous.outputSha256)throw new Error('Existing output differs from its cache record. It was not overwritten.');
      console.log(JSON.stringify({...previous,warnings,cacheHit:true,validated:true}));return;
    }
    if(await exists(metadata))throw new Error('A cache record exists without its model. Use a new target or reconcile the incomplete cache first.');
    const doc=await io.read(sourceReal),before=documentSummary(doc);
    doc.setLogger(new Logger(Logger.Verbosity.SILENT));
    assert.ok(doc.getRoot().listMeshes().length,'Source model contains no meshes.');
    const textureResults=[];let webpUsed=false;
    for(const texture of doc.getRoot().listTextures()){
      const mime=texture.getMimeType(),input=texture.getImage(),slots=listTextureSlots(texture);
      if(!input||!['image/png','image/jpeg','image/webp'].includes(mime)){
        warnings.push('Preserved unsupported texture format '+mime+' in '+(texture.getName()||slots.join(',')||'unnamed texture')+'.');continue;
      }
      const info=await sharp(Buffer.from(input)).metadata();
      if(mime==='image/webp'&&info.width<=args.maxTextureSize&&info.height<=args.maxTextureSize){webpUsed=true;continue;}
      const dataMap=slots.some(slot=>/normal|metallic|roughness|occlusion|clearcoat|transmission|thickness|specular/i.test(slot));
      const output=await sharp(Buffer.from(input)).resize({width:args.maxTextureSize,height:args.maxTextureSize,fit:'inside',withoutEnlargement:true}).webp(dataMap?{lossless:true}:{quality:args.quality}).toBuffer();
      texture.setImage(output).setMimeType('image/webp');webpUsed=true;
      textureResults.push({name:texture.getName(),slots,width:Math.min(info.width,args.maxTextureSize),height:Math.min(info.height,args.maxTextureSize),originalBytes:input.length,optimizedBytes:output.length,lossless:dataMap});
    }
    if(webpUsed)doc.createExtension(EXTTextureWebP).setRequired(true);
    // Geometry has already been decoded by NodeIO; output uses one compression path.
    for(const extension of doc.getRoot().listExtensionsUsed())if(extension.extensionName==='KHR_draco_mesh_compression')extension.dispose();
    // Leave named materials and meshes intact, including extension texture slots.
    // Only deduplicate raw accessors/images and prune unreferenced accessors.
    await doc.transform(dedup({propertyTypes:[PropertyType.ACCESSOR,PropertyType.TEXTURE]}),prune({propertyTypes:[PropertyType.ACCESSOR],keepLeaves:true,keepAttributes:true,keepSolidTextures:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
    await io.write(temporary,doc);
    let result=await validate(temporary,before),usedOriginalBecauseLarger=false;
    if(result.bytes>sourceBytes.length){await fs.writeFile(temporary,sourceBytes);result=await validate(temporary,before);usedOriginalBecauseLarger=true;warnings.push('Compression increased size; published a separate validated copy of the original instead.');}
    const report={optimizerVersion:VERSION,cacheKey,sourceSha256:sourceHash,outputSha256:result.sha256,source:sourceReal,target,originalBytes:sourceBytes.length,optimizedBytes:result.bytes,reductionPercent:(1-result.bytes/sourceBytes.length)*100,settings,validated:true,cacheHit:false,usedOriginalBecauseLarger,before,after:result.summary,textures:textureResults,warnings,createdAt:new Date().toISOString()};
    await fs.writeFile(temporaryMetadata,JSON.stringify(report,null,2));
    // A same-directory hard link is atomic and refuses an existing destination.
    // Filesystems that disallow links use COPYFILE_EXCL, which also never overwrites.
    try{await fs.link(temporary,target);}catch(error){if(['EPERM','ENOTSUP','EACCES'].includes(error.code))await fs.copyFile(temporary,target,fsConstants.constants.COPYFILE_EXCL);else throw error;}
    await fs.link(temporaryMetadata,metadata).catch(async error=>{if(['EPERM','ENOTSUP','EACCES'].includes(error.code))await fs.copyFile(temporaryMetadata,metadata,fsConstants.constants.COPYFILE_EXCL);else throw error;});
    console.log(JSON.stringify(report));
  }finally{
    for(const file of [temporary,temporaryMetadata])await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')console.error('Could not remove temporary file: '+file);});
    await handle.close();await fs.unlink(lock).catch(error=>{if(error.code!=='ENOENT')console.error('Could not remove lock: '+lock);});
  }
}
main().catch(error=>{console.error('Optimization failed: '+error.message);process.exitCode=1;});
