/**
 * Zustand Store - Main application state
 * Uses encrypted vault for persistence instead of localStorage
 * 
 * Features:
 * - Reminder persistence: Restores setTimeout reminders after vault unlock
 */

import { create } from 'zustand';
import type { Customer, FocusItem, UserProfile, VaultState } from '@/types';
import * as vault from '@/storage/vault';
import { setReminder as createReminderTimeout } from '@/services/scheduling';

interface AppState {
  // Vault state
  vaultState: VaultState;
  isLoading: boolean;
  error: string | null;
  knownUsers: string[];
  selectedUsername: string;
  setSelectedUsername: (username: string) => void;

  // Data
  customers: Customer[];
  focusItems: FocusItem[];
  userProfile: UserProfile;

  // Active reminders (timer IDs)
  activeReminders: Map<string, () => void>; // customerId -> cancel function

  // Vault actions
  checkVaultState: () => Promise<void>;
  initializeVault: (username: string, password: string) => Promise<boolean>;
  unlockVault: (username: string, password: string) => Promise<boolean>;
  lockVault: () => void;
  
  // Customer actions
  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  
  // Focus actions
  addToFocus: (customerId: string, intent?: string) => Promise<void>;
  removeFromFocus: (customerId: string) => Promise<void>;
  updateFocusItem: (customerId: string, updates: Partial<FocusItem>) => Promise<void>;
  
  // Profile actions
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
  setCurrentTimezone: (timezone: string) => Promise<void>;
  
  // Reminder actions
  setReminder: (customerId: string, cancel: () => void) => void;
  clearReminder: (customerId: string) => void;
  
  // Utility
  refreshData: () => Promise<void>;
  restoreReminders: () => void;
  clearError: () => void;
}

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const defaultUserProfile: UserProfile = {
  username: 'User',
  name: 'User',
  firstName: 'User',
  lastName: '',
  homeTimezone: browserTz,
  currentTimezone: browserTz,
  workHours: { start: '09:00', end: '18:00' },
};

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  vaultState: 'locked',
  isLoading: true,
  error: null,
  knownUsers: [],
  selectedUsername: '',
  setSelectedUsername: (username: string) => set({ selectedUsername: username }),
  customers: [],
  focusItems: [],
  userProfile: defaultUserProfile,
  activeReminders: new Map(),

  // Check vault initialization state
  checkVaultState: async () => {
    try {
      set({ isLoading: true, error: null });
      const info = await vault.checkVaultState();
      const selected = get().selectedUsername || info.lastUser || info.users[0] || '';
      set({
        vaultState: info.state,
        knownUsers: info.users,
        selectedUsername: selected,
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  // Initialize vault with new password
  initializeVault: async (username: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      await vault.initializeVault(username, password);
      await get().refreshData();
      set({ vaultState: 'unlocked', isLoading: false });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  // Unlock vault with password
  unlockVault: async (username: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const success = await vault.unlockVault(username, password);
      if (success) {
        await get().refreshData();
        set({ vaultState: 'unlocked', isLoading: false });
        return true;
      } else {
        set({ error: 'Incorrect password', isLoading: false });
        return false;
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  // Lock vault
  lockVault: () => {
    vault.lockVault();
    // Clear all active reminders
    get().activeReminders.forEach((cancel) => cancel());
    set({
      vaultState: 'locked',
      customers: [],
      focusItems: [],
      userProfile: defaultUserProfile,
      activeReminders: new Map(),
    });
  },

  // Refresh all data from vault and restore reminders
  refreshData: async () => {
    try {
      const [customers, focusItems, userProfile] = await Promise.all([
        vault.loadCustomers(),
        vault.loadFocusItems(),
        vault.loadUserProfile(),
      ]);
      set({ customers, focusItems, userProfile });
      
      // Restore reminders from persisted data
      get().restoreReminders();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
  
  // Restore reminders from persisted focusItems after unlock
  restoreReminders: () => {
    const { focusItems, customers, activeReminders } = get();
    const now = Date.now();
    const newReminders = new Map(activeReminders);
    const itemsToUpdate: { customerId: string; updates: Partial<FocusItem> }[] = [];
    
    for (const item of focusItems) {
      // Skip if no scheduled time or reminder not set
      if (!item.reminderSet) continue;
      
      // Use confirmedScheduledTime if confirmed, otherwise scheduledTime
      const scheduledTime = item.isTimeConfirmed && item.confirmedScheduledTime
        ? item.confirmedScheduledTime
        : item.scheduledTime;
      
      if (!scheduledTime) continue;
      
      // Check if time has passed
      if (scheduledTime <= now) {
        // Time has passed - clean up reminderSet flag
        itemsToUpdate.push({
          customerId: item.customerId,
          updates: { reminderSet: false },
        });
        continue;
      }
      
      // Skip if reminder is already active
      if (newReminders.has(item.customerId)) continue;
      
      // Find customer name for notification
      const customer = customers.find((c) => c.id === item.customerId);
      const customerName = customer?.name || 'Customer';
      
      // Create the reminder timeout
      const cancel = createReminderTimeout(
        new Date(scheduledTime),
        customerName,
        item.intent || 'Scheduled follow-up',
        () => {
          // When triggered, update the focus item
          const state = get();
          const updatedItems = state.focusItems.map((f) =>
            f.customerId === item.customerId
              ? { ...f, reminderSet: false }
              : f
          );
          vault.saveFocusItems(updatedItems).catch(console.error);
          set({ focusItems: updatedItems });
          
          // Remove from active reminders
          const reminders = new Map(state.activeReminders);
          reminders.delete(item.customerId);
          set({ activeReminders: reminders });
        }
      );
      
      newReminders.set(item.customerId, cancel);
    }
    
    // Update state with restored reminders
    set({ activeReminders: newReminders });
    
    // Clean up expired reminder flags (in background)
    if (itemsToUpdate.length > 0) {
      const updatedFocusItems = get().focusItems.map((f) => {
        const update = itemsToUpdate.find((u) => u.customerId === f.customerId);
        return update ? { ...f, ...update.updates } : f;
      });
      vault.saveFocusItems(updatedFocusItems).catch(console.error);
      set({ focusItems: updatedFocusItems });
    }
  },

  // Add a new customer
  addCustomer: async (customer: Customer) => {
    const customers = [...get().customers, customer];
    await vault.saveCustomers(customers);
    set({ customers });
  },

  // Update a customer
  updateCustomer: async (id: string, updates: Partial<Customer>) => {
    const customers = get().customers.map((c) =>
      c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
    );
    await vault.saveCustomers(customers);
    set({ customers });
  },

  // Delete a customer
  deleteCustomer: async (id: string) => {
    const customers = get().customers.filter((c) => c.id !== id);
    const focusItems = get().focusItems.filter((f) => f.customerId !== id);
    await Promise.all([
      vault.saveCustomers(customers),
      vault.saveFocusItems(focusItems),
    ]);
    // Clear any active reminder
    get().clearReminder(id);
    set({ customers, focusItems });
  },

  // Add customer to today's focus
  addToFocus: async (customerId: string, intent?: string) => {
    const existing = get().focusItems.find((f) => f.customerId === customerId);
    if (existing) return; // Already in focus

    const newItem: FocusItem = {
      customerId,
      intent: intent || '',
      reminderSet: false,
      addedAt: Date.now(),
    };
    const focusItems = [...get().focusItems, newItem];
    await vault.saveFocusItems(focusItems);
    set({ focusItems });
  },

  // Remove customer from focus
  removeFromFocus: async (customerId: string) => {
    const focusItems = get().focusItems.filter((f) => f.customerId !== customerId);
    await vault.saveFocusItems(focusItems);
    get().clearReminder(customerId);
    set({ focusItems });
  },

  // Update focus item
  updateFocusItem: async (customerId: string, updates: Partial<FocusItem>) => {
    const focusItems = get().focusItems.map((f) =>
      f.customerId === customerId ? { ...f, ...updates } : f
    );
    await vault.saveFocusItems(focusItems);
    set({ focusItems });
  },

  // Update user profile
  updateUserProfile: async (updates: Partial<UserProfile>) => {
    const userProfile = { ...get().userProfile, ...updates };
    await vault.saveUserProfile(userProfile);
    set({ userProfile });
  },

  // Set current timezone (for travel mode)
  setCurrentTimezone: async (timezone: string) => {
    await get().updateUserProfile({ currentTimezone: timezone });
  },

  // Set a reminder
  setReminder: (customerId: string, cancel: () => void) => {
    const reminders = new Map(get().activeReminders);
    // Cancel existing reminder if any
    if (reminders.has(customerId)) {
      reminders.get(customerId)!();
    }
    reminders.set(customerId, cancel);
    set({ activeReminders: reminders });
  },

  // Clear a reminder
  clearReminder: (customerId: string) => {
    const reminders = new Map(get().activeReminders);
    if (reminders.has(customerId)) {
      reminders.get(customerId)!();
      reminders.delete(customerId);
      set({ activeReminders: reminders });
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));

// Helper hook to get a customer by ID
export function useCustomer(id: string): Customer | undefined {
  return useStore((state) => state.customers.find((c) => c.id === id));
}

// Helper hook to get focus item for a customer
export function useFocusItem(customerId: string): FocusItem | undefined {
  return useStore((state) => state.focusItems.find((f) => f.customerId === customerId));
}

// Helper hook to check if customer is in focus
export function useIsInFocus(customerId: string): boolean {
  return useStore((state) => state.focusItems.some((f) => f.customerId === customerId));
}
