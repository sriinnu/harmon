/**
 * I provide the tiny local file server for the static Harmon web app.
 */

import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.HARMON_WEB_PORT ?? '4173', 10);
const root = resolve('dist');

/**
 * I map the file extension to the content type the browser expects.
 */
function getContentType(pathname: string): string {
  switch (extname(pathname)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

/**
 * I resolve one request URL to a safe file inside the static dist tree.
 */
export function resolveStaticPath(rootDir: string, requestUrl?: string): string | null {
  const rawPath = (requestUrl ?? '/').split('?')[0] ?? '/';
  if (rawPath.split('/').some((segment) => segment === '..')) {
    return null;
  }

  const parsed = new URL(requestUrl ?? '/', 'http://127.0.0.1');
  const pathname = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const candidate = resolve(rootDir, `.${pathname}`);

  if (candidate !== rootDir && !candidate.startsWith(`${rootDir}${sep}`)) {
    return null;
  }

  if (existsSync(candidate)) {
    return candidate;
  }

  if (!extname(pathname)) {
    const indexPath = resolve(rootDir, 'index.html');
    return existsSync(indexPath) ? indexPath : null;
  }

  return null;
}

/**
 * I start the local static server used for development and manual review.
 */
export function startServer(): void {
  createServer((req, res) => {
    const safePath = resolveStaticPath(root, req.url);
    if (!safePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(safePath) });
    createReadStream(safePath).pipe(res);
  }).listen(port, host, () => {
    console.log(`I am serving Harmon Web at http://${host}:${port}`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
