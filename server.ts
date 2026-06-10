import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { Property, Room, Tenant, Payment, MaintenanceTicket, Caretaker, SMSLog, RoomRequest } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

// Detect Vercel execution environment
const isVercel = !!process.env.VERCEL;

// Path to durable container storage for JSON-based relational model
const DB_FILE = isVercel
  ? path.join("/tmp", "server-db.json")
  : path.join(process.cwd(), "server-db.json");

// Dynamic Firestore setup
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firestore: any = null;

function getAppConfig() {
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.error("Error reading firebase-applet-config.json:", e);
    }
  }
  return {};
}

// Check for Google application credentials in environment options to prevent blocking hangs
const hasGcpCredentials = !!(
  process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  process.env.FIREBASE_SERVICE_ACCOUNT || 
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 
  (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)
);

function buildFirestoreOptions(config: any): any {
  const options: any = {
    projectId: config.projectId,
    databaseId: config.firestoreDatabaseId,
    ignoreUndefinedProperties: true
  };

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      options.credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", err);
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    options.credentials = {
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL
    };
  }
  
  return options;
}

async function getFirestoreClient(): Promise<any> {
  if (firestore) return firestore;
  
  const initialConfig = getAppConfig();
  if (initialConfig.projectId && initialConfig.firestoreDatabaseId) {
    if (isVercel && !hasGcpCredentials) {
      console.warn("Firestore initialization bypassed on Vercel: Missing GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT environment variable. Falling back to local temporary storage to prevent cold-boot hangs.");
      return null;
    }
    try {
      const { Firestore } = await import("@google-cloud/firestore");
      const options = buildFirestoreOptions(initialConfig);
      firestore = new Firestore(options);
      console.log(`Firestore connected dynamically for server-side persistence: Database: ${initialConfig.firestoreDatabaseId}`);
    } catch (err) {
      console.error("Failed to initialize Google Firestore server-side:", err);
    }
  }
  return firestore;
}

// Structure of our Parent-Child relational model
interface DBModel {
  properties: Property[];
  rooms: Room[];
  tenants: Tenant[];
  payments: Payment[];
  maintenance: MaintenanceTicket[];
  caretakers?: Caretaker[];
  sms_logs?: SMSLog[];
  room_requests?: RoomRequest[];
}

// Initial seed data representing real plots/houses across Kenya
const INITIAL_DB: DBModel = {
  properties: [
    {
      property_id: "prop_1",
      property_name: "Milimani Court",
      geographic_location: "Milimani, Nairobi",
      total_units: 4
    },
    {
      property_id: "prop_2",
      property_name: "Eldoret Heights",
      geographic_location: "Elgon View, Eldoret",
      total_units: 4
    },
    {
      property_id: "prop_3",
      property_name: "Kilimani Ridge",
      geographic_location: "Kilimani, Nakuru",
      total_units: 2
    }
  ],
  rooms: [
    // Milimani Court Rooms
    { room_number: "101", property_id: "prop_1", status: "Vacant", monthly_rent: 18000, utility_rate: 1500 },
    { room_number: "102", property_id: "prop_1", status: "Occupied", monthly_rent: 18000, utility_rate: 1500 },
    { room_number: "103", property_id: "prop_1", status: "Occupied", monthly_rent: 22000, utility_rate: 2000 },
    { room_number: "104", property_id: "prop_1", status: "Vacant", monthly_rent: 15000, utility_rate: 1200 },
    // Eldoret Heights Rooms
    { room_number: "A1", property_id: "prop_2", status: "Occupied", monthly_rent: 12000, utility_rate: 1000 },
    { room_number: "A2", property_id: "prop_2", status: "Vacant", monthly_rent: 12000, utility_rate: 1000 },
    { room_number: "B1", property_id: "prop_2", status: "Occupied", monthly_rent: 15000, utility_rate: 1200 },
    { room_number: "B2", property_id: "prop_2", status: "Vacant", monthly_rent: 15000, utility_rate: 1200 },
    // Kilimani Ridge Rooms
    { room_number: "R1", property_id: "prop_3", status: "Occupied", monthly_rent: 14000, utility_rate: 1000 },
    { room_number: "R2", property_id: "prop_3", status: "Vacant", monthly_rent: 14000, utility_rate: 1000 }
  ],
  tenants: [
    {
      tenant_id: "tenant_1",
      full_name: "Collins Kosgei",
      phone_number: "254712345678",
      property_id: "prop_1",
      assigned_room_number: "102",
      registration_date: "2026-05-10" // Anniversary on 10th
    },
    {
      tenant_id: "tenant_2",
      full_name: "Jane Whitemore",
      phone_number: "254789012345",
      property_id: "prop_1",
      assigned_room_number: "103",
      registration_date: "2026-05-20" // Anniversary on 20th
    },
    {
      tenant_id: "tenant_3",
      full_name: "Kipchirchir Bett",
      phone_number: "254722334455",
      property_id: "prop_2",
      assigned_room_number: "A1",
      registration_date: "2026-06-05" // Anniversary on 5th
    },
    {
      tenant_id: "tenant_4",
      full_name: "Sarah Wanjiku",
      phone_number: "254700998877",
      property_id: "prop_3",
      assigned_room_number: "R1",
      registration_date: "2026-05-18" // Anniversary on 18th
    }
  ],
  payments: [
    // Collins cleared rent for his last billing cycles (May 10 - June 10)
    {
      transaction_id: "TX_MAN_101",
      tenant_id: "tenant_1",
      property_id: "prop_1",
      amount: 19500, // Monthly Rent 18000 + Utilities 1500
      status: "Completed",
      timestamp: "2026-05-11T14:30:00.000Z",
      payment_mode: "Manual"
    },
    // Jane made a partial payment on her current cycle
    {
      transaction_id: "TX_MPESA_202",
      tenant_id: "tenant_2",
      property_id: "prop_1",
      amount: 15000, // Monthly Rent 22000 + Utilities 2000 = 24000 due. Left with 9,000 outstanding balance.
      status: "Completed",
      timestamp: "2026-05-22T09:15:00.000Z",
      payment_mode: "M-PESA",
      checkout_request_id: "ws_CO_demo_jane"
    }
  ],
  maintenance: [
    {
      ticket_id: "tkt_1",
      tenant_id: "tenant_1",
      property_id: "prop_1",
      issue_type: "Toilet",
      description: "Water tank leaking onto floor when flushed",
      status: "In Progress",
      created_at: "2026-06-01T10:00:00.000Z"
    },
    {
      ticket_id: "tkt_2",
      tenant_id: "tenant_2",
      property_id: "prop_1",
      issue_type: "Bulb",
      description: "Balcony light bulb burned state",
      status: "Pending",
      created_at: "2026-06-05T19:20:00.000Z"
    }
  ]
};

// Local in-memory cache of the database to guarantee synchronous readDB() performance
let cachedDb: DBModel | null = null;

// Cleanse undefined properties recursively to secure Firestore document writes
function cleanseUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanseUndefined(item));
  }
  if (typeof obj === "object") {
    if (obj instanceof Date) return obj.toISOString();
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = cleanseUndefined(val);
      }
    }
    return cleaned;
  }
  return obj;
}

async function syncFromFirestore(): Promise<DBModel> {
  const client = await getFirestoreClient();
  if (!client) {
    console.warn("Firestore not initialized, falling back to local memory database.");
    return readDB();
  }
  try {
    const docRef = client.collection("app_state").doc("main");
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      console.log("Loading persistent estate database from Google Cloud Firestore...");
      const data = docSnap.data() as DBModel;
      
      // Merge with default structures to safeguard against missing arrays on old schema runs
      if (!data.properties) data.properties = [];
      if (!data.rooms) data.rooms = [];
      if (!data.tenants) data.tenants = [];
      if (!data.payments) data.payments = [];
      if (!data.maintenance) data.maintenance = [];
      if (!data.caretakers) data.caretakers = [];
      if (!data.sms_logs) data.sms_logs = [];
      if (!data.room_requests) data.room_requests = [];
      
      cachedDb = data;
      // Mirror the persistent state onto local container disk for performance backup
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
      } catch (e) {}
      
      return data;
    } else {
      console.log("No existing database document found in Cloud Firestore. Seeding INITIAL_DB...");
      const seeded = cleanseUndefined(INITIAL_DB);
      await docRef.set(seeded);
      cachedDb = JSON.parse(JSON.stringify(INITIAL_DB));
      return cachedDb!;
    }
  } catch (error: any) {
    if (error && error.message && error.message.includes("PERMISSION_DENIED")) {
      console.warn("Durable state restoration bypassed: Server container credentials do not have direct client-node read permissions on custom Firestore keys.");
    } else {
      console.error("Failed to fetch database document from Firestore, using disk cache...", error);
    }
    return readDB();
  }
}

async function syncToFirestore(data: DBModel) {
  const client = await getFirestoreClient();
  if (!client) return;
  try {
    const docRef = client.collection("app_state").doc("main");
    const cleanedData = cleanseUndefined(data);
    await docRef.set(cleanedData);
    console.log("Durable state backup written to Cloud Firestore successfully.");
  } catch (error: any) {
    if (error && error.message && error.message.includes("PERMISSION_DENIED")) {
      console.warn("Durable backup sync bypassed: Server container credentials do not have direct client-node write permissions on custom Firestore keys.");
    } else {
      console.error("Failed to commit database backup to Firestore:", error);
    }
  }
}

// Database helper functions to read/write cached/persistent storage
function readDB(): DBModel {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2));
      cachedDb = JSON.parse(JSON.stringify(INITIAL_DB));
      return INITIAL_DB;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DBModel;
    if (!parsed.caretakers) parsed.caretakers = [];
    if (!parsed.sms_logs) parsed.sms_logs = [];
    if (!parsed.room_requests) parsed.room_requests = [];
    cachedDb = parsed;
    return parsed;
  } catch (error) {
    console.error("Disk DB reading error, falling back to initial memory definition", error);
    cachedDb = { ...INITIAL_DB, caretakers: [], sms_logs: [], room_requests: [] };
    return cachedDb;
  }
}

function writeDB(data: DBModel) {
  cachedDb = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Local disk storage writing error", error);
  }
  // Synchronize asynchronously with Google Cloud Firestore
  syncToFirestore(data).catch((err) => {
    console.error("Asynchronous FireStore background synchronization failed:", err);
  });
}

// BILLING ENGINE: Computes current billing cycle dynamically
// Outstanding Balance = (Monthly Rent + Utilities) - Total Cleared Payments Made within the current billing cycle
function getBillingStatusForTenant(tenant: Tenant, db: DBModel, targetDate = new Date("2026-06-06T18:31:56Z")) {
  const room = db.rooms.find(
    (r) => r.property_id === tenant.property_id && r.room_number === tenant.assigned_room_number
  );
  if (!room) {
    return {
      dueAmount: 0,
      clearedAmount: 0,
      outstandingBalance: 0,
      status: "🟢 Paid",
      cycleLabel: "No Room Assigned",
      periodStart: "",
      periodEnd: ""
    };
  }

  const monthlyRent = room.monthly_rent;
  const utilityRate = room.utility_rate; // This represents the one-time, refundable Security Deposit / Maintenance Fee

  // Compute cycle dates
  const regDate = new Date(tenant.registration_date);
  const regDay = regDate.getDate();

  let cycleStartYear = targetDate.getFullYear();
  let cycleStartMonth = targetDate.getMonth();

  if (targetDate.getDate() < regDay) {
    cycleStartMonth -= 1;
    if (cycleStartMonth < 0) {
      cycleStartMonth = 11;
      cycleStartYear -= 1;
    }
  }

  const getSafeDate = (year: number, month: number, day: number) => {
    const d = new Date(year, month, day);
    if (d.getMonth() !== (month + 12) % 12) {
      return new Date(year, month + 1, 0); // last day of month
    }
    return d;
  };

  const cycleStart = getSafeDate(cycleStartYear, cycleStartMonth, regDay);
  cycleStart.setHours(0, 0, 0, 0);

  const cycleEndMonth = cycleStartMonth + 1;
  const cycleEndYear = cycleStartYear + (cycleEndMonth > 11 ? 1 : 0);
  const cycleEnd = getSafeDate(cycleEndYear, cycleEndMonth % 12, regDay);
  cycleEnd.setHours(0, 0, 0, 0);

  // Check if this is the tenant's first billing cycle of occupancy (deposit is only charged matching first month registration)
  const isFirstCycle = (cycleStart.getFullYear() === regDate.getFullYear() && cycleStart.getMonth() === regDate.getMonth());
  const totalBillable = isFirstCycle ? (monthlyRent + utilityRate) : monthlyRent;

  // Sum payments made STRICTLY in this current billing period (Completed status)
  const paymentsInPeriod = db.payments.filter((p) => {
    if (p.tenant_id !== tenant.tenant_id || p.status !== "Completed") return false;
    const payTime = new Date(p.timestamp);
    return payTime >= cycleStart && payTime < cycleEnd;
  });

  const clearedAmount = paymentsInPeriod.reduce((sum, p) => sum + p.amount, 0);
  const outstandingBalance = Math.max(0, totalBillable - clearedAmount);

  let status: "🟢 Paid" | "🟡 Partially Paid" | "🔴 Unpaid" = "🔴 Unpaid";
  if (outstandingBalance === 0) {
    status = "🟢 Paid";
  } else if (clearedAmount > 0) {
    status = "🟡 Partially Paid";
  }

  const fmtMonth = (d: Date) => d.toLocaleString("default", { month: "short" });
  const cycleLabel = `${fmtMonth(cycleStart)} ${cycleStart.getDate()} - ${fmtMonth(cycleEnd)} ${cycleEnd.getDate()}`;

  return {
    dueAmount: totalBillable,
    clearedAmount,
    outstandingBalance,
    status,
    cycleLabel,
    periodStart: cycleStart.toISOString(),
    periodEnd: cycleEnd.toISOString()
  };
}

// MIDDLEWARES
app.use(express.json({ limit: "15mb" }));

// ---------------------------------------------------------------------------
// REST API ENDPOINTS
// ---------------------------------------------------------------------------

// 1. PROPERTY PORT DEV / CHECK
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", time: new Date().toISOString() });
});

// 2. PROPERTIES ENDPOINTS
app.get("/api/properties", (req, res) => {
  const db = readDB();
  res.json(db.properties);
});

app.post("/api/properties", (req, res) => {
  const db = readDB();
  const { property_name, geographic_location, caretaker_email } = req.body;
  
  if (!property_name || !geographic_location) {
    return res.status(400).json({ error: "Property name and geographic location are required." });
  }

  const newProperty: Property = {
    property_id: "prop_" + Date.now(),
    property_name,
    geographic_location,
    total_units: 0,
    caretaker_email: caretaker_email && caretaker_email.trim() !== "" ? caretaker_email.trim().toLowerCase() : undefined
  };

  db.properties.push(newProperty);
  writeDB(db);
  res.json(newProperty);
});

app.put("/api/properties/:property_id/caretaker", (req, res) => {
  const db = readDB();
  const { property_id } = req.params;
  const { caretaker_email } = req.body;

  const property = db.properties.find((p) => p.property_id === property_id);
  if (!property) {
    return res.status(404).json({ error: "Property not found." });
  }

  if (caretaker_email && caretaker_email.trim() !== "") {
    property.caretaker_email = caretaker_email.trim().toLowerCase();
  } else {
    delete property.caretaker_email;
  }

  writeDB(db);
  res.json({ success: true, property });
});

// CARETAKERS DIRECT ONBOARDING ENDPOINTS
app.get("/api/caretakers", (req, res) => {
  const db = readDB();
  const caretakers = db.caretakers || [];
  res.json(caretakers);
});

app.post("/api/caretakers", (req, res) => {
  const db = readDB();
  db.caretakers = db.caretakers || [];

  const { name, email, property_id, room_number } = req.body;

  if (!name || !email || !property_id) {
    return res.status(400).json({ error: "Name, email, and managed building plot are required." });
  }

  const cleanEmail = email.trim().toLowerCase();

  const property = db.properties.find((p) => p.property_id === property_id);
  if (!property) {
    return res.status(404).json({ error: "Selected building plot does not exist." });
  }

  if (room_number && room_number.trim() !== "") {
    const cleanRoom = room_number.trim().toLowerCase();
    const roomExists = db.rooms.find(
      (r) => r.property_id === property_id && r.room_number.toLowerCase() === cleanRoom
    );
    if (!roomExists) {
      return res.status(400).json({
        error: `Room '${room_number.trim()}' does not exist inside '${property.property_name}'. Please create the unit in the units database first.`
      });
    }
  }

  // Generate random pin mixed with words/letters and numbers in capital letters
  function generatePinCode(): string {
    const chars = "ABCDEFGHJKLMNOPQRSTUVWXYZ23456789"; // No confusing 0/O, 1/I/l
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  const generatedPin = generatePinCode();

  const newCaretaker: Caretaker = {
    caretaker_id: "caretaker_" + Date.now(),
    name: name.trim(),
    email: cleanEmail,
    property_id,
    room_number: room_number && room_number.trim() !== "" ? room_number.trim() : undefined,
    pin: generatedPin
  };

  db.caretakers.push(newCaretaker);

  // Set as the primary caretaker_email for the property validation
  property.caretaker_email = cleanEmail;

  writeDB(db);
  res.json({ success: true, caretaker: newCaretaker });
});

app.delete("/api/caretakers/:caretaker_id", (req, res) => {
  const db = readDB();
  db.caretakers = db.caretakers || [];
  const { caretaker_id } = req.params;

  const idx = db.caretakers.findIndex((c) => c.caretaker_id === caretaker_id);
  if (idx === -1) {
    return res.status(404).json({ error: "Caretaker not found." });
  }

  const caretaker = db.caretakers[idx];
  db.caretakers.splice(idx, 1);

  // Clean from property validation if matches exactly
  const property = db.properties.find((p) => p.property_id === caretaker.property_id);
  if (property && property.caretaker_email === caretaker.email) {
    const fallbackCaretaker = db.caretakers.find((c) => c.property_id === caretaker.property_id);
    if (fallbackCaretaker) {
      property.caretaker_email = fallbackCaretaker.email;
    } else {
      delete property.caretaker_email;
    }
  }

  writeDB(db);
  res.json({ success: true, message: "Caretaker deleted successfully." });
});

// 3. ROOMS ENDPOINTS
app.get("/api/properties/:property_id/rooms", (req, res) => {
  const db = readDB();
  const rooms = db.rooms.filter((r) => r.property_id === req.params.property_id);
  res.json(rooms);
});

app.get("/api/rooms/vacant", (req, res) => {
  const db = readDB();
  const vacantRooms = db.rooms.filter(r => r.status === "Vacant");
  res.json(vacantRooms);
});

app.post("/api/rooms", (req, res) => {
  const db = readDB();
  const { room_number, property_id, monthly_rent, utility_rate } = req.body;

  if (!room_number || !property_id || monthly_rent === undefined || utility_rate === undefined) {
    return res.status(400).json({ error: "All room details are required." });
  }

  // Validate property exists
  const property = db.properties.find((p) => p.property_id === property_id);
  if (!property) {
    return res.status(404).json({ error: "Target property not found." });
  }

  // Validate duplicate room code within property
  const duplicate = db.rooms.find((r) => r.property_id === property_id && r.room_number === room_number);
  if (duplicate) {
    return res.status(400).json({ error: "Room number already exists in this property." });
  }

  const newRoom: Room = {
    room_number,
    property_id,
    status: "Vacant",
    monthly_rent: Number(monthly_rent),
    utility_rate: Number(utility_rate)
  };

  db.rooms.push(newRoom);
  
  // Update property's unit count
  property.total_units = db.rooms.filter((r) => r.property_id === property_id).length;

  writeDB(db);
  res.json(newRoom);
});

// 4. TENANTS ENDPOINTS
app.get("/api/tenants", (req, res) => {
  const db = readDB();
  
  // Map billing details dynamically before returning
  const mapped = db.tenants.map((t) => {
    const billing = getBillingStatusForTenant(t, db);
    return {
      ...t,
      billing
    };
  });

  res.json(mapped);
});

function cleanKenyanPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.slice(1);
  } else if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) {
    cleaned = "254" + cleaned;
  }
  return cleaned;
}

app.post("/api/tenants", (req, res) => {
  const db = readDB();
  const { full_name, phone_number, property_id, assigned_room_number, registration_date } = req.body;

  if (!full_name || !phone_number || !property_id || !assigned_room_number || !registration_date) {
    return res.status(400).json({ error: "All tenant fields are required." });
  }

  // Enforce Phone Number Format: Starts with 2547... or 2541... (12 digits)
  const cleanPhone = cleanKenyanPhone(phone_number);
  if (!/^254[71]\d{8}$/.test(cleanPhone)) {
    return res.status(400).json({ error: "Phone number must start with 7, 1, 07, 01, or Kenyan prefix +254" });
  }

  // Verify vacant and double booking protection
  const room = db.rooms.find((r) => r.property_id === property_id && r.room_number === assigned_room_number);
  if (!room) {
    return res.status(404).json({ error: "Assigned room not found in this property." });
  }

  if (room.status !== "Vacant") {
    return res.status(400).json({ error: "This room is currently occupied or unavailable." });
  }

  const newTenant: Tenant = {
    tenant_id: "tenant_" + Date.now(),
    full_name,
    phone_number: cleanPhone,
    property_id,
    assigned_room_number,
    registration_date
  };

  // Occupy target unit strictly in real-time
  room.status = "Occupied";
  db.tenants.push(newTenant);

  writeDB(db);
  res.json(newTenant);
});

app.delete("/api/tenants/:tenant_id", (req, res) => {
  const db = readDB();
  const tenantIdx = db.tenants.findIndex((t) => t.tenant_id === req.params.tenant_id);

  if (tenantIdx === -1) {
    return res.status(404).json({ error: "Tenant not found." });
  }

  const tenant = db.tenants[tenantIdx];

  // Set the tenant's room status back to 'Vacant'
  const room = db.rooms.find((r) => r.property_id === tenant.property_id && r.room_number === tenant.assigned_room_number);
  if (room) {
    room.status = "Vacant";
  }

  db.tenants.splice(tenantIdx, 1);
  writeDB(db);
  res.json({ message: "Tenant successfully checked out. Room is now Vacant." });
});

app.put("/api/properties/:property_id/rooms/:room_number", (req, res) => {
  const db = readDB();
  const { property_id, room_number } = req.params;
  const { monthly_rent, utility_rate, status } = req.body;

  const room = db.rooms.find((r) => r.property_id === property_id && r.room_number === room_number);
  if (!room) {
    return res.status(404).json({ error: "Room not found." });
  }

  if (monthly_rent !== undefined) {
    room.monthly_rent = Number(monthly_rent);
  }
  if (utility_rate !== undefined) {
    room.utility_rate = Number(utility_rate);
  }
  if (status !== undefined) {
    room.status = status;
  }

  writeDB(db);
  res.json(room);
});

app.delete("/api/properties/:property_id/rooms/:room_number", (req, res) => {
  const db = readDB();
  const { property_id, room_number } = req.params;

  const roomIdx = db.rooms.findIndex((r) => r.property_id === property_id && r.room_number === room_number);
  if (roomIdx === -1) {
    return res.status(404).json({ error: "Room not found." });
  }

  db.rooms.splice(roomIdx, 1);

  // Evict any tenant allocated to this room
  db.tenants = db.tenants.filter((t) => !(t.property_id === property_id && t.assigned_room_number === room_number));

  // Update property's total_units count
  const property = db.properties.find((p) => p.property_id === property_id);
  if (property) {
    property.total_units = db.rooms.filter((r) => r.property_id === property_id).length;
  }

  writeDB(db);
  res.json({ message: "Apartment unit removed successfully." });
});

app.delete("/api/properties/:property_id", (req, res) => {
  const db = readDB();
  const { property_id } = req.params;

  const propIdx = db.properties.findIndex((p) => p.property_id === property_id);
  if (propIdx === -1) {
    return res.status(404).json({ error: "Property not found." });
  }

  db.properties.splice(propIdx, 1);

  // Cascade delete rooms, tenants, payments, maintenance tickets under this property
  db.rooms = db.rooms.filter((r) => r.property_id !== property_id);
  db.tenants = db.tenants.filter((t) => t.property_id !== property_id);
  db.payments = db.payments.filter((p) => p.property_id !== property_id);
  db.maintenance = db.maintenance.filter((m) => m.property_id !== property_id);

  writeDB(db);
  res.json({ message: "Property and all its nested records cascaded off successfully." });
});

app.delete("/api/payments/:transaction_id", (req, res) => {
  const db = readDB();
  const { transaction_id } = req.params;

  const payIdx = db.payments.findIndex((p) => p.transaction_id === transaction_id);
  if (payIdx === -1) {
    return res.status(404).json({ error: "Payment record not found." });
  }

  db.payments.splice(payIdx, 1);
  writeDB(db);
  res.json({ message: "Payment receipt removed from ledger." });
});

app.delete("/api/maintenance/:ticket_id", (req, res) => {
  const db = readDB();
  const { ticket_id } = req.params;

  const ticketIdx = db.maintenance.findIndex((t) => t.ticket_id === ticket_id);
  if (ticketIdx === -1) {
    return res.status(404).json({ error: "Maintenance ticket not found." });
  }

  db.maintenance.splice(ticketIdx, 1);
  writeDB(db);
  res.json({ message: "Repair ticket deleted." });
});

// 5. AUTHENTICATION ENDPOINTS
app.post("/api/auth/admin/google-login", (req, res) => {
  try {
    const { email, name, uid } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Google Auth Error: User email is required." });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if the authenticated Google email matches collinskosgei32@gmail.com or kireuagencyltd1@gmail.com
    if (normalizedEmail === "collinskosgei32@gmail.com" || normalizedEmail === "kireuagencyltd1@gmail.com") {
      return res.json({
        success: true,
        session: {
          role: "Super-Admin",
          name: name || (normalizedEmail === "collinskosgei32@gmail.com" ? "Collins Kosgei" : "Kireu Executive"),
          email: email,
          firebase_uid: uid
        }
      });
    }

    // Look up if any active plots/properties have this caretaker email assigned
    const db = readDB();
    const matchedProp = db.properties.find(
      (p) => p.caretaker_email && p.caretaker_email.toLowerCase() === normalizedEmail
    );

    const matchedCaretaker = db.caretakers?.find(
      (c) => c.email && c.email.toLowerCase() === normalizedEmail
    );

    if (matchedCaretaker) {
      const prop = db.properties.find((p) => p.property_id === matchedCaretaker.property_id);
      return res.json({
        success: true,
        session: {
          role: "Caretaker",
          property_id: matchedCaretaker.property_id,
          name: matchedCaretaker.name || name || `${prop?.property_name || "Plot"} Caretaker`,
          email: email,
          firebase_uid: uid
        }
      });
    }

    if (matchedProp) {
      return res.json({
        success: true,
        session: {
          role: "Caretaker",
          property_id: matchedProp.property_id,
          name: name || `${matchedProp.property_name} Caretaker`,
          email: email,
          firebase_uid: uid
        }
      });
    }

    return res.status(403).json({
      error: `Access Denied: '${email}' is not authorized. Only collinskosgei32@gmail.com, kireuagencyltd1@gmail.com, or registered caretakers can log in.`
    });
  } catch (err: any) {
    console.error("Internal server error during Google login validation:", err);
    return res.status(500).json({ error: "Access Denied: Server authentication process encountered a validation issue." });
  }
});

app.post("/api/auth/admin/login", (req, res) => {
  const { role, pin, property_id } = req.body;
  const sanitizedPin = pin ? pin.trim().replace(/^[,.:;\s]+|[,.:;\s]+$/g, "") : "";
  const normalizedPin = sanitizedPin.toUpperCase();

  if (role === "Super-Admin") {
    if (normalizedPin === "KIREU-COLLINS-32") {
      return res.json({
        success: true,
        session: {
          role: "Super-Admin",
          name: "Collins Kosgei",
          email: "collinskosgei32@gmail.com"
        }
      });
    }

    if (normalizedPin === "KIREU-EXEC-11") {
      return res.json({
        success: true,
        session: {
          role: "Super-Admin",
          name: "Kireu Executive",
          email: "kireuagencyltd1@gmail.com"
        }
      });
    }

    if (pin === "1234") {
      return res.json({
        success: true,
        session: { role: "Super-Admin", name: "Super-Admin Executive", email: "kireuagencyltd1@gmail.com" }
      });
    }
  } else if (role === "Caretaker") {
    const db = readDB();

    // First try direct bypass lookup by unique alphanumeric PIN (Passkey)
    if (pin && pin.length >= 4) {
      const matchedCaretakerByPin = db.caretakers?.find(
        (c) => c.pin.toUpperCase() === pin.trim().toUpperCase()
      );
      if (matchedCaretakerByPin) {
        return res.json({
          success: true,
          session: {
            role: "Caretaker",
            property_id: matchedCaretakerByPin.property_id,
            name: matchedCaretakerByPin.name,
            email: matchedCaretakerByPin.email
          }
        });
      }
    }

    if (!property_id) {
      return res.status(400).json({ error: "Please select the property you manage or enter a valid 6-char partner Passkey." });
    }
    
    // Check registered caretakers for matching property and pin
    const matchedCaretaker = db.caretakers?.find(
      (c) => c.property_id === property_id && c.pin.toUpperCase() === pin.trim().toUpperCase()
    );

    if (matchedCaretaker) {
      return res.json({
        success: true,
        session: {
          role: "Caretaker",
          property_id,
          name: matchedCaretaker.name,
          email: matchedCaretaker.email
        }
      });
    }

    // Default legacy PIN condition for Caretakers (year 2026 or "5678")
    if (pin === "5678" || pin === "2026") {
      const prop = db.properties.find((p) => p.property_id === property_id);
      return res.json({
        success: true,
        session: {
          role: "Caretaker",
          property_id,
          name: `${prop?.property_name || "Plot"} Caretaker`
        }
      });
    }
  }

  res.status(401).json({ error: "Invalid credentials PIN." });
});

app.post("/api/auth/tenant/login", (req, res) => {
  const { property_id, phone_number, room_number } = req.body;

  if (!phone_number || !room_number) {
    return res.status(400).json({ error: "Username/Phone and PIN/Room Code are required." });
  }

  const cleanPhone = cleanKenyanPhone(phone_number);
  const userPin = room_number.trim().toLowerCase();
  const db = readDB();

  // Find tenant that matches building scope if supplied, and matches username or clean phone number
  const tenant = db.tenants.find((t) => {
    if (property_id && t.property_id !== property_id) return false;
    
    const dbPhoneCleaned = cleanKenyanPhone(t.phone_number);
    const phoneMatches = (dbPhoneCleaned && cleanPhone && dbPhoneCleaned === cleanPhone);
    const nameAsUsernameMatches = t.full_name.toLowerCase().includes(phone_number.trim().toLowerCase());
    
    if (!phoneMatches && !nameAsUsernameMatches) return false;

    const dbRoomCleaned = t.assigned_room_number.toLowerCase();
    const dbNameCleaned = t.full_name.toLowerCase();
    const dbFirstNameCleaned = dbNameCleaned.split(" ")[0];

    return (
      dbRoomCleaned === userPin ||
      dbNameCleaned === userPin ||
      dbFirstNameCleaned === userPin
    );
  });

  if (!tenant) {
    return res.status(401).json({
      error: "User not available. Please verify your registered username/phone and pin credentials."
    });
  }

  res.json({
    success: true,
    session: {
      tenant_id: tenant.tenant_id,
      property_id: tenant.property_id,
      room_number: tenant.assigned_room_number
    },
    tenant
  });
});

// 6. PAYMENTS LEDGER
app.get("/api/payments", (req, res) => {
  const db = readDB();
  res.json(db.payments);
});

// Manual clearance payment
app.post("/api/payments/manual", (req, res) => {
  const db = readDB();
  const { tenant_id, amount } = req.body;

  if (!tenant_id || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Tenant ID and a positive amount are required." });
  }

  const tenant = db.tenants.find((t) => t.tenant_id === tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found." });
  }

  const newPayment: Payment = {
    transaction_id: "TX_MAN_" + Date.now(),
    tenant_id,
    property_id: tenant.property_id,
    amount: Number(amount),
    status: "Completed",
    timestamp: new Date().toISOString(),
    payment_mode: "Manual"
  };

  db.payments.push(newPayment);
  writeDB(db);
  res.json(newPayment);
});

// 7. LIPA NA M-PESA DARAJA 2.0 STK PUSH INTEGRATION
app.post("/api/payments/stkpush", async (req, res) => {
  const db = readDB();
  const { tenant_id, phone_number, amount } = req.body;

  if (!tenant_id || !phone_number || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Tenant details and a positive payment amount are required." });
  }

  const cleanPhone = phone_number.replace(/\D/g, "");
  if (!/^254[71]\d{8}$/.test(cleanPhone)) {
    return res.status(400).json({ error: "Valid Safaricom customer phone needed (e.g. 254712345678)" });
  }

  const tenant = db.tenants.find((t) => t.tenant_id === tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found." });
  }

  const devConfig = getAppConfig();
  const mpesaKey = devConfig.mpesaConsumerKey || process.env.MPESA_CONSUMER_KEY;
  const mpesaSecret = devConfig.mpesaConsumerSecret || process.env.MPESA_CONSUMER_SECRET;
  const shortcode = devConfig.mpesaShortcode || process.env.MPESA_SHORTCODE || "174379";
  const passkey = devConfig.mpesaPasskey || process.env.MPESA_PASSKEY || "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72dec1a0111e2";

  // Check if Safaricom credentials are empty or default developer keys
  const isSimulationMode =
    !mpesaKey ||
    mpesaKey.includes("provide") ||
    !mpSecretValid(mpesaSecret);

  function mpSecretValid(sec: string | undefined): boolean {
    return !!sec && !sec.includes("provide") && sec.length > 5;
  }

  const checkoutRequestId = "ws_CO_" + Date.now().toString().slice(-14);

  // Generate pending receipt
  const pendingPayment: Payment = {
    transaction_id: "TX_PEND_" + Date.now().toString().slice(-6),
    tenant_id,
    property_id: tenant.property_id,
    amount: Number(amount),
    status: "Pending",
    timestamp: new Date().toISOString(),
    payment_mode: "M-PESA",
    checkout_request_id: checkoutRequestId
  };

  db.payments.push(pendingPayment);
  writeDB(db);

  if (isSimulationMode) {
    console.log(`[M-Pesa] Triggering high-fidelity sandbox simulation for phone ${cleanPhone}`);
    
    // Simulate Asynchronous Safaricom Callback after 3 seconds
    setTimeout(() => {
      simulatedCallback(checkoutRequestId, Number(amount), cleanPhone);
    }, 3000);

    return res.json({
      success: true,
      message: "STK Push pop-up request simulation initiated. Check your lockscreen (simulated).",
      checkoutRequestId,
      isSimulation: true
    });
  }

  // LIVE INTERACTION WITH SAFARICOM DARAJA 2.0 API
  try {
    const authHeader = Buffer.from(`${mpesaKey}:${mpesaSecret}`).toString("base64");
    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        method: "GET",
        headers: { Authorization: `Basic ${authHeader}` }
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(`Token generation failed: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const accessToken = tokenData.access_token;

    // Build Stamp Password: BusinessShortCode + PassKey + Timestamp
    const timestamp = getMpesaTimestamp();
    const rawPassword = `${shortcode}${passkey}${timestamp}`;
    const password = Buffer.from(rawPassword).toString("base64");

    const appUrl = process.env.APP_URL || "https://ais-dev-7zvnbqb6zbhhrijn47uo3w-479042236324.europe-west2.run.app";
    const callbackTarget = `${appUrl}/api/mpesa/callback`;

    const stkBody = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(Number(amount)),
      PartyA: cleanPhone,
      PartyB: shortcode,
      PhoneNumber: cleanPhone,
      CallBackURL: callbackTarget,
      AccountReference: `Room ${tenant.assigned_room_number}`,
      TransactionDesc: `Rent Cleared`
    };

    const pushResponse = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(stkBody)
    });

    const pushResult = await pushResponse.json() as {
      ResponseCode?: string;
      CheckoutRequestID?: string;
      ResponseDescription?: string;
    };

    if (pushResult.ResponseCode === "0") {
      // Overwrite checkout request id for tracking
      const finalDb = readDB();
      const p = finalDb.payments.find((py) => py.checkout_request_id === checkoutRequestId);
      if (p && pushResult.CheckoutRequestID) {
        p.checkout_request_id = pushResult.CheckoutRequestID;
        writeDB(finalDb);
      }

      res.json({
        success: true,
        message: pushResult.ResponseDescription || "STK Push popup sent to subscriber phone.",
        checkoutRequestId: pushResult.CheckoutRequestID,
        isSimulation: false
      });
    } else {
      // Set to failed immediately
      const finalDb = readDB();
      const p = finalDb.payments.find((py) => py.checkout_request_id === checkoutRequestId);
      if (p) {
        p.status = "Failed";
        writeDB(finalDb);
      }
      res.status(400).json({ error: pushResult.ResponseDescription || "Safaricom rejected the STK Push request." });
    }
  } catch (error) {
    console.error("Daraja 2.0 Live Push Error: ", error);
    // Graceful fallback to simulation
    setTimeout(() => {
      simulatedCallback(checkoutRequestId, Number(amount), cleanPhone);
    }, 3000);

    res.json({
      success: true,
      message: "Live API connection timed out. Automatically falling back to high-fidelity Sandbox Simulation.",
      checkoutRequestId,
      isSimulation: true
    });
  }
});

// Safaricom Callback URL (Webhook receiver)
app.post("/api/mpesa/callback", (req, res) => {
  console.log("[M-Pesa Webhook] Callback payload received:", JSON.stringify(req.body));
  
  const body = req.body?.Body;
  if (!body || !body.stkCallback) {
    return res.status(400).json({ error: "Invalid callback schema received" });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc } = body.stkCallback;
  const db = readDB();
  const payment = db.payments.find((p) => p.checkout_request_id === CheckoutRequestID);

  if (!payment) {
    console.error(`[M-Pesa Callback] No recorded payment found for Checkout ID: ${CheckoutRequestID}`);
    return res.status(404).json({ error: "Payment placeholder not found" });
  }

  if (ResultCode === 0) {
    payment.status = "Completed";
    // Extract real receipt code if present
    const metaItems = body.stkCallback.CallbackMetadata?.Item || [];
    const receiptObj = metaItems.find((itm: any) => itm.Name === "MpesaReceiptNumber");
    if (receiptObj?.Value) {
      payment.transaction_id = `MPESA_${receiptObj.Value}`;
    } else {
      payment.transaction_id = `MPESA_${Date.now().toString().slice(-8)}`;
    }
    payment.timestamp = new Date().toISOString();
    console.log(`[M-Pesa Callback] Payment for ${CheckoutRequestID} confirmed successfully.`);
  } else {
    payment.status = "Failed";
    console.warn(`[M-Pesa Callback] Transaction failed with status code ${ResultCode}: ${ResultDesc}`);
  }

  writeDB(db);
  res.json({ ResultCode: 0, ResultDescription: "Callback received and recorded securely." });
});

// Simulated success function for seamless preview verification
function simulatedCallback(checkoutRequestId: string, amount: number, phone: string) {
  const simulatedBody = {
    Body: {
      stkCallback: {
        MerchantRequestID: "SIM_MERCH_" + Date.now().toString().slice(-4),
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: amount },
            { Name: "MpesaReceiptNumber", Value: "RKI" + Date.now().toString().slice(-7).toUpperCase() },
            { Name: "TransactionDate", Value: Number(getMpesaTimestamp()) },
            { Name: "PhoneNumber", Value: Number(phone) }
          ]
        }
      }
    }
  };

  // Perform virtual callbacks local-post inside Node
  fetch(`http://localhost:${PORT}/api/mpesa/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(simulatedBody)
  }).catch((err) => console.error("Simulated callback trigger crashed", err));
}

// 8. MAINTENANCE ENDPOINTS
app.get("/api/maintenance", (req, res) => {
  const db = readDB();
  res.json(db.maintenance);
});

app.post("/api/maintenance", (req, res) => {
  const db = readDB();
  const { tenant_id, issue_type, description, photo_url } = req.body;

  if (!tenant_id || !issue_type || !description) {
    return res.status(400).json({ error: "Tenant ID, issue type, and descriptive text are required." });
  }

  const tenant = db.tenants.find((t) => t.tenant_id === tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: "Tenant profile not found." });
  }

  const newTicket: MaintenanceTicket = {
    ticket_id: "tkt_" + Date.now(),
    tenant_id,
    property_id: tenant.property_id,
    issue_type,
    description,
    status: "Pending",
    created_at: new Date().toISOString(),
    photo_url // Camera base64 string
  };

  db.maintenance.push(newTicket);
  writeDB(db);
  res.json(newTicket);
});

app.patch("/api/maintenance/:ticket_id", (req, res) => {
  const db = readDB();
  const ticket = db.maintenance.find((t) => t.ticket_id === req.params.ticket_id);

  if (!ticket) {
    return res.status(404).json({ error: "Maintenance ticket not found." });
  }

  const { status } = req.body;
  if (!status || !["Pending", "In Progress", "Resolved"].includes(status)) {
    return res.status(400).json({ error: "Valid status value needed." });
  }

  ticket.status = status;
  writeDB(db);
  res.json(ticket);
});


// 9. AFRICA'S TALKING SMS REMINDERS AND MESSAGING LOGS
app.get("/api/sms/logs", (req, res) => {
  const db = readDB();
  res.json(db.sms_logs || []);
});

app.get("/api/tenants/:tenant_id/messages", (req, res) => {
  const db = readDB();
  const tenantId = req.params.tenant_id;
  const logs = db.sms_logs || [];
  const messages = logs.filter(log => log.tenant_id === tenantId);
  res.json(messages);
});

app.post("/api/sms/remind", async (req, res) => {
  const db = readDB();
  const { tenant_ids, custom_message } = req.body;

  // Find target tenants. If tenant_ids are specified, filter by them. 
  // Otherwise, default to all tenants with outstanding rent (outstandingBalance > 0).
  let targets = db.tenants;
  if (Array.isArray(tenant_ids) && tenant_ids.length > 0) {
    targets = db.tenants.filter(t => tenant_ids.includes(t.tenant_id));
  } else {
    // Filter to ones with actual outstanding balance
    targets = db.tenants.filter(t => {
      const billing = getBillingStatusForTenant(t, db);
      return billing.outstandingBalance > 0;
    });
  }

  if (targets.length === 0) {
    return res.json({ success: true, sentCount: 0, results: [], message: "No tenants found possessing outstanding balances." });
  }

  const devConfig = getAppConfig();
  const atApiKey = devConfig.atApiKey || process.env.AT_API_KEY;
  const atUsername = devConfig.atUsername || process.env.AT_USERNAME || "sandbox";
  const isSimulation = !atApiKey || atApiKey.includes("provide") || atApiKey.length < 5;

  const results: any[] = [];
  const logsToSave: any[] = [];

  for (const tenant of targets) {
    const billing = getBillingStatusForTenant(tenant, db);
    const room = db.rooms.find(r => r.property_id === tenant.property_id && r.room_number === tenant.assigned_room_number);
    const property = db.properties.find(p => p.property_id === tenant.property_id);
    
    // Format message
    // Allowed placeholders: {name}, {amount}, {room}, {property}, {cycle}
    let msg = custom_message || "Dear {name}, this is a friendly reminder that you have an outstanding rent balance of KES {amount} for Room {room} at {property}. Please clear your balance as soon as possible via M-PESA. Thank you.";
    
    msg = msg
      .replace(/{name}/g, tenant.full_name)
      .replace(/{amount}/g, Math.round(billing.outstandingBalance).toLocaleString())
      .replace(/{room}/g, tenant.assigned_room_number)
      .replace(/{property}/g, property ? property.property_name : "our premises")
      .replace(/{cycle}/g, billing.cycleLabel);

    // Make sure phone is clean international format starting with + (or 254...)
    let cleanPhone = tenant.phone_number.trim();
    if (!cleanPhone.startsWith("+")) {
      if (cleanPhone.startsWith("0")) {
        cleanPhone = "+254" + cleanPhone.slice(1);
      } else if (cleanPhone.startsWith("254")) {
        cleanPhone = "+" + cleanPhone;
      } else {
        cleanPhone = "+" + cleanPhone;
      }
    }

    const logEntry: SMSLog = {
      id: "sms_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.full_name,
      phone_number: cleanPhone,
      message: msg,
      status: isSimulation ? "Simulated" : "Sent",
      timestamp: new Date().toISOString()
    };

    if (isSimulation) {
      results.push({
        tenant_name: tenant.full_name,
        phone_number: cleanPhone,
        message: msg,
        status: "Simulated"
      });
      logsToSave.push(logEntry);
    } else {
      // Real API Call to Africa's Talking
      try {
        const isSandbox = atUsername.toLowerCase() === "sandbox";
        const url = isSandbox
          ? "https://api.sandbox.africastalking.com/version1/messaging"
          : "https://api.africastalking.com/version1/messaging";

        const formBody = new URLSearchParams();
        formBody.append("username", atUsername);
        formBody.append("to", cleanPhone);
        formBody.append("message", msg);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "apiKey": atApiKey
          },
          body: formBody.toString()
        });

        if (response.ok) {
          const apiRes = await response.json() as any;
          logEntry.status = "Sent";
          results.push({
            tenant_name: tenant.full_name,
            phone_number: cleanPhone,
            message: msg,
            status: "Sent",
            response: apiRes
          });
        } else {
          const errText = await response.text();
          throw new Error(errText || "Africa's Talking API Error");
        }
        logsToSave.push(logEntry);
      } catch (error: any) {
        console.error(`Error sending SMS via AT for ${tenant.full_name}:`, error);
        logEntry.status = "Failed";
        logEntry.error = error.message;
        results.push({
          tenant_name: tenant.full_name,
          phone_number: cleanPhone,
          message: msg,
          status: "Failed",
          error: error.message
        });
        logsToSave.push(logEntry);
      }
    }
  }

  // Update DB with logs
  if (!db.sms_logs) {
    db.sms_logs = [];
  }
  db.sms_logs = [...logsToSave, ...db.sms_logs];
  writeDB(db);

  res.json({
    success: true,
    sentCount: targets.length,
    results,
    isSimulation
  });
});


// 10. ROOM REQUESTS ENDPOINTS
app.get("/api/room-requests", (req, res) => {
  const db = readDB();
  res.json(db.room_requests || []);
});

app.post("/api/room-requests", (req, res) => {
  const db = readDB();
  const { name, phone_number, property_id, room_number } = req.body;

  if (!name || !phone_number || !property_id || !room_number) {
    return res.status(400).json({ error: "Missing required fields (name, phone_number, property_id, room_number)." });
  }

  const property = db.properties.find(p => p.property_id === property_id);
  if (!property) {
    return res.status(404).json({ error: "Selected property layout not found." });
  }

  const room = db.rooms.find(r => r.property_id === property_id && r.room_number === room_number);
  if (!room) {
    return res.status(404).json({ error: "Selected room number not found." });
  }

  if (room.status !== "Vacant") {
    return res.status(400).json({ error: "Selected room is already occupied." });
  }

  const newRequest: RoomRequest = {
    id: "req_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    name: name.trim(),
    phone_number: phone_number.trim(),
    property_id,
    property_name: property.property_name,
    room_number,
    submitted_at: new Date().toISOString()
  };

  if (!db.room_requests) {
    db.room_requests = [];
  }

  db.room_requests.push(newRequest);
  writeDB(db);

  res.json({ success: true, message: "Your request has been successfully filed with the admin.", request: newRequest });
});

app.delete("/api/room-requests/:id", (req, res) => {
  const db = readDB();
  if (!db.room_requests) {
    db.room_requests = [];
  }
  const initialLength = db.room_requests.length;
  db.room_requests = db.room_requests.filter(r => r.id !== req.params.id);
  
  if (db.room_requests.length === initialLength) {
    return res.status(404).json({ error: "Room request not found." });
  }

  writeDB(db);
  res.json({ success: true, message: "Room request removed from database tracking." });
});


// 11. DEVELOPER OPTIONS CONFIG ENDPOINTS
app.get("/api/developer/firebase-config", (req, res) => {
  const { email } = req.query;
  if (!email || typeof email !== "string" || email.toLowerCase().trim() !== "collinskosgei32@gmail.com") {
    return res.status(403).json({ error: "Access Denied: Only collinskosgei32@gmail.com can access configuration." });
  }
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return res.json(config);
    } catch (e) {
      return res.status(500).json({ error: "Failed to read configuration file." });
    }
  }
  return res.status(404).json({ error: "Configuration file not found." });
});

app.post("/api/developer/firebase-config", async (req, res) => {
  const { email, config } = req.body;
  if (!email || typeof email !== "string" || email.toLowerCase().trim() !== "collinskosgei32@gmail.com") {
    return res.status(403).json({ error: "Access Denied: Only collinskosgei32@gmail.com is authorized." });
  }

  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (config && typeof config === "object") {
    try {
      // Merge with or write config
      let existing = {};
      if (fs.existsSync(configPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch (e) {}
      }

      const merged = { ...existing, ...config };
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
      
      // Re-initialize Firestore client if credentials existed
      if (merged.projectId && merged.firestoreDatabaseId) {
        if (isVercel && !hasGcpCredentials) {
          console.warn("Firestore dynamic re-connection bypassed on Vercel due to missing GCP credentials.");
          firestore = null;
        } else {
          try {
            const { Firestore } = await import("@google-cloud/firestore");
            const options = buildFirestoreOptions(merged);
            firestore = new Firestore(options);
            console.log(`Firestore reconnected dynamically: ${merged.firestoreDatabaseId}`);
            
            // Clear memory cache and force fresh synchronization
            cachedDb = null;
            await syncFromFirestore();
          } catch (err: any) {
            console.error("Firestore client re-initialization failed:", err);
            return res.status(500).json({ error: "Configuration written to disk, but connection to dynamic Firestore failed: " + err.message });
          }
        }
      }
      
      return res.json({ success: true, message: "Developer configuration keys updated successfully on server." });
    } catch (writeErr: any) {
      console.error("Failed to write config file:", writeErr);
      return res.status(500).json({ error: "Failed to write configuration file on server." });
    }
  } else {
    return res.status(400).json({ error: "Invalid configuration specifications." });
  }
});


// Utility formats
function getMpesaTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// VITE DEV SERVER OR STATIC SERVER SETUP
// ---------------------------------------------------------------------------
async function startServer() {
  // Synchronize database with Firestore on boot
  await syncFromFirestore();

  // On Vercel, static files and page fallbacks are handled automatically
  // by Vercel edge routing rules. Skip local listeners and dev middleware.
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server successfully started on port ${PORT}`);
    });
  }
}

startServer();

export default app;
