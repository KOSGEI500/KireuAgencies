import React, { useState } from "react";
import { Property, AdminSession, TenantSession } from "../types";
import { 
  Building2, Phone, Key, ShieldAlert, LogIn, User, Smartphone, 
  ArrowRight, ShieldCheck, HelpCircle, Info, Sparkles, LogOut, ArrowLeft,
  Building, CheckCircle2, ChevronRight, Moon, Star, Mail
} from "lucide-react";
import { auth, googleProvider } from "../firebase";
import { signInWithPopup } from "firebase/auth";

interface AuthScreensProps {
  properties: Property[];
  onAdminLogin: (session: AdminSession) => void;
  onTenantLogin: (session: TenantSession, tenantData: any) => void;
}

export default function AuthScreens({ properties, onAdminLogin, onTenantLogin }: AuthScreensProps) {
  const [currentPage, setCurrentPage] = useState<"landing" | "login">("landing");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Form Inputs
  const [tenantUsername, setTenantUsername] = useState("");
  const [tenantPin, setTenantPin] = useState("");
  const [caretakerPasskey, setCaretakerPasskey] = useState("");

  const handleTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantUsername || !tenantPin) {
      setError("Please fill in both your registered Username/Phone and Apartment PIN.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/tenant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: tenantUsername.trim(),
          room_number: tenantPin.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "User profile not available. Check your credentials.");
      }

      onTenantLogin(data.session, data.tenant);
    } catch (err: any) {
      setError(err.message || "User profile not available. Please verify registered Username/Phone and PIN.");
    } finally {
      setLoading(false);
    }
  };

  const handleCaretakerPasskeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caretakerPasskey) {
      setError("Please enter your registered secure passkey.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check if it's the Super-Admin legacy PIN "1234"
      const isSuper = caretakerPasskey.trim() === "1234";

      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: isSuper ? "Super-Admin" : "Caretaker",
          pin: caretakerPasskey.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Incorrect passkey. Please verify your staff security pin.");
      }

      onAdminLogin(data.session);
    } catch (err: any) {
      setError(err.message || "Credential authentication failed. This passkey is not registered.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      if (!user.email) {
        throw new Error("Unable to retrieve email info from your Google Account.");
      }

      const response = await fetch("/api/auth/admin/google-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: user.displayName,
          uid: user.uid
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "User profile not available. Google email access denied.");
      }

      onAdminLogin(data.session);
    } catch (err: any) {
      console.error("Firebase/Google Admin Auth Error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completing authentication.");
      } else {
        setError(err.message || "Access Denied: Only authorized directors are granted Google sign-in rights.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-slate-950 text-slate-100 flex flex-col justify-between transition-all duration-300 relative font-sans ${
      currentPage === "landing" ? "h-screen max-h-screen overflow-hidden" : "min-h-screen overflow-x-hidden"
    }`}>
      
      {/* High-quality blurry dark background image for both views */}
      <div 
        className="absolute inset-0 bg-cover bg-center scale-105 pointer-events-none transition-all duration-700 z-0"
        style={{
          backgroundImage: `url("https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80")`,
          filter: "blur(14px) brightness(0.4)"
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/85 to-slate-950/90 z-0 pointer-events-none" />

      {/* HEADER BAR */}
      <header className="w-full py-4 px-6 sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-slate-950/20 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center shadow-lg">
            <Building className="w-5.5 h-5.5" />
          </div>
          <div className="text-left">
            <h1 className="text-sm font-bold tracking-tight font-display text-white">KIREU AGENCIES</h1>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Smart Estates Kenya</p>
          </div>
        </div>

        {currentPage === "landing" ? (
          <button 
            onClick={() => {
              setCurrentPage("login");
              setError(null);
            }}
            className="px-4 py-2 text-xs font-bold tracking-wider uppercase bg-white/10 hover:bg-white/20 active:scale-95 text-white border border-white/25 rounded-xl backdrop-blur-md transition-all shadow-md cursor-pointer flex items-center gap-1.5 hover:border-white/40"
          >
            <LogIn className="w-3.5 h-3.5 text-blue-300" />
            <span>Login</span>
          </button>
        ) : (
          <button 
            onClick={() => {
              setCurrentPage("landing");
              setError(null);
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-white hover:text-white/85 font-bold bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-blue-300" />
            <span>Go Back</span>
          </button>
        )}
      </header>

      {/* LANDING PAGE STEP VIEW */}
      {currentPage === "landing" ? (
        <main className="flex-grow flex flex-col items-center justify-center text-center p-4 sm:p-8 lg:p-12 relative z-10 max-w-4xl w-full mx-auto space-y-8 animate-in fade-in duration-700">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-slate-200 font-mono text-[9px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-inner">
              <Sparkles className="w-3.5 h-3.5 text-blue-300 animate-pulse" />
              Verified Luxury Living
            </div>

            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold font-display text-white tracking-wide uppercase leading-tight drop-shadow-md">
              Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-indigo-200 to-white">Kireu Agencies</span>
            </h2>

            <p className="text-slate-300/90 text-sm sm:text-base md:text-lg lg:text-xl font-light tracking-widest max-w-2xl mx-auto leading-relaxed drop-shadow-sm uppercase">
              Choose your apartment today
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-lg mx-auto">
            <button 
              onClick={() => setShowTerms(true)}
              className="w-full sm:w-1/2 px-6 py-3.5 bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white border border-white/20 rounded-2xl backdrop-blur-md transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 hover:border-white/40 font-bold uppercase text-[10px] tracking-wider"
            >
              <Info className="w-4 h-4 text-blue-300" />
              <span>Terms &amp; Conditions</span>
            </button>
            <button 
              onClick={() => setShowPrivacy(true)}
              className="w-full sm:w-1/2 px-6 py-3.5 bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white border border-white/20 rounded-2xl backdrop-blur-md transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 hover:border-white/40 font-bold uppercase text-[10px] tracking-wider"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span>Privacy Policy</span>
            </button>
          </div>
        </main>
      ) : (
        /* REDESIGNED UNIFIED LOGIN CHANNELS PAGE */
        <main className="flex-grow flex items-center justify-center p-4 relative z-10 w-full">
          <div className="w-full max-w-2xl bg-slate-900/75 backdrop-blur-lg border border-white/10 shadow-2xl rounded-3xl overflow-hidden transition-all duration-300">
            
            {/* Containing forms */}
            <div className="p-6 sm:p-8 flex flex-col justify-center text-left">
              
              {/* BRAND DESK HEAD */}
              <div className="text-left mb-6 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-extrabold font-display text-white">
                    Sign In to Kireu Agencies
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-350 mt-0.5">
                    Provide your credentials below to access your portal.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCurrentPage("landing");
                    setError(null);
                  }}
                  className="p-1 px-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {/* ALERTS PANEL */}
              {error && (
                <div id="auth-error" className="mb-6 p-4 bg-rose-950/40 border border-rose-500/35 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs text-left animate-in fade-in duration-300">
                  <ShieldAlert className="w-4.5 h-4.5 shrink-0 text-rose-450 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold">Access Denied:</span>
                    <p className="font-semibold text-[11px] leading-relaxed">{error}</p>
                  </div>
                </div>
              )}

              {/* THREE SILENT CHANNELS STACKED BEAUTIFULLY */}
              <div className="space-y-6">
                
                {/* CHANNEL 1: TENANTS INTERACTIVE INPUT FORM */}
                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl text-left space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Tenant Portal Entry</h4>
                    </div>
                  </div>

                  <form onSubmit={handleTenantSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Username or Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-455" />
                        <input
                          type="text"
                          placeholder="e.g. 0712345678"
                          value={tenantUsername}
                          onChange={(e) => setTenantUsername(e.target.value)}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 text-white placeholder-slate-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Room PIN or Member Name</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-455" />
                        <input
                          type="password"
                          placeholder="e.g. 102A"
                          value={tenantPin}
                          onChange={(e) => setTenantPin(e.target.value)}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-blue-500 text-white placeholder-slate-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2 pt-1">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[11px] uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <span>{loading ? "Decrypting..." : "Login to Tenant Hub"}</span>
                        <LogIn className="w-3.5 h-3.5 text-emerald-300" />
                      </button>
                    </div>
                  </form>
                </div>

                {/* HORIZONTAL DECORATIVE SPLIT */}
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-3.5 text-[9px] text-slate-400 font-extrabold uppercase tracking-widest font-mono">
                    Other Logins
                  </span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                {/* CHANNEL 2 & 3 PANEL GRID FOR PASSKEY & GOOGLE AUTH */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                  
                  {/* CHANNEL 2: ALPHANUMERIC PASSKEY OPTION FOR STAFF */}
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6.5 h-6.5 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                          <Key className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">Passkey</h4>
                        </div>
                      </div>

                      <form onSubmit={handleCaretakerPasskeySubmit} className="space-y-2">
                        <input
                          type="password"
                          placeholder="e.g. CX49AB"
                          value={caretakerPasskey}
                          onChange={(e) => setCaretakerPasskey(e.target.value)}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-2 text-xs font-extrabold tracking-widest uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white font-mono text-center placeholder-slate-500"
                          required
                        />
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] uppercase rounded-xl transition-all cursor-pointer shadow-xs"
                        >
                          Verify Passkey
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* CHANNEL 3: GOOGLE SIGN-IN GOOGLE LOGIN HANDLERS */}
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6.5 h-6.5 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                          <Mail className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">Sign in with Google</h4>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleGoogleAdminLogin}
                        disabled={loading}
                        className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-bold rounded-xl text-[11px] transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            </div>

          </div>
        </main>
      )}

      {/* FOOTER METRICS INFO */}
      <footer className="py-4 border-t border-white/5 bg-slate-950/40 text-slate-400 text-[10px] font-semibold flex flex-col sm:flex-row items-center justify-between px-6 gap-2 relative z-10">
        <div className="flex items-center gap-1">
          <Smartphone className="w-3.5 h-3.5 text-blue-500" />
          <span>Optimized for fast mobile loading on smartphone browsers</span>
        </div>
        <div>
          <span>© 2026 Kireu Agencies Ltd. All Rights Reserved.</span>
        </div>
      </footer>

      {/* TERMS & CONDITIONS MODAL */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-350">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 relative max-h-[85vh] overflow-y-auto shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Info className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white tracking-widest uppercase font-display">Terms &amp; Conditions</h3>
              </div>
              <button 
                onClick={() => setShowTerms(false)}
                className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-[11px] text-slate-350 font-semibold leading-relaxed">
              <p className="border-l-2 border-blue-500 pl-3 italic text-slate-400">
                Welcome to Kireu Agencies. By using this digital platform, you agree to comply with and be bound by the following formal administrative terms.
              </p>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-blue-400">1. Resident &amp; Tenant Portals</h4>
                <p>
                  Tenants may only access their personal payment history, log custom maintenance requests, or update profile info. Dedicated apartment room pins must remain secure and not be delegated to third party handlers.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-blue-400">2. Staff Operations</h4>
                <p>
                  Designated site caretakers or staff receive PIN passkeys that restrict administration to their assigned property boundaries. Log deletions or profile registers require Super-Admin Director elevation.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-blue-400">3. Transaction Audits</h4>
                <p>
                  All tenant statements, active M-Pesa bill alerts, and maintenance logs are logged with digital ledger markers. No direct banking PINs or external phone codes are captured or stored on site.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-blue-400">4. Governing Law</h4>
                <p>
                  These administrative terms conform entirely with the laws of the Republic of Kenya. Brute force credential testing or unauthorized spoofing results in system restrictions.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => setShowTerms(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-md"
              >
                I Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRIVACY POLICY MODAL */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-350">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 relative max-h-[85vh] overflow-y-auto shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-widest uppercase font-display">Privacy Policy</h3>
              </div>
              <button 
                onClick={() => setShowPrivacy(false)}
                className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-[11px] text-slate-350 font-semibold leading-relaxed">
              <p className="border-l-2 border-emerald-500 pl-3 italic text-slate-400">
                Your digital security is our highest priority. This policy details how Kireu Agencies collects, manages, and secures your platform credentials.
              </p>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-emerald-400">1. Private Records Collected</h4>
                <p>
                  We record only minimum registration criteria (names, verified mobile digits, electronic mail tags) to link tenant and caretaker accounts to their active rooms and premises tables.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-emerald-400">2. Google Verification Handlers</h4>
                <p>
                  Credential verification relies on secure, authenticated login flows using Google Identity services, completely isolating database structures from general public observation.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-emerald-400">3. Database Isolation</h4>
                <p>
                  Tenant logs, bills ledger, and caretaker assignments remain cryptographically partitioned inside Firestore datasets, strictly disabled for any external scrapers or marketing queries.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-200 uppercase text-[9px] tracking-wider text-emerald-400">4. Right of Deletion</h4>
                <p>
                  In accordance with regulatory criteria, tenants are entitled to request history correction or complete registry erasure by coordinate logs directly with the Estate Office.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => setShowPrivacy(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-md"
              >
                Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
