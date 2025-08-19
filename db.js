
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "sql.freedb.tech",
    user: "freedb_sharma",
    password: "F27QGX%Qha#%2dd",
    database: "freedb_shashank",
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
});

module.exports = pool;
