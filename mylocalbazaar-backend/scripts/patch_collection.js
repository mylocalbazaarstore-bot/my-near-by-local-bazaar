// scripts/patch_collection.js
// Patches the Postman collection to fix admin 2FA flow, IDs, and add address setup step

const fs   = require('fs');
const path = require('path');

const CATEGORY_ID = '5c4038ef-b20c-43f9-97a0-07177bccba2d';
const AREA_ID     = 'b2a91cde-4178-4b78-a86f-ad0a31bc419f';
const MERCHANT_ID = '893bb691-2d87-4481-81a3-5e16a23c4d85';

const colPath = path.join(__dirname, '..', 'MyLocalBazaar_Postman_Collection.json');
const col     = JSON.parse(fs.readFileSync(colPath, 'utf8'));

// Add missing collection variables
const existingVarKeys = col.variable.map(v => v.key);
[
  { key: 'ADMIN_TEMP_TOKEN', value: '' },
  { key: 'TEST_ADDRESS_ID',  value: '' },
  { key: 'TEST_MERCHANT_ID', value: MERCHANT_ID },
].forEach(v => {
  if (!existingVarKeys.includes(v.key)) col.variable.push({ ...v, type: 'string' });
});

function findItem(items, name) {
  for (const item of items) {
    if (item.name && item.name.includes(name)) return item;
    if (item.item) {
      const found = findItem(item.item, name);
      if (found) return found;
    }
  }
  return null;
}

function getOrCreateEvent(item, listen) {
  if (!item.event) item.event = [];
  let ev = item.event.find(e => e.listen === listen);
  if (!ev) {
    ev = { listen, script: { type: 'text/javascript', exec: [] } };
    item.event.push(ev);
  }
  return ev;
}

// 1. Fix Admin Login test — check requires_2fa, save ADMIN_TEMP_TOKEN
const adminLogin = findItem(col.item, 'Admin — Login (Step');
if (adminLogin) {
  const ev = getOrCreateEvent(adminLogin, 'test');
  ev.script.exec = [
    "pm.test('Status 200', () => pm.response.to.have.status(200));",
    "const json = pm.response.json();",
    "pm.test('2FA required', () => pm.expect(json.data.requires_2fa).to.be.true);",
    "if (json.data && json.data.temp_token) {",
    "  pm.collectionVariables.set('ADMIN_TEMP_TOKEN', json.data.temp_token);",
    "}",
  ];
  console.log('Fixed: Admin Login test script');
}

// 2. Fix Admin Verify 2FA body + test
const admin2FA = findItem(col.item, 'Verify 2FA');
if (admin2FA) {
  admin2FA.request.body = {
    mode: 'raw',
    raw: JSON.stringify({ temp_token: '{{ADMIN_TEMP_TOKEN}}', otp: '123456' }, null, 2),
    options: { raw: { language: 'json' } },
  };
  const ev = getOrCreateEvent(admin2FA, 'test');
  ev.script.exec = [
    "pm.test('Status 200', () => pm.response.to.have.status(200));",
    "const json = pm.response.json();",
    "pm.test('Admin token received', () => pm.expect(json.data.tokens).to.exist);",
    "if (json.data && json.data.tokens) {",
    "  pm.collectionVariables.set('ADMIN_TOKEN', json.data.tokens.access_token);",
    "}",
  ];
  console.log('Fixed: Admin Verify 2FA body + test');
}

// 3. Fix Merchant Create Product — real category_id
const createProduct = findItem(col.item, 'Create Product');
if (createProduct && createProduct.request && createProduct.request.body) {
  createProduct.request.body.raw = createProduct.request.body.raw
    .replace(/REPLACE_WITH_CATEGORY_ID/g, CATEGORY_ID);
  console.log('Fixed: Merchant Create Product category_id');
}

// 4. Replace all REPLACE_WITH_ADDRESS_ID with {{TEST_ADDRESS_ID}}
function replaceAddressId(items) {
  for (const item of items) {
    if (item.request) {
      if (item.request.body && item.request.body.raw) {
        item.request.body.raw = item.request.body.raw
          .replace(/REPLACE_WITH_ADDRESS_ID/g, '{{TEST_ADDRESS_ID}}');
      }
      if (item.request.url && item.request.url.raw) {
        item.request.url.raw = item.request.url.raw
          .replace(/REPLACE_WITH_ADDRESS_ID/g, '{{TEST_ADDRESS_ID}}');
      }
      if (item.request.url && item.request.url.query) {
        for (const q of item.request.url.query) {
          if (q.value) q.value = q.value.replace(/REPLACE_WITH_ADDRESS_ID/g, '{{TEST_ADDRESS_ID}}');
        }
      }
    }
    if (item.item) replaceAddressId(item.item);
  }
}
replaceAddressId(col.item);
console.log('Fixed: REPLACE_WITH_ADDRESS_ID -> {{TEST_ADDRESS_ID}}');

// 5. Replace REPLACE_WITH_MERCHANT_ID with actual merchant UUID
function replaceMerchantId(items) {
  for (const item of items) {
    if (item.request && item.request.body && item.request.body.raw) {
      item.request.body.raw = item.request.body.raw
        .replace(/REPLACE_WITH_MERCHANT_ID/g, MERCHANT_ID);
    }
    if (item.item) replaceMerchantId(item.item);
  }
}
replaceMerchantId(col.item);
console.log('Fixed: REPLACE_WITH_MERCHANT_ID -> ' + MERCHANT_ID);

// 6. Add "Customer — Add Address (Setup)" request after Get Profile in AUTH folder
const authFolder = col.item.find(f => f.name && f.name.includes('AUTH'));
if (authFolder && authFolder.item) {
  const alreadyExists = authFolder.item.some(r => r.name && r.name.includes('Add Address'));
  if (!alreadyExists) {
    const profileIdx = authFolder.item.findIndex(r => r.name && r.name.includes('Get Profile'));
    const addAddressReq = {
      name: 'Customer — Add Address (Setup)',
      request: {
        method: 'POST',
        header: [
          { key: 'Authorization', value: 'Bearer {{CUSTOMER_TOKEN}}', type: 'text' },
          { key: 'Content-Type',  value: 'application/json',          type: 'text' },
        ],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            label:         'Home',
            full_name:     'Test Customer',
            phone:         '9999999999',
            address_line1: '123 Test Lane, Kharghar Sector 12',
            area_id:       AREA_ID,
            pincode:       '410210',
            city:          'Navi Mumbai',
            state:         'Maharashtra',
            latitude:      19.0478,
            longitude:     73.0690,
            is_default:    true,
          }, null, 2),
          options: { raw: { language: 'json' } },
        },
        url: {
          raw:  '{{BASE_URL}}/auth/customer/address',
          host: ['{{BASE_URL}}'],
          path: ['auth', 'customer', 'address'],
        },
      },
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            "pm.test('Address created (200 or 201)', () => pm.expect([200,201]).to.include(pm.response.code));",
            "const json = pm.response.json();",
            "if (json.data && json.data.address && json.data.address.id) {",
            "  pm.collectionVariables.set('TEST_ADDRESS_ID', json.data.address.id);",
            "}",
          ],
        },
      }],
    };
    const insertAt = profileIdx >= 0 ? profileIdx + 1 : authFolder.item.length;
    authFolder.item.splice(insertAt, 0, addAddressReq);
    console.log('Added: Customer Add Address step at index ' + insertAt);
  }
}

// Save
const outPath = path.join(__dirname, '..', 'MyLocalBazaar_Postman_Collection_Fixed.json');
fs.writeFileSync(outPath, JSON.stringify(col, null, 2), 'utf8');
console.log('\nSaved -> MyLocalBazaar_Postman_Collection_Fixed.json');

function countReqs(items) {
  let n = 0;
  for (const i of items) {
    if (i.request) n++;
    if (i.item) n += countReqs(i.item);
  }
  return n;
}
console.log('Total requests:', countReqs(col.item));
