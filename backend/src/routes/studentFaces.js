const express = require('express');
const Student = require('../models/Student');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const { MAX_FACES, cleanDescriptor, validFaceImage, faceList } = require('../utils/faces');

/**
 * /students/:id/faces - the face samples automated attendance recognises a student by.
 *
 * Unlike staff (who register their own face on My Profile), student samples are registered on their
 * behalf: either derived from the ID photo already on the record, or captured live from a camera.
 * Signatures are always computed in the browser; this only stores them.
 */
const router = express.Router();

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const notFound = () => Object.assign(new Error('Record not found'), { status: 404 });

async function loadStudent(id) {
  const student = await Student.findById(id).select('+faces');
  if (!student) throw notFound();
  return student;
}

router.get(
  '/:id/faces',
  asyncHandler(async (req, res) => {
    const student = await loadStudent(req.params.id);
    res.json(faceList(student));
  })
);

/** POST /students/:id/faces { descriptor, image?, source? } - adds one sample (at most five). */
router.post(
  '/:id/faces',
  asyncHandler(async (req, res) => {
    const descriptor = cleanDescriptor(req.body?.descriptor);
    if (!descriptor) throw badRequest('Invalid face data');
    const { image } = req.body;
    if (!validFaceImage(image)) throw badRequest('Invalid face image');
    const source = req.body?.source === 'Photo' ? 'Photo' : 'Camera';

    const student = await loadStudent(req.params.id);
    if (student.faces.length >= MAX_FACES) throw badRequest(`You can register up to ${MAX_FACES} face samples. Delete one first.`);
    student.faces.push({ descriptor, image, source });
    await student.save();
    if (student.faces.length === 1) Activity.log(req.user.username, 'Registered student face', `${student.name} (${student.studentId})`);
    res.status(201).json(faceList(student));
  })
);

/**
 * POST /students/faces/bulk { samples: [{ student, descriptor, image? }] }
 * Enrols many students in one request, used by "Enrol from photos": the browser reads each student's
 * stored ID photo, computes a signature, and posts the batch.
 *
 * A student who already has a photo-derived sample is skipped rather than accumulating duplicates of
 * the same picture; live camera samples are never touched.
 */
router.post(
  '/faces/bulk',
  asyncHandler(async (req, res) => {
    const samples = Array.isArray(req.body?.samples) ? req.body.samples.slice(0, 500) : [];
    if (!samples.length) throw badRequest('No face samples supplied');

    const ids = [...new Set(samples.map((s) => String(s.student || '')).filter(Boolean))];
    const students = await Student.find({ _id: { $in: ids } }).select('+faces');
    const byId = new Map(students.map((s) => [String(s._id), s]));

    const enrolled = [];
    const skipped = [];
    const errors = [];
    for (const sample of samples) {
      const student = byId.get(String(sample.student));
      if (!student) {
        errors.push({ student: sample.student, message: 'Record not found' });
        continue;
      }
      const descriptor = cleanDescriptor(sample.descriptor);
      if (!descriptor || !validFaceImage(sample.image)) {
        errors.push({ student: String(student._id), name: student.name, message: 'Invalid face data' });
        continue;
      }
      if (student.faces.some((f) => f.source === 'Photo')) {
        skipped.push({ student: String(student._id), name: student.name, message: 'Already enrolled from a photo' });
        continue;
      }
      if (student.faces.length >= MAX_FACES) {
        skipped.push({ student: String(student._id), name: student.name, message: 'Sample limit reached' });
        continue;
      }
      student.faces.push({ descriptor, image: sample.image, source: 'Photo' });
      try {
        await student.save();
        enrolled.push({ student: String(student._id), name: student.name });
      } catch (err) {
        errors.push({ student: String(student._id), name: student.name, message: err.message });
      }
    }
    if (enrolled.length) Activity.log(req.user.username, 'Enrolled student faces from photos', `${enrolled.length} student(s)`);
    res.json({ enrolled, skipped, errors });
  })
);

router.delete(
  '/:id/faces/:faceId',
  asyncHandler(async (req, res) => {
    const student = await loadStudent(req.params.id);
    const face = student.faces.id(req.params.faceId);
    if (!face) throw notFound();
    face.deleteOne();
    await student.save();
    res.json(faceList(student));
  })
);

router.delete(
  '/:id/faces',
  asyncHandler(async (req, res) => {
    const student = await loadStudent(req.params.id);
    student.faces = [];
    await student.save();
    Activity.log(req.user.username, 'Removed student face registration', `${student.name} (${student.studentId})`);
    res.json([]);
  })
);

module.exports = router;
