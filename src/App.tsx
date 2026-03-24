import React, { useState, useEffect, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { useGesture } from '@use-gesture/react';
import { Upload, Lock, Settings2, RotateCw, RotateCcw, ZoomIn, RefreshCcw, Info, Sun, Contrast, FlipHorizontal, FlipVertical, Grid, Maximize, Minimize, Moon, Wand2, Droplet, PenTool, MoveHorizontal, MoveVertical, Layers, Trash2, PanelLeftClose } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AppState {
  imageBlob: Blob | null;
  scale: number | '';
  rotation: number;
  x: number;
  y: number;
  brightness: number;
  contrast: number;
  isInverted: boolean;
  isGrayscale: boolean;
  isFlippedHorizontal: boolean;
  isFlippedVertical: boolean;
  showGrid: boolean;
  gridSize: number;
  gridColor: string;
  isOutlineMode: boolean;
  isStencilMode: boolean;
  stencilThreshold: number;
  backgroundColor: 'dark' | 'light';
  guidelines: { id: string; type: 'horizontal' | 'vertical'; position: number }[];
  guidelineColor: string;
  guidelineThickness: number;
}

const DEFAULT_STATE: AppState = {
  imageBlob: null,
  scale: 100,
  rotation: 0,
  x: 0,
  y: 0,
  brightness: 100,
  contrast: 100,
  isInverted: false,
  isGrayscale: false,
  isFlippedHorizontal: false,
  isFlippedVertical: false,
  showGrid: false,
  gridSize: 24,
  gridColor: '#ffffff',
  isOutlineMode: false,
  isStencilMode: false,
  stencilThreshold: 128,
  backgroundColor: 'dark',
  guidelines: [],
  guidelineColor: '#4f46e5', // indigo-600
  guidelineThickness: 2,
};

export default function App() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [showPadlock, setShowPadlock] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const unlockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [unlockProgress, setUnlockProgress] = useState(0);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Screen Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
      if (isLocked && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err: any) {
          // Ignore permissions policy errors in iframe environments
          if (err.name !== 'NotAllowedError' && !err.message?.includes('permissions policy')) {
            console.warn(`Failed to request wake lock:`, err);
          }
        }
      } else if (!isLocked && wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };

    requestWakeLock();

    // Re-request wake lock if visibility changes (e.g., user switches tabs and comes back)
    const handleVisibilityChange = async () => {
      if (isLocked && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err: any) {
          if (err.name !== 'NotAllowedError' && !err.message?.includes('permissions policy')) {
            console.warn(`Failed to re-request wake lock:`, err);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(console.error);
      }
    };
  }, [isLocked]);

  // Auto-hide padlock after 3 seconds of inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (showPadlock && unlockProgress === 0) {
      timeout = setTimeout(() => setShowPadlock(false), 3000);
    }
    return () => clearTimeout(timeout);
  }, [showPadlock, unlockProgress]);

  // Prevent scrolling/pull-to-refresh when locked
  useEffect(() => {
    if (!isLocked) return;
    const preventScroll = (e: TouchEvent) => {
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, [isLocked]);

  // Prevent accidental navigation/closing when locked
  useEffect(() => {
    if (!isLocked) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.pathname);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.pathname);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isLocked]);

  // Keep screen awake when locked (Screen Wake Lock API)
  useEffect(() => {
    if (!isLocked) return;
    
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('Wake Lock request failed', err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLock) wakeLock.release();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLocked]);

  // Prevent context menu when locked
  useEffect(() => {
    if (!isLocked) return;
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);
    return () => document.removeEventListener('contextmenu', preventContextMenu);
  }, [isLocked]);

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
          setState({ ...DEFAULT_STATE, ...savedState, guidelines: savedState.guidelines || [] });
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
      y: 0,
      brightness: 100,
      contrast: 100,
      isInverted: false,
      isGrayscale: false,
      isFlippedHorizontal: false,
      isFlippedVertical: false,
      isOutlineMode: false,
      isStencilMode: false,
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
        from: () => [Number(state.scale) / 100, state.rotation],
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
        
        // Try to clean up the history state we pushed
        try {
          window.history.back();
        } catch (e) {
          console.warn("History back failed", e);
        }

        try {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
        } catch (err) {
          console.warn("Exit fullscreen failed", err);
        }
      }
    }, interval);
  };

  const lockWorkspace = async () => {
    setIsLocked(true);
    setShowSidebar(false);
    setShowPadlock(false);
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen request failed", err);
    }
  };

  const handleUnlockEnd = () => {
    if (unlockTimerRef.current) {
      clearInterval(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setUnlockProgress(0);
  };

  // Guideline handling
  const addGuideline = (type: 'horizontal' | 'vertical') => {
    setState(prev => ({
      ...prev,
      guidelines: [
        ...prev.guidelines,
        {
          id: Math.random().toString(36).substr(2, 9),
          type,
          position: type === 'horizontal' ? window.innerHeight / 2 : window.innerWidth / 2
        }
      ]
    }));
  };

  const removeGuideline = (id: string) => {
    setState(prev => ({
      ...prev,
      guidelines: prev.guidelines.filter(g => g.id !== id)
    }));
  };

  const clearGuidelines = () => {
    setState(prev => ({ ...prev, guidelines: [] }));
  };

  const bindGuideline = useGesture(
    {
      onDrag: ({ args: [id], movement: [mx, my], memo = state.guidelines.find(g => g.id === id)?.position || 0 }) => {
        if (isLocked) return memo;
        const guideline = state.guidelines.find(g => g.id === id);
        if (!guideline) return memo;

        setState(prev => ({
          ...prev,
          guidelines: prev.guidelines.map(g => {
            if (g.id === id) {
              return {
                ...g,
                position: guideline.type === 'horizontal' ? memo + my : memo + mx
              };
            }
            return g;
          })
        }));
        return memo;
      }
    },
    {
      drag: {
        filterTaps: true
      }
    }
  );

  if (!isLoaded) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500">Loading workspace...</div>;
  }

  return (
    <div ref={containerRef} className={`fixed inset-0 ${state.backgroundColor === 'light' ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-950 text-neutral-100'} overflow-hidden touch-none select-none font-sans`}>
      {/* SVG Filters */}
      <svg width="0" height="0" className="absolute pointer-events-none">
        <filter id="outline-effect">
          <feColorMatrix type="matrix" values="0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 1 0" result="gray"/>
          <feConvolveMatrix order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="true" in="gray" result="edges"/>
        </filter>
        <filter id="stencil-effect">
          <feColorMatrix type="matrix" values="0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 1 0" result="gray"/>
          <feComponentTransfer in="gray" result="threshold">
            <feFuncR type="linear" slope="255" intercept={-state.stencilThreshold}/>
            <feFuncG type="linear" slope="255" intercept={-state.stencilThreshold}/>
            <feFuncB type="linear" slope="255" intercept={-state.stencilThreshold}/>
          </feComponentTransfer>
        </filter>
      </svg>

      {/* Workspace Area */}
      <div {...bind()} className="absolute inset-0 w-full h-full flex items-center justify-center cursor-move">
        {imageUrl ? (
          <motion.img
            src={imageUrl}
            alt="Tracing"
            className="max-w-full max-h-full object-contain origin-center pointer-events-none"
            style={{
              x: state.x,
              y: state.y,
              scaleX: (Number(state.scale) / 100) * (state.isFlippedHorizontal ? -1 : 1),
              scaleY: (Number(state.scale) / 100) * (state.isFlippedVertical ? -1 : 1),
              rotate: state.rotation,
              filter: `brightness(${state.brightness ?? 100}%) contrast(${state.contrast ?? 100}%) ${state.isInverted ? 'invert(100%)' : ''} ${state.isGrayscale ? 'grayscale(100%)' : ''} ${state.isOutlineMode ? 'url(#outline-effect)' : ''} ${state.isStencilMode ? 'url(#stencil-effect)' : ''}`,
            }}
            draggable={false}
          />
        ) : (
          <div className={`${state.backgroundColor === 'light' ? 'text-neutral-400' : 'text-neutral-600'} flex flex-col items-center gap-4 pointer-events-none`}>
            <Upload className="w-16 h-16 opacity-50" />
            <p className="text-lg font-medium">Upload an image to start tracing</p>
          </div>
        )}
      </div>

      {/* Grid Overlay */}
      {state.showGrid && (
        <div 
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundImage: `linear-gradient(to right, ${state.gridColor}33 1px, transparent 1px), linear-gradient(to bottom, ${state.gridColor}33 1px, transparent 1px)`,
            backgroundSize: `${state.gridSize}px ${state.gridSize}px`
          }}
        ></div>
      )}

      {/* Guidelines */}
      {state.guidelines.map(guideline => (
        <div
          key={guideline.id}
          {...bindGuideline(guideline.id)}
          className={`absolute z-20 flex items-center justify-center group ${isLocked ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'} ${
            guideline.type === 'horizontal' 
              ? 'left-0 right-0 h-6 -translate-y-1/2' 
              : 'top-0 bottom-0 w-6 -translate-x-1/2'
          }`}
          style={{
            [guideline.type === 'horizontal' ? 'top' : 'left']: guideline.position,
          }}
          onDoubleClick={() => !isLocked && removeGuideline(guideline.id)}
        >
          <div 
            className="transition-colors"
            style={{ 
              backgroundColor: isLocked ? '#ef444480' : state.guidelineColor,
              width: guideline.type === 'horizontal' ? '100%' : `${state.guidelineThickness}px`,
              height: guideline.type === 'horizontal' ? `${state.guidelineThickness}px` : '100%',
              opacity: isLocked ? 0.5 : 0.8,
            }}
          />
        </div>
      ))}

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
              <h1 className="text-xl font-semibold tracking-tight text-white">TracePad</h1>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowSidebar(false)}
                  className="p-2 bg-neutral-800 text-neutral-400 rounded-lg hover:bg-neutral-700 hover:text-white transition-colors"
                  title="Hide Menu"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
                <button 
                  onClick={lockWorkspace}
                  className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors flex items-center gap-2"
                  title="Lock Workspace"
                >
                  <Lock className="w-4 h-4" />
                  <span className="text-sm font-medium">Lock</span>
                </button>
              </div>
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
                    value={state.scale === '' ? '' : Math.round(Number(state.scale))}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setState(prev => ({ ...prev, scale: '' }));
                      } else {
                        setState(prev => ({ ...prev, scale: Number(val) }));
                      }
                    }}
                    onBlur={() => {
                      setState(prev => ({ ...prev, scale: Math.min(Math.max(Number(prev.scale) || 10, 10), 1000) }));
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
                value={state.scale === '' ? 10 : state.scale}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setState(prev => ({ ...prev, rotation: prev.rotation - 90 }))}
                  className="py-1.5 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors flex-1 flex justify-center items-center gap-2 border border-white/5"
                  title="Rotate Left 90°"
                >
                  <RotateCcw className="w-4 h-4" /> <span className="text-xs font-medium">-90°</span>
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, rotation: prev.rotation + 90 }))}
                  className="py-1.5 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors flex-1 flex justify-center items-center gap-2 border border-white/5"
                  title="Rotate Right 90°"
                >
                  <RotateCw className="w-4 h-4" /> <span className="text-xs font-medium">+90°</span>
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={((state.rotation % 360) + 360) % 360}
                onChange={(e) => {
                  const currentMod = ((state.rotation % 360) + 360) % 360;
                  const diff = Number(e.target.value) - currentMod;
                  setState(prev => ({ ...prev, rotation: prev.rotation + diff }));
                }}
                className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Brightness & Contrast */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                  <Sun className="w-4 h-4" /> Brightness
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-neutral-300">{Math.round(state.brightness ?? 100)}%</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={state.brightness ?? 100}
                onChange={(e) => setState(prev => ({ ...prev, brightness: Number(e.target.value) }))}
                className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
              
              <div className="flex items-center justify-between pt-2">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                  <Contrast className="w-4 h-4" /> Contrast
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-neutral-300">{Math.round(state.contrast ?? 100)}%</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={state.contrast ?? 100}
                onChange={(e) => setState(prev => ({ ...prev, contrast: Number(e.target.value) }))}
                className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Stencil Threshold */}
            {state.isStencilMode && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Stencil Threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-neutral-300">{state.stencilThreshold}</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={state.stencilThreshold}
                  onChange={(e) => setState(prev => ({ ...prev, stencilThreshold: Number(e.target.value) }))}
                  className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}

            {/* Grid Controls */}
            {state.showGrid && (
              <div className="space-y-4 p-4 bg-neutral-800/50 rounded-xl border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                    <Grid className="w-4 h-4" /> Grid Size
                  </label>
                  <span className="text-sm font-mono text-neutral-300">{state.gridSize}px</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  value={state.gridSize}
                  onChange={(e) => setState(prev => ({ ...prev, gridSize: Number(e.target.value) }))}
                  className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex items-center justify-between pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">Grid Color</label>
                  <div className="flex gap-2">
                    {['#ffffff', '#000000', '#ef4444', '#3b82f6', '#10b981'].map(color => (
                      <button
                        key={color}
                        onClick={() => setState(prev => ({ ...prev, gridColor: color }))}
                        className={`w-6 h-6 rounded-full border-2 ${state.gridColor === color ? 'border-indigo-500' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                        title={`Set grid color to ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">Quick Actions</label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => setState(prev => ({ ...prev, isFlippedHorizontal: !prev.isFlippedHorizontal }))}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${state.isFlippedHorizontal ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Flip Horizontal"
                >
                  <FlipHorizontal className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, isFlippedVertical: !prev.isFlippedVertical }))}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${state.isFlippedVertical ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Flip Vertical"
                >
                  <FlipVertical className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, isInverted: !prev.isInverted }))}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${state.isInverted ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Invert Colors"
                >
                  <Wand2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, isGrayscale: !prev.isGrayscale }))}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${state.isGrayscale ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Grayscale"
                >
                  <Droplet className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, isOutlineMode: !prev.isOutlineMode, isStencilMode: false }))}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${state.isOutlineMode ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Outline Mode (Edge Detection)"
                >
                  <PenTool className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, isStencilMode: !prev.isStencilMode, isOutlineMode: false }))}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${state.isStencilMode ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Stencil Mode (Threshold)"
                >
                  <Layers className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${state.showGrid ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Toggle Grid"
                >
                  <Grid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, backgroundColor: prev.backgroundColor === 'dark' ? 'light' : 'dark' }))}
                  className="p-2 rounded-lg flex items-center justify-center bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
                  title="Toggle Background Color"
                >
                  {state.backgroundColor === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleFullscreen}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${isFullscreen ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'}`}
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Guidelines Actions */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">Guidelines</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => addGuideline('horizontal')}
                  className="p-2 rounded-lg flex items-center justify-center bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
                  title="Add Horizontal Guideline"
                >
                  <MoveHorizontal className="w-5 h-5" />
                </button>
                <button
                  onClick={() => addGuideline('vertical')}
                  className="p-2 rounded-lg flex items-center justify-center bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
                  title="Add Vertical Guideline"
                >
                  <MoveVertical className="w-5 h-5" />
                </button>
                <button
                  onClick={clearGuidelines}
                  disabled={state.guidelines.length === 0}
                  className="p-2 rounded-lg flex items-center justify-center bg-neutral-800 text-neutral-400 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Clear All Guidelines"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              {state.guidelines.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">Color</label>
                    <div className="flex gap-2">
                      {['#4f46e5', '#ef4444', '#10b981', '#000000', '#ffffff'].map(color => (
                        <button
                          key={color}
                          onClick={() => setState(prev => ({ ...prev, guidelineColor: color }))}
                          className={`w-5 h-5 rounded-full border-2 ${state.guidelineColor === color ? 'border-white' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                          title={`Set guideline color to ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-neutral-400">
                      <span>Thickness</span>
                      <span>{state.guidelineThickness}px</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={state.guidelineThickness}
                      onChange={(e) => setState(prev => ({ ...prev, guidelineThickness: Number(e.target.value) }))}
                      className="w-full accent-indigo-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <p className="text-xs text-neutral-500 text-center pt-1">Double-click a guideline to remove it</p>
                </div>
              )}
            </div>

            {/* Reset */}
            <div className="pt-4 border-t border-white/10 mt-auto">
              <button
                onClick={() => setState(prev => ({ 
                  ...prev, 
                  scale: 100, 
                  rotation: 0, 
                  x: 0, 
                  y: 0, 
                  brightness: 100,
                  contrast: 100,
                  isInverted: false,
                  isGrayscale: false,
                  isOutlineMode: false,
                  isStencilMode: false,
                  isFlippedHorizontal: false,
                  isFlippedVertical: false,
                }))}
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
          title="Show Menu"
        >
          <Settings2 className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
