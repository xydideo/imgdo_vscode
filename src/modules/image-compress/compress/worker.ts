import * as fs from 'fs';
import * as path from 'path';
import UPNG from 'upng-js';
import {
  WorkerCompressRequest,
  WorkerCompressResponse,
  extToCodec,
  CodecKind,
} from './codecs';

type ParentMsg = { type: 'compress'; payload: WorkerCompressRequest };

type ImageLike = { data: Uint8ClampedArray; width: number; height: number };

async function loadJpeg() {
  const decodeMod = await import('@jsquash/jpeg/decode');
  const encodeMod = await import('@jsquash/jpeg/encode');
  return {
    decode: decodeMod.default,
    encode: encodeMod.default,
    initDecode: decodeMod.init,
    initEncode: encodeMod.init,
  };
}

async function loadWebp() {
  const decodeMod = await import('@jsquash/webp/decode');
  const encodeMod = await import('@jsquash/webp/encode');
  return {
    decode: decodeMod.default,
    encode: encodeMod.default,
    initDecode: decodeMod.init,
    initEncode: encodeMod.init,
  };
}

async function loadOxipng() {
  const mod = await import('@jsquash/oxipng/optimise');
  return { optimise: mod.default, init: mod.init };
}

async function readWasmBytes(wasmRoot: string, rel: string): Promise<Uint8Array> {
  const full = path.join(wasmRoot, rel);
  return fs.readFileSync(full);
}

async function compileWasm(wasmRoot: string, rel: string): Promise<WebAssembly.Module> {
  const bytes = await readWasmBytes(wasmRoot, rel);
  return WebAssembly.compile(bytes);
}

function toUint8(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(data);
}

function findOxipngWasm(wasmRoot: string): string {
  const candidates = [
    'oxipng/pkg/squoosh_oxipng_bg.wasm',
    'oxipng/pkg-parallel/squoosh_oxipng_bg.wasm',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(wasmRoot, c))) {
      return c;
    }
  }
  throw new Error('未找到 oxipng wasm');
}

/** quality 0–100 → PNG 色板颜色数；接近满分时走真彩无损 */
function qualityToPngColors(quality: number): number {
  if (quality >= 95) {
    return 0;
  }
  return Math.max(8, Math.min(256, Math.round((quality / 100) * 256)));
}

function flattenAlphaOnWhite(image: ImageLike): ImageLike {
  const src = image.data;
  const data = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] / 255;
    data[i] = Math.round(src[i] * a + 255 * (1 - a));
    data[i + 1] = Math.round(src[i + 1] * a + 255 * (1 - a));
    data[i + 2] = Math.round(src[i + 2] * a + 255 * (1 - a));
    data[i + 3] = 255;
  }
  return { data, width: image.width, height: image.height };
}

async function decodeToImage(
  codec: CodecKind,
  inputBuffer: ArrayBuffer,
  wasmRoot: string
): Promise<ImageLike> {
  const locateFile = (file: string) => file;
  if (codec === 'jpeg') {
    const jpeg = await loadJpeg();
    await jpeg.initDecode(await compileWasm(wasmRoot, 'jpeg/dec/mozjpeg_dec.wasm'), {
      locateFile,
    });
    const imageData = await jpeg.decode(inputBuffer);
    return {
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    };
  }
  if (codec === 'webp') {
    const webp = await loadWebp();
    await webp.initDecode(await compileWasm(wasmRoot, 'webp/dec/webp_dec.wasm'), {
      locateFile,
    });
    const imageData = await webp.decode(inputBuffer);
    return {
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    };
  }
  const decoded = UPNG.decode(inputBuffer);
  const rgba = UPNG.toRGBA8(decoded)[0];
  return {
    data: new Uint8ClampedArray(rgba),
    width: decoded.width,
    height: decoded.height,
  };
}

async function encodeJpeg(image: ImageLike, quality: number, wasmRoot: string): Promise<Uint8Array> {
  const jpeg = await loadJpeg();
  const locateFile = (file: string) => file;
  await jpeg.initEncode(await compileWasm(wasmRoot, 'jpeg/enc/mozjpeg_enc.wasm'), {
    locateFile,
  });
  const flat = flattenAlphaOnWhite(image);
  return toUint8(
    await jpeg.encode(flat as ImageData, {
      quality,
      progressive: true,
      optimize_coding: true,
      trellis_multipass: true,
      trellis_opt_table: true,
      quant_table: 3,
    })
  );
}

async function encodeWebp(image: ImageLike, quality: number, wasmRoot: string): Promise<Uint8Array> {
  const webp = await loadWebp();
  const locateFile = (file: string) => file;
  let useSimd = false;
  try {
    const { simd } = await import('wasm-feature-detect');
    useSimd = await simd();
  } catch {
    useSimd = false;
  }
  const encWasm = useSimd ? 'webp/enc/webp_enc_simd.wasm' : 'webp/enc/webp_enc.wasm';
  await webp.initEncode(await compileWasm(wasmRoot, encWasm), { locateFile });
  return toUint8(
    await webp.encode(image as ImageData, {
      quality,
      method: 6,
    })
  );
}

async function encodePngFromImage(
  image: ImageLike,
  quality: number,
  pngLevel: number,
  wasmRoot: string
): Promise<Uint8Array> {
  const colors = qualityToPngColors(quality);
  const rgba = image.data.buffer.slice(
    image.data.byteOffset,
    image.data.byteOffset + image.data.byteLength
  );
  const quantized = UPNG.encode([rgba], image.width, image.height, colors);

  const oxi = await loadOxipng();
  const rel = findOxipngWasm(wasmRoot);
  await oxi.init(await readWasmBytes(wasmRoot, rel));
  const optimized = toUint8(
    await oxi.optimise(quantized, {
      level: Math.max(0, Math.min(6, pngLevel)),
      interlace: false,
      optimiseAlpha: true,
    })
  );
  const quantizedBytes = toUint8(quantized);
  return optimized.byteLength > 0 && optimized.byteLength < quantizedBytes.byteLength
    ? optimized
    : quantizedBytes;
}

/** 双线性缩放到目标尺寸 */
function resizeImage(src: ImageLike, targetWidth: number, targetHeight: number): ImageLike {
  const tw = Math.max(1, Math.round(targetWidth));
  const th = Math.max(1, Math.round(targetHeight));
  if (tw === src.width && th === src.height) {
    return src;
  }

  const data = new Uint8ClampedArray(tw * th * 4);
  const xRatio = src.width / tw;
  const yRatio = src.height / th;

  for (let y = 0; y < th; y++) {
    const sy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < tw; x++) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = sx - x0;

      const i00 = (y0 * src.width + x0) * 4;
      const i10 = (y0 * src.width + x1) * 4;
      const i01 = (y1 * src.width + x0) * 4;
      const i11 = (y1 * src.width + x1) * 4;
      const out = (y * tw + x) * 4;

      for (let c = 0; c < 4; c++) {
        const v0 = src.data[i00 + c] * (1 - fx) + src.data[i10 + c] * fx;
        const v1 = src.data[i01 + c] * (1 - fx) + src.data[i11 + c] * fx;
        data[out + c] = Math.round(v0 * (1 - fy) + v1 * fy);
      }
    }
  }

  return { data, width: tw, height: th };
}

function applyTargetSize(image: ImageLike, req: WorkerCompressRequest): ImageLike {
  const tw = req.targetWidth;
  const th = req.targetHeight;
  if (!tw || !th || tw <= 0 || th <= 0) {
    return image;
  }
  if (tw === image.width && th === image.height) {
    return image;
  }
  return resizeImage(image, tw, th);
}

async function compressOne(req: WorkerCompressRequest): Promise<WorkerCompressResponse> {
  try {
    const input = fs.readFileSync(req.inputPath);
    const originalSize = input.byteLength;
    const inputCodec = extToCodec(req.ext);
    const outputCodec = extToCodec(req.outputExt || req.ext);
    const inputBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);

    let image = await decodeToImage(inputCodec, inputBuffer, req.wasmRoot);
    image = applyTargetSize(image, req);

    let output: Uint8Array;
    if (outputCodec === 'png') {
      output = await encodePngFromImage(image, req.quality, req.pngLevel ?? 4, req.wasmRoot);
    } else if (outputCodec === 'jpeg') {
      output = await encodeJpeg(image, req.quality, req.wasmRoot);
    } else if (outputCodec === 'webp') {
      output = await encodeWebp(image, req.quality, req.wasmRoot);
    } else {
      throw new Error(`不支持的转换：${req.ext} → ${req.outputExt || req.ext}`);
    }

    const width = image.width;
    const height = image.height;

    if (output.byteLength >= originalSize) {
      return {
        id: req.id,
        ok: true,
        originalSize,
        compressedSize: originalSize,
        width,
        height,
        error: 'skipped-larger',
      };
    }

    fs.mkdirSync(path.dirname(req.outputPath), { recursive: true });
    fs.writeFileSync(req.outputPath, output);

    return {
      id: req.id,
      ok: true,
      outputPath: req.outputPath,
      originalSize,
      compressedSize: output.byteLength,
      width,
      height,
    };
  } catch (err) {
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const { parentPort } = require('worker_threads') as typeof import('worker_threads');

if (parentPort) {
  parentPort.on('message', async (msg: ParentMsg) => {
    if (msg?.type === 'compress') {
      const result = await compressOne(msg.payload);
      parentPort!.postMessage(result);
    }
  });
}
