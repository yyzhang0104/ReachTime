/**
 * Time Header Component
 * Shows current time in user's timezone with travel mode toggle
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatInTimeZone } from 'date-fns-tz';
import { useStore } from '@/store';
import { TIMEZONE_REGIONS } from '@/services/availability';

export const TimeHeader: React.FC = () => {
  const { userProfile, setCurrentTimezone, lockVault } = useStore();
  const [now, setNow] = useState(new Date());
  const [showTimezoneSelector, setShowTimezoneSelector] = useState(false);

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

          {/* Lock Button */}
          <button
            onClick={lockVault}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Lock Vault"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
    </>
  );
};
