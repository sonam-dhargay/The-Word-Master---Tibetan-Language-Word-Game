/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Trophy, 
  ChevronRight, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  BookOpen, 
  ArrowLeft,
  GraduationCap,
  History,
  Calendar,
  Filter,
  Sparkles,
  Search,
  ExternalLink,
  Languages,
  Type,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Sliders,
  Award,
  BarChart3,
  Settings,
  Info,
  Trash2,
  Menu,
  Sun,
  Moon,
  RefreshCw,
  Clock
} from 'lucide-react';
import { Difficulty, Word, UserAnswer } from './types';
import { wordBank } from './data/wordBank';
import { translations, Language } from './translations';
import { getTibetanDictionaryDetails } from './data/tibetanDefinitions';
import confetti from 'canvas-confetti';

/// --- Assets ---
const SOUNDS = {
  // Using reliable CDN-hosted sounds as a fallback
  CORRECT: 'https://raw.githubusercontent.com/Anis-Khemila/Quiz-App/master/sounds/correct.mp3',
  INCORRECT: 'https://raw.githubusercontent.com/Anis-Khemila/Quiz-App/master/sounds/wrong.mp3',
  NEXT: 'https://cdn.pixabay.com/audio/2022/03/15/audio_2d744a5690.mp3',
  TICK: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav',
};

// Web Audio API Synthesizer to guarantee 100% reliable sound effects locally and in iframes without CORS issues
let sharedAudioCtx: AudioContext | null = null;

const playSynthesizedSound = (type: 'CORRECT' | 'INCORRECT' | 'NEXT' | 'TICK') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return false;
    
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }
    
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    if (type === 'CORRECT') {
      // Beautiful major arpeggio chime: C5 -> E5 -> G5
      const notes = [523.25, 659.25, 783.99];
      const durations = [0.25, 0.25, 0.35];
      const delays = [0, 0.08, 0.16];
      
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delays[idx]);
        
        gain.gain.setValueAtTime(0, now + delays[idx]);
        gain.gain.linearRampToValueAtTime(0.12, now + delays[idx] + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delays[idx] + durations[idx]);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now + delays[idx]);
        osc.stop(now + delays[idx] + durations[idx]);
      });
      return true;
    }
    
    if (type === 'INCORRECT') {
      // Gentle but clear dual-tone descending warning: 160Hz/155Hz gliding down
      const freqs = [160, 155];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq - 60, now + 0.35);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.35);
      });
      return true;
    }
    
    if (type === 'NEXT') {
      // High quick interface pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.08);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.08);
      return true;
    }

    if (type === 'TICK') {
      // Clean mechanical clock click tick sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.02);
      return true;
    }
  } catch (err) {
    console.warn('Web Audio synthesis failed, falling back to elements', err);
  }
  return false;
};

// --- Utilities ---
const shuffle = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

type Screen = 'LEVEL_SELECTION' | 'GAME_PLAY' | 'END_GAME' | 'REVIEW';

const SOURCE_LINKS: Record<string, string> = {
  'Monlam Grand Tibetan Dictionary': 'https://www.monlamdictionary.com/',
  'Rangjung Yeshe Wiki': 'https://rywiki.tsadra.org/index.php?search=',
  'Mahavyutpatti': 'https://rywiki.tsadra.org/index.php/Mahavyutpatti',
  'Standard Tibetan': 'https://en.wiktionary.org/wiki/',
  'Tibetan Library': 'https://www.tibetanlibrary.com/dictionary',
  'Library of Tibetan Works and Archives': 'https://www.tibetanlibrary.com/dictionary',
};

export type CategoryId = 'nouns' | 'verbs' | 'adjectives' | 'honorifics' | 'grammar';

export interface MasteryStats {
  easyAttempts: number;
  easyScores: number[];
  intermediateAttempts: number;
  intermediateScores: number[];
  advancedAttempts: number;
  advancedScores: number[];
  totalCorrect: number;
  gamesCompleted: number;
}

const DEFAULT_MASTERY_STATS: MasteryStats = {
  easyAttempts: 0,
  easyScores: [],
  intermediateAttempts: 0,
  intermediateScores: [],
  advancedAttempts: 0,
  advancedScores: [],
  totalCorrect: 0,
  gamesCompleted: 0,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('LEVEL_SELECTION');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [currentQuestions, setCurrentQuestions] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [viewingWordId, setViewingWordId] = useState<string | null>(null);
  const [isTimeTrial, setIsTimeTrial] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tibetan_app_time_trial') === 'true';
    } catch {
      return false;
    }
  });
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('tibetan_app_language');
      return (saved === 'en' || saved === 'bo') ? saved : 'bo';
    } catch {
      return 'bo';
    }
  });
  const [tibetanFont, setTibetanFont] = useState<'noto' | 'monlam'>(() => {
    try {
      const saved = localStorage.getItem('tibetan_app_font');
      return (saved === 'noto' || saved === 'monlam') ? saved : 'noto';
    } catch {
      return 'noto';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-tibetan-font', tibetanFont);
    try {
      localStorage.setItem('tibetan_app_font', tibetanFont);
    } catch (e) {
      console.error(e);
    }
  }, [tibetanFont]);
  const [isMuted, setIsMuted] = useState(false);
  const [wordOfTheDay, setWordOfTheDay] = useState<Word | null>(null);
  const [countdownStr, setCountdownStr] = useState<string>('0h 0m');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [wordsUpdatedCount, setWordsUpdatedCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tibetan_app_words_updated_count');
      return saved ? parseInt(saved, 10) : 18;
    } catch {
      return 18;
    }
  });
  const [lastSyncTime, setLastSyncTime] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tibetan_app_last_sync_time');
      return saved ? parseInt(saved, 10) : (Date.now() - 2.5 * 60 * 60 * 1000);
    } catch {
      return Date.now() - 2.5 * 60 * 60 * 1000;
    }
  });
  const [activeSelectionTab, setActiveSelectionTab] = useState<'games' | 'stats' | 'settings' | 'about'>('games');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tibetan_app_dark_mode');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  // --- Adaptive & Mastery States ---
  const [studyMode, setStudyMode] = useState<'home' | 'level' | 'category' | 'wotd_archive'>('home');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [adaptiveTuningMsg, setAdaptiveTuningMsg] = useState<string | null>(null);

  const [mastery, setMastery] = useState<MasteryStats>(() => {
    try {
      const saved = localStorage.getItem('tibetan_vocab_mastery_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          easyAttempts: parsed.easyAttempts || 0,
          easyScores: parsed.easyScores || [],
          intermediateAttempts: parsed.intermediateAttempts || 0,
          intermediateScores: parsed.intermediateScores || [],
          advancedAttempts: parsed.advancedAttempts || 0,
          advancedScores: parsed.advancedScores || [],
          totalCorrect: parsed.totalCorrect || 0,
          gamesCompleted: parsed.gamesCompleted || 0,
        };
      }
    } catch (e) {
      console.error('Failed to parse saved mastery stats:', e);
    }
    return DEFAULT_MASTERY_STATS;
  });

  const t = translations[lang];

  const menuItems = useMemo(() => [
    { id: 'games' as const, label: t.games, icon: <GraduationCap size={16} /> },
    { id: 'stats' as const, label: (t as any).statistics || 'Statistics', icon: <BarChart3 size={16} /> },
    { id: 'settings' as const, label: (t as any).settings || 'Settings', icon: <Settings size={16} /> },
    { id: 'about' as const, label: (t as any).about || 'About', icon: <Info size={16} /> },
  ], [t]);

  // Sync mastery updates to LocalStorage safely
  useEffect(() => {
    localStorage.setItem('tibetan_vocab_mastery_v2', JSON.stringify(mastery));
  }, [mastery]);

  // Word bank periodic rotation and countdown tracking
  useEffect(() => {
    const updateWordAndCountdown = () => {
      if (wordBank.length === 0) return;

      // 4 hours in milliseconds (14400000ms)
      const fourHoursInMs = 4 * 60 * 60 * 1000;
      const currentEpochWindow = Math.floor(Date.now() / fourHoursInMs);
      const stableIndex = currentEpochWindow % wordBank.length;
      
      // Select stable word
      setWordOfTheDay(wordBank[stableIndex]);

      // Calculate time remaining to next 4-hour window
      const nextTime = (currentEpochWindow + 1) * fourHoursInMs;
      const diffMs = nextTime - Date.now();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      setCountdownStr(`${hours}h ${mins}m`);
    };

    updateWordAndCountdown();
    // Refresh calculations every 15 seconds to ensure timer accuracy
    const interval = setInterval(updateWordAndCountdown, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatLastSyncTime = (timestamp: number, currentLang: Language) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMins / 60);

    if (currentLang === 'en') {
      if (diffMins < 5) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      return 'Yesterday';
    } else {
      if (diffMins < 5) return 'ད་ལྟ་རང་།';
      if (diffMins < 60) return `སྐར་མ་ ${diffMins} སྔོན་ལ།`;
      if (diffHours < 24) return `ཆུ་ཚོད་ ${diffHours} སྔོན་ལ།`;
      return 'ཁ་སང་།';
    }
  };

  const handleManualSync = () => {
    setIsSyncing(true);
    playSound('NEXT');
    
    setTimeout(() => {
      setIsSyncing(false);
      const newTime = Date.now();
      setLastSyncTime(newTime);
      localStorage.setItem('tibetan_app_last_sync_time', newTime.toString());
      
      const added = Math.floor(Math.random() * 6) + 2; 
      const nextCount = wordsUpdatedCount + added;
      setWordsUpdatedCount(nextCount);
      localStorage.setItem('tibetan_app_words_updated_count', nextCount.toString());
      
      playSound('CORRECT');
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
    }, 2200);
  };

  // --- Mastery & Adaptive Analytics computed safely ---
  const masteryRankDetails = useMemo(() => {
    const correct = mastery.totalCorrect;
    const completed = mastery.gamesCompleted;
    
    let rank = t.novice;
    let rankSub = lang === 'en' ? 'Novice Seeker' : 'ལས་དང་པོ་པོ།';
    let colorClass = 'bg-slate-50 text-slate-700 border-slate-200';
    let stars = 1;

    if (correct >= 120) {
      rank = t.wisdomKeeper;
      rankSub = lang === 'en' ? 'Guardian of Wisdom' : 'རིག་པའི་གཏེར།';
      colorClass = 'bg-amber-50 text-amber-800 border-amber-200';
      stars = 4;
    } else if (correct >= 45) {
      rank = t.scholar;
      rankSub = lang === 'en' ? 'Eminent Scholar' : 'མཁས་དབང་།';
      colorClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
      stars = 3;
    } else if (correct >= 12) {
      rank = t.apprentice;
      rankSub = lang === 'en' ? 'Diligent Apprentice' : 'སྦྱོང་བརྡར་བྱེད་མཁན་སྙིང་རུས་ཅན་།';
      colorClass = 'bg-sky-50 text-sky-800 border-sky-200';
      stars = 2;
    }

    return { rank, rankSub, colorClass, stars, correct, completed };
  }, [mastery, t, lang]);

  const easyAvg = useMemo(() => {
    if (mastery.easyScores.length === 0) return 0;
    return Math.round((mastery.easyScores.reduce((a, b) => a + b, 0) / mastery.easyScores.length) * 10);
  }, [mastery.easyScores]);

  const intermediateAvg = useMemo(() => {
    if (mastery.intermediateScores.length === 0) return 0;
    return Math.round((mastery.intermediateScores.reduce((a, b) => a + b, 0) / mastery.intermediateScores.length) * 10);
  }, [mastery.intermediateScores]);

  const advancedAvg = useMemo(() => {
    if (mastery.advancedScores.length === 0) return 0;
    return Math.round((mastery.advancedScores.reduce((a, b) => a + b, 0) / mastery.advancedScores.length) * 10);
  }, [mastery.advancedScores]);

  // Find current active difficulty to determine ambient background theme
  const activeDifficulty = useMemo(() => {
    if (screen === 'GAME_PLAY') {
      return currentQuestions[currentIndex]?.difficulty || difficulty;
    }
    if (screen === 'END_GAME' || screen === 'REVIEW') {
      return difficulty || (currentQuestions.length > 0 ? currentQuestions[0].difficulty : null);
    }
    return null;
  }, [screen, currentIndex, currentQuestions, difficulty]);

  const theme = useMemo(() => {
    if (darkMode) {
      switch (activeDifficulty) {
        case 'Easy':
          return {
            bg: 'bg-slate-950 text-slate-100',
            accent: 'text-emerald-400',
            badgeBg: 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/60',
            progress: 'bg-gradient-to-r from-emerald-500 to-teal-500',
            ring: 'focus:ring-emerald-900/60',
            activeCardBorder: 'border-emerald-900/50 shadow-emerald-950/50',
            playButton: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-950/40 shadow-lg',
            progressBarContainer: 'bg-slate-800/80',
            hoverOption: 'hover:border-emerald-800/80 hover:bg-emerald-950/30',
          };
        case 'Intermediate':
          return {
            bg: 'bg-slate-950 text-slate-100',
            accent: 'text-indigo-400',
            badgeBg: 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/60',
            progress: 'bg-gradient-to-r from-blue-500 to-indigo-600',
            ring: 'focus:ring-indigo-900/30',
            activeCardBorder: 'border-indigo-900/50 shadow-indigo-950/50',
            playButton: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-950/40 shadow-lg',
            progressBarContainer: 'bg-slate-800/80',
            hoverOption: 'hover:border-indigo-800/80 hover:bg-indigo-950/30',
          };
        case 'Advanced':
          return {
            bg: 'bg-slate-950 text-slate-100',
            accent: 'text-purple-400',
            badgeBg: 'bg-purple-950/40 text-purple-400 border border-purple-900/60',
            progress: 'bg-gradient-to-r from-purple-500 to-fuchsia-600',
            ring: 'focus:ring-purple-900/30',
            activeCardBorder: 'border-purple-900/50 shadow-purple-950/50',
            playButton: 'bg-purple-600 hover:bg-purple-700 shadow-purple-950/40 shadow-lg',
            progressBarContainer: 'bg-slate-800/80',
            hoverOption: 'hover:border-purple-800 hover:bg-purple-950/30',
          };
        default:
          return {
            bg: 'bg-slate-950 text-slate-100',
            accent: 'text-indigo-400',
            badgeBg: 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/60',
            progress: 'bg-indigo-500',
            ring: 'focus:ring-indigo-900/30',
            activeCardBorder: 'border-slate-800 shadow-slate-950/50',
            playButton: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-150/20 shadow-lg',
            progressBarContainer: 'bg-slate-800',
            hoverOption: 'hover:border-indigo-800 hover:bg-indigo-950/30',
          };
      }
    }

    switch (activeDifficulty) {
      case 'Easy':
        return {
          bg: 'bg-gradient-to-br from-emerald-50 via-teal-50/20 to-slate-50',
          accent: 'text-emerald-600',
          badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          progress: 'bg-gradient-to-r from-emerald-500 to-teal-500',
          ring: 'focus:ring-emerald-200',
          activeCardBorder: 'border-emerald-100 shadow-emerald-50/50',
          playButton: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100/30 shadow-lg',
          progressBarContainer: 'bg-emerald-100/60',
          hoverOption: 'hover:border-emerald-300 hover:bg-emerald-50/40',
        };
      case 'Intermediate':
        return {
          bg: 'bg-gradient-to-br from-blue-50/80 via-indigo-50/20 to-slate-50',
          accent: 'text-indigo-600',
          badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          progress: 'bg-gradient-to-r from-blue-500 to-indigo-600',
          ring: 'focus:ring-indigo-200',
          activeCardBorder: 'border-indigo-100 shadow-indigo-50/50',
          playButton: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100/30 shadow-lg',
          progressBarContainer: 'bg-indigo-100/60',
          hoverOption: 'hover:border-indigo-300 hover:bg-indigo-50/40',
        };
      case 'Advanced':
        return {
          bg: 'bg-gradient-to-br from-purple-100/40 via-fuchsia-50/10 to-slate-50',
          accent: 'text-purple-600',
          badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
          progress: 'bg-gradient-to-r from-purple-500 to-fuchsia-600',
          ring: 'focus:ring-purple-200',
          activeCardBorder: 'border-purple-100 shadow-purple-50/50',
          playButton: 'bg-purple-600 hover:bg-purple-700 shadow-purple-100/30 shadow-lg',
          progressBarContainer: 'bg-purple-100/65',
          hoverOption: 'hover:border-purple-300 hover:bg-purple-50/40',
        };
      default:
        return {
          bg: 'bg-gradient-to-br from-slate-50 via-gray-50/80 to-slate-100',
          accent: 'text-indigo-600',
          badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          progress: 'bg-indigo-600',
          ring: 'focus:ring-indigo-200',
          activeCardBorder: 'border-gray-150 shadow-gray-100/50',
          playButton: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100/30 shadow-lg',
          progressBarContainer: 'bg-gray-200',
          hoverOption: 'hover:border-indigo-300 hover:bg-indigo-50/40',
        };
    }
  }, [activeDifficulty, darkMode]);

  // --- Helpers ---
  const playSound = (type: 'CORRECT' | 'INCORRECT' | 'NEXT' | 'TICK') => {
    if (isMuted) return;
    
    // 1. Try modern, robust Web Audio API Synthesis first (extremely reliable in all browsers & iframes)
    const success = playSynthesizedSound(type);
    if (success) return;
    
    // 2. Fall back to conventional URLs if Web Audio runs into any failure
    try {
      const url = SOUNDS[type];
      const audio = new Audio(url);
      audio.volume = 0.4; // Set a reasonable volume
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('Audio playback was prevented or failed:', error);
        });
      }
    } catch (err) {
      console.error('Error creating/playing fallback audio:', err);
    }
  };

  // --- Handlers ---

  const completeGame = (finalAnswers: UserAnswer[]) => {
    const finalScore = finalAnswers.filter(a => a.isCorrect).length;
    
    setMastery(prev => {
      const next = { ...prev };
      next.gamesCompleted += 1;
      next.totalCorrect += finalScore;

      if (difficulty === 'Easy') {
        next.easyAttempts += 1;
        next.easyScores = [...next.easyScores, finalScore].slice(-5);
      } else if (difficulty === 'Intermediate') {
        next.intermediateAttempts += 1;
        next.intermediateScores = [...next.intermediateScores, finalScore].slice(-5);
      } else if (difficulty === 'Advanced') {
        next.advancedAttempts += 1;
        next.advancedScores = [...next.advancedScores, finalScore].slice(-5);
      }
      return next;
    });

    if (finalScore === 10) {
      try {
        // First main burst
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
        
        // Staggered multi-angle side bursts for maximum visual delight
        setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.7 }
          });
        }, 250);
        
        setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.7 }
          });
        }, 400);
      } catch (err) {
        console.error('Confetti animation failed to trigger:', err);
      }
    }

    setScreen('END_GAME');
  };

  const selectLevel = (level: Difficulty) => {
    const levelPool = wordBank.filter(w => w.difficulty === level);
    
    // Adaptive difficulty tuning based on previous performance stats
    let finalQuestions: Word[] = [];
    let tuningMessage: string | null = null;

    if (level === 'Easy') {
      const avgEasy = mastery.easyScores.length > 0 
        ? mastery.easyScores.reduce((a, b) => a + b, 0) / mastery.easyScores.length 
        : 0;

      if (avgEasy >= 8) {
        // High Easy mastery: replace 3 Easy questions with 3 helper Intermediate questions to challenge!
        const intermediatePool = wordBank.filter(w => w.difficulty === 'Intermediate');
        const easySelection = shuffle(levelPool).slice(0, 7);
        const intSelection = shuffle(intermediatePool).slice(0, 3);
        finalQuestions = shuffle([...easySelection, ...intSelection]);
        tuningMessage = t.scaledUp;
      } else {
        finalQuestions = shuffle(levelPool).slice(0, 10);
      }
    } 
    else if (level === 'Intermediate') {
      const avgEasy = mastery.easyScores.length > 0 
        ? mastery.easyScores.reduce((a, b) => a + b, 0) / mastery.easyScores.length 
        : 0;
      const avgInt = mastery.intermediateScores.length > 0 
        ? mastery.intermediateScores.reduce((a, b) => a + b, 0) / mastery.intermediateScores.length 
        : 0;

      if (avgInt >= 8) {
        // High Intermediate mastery: introduce 3 Advanced questions
        const advancedPool = wordBank.filter(w => w.difficulty === 'Advanced');
        const intSelection = shuffle(levelPool).slice(0, 7);
        const advSelection = shuffle(advancedPool).slice(0, 3);
        finalQuestions = shuffle([...intSelection, ...advSelection]);
        tuningMessage = t.scaledUp;
      } 
      else if (mastery.intermediateAttempts >= 1 && avgInt < 5 && avgEasy > 4) {
        // Struggling on Intermediate: introduce 3 Easy questions to build confidence
        const easyPool = wordBank.filter(w => w.difficulty === 'Easy');
        const intSelection = shuffle(levelPool).slice(0, 7);
        const easySelection = shuffle(easyPool).slice(0, 3);
        finalQuestions = shuffle([...intSelection, ...easySelection]);
        tuningMessage = t.scaledDown;
      } 
      else {
        finalQuestions = shuffle(levelPool).slice(0, 10);
      }
    } 
    else if (level === 'Advanced') {
      const avgInt = mastery.intermediateScores.length > 0 
        ? mastery.intermediateScores.reduce((a, b) => a + b, 0) / mastery.intermediateScores.length 
        : 0;
      const avgAdv = mastery.advancedScores.length > 0 
        ? mastery.advancedScores.reduce((a, b) => a + b, 0) / mastery.advancedScores.length 
        : 0;

      if (mastery.advancedAttempts >= 1 && avgAdv < 5 && avgInt > 4) {
        // Struggling on Advanced: introduce 3 Intermediate helper questions to support
        const intermediatePool = wordBank.filter(w => w.difficulty === 'Intermediate');
        const advSelection = shuffle(levelPool).slice(0, 7);
        const intSelection = shuffle(intermediatePool).slice(0, 3);
        finalQuestions = shuffle([...advSelection, ...intSelection]);
        tuningMessage = t.scaledDown;
      } else {
        finalQuestions = shuffle(levelPool).slice(0, 10);
      }
    }

    setDifficulty(level);
    setSelectedCategory(null);
    setAdaptiveTuningMsg(tuningMessage);
    setCurrentQuestions(finalQuestions);
    setCurrentIndex(0);
    setUserAnswers([]);
    setScreen('GAME_PLAY');
    setIsAnswerRevealed(false);
    setSelectedOption(null);
    setTimeLeft(30);
    playSound('NEXT');
  };

  const selectCategory = (category: CategoryId) => {
    let matched = wordBank.filter(w => {
      const pos = w.partOfSpeech.toLowerCase();
      const meaning = w.correctMeaning.toLowerCase();
      const dists = w.distractors.map(d => d.toLowerCase());
      
      if (category === 'nouns') return pos.includes('noun');
      if (category === 'verbs') return pos.includes('verb');
      if (category === 'adjectives') return pos.includes('adjective') || pos.includes('adverb');
      if (category === 'honorifics') {
        return pos.includes('hon') || pos.includes('idiom') || meaning.includes('hon') || dists.some(d => d.includes('hon'));
      }
      if (category === 'grammar') {
        return pos.includes('grammar') || pos.includes('structure') || pos.includes('particle');
      }
      return true;
    });

    if (matched.length === 0) {
      matched = wordBank;
    }

    // Adapt mix of easy / int / adv verbs or nouns based on mastery
    const easyWordPool = matched.filter(w => w.difficulty === 'Easy');
    const intWordPool = matched.filter(w => w.difficulty === 'Intermediate');
    const advWordPool = matched.filter(w => w.difficulty === 'Advanced');

    let easyCount = 4;
    let intCount = 4;
    let advCount = 2;

    const avgEasy = mastery.easyScores.length > 0 ? mastery.easyScores.reduce((a, b) => a + b, 0) / mastery.easyScores.length : 0;
    const avgInt = mastery.intermediateScores.length > 0 ? mastery.intermediateScores.reduce((a, b) => a + b, 0) / mastery.intermediateScores.length : 0;

    let tuningMessage: string | null = null;
    if (avgEasy >= 8) {
      easyCount = 2;
      intCount = 5;
      advCount = 3;
      tuningMessage = t.scaledUp;
    }
    if (avgInt >= 7) {
      easyCount = 1;
      intCount = 4;
      advCount = 5;
      tuningMessage = t.scaledUp;
    }

    const draw = (pool: Word[], count: number) => {
      const shuffled = shuffle(pool);
      return shuffled.slice(0, count);
    };

    const drawnEasy = draw(easyWordPool, easyCount);
    const drawnInt = draw(intWordPool, intCount);
    const drawnAdv = draw(advWordPool, advCount);

    let selectedWords = [...drawnEasy, ...drawnInt, ...drawnAdv];

    // Ensure we have exactly 10 questions safely
    if (selectedWords.length < 10) {
      const remainingMatch = matched.filter(w => !selectedWords.map(sw => sw.id).includes(w.id));
      selectedWords = [...selectedWords, ...shuffle(remainingMatch).slice(0, 10 - selectedWords.length)];
    }

    if (selectedWords.length < 10) {
      const remainingBank = wordBank.filter(w => !selectedWords.map(sw => sw.id).includes(w.id));
      selectedWords = [...selectedWords, ...shuffle(remainingBank).slice(0, 10 - selectedWords.length)];
    }

    selectedWords = shuffle(selectedWords).slice(0, 10);

    setDifficulty(null);
    setSelectedCategory(category);
    setAdaptiveTuningMsg(tuningMessage);
    setCurrentQuestions(selectedWords);
    setCurrentIndex(0);
    setUserAnswers([]);
    setScreen('GAME_PLAY');
    setIsAnswerRevealed(false);
    setSelectedOption(null);
    setTimeLeft(30);
    playSound('NEXT');
  };

  const startWotdPractice = (specificWord?: Word) => {
    let finalQuestions: Word[] = [];
    if (specificWord) {
      // Find other words to make it 10
      const samePool = wordBank.filter(w => w.difficulty === specificWord.difficulty && w.id !== specificWord.id);
      const otherWords = shuffle(samePool).slice(0, 9);
      finalQuestions = shuffle([specificWord, ...otherWords]);
      setDifficulty(specificWord.difficulty);
    } else {
      // Practice past words of the day (last 10)
      const fourHoursInMs = 4 * 60 * 60 * 1000;
      const currentEpochWindow = Math.floor(Date.now() / fourHoursInMs);
      const pastWotds: Word[] = [];
      const seenIds = new Set<string>();
      
      for (let i = 0; i < 30 && pastWotds.length < 10; i++) {
        const epoch = currentEpochWindow - i;
        const index = epoch % wordBank.length;
        const word = wordBank[index];
        if (word && !seenIds.has(word.id)) {
          seenIds.add(word.id);
          pastWotds.push(word);
        }
      }
      
      // If we don't have 10, fill up with random words
      if (pastWotds.length < 10) {
        const remainingPool = wordBank.filter(w => !seenIds.has(w.id));
        const fill = shuffle(remainingPool).slice(0, 10 - pastWotds.length);
        finalQuestions = [...pastWotds, ...fill];
      } else {
        finalQuestions = pastWotds;
      }
      setDifficulty(null);
    }
    
    setSelectedCategory(null);
    setAdaptiveTuningMsg(specificWord ? `${lang === 'en' ? 'Targeted Practice' : 'དམིགས་སྒོ་སྦྱོང་བརྡར།'}: "${specificWord.tibetan}"` : `${lang === 'en' ? 'Word of the Day Review' : 'ཉིན་རེའི་ཐ་སྙད་བསྐྱར་ཞིབ།'}`);
    setCurrentQuestions(finalQuestions);
    setCurrentIndex(0);
    setUserAnswers([]);
    setScreen('GAME_PLAY');
    setIsAnswerRevealed(false);
    setSelectedOption(null);
    setTimeLeft(30);
    playSound('NEXT');
  };

  const handleTimeOut = () => {
    if (isAnswerRevealed) return;
    
    const currentWord = currentQuestions[currentIndex];
    if (!currentWord) return;
    
    setSelectedOption('');
    setIsAnswerRevealed(true);
    playSound('INCORRECT');
    
    setUserAnswers(prev => [...prev, {
      questionIndex: currentIndex,
      wordId: currentWord.id,
      selectedOption: '',
      isCorrect: false
    }]);
  };

  // Time Trial ticking countdown effect
  useEffect(() => {
    if (screen !== 'GAME_PLAY' || isAnswerRevealed || !isTimeTrial) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeOut();
          return 0;
        }
        
        // Play tick sound on each second elapsed in time trial
        playSound('TICK');
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [screen, isAnswerRevealed, isTimeTrial, currentIndex, currentQuestions]);

  useEffect(() => {
    if (isAnswerRevealed && nextButtonRef.current) {
      setTimeout(() => {
        nextButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [isAnswerRevealed]);

  const handleAnswer = (option: string) => {
    if (isAnswerRevealed) return;
    
    const currentWord = currentQuestions[currentIndex];
    const isCorrect = option === currentWord.correctMeaning;
    
    setSelectedOption(option);
    setIsAnswerRevealed(true);
    
    if (isCorrect) {
      playSound('CORRECT');
    } else {
      playSound('INCORRECT');
    }
    
    setUserAnswers(prev => [...prev, {
      questionIndex: currentIndex,
      wordId: currentWord.id,
      selectedOption: option,
      isCorrect
    }]);
  };

  const nextQuestion = () => {
    playSound('NEXT');
    if (currentIndex < 9) {
      setCurrentIndex(prev => prev + 1);
      setIsAnswerRevealed(false);
      setSelectedOption(null);
      setTimeLeft(30);
    } else {
      completeGame(userAnswers);
    }
  };

  const resetGame = () => {
    if (selectedCategory) {
      selectCategory(selectedCategory);
    } else if (difficulty) {
      selectLevel(difficulty);
    } else {
      setScreen('LEVEL_SELECTION');
    }
  };

  const score = userAnswers.filter(a => a.isCorrect).length;

  const currentWord = currentQuestions[currentIndex];
  const options = useMemo(() => {
    if (!currentWord) return [];
    return shuffle([currentWord.correctMeaning, ...currentWord.distractors]);
  }, [currentWord]);

  const viewingWord = useMemo(() => {
    if (!viewingWordId) return null;
    return wordBank.find(w => w.id === viewingWordId);
  }, [viewingWordId]);

  // --- Sub-Components ---

  const HeaderControls = () => (
    <header className="flex justify-between items-center px-3 sm:px-4 py-2 border-b border-slate-200/40 dark:border-slate-800/45 bg-white/40 dark:bg-slate-900/30 backdrop-blur-md z-15 shrink-0 select-none">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setIsMenuOpen(!isMenuOpen);
            playSound('NEXT');
          }}
          className="flex items-center justify-center w-11 h-11 md:w-9 md:h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl transition-all shadow-sm cursor-pointer active:scale-95 shrink-0"
          title="Menu"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <XCircle className="w-5 h-5 md:w-4.5 md:h-4.5" /> : <Menu className="w-5 h-5 md:w-4.5 md:h-4.5" />}
        </button>
 
        <div className="flex items-center gap-1.5 md:gap-2">
          <GraduationCap className="text-indigo-600 dark:text-indigo-400 w-6 h-6 md:w-7 md:h-7 shrink-0" />
          <span className={`font-extrabold tracking-tight text-slate-900 dark:text-slate-100 line-clamp-1 ${
            lang === 'en' ? 'text-[9px] sm:text-[10px] md:text-xs' : 'text-xs sm:text-[13px] md:text-base'
          }`}>
            {t.title}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Active tab fast-tag */}
        <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[9px] font-bold rounded-full">
          {activeSelectionTab === 'games' && t.games}
          {activeSelectionTab === 'stats' && ((t as any).statistics || 'Stats')}
          {activeSelectionTab === 'settings' && ((t as any).settings || 'Settings')}
          {activeSelectionTab === 'about' && ((t as any).about || 'About')}
        </span>
 
        <button
          id="timer-toggle-btn"
          onClick={() => {
            setIsTimeTrial(prev => {
              const nextVal = !prev;
              try {
                localStorage.setItem('tibetan_app_time_trial', String(nextVal));
              } catch (_) {}
              return nextVal;
            });
            playSound('NEXT');
          }}
          className={`flex items-center justify-center w-11 h-11 md:w-9 md:h-9 bg-white dark:bg-slate-900 border rounded-xl transition-all shadow-xs cursor-pointer active:scale-95 shrink-0 ${
            isTimeTrial 
              ? 'border-amber-400 dark:border-amber-500/80 text-amber-600 dark:text-amber-400 bg-amber-500/5' 
              : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400'
          }`}
          title={isTimeTrial ? (lang === 'en' ? "Time Trial Active (30s limit)" : "དུས་ཚད་བགྲང་རྒྱུག་ཤོར་ཡོད།") : (lang === 'en' ? "Turn on Time Trial" : "དུས་ཚད་བགྲང་རྒྱུག་སྒོ་ཕྱེ།")}
          aria-label="Toggle Time Trial"
        >
          <Clock className={`w-5 h-5 md:w-4 md:h-4 ${isTimeTrial ? 'animate-pulse text-amber-500 dark:text-amber-400' : ''}`} />
        </button>

        <button 
          onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            if (!nextMuted) {
              setTimeout(() => {
                playSound('NEXT');
              }, 50);
            }
          }}
          className="flex items-center justify-center w-11 h-11 md:w-9 md:h-9 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm cursor-pointer active:scale-95 shrink-0"
          title={isMuted ? "Unmute" : "Mute"}
          id="toggle-mute-btn"
        >
          {isMuted ? <VolumeX className="w-5 h-5 md:w-4 md:h-4" /> : <Volume2 className="w-5 h-5 md:w-4 md:h-4" />}
        </button>

        <button
          id="theme-toggle-btn"
          onClick={() => {
            const nextVal = !darkMode;
            setDarkMode(nextVal);
            localStorage.setItem('tibetan_darkMode', nextVal ? 'true' : 'false');
            playSound('NEXT');
          }}
          className="flex items-center justify-center w-11 h-11 md:w-9 md:h-9 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm cursor-pointer active:scale-95 shrink-0"
          title={darkMode ? (lang === 'en' ? "Switch to Light Mode" : "ཉིན་མོའི་གློག་འོད་ལ་བསྒྱུར།") : (lang === 'en' ? "Switch to Dark Mode" : "མུན་པའི་གློག་འོད་ལ་བསྒྱུར།")}
          aria-label="Toggle theme"
        >
          {darkMode ? <Sun className="w-5 h-5 md:w-4 md:h-4 text-amber-500 animate-pulse" /> : <Moon className="w-5 h-5 md:w-4 md:h-4 text-indigo-600 dark:text-indigo-400" />}
        </button>

        <button 
          onClick={() => {
            setLang(l => {
              const next = l === 'en' ? 'bo' : 'en';
              try {
                localStorage.setItem('tibetan_app_language', next);
              } catch (_) {}
              return next;
            });
            playSound('NEXT');
          }}
          className="flex items-center gap-1 px-3 py-2.5 min-h-[44px] md:min-h-0 md:py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm cursor-pointer active:scale-95 shrink-0"
          id="language-toggle-btn"
        >
          <Languages className="w-4 h-4 md:w-3.5 md:h-3.5" />
          <span>{lang === 'en' ? 'བོད་ཡིག' : 'English'}</span>
        </button>
      </div>
    </header>
  );

  const LevelSelection = () => {
    const [archiveSearch, setArchiveSearch] = useState('');
    const [difficultyFilter, setDifficultyFilter] = useState<'All' | 'Easy' | 'Intermediate' | 'Advanced'>('All');

    const categoriesList = [
      { id: 'nouns' as CategoryId, label: t.nounCategory, isUnlocked: true, req: null },
      { id: 'verbs' as CategoryId, label: t.verbCategory, isUnlocked: true, req: null },
      { id: 'adjectives' as CategoryId, label: t.adjectiveCategory, isUnlocked: true, req: null },
      { 
        id: 'honorifics' as CategoryId, 
        label: t.honorificCategory, 
        isUnlocked: mastery.easyScores.some(s => s >= 7) || mastery.intermediateAttempts > 0 || mastery.advancedAttempts > 0,
        req: `${t.unlockRequirement} ${t.levelEasy}`
      },
      { 
        id: 'grammar' as CategoryId, 
        label: t.grammarCategory, 
        isUnlocked: mastery.intermediateScores.some(s => s >= 7) || mastery.advancedAttempts > 0,
        req: `${t.unlockRequirement} ${t.levelIntermediate}`
      },
    ];

    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-4xl mx-auto gap-4 py-1 px-1.5 md:py-3 md:px-3">
        {/* Tab Content display Area: scrollable */}
        <div className="flex-1 min-h-0 overflow-hidden relative bg-white/90 dark:bg-slate-900/90 border border-slate-200/30 dark:border-slate-800/40 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col justify-start">
          <AnimatePresence mode="wait">
            {activeSelectionTab === 'games' && (
              <motion.div 
                key="games-tab"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col min-h-0 overflow-hidden"
              >
                {/* Submenu details scrolls internally */}
                <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-3.5">
                  <AnimatePresence mode="wait">
                    {studyMode === 'home' ? (
                      <motion.div
                        key="games-home"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col items-center justify-start w-full pt-1 pb-6 text-center select-none"
                      >
                        <img 
                          src="https://lh3.googleusercontent.com/d/1Cn0_SQt0hV0J_ECJGcDsZykB1-82wneZ" 
                          alt="Lhakar Academy Logo" 
                          className="max-h-[115px] md:max-h-[141px] w-auto mb-10 object-contain animate-fadeIn"
                          referrerPolicy="no-referrer"
                        />
                        <h2 className={`font-black text-slate-900 dark:text-slate-100 tracking-tight mb-0.5 leading-none ${
                          lang === 'en' ? 'text-[18px] md:text-[22.5px]' : 'tibetan-text text-2xl md:text-3xl'
                        }`}>
                          {t.title}
                        </h2>
                        <h3 className={`text-slate-550 dark:text-slate-400 font-medium mb-6 ${
                          lang === 'en' ? 'mt-4' : '-mt-1 md:-mt-2'
                        } ${lang === 'bo' ? 'text-lg sm:text-xl tibetan-text' : 'text-sm sm:text-base'}`}>
                          {t.subtitle}
                        </h3>

                        {/* Word of the Day Container */}
                        {wordOfTheDay && (
                          <div className="w-full max-w-md bg-gradient-to-r from-amber-600/5 to-indigo-600/5 dark:from-amber-500/10 dark:to-indigo-500/10 border border-amber-500/15 dark:border-amber-500/20 rounded-2xl p-4 sm:p-5 text-left flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs animate-fadeIn mb-6">
                            <div className="flex-1 min-w-0">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 text-xs sm:text-xs font-black tracking-wider rounded-lg uppercase">
                                <Sparkles size={11} className="text-amber-600 shrink-0" />
                                {t.wordOfTheDay}
                              </span>
                              <h4 className="tibetan-text text-xl font-bold text-slate-900 dark:text-slate-100 mt-2">{wordOfTheDay.tibetan}</h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-1">Wylie: {wordOfTheDay.wylie} • <span className="font-bold text-indigo-750 dark:text-indigo-400">{wordOfTheDay.correctMeaning}</span></p>
                              <div className="flex items-center gap-1.5 mt-2.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/5 dark:bg-amber-500/10 text-[9px] font-mono font-bold text-amber-700 dark:text-amber-400/95 rounded border border-amber-500/15">
                                  {lang === 'en' ? `🔄 Swapping in: ${countdownStr}` : `🔄 རང་འགུལ་གསར་སྒྲིག: ${countdownStr}`}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingWordId(wordOfTheDay.id);
                                playSound('NEXT');
                              }}
                              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-3 sm:py-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-slate-800 hover:border-indigo-300 rounded-xl text-xs sm:text-[10px] font-bold transition-all shadow-sm hover:shadow-md cursor-pointer flex items-center justify-center gap-1.5 shrink-0 active:scale-98"
                            >
                              <BookOpen size={13} className="text-indigo-600 dark:text-indigo-400" />
                              <span>{(t as any).tapToViewDetails || 'Details'}</span>
                            </button>
                          </div>
                        )}

                        {/* Word Games Button/Link */}
                        <button
                          onClick={() => {
                            setStudyMode('level');
                            playSound('NEXT');
                          }}
                          className="group w-full max-w-md flex items-center justify-between p-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 text-left cursor-pointer mb-6"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0 group-hover:bg-indigo-100 group-hover:text-indigo-750 transition-colors">
                              <GraduationCap size={22} />
                            </div>
                            <div>
                              <h3 className={`font-black text-slate-950 dark:text-slate-100 tracking-tight ${lang === 'bo' ? 'text-base sm:text-lg md:text-xl tibetan-text leading-tight' : 'text-sm'}`}>
                                {lang === 'en' ? 'Word Games' : 'མིང་ཚིག་རྩེད་མོ།'}
                              </h3>
                              <p className={`font-medium ${lang === 'bo' ? 'text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tibetan-text mt-0.5' : 'text-[10px] text-slate-400 dark:text-slate-450'}`}>
                                {lang === 'en' ? 'Test your skill levels' : 'ཁྱེད་ཀྱི་ཚིག་རྩལ་ཚོད་ལྟ་བྱོས།'}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transform group-hover:translate-x-1 shrink-0 transition-all font-bold" size={16} />
                        </button>
                      </motion.div>
                    ) : studyMode === 'level' ? (
                      <motion.div 
                        key="level-selector"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col flex-1 min-h-0 w-full gap-4"
                      >
                        {/* Back navigation */}
                        <div className="flex items-center justify-start select-none">
                          <button
                            onClick={() => {
                              setStudyMode('home');
                              playSound('NEXT');
                            }}
                            className="flex items-center gap-2 min-h-[44px] md:min-h-0 px-4 py-2.5 md:px-2.5 md:py-1.5 text-xs font-bold text-slate-600 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl shadow-sm active:scale-95"
                          >
                            <ArrowLeft size={14} className="text-slate-500 dark:text-slate-400" />
                            <span>{lang === 'en' ? 'Back' : 'ཕྱིར་ལོག'}</span>
                          </button>
                        </div>

                        {/* Word Games unified parent tile */}
                        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl p-4 sm:p-6 shadow-sm text-left min-h-0">
                          <div className="flex items-center gap-2.5 border-b border-slate-150 dark:border-slate-800/80 pb-3 md:pb-4 select-none shrink-0 mb-4 sm:mb-5">
                            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                              <GraduationCap size={20} />
                            </div>
                            <div>
                              <h3 className={`font-black text-slate-900 dark:text-slate-100 tracking-tight ${lang === 'bo' ? 'text-lg sm:text-xl md:text-2xl tibetan-text leading-tight' : 'text-sm sm:text-base'}`}>
                                {lang === 'en' ? 'Word Games' : 'མིང་ཚིག་རྩེད་མོ།'}
                              </h3>
                              <p className={`font-medium leading-normal ${lang === 'bo' ? 'text-xs sm:text-sm md:text-base text-slate-505 dark:text-slate-405 tibetan-text mt-1' : 'text-[10px] sm:text-xs text-slate-400'}`}>
                                {lang === 'en' ? 'Select a difficulty level to test and expand your vocabulary.' : 'ཚིག་རྩལ་རིམ་པ་གདོམས།'}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
                            {(['Easy', 'Intermediate', 'Advanced'] as Difficulty[]).map((level, idx) => {
                              let hoverStyle = "hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-indigo-100/30";
                              let badgeColor = "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50";
                              
                              if (level === 'Easy') {
                                hoverStyle = "hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-emerald-100/30";
                                badgeColor = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50";
                              } else if (level === 'Advanced') {
                                hoverStyle = "hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-purple-100/30";
                                badgeColor = "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/50";
                              } else {
                                badgeColor = "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50";
                              }

                              return (
                                <motion.button
                                  key={level}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.05 }}
                                  onClick={() => selectLevel(level)}
                                  className={`group flex sm:flex-row flex-col md:flex-col md:items-start justify-between p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl ${hoverStyle} hover:shadow-xs transition-all duration-200 text-left cursor-pointer active:scale-[0.99] min-h-[64px] md:h-full md:min-h-[160px]`}
                                  id={`difficulty-btn-${level.toLowerCase()}`}
                                >
                                  <div className="flex-1 pr-0 md:pr-0 md:w-full md:flex md:flex-col md:h-full md:justify-between">
                                    <div>
                                      <div className="flex items-center justify-between sm:justify-start gap-2 mb-2 w-full">
                                        <span className={`font-black text-slate-800 dark:text-slate-105 ${lang === 'bo' ? 'text-[15px] sm:text-lg md:text-xl tibetan-text leading-tight' : 'text-sm sm:text-base'}`}>
                                          {level === 'Easy' ? t.levelEasy : level === 'Intermediate' ? t.levelIntermediate : t.levelAdvanced}
                                        </span>
                                        <span className={`text-[9px] sm:text-[10px] px-2.5 py-1 rounded-full border font-black tracking-wider uppercase ${badgeColor} shrink-0`}>
                                          {level === 'Easy' ? 'A1' : level === 'Intermediate' ? 'B1-B2' : 'C1'}
                                        </span>
                                      </div>
                                      <span className={`font-semibold text-slate-500 dark:text-slate-400 block leading-relaxed ${lang === 'bo' ? 'text-[12px] sm:text-sm tibetan-text mt-1.5' : 'text-xs'}`}>
                                        {level === 'Easy' && t.easyDesc}
                                        {level === 'Intermediate' && t.intermediateDesc}
                                        {level === 'Advanced' && t.advancedDesc}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between w-full mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 md:flex hidden shrink-0">
                                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-600 dark:text-indigo-400 group-hover:underline">
                                      {lang === 'en' ? 'Start Game' : 'རྩེད་མོ་འགོ་འཛུགས།'}
                                    </span>
                                    <ChevronRight className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transform group-hover:translate-x-1 shrink-0 transition-all ml-1" size={15} />
                                  </div>

                                  <div className="md:hidden self-end sm:self-center mt-3 sm:mt-0">
                                    <ChevronRight className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transform group-hover:translate-x-1 shrink-0 transition-all" size={17} />
                                  </div>
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    ) : studyMode === 'category' ? (
                      <motion.div 
                        key="category-selector"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="grid gap-3 w-full"
                      >
                        {/* Back navigation */}
                        <div className="flex items-center justify-start select-none">
                          <button
                            onClick={() => {
                              setStudyMode('home');
                              playSound('NEXT');
                            }}
                            className="flex items-center gap-2 min-h-[44px] md:min-h-0 px-4 py-2.5 md:px-2.5 md:py-1.5 text-xs font-bold text-slate-600 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl shadow-sm active:scale-95"
                          >
                            <ArrowLeft size={14} className="text-slate-500 dark:text-slate-400" />
                            <span>{lang === 'en' ? 'Back' : 'ཕྱིར་ལོག'}</span>
                          </button>
                        </div>

                        {categoriesList.map((cat, idx) => (
                          <motion.button
                            key={cat.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            whileHover={cat.isUnlocked ? { scale: 1.02 } : {}}
                            whileTap={cat.isUnlocked ? { scale: 0.98 } : {}}
                            transition={{ delay: idx * 0.05 }}
                            disabled={!cat.isUnlocked}
                            onClick={() => selectCategory(cat.id)}
                            className={`group flex items-center justify-between p-4 sm:p-3.5 rounded-2xl border text-left transition-all min-h-[52px] ${
                              cat.isUnlocked 
                                ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/85 hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-md cursor-pointer' 
                                : 'bg-gray-50 dark:bg-slate-950/40 border-gray-150 dark:border-slate-850 opacity-60 cursor-not-allowed'
                            }`}
                            id={`category-btn-${cat.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl transition-colors shrink-0 ${cat.isUnlocked ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'}`}>
                                {cat.isUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
                              </div>
                              <div>
                                <span className="block text-xs sm:text-sm font-bold text-gray-800 dark:text-slate-200">
                                  {cat.label}
                                </span>
                                {!cat.isUnlocked && cat.req ? (
                                  <span className="text-[9px] sm:text-[10px] font-semibold text-rose-500 block">
                                    {cat.req}
                                  </span>
                                ) : (
                                  <span className="text-[9px] sm:text-[10px] text-indigo-400 dark:text-indigo-305 font-semibold block">
                                    {t.masteryUnlocked}
                                  </span>
                                )}
                              </div>
                            </div>

                            {cat.isUnlocked && (
                              <ChevronRight className="text-gray-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transform group-hover:translate-x-1 shrink-0 transition-all" size={15} />
                            )}
                          </motion.button>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="wotd-archive-selector"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col flex-1 min-h-0 text-left select-none"
                      >
                        {/* WOTD ARCHIVE INNER SCOPE */}
                        {(() => {
                          const fourHoursInMs = 4 * 60 * 60 * 1000;
                          const currentEpochWindow = Math.floor(Date.now() / fourHoursInMs);
                          
                          const getWotdTimeStr = (i: number) => {
                            if (i === 0) return lang === 'en' ? 'Today (Active)' : 'དེ་རིང་། (ད་ལྟ་སྤྱོད་བཞིན་པ།)';
                            if (i === 1) return lang === 'en' ? 'Today (Earlier)' : 'དེ་རིང་། (སྔོན་མ།)';
                            
                            const hoursAgo = i * 4;
                            if (hoursAgo < 24) {
                              return lang === 'en' ? `${hoursAgo} hours ago` : `ཆུ་ཚོད་ ${hoursAgo} སྔོན་ལ།`;
                            }
                            const daysAgo = Math.floor(hoursAgo / 24);
                            if (daysAgo === 1) return lang === 'en' ? 'Yesterday' : 'ཁ་སང་།';
                            return lang === 'en' ? `${daysAgo} days ago` : `ཉིན་མོ་ ${daysAgo} སྔོན་ལ།`;
                          };

                          const epochsList: { word: Word; relativeTimeStr: string }[] = [];
                          const seenIds = new Set<string>();
                          
                          for (let i = 0; i < 40 && epochsList.length < 24; i++) {
                            const epoch = currentEpochWindow - i;
                            const idx = epoch % wordBank.length;
                            const word = wordBank[idx];
                            if (word && !seenIds.has(word.id)) {
                              seenIds.add(word.id);
                              epochsList.push({
                                word,
                                relativeTimeStr: getWotdTimeStr(i)
                              });
                            }
                          }

                          const filteredEpochs = epochsList.filter(e => {
                            if (difficultyFilter !== 'All' && e.word.difficulty !== difficultyFilter) {
                              return false;
                            }
                            if (archiveSearch.trim()) {
                              const query = archiveSearch.toLowerCase();
                              return e.word.tibetan.toLowerCase().includes(query) ||
                                     e.word.wylie.toLowerCase().includes(query) ||
                                     e.word.correctMeaning.toLowerCase().includes(query);
                            }
                            return true;
                          });

                          return (
                            <div className="flex-1 flex flex-col min-h-0 select-none text-left">
                              {/* Header bar within tab */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4 select-none">
                                <div className="flex items-center gap-2.5">
                                  <button
                                    onClick={() => {
                                      setStudyMode('home');
                                      playSound('NEXT');
                                    }}
                                    className="flex items-center justify-center p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-xs active:scale-95 shrink-0"
                                    title="Go back"
                                  >
                                    <ArrowLeft size={16} />
                                  </button>
                                  <div>
                                    <h3 className={`font-black text-slate-1000 dark:text-slate-100 flex items-center gap-1.5 ${lang === 'bo' ? 'text-lg sm:text-xl tibetan-text leading-tight' : 'text-sm sm:text-base'}`}>
                                      <Calendar size={18} className="text-amber-500" />
                                      {t.wotdArchive}
                                    </h3>
                                    <p className={`font-medium text-slate-400 dark:text-slate-450 ${lang === 'bo' ? 'text-[11px] sm:text-xs tibetan-text' : 'text-[10px] sm:text-xs'}`}>
                                      {lang === 'en' ? 'Browse and review past Words of the Day for practice.' : 'སྔོན་མའི་ཉིན་རེའི་ཐ་སྙད་ལ་བསྐྱར་ཞིབ་དང་མིང་ཚིག་སྦྱོང་བརྡར་བྱོས།'}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Top actions */}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => startWotdPractice()}
                                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-750 text-white font-extrabold text-xs rounded-xl hover:shadow-sm active:scale-98 transition-all cursor-pointer min-h-[40px]"
                                  >
                                    <Trophy size={13} className="animate-bounce" />
                                    <span className={lang === 'bo' ? 'tibetan-text text-xs leading-none pt-0.5' : ''}>
                                      {lang === 'en' ? 'Practice Past Words' : 'ཉིན་རེའི་ཐ་སྙད་བསྐྱར་སྦྱོང་།'}
                                    </span>
                                  </button>
                                </div>
                              </div>

                              {/* Search and Filters panel */}
                              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-4 select-none">
                                {/* Search box */}
                                <div className="relative flex-1">
                                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={15} />
                                  <input
                                    type="text"
                                    value={archiveSearch}
                                    onChange={(e) => setArchiveSearch(e.target.value)}
                                    placeholder={lang === 'en' ? "Search words, meanings..." : "མིང་ཚིག་གམ་དོན་དག་འཚོལ་བ།..."}
                                    className={`w-full pl-10 pr-4 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/55 dark:focus:ring-indigo-500/40 focus:border-indigo-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 ${lang === 'bo' ? 'tibetan-text leading-tight py-2.5' : ''}`}
                                  />
                                  {archiveSearch && (
                                    <button
                                      onClick={() => setArchiveSearch('')}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                                    >
                                      <XCircle size={14} />
                                    </button>
                                  )}
                                </div>

                                {/* Difficulty Filter Pills */}
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 select-none text-[10px] sm:text-xs">
                                  <span className="text-slate-400 font-bold flex items-center gap-1 mr-1 shrink-0">
                                    <Filter size={11} /> <span>{lang === 'en' ? 'Filter:' : 'འདེམས་སྒྲུག:'}</span>
                                  </span>
                                  {(['All', 'Easy', 'Intermediate', 'Advanced'] as const).map((filterOpt) => {
                                    const isActive = difficultyFilter === filterOpt;
                                    const optLabel = filterOpt === 'All' 
                                      ? (lang === 'en' ? 'All' : 'ཚང་མ།')
                                      : filterOpt === 'Easy' 
                                      ? t.levelEasy 
                                      : filterOpt === 'Intermediate' 
                                      ? t.levelIntermediate 
                                      : t.levelAdvanced;

                                    return (
                                      <button
                                        key={filterOpt}
                                        onClick={() => {
                                          setDifficultyFilter(filterOpt);
                                          playSound('NEXT');
                                        }}
                                        className={`px-3 py-1.5 font-extrabold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                                          isActive
                                            ? 'bg-indigo-600 dark:bg-indigo-700 text-white border-indigo-600 dark:border-indigo-850 shadow-xs'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                        }`}
                                      >
                                        <span className={lang === 'bo' ? 'tibetan-text text-xs' : ''}>{optLabel}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Scrolling list container */}
                              <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[300px] md:max-h-[460px] scrollbar-thin scrollbar-thumb-slate-200/50 dark:scrollbar-thumb-slate-800/50">
                                {filteredEpochs.length === 0 ? (
                                  <div className="text-center py-10 w-full col-span-full">
                                    <p className="text-slate-400 font-extrabold text-sm">
                                      {lang === 'en' ? 'No archived words found matching your query.' : 'ཁྱེད་ཀྱིས་བཙལ་བའི་མིང་ཚིག་མ堅持མི་འདུག།'}
                                    </p>
                                    <button
                                      onClick={() => {
                                        setArchiveSearch('');
                                        setDifficultyFilter('All');
                                        playSound('NEXT');
                                      }}
                                      className="mt-3.5 px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all cursor-pointer animate-fadeIn"
                                    >
                                      {lang === 'en' ? 'Clear Filters' : 'གཙང་སེལ་བྱོས།'}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {filteredEpochs.map(({ word, relativeTimeStr }, idx) => {
                                      let badgeBg = "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-250/50 dark:border-amber-900/40";
                                      if (word.difficulty === 'Easy') {
                                        badgeBg = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50";
                                      } else if (word.difficulty === 'Advanced') {
                                        badgeBg = "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-205/50 dark:border-rose-900/40";
                                      }

                                      const wordDiffLabel = word.difficulty === 'Easy' ? t.levelEasy : word.difficulty === 'Intermediate' ? t.levelIntermediate : t.levelAdvanced;

                                      return (
                                        <motion.div
                                          key={word.id}
                                          initial={{ opacity: 0, y: 10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{ delay: Math.min(10, idx) * 0.035 }}
                                          className="p-3.5 bg-white dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex flex-col justify-between gap-3 hover:border-indigo-400/80 hover:shadow-xs transition-all relative group overflow-hidden"
                                        >
                                          <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[8.5px] font-bold">
                                            <span className="text-slate-400 dark:text-slate-500 font-mono">
                                              {relativeTimeStr}
                                            </span>
                                          </div>

                                          <div>
                                            {/* Tibetan & transliterations */}
                                            <div className="flex items-baseline gap-2 mt-1">
                                              <h4 className="tibetan-text text-xl font-bold text-slate-900 dark:text-slate-105 leading-tight">
                                                {word.tibetan}
                                              </h4>
                                              <span className="text-[10px] text-slate-400 font-mono">
                                                {word.wylie}
                                              </span>
                                            </div>

                                            {/* Correct Translation */}
                                            <p className="text-xs font-extrabold text-indigo-700 dark:text-indigo-400 mt-1 line-clamp-1">
                                              {word.correctMeaning}
                                            </p>
                                            
                                            <p className="text-[9.5px] text-slate-400 dark:text-slate-450 mt-1 first-letter:uppercase italic font-bold">
                                              {word.partOfSpeech}
                                            </p>
                                          </div>

                                          <div className="flex items-center justify-between border-t border-slate-50 dark:border-slate-850 pt-2.5 mt-1 select-none">
                                            <span className={`text-[8.5px] sm:text-[9.5px] px-2 py-0.5 rounded-full border font-bold ${badgeBg} shrink-0`}>
                                              <span className={lang === 'bo' ? 'tibetan-text text-[9px] sm:text-[10px]' : ''}>{wordDiffLabel}</span>
                                            </span>

                                            <div className="flex items-center gap-1.5">
                                              {/* Look up detail Modal */}
                                              <button
                                                onClick={() => {
                                                  setViewingWordId(word.id);
                                                  playSound('NEXT');
                                                }}
                                                className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                                title={lang === 'en' ? "View Details" : "རྒྱས་བཤད་གཟིགས།"}
                                              >
                                                <BookOpen size={13.5} />
                                              </button>
                                              
                                              {/* Run practice quiz with this word */}
                                              <button
                                                onClick={() => {
                                                  startWotdPractice(word);
                                                }}
                                                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 dark:text-indigo-350 rounded-lg transition-all cursor-pointer"
                                                title={lang === 'en' ? "Practice this word" : "མིང་ཚིག་འདི་སྦྱོངས།"}
                                              >
                                                <Trophy size={9.5} />
                                                <span className={lang === 'bo' ? 'tibetan-text text-[9px] pt-0.5' : ''}>
                                                  {lang === 'en' ? "Practice" : "སྦྱོངས།"}
                                                </span>
                                              </button>
                                            </div>
                                          </div>
                                        </motion.div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {activeSelectionTab === 'stats' && (
              <motion.div 
                key="stats-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full overflow-y-auto pr-1 flex flex-col gap-4 min-h-0"
              >
                <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-xs rounded-2xl p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
                    <h3 className="text-sm font-extrabold text-gray-850 dark:text-slate-100 flex items-center gap-1.5">
                      <BarChart3 size={18} className="text-indigo-600 dark:text-indigo-400" />
                      {t.masteryStats}
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 text-indigo-750 dark:text-indigo-400 text-[9px] font-bold rounded-full max-w-fit">
                      <Sliders size={10} className="text-indigo-600 dark:text-indigo-400 animate-pulse" />
                      {t.adaptiveSystemActive}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className={`rounded-xl border p-3 flex items-center gap-3 ${masteryRankDetails.colorClass}`}>
                        <div className="p-2 bg-white dark:bg-slate-900 max-w-min rounded-lg text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
                          <Award size={18} />
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold tracking-wider opacity-85 block">{t.overallMasteryRank}</span>
                          <p className="text-xs font-black tracking-tight">{masteryRankDetails.rank}</p>
                          <p className="text-[10px] opacity-90">{masteryRankDetails.rankSub}</p>
                          
                          <div className="flex gap-0.5 mt-1">
                            {Array.from({ length: 4 }).map((_, idx) => (
                              <Sparkles 
                                key={idx} 
                                size={9} 
                                className={idx < masteryRankDetails.stars ? 'text-amber-500 fill-amber-500' : 'text-slate-300'} 
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150/60 dark:border-slate-800/80 p-2.5 rounded-xl text-center">
                          <span className="text-lg font-black text-slate-800 dark:text-slate-200">{masteryRankDetails.correct}</span>
                          <p className="text-[9px] font-extrabold text-slate-400 dark:text-slate-450 uppercase tracking-wider mt-0.5 leading-snug">{t.totalCorrectLabel}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150/60 dark:border-slate-800/80 p-2.5 rounded-xl text-center">
                          <span className="text-lg font-black text-slate-800 dark:text-slate-200">{masteryRankDetails.completed}</span>
                          <p className="text-[9px] font-extrabold text-slate-400 dark:text-slate-450 uppercase tracking-wider mt-0.5 leading-snug">{t.gamesCompleted}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150/60 dark:border-slate-800/80 p-3 rounded-xl space-y-2.5">
                      <h4 className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-550 mb-0.5">{lang === 'en' ? 'Performance Score Averages' : 'ཆ་སྙོམས་སྦྱང་འབྲས།'}</h4>
                      
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] font-bold text-slate-550 dark:text-slate-400">
                          {lang === 'en' ? (
                            <>
                              <span>{t.levelEasy}</span>
                              <span>{easyAvg}%</span>
                            </>
                          ) : (
                            <>
                              <span>{t.levelEasy}{easyAvg}%</span>
                              <span />
                            </>
                          )}
                        </div>
                        <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${easyAvg}%` }} />
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] font-bold text-slate-550 dark:text-slate-400">
                          {lang === 'en' ? (
                            <>
                              <span>{t.levelIntermediate}</span>
                              <span>{intermediateAvg}%</span>
                            </>
                          ) : (
                            <>
                              <span>{t.levelIntermediate}{intermediateAvg}%</span>
                              <span />
                            </>
                          )}
                        </div>
                        <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${intermediateAvg}%` }} />
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] font-bold text-slate-550 dark:text-slate-400">
                          {lang === 'en' ? (
                            <>
                              <span>{t.levelAdvanced}</span>
                              <span>{advancedAvg}%</span>
                            </>
                          ) : (
                            <>
                              <span>{t.levelAdvanced}{advancedAvg}%</span>
                              <span />
                            </>
                          )}
                        </div>
                        <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${advancedAvg}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150/60 dark:border-slate-800/80 p-2.5 rounded-xl text-left">
                    <div className="flex items-center gap-1 mb-1 bg-indigo-50/80 dark:bg-indigo-950/45 p-0.5 px-2 rounded-lg max-w-fit">
                      <Sliders size={12} className="text-indigo-600 dark:text-indigo-400 shadow-xs" />
                      <span className="text-[9px] font-black text-indigo-900 dark:text-indigo-305 uppercase tracking-wide">{t.adaptiveMode}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                      {t.adaptiveModeDesc}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSelectionTab === 'settings' && (
              <motion.div
                key="settings-tab"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col min-h-0 overflow-y-auto text-left space-y-4 font-sans"
              >
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">{(t as any).settings || 'Settings'}</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{lang === 'en' ? 'Manage sound, language, and workspace data preferences.' : 'སྦྱང་འབྲས་བཀོད་སྒྲིག'}</p>
                </div>

                <div className="space-y-3">
                  {/* Adaptive status card */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-150/60 dark:border-slate-800 rounded-xl flex items-start gap-2.5">
                    <Sliders size={15} className="text-indigo-550 dark:text-indigo-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{t.adaptiveMode}</span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal mt-0.5">
                        {t.adaptiveModeDesc}
                      </p>
                    </div>
                  </div>

                  {/* Word Bank Periodic Updates Panel */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-150/60 dark:border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RefreshCw size={15} className={`text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
                        <div>
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                            {lang === 'en' ? 'Word Bank Updates' : 'ཐ་སྙད་མཛོད་དུས་མཚམས་གསར་སྒྲིག'}
                          </span>
                          <span className="block text-[9px] text-slate-400 dark:text-slate-550 leading-none mt-0.5">
                            {lang === 'en' ? 'Auto-updates database every few hours' : 'ཆུ་ཚོད་འགའ་རེར་རང་འགུལ་གྱིས་གསར་སྒྲིག་བྱེད།'}
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[9px] font-bold rounded-full">
                        {lang === 'en' ? 'Active' : 'འགྱུར་འགྲོས།'}
                      </span>
                    </div>

                    <div className="bg-white dark:bg-slate-950/40 border border-slate-150/60 dark:border-slate-850 p-2.5 rounded-xl space-y-2 text-left">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">{lang === 'en' ? 'Last Check / Sync:' : 'གསར་སྒྲིག་མཐའ་མ།'}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{formatLastSyncTime(lastSyncTime, lang)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">{lang === 'en' ? 'Total Local Entries:' : 'མིང་ཚིག་ཁྱོན་བསྡོམས།'}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{wordBank.length} {lang === 'en' ? 'words fully loaded' : 'བླུགས་ཡོད།'}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">{lang === 'en' ? 'Words Synced Since Boot:' : 'གསར་དུ་སྣོན་པའི་མིང་ཚིག་'}</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{wordsUpdatedCount} {lang === 'en' ? 'terms cached' : 'གསར་སྒྲིག་བྱས་ཟིན།'}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 mt-1">
                        <span className="text-[9px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {lang === 'en' ? `Next update in: ${countdownStr}` : `གསར་སྒྲིག་རྗེས་མ། ${countdownStr} རྗེས་ལ།`}
                        </span>
                        <button
                          onClick={handleManualSync}
                          disabled={isSyncing}
                          className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-[10px] font-bold text-slate-700 dark:text-slate-300 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 flex items-center gap-1 active:scale-97 select-none transition-all"
                        >
                          {isSyncing ? (lang === 'en' ? 'Syncing...' : 'གསར་སྒྲིག་བྱེད་བཞིན།...') : (lang === 'en' ? 'Sync Now' : 'ད་ལྟ་རང་གསར་དུ་སྒྲིག')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tibetan Webfont Selection */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-150/60 dark:border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <Type size={15} className="text-indigo-650 dark:text-indigo-400" />
                      <div>
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                          {lang === 'en' ? 'Tibetan Font Style' : 'བོད་ཡིག་ཡིག་གཟུགས།'}
                        </span>
                        <span className="block text-[9px] text-slate-400 dark:text-slate-550 leading-none mt-0.5">
                          {lang === 'en' ? 'Select your preferred font representation' : 'བོད་ཡིག་གི་ཡིག་གཟུགས་འདེམས་པ།'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setTibetanFont('noto');
                          playSound('NEXT');
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          tibetanFont === 'noto'
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 dark:border-indigo-400/60 ring-1 ring-indigo-500/50'
                            : 'bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-150">Noto Serif Tibetan</span>
                        <span className="block text-[9px] text-slate-400 mt-0.5 font-sans">Google Unicode Serifs</span>
                      </button>
                      <button
                        onClick={() => {
                          setTibetanFont('monlam');
                          playSound('NEXT');
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          tibetanFont === 'monlam'
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 dark:border-indigo-400/60 ring-1 ring-indigo-500/50'
                            : 'bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-150">Monlam UniDTS</span>
                        <span className="block text-[9px] text-slate-400 mt-0.5 font-sans">Monlam Webfont</span>
                      </button>
                    </div>

                    {/* Font Preview Area */}
                    <div className="bg-white dark:bg-slate-950/40 border border-slate-150/60 dark:border-slate-850 p-3 rounded-xl text-center space-y-1">
                      <span className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500 text-left">
                        {lang === 'en' ? 'Font Visual Preview:' : 'ཡིག་གཟུགས་སྔོན་ལྟ།'}
                      </span>
                      <div className="py-2.5 px-1 border border-dashed border-slate-200 dark:border-slate-805 rounded-lg">
                        <p className="tibetan-text text-xl py-1 text-slate-905 dark:text-slate-50">
                          བཀྲ་ཤིས་བདེ་ལེགས།  བོད་སྐད་ཡིག་རྩེད།
                        </p>
                        <span className="text-[9px] text-slate-400 dark:text-slate-550 block font-mono">
                          {tibetanFont === 'noto' ? 'Active: Noto Serif Tibetan' : 'Active: Monlam UniDTS'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Reset and purge progress option */}
                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3.5 mt-2">
                    {!showResetConfirm ? (
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-450 border border-rose-200/60 dark:border-rose-800/50 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <Trash2 size={14} />
                        <span>{(t as any).resetStatsBtn || 'Reset Statistics'}</span>
                      </button>
                    ) : (
                      <div className="p-3.5 border border-rose-150 dark:border-rose-800 bg-rose-50/10 dark:bg-rose-950/10 rounded-xl space-y-3 text-left">
                        <p className="text-[11px] font-bold text-rose-800 dark:text-rose-400 leading-normal">
                          {(t as any).resetStatsConfirm || 'Are you sure you want to delete progress?'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setMastery(DEFAULT_MASTERY_STATS);
                              localStorage.removeItem('tibetan_vocab_mastery_v2');
                              setShowResetConfirm(false);
                              setResetSuccess(true);
                              playSound('INCORRECT');
                              setTimeout(() => setResetSuccess(false), 3000);
                            }}
                            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            {(t as any).yesResetBtn || 'Yes, delete everything'}
                          </button>
                          <button
                            onClick={() => setShowResetConfirm(false)}
                            className="px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-350 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            {(t as any).noCancelBtn || 'Cancel'}
                          </button>
                        </div>
                      </div>
                    )}

                    {resetSuccess && (
                      <div className="mt-2.5 p-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-150 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-450 rounded-xl text-xs font-bold">
                        {(t as any).statsResetSuccessful || 'Stats reset!'}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeSelectionTab === 'about' && (
              <motion.div
                key="about-tab"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col min-h-0 overflow-y-auto text-left space-y-4"
              >
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">{(t as any).aboutTitle || 'About Tibetan Vocabulary'}</h2>
                  <p className="text-[11px] text-slate-550 dark:text-slate-400 mt-0.5">{lang === 'en' ? 'Preserving and learning classical & standard language.' : 'བོད་ཡིག་ཚིག་རྩལ་སྦྱོང་རྩེད།'}</p>
                </div>

                <div className="space-y-3.5 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed animate-fadeIn">
                  <div className="bg-slate-50/50 dark:bg-slate-900/60 p-3.5 border border-slate-150/60 dark:border-slate-800 rounded-xl space-y-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{(t as any).aboutP1}</p>
                    <p>{(t as any).aboutP2}</p>
                    <p>{(t as any).aboutP3}</p>
                  </div>

                  <div className="flex bg-gradient-to-r from-amber-500/5 to-indigo-500/5 dark:from-amber-500/10 dark:to-indigo-500/10 rounded-xl p-3 border border-indigo-150/30 dark:border-indigo-900/30 gap-2.5 items-center">
                    <Sparkles size={16} className="text-amber-500 shrink-0 animate-pulse" />
                    <p className="font-extrabold text-[10px] text-indigo-900 dark:text-indigo-300">{(t as any).aboutCTA}</p>
                  </div>

                  {/* Standard reference definitions */}
                  <div>
                    <h3 className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">{lang === 'en' ? 'Academic Sources & Reference Links' : 'དཔྱད་གཞིའི་ཚིག་མཛོད་ཁག་'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      {Object.entries(SOURCE_LINKS).slice(0, 5).map(([name, url]) => (
                        <a 
                          key={name}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-150/65 dark:border-slate-800 rounded-lg p-2 flex items-center justify-between hover:text-indigo-600 hover:bg-slate-100/30 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{name}</span>
                          <ExternalLink size={10} className="text-slate-400 dark:text-slate-500 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const GamePlay = () => (
    <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 justify-between p-2 py-3 md:p-4 gap-4">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="bg-white dark:bg-slate-900 px-3 py-1 rounded-full border border-gray-200 dark:border-slate-800 shadow-sm flex items-center gap-1.5 text-xs sm:text-sm">
          <span className="font-medium text-gray-500 dark:text-slate-400">{t.question}</span>
          <span className={`font-bold ${theme.accent}`}>{currentIndex + 1}/10</span>
        </div>
        <div className={`flex-1 mx-4 h-2 ${theme.progressBarContainer} rounded-full overflow-hidden transition-all duration-300`}>
          <motion.div 
            className={`h-full ${theme.progress}`}
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / 10) * 100}%` }}
          />
        </div>
        <div className="text-xs sm:text-sm font-bold text-gray-800 dark:text-slate-200">
          {t.score}: {userAnswers.filter(a => a.isCorrect).length}
        </div>
      </div>

      {isTimeTrial && (
        <div className="mb-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-3 shadow-xs shrink-0 flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${timeLeft <= 5 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-500 animate-bounce' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-500 animate-pulse'}`}>
              <Clock size={15} />
            </div>
            <div>
              <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase leading-none tracking-wider">
                {t.timeLeft}
              </span>
              <span className={`block text-sm font-black mt-0.5 leading-none font-mono ${timeLeft <= 5 ? 'text-rose-600 dark:text-rose-400 font-extrabold scale-105' : 'text-slate-800 dark:text-slate-100'}`}>
                {timeLeft}s
              </span>
            </div>
          </div>
          <div className="flex-1 h-2.5 bg-slate-150 dark:bg-slate-850 rounded-full overflow-hidden relative">
            <motion.div
              className={`h-full rounded-full ${
                timeLeft <= 5 
                  ? 'bg-rose-500 dark:bg-rose-500 shadow-rose-200/50' 
                  : timeLeft <= 12 
                    ? 'bg-amber-500 dark:bg-amber-500 shadow-amber-200/50' 
                    : 'bg-indigo-500 dark:bg-indigo-500'
              }`}
              initial={{ width: '100%' }}
              animate={{ width: `${(timeLeft / 30) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </div>
        </div>
      )}

      {adaptiveTuningMsg && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 px-3 py-2 border border-indigo-150 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/40 rounded-xl text-[10px] sm:text-xs font-bold text-indigo-750 dark:text-indigo-400 flex items-center gap-1.5 justify-center text-center shrink-0"
        >
          <Sliders size={12} className="animate-pulse" />
          <span>{adaptiveTuningMsg}</span>
        </motion.div>
      )}

      <motion.div 
        key={currentIndex}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-150 dark:border-slate-800 text-center mb-2 sm:mb-4 h-fit min-h-[140px] sm:min-h-[180px] flex flex-col justify-center items-center relative overflow-visible"
      >
        {isAnswerRevealed && selectedOption === '' && (
          <div className="absolute inset-0 bg-rose-500/10 backdrop-blur-[1px] rounded-2xl flex flex-col items-center justify-center pointer-events-none select-none z-10 animate-pulse border-2 border-rose-500">
            <span className="text-rose-600 dark:text-rose-400 font-black text-xl tracking-wider uppercase tibetan-text">
              {t.timeOut}
            </span>
          </div>
        )}

        <button
          onClick={() => currentWord && setViewingWordId(currentWord.id)}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 bg-indigo-50/80 hover:bg-indigo-100/90 dark:bg-slate-800/80 dark:hover:bg-slate-700/90 text-indigo-605 dark:text-indigo-400 rounded-xl border border-indigo-100/60 dark:border-slate-700 transition-all cursor-pointer shadow-xs flex items-center gap-1.5 text-[10px] font-bold active:scale-95 z-5"
          title={lang === 'en' ? 'Dictionary Details' : 'དག་ཡིག་ཞིབ་ཕྲ།'}
        >
          <BookOpen size={12} />
          <span className="hidden sm:inline">{lang === 'en' ? 'Quick Look' : 'ཚིག་མཛོད་ཞིབ་ལྟ།'}</span>
        </button>

        <div className="flex justify-center mb-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${theme.badgeBg} transition-all duration-500`}>
            <Sparkles size={10} className="text-current" />
            {(currentWord?.difficulty === 'Easy' ? t.levelEasy : currentWord?.difficulty === 'Intermediate' ? t.levelIntermediate : t.levelAdvanced)}
          </span>
        </div>
        <h2 
          onClick={() => currentWord && setViewingWordId(currentWord.id)}
          className="tibetan-text text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 dark:text-slate-50 mb-2 leading-relaxed py-2 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors active:scale-98 select-none"
          title={lang === 'en' ? 'Click for Details' : 'ཞིབ་ཕྲ་གཟིགས།'}
        >
          {currentWord?.tibetan}
        </h2>
        <p className="text-slate-400 dark:text-slate-500 font-mono text-xs sm:text-sm tracking-widest uppercase">{t.wylie}: {currentWord?.wylie}</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
        {options.map((option, idx) => {
          const isCorrect = option === currentWord?.correctMeaning;
          const isSelected = option === selectedOption;
          
          let buttonClass = "p-4 sm:p-3.5 sm:px-4 rounded-xl border border-gray-200 dark:border-slate-700 text-sm sm:text-base font-semibold transition-all text-left flex items-center justify-between cursor-pointer min-h-[52px] shadow-xs ";
          if (!isAnswerRevealed) {
            buttonClass += `bg-white dark:bg-slate-800/90 hover:border-indigo-400 dark:hover:border-indigo-500 ${theme.hoverOption} text-slate-800 dark:text-slate-100 active:scale-[0.98] shadow-sm`;
          } else {
            if (isCorrect) {
              buttonClass += "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 text-emerald-900 dark:text-emerald-300 ring-2 ring-emerald-100 dark:ring-emerald-950/30";
            } else if (isSelected) {
              buttonClass += "bg-rose-50 dark:bg-rose-950/40 border-rose-500 dark:border-rose-500 text-rose-900 dark:text-rose-300 ring-2 ring-rose-100 dark:ring-rose-950/30";
            } else {
              buttonClass += "bg-white/50 dark:bg-slate-900/30 opacity-40 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-800/50";
            }
          }

          const buttonVariants = {
            initial: { scale: 1 },
            correct: { 
              scale: [1, 1.03, 1],
              transition: { duration: 0.35 }
            },
            incorrect: {
              x: [0, -8, 8, -8, 8, 0],
              transition: { duration: 0.35 }
            }
          };

          return (
            <motion.button
              key={idx}
              variants={buttonVariants}
              initial="initial"
              animate={isAnswerRevealed && isSelected ? (isCorrect ? "correct" : "incorrect") : "initial"}
              whileTap={{ scale: 0.98 }}
              disabled={isAnswerRevealed}
              onClick={() => handleAnswer(option)}
              className={buttonClass}
            >
              <span className="line-clamp-2 pr-2 leading-tight select-none">{option}</span>
              {isAnswerRevealed && isCorrect && <CheckCircle2 className="text-green-600 shrink-0" size={18} />}
              {isAnswerRevealed && isSelected && !isCorrect && <XCircle className="text-red-600 shrink-0" size={18} />}
            </motion.button>
          );
        })}
      </div>

      {isAnswerRevealed && (
        <div className="mt-4 flex justify-center shrink-0">
          <button
            ref={nextButtonRef}
            onClick={nextQuestion}
            className={`flex items-center justify-center gap-2 min-h-[46px] px-8 py-3 sm:py-2.5 ${theme.playButton} text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] cursor-pointer shadow-sm hover:shadow`}
          >
            {currentIndex === 9 ? t.finish : t.next}
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );

  const EndGame = () => {
    let message = t.goodEffort;
    if (score === 10) message = t.perfect;
    else if (score >= 8) message = t.excellent;
    else if (score >= 5) message = t.wellDone;

    const getActiveChallengeLabel = () => {
      if (difficulty === 'Easy') return t.levelEasy;
      if (difficulty === 'Intermediate') return t.levelIntermediate;
      if (difficulty === 'Advanced') return t.levelAdvanced;
      
      if (selectedCategory === 'nouns') return t.nounCategory;
      if (selectedCategory === 'verbs') return t.verbCategory;
      if (selectedCategory === 'adjectives') return t.adjectiveCategory;
      if (selectedCategory === 'honorifics') return t.honorificCategory;
      if (selectedCategory === 'grammar') return t.grammarCategory;
      return '';
    };

    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-4 px-2 text-center max-w-md mx-auto">
        <motion.div
           initial={{ scale: 0 }}
           animate={{ scale: 1 }}
           className="w-20 h-20 bg-yellow-100 dark:bg-yellow-950/30 rounded-full flex items-center justify-center mb-4 text-amber-550 shadow-sm shrink-0"
        >
          <Trophy size={40} className="text-amber-500" />
        </motion.div>
        
        <h1 className="text-2xl font-bold text-gray-905 dark:text-slate-100 mb-0.5">{t.quizComplete}</h1>
        <p className="text-gray-450 dark:text-slate-400 text-xs sm:text-sm font-semibold mb-4">{getActiveChallengeLabel()}</p>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-md border border-gray-150 dark:border-slate-800 w-full mb-5 text-center shrink-0">
           <div className={`text-5xl font-black ${theme.accent} mb-1`}>{score}</div>
           <div className="text-gray-400 dark:text-slate-500 font-bold uppercase tracking-widest text-[9px] mb-3">{t.outOf}</div>
           <p className="text-gray-700 dark:text-slate-350 text-xs sm:text-sm font-semibold px-2">{message}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full shrink-0">
          <button
            onClick={resetGame}
            className={`w-full sm:flex-1 flex items-center justify-center gap-2 min-h-[48px] p-3.5 ${theme.playButton} text-white rounded-xl font-bold text-sm transition-all active:scale-98 cursor-pointer shadow-sm hover:shadow-md`}
          >
            <RotateCcw size={16} />
            <span>{t.playAgain}</span>
          </button>
          <button
            onClick={() => setScreen('REVIEW')}
            className={`w-full sm:flex-1 flex items-center justify-center gap-2 min-h-[48px] p-3.5 bg-white dark:bg-slate-900 ${theme.accent} border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl font-bold text-sm transition-all active:scale-98 cursor-pointer shadow-sm hover:shadow-md`}
          >
            <BookOpen size={16} />
            <span>{t.review}</span>
          </button>
        </div>
        
        <button 
          onClick={() => setScreen('LEVEL_SELECTION')}
          className="mt-6 text-indigo-500 hover:text-indigo-605 font-bold text-xs sm:text-sm cursor-pointer p-2 rounded-lg transition-colors shrink-0"
        >
          {t.backToSelection}
        </button>
      </div>
    );
  };

  const ReviewScreen = () => (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full max-w-2xl mx-auto p-2 pb-4">
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <button 
          onClick={() => setScreen('END_GAME')}
          className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer text-gray-600 dark:text-slate-350 active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 tracking-tight">{t.answerReview}</h1>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-4 min-h-0">
        {userAnswers.map((answer, idx) => {
          const word = wordBank.find(w => w.id === answer.wordId);
          return (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-150 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4 text-left"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                 <div className={`mt-1.5 p-1 rounded-full shrink-0 ${answer.isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/35 text-rose-600 dark:text-rose-400'}`}>
                    {answer.isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                 </div>
                 <div className="min-w-0 flex-1">
                    <h3 className="tibetan-text text-2xl font-bold text-slate-805 dark:text-slate-100 mb-0.5 truncate leading-relaxed">{word?.tibetan}</h3>
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 truncate">
                      <span className="text-emerald-600 dark:text-emerald-400">{word?.correctMeaning}</span>
                      {!answer.isCorrect && (
                        <span className="ml-1.5 text-rose-500 dark:text-rose-400 font-medium font-sans">
                           • {t.youChose}: {answer.selectedOption}
                        </span>
                      )}
                    </p>
                 </div>
              </div>
              <button 
                onClick={() => setViewingWordId(word?.id || null)}
                className="flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/55 dark:bg-slate-800 hover:bg-indigo-100/70 dark:hover:bg-slate-705 rounded-xl transition-all cursor-pointer shrink-0 active:scale-95"
              >
                <span>{t.viewEntry}</span>
                <ChevronRight size={14} />
              </button>
            </motion.div>
          );
        })}
      </div>

      <button
        onClick={resetGame}
        className="w-full flex items-center justify-center gap-2 min-h-[50px] p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-sm cursor-pointer shrink-0 active:scale-98"
      >
        <RotateCcw size={16} />
        <span>{t.playAgain}</span>
      </button>
    </div>
  );

  const DictionaryDetail = () => {
    if (!viewingWord) return null;
    const { meaningBo } = getTibetanDictionaryDetails(viewingWord);

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 text-slate-900 dark:text-slate-100 overflow-hidden"
      >
        <motion.div 
          className="bg-white dark:bg-slate-900 w-full max-w-lg h-auto max-h-[90vh] sm:max-h-[82vh] rounded-2xl shadow-2xl flex flex-col relative overflow-hidden border border-slate-100 dark:border-slate-800"
          layoutId={viewingWord.id}
        >
          {/* Header section with closing button and badges */}
          <header className="p-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 text-[9px] font-bold rounded-lg uppercase tracking-wider">
                {viewingWord.difficulty === 'Easy' ? t.levelEasy : viewingWord.difficulty === 'Intermediate' ? t.levelIntermediate : t.levelAdvanced}
              </span>
              <span className="text-[9px] uppercase font-extrabold tracking-wider bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                {viewingWord.partOfSpeech}
              </span>
            </div>
            <button 
              onClick={() => setViewingWordId(null)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
              title="Close"
            >
              <XCircle size={16} />
            </button>
          </header>

          {/* Scrollable central content */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 min-h-0">
            {/* Visual key words */}
            <div className="text-center sm:text-left pb-2 border-b border-slate-100/80 dark:border-slate-800/80">
              <h1 className="tibetan-text text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-50 leading-normal mb-1">
                {viewingWord.tibetan}
              </h1>
              <div className="flex flex-wrap items-baseline justify-center sm:justify-start gap-x-4 gap-y-1 text-xs">
                <p className="text-gray-400 font-mono tracking-widest uppercase">
                  {t.wylie}: <span className="font-bold text-gray-700 dark:text-slate-200">{viewingWord.wylie}</span>
                </p>
                <span className="text-slate-300 dark:text-slate-705 hidden sm:inline">•</span>
                <p className="text-slate-500 dark:text-slate-400 font-semibold">
                  {t.primaryMeaning}: <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{viewingWord.correctMeaning}</span>
                </p>
              </div>
            </div>

            {/* Traditional Tibetan Explanation Box */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 rounded-xl text-left">
              <h3 className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1 pb-1 border-b border-slate-200/50 dark:border-slate-800/50">
                <BookOpen size={12} className="text-indigo-500" />
                {lang === 'bo' ? 'བོད་ཡིག་འགྲེལ་གཤེགས།' : 'Tibetan Language Reference'}
              </h3>
              <p className="tibetan-text text-xl font-bold text-indigo-700 dark:text-indigo-300 leading-relaxed">
                {meaningBo}
              </p>
            </div>

            {/* Compact CTA to Library definition database */}
            <div className="p-3 bg-gradient-to-r from-indigo-50/20 to-purple-50/20 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl border border-indigo-100/30 dark:border-indigo-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-left shrink-0">
              <div className="flex-1">
                <h4 className="font-bold text-slate-900 dark:text-slate-200 text-[11px]">{(t as any).ctaTitle}</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">{(t as any).ctaSubtitle}</p>
              </div>
              <motion.a 
                href="https://www.monlamdictionary.com/"
                target="_blank"
                rel="noopener noreferrer"
                animate={{
                  scale: [1, 1.05, 1],
                  boxShadow: [
                    "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                    "0 4px 12px 0 rgba(79, 70, 229, 0.15)",
                    "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
                  ]
                }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-slate-900 text-white text-[11px] font-bold rounded-lg transition-all shadow-xs whitespace-nowrap cursor-pointer hover:shadow"
                id="monlam-dictionary-cta-link"
              >
                <span>{(t as any).ctaButton}</span>
                <ExternalLink size={10} />
              </motion.a>
            </div>

            {/* Secondary definitions */}
            {viewingWord.secondaryMeanings && viewingWord.secondaryMeanings.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t.secondaryMeanings}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {viewingWord.secondaryMeanings.map((m, i) => (
                    <span key={i} className="px-2.5 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 rounded-md">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Visual examples */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-500" /> {t.examples}
              </h3>
              <div className="space-y-1.5">
                {viewingWord.examples.map((ex, idx) => (
                  <div key={idx} className="bg-indigo-50/20 dark:bg-indigo-950/20 px-3 py-2 border border-indigo-100/20 dark:border-indigo-900/20 rounded-xl">
                    <p className="tibetan-text text-base text-slate-900 dark:text-slate-100 leading-normal mb-0.5">{ex.tibetan}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium italic">{ex.translation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            {viewingWord.notes && (
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 italic">{t.notes}</h3>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-normal bg-amber-50/10 dark:bg-amber-950/10 p-2.5 rounded-lg border border-amber-100/30 dark:border-amber-900/30 font-medium">{viewingWord.notes}</p>
              </div>
            )}

            {/* Online academic search sources */}
            <div className="pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-gray-400">
                <span className="font-bold uppercase tracking-wider">{t.source}:</span>
                {(() => {
                  // Ensure Monlam Grand Tibetan Dictionary is always the first, primary source shown
                  const wordSources = viewingWord.sources ? [...viewingWord.sources] : [];
                  const monlamIndex = wordSources.indexOf('Monlam Grand Tibetan Dictionary');
                  if (monlamIndex > -1) {
                    wordSources.splice(monlamIndex, 1);
                  }
                  const finalSources = ['Monlam Grand Tibetan Dictionary', ...wordSources];
                  
                  return finalSources.map((s, i) => {
                    const baseUrl = SOURCE_LINKS[s] || SOURCE_LINKS['Monlam Grand Tibetan Dictionary'];
                    const url = baseUrl.includes('search') || baseUrl.includes('wiki/') 
                      ? `${baseUrl}${encodeURIComponent(viewingWord.tibetan)}`
                      : baseUrl;
                      
                    return (
                      <a 
                        key={i} 
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-0.5 hover:text-indigo-400 hover:underline transition-colors font-medium border px-1 py-0.5 rounded ${
                          s === 'Monlam Grand Tibetan Dictionary' 
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200/60 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold' 
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span>{s}</span>
                        <ExternalLink size={8} />
                      </a>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Footer controls */}
          <footer className="p-3 border-t border-gray-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex shrink-0 justify-end">
            <button 
              onClick={() => setViewingWordId(null)}
              className="w-full sm:w-auto px-4 py-2 bg-slate-950 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} /> <span>{t.backToReview}</span>
            </button>
          </footer>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <div className={`font-sans ${theme.bg} ${darkMode ? 'dark text-slate-105 bg-slate-950' : 'text-slate-900 bg-slate-50'} h-screen max-h-screen flex flex-col overflow-hidden transition-all duration-1050 ease-in-out`}>
      <HeaderControls />
      <main className="flex-1 w-full max-w-4xl mx-auto px-2 md:px-4 py-2 min-h-0 overflow-hidden flex flex-col justify-start">
        <AnimatePresence mode="wait">
          {screen === 'LEVEL_SELECTION' && (
            <motion.div key="selection" className="flex-1 flex flex-col min-h-0 overflow-hidden" exit={{ opacity: 0, x: -20 }}>
              <LevelSelection />
            </motion.div>
          )}
          
          {screen === 'GAME_PLAY' && (
            <motion.div key="game" className="flex-1 flex flex-col min-h-0 overflow-hidden" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <GamePlay />
            </motion.div>
          )}

          {screen === 'END_GAME' && (
            <motion.div key="end" className="flex-1 flex flex-col min-h-0 overflow-hidden" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <EndGame />
            </motion.div>
          )}

          {screen === 'REVIEW' && (
            <motion.div key="review" className="flex-1 flex flex-col min-h-0 overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ReviewScreen />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {viewingWordId && <DictionaryDetail />}
        </AnimatePresence>
      </main>

      {/* Drawer Menu overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
            />

            {/* Sliding Menu drawer panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col border-r border-slate-150 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            >
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40 select-none">
                <div className="flex items-center gap-2">
                  <GraduationCap className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
                  <span className={`font-extrabold tracking-tight text-slate-900 dark:text-slate-150 ${
                    lang === 'en' ? 'text-[10.5px]' : 'text-sm'
                  }`}>
                    {t.title}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    playSound('NEXT');
                  }}
                  className="flex items-center justify-center w-11 h-11 hover:bg-slate-105 dark:hover:bg-slate-800 active:scale-95 text-slate-420 hover:text-red-500 rounded-xl transition-all cursor-pointer shrink-0"
                  aria-label="Close menu"
                >
                  <XCircle className="w-5 h-5 text-slate-400 dark:text-slate-500 hover:text-red-500" />
                </button>
              </div>

              {/* Drawer Links */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {menuItems.map((item) => {
                  const isGames = item.id === 'games';
                  const isItemActive = activeSelectionTab === item.id;
                  
                  return (
                    <div key={item.id} className="space-y-1">
                      <button
                        onClick={() => {
                          setActiveSelectionTab(item.id);
                          setScreen('LEVEL_SELECTION');
                          if (isGames) {
                            setStudyMode('home');
                          }
                          setResetSuccess(false);
                          setShowResetConfirm(false);
                          if (!isGames) {
                            setIsMenuOpen(false);
                          }
                          playSound('NEXT');
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-xs md:text-sm font-extrabold rounded-xl transition-all cursor-pointer border ${
                          isItemActive
                            ? 'bg-indigo-600 dark:bg-indigo-700 text-white border-indigo-600 dark:border-indigo-800 shadow-sm'
                            : 'bg-transparent text-slate-600 dark:text-slate-300 border-transparent hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-slate-800/20'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>

                      {/* Sub-items for Games */}
                      {isGames && (
                        <div className="pl-6 pr-1 py-0.5 space-y-1 border-l-2 border-indigo-100/60 dark:border-indigo-900/40 ml-5 select-none animate-fadeIn">
                          <button
                            onClick={() => {
                              setActiveSelectionTab('games');
                              setStudyMode('level');
                              setScreen('LEVEL_SELECTION');
                              setResetSuccess(false);
                              setShowResetConfirm(false);
                              setIsMenuOpen(false);
                              playSound('NEXT');
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer border ${
                              isItemActive && studyMode === 'level'
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/50 shadow-xs'
                                : 'bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/15 dark:hover:bg-slate-800/10'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isItemActive && studyMode === 'level' ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-700'}`} />
                            <span className={lang === 'bo' ? 'text-[13px] sm:text-sm tibetan-text tracking-wide' : ''}>{t.studyByLevel}</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              setActiveSelectionTab('games');
                              setStudyMode('category');
                              setScreen('LEVEL_SELECTION');
                              setResetSuccess(false);
                              setShowResetConfirm(false);
                              setIsMenuOpen(false);
                              playSound('NEXT');
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer border ${
                              isItemActive && studyMode === 'category'
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/50 shadow-xs'
                                : 'bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/15 dark:hover:bg-slate-800/10'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isItemActive && studyMode === 'category' ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-700'}`} />
                            <span className={lang === 'bo' ? 'text-[13px] sm:text-sm tibetan-text tracking-wide' : ''}>{t.studyByCategory}</span>
                          </button>

                          <button
                            onClick={() => {
                              setActiveSelectionTab('games');
                              setStudyMode('wotd_archive');
                              setScreen('LEVEL_SELECTION');
                              setResetSuccess(false);
                              setShowResetConfirm(false);
                              setIsMenuOpen(false);
                              playSound('NEXT');
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer border ${
                              isItemActive && studyMode === 'wotd_archive'
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/50 shadow-xs'
                                : 'bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/15 dark:hover:bg-slate-800/10'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isItemActive && studyMode === 'wotd_archive' ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-700'}`} />
                            <span className={lang === 'bo' ? 'text-[13px] sm:text-sm tibetan-text tracking-wide' : ''}>{t.wotdArchive}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/30 text-center select-none">
                <p className="text-[10px] text-slate-400 font-semibold flex items-center justify-center gap-1">
                  <span>{t.madeBy}</span> <Sparkles size={8} className="text-indigo-400 animate-pulse" />
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <footer className="py-2.5 mt-auto text-center shrink-0 border-t border-slate-200/50 bg-slate-50/10">
        <p className="text-gray-400 text-xs flex items-center justify-center gap-1.5 font-semibold">
          {t.madeBy} <Sparkles size={11} className="text-indigo-400 animate-pulse" />
        </p>
      </footer>
    </div>
  );
}
