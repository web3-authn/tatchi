declare module 'express' {
  export interface Request {}
  export interface Response {
    status: (code: number) => Response;
    json: (body: any) => void;
    send: (body: any) => void;
    set: (name: string, value: any) => void;
  }
  export interface Router {}
  export function Router(): any;
}

