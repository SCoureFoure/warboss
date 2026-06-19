import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8123;

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript'
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const requestedPath = path.join(__dirname, pathname);
  const resolvedPath = path.resolve(requestedPath);

  // Prevent path traversal: resolved path must stay inside __dirname
  if (resolvedPath !== __dirname && !resolvedPath.startsWith(__dirname + path.sep)) {
    notFound(res);
    return;
  }

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      notFound(res);
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(resolvedPath) });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
