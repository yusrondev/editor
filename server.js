const express = require('express');
const expressWs = require('express-ws');
const pty = require('node-pty-prebuilt-multiarch');
const path = require('path');

const app = express();
expressWs(app);

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

app.ws('/terminal', function (ws, req) {
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash'; // ganti powershell ➜ cmd

    const term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env,
    });

    term.on('data', data => {
        ws.send(data);
        console.log('[pty ➜ client]', data); // debug
    });

    ws.on('message', msg => {
        term.write(msg);
        console.log('[client ➜ pty]', msg); // debug
    });

    ws.on('close', () => term.kill());
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Terminal server ready at http://localhost:${PORT}`));
