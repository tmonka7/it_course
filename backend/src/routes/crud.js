const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const Activity = require('../models/Activity');

const PROTECTED_FIELDS = ['_id', '__v', 'createdAt', 'updatedAt'];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function notFound() {
  const err = new Error('Record not found');
  err.status = 404;
  return err;
}

/**
 * Builds a REST router (list / get / create / update / delete) for a Mongoose model.
 *
 * Options:
 *   searchFields  - string fields matched by the `q` query param (case-insensitive)
 *   filterFields  - fields that may be filtered by exact value via query params
 *   buildSearch   - async (regex) => extra $or clauses for `q` (e.g. searching referenced docs)
 *   populate      - populate spec applied to list and get
 *   sort          - default sort
 *   label         - human label used in the activity log
 *   describe      - (doc) => short text describing a record for the activity log
 *   sanitize      - (body, req) => body, applied before create/update
 *   beforeDelete  - async (doc, req) => void; throw to prevent deletion
 *   afterSave     - (doc, req, before) => void, after create (before = null) or update (before = old values)
 */
module.exports = function crudRouter(Model, options = {}) {
  const {
    searchFields = [],
    filterFields = [],
    buildSearch,
    populate,
    sort = { createdAt: -1 },
    label = Model.modelName.toLowerCase(),
    describe = (doc) => doc.name || doc.title || String(doc._id),
    sanitize = (body) => body,
    beforeDelete,
    afterSave,
  } = options;

  const router = express.Router();

  const clean = (body, req) => {
    const data = { ...body };
    PROTECTED_FIELDS.forEach((f) => delete data[f]);
    return sanitize(data, req);
  };

  const withPopulate = (query) => (populate ? query.populate(populate) : query);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 1000);

      const filter = {};
      filterFields.forEach((f) => {
        const v = req.query[f];
        // Only plain strings: rejects operator objects such as ?status[$ne]=x
        if (typeof v === 'string' && v !== '') filter[f] = v;
      });

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (q) {
        const re = new RegExp(escapeRegex(q), 'i');
        const or = searchFields.map((f) => ({ [f]: re }));
        if (buildSearch) or.push(...(await buildSearch(re)));
        if (or.length) filter.$or = or;
      }

      const [items, total] = await Promise.all([
        withPopulate(Model.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize)),
        Model.countDocuments(filter),
      ]);
      res.json({ items, total, page, pageSize });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const doc = await withPopulate(Model.findById(req.params.id));
      if (!doc) throw notFound();
      res.json(doc);
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const doc = await Model.create(clean(req.body, req));
      Activity.log(req.user.username, `Added new ${label}`, describe(doc));
      if (afterSave) await afterSave(doc, req, null);
      res.status(201).json(populate ? await doc.populate(populate) : doc);
    })
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw notFound();
      const before = doc.toObject();
      doc.set(clean(req.body, req));
      await doc.save(); // save() (not findByIdAndUpdate) so hooks and validators run
      Activity.log(req.user.username, `Updated ${label}`, describe(doc));
      if (afterSave) await afterSave(doc, req, before);
      res.json(populate ? await doc.populate(populate) : doc);
    })
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw notFound();
      if (beforeDelete) await beforeDelete(doc, req);
      await doc.deleteOne();
      Activity.log(req.user.username, `Deleted ${label}`, describe(doc));
      res.json({ success: true });
    })
  );

  return router;
};
