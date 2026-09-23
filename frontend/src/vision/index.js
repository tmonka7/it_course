import { t } from '../i18n';

/**
 * In-browser object detection and face recognition (models run in ./worker.js with onnxruntime-web).
 *
 *   await loadModels(['yolo', 'yunet', 'sface'])     - optional warm-up (models are ~20 MB, cached by the browser)
 *   const r = await analyze(videoOrImage, options)   - { width, height, ms, objects: [...], faces: [...] }
 *   matchFace(face.descriptor, registry)             - best registered user above the threshold, or null
 *   drawDetections(canvas, media, result, options)   - boxes over a <video>/<img> shown with object-fit
 */

// COCO class names, in YOLO26n's class order.
export const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle',
  'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
  'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed',
  'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven',
  'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
];
export const className = (id) => t(COCO_CLASSES[id] || `#${id}`);

// SFace cosine similarity: OpenCV suggests 0.363 for "same person"; a little stricter avoids false matches.
export const DEFAULT_MATCH_THRESHOLD = 0.42;

let worker = null;
let nextId = 1;
const pending = new Map();

function failAll(message) {
  pending.forEach(({ reject }) => reject(new Error(message)));
  pending.clear();
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const call = pending.get(data.id);
      if (!call) return;
      pending.delete(data.id);
      if (data.error) call.reject(new Error(data.error));
      else call.resolve(data.result);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      failAll(e.message || 'The AI worker stopped');
      worker.terminate();
      worker = null; // start a fresh one on the next call
    };
  }
  return worker;
}

function call(type, payload, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, ...payload }, transfer);
  });
}

export const loadModels = (models) => call('load', { models });

/** Whether a <video>/<img>/<canvas> currently has a frame to analyse. */
export function frameReady(media) {
  if (!media) return false;
  if (media instanceof HTMLVideoElement) return media.readyState >= 2 && media.videoWidth > 0;
  if (media instanceof HTMLImageElement) return media.complete && media.naturalWidth > 0;
  return media.width > 0 && media.height > 0;
}

/**
 * Runs detection on the current frame. Options: objects, faces, embed (face descriptors), minScore, faceScore.
 * Throws an error with name "SecurityError" when the frame comes from another site that does not allow reading it.
 */
export async function analyze(media, options = {}) {
  const bitmap = await createImageBitmap(media);
  return call('analyze', { ...options, bitmap }, [bitmap]);
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
};

/** registry: [{ _id, name, username, descriptors: number[][] }] -> { user, similarity } for the best match, or null. */
export function matchFace(descriptor, registry, threshold = DEFAULT_MATCH_THRESHOLD) {
  if (!descriptor) return null;
  let best = null;
  registry.forEach((user) => {
    user.descriptors.forEach((d) => {
      const similarity = dot(descriptor, d);
      if (similarity >= threshold && (!best || similarity > best.similarity)) best = { user, similarity };
    });
  });
  return best;
}

/** Where a media element's picture actually sits inside its box for object-fit contain/cover. */
function viewport(media, width, height, fit) {
  const box = media.getBoundingClientRect();
  const scale = fit === 'cover' ? Math.max(box.width / width, box.height / height) : Math.min(box.width / width, box.height / height);
  return { scale, x: (box.width - width * scale) / 2, y: (box.height - height * scale) / 2, box };
}

const PALETTE = ['#1664ff', '#12b76a', '#f79009', '#7a5af8', '#ee46bc', '#06aed4', '#f04438', '#669f2a'];
export const classColor = (id) => PALETTE[id % PALETTE.length];

function label(ctx, text, x, y, color) {
  ctx.font = '600 12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  const top = y - 18 < 0 ? y : y - 18;
  ctx.fillStyle = color;
  ctx.fillRect(x, top, w, 18);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + 4, top + 13);
}

/**
 * Draws a result over `media`. The canvas must cover the same box as the media element.
 * faces may carry `match` ({ user, similarity }) from matchFace; `mirror` flips boxes for a selfie view.
 */
export function drawDetections(canvas, media, result, { fit = 'contain', mirror = false, showLabels = true } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const { scale, x, y, box } = result ? viewport(media, result.width, result.height, fit) : { box: media.getBoundingClientRect() };
  if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  if (!result) return;
  const map = ([x1, y1, x2, y2]) => {
    let left = x + x1 * scale;
    let right = x + x2 * scale;
    if (mirror) [left, right] = [box.width - right, box.width - left];
    return [left, y + y1 * scale, right - left, (y2 - y1) * scale];
  };
  ctx.lineWidth = 2;
  (result.objects || []).forEach((o) => {
    const [l, top, w, h] = map(o.box);
    const color = classColor(o.classId);
    ctx.strokeStyle = color;
    ctx.strokeRect(l, top, w, h);
    if (showLabels) label(ctx, `${className(o.classId)} ${Math.round(o.score * 100)}%`, l, top, color);
  });
  (result.faces || []).forEach((f) => {
    const [l, top, w, h] = map(f.box);
    const color = f.match ? '#12b76a' : '#f79009';
    ctx.strokeStyle = color;
    ctx.setLineDash(f.match ? [] : [6, 4]);
    ctx.strokeRect(l, top, w, h);
    ctx.setLineDash([]);
    if (showLabels) {
      const text = f.match ? `${f.match.user.name} ${Math.round(f.match.similarity * 100)}%` : t('Unknown');
      label(ctx, text, l, top + h + 18 > box.height ? top : top + h + 18, color);
    }
  });
}

/** Square JPEG thumbnail around a face box, as a data URL. */
export function faceThumbnail(media, faceBox, size = 96) {
  const [x1, y1, x2, y2] = faceBox;
  const side = Math.max(x2 - x1, y2 - y1) * 1.3;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(media, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.8);
}
