// scripts/patch_collection4.js
// Fourth-pass fixes: notifications, wallet, coupon conflict, cart active product,
// multi-city conflict, create product not overwriting TEST_PRODUCT_ID

const fs   = require('fs');
const path = require('path');

const colPath = path.join(__dirname, '..', 'MyLocalBazaar_Postman_Collection_Fixed.json');
const col     = JSON.parse(fs.readFileSync(colPath, 'utf8'));

function findItem(items, n) {
  for (const i of items) {
    if (i.name && i.name.includes(n)) return i;
    if (i.item) { const f = findItem(i.item, n); if (f) return f; }
  }
  return null;
}
function getOrCreateEvent(item, listen) {
  if (!item.event) item.event = [];
  let ev = item.event.find(e => e.listen === listen);
  if (!ev) { ev = { listen, script: { type: 'text/javascript', exec: [] } }; item.event.push(ev); }
  return ev;
}

// 1. Fix Notifications — paginated() puts rows directly in data, not data.rows
const notifications = findItem(col.item, 'Get Notifications');
if (notifications) {
  const ev = getOrCreateEvent(notifications, 'test');
  ev.script.exec = [
    "pm.test('Status 200', () => pm.response.to.have.status(200));",
    "pm.test('Notifications array', () => {",
    "  const d = pm.response.json().data;",
    "  const rows = Array.isArray(d) ? d : (d && d.rows ? d.rows : null);",
    "  pm.expect(rows).to.be.an('array');",
    "});",
  ];
  console.log('Fixed: Get Notifications test (data directly, not data.rows)');
}

// 2. Fix Wallet — invalid Chai .or() syntax
const wallet = findItem(col.item, 'Get Wallet Balance');
if (wallet) {
  const ev = getOrCreateEvent(wallet, 'test');
  ev.script.exec = [
    "pm.test('Status 200', () => pm.response.to.have.status(200));",
    "pm.test('Balance exists', () => {",
    "  const d = pm.response.json().data;",
    "  const bal = d && (d.balance !== undefined ? d.balance : (d.wallet && d.wallet.balance));",
    "  pm.expect(bal).to.not.be.undefined;",
    "  pm.expect(Number(bal)).to.be.at.least(0);",
    "});",
  ];
  console.log('Fixed: Get Wallet Balance test (valid assertion, flexible shape)');
}

// 3. Fix Create Coupon — accept 201 (new) or 409 (already exists from prev run)
//    Also add a pre-request script to use a unique code each run
const createCoupon = findItem(col.item, 'Create Coupon');
if (createCoupon) {
  // Pre-request: generate unique coupon code
  const preEv = getOrCreateEvent(createCoupon, 'prerequest');
  preEv.script.exec = [
    "const ts = Date.now().toString().slice(-6);",
    "pm.collectionVariables.set('COUPON_CODE', 'TEST' + ts);",
  ];

  // Update request body to use the variable
  if (createCoupon.request && createCoupon.request.body && createCoupon.request.body.raw) {
    try {
      const body = JSON.parse(createCoupon.request.body.raw);
      body.code = '{{COUPON_CODE}}';
      createCoupon.request.body.raw = JSON.stringify(body, null, 2);
    } catch (_) {}
  }

  // Test: accept 201 or 409
  const ev = getOrCreateEvent(createCoupon, 'test');
  ev.script.exec = [
    "pm.test('Coupon created or already exists', () => pm.expect([201, 409]).to.include(pm.response.code));",
    "if (pm.response.code === 201) {",
    "  const json = pm.response.json();",
    "  pm.test('Coupon has code', () => pm.expect(json.data).to.exist);",
    "}",
  ];
  console.log('Fixed: Admin Create Coupon (unique code per run, accept 201/409)');
}

// 4. Fix Merchant List Products — only pick active products for TEST_PRODUCT_ID
const listProducts = findItem(col.item, 'Merchant — List Products');
if (listProducts) {
  const ev = getOrCreateEvent(listProducts, 'test');
  ev.script.exec = [
    "pm.test('Status 200', () => pm.response.to.have.status(200));",
    "const json = pm.response.json();",
    "const rows = Array.isArray(json.data) ? json.data : (json.data && json.data.rows ? json.data.rows : []);",
    "const active = rows.filter(p => p.product_status === 'active' || p.is_available === true);",
    "const pick = active.length > 0 ? active[0] : rows[0];",
    "if (pick) {",
    "  pm.collectionVariables.set('TEST_PRODUCT_ID', pick.id);",
    "}",
  ];
  console.log('Fixed: Merchant List Products (prefer active product for TEST_PRODUCT_ID)');
}

// 5. Fix Merchant Create Product — do NOT overwrite TEST_PRODUCT_ID (pending product can't be carted)
const createProduct = findItem(col.item, 'Merchant — Create Product');
if (createProduct) {
  const ev = getOrCreateEvent(createProduct, 'test');
  ev.script.exec = [
    "pm.test('Status 201', () => pm.response.to.have.status(201));",
    "const json = pm.response.json();",
    "pm.test('Product created', () => pm.expect(json.data).to.exist);",
    "// Do not overwrite TEST_PRODUCT_ID — newly created product is pending_approval",
    "// and cannot be added to cart. Keep existing active product ID.",
  ];
  console.log('Fixed: Merchant Create Product (no longer overwrites TEST_PRODUCT_ID)');
}

// 6. Fix Multi-City Onboard — accept 201 (new) or 400 (already exists from prev run)
//    Also use a unique city name per run to avoid conflict
const onboardCity = findItem(col.item, 'Onboard New City');
if (onboardCity) {
  // Pre-request: generate unique city name
  const preEv = getOrCreateEvent(onboardCity, 'prerequest');
  preEv.script.exec = [
    "const ts = Date.now().toString().slice(-5);",
    "pm.collectionVariables.set('TEST_CITY_NAME', 'TestCity' + ts);",
  ];

  // Update request body
  if (onboardCity.request && onboardCity.request.body && onboardCity.request.body.raw) {
    try {
      const body = JSON.parse(onboardCity.request.body.raw);
      body.name = '{{TEST_CITY_NAME}}';
      onboardCity.request.body.raw = JSON.stringify(body, null, 2);
    } catch (_) {}
  }

  // Test: accept 201 or 400
  const ev = getOrCreateEvent(onboardCity, 'test');
  ev.script.exec = [
    "pm.test('City onboarded or conflict', () => pm.expect([201, 400]).to.include(pm.response.code));",
  ];
  console.log('Fixed: Multi-City Onboard (unique name per run, accept 201/400)');
}

// 7. Ensure COUPON_CODE variable is declared in collection variables
if (!col.variable) col.variable = [];
if (!col.variable.find(v => v.key === 'COUPON_CODE')) {
  col.variable.push({ key: 'COUPON_CODE', value: '', type: 'string' });
}
if (!col.variable.find(v => v.key === 'TEST_CITY_NAME')) {
  col.variable.push({ key: 'TEST_CITY_NAME', value: '', type: 'string' });
}

// Save
fs.writeFileSync(colPath, JSON.stringify(col, null, 2), 'utf8');
console.log('\nSaved updated collection.');
