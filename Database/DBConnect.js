const knex = require('knex')({
    client: 'mysql',
    connection: {
      host: '127.0.0.1',
      user: 'root',
      password: '',
      database: 'templarfitness',
      dateStrings:true,
    },
  });

module.exports = knex;