import React, { useState, useEffect, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { useGesture } from '@use-gesture/react';
import { Upload, Lock, Settings2, RotateCw, ZoomIn, RefreshCcw, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AppState {
  imageBlob: Blob | null;
  scale: number;
  rotation: number;
  x: number;
  y: number;
}

const DEFAULT_STATE: AppState = {
  imageBlob: null,
  scale: 100,
  rotation: 0,
  x: 0,
  y: 0,
};

export default function App() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [showPadlock, setShowPadlock] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const unlockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [unlockProgress, setUnlockProgress] = useState(0);

  // Listen for 3-finger tap (tablet) or ArrowUp (desktop) to reveal the padlock
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (isLocked && e.touches.length === 3) {
        setShowPadlock(true);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked && e.key === 'ArrowUp') {
        setShowPadlock(true);
      }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLocked]);

  // Load state on mount
  useEffect(() => {
    async function loadState() {
      try {
        const savedState = await get('tracepad-state');
        if (savedState) {
          setState(savedState);
          if (savedState.imageBlob) {
            setImageUrl(URL.createObjectURL(savedState.imageBlob));
          }
        }
      } catch (err) {
        console.error('Failed to load state', err);
      } finally {
        setIsLoaded(true);
      }
    }
    loadState();
  }, []);

  // Save state when it changes
  useEffect(() => {
    if (!isLoaded) return;
    
    const saveState = async () => {
      try {
        await set('tracepad-state', state);
      } catch (err) {
        console.error('Failed to save state', err);
      }
    };
    
    const timer = setTimeout(saveState, 500);
    return () => clearTimeout(timer);
  }, [state, isLoaded]);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (imageUrl) URL.revokeObjectURL(imageUrl);

    const newUrl = URL.createObjectURL(file);
    setImageUrl(newUrl);
    setState(prev => ({
      ...prev,
      imageBlob: file,
      scale: 100,
      rotation: 0,
      x: 0,
      y: 0
    }));
  };

  // Gesture handling
  const bind = useGesture(
    {
      onDrag: ({ offset: [x, y] }) => {
        if (isLocked) return;
        setState(prev => ({ ...prev, x, y }));
      },
      onPinch: ({ offset: [s] }) => {
        if (isLocked) return;
        setState(prev => ({ 
          ...prev, 
          scale: Math.min(Math.max(s * 100, 10), 1000),
        }));
      }
    },
    {
      drag: {
        from: () => [state.x, state.y],
        filterTaps: true,
      },
      pinch: {
        from: () => [state.scale / 100, state.rotation],
        scaleBounds: { min: 0.1, max: 10 },
      }
    }
  );

  // Unlock logic
  const handleUnlockStart = () => {
    if (!isLocked) return;
    setUnlockProgress(0);
    
    let progress = 0;
    const interval = 30;
    const totalTime = 3000;
    const step = (interval / totalTime) * 100;

    unlockTimerRef.current = setInterval(() => {
      progress += step;
      setUnlockProgress(progress);
      if (progress >= 100) {
        if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
        setIsLocked(false);
        setShowSidebar(true);
        setUnlockProgress(0);
      }
    }, interval);
  };

  const handleUnlockEnd = () => {
    if (unlockTimerRef.current) {
      clearInterval(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setUnlockProgress(0);
  };

  if (!isLoaded) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500">Loading workspace...</div>;
  }

  return (
    <div className="fixed inset-0 bg-neutral-950 text-neutral-100 overflow-hidden touch-none select-none font-sans">
      {/* Workspace Area */}
      <div {...bind()} className="absolute inset-0 w-full h-full flex items-center justify-center cursor-move">
        {imageUrl ? (
          <motion.img
            src={imageUrl}
            alt="Tracing"
            className="max-w-none origin-center pointer-events-none"
            style={{
              x: state.x,
              y: state.y,
              scale: state.scale / 100,
              rotate: state.rotation,
            }}
            draggable={false}
          />
        ) : (
          <div className="text-neutral-600 flex flex-col items-center gap-4 pointer-events-none">
            <Upload className="w-16 h-16 opacity-50" />
            <p className="text-lg font-medium">Upload an image to start tracing</p>
          </div>
        )}
      </div>

      {/* Unlock Area (Top Left) */}
      {isLocked && showPadlock && (
        <div 
          className="absolute top-0 left-0 w-40 h-40 z-50 flex items-start justify-start p-6 cursor-pointer"
          onPointerDown={handleUnlockStart}
          onPointerUp={handleUnlockEnd}
          onPointerLeave={handleUnlockEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="relative w-14 h-14 flex items-center justify-center bg-black/40 rounded-full backdrop-blur-md border border-white/10 shadow-2xl">
            <Lock className="w-6 h-6 text-white/70" />
            {unlockProgress > 0 && (
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth="4"
                  strokeDasharray={`${unlockProgress * 3.01} 301`}
                  className="transition-all duration-75 ease-linear"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <AnimatePresence>
        {!isLocked && showSidebar && (
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-0 left-0 bottom-0 w-80 bg-neutral-900/95 backdrop-blur-2xl border-r border-white/10 p-6 flex flex-col gap-8 z-40 overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold tracking-tight text-white">TracePad Pro</h1>
              <button 
                onClick={() => { setIsLocked(true); setShowSidebar(false); setShowPadlock(false); }}
                className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors flex items-center gap-2"
                title="Lock Workspace"
              >
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Lock</span>
              </button>
            </div>

            {/* Upload */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Source Image</label>
              <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-neutral-700 rounded-xl hover:border-neutral-500 hover:bg-neutral-800/50 transition-colors cursor-pointer group">
                <div className="flex flex-col items-center gap-3 text-neutral-400 group-hover:text-neutral-300 transition-colors">
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">Choose new image</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            {/* Scale */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                  <ZoomIn className="w-4 h-4" /> Scale
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={Math.round(state.scale)}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) {
                        setState(prev => ({ ...prev, scale: Math.min(Math.max(val, 10), 1000) }));
                      }
                    }}
                    className="w-16 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-right text-sm font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                  <span className="text-sm text-neutral-500 font-medium">%</span>
                </div>
              </div>
              <input
                type="range"
                min="10"
                max="1000"
                value={state.scale}
                onChange={(e) => setState(prev => ({ ...prev, scale: Number(e.target.value) }))}
                className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Rotation */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                  <RotateCw className="w-4 h-4" /> Rotation
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-neutral-300">{Math.round(state.rotation)}°</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={state.rotation}
                onChange={(e) => setState(prev => ({ ...prev, rotation: Number(e.target.value) }))}
                className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Reset */}
            <div className="pt-4 border-t border-white/10 mt-auto">
              <button
                onClick={() => setState(prev => ({ ...prev, scale: 100, rotation: 0, x: 0, y: 0 }))}
                className="w-full py-2.5 bg-neutral-800 text-neutral-300 rounded-xl hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <RefreshCcw className="w-4 h-4" /> Reset Transform
              </button>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-200/80 leading-relaxed">
                Lock the workspace before tracing. Everything will hide. Tap the screen with <strong>3 fingers</strong> (or press Arrow Up on desktop) to reveal the padlock, then long-press it for 3 seconds to unlock.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Sidebar Button */}
      {!isLocked && !showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="absolute top-6 left-6 z-30 p-3 bg-neutral-900/90 backdrop-blur-md rounded-xl border border-white/10 text-white shadow-xl hover:bg-neutral-800 transition-all hover:scale-105 active:scale-95"
        >
          <Settings2 className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
