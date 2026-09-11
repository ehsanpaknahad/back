const { Pool } = require("pg");
const types = require("pg").types;

types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "SirriGeoDB",
  user: "postgres",
  password: "gis123",
});

module.exports = pool;