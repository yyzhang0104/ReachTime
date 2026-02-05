/**
 * Time Header Component
 * Shows current time in user's timezone with travel mode toggle and profile editor
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatInTimeZone } from 'date-fns-tz';
import { useStore } from '@/store';
import { TIMEZONE_REGIONS } from '@/services/availability';

export const TimeHeader: React.FC = () => {
  const { userProfile, setCurrentTimezone, updateUserProfile, lockVault } = useStore();
  const [now, setNow] = useState(new Date());
  const [showTimezoneSelector, setShowTimezoneSelector] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  
  // Profile form state
  const [firstName, setFirstName] = useState(userProfile.firstName);
  const [lastName, setLastName] = useState(userProfile.lastName || '');
  const [workStart, setWorkStart] = useState(userProfile.workHours.start);
  const [workEnd, setWorkEnd] = useState(userProfile.workHours.end);
  const [isSaving, setIsSaving] = useState(false);
  
  // Sync form state when userProfile changes
  useEffect(() => {
    setFirstName(userProfile.firstName);
    setLastName(userProfile.lastName || '');
    setWorkStart(userProfile.workHours.start);
    setWorkEnd(userProfile.workHours.end);
  }, [userProfile]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = formatInTimeZone(now, userProfile.currentTimezone, 'HH:mm:ss');
  const dateStr = formatInTimeZone(now, userProfile.currentTimezone, 'EEE, MMM d');
  const isAway = userProfile.currentTimezone !== userProfile.homeTimezone;

  const handleTimezoneSelect = (tz: string) => {
    setCurrentTimezone(tz);
    setShowTimezoneSelector(false);
  };

  const handleResetToHome = () => {
    setCurrentTimezone(userProfile.homeTimezone);
    setShowTimezoneSelector(false);
  };

  const handleOpenProfileEditor = () => {
    // Reset form to current profile values
    setFirstName(userProfile.firstName);
    setLastName(userProfile.lastName || '');
    setWorkStart(userProfile.workHours.start);
    setWorkEnd(userProfile.workHours.end);
    setShowProfileEditor(true);
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim()) return;
    
    setIsSaving(true);
    try {
      await updateUserProfile({
        ...userProfile,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        name: firstName.trim(), // Keep name in sync for backward compat
        workHours: { start: workStart, end: workEnd },
      });
      setShowProfileEditor(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">ReachTime</h1>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Smart Contact Timing</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Current Time Display */}
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-slate-900 leading-none">{timeStr}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium flex items-center justify-end gap-1">
              {dateStr} • {userProfile.currentTimezone.split('/').pop()?.replace('_', ' ')}
              {isAway && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">
                  TRAVEL
                </span>
              )}
            </div>
          </div>

          {/* Travel Mode Button */}
          <button
            onClick={() => setShowTimezoneSelector(true)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-lg transition-colors border border-slate-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Travel Mode
          </button>

          {/* Profile Button */}
          <button
            onClick={handleOpenProfileEditor}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Edit Profile"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>

          {/* Sign Out Button */}
          <button
            onClick={() => setShowSignOutConfirm(true)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Timezone Selector Modal */}
      <AnimatePresence>
        {showTimezoneSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowTimezoneSelector(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Travel Mode</h2>
                  <p className="text-sm text-slate-500">Select your current timezone</p>
                </div>
                <button
                  onClick={() => setShowTimezoneSelector(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-4 overflow-y-auto max-h-[60vh]">
                {/* Reset to Home */}
                {isAway && (
                  <button
                    onClick={handleResetToHome}
                    className="w-full mb-4 p-3 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium rounded-xl flex items-center gap-3 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Return to Home ({userProfile.homeTimezone.split('/').pop()?.replace('_', ' ')})
                  </button>
                )}

                {/* Timezone by Region */}
                {Object.entries(TIMEZONE_REGIONS).map(([region, timezones]) => (
                  <div key={region} className="mb-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">{region}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {timezones.map((tz) => (
                        <button
                          key={tz}
                          onClick={() => handleTimezoneSelect(tz)}
                          className={`p-2 text-left text-sm rounded-lg transition-colors ${
                            tz === userProfile.currentTimezone
                              ? 'bg-amber-100 text-amber-700 font-medium'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          {tz.split('/').pop()?.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Editor Modal */}
      <AnimatePresence>
        {showProfileEditor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowProfileEditor(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">My Profile</h2>
                  <p className="text-sm text-slate-500">Edit your name and work hours</p>
                </div>
                <button
                  onClick={() => setShowProfileEditor(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* First Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                    First Name (名) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Your first name"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-800"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                    Last Name (姓) <span className="text-slate-400 font-normal normal-case">optional</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Your last name"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-800"
                  />
                </div>

                {/* Work Hours */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                    Work Hours
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-800"
                    />
                    <span className="text-slate-400 font-medium">to</span>
                    <input
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-800"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Used to optimize your scheduling suggestions
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setShowProfileEditor(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={!firstName.trim() || isSaving}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Profile'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sign Out Confirmation Modal */}
      <AnimatePresence>
        {showSignOutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowSignOutConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800">Sign out?</h2>
                </div>
                <p className="text-sm text-slate-600 mb-6">
                  This locks your local vault. You'll need your password to sign in again.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowSignOutConfirm(false)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      lockVault();
                      setShowSignOutConfirm(false);
                    }}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
