import React, { useState } from "react";
import { Property, AdminSession, TenantSession } from "../types";
import { Building2, Phone, Key, ShieldAlert, LogIn, User, Smartphone } from "lucide-react";

interface AuthScreensProps {
  properties: Property[];
  onAdminLogin: (session: AdminSession) => void;
  onTenantLogin: (session: TenantSession, tenantData: any) => void;
}

export default function AuthScreens({ properties, onAdminLogin, onTenantLogin }: AuthScreensProps) {
  const [loginMode, setLoginMode] = useState<"tenant" | "admin">("tenant");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Tenant State
  const [tenantStep, setTenantStep] = useState<1 | 2>(1);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantRoom, setTenantRoom] = useState("");

  // Admin State
  const [adminRole, setAdminRole] = useState<"Super-Admin" | "Caretaker">("Super-Admin");
  const [adminPropertyId, setAdminPropertyId] = useState("");
  const [adminPin, setAdminPin] = useState("");

  const handleTenantNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) {
      setError("Please select your residence building first.");
      return;
    }
    setError(null);
    setTenantStep(2);
  };

  const handleTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantPhone || !tenantRoom) {
      setError("Please provide both phone number and room number.");
      return;
    }

    setLoading(true);
    setError(null);

    const cleanPhone = tenantPhone.replace(/\D/g, "");

    try {
      const response = await fetch("/api/auth/tenant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: selectedPropertyId,
          phone_number: cleanPhone,
          room_number: tenantRoom.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      onTenantLogin(data.session, data.tenant);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminRole === "Caretaker" && !adminPropertyId) {
      setError("Caretakers must select their assigned property.");
      return;
    }
    if (!adminPin) {
      setError("Please provide your login security PIN.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: adminRole,
          pin: adminPin,
          property_id: adminRole === "Caretaker" ? adminPropertyId : undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Incorrect security PIN.");
      }

      onAdminLogin(data.session);
    } catch (err: any) {
      setError(err.message || "Failed to sanitize user PIN.");
    } finally {
      setLoading(false);
    }
  };

  const selectedPropertyName = properties.find(p => p.property_id === selectedPropertyId)?.property_name || "Residence";

  return (
    <div id="auth-container" className="min-h-screen flex flex-col justify-center items-center px-4 bg-slate-50">
      {/* Container Card */}
      <div id="auth-card" className="w-full max-w-md bg-white overflow-hidden high-contrast-card">
        {/* Toggle Header */}
        <div id="auth-tabs" className="flex border-b border-slate-100 bg-slate-50/50 p-1">
          <button
            id="tab-tenant"
            onClick={() => {
              setLoginMode("tenant");
              setError(null);
            }}
            className={`flex-1 py-3 text-sm font-medium rounded-xl text-center transition-all ${
              loginMode === "tenant"
                ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/50"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Tenant Portal
          </button>
          <button
            id="tab-admin"
            onClick={() => {
              setLoginMode("admin");
              setError(null);
            }}
            className={`flex-1 py-3 text-sm font-medium rounded-xl text-center transition-all ${
              loginMode === "admin"
                ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/50"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Property Admin
          </button>
        </div>

        {/* Card Body */}
        <div id="auth-body" className="p-6 md:p-8">
          <div id="brand-header" className="mb-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-3">
              <Building2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold font-display tracking-tight text-slate-900">
              {loginMode === "tenant" ? "Resident Access Hub" : "Staff Operations Desk"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {loginMode === "tenant" 
                ? "Secure phone authentication for registered estate tenants" 
                : "Management access desk for landlords and on-site caretakers"
              }
            </p>
          </div>

          {error && (
            <div id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs text-left">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TENANT FLOW */}
          {loginMode === "tenant" && (
            <div>
              {tenantStep === 1 ? (
                /* STEP 1: Property Selection */
                <form id="tenant-form-step1" onSubmit={handleTenantNext} className="space-y-4">
                  <div className="text-left">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                      Select Your Apartment Building
                    </label>
                    <div className="relative">
                      <select
                        id="tenant-property-select"
                        value={selectedPropertyId}
                        onChange={(e) => setSelectedPropertyId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none text-slate-800"
                      >
                        <option value="">-- Choose Residence Plot --</option>
                        {properties.map((p) => (
                          <option key={p.property_id} value={p.property_id}>
                            🏢 {p.property_name} ({p.geographic_location})
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400">
                        ▼
                      </div>
                    </div>
                  </div>

                  <button
                    id="tenant-btn-next"
                    type="submit"
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    Continue to Credentials
                    <LogIn className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* STEP 2: Phone & Room PIN Matching */
                <form id="tenant-form-step2" onSubmit={handleTenantSubmit} className="space-y-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Selected Plot:</span>
                      <span className="text-xs font-bold text-slate-800">{selectedPropertyName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTenantStep(1)}
                      className="text-[10px] text-indigo-600 font-bold hover:underline"
                    >
                      Change Building
                    </button>
                  </div>

                  <div className="text-left space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wider">
                        Registered Phone Number
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-slate-400 font-medium">+254</span>
                        <input
                          id="tenant-phone-input"
                          type="tel"
                          placeholder="712345678"
                          value={tenantPhone.startsWith("2547") ? tenantPhone.slice(3) : tenantPhone}
                          onChange={(e) => setTenantPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-14 pr-3.5 py-3 text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800"
                          required
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">Format: Safaricom Mobile (e.g. 712345678)</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wider">
                        Assigned Apartment / Room PIN
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                        <input
                          id="tenant-room-input"
                          type="text"
                          placeholder="e.g. 102 or A1"
                          value={tenantRoom}
                          onChange={(e) => setTenantRoom(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-3 text-sm font-semibold uppercase tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800"
                          required
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">Your assigned room code acts as your secure entry passkey</span>
                    </div>
                  </div>

                  <button
                    id="tenant-btn-login"
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 mt-4"
                  >
                    {loading ? "Authorizing resident..." : "Login to My Portal"}
                    <LogIn className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ADMIN FLOW */}
          {loginMode === "admin" && (
            <form id="admin-form" onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="text-left space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Select Management Role
                  </label>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setAdminRole("Super-Admin");
                        setError(null);
                      }}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg text-center transition-all ${
                        adminRole === "Super-Admin" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Super-Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdminRole("Caretaker");
                        setError(null);
                      }}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg text-center transition-all ${
                        adminRole === "Caretaker" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Caretaker (Property Limited)
                    </button>
                  </div>
                </div>

                {adminRole === "Caretaker" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                      Select Managed Building Plot
                    </label>
                    <div className="relative">
                      <select
                        id="admin-property-select"
                        value={adminPropertyId}
                        onChange={(e) => setAdminPropertyId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none text-slate-800"
                        required
                      >
                        <option value="">-- Choose Your Assignment --</option>
                        {properties.map((p) => (
                          <option key={p.property_id} value={p.property_id}>
                            🏢 {p.property_name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400">
                        ▼
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Login PIN Authenticator
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="admin-pin-input"
                      type="password"
                      placeholder="••••"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-3 text-sm font-mono tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {adminRole === "Super-Admin" 
                      ? "Demo PIN: 1234 (Global administration rights)" 
                      : "Caretaker PIN: 5678 or 2026 (Assigned building limited viewport)"
                    }
                  </span>
                </div>
              </div>

              <button
                id="admin-btn-login"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 mt-4"
              >
                {loading ? "Logging in..." : `Authenticate as ${adminRole}`}
                <LogIn className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="text-slate-400 text-[11px] mt-6 flex items-center gap-1">
        <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
        <span>Designed & optimized for fast loading on smartphone mobile browsers</span>
      </div>
    </div>
  );
}
