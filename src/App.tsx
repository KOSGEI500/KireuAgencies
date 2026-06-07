import React, { useState, useEffect } from "react";
import { Property, AdminSession, TenantSession, Tenant } from "./types";
import AuthScreens from "./components/AuthScreens";
import TenantPortal from "./components/TenantPortal";
import AdminPortal from "./components/AdminPortal";
import { Building2, Sparkles, LogIn } from "lucide-react";

export default function App() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [tenantSession, setTenantSession] = useState<TenantSession | null>(null);
  const [tenantProfile, setTenantProfile] = useState<Tenant | null>(null);
  const [ready, setReady] = useState(false);

  const [fetchError, setFetchError] = useState<boolean>(false);

  useEffect(() => {
    fetchProperties();
    restoreSessions();
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
            <Building2 className="w-10 h-10 text-blue-400" />
            <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Initializing Kireu Agencies Desk...</p>
          </div>
        )}
      </div>
    );
  }

  // Render global dark container with blurry background image
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative font-sans selection:bg-blue-500 selection:text-white overflow-x-hidden">
      {/* High-quality blurry dark background image globally */}
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
    </div>
  );
}
