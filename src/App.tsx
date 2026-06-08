import React, { useState, useEffect } from "react";
import { Property, AdminSession, TenantSession, Tenant } from "./types";
import AuthScreens from "./components/AuthScreens";
import TenantPortal from "./components/TenantPortal";
import AdminPortal from "./components/AdminPortal";
import { Building2, Sparkles, LogIn, Settings, Eye, Moon, Sun, X, Check, EyeOff, Sliders, Type } from "lucide-react";

export default function App() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [tenantSession, setTenantSession] = useState<TenantSession | null>(null);
  const [tenantProfile, setTenantProfile] = useState<Tenant | null>(null);
  const [ready, setReady] = useState(false);
  const [fetchError, setFetchError] = useState<boolean>(false);

  // Accessibility & Preferences State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState<"sm" | "normal" | "lg" | "xl">("normal");
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexicFont, setDyslexicFont] = useState(false);

  useEffect(() => {
    fetchProperties();
    restoreSessions();
    restoreAccessibility();

    // Prevent right click (context menu) of the website
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Prevent selecting words/text on the website
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("selectstart", handleSelectStart);

    // Apply select-none to document element as a fallback reinforcement
    const docStyle = document.documentElement.style as any;
    docStyle.userSelect = "none";
    docStyle.webkitUserSelect = "none";
    docStyle.MozUserSelect = "none";
    docStyle.msUserSelect = "none";

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("selectstart", handleSelectStart);
    };
  }, []);

  const fetchProperties = async (retryCount = 0) => {
    try {
      setFetchError(false);
      const response = await fetch("/api/properties");
      if (response.ok) {
        const list = await response.json();
        setProperties(list);
      } else {
        throw new Error(`Server returned status ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`Failed to load estate properties list (try ${retryCount + 1}/4):`, err);
      if (retryCount < 3) {
        setTimeout(() => {
          fetchProperties(retryCount + 1);
        }, 1500);
      } else {
        setFetchError(true);
      }
    } finally {
      if (retryCount === 3 || !fetchError) {
        setReady(true);
      }
    }
  };

  const restoreSessions = () => {
    try {
      const cachedAdmin = localStorage.getItem("prop_admin_session");
      if (cachedAdmin) {
        setAdminSession(JSON.parse(cachedAdmin));
      }

      const cachedTenantSession = localStorage.getItem("prop_tenant_session");
      const cachedTenantProfile = localStorage.getItem("prop_tenant_profile");
      if (cachedTenantSession && cachedTenantProfile) {
        setTenantSession(JSON.parse(cachedTenantSession));
        setTenantProfile(JSON.parse(cachedTenantProfile));
      }
    } catch (err) {
      console.error("Session restoration error:", err);
    }
  };

  const restoreAccessibility = () => {
    try {
      const savedFontSize = localStorage.getItem("app_pref_font_size");
      if (savedFontSize) setFontSize(savedFontSize as any);

      const savedTheme = localStorage.getItem("app_pref_theme_mode");
      if (savedTheme) setThemeMode(savedTheme as any);

      const savedContrast = localStorage.getItem("app_pref_high_contrast");
      if (savedContrast) setHighContrast(savedContrast === "true");

      const savedDyslexic = localStorage.getItem("app_pref_dyslexic");
      if (savedDyslexic) setDyslexicFont(savedDyslexic === "true");
    } catch (err) {
      console.error("Error loaded accessibility stats:", err);
    }
  };

  const updateFontSizeSetting = (sz: "sm" | "normal" | "lg" | "xl") => {
    setFontSize(sz);
    localStorage.setItem("app_pref_font_size", sz);
  };

  const updateThemeSetting = (th: "dark" | "light") => {
    setThemeMode(th);
    localStorage.setItem("app_pref_theme_mode", th);
  };

  const toggleHighContrast = () => {
    const newVal = !highContrast;
    setHighContrast(newVal);
    localStorage.setItem("app_pref_high_contrast", String(newVal));
  };

  const toggleDyslexicFont = () => {
    const newVal = !dyslexicFont;
    setDyslexicFont(newVal);
    localStorage.setItem("app_pref_dyslexic", String(newVal));
  };

  const handleAdminLogin = (session: AdminSession) => {
    setAdminSession(session);
    localStorage.setItem("prop_admin_session", JSON.stringify(session));
  };

  const handleTenantLogin = (session: TenantSession, tenantData: Tenant) => {
    setTenantSession(session);
    setTenantProfile(tenantData);
    localStorage.setItem("prop_tenant_session", JSON.stringify(session));
    localStorage.setItem("prop_tenant_profile", JSON.stringify(tenantData));
  };

  const handleLogout = () => {
    setAdminSession(null);
    setTenantSession(null);
    setTenantProfile(null);
    localStorage.removeItem("prop_admin_session");
    localStorage.removeItem("prop_tenant_session");
    localStorage.removeItem("prop_tenant_profile");
  };

  if (!ready || (fetchError && properties.length === 0)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center relative text-white overflow-hidden">
        <div 
          className="absolute -inset-10 bg-cover bg-center pointer-events-none transition-all duration-700 z-0"
          style={{
            backgroundImage: `url("https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80")`,
            filter: "blur(14px) brightness(0.25)",
            transform: "translate3d(0, 0, 0)",
            willChange: "transform"
          }}
        />
        <div className="absolute inset-0 bg-slate-950/80 pointer-events-none z-0" />
        
        {fetchError && properties.length === 0 ? (
          <div id="fetch-error-view" className="flex flex-col items-center gap-4 relative z-10 max-w-md text-center p-6 bg-slate-900/50 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-400/10 flex items-center justify-center border border-red-500/20 text-red-400 animate-pulse">
              <Building2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100 font-sans tracking-tight">Gateway Connection Offline</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              We encountered a network fetch error while loading estate properties. This transient issue can happen if the backend server is busy or booting.
            </p>
            <button
              id="retry-fetch-btn"
              onClick={() => {
                setReady(false);
                setFetchError(false);
                fetchProperties(0);
              }}
              className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg shadow-lg hover:shadow-blue-500/20 transition-all duration-200 uppercase tracking-widest font-mono cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div id="boot-loader" className="flex flex-col items-center gap-3 relative z-10 animate-pulse">
            <img 
              src="/src/assets/images/kireu_logo_1780960611389.png" 
              alt="kireu houses Loading" 
              className="w-10 h-10 object-contain rounded-xl shadow-md border border-white/10"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
            />
            <p className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase">Initializing kireu houses Desk...</p>
          </div>
        )}
      </div>
    );
  }

  // Dynamic accessibility classes to append to root wrapper
  const accessibilityClasses = [
    fontSize === "sm" && "app-font-sm",
    fontSize === "normal" && "app-font-normal",
    fontSize === "lg" && "app-font-lg",
    fontSize === "xl" && "app-font-xl",
    themeMode === "light" && "app-light-mode",
    highContrast && "app-high-contrast",
    dyslexicFont && "app-dyslexic",
  ].filter(Boolean).join(" ");

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 relative font-sans selection:bg-blue-500 selection:text-white overflow-x-hidden ${accessibilityClasses}`}>
      
      {/* Inject complete stylesheet for Accessibility styles */}
      <style>{`
        /* Dynamic CSS Settings Overrides */
        .app-font-sm { font-size: 13px !important; }
        .app-font-sm h1, .app-font-sm h2, .app-font-sm h3 { font-size: 1.15em !important; }
        .app-font-sm button, .app-font-sm input, .app-font-sm select { font-size: 11px !important; }
        
        .app-font-normal { font-size: 15px !important; }
        
        .app-font-lg { font-size: 17px !important; }
        .app-font-lg h1 { font-size: 1.45em !important; }
        .app-font-lg h2 { font-size: 1.35em !important; }
        .app-font-lg h3 { font-size: 1.25em !important; }
        .app-font-lg p, .app-font-lg span, .app-font-lg td, .app-font-lg th, .app-font-lg button, .app-font-lg input, .app-font-lg select { font-size: 13.5px !important; }
        
        .app-font-xl { font-size: 19px !important; }
        .app-font-xl h1 { font-size: 1.6em !important; }
        .app-font-xl h2 { font-size: 1.5em !important; }
        .app-font-xl h3 { font-size: 1.4em !important; }
        .app-font-xl p, .app-font-xl span, .app-font-xl td, .app-font-xl th, .app-font-xl button, .app-font-xl input, .app-font-xl select { font-size: 15px !important; }

        /* Premium Light Mode Colors Override */
        .app-light-mode {
          background-color: #f1f5f9 !important;
          color: #0f171a !important;
        }
        
        .app-light-mode .fixed.-inset-10 {
          opacity: 0.1 !important;
          filter: blur(24px) brightness(1.85) saturate(0.8) !important;
        }

        .app-light-mode .fixed.inset-0.bg-gradient-to-b {
          background: linear-gradient(180deg, rgba(248, 250, 252, 0.93) 0%, rgba(226, 232, 240, 0.98) 100%) !important;
        }

        .app-light-mode .text-slate-100,
        .app-light-mode .text-slate-200,
        .app-light-mode .text-slate-300,
        .app-light-mode .text-slate-350,
        .app-light-mode .text-white,
        .app-light-mode h1,
        .app-light-mode h2,
        .app-light-mode h3,
        .app-light-mode h4,
        .app-light-mode h5 {
          color: #0f172a !important;
        }

        .app-light-mode .text-slate-400,
        .app-light-mode .text-slate-450 {
          color: #475569 !important;
        }

        .app-light-mode .bg-slate-900\\/60,
        .app-light-mode .bg-slate-900,
        .app-light-mode .bg-slate-950\\/25 {
          background-color: #ffffff !important;
          border-color: #cbd5e1 !important;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.05) !important;
        }

        .app-light-mode .border-white\\/10,
        .app-light-mode .border-white\\/5,
        .app-light-mode .border-slate-800,
        .app-light-mode .border-slate-700\\/50 {
          border-color: #cbd5e1 !important;
        }

        .app-light-mode .bg-slate-950\\/40,
        .app-light-mode .bg-slate-955\\/50,
        .app-light-mode .bg-slate-800,
        .app-light-mode .bg-slate-850,
        .app-light-mode .bg-slate-900\\/50 {
          background-color: #f8fafc !important;
          border-color: #e2e8f0 !important;
          color: #1e293b !important;
        }
        
        .app-light-mode input,
        .app-light-mode select,
        .app-light-mode textarea {
          background-color: #ffffff !important;
          color: #0f172a !important;
          border-color: #cbd5e1 !important;
        }

        .app-light-mode .high-contrast-card {
          background-color: #ffffff !important;
          border-color: #cbd5e1 !important;
        }

        /* Access indicators & high contrast */
        .app-high-contrast {
          filter: contrast(1.3) saturate(1.15) !important;
        }

        .app-dyslexic,
        .app-dyslexic p,
        .app-dyslexic span,
        .app-dyslexic div,
        .app-dyslexic font,
        .app-dyslexic td,
        .app-dyslexic th,
        .app-dyslexic input,
        .app-dyslexic select {
          font-family: "Courier New", Courier, "Comic Sans MS", cursive, sans-serif !important;
          letter-spacing: 0.06em !important;
          line-height: 1.7 !important;
        }
      `}</style>

      {/* High-quality blurry background image globally */}
      <div 
        className="fixed -inset-10 bg-cover bg-center pointer-events-none transition-all duration-700 z-0"
        style={{
          backgroundImage: `url("https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80")`,
          filter: "blur(14px) brightness(0.35)",
          transform: "translate3d(0, 0, 0)",
          willChange: "transform"
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/85 to-slate-950/90 z-0 pointer-events-none" />

      {/* View Content Portal Entry points */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {adminSession ? (
          <AdminPortal
            session={adminSession}
            properties={properties}
            onLogout={handleLogout}
            onRefreshProperties={fetchProperties}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : tenantSession && tenantProfile ? (
          (() => {
            const parentProp = properties.find((p) => p.property_id === tenantSession.property_id);
            if (parentProp) {
              return (
                <TenantPortal
                  tenant={tenantProfile}
                  property={parentProp}
                  onLogout={handleLogout}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              );
            }
            return (
              <div className="p-8 text-center text-xs font-mono text-slate-400">
                Synchronizing Property Session...
              </div>
            );
          })()
        ) : (
          <AuthScreens
            properties={properties}
            onAdminLogin={handleAdminLogin}
            onTenantLogin={handleTenantLogin}
          />
        )}
      </div>

      {/* ACCESSIBILITY & PREFERENCES SETTINGS MODAL */}
      {settingsOpen && (
        <div id="settings-preferences-overlay" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-left font-sans">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-display">System Personalization Desk</h3>
                  <p className="text-[10px] text-slate-400">Manage display scale, viewport theme &amp; accessibility aids</p>
                </div>
              </div>
              <button 
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Options Body */}
            <div className="p-6 space-y-6">

              {/* Theme Mode Option */}
              <div className="space-y-2">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  🎨 Viewport Color Theme
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => updateThemeSetting("dark")}
                    className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      themeMode === "dark" 
                        ? "bg-blue-600/10 border-blue-500 text-blue-400 shadow-sm" 
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                    }`}
                  >
                    <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="text-xs">
                      <span className="block font-bold">Twilight Dark</span>
                      <span className="text-[9px] opacity-70">Saves eye-strain, battery</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => updateThemeSetting("light")}
                    className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      themeMode === "light" 
                        ? "bg-slate-100 border-slate-400 text-slate-900 shadow-sm" 
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="text-xs">
                      <span className="block font-bold">Premium Light</span>
                      <span className="text-[9px] opacity-70 font-medium">Brisk off-white contrast</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Font Size Option */}
              <div className="space-y-2">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  <Type className="w-3.5 h-3.5 inline mr-1 text-slate-400" /> Typography Scale / Font Size
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["sm", "normal", "lg", "xl"] as const).map((sz) => {
                    const labels = { sm: "Compact (A-)", normal: "Standard (A)", lg: "Comfort (A+)", xl: "Massive (A++)" };
                    return (
                      <button
                        key={sz}
                        onClick={() => updateFontSizeSetting(sz)}
                        className={`p-2 rounded-xl border text-center text-xs font-semibold cursor-pointer transition-all ${
                          fontSize === sz
                            ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                            : "bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {labels[sz]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accessibility Toggles */}
              <div className="space-y-3">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  🚨 Accessibility Assistive Tools
                </label>
                
                <div className="space-y-2">
                  {/* High Contrast Toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-950/40 rounded-2xl border border-slate-800">
                    <div className="flex gap-2.5 items-start">
                      <Eye className="w-4.5 h-4.5 text-blue-400 shrink-0 mt-0.5" />
                      <div className="text-left leading-normal">
                        <span className="block text-xs font-bold text-white">Enhanced Color Contrast</span>
                        <span className="text-[9px] text-slate-450 block">Sharpens text readability against colored backings</span>
                      </div>
                    </div>
                    <button
                      onClick={toggleHighContrast}
                      className={`w-11 h-6 rounded-full p-1 transition-all cursor-pointer ${highContrast ? "bg-emerald-500 text-right" : "bg-slate-800 text-left"}`}
                    >
                      <span className="inline-block w-4 h-4 rounded-full bg-white transition-all shadow-md transform translate-y-[-1px]"></span>
                    </button>
                  </div>

                  {/* Dyslexic Friendly Toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-950/40 rounded-2xl border border-slate-800">
                    <div className="flex gap-2.5 items-start">
                      <Sparkles className="w-4.5 h-4.5 text-indigo-400 shrink-0 mt-0.5" />
                      <div className="text-left leading-normal">
                        <span className="block text-xs font-bold text-white">Dyslexia-Friendly Spaced Typography</span>
                        <span className="text-[9px] text-slate-450 block font-sans">Forces a hyper-spaced geometric monospace font</span>
                      </div>
                    </div>
                    <button
                      onClick={toggleDyslexicFont}
                      className={`w-11 h-6 rounded-full p-1 transition-all cursor-pointer ${dyslexicFont ? "bg-emerald-500 text-right" : "bg-slate-800 text-left"}`}
                    >
                      <span className="inline-block w-4 h-4 rounded-full bg-white transition-all shadow-md transform translate-y-[-1px]"></span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time Preview Area */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs space-y-1 my-1">
                <span className="block text-[9px] text-slate-500 font-bold uppercase font-mono tracking-wider mb-1">
                  🔴 Real-time Panel Preview Check
                </span>
                <p className="font-bold text-white leading-relaxed">Room 304 Anniversary Billing</p>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Your billing reset trigger resets on the 14th of each calendar month. Support is online.
                </p>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950/40 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs tracking-wider uppercase transition-all cursor-pointer w-full text-center"
              >
                Apply Preferences &amp; Return
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

