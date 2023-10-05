const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

const router = require('./Routes/Router');
app.use(router);

server.listen(3000, ()=>{
    console.log('server is started at port 3000');
});