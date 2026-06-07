import React, { useState, useEffect } from "react";
import { Property, Room, Tenant, Payment, MaintenanceTicket } from "../types";
import { 
  Building2, LogOut, Receipt, PlusCircle, Wrench, AlertCircle, 
  Smartphone, Wallet, Compass, Camera, Sparkles, Check, Hourglass, XCircle, Settings, Download, Menu, X, Calendar
} from "lucide-react";

interface TenantPortalProps {
  tenant: Tenant;
  property: Property;
  onLogout: () => void;
  onOpenSettings?: () => void;
}


export function calculateTimeCovered(regDateStr: string): string {
  if (!regDateStr) return "N/A";
  const regDate = new Date(regDateStr);
  const now = new Date();
  
  if (now < regDate) {
    return "Starts soon";
  }

  let years = now.getFullYear() - regDate.getFullYear();
  let months = now.getMonth() - regDate.getMonth();
  let days = now.getDate() - regDate.getDate();

  if (days < 0) {
    months--;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonthDate.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  
  const parts: string[] = [];
  if (totalMonths > 0) {
    parts.push(`${totalMonths} month${totalMonths > 1 ? "s" : ""}`);
  }
  if (days > 0 || totalMonths === 0) {
    parts.push(`${days} day${days > 1 ? "s" : ""}`);
  }

  return parts.join(", ");
}

export default function TenantPortal({ tenant, property, onLogout, onOpenSettings }: TenantPortalProps) {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<"all" | "billing" | "mpesa" | "receipts" | "repairs" | "history" | "alerts">("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Billing details
  const [billingDetails, setBillingDetails] = useState<any>(null);
  const [room, setRoom] = useState<Room | null>(null);
  
  // Lists
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [tenantMessages, setTenantMessages] = useState<any[]>([]);

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

      // Fetch official messages/reminders from backend
      await fetchTenantMessages();
    } catch (err) {
      console.error("Error fetching resident portal metrics:", err);
    }
  };

  const fetchTenantMessages = async () => {
    try {
      const response = await fetch(`/api/tenants/${tenant.tenant_id}/messages`);
      if (response.ok) {
        const list = await response.json();
        setTenantMessages(list);
      }
    } catch (err) {
      console.error("Error fetching tenant incoming messages:", err);
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

  const handleDownloadReceipt = (payment: Payment) => {
    const fileContent = `===================================================================
                 ${property.property_name.toUpperCase()} UTILITIES & LEASE
                       OFFICIAL BILLING & MPESA RECEIPT
===================================================================

TRANSACTION DETAILS:
-------------------------------------------------------------------
Transaction Ref ID:   ${payment.transaction_id}
Status:               ${payment.status} (Verified ledger update)
Payment Mode:         ${payment.payment_mode}
Settled on:           ${new Date(payment.timestamp).toLocaleString("en-KE")}

TENANT & ROOM INFORMATION:
-------------------------------------------------------------------
M-Pesa User/Payer:    ${tenant.full_name}
Associated Telephone: +${tenant.phone_number}
Assigned Unit Number: Room ${tenant.assigned_room_number}
Property Name:        ${property.property_name}
Geographic Location:  ${property.geographic_location}

RENTAL CONTEXT & DURATION:
-------------------------------------------------------------------
Lease Commenced On:   ${tenant.registration_date} 
Duration Covered:     ${calculateTimeCovered(tenant.registration_date)}
Next Anniversary Reset: Day ${tenant.registration_date.split("-")[2]} of each month

FINANCIAL LEDGER STATS:
-------------------------------------------------------------------
Monthly Base Rent:    KES ${room?.monthly_rent?.toLocaleString() || "N/A"}
One-off Sec. Deposit: KES ${room?.utility_rate?.toLocaleString() || "N/A"}
-------------------------------------------------------------------
TOTAL AMOUNT PAID:    KES ${payment.amount.toLocaleString()} 

===================================================================
Thank you for your prompt transaction. Please keep this slip for reference.
  Generated automatically on behalf of ${property.property_name} Management.
===================================================================`;

    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `MPESA_Receipt_${payment.transaction_id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  // Declare modular cards as JSX components
  const billingCard = (
    <div id="billing-summary-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
      <h3 className="font-bold text-sm text-white font-display flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-emerald-400" />
        <span>My Active {customBrandName} Billing Summary</span>
      </h3>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-3 bg-slate-950/40 rounded-xl border border-white/5">
          <span className="text-[10px] font-bold text-slate-450 uppercase block mb-1">Rent + Utilities</span>
          <span className="font-mono text-xs sm:text-sm font-bold text-white">
            KES {billingDetails?.dueAmount?.toLocaleString() || "0"}
          </span>
        </div>
        <div className="p-3 bg-emerald-950/20 rounded-xl border border-emerald-500/10">
          <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-1 font-medium">Paid This Cycle</span>
          <span className="font-mono text-xs sm:text-sm font-bold text-emerald-400">
            KES {billingDetails?.clearedAmount?.toLocaleString() || "0"}
          </span>
        </div>
        <div className="p-3 bg-rose-955/20 rounded-xl border border-rose-500/10">
          <span className="text-[10px] font-bold text-rose-450 uppercase block mb-1 font-medium">Owed Outstanding</span>
          <span className="font-mono text-xs sm:text-sm font-bold text-rose-405">
            KES {billingDetails?.outstandingBalance?.toLocaleString() || "0"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 bg-slate-955/40 rounded-xl border border-white/10">
        <div className="text-left">
          <span className="text-[10px] text-slate-450 font-bold uppercase block">Cycle State</span>
          <p className="text-[11px] text-slate-300 mt-0.5">Anniversary reset: <strong className="text-emerald-450 font-mono">{tenant.registration_date.split("-")[2]}th</strong> of month</p>
        </div>
        <div>
          {billingDetails ? getStatusBadge(billingDetails.status) : <span className="text-xs text-slate-450">Calculating...</span>}
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-white/5 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs leading-normal">
          <div className="p-3 bg-slate-955/40 border border-white/5 rounded-xl">
            <span className="text-[10px] text-slate-450 uppercase font-bold block mb-0.5">Assigned Date</span>
            <span className="font-mono text-slate-100 font-bold">
              📅 {new Date(tenant.registration_date).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="p-3 bg-slate-955/40 border border-white/5 rounded-xl">
            <span className="text-[10px] text-slate-455 uppercase font-bold block mb-0.5">Time Covered (Tenancy)</span>
            <span className="font-mono text-emerald-400 font-bold block">
              ⏳ {calculateTimeCovered(tenant.registration_date)}
            </span>
          </div>
        </div>

        <div className="p-3.5 bg-slate-955/40 border border-white/5 rounded-xl space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[10px] text-slate-450 uppercase font-bold">Total Amount Paid</span>
            <span className="font-mono font-black text-amber-400 text-sm">
              KES {payments.filter(p => p.status === 'Completed').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
            </span>
          </div>
          
          {payments.filter(p => p.status === 'Completed').length > 0 ? (
            <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-[11px] max-h-[110px] overflow-y-auto">
              {payments.filter(p => p.status === 'Completed').map((p, idx) => (
                <div key={p.transaction_id || idx} className="flex justify-between items-center text-slate-300 font-mono text-[11px] hover:bg-white/5 p-1 rounded-md transition-all">
                  <span className="truncate">• Paid on {new Date(p.timestamp).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}:</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-emerald-450 font-bold">KES {p.amount.toLocaleString()}</span>
                    <button
                      onClick={() => handleDownloadReceipt(p)}
                      type="button"
                      className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
                      title="Download M-Pesa Receipt Slip"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 italic">No cleared payments listed yet.</p>
          )}
        </div>
      </div>
    </div>
  );

  const mpesaFormCard = (
    <div id="mpesa-billing-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm text-white font-display flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-400" />
          <span>Safaricom Lipa Na M-Pesa Online</span>
        </h3>
        <span className="text-[9px] bg-slate-950 text-emerald-400 border border-emerald-500/20 font-mono px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">STK Push Active</span>
      </div>

      {paymentError && (
        <div className="mb-4 p-3.5 bg-red-955/40 border border-red-500/30 rounded-xl text-red-350 text-xs flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{paymentError}</span>
        </div>
      )}

      {paymentSuccess && (
        <div className="mb-4 p-3.5 bg-emerald-955/40 border border-emerald-500/30 rounded-xl text-emerald-305 text-xs flex gap-2">
          <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-455" />
          <span>{paymentSuccess}</span>
        </div>
      )}

      {pendingCheckoutId && (
        <div className="mb-4 p-4 bg-amber-955/45 border border-amber-500/30 rounded-xl text-xs space-y-2 text-amber-200 border-dashed animate-pulse">
          <div className="flex items-center gap-2 font-bold">
            <Hourglass className="w-4 h-4 text-amber-500 animate-spin" />
            <span>Lipa Na M-Pesa Prompt Triggered!</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Check your phone lockscreen linked to <strong>+254 {paymentPhone.slice(-9)}</strong>. 
            Input your M-Pesa PIN to authorize <strong>KES {paymentAmount}</strong> payment for {customBrandName}.
          </p>
          <p className="text-[10px] text-amber-400 italic">
            Waiting for Safaricom async webhook callback to execute ledger update automatically...
          </p>
        </div>
      )}

      <form id="tenant-mpesa-form" onSubmit={handleStkPush} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
              Payment Amount (KES)
            </label>
            <input
              id="stk-amount-input"
              type="number"
              placeholder="e.g. 5000"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-450"
              disabled={paying || !!pendingCheckoutId}
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
              M-Pesa Telephone Recipient
            </label>
            <input
              id="stk-phone-input"
              type="tel"
              placeholder="254712345678"
              value={paymentPhone}
              onChange={(e) => setPaymentPhone(e.target.value)}
              className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-455"
              disabled={paying || !!pendingCheckoutId}
              required
            />
          </div>
        </div>

        <button
          id="tenant-btn-pay"
          type="submit"
          disabled={paying || !!pendingCheckoutId || billingDetails?.outstandingBalance === 0}
          className="w-full py-3 mpesa-green hover:opacity-90 disabled:bg-slate-950/30 disabled:text-slate-550 border-0 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer shadow-md"
        >
          {paying ? "Contacting Safaricom..." : "Lipa na M-Pesa STK Push"}
          <Smartphone className="w-4 h-4" />
        </button>
      </form>
    </div>
  );

  const historicLedgerCard = (
    <div id="tenant-payment-ledger" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
      <h3 className="font-bold text-sm text-white font-display mb-3">
        🏢 Cleared Payment Receipts & Slips
      </h3>

      {payments.length === 0 ? (
        <div className="py-8 bg-slate-950/40 rounded-xl text-center border border-dashed border-white/10">
          <p className="text-xs text-slate-450">No receipt data logged for this resident yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 text-slate-400 font-semibold border-b border-white/10">
                <th className="p-3">Ref ID</th>
                <th className="p-3">Method</th>
                <th className="p-3 text-right">Total Settled</th>
                <th className="p-3 text-right">Date Paid</th>
                <th className="p-3 text-center">E-Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.transaction_id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3 font-mono text-slate-205 font-semibold">{p.transaction_id}</td>
                  <td className="p-3">
                    <span className="status-badge bg-emerald-955 border border-emerald-500/20 text-emerald-450">
                      {p.payment_mode}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-400">
                    KES {p.amount.toLocaleString()}
                  </td>
                  <td className="p-3 text-right text-slate-450 font-medium">
                    {new Date(p.timestamp).toLocaleDateString("en-KE")}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleDownloadReceipt(p)}
                      type="button"
                      className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded-lg flex items-center gap-1.5 mx-auto transition-all cursor-pointer"
                      title="Download text slip receipt for this transaction"
                    >
                      <Download className="w-3 h-3 text-emerald-400" />
                      <span>Download Slip</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const ticketFormCard = (
    <div id="maintenance-reporter-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
      <h3 className="font-bold text-sm text-white font-display flex items-center gap-1.5 mb-4">
        <Wrench className="w-4 h-4 text-emerald-400" />
        <span>On-Site Repair Request Desk</span>
      </h3>

      {ticketError && (
        <div className="mb-4 p-3 bg-red-955/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{ticketError}</span>
        </div>
      )}

      {ticketSuccess && (
        <div className="mb-4 p-3 bg-emerald-955/40 border border-emerald-500/30 rounded-xl text-emerald-305 text-xs flex gap-2">
          <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-405" />
          <span>{ticketSuccess}</span>
        </div>
      )}

      <form id="maintenance-ticket-form" onSubmit={handleTicketSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
            Repair Category/Category/Fixture
          </label>
          <select
            id="ticket-type-select"
            value={issueType}
            onChange={(e) => setIssueType(e.target.value as any)}
            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-450 text-white"
          >
            <option value="Bulb" className="bg-slate-900">Bulb 💡</option>
            <option value="Socket" className="bg-slate-900">Socket 🔌</option>
            <option value="Toilet" className="bg-slate-900">Toilet 🚽</option>
            <option value="Paint" className="bg-slate-900">Paint 🎨</option>
            <option value="Other" className="bg-slate-900">Other 🛠️</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
            Issue/Damage Explanation
          </label>
          <textarea
            id="ticket-desc-input"
            rows={2}
            placeholder="Provide specific details about which corner/appliance is malfunctioning..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-450"
            required
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1 flex items-center justify-between">
            <span>Camera Reference Snap</span>
            <span className="text-[9px] text-slate-455">Mobile Camera Capture Attachment</span>
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer transition-all">
              <Camera className="w-4 h-4 text-emerald-455" />
              <span>Snapshot Source</span>
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
                  className="absolute -top-1.5 -right-1.5 bg-red-650 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
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
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-755 disabled:bg-slate-955 border-0 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 uppercase cursor-pointer"
        >
          {reporting ? "Logging ticket..." : "File Repair Request"}
          <Wrench className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );

  const alertsCard = (
    <div id="tenant-inbox-alerts-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm text-white font-display flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-emerald-400" />
          <span>Resident Notifications & Alerts</span>
        </h3>
        {tenantMessages.length > 0 && (
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono rounded-md font-bold uppercase tracking-wider animate-pulse">
            {tenantMessages.length} Messages
          </span>
        )}
      </div>

      {tenantMessages.length === 0 ? (
        <div className="py-8 bg-slate-955/40 rounded-xl text-center border border-dashed border-white/10">
          <p className="text-xs text-slate-450">Announcements channel is currently fully clear.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {tenantMessages.map((msg, idx) => (
            <div key={msg.id || idx} className="p-3 bg-slate-955/50 border border-white/10 rounded-xl space-y-1.5 transition-all">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400 font-mono">
                  📅 {new Date(msg.timestamp).toLocaleString("en-KE")}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase font-mono ${
                  msg.status === "Failed" ? "bg-rose-500/10 text-rose-455 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20"
                }`}>
                  {msg.status}
                </span>
              </div>
              <p className="text-xs text-slate-205 leading-relaxed font-sans">{msg.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const repairHistoryCard = (
    <div id="maintenance-tickets-list" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
      <h3 className="font-bold text-sm text-white font-display mb-3">
        🧰 Filed Repairs & Progress
      </h3>

      {tickets.length === 0 ? (
        <div className="py-6 bg-slate-955/40 rounded-xl text-center border border-dashed border-white/10">
          <p className="text-[10px] text-slate-455">All apartment fixtures are fully sound. No tickets logged.</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
          {tickets.map((t) => (
            <div key={t.ticket_id} className="p-3 bg-slate-955/40 border border-white/5 rounded-xl flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-slate-400 shrink-0">
                {t.issue_type === "Toilet" ? "🚽" : t.issue_type === "Bulb" ? "💡" : t.issue_type === "Socket" ? "🔌" : t.issue_type === "Paint" ? "🎨" : "🛠️"}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[11px] font-bold text-slate-200">{t.issue_type} Malfunction</span>
                  {getTicketStatusBadge(t.status)}
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">{t.description}</p>
                {t.photo_url && (
                  <div className="mt-1.5">
                    <span className="text-[9px] text-slate-405 font-medium block mb-0.5">Snapped damage:</span>
                    <img
                      src={t.photo_url}
                      alt="Attachment"
                      className="w-14 h-14 rounded-md object-cover ring-1 ring-slate-800"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <span className="text-[9px] text-slate-404 font-mono mt-1 block">
                  Filed: {new Date(t.created_at).toLocaleDateString("en-KE")} at {new Date(t.created_at).toLocaleTimeString("en-KE", { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div id="tenant-portal-root" className="min-h-screen bg-transparent flex flex-col font-sans text-slate-100">
      {/* 1. PORTAL HEADER - Bold 'White Rock Resident Hub' covering the upper side */}
      <header id="tenant-header" className="bg-slate-950/90 border-b border-white/10 backdrop-blur-md text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 w-full">
            {/* Hamburger Button on Left Upper Side */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2.5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-350 hover:text-emerald-400 transition-all cursor-pointer mr-0.5 flex items-center justify-center gap-2 duration-150 active:scale-95 shadow-sm shrink-0"
              title="Toggle Hub Actions Portal"
              aria-label="Toggle navigation menu"
            >
              {sidebarOpen ? <X className="w-5 h-5 text-rose-450" /> : <Menu className="w-5 h-5 text-emerald-400 font-bold" />}
              <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wider uppercase hidden sm:inline">Portal Menu</span>
            </button>

            <div className="h-8 w-px bg-white/10 hidden sm:block" />

            {/* Prominent White Rock Resident Hub Display Title covering the upper side of the dashboard */}
            <div className="flex items-center gap-3.5 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 flex items-center justify-center font-bold shadow-md hover:scale-105 transition-all shrink-0">
                <Building2 className="w-6 h-6 text-slate-950" />
              </div>
              <div className="text-left truncate">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black font-display tracking-tight text-white uppercase drop-shadow-md truncate font-extrabold">
                  White Rock Resident Hub
                </h1>
                <p className="text-[10px] sm:text-xs text-emerald-400 font-mono font-bold uppercase tracking-widest leading-none mt-1">
                  Official Residence Portal <span className="text-slate-600 font-normal mx-1">•</span> Room {tenant.assigned_room_number}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE BACKDROP OVERLAY */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)} 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-40 animate-in fade-in duration-200"
        />
      )}

      {/* DRAWER SIDEBAR WITH RESIDENT HUB ACTIONS */}
      <aside 
        id="tenant-sidebar" 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 text-slate-100 flex flex-col transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/30 shrink-0 text-left">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-bold">
              <Building2 className="w-4 h-4 text-slate-950" />
            </div>
            <div className="text-left">
              <h3 className="text-xs font-bold text-emerald-400 font-display">Hub Actions Menu</h3>
              <p className="text-[10px] text-slate-400 font-mono font-medium">Unit: Room {tenant.assigned_room_number}</p>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Dismiss Sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Navigation Options */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto text-left">
          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-2 px-2">
            🧭 Navigation Views
          </span>

          {/* Tenant profile summary */}
          <button
            onClick={() => {
              setActiveTab("all");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
              activeTab === "all"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "border border-transparent text-slate-350 hover:text-white hover:bg-slate-805"
            }`}
          >
            <Compass className="w-4 h-4 text-emerald-400" />
            <span>👤 Resident Profile Summary</span>
          </button>

          <div className="h-px bg-slate-800 my-2" />

          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono px-2 py-1">
            💰 Financial desk
          </span>

          {/* Billing Summary Option */}
          <button
            onClick={() => {
              setActiveTab("billing");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
              activeTab === "billing"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "border border-transparent text-slate-350 hover:text-white hover:bg-slate-805"
            }`}
          >
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>📋 Billing Summary Overview</span>
          </button>

          {/* Pay Rent Option */}
          <button
            onClick={() => {
              setActiveTab("mpesa");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
              activeTab === "mpesa"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "border border-transparent text-slate-350 hover:text-white hover:bg-slate-805"
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>📱 Pay Now (M-Pesa STK Push)</span>
          </button>

          {/* Cleared Payment Receipts Option */}
          <button
            onClick={() => {
              setActiveTab("receipts");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
              activeTab === "receipts"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "border border-transparent text-slate-350 hover:text-white hover:bg-slate-805"
            }`}
          >
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span>🏢 Cleared Payment Receipts</span>
          </button>

          <div className="h-px bg-slate-800 my-2" />

          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono px-2 py-1">
            🛠️ Support & requests
          </span>

          {/* Repair Request Desk Option */}
          <button
            onClick={() => {
              setActiveTab("repairs");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
              activeTab === "repairs"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "border border-transparent text-slate-350 hover:text-white hover:bg-slate-805"
            }`}
          >
            <Wrench className="w-4 h-4 text-emerald-400" />
            <span>🛠️ Report an Issue</span>
          </button>

          {/* Filed Repair History Option */}
          <button
            onClick={() => {
              setActiveTab("history");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
              activeTab === "history"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "border border-transparent text-slate-350 hover:text-white hover:bg-slate-805"
            }`}
          >
            <Compass className="w-4 h-4 text-emerald-400" />
            <span>🧰 Filed Repair History</span>
          </button>

          {/* Real-time Alerts Option */}
          <button
            onClick={() => {
              setActiveTab("alerts");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all text-left cursor-pointer ${
              activeTab === "alerts"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "border border-transparent text-slate-350 hover:text-white hover:bg-slate-805"
            }`}
          >
            <AlertCircle className="w-4 h-4 text-emerald-400" />
            <span>🔔 Announcement Alerts Logs</span>
          </button>

          <div className="h-px bg-slate-800 my-2" />

          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono px-2 py-1">
            ⚙️ Preferences
          </span>

          <button
            onClick={() => {
              setSidebarOpen(false);
              onOpenSettings?.();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all text-left text-blue-400 hover:text-white hover:bg-blue-500/10 border border-blue-500/20 bg-blue-500/5 cursor-pointer"
            title="Adjust theme color, custom contrasts, dyslexic font toggle, and scales"
          >
            <Settings className="w-4 h-4 text-blue-400 shrink-0" />
            <span>⚙️ System Personalization</span>
          </button>

          <button
            onClick={() => {
              setSidebarOpen(false);
              onLogout();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all text-left text-rose-400 hover:text-white hover:bg-rose-500/10 border border-rose-500/20 bg-rose-500/5 cursor-pointer mt-2.5"
            title="Exit properties tenant dashboard and return to home desk"
          >
            <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
            <span>🚪 Exit / Log Out</span>
          </button>
        </nav>

        {/* Sidebar Footer detailing the Tenant Profile */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/20 text-xs text-left shrink-0">
          <p className="text-[10px] text-slate-400 font-semibold uppercase font-mono mb-1">Signed-in Resident</p>
          <div className="font-bold text-white truncate max-w-full">{tenant.full_name}</div>
          <p className="text-[10px] text-slate-500 font-mono">+{tenant.phone_number}</p>
        </div>
      </aside>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-4">
        {/* Resident Greeting Card */}
        <div id="welcome-banner" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left">
          <div>
            <div className="flex items-center gap-1 text-xs text-slate-450 font-semibold uppercase tracking-wider mb-0.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Estate Dweller profile</span>
            </div>
            <h2 className="text-xl font-bold font-display text-white">Welcome, {tenant.full_name}</h2>
            <p className="text-xs text-slate-300">
              Assigned Apartment Key: <strong className="text-emerald-450 tracking-wider">ROOM {tenant.assigned_room_number}</strong> inside {customBrandName} ({property.geographic_location})
            </p>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] text-slate-450 font-semibold mb-1 uppercase">Dynamic Billing Period</span>
            <span className="px-3 py-1.5 bg-slate-950/60 border border-white/10 text-white font-mono text-xs font-bold rounded-xl shadow-inner">
              📅 {billingDetails?.cycleLabel || "Calculating cycle..."}
            </span>
          </div>
        </div>

        {/* Dynamic Navigation Indicator / Breadcrumb when focused on a tab */}
        {activeTab !== "all" && (
          <div className="flex items-center justify-between bg-slate-900/40 p-3.5 rounded-xl border border-white/10 animate-in fade-in duration-200 text-left">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Filtered Action View:</span>
              <span className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2.5 py-1 rounded-lg capitalize">
                {activeTab === "billing" && "🔢 Billing Summary"}
                {activeTab === "mpesa" && "📱 Instant Safaricom M-Pesa STK Push"}
                {activeTab === "receipts" && "🏢 Cleared Payment Receipts & Slips"}
                {activeTab === "repairs" && "🛠️ On-Site Repair Request Desk"}
                {activeTab === "history" && "🧰 Filed Repair History Logs"}
                {activeTab === "alerts" && "🔔 Announcements Alerts Reception"}
              </span>
            </div>
            <button
              onClick={() => setActiveTab("all")}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer underline hover:no-underline font-mono"
            >
              Back to Dweller Profile 👤
            </button>
          </div>
        )}

        {/* Dynamic Layout Engine */}
        {activeTab !== "all" ? (
          <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-250">
            {activeTab === "billing" && billingCard}
            {activeTab === "mpesa" && mpesaFormCard}
            {activeTab === "receipts" && historicLedgerCard}
            {activeTab === "repairs" && ticketFormCard}
            {activeTab === "alerts" && alertsCard}
            {activeTab === "history" && repairHistoryCard}
          </div>
        ) : (
          /* Structured Dweller Profile Hub */
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
            
            {/* Plot/Property Spotlight Card - PROMINENT, BOLD, BEAUTIFUL PLOT BRANDING */}
            <div className="bg-gradient-to-br from-slate-900/95 to-slate-950 border border-slate-800 rounded-3xl p-6 md:p-8 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -z-10" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl -z-10" />
              
              <span className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full inline-block mb-3.5">
                🏢 Assigned Residence Plot
              </span>
              
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black font-display tracking-tight text-white uppercase drop-shadow-lg">
                {property.property_name}
              </h1>
              
              <p className="text-slate-400 text-xs sm:text-sm mt-3 font-mono max-w-lg mx-auto flex items-center justify-center gap-1.5 leading-none">
                <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>📍 {property.geographic_location}</span>
                <span className="text-slate-600">•</span>
                <span>🚪 Room {tenant.assigned_room_number}</span>
              </p>
            </div>

            {/* Structured Dweller Data Details Card */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-left shadow-lg">
              
              {/* Profile Header Block */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
                <div className="flex items-center gap-4">
                  {/* Huge Decorative Initials Badge */}
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-slate-950 text-xl font-extrabold tracking-tight shadow-md shrink-0">
                    {tenant.full_name ? tenant.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "R"}
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">Official Dweller Profile</span>
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-none mt-1">{tenant.full_name}</h2>
                    <p className="text-slate-400 text-xs mt-1.5 font-mono">Resident ID: {tenant.tenant_id}</p>
                  </div>
                </div>
                
                {/* Tenancy Active Status Badge */}
                <span className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold rounded-lg uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Licensed Occupant</span>
                </span>
              </div>

              {/* Grid 2-columns details of dwelling */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                
                {/* COLUMN 1: Personal Contact & Lease Duration */}
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-mono block mb-1">Assigned Apartment Key</span>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="font-mono text-sm font-extrabold text-white">ROOM {tenant.assigned_room_number}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-mono block mb-1">Registered Telephone</span>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="font-mono text-sm text-slate-100">+{tenant.phone_number}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-mono block mb-1">Lease Commencement</span>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="font-sans text-sm text-slate-100 font-semibold">
                        📅 {new Date(tenant.registration_date).toLocaleDateString("en-KE", { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: Tenancy Covered & Financial Summary Details */}
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-mono block mb-1">Tenancy Term Duration</span>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center shrink-0">
                        <Hourglass className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="font-mono text-sm font-bold text-emerald-400">
                        ⏳ {calculateTimeCovered(tenant.registration_date)}
                      </span>
                    </div>
                  </div>

                  {room && (
                    <>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-mono block mb-1">Contractual Monthly Rent</span>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            <Wallet className="w-4 h-4 text-slate-400" />
                          </div>
                          <span className="font-mono text-sm font-extrabold text-white">KES {room.monthly_rent?.toLocaleString()}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-mono block mb-1">Security / Utility Deposit</span>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            <Receipt className="w-4 h-4 text-slate-400" />
                          </div>
                          <span className="font-mono text-sm text-slate-300">KES {room.utility_rate?.toLocaleString()}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

              </div>

              {/* Status & Menu prompt helper */}
              <div className="mt-8 pt-5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Current Balance Status</span>
                  {billingDetails ? (
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      {getStatusBadge(billingDetails.status)}
                      <span className="text-xs text-slate-400 font-mono">
                        (Owed: KES {billingDetails.outstandingBalance?.toLocaleString() || "0"})
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic">No cycles calculated yet.</span>
                  )}
                </div>
                
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="px-5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 font-bold font-sans text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm group active:scale-95"
                >
                  <Menu className="w-4 h-4 animate-pulse shrink-0" />
                  <span>Open Resident Actions Portal</span>
                </button>
              </div>

            </div>

          </div>
        )}

        {/* Deprecated Dashboard Grid */}
        {false && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* LEFT SIDE: Billing & M-Pesa Payment Forms - 7 columns */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* BILLING BALANCE STATUS CARD */}
            <div id="billing-summary-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
              <h3 className="font-bold text-sm text-white font-display flex items-center gap-2 mb-4">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>My Active {customBrandName} Billing Summary</span>
              </h3>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-3 bg-slate-950/40 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-slate-450 uppercase block mb-1">Rent + Utilities</span>
                  <span className="font-mono text-sm font-bold text-white">
                    KES {billingDetails?.dueAmount?.toLocaleString() || "0"}
                  </span>
                </div>
                <div className="p-3 bg-emerald-950/20 rounded-xl border border-emerald-500/10">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-1 font-medium">Paid This Cycle</span>
                  <span className="font-mono text-sm font-bold text-emerald-400">
                    KES {billingDetails?.clearedAmount?.toLocaleString() || "0"}
                  </span>
                </div>
                <div className="p-3 bg-rose-950/20 rounded-xl border border-rose-500/10">
                  <span className="text-[10px] font-bold text-rose-450 uppercase block mb-1 font-medium">Owed Outstanding</span>
                  <span className="font-mono text-sm font-bold text-rose-455">
                    KES {billingDetails?.outstandingBalance?.toLocaleString() || "0"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-white/10">
                <div className="text-left">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Cycle Billing State</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">Auto-unpaid trigger resets on monthly anniversary: <strong className="text-emerald-450 font-mono">{tenant.registration_date.split("-")[2]}th</strong></p>
                </div>
                <div>
                  {billingDetails ? getStatusBadge(billingDetails.status) : <span className="text-xs text-slate-405">Loading...</span>}
                </div>
              </div>

              {/* Leap Duration Covered & Total Paid Section */}
              <div className="pt-4 mt-4 border-t border-white/5 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs leading-normal">
                  <div className="p-3 bg-slate-950/40 border border-white/5 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Assigned Date</span>
                    <span className="font-mono text-slate-100 font-bold">
                      📅 {new Date(tenant.registration_date).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950/40 border border-white/5 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Time Covered (Tenancy)</span>
                    <span className="font-mono text-emerald-400 font-bold block">
                      ⏳ {calculateTimeCovered(tenant.registration_date)}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Total Amount Paid</span>
                    <span className="font-mono font-black text-amber-400 text-sm">
                      KES {payments.filter(p => p.status === 'Completed').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                    </span>
                  </div>
                  
                  {payments.filter(p => p.status === 'Completed').length > 0 ? (
                    <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-[11px] max-h-[110px] overflow-y-auto">
                      {payments.filter(p => p.status === 'Completed').map((p, idx) => (
                        <div key={p.transaction_id || idx} className="flex justify-between items-center text-slate-300 font-mono text-[11px] hover:bg-white/5 p-1 rounded-md transition-all">
                          <span className="truncate">• Paid on {new Date(p.timestamp).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}:</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-emerald-450 font-bold">KES {p.amount.toLocaleString()}</span>
                            <button
                              onClick={() => handleDownloadReceipt(p)}
                              type="button"
                              className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
                              title="Download M-Pesa Receipt Slip"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 italic">No cleared payment dates recorded yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* LIPA NA M-PESA STK PUSH FORM */}
            <div id="mpesa-billing-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-white font-display flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  <span>Instant Safaricom Lipa Na M-Pesa Online</span>
                </h3>
                <span className="text-[9px] bg-slate-950 text-emerald-400 border border-emerald-500/20 font-mono px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">STK Push Active</span>
              </div>

              {paymentError && (
                <div className="mb-4 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              {paymentSuccess && (
                <div className="mb-4 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-450" />
                  <span>{paymentSuccess}</span>
                </div>
              )}

              {pendingCheckoutId && (
                <div className="mb-4 p-4 bg-amber-955/40 border border-amber-500/30 rounded-xl text-xs space-y-2 text-amber-200 border-dashed animate-pulse">
                  <div className="flex items-center gap-2 font-bold">
                    <Hourglass className="w-4 h-4 text-amber-505 animate-spin" />
                    <span>Lipa Na M-Pesa Prompt Triggered!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Check your mobile phone lockscreen linked to <strong>+254 {paymentPhone.slice(-9)}</strong>. 
                    Input your PIN to authorize <strong>KES {paymentAmount}</strong> payment for {customBrandName}.
                  </p>
                  <p className="text-[10px] text-amber-450 italic">
                    Waiting for Safaricom async webhook callback to execute ledger update automatically...
                  </p>
                </div>
              )}

              <form id="tenant-mpesa-form" onSubmit={handleStkPush} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      Payment Amount (KES)
                    </label>
                    <input
                      id="stk-amount-input"
                      type="number"
                      placeholder="e.g. 5000"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-450"
                      disabled={paying || !!pendingCheckoutId}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      M-Pesa Telephone Recipient
                    </label>
                    <input
                      id="stk-phone-input"
                      type="tel"
                      placeholder="254712345678"
                      value={paymentPhone}
                      onChange={(e) => setPaymentPhone(e.target.value)}
                      className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-455"
                      disabled={paying || !!pendingCheckoutId}
                      required
                    />
                  </div>
                </div>

                <button
                  id="tenant-btn-pay"
                  type="submit"
                  disabled={paying || !!pendingCheckoutId || billingDetails?.outstandingBalance === 0}
                  className="w-full py-3 mpesa-green hover:opacity-90 disabled:bg-slate-950/30 disabled:text-slate-550 border-0 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer shadow-md"
                >
                  {paying ? "Contacting Safaricom..." : "Lipa na M-Pesa STK Push"}
                  <Smartphone className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* HISTORIC LEDGER */}
            <div id="tenant-payment-ledger" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
              <h3 className="font-bold text-sm text-white font-display mb-3">
                🏢 Cleared Payment Receipts
              </h3>

              {payments.length === 0 ? (
                <div className="py-8 bg-slate-950/40 rounded-xl text-center border border-dashed border-white/10">
                  <p className="text-xs text-slate-450">No payment receipts cleared on this app yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950/50 text-slate-400 font-semibold border-b border-white/10">
                        <th className="p-3">Ref ID</th>
                        <th className="p-3">Method</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-right">Settled Date</th>
                        <th className="p-3 text-center">E-Receipt Slip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.transaction_id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-3 font-mono text-slate-205 font-semibold">{p.transaction_id}</td>
                          <td className="p-3">
                            <span className="status-badge bg-emerald-950/60 border border-emerald-500/20 text-emerald-450">
                              {p.payment_mode}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-100">
                            {p.amount.toLocaleString()} KES
                          </td>
                          <td className="p-3 text-right text-slate-450 font-medium">
                            {new Date(p.timestamp).toLocaleDateString("en-KE")}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleDownloadReceipt(p)}
                              type="button"
                              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded-lg flex items-center gap-1.5 mx-auto transition-all cursor-pointer"
                              title="Download official receipt slip text script file"
                            >
                              <Download className="w-3 h-3 text-emerald-400" />
                              <span>Download Slip</span>
                            </button>
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
            <div id="maintenance-reporter-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
              <h3 className="font-bold text-sm text-white font-display flex items-center gap-1.5 mb-4">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <span>On-Site Repair Request Desk</span>
              </h3>

              {ticketError && (
                <div className="mb-4 p-3 bg-red-955/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{ticketError}</span>
                </div>
              )}

              {ticketSuccess && (
                <div className="mb-4 p-3 bg-emerald-955/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>{ticketSuccess}</span>
                </div>
              )}

              <form id="maintenance-ticket-form" onSubmit={handleTicketSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Select Target Issue Type
                  </label>
                  <select
                    id="ticket-type-select"
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as any)}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-450 text-white"
                  >
                    <option value="Bulb" className="bg-slate-900">Bulb 💡</option>
                    <option value="Socket" className="bg-slate-900">Socket 🔌</option>
                    <option value="Toilet" className="bg-slate-900">Toilet 🚽</option>
                    <option value="Paint" className="bg-slate-900">Paint 🎨</option>
                    <option value="Other" className="bg-slate-900">Other 🛠️</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Damage Detail Description
                  </label>
                  <textarea
                    id="ticket-desc-input"
                    rows={2}
                    placeholder="Provide specific details about which room location and exact breakage..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-450"
                    required
                  />
                </div>

                {/* Smartphone Photo Camera Capture attachment hook */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1 flex items-center justify-between">
                    <span>Camera Damage Photo</span>
                    <span className="text-[9px] text-slate-450 capitalize">Optional instant camera trigger</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-slate-300 cursor-pointer transition-all">
                      <Camera className="w-4 h-4 text-emerald-400" />
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
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:bg-slate-950 border-0 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 uppercase cursor-pointer"
                >
                  {reporting ? "Logging ticket..." : "File Repair Request"}
                  <Wrench className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* OFFICIAL MESSAGES & ALERTS */}
            <div id="tenant-inbox-alerts-card" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-white font-display flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <span>Official Announcements &amp; Alerts</span>
                </h3>
                {tenantMessages.length > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono rounded-md font-bold uppercase tracking-wider animate-pulse">
                    {tenantMessages.length} Messages
                  </span>
                )}
              </div>

              {tenantMessages.length === 0 ? (
                <div className="py-8 bg-slate-955/40 rounded-xl text-center border border-dashed border-white/10">
                  <p className="text-xs text-slate-450">No official announcements or specific account alerts listed yet.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {tenantMessages.map((msg, idx) => (
                    <div key={msg.id || idx} className="p-3 bg-slate-955/50 border border-white/10 rounded-xl space-y-1.5 transition-all">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-mono">
                          📅 {new Date(msg.timestamp).toLocaleString("en-KE", { hour12: false })}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase font-mono ${
                          msg.status === "Failed" ? "bg-rose-500/10 text-rose-455 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20"
                        }`}>
                          {msg.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PREVIOUS REPAIR TICKETS */}
            <div id="maintenance-tickets-list" className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-left shadow-lg">
              <h3 className="font-bold text-sm text-white font-display mb-3">
                🧰 Filed Repair History
              </h3>

              {tickets.length === 0 ? (
                <div className="py-6 bg-slate-955/40 rounded-xl text-center border border-dashed border-white/10">
                  <p className="text-[10px] text-slate-450">All fixtures and connections are currently running tidily.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {tickets.map((t) => (
                    <div key={t.ticket_id} className="p-3 bg-slate-955/40 border border-white/5 rounded-xl flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-slate-400 shrink-0">
                        {t.issue_type === "Toilet" ? "🚽" : t.issue_type === "Bulb" ? "💡" : t.issue_type === "Socket" ? "🔌" : t.issue_type === "Paint" ? "🎨" : "🛠️"}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[11px] font-bold text-slate-200">{t.issue_type} Maintenance</span>
                          {getTicketStatusBadge(t.status)}
                        </div>
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">{t.description}</p>
                        {t.photo_url && (
                          <div className="mt-1.5">
                            <span className="text-[9px] text-slate-400 font-medium block mb-0.5">Snapped Photo:</span>
                            <img
                              src={t.photo_url}
                              alt="Attachment"
                              className="w-14 h-14 rounded-md object-cover ring-1 ring-slate-800"
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
        )}

      </main>

      <footer className="py-4 text-center text-[10px] text-slate-450 bg-slate-950/50 border-t border-white/5 flex items-center justify-center gap-1">
        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
        <span>Estate billing computations compiled in real-time. Port 3000 Ingress Routing Active.</span>
      </footer>
    </div>
  );
}
