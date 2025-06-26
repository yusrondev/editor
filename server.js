const express = require('express');
const expressWs = require('express-ws');
const pty = require('node-pty');
const path = require('path');

const app = express();
expressWs(app);

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'public'))); // Folder tempat HTML editor kamu

app.ws('/terminal', function (ws, req) {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env,
    });

    // Kirim output terminal ke client
    term.on('data', data => ws.send(data));

    // Kirim input dari client ke terminal
    ws.on('message', msg => term.write(msg));

    // Tutup terminal kalau socket ditutup
    ws.on('close', () => term.kill());
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
