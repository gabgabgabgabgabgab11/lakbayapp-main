import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  user: "postgres",          // your PostgreSQL username
  host: "localhost",         // your local PostgreSQL host
  database: "lakbaydb",      // the database name you created
  password: "10192005",  // your PostgreSQL password
  port: 5432,                // default PostgreSQL port
});

export default pool;