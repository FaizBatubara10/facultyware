const mysql = require('mysql2');
require('dotenv').config();

// Support a single DATABASE_URL like: mysql://user:pass@host:port/db
const getConfigFromEnv = () => {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return {
        host: url.hostname,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname ? url.pathname.replace(/^\//, '') : undefined,
        port: url.port ? Number(url.port) : 3306,
      };
    } catch (err) {
      // fall through to individual env vars
      console.error('Invalid DATABASE_URL format:', err.message);
    }
  }

  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  };
};

const baseConfig = getConfigFromEnv();

const pool = mysql.createPool(Object.assign({
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
}, baseConfig));

module.exports = pool.promise();
