const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT || 4000);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || 'sammollo_restaurant';
const DB_SSL = String(process.env.DB_SSL || 'true').toLowerCase() === 'true';

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  throw new Error(
    'Configuration base de données incomplète : vérifiez DB_HOST, DB_USER, DB_PASSWORD et DB_NAME.'
  );
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX || 5),
  queueLimit: 0,

  charset: 'utf8mb4',
  multipleStatements: false,

  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  ssl: DB_SSL
    ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      }
    : undefined
});

/**
 * Requête générique utilisée par server.js.
 * Retourne toujours une structure stable :
 * { rows, rowCount, insertId, result }
 */
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
    rowCount: Number(result.affectedRows || 0),
    insertId: result.insertId || null,
    result
  };
}

/**
 * Connexion dédiée pour les transactions.
 */
async function getConnection() {
  return pool.getConnection();
}

/**
 * Test de connexion exécuté au démarrage de server.js.
 */
async function testConnection() {
  const connection = await pool.getConnection();

  try {
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
