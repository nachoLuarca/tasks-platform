import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';

export interface CapturedRequest {
  headers: IncomingHttpHeaders;
  body: string;
}

export interface TestReceiver {
  url: string;
  requests: CapturedRequest[];
  setResponseStatus: (status: number) => void;
  close: () => Promise<void>;
}

/** A real, ephemeral HTTP server on a free port -- not a mock -- so a delivery test proves the actual signed HTTP request Tasks Platform sends, headers included. */
export function startTestReceiver(initialStatus = 200): Promise<TestReceiver> {
  return new Promise((resolve, reject) => {
    const requests: CapturedRequest[] = [];
    let status = initialStatus;

    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        requests.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        res.writeHead(status, { 'Content-Type': 'text/plain' }).end('ok');
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        setResponseStatus: (value: number) => {
          status = value;
        },
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
