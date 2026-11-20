import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';

const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
// A developer can build against an external dependency checkout without leaving
// node_modules in the portable skill: UNBOXING_DEPENDENCY_ROOT=/path/to/project.
const dependencyRoot=process.env.UNBOXING_DEPENDENCY_ROOT||root;
const esbuildPath=require.resolve('esbuild',{paths:[dependencyRoot,root]});
const {build}=require(esbuildPath);
await mkdir(path.join(root,'dist'),{recursive:true});
await build({
  absWorkingDir:root,entryPoints:['app.js'],outfile:'dist/app.js',bundle:true,
  format:'esm',target:'es2022',minify:true,legalComments:'inline',
  nodePaths:[path.join(dependencyRoot,'node_modules')],
  plugins:[{name:'offline-draco',setup(builder){builder.onLoad({filter:/draco_decoder\.js$/},async({path:filename})=>({contents:await readFile(filename,'utf8'),loader:'text'}));}}],
});
await copyFile(path.join(root,'index.html'),path.join(root,'dist/index.html'));
await copyFile(path.join(root,'style.css'),path.join(root,'dist/style.css'));
console.log('Built three static shell files in '+path.join(root,'dist'));
