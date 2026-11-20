import { Box3, LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import decoderSource from 'three/addons/libs/draco/gltf/draco_decoder.js';

const manager = new LoadingManager();
manager.setURLModifier(url => {
  if (/^(blob:|data:)/i.test(url)) return url;
  throw new Error('Use a self-contained GLB with all textures and buffers embedded.');
});
const decoderURL = URL.createObjectURL(new Blob([decoderSource], {type: 'text/javascript'}));
const decoderManager = new LoadingManager();
decoderManager.setURLModifier(() => decoderURL);
const draco = new DRACOLoader(decoderManager).setDecoderConfig({type: 'js'});
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(draco);

export async function readModel(blob) {
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength < 20 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) {
    throw new Error('Invalid GLB');
  }
  const {scene} = await loader.parseAsync(bytes, '');
  const bounds = new Box3().setFromObject(scene);
  let hasMesh = false;
  scene.traverse(node => { if (node.isMesh && node.geometry?.attributes.position?.count) hasMesh = true; });
  if (!hasMesh || bounds.isEmpty() || ![...bounds.min, ...bounds.max].every(Number.isFinite)) {
    disposeModel(scene);
    throw new Error('The model has no visible geometry');
  }
  return scene;
}

export function disposeModel(scene) {
  const resources = new Set();
  scene?.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials.filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const item of resources) item.dispose();
}
