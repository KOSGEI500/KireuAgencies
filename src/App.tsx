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
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div id="boot-loader" className="flex flex-col items-center gap-3">
          <Building2 className="w-10 h-10 text-emerald-500 animate-pulse" />
          <p className="text-xs text-slate-500 font-mono">Launching Relational Multi-Estate Hub...</p>
        </div>
      </div>
    );
  }

  // Route Views
  if (adminSession) {
    return (
      <AdminPortal
        session={adminSession}
        properties={properties}
        onLogout={handleLogout}
        onRefreshProperties={fetchProperties}
      />
    );
  }

  if (tenantSession && tenantProfile) {
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
  }

  return (
    <AuthScreens
      properties={properties}
      onAdminLogin={handleAdminLogin}
      onTenantLogin={handleTenantLogin}
    />
  );
}
