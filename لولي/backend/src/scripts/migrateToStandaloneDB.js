'use strict';

/**
 * Copy everything tagged tenant:'luliz' out of the shared Atlas database into
 * a brand-new, dedicated database for the standalone لوليز deployment. This
 * is what makes the new server truly independent — its own database, not
 * just a different `tenant` value in a database عجينة also writes to.
 *
 * Read-only against the source; only ever writes to the destination.
 *
 *   node src/scripts/migrateToStandaloneDB.js             ← dry run
 *   node src/scripts/migrateToStandaloneDB.js --apply     ← copies it
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const SOURCE_URI = process.env.MONGODB_URI;                       // shared cluster, db "luliz"
const DEST_URI   = SOURCE_URI.replace(/\/luliz(\?|$)/, '/loliz_standalone$1'); // same cluster, new db

(async () => {
  const src = new MongoClient(SOURCE_URI);
  const dst = new MongoClient(DEST_URI);
  await src.connect();
  await dst.connect();

  const sdb = src.db();
  const ddb = dst.db();
  console.log(APPLY ? '⚙️  تنفيذ فعلي\n' : '🔎 وضع تجريبي — لن يُكتب أي شيء\n');
  console.log('من:', sdb.databaseName, '  إلى:', ddb.databaseName, '\n');

  const collections = (await sdb.listCollections().toArray()).map(c => c.name).sort();
  let total = 0;

  for (const name of collections) {
    const docs = await sdb.collection(name).find({ tenant: 'luliz' }).toArray();
    if (!docs.length) continue;
    total += docs.length;
    console.log(`  ${name.padEnd(22)} ${docs.length} سجل`);
    /* `tenant: 'luliz'` is kept, not stripped: the deployed code still carries
       the tenancy plugin (untouched — lower risk than forking it out), and
       that plugin injects a tenant filter into every query. A document with
       no tenant field would silently match nothing, the exact bug this
       migration exists to get away from. Keeping the tag costs nothing since
       this database only ever holds لوليز's data anyway, and DEFAULT_TENANT
       on this deployment is always 'luliz'. */
    if (APPLY) await ddb.collection(name).insertMany(docs);
  }

  console.log(`\n${APPLY ? 'تم نسخ' : 'سيُنسخ'} ${total} سجل إلى قاعدة البيانات الجديدة.`);
  if (!APPLY) console.log('أعد التشغيل مع --apply للتنفيذ.');

  await src.close();
  await dst.close();
})().catch(e => { console.error('فشل:', e.message); process.exit(1); });
