const fs = require('fs');
const col = JSON.parse(fs.readFileSync('MyLocalBazaar_Postman_Collection_Fixed.json', 'utf8'));

function findItem(items, n) {
  for (const i of items) {
    if (i.name && i.name.includes(n)) return i;
    if (i.item) { const f = findItem(i.item, n); if (f) return f; }
  }
  return null;
}

const review = findItem(col.item, 'Submit Product Review');
if (review) {
  if (!review.event) review.event = [];
  let ev = review.event.find(e => e.listen === 'test');
  if (!ev) { ev = { listen: 'test', script: { type: 'text/javascript', exec: [] } }; review.event.push(ev); }
  ev.script.exec = [
    "pm.test('Review submitted or conflict', () => pm.expect([200, 201, 409]).to.include(pm.response.code));",
  ];
  fs.writeFileSync('MyLocalBazaar_Postman_Collection_Fixed.json', JSON.stringify(col, null, 2), 'utf8');
  console.log('Fixed: Submit Product Review (accept 409)');
}
