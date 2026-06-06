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

  useEffect(() => {
    fetchProperties();
    restoreSessions();
  }, []);

  const fetchProperties = async () => {
    try {
      const response = await fetch("/api/properties");
      if (response.ok) {
        const list = await response.json();
        setProperties(list);
      }
    } catch (err) {
      console.error("Failed to load estate properties list:", err);
    } finally {
      setReady(true);
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

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center relative text-white">
        <div 
          className="absolute inset-0 bg-cover bg-center scale-105 pointer-events-none transition-all duration-700 z-0"
          style={{
            backgroundImage: `url("https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80")`,
            filter: "blur(14px) brightness(0.25)"
          }}
        />
        <div className="absolute inset-0 bg-slate-950/80 pointer-events-none z-0" />
        <div id="boot-loader" className="flex flex-col items-center gap-3 relative z-10 animate-pulse">
          <Building2 className="w-10 h-10 text-blue-400" />
          <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Initializing Kireu Agencies Desk...</p>
        </div>
      </div>
    );
  }

  // Render global dark container with blurry background image
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative font-sans selection:bg-blue-500 selection:text-white">
      {/* High-quality blurry dark background image globally */}
      <div 
        className="fixed inset-0 bg-cover bg-center scale-105 pointer-events-none transition-all duration-700 z-0"
        style={{
          backgroundImage: `url("https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80")`,
          filter: "blur(14px) brightness(0.35)"
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
