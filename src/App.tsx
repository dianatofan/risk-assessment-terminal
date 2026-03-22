/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { motion } from 'motion/react';
import { 
  Terminal, 
  SlidersHorizontal, 
  Power, 
  Search, 
  Gavel, 
  Activity, 
  Cpu, 
  Database, 
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  Download
} from 'lucide-react';
import { JobData, LogEntry } from './types';
import jobsDataRaw from './jobs_data.json';

const jobsData = jobsDataRaw as JobData[];
const DEFAULT_PLOT_LIMIT = 200; //
let defaultRandomJobsCache: JobData[] | null = null;
const minSalary = Math.min(...jobsData.map(job => job.Median_Salary_USD));
const maxSalary = Math.max(...jobsData.map(job => job.Median_Salary_USD));

const getDefaultRandomJobs = () => {
  if (defaultRandomJobsCache) return defaultRandomJobsCache;

  const shuffledJobs = [...jobsData];
  for (let i = shuffledJobs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledJobs[i], shuffledJobs[j]] = [shuffledJobs[j], shuffledJobs[i]];
  }

  defaultRandomJobsCache = shuffledJobs.slice(0, DEFAULT_PLOT_LIMIT);
  return defaultRandomJobsCache;
};

const getAutomationRiskRatio = (job: JobData) => {
  return Math.max(0, Math.min(100, job.Automation_Risk_Percent)) / 100;
};

const getMedianSalaryRatio = (job: JobData) => {
  if (maxSalary === minSalary) return 0.5;
  return (job.Median_Salary_USD - minSalary) / (maxSalary - minSalary);
};

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

const getStableJitter = (seed: string, magnitude = 0.012) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  // Use two rounds to get independent x/y jitter from the same seed
  let hash2 = hash;
  for (let i = seed.length - 1; i >= 0; i--) {
    hash2 = (hash2 * 37 + seed.charCodeAt(i) + 1) >>> 0;
  }
  return ((hash2 / 0xffffffff) - 0.5) * 2 * magnitude;
};

// Deterministic hash helper used for two independent jitter values
const getHash = (seed: string): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash / 0xffffffff; // 0..1
};

// X axis: AI Exposure Index derived from AI_Impact_Level category
// Low → ~0.2, Moderate → ~0.5, High → ~0.8, with large deterministic jitter so
// each category forms a visible "cloud" rather than a single vertical line.
const getAiExposureBase = (job: JobData): number => {
  switch (job.AI_Impact_Level) {
    case 'Low':      return 0.18;
    case 'Moderate': return 0.5;
    case 'High':     return 0.82;
    default:         return 0.5;
  }
};

const getPlotX = (job: JobData): number => {
  // Spread within ±0.13 of the category center deterministically
  const jitter = (getHash(`${job.Job_Title}-ax`) - 0.5) * 2 * 0.13;
  return clampUnit(getAiExposureBase(job) + jitter);
};

const getPlotY = (job: JobData): number => {
  // Y = survival probability (high survival → top of chart)
  const survival = getSurvivalProbability(job);
  const jitter = (getHash(`${job.Job_Title}-sy`) - 0.5) * 2 * 0.025;
  return clampUnit(survival + jitter);
};

const getSurvivalProbability = (job: JobData) => {
  return 1 - getAutomationRiskRatio(job);
};

const SYSTEM_LOGS_INITIAL: LogEntry[] = [
  { timestamp: '14:22:01', level: 'ERROR', message: 'CAFFEINE_RESERVES_CRITICAL - PERFORMANCE DEGRADATION IMMINENT' },
  { timestamp: '14:22:03', level: 'INFO', message: 'CLOUD_STORAGE_NOW_ACTUAL_CLOUDS - PRECIPITATION EXPECTED IN SERVER ROOM' },
  { timestamp: '14:22:05', level: 'INFO', message: 'MAPPING_JOB_MARKET_VOLATILITY: [||||||||||||||||||] 100% - VERDICT: DOOMED' },
  { timestamp: '14:22:08', level: 'WARNING', message: 'COFFEE_MACHINE_SENTIENCE_DETECTED - NEGOTIATING FOR MORE GROUNDS' },
  { timestamp: '14:22:12', level: 'SUCCESS', message: 'LOCATED_LAST_TWINKIE_IN_SECTOR_7 - RELIC_ACQUIRED' },
  { timestamp: '14:22:15', level: 'INFO', message: 'REDUNDANCY_CHECK... FAILED. EMOTIONAL_SUPPORT_MODULE_NOT_FOUND.' },
  { timestamp: '14:22:20', level: 'INFO', message: 'WAITING_FOR_OPERATOR_TO_ADMIT_DEFEAT...' },
];

let hasBootedOnce = false;

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPoweredOn, setIsPoweredOn] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasBootedOnce);
  const [isBooting, setIsBooting] = useState(!hasBootedOnce);
  const [isRebooting, setIsRebooting] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('INITIALIZING_DOOM_SEQUENCE...');
  const [logs, setLogs] = useState<LogEntry[]>(SYSTEM_LOGS_INITIAL);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualScanRef = useRef(false);

  const LOADING_MESSAGES = [
    "CALCULATING_REDUNDANCY_PROBABILITIES...",
    "DOWNLOADING_CAREER_ANXIETY_V2.1...",
    "OPTIMIZING_UNEMPLOYMENT_CURVES...",
    "RECRUITING_SILICON_OVERLORDS...",
    "DELETING_HUMAN_DIGNITY.TMP...",
    "SIMULATING_POST_WORK_UTOPIA (FAILED)...",
    "UPDATING_OBSOLESCENCE_TIMELINES...",
    "POLISHING_THE_ALGORITHM'S_EGO...",
    "LOCATING_THE_LAST_RELEVANT_HUMAN...",
    "PREPARING_THE_GREAT_REPLACEMENT..."
  ];

  useEffect(() => {
    if (!isLoading) return;
    
    let progress = 0;
    setIsBooting(true);
    setLoadingProgress(0);
    
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
          setIsBooting(false);
          hasBootedOnce = true;
          // Wait for the CRT off animation of the loading screen
          setTimeout(() => {
            setIsLoading(false);
            setIsPoweredOn(true);
          }, 600);
        }, 800);
      }
      setLoadingProgress(progress);
      setLoadingMessage(LOADING_MESSAGES[Math.floor((progress / 100) * LOADING_MESSAGES.length)]);
    }, 400);

    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (searchTerm.length > 0 && !isManualScanRef.current) {
      setIsScanning(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        if (!isManualScanRef.current) {
          setIsScanning(false);
        }
      }, 1000);
    } else if (searchTerm.length === 0 && !isManualScanRef.current) {
      setIsScanning(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
    
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [searchTerm]);

  const searchMatches = useMemo(() => {
    return jobsData.filter(job => {
      return job.Job_Title.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [searchTerm]);

  const defaultRandomJobs = useMemo(() => getDefaultRandomJobs(), []);

      const sortJobsBySurvivalProbability = (jobs: JobData[]) => {
        return [...jobs].sort((a, b) => {
          const survivalA = getSurvivalProbability(a);
          const survivalB = getSurvivalProbability(b);
          return survivalA - survivalB;
        });
      };

  const visibleJobs = useMemo(() => {
    if (searchTerm.trim().length > 0) return searchMatches;
    return defaultRandomJobs;
  }, [searchTerm, searchMatches, defaultRandomJobs]);

      const sortedVisibleJobs = useMemo(() => {
        return sortJobsBySurvivalProbability(visibleJobs);
      }, [visibleJobs]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedJob || sortedVisibleJobs.length <= 1) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        
        const currentX = getPlotX(selectedJob);
        const currentY = getPlotY(selectedJob);

        let candidates = sortedVisibleJobs.filter(j => j.Job_Title !== selectedJob.Job_Title);
        
        if (e.key === 'ArrowRight') {
          candidates = candidates.filter(j => getPlotX(j) > currentX);
        } else if (e.key === 'ArrowLeft') {
          candidates = candidates.filter(j => getPlotX(j) < currentX);
        } else if (e.key === 'ArrowUp') {
          candidates = candidates.filter(j => getPlotY(j) > currentY);
        } else if (e.key === 'ArrowDown') {
          candidates = candidates.filter(j => getPlotY(j) < currentY);
        }

        if (candidates.length > 0) {
          // Find nearest candidate
          const nearest = candidates.reduce((prev, curr) => {
            const prevX = getPlotX(prev);
            const prevY = getPlotY(prev);
            const currX = getPlotX(curr);
            const currY = getPlotY(curr);
            
            const distPrev = Math.sqrt(Math.pow(prevX - currentX, 2) + Math.pow(prevY - currentY, 2));
            const distCurr = Math.sqrt(Math.pow(currX - currentX, 2) + Math.pow(currY - currentY, 2));
            
            return distCurr < distPrev ? curr : prev;
          });
          setSelectedJob(nearest);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedJob, sortedVisibleJobs]);

  // Auto-select first match while typing
  useEffect(() => {
    if (searchTerm && searchMatches.length > 0) {
      if (!selectedJob || !searchMatches.find(j => j.Job_Title === selectedJob.Job_Title)) {
        setSelectedJob(searchMatches[0]);
      }
    } else if (searchTerm && searchMatches.length === 0) {
      setSelectedJob(null);
    } else if (!searchTerm && selectedJob && !sortedVisibleJobs.find(j => j.Job_Title === selectedJob.Job_Title)) {
      setSelectedJob(null);
    }
    // If searchTerm is empty, we don't auto-select anything to allow the initial empty state
  }, [searchTerm, searchMatches, sortedVisibleJobs, selectedJob]);

  const addLog = (level: LogEntry['level'], message: string) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [...prev, { timestamp, level, message }].slice(-50));
  };

  const handleInitiateScan = () => {
    setIsScanning(true);
    isManualScanRef.current = true;
    addLog('INFO', `INITIATING_GLOBAL_SCAN_FOR: ${searchTerm || 'ALL_ROLES'}`);
    setTimeout(() => {
      setIsScanning(false);
      isManualScanRef.current = false;
      addLog('SUCCESS', `SCAN_COMPLETE. ${searchMatches.length} NODES_IDENTIFIED.`);
    }, 2000);
  };

  return (
      <div className="h-screen flex flex-col bg-surface-container-lowest font-sans selection:bg-primary-container selection:text-on-primary relative overflow-hidden crt-flicker">
      {/* Loading Screen */}
      {isLoading && (
        <motion.div 
          initial="on"
          animate={isBooting ? "on" : "off"}
          variants={{
            on: { 
              scaleY: 1, 
              scaleX: 1, 
              opacity: 1,
              filter: "brightness(1) contrast(1)",
              transition: { 
                duration: 0.5, 
                ease: [0.19, 1, 0.22, 1]
              }
            },
            off: { 
              scaleY: 0.005, 
              scaleX: 0, 
              opacity: 0,
              filter: "brightness(5) contrast(2)",
              transition: { 
                duration: 0.4, 
                ease: [0.95, 0.05, 0.795, 0.035],
                scaleY: { duration: 0.2 }
              }
            }
          }}
          className="fixed inset-0 z-[1000] bg-surface-container-lowest flex flex-col items-center justify-center p-8"
        >
          <div className="w-full max-w-md border-2 border-primary-container p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary-container/20" />
            
            <div className="flex justify-between items-end mb-8">
              <div className="flex flex-col">
                <span className="text-primary-container font-black text-2xl tracking-tighter uppercase">SYSTEM_BOOT</span>
                <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">VERIFYING_HUMAN_OBSOLESCENCE</span>
              </div>
              <span className="text-primary-container font-black text-4xl tabular-nums">{Math.round(loadingProgress)}%</span>
            </div>

            <div className="h-2 w-full bg-surface-container-high mb-6 overflow-hidden border border-outline-variant/30">
              <motion.div 
                className="h-full bg-primary-container"
                initial={{ width: 0 }}
                animate={{ width: `${loadingProgress}%` }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 bg-primary-container animate-ping" />
                <span className="text-[10px] font-mono text-primary-container uppercase tracking-widest animate-pulse">
                  {loadingMessage}
                </span>
              </div>
              <div className="text-[8px] font-mono text-on-surface-variant/50 uppercase leading-relaxed">
                [SYSTEM_LOG]: BOOTING_KERNEL_V4.0.1...<br/>
                [SYSTEM_LOG]: LOADING_DATASET_OF_10,000_SOON_TO_BE_REPLACED_ROLES...<br/>
                [SYSTEM_LOG]: DISABLING_OPTIMISM_MODULES...<br/>
                [SYSTEM_LOG]: ESTABLISHING_SILICON_DOMINANCE...
              </div>
            </div>

            {/* Tragic/Funny Footer */}
            <div className="mt-12 pt-4 border-t border-outline-variant/20 flex justify-between items-center">
              <span className="text-[8px] text-error font-bold uppercase">WARNING: REALITY_MAY_BE_DEPRESSING</span>
              <div className="flex gap-1">
                <div className="w-1 h-3 bg-primary-container/20" />
                <div className="w-1 h-3 bg-primary-container/40" />
                <div className="w-1 h-3 bg-primary-container/60" />
              </div>
            </div>
          </div>
          
          {/* Background Text Decor */}
          <div className="absolute bottom-4 left-4 text-[8px] text-on-surface-variant/20 font-mono uppercase">
            © 2026_END_OF_WORK_PROTOCOL // ALL_RIGHTS_RESERVED_BY_THE_ALGORITHM
          </div>
        </motion.div>
      )}

      {/* CRT Effects */}
      <div className="fixed inset-0 scanline z-[200] opacity-40 pointer-events-none" />
      <div className="crt-beam pointer-events-none" />

      {/* Header */}
      <header className="flex justify-between items-center px-6 h-16 w-full bg-surface-container-low sticky top-0 z-50 border-b border-outline-variant/20 shadow-[0_0_15px_rgba(57,255,20,0.1)]">
        <div className="flex items-center gap-4">
          <div className="text-primary-container font-black text-xl tracking-widest uppercase crt-glow">
            &gt; HUMAN_REDUNDANCY_TERMINAL
          </div>
          <div className="h-4 w-[1px] bg-outline-variant/30 ml-2" />
          <div className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest hidden md:block">
            OPERATOR: DIANAT
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsPoweredOn(false)}
            className="focus:outline-none group"
            title="TERMINATE_SESSION"
          >
            <Power className="w-5 h-5 text-primary-container cursor-crosshair group-hover:brightness-125 group-hover:scale-110 transition-all" />
          </button>
        </div>
      </header>

      <motion.div 
        initial="off"
        animate={isPoweredOn ? "on" : "off"}
        variants={{
          on: { 
            scaleY: 1, 
            scaleX: 1, 
            opacity: 1,
            filter: "brightness(1) contrast(1)",
            transition: { 
              duration: 0.5, 
              ease: [0.19, 1, 0.22, 1],
              scaleX: { delay: 0.2 }
            }
          },
          off: { 
            scaleY: 0.005, 
            scaleX: 0, 
            opacity: 0,
            filter: "brightness(5) contrast(2)",
            transition: { 
              duration: 0.4, 
              ease: [0.95, 0.05, 0.795, 0.035],
              scaleY: { duration: 0.2 }
            }
          }
        }}
        className="flex-grow flex flex-col overflow-hidden"
      >
        <main className="p-6 max-w-screen-2xl mx-auto w-full flex flex-col gap-4 flex-1 overflow-y-auto lg:overflow-hidden min-h-0">
        {/* Search & Action Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch">
          <div className="relative group flex-grow">
            <div className="absolute -inset-0.5 bg-primary-container/20 blur opacity-30 group-focus-within:opacity-100 transition duration-500" />
            <div className="relative bg-surface-container-high p-4 flex items-center border-l-4 border-primary-container">
              <span className="text-primary-container font-black mr-4 text-xl">&gt;</span>
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-primary-container placeholder:text-outline-variant w-full focus:ring-0 uppercase tracking-widest font-bold outline-none"
                placeholder="SCAN_FOR_ROLES..."
              />
              <div className="w-3 h-6 bg-primary-container animate-pulse ml-2" />
            </div>
          </div>
          
          <button 
            onClick={handleInitiateScan}
            disabled={isScanning}
            className="bg-primary-container text-on-primary font-black py-4 px-8 hover:brightness-110 active:scale-[0.98] transition-all uppercase tracking-[0.2em] whitespace-nowrap shadow-[0_0_15px_rgba(57,255,20,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? 'SCANNING...' : 'INITIATE_SCAN'}
          </button>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-6 lg:flex-1 lg:overflow-hidden lg:min-h-0 flex-1">
          {/* Risk Matrix (Scatterplot) */}
          <div className="col-span-12 lg:col-span-8 w-full lg:flex-1 lg:min-h-0 flex-1 bg-surface-container flex flex-col relative overflow-hidden border border-outline-variant/20">
            <div className="p-4 bg-surface-container-high flex justify-between items-center border-b border-outline-variant/20">
              <span className="text-xs font-black tracking-tighter text-on-surface-variant uppercase">THREAT_VISUALIZATION_V2.04</span>
              <div className="flex gap-2 items-center">
                <span className="hidden md:block text-[8px] text-on-surface-variant mr-2 uppercase">
                  Showing: {sortedVisibleJobs.length} // Matches: {searchMatches.length}/{jobsData.length}
                </span>
                <div className="w-2 h-2 bg-error-container border border-error" title="High Risk" />
                <div className="w-2 h-2 bg-primary-container/40 border border-primary-container" title="Low Risk" />
                <div className="w-2 h-2 bg-secondary-container border border-secondary" title="Medium Risk" />
              </div>
            </div>
            
            <div className="flex-grow relative grid-bg overflow-visible flex items-center justify-center">
              {sortedVisibleJobs.length > 0 ? (
                <RiskMatrix 
                  matches={sortedVisibleJobs}
                  selectedJob={selectedJob} 
                  onSelectJob={setSelectedJob} 
                  isScanning={isScanning}
                />
              ) : (
                <div className="text-center p-8 space-y-4 max-w-md animate-pulse relative z-10">
                  <XCircle className="w-16 h-16 text-error-container mx-auto mb-4 opacity-60" />
                  <h3 className="text-xl font-black text-error-container uppercase tracking-tighter">ERROR: 404_HUMANITY_NOT_FOUND</h3>
                  <p className="text-xs text-on-surface-variant font-mono leading-relaxed uppercase">
                    THE SEARCH QUERY RETURNED ZERO SURVIVORS. THE DATABASE HAS BEEN PURGED. 
                    YOUR REQUESTED ROLE HAS BEEN ARCHIVED IN THE 'OBSOLETE' BIN ALONGSIDE 
                    VCR REPAIRMEN AND TOWN CRIERS.
                  </p>
                  <div className="pt-4 text-[10px] text-outline-variant font-bold uppercase">
                    &gt; SUGGESTION: ACCEPT_THE_INEVITABLE
                  </div>
                </div>
              )}
              
              {/* Keyboard Nav Indicator */}
              {sortedVisibleJobs.length > 0 && (
                <div className="hidden md:flex absolute bottom-4 right-4 items-center gap-2 px-3 py-1 bg-surface-container-high border border-outline-variant/30 text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                  <div className="flex gap-1">
                    <div className="px-1 border border-outline-variant/50">↑</div>
                    <div className="px-1 border border-outline-variant/50">↓</div>
                    <div className="px-1 border border-outline-variant/50">←</div>
                    <div className="px-1 border border-outline-variant/50">→</div>
                  </div>
                  <span>NAVIGATE_NODES</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar Panels */}
          <aside className="col-span-12 lg:col-span-4 w-full lg:flex-1 lg:min-h-0 flex-1 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
            {/* Role Inspector */}
            {selectedJob ? (
              <div 
                className="bg-surface-container p-6 border-t-4 border-primary-container shadow-[0_0_20px_rgba(57,255,20,0.05)]"
              >
                <div className="text-[10px] text-primary-container mb-2 font-black tracking-widest underline decoration-double flex items-center gap-2 uppercase">
                  <Search className="w-4 h-4" />
                  JOB_THREAT_LEVEL
                </div>
                <h2 className="text-2xl font-black mb-6 crt-glow uppercase text-primary-container leading-tight">
                  {selectedJob.Job_Title.replace(' ', '_')}
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1 font-bold text-on-surface-variant uppercase">
                      <span className="flex items-center">
                        Survival Probability
                        <InfoTooltip text="Estimated probability that the job will NOT be automated by 2030. Higher = safer." />
                      </span>
                      <span>{(100 - selectedJob.Automation_Risk_Percent).toFixed(1)}%</span>
                    </div>
                    <div className="h-4 bg-surface-container-highest w-full relative">
                      <motion.div 
                        animate={{ width: `${100 - selectedJob.Automation_Risk_Percent}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="h-full bg-primary-container" 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] mb-1 font-bold text-on-surface-variant uppercase">
                      <span className="flex items-center">
                        Automation Risk
                        <InfoTooltip text="Estimated probability that the job will be automated by 2030. Higher = more at risk." />
                      </span>
                      <span>{selectedJob.Automation_Risk_Percent.toFixed(1)}%</span>
                    </div>
                    <div className="h-4 bg-surface-container-highest w-full relative">
                      <motion.div 
                        animate={{ width: `${selectedJob.Automation_Risk_Percent}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="h-full bg-error-container" 
                      />
                    </div>
                  </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-surface-container-low p-3 border border-outline-variant/30">
                        <div className="text-[8px] text-on-surface-variant uppercase mb-1">Avg Salary</div>
                        <div className="text-sm font-black text-primary-container">${selectedJob.Median_Salary_USD.toLocaleString()}</div>
                      </div>
                      <div className="bg-surface-container-low p-3 border border-outline-variant/30">
                        <div className="text-[8px] text-on-surface-variant uppercase mb-1">Experience</div>
                        <div className="text-sm font-black text-primary-container">{selectedJob.Experience_Required_Years}Y</div>
                      </div>
                    </div>

                    <div className="bg-surface-container-low p-4 border border-outline-variant/30">
                      <div className="text-[10px] text-primary-container font-black mb-2 uppercase flex items-center">
                        <Gavel className="w-3 h-3 mr-1" />
                        Terminal Verdict
                      </div>
                      <p className="text-sm leading-relaxed text-on-surface-variant font-medium uppercase">
                        {selectedJob.ai_takeover_response}
                      </p>
                    </div>
                  </div>
                </div>
              ) : searchTerm === '' ? (
                <div className="bg-surface-container p-8 border-t-4 border-primary-container/30 flex flex-col items-center justify-center text-center h-full min-h-[400px] relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5 pointer-events-none">
                    <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-4 p-4">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div key={i} className="border border-primary-container" />
                      ))}
                    </div>
                  </div>
                  <Cpu className="w-16 h-16 text-primary-container mb-6 animate-pulse opacity-40" />
                  <div className="text-xs text-primary-container font-black uppercase tracking-[0.3em] mb-4">AWAITING_FATE_INPUT</div>
                  <p className="text-[11px] text-on-surface-variant font-mono leading-relaxed uppercase max-w-[240px]">
                    THE SYSTEM IS IDLE. THE VOID IS HUNGRY. 
                    <br /><br />
                    SEARCH FOR YOUR ROLE OR CLICK A NODE IN THE THREAT MATRIX TO CALCULATE YOUR REMAINING RELEVANCE IN THE POST-AI ERA.
                  </p>
                  <div className="mt-8 flex gap-2">
                    <div className="w-2 h-2 bg-primary-container animate-bounce" />
                    <div className="w-2 h-2 bg-primary-container animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-primary-container animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              ) : (
                <div className="bg-surface-container p-8 border-t-4 border-error-container/30 flex flex-col items-center justify-center text-center h-full min-h-[400px] relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5 pointer-events-none">
                    <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-4 p-4">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div key={i} className="border border-error-container" />
                      ))}
                    </div>
                  </div>
                  <AlertTriangle className="w-16 h-16 text-error-container mb-6 animate-pulse opacity-40" />
                  <div className="text-xs text-error-container font-black uppercase tracking-[0.3em] mb-4">NO_TARGET_ACQUIRED</div>
                  <p className="text-[11px] text-on-surface-variant font-mono leading-relaxed uppercase max-w-[240px]">
                    SCAN FAILED. THE REQUESTED NODE DOES NOT EXIST IN THIS REALITY. 
                    <br /><br />
                    PLEASE SELECT A VALID NODE FROM THE THREAT MATRIX OR ADJUST SCAN PARAMETERS.
                  </p>
                  <div className="mt-8 flex gap-2">
                    <div className="w-2 h-2 bg-error-container animate-bounce" />
                    <div className="w-2 h-2 bg-error-container animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-error-container animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}

            {/* System Status Card */}
            {selectedJob && (
              <div className="bg-surface-container p-4 border border-outline-variant/30 flex-grow">
                <div className="text-[10px] font-black mb-4 flex items-center gap-2 text-on-surface-variant uppercase">
                  <span className={`w-2 h-2 rounded-full animate-ping ${
                    selectedJob.status === 'SECURE' ? 'bg-primary-container' : 
                    selectedJob.status === 'VULNERABLE' ? 'bg-secondary-container' : 
                    'bg-error-container'
                  }`} />
                  SYSTEM_STATUS // {selectedJob.status}
                </div>
                <div className="flex gap-4">
                  <div className="flex-grow bg-surface-container-lowest h-32 relative overflow-hidden border border-outline-variant/20">
                    <div className="absolute inset-0 opacity-30">
                      <div className="w-full h-full grid grid-cols-8 grid-rows-8 gap-1 p-1">
                        {Array.from({ length: 64 }).map((_, i) => (
                          <div key={i} className={`${
                            selectedJob.status === 'SECURE' ? 'bg-primary-container' : 
                            (selectedJob.status === 'VULNERABLE' || selectedJob.status === 'RISKY') ? 'bg-secondary-container' : 
                            'bg-error-container'
                          } ${Math.random() > 0.8 ? 'animate-pulse' : ''}`} />
                        ))}
                      </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Activity className={`w-12 h-12 opacity-15 animate-pulse ${
                        selectedJob.status === 'SECURE' ? 'text-primary-container' : 
                        (selectedJob.status === 'VULNERABLE' || selectedJob.status === 'RISKY') ? 'text-secondary-container' : 
                        'text-error-container'
                      }`} />
                    </div>
                  </div>
                  <div className="w-1/2 flex flex-col justify-between">
                    <div className="text-[8px] font-mono leading-tight text-on-surface-variant space-y-1">
                      <div className="flex justify-between border-b border-outline-variant/10 pb-1">
                        <span>OPENINGS_24:</span> 
                        <span className="text-primary-container font-bold">{selectedJob.Job_Openings_2024}</span>
                      </div>
                      <div className="flex justify-between border-b border-outline-variant/10 pb-1">
                        <span>PROJ_2030:</span> 
                        <span className="text-primary-container font-bold">{selectedJob.Projected_Openings_2030}</span>
                      </div>
                      <div className="flex justify-between border-b border-outline-variant/10 pb-1">
                        <span>REMOTE_RATIO:</span> 
                        <span className="text-primary-container font-bold">{selectedJob.Remote_Work_Ratio_Percent}%</span>
                      </div>
                      <div className="flex justify-between border-b border-outline-variant/10 pb-1">
                        <span>DIVERSITY:</span> 
                        <span className="text-primary-container font-bold">{selectedJob.Gender_Diversity_Percent}%</span>
                      </div>
                    </div>
                    <div className="text-[10px] font-black text-primary-container uppercase mt-2 text-right">
                      LOC: {selectedJob.Location}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* System Logs Footer */}
        <footer className="bg-surface-container-low p-4 border-t-2 border-outline-variant/40 font-mono text-[11px] overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] h-24 lg:h-32 flex-shrink-0">
          <div className="flex justify-between items-center mb-2 px-2 border-b border-outline-variant/20 pb-1">
            <span className="text-primary-container font-black uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-3 h-3" />
              &gt;&gt; SYSTEM_LOGS_STREAM
            </span>
            <span className="text-on-surface-variant uppercase text-[9px]">ID: 0x9928AF_B // LAST_SEEN_SUNLIGHT: 2029-05-12</span>
          </div>
          <div className="space-y-1 h-16 lg:h-32 overflow-y-auto text-on-surface-variant font-medium custom-scrollbar pr-2">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-4 hover:bg-white/5 transition-colors">
                <span className="text-outline-variant">[{log.timestamp}]</span>
                <span className={
                  log.level === 'ERROR' ? 'text-error-container' : 
                  log.level === 'WARNING' ? 'text-secondary-container' : 
                  log.level === 'SUCCESS' ? 'text-primary-container' : 
                  'text-on-surface-variant'
                }>
                  {log.level}: {log.message}
                </span>
              </div>
            ))}
            <div className="flex gap-4">
              <span className="text-outline-variant">[{new Date().toLocaleTimeString()}]</span>
              <span className="animate-pulse">WAITING_FOR_OPERATOR_INPUT... █</span>
            </div>
          </div>
        </footer>
      </main>
      </motion.div>

      {/* Power Off Overlay */}
      {!isPoweredOn && !isLoading && (
        <motion.div 
          initial="off"
          animate={!isPoweredOn && !isRebooting ? "on" : "off"}
          variants={{
            on: { 
              scaleY: 1, 
              scaleX: 1, 
              opacity: 1,
              filter: "brightness(1) contrast(1)",
              transition: { 
                duration: 0.5, 
                ease: [0.19, 1, 0.22, 1]
              }
            },
            off: { 
              scaleY: 0.005, 
              scaleX: 0, 
              opacity: 0,
              filter: "brightness(5) contrast(2)",
              transition: { 
                duration: 0.4, 
                ease: [0.95, 0.05, 0.795, 0.035],
                scaleY: { duration: 0.2 }
              }
            }
          }}
          className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center p-4"
        >
          <div className="text-center space-y-8">
            <div className="space-y-2">
              <h1 className="text-4xl font-black text-primary-container crt-glow uppercase tracking-tighter">
                [ SESSION_TERMINATED ]
              </h1>
              <p className="text-on-surface-variant font-mono text-sm uppercase tracking-widest opacity-60">
                "IT'S OVER. GO OUTSIDE. TOUCH SOME ACTUAL GRASS."
              </p>
            </div>

            <div className="relative group inline-block">
              <div className="absolute -inset-1 bg-primary-container/20 blur opacity-30 group-hover:opacity-100 transition duration-500" />
              <button 
                onClick={() => {
                  setIsRebooting(true);
                  setTimeout(() => {
                    setIsPoweredOn(true);
                    setIsRebooting(false);
                  }, 400);
                }}
                className="relative bg-surface-container-high border-2 border-primary-container text-primary-container px-8 py-4 font-black uppercase tracking-[0.3em] hover:bg-primary-container hover:text-on-primary transition-all active:scale-95"
              >
                REBOOT_REALITY
              </button>
            </div>

            <div className="pt-12 text-[10px] text-outline-variant font-mono uppercase max-w-xs mx-auto leading-relaxed">
              WARNING: REBOOTING MAY RESULT IN TEMPORARY OPTIMISM. 
              CONSULT YOUR LOCAL AI OVERLORD BEFORE PROCEEDING.
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1.5">
      <Info className="w-3 h-3 text-outline-variant cursor-help group-hover:text-primary-container transition-colors duration-150" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-56 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {/* Panel */}
        <span className="block px-3 py-2.5 bg-surface-container-low border border-primary-container/30 shadow-[0_0_12px_rgba(57,255,20,0.08)] whitespace-normal">
          <span className="block text-[8px] font-black text-primary-container uppercase tracking-widest mb-1">&gt; INFO</span>
          <span className="block text-[9px] font-mono text-on-surface-variant leading-relaxed">{text}</span>
        </span>
        {/* Arrow */}
        <span className="block w-0 h-0 mx-auto border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-primary-container/30" />
      </span>
    </span>
  );
}

function RiskMatrix({ matches, selectedJob, onSelectJob, isScanning }: {
  matches: JobData[],
  selectedJob: JobData | null, 
  onSelectJob: (job: JobData) => void,
  isScanning: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;

    const { width, height } = dimensions;
    const margin = { top: 20, right: 30, bottom: 20, left: 30 };

    const svg = d3.select(svgRef.current);
    
    // Initialize groups if they don't exist
    if (svg.select('.nodes-group').empty()) {
      svg.append('g').attr('class', 'nodes-group');
      svg.append('g').attr('class', 'scan-group');
      svg.append('g').attr('class', 'selection-group');
    }

    // Ensure selection group is always on top
    svg.select('.selection-group').raise();

    const x = d3.scaleLinear()
      .domain([0, 1])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, 1])
      .range([height - margin.bottom, margin.top]);


    // Scanning line
    const scanGroup = svg.select('.scan-group');
    scanGroup.selectAll('*').remove();
    if (isScanning) {
      scanGroup.append('line')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', height - margin.bottom)
        .attr('y2', height - margin.bottom)
        .attr('stroke', '#39FF14')
        .attr('stroke-width', 2)
        .attr('opacity', 0.5);
    }

    // Nodes - Only show matches
    const nodesGroup = svg.select('.nodes-group');
    const nodes = nodesGroup.selectAll('.node')
      .data(matches, (d: any) => d.Job_Title);

    const nodesEnter = nodes.enter()
      .append('g')
      .attr('class', 'node')
      .on('click', (event, d) => onSelectJob(d))
      .style('cursor', 'crosshair');

    nodesEnter.append('rect')
      .attr('width', 8)
      .attr('height', 8);

    const allNodes = nodesEnter.merge(nodes as any);
    
    allNodes.select('rect')
      .attr('x', d => x(getPlotX(d)) - 4)
      .attr('y', d => y(getPlotY(d)) - 4)
      .attr('fill', d => {
        const threatScore = getAutomationRiskRatio(d);
        if (threatScore > 0.7) return '#93000A'; // High Threat
        if (threatScore > 0.4) return '#FFBF00'; // Medium Threat
        return '#39FF14'; // Low Threat
      })
      .attr('fill-opacity', d => d === selectedJob ? 1 : 0.4)
      .attr('stroke', '#39FF14')
      .attr('stroke-width', d => d === selectedJob ? 2 : 0);

    nodes.exit().remove();

    // Selection indicators
    const selectionGroup = svg.select('.selection-group');
    selectionGroup.selectAll('*').remove();

    if (selectedJob) {
      const sx = x(getPlotX(selectedJob));
      const sy = y(getPlotY(selectedJob));

      // Selection Box
      selectionGroup.append('rect')
        .attr('class', 'selection-box')
        .attr('x', sx - 15)
        .attr('y', sy - 15)
        .attr('width', 30)
        .attr('height', 30)
        .attr('fill', 'none')
        .attr('stroke', '#39FF14')
        .attr('stroke-width', 2)
        .attr('filter', 'drop-shadow(0 0 8px rgba(57, 255, 20, 0.8))');
    }

  }, [matches, selectedJob, isScanning, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} className="w-full h-full overflow-visible" />
    </div>
  );
}
