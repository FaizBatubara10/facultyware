const db = require('./lib/db');

async function clearDB() {
  try {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('TRUNCATE TABLE meeting_minutes');
    await db.query('TRUNCATE TABLE meeting_documents');
    await db.query('TRUNCATE TABLE meeting_external_participants');
    await db.query('TRUNCATE TABLE meeting_participants');
    await db.query('TRUNCATE TABLE meetings');
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Database cleared for testing.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to clear database:', err);
    process.exit(1);
  }
}

clearDB();
