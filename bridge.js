const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// एक ऐसा पाइप जो बिना रुके तुरंत डेटा पास करेगा
const audioStream = new PassThrough();

// हर 100ms में खाली डेटा भेजना ताकि HTTP कनेक्शन कभी न अटके
setInterval(() => {
  if (audioStream.readableLength === 0) {
    audioStream.write(Buffer.alloc(1024));
  }
}, 100);

app.get('/voice.mp3', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked'
  });
  audioStream.pipe(res, { end: false });
});

wss.on('connection', (ws) => {
  // जब फोन से आवाज आएगी, तो यह FFmpeg उसे MP3 बनाकर मुख्य पाइप में डालेगा
  const decoder = spawn('ffmpeg', [
    '-f', 'webm', '-i', 'pipe:0',
    '-f', 'mp3', '-ab', '128k', '-ar', '44100', '-ac', '2', 'pipe:1'
  ]);

  decoder.stdout.on('data', (chunk) => {
    audioStream.write(chunk);
  });

  ws.on('message', (data) => {
    if (decoder.stdin.writable) decoder.stdin.write(data);
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    decoder.kill();
  });
});

server.listen(8080, () => console.log('Non-blocking Voice Bridge Ready'));
