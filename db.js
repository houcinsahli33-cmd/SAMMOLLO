const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'sammollo_restaurant';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  multipleStatements: false
});

async function query(sql, params = []) {
  const [result] = await pool.execute(sql, params);

  if (Array.isArray(result)) {
    return {
      rows: result,
      rowCount: result.length,
      insertId: null,
      result
    };
  }

  return {
    rows: [],
    rowCount: result.affectedRows || 0,
    insertId: result.insertId || null,
    result
  };
}

async function getConnection() {
  return pool.getConnection();
}

async function testConnection() {
  const connection = await pool.getConnection();

  try {
    // Requête volontairement simple pour être compatible MySQL et MariaDB.
    await connection.query('SELECT 1');

    return {
      connected: true,
      db_name: DB_NAME,
      host: DB_HOST,
      port: DB_PORT
    };
  } finally {
    connection.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  getConnection,
  testConnection,
  closePool,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_NAME
};
