/**
 * Main Application Component
 * Handles vault state and main layout
 */

import React, { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { VaultScreen } from '@/components/VaultScreen';
import { TimeHeader } from '@/components/TimeHeader';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { CustomerForm } from '@/features/customers/CustomerForm';
import { AnimatePresence } from 'framer-motion';

const App: React.FC = () => {
  const { vaultState, isLoading, checkVaultState } = useStore();
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Check vault state on mount
  useEffect(() => {
    checkVaultState();
  }, [checkVaultState]);

  // Show loading spinner while checking vault state
  if (isLoading && vaultState === 'locked') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Show vault screen if locked or uninitialized
  if (vaultState !== 'unlocked') {
    return <VaultScreen />;
  }

  // Main application
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TimeHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <Dashboard onAddCustomer={() => setIsFormOpen(true)} />
      </main>

      {/* Security Badge */}
      <div className="fixed bottom-6 left-6 flex items-center gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-100 shadow-sm text-xs font-semibold text-slate-400">
        <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
        Local Vault: AES-256 Encrypted
      </div>

      {/* Customer Form Modal */}
      <AnimatePresence>
        {isFormOpen && <CustomerForm onClose={() => setIsFormOpen(false)} />}
      </AnimatePresence>

      <footer className="py-8 px-6 text-center text-slate-400 text-sm">
        &copy; 2024 GlobalSync CRM • Built for World Traders
      </footer>
    </div>
  );
};

export default App;
