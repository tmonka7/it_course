/**
 * Shared rules for stored face samples (SFace embeddings computed in the browser).
 * Used by staff registration (routes/profile.js) and student registration (routes/studentFaces.js)
 * so both store descriptors the same way - matching relies on them being unit length.
 */
const MAX_FACES = 5;
const DESCRIPTOR_LENGTH = 128;
const MAX_FACE_IMAGE_CHARS = 60 * 1024;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Unit-length copy of a 128-number embedding, or null when the input is not one. */
function cleanDescriptor(input) {
  if (!Array.isArray(input) || input.length !== DESCRIPTOR_LENGTH) return null;
  const values = input.map(Number);
  if (!values.every(Number.isFinite)) return null;
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (!norm) return null;
  return values.map((v) => v / norm);
}

/** True when `image` is absent or an acceptably small PNG/JPEG/WebP data URL. */
const validFaceImage = (image) =>
  image === undefined || (typeof image === 'string' && IMAGE_DATA_URL.test(image) && image.length <= MAX_FACE_IMAGE_CHARS);

/** Face samples without their descriptors, for lists shown in the UI. */
const faceList = (doc) => (doc.faces || []).map((f) => ({ _id: f._id, image: f.image, source: f.source, createdAt: f.createdAt }));

module.exports = { MAX_FACES, DESCRIPTOR_LENGTH, MAX_FACE_IMAGE_CHARS, IMAGE_DATA_URL, cleanDescriptor, validFaceImage, faceList };
