const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const ffmpeg = spawn('ffmpeg', [
  '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-f', 'webm', '-i', 'pipe:0',
  '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:normalize=0',
  '-f', 'mp3', '-ab', '128k', '-ar', '44100', 'pipe:1'
]);

app.get('/voice.mp3', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
  ffmpeg.stdout.pipe(res);
});

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    if (ffmpeg.stdin.writable) ffmpeg.stdin.write(data);
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });
});

server.listen(8080, () => console.log('24/7 Voice Bridge Ready'));
