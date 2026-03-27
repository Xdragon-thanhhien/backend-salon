'use strict';

const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/baberShop';
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const users = db.collection('Users');

  const del = await users.deleteMany({
    $or: [{ email: null }, { email: '' }, { email: { $exists: false } }]
  });
  console.log('deleted_invalid_users=', del.deletedCount);

  try {
    await users.dropIndex('users_email_key');
    console.log('dropped index users_email_key');
  } catch (e) {
    console.log('drop index skipped:', e.message);
  }

  await users.createIndex(
    { email: 1 },
    { unique: true, sparse: true, name: 'users_email_key' }
  );
  console.log('created index users_email_key unique sparse');

  const docs = await users
    .find({}, { projection: { email: 1, Fname: 1, Lname: 1 } })
    .limit(5)
    .toArray();
  console.log('sample_users=', JSON.stringify(docs));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
