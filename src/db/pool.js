const { Pool } = require("pg");

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "SirriGeoDB",
  user: "postgres",
  password: "gis123",
});

module.exports = pool;