#!/usr/bin/env node

/**
 * Database Connection Test Script
 * 
 * Gunakan untuk verify koneksi ke Railway MySQL
 * 
 * Usage: node test-db-connection.js
 */

require('dotenv').config();
const mysql = require('mysql2');

console.log('\n🔍 Testing Railway MySQL Database Connection...\n');

// Display configuration
console.log('Connection Details:');
console.log(`  Host: ${process.env.DB_HOST}`);
console.log(`  Port: ${process.env.DB_PORT || 3306}`);
console.log(`  User: ${process.env.DB_USER}`);
console.log(`  Database: ${process.env.DB_NAME}`);
console.log('');

// Create connection
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

// Test connection
console.log('⏳ Connecting...');

connection.connect((err) => {
  if (err) {
    console.error('❌ Connection Failed!');
    console.error(`Error: ${err.message}`);
    console.error(`Code: ${err.code}`);
    
    // Common troubleshooting
    if (err.code === 'ECONNREFUSED') {
      console.log('\n💡 Troubleshooting: ECONNREFUSED');
      console.log('  - Check if host and port are correct');
      console.log('  - Check if database is running');
      console.log('  - Check if firewall allows connection');
    } else if (err.code === 'ER_ACCESS_DENIED_FOR_USER') {
      console.log('\n💡 Troubleshooting: ER_ACCESS_DENIED_FOR_USER');
      console.log('  - Check username and password');
      console.log('  - Make sure .env file has correct credentials');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.log('\n💡 Troubleshooting: ER_BAD_DB_ERROR');
      console.log('  - Database name is incorrect');
      console.log('  - Database does not exist');
    }
    
    process.exit(1);
  }

  console.log('✅ Connected Successfully!\n');

  // Get server info
  connection.query('SELECT @@version AS version, @@hostname AS hostname, DATABASE() AS `database`', (err, results) => {
    if (err) {
      console.error('Error fetching server info:', err);
      connection.end();
      process.exit(1);
    }

    const info = results[0];
    console.log('Server Information:');
    console.log(`  MySQL Version: ${info.version}`);
    console.log(`  Server: ${info.hostname}`);
    console.log(`  Current Database: ${info.database}`);
    console.log('');

    // List tables
    connection.query('SHOW TABLES', (err, tables) => {
      if (err) {
        console.error('Error listing tables:', err);
        connection.end();
        process.exit(1);
      }

      console.log('Tables in Database:');
      if (tables.length === 0) {
        console.log('  (none - database is empty)');
        console.log('  Run: npm run init-db');
      } else {
        tables.forEach(table => {
          const tableName = Object.values(table)[0];
          console.log(`  ✓ ${tableName}`);
        });
      }
      console.log('');

      // Test write (optional)
      connection.query('SELECT COUNT(*) as count FROM users LIMIT 1', (err, result) => {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
          console.log('⚠️ Users table not found.');
          console.log('  Hint: Run "npm run init-db" to initialize database');
        } else if (err) {
          console.error('Error checking users table:', err.message);
        } else {
          console.log(`✅ Users table exists (${result[0].count} users)`);
        }
        console.log('');

        // Close connection
        connection.end(() => {
          console.log('✅ All tests completed!');
          console.log('\n📝 Next steps:');
          console.log('  1. Run: npm start');
          console.log('  2. Open: http://localhost:3000');
          console.log('  3. Test the application');
          console.log('');
          process.exit(0);
        });
      });
    });
  });
});

// Handle connection errors
connection.on('error', (err) => {
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection was closed.');
  }
  if (err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR') {
    console.error('Fatal error encountered prior to connection closure.');
  }
});
