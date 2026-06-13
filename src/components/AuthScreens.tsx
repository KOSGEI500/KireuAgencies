import React, { useState } from "react";
import { Property, AdminSession, TenantSession } from "../types";
import { 
  Building2, Phone, Key, ShieldAlert, LogIn, User, Smartphone, 
  ArrowRight, ShieldCheck, HelpCircle, Info, Sparkles, LogOut, ArrowLeft,
  Building, CheckCircle2, ChevronRight, Moon, Star, Mail, Code, X
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
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Contact info and Developer info dynamically fetched from backend
  const [contacts, setContacts] = useState<{
    developer_contact: { name: string; phone: string; email: string; background: string };
    owner_contact: { name: string; phone: string; email: string; background: string };
  } | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDeveloperInfo, setShowDeveloperInfo] = useState(false);

  const fetchContacts = async () => {
    try {
      const response = await fetch("/api/contact");
      if (response.ok) {
        const data = await response.json();
        setContacts(data);
      }
    } catch (e) {
      console.warn("Error fetching contact info:", e);
    }
  };

  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === "#/login") {
        setCurrentPage("login");
        setShowContactModal(false);
        setShowRequestHouseModal(false);
        setShowTerms(false);
        setShowPrivacy(false);
        setError(null);
      } else if (hash === "#/contact") {
        setCurrentPage("landing");
        setShowContactModal(true);
        setShowDeveloperInfo(false); // Reset to hide developer info by default
        setShowRequestHouseModal(false);
        setShowTerms(false);
        setShowPrivacy(false);
        fetchContacts();
      } else if (hash === "#/request-house") {
        setCurrentPage("landing");
        setShowContactModal(false);
        setShowRequestHouseModal(true);
        setShowTerms(false);
        setShowPrivacy(false);
      } else if (hash === "#/terms") {
        setShowTerms(true);
        setShowContactModal(false);
        setShowRequestHouseModal(false);
        setShowPrivacy(false);
      } else if (hash === "#/privacy") {
        setShowPrivacy(true);
        setShowContactModal(false);
        setShowRequestHouseModal(false);
        setShowTerms(false);
      } else {
        // default / landing
        setCurrentPage("landing");
        setShowContactModal(false);
        setShowRequestHouseModal(false);
        setShowTerms(false);
        setShowPrivacy(false);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange(); // Run on mount
    fetchContacts(); // Ensure live database contact configurations are retrieved and displayed on the landing page immediately

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Automated rotating features / view statements
  const [statementIndex, setStatementIndex] = useState(0);
  const statementsList = [
    "Smart rent payment processing with automated M-Pesa STK push notifications",
    "Instant maintenance ticket logging with direct local caretaker assignment",
    "Secure tenancy records, automated digital bill statement history, and SMS notifications",
    "Verified luxury living portfolios featuring custom residencies of high modern standing",
    "Fully digitalized property portfolio management of verified luxury apartments"
  ];

  React.useEffect(() => {
    if (currentPage !== "landing") return;
    const interval = setInterval(() => {
      setStatementIndex((prev) => (prev + 1) % statementsList.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [currentPage, statementsList.length]);

  // Form Inputs
  const [tenantUsername, setTenantUsername] = useState("");
  const [tenantPin, setTenantPin] = useState("");
  const [caretakerPasskey, setCaretakerPasskey] = useState("");

  // Room Request States
  const [showRequestHouseModal, setShowRequestHouseModal] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestPhone, setRequestPhone] = useState("");
  const [requestPropId, setRequestPropId] = useState("");
  const [requestRoomNum, setRequestRoomNum] = useState("");
  const [vacantRooms, setVacantRooms] = useState<any[]>([]);
  const [fetchingVacantRooms, setFetchingVacantRooms] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRequestSending, setIsRequestSending] = useState(false);
  const [requestSentSuccess, setRequestSentSuccess] = useState(false);

  React.useEffect(() => {
    if (showRequestHouseModal) {
      setRequestSuccess(null);
      setRequestError(null);
      setFetchingVacantRooms(true);
      fetch("/api/rooms/vacant")
        .then(res => {
          if (res.ok) return res.json();
          throw new Error("Unable to fetch vacant rooms.");
        })
        .then(list => {
          setVacantRooms(list);
          if (list.length > 0) {
            setRequestPropId(list[0].property_id);
            const firstPropRooms = list.filter((r: any) => r.property_id === list[0].property_id);
            if (firstPropRooms.length > 0) {
              setRequestRoomNum(firstPropRooms[0].room_number);
            }
          }
        })
        .catch(err => {
          setRequestError(err.message || "Failed to load currently vacant rooms.");
        })
        .finally(() => {
          setFetchingVacantRooms(false);
        });
    }
  }, [showRequestHouseModal]);

  const handleOpenRequestHouse = () => {
    window.location.hash = "#/request-house";
  };

  const handlePropChange = (propId: string) => {
    setRequestPropId(propId);
    const rooms = vacantRooms.filter((r: any) => r.property_id === propId);
    if (rooms.length > 0) {
      setRequestRoomNum(rooms[0].room_number);
    } else {
      setRequestRoomNum("");
    }
  };

  const handleRequestHouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestName || !requestPhone || !requestPropId || !requestRoomNum) {
      setRequestError("Please complete all requested data fields.");
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setIsRequestSending(true);

    try {
      const response = await fetch("/api/room-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: requestName.trim(),
          phone_number: requestPhone.trim(),
          property_id: requestPropId,
          room_number: requestRoomNum
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit room request.");
      }

      setRequestSentSuccess(true);
      setRequestSuccess("Your application has been filed successfully with the admin!");
      setRequestName("");
      setRequestPhone("");

      // Return user to landing page after 3.2s
      setTimeout(() => {
        window.location.hash = "#/";
        setIsRequestSending(false);
        setRequestSentSuccess(false);
      }, 3200);
      
      // Refresh list
      const vacRes = await fetch("/api/rooms/vacant");
      if (vacRes.ok) {
        const list = await vacRes.json();
        setVacantRooms(list);
      }
    } catch (err: any) {
      setIsRequestSending(false);
      setRequestSentSuccess(false);
      setRequestError(err.message || "An error occurred while filing the request.");
    }
  };

  const handleTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantPin) {
      setError("Please fill in your Room PIN or Staff Key.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pinUpper = tenantPin.trim().toUpperCase();
      const isAdminKey = pinUpper === "1234" || pinUpper === "KIREU-COLLINS-32" || pinUpper === "KIREU-EXEC-11";

      if (isAdminKey) {
        const response = await fetch("/api/auth/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "Super-Admin",
            pin: tenantPin.trim()
          })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Incorrect Admin passkey.");
        }
        onAdminLogin(data.session);
        return;
      }

      // Check if it's a Caretaker Key
      let caretakers: any[] = [];
      try {
        const res = await fetch("/api/caretakers");
        if (res.ok) {
          caretakers = await res.json();
        }
      } catch (e) {
        console.warn("Could not fetch caretakers list:", e);
      }

      const matchedCaretaker = caretakers.find(
        (c: any) => c.pin && c.pin.trim().toUpperCase() === pinUpper
      );

      if (matchedCaretaker) {
        if (!tenantUsername || !tenantUsername.trim()) {
          throw new Error("Phone number/Username is required for Caretaker verification.");
        }

        const response = await fetch("/api/auth/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "Caretaker",
            pin: tenantPin.trim(),
            property_id: matchedCaretaker.property_id
          })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Incorrect caretaker key.");
        }
        onAdminLogin(data.session);
        return;
      }

      // Default to regular Tenant login
      if (!tenantUsername || !tenantUsername.trim()) {
        throw new Error("Please enter both your registered Username/Phone and Apartment PIN.");
      }

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
        throw new Error(data.error || "Incorrect Username/Phone or Apartment PIN.");
      }

      onTenantLogin(data.session, data.tenant);
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please verify your credentials.");
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
      // Check if it's the Super-Admin legacy PIN "1234" or one of the new high-security administrative codes
      const cleanPasskey = caretakerPasskey.trim().replace(/^[,.:;\s]+|[,.:;\s]+$/g, "");
      const pinUpper = cleanPasskey.toUpperCase();
      const isSuper = pinUpper === "1234" || pinUpper === "KIREU-COLLINS-32" || pinUpper === "KIREU-EXEC-11";

      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: isSuper ? "Super-Admin" : "Caretaker",
          pin: cleanPasskey
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

      let data: any = {};
      const responseText = await response.text();
      try {
        if (responseText) {
          data = JSON.parse(responseText);
        }
      } catch (parseErr) {
        data = { error: "Access Denied: You are not authorized or registered on this system." };
      }

      if (!response.ok) {
        throw new Error(data.error || "Access Denied: You are not authorized or registered on this system.");
      }

      onAdminLogin(data.session);
    } catch (err: any) {
      console.warn("Google Admin Auth Status:", err.message || err);
      const appAuthDomain = auth.app.options.authDomain || "YOUR_PROJECT.firebaseapp.com";
      const currentHost = window.location.hostname;

      if (err.code === "auth/unauthorized-domain") {
        setError(
          <div className="space-y-3 p-1 text-slate-200">
            <div className="font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              Firebase Unauthorized Domain Error
            </div>
            <p className="text-[11px] text-slate-350 leading-relaxed text-left">
              Firebase prevents Google sign-in from unlisted domains. To enable log-in from <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-emerald-450 font-bold">{currentHost}</span>, complete these two administrative settings:
            </p>
            <div className="space-y-2 text-[10px] text-slate-300 font-mono bg-slate-950/60 p-2.5 rounded-lg border border-white/5 text-left">
              <div className="border-b border-white/5 pb-1 text-emerald-400 font-bold uppercase tracking-wider text-[9px]">
                Step 1: Firebase Console
              </div>
              <p className="leading-snug">
                1. Go to your <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-emerald-450 hover:underline font-bold">Firebase Console</a>.
              </p>
              <p className="leading-snug">
                2. Navigate to <strong className="text-white font-medium">Build</strong> &gt; <strong className="text-white font-medium">Authentication</strong> &gt; <strong className="text-white font-medium">Settings</strong> &gt; <strong className="text-white font-medium">Authorized domains</strong>.
              </p>
              <p className="leading-snug">
                3. Click <strong className="text-emerald-450 font-bold">Add domain</strong> and enter: <span className="text-emerald-400 bg-white/5 px-1 rounded select-all font-bold">{currentHost}</span>
              </p>

              <div className="border-b border-white/5 pt-2 pb-1 text-cyan-400 font-bold uppercase tracking-wider text-[9px]">
                Step 2: Google Cloud Console
              </div>
              <p className="leading-snug">
                1. Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline font-bold">Google Cloud Console</a>.
              </p>
              <p className="leading-snug">
                2. Navigate to <strong className="text-white font-medium">APIs & Services</strong> &gt; <strong className="text-white font-medium">Credentials</strong>.
              </p>
              <p className="leading-snug">
                3. Click & edit your <strong className="text-white font-medium">Web client (OAuth 2.0 Client ID)</strong>.
              </p>
              <p className="leading-snug">
                4. Under <strong className="text-white font-medium">Authorized redirect URIs</strong>, add: <span className="text-cyan-300 bg-white/5 px-1 rounded select-all font-bold">https://{appAuthDomain}/__/auth/handler</span>
              </p>
            </div>
            <p className="text-[10px] text-slate-400 italic text-left">
              * Domain lists can take 2-5 minutes to propagate across Google edge servers.
            </p>
          </div>
        );
      } else if (err.code === "auth/operation-not-allowed") {
        setError(
          <div className="space-y-2 p-1 text-slate-200">
            <p className="font-bold text-amber-400 uppercase tracking-wrap">Google Account Sign-In Off</p>
            <p className="text-[11px] text-slate-350 leading-relaxed text-left">
              Google Auth is not enabled in your Firebase console settings under Authorized Providers.
            </p>
            <div className="bg-slate-955/60 p-2.5 rounded border border-white/5 text-[10px] text-slate-300 font-mono text-left space-y-1">
              <p>1. Open <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-emerald-450 hover:underline font-bold">Firebase Console</a> &gt; Auth.</p>
              <p>2. Select the <strong className="text-white">Sign-in method</strong> tab.</p>
              <p>3. Add <strong className="text-emerald-400 font-bold">Google</strong> to your enabled providers.</p>
            </div>
          </div>
        );
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completing authentication.");
      } else if (err.code === "auth/popup-blocked") {
        setError("The authentication popup was blocked by your browser. Please enable popups for this estate dashboard.");
      } else {
        setError(err.message || "Access Denied: Only authorized directors are granted Google sign-in rights.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isOuterStatic = currentPage === "login" || showRequestHouseModal || showContactModal || showTerms || showPrivacy;

  return (
    <div className={`bg-transparent text-slate-100 flex flex-col justify-between transition-all duration-300 relative font-sans ${isOuterStatic ? "h-screen overflow-hidden" : "min-h-screen overflow-x-hidden"}`}>
      
      {/* NAVBAR HEADER BAR */}
      <header className="w-full border-b border-white/5 bg-slate-900/60 sticky top-0 z-50 backdrop-blur-md transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/src/assets/images/kireu_logo_1780960611389.png" 
              alt="KIREU HOUSES Logo" 
              className="h-9 w-9 object-contain rounded-xl shadow-md border border-white/10"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
            />
            <div className="text-left">
              <span className="font-extrabold text-lg sm:text-xl tracking-wider text-white block">KIREU HOUSES</span>
              <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest leading-none mt-0.5 block">Premium Spaces</span>
            </div>
          </div>
          
          <nav className="hidden md:flex space-x-6">
            <span onClick={() => { window.location.hash = "#/request-house"; }} className="text-xs font-semibold text-slate-350 hover:text-white transition-all cursor-pointer font-mono uppercase tracking-wider">Properties</span>
            <span onClick={() => { window.location.hash = "#/request-house"; }} className="text-xs font-semibold text-slate-350 hover:text-white transition-all cursor-pointer font-mono uppercase tracking-wider">About Us</span>
            <span onClick={() => { window.location.hash = "#/contact"; }} className="text-xs font-semibold text-slate-350 hover:text-emerald-400 transition-all cursor-pointer font-mono uppercase tracking-wider font-bold">Contact</span>
          </nav>

          {currentPage === "landing" ? (
            <button 
              onClick={() => {
                window.location.hash = "#/login";
              }}
              className="px-4 py-2 text-[11px] font-bold tracking-widest uppercase bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-95 text-white rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-300" />
              <span>Login</span>
            </button>
          ) : (
            <button 
              onClick={() => {
                window.location.hash = "#/";
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold tracking-widest uppercase bg-white/10 hover:bg-white/15 text-white hover:text-white/85 border border-white/10 rounded-xl transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>Go Back</span>
            </button>
          )}
        </div>
      </header>

      {/* LANDING PAGE STEP VIEW */}
      {currentPage === "landing" ? (
        <main className="flex-grow flex flex-col items-center justify-center text-center p-4 sm:p-8 lg:p-12 relative z-10 max-w-4xl w-full mx-auto space-y-8 animate-in fade-in duration-700">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-slate-200 font-mono text-[9px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-inner">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              Verified Luxury Living
            </div>

            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold font-display text-white tracking-wide uppercase leading-tight drop-shadow-md">
              Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-white">KIREU HOUSES</span>
            </h2>

            <p className="text-slate-300/90 text-sm sm:text-base md:text-lg lg:text-xl font-light tracking-widest max-w-2xl mx-auto leading-relaxed drop-shadow-sm uppercase">
              Find premium spaces and modern living options
            </p>
          </div>

          {/* Main Action Buttons: Request & Access Portals */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-xl mx-auto">
            <button 
              onClick={handleOpenRequestHouse}
              className="w-full sm:w-1/2 px-6 py-4.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white border border-white/10 rounded-2xl backdrop-blur-md transition-all shadow-lg hover:border-emerald-500/30 cursor-pointer flex flex-col items-center justify-center gap-1 font-sans text-center group"
            >
              <span className="font-extrabold uppercase text-xs tracking-wider flex items-center gap-2 text-white">
                Need a house? Get one 🏡
              </span>
              <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest font-bold">Request a House</span>
            </button>
            <button 
              onClick={() => { window.location.hash = "#/contact"; }}
              className="w-full sm:w-1/2 px-6 py-4.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white border border-white/10 rounded-2xl backdrop-blur-md transition-all shadow-lg hover:border-emerald-500/30 cursor-pointer flex flex-col items-center justify-center gap-1 font-sans text-center group"
            >
              <span className="font-bold uppercase text-xs tracking-wider flex items-center gap-2 text-white">
                Contact Us 📩
              </span>
              <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest font-bold">Get In Touch Instantly</span>
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
                  <h3 className="text-xl font-extrabold font-display text-white uppercase tracking-wider">
                    Sign In to KIREU HOUSES
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
                
                {/* REPOSITIONED FULL-WIDTH GOOGLE AUTHENTICATION PANEL */}
                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 font-sans">Sign in with Google</h4>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAdminLogin}
                    disabled={loading}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-bold rounded-xl text-[11px] transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
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

                {/* HORIZONTAL DECORATIVE SPLIT */}
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-3.5 text-[9px] text-slate-400 font-extrabold uppercase tracking-widest font-mono">
                    OR PORTAL SIGN-IN
                  </span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                {/* CHANNEL 1: TENANTS & STAFF INTERACTIVE INPUT FORM */}
                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl text-left space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Portal Access Entry</h4>
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
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Room PIN or Staff Key</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-455" />
                        <input
                          type="password"
                          placeholder="e.g. 102A or Key"
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
                        <span>{loading ? "Decrypting..." : "Login to Portal Hub"}</span>
                        <LogIn className="w-3.5 h-3.5 text-emerald-350" />
                      </button>
                    </div>

                    <div className="sm:col-span-2 pt-2 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
                      <span className="text-[11px] text-slate-400 font-medium">Don't have login data or looking for a room?</span>
                      <button
                        type="button"
                        id="open-request-house-btn"
                        onClick={handleOpenRequestHouse}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-555 text-white font-bold text-[10px] uppercase rounded-lg transition-all cursor-pointer shadow-sm tracking-wider hover:scale-[1.02] flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-250 animate-pulse" />
                        <span>Request a House</span>
                      </button>
                    </div>
                  </form>
                </div>

              </div>
            </div>

          </div>
        </main>
      )}

      {/* FOOTER METRICS INFO */}
      {currentPage === "login" ? (
        <footer className="py-4 border-t border-white/5 bg-slate-950/60 text-slate-300 mt-auto relative z-10 font-sans">
          <div className="max-w-7xl mx-auto w-full px-6 flex justify-center items-center">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider font-mono text-slate-400">
              <button onClick={() => { window.location.hash = "#/privacy"; }} className="hover:text-emerald-400 transition cursor-pointer">Privacy Policy</button>
              <span className="text-slate-700">•</span>
              <button onClick={() => { window.location.hash = "#/terms"; }} className="hover:text-emerald-450 transition cursor-pointer">Terms of Service</button>
            </div>
          </div>
        </footer>
      ) : (
        <footer className="py-8 border-t border-white/5 bg-slate-950/60 text-slate-300 mt-auto relative z-10 font-sans">
          <div className="max-w-7xl mx-auto w-full px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-left space-y-1">
              <p className="text-sm">
                &copy; {new Date().getFullYear()} <strong>KIREU HOUSES</strong>. All rights reserved.
              </p>
              <p className="text-xs text-slate-400 max-w-md">
                Delivering modern housing, structural management, and premium real estate development.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider font-mono text-slate-400">
              <button onClick={() => { window.location.hash = "#/privacy"; }} className="hover:text-emerald-400 transition cursor-pointer">Privacy Policy</button>
              <span className="text-slate-700">•</span>
              <button onClick={() => { window.location.hash = "#/terms"; }} className="hover:text-emerald-450 transition cursor-pointer">Terms of Service</button>
            </div>
          </div>
        </footer>
      )}

      {/* REQUEST A HOUSE / VACANT ROOM REQUEST MODAL */}
      {showRequestHouseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto shadow-2xl text-left overflow-hidden">
            
            {isRequestSending && (
              <div className="absolute inset-0 bg-slate-950/98 flex flex-col items-center justify-center p-8 z-50 text-center animate-in fade-in duration-350">
                {!requestSentSuccess ? (
                  <div className="space-y-6">
                    <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-500/10 border-t-emerald-400 animate-spin" />
                      <Building className="w-10 h-10 text-emerald-400 animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 font-mono animate-bounce">
                        LODGING DIGITAL APPLICATION...
                      </h3>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto font-sans leading-relaxed">
                        Establishing secure connection with Kireu administrative directory to deposit room request...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in zoom-in duration-500">
                    <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping duration-1000" />
                      <div className="absolute -inset-2 rounded-full border border-emerald-400/30 scale-100 animate-pulse" />
                      <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/30">
                        <CheckCircle2 className="w-10 h-10 text-slate-950" />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-lg font-black font-display tracking-wider text-emerald-400 uppercase">
                        APPLICATION SENT!
                      </h3>
                      <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                        Your housing application has been filed successfully. The executive directors have been notified.
                      </p>
                    </div>

                    <div className="pt-4 flex flex-col items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      <span>Returning to Landing Desk...</span>
                      <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400" style={{ width: "100%", transition: "all 3.2s ease-out" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Building className="w-5.5 h-5.5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-widest uppercase font-display">Apply / Request a Room</h3>
              </div>
              <button 
                onClick={() => { window.location.hash = "#/"; }}
                className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            {fetchingVacantRooms ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <span className="text-[10px] font-mono uppercase tracking-widest">Querying Active Vacancies...</span>
              </div>
            ) : vacantRooms.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <Building2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-sm text-slate-200">No Vacancies Currently Available</p>
                  <p className="text-xs text-slate-550 leading-relaxed max-w-sm mx-auto">
                    All our luxury rooms are fully occupied. We periodically publish newly vacant assets, kindly try again later!
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRequestHouseSubmit} className="space-y-4">
                <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 leading-normal font-sans">
                  💡 Select your desired plot and available room, fill in your coordinates, and easily lodge your request with our directors below.
                </div>

                {requestSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold leading-relaxed font-sans">
                    🎉 {requestSuccess}
                  </div>
                )}

                {requestError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold leading-relaxed font-sans">
                    ⚠️ {requestError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans">
                  {/* Select Plot */}
                  <div>
                    <label htmlFor="req-plot-select" className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Choose the Plot</label>
                    <select
                      id="req-plot-select"
                      value={requestPropId}
                      onChange={(e) => handlePropChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-205 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer text-white"
                      required
                    >
                      {Array.from(new Set(vacantRooms.map((r: any) => r.property_id))).map((pId: string) => {
                        const propObj = properties.find((p: any) => p.property_id === pId);
                        return (
                          <option key={pId} value={pId} className="text-slate-900 bg-white">
                            {propObj ? propObj.property_name : pId}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Select Available Room */}
                  <div>
                    <label htmlFor="req-room-select" className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select the Available Room</label>
                    <select
                      id="req-room-select"
                      value={requestRoomNum}
                      onChange={(e) => setRequestRoomNum(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-205 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer text-white"
                      required
                    >
                      {vacantRooms.filter((r: any) => r.property_id === requestPropId).map((r: any) => (
                        <option key={r.room_number} value={r.room_number} className="text-slate-900 bg-white">
                          🚪 Door {r.room_number} (Rent: KES {r.monthly_rent.toLocaleString()} / Deposit KES {r.utility_rate.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Applicant Name */}
                  <div>
                    <label htmlFor="req-name-input" className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Your Full Name</label>
                    <input
                      id="req-name-input"
                      type="text"
                      placeholder="e.g. John Doe"
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-650"
                      required
                    />
                  </div>

                  {/* Applicant Phone */}
                  <div>
                    <label htmlFor="req-phone-input" className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Your Phone Number</label>
                    <input
                      id="req-phone-input"
                      type="text"
                      placeholder="e.g. 0712345678"
                      value={requestPhone}
                      onChange={(e) => setRequestPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-650"
                      required
                    />
                  </div>
                </div>

                {/* Structured message preview panel */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                  <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">
                    📨 Structured message sent to director
                  </span>
                  <div className="bg-slate-900 border-l-2 border-emerald-500 p-2.5 text-[11px] text-slate-300 font-sans leading-relaxed italic rounded-r-lg">
                    "hello, I am {requestName || "[Your Name]"}, I request for the vacant room {requestRoomNum || "[Room Number]"} at {properties.find(p => p.property_id === requestPropId)?.property_name || "[Plot]"}, if still available reach me at {requestPhone || "[Phone]"}"
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3 font-sans">
                  <button
                    type="button"
                    onClick={() => { window.location.hash = "#/"; }}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-755 text-slate-200 font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="submit-room-request-btn"
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <span>Send Application</span>
                    <ArrowRight className="w-4.5 h-4.5 text-emerald-250" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

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
                onClick={() => { window.location.hash = "#/"; }}
                className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-[11px] text-slate-350 font-semibold leading-relaxed">
              <p className="border-l-2 border-emerald-500 pl-3 italic text-slate-400">
                Welcome to KIREU HOUSES. By using this digital platform, you agree to comply with and be bound by the following formal administrative terms.
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
                onClick={() => { window.location.hash = "#/"; }}
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
                onClick={() => { window.location.hash = "#/"; }}
                className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-[11px] text-slate-350 font-semibold leading-relaxed">
              <p className="border-l-2 border-emerald-500 pl-3 italic text-slate-400">
                Your digital security is our highest priority. This policy details how KIREU HOUSES collects, manages, and secures your platform credentials.
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
                onClick={() => { window.location.hash = "#/"; }}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-md"
              >
                Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTACT INFO MODAL */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-extrabold text-white tracking-widest uppercase font-display">Get in Touch with Kireu Houses</h3>
              </div>
              <button 
                onClick={() => { window.location.hash = "#/"; }}
                className="p-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-xl text-[10px] font-extrabold uppercase transition-all cursor-pointer flex items-center gap-1.5 border border-white/5"
              >
                <X className="w-3 h-3 text-red-400" />
                <span>Dismiss</span>
              </button>
            </div>

            <div className="space-y-6 pt-2">
              {/* BLOCK 1: THE PREMIER OWNER - ONEWEE OF KIREU HEALTHY RESIDENCES */}
              <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-emerald-500/10 rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4 max-w-xl mx-auto w-full">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 justify-between">
                    <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[9px] uppercase tracking-wider font-extrabold rounded">
                      Executive Estate Owner
                    </span>
                    <Building className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-white font-display uppercase tracking-wide">
                      {contacts?.owner_contact?.name || "Onewee of Kireu"}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-0.5">
                      Verified Estate Director
                    </p>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans border-t border-white/5 pt-3">
                    {contacts?.owner_contact?.background || "Onewee of Kireu is the premier owner of Kireu modern verified assets, ensuring safety, reliability, and modern luxury standards."}
                  </p>
                </div>

                <div className="space-y-2 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500 uppercase tracking-widest text-[9px]">Mobile Direct:</span>
                    <a href={`tel:${contacts?.owner_contact?.phone || "254711222333"}`} className="text-emerald-400 font-bold hover:underline">
                      +{contacts?.owner_contact?.phone || "254711222333"}
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500 uppercase tracking-widest text-[9px]">Email Desk:</span>
                    <a href={`mailto:${contacts?.owner_contact?.email || "onewee@kireu.com"}`} className="text-slate-350 font-bold hover:underline font-sans truncate block max-w-[200px]">
                      {contacts?.owner_contact?.email || "onewee@kireu.com"}
                    </a>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <a 
                      href={`tel:${contacts?.owner_contact?.phone || "254711222333"}`}
                      className="py-2.5 bg-slate-800 hover:bg-slate-700 text-center text-white font-extrabold uppercase text-[9px] tracking-wider rounded-xl border border-white/10 transition-all cursor-pointer block"
                    >
                      Call Executive
                    </a>
                    <a 
                      href={`https://wa.me/${(contacts?.owner_contact?.phone || "254711222333").replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      referrerPolicy="no-referrer"
                      className="py-2.5 bg-emerald-500 hover:bg-emerald-600 text-center text-slate-950 font-extrabold uppercase text-[9px] tracking-wider rounded-xl transition-all cursor-pointer block"
                    >
                      WhatsApp Chat
                    </a>
                  </div>
                </div>
              </div>

              {/* DEVELOPER INFO ACTION BUTTON */}
              <div className="flex justify-center">
                <button
                  type="button"
                  id="developer-info-btn"
                  onClick={() => setShowDeveloperInfo(!showDeveloperInfo)}
                  className="px-5 py-3 bg-gradient-to-r from-blue-900/40 to-indigo-900/45 hover:from-blue-800/50 hover:to-indigo-850 text-blue-300 hover:text-white font-bold uppercase text-[10px] tracking-wider rounded-xl border border-blue-500/30 shadow-xs flex items-center gap-2 transition-all duration-300 hover:scale-[1.03] cursor-pointer"
                >
                  <Code className="w-4 h-4 text-blue-400" />
                  <span>{showDeveloperInfo ? "Hide Developer Info" : "View Developer Info"}</span>
                </button>
              </div>

              {/* BLOCK 2: THE LEAD SYSTEMS ARCHITECT & SCIENTIST - COLLINS KOSGEI */}
              {showDeveloperInfo && (
                <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-blue-500/20 rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4 max-w-xl mx-auto w-full animate-in zoom-in-95 duration-250">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 justify-between">
                      <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono text-[9px] uppercase tracking-wider font-extrabold rounded">
                        IT Scientist &amp; Web Developer
                      </span>
                      <Code className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-white font-display uppercase tracking-wide">
                        {contacts?.developer_contact?.name || "Collins Kosgei"}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-0.5">
                        Systems Architect
                      </p>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans border-t border-white/5 pt-3">
                      {contacts?.developer_contact?.background || "Collins is a verified information technology professional and a scientist, a full web developer with experience. For a good website call or WhatsApp Collins."}
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-white/5 pt-4">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500 uppercase tracking-widest text-[9px]">Mobile Direct:</span>
                      <a href={`tel:${contacts?.developer_contact?.phone || "254712345678"}`} className="text-blue-400 font-bold hover:underline font-mono">
                        +{contacts?.developer_contact?.phone || "254712345678"}
                      </a>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500 uppercase tracking-widest text-[9px]">Email Desk:</span>
                      <a href={`mailto:${contacts?.developer_contact?.email || "collinskosgei32@gmail.com"}`} className="text-slate-350 font-bold hover:underline font-sans truncate block max-w-[200px]">
                        {contacts?.developer_contact?.email || "collinskosgei32@gmail.com"}
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <a 
                        href={`tel:${contacts?.developer_contact?.phone || "254712345678"}`}
                        className="py-2.5 bg-slate-800 hover:bg-slate-700 text-center text-white font-extrabold uppercase text-[9px] tracking-wider rounded-xl border border-white/10 transition-all cursor-pointer block"
                      >
                        Call Developer
                      </a>
                      <a 
                        href={`https://wa.me/${(contacts?.developer_contact?.phone || "254712345678").replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        referrerPolicy="no-referrer"
                        className="py-2.5 bg-blue-500 hover:bg-blue-600 text-slate-955 text-center font-extrabold uppercase text-[9px] tracking-wider rounded-xl transition-all cursor-pointer block"
                      >
                        WhatsApp Chat
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 text-[10px] text-slate-500 font-sans tracking-wide leading-relaxed text-center">
              Need custom modifications, features, or fully hosted dynamic listings? Get in touch directly with our support lines above for high premium speed execution.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
