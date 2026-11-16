const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const masterAudio = new PassThrough();

// यह साइलेंट MP3 कभी बंद नहीं होगा ताकि YouTube स्ट्रीम में कभी No Data न आए
const silenceGen = spawn('ffmpeg', [
  '-re', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-f', 'mp3', '-ab', '128k', '-ar', '44100', 'pipe:1'
]);

silenceGen.stdout.on('data', (chunk) => {
  masterAudio.write(chunk);
});

app.get('/voice.mp3', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  });
  masterAudio.pipe(res, { end: false });
});

wss.on('connection', (ws) => {
  const voiceDecoder = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-f', 'mp3', '-ab', '128k', '-ar', '44100', '-ac', '2', 'pipe:1'
  ]);

  voiceDecoder.stdout.on('data', (chunk) => {
    masterAudio.write(chunk);
  });

  voiceDecoder.stderr.on('data', () => {});

  ws.on('message', (data) => {
    // अगर हार्टबीट पिंग (ping) आए तो इग्नोर करें, वरना आवाज प्रोसेस करें
    if (data.toString() === 'ping') return;
    
    if (voiceDecoder.stdin.writable) {
      voiceDecoder.stdin.write(data);
    }
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    voiceDecoder.kill();
  });
});

server.listen(8080, () => console.log('Non-Stop Master Audio Bridge Running'));
