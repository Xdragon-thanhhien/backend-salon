'use strict';

const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/baberShop';
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const names = collections.map((c) => c.name);
  console.log('collections=', JSON.stringify(names));

  for (const name of ['Users', 'users']) {
    if (!names.includes(name)) continue;
    const col = db.collection(name);
    const indexes = await col.indexes();
    const badCount = await col.countDocuments({
      $or: [{ email: null }, { email: '' }, { email: { $exists: false } }]
    });
    console.log(`${name}_indexes=`, JSON.stringify(indexes));
    console.log(`${name}_bad_count=`, badCount);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
