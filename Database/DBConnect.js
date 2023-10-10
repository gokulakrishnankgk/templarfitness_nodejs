require('dotenv').config();
let knex;
try{
   knex = require('knex')({
      client: process.env.DB_MYSQL_CONNECT,
      connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        dateStrings:true,
      },
    });
  } catch(error) {
      console.log("DB connection failed : " + error);
  }
module.exports = knex;