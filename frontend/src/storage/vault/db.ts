/**
 * IndexedDB storage for encrypted vault data
 * Uses the 'idb' library for a Promise-based API
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'globalsync-vault';
const DB_VERSION = 1;

interface VaultDBSchema extends DBSchema {
  'vault-meta': {
    key: string;
    value: {
      key: string;
      value: string;
    };
  };
  'encrypted-data': {
    key: string;
    value: {
      key: string;
      data: string; // Base64 encoded encrypted data
      updatedAt: number;
    };
  };
}

let dbInstance: IDBPDatabase<VaultDBSchema> | null = null;

/**
 * Initialize and get the database instance
 */
export async function getDB(): Promise<IDBPDatabase<VaultDBSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<VaultDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Store for vault metadata (salt, password hash for verification)
      if (!db.objectStoreNames.contains('vault-meta')) {
        db.createObjectStore('vault-meta', { keyPath: 'key' });
      }
      
      // Store for encrypted application data
      if (!db.objectStoreNames.contains('encrypted-data')) {
        db.createObjectStore('encrypted-data', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

/**
 * Store metadata (e.g., salt, password hash)
 */
export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('vault-meta', { key, value });
}

/**
 * Get metadata
 */
export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  const result = await db.get('vault-meta', key);
  return result?.value;
}

/**
 * Store encrypted data
 */
export async function setEncryptedData(key: string, data: string): Promise<void> {
  const db = await getDB();
  await db.put('encrypted-data', { key, data, updatedAt: Date.now() });
}

/**
 * Get encrypted data
 */
export async function getEncryptedData(key: string): Promise<string | undefined> {
  const db = await getDB();
  const result = await db.get('encrypted-data', key);
  return result?.data;
}

/**
 * Delete encrypted data
 */
export async function deleteEncryptedData(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('encrypted-data', key);
}

/**
 * Clear all encrypted data (for vault reset)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await db.clear('encrypted-data');
  await db.clear('vault-meta');
}

/**
 * Check if vault has been initialized
 */
export async function isVaultInitialized(): Promise<boolean> {
  const salt = await getMeta('salt');
  return salt !== undefined;
}
