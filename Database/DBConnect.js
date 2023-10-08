require('dotenv').config();
try{
  const knex = require('knex')({
      client: process.env.DB_MYSQL_CONNECT,
      connection: {
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_DATABASE,
        dateStrings:true,
      },
    });
  } catch(error) {
      console.log("DB connection failed : " + error);
  }
module.exports = knex;