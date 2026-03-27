'use strict';

const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/baberShop';
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const users = db.collection('users');

  const del = await users.deleteMany({
    $or: [{ email: null }, { email: '' }, { email: { $exists: false } }]
  });
  console.log('deleted_invalid_users_from_users=', del.deletedCount);

  try {
    await users.dropIndex('users_email_key');
    console.log('dropped users.users_email_key');
  } catch (e) {
    console.log('drop users.users_email_key skipped:', e.message);
  }

  await users.createIndex(
    { email: 1 },
    { unique: true, sparse: true, name: 'users_email_key' }
  );
  console.log('recreated users.users_email_key as unique+sparse');

  const badCount = await users.countDocuments({
    $or: [{ email: null }, { email: '' }, { email: { $exists: false } }]
  });
  console.log('users_bad_count_after=', badCount);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
