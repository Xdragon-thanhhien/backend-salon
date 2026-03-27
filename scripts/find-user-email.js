'use strict';

const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/baberShop';
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const target = 'tuan.customer@example.com';

  for (const name of ['Users', 'users']) {
    const col = db.collection(name);
    const docs = await col
      .find(
        {
          $or: [{ email: target }, { email: target.toLowerCase() }]
        },
        { projection: { email: 1, Fname: 1, Lname: 1, role: 1, password: 1 } }
      )
      .toArray();

    console.log(name, 'count=', docs.length, 'docs=', JSON.stringify(docs));
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
