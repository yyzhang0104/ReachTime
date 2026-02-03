/**
 * Vault Lock/Unlock Screen
 * Handles vault initialization and authentication
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';

export const VaultScreen: React.FC = () => {
  const {
    vaultState,
    knownUsers,
    selectedUsername,
    setSelectedUsername,
    initializeVault,
    unlockVault,
    error,
    isLoading,
    clearError,
  } = useStore();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const hasExistingUsers = knownUsers.length > 0;

  const initialUsername = selectedUsername || (hasExistingUsers ? knownUsers[0] : '');
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const isInitializing = vaultState === 'uninitialized';
  const isSignUp = isInitializing || mode === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (!username.trim()) {
      setLocalError('Username is required');
      return;
    }

    if (isSignUp) {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters');
        return;
      }
      await initializeVault(username.trim(), password);
    } else {
      await unlockVault(username.trim(), password);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-500/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">GlobalSync CRM</h1>
          <p className="text-slate-400">
            {isInitializing ? 'Create your local account' : (isSignUp ? 'Create a new local account' : 'Sign in to your account')}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
          {/* Mode Switch (only when vault already exists) */}
          {!isInitializing && (
            <div className="mb-6 flex bg-white/5 rounded-xl p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  !isSignUp ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isSignUp ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Username
              </label>
              {hasExistingUsers && !isSignUp ? (
                <select
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setSelectedUsername(e.target.value);
                  }}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  disabled={isLoading}
                >
                  {knownUsers.map((u) => (
                    <option key={u} value={u} className="text-slate-900">
                      {u}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. alex"
                  required
                  disabled={isLoading}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {isSignUp ? 'Create Password' : 'Password'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your password"
                required
                disabled={isLoading}
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="Confirm your password"
                  required
                  disabled={isLoading}
                />
              </div>
            )}

            {displayError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm"
              >
                {displayError}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isSignUp ? 'Creating...' : 'Signing in...'}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </>
              )}
            </button>
          </form>

          {isSignUp && (
            <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-amber-300 text-xs">
                <strong>Important:</strong> Your password encrypts all data locally. If you forget it, your data cannot be recovered.
              </p>
            </div>
          )}
        </div>

        {/* Security Badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
          <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          AES-256 Encrypted • Data Never Leaves Your Device
        </div>
      </motion.div>
    </div>
  );
};
