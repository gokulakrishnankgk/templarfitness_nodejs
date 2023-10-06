const knex = require('knex')({
    client: 'mysql',
    connection: {
      host: '127.0.0.1',
      user: 'gokul',
      password: '123456',
      database: 'bingemeee',
      dateStrings:true,
    },
  });

module.exports = knex;