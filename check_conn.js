
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/',
    method: 'GET',
    timeout: 5000
};

const req = http.request(options, res => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', d => { });
});

req.on('error', error => {
    console.error(error);
});

req.end();
