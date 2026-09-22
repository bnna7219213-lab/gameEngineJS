// 纹理桥接（P3.5 浏览器端 createImageBitmap + Node PNG）：把 GLTF 图像解码为统一的纹理来源，并上传到任意 RHI。
// - 浏览器：字节 → Blob → createImageBitmap → WebGL2 直接 texImage2D(bitmap)（零拷贝 GPU 上传）
// - Node：字节 → decodePNG → {rgba}（SoftwareRHI / 烘焙 / 离线校验）
// 两条路径产物均为 { width, height, rgba? , bitmap? }，uploadTexture 统一转 RHI 纹理。
import { decodePNG } from './image.js';

// 从 GLTF image（data URI / bufferView / 外部 URI）取得原始字节。返回 { bytes, mimeType }
export async function getImageBytes(doc, imageIndex, opts = {}) {
  const gltf = doc.json;
  const img = doc.images[imageIndex];
  if (!img) throw new Error('getImageBytes: 无 image ' + imageIndex);

  if (img.uri && typeof img.uri === 'string' && img.uri.startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(img.uri);
    if (!m) throw new Error('getImageBytes: 非 base64 data URI');
    const atobFn = opts.atob || (typeof globalThis !== 'undefined' ? globalThis.atob : null);
    if (!atobFn) throw new Error('getImageBytes: 运行环境无 atob');
    const bin = atobFn(m[2]);
    const ab = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) ab[i] = bin.charCodeAt(i);
    return { bytes: ab, mimeType: m[1] };
  }

  if (img.bufferView != null) {
    const bv = gltf.bufferViews[img.bufferView];
    const buf = (doc.buffers && doc.buffers[bv.buffer || 0]) || (opts.buffers && opts.buffers[bv.buffer || 0]);
    if (!buf) throw new Error('getImageBytes: 缺 buffer ' + (bv.buffer || 0));
    const off = bv.byteOffset || 0;
    const len = bv.byteLength;
    return { bytes: new Uint8Array(buf, off, len), mimeType: img.mimeType || 'image/png' };
  }

  if (img.uri && opts.fetch) {
    const r = await opts.fetch(img.uri);
    const b = (typeof r.arrayBuffer === 'function') ? await r.arrayBuffer() : (await r.blob().arrayBuffer());
    return { bytes: new Uint8Array(b), mimeType: img.mimeType || 'image/png' };
  }

  throw new Error('getImageBytes: 无法解析 image ' + imageIndex + '（uri=' + JSON.stringify(img.uri) + '）');
}

// 解码 GLTF 图像 → 浏览器返回 { bitmap, width, height }；Node 返回 { rgba, width, height }
export async function decodeGLTFImage(doc, imageIndex, opts = {}) {
  const { bytes, mimeType } = await getImageBytes(doc, imageIndex, opts);
  const createImageBitmap = opts.createImageBitmap || (typeof globalThis !== 'undefined' ? globalThis.createImageBitmap : null);
  if (createImageBitmap) {
    const BlobCtor = opts.Blob || (typeof globalThis !== 'undefined' ? globalThis.Blob : null);
    if (!BlobCtor) throw new Error('decodeGLTFImage: 浏览器环境缺 Blob');
    const blob = new BlobCtor([bytes], { type: mimeType });
    const bm = await createImageBitmap(blob);
    return { bitmap: bm, width: bm.width, height: bm.height };
  }
  // Node：仅 PNG 走纯 JS 解码；其余格式浏览器经 createImageBitmap
  if (mimeType === 'image/png') {
    const dec = decodePNG(bytes);
    return { rgba: dec.rgba, width: dec.width, height: dec.height };
  }
  throw new Error(`decodeGLTFImage: Node 端仅支持 image/png（${mimeType} 请在浏览器用 createImageBitmap）`);
}

// 上传为 RHI 纹理（Software/WebGL2/WebGPU 统一：rgba 直传；浏览器 ImageBitmap 直传 WebGL2 texImage2D）
export function uploadTexture(rhi, image) {
  if (image.bitmap) return rhi.createTexture({ width: image.width, height: image.height, data: image.bitmap });
  return rhi.createTexture({ width: image.width, height: image.height, data: image.rgba });
}

// 便捷流程：解码 + 上传
export async function createImageTexture(rhi, doc, imageIndex, opts = {}) {
  const img = await decodeGLTFImage(doc, imageIndex, opts);
  return uploadTexture(rhi, img);
}
