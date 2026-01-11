declare module 'express' {
  export interface Request {
    headers?: Record<string, string | string[] | undefined>;
    method?: string;
    body?: any;
    query?: any;
  }
  export interface Response {
    status: (code: number) => Response;
    json: (body: any) => void;
    send: (body: any) => void;
    set: (name: string, value: any) => void;
    sendStatus?: (code: number) => void;
  }
  export interface Router {
    use: (...args: any[]) => Router;
    get: (...args: any[]) => Router;
    post: (...args: any[]) => Router;
    options: (...args: any[]) => Router;
  }
  export function Router(): Router;
}
