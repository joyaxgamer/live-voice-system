const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const masterAudio = new PassThrough();

// यह असली साइलेंट MP3 फ्रेम्स लगातार पैदा करेगा ताकि YouTube FFmpeg कभी न रुके
const silenceGen = spawn('ffmpeg', [
  '-re', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-f', 'mp3', '-ab', '128k', '-ar', '44100', 'pipe:1'
]);

let isTalking = false;

silenceGen.stdout.on('data', (chunk) => {
  if (!isTalking) {
    masterAudio.write(chunk);
  }
});

app.get('/voice.mp3', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Connection': 'keep-alive'
  });
  masterAudio.pipe(res, { end: false });
});

wss.on('connection', (ws) => {
  const voiceDecoder = spawn('ffmpeg', [
    '-f', 'webm', '-i', 'pipe:0',
    '-f', 'mp3', '-ab', '128k', '-ar', '44100', '-ac', '2', 'pipe:1'
  ]);

  voiceDecoder.stdout.on('data', (chunk) => {
    isTalking = true;
    masterAudio.write(chunk);
  });

  ws.on('message', (data) => {
    if (voiceDecoder.stdin.writable) voiceDecoder.stdin.write(data);
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    isTalking = false;
    voiceDecoder.kill();
  });
});

server.listen(8080, () => console.log('Master Audio Bridge Running'));
