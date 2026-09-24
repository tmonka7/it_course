const express = require('express');
const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');

/**
 * /database - administrator tools for the MongoDB database behind the app.
 *
 *   GET    /                        connection, server and storage overview + per-collection stats
 *   GET    /collections/:model      a page of documents, with sensitive fields redacted
 *   GET    /collections/:model/export   one collection as a JSON download
 *   POST   /restore                 load a backup file (merge or replace)
 *   POST   /indexes                 rebuild indexes to match the current schemas
 *   POST   /collections/:model/clear delete every document in one collection
 *   POST   /reseed                  replace everything with the demo data set
 *
 * Every destructive route needs a `confirm` value typed by the operator, so a stray request cannot
 * empty a collection. Mounted behind requireRole('admin') in routes/index.js.
 */
const router = express.Router();

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const notFound = () => Object.assign(new Error('Record not found'), { status: 404 });

/**
 * Fields that must never leave the server, by model. Passwords are credentials; face descriptors are
 * biometric data that the rest of the app deliberately keeps out of ordinary responses.
 */
const REDACT = {
  User: ['password', 'faces'],
  Student: ['faces'],
  Camera: ['rtspPassword', 'onvifPassword'],
};

/** A document with its sensitive fields replaced by a marker describing what was removed. */
function redact(modelName, doc) {
  const fields = REDACT[modelName];
  if (!fields) return doc;
  const out = { ...doc };
  fields.forEach((field) => {
    if (!(field in out)) return;
    const value = out[field];
    out[field] = Array.isArray(value) ? `[redacted: ${value.length} item(s)]` : '[redacted]';
  });
  return out;
}

/** Resolves a model by name, rejecting anything that is not a registered model. */
function modelByName(name) {
  if (!mongoose.modelNames().includes(name)) throw notFound();
  return mongoose.model(name);
}

/**
 * Per-collection storage statistics. `collection.stats()` was removed in driver 6, so this uses the
 * $collStats aggregation stage, falling back to a plain count on deployments that refuse it.
 */
async function collectionStats(model) {
  const base = { name: model.modelName, collection: model.collection.collectionName };
  try {
    const [stats] = await model.collection.aggregate([{ $collStats: { storageStats: {} } }]).toArray();
    const s = stats?.storageStats || {};
    return {
      ...base,
      count: s.count ?? (await model.estimatedDocumentCount()),
      size: s.size ?? 0,
      storageSize: s.storageSize ?? 0,
      indexCount: s.nindexes ?? 0,
      indexSize: s.totalIndexSize ?? 0,
      avgObjSize: s.avgObjSize ?? 0,
    };
  } catch {
    // A brand-new collection does not exist yet, and some hosts disable $collStats.
    return { ...base, count: await model.estimatedDocumentCount().catch(() => 0), size: 0, storageSize: 0, indexCount: 0, indexSize: 0, avgObjSize: 0, statsUnavailable: true };
  }
}

/** GET /database - everything the overview panel shows. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { connection } = mongoose;
    const names = mongoose.modelNames().sort();
    // connection.db is undefined while the app is detached, so nothing here may assume it exists.
    const db = connection.readyState === 1 ? connection.db : null;
    const [collections, dbStats, buildInfo] = await Promise.all([
      db ? Promise.all(names.map((n) => collectionStats(mongoose.model(n)))) : [],
      db ? db.stats().catch(() => null) : null,
      db ? db.admin().buildInfo().catch(() => null) : null, // needs privileges some hosts withhold
    ]);

    res.json({
      connection: {
        // readyState 1 is "connected"; anything else means the app is currently detached.
        state: ['disconnected', 'connected', 'connecting', 'disconnecting'][connection.readyState] || 'unknown',
        host: connection.host,
        port: connection.port,
        database: connection.name,
        mongoVersion: buildInfo?.version || null,
      },
      storage: dbStats
        ? {
            collections: dbStats.collections,
            objects: dbStats.objects,
            dataSize: dbStats.dataSize,
            storageSize: dbStats.storageSize,
            indexes: dbStats.indexes,
            indexSize: dbStats.indexSize,
          }
        : null,
      collections,
      totalDocuments: collections.reduce((sum, c) => sum + (c.count || 0), 0),
    });
  })
);

/** GET /database/collections/:model?page=&pageSize=&q= - a page of documents, redacted. */
router.get(
  '/collections/:model',
  asyncHandler(async (req, res) => {
    const Model = modelByName(req.params.model);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);

    // Free-text search across the model's own string fields only, so a query cannot reach into
    // redacted subdocuments.
    let filter = {};
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const stringPaths = Object.entries(Model.schema.paths)
        .filter(([path, type]) => type.instance === 'String' && !(REDACT[Model.modelName] || []).includes(path))
        .map(([path]) => path);
      const or = stringPaths.map((path) => ({ [path]: re }));
      if (mongoose.Types.ObjectId.isValid(q)) or.push({ _id: q });
      filter = or.length ? { $or: or } : {};
    }

    const [documents, total] = await Promise.all([
      // .select('+faces') is deliberately NOT used: fields hidden by the schema stay hidden, and
      // redact() covers the ones that are selected by default.
      Model.find(filter).sort({ _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Model.countDocuments(filter),
    ]);

    res.json({
      model: Model.modelName,
      collection: Model.collection.collectionName,
      documents: documents.map((d) => redact(Model.modelName, d)),
      redactedFields: REDACT[Model.modelName] || [],
      total,
      page,
      pageSize,
    });
  })
);

/** GET /database/collections/:model/export - one collection as a JSON file. */
router.get(
  '/collections/:model/export',
  asyncHandler(async (req, res) => {
    const Model = modelByName(req.params.model);
    const documents = (await Model.find().lean()).map((d) => redact(Model.modelName, d));
    Activity.log(req.user.username, 'Exported collection', `${Model.modelName} (${documents.length} documents)`);
    res.setHeader('Content-Disposition', `attachment; filename="${Model.collection.collectionName}-${Date.now()}.json"`);
    res.json({ exportedAt: new Date(), model: Model.modelName, count: documents.length, data: { [Model.modelName]: documents } });
  })
);

/** Indexes rebuilt to match the current schemas; reports what changed per model. */
router.post(
  '/indexes',
  asyncHandler(async (req, res) => {
    const results = [];
    for (const name of mongoose.modelNames().sort()) {
      try {
        // syncIndexes returns the names of indexes it had to drop to match the schema.
        const dropped = await mongoose.model(name).syncIndexes();
        results.push({ model: name, dropped: Array.isArray(dropped) ? dropped : [] });
      } catch (err) {
        results.push({ model: name, error: err.message });
      }
    }
    Activity.log(req.user.username, 'Rebuilt database indexes', `${results.length} collections`);
    res.json({ results });
  })
);

/**
 * POST /database/collections/:model/clear { confirm }
 * `confirm` must be the model name, so the operator has typed what they are emptying.
 */
router.post(
  '/collections/:model/clear',
  asyncHandler(async (req, res) => {
    const Model = modelByName(req.params.model);
    if (req.body?.confirm !== Model.modelName) {
      throw badRequest(`Type "${Model.modelName}" to confirm clearing this collection`);
    }
    const { deletedCount } = await Model.deleteMany({});
    Activity.log(req.user.username, 'Cleared collection', `${Model.modelName} (${deletedCount} documents)`);
    res.json({ model: Model.modelName, deletedCount });
  })
);

/**
 * POST /database/restore { data | file contents, mode, confirm }
 *
 * `data` is the `data` object of a backup file: { ModelName: [documents] }.
 *   mode "merge"   - upserts by _id, leaving documents the file does not mention alone
 *   mode "replace" - empties each collection named in the file first (needs confirm: "REPLACE")
 *
 * Documents go in through the driver rather than through Mongoose validation, because a backup is
 * already-valid data and its _id values must be preserved exactly.
 */
router.post(
  '/restore',
  asyncHandler(async (req, res) => {
    const payload = req.body?.data && typeof req.body.data === 'object' ? req.body.data : null;
    if (!payload) throw badRequest('The backup file must contain a "data" object');
    const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
    if (mode === 'replace' && req.body?.confirm !== 'REPLACE') {
      throw badRequest('Type "REPLACE" to confirm overwriting these collections');
    }

    const known = mongoose.modelNames();
    const results = [];
    let restored = 0;

    for (const [name, documents] of Object.entries(payload)) {
      if (!known.includes(name)) {
        results.push({ model: name, skipped: 'Unknown collection' });
        continue;
      }
      if (!Array.isArray(documents)) {
        results.push({ model: name, skipped: 'Not a list of documents' });
        continue;
      }
      const Model = mongoose.model(name);
      try {
        if (mode === 'replace') await Model.deleteMany({});
        if (documents.length) {
          // Upsert by _id so a merge is repeatable and a replace keeps the original ids.
          const writes = documents.map((doc) => {
            const { _id, ...rest } = doc;
            const id = _id && mongoose.Types.ObjectId.isValid(_id) ? new mongoose.Types.ObjectId(String(_id)) : new mongoose.Types.ObjectId();
            return { replaceOne: { filter: { _id: id }, replacement: rest, upsert: true } };
          });
          const out = await Model.collection.bulkWrite(writes, { ordered: false });
          // Every write either inserts a new document or replaces an existing one, so those two counts
          // cover it. modifiedCount is deliberately left out: it overlaps matchedCount on a replace.
          const count = (out.upsertedCount || 0) + (out.matchedCount || 0);
          restored += count;
          results.push({ model: name, restored: count, inFile: documents.length });
        } else {
          results.push({ model: name, restored: 0, inFile: 0 });
        }
      } catch (err) {
        results.push({ model: name, error: err.message, inFile: documents.length });
      }
    }

    Activity.log(req.user.username, `Restored database (${mode})`, `${restored} documents across ${results.length} collections`);
    res.json({ mode, restored, results });
  })
);

/** POST /database/reseed { confirm } - wipes everything and reloads the demo data. */
router.post(
  '/reseed',
  asyncHandler(async (req, res) => {
    if (req.body?.confirm !== 'RESEED') throw badRequest('Type "RESEED" to confirm replacing all data');
    // Required lazily: seed.js pulls in every model, and loading it on startup is needless work.
    const { seedDatabase } = require('../seed');
    const counts = await seedDatabase();
    // The log is written after the wipe, so it survives.
    Activity.log(req.user.username, 'Reseeded the database', `${counts.students} students, ${counts.courses} courses`);
    res.json({ success: true, counts });
  })
);

module.exports = router;
