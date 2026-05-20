// scripts/reset-admin-password.js
// Run: node scripts/reset-admin-password.js
// Resets admin@mylocalbazaar.store password to AdminPass@123 (dev only)

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const password = 'AdminPass@123';
  const hash = await bcrypt.hash(password, 12);

  // Sanity check — confirm the hash we just generated is valid
  const ok = await bcrypt.compare(password, hash);
  console.log(`Hash generated:  ${hash}`);
  console.log(`Self-verify:     ${ok ? 'PASS' : 'FAIL'}`);

  if (!ok) {
    console.error('Hash self-verification failed — aborting DB update');
    process.exit(1);
  }

  const { rows } = await pool.query(
    `UPDATE admins
     SET password_hash = $1
     WHERE email = $2
     RETURNING id, email, full_name, role, is_active`,
    [hash, 'admin@mylocalbazaar.store']
  );

  if (!rows.length) {
    console.error('No admin row updated — check the email address');
    process.exit(1);
  }

  const admin = rows[0];
  console.log('\nAdmin record updated:');
  console.log(`  id:        ${admin.id}`);
  console.log(`  email:     ${admin.email}`);
  console.log(`  full_name: ${admin.full_name}`);
  console.log(`  role:      ${admin.role}`);
  console.log(`  is_active: ${admin.is_active}`);
  console.log('\nPassword reset to: AdminPass@123');

  // Final re-read to confirm round-trip
  const { rows: check } = await pool.query(
    'SELECT password_hash FROM admins WHERE email = $1',
    ['admin@mylocalbazaar.store']
  );
  const roundTrip = await bcrypt.compare(password, check[0].password_hash);
  console.log(`DB round-trip verify: ${roundTrip ? 'PASS' : 'FAIL'}`);

  await pool.end();
  process.exit(roundTrip ? 0 : 1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
