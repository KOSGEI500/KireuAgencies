import React, { useState, useEffect } from "react";
import { Property, Room, Tenant, Payment, MaintenanceTicket } from "../types";
import { 
  Building2, LogOut, Receipt, PlusCircle, Wrench, AlertCircle, 
  Smartphone, Wallet, Compass, Camera, Sparkles, Check, Hourglass, XCircle
} from "lucide-react";

interface TenantPortalProps {
  tenant: Tenant;
  property: Property;
  onLogout: () => void;
}

export default function TenantPortal({ tenant, property, onLogout }: TenantPortalProps) {
  // Billing details
  const [billingDetails, setBillingDetails] = useState<any>(null);
  const [room, setRoom] = useState<Room | null>(null);
  
  // Lists
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);

  // Payment Form
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentPhone, setPaymentPhone] = useState(tenant.phone_number);
  const [paying, setPaying] = useState(false);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // Ticket Form
  const [issueType, setIssueType] = useState<"Bulb" | "Socket" | "Toilet" | "Paint" | "Other">("Bulb");
  const [description, setDescription] = useState("");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);

  // Dynamic branding is achieved by binding Header, labels, cards to property's name string
  const customBrandName = property.property_name;

  // Initial Fetches
  useEffect(() => {
    fetchTenantData();
  }, [tenant.tenant_id]);

  // Polling for payments (especially checking if STK callback successfully updated her status)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pendingCheckoutId || paying) {
      interval = setInterval(() => {
        fetchPaymentsAndCheckPending();
      }, 3000); // Poll every 3s during pending state
    } else {
      interval = setInterval(() => {
        fetchPaymentsAndCheckPending();
      }, 10000); // Standard poll every 10s
    }
    return () => clearInterval(interval);
  }, [pendingCheckoutId, paying]);

  const fetchTenantData = async () => {
    try {
      // Find room
      const roomResponse = await fetch(`/api/properties/${property.property_id}/rooms`);
      if (roomResponse.ok) {
        const roomsList: Room[] = await roomResponse.json();
        const r = roomsList.find(item => item.room_number === tenant.assigned_room_number);
        if (r) setRoom(r);
      }

      // Fetch all tenants to recalculate billing details
      const tenantsResponse = await fetch("/api/tenants");
      if (tenantsResponse.ok) {
        const tenantsList: any[] = await tenantsResponse.json();
        const selfMatch = tenantsList.find(t => t.tenant_id === tenant.tenant_id);
        if (selfMatch && selfMatch.billing) {
          setBillingDetails(selfMatch.billing);
          // Auto fill outstanding balance in payment field
          setPaymentAmount(selfMatch.billing.outstandingBalance.toString());
        }
      }

      // Fetch maintenance tickets
      const ticketsResponse = await fetch("/api/maintenance");
      if (ticketsResponse.ok) {
        const tkts: MaintenanceTicket[] = await ticketsResponse.json();
        setTickets(tkts.filter(t => t.tenant_id === tenant.tenant_id));
      }

      // Fetch payments
      await fetchPaymentsAndCheckPending();
    } catch (err) {
      console.error("Error fetching resident portal metrics:", err);
    }
  };

  const fetchPaymentsAndCheckPending = async () => {
    try {
      const response = await fetch("/api/payments");
      if (response.ok) {
        const pays: Payment[] = await response.json();
        const selfPays = pays.filter(p => p.tenant_id === tenant.tenant_id);
        setPayments(selfPays);

        // Check if our pending checkout request is now Completed or Failed
        if (pendingCheckoutId) {
          const match = selfPays.find(p => p.checkout_request_id === pendingCheckoutId);
          if (match) {
            if (match.status === "Completed") {
              setPaymentSuccess("M-Pesa payment received and cleared! Receipt: " + match.transaction_id);
              setPendingCheckoutId(null);
              setPaying(false);
              // Refresh everything
              fetchTenantData();
            } else if (match.status === "Failed") {
              setPaymentError("Lipa na M-Pesa transaction was canceled or timed out.");
              setPendingCheckoutId(null);
              setPaying(false);
              fetchTenantData();
            }
          }
        }
      }
    } catch (err) {
      console.error("Polling payments ledger error:", err);
    }
  };

  // Pay rent trigger
  const handleStkPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setPaymentError("Please provide a valid rental payment amount.");
      return;
    }

    setPaying(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    const cleanPhone = paymentPhone.replace(/\D/g, "");

    try {
      const response = await fetch("/api/payments/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenant.tenant_id,
          phone_number: cleanPhone,
          amount: Number(paymentAmount)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "M-Pesa push API handshake failed.");
      }

      setPendingCheckoutId(data.checkoutRequestId);
      setPaymentSuccess(data.message);
    } catch (err: any) {
      setPaymentError(err.message || "Failed to trigger M-Pesa Push transaction.");
      setPaying(false);
    }
  };

  // Maintenance Camera Photo Upload
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setTicketError("Camera photo file size must be less than 5MB to keep records tidy.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Maintenance Submit
  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setTicketError("Please describe the damage or issue detail.");
      return;
    }

    setReporting(true);
    setTicketError(null);
    setTicketSuccess(null);

    try {
      const response = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenant.tenant_id,
          issue_type: issueType,
          description: description.trim(),
          photo_url: photoBase64
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to catalog maintenance ticket.");
      }

      setTicketSuccess(`Successfully cataloged maintenance ticket. Check progress below.`);
      setDescription("");
      setPhotoBase64(null);
      
      // Clear input element
      const fileInput = document.getElementById("photo-capture-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // Reload tickets
      fetchTenantData();
    } catch (err: any) {
      setTicketError(err.message || "Error reporting issue.");
    } finally {
      setReporting(false);
    }
  };

  // Status mapping colors & labels
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "🟢 Paid":
        return <span className="status-badge bg-emerald-100 text-emerald-700">Settled</span>;
      case "🟡 Partially Paid":
        return <span className="status-badge bg-amber-100 text-amber-700">Balance Owed</span>;
      case "🔴 Unpaid":
      default:
        return <span className="status-badge bg-red-100 text-red-700">Outstanding</span>;
    }
  };

  const getTicketStatusBadge = (status: string) => {
    switch (status) {
      case "Resolved":
        return <span className="status-badge bg-emerald-100 text-emerald-700">Resolved</span>;
      case "In Progress":
        return <span className="status-badge bg-amber-100 text-amber-700">Resolving</span>;
      case "Pending":
      default:
        return <span className="status-badge bg-slate-100 text-slate-700">Assigned</span>;
    }
  };

  return (
    <div id="tenant-portal-root" className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. PORTAL HEADER - Dynamic Branding */}
      <header id="tenant-header" className="bg-slate-900 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-400 text-slate-950 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5 text-slate-950" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-bold tracking-tight font-display text-emerald-400">{customBrandName} Resident Hub</h1>
              <p className="text-[10px] text-slate-300 font-display font-medium">Bespoke Portal for Unit {tenant.assigned_room_number}</p>
            </div>
          </div>
          <button
            id="tenant-logout-btn"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit Portal</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-4">
        {/* Resident Greeting Card */}
        <div id="welcome-banner" className="bg-white p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left high-contrast-card">
          <div>
            <div className="flex items-center gap-1 text-xs text-slate-400 font-semibold uppercase tracking-wider mb-0.5">
              <Compass className="w-3.5 h-3.5 text-emerald-500" />
              <span>Estate Dweller profile</span>
            </div>
            <h2 className="text-xl font-bold font-display text-slate-900">Welcome, {tenant.full_name}</h2>
            <p className="text-xs text-slate-500">
              Assigned Apartment Key: <strong className="text-slate-800 tracking-wider">ROOM {tenant.assigned_room_number}</strong> inside {customBrandName} ({property.geographic_location})
            </p>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] text-slate-400 font-semibold mb-1 uppercase">Dynamic Billing Period</span>
            <span className="px-3 py-1.5 bg-slate-100 text-slate-800 border border-slate-200 font-mono text-xs font-bold rounded-xl">
              📅 {billingDetails?.cycleLabel || "Calculating cycle..."}
            </span>
          </div>
        </div>

        {/* Outer Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* LEFT SIDE: Billing & M-Pesa Payment Forms - 7 columns */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* BILLING BALANCE STATUS CARD */}
            <div id="billing-summary-card" className="bg-white p-5 shadow-xs text-left high-contrast-card">
              <h3 className="font-bold text-sm text-slate-800 font-display flex items-center gap-2 mb-4">
                <Receipt className="w-4 h-4 text-emerald-500" />
                <span>My Active {customBrandName} Billing Summary</span>
              </h3>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Rent + Utilities</span>
                  <span className="font-mono text-sm font-bold text-slate-800">
                    KES {billingDetails?.dueAmount?.toLocaleString() || "0"}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1 font-medium">Paid This Cycle</span>
                  <span className="font-mono text-sm font-bold text-emerald-700">
                    KES {billingDetails?.clearedAmount?.toLocaleString() || "0"}
                  </span>
                </div>
                <div className="p-3 bg-red-50/50 rounded-xl border border-red-100/50">
                  <span className="text-[10px] font-bold text-red-600 uppercase block mb-1 font-medium">Owed Outstanding</span>
                  <span className="font-mono text-sm font-bold text-red-700">
                    KES {billingDetails?.outstandingBalance?.toLocaleString() || "0"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-left">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Cycle Billing State</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">Auto-unpaid trigger resets on monthly anniversary: <strong className="text-slate-800 font-mono">{tenant.registration_date.split("-")[2]}th</strong></p>
                </div>
                <div>
                  {billingDetails ? getStatusBadge(billingDetails.status) : <span className="text-xs text-slate-400">Loading...</span>}
                </div>
              </div>
            </div>

            {/* LIPA NA M-PESA STK PUSH FORM */}
            <div id="mpesa-billing-card" className="bg-white p-5 shadow-xs text-left high-contrast-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-slate-800 font-display flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-500" />
                  <span>Instant Safaricom Lipa Na M-Pesa Online</span>
                </h3>
                <span className="text-[9px] bg-slate-950 text-white font-mono px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">STK Push Push</span>
              </div>

              {paymentError && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              {paymentSuccess && (
                <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{paymentSuccess}</span>
                </div>
              )}

              {pendingCheckoutId && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2 text-amber-900 border-dashed animate-pulse">
                  <div className="flex items-center gap-2 font-bold">
                    <Hourglass className="w-4 h-4 text-amber-600 animate-spin" />
                    <span>Lipa Na M-Pesa Prompt Triggered!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Check your mobile phone lockscreen linked to <strong>+254 {paymentPhone.slice(-9)}</strong>. 
                    Input your PIN to authorize <strong>KES {paymentAmount}</strong> payment for {customBrandName}.
                  </p>
                  <p className="text-[10px] text-amber-700 italic">
                    Waiting for Safaricom async webhook callback to execute ledger update automatically...
                  </p>
                </div>
              )}

              <form id="tenant-mpesa-form" onSubmit={handleStkPush} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Payment Amount (KES)
                    </label>
                    <input
                      id="stk-amount-input"
                      type="number"
                      placeholder="e.g. 5000"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800"
                      disabled={paying || !!pendingCheckoutId}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      M-Pesa Telephone Recipient
                    </label>
                    <input
                      id="stk-phone-input"
                      type="tel"
                      placeholder="254712345678"
                      value={paymentPhone}
                      onChange={(e) => setPaymentPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800"
                      disabled={paying || !!pendingCheckoutId}
                      required
                    />
                  </div>
                </div>

                <button
                  id="tenant-btn-pay"
                  type="submit"
                  disabled={paying || !!pendingCheckoutId || billingDetails?.outstandingBalance === 0}
                  className="w-full py-3 mpesa-green hover:opacity-90 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer"
                >
                  {paying ? "Contacting Safaricom..." : "Lipa na M-Pesa STK Push"}
                  <Smartphone className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* HISTORIC LEDGER */}
            <div id="tenant-payment-ledger" className="bg-white p-5 shadow-xs text-left high-contrast-card">
              <h3 className="font-bold text-sm text-slate-800 font-display mb-3">
                🏢 Cleared Payment Receipts
              </h3>

              {payments.length === 0 ? (
                <div className="py-8 bg-slate-50 rounded-xl text-center border border-dashed border-slate-200">
                  <p className="text-xs text-slate-400">No payment receipts cleared on this app yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-semibold border-b border-slate-200">
                        <th className="p-3">Ref ID</th>
                        <th className="p-3">Method</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-right">Settled Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.transaction_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="p-3 font-mono text-slate-700 font-semibold">{p.transaction_id}</td>
                          <td className="p-3">
                            <span className={`status-badge ${
                              p.payment_mode === "M-PESA" ? "bg-emerald-100 text-emerald-700" : "bg-teal-100 text-teal-850"
                            }`}>
                              {p.payment_mode}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-850">
                            {p.amount.toLocaleString()} KES
                          </td>
                          <td className="p-3 text-right text-slate-400 font-medium">
                            {new Date(p.timestamp).toLocaleDateString("en-KE")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SIDE: Maintenance Report Forms - 5 columns */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* TICKET REPORT FORM */}
            <div id="maintenance-reporter-card" className="bg-white p-5 shadow-xs text-left high-contrast-card">
              <h3 className="font-bold text-sm text-slate-800 font-display flex items-center gap-1.5 mb-4">
                <Wrench className="w-4 h-4 text-emerald-500" />
                <span>On-Site Repair Request Desk</span>
              </h3>

              {ticketError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{ticketError}</span>
                </div>
              )}

              {ticketSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{ticketSuccess}</span>
                </div>
              )}

              <form id="maintenance-ticket-form" onSubmit={handleTicketSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Select Target Issue Type
                  </label>
                  <select
                    id="ticket-type-select"
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 text-slate-800"
                  >
                    <option value="Bulb">Bulb 💡</option>
                    <option value="Socket">Socket 🔌</option>
                    <option value="Toilet">Toilet 🚽</option>
                    <option value="Paint">Paint 🎨</option>
                    <option value="Other">Other 🛠️</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Damage Detail Description
                  </label>
                  <textarea
                    id="ticket-desc-input"
                    rows={2}
                    placeholder="Provide specific details about which room location and exact breakage..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800"
                    required
                  />
                </div>

                {/* Smartphone Photo Camera Capture attachment hook */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1 flex items-center justify-between">
                    <span>Camera Damage Photo</span>
                    <span className="text-[9px] text-slate-400 capitalize">Optional instant camera trigger</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer transition-all">
                      <Camera className="w-4 h-4 text-slate-650" />
                      <span>Snap Breakage</span>
                      <input
                        id="photo-capture-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoCapture}
                        className="hidden"
                      />
                    </label>
                    {photoBase64 && (
                      <div className="relative">
                        <img
                          src={photoBase64}
                          alt="Broken preview"
                          className="w-10 h-10 rounded-lg object-cover ring-1 ring-emerald-400"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => setPhotoBase64(null)}
                          className="absolute -top-1.5 -right-1.5 bg-red-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  id="ticket-btn-submit"
                  type="submit"
                  disabled={reporting}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 uppercase cursor-pointer"
                >
                  {reporting ? "Logging ticket..." : "File Repair Request"}
                  <Wrench className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* PREVIOUS REPAIR TICKETS */}
            <div id="maintenance-tickets-list" className="bg-white p-5 shadow-xs text-left high-contrast-card">
              <h3 className="font-bold text-sm text-slate-800 font-display mb-3">
                🧰 Filed Repair History
              </h3>

              {tickets.length === 0 ? (
                <div className="py-6 bg-slate-50 rounded-xl text-center border border-dashed border-slate-200">
                  <p className="text-[10px] text-slate-400">All fixtures and connections are currently running tidily.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {tickets.map((t) => (
                    <div key={t.ticket_id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs text-slate-500 shrink-0">
                        {t.issue_type === "Toilet" ? "🚽" : t.issue_type === "Bulb" ? "💡" : t.issue_type === "Socket" ? "🔌" : t.issue_type === "Paint" ? "🎨" : "🛠️"}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[11px] font-bold text-slate-800">{t.issue_type} Maintenance</span>
                          {getTicketStatusBadge(t.status)}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{t.description}</p>
                        {t.photo_url && (
                          <div className="mt-1.5">
                            <span className="text-[9px] text-slate-400 font-medium block mb-0.5">Snapped Photo:</span>
                            <img
                              src={t.photo_url}
                              alt="Attachment"
                              className="w-14 h-14 rounded-md object-cover ring-1 ring-slate-200"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        <span className="text-[9px] text-slate-400 font-mono mt-1 block">
                          Filed: {new Date(t.created_at).toLocaleDateString("en-KE")} at {new Date(t.created_at).toLocaleTimeString("en-KE", { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </main>

      <footer className="py-4 text-center text-[10px] text-slate-400 bg-white border-t border-slate-100 flex items-center justify-center gap-1">
        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
        <span>Estate billing computations compiled in real-time. Port 3000 Ingress Routing Active.</span>
      </footer>
    </div>
  );
}
