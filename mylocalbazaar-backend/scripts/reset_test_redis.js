// scripts/reset_test_redis.js
// Clears OTP/cooldown Redis keys for test phone numbers before running newman

require('dotenv').config();
const { createClient } = require('redis');

async function main() {
  const redisConfig = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : { socket: { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT) || 6379 } };

  const client = createClient(redisConfig);
  await client.connect();

  const phones   = ['9999999999', '8888888888', '7777777777'];
  const purposes = ['login', 'register', 'customer_login', 'merchant_login', 'admin_2fa'];
  const keys     = [];

  for (const phone of phones) {
    for (const purpose of purposes) {
      keys.push(`mlb:otp:${phone}:${purpose}`);
      keys.push(`mlb:otp_attempts:${phone}:${purpose}`);
      keys.push(`mlb:otp_cooldown:${phone}:${purpose}`);
    }
  }

  // Also clear admin 2FA OTP
  keys.push('mlb:otp:admin@mylocalbazaar.store:admin_2fa');
  keys.push('mlb:otp_attempts:admin@mylocalbazaar.store:admin_2fa');
  keys.push('mlb:otp_cooldown:admin@mylocalbazaar.store:admin_2fa');

  // Clear admin pending 2FA token (will be reset by new login)
  const adminPendingKeys = await client.keys('mlb:admin_2fa_pending:*');
  keys.push(...adminPendingKeys);

  let deleted = 0;
  for (const key of keys) {
    const n = await client.del(key);
    if (n > 0) { console.log('DEL', key); deleted++; }
  }

  console.log(`\nCleared ${deleted} Redis test keys. Ready for newman run.`);
  await client.quit();
}

main().catch(err => { console.error(err); process.exit(1); });
