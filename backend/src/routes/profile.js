const express = require('express');
const User = require('../models/User');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');

const MAX_FACES = 5; // keep in step with the error message below and the Profile page
const DESCRIPTOR_LENGTH = 128;
const MAX_AVATAR_CHARS = 300 * 1024; // data URL; the page resizes photos to 160 px before uploading
const MAX_FACE_IMAGE_CHARS = 60 * 1024;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

// Unit-length copy of a 128-number embedding, or null when the input is not one.
function cleanDescriptor(input) {
  if (!Array.isArray(input) || input.length !== DESCRIPTOR_LENGTH) return null;
  const values = input.map(Number);
  if (!values.every(Number.isFinite)) return null;
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (!norm) return null;
  return values.map((v) => v / norm);
}

const faceList = (user) => (user.faces || []).map((f) => ({ _id: f._id, image: f.image, createdAt: f.createdAt }));

/** /profile - the signed-in user's own details, password and face samples. */
const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+faces');
    return res.json({ ...user.toJSON(), faceCount: user.faces.length });
  })
);

/** PUT /profile { name, email, phone, title, department, bio, avatar } - username, role and permissions stay with admins. */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const user = req.user;
    const name = text(body.name, 100);
    if (name !== undefined) {
      if (!name) throw badRequest('Name is required');
      user.name = name;
    }
    const email = text(body.email, 200);
    if (email !== undefined) {
      if (email && !EMAIL.test(email)) throw badRequest('Invalid email address');
      user.email = email;
    }
    ['phone', 'title', 'department'].forEach((f) => {
      const v = text(body[f], 100);
      if (v !== undefined) user[f] = v;
    });
    const bio = text(body.bio, 1000);
    if (bio !== undefined) user.bio = bio;
    if (body.avatar !== undefined) {
      if (body.avatar === null || body.avatar === '') user.avatar = undefined;
      else if (typeof body.avatar !== 'string' || !IMAGE_DATA_URL.test(body.avatar) || body.avatar.length > MAX_AVATAR_CHARS) {
        throw badRequest('The photo must be a PNG, JPEG or WebP image under 200 KB');
      } else user.avatar = body.avatar;
    }
    await user.save();
    Activity.log(user.username, 'Updated profile', user.name);
    return res.json(user);
  })
);

router.get(
  '/faces',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+faces');
    return res.json(faceList(user));
  })
);

/** POST /profile/faces { descriptor: number[128], image: dataURL } - adds one face sample (at most five). */
router.post(
  '/faces',
  asyncHandler(async (req, res) => {
    const descriptor = cleanDescriptor(req.body?.descriptor);
    if (!descriptor) throw badRequest('Invalid face data');
    const { image } = req.body;
    if (image !== undefined && (typeof image !== 'string' || !IMAGE_DATA_URL.test(image) || image.length > MAX_FACE_IMAGE_CHARS)) {
      throw badRequest('Invalid face image');
    }
    const user = await User.findById(req.user._id).select('+faces');
    if (user.faces.length >= MAX_FACES) throw badRequest('You can register up to 5 face samples. Delete one first.');
    user.faces.push({ descriptor, image });
    await user.save();
    if (user.faces.length === 1) Activity.log(user.username, 'Registered face', user.name);
    return res.status(201).json(faceList(user));
  })
);

router.delete(
  '/faces/:faceId',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+faces');
    const face = user.faces.id(req.params.faceId);
    if (!face) return res.status(404).json({ message: 'Record not found' });
    face.deleteOne();
    await user.save();
    return res.json(faceList(user));
  })
);

router.delete(
  '/faces',
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $set: { faces: [] } });
    Activity.log(req.user.username, 'Removed face registration', req.user.name);
    return res.json([]);
  })
);

module.exports = router;
