import 'node:http';

declare module 'node:http' {
  interface IncomingMessage {
    id: string;
    auth?: { userId: string };
  }
}

export {};
