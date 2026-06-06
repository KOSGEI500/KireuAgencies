import React, { useState, useEffect } from "react";
import { Property, Room, Tenant, Payment, MaintenanceTicket, AdminSession } from "../types";
import { 
  Building2, Users, Receipt, Wrench, Shield, LogOut, CheckCircle, Plus, 
  Trash2, PlusCircle, Smartphone, Sparkles, Filter, Landmark, MapPin, Eye, AlertCircle
} from "lucide-react";

interface AdminPortalProps {
  session: AdminSession;
  properties: Property[];
  onLogout: () => void;
  onRefreshProperties: () => void;
}

export default function AdminPortal({ session, properties, onLogout, onRefreshProperties }: AdminPortalProps) {
  // Active selected property to view (Defaults to caretaker's assigned property ID or the first property in properties)
  const isCaretaker = session.role === "Caretaker";
  const mandatedPropertyId = isCaretaker ? session.property_id! : "";
  
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceTicket[]>([]);

  // Tab State
  const [activeTab, setActiveTab] = useState<"dashboard" | "rooms" | "tenants" | "payments" | "maintenance" | "properties">("dashboard");

  // Form states
  const [newPropName, setNewPropName] = useState("");
  const [newPropLoc, setNewPropLoc] = useState("");
  const [propError, setPropError] = useState<string | null>(null);

  const [newRoomNum, setNewRoomNum] = useState("");
  const [newRoomRent, setNewRoomRent] = useState("");
  const [newRoomUtil, setNewRoomUtil] = useState("");
  const [newRoomPropId, setNewRoomPropId] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);

  // Tenant assignment state
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantPhone, setNewTenantPhone] = useState("");
  const [newTenantPropId, setNewTenantPropId] = useState("");
  const [newTenantRoom, setNewTenantRoom] = useState("");
  const [newTenantReg, setNewTenantReg] = useState(new Date().toISOString().split("T")[0]);
  const [vacantRooms, setVacantRooms] = useState<Room[]>([]);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tenantSuccess, setTenantSuccess] = useState<string | null>(null);

  // Clear balance Form
  const [manualPayTenantId, setManualPayTenantId] = useState("");
  const [manualPayAmount, setManualPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);
  const [stkTriggering, setStkTriggering] = useState<string | null>(null);

  // Filter properties based on role (Caretaker is fenced strictly to mandatedPropertyId)
  const visibleProperties = isCaretaker 
    ? properties.filter(p => p.property_id === mandatedPropertyId) 
    : properties;

  // Selected viewport property object
  const currentPropertyObj = properties.find(p => p.property_id === (isCaretaker ? mandatedPropertyId : selectedPropertyId)) 
    || visibleProperties[0];

  // Dynamic branding - portal titles and branding cards auto-bind to this selected plot name string
  const activeBrandName = currentPropertyObj ? currentPropertyObj.property_name : "Central Management Hub";

  // Initial selects set
  useEffect(() => {
    if (isCaretaker) {
      setSelectedPropertyId(mandatedPropertyId);
    } else if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].property_id);
    }
  }, [properties, isCaretaker]);

  // Set default properties in dropdowns
  useEffect(() => {
    if (currentPropertyObj) {
      setNewRoomPropId(currentPropertyObj.property_id);
      setNewTenantPropId(currentPropertyObj.property_id);
    }
  }, [currentPropertyObj]);

  // Load rooms and state on property change
  useEffect(() => {
    if (selectedPropertyId) {
      fetchPropertySpecifics();
    }
  }, [selectedPropertyId, activeTab]);

  // Regular dashboard polling (refresh telemetry every 5s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPropertySpecifics();
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedPropertyId]);

  // Dynamic query of vacant rooms within selected property
  useEffect(() => {
    const targetProp = newTenantPropId || selectedPropertyId;
    if (targetProp) {
      // Find vacant rooms in local rooms state or fetch
      fetch(`/api/properties/${targetProp}/rooms`)
        .then(res => res.json())
        .then((roomsList: Room[]) => {
          const vacant = roomsList.filter(r => r.status === "Vacant");
          setVacantRooms(vacant);
          if (vacant.length > 0) {
            setNewTenantRoom(vacant[0].room_number);
          } else {
            setNewTenantRoom("");
          }
        });
    }
  }, [newTenantPropId, selectedPropertyId, rooms]);

  const fetchPropertySpecifics = async () => {
    if (!selectedPropertyId) return;

    try {
      // 1. Fetch Rooms in Property
      const roomsResponse = await fetch(`/api/properties/${selectedPropertyId}/rooms`);
      if (roomsResponse.ok) {
        const roomsList = await roomsResponse.json();
        setRooms(roomsList);
      }

      // 2. Fetch Tenants
      const tenantsResponse = await fetch("/api/tenants");
      if (tenantsResponse.ok) {
        const tenantsList: any[] = await tenantsResponse.json();
        // Fence tenants list to property if caretaker or based on select.
        setTenants(tenantsList.filter(t => t.property_id === selectedPropertyId));
      }

      // 3. Fetch Payments
      const paymentsResponse = await fetch("/api/payments");
      if (paymentsResponse.ok) {
        const paymentsList: Payment[] = await paymentsResponse.json();
        setPayments(paymentsList.filter(p => p.property_id === selectedPropertyId));
      }

      // 4. Fetch Maintenance Tickets
      const maintenanceResponse = await fetch("/api/maintenance");
      if (maintenanceResponse.ok) {
        const maintenanceList: MaintenanceTicket[] = await maintenanceResponse.json();
        setMaintenance(maintenanceList.filter(m => m.property_id === selectedPropertyId));
      }
    } catch (error) {
      console.error("Error fetching admin telemetry metrics:", error);
    }
  };

  // Add property (Global Super-Admin only)
  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCaretaker) return;
    if (!newPropName || !newPropLoc) {
      setPropError("All estate details are required.");
      return;
    }

    setPropError(null);
    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_name: newPropName.trim(),
          geographic_location: newPropLoc.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create estate record.");
      }

      setNewPropName("");
      setNewPropLoc("");
      onRefreshProperties();
      alert("Property plot added successfully!");
    } catch (err: any) {
      setPropError(err.message || "Failed to catalog estate.");
    }
  };

  // Add Room (Global or caretaker)
  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNum || !newRoomRent || !newRoomUtil || !newRoomPropId) {
      setRoomError("Please fill out complete unit pricing specifications.");
      return;
    }

    setRoomError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_number: newRoomNum.trim(),
          property_id: newRoomPropId,
          monthly_rent: Number(newRoomRent),
          utility_rate: Number(newRoomUtil)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to log room unit.");
      }

      setNewRoomNum("");
      setNewRoomRent("");
      setNewRoomUtil("");
      fetchPropertySpecifics();
      alert("Apartment unit registered as Vacant.");
    } catch (err: any) {
      setRoomError(err.message || "Error creating unit.");
    }
  };

  // Tenant Register with Realtime Occupy State Change
  const handleRegisterTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);
    setTenantSuccess(null);

    if (!newTenantName || !newTenantPhone || !newTenantPropId || !newTenantRoom || !newTenantReg) {
      setTenantError("Please specify name, phone, building anniversary and a vacant room.");
      return;
    }

    const cleanPhone = newTenantPhone.replace(/\D/g, "");
    if (!/^254[71]\d{8}$/.test(cleanPhone)) {
      setTenantError("Phone number must match Safaricom format (2547XXXXXXXX)");
      return;
    }

    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: newTenantName.trim(),
          phone_number: cleanPhone,
          property_id: newTenantPropId,
          assigned_room_number: newTenantRoom,
          registration_date: newTenantReg
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to register resident.");
      }

      setTenantSuccess(`Tenant "${newTenantName}" registered inside Room ${newTenantRoom}. Unit occupied.`);
      setNewTenantName("");
      setNewTenantPhone("");
      fetchPropertySpecifics();
    } catch (err: any) {
      setTenantError(err.message || "Error register tenant.");
    }
  };

  // Super-Admin Only Evict Tenant (Evicts, sets Room to Vacant)
  const handleEvictTenant = async (tenantId: string) => {
    if (isCaretaker) {
      alert("Access Denied: Only Super-Admin maintains eviction and tenant deletion rights.");
      return;
    }

    if (!confirm("Are you sure you want to terminate this tenancy lease? This immediately vacants the unit in real-time.")) {
      return;
    }

    try {
      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: "DELETE"
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Lease termination handshake failed.");
      }

      alert("Tenancy terminated successfully. Apartment unit status set to Vacant.");
      fetchPropertySpecifics();
    } catch (err: any) {
      alert(err.message || "Error terminating tenancy.");
    }
  };

  // Patch repair ticket status
  const handleUpdateTicketStatus = async (ticketId: string, status: "Pending" | "In Progress" | "Resolved") => {
    try {
      const response = await fetch(`/api/maintenance/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        fetchPropertySpecifics();
      } else {
        const d = await response.json();
        alert(d.error || "Repair update failed");
      }
    } catch (err) {
      console.error("Ticket update error:", err);
    }
  };

  // Clear Balance manually
  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    setPaySuccess(null);

    if (!manualPayTenantId || !manualPayAmount || Number(manualPayAmount) <= 0) {
      setPayError("Please select a tenant and provide a positive cleared amount.");
      return;
    }

    try {
      const response = await fetch("/api/payments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: manualPayTenantId,
          amount: Number(manualPayAmount)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Receipt submission failed.");
      }

      setPaySuccess("Cleared amount log logged successfully inside system ledger.");
      setManualPayAmount("");
      fetchPropertySpecifics();
    } catch (err: any) {
      setPayError(err.message);
    }
  };

  // Trigger STK Push popup to tenant on behalf from dashboard
  const handleTriggerMpesaOnBehalf = async (tenantRef: any) => {
    setStkTriggering(tenantRef.tenant_id);
    try {
      const response = await fetch("/api/payments/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantRef.tenant_id,
          phone_number: tenantRef.phone_number,
          amount: Math.round(Number(tenantRef.billing?.outstandingBalance || 100))
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      alert(`Lipa Na M-Pesa STK push popup sent on-behalf to ${tenantRef.full_name} (+254${tenantRef.phone_number.slice(-9)}) KES ${Math.round(tenantRef.billing?.outstandingBalance)}`);
      fetchPropertySpecifics();
    } catch (err: any) {
      alert(`Handshake rejected: ${err.message || "Verification fail"}`);
    } finally {
      setStkTriggering(null);
    }
  };

  // METRICS CALCULATIONS (FOR CURRENT VISUAL PLOT TELEMETRY)
  const totalUnits = rooms.length;
  const vacantUnitsCount = rooms.filter(r => r.status === "Vacant").length;
  const occupiedUnitsCount = rooms.filter(r => r.status === "Occupied").length;

  const totalOwedInPlot = tenants.reduce((s, t) => s + (t.billing?.outstandingBalance || 0), 0);
  const totalClearedInPlot = payments.reduce((s, p) => s + p.amount, 0);

  const pendingTicketsCount = maintenance.filter(m => m.status === "Pending").length;
  const resolvingTicketsCount = maintenance.filter(m => m.status === "In Progress").length;

  return (
    <div id="admin-portal-root" className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-left">
      
      {/* SIDEBAR NAVIGATION - Optimized for both desktop and mobile rails */}
      <aside id="admin-sidebar" className="w-full md:w-64 bg-slate-900 text-white shrink-0 flex flex-col border-r border-slate-800">
        <div className="p-5 border-b border-slate-800 flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-400" />
          <div className="text-left">
            <h2 className="text-sm font-bold tracking-tight font-display text-white">Landlord Desk Console</h2>
            <p className="text-[10px] text-slate-400 font-mono font-medium">{session.role} Auth Session</p>
          </div>
        </div>

        {/* Current Active Building branding card inside the Sidebar */}
        {currentPropertyObj && (
          <div className="mx-4 my-3 p-3 bg-slate-800 rounded-xl border border-slate-700/50 text-left">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Active Working Hub</span>
            <h4 className="text-xs font-bold text-emerald-400 font-display mt-0.5 truncate">{activeBrandName}</h4>
            <p className="text-[9px] text-slate-350 flex items-center gap-1 mt-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span>{currentPropertyObj.geographic_location}</span>
            </p>
          </div>
        )}

        {/* Property Selector for Super-Admin */}
        {!isCaretaker && properties.length > 1 && (
          <div className="px-4 pb-2 text-left">
            <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Switch Managed Plot</label>
            <div className="relative">
              <select
                id="sidebar-property-select"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 appearance-none"
              >
                {properties.map(p => (
                  <option key={p.property_id} value={p.property_id}>
                    🏢 {p.property_name}
                  </option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[8px]">▼</span>
            </div>
          </div>
        )}

        <nav className="flex-grow p-4 space-y-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "dashboard" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Working Dashboard</span>
          </button>
          
          <button
            onClick={() => setActiveTab("rooms")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "rooms" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Manage Unit Rooms</span>
          </button>

          <button
            onClick={() => setActiveTab("tenants")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "tenants" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Tenancy Placement</span>
          </button>

          <button
            onClick={() => setActiveTab("payments")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "payments" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Payments Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab("maintenance")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all relative ${
              activeTab === "maintenance" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Maintenance Tickets</span>
            {pendingTicketsCount > 0 && (
              <span className="absolute right-2 px-1.5 py-0.5 bg-rose-500 text-white font-mono text-[9px] font-bold rounded-full">{pendingTicketsCount}</span>
            )}
          </button>

          {!isCaretaker && (
            <button
              onClick={() => setActiveTab("properties")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "properties" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register New Plot</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs mb-3 text-slate-400 px-1">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <span>Agent Server Online</span>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-bold rounded-lg text-xs transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout Account</span>
          </button>
        </div>
      </aside>

      {/* MAIN VIEWPORT SCREEN AREA */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        
        {/* TOP STATUS NAVIGATION PANEL */}
        <header id="admin-top-panel" className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="text-left">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">Relational Admin Platform</span>
            <h1 className="text-lg font-extrabold tracking-tight font-display text-slate-900 mt-0.5">{activeBrandName} operations</h1>
            <p className="text-[11px] text-slate-400">
              Assigned Estate Admin: <strong className="text-slate-850">{session.name}</strong> 
              {isCaretaker && " (Fenced caretakers RBAC locks active)"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-400">Autosync standard polling</span>
            <button
              onClick={fetchPropertySpecifics}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-xs rounded-xl font-bold border border-slate-200 flex items-center gap-1 cursor-pointer transition-all"
            >
              🔄 Forcesync
            </button>
          </div>
        </header>

        {/* 2. WORKING DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            
            {/* 4 BENTO ANALYTICS CARDS */}
            <section id="bento-grid" className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="high-contrast-card p-5 text-left bg-white">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Monthly Collection</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">KES {totalClearedInPlot.toLocaleString()}</h3>
                <p className="text-xs text-emerald-600 mt-2 flex items-center">✓ Verified through ledger</p>
              </div>

              <div className="high-contrast-card p-5 text-left bg-white">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Occupancy Rate</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {totalUnits > 0 ? ((occupiedUnitsCount / totalUnits) * 100).toFixed(1) : 0}%
                </h3>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${totalUnits > 0 ? (occupiedUnitsCount / totalUnits) * 100 : 0}%` }}></div>
                </div>
              </div>

              <div className="high-contrast-card p-5 text-left bg-white">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Pending Maintenance</p>
                <h3 className="text-2xl font-bold text-amber-600 mt-1">{String(pendingTicketsCount + resolvingTicketsCount).padStart(2, '0')} Tickets</h3>
                <p className="text-xs text-slate-400 mt-2">{pendingTicketsCount} urgent requests</p>
              </div>

              <div className="high-contrast-card p-5 text-left bg-white">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Unpaid Tenants</p>
                <h3 className="text-2xl font-bold text-red-600 mt-1">
                  {String(tenants.filter(t => (t.billing?.outstandingBalance || 0) > 0).length).padStart(2, '0')} Units
                </h3>
                <p className="text-xs text-slate-400 mt-2">Active balance outstanding</p>
              </div>
            </section>

            {/* QUICK ACTIONS & MAP BRIDGING */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* TENANT OUTSTANDING LEDGER */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-left high-contrast-card">
                <h3 className="font-bold text-sm text-slate-900 font-display mb-4">
                  👥 Resident Balances & Billing States
                </h3>

                {tenants.length === 0 ? (
                  <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                    <p className="text-xs text-slate-400">No tenants registered on {activeBrandName} yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold">
                          <th className="p-3">Tenant Name</th>
                          <th className="p-3 text-center">Room</th>
                          <th className="p-3">Billing Cycle</th>
                          <th className="p-3 text-right">Owed</th>
                          <th className="p-3 text-center">State</th>
                          <th className="p-3 text-right">M-Pesa Trigger</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map((t) => {
                          const isOwed = (t.billing?.outstandingBalance || 0) > 0;
                          return (
                            <tr key={t.tenant_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="p-3">
                                <span className="font-bold text-slate-900 block">{t.full_name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">0{t.phone_number.slice(-9)}</span>
                              </td>
                              <td className="p-3 text-center font-bold font-mono text-slate-800">
                                {t.assigned_room_number}
                              </td>
                              <td className="p-3 text-slate-500 font-medium">
                                {t.billing?.cycleLabel || "calculating..."}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-800">
                                {t.billing?.outstandingBalance?.toLocaleString()} KES
                              </td>
                              <td className="p-3 text-center">
                                <span className={`status-badge ${
                                  t.billing?.status === "🟢 Paid" ? "bg-emerald-100 text-emerald-700" :
                                  t.billing?.status === "🟡 Partially Paid" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                }`}>
                                  {t.billing?.status?.substring(2) || "Unpaid"}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  id={`stk-trigger-${t.tenant_id}`}
                                  disabled={!isOwed || stkTriggering === t.tenant_id}
                                  onClick={() => handleTriggerMpesaOnBehalf(t)}
                                  className="px-3 py-1.5 mpesa-green hover:opacity-90 disabled:bg-slate-50 text-white disabled:text-slate-400 font-bold rounded-lg text-[10px] transition-all flex items-center gap-1 ml-auto cursor-pointer"
                                >
                                  {stkTriggering === t.tenant_id ? "Triggering..." : "STK Push"}
                                  <Smartphone className="w-3 h-3 text-white/90" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* MANUAL BALANCE SETTLEMENT SLATE */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-left flex flex-col justify-between high-contrast-card">
                <div>
                  <h3 className="font-bold text-m text-slate-900 font-display mb-3">
                    💰 Settlement Registry
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">Secure cash checkout or physical check log cleared states directly:</p>

                  {payError && (
                    <div className="mb-3 p-2.5 bg-red-50 border border-red-150 rounded-xl text-red-700 text-xs text-left flex gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{payError}</span>
                    </div>
                  )}

                  {paySuccess && (
                    <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-150 rounded-xl text-emerald-800 text-xs text-left flex gap-1.5">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                      <span>{paySuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleManualPayment} className="space-y-3.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Tenant</label>
                      <select
                        id="pay-tenant-select"
                        value={manualPayTenantId}
                        onChange={(e) => setManualPayTenantId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-800"
                        required
                      >
                        <option value="">-- Choose Tenant --</option>
                        {tenants.map(t => (
                          <option key={t.tenant_id} value={t.tenant_id}>
                            👤 {t.full_name} (Room {t.assigned_room_number} - Balance: {t.billing?.outstandingBalance} KES)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Payment Cleared Amount (KES)</label>
                      <input
                        id="pay-amount-input"
                        type="number"
                        placeholder="e.g., 15000"
                        value={manualPayAmount}
                        onChange={(e) => setManualPayAmount(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-800"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase cursor-pointer"
                    >
                      <span>Log Off-Line Clearance</span>
                      <Receipt className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* 3. MANAGE UNIT ROOMS TAB */}
        {activeTab === "rooms" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* ADD ROOM PANEL */}
            <div className="lg:col-span-4 bg-white p-5 shadow-xs text-left h-fit high-contrast-card">
              <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-1.5 mb-2">
                <Plus className="w-5 h-5 text-emerald-500" />
                <span>Register Unit Room</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">Catalog vacancy dimensions specifically under relational structures:</p>

              {roomError && (
                <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{roomError}</span>
                </div>
              )}

              <form onSubmit={handleAddRoom} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Room Number Code</label>
                  <input
                    id="new-room-num"
                    type="text"
                    placeholder="e.g. 104, B2"
                    value={newRoomNum}
                    onChange={(e) => setNewRoomNum(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold uppercase tracking-wider text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Monthly Billing Rent (KES)</label>
                  <input
                    id="new-room-rent"
                    type="number"
                    placeholder="e.g. 15000"
                    value={newRoomRent}
                    onChange={(e) => setNewRoomRent(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Monthly Flat Utility Rate (KES)</label>
                  <input
                    id="new-room-util"
                    type="number"
                    placeholder="e.g. 1200"
                    value={newRoomUtil}
                    onChange={(e) => setNewRoomUtil(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target Plot Property Binder</label>
                  <select
                    id="new-room-propid"
                    value={newRoomPropId}
                    onChange={(e) => setNewRoomPropId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  >
                    {visibleProperties.map(p => (
                      <option key={p.property_id} value={p.property_id}>🏢 {p.property_name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Create New Room
                </button>
              </form>
            </div>

            {/* ROOM LIST TABLE */}
            <div className="lg:col-span-8 bg-white p-5 shadow-xs text-left high-contrast-card">
              <h3 className="font-bold text-sm text-slate-900 font-display mb-4">
                🏡 Floor Space Units ({rooms.length})
              </h3>

              {rooms.length === 0 ? (
                <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                  <p className="text-xs text-slate-400">No rooms generated for this property yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 font-bold">
                        <th className="p-3">Room Code</th>
                        <th className="p-3">Rent Rate</th>
                        <th className="p-3">Utility flat rate</th>
                        <th className="p-3">Total Monthly Rate</th>
                        <th className="p-3 text-center">Placement State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="p-3 font-bold font-mono text-slate-900 text-sm">{r.room_number}</td>
                          <td className="p-3 font-mono">{r.monthly_rent.toLocaleString()} KES</td>
                          <td className="p-3 font-mono text-slate-500">{r.utility_rate.toLocaleString()} KES</td>
                          <td className="p-3 font-bold font-mono text-slate-850">{(r.monthly_rent + r.utility_rate).toLocaleString()} KES</td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                              r.status === "Vacant" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-blue-50 text-blue-800 border border-blue-100"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* 4. PLACEMENT REGISTER USER TAB */}
        {activeTab === "tenants" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* NEW TENANT REGISTER WITH ALLOCATION GUARD */}
            <div className="lg:col-span-4 bg-white p-5 shadow-xs text-left h-fit high-contrast-card">
              <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-1.5 mb-2">
                <Users className="w-5 h-5 text-emerald-500" />
                <span>Register Tenant Lease</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">Dynamic allocation guarantees room is immediately occupied in real-time:</p>

              {tenantError && (
                <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{tenantError}</span>
                </div>
              )}

              {tenantSuccess && (
                <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex gap-1.5">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                  <span>{tenantSuccess}</span>
                </div>
              )}

              <form onSubmit={handleRegisterTenant} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Full Legal Name</label>
                  <input
                    id="new-tenant-name"
                    type="text"
                    placeholder="e.g. Collins Kosgei"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Safaricom Phone Number (+254)</label>
                  <input
                    id="new-tenant-phone"
                    type="tel"
                    placeholder="254712345678"
                    value={newTenantPhone}
                    onChange={(e) => setNewTenantPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                  <span className="text-[9px] text-slate-400 block mt-0.5">M-Pesa pushes trigger directly here</span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Building Placement</label>
                  <select
                    id="new-tenant-propid"
                    value={newTenantPropId}
                    onChange={(e) => setNewTenantPropId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  >
                    {visibleProperties.map(p => (
                      <option key={p.property_id} value={p.property_id}>🏢 {p.property_name}</option>
                    ))}
                  </select>
                </div>

                {/* STRICT ROOM ALLOCATION & SAFETY GUARDS */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-405 uppercase mb-1">
                    Select Vacant Apartment Code
                  </label>
                  <select
                    id="new-tenant-room"
                    value={newTenantRoom}
                    onChange={(e) => setNewTenantRoom(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    required
                    disabled={vacantRooms.length === 0}
                  >
                    {vacantRooms.map(r => (
                      <option key={r.room_number} value={r.room_number}>🚪 ROOM {r.room_number} (KES {r.monthly_rent + r.utility_rate})</option>
                    ))}
                  </select>
                  {vacantRooms.length === 0 ? (
                    <span className="text-[10px] text-red-500 font-bold block mt-1">🔴 Property is at maximum capacity (0 Vacant units available)</span>
                  ) : (
                    <span className="text-[9px] text-emerald-650 block mt-1">✓ Displaying ONLY Vacant units within selected property bounds</span>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Monthly Billing Anniversary Day</label>
                  <input
                    id="new-tenant-reg"
                    type="date"
                    value={newTenantReg}
                    onChange={(e) => setNewTenantReg(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                  <span className="text-[9px] text-slate-400 block mt-0.5">Rent ledger auto-unpaid resets on this day of each month</span>
                </div>

                <button
                  type="submit"
                  disabled={vacantRooms.length === 0}
                  className="w-full py-2.5 bg-slate-900 disabled:bg-slate-200 hover:bg-slate-800 disabled:text-slate-450 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Occupy & Launch Lease
                </button>
              </form>
            </div>

            {/* TENANTS ACTIVE REGISTRY TABLE */}
            <div className="lg:col-span-8 bg-white p-5 shadow-xs text-left high-contrast-card">
              <h3 className="font-bold text-sm text-slate-900 font-display mb-4">
                👤 Active Residents Ledger ({tenants.length})
              </h3>

              {tenants.length === 0 ? (
                <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                  <p className="text-xs text-slate-400">No tenants registered on {activeBrandName} yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 font-bold">
                        <th className="p-3">Full Legal Name</th>
                        <th className="p-3 text-center">Assigned Unit</th>
                        <th className="p-3 text-right">Rent Owed</th>
                        <th className="p-3">Registration Anniversary</th>
                        <th className="p-3 text-right">Operations Gate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((t) => (
                        <tr key={t.tenant_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 text-xs block">{t.full_name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">+254 {t.phone_number.slice(-9)}</span>
                          </td>
                          <td className="p-3 text-center font-bold font-mono text-slate-800 text-sm">
                            {t.assigned_room_number}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800">
                            {t.billing?.outstandingBalance?.toLocaleString()} KES
                          </td>
                          <td className="p-3 text-slate-500 font-medium">
                            📅 {new Date(t.registration_date).toLocaleDateString("en-KE")} 
                            <span className="text-[10px] text-indigo-600 font-bold block">Day {t.registration_date.split("-")[2]} billing reset</span>
                          </td>
                          <td className="p-3 text-right">
                            {isCaretaker ? (
                              <span className="text-[10px] text-slate-300 italic">No termination rights</span>
                            ) : (
                              <button
                                id={`evict-tenant-${t.tenant_id}`}
                                onClick={() => handleEvictTenant(t.tenant_id)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all ml-auto block flex items-center justify-center cursor-pointer"
                                title="Terminate tenancy lease & reset room status to Vacant"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* 5. PAYMENTS LEDGER TAB */}
        {activeTab === "payments" && (
          <div className="bg-white p-5 shadow-xs text-left high-contrast-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-900 font-display">
                📋 Confirmed Payments ledger ({payments.length})
              </h3>
              <span className="text-xs text-slate-400 italic">Auto-polled ledger details</span>
            </div>

            {payments.length === 0 ? (
              <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-xs text-slate-400">No payment records located under {activeBrandName} unit ledger.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 font-bold">
                      <th className="p-3">Receipt Code Invoice</th>
                      <th className="p-3">Verified Tenant</th>
                      <th className="p-3 text-center">Assigned apartment</th>
                      <th className="p-3">Payment Mode</th>
                      <th className="p-3 text-right">Validated Amount (KES)</th>
                      <th className="p-3 text-right">Completion Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const associatedTenant = tenants.find(t => t.tenant_id === p.tenant_id);
                      return (
                        <tr key={p.transaction_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-slate-800 text-xs">{p.transaction_id}</td>
                          <td className="p-3 font-bold text-slate-700">{associatedTenant?.full_name || "Unknown tenant"}</td>
                          <td className="p-3 text-center font-bold font-mono text-slate-800">{associatedTenant?.assigned_room_number || "A"}</td>
                          <td className="p-3">
                            <span className={`status-badge ${
                              p.payment_mode === "M-PESA" ? "bg-emerald-100 text-emerald-700" : "bg-teal-100 text-teal-800"
                            }`}>
                              {p.payment_mode}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900 text-sm">{p.amount.toLocaleString()} KES</td>
                          <td className="p-3 text-right text-slate-400 font-medium">{new Date(p.timestamp).toLocaleString("en-KE")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 6. MAINTENANCE TICKETS TAB */}
        {activeTab === "maintenance" && (
          <div className="bg-white p-5 shadow-xs text-left high-contrast-card">
            <h3 className="font-bold text-sm text-slate-900 font-display mb-4">
              🛠️ Repair requests Filed under {activeBrandName} ({maintenance.length})
            </h3>

            {maintenance.length === 0 ? (
              <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-xs text-slate-400">Perfect scorecard: no damages or light bulk malfunctions registered yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sidebarCaretakerMap().map((t: MaintenanceTicket) => {
                  const associatedTenant = tenants.find(user => user.tenant_id === t.tenant_id);
                  return (
                    <div key={t.ticket_id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-sm shrink-0">
                              {t.issue_type === "Toilet" ? "🚽" : t.issue_type === "Bulb" ? "💡" : t.issue_type === "Socket" ? "🔌" : t.issue_type === "Paint" ? "🎨" : "🛠️"}
                            </div>
                            <div className="text-left">
                              <span className="text-[10px] text-slate-400 font-mono block">Ticket ID: {t.ticket_id}</span>
                              <h4 className="text-xs font-bold text-slate-800">{t.issue_type} breakage</h4>
                            </div>
                          </div>
                          <span className={`status-badge ${
                            t.status === "Resolved" ? "bg-emerald-100 text-emerald-700" :
                            t.status === "In Progress" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          }`}>
                            {t.status === "In Progress" ? "Resolving" : t.status}
                          </span>
                        </div>

                        <div className="p-2 bg-white rounded-lg border border-slate-200 text-xs mt-1 text-slate-700 leading-relaxed text-left min-h-[48px]">
                          {t.description}
                        </div>

                        {t.photo_url && (
                          <div className="text-left">
                            <span className="text-[9px] text-slate-400 block mb-1">Tenant Camera Capture:</span>
                            <img
                              src={t.photo_url}
                              alt="Damage report capture"
                              className="w-20 h-20 rounded-md object-cover ring-1 ring-slate-200"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
                        <div className="text-left">
                          <span>Reported by: <strong className="text-slate-700">{associatedTenant?.full_name || "Resident"} (Room {associatedTenant?.assigned_room_number})</strong></span>
                        </div>

                        {/* Interactive Status Changer */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400 uppercase font-bold mr-1">Mark:</span>
                          <button
                            id={`mark-progress-${t.ticket_id}`}
                            onClick={() => handleUpdateTicketStatus(t.ticket_id, "In Progress")}
                            className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 font-semibold rounded-md text-[10px] transition-all cursor-pointer"
                          >
                            Work On
                          </button>
                          <button
                            id={`mark-resolved-${t.ticket_id}`}
                            onClick={() => handleUpdateTicketStatus(t.ticket_id, "Resolved")}
                            className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold rounded-md text-[10px] transition-all cursor-pointer"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 7. REGISTER NEW PLOT PROPERTY TAB (Super-Admin only) */}
        {activeTab === "properties" && !isCaretaker && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
            
            {/* ADD ESTATE CARD */}
            <div className="lg:col-span-5 bg-white p-6 shadow-xs high-contrast-card">
              <h3 className="font-extrabold text-sm text-slate-900 font-display flex items-center gap-1.5 mb-2">
                <Landmark className="w-5 h-5 text-emerald-500" />
                <span>Register Plot Building</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">Launch a new custom branded hub under the single portal canopy:</p>

              {propError && (
                <div className="mb-3.5 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{propError}</span>
                </div>
              )}

              <form onSubmit={handleAddProperty} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Plot Branded Name</label>
                  <input
                    id="new-prop-name"
                    type="text"
                    placeholder="e.g. Milimani Court"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Geographic Location (Town/Sub-County)</label>
                  <input
                    id="new-prop-loc"
                    type="text"
                    placeholder="e.g. Milimani, Nairobi"
                    value={newPropLoc}
                    onChange={(e) => setNewPropLoc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Confirm Registration
                </button>
              </form>
            </div>

            {/* REAL RECTANGLE PROPERTIES GRAPHIC LIST */}
            <div className="lg:col-span-7 bg-white p-6 shadow-xs high-contrast-card">
              <h3 className="font-bold text-sm text-slate-900 font-display mb-4">
                🏢 Active Registered Plots ({properties.length})
              </h3>

              <div id="plot-list-grid" className="space-y-3">
                {properties.map((p) => (
                  <div key={p.property_id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="text-left">
                      <h4 className="text-xs font-bold text-slate-800 font-display">{p.property_name}</h4>
                      <p className="text-[10px] text-slate-450 mt-1 flex items-center gap-1 font-medium">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{p.geographic_location}</span>
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Units Created</span>
                        <span className="font-mono text-xs font-bold text-slate-800">{p.total_units} Active Rooms</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </main>

    </div>
  );

  // Caretaker map filter helper
  function sidebarCaretakerMap() {
    return maintenance;
  }
}
