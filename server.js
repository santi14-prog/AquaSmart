const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ino': 'text/plain'
};

const ROOT = __dirname;
const PORT = 8080;

// === ASCII Logo (simple, compatible across terminals) ===
const LOGO = [
  '         ▄▄▄▄▄▄▄▄▄▄▄',
  '       ▄█▀         ▀█▄',
  '      █▀  ▄▄▄▄▄▄▄▄▄  ▀█',
  '     █▌  ███████████  ▐█',
  '     █▌ ▐███████████▌ ▐█      AquaSmart v1.0',
  '     █▌ ▐███████████▌ ▐█      Sistema de Rega Inteligente',
  '      █▄ ▀█████████▀ ▄█',
  '       ▀█▄  ▀▀▀▀▀  ▄█▀       Projeto Final de Curso',
  '         ▀█▄▄▄▄▄▄▄█▀',
  '           ▀▀▀▀▀▀▀'
].join('\n');

// === Terminal Colors ===
const C = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
  magenta: '\x1b[35m'
};

function timestamp() {
  const d = new Date();
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

http.createServer((req, res) => {
  // === CORS for /log endpoint ===
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // === POST /log - receives browser logs ===
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { level, msg, time } = JSON.parse(body);
        const color = level === 'ERR' ? C.red : level === 'WARN' ? C.yellow : C.cyan;
        console.log(`${C.dim}[${time || timestamp()}]${C.reset} ${color}[${level}]${C.reset} ${C.bright}${msg}${C.reset}`);
      } catch (_) {}
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('OK');
    });
    return;
  }

  // === Static file serving ===
  let file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  file = path.join(ROOT, file);

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('404');
    } else {
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    }
  });

  // Log HTTP requests
  const methodColor = req.method === 'POST' ? C.magenta : C.green;
  console.log(`${C.dim}[${timestamp()}]${C.reset} ${methodColor}${req.method}${C.reset} ${req.url}`);
}).listen(PORT, () => {
  console.clear();
  console.log(C.cyan + LOGO + C.reset);
  console.log(`${C.green}✓${C.reset} Servidor iniciado em ${C.bright}${C.cyan}http://localhost:${PORT}${C.reset}`);
  console.log(`${C.dim}  Pressiona Ctrl+C para parar${C.reset}\n`);
  console.log(`${C.dim}─── Aguardando pedidos ───${C.reset}\n`);
});
