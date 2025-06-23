/**
 * 외부 모듈 타입 선언
 * 누락된 외부 모듈들의 기본 타입을 정의합니다.
 */

// crypto 모듈 (Node.js 내장 모듈)
declare module 'crypto' {
  export function randomUUID(): string;
  export function randomBytes(size: number): Buffer;
  export function createHash(algorithm: string): {
    update(data: string | Buffer): any;
    digest(encoding?: string): string | Buffer;
  };
  export function createHmac(algorithm: string, key: string | Buffer): {
    update(data: string | Buffer): any;
    digest(encoding?: string): string | Buffer;
  };
  export function pbkdf2Sync(password: string | Buffer, salt: string | Buffer, iterations: number, keylen: number, digest: string): Buffer;
  export function scryptSync(password: string | Buffer, salt: string | Buffer, keylen: number, options?: any): Buffer;
  export interface CipherGCM {
    update(data: string | Buffer, inputEncoding?: string, outputEncoding?: string): string | Buffer;
    final(outputEncoding?: string): string | Buffer;
    setAAD(buffer: Buffer): this;
    getAuthTag(): Buffer;
  }
  export interface DecipherGCM {
    update(data: string | Buffer, inputEncoding?: string, outputEncoding?: string): string | Buffer;
    final(outputEncoding?: string): string | Buffer;
    setAAD(buffer: Buffer): this;
    setAuthTag(tag: Buffer): this;
  }
  export function createCipher(algorithm: string, password: string | Buffer): CipherGCM;
  export function createDecipher(algorithm: string, password: string | Buffer): DecipherGCM;
}

// mongoose 모듈 (기본적인 타입 정의)
declare module 'mongoose' {
  export interface Connection {
    readyState: number;
    close(): Promise<void>;
  }
  
  export interface ConnectOptions {
    useNewUrlParser?: boolean;
    useUnifiedTopology?: boolean;
    [key: string]: any;
  }

  export function connect(uri: string, options?: ConnectOptions): Promise<typeof mongoose>;
  export function disconnect(): Promise<void>;
  export const connection: Connection;
  
  export interface Document {
    _id?: any;
    save(): Promise<this>;
    remove(): Promise<this>;
    toObject(): any;
    toJSON(): any;
  }

  export interface Model<T extends Document> {
    new (doc?: any): T;
    find(filter?: any): Query<T[]>;
    findOne(filter?: any): Query<T | null>;
    findById(id: any): Query<T | null>;
    create(doc: any): Promise<T>;
    updateOne(filter: any, update: any): Promise<any>;
    deleteOne(filter: any): Promise<any>;
    save(): Promise<T>;
  }

  export interface Query<T> {
    exec(): Promise<T>;
    then(resolve?: (value: T) => any, reject?: (reason: any) => any): Promise<any>;
    catch(reject?: (reason: any) => any): Promise<T>;
  }

  export interface Schema {
    new (definition?: any, options?: any): Schema;
    add(obj: any): this;
    virtual(name: string): any;
    method(name: string, fn: Function): this;
    static(name: string, fn: Function): this;
    index(fields: any, options?: any): this;
  }

  export function model<T extends Document>(name: string, schema: Schema): Model<T>;
  export { Schema };

  const mongoose: {
    connect: typeof connect;
    disconnect: typeof disconnect;
    connection: Connection;
    model: typeof model;
    Schema: typeof Schema;
  };

  export default mongoose;
}

// axios 모듈 (기본적인 타입 정의)
declare module 'axios' {
  export interface AxiosRequestConfig {
    url?: string;
    method?: string;
    baseURL?: string;
    transformRequest?: any;
    transformResponse?: any;
    headers?: any;
    params?: any;
    paramsSerializer?: any;
    data?: any;
    timeout?: number;
    timeoutErrorMessage?: string;
    withCredentials?: boolean;
    adapter?: any;
    auth?: any;
    responseType?: string;
    responseEncoding?: string;
    xsrfCookieName?: string;
    xsrfHeaderName?: string;
    onUploadProgress?: any;
    onDownloadProgress?: any;
    maxContentLength?: number;
    maxBodyLength?: number;
    validateStatus?: any;
    maxRedirects?: number;
    socketPath?: string | null;
    httpAgent?: any;
    httpsAgent?: any;
    proxy?: any;
    cancelToken?: any;
    signal?: any;
    decompress?: boolean;
    [key: string]: any;
  }

  export interface AxiosResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: AxiosRequestConfig;
    request?: any;
  }

  export interface AxiosError<T = any> extends Error {
    config: AxiosRequestConfig;
    code?: string;
    request?: any;
    response?: AxiosResponse<T>;
    isAxiosError: boolean;
    toJSON(): object;
  }

  export interface AxiosInstance {
    defaults: AxiosRequestConfig;
    interceptors: {
      request: any;
      response: any;
    };
    request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    head<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    options<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  }

  interface AxiosStatic extends AxiosInstance {
    create(config?: AxiosRequestConfig): AxiosInstance;
    Cancel: any;
    CancelToken: any;
    isCancel(value: any): boolean;
    all<T>(values: Array<T | Promise<T>>): Promise<T[]>;
    spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R;
    isAxiosError(payload: any): payload is AxiosError;
  }

  declare const axios: AxiosStatic;
  export default axios;
}

export {}; 