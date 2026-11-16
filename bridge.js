const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

const masterAudio = new PassThrough();

// लगातार 24/7 साइलेंट ऑडियो जनरेट करना ताकि FFmpeg कभी न रुके
const silenceGen = spawn('ffmpeg', [
  '-re', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-f', 'mp3', '-ab', '128k', '-ar', '44100', 'pipe:1'
]);

let activeTalkers = 0;

silenceGen.stdout.on('data', (chunk) => {
  if (activeTalkers === 0) {
    masterAudio.write(chunk);
  }
});

app.get('/voice.mp3', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  masterAudio.pipe(res, { end: false });
});

wss.on('connection', (ws) => {
  activeTalkers++;
  const decoder = spawn('ffmpeg', [
    '-f', 'webm', '-i', 'pipe:0',
    '-f', 'mp3', '-ab', '128k', '-ar', '44100', '-ac', '2', 'pipe:1'
  ]);

  decoder.stdout.on('data', (chunk) => {
    masterAudio.write(chunk);
  });

  decoder.stderr.on('data', () => {});

  ws.on('message', (data) => {
    if (data.toString() === 'ping') return; // कनेक्शन जिंदा रखने के लिए
    if (decoder.stdin.writable) {
      decoder.stdin.write(data);
    }
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  const cleanup = () => {
    activeTalkers = Math.max(0, activeTalkers - 1);
    try { decoder.kill('SIGKILL'); } catch (e) {}
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

server.listen(8080, '0.0.0.0', () => console.log('Stable 24/7 Voice Bridge Ready'));
