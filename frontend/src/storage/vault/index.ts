/**
 * Encrypted Vault - Main API
 * Provides secure local storage with WebCrypto encryption
 */

import { encrypt, decrypt, toBase64, fromBase64, generateSalt, hashPassword } from './crypto';
import { setMeta, getMeta, setEncryptedData, getEncryptedData, clearAllData, isVaultInitialized } from './db';
import type { Customer, FocusItem, UserProfile } from '@/types';

// Keys for different data stores
const STORE_KEYS = {
  CUSTOMERS: 'customers',
  FOCUS_ITEMS: 'focus-items',
  USER_PROFILE: 'user-profile',
} as const;

// In-memory password (only kept while vault is unlocked)
let currentPassword: string | null = null;
let currentUsername: string | null = null;

type VaultCheck = {
  state: 'uninitialized' | 'locked' | 'unlocked';
  users: string[];
  lastUser?: string;
  legacy: boolean;
};

const META_KEYS = {
  USERS: 'users',
  LAST_USER: 'last-user',
} as const;

function userSaltKey(username: string) {
  return `user:${username}:salt`;
}

function userHashKey(username: string) {
  return `user:${username}:password-hash`;
}

function dataKey(username: string, key: string) {
  return `${username}:${key}`;
}

async function getUsers(): Promise<string[]> {
  const raw = await getMeta(META_KEYS.USERS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === 'string');
    return [];
  } catch {
    return [];
  }
}

async function setUsers(users: string[]): Promise<void> {
  await setMeta(META_KEYS.USERS, JSON.stringify(users));
}

function normalizeUsername(username: string): string {
  return username.trim();
}

async function getLegacySalt(): Promise<string | undefined> {
  return getMeta('salt');
}

async function getLegacyHash(): Promise<string | undefined> {
  return getMeta('password-hash');
}

async function migrateLegacyToUser(username: string): Promise<void> {
  // Copy legacy meta to namespaced meta
  const legacySalt = await getLegacySalt();
  const legacyHash = await getLegacyHash();
  if (!legacySalt || !legacyHash) return;

  await setMeta(userSaltKey(username), legacySalt);
  await setMeta(userHashKey(username), legacyHash);

  // Move legacy encrypted data keys to namespaced keys
  for (const key of Object.values(STORE_KEYS)) {
    const legacyEncrypted = await getEncryptedData(key);
    if (legacyEncrypted) {
      await setEncryptedData(dataKey(username, key), legacyEncrypted);
    }
  }

  // Record users list and last user
  await setUsers([username]);
  await setMeta(META_KEYS.LAST_USER, username);
}

/**
 * Check if vault needs to be initialized (first time use)
 */
export async function checkVaultState(): Promise<VaultCheck> {
  // New multi-user mode
  const users = await getUsers();
  const lastUser = await getMeta(META_KEYS.LAST_USER);

  // Legacy single-user mode detection: old meta exists without users list
  const legacy = users.length === 0 && (await isVaultInitialized());

  if (users.length === 0 && !legacy) {
    return { state: 'uninitialized', users: [], legacy: false };
  }

  if (currentPassword && currentUsername) {
    return { state: 'unlocked', users, lastUser: lastUser || undefined, legacy };
  }
  return { state: 'locked', users: legacy ? [lastUser || 'User'] : users, lastUser: lastUser || undefined, legacy };
}

/**
 * Initialize vault with a new local account (first time setup or add user)
 */
export async function initializeVault(username: string, password: string): Promise<void> {
  const u = normalizeUsername(username);
  if (!u) throw new Error('Username is required');
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const existingUsers = await getUsers();
  if (existingUsers.includes(u)) {
    throw new Error('Username already exists');
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  await setMeta(userSaltKey(u), toBase64(salt));
  await setMeta(userHashKey(u), passwordHash);

  const users = [...existingUsers, u];
  await setUsers(users);
  await setMeta(META_KEYS.LAST_USER, u);

  // Initialize empty data stores
  const emptyCustomers: Customer[] = [];
  const emptyFocusItems: FocusItem[] = [];
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultProfile: UserProfile = {
    username: u,
    name: u,
    firstName: u,
    lastName: '',
    homeTimezone: browserTz,
    currentTimezone: browserTz,
    workHours: { start: '09:00', end: '18:00' },
  };

  currentPassword = password;
  currentUsername = u;
  
  await saveData(STORE_KEYS.CUSTOMERS, emptyCustomers);
  await saveData(STORE_KEYS.FOCUS_ITEMS, emptyFocusItems);
  await saveData(STORE_KEYS.USER_PROFILE, defaultProfile);
}

/**
 * Unlock vault with password
 */
export async function unlockVault(username: string, password: string): Promise<boolean> {
  const u = normalizeUsername(username);
  if (!u) throw new Error('Username is required');

  // If legacy mode, try to unlock using legacy meta and migrate on success
  const users = await getUsers();
  const legacy = users.length === 0 && (await isVaultInitialized());
  if (legacy) {
    const saltBase64 = await getLegacySalt();
    const storedHash = await getLegacyHash();
    if (!saltBase64 || !storedHash) {
      throw new Error('Vault not initialized');
    }
    const salt = fromBase64(saltBase64);
    const inputHash = await hashPassword(password, salt);
    if (inputHash !== storedHash) return false;

    currentPassword = password;
    currentUsername = u;
    await migrateLegacyToUser(u);
    await setMeta(META_KEYS.LAST_USER, u);
    return true;
  }

  const saltBase64 = await getMeta(userSaltKey(u));
  const storedHash = await getMeta(userHashKey(u));
  if (!saltBase64 || !storedHash) {
    throw new Error('User not found');
  }

  const salt = fromBase64(saltBase64);
  const inputHash = await hashPassword(password, salt);
  if (inputHash !== storedHash) return false;

  currentPassword = password;
  currentUsername = u;
  await setMeta(META_KEYS.LAST_USER, u);
  return true;
}

/**
 * Lock the vault (clear in-memory password)
 */
export function lockVault(): void {
  currentPassword = null;
  currentUsername = null;
}

/**
 * Check if vault is currently unlocked
 */
export function isUnlocked(): boolean {
  return currentPassword !== null;
}

/**
 * Save data to encrypted storage
 */
async function saveData<T>(key: string, data: T): Promise<void> {
  if (!currentPassword || !currentUsername) {
    throw new Error('Vault is locked');
  }

  const jsonData = JSON.stringify(data);
  const encrypted = await encrypt(jsonData, currentPassword);
  await setEncryptedData(dataKey(currentUsername, key), toBase64(encrypted));
}

/**
 * Load data from encrypted storage
 */
async function loadData<T>(key: string, defaultValue: T): Promise<T> {
  if (!currentPassword || !currentUsername) {
    throw new Error('Vault is locked');
  }

  const encryptedBase64 = await getEncryptedData(dataKey(currentUsername, key));
  if (!encryptedBase64) {
    return defaultValue;
  }

  try {
    const encrypted = fromBase64(encryptedBase64);
    const jsonData = await decrypt(encrypted, currentPassword);
    return JSON.parse(jsonData) as T;
  } catch {
    console.error(`Failed to decrypt data for key: ${key}`);
    return defaultValue;
  }
}

// ============ Customer Operations ============

export async function loadCustomers(): Promise<Customer[]> {
  const customers = await loadData<Customer[]>(STORE_KEYS.CUSTOMERS, []);
  
  // Migrate older customers missing firstName/lastName fields
  return customers.map((c) => {
    if (!c.firstName) {
      return {
        ...c,
        firstName: c.name || '',
        lastName: c.lastName ?? '',
      };
    }
    return c;
  });
}

export async function saveCustomers(customers: Customer[]): Promise<void> {
  return saveData(STORE_KEYS.CUSTOMERS, customers);
}

// ============ Focus Items Operations ============

const generateDraftId = () => Math.random().toString(36).substr(2, 9);

export async function loadFocusItems(): Promise<FocusItem[]> {
  const items = await loadData<FocusItem[]>(STORE_KEYS.FOCUS_ITEMS, []);
  
  // Migrate legacy single-draft fields to multi-draft format
  return items.map((item) => {
    // If already has drafts array, no migration needed
    if (item.drafts && item.drafts.length > 0) {
      return item;
    }
    
    // Check if there's a legacy draft to migrate
    if (item.draftSubject || item.draftContent) {
      const now = Date.now();
      const draftId = generateDraftId();
      const legacyDraft = {
        id: draftId,
        intent: item.intent || '',
        targetLanguage: 'Professional English', // Default, not stored in legacy
        channelType: 'Email', // Default, not stored in legacy
        subject: item.draftSubject || '',
        content: item.draftContent || '',
        isConfirmed: item.isDraftConfirmed || false,
        confirmedAt: item.draftConfirmedAt,
        createdAt: item.addedAt || now,
        updatedAt: item.draftConfirmedAt || item.addedAt || now,
      };
      
      return {
        ...item,
        drafts: [legacyDraft],
        activeDraftId: draftId,
      };
    }
    
    // No legacy draft, return as-is (drafts will be undefined or empty)
    return item;
  });
}

export async function saveFocusItems(items: FocusItem[]): Promise<void> {
  return saveData(STORE_KEYS.FOCUS_ITEMS, items);
}

// ============ User Profile Operations ============

export async function loadUserProfile(): Promise<UserProfile> {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultProfile: UserProfile = {
    username: currentUsername || 'User',
    name: currentUsername || 'User',
    firstName: currentUsername || 'User',
    lastName: '',
    homeTimezone: browserTz,
    currentTimezone: browserTz,
    workHours: { start: '09:00', end: '18:00' },
  };
  
  // Load stored profile
  const stored = await loadData<Partial<UserProfile>>(STORE_KEYS.USER_PROFILE, {});
  
  // Merge defaults with stored data (backward compatible for old profiles missing new fields)
  return {
    ...defaultProfile,
    ...stored,
    // Ensure workHours is properly merged even if stored has partial workHours
    workHours: {
      ...defaultProfile.workHours,
      ...(stored.workHours || {}),
    },
    // If stored profile has no firstName, use name or username as fallback
    firstName: stored.firstName || stored.name || stored.username || defaultProfile.firstName,
  };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  return saveData(STORE_KEYS.USER_PROFILE, profile);
}

// ============ Vault Management ============

/**
 * Reset vault (delete all data)
 */
export async function resetVault(): Promise<void> {
  currentPassword = null;
  await clearAllData();
}

/**
 * Export all data as encrypted backup (for download)
 */
export async function exportBackup(): Promise<string> {
  if (!currentPassword) {
    throw new Error('Vault is locked');
  }

  const customers = await loadCustomers();
  const focusItems = await loadFocusItems();
  const userProfile = await loadUserProfile();

  const backup = {
    version: 1,
    exportedAt: Date.now(),
    customers,
    focusItems,
    userProfile,
  };

  const jsonData = JSON.stringify(backup);
  const encrypted = await encrypt(jsonData, currentPassword);
  return toBase64(encrypted);
}

/**
 * Import data from encrypted backup
 */
export async function importBackup(backupData: string): Promise<void> {
  if (!currentPassword) {
    throw new Error('Vault is locked');
  }

  try {
    const encrypted = fromBase64(backupData);
    const jsonData = await decrypt(encrypted, currentPassword);
    const backup = JSON.parse(jsonData);

    if (backup.customers) {
      await saveCustomers(backup.customers);
    }
    if (backup.focusItems) {
      await saveFocusItems(backup.focusItems);
    }
    if (backup.userProfile) {
      await saveUserProfile(backup.userProfile);
    }
  } catch {
    throw new Error('Failed to import backup. Invalid data or wrong password.');
  }
}
