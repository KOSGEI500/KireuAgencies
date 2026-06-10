import React, { useState, useEffect } from "react";
import { Property, Room, Tenant, Payment, MaintenanceTicket, AdminSession, RoomRequest } from "../types";
import { 
  Building2, Users, Receipt, Wrench, Shield, LogOut, CheckCircle, Plus, 
  Trash2, PlusCircle, Smartphone, Sparkles, Filter, Landmark, MapPin, Eye, AlertCircle, Clock,
  Menu, X, User, MessageSquare, ListCollapse, Building, ExternalLink, Settings, Key, Edit3
} from "lucide-react";

interface AdminPortalProps {
  session: AdminSession;
  properties: Property[];
  onLogout: () => void;
  onRefreshProperties: () => void;
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

export default function AdminPortal({ session, properties, onLogout, onRefreshProperties, onOpenSettings }: AdminPortalProps) {
  // Active selected property to view (Defaults to caretaker's assigned property ID or the first property in properties)
  const isCaretaker = session.role === "Caretaker";
  const mandatedPropertyId = isCaretaker ? session.property_id! : "";
  
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);

  // Room editing states
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editRoomRent, setEditRoomRent] = useState<string>("");
  const [editRoomUtil, setEditRoomUtil] = useState<string>("");
  const [editRoomStatus, setEditRoomStatus] = useState<string>("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceTicket[]>([]);
  
  // Caretaker specific dashboard view state
  const [caretakerDashFilter, setCaretakerDashFilter] = useState<"unpaid" | "paid">("unpaid");
  const [expandedPaidTenantId, setExpandedPaidTenantId] = useState<string | null>(null);

  // Tab State with "clock" view support
  const [activeTab, setActiveTab] = useState<"dashboard" | "rooms" | "tenants" | "payments" | "maintenance" | "properties" | "clock" | "caretakers" | "sms" | "requests" | "developer_google" | "developer_mpesa" | "developer_at">("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States and Handlers for Vacant Room Requests
  const [roomRequests, setRoomRequests] = useState<RoomRequest[]>([]);
  const [fetchingRoomRequests, setFetchingRoomRequests] = useState(false);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);

  const fetchRoomRequests = async () => {
    setFetchingRoomRequests(true);
    try {
      const response = await fetch("/api/room-requests");
      if (response.ok) {
        const data = await response.json();
        setRoomRequests(data);
      }
    } catch (err) {
      console.error("Error loading room requests:", err);
    } finally {
      setFetchingRoomRequests(false);
    }
  };

  const handleDeleteRoomRequest = async (id: string) => {
    if (!window.confirm("Are you sure you want to dismiss this vacant room request from list?")) {
      return;
    }
    setDeletingRequestId(id);
    try {
      const response = await fetch(`/api/room-requests/${id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setRoomRequests(prev => prev.filter(r => r.id !== id));
        // Push a log
        const logStr = `[ROOM REQUESTS] Dismissed applicant request ID: ${id}`;
        setSyncLogs(prev => [logStr, ...prev.slice(0, 49)]);
      } else {
        alert("Unable to dismiss request at the moment.");
      }
    } catch (err) {
      console.error("Error deleting room request:", err);
    } finally {
      setDeletingRequestId(null);
    }
  };

  const handleTabClick = (tab: "dashboard" | "rooms" | "tenants" | "payments" | "maintenance" | "properties" | "clock" | "caretakers" | "sms" | "requests" | "developer_google" | "developer_mpesa" | "developer_at") => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  // Live clock and synchronization trails
  const [currentTime, setCurrentTime] = useState(new Date());
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  // SMS configuration states
  const [smsLogs, setSmsLogs] = useState<any[]>([]);
  const [smsTemplate, setSmsTemplate] = useState<string>("Dear {name}, this is a friendly reminder that you have an outstanding rent balance of KES {amount} for Room {room} at {property}. Please clear your balance as soon as possible via M-PESA. Thank you.");
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsTargetMode, setSmsTargetMode] = useState<"all_unpaid" | "single">("all_unpaid");
  const [smsSingleTenantId, setSmsSingleTenantId] = useState<string>("");
  const [smsSuccessMessage, setSmsSuccessMessage] = useState<string | null>(null);
  const [smsErrorMessage, setSmsErrorMessage] = useState<string | null>(null);

  // Deletion Terms & Confirmation Overlay State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'room' | 'property' | 'tenant' | 'payment' | 'maintenance';
    id: string; // identifier
    displayLabel: string;
    extraId?: string; // used for room property mapping
  } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Developer / Google Firebase / M-Pesa / Africa's Talking configurations
  const [devConfig, setDevConfig] = useState({
    projectId: "",
    appId: "",
    apiKey: "",
    authDomain: "",
    firestoreDatabaseId: "",
    storageBucket: "",
    messagingSenderId: "",
    measurementId: "",
    mpesaConsumerKey: "",
    mpesaConsumerSecret: "",
    mpesaShortcode: "",
    mpesaPasskey: "",
    atApiKey: "",
    atUsername: ""
  });
  const [devLoading, setDevLoading] = useState(false);
  const [devStatus, setDevStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (activeTab.startsWith("developer_") && session.email?.toLowerCase().trim() === "collinskosgei32@gmail.com") {
      setDevLoading(true);
      setDevStatus(null);
      fetch(`/api/developer/firebase-config?email=${encodeURIComponent(session.email)}`)
        .then(res => {
          if (res.ok) return res.json();
          throw new Error("Unable to fetch configuration parameters.");
        })
        .then(data => {
          setDevConfig({
            projectId: data.projectId || "",
            appId: data.appId || "",
            apiKey: data.apiKey || "",
            authDomain: data.authDomain || "",
            firestoreDatabaseId: data.firestoreDatabaseId || "",
            storageBucket: data.storageBucket || "",
            messagingSenderId: data.messagingSenderId || "",
            measurementId: data.measurementId || "",
            mpesaConsumerKey: data.mpesaConsumerKey || "",
            mpesaConsumerSecret: data.mpesaConsumerSecret || "",
            mpesaShortcode: data.mpesaShortcode || "",
            mpesaPasskey: data.mpesaPasskey || "",
            atApiKey: data.atApiKey || "",
            atUsername: data.atUsername || ""
          });
        })
        .catch(err => {
          setDevStatus({ type: "error", message: err.message });
        })
        .finally(() => {
          setDevLoading(false);
        });
    }
  }, [activeTab, session.email]);

  const handleUpdateDevConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (session.email?.toLowerCase().trim() !== "collinskosgei32@gmail.com") {
      alert("Unauthorized: Only collinskosgei32@gmail.com is authorized to manage dynamic integrations.");
      return;
    }
    setDevLoading(true);
    setDevStatus(null);
    try {
      const response = await fetch("/api/developer/firebase-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session.email,
          config: devConfig
        })
      });
      const resData = await response.json();
      if (response.ok) {
        let label = "Developer settings updated successfully!";
        if (activeTab === "developer_google") {
          label = "Google Firestore keys updated successfully! Connected to database ID: " + devConfig.firestoreDatabaseId + ".";
        } else if (activeTab === "developer_mpesa") {
          label = "Safaricom M-Pesa client keys updated successfully! Shortcode active: " + devConfig.mpesaShortcode + ".";
        } else if (activeTab === "developer_at") {
          label = "Africa's Talking SMS credentials updated successfully! Username active: " + devConfig.atUsername + ".";
        }
        setDevStatus({ 
          type: "success", 
          message: label
        });
        const timeStr = new Date().toLocaleTimeString();
        setSyncLogs(prev => [`[${timeStr}] ${label}`, ...prev]);
        onRefreshProperties();
      } else {
        setDevStatus({ type: "error", message: resData.error || "Update operation failed on server." });
      }
    } catch (err) {
      setDevStatus({ type: "error", message: "Failed to connect to the backend server." });
    } finally {
      setDevLoading(false);
    }
  };

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

  // Caretaker Form & List States
  const [caretakersList, setCaretakersList] = useState<any[]>([]);
  const [newCaretakerName, setNewCaretakerName] = useState("");
  const [newCaretakerEmail, setNewCaretakerEmail] = useState("");
  const [newCaretakerPropId, setNewCaretakerPropId] = useState("");
  const [newCaretakerRoom, setNewCaretakerRoom] = useState("");
  const [caretakerError, setCaretakerError] = useState<string | null>(null);
  const [caretakerSuccess, setCaretakerSuccess] = useState<string | null>(null);
  const [isSavingCaretaker, setIsSavingCaretaker] = useState(false);

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

  // Load caretakers list on tab change
  useEffect(() => {
    if (!isCaretaker) {
      fetchCaretakers();
    }
  }, [activeTab]);

  // Load room requests on tab change
  useEffect(() => {
    if (activeTab === "requests") {
      fetchRoomRequests();
    }
  }, [activeTab]);

  // Regular dashboard polling (refresh telemetry every 5s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPropertySpecifics();
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedPropertyId]);

  // Live Timer Clock Effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // System Sync Log Initializer
  useEffect(() => {
    const timeStr = new Date().toLocaleTimeString();
    setSyncLogs([
      `[${timeStr}] Initialized Admin Portal session for: ${session.name}`,
      `[${timeStr}] Active synchronization worker bound @ 5000ms periodic heartbeat.`,
      `[${timeStr}] Safaricom Daraja M-Pesa STK Push API sandbox fully online.`
    ]);
  }, [session.name]);

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
      let loadedRooms: Room[] = [];
      if (roomsResponse.ok) {
        loadedRooms = await roomsResponse.json();
        setRooms(loadedRooms);
      }

      // 2. Fetch Tenants
      const tenantsResponse = await fetch("/api/tenants");
      let loadedTenants: any[] = [];
      if (tenantsResponse.ok) {
        const tenantsList: any[] = await tenantsResponse.json();
        loadedTenants = tenantsList.filter(t => t.property_id === selectedPropertyId);
        setTenants(loadedTenants);
      }

      // 3. Fetch Payments
      const paymentsResponse = await fetch("/api/payments");
      let loadedPayments: Payment[] = [];
      if (paymentsResponse.ok) {
        const paymentsList: Payment[] = await paymentsResponse.json();
        loadedPayments = paymentsList.filter(p => p.property_id === selectedPropertyId);
        setPayments(loadedPayments);
      }

      // 4. Fetch Maintenance Tickets
      const maintenanceResponse = await fetch("/api/maintenance");
      let loadedTickets: MaintenanceTicket[] = [];
      if (maintenanceResponse.ok) {
        const maintenanceList: MaintenanceTicket[] = await maintenanceResponse.json();
        loadedTickets = maintenanceList.filter(m => m.property_id === selectedPropertyId);
        setMaintenance(loadedTickets);
      }

      // 5. Fetch SMS Logs
      let smsCount = 0;
      try {
        const smsResponse = await fetch("/api/sms/logs");
        if (smsResponse.ok) {
          const smsList = await smsResponse.json();
          setSmsLogs(smsList);
          smsCount = smsList.length;
        }
      } catch (e) {
        console.warn("SMS Logs loading failed", e);
      }

      // Append log entry cleanly
      const logStr = `[${new Date().toLocaleTimeString()}] Auto-Sync: Verified ${loadedRooms.length} rooms, ${loadedTenants.length} tenants, ${loadedPayments.length} payments, ${loadedTickets.length} tickets, and ${smsCount} communication remnants.`;
      setSyncLogs(prev => [logStr, ...prev.slice(0, 49)]);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes("Failed to fetch")) {
        console.warn("Telemetry background tick: Server is currently reconnecting or offline.");
      } else {
        console.warn("Error fetching admin telemetry metrics gracefully:", error);
      }
    }
  };

  const triggerDeleteFlow = (
    type: 'room' | 'property' | 'tenant' | 'payment' | 'maintenance',
    id: string,
    displayLabel: string,
    extraId?: string
  ) => {
    setDeleteTarget({ type, id, displayLabel, extraId });
    setTermsAccepted(false);
    setDeleteModalOpen(true);
  };

  const executeDeletion = async () => {
    if (!deleteTarget) return;
    if (!termsAccepted) {
      alert("Please accept the Terms and Conditions to authorize permanent record deletion.");
      return;
    }

    setIsDeleting(true);
    try {
      let url = "";
      switch (deleteTarget.type) {
        case "property":
          url = `/api/properties/${deleteTarget.id}`;
          break;
        case "room":
          url = `/api/properties/${deleteTarget.extraId}/rooms/${deleteTarget.id}`;
          break;
        case "tenant":
          url = `/api/tenants/${deleteTarget.id}`;
          break;
        case "payment":
          url = `/api/payments/${deleteTarget.id}`;
          break;
        case "maintenance":
          url = `/api/maintenance/${deleteTarget.id}`;
          break;
      }

      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) {
        const d = await response.json();
        throw new Error(d.error || "Server rejected deletion.");
      }

      // Success
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      setTermsAccepted(false);

      onRefreshProperties();
      if (deleteTarget.type === "property") {
        const remaining = properties.filter(p => p.property_id !== deleteTarget.id);
        if (remaining.length > 0) {
          setSelectedPropertyId(remaining[0].property_id);
        } else {
          setSelectedPropertyId("");
        }
      }

      fetchPropertySpecifics();
      
      const timeStr = new Date().toLocaleTimeString();
      setSyncLogs(prev => [
        `[${timeStr}] Database Event: Purged ${deleteTarget.type.toUpperCase()} record (${deleteTarget.displayLabel}) completely.`,
        ...prev
      ]);
    } catch (err: any) {
      alert(err.message || "Failed to delete item.");
    } finally {
      setIsDeleting(false);
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
      onRefreshProperties();
      alert("Apartment unit registered as Vacant.");
    } catch (err: any) {
      setRoomError(err.message || "Error creating unit.");
    }
  };

  // Update Room Details (Global or caretaker)
  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom || editRoomRent === "" || editRoomUtil === "") {
      alert("Please specify complete room pricing details.");
      return;
    }

    try {
      const response = await fetch(`/api/properties/${editingRoom.property_id}/rooms/${editingRoom.room_number}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_rent: Number(editRoomRent),
          utility_rate: Number(editRoomUtil),
          status: editRoomStatus
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update room details.");
      }

      setEditingRoom(null);
      fetchPropertySpecifics();
      onRefreshProperties();
      alert(`Room ${editingRoom.room_number} details successfully updated!`);
    } catch (err: any) {
      alert(err.message || "Error updating room details.");
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

      setTenantSuccess(`Tenant "${newTenantName}" registered inside Room ${newTenantRoom}! Security credentials auto-configured: Username (Phone Number): ${cleanPhone}, Access PIN: Room "${newTenantRoom}" or name PIN "${newTenantName.trim().split(" ")[0]}".`);
      setNewTenantName("");
      setNewTenantPhone("");
      fetchPropertySpecifics();
      onRefreshProperties();
    } catch (err: any) {
      setTenantError(err.message || "Error register tenant.");
    }
  };

  // Caretaker Handlers
  const fetchCaretakers = async () => {
    try {
      const response = await fetch("/api/caretakers");
      if (response.ok) {
        const data = await response.json();
        setCaretakersList(data);
      }
    } catch (err) {
      console.error("Error fetching caretakers:", err);
    }
  };

  const handleRegisterCaretaker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCaretaker) return;

    setCaretakerError(null);
    setCaretakerSuccess(null);

    if (!newCaretakerName || !newCaretakerEmail || !newCaretakerPropId) {
      setCaretakerError("Full name, email address, and managed building plot are required.");
      return;
    }

    setIsSavingCaretaker(true);
    try {
      const response = await fetch("/api/caretakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCaretakerName.trim(),
          email: newCaretakerEmail.trim().toLowerCase(),
          property_id: newCaretakerPropId,
          room_number: newCaretakerRoom.trim() || undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to register caretaker.");
      }

      const assignedPlotName = properties.find(p => p.property_id === newCaretakerPropId)?.property_name || "Plot";
      setCaretakerSuccess(`Caretaker "${newCaretakerName}" registered successfully! Security credentials PIN generated: "${data.caretaker.pin}". Assignee room validated in ${assignedPlotName}.`);
      setNewCaretakerName("");
      setNewCaretakerEmail("");
      setNewCaretakerRoom("");
      
      // Refresh options
      fetchCaretakers();
      onRefreshProperties();
    } catch (err: any) {
      setCaretakerError(err.message || "Error registering caretaker.");
    } finally {
      setIsSavingCaretaker(false);
    }
  };

  const handleDeleteCaretaker = async (caretakerId: string) => {
    if (isCaretaker) return;
    if (!window.confirm("Are you sure you want to revoke this caretaker's management credentials?")) return;

    try {
      const response = await fetch(`/api/caretakers/${caretakerId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        fetchCaretakers();
        onRefreshProperties();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to revoke caretaker.");
      }
    } catch (err) {
      console.error("Error deleting caretaker:", err);
      alert("Error contacting server.");
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
      onRefreshProperties();
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
        onRefreshProperties();
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
      onRefreshProperties();
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
      onRefreshProperties();
    } catch (err: any) {
      alert(`Handshake rejected: ${err.message || "Verification fail"}`);
    } finally {
      setStkTriggering(null);
    }
  };

  // SMS Broadcast Handler for Africa's Talking integration and automated triggers
  const handleSendSMS = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingSms(true);
    setSmsSuccessMessage(null);
    setSmsErrorMessage(null);

    try {
      const payload: any = {
        custom_message: smsTemplate,
      };

      if (smsTargetMode === "all_unpaid") {
        payload.tenant_ids = []; // Empty list sends to all unpaid/partially paid tenants
      } else {
        if (!smsSingleTenantId) {
          throw new Error("Please select a specific tenant to remind.");
        }
        payload.tenant_ids = [smsSingleTenantId];
      }

      const response = await fetch("/api/sms/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "SMS broadcast failed.");
      }

      if (data.success) {
        if (data.results && data.results.length > 0) {
          const names = data.results.map((r: any) => `${r.tenant_name} (${r.status})`).join(", ");
          setSmsSuccessMessage(`Reminder notifications processed successfully! Targets notified: ${data.results.length} tenants. [${names}]`);
        } else {
          setSmsSuccessMessage("Reminder check complete. No tenants currently match the reminder criteria (outstanding > 0).");
        }
        // Refresh specific info and logs
        fetchPropertySpecifics();
      } else {
        setSmsErrorMessage(data.error || "Failed to trigger alerts.");
      }
    } catch (err: any) {
      setSmsErrorMessage(err.message || "An unexpected communication error occurred.");
    } finally {
      setIsSendingSms(false);
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
    <div id="admin-portal-root" className="min-h-screen bg-transparent flex flex-col md:flex-row text-left">
      
      {/* MOBILE TOP BAR */}
      <header className="md:hidden bg-slate-900 border-b border-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 w-full shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-rose-400" /> : <Menu className="w-5 h-5 text-emerald-400" />}
          </button>
          
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <div className="text-left">
              <h1 className="text-xs font-extrabold font-display leading-tight text-white">{activeBrandName || "Landlord Deck"}</h1>
              <p className="text-[9px] text-slate-400 font-mono -mt-0.5">Admin Ops Portal</p>
            </div>
          </div>
        </div>

        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-mono font-bold text-emerald-400 border border-slate-700 uppercase" title={session.name}>
          {session.name ? session.name[0] : "A"}
        </div>
      </header>

      {/* MOBILE BACKDROP OVERLAY */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)} 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-35 md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* SIDEBAR NAVIGATION - Optimized for both desktop and mobile rails */}
      <aside 
        id="admin-sidebar" 
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white shrink-0 flex flex-col border-r border-slate-800 transform md:transform-none md:static md:translate-x-0 transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-slate-800 flex items-center justify-between md:justify-start gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" />
            <div className="text-left">
              <h2 className="text-xs font-bold tracking-tight font-display text-white truncate max-w-[150px]" title={session.name}>
                {session.name || "Landlord Desk Console"}
              </h2>
              <p className="text-[9px] text-slate-400 font-mono">
                {session.email ? session.email : `${session.role} Session`}
              </p>
            </div>
          </div>
          {/* Close button inside sidebar for mobile drawer */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
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
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 appearance-none text-left"
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

        <nav className="flex-grow p-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => handleTabClick("dashboard")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
              activeTab === "dashboard" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Working Dashboard</span>
          </button>
          
          <button
            onClick={() => handleTabClick("rooms")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
              activeTab === "rooms" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Manage Unit Rooms</span>
          </button>

          <button
            onClick={() => handleTabClick("tenants")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
              activeTab === "tenants" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Tenancy Placement</span>
          </button>

          {!isCaretaker && (
            <button
              onClick={() => handleTabClick("payments")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
                activeTab === "payments" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Payments Ledger</span>
            </button>
          )}

          <button
            onClick={() => handleTabClick("maintenance")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all relative text-left ${
              activeTab === "maintenance" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Maintenance Tickets</span>
            {pendingTicketsCount > 0 && (
              <span className="absolute right-2 px-1.5 py-0.5 bg-rose-500 text-white font-mono text-[9px] font-bold rounded-full">{pendingTicketsCount}</span>
            )}
          </button>

          <button
            onClick={() => handleTabClick("sms")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
              activeTab === "sms" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Communications Desk</span>
          </button>

          <button
            onClick={() => handleTabClick("requests")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all relative text-left ${
              activeTab === "requests" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <ListCollapse className="w-4 h-4 text-emerald-400" />
            <span>Requested Rooms</span>
            {roomRequests.length > 0 && (
              <span className="absolute right-2 px-1.5 py-0.5 bg-emerald-500 text-white font-mono text-[9px] font-bold rounded-full animate-bounce">{roomRequests.length}</span>
            )}
          </button>

          {!isCaretaker && (
            <>
              <button
                onClick={() => handleTabClick("properties")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
                  activeTab === "properties" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>Register New Plot</span>
              </button>

              <button
                onClick={() => handleTabClick("caretakers")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
                  activeTab === "caretakers" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <User className="w-4 h-4 text-emerald-500 animate-pulse" />
                <span>Register Caretaker</span>
              </button>
            </>
          )}

          <button
            onClick={() => handleTabClick("clock")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left ${
              activeTab === "clock" ? "sidebar-active text-white shadow-xs" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Clock Sync Auditor</span>
          </button>

          {session.email?.toLowerCase().trim() === "collinskosgei32@gmail.com" && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <div className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5 pb-1">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>ROOT DEVELOPER</span>
              </div>
              
              <button
                onClick={() => handleTabClick("developer_google")}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all text-left pl-5 ${
                  activeTab === "developer_google" ? "sidebar-active text-white bg-emerald-600 shadow-xs" : "text-emerald-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${activeTab === "developer_google" ? "bg-white" : "bg-emerald-400"}`} />
                <span>Google Firestore</span>
              </button>

              <button
                onClick={() => handleTabClick("developer_mpesa")}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all text-left pl-5 ${
                  activeTab === "developer_mpesa" ? "sidebar-active text-white bg-emerald-600 shadow-xs" : "text-emerald-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${activeTab === "developer_mpesa" ? "bg-white" : "bg-emerald-400"}`} />
                <span>M-Pesa API</span>
              </button>

              <button
                onClick={() => handleTabClick("developer_at")}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all text-left pl-5 ${
                  activeTab === "developer_at" ? "sidebar-active text-white bg-emerald-600 shadow-xs" : "text-emerald-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${activeTab === "developer_at" ? "bg-white" : "bg-emerald-400"}`} />
                <span>Africa's Talking</span>
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenSettings?.();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left text-emerald-450 hover:text-white hover:bg-emerald-500/10 border border-emerald-500/20 bg-emerald-500/5 mt-1"
            title="Adjust system preferences and accessibility options"
          >
            <Settings className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>⚙️ System Settings</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 shrink-0">
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
        
        {/* 2. WORKING DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Custom Luxurious Page Header */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/15 rounded-full border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                    Estate Operations Control Hub
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    {activeBrandName} Dashboard
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Estate Admin: <strong className="text-slate-200 font-bold">{session.name}</strong>{isCaretaker && " (Caretaker Locks Active)"}. Supervise resident profiles, pending maintenance, and automated resident M-Pesa billings.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="p-3 bg-slate-800/80 backdrop-blur-xs rounded-xl border border-slate-700/50 text-center min-w-[125px]">
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">Clearing Ledger</span>
                    <div className="font-mono text-xs font-black text-emerald-400">KES {totalClearedInPlot.toLocaleString()}</div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("clock")}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-white font-mono text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:border-emerald-500/45"
                      title="Click to view full System clock sync logs"
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>{currentTime.toLocaleTimeString()}</span>
                    </button>

                    <button
                      onClick={fetchPropertySpecifics}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-mono text-xs rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all border border-emerald-400 shadow-sm"
                    >
                      🔄 Forcesync
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 2 BENTO ANALYTICS CARDS */}
            <section id="bento-grid" className="grid grid-cols-2 max-w-3xl gap-4">
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
              {isCaretaker ? (
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-left high-contrast-card">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2">
                        <span>👷</span>
                        <span>Caretaker Operations Dashboard</span>
                      </h3>
                      <p className="text-[11px] text-slate-500">Simple tracking of collections and tenant arrears:</p>
                    </div>
                    <div className="flex bg-slate-150 rounded-lg p-0.5 border border-slate-200 shadow-inner">
                      <button
                        onClick={() => setCaretakerDashFilter("unpaid")}
                        className={`px-3 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer ${
                          caretakerDashFilter === "unpaid" ? "bg-white text-rose-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        ⚠️ Unpaid ({tenants.filter(t => (t.billing?.outstandingBalance || 0) > 0).length})
                      </button>
                      <button
                        onClick={() => setCaretakerDashFilter("paid")}
                        className={`px-3 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer ${
                          caretakerDashFilter === "paid" ? "bg-white text-emerald-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        ✓ Paid ({tenants.filter(t => (t.billing?.outstandingBalance || 0) === 0).length})
                      </button>
                    </div>
                  </div>

                  {tenants.length === 0 ? (
                    <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                      <p className="text-xs text-slate-400">No tenants registered on {activeBrandName} yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {caretakerDashFilter === "unpaid" && (
                        <>
                          {tenants.filter(t => (t.billing?.outstandingBalance || 0) > 0).length === 0 ? (
                            <div className="py-8 bg-emerald-50 border border-dashed border-emerald-100 rounded-xl text-center text-emerald-700 font-bold text-xs animate-in zoom-in-95 duration-250">
                              🎉 Congratulations! All tenants under your watch have fully settled their dues.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {tenants.filter(t => (t.billing?.outstandingBalance || 0) > 0).map((t) => {
                                const owed = t.billing?.outstandingBalance || 0;
                                const dueDateStr = t.billing?.periodStart 
                                  ? new Date(t.billing.periodStart).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })
                                  : "N/A";
                                return (
                                  <div key={t.tenant_id} className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl text-xs space-y-3 relative hover:border-rose-200 transition-all shadow-xs">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <div className="font-extrabold text-slate-900 text-sm tracking-tight">{t.full_name}</div>
                                        <div className="text-[10px] text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-md font-extrabold font-mono inline-block mt-1">Room {t.assigned_room_number}</div>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[9px] text-rose-500 uppercase font-black tracking-wider block">Owed Amount</span>
                                        <span className="font-mono text-sm font-black text-rose-700">{owed.toLocaleString()} KES</span>
                                      </div>
                                    </div>

                                    <div className="pt-2 border-t border-slate-200/50 flex flex-col gap-1.5 text-slate-600 font-medium">
                                      <div className="flex items-center justify-between">
                                        <span>📲 Contacts:</span>
                                        <a href={`tel:${t.phone_number}`} className="font-mono font-bold text-slate-900 hover:underline">0{t.phone_number.slice(-9)}</a>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span>📅 Supposed to Pay on:</span>
                                        <span className="font-bold text-rose-650 font-mono">{dueDateStr}</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-1.5">
                                      <a
                                        href={`tel:${t.phone_number}`}
                                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] uppercase rounded-lg text-center transition-all cursor-pointer shadow-sm"
                                      >
                                        📞 Call Tenant
                                      </a>
                                      <button
                                        disabled={stkTriggering === t.tenant_id}
                                        onClick={() => handleTriggerMpesaOnBehalf(t)}
                                        className="flex-1 py-2 mpesa-green text-white font-bold text-[10px] uppercase rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm hover:opacity-95"
                                      >
                                        {stkTriggering === t.tenant_id ? "Triggering..." : "Trigger STK"}
                                        <Smartphone className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}

                      {caretakerDashFilter === "paid" && (
                        <>
                          {tenants.filter(t => (t.billing?.outstandingBalance || 0) === 0).length === 0 ? (
                            <div className="py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                              No tenants have completed their payments in this period.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {tenants.filter(t => (t.billing?.outstandingBalance || 0) === 0).map((t) => {
                                const isExpanded = expandedPaidTenantId === t.tenant_id;
                                
                                const periodStartObj = t.billing?.periodStart ? new Date(t.billing.periodStart) : null;
                                const tenantPayments = payments.filter((p) => {
                                  if (p.tenant_id !== t.tenant_id || p.status !== "Completed") return false;
                                  if (!periodStartObj) return true;
                                  return new Date(p.timestamp) >= periodStartObj;
                                });
                                
                                const latestPayment = tenantPayments.length > 0 ? tenantPayments[tenantPayments.length - 1] : null;
                                
                                const dateOfPayment = latestPayment 
                                  ? new Date(latestPayment.timestamp).toLocaleString("en-KE", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : periodStartObj 
                                  ? `Recurring Anniversary (${new Date(periodStartObj).toLocaleDateString("en-KE")})`
                                  : "N/A";

                                const amountPaid = t.billing?.clearedAmount || latestPayment?.amount || t.billing?.dueAmount || 0;
                                
                                const nextPaymentDate = t.billing?.periodEnd
                                  ? new Date(t.billing.periodEnd).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })
                                  : "N/A";

                                return (
                                  <div 
                                    key={t.tenant_id} 
                                    onClick={() => setExpandedPaidTenantId(isExpanded ? null : t.tenant_id)}
                                    className={`p-3.5 border rounded-xl transition-all cursor-pointer text-left ${
                                      isExpanded 
                                        ? "bg-slate-900 text-white border-slate-800 shadow-md scale-[0.99]" 
                                        : "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                                        <div>
                                          <div className={`font-extrabold ${isExpanded ? "text-white" : "text-slate-900"} text-sm`}>{t.full_name}</div>
                                          <span className="text-[10px] text-slate-400 font-bold font-mono">Room {t.assigned_room_number} • 0{t.phone_number.slice(-9)}</span>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <span className={`text-[10px] font-black ${isExpanded ? "text-emerald-400 bg-emerald-500/15" : "text-emerald-700 bg-emerald-50"} px-2.5 py-1 rounded-full uppercase tracking-wider`}>
                                          Paid
                                        </span>
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div className="mt-3.5 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-in slide-in-from-top-1 duration-150">
                                        <div className="bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">📅 Payment Date</span>
                                          <div className="font-bold text-slate-100 mt-1">{dateOfPayment}</div>
                                        </div>
                                        <div className="bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">💰 Amount Paid</span>
                                          <div className="font-mono font-bold text-emerald-400 mt-1">{amountPaid.toLocaleString()} KES</div>
                                        </div>
                                        <div className="bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">⌛ Next Payment Date</span>
                                          <div className="font-bold text-indigo-400 mt-1 font-mono">{nextPaymentDate}</div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {!isExpanded && (
                                      <div className="mt-2 text-center pt-1 border-t border-slate-150">
                                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">✨ Click to expand payment date, amount, and next rent due date</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
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
              )}

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
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Custom Luxurious Page Header */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/15 rounded-full border border-blue-500/20 text-blue-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                    Vacancy Inventory Control
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    Unit Rooms Floor Space
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Configure room dimensions, monthly rents, and one-time refundable security deposits for individual rentable apartments inside {activeBrandName}.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-2">
                    <div className="p-2.5 bg-slate-800/80 backdrop-blur-xs rounded-xl border border-slate-700/50 text-center">
                      <span className="text-[8px] uppercase font-bold text-slate-400 block mb-0.5">Total</span>
                      <div className="font-mono text-xs font-black text-white">{rooms.length} Units</div>
                    </div>
                    <div className="p-2.5 bg-slate-800/80 backdrop-blur-xs rounded-xl border border-slate-700/50 text-center">
                      <span className="text-[8px] uppercase font-bold text-slate-400 block mb-0.5">Vacant</span>
                      <div className="font-mono text-xs font-black text-emerald-400">{rooms.filter(r => r.status === "Vacant").length} Rooms</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("clock")}
                      className="px-3 py-2 bg-slate-805 hover:bg-slate-750 text-white font-mono text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                      title="Click to view full System clock sync logs"
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>{currentTime.toLocaleTimeString()}</span>
                    </button>

                    <button
                      onClick={fetchPropertySpecifics}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-mono text-xs rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all border border-emerald-400 shadow-sm"
                    >
                      🔄 Forcesync
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* ROOM PANEL (ADD OR EDIT) */}
            <div className="lg:col-span-4 bg-white p-5 shadow-xs text-left h-fit high-contrast-card">
              {editingRoom ? (
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-1.5 mb-2">
                    <Edit3 className="w-5 h-5 text-indigo-500 animate-bounce" />
                    <span>Edit Unit Room: {editingRoom.room_number}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">Modify pricing specs or vacancy status for this rentable apartment unit:</p>

                  <form onSubmit={handleUpdateRoom} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Room Number Code (Read Only)</label>
                      <input
                        type="text"
                        value={editingRoom.room_number}
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Monthly Billing Rent (KES) {isCaretaker && "(Read Only)"}
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 15000"
                        value={editRoomRent}
                        onChange={(e) => setEditRoomRent(e.target.value)}
                        disabled={isCaretaker}
                        className={`w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold ${
                          isCaretaker ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-slate-50"
                        }`}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Security Deposit / Maintenance (KES) {isCaretaker && "(Read Only)"}
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 5000"
                        value={editRoomUtil}
                        onChange={(e) => setEditRoomUtil(e.target.value)}
                        disabled={isCaretaker}
                        className={`w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold ${
                          isCaretaker ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-slate-50"
                        }`}
                        required
                      />
                      <p className="text-[9px] text-slate-400 mt-1 leading-normal font-sans">
                        Paid once when securing a room to cover damages. Refunded upon check-out.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Placement State</label>
                      <select
                        value={editRoomStatus}
                        onChange={(e) => setEditRoomStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                        required
                      >
                        <option value="Vacant">Vacant</option>
                        <option value="Occupied">Occupied</option>
                      </select>
                    </div>

                    <div className="flex gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingRoom(null)}
                        className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer text-center"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer text-center shadow-md shadow-indigo-600/10"
                      >
                        Save Details
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div>
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
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Security Deposit / Maintenance Fee (KES)</label>
                      <input
                        id="new-room-util"
                        type="number"
                        placeholder="e.g. 5000 (Refundable security / maintenance deposit)"
                        value={newRoomUtil}
                        onChange={(e) => setNewRoomUtil(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-800"
                        required
                      />
                      <p className="text-[9px] text-slate-400 mt-1 leading-normal font-sans">
                        Paid once when securing a room to cover damages (e.g. toilet fixtures, paint). Fully or partially refunded upon moving out.
                      </p>
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
              )}
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
                        <th className="p-3">Security Deposit (Refundable)</th>
                        <th className="p-3">First Month Total (Rent + Deposit)</th>
                        <th className="p-3 text-center">Placement State</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="p-3 font-bold font-mono text-slate-900 text-sm">{r.room_number}</td>
                          <td className="p-3 font-mono">{r.monthly_rent.toLocaleString()} KES</td>
                          <td className="p-3 font-mono text-slate-500">
                            {r.utility_rate.toLocaleString()} KES
                            <span className="text-[9px] text-slate-400 block font-sans font-normal mt-0.5">Paid once</span>
                          </td>
                          <td className="p-3 font-bold font-mono text-slate-850">
                            {(r.monthly_rent + r.utility_rate).toLocaleString()} KES
                            <span className="text-[9px] text-slate-400 block font-sans font-normal mt-0.5">Subsequent months: {r.monthly_rent.toLocaleString()} KES</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                              r.status === "Vacant" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-blue-50 text-blue-800 border border-blue-100"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingRoom(r);
                                  setEditRoomRent(String(r.monthly_rent));
                                  setEditRoomUtil(String(r.utility_rate));
                                  setEditRoomStatus(r.status);
                                }}
                                className="p-1 px-2.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-[11px]"
                                title="Edit unit space prices and settings"
                              >
                                <Edit3 className="w-3 h-3 text-indigo-500" />
                                <span>Edit</span>
                              </button>
                              {!isCaretaker && (
                                <button
                                  onClick={() => triggerDeleteFlow('room', r.room_number, `Room ${r.room_number}`, r.property_id)}
                                  className="p-1 px-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                  title="Delete unit space permanently"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

        {/* 4. PLACEMENT REGISTER USER TAB */}
        {activeTab === "tenants" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Custom Luxurious Page Header */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/15 rounded-full border border-indigo-500/20 text-indigo-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                    Tenant Lease Canopy
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    Tenancy Placement & Residents
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Allocate vacant rooms to incoming occupants in {activeBrandName}. Configure Safaricom phone contacts, set custom billing anniversaries, and manage active leases.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="p-3 bg-slate-850 opacity-95 rounded-xl border border-slate-700/50 text-center min-w-[125px]">
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">Lease Directory</span>
                    <div className="font-mono text-xs font-bold text-indigo-400">{tenants.length} Residents Placed</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("clock")}
                      className="px-3 py-2 bg-slate-850 hover:bg-slate-755 text-white font-mono text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                      title="Click to view full System clock sync logs"
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>{currentTime.toLocaleTimeString()}</span>
                    </button>

                    <button
                      onClick={fetchPropertySpecifics}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-mono text-xs rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all border border-emerald-400 shadow-sm"
                    >
                      🔄 Forcesync
                    </button>
                  </div>
                </div>
              </div>
            </div>

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
                      <option key={r.room_number} value={r.room_number}>🚪 ROOM {r.room_number} (Rent: KES {r.monthly_rent.toLocaleString()} + Deposit: KES {r.utility_rate.toLocaleString()})</option>
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

                {(() => {
                  const activeSelectedRoom = vacantRooms.find(r => r.room_number === newTenantRoom);
                  if (!activeSelectedRoom) return null;
                  const totalInitialFunds = activeSelectedRoom.monthly_rent + activeSelectedRoom.utility_rate;
                  return (
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl space-y-2 text-left">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-blue-700 font-mono">
                        💰 Onboarding Financial Breakdown
                      </span>
                      <div className="space-y-1 text-xs text-slate-700">
                        <div className="flex justify-between">
                          <span>First Month Rent:</span>
                          <span className="font-mono font-bold">KES {activeSelectedRoom.monthly_rent.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Security Deposit (Refundable):</span>
                          <span className="font-mono font-bold">KES {activeSelectedRoom.utility_rate.toLocaleString()}</span>
                        </div>
                        <div className="pt-2 border-t border-blue-100 flex justify-between text-slate-900 leading-normal">
                          <span className="font-bold">Total Initial Funds Owed:</span>
                          <span className="font-mono font-black text-blue-800 text-sm">KES {totalInitialFunds.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

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
                        <th className="p-3">Registration &amp; Duration</th>
                        <th className="p-3">Total Paid &amp; Clear Dates</th>
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
                          <td className="p-3">
                            <div className="space-y-1 font-sans">
                              <div>
                                <span className="font-bold text-slate-500">Date Assigned:</span>{" "}
                                <span className="text-slate-905 font-mono font-bold">
                                  {new Date(t.registration_date).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-slate-500">Duration Covered:</span>
                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-150 px-1.5 py-0.5 rounded-md font-bold text-[10px] animate-pulse whitespace-nowrap">
                                  ⏳ {calculateTimeCovered(t.registration_date)}
                                </span>
                              </div>
                              <span className="text-[10px] text-indigo-650 font-bold block">
                                Day {t.registration_date.split("-")[2]} billing reset cycle
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {(() => {
                              const tenantPays = payments.filter((p) => p.tenant_id === t.tenant_id && p.status === "Completed");
                              const totalPaid = tenantPays.reduce((sum, p) => sum + p.amount, 0);
                              return (
                                <div className="space-y-1 max-w-[220px]">
                                  <div className="font-bold text-slate-900 text-[11px]">
                                    Paid Total: <span className="text-emerald-555 font-mono font-black text-xs">KES {totalPaid.toLocaleString()}</span>
                                  </div>
                                  {tenantPays.length > 0 ? (
                                    <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                                      {tenantPays.map((p, pIdx) => (
                                        <div key={p.transaction_id || pIdx} className="text-[10px] text-slate-500 font-mono flex items-center justify-between gap-2 border-b border-dashed border-slate-100 pb-0.5 last:border-0">
                                          <span className="text-slate-600 font-semibold">📅 {new Date(p.timestamp).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                          <span className="font-bold text-emerald-600">KES {p.amount.toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic block">No payments cleared yet</span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3 text-right">
                            {isCaretaker ? (
                              <span className="text-[10px] text-slate-300 italic">No termination rights</span>
                            ) : (
                              <button
                                id={`evict-tenant-${t.tenant_id}`}
                                onClick={() => triggerDeleteFlow('tenant', t.tenant_id, t.full_name)}
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
        </div>
      )}

        {/* 5. PAYMENTS LEDGER TAB */}
        {activeTab === "payments" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Custom Luxurious Page Header */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/15 rounded-full border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                    Double-Entry Revenue Ledger
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    Payments & M-Pesa Receipts Ledger
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    View verified Safaricom Lipa Na M-Pesa automatic STK Push payments, physical cash clearances, and track transaction references under {activeBrandName}.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="p-3 bg-slate-800/80 backdrop-blur-xs rounded-xl border border-slate-700/50 text-center min-w-[125px]">
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">Total Collected</span>
                    <div className="font-mono text-xs font-bold text-emerald-400">KES {totalClearedInPlot.toLocaleString()}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("clock")}
                      className="px-3 py-2 bg-slate-850 hover:bg-slate-750 text-white font-mono text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:border-emerald-500/45"
                      title="Click to view full System clock sync logs"
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>{currentTime.toLocaleTimeString()}</span>
                    </button>

                    <button
                      onClick={fetchPropertySpecifics}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-mono text-xs rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all border border-emerald-400 shadow-sm"
                    >
                      🔄 Forcesync
                    </button>
                  </div>
                </div>
              </div>
            </div>

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
                      <th className="p-3 text-right">Action</th>
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
                          <td className="p-3 text-right font-mono">
                            <button
                              onClick={() => triggerDeleteFlow('payment', p.transaction_id, `Receipt ${p.transaction_id.substring(0, 10)}... (KES ${p.amount})`)}
                              className="p-1 px-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Delete payment record from ledger"
                            >
                              <Trash2 className="w-3.5 h-3.5 animate-none" />
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
        </div>
      )}

        {/* 6. MAINTENANCE TICKETS TAB */}
        {activeTab === "maintenance" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Custom Luxurious Page Header */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/15 rounded-full border border-amber-500/20 text-amber-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full opacity-75"></span>
                    CareTaker Repair Desk
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    Maintenance & Support Tickets
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Review and update breakages, light leaks, painting requests, or plumbing failures submitted by current occupants in {activeBrandName}.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="p-3 bg-slate-800/80 backdrop-blur-xs rounded-xl border border-slate-700/50 text-center min-w-[125px]">
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">Urgent Resolved</span>
                    <div className="font-mono text-xs font-bold text-amber-400">{pendingTicketsCount} Pending Repair Logs</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("clock")}
                      className="px-3 py-2 bg-slate-805 hover:bg-slate-755 text-white font-mono text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                      title="Click to view full System clock sync logs"
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>{currentTime.toLocaleTimeString()}</span>
                    </button>

                    <button
                      onClick={fetchPropertySpecifics}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-mono text-xs rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all border border-emerald-400 shadow-sm"
                    >
                      🔄 Forcesync
                    </button>
                  </div>
                </div>
              </div>
            </div>

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
                          {!isCaretaker && (
                            <button
                              onClick={() => triggerDeleteFlow('maintenance', t.ticket_id, `${t.issue_type} Report`)}
                              className="p-1 px-1.5 ml-1 bg-rose-50 hover:bg-rose-100 text-rose-650 rounded-lg transition-all cursor-pointer"
                              title="Purge repair log permanently from records"
                            >
                              <Trash2 className="w-3 h-3 text-rose-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

        {/* 7. REGISTER NEW PLOT PROPERTY TAB (Super-Admin only) */}
        {activeTab === "properties" && !isCaretaker && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Custom Luxurious Page Header */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/15 rounded-full border border-cyan-500/20 text-cyan-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>
                    Super-Admin Canopy
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    Register Plot Property Hub
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    System portfolio management. Onboard custom apartment lots, register geographic town locations, and cascade-delete entire plots.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="p-3 bg-slate-800/80 backdrop-blur-xs rounded-xl border border-slate-700/50 text-center min-w-[125px]">
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">Database Canvas</span>
                    <div className="font-mono text-xs font-bold text-cyan-400">{properties.length} Plots</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("clock")}
                      className="px-3 py-2 bg-slate-855 hover:bg-slate-750 text-white font-mono text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:border-emerald-500/45"
                      title="Click to view full System clock sync logs"
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>{currentTime.toLocaleTimeString()}</span>
                    </button>

                    <button
                      onClick={fetchPropertySpecifics}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-mono text-xs rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all border border-emerald-400 shadow-sm"
                    >
                      🔄 Forcesync
                    </button>
                  </div>
                </div>
              </div>
            </div>

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
                  <div key={p.property_id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="text-left">
                        <h4 className="text-xs font-bold text-slate-800 font-display">{p.property_name}</h4>
                        <p className="text-[10px] text-slate-450 mt-1 flex items-center gap-1 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{p.geographic_location}</span>
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Units Created</span>
                          <span className="font-mono text-xs font-bold text-slate-800">{p.total_units} Active Rooms</span>
                        </div>
                        <button
                          onClick={() => triggerDeleteFlow('property', p.property_id, p.property_name)}
                          className="p-1.5 px-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-all cursor-pointer"
                          title="Delete entire plot along with rooms, tickets and ledger logs!"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Caretaker Assignment Option */}
                    <div className="pt-2.5 border-t border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Caretaker Email:</span>
                        {p.caretaker_email ? (
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[10px]">
                            {p.caretaker_email}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None (Demo Access Only)</span>
                        )}
                      </div>

                      {!isCaretaker ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="email"
                            placeholder="Assign Google email..."
                            defaultValue={p.caretaker_email || ""}
                            onBlur={async (e) => {
                              const email = e.target.value.toLowerCase().trim();
                              if (email !== (p.caretaker_email || "")) {
                                try {
                                  const response = await fetch(`/api/properties/${p.property_id}/caretaker`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ caretaker_email: email })
                                  });
                                  if (response.ok) {
                                    onRefreshProperties();
                                  } else {
                                    alert("Could not update caretaker email assignment.");
                                  }
                                } catch (err) {
                                  console.error("Caretaker save error:", err);
                                  alert("Error communicating with servers.");
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="bg-white border border-slate-200 rounded-lg py-1 px-2 text-[10px] w-48 font-mono focus:outline-none focus:ring-1 focus:ring-slate-800"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

        {/* 7.5. CARETAKERS DIRECT ONBOARDING & MANAGEMENT PANEL */}
        {activeTab === "caretakers" && !isCaretaker && (
          <div className="space-y-6 text-left animate-in fade-in duration-300">
            {/* Header */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 rounded-full border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider mb-2">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Security & Staff Administration
                  </div>
                  <h2 className="text-xl font-extrabold font-display tracking-tight text-white">
                    Onboard & Manage Caretakers
                  </h2>
                  <p className="text-slate-400 text-xs mt-1 max-w-2xl leading-relaxed">
                    Register and validate caretaker email handlers. The system generates high-security uppercase alphanumeric PINs mixed with words and numbers for manual auth, and verifies their premises apartments instantly against the active units catalog.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form panel Column */}
              <div className="lg:col-span-5 bg-white p-6 shadow-xs high-contrast-card flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-display mb-1">
                    👥 Register On-Site Assistant
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                    Set up direct login permissions through email verification or custom generated PINs.
                  </p>

                  <form onSubmit={handleRegisterCaretaker} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assistant Full Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Kelvin Kiprop"
                        value={newCaretakerName}
                        onChange={(e) => setNewCaretakerName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800 font-semibold text-slate-800"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Caretaker Email (Google Login Validation)</label>
                      <input
                        type="email"
                        placeholder="e.g. kelvin.kiprop@example.com"
                        value={newCaretakerEmail}
                        onChange={(e) => setNewCaretakerEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-800 text-slate-800"
                        required
                      />
                      {newCaretakerPropId && properties.find(p => p.property_id === newCaretakerPropId)?.caretaker_email === newCaretakerEmail && newCaretakerEmail && (
                        <span className="text-[10px] text-emerald-600 mt-1 block font-medium">
                          💡 Already registered caretaker email on selected plot. Auto-populated successfully.
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 font-sans">Assigned Managed Building Plot</label>
                      <select
                        value={newCaretakerPropId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewCaretakerPropId(val);
                          const matchingPlot = properties.find(p => p.property_id === val);
                          if (matchingPlot && matchingPlot.caretaker_email) {
                            setNewCaretakerEmail(matchingPlot.caretaker_email);
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800 text-slate-800 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23a0aec0%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:0.65rem_auto] bg-[right_1rem_center] bg-no-repeat"
                        required
                      >
                        <option value="">-- Choose Assigned Building --</option>
                        {properties.map((p) => (
                          <option key={p.property_id} value={p.property_id}>
                            🏢 {p.property_name} ({p.geographic_location})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Resident Staff Room (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. 101 or A2 (Checked against DB)"
                        value={newCaretakerRoom}
                        onChange={(e) => setNewCaretakerRoom(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs uppercase font-mono focus:outline-none focus:ring-2 focus:ring-slate-800 text-slate-800"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block leading-relaxed">Specify if they live on-site to validate their room in the database.</span>
                    </div>

                    {caretakerError && (
                      <div className="p-3 bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2 border border-rose-100">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{caretakerError}</span>
                      </div>
                    )}

                    {caretakerSuccess && (
                      <div className="p-4 bg-emerald-50/50 text-slate-800 text-xs rounded-xl flex flex-col gap-2 border border-emerald-100">
                        <div className="flex items-center gap-2 text-emerald-700 font-bold">
                          <CheckCircle className="w-4.5 h-4.5 shrink-0" />
                          <span>Staff Onboarded Successfully!</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed font-semibold">
                          {caretakerSuccess}
                        </p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSavingCaretaker}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>{isSavingCaretaker ? "Authenticating Premises..." : "Validate & Onboard Admin"}</span>
                      <Sparkles className="w-4.5 h-4.5 text-emerald-400" />
                    </button>
                  </form>
                </div>
              </div>

              {/* List Directory Panel Column */}
              <div className="lg:col-span-7 bg-white p-6 shadow-xs high-contrast-card flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 font-display">
                      🔑 Active Caretakers Directories
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-semibold">
                      View generated PINs and manage system privileges for on-site managers.
                    </p>
                  </div>
                  <span className="p-1 px-2.5 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded-lg border border-slate-200 shrink-0">
                    {caretakersList.length} Active Staff
                  </span>
                </div>

                {caretakersList.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-250 rounded-3xl flex-grow flex flex-col justify-center items-center">
                    <User className="w-10 h-10 text-slate-350 mb-2 animate-bounce" />
                    <p className="text-xs text-slate-450 italic font-semibold">No registered caretakers yet. Fill the onboarding form to grant credentials!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {caretakersList.map((c: any) => {
                      const managedPropObj = properties.find(p => p.property_id === c.property_id);
                      const managedPropName = managedPropObj ? managedPropObj.property_name : "Plot Access";
                      return (
                        <div key={c.caretaker_id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="text-left space-y-1">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Assigned Staff</span>
                            <h4 className="text-xs font-bold text-slate-800">{c.name}</h4>
                            <p className="text-xs font-mono text-slate-500">{c.email}</p>
                            <div className="pt-2 flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono text-[9px] font-bold rounded">
                                🏢 {managedPropName}
                              </span>
                              {c.room_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono text-[9px] font-bold rounded">
                                  🔑 Resides Room {c.room_number}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200/50 text-slate-600 border border-slate-200 font-mono text-[9px] font-bold rounded">
                                  💼 External Supervisor
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-end gap-2.5 shrink-0 justify-between sm:justify-start border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200/60">
                            <div className="text-left sm:text-right">
                              <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Authorization PIN</span>
                              <span className="p-1.5 px-3 bg-slate-200 text-slate-950 border border-slate-300 font-mono text-xs font-bold rounded-lg tracking-widest leading-none select-all block text-center font-bold">
                                {c.pin}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteCaretaker(c.caretaker_id)}
                              className="p-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 border border-rose-100 cursor-pointer"
                              title="Revoke management pass"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span>Revoke</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 9. COMMUNICATIONS DESK TAB */}
        {activeTab === "sms" && (
          <div className="space-y-6 text-left border-0 focus:outline-none">
            {/* Header Banner */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/15 rounded-full border border-blue-500/20 text-blue-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
                    Africa's Talking & M-Pesa Integrated Communications
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    Tenant Communications & Alerts Desk
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Trigger customized, automated SMS rent reminders via Africa's Talking SMS API. You can broadcast to all tenants with uncleared bills instantly.
                  </p>
                </div>
                
                {/* Statistics Box */}
                <div className="p-4 bg-slate-800/80 backdrop-blur-xs rounded-2xl border border-slate-700/50 text-center min-w-[200px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Uncleared Tenants</span>
                  <div className="font-mono text-2xl font-black text-rose-400 tracking-wider">
                    {tenants.filter(t => (t.billing?.outstandingBalance || 0) > 0).length}
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono block mt-1.5">Unnotified Traces Pending</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Reminder Form Container */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card">
                <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2 mb-2">
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  <span>Draft Reminder Broadcast</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4 font-sans">
                  Target unpaid tenants under the active plot. Your message automatically substitutes tenant fields.
                </p>

                <form onSubmit={handleSendSMS} className="space-y-4">
                  {/* Target Select */}
                  <div>
                    <label className="block text-[10px] text-slate-700 font-bold uppercase mb-1">Recipient Option</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSmsTargetMode("all_unpaid")}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                          smsTargetMode === "all_unpaid"
                            ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        ⚠️ All Unpaid Tenants ({tenants.filter(t => (t.billing?.outstandingBalance || 0) > 0).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSmsTargetMode("single");
                          if (tenants.length > 0 && !smsSingleTenantId) {
                            setSmsSingleTenantId(tenants[0].tenant_id);
                          }
                        }}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                          smsTargetMode === "single"
                            ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        👤 Single Tenant
                      </button>
                    </div>
                  </div>

                  {smsTargetMode === "single" && (
                    <div>
                      <label htmlFor="sms-tenant-select" className="block text-[10px] text-slate-700 font-bold uppercase mb-1">Select Leased Tenant</label>
                      <select
                        id="sms-tenant-select"
                        value={smsSingleTenantId}
                        onChange={(e) => setSmsSingleTenantId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-850 rounded-lg py-2 px-3 text-xs focus:ring-1 focus:ring-blue-500 text-left cursor-pointer"
                      >
                        {tenants.map(t => (
                          <option key={t.tenant_id} value={t.tenant_id}>
                            {t.full_name} ({t.assigned_room_number}) - Bal: KES {Math.round(t.billing?.outstandingBalance || 0)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Template Textarea */}
                  <div>
                    <label htmlFor="sms-template-input" className="block text-[10px] text-slate-700 font-bold uppercase mb-1">Rent Reminder Message Draft</label>
                    <textarea
                      id="sms-template-input"
                      rows={5}
                      value={smsTemplate}
                      onChange={(e) => setSmsTemplate(e.target.value)}
                      placeholder="Dear {name}, friendly reminder that..."
                      className="w-full bg-slate-50 border border-slate-200 text-slate-850 rounded-lg py-2 px-3 text-xs font-sans focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Placeholder references panel */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 text-[11px] text-slate-550 leading-relaxed font-sans space-y-1">
                    <p className="font-bold text-slate-700 mb-0.5">Substitution Placeholders:</p>
                    <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
                      <div><strong className="text-blue-600">{`{name}`}</strong>: Tenant Full Name</div>
                      <div><strong className="text-blue-600">{`{amount}`}</strong>: Uncleared Balance</div>
                      <div><strong className="text-blue-600">{`{room}`}</strong>: Leased Room</div>
                      <div><strong className="text-blue-600">{`{property}`}</strong>: Complex Name</div>
                      <div className="col-span-2"><strong className="text-blue-600">{`{cycle}`}</strong>: Billing Period Cycles</div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    type="submit"
                    id="initiate-sms-btn"
                    disabled={isSendingSms}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-550 disabled:bg-blue-250 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-md hover:shadow-blue-500/10 transition-all font-mono cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSendingSms ? "Broadcasting Reminders..." : "✓ Send Custom SMS Reminders"}
                  </button>

                  {/* Alerts alerts */}
                  {smsSuccessMessage && (
                    <div id="sms-success" className="p-3 bg-emerald-50 border border-emerald-155 rounded-lg text-emerald-800 text-xs text-left leading-relaxed">
                      {smsSuccessMessage}
                    </div>
                  )}

                  {smsErrorMessage && (
                    <div id="sms-error" className="p-3 bg-rose-50 border border-rose-155 rounded-lg text-rose-800 text-xs text-left leading-relaxed">
                      {smsErrorMessage}
                    </div>
                  )}
                </form>
              </div>

              {/* SMS Logs Ledger Board */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2 mb-2">
                    <Smartphone className="w-5 h-5 text-emerald-500" />
                    <span>Communications Ledger & SMS Logs</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 font-sans">
                    Historical record of dispatch updates, custom notices, and rent demands generated by this active portal.
                  </p>

                  <div className="border border-slate-150 rounded-xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto max-h-[360px]">
                      <table className="w-full text-left text-xs bg-transparent border-collapse font-sans">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-155 text-slate-500 font-bold">
                            <th className="p-3">Logged Date</th>
                            <th className="p-3">Tenant Details</th>
                            <th className="p-3">Message Snippet</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {smsLogs.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                                No previous tenant SMS updates found inside records database.
                              </td>
                            </tr>
                          ) : (
                            smsLogs.map((log: any) => (
                              <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 text-[10px] text-slate-500 font-mono whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleString("en-KE", { hour12: false })}
                                </td>
                                <td className="p-3 font-medium text-slate-850">
                                  <div className="font-semibold">{log.tenant_name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{log.phone_number}</div>
                                </td>
                                <td className="p-3 text-slate-650 max-w-xs truncate" title={log.message}>
                                  {log.message}
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full inline-flex text-[9px] font-bold tracking-wider uppercase ${
                                    log.status === "Sent"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-150"
                                      : log.status === "Simulated"
                                      ? "bg-blue-55 text-blue-700 border border-blue-150"
                                      : "bg-rose-50 text-rose-700 border border-rose-155"
                                  }`}>
                                    {log.status === "Sent" ? "✓ Sent" : log.status === "Simulated" ? "Simulation" : "Failed"}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-450 mt-4 leading-relaxed font-sans">
                  <span>Target API Integration: <strong className="text-emerald-700">Africa's Talking SMS API</strong></span>
                  <span>Delivery Tracking: <strong className="text-slate-705">Database Persistent</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 11. ROOM REQUESTS PANEL */}
        {activeTab === "requests" && (
          <div className="space-y-6 text-left">
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/15 rounded-full border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    Vacant Room Applications
                  </div>
                  <h2 className="font-extrabold font-display text-2xl sm:text-3xl text-white tracking-tight">
                    Visitor Housing Requests
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed font-sans">
                    These are real-time, structured room application notifications requested by prospective clients directly from your homepage portal before securing accounts.
                  </p>
                </div>

                <div className="p-4 bg-slate-800/80 backdrop-blur-xs rounded-2xl border border-slate-700/50 text-center min-w-[200px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Pending Requests</span>
                  <div className="font-mono text-2xl font-black text-emerald-400 tracking-wider">
                    {roomRequests.length} Applications
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 font-display flex items-center gap-2">
                    <ListCollapse className="w-5 h-5 text-emerald-500" />
                    <span>Lodge &amp; Applicant Catalog</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">
                    Click dismiss once resolved, or use the direct shortcuts below to reach out to potential guests.
                  </p>
                </div>

                <button
                  onClick={fetchRoomRequests}
                  disabled={fetchingRoomRequests}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-250 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-emerald-500 ${fetchingRoomRequests ? "animate-spin" : ""}`} />
                  <span>{fetchingRoomRequests ? "Reloading..." : "Refresh Applications"}</span>
                </button>
              </div>

              {fetchingRoomRequests && roomRequests.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                  <span className="text-xs font-mono uppercase tracking-widest">Loading Applications database...</span>
                </div>
              ) : roomRequests.length === 0 ? (
                <div className="py-16 text-center text-slate-505 space-y-4 font-sans">
                  <div className="w-14 h-14 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center mx-auto text-slate-405">
                    <Building className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-base text-slate-800">No Pending Tenant Requests</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      All applicant inquiries are cleared. When someone requests a vacant room from the login screens, it pops up here!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs bg-transparent border-collapse font-sans">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-155 text-slate-505 font-bold uppercase tracking-wider text-[10px]">
                          <th className="p-4 whitespace-nowrap">Submission Date</th>
                          <th className="p-4 whitespace-nowrap">Applicant Profile</th>
                          <th className="p-4 whitespace-nowrap">Desired Space &amp; Plot</th>
                          <th className="p-4 whitespace-nowrap text-left">Structured SMS Notification Text</th>
                          <th className="p-4 text-right whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roomRequests.map((request) => (
                          <tr key={request.id} className="border-b border-slate-100 hover:bg-slate-50/55 transition-colors align-top">
                            <td className="p-4 text-[11px] text-slate-550 font-mono whitespace-nowrap pt-5">
                              {new Date(request.submitted_at).toLocaleString("en-KE", { hour12: false })}
                            </td>
                            <td className="p-4 pt-5 whitespace-nowrap">
                              <div className="font-bold text-slate-850 text-xs">{request.name}</div>
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">{request.phone_number}</div>
                            </td>
                            <td className="p-4 pt-5 whitespace-nowrap">
                              <div className="font-bold text-slate-800 text-xs">{request.property_name}</div>
                              <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-indigo-50 border border-indigo-150 rounded-md text-[10px] font-bold text-indigo-700">
                                🚪 Room {request.room_number}
                              </div>
                            </td>
                            <td className="p-4 min-w-[280px]">
                              <div className="bg-slate-50 border border-slate-150/80 p-3 rounded-xl italic text-slate-705 text-[11px] leading-relaxed shadow-xs">
                                "hello, I am <strong className="text-slate-950 not-italic">{request.name}</strong>, I request for the vacant room <strong className="text-slate-950 not-italic">{request.room_number}</strong>,, if still available reach me at <strong className="text-slate-950 not-italic">{request.phone_number}</strong>"
                              </div>
                            </td>
                            <td className="p-4 text-right pt-5 whitespace-nowrap space-x-2">
                              <a
                                href={`tel:${request.phone_number}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold text-[10px] uppercase rounded-lg transition-all"
                              >
                                <Smartphone className="w-3.5 h-3.5 text-emerald-550" />
                                <span>Call Applicant</span>
                              </a>
                              
                              {!isCaretaker && (
                                <button
                                  onClick={() => handleDeleteRoomRequest(request.id)}
                                  disabled={deletingRequestId === request.id}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-[10px] uppercase rounded-lg transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-550" />
                                  <span>{deletingRequestId === request.id ? "Dismissing..." : "Dismiss"}</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 8. SYSTEM SYNC CLOCK AUDITOR TAB */}
        {activeTab === "clock" && (
          <div className="space-y-6 text-left">
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/15 rounded-full border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                    Live Network Synchronization Online
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white">
                    Primary Server Clock Sync Auditor
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    This control panel keeps a strict diagnostic track of structural updates, periodic database polling ticks, and Lipa Na M-Pesa STK Callback handlers.
                  </p>
                </div>
                
                {/* Massive Premium Clock View */}
                <div className="p-4 bg-slate-800/80 backdrop-blur-xs rounded-2xl border border-slate-700/50 text-center min-w-[200px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Standard GMT+3 UTC</span>
                  <div className="font-mono text-2xl font-black text-emerald-400 tracking-wider">
                    {currentTime.toLocaleTimeString()}
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono block mt-1.5">Epoch: {currentTime.getTime()}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Sync Diagnostic Log Console */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-emerald-500" />
                    <span>Live Audit Heartbeat Logs</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 font-sans">
                    Active trace history of synchronized properties under the landlord canopy. Updated automatically every 5000ms.
                  </p>

                  <div className="bg-slate-950 p-4 rounded-xl font-mono text-[11px] text-slate-350 overflow-y-auto space-y-1.5 max-h-[320px] border border-slate-800 shadow-inner">
                    {syncLogs.length === 0 ? (
                      <p className="text-slate-500 italic">No heartbeat traces logged yet.</p>
                    ) : (
                      syncLogs.map((log, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="text-emerald-500 select-none">&gt;</span>
                          <span className={log.includes("Purged") || log.includes("Deleted") ? "text-rose-400" : ""}>{log}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-450 mt-4 leading-relaxed">
                  <span>Heartbeat Interval: <strong>5000ms REST polling</strong></span>
                  <span>Database State: <strong className="text-emerald-600">Sync Correct</strong></span>
                </div>
              </div>

              {/* Master Platform Terms & Conditions Agreement */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card">
                <h3 className="font-extrabold text-sm text-slate-900 font-display mb-3">
                  📜 System Terms of Service
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Please review the active landlord operations terms bound to this M-Pesa automated billing application:
                </p>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] leading-relaxed text-slate-605 space-y-3 h-56 overflow-y-auto">
                  <p>
                    <strong>1. Direct Deletions Scope:</strong> Every deletion action performed on plot buildings, room spaces, or active tenant leases will execute standard cascade rules to remove nested logs.
                  </p>
                  <p>
                    <strong>2. Safaricom M-Pesa Sandboxing:</strong> Safaricom STK Push trigger handshakes on Lipa Na M-Pesa channels execute instantly. Simulators will report simulated payments onto backend callback listeners.
                  </p>
                  <p>
                    <strong>3. Data Authorization:</strong> Collins (collinskosgei32@gmail.com) and Kireu Executive (kireuagencyltd1@gmail.com) are designated as the primary authorized platform super-administrators with root privileges to terminate leases, clear tenants, and register/delete Plots.
                  </p>
                  <p>
                    <strong>4. Caretaker Limitations:</strong> Caretakers or caretewives have read-only access strictly fenced to their assigned property. Deletion actions are strictly disabled for role profiles other than Super-Admin.
                  </p>
                </div>

                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-150 rounded-xl text-emerald-800 text-[10px] font-semibold leading-relaxed flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                  <span>Your active session is fully licensed and compliant with standard Safaricom Developer Terms of Service in Kenya.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 9. DEVELOPER GOOGLE FIRESTORE KEYS TAB */}
        {activeTab === "developer_google" && session.email?.toLowerCase().trim() === "collinskosgei32@gmail.com" && (
          <div className="space-y-6 text-left animate-in fade-in duration-200">
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/15 rounded-full border border-amber-500/20 text-amber-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping"></span>
                    Root Google Permissions Authorized
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white flex items-center gap-2">
                    <Key className="w-6 h-6 text-emerald-400 shrink-0" />
                    <span>Google Firestore Keys</span>
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Update your application's Google Cloud Firestore database credentials dynamically. These configuration updates persist on the container filesystem and dynamically reconnect Firestore without system restarts.
                  </p>
                </div>
                
                <div className="p-4 bg-slate-800/80 backdrop-blur-xs rounded-2xl border border-slate-700/50 text-center min-w-[200px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Developer Email</span>
                  <div className="font-mono text-xs font-bold text-emerald-400 truncate max-w-[180px]" title={session.email}>
                    {session.email}
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono block mt-1.5">Authorized Node Admin</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card">
              <div className="mb-6">
                <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-500" />
                  <span>Dynamic Google Keys Register</span>
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Update the underlying Firebase config. Overwritten keys will be written to `/firebase-applet-config.json` and loaded live.
                </p>
              </div>

              {devStatus && (
                <div className={`p-4 rounded-xl mb-6 text-xs flex items-start gap-2.5 ${
                  devStatus.type === "success" 
                    ? "bg-emerald-50 border border-emerald-150 text-emerald-800" 
                    : "bg-rose-50 border border-rose-150 text-rose-800"
                }`}>
                  <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${devStatus.type === "success" ? "text-emerald-500" : "text-rose-500"}`} />
                  <div>
                    <span className="font-bold uppercase block mb-0.5">
                      {devStatus.type === "success" ? "Success Notification" : "Error Occurred"}
                    </span>
                    {devStatus.message}
                  </div>
                </div>
              )}

              <form onSubmit={handleUpdateDevConfig} className="space-y-5 font-sans">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Google Project ID</label>
                    <input
                      type="text"
                      required
                      value={devConfig.projectId}
                      onChange={(e) => setDevConfig({ ...devConfig, projectId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. producer-collo"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Firestore Database ID</label>
                    <input
                      type="text"
                      required
                      value={devConfig.firestoreDatabaseId}
                      onChange={(e) => setDevConfig({ ...devConfig, firestoreDatabaseId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. (default) or custom-id"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">API Key (apiKey)</label>
                    <input
                      type="text"
                      required
                      value={devConfig.apiKey}
                      onChange={(e) => setDevConfig({ ...devConfig, apiKey: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="AIzaSy..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">App ID (appId)</label>
                    <input
                      type="text"
                      required
                      value={devConfig.appId}
                      onChange={(e) => setDevConfig({ ...devConfig, appId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="1:659876571992:web:..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Auth Domain</label>
                    <input
                      type="text"
                      required
                      value={devConfig.authDomain}
                      onChange={(e) => setDevConfig({ ...devConfig, authDomain: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="project.firebaseapp.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Storage Bucket</label>
                    <input
                      type="text"
                      required
                      value={devConfig.storageBucket}
                      onChange={(e) => setDevConfig({ ...devConfig, storageBucket: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="project.firebasestorage.app"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Messaging Sender ID</label>
                    <input
                      type="text"
                      required
                      value={devConfig.messagingSenderId}
                      onChange={(e) => setDevConfig({ ...devConfig, messagingSenderId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. 659876571992"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Measurement ID (Optional)</label>
                    <input
                      type="text"
                      value={devConfig.measurementId}
                      onChange={(e) => setDevConfig({ ...devConfig, measurementId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="G-XXXXXX"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 justify-end">
                  <button
                    type="submit"
                    disabled={devLoading}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-slate-950 font-bold text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>{devLoading ? "Synchronizing keys..." : "Update & Sync Firestore Keys 🔄"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 10. DEVELOPER MPESA KEYS TAB */}
        {activeTab === "developer_mpesa" && session.email?.toLowerCase().trim() === "collinskosgei32@gmail.com" && (
          <div className="space-y-6 text-left animate-in fade-in duration-200">
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/15 rounded-full border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                    M-Pesa API Integration Authorized
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white flex items-center gap-2">
                    <Landmark className="w-6 h-6 text-emerald-400 shrink-0" />
                    <span>Lipa Na M-Pesa Integration</span>
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Configure your Safaricom M-Pesa Daraja portal API keys. This enables dynamic collection of tenant rent payments into your shortcode with instant client callback confirmations.
                  </p>
                </div>
                
                <div className="p-4 bg-slate-800/80 backdrop-blur-xs rounded-2xl border border-slate-700/50 text-center min-w-[200px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1">M-Pesa Gateway</span>
                  <div className="font-mono text-xs font-bold text-emerald-400 truncate max-w-[180px]">
                    {devConfig.mpesaShortcode || "174379"}
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono block mt-1.5">LNM STK Push Agent</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card">
              <div className="mb-6">
                <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-500" />
                  <span>M-Pesa Keys Register</span>
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Update Safaricom Daraja credentials. Overwritten parameters will be saved dynamically to `/firebase-applet-config.json` and loaded live.
                </p>
              </div>

              {devStatus && (
                <div className={`p-4 rounded-xl mb-6 text-xs flex items-start gap-2.5 ${
                  devStatus.type === "success" 
                    ? "bg-emerald-50 border border-emerald-150 text-emerald-800" 
                    : "bg-rose-50 border border-rose-150 text-rose-800"
                }`}>
                  <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${devStatus.type === "success" ? "text-emerald-500" : "text-rose-500"}`} />
                  <div>
                    <span className="font-bold uppercase block mb-0.5">
                      {devStatus.type === "success" ? "Success Notification" : "Error Occurred"}
                    </span>
                    {devStatus.message}
                  </div>
                </div>
              )}

              <form onSubmit={handleUpdateDevConfig} className="space-y-5 font-sans">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">M-Pesa Customer Key</label>
                    <input
                      type="text"
                      required
                      value={devConfig.mpesaConsumerKey}
                      onChange={(e) => setDevConfig({ ...devConfig, mpesaConsumerKey: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. bU8YpB7W..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">M-Pesa Customer Secret</label>
                    <input
                      type="text"
                      required
                      value={devConfig.mpesaConsumerSecret}
                      onChange={(e) => setDevConfig({ ...devConfig, mpesaConsumerSecret: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. oYt3eE..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Business Shortcode</label>
                    <input
                      type="text"
                      required
                      value={devConfig.mpesaShortcode}
                      onChange={(e) => setDevConfig({ ...devConfig, mpesaShortcode: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. 174379 (Sandbox) or Paybill/Till No"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Passkey (Lipa na M-Pesa Online Passkey)</label>
                    <input
                      type="text"
                      required
                      value={devConfig.mpesaPasskey}
                      onChange={(e) => setDevConfig({ ...devConfig, mpesaPasskey: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="bfb279f9aa9bdbcf158e97dd71a467cd..."
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 justify-end">
                  <button
                    type="submit"
                    disabled={devLoading}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-slate-950 font-bold text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>{devLoading ? "Synchronizing keys..." : "Update & Sync M-Pesa Keys 🔄"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 11. DEVELOPER AT KEYS TAB */}
        {activeTab === "developer_at" && session.email?.toLowerCase().trim() === "collinskosgei32@gmail.com" && (
          <div className="space-y-6 text-left animate-in fade-in duration-200">
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/15 rounded-full border border-sky-500/20 text-sky-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-sky-450 rounded-full animate-ping"></span>
                    SMS Integration Authorized
                  </div>
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white flex items-center gap-2">
                    <Smartphone className="w-6 h-6 text-emerald-400 shrink-0" />
                    <span>Africa's Talking SMS API</span>
                  </h2>
                  <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                    Configure your Africa's Talking SMS gateway parameters. This enables the platform to automatically push real-time outstanding rent balance notifications directly to tenant phone numbers recursively.
                  </p>
                </div>
                
                <div className="p-4 bg-slate-800/80 backdrop-blur-xs rounded-2xl border border-slate-700/50 text-center min-w-[200px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1">SMS Username</span>
                  <div className="font-mono text-xs font-bold text-emerald-400 truncate max-w-[180px]">
                    {devConfig.atUsername || "sandbox"}
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono block mt-1.5">Africa's Talking Portal</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs high-contrast-card">
              <div className="mb-6">
                <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-500" />
                  <span>Africa's Talking Keys Register</span>
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Update Africa's Talking API keys and user credentials. Overwritten fields will be written dynamically onto `/firebase-applet-config.json` and loaded live.
                </p>
              </div>

              {devStatus && (
                <div className={`p-4 rounded-xl mb-6 text-xs flex items-start gap-2.5 ${
                  devStatus.type === "success" 
                    ? "bg-emerald-50 border border-emerald-150 text-emerald-800" 
                    : "bg-rose-50 border border-rose-150 text-rose-800"
                }`}>
                  <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${devStatus.type === "success" ? "text-emerald-500" : "text-rose-500"}`} />
                  <div>
                    <span className="font-bold uppercase block mb-0.5">
                      {devStatus.type === "success" ? "Success Notification" : "Error Occurred"}
                    </span>
                    {devStatus.message}
                  </div>
                </div>
              )}

              <form onSubmit={handleUpdateDevConfig} className="space-y-5 font-sans">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Africa's Talking Username</label>
                    <input
                      type="text"
                      required
                      value={devConfig.atUsername}
                      onChange={(e) => setDevConfig({ ...devConfig, atUsername: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. sandbox or production_username"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Africa's Talking API Key</label>
                    <input
                      type="text"
                      required
                      value={devConfig.atApiKey}
                      onChange={(e) => setDevConfig({ ...devConfig, atApiKey: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-400 text-slate-800 text-xs rounded-lg py-2 px-3 focus:outline-none"
                      placeholder="e.g. d68a3536868df5678484a86bdde56782d4..."
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 justify-end">
                  <button
                    type="submit"
                    disabled={devLoading}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-slate-950 font-bold text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>{devLoading ? "Synchronizing keys..." : "Update & Sync SMS Keys 🔄"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>

      {/* DELETION AUTHORIZATION OVERLAY MODAL */}
      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs transition-opacity duration-300">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="p-2 sm:p-2.5 bg-rose-50 text-rose-600 rounded-xl inline-flex">
                <AlertCircle className="w-6 h-6 stroke-[2.25]" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black font-display text-slate-900">
                  Durable DB Deletion Authorization
                </h3>
                <p className="text-[10px] font-mono text-rose-500 mt-1 uppercase tracking-tight font-black">
                  Cascading Purge Security Gate
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl text-left mb-4 space-y-1.5 leading-relaxed">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Purge Scope Metadata</span>
              <p className="text-xs text-slate-800">
                You are requested to execute a permanent <strong className="text-rose-650 font-extrabold uppercase">{deleteTarget.type}</strong> wipeout from the primary storage ledger.
              </p>
              <div className="p-2.5 bg-slate-100/80 rounded border border-slate-200 font-mono text-[11px] text-slate-800 break-all space-y-0.5">
                <div>🔑 Identifier: <span className="font-bold text-slate-950">{deleteTarget.id}</span></div>
                <div>👤 Label: <span className="font-bold text-slate-950">{deleteTarget.displayLabel}</span></div>
                {deleteTarget.extraId && (
                  <div>💼 Binder Scope: <span className="font-bold text-slate-950">{deleteTarget.extraId}</span></div>
                )}
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  id="accept-terms-check"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 border-slate-350 focus:ring-rose-500 cursor-pointer"
                />
                <label htmlFor="accept-terms-check" className="text-slate-650 font-medium leading-relaxed select-none cursor-pointer text-left">
                  I acknowledge that I amCollins, Super-Admin for this platform, and I accept the terms and conditions of deleting this live testing data permanently. I consent that this cascade purge is final and cannot be rolled back.
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteTarget(null);
                  setTermsAccepted(false);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!termsAccepted || isDeleting}
                onClick={executeDeletion}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-200 text-white disabled:text-rose-450 font-black text-xs uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isDeleting ? "Wiping Records..." : "Confirm Deletion ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  // Caretaker map filter helper
  function sidebarCaretakerMap() {
    return maintenance;
  }
}
