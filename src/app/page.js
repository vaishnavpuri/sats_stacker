"use client";

import React, { useState, useEffect } from 'react';
import { 
  Zap, TrendingUp, TrendingDown, Activity, Shield, 
  Target, User, Plus, LayoutDashboard, Beaker, 
  Check, Brain, PieChart, ArrowRight, Save, Trash2, XCircle, RefreshCw, ChevronRight, ChevronLeft
} from 'lucide-react';

// --- DESIGN SYSTEM ---
const THEME = {
  bg: "bg-[#0A0A08]",
  card: "bg-[#161618]/80 backdrop-blur-xl border border-white/5 shadow-2xl",
  accent: "text-[#FF5F1F]",
  accentBg: "bg-[#FF5F1F]",
  textMain: "text-white",
  textMuted: "text-white/40",
  input: "bg-white/5 border-none rounded-2xl focus:ring-1 focus:ring-[#FF5F1F] text-white placeholder-white/20 transition-all"
};

// --- UTILITY COMPONENTS ---
const Card = ({ children, className = "" }) => (
  <div className={`${THEME.card} rounded-[32px] p-8 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, active = false }) => (
  <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase transition-all ${
    active 
    ? "bg-[#FF5F1F] text-white shadow-[0_0_15px_rgba(255,95,31,0.4)]" 
    : "bg-white/10 text-white/60"
  }`}>
    {children}
  </span>
);

const StatPill = ({ label, value, highlight = false }) => (
  <div className={`flex flex-col justify-center items-center p-4 rounded-2xl transition-all duration-500 ${
    highlight ? "bg-[#FF5F1F]/10 scale-105" : "bg-white/5"
  }`}>
    <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{label}</span>
    <span className={`text-lg font-bold ${highlight ? "text-[#FF5F1F]" : "text-white"}`}>{value}</span>
  </div>
);

// --- API SERVICES ---

// Custom retry fetch function with exponential backoff
const retryFetch = async (url, options = {}, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i < retries - 1) {
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s, ...
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
};

const fetchMarketData = async () => {
  try {
    // 1. Fear & Greed
    const fngRes = await retryFetch("https://api.alternative.me/fng/?limit=1", { timeout: 5000 });
    const fngData = await fngRes.json();
    
    // 2. CoinGecko
    const cgRes = await retryFetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&sparkline=false&price_change_percentage=7d", { timeout: 5000 });
    const cgData = await cgRes.json();
    const btc = cgData[0];

    return {
      price: btc.current_price,
      fearIndex: parseInt(fngData.data[0].value),
      high24h: btc.high_24h,
      change7d: btc.price_change_percentage_7d_in_currency,
      lastUpdated: new Date(),
      error: null
    };
  } catch (e) {
    console.error("[CONSOLE_ERROR] API Error", e);
    return { error: "Failed to load live data." };
  }
};

// --- LOGIC ENGINE ---
const calculateRecommendation = (market, profile, daysRemaining) => {
  const income = parseFloat(profile.income) || 0;
  const expenses = parseFloat(profile.expenses) || 0;
  const allocation = parseFloat(profile.allocation) || 0;
  const holdings = parseFloat(profile.holdings) || 0;
  const spentSoFar = parseFloat(profile.spentSoFar) || 0;
  const target = parseFloat(profile.target) || 1.0;

  const fear = market.fearIndex ?? 50;
  const price = market.price ?? 90000;
  const high = market.high24h ?? 95000;
  const change7d = market.change7d ?? 0;
  
  const estimatedFairValue = 85000; 
  const plDeviation = ((price - estimatedFairValue) / estimatedFairValue) * 100;
  const drawdown = high > 0 ? ((price - high) / high) * 100 : 0;

  let mFear = 1.0;
  if (fear <= 20) mFear = 1.5; else if (fear <= 40) mFear = 1.2; else if (fear >= 75) mFear = 0.8;

  let mTrend = 1.0;
  if (plDeviation < -20) mTrend = 1.3; else if (plDeviation < 0) mTrend = 1.1; else if (plDeviation > 20) mTrend = 0.9;

  let mDip = 1.0;
  if (drawdown < -10) mDip = 1.25; else if (drawdown < -5) mDip = 1.1;

  // Goal proximity multiplier (Dynamic based on user target)
  const remainingGoal = Math.max(0, target - holdings);
  const progress = holdings / target;
  // Boost if far from goal (<50%), taper if close
  const mGoal = progress < 0.5 ? 1.1 : 1.0;

  let mCool = 1.0;
  if (change7d > 20) mCool = 0.6; else if (change7d > 10) mCool = 0.8; else if (change7d < -10) mCool = 1.1;

  const totalMult = mFear * mTrend * mDip * mGoal * mCool;

  // Budget Logic
  const monthlySurplus = Math.max(0, income - expenses);
  const monthlyBudget = monthlySurplus * allocation;
  const remainingBudget = Math.max(0, monthlyBudget - spentSoFar);
  const minDailyReserve = 10; 

  const baseToday = daysRemaining > 0 ? remainingBudget / daysRemaining : 0;
  const rawSuggested = baseToday * totalMult;

  const futureDays = Math.max(0, daysRemaining - 1);
  const maxTodayByReserve = remainingBudget - (minDailyReserve * futureDays);

  const finalBuy = Math.max(0, Math.min(rawSuggested, maxTodayByReserve, remainingBudget));
  const isCappedByReserve = rawSuggested > maxTodayByReserve;

  return {
    finalBuy,
    rawSuggested,
    maxTodayByReserve,
    isCappedByReserve,
    totalMult,
    multipliers: { mFear, mTrend, mDip, mGoal, mCool },
    stats: { fear, plDeviation, drawdown, change7d, price },
    budget: { monthlyBudget, remainingBudget, daysRemaining, minDailyReserve }
  };
};

// --- VIEWS ---

const LandingPage = ({ onStart }) => (
  <div className="flex flex-col items-center justify-center min-h-[80vh] text-center animate-in fade-in zoom-in duration-700">
    <div className="mb-12 relative group">
      <div className="absolute -inset-12 bg-[#FF5F1F] blur-[100px] opacity-20 group-hover:opacity-30 transition-opacity duration-1000 rounded-full"></div>
      <Zap size={100} className="text-[#FF5F1F] relative z-10 drop-shadow-[0_0_15px_rgba(255,95,31,0.5)]" />
    </div>
    
    <h1 className="text-6xl md:text-8xl font-bold text-white tracking-tighter mb-6">
      Satoshi<span className="text-[#FF5F1F]">Signal</span>
    </h1>
    
    <p className="text-xl md:text-2xl text-white/40 max-w-2xl leading-relaxed mb-12 font-light">
      The Reactive BTC Accumulation Engine.
      <br />
      <span className="text-white/80">Buy fear. Ignore noise. Stack sats.</span>
    </p>

    <button 
      onClick={onStart}
      className="group bg-[#FF5F1F] hover:bg-[#E04F15] text-white text-lg font-semibold px-10 py-5 rounded-full transition-all flex items-center gap-3 shadow-[0_0_40px_rgba(255,95,31,0.3)] hover:shadow-[0_0_60px_rgba(255,95,31,0.5)] hover:scale-105 active:scale-95"
    >
      Initialize Mission <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
    </button>
  </div>
);

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ 
    name: "My Portfolio", 
    income: "", 
    expenses: "", 
    allocation: "0.2",
    holdings: "0",
    target: "1.0"
  });

  const handleNext = () => {
    // Only proceed if income and expenses are set (even if 0)
    if (step === 1 && form.income !== "" && form.expenses !== "") setStep(2);
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
  };

  const handleFinish = () => {
    onComplete({
      id: Date.now(),
      name: form.name,
      income: parseFloat(form.income) || 0,
      expenses: parseFloat(form.expenses) || 0,
      allocation: parseFloat(form.allocation) || 0,
      holdings: parseFloat(form.holdings) || 0,
      target: parseFloat(form.target) || 1.0,
      spentSoFar: 0
    });
  };

  return (
    <div className="max-w-md mx-auto mt-20 animate-in slide-in-from-bottom duration-700">
      <div className="relative group">
        <div className="absolute -inset-4 bg-[#FF5F1F]/10 rounded-[50px] blur-2xl opacity-50 group-hover:opacity-75 transition duration-1000"></div>
        <div className="relative rounded-[40px] p-[1px] bg-gradient-to-br from-white/20 via-white/5 to-transparent shadow-2xl overflow-hidden">
           <div className="relative bg-[#0A0A08] rounded-[39px] p-10 h-full overflow-hidden min-h-[500px] flex flex-col">
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-20 pointer-events-none"></div>
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 blur-[80px] rounded-full pointer-events-none"></div>
              
              <div className="relative z-10 flex-1 flex flex-col">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2 tracking-tight drop-shadow-md">
                    {step === 1 ? "Financial Baseline" : "The Mission"}
                  </h2>
                  <p className="text-white/40 text-sm font-medium">
                    {step === 1 ? "Define your safe monthly budget." : "Set your Bitcoin accumulation goals."}
                  </p>
                </div>
                
                <div className="space-y-8 flex-1">
                  {step === 1 ? (
                    <>
                      <div className="group">
                        <label className="ml-1 text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 block transition-colors group-focus-within:text-[#FF5F1F]">Profile Name</label>
                        <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-[#FF5F1F] shadow-inner transition-all" />
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="group">
                          <label className="ml-1 text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 block transition-colors group-focus-within:text-[#FF5F1F]">Monthly Net Income</label>
                          <input type="number" value={form.income} onChange={e => setForm({...form, income: e.target.value})} placeholder="0.00" className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-center font-mono text-white focus:ring-1 focus:ring-[#FF5F1F] shadow-inner transition-all" />
                        </div>
                        <div className="group">
                          <label className="ml-1 text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 block transition-colors group-focus-within:text-[#FF5F1F]">Monthly Expenses</label>
                          <input type="number" value={form.expenses} onChange={e => setForm({...form, expenses: e.target.value})} placeholder="0.00" className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-center font-mono text-white focus:ring-1 focus:ring-[#FF5F1F] shadow-inner transition-all" />
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-3xl p-6 border border-white/5 backdrop-blur-sm">
                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-4 block flex justify-between">
                            <span>Surplus Allocation</span>
                            <span className="text-[#FF5F1F]">{(parseFloat(form.allocation)*100).toFixed(0)}%</span>
                        </label>
                        <input type="range" min="0.05" max="0.95" step="0.05" value={form.allocation} onChange={e => setForm({...form, allocation: e.target.value})} className="w-full h-1.5 bg-black/50 rounded-full appearance-none cursor-pointer accent-[#FF5F1F]"/>
                        <p className="text-[9px] text-white/20 mt-3 text-center font-medium uppercase tracking-wide">
                          Percentage of monthly surplus (Income - Expenses) to invest.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="group">
                        <label className="ml-1 text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 block transition-colors group-focus-within:text-[#FF5F1F]">Current Holdings (BTC)</label>
                        <input type="number" step="0.001" value={form.holdings} onChange={e => setForm({...form, holdings: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-xl font-mono text-white focus:ring-1 focus:ring-[#FF5F1F] shadow-inner transition-all" placeholder="0.00" />
                      </div>
                      <div className="group">
                        <label className="ml-1 text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 block transition-colors group-focus-within:text-[#FF5F1F]">Target Goal (BTC)</label>
                        <input type="number" step="0.1" value={form.target} onChange={e => setForm({...form, target: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-xl font-mono text-[#FF5F1F] focus:ring-1 focus:ring-[#FF5F1F] shadow-inner transition-all" placeholder="1.00" />
                      </div>
                      <div className="p-4 rounded-2xl bg-[#FF5F1F]/10 border border-[#FF5F1F]/20">
                         <p className="text-xs text-[#FF5F1F]/80 leading-relaxed text-center">
                           &quot;The goal is not to be rich, but to be free.&quot;
                         </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8 flex gap-3">
                  {step === 2 && (
                    <button onClick={handleBack} className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-colors">
                       <ChevronLeft size={20} />
                    </button>
                  )}
                  <button 
                    onClick={step === 1 ? handleNext : handleFinish} 
                    // Changed condition to check if strings are not empty to allow '0' input
                    disabled={step === 1 && (form.income === "" || form.expenses === "")} 
                    className="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-4 rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95 flex items-center justify-center gap-2"
                  >
                    {step === 1 ? "Next Step" : "Launch Dashboard"} {step === 1 && <ChevronRight size={16} />}
                  </button>
                </div>

                <div className="mt-6 flex justify-center gap-2">
                   <div className={`h-1 w-8 rounded-full transition-colors ${step === 1 ? "bg-[#FF5F1F]" : "bg-white/10"}`}></div>
                   <div className={`h-1 w-8 rounded-full transition-colors ${step === 2 ? "bg-[#FF5F1F]" : "bg-white/10"}`}></div>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const DashboardContent = ({ 
    blink, 
    logic, 
    activeProfile, 
    updateProfile, 
    onExecuteBuy,
    aiAnalysis, 
    isAiLoading, 
    fetchGeminiAnalysis 
}) => {
    if (!logic) return null;
    const l = logic;
    
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
          {/* Live Ticker */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <StatPill label="BTC Price" value={`$${l.stats.price.toLocaleString()}`} highlight={blink !== null} />
             <StatPill label="Fear Index" value={l.stats.fear} highlight={l.stats.fear < 25} />
             <StatPill label="Remaining" value={`$${l.budget.remainingBudget.toFixed(0)}`} />
             <StatPill label="Days Left" value={l.budget.daysRemaining} />
          </div>

          {/* Hero Card */}
          <div className="relative">
            <div className="absolute inset-0 bg-[#FF5F1F] blur-[60px] opacity-10 rounded-full"></div>
            <Card className="relative border-[#FF5F1F]/20">
                <div className="space-y-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                           <div className={`w-2 h-2 rounded-full ${l.totalMult > 1 ? "bg-[#FF5F1F] animate-pulse" : "bg-white/20"}`}></div>
                           <span className="text-sm font-bold text-white/40 uppercase tracking-widest">Daily Recommendation</span>
                           
                           <button 
                               onClick={() => fetchGeminiAnalysis(l)}
                               disabled={isAiLoading}
                               className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-[#FF5F1F]/20 border border-white/5 hover:border-[#FF5F1F]/30 transition-all ml-2"
                           >
                               {isAiLoading ? <RefreshCw size={12} className="text-[#FF5F1F] animate-spin"/> : <Brain size={12} className="text-[#FF5F1F] group-hover:scale-110 transition-transform"/>}
                               <span className="text-[10px] font-bold text-[#FF5F1F] uppercase tracking-wide">
                                   {isAiLoading ? "Analyzing..." : "AI Insight"}
                               </span>
                           </button>
                        </div>
                        
                        <div className="flex items-baseline gap-4">
                           <span className="text-7xl md:text-8xl font-bold text-white tracking-tighter drop-shadow-2xl">
                             ${l.finalBuy.toFixed(0)}
                           </span>
                           {l.isCappedByReserve && (
                              <span className="text-[#FF5F1F] text-xs font-bold uppercase border border-[#FF5F1F]/30 px-3 py-1 rounded-full mb-4">
                                Reserve Capped
                              </span>
                           )}
                        </div>
                        
                        <div className="flex gap-2 mt-4">
                            <Badge active={l.multipliers.mFear > 1}>Fear {l.multipliers.mFear.toFixed(1)}x</Badge>
                            <Badge active={l.multipliers.mDip > 1}>Dip {l.multipliers.mDip.toFixed(1)}x</Badge>
                            <Badge active={l.multipliers.mTrend > 1}>Trend {l.multipliers.mTrend.toFixed(1)}x</Badge>
                        </div>
                    </div>

                    {aiAnalysis && (
                        <div className="animate-in fade-in slide-in-from-top-2 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-lg">
                            <div className="flex gap-3">
                                <div className="mt-1 min-w-[20px] p-1.5 bg-[#FF5F1F]/20 rounded-full flex items-center justify-center">
                                    <Brain size={14} className="text-[#FF5F1F]" />
                                </div>
                                <p className="text-sm text-white/90 leading-relaxed font-medium">{aiAnalysis}</p>
                            </div>
                        </div>
                    )}
                </div>
            </Card>
          </div>

          {/* Execution & Tracker */}
          <Card className="py-6 px-8 flex flex-col md:flex-row gap-8 items-center justify-between bg-white/5 border-white/5">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-white/5 rounded-full"><PieChart className="text-white/40" size={20}/></div>
                 <div>
                    <div className="text-sm font-bold text-white">Execution Tracker</div>
                    <div className="text-xs text-white/40">
                       Spent: <span className="text-white">${activeProfile.spentSoFar.toFixed(0)}</span> • Holdings: <span className="text-[#FF5F1F]">{activeProfile.holdings.toFixed(4)} BTC</span>
                    </div>
                 </div>
              </div>
              
              {/* NEW: EXECUTION BUTTON */}
              <div className="w-full md:w-auto">
                 <button 
                   onClick={() => onExecuteBuy(l.finalBuy, l.stats.price)}
                   disabled={l.finalBuy <= 0}
                   className="w-full md:w-auto px-8 py-4 bg-[#FF5F1F] hover:bg-[#E04F15] text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-900/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   <Check size={20} /> Confirm Buy (${l.finalBuy.toFixed(0)})
                 </button>
                 <p className="text-[10px] text-white/20 text-center mt-2">Updates budget & holdings instantly</p>
              </div>
          </Card>
      </div>
    );
};

const ProfileManager = ({ profiles, activeProfile, updateProfile, setProfiles, setActiveProfileId, onDeleteProfile, onSave }) => {
   const [newName, setNewName] = useState("");
   
   const addProfile = () => {
     if (!newName) return;
     setProfiles([...profiles, { id: Date.now(), name: newName, income: 5000, expenses: 3000, allocation: 0.2, holdings: 0, target: 1.0, spentSoFar: 0 }]);
     setNewName("");
   };

   return (
       <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom duration-500">
       <Card>
           <div className="flex justify-between items-center mb-8">
               <h2 className="text-2xl font-bold text-white">Manage Profiles</h2>
               <div className="flex gap-2">
                   <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New Profile" className={`${THEME.input} py-2 px-4 text-sm w-40`}/>
                   <button onClick={addProfile} className="bg-[#FF5F1F] w-10 h-10 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform"><Plus size={20}/></button>
               </div>
           </div>

           <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
               {profiles.map(p => (
                   <div 
                     key={p.id} 
                     onClick={()=>setActiveProfileId(p.id)} 
                     className={`flex-shrink-0 w-48 p-5 rounded-[24px] border cursor-pointer transition-all duration-300 ${
                        p.id === activeProfile.id 
                        ? "bg-[#FF5F1F] border-[#FF5F1F] shadow-lg scale-100" 
                        : "bg-white/5 border-white/5 hover:bg-white/10 scale-95 opacity-60 hover:opacity-100"
                     }`}
                   >
                       <div className={`font-bold truncate mb-1 ${p.id === activeProfile.id ? "text-white" : "text-white"}`}>{p.name}</div>
                       <div className={`text-xs ${p.id === activeProfile.id ? "text-white/80" : "text-white/40"}`}>Spent: ${p.spentSoFar}</div>
                   </div>
               ))}
           </div>
           
           <div className="bg-white/5 rounded-[24px] p-8 border border-white/5">
             <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6">Settings for {activeProfile.name}</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <div className="group">
                    <label className="ml-2 text-xs font-bold text-white/40 uppercase mb-2 block group-focus-within:text-[#FF5F1F]">Income</label>
                    <input type="number" value={activeProfile.income} onChange={e=>updateProfile('income', e.target.value)} className={`${THEME.input} w-full p-4`}/>
                 </div>
                 <div className="group">
                    <label className="ml-2 text-xs font-bold text-white/40 uppercase mb-2 block group-focus-within:text-[#FF5F1F]">Expenses</label>
                    <input type="number" value={activeProfile.expenses} onChange={e=>updateProfile('expenses', e.target.value)} className={`${THEME.input} w-full p-4`}/>
                 </div>
                 <div className="group">
                    <label className="ml-2 text-xs font-bold text-white/40 uppercase mb-2 block group-focus-within:text-[#FF5F1F]">Holdings (BTC)</label>
                    <input type="number" step="0.001" value={activeProfile.holdings} onChange={e=>updateProfile('holdings', e.target.value)} className={`${THEME.input} w-full p-4`}/>
                 </div>
                 <div className="group">
                    <label className="ml-2 text-xs font-bold text-white/40 uppercase mb-2 block group-focus-within:text-[#FF5F1F]">Target Goal (BTC)</label>
                    <input type="number" step="0.1" value={activeProfile.target || 1.0} onChange={e=>updateProfile('target', e.target.value)} className={`${THEME.input} w-full p-4`}/>
                 </div>
             </div>
             
             <div className="group mb-8">
                <label className="ml-2 text-xs font-bold text-white/40 uppercase mb-2 block group-focus-within:text-[#FF5F1F]">Surplus Allocation ({Number(activeProfile.allocation)*100}%)</label>
                <input type="number" step="0.1" value={activeProfile.allocation} onChange={e=>updateProfile('allocation', e.target.value)} className={`${THEME.input} w-full p-4`}/>
             </div>
             
             <div className="flex gap-4">
                <button onClick={() => onDeleteProfile(activeProfile.id)} className="flex-1 bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-all">
                   <Trash2 size={18} /> Delete
                </button>
                <button onClick={onSave} className="flex-[2] bg-white text-black hover:bg-gray-200 py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-lg">
                   <Save size={18} /> Save Changes
                </button>
             </div>
           </div>
       </Card>
       </div>
   );
};

const SimulationLab = ({ activeProfile }) => {
    const [simState, setSimState] = useState({ fearIndex: 25, priceVsTrend: -10, drawdown: -15, recentPump: 5 });

    const marketOverride = {
      fearIndex: simState.fearIndex,
      price: 92000,
      high24h: 92000 * (1 + Math.abs(simState.drawdown/100)),
      change7d: simState.recentPump
    };
    const logic = calculateRecommendation(marketOverride, activeProfile, 30);
    
    const simulatedBuy = logic.finalBuy;
    const monthlyAccumulation = simulatedBuy * 30; 
    const satsPerMonth = (monthlyAccumulation / 92000) * 100000000;
    const holdings = parseFloat(activeProfile.holdings) || 0;
    const target = parseFloat(activeProfile.target) || 1.0;
    const btcPerMonth = monthlyAccumulation / 92000;
    const monthsToGoal = (target - holdings) / btcPerMonth;
    const yearsToGoal = monthsToGoal / 12;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom duration-700">
        <div className="lg:col-span-4">
          <Card className="h-full">
            <h3 className="flex items-center gap-3 font-bold text-white mb-8 text-xl">
              <Beaker className="text-[#FF5F1F]" /> Lab Conditions
            </h3>
            <div className="space-y-8">
                {[
                    { label: "Fear Index", key: "fearIndex", min: 0, max: 100, val: simState.fearIndex },
                    { label: "Trend Deviation", key: "priceVsTrend", min: -50, max: 50, val: simState.priceVsTrend },
                    { label: "Drawdown %", key: "drawdown", min: -50, max: 0, val: simState.drawdown },
                    { label: "Recent Pump %", key: "recentPump", min: -20, max: 50, val: simState.recentPump }
                ].map((control) => (
                    <div key={control.key}>
                        <div className="flex justify-between text-xs font-bold uppercase text-white/40 mb-3">
                            <span>{control.label}</span>
                            <span className="text-white">{control.val}</span>
                        </div>
                        <input 
                           type="range" min={control.min} max={control.max} 
                           value={control.val} 
                           onChange={(e) => setSimState({...simState, [control.key]: Number(e.target.value)})} 
                           className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FF5F1F]" 
                        />
                    </div>
                ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Card className="h-full flex flex-col justify-between bg-gradient-to-br from-[#161618] to-black border-[#FF5F1F]/20">
             <div>
                <h2 className="text-xs font-bold text-[#FF5F1F] uppercase tracking-widest mb-6">Projected Results</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                  <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                     <div className="text-5xl font-bold text-white mb-2 tracking-tighter">${simulatedBuy.toFixed(0)}</div>
                     <div className="text-sm text-white/40 font-medium">Daily Buy Target</div>
                  </div>
                  <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                     <div className="text-5xl font-bold text-white mb-2 tracking-tighter">{Math.floor(satsPerMonth/1000).toLocaleString()}k</div>
                     <div className="text-sm text-white/40 font-medium">Sats / Month</div>
                  </div>
                </div>
             </div>

             <div className="relative p-8 bg-[#FF5F1F] rounded-[32px] overflow-hidden shadow-[0_0_40px_rgba(255,95,31,0.2)]">
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <div className="text-white/80 text-sm font-medium mb-1">Time to {target} Bitcoin</div>
                        <div className="text-4xl font-bold text-white">
                            {yearsToGoal < 0 ? "Goal Met!" : yearsToGoal > 50 ? "> 50 Years" : `${yearsToGoal.toFixed(1)} Years`}
                        </div>
                    </div>
                    <div className="h-12 w-12 bg-white text-[#FF5F1F] rounded-full flex items-center justify-center font-bold">
                        <Target size={20} />
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/4"></div>
             </div>
          </Card>
        </div>
      </div>
    );
};

// --- MAIN COMPONENT ---

export default function SatoshiSignal() {
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [view, setView] = useState('landing');
  
  const [marketData, setMarketData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [blink, setBlink] = useState(null);
  
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- LOAD SAVED PROFILES ---
  useEffect(() => {
    const saved = localStorage.getItem('satoshi_profiles');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) {
        setProfiles(parsed);
        setActiveProfileId(parsed[0].id);
      }
    }
  }, []);

  // --- SAVE PROFILES ---
  const saveProfilesToStorage = (currentProfiles) => {
    localStorage.setItem('satoshi_profiles', JSON.stringify(currentProfiles));
  };

  // --- DATA FETCHING ---
  useEffect(() => {
    loadMarketData();
    const interval = setInterval(async () => {
        const newData = await fetchMarketData();
        if (!newData.error) {
            setMarketData(prev => {
                if (prev && newData.price > prev.price) setBlink('green');
                else if (prev && newData.price < prev.price) setBlink('red');
                return newData;
            });
            setTimeout(() => setBlink(null), 2000);
        }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadMarketData = async () => {
    setIsLoading(true);
    const data = await fetchMarketData();
    if (data.error) {
      setMarketData({ price: 92000, fearIndex: 45, high24h: 94000, change7d: -2.5, lastUpdated: new Date(), isMock: true });
    } else {
      setMarketData(data);
    }
    setIsLoading(false);
  };

  // --- ACTIONS ---
  const handleStart = () => {
    if (profiles.length > 0) {
      setView('dashboard');
    } else {
      setView('onboarding');
    }
  };

  const handleCreateProfile = (newProfile) => {
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    setActiveProfileId(newProfile.id);
    saveProfilesToStorage(updated);
    setView('dashboard');
  };

  const updateProfile = (field, value) => {
      setProfiles(profiles.map(p => p.id === activeProfileId ? { ...p, [field]: value } : p));
  };
  
  // NEW: Execution Handler
  const handleExecuteBuy = (amount, currentPrice) => {
      if (!activeProfileId || amount <= 0) return;
      
      // Calculate new stats
      const activeProfile = profiles.find(p => p.id === activeProfileId);
      if (!activeProfile) return;

      const newSpent = (parseFloat(activeProfile.spentSoFar) || 0) + amount;
      const btcBought = amount / currentPrice;
      const newHoldings = (parseFloat(activeProfile.holdings) || 0) + btcBought;
      
      // Update state
      const updatedProfiles = profiles.map(p => 
          p.id === activeProfileId ? { ...p, spentSoFar: newSpent, holdings: newHoldings } : p
      );
      
      setProfiles(updatedProfiles);
      saveProfilesToStorage(updatedProfiles);
      
      // Optional: Show brief success feedback or animation here if desired
  };

  const handleDeleteProfile = (id) => {
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    saveProfilesToStorage(updated);
    
    if (updated.length === 0) {
      setView('onboarding');
    } else if (id === activeProfileId) {
      setActiveProfileId(updated[0].id);
    }
  };

  const handleSaveProfile = () => {
    saveProfilesToStorage(profiles);
    setView('dashboard');
  };

  const fetchGeminiAnalysis = async (logic) => {
    setIsAiLoading(true);
    const prompt = `
      You are a strategic Bitcoin investment advisor.
      
      Current Status:
      - Recommended Buy: $${logic.finalBuy.toFixed(0)}
      - Market Sentiment: Fear Level ${logic.stats.fear} (0=Panic, 100=Greed)
      - Multiplier: ${logic.totalMult.toFixed(2)}x
      - Budget Safety: ${logic.isCappedByReserve ? "CAPPED" : "OK"}

      Write a concise insight (max 40 words).
      - First, explain "Why" (e.g. "Market panic offers discount").
      - Second, give a command (e.g. "Accumulate aggressively").
    `;
    try {
      // Call the local API route instead of external API directly
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      
      if (!response.ok) throw new Error("Failed to fetch analysis");
      
      const data = await response.json();
      if (data.error) {
        setAiAnalysis("AI currently unavailable (Config Error).");
      } else {
        setAiAnalysis(data.text);
      }
    } catch (e) {
      console.error("AI Error", e);
      setAiAnalysis("AI Analysis unavailable.");
    }
    setIsAiLoading(false);
  };

  // --- HELPERS ---
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - today.getDate() + 1; 
  const dashboardLogic = (marketData && activeProfile) ? calculateRecommendation(marketData, activeProfile, daysRemaining) : null;

  return (
    <div className={`min-h-screen ${THEME.bg} text-white font-sans p-4 md:p-8 overflow-x-hidden selection:bg-[#FF5F1F] selection:text-white`}>
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* NAV */}
        {view !== 'landing' && (
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pb-6">
             <div className="flex items-center gap-3 cursor-pointer group" onClick={()=>setView('landing')}>
                 <div className="bg-[#FF5F1F] p-2 rounded-xl group-hover:scale-110 transition-transform">
                   <Zap className="text-white fill-white" size={20}/>
                 </div>
                 <div>
                    <h1 className="text-xl font-bold tracking-tight">SatoshiSignal</h1>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{activeProfile?.name || "Setup"}</p>
                 </div>
             </div>
             <div className="bg-white/5 p-1.5 rounded-full flex gap-1 border border-white/5 backdrop-blur-md">
                 {[
                   { id: 'dashboard', label: 'Live', icon: LayoutDashboard },
                   { id: 'simulation', label: 'Lab', icon: Beaker },
                   { id: 'profiles', label: 'Profile', icon: User }
                 ].map((tab) => (
                   <button 
                     key={tab.id}
                     onClick={()=>setView(tab.id)} 
                     className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all duration-300 ${
                       view===tab.id 
                       ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)]" 
                       : "text-white/60 hover:text-white hover:bg-white/5"
                     }`}
                   >
                     <tab.icon size={14} /> {tab.label}
                   </button>
                 ))}
             </div>
          </div>
        )}
        
        {/* VIEWS */}
        {view === 'landing' && <LandingPage onStart={handleStart} />}
        {view === 'onboarding' && <Onboarding onComplete={handleCreateProfile} />}
        
        {view === 'dashboard' && (isLoading ? <div className="text-center text-white/20 p-20 animate-pulse text-sm font-mono uppercase tracking-widest">Connecting to Global Markets...</div> : 
            <DashboardContent 
                blink={blink}
                logic={dashboardLogic}
                activeProfile={activeProfile}
                updateProfile={updateProfile}
                onExecuteBuy={handleExecuteBuy}
                aiAnalysis={aiAnalysis}
                isAiLoading={isAiLoading}
                fetchGeminiAnalysis={fetchGeminiAnalysis}
            />
        )}
        
        {view === 'simulation' && activeProfile && <SimulationLab activeProfile={activeProfile} />}
        
        {view === 'profiles' && activeProfile &&
            <ProfileManager 
                profiles={profiles}
                activeProfile={activeProfile}
                updateProfile={updateProfile}
                setProfiles={setProfiles}
                setActiveProfileId={setActiveProfileId}
                onDeleteProfile={handleDeleteProfile}
                onSave={handleSaveProfile}
            />
        }
      </div>
    </div>
  );
}
