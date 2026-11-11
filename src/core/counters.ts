export interface Counter {
  visit: number;
  visitor: number;
}

export interface CounterKey {
  namespace: string;
  name: string;
}

/**
 * 访客指纹。
 * HTTP 层从客户端 IP 生成，存储层只保存哈希。
 */
export type VisitorFingerprint = Uint8Array;

/**
 * 计数器存储。
 * `record` 必须原子完成递增、去重和读取。
 */
export interface CounterStore {
  read(key: CounterKey): Promise<Counter | null>;
  record(key: CounterKey, visitor: VisitorFingerprint | null): Promise<Counter>;
}
