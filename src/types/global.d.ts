/**
 * 전역 타입 선언
 * Node.js 환경에서 사용되는 전역 객체들의 타입을 정의합니다.
 */

declare global {
  // Console 객체 정의
  var console: {
    log(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
    info(...args: any[]): void;
    debug(...args: any[]): void;
    trace(...args: any[]): void;
    dir(obj: any, options?: any): void;
    time(label?: string): void;
    timeEnd(label?: string): void;
    count(label?: string): void;
    countReset(label?: string): void;
    group(...args: any[]): void;
    groupCollapsed(...args: any[]): void;
    groupEnd(): void;
    clear(): void;
    table(tabularData: any, properties?: string[]): void;
    assert(condition?: boolean, ...data: any[]): void;
  };

  // Buffer 전역 객체 (Node.js)
  var Buffer: {
    new (str: string, encoding?: string): Buffer;
    new (size: number): Buffer;
    new (array: Uint8Array): Buffer;
    new (arrayBuffer: ArrayBuffer): Buffer;
    new (array: any[]): Buffer;
    prototype: Buffer;
    from(str: string, encoding?: string): Buffer;
    from(data: any[]): Buffer;
    from(data: Uint8Array): Buffer;
    from(data: ArrayBuffer): Buffer;
    alloc(size: number, fill?: string | Buffer | number, encoding?: string): Buffer;
    allocUnsafe(size: number): Buffer;
    allocUnsafeSlow(size: number): Buffer;
    isBuffer(obj: any): obj is Buffer;
    concat(list: Buffer[], totalLength?: number): Buffer;
    compare(buf1: Buffer, buf2: Buffer): number;
    isEncoding(encoding: string): boolean;
    byteLength(str: string, encoding?: string): number;
  };

  // Process 전역 객체 (Node.js)
  var process: {
    env: { [key: string]: string | undefined };
    argv: string[];
    platform: string;
    arch: string;
    version: string;
    versions: { [key: string]: string };
    pid: number;
    title: string;
    cwd(): string;
    chdir(directory: string): void;
    exit(code?: number): never;
    nextTick(callback: (...args: any[]) => void, ...args: any[]): void;
    stdout: any;
    stderr: any;
    stdin: any;
  };

  // Global 전역 객체 (Node.js)
  var global: typeof globalThis;

  // __dirname 및 __filename (Node.js)
  var __dirname: string;
  var __filename: string;

  // setTimeout, setInterval, clearTimeout, clearInterval
  function setTimeout(callback: (...args: any[]) => void, ms?: number, ...args: any[]): NodeJS.Timeout;
  function clearTimeout(timeoutId: NodeJS.Timeout): void;
  function setInterval(callback: (...args: any[]) => void, ms?: number, ...args: any[]): NodeJS.Timeout;
  function clearInterval(intervalId: NodeJS.Timeout): void;
  function setImmediate(callback: (...args: any[]) => void, ...args: any[]): NodeJS.Immediate;
  function clearImmediate(immediateId: NodeJS.Immediate): void;

  // NodeJS 네임스페이스 정의
  namespace NodeJS {
    interface Timeout {
      ref(): this;
      unref(): this;
      hasRef(): boolean;
      refresh(): this;
    }

    interface Immediate {
      ref(): this;
      unref(): this;
      hasRef(): boolean;
    }
  }
}

// Buffer 인터페이스 정의
interface Buffer extends Uint8Array {
  write(string: string, offset?: number, length?: number, encoding?: string): number;
  toString(encoding?: string, start?: number, end?: number): string;
  toJSON(): { type: 'Buffer'; data: number[] };
  equals(otherBuffer: Buffer): boolean;
  compare(otherBuffer: Buffer, targetStart?: number, targetEnd?: number, sourceStart?: number, sourceEnd?: number): number;
  copy(targetBuffer: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  slice(start?: number, end?: number): Buffer;
  subarray(start?: number, end?: number): Buffer;
  writeUIntLE(value: number, offset: number, byteLength: number): number;
  writeUIntBE(value: number, offset: number, byteLength: number): number;
  writeIntLE(value: number, offset: number, byteLength: number): number;
  writeIntBE(value: number, offset: number, byteLength: number): number;
  readUIntLE(offset: number, byteLength: number): number;
  readUIntBE(offset: number, byteLength: number): number;
  readIntLE(offset: number, byteLength: number): number;
  readIntBE(offset: number, byteLength: number): number;
  readUInt8(offset: number): number;
  readUInt16LE(offset: number): number;
  readUInt16BE(offset: number): number;
  readUInt32LE(offset: number): number;
  readUInt32BE(offset: number): number;
  readInt8(offset: number): number;
  readInt16LE(offset: number): number;
  readInt16BE(offset: number): number;
  readInt32LE(offset: number): number;
  readInt32BE(offset: number): number;
  readFloatLE(offset: number): number;
  readFloatBE(offset: number): number;
  readDoubleLE(offset: number): number;
  readDoubleBE(offset: number): number;
  swap16(): Buffer;
  swap32(): Buffer;
  swap64(): Buffer;
  writeUInt8(value: number, offset: number): number;
  writeUInt16LE(value: number, offset: number): number;
  writeUInt16BE(value: number, offset: number): number;
  writeUInt32LE(value: number, offset: number): number;
  writeUInt32BE(value: number, offset: number): number;
  writeInt8(value: number, offset: number): number;
  writeInt16LE(value: number, offset: number): number;
  writeInt16BE(value: number, offset: number): number;
  writeInt32LE(value: number, offset: number): number;
  writeInt32BE(value: number, offset: number): number;
  writeFloatLE(value: number, offset: number): number;
  writeFloatBE(value: number, offset: number): number;
  writeDoubleLE(value: number, offset: number): number;
  writeDoubleBE(value: number, offset: number): number;
  fill(value: string | Buffer | number, offset?: number, end?: number, encoding?: string): this;
  indexOf(value: string | Buffer | number, byteOffset?: number, encoding?: string): number;
  lastIndexOf(value: string | Buffer | number, byteOffset?: number, encoding?: string): number;
  includes(value: string | Buffer | number, byteOffset?: number, encoding?: string): boolean;
}

export {}; 