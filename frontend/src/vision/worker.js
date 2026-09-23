/* Web Worker running the ONNX models off the main thread (see ./index.js for the API).
 *
 *   yolo   YOLO26n object detection (80 COCO classes, NMS-free output)
 *   yunet  YuNet face detection with five landmarks
 *   sface  SFace face embedding (128 numbers) for recognition
 *
 * Pre/post-processing matches OpenCV's FaceDetectorYN / FaceRecognizerSF and Ultralytics' end-to-end export.
 */
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

const BASE = `${import.meta.env.BASE_URL}models/`;
const MODELS = {
  yolo: `${BASE}yolo26n.onnx`,
  yunet: `${BASE}face_detection_yunet_2023mar.onnx`,
  // Full-precision SFace: the int8 version is 4x smaller but ~6x slower in WebAssembly.
  sface: `${BASE}face_recognition_sface_2021dec.onnx`,
};
const SIZE = 640; // YOLO26n and YuNet both take a 640x640 input
const PAD = 114; // letterbox fill, as in Ultralytics
const MAX_FACES_TO_EMBED = 10;
const MIN_FACE_TO_EMBED = 32; // px; smaller faces cannot be recognised reliably, so skip the work
// Where SFace expects the eyes, nose and mouth corners in its 112x112 input.
const TEMPLATE = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

// Serve the WebAssembly binary from our own build, so detection also works on an offline network.
ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// Threads need a cross-origin isolated page; otherwise stay single-threaded (still inside this worker).
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
ort.env.logLevel = 'error';

const sessions = {};
function session(name) {
  if (!sessions[name]) {
    // logSeverityLevel 3: errors only (SFace otherwise logs hundreds of harmless initializer warnings).
    const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 };
    sessions[name] = ort.InferenceSession.create(MODELS[name], options).catch((err) => {
      delete sessions[name]; // allow a retry after a network hiccup
      throw err;
    });
  }
  return sessions[name];
}

const letterboxCanvas = new OffscreenCanvas(SIZE, SIZE);
const letterboxCtx = letterboxCanvas.getContext('2d', { willReadFrequently: true });
const faceCanvas = new OffscreenCanvas(112, 112);
const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });

/** Scales the frame into the top-left of a 640x640 canvas (keeping its aspect ratio) and returns the pixels. */
function letterbox(bitmap) {
  const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
  letterboxCtx.setTransform(1, 0, 0, 1, 0, 0);
  letterboxCtx.fillStyle = `rgb(${PAD},${PAD},${PAD})`;
  letterboxCtx.fillRect(0, 0, SIZE, SIZE);
  letterboxCtx.drawImage(bitmap, 0, 0, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  return { pixels: letterboxCtx.getImageData(0, 0, SIZE, SIZE).data, scale };
}

/** RGBA pixels -> planar float tensor. `order` picks the channel order; `norm` divides each value. */
function toTensor(pixels, width, height, order, norm) {
  const plane = width * height;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    const p = i * 4;
    data[i] = pixels[p + order[0]] / norm;
    data[plane + i] = pixels[p + order[1]] / norm;
    data[2 * plane + i] = pixels[p + order[2]] / norm;
  }
  return new ort.Tensor('float32', data, [1, 3, height, width]);
}
const RGB = [0, 1, 2];
const BGR = [2, 1, 0];

const clampBox = (b, w, h) => [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(w, b[2]), Math.min(h, b[3])];

async function detectObjects(pixels, scale, width, height, minScore) {
  const yolo = await session('yolo');
  const out = await yolo.run({ [yolo.inputNames[0]]: toTensor(pixels, SIZE, SIZE, RGB, 255) });
  const rows = out[yolo.outputNames[0]].data; // 300 x [x1, y1, x2, y2, score, class], best first
  const objects = [];
  for (let i = 0; i < rows.length; i += 6) {
    const score = rows[i + 4];
    if (score < minScore) continue;
    objects.push({
      box: clampBox([rows[i] / scale, rows[i + 1] / scale, rows[i + 2] / scale, rows[i + 3] / scale], width, height),
      score,
      classId: Math.round(rows[i + 5]),
    });
  }
  return objects;
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9);
}

async function detectFaces(pixels, scale, width, height, minScore) {
  const yunet = await session('yunet');
  const out = await yunet.run({ [yunet.inputNames[0]]: toTensor(pixels, SIZE, SIZE, BGR, 1) });
  const candidates = [];
  [8, 16, 32].forEach((stride) => {
    const cols = SIZE / stride;
    const cls = out[`cls_${stride}`].data;
    const obj = out[`obj_${stride}`].data;
    const bbox = out[`bbox_${stride}`].data;
    const kps = out[`kps_${stride}`].data;
    for (let i = 0; i < cls.length; i += 1) {
      const score = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1));
      if (score < minScore) continue;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = (c + bbox[i * 4]) * stride;
      const cy = (r + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride;
      const h = Math.exp(bbox[i * 4 + 3]) * stride;
      const landmarks = [];
      for (let n = 0; n < 5; n += 1) {
        landmarks.push([((kps[i * 10 + 2 * n] + c) * stride) / scale, ((kps[i * 10 + 2 * n + 1] + r) * stride) / scale]);
      }
      candidates.push({ box: [(cx - w / 2) / scale, (cy - h / 2) / scale, (cx + w / 2) / scale, (cy + h / 2) / scale], score, landmarks });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const faces = [];
  candidates.forEach((f) => {
    if (faces.every((k) => iou(f.box, k.box) < 0.3)) faces.push(f);
  });
  return faces.map((f) => ({ ...f, box: clampBox(f.box, width, height) }));
}

/** Least-squares similarity transform (rotation, uniform scale, shift) taking `src` points onto `dst`. */
function similarity(src, dst) {
  const n = src.length;
  const ms = [0, 0];
  const md = [0, 0];
  for (let i = 0; i < n; i += 1) {
    ms[0] += src[i][0] / n;
    ms[1] += src[i][1] / n;
    md[0] += dst[i][0] / n;
    md[1] += dst[i][1] / n;
  }
  let norm = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i += 1) {
    const px = src[i][0] - ms[0];
    const py = src[i][1] - ms[1];
    const qx = dst[i][0] - md[0];
    const qy = dst[i][1] - md[1];
    norm += px * px + py * py;
    a += px * qx + py * qy;
    b += px * qy - py * qx;
  }
  a /= norm;
  b /= norm;
  return { a, b, tx: md[0] - (a * ms[0] - b * ms[1]), ty: md[1] - (b * ms[0] + a * ms[1]) };
}

async function embedFace(bitmap, landmarks) {
  const sface = await session('sface');
  const { a, b, tx, ty } = similarity(landmarks, TEMPLATE);
  // x' = a x - b y + tx, y' = b x + a y + ty
  faceCtx.setTransform(1, 0, 0, 1, 0, 0);
  faceCtx.clearRect(0, 0, 112, 112);
  faceCtx.setTransform(a, b, -b, a, tx, ty);
  faceCtx.drawImage(bitmap, 0, 0);
  const pixels = faceCtx.getImageData(0, 0, 112, 112).data;
  const out = await sface.run({ [sface.inputNames[0]]: toTensor(pixels, 112, 112, RGB, 1) });
  const v = out[sface.outputNames[0]].data;
  let len = 0;
  for (let i = 0; i < v.length; i += 1) len += v[i] * v[i];
  len = Math.sqrt(len) || 1;
  return Array.from(v, (x) => x / len);
}

async function analyze({ bitmap, objects = true, faces = true, embed = true, minScore = 0.4, faceScore = 0.6 }) {
  const started = performance.now();
  const { width, height } = bitmap;
  const { pixels, scale } = letterbox(bitmap);
  const result = { width, height, objects: [], faces: [] };
  if (objects) result.objects = await detectObjects(pixels, scale, width, height, minScore);
  if (faces) {
    result.faces = await detectFaces(pixels, scale, width, height, faceScore);
    if (embed) {
      for (const face of result.faces.slice(0, MAX_FACES_TO_EMBED)) {
        if (face.box[2] - face.box[0] >= MIN_FACE_TO_EMBED) face.descriptor = await embedFace(bitmap, face.landmarks);
      }
    }
  }
  result.ms = Math.round(performance.now() - started);
  return result;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      await Promise.all(data.models.map(session));
      self.postMessage({ id, result: true });
    } else if (type === 'analyze') {
      self.postMessage({ id, result: await analyze(data) });
    }
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  } finally {
    data.bitmap?.close();
  }
};
