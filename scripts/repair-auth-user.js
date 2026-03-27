'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/baberShop';
  const target = {
    Fname: 'Tuan',
    Lname: 'Nguyen',
    PhoneNo: '0900000000',
    Address: 'Buon Ma Thuot',
    email: 'tuan.customer@example.com',
    passwordPlain: '12345678',
    role: 'customer'
  };

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const usersLower = db.collection('users');
  const usersUpper = db.collection('Users');

  const deleteLegacy = await usersLower.deleteMany({
    $or: [{ PhoneNo: target.PhoneNo }, { email: target.email }]
  });
  console.log('deleted_legacy_from_users=', deleteLegacy.deletedCount);

  const hashed = await bcrypt.hash(target.passwordPlain, 10);

  const upsertRes = await usersUpper.updateOne(
    { email: target.email },
    {
      $set: {
        Fname: target.Fname,
        Lname: target.Lname,
        PhoneNo: target.PhoneNo,
        Address: target.Address,
        email: target.email,
        password: hashed,
        role: target.role,
        Gender: null
      }
    },
    { upsert: true }
  );
  console.log('upsert_users_upper_result=', JSON.stringify(upsertRes));

  const authUser = await usersUpper.findOne(
    { email: target.email },
    { projection: { Fname: 1, Lname: 1, PhoneNo: 1, email: 1, role: 1, password: 1 } }
  );
  console.log('Users_auth_user_exists=', !!authUser);
  console.log('Users_auth_user_snapshot=', JSON.stringify(authUser));

  const leftoverLower = await usersLower.find(
    { $or: [{ PhoneNo: target.PhoneNo }, { email: target.email }] },
    { projection: { Fname: 1, Lname: 1, PhoneNo: 1, email: 1 } }
  ).toArray();
  console.log('users_leftover_conflicts=', JSON.stringify(leftoverLower));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
