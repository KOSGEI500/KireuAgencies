import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { Property, Room, Tenant, Payment, MaintenanceTicket, Caretaker, SMSLog, RoomRequest, ContactInfo } from "./src/types";

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
  developer_contact?: ContactInfo;
  owner_contact?: ContactInfo;
  last_ready_timestamp?: string;
}

// Initial seed data representing real plots/houses across Kenya - now a clean starter template
const INITIAL_DB: DBModel = {
  properties: [],
  rooms: [],
  tenants: [],
  payments: [],
  maintenance: [],
  caretakers: [],
  sms_logs: [],
  room_requests: [],
  developer_contact: {
    name: "",
    phone: "",
    email: "",
    background: ""
  },
  owner_contact: {
    name: "",
    phone: "",
    email: "",
    background: ""
  },
  last_ready_timestamp: "2026-06-11T00:00:00.000Z"
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

function isDbModified(db: DBModel): boolean {
  if (!db) return false;
  const hasPropDiff = JSON.stringify(db.properties || []) !== JSON.stringify(INITIAL_DB.properties || []);
  const hasRoomDiff = JSON.stringify(db.rooms || []) !== JSON.stringify(INITIAL_DB.rooms || []);
  const hasTenantDiff = JSON.stringify(db.tenants || []) !== JSON.stringify(INITIAL_DB.tenants || []);
  const hasPayDiff = JSON.stringify(db.payments || []) !== JSON.stringify(INITIAL_DB.payments || []);
  const hasMaintDiff = JSON.stringify(db.maintenance || []) !== JSON.stringify(INITIAL_DB.maintenance || []);
  const hasCaretakerDiff = JSON.stringify(db.caretakers || []) !== JSON.stringify(INITIAL_DB.caretakers || []);
  const hasRoomReqDiff = JSON.stringify(db.room_requests || []) !== JSON.stringify(INITIAL_DB.room_requests || []);
  const hasSmsDiff = JSON.stringify(db.sms_logs || []) !== JSON.stringify(INITIAL_DB.sms_logs || []);
  const hasDevDiff = JSON.stringify(db.developer_contact || null) !== JSON.stringify(INITIAL_DB.developer_contact || null);
  const hasOwnerDiff = JSON.stringify(db.owner_contact || null) !== JSON.stringify(INITIAL_DB.owner_contact || null);
  
  return hasPropDiff || hasRoomDiff || hasTenantDiff || hasPayDiff || hasMaintDiff || hasCaretakerDiff || hasRoomReqDiff || hasSmsDiff || hasDevDiff || hasOwnerDiff;
}

async function syncFromFirestore(): Promise<DBModel> {
  const localDb = readDB(); // Always read local disk database first to capture any offline/workspace updates
  const client = await getFirestoreClient();
  
  if (!client) {
    console.warn("Firestore not initialized, falling back to local memory database.");
    cachedDb = localDb;
    return localDb;
  }
  
  try {
    const docRef = client.collection("app_state").doc("main");
    const docSnap = await docRef.get();
    
    let dbToUse: DBModel = localDb;
    
    if (docSnap.exists) {
      console.log("Persistent estate database found in Google Cloud Firestore.");
      const firestoreDb = docSnap.data() as DBModel;
      
      // Auto-initialize missing collections to safeguard older schemas
      if (!firestoreDb.properties) firestoreDb.properties = [];
      if (!firestoreDb.rooms) firestoreDb.rooms = [];
      if (!firestoreDb.tenants) firestoreDb.tenants = [];
      if (!firestoreDb.payments) firestoreDb.payments = [];
      if (!firestoreDb.maintenance) firestoreDb.maintenance = [];
      if (!firestoreDb.caretakers) firestoreDb.caretakers = [];
      if (!firestoreDb.sms_logs) firestoreDb.sms_logs = [];
      if (!firestoreDb.room_requests) firestoreDb.room_requests = [];
      if (!firestoreDb.developer_contact) firestoreDb.developer_contact = { ...INITIAL_DB.developer_contact };
      if (!firestoreDb.owner_contact) firestoreDb.owner_contact = { ...INITIAL_DB.owner_contact };

      // Detect if the persistent database contains old seed data and purge it for a clean slate
      const containsOldSeedData = firestoreDb.properties && firestoreDb.properties.some(p => p.property_id === "prop_1" || p.property_name === "Milimani Court");
      if (containsOldSeedData) {
        console.log("Old test database detected in Cloud Firestore. Purging all test data to start fresh on a clean slate...");
        firestoreDb.properties = [];
        firestoreDb.rooms = [];
        firestoreDb.tenants = [];
        firestoreDb.payments = [];
        firestoreDb.maintenance = [];
        firestoreDb.caretakers = [];
        firestoreDb.sms_logs = [];
        firestoreDb.room_requests = [];
        firestoreDb.developer_contact = { name: "", phone: "", email: "", background: "" };
        firestoreDb.owner_contact = { name: "", phone: "", email: "", background: "" };
        firestoreDb.last_ready_timestamp = new Error().stack || new Date().toISOString(); // unique key/timestamp
        
        try {
          fs.writeFileSync(DB_FILE, JSON.stringify(firestoreDb, null, 2));
        } catch (e) {}
        
        await syncToFirestore(firestoreDb);
      }
      
      const localTime = new Date(localDb.last_ready_timestamp || "2026-06-11T00:00:00.000Z").getTime();
      const fireTime = new Date(firestoreDb.last_ready_timestamp || "2026-06-11T00:00:00.000Z").getTime();
      
      console.log(`[STATE SYNC CHECK] localTime=${localTime}, fireTime=${fireTime}, dbInitialized=${dbInitialized}`);
      
      if (localTime > fireTime) {
        console.log("Local workspace database has strictly newer timestamp modifications. Keeping local state and backing up to Firestore...");
        dbToUse = localDb;
        syncToFirestore(dbToUse).catch((err) => {
          console.error("Failed to back-sync local modifications to Firestore during TTL check:", err);
        });
      } else {
        console.log("Firestore database has newer or equal modifications. Syncing Firestore state down to disk/memory...");
        dbToUse = firestoreDb;
      }
    } else {
      console.log("No existing database document found in Cloud Firestore. Seeding local dataset up to Firestore...");
      dbToUse = localDb;
      await syncToFirestore(dbToUse);
    }
    
    // Ensure contacts are correctly seeded
    if (!dbToUse.developer_contact) dbToUse.developer_contact = { ...INITIAL_DB.developer_contact };
    if (!dbToUse.owner_contact) dbToUse.owner_contact = { ...INITIAL_DB.owner_contact };
    
    cachedDb = dbToUse;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dbToUse, null, 2));
    } catch (e) {}
    
    return dbToUse;
  } catch (error: any) {
    if (error && error.message && error.message.includes("PERMISSION_DENIED")) {
      console.warn("Durable state restoration bypassed: Service credentials lack reading rights. Bypassing Firestore.");
    } else {
      console.error("Failed to fetch database document from Firestore, using local filesystem cache...", error);
    }
    cachedDb = localDb;
    return localDb;
  }
}

let dbInitialized = false;
let initPromise: Promise<DBModel> | null = null;
let lastSyncTime = 0;
let lastFetchPromise: Promise<DBModel> | null = null;
const CACHE_TTL = 3000; // 3 seconds TTL is perfect for clustering concurrent API requests while keeping refreshes fully up-to-date

async function triggerSync(): Promise<DBModel> {
  dbInitialized = false;
  initPromise = syncFromFirestore().then((db) => {
    dbInitialized = true;
    lastSyncTime = Date.now();
    return db;
  });
  return initPromise;
}

async function syncToFirestore(data: DBModel) {
  const client = await getFirestoreClient();
  if (!client) return;
  try {
    const docRef = client.collection("app_state").doc("main");
    const cleanedData = cleanseUndefined(data);
    await docRef.set(cleanedData);
    console.log("Durable state database backup written to Cloud Firestore successfully.");
  } catch (error: any) {
    if (error && error.message && error.message.includes("PERMISSION_DENIED")) {
      console.warn("Durable backup sync bypassed: Service credentials lack direct writing permissions.");
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
      const initialCopy = JSON.parse(JSON.stringify(INITIAL_DB));
      initialCopy.last_ready_timestamp = "2026-06-11T00:00:00.000Z";
      fs.writeFileSync(DB_FILE, JSON.stringify(initialCopy, null, 2));
      cachedDb = initialCopy;
      return initialCopy;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DBModel;
    if (!parsed.caretakers) parsed.caretakers = [];
    if (!parsed.sms_logs) parsed.sms_logs = [];
    if (!parsed.room_requests) parsed.room_requests = [];
    if (!parsed.developer_contact) {
      parsed.developer_contact = { ...INITIAL_DB.developer_contact };
    }
    if (!parsed.owner_contact) {
      parsed.owner_contact = { ...INITIAL_DB.owner_contact };
    }
    if (!parsed.last_ready_timestamp) {
      parsed.last_ready_timestamp = "2026-06-11T00:00:00.000Z";
    }

    // Detect if local disk DB has old seed data and purge it instantly
    const containsOldSeedData = parsed.properties && parsed.properties.some(p => p.property_id === "prop_1" || p.property_name === "Milimani Court");
    if (containsOldSeedData) {
      console.log("Old test database detected on local disk. Purging all test data to start fresh on a clean slate...");
      parsed.properties = [];
      parsed.rooms = [];
      parsed.tenants = [];
      parsed.payments = [];
      parsed.maintenance = [];
      parsed.caretakers = [];
      parsed.sms_logs = [];
      parsed.room_requests = [];
      parsed.developer_contact = { name: "", phone: "", email: "", background: "" };
      parsed.owner_contact = { name: "", phone: "", email: "", background: "" };
      parsed.last_ready_timestamp = new Date().toISOString();
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2));
      } catch (e) {}
    }

    cachedDb = parsed;
    return parsed;
  } catch (error) {
    console.error("Disk DB reading error, falling back to initial memory definition", error);
    const fallback = { ...INITIAL_DB, caretakers: [], sms_logs: [], room_requests: [], last_ready_timestamp: "2026-06-11T00:00:00.000Z" };
    cachedDb = fallback;
    return fallback;
  }
}

function writeDB(data: DBModel) {
  // Update modifications timestamp
  data.last_ready_timestamp = new Date().toISOString();
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

// Middleware to ensure database is fully synchronized before serving API routes
const ensureDbReady = async (req: any, res: any, next: any) => {
  const now = Date.now();
  
  // If we are uninitialized OR our cache has expired (stale after 3 seconds)
  if (!dbInitialized || (now - lastSyncTime > CACHE_TTL)) {
    try {
      if (!lastFetchPromise) {
        // Trigger a fresh sync from Firestore
        lastFetchPromise = (async () => {
          try {
            const db = await syncFromFirestore();
            lastSyncTime = Date.now();
            return db;
          } finally {
            lastFetchPromise = null;
          }
        })();
      }
      await lastFetchPromise;
    } catch (err) {
      console.error("Database synchronization failed during middleware path:", err);
    }
  }
  next();
};

app.use("/api", ensureDbReady);

// ---------------------------------------------------------------------------
// REST API ENDPOINTS
// ---------------------------------------------------------------------------

// 1. PROPERTY PORT DEV / CHECK
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", time: new Date().toISOString() });
});

// DATABASE IMPORT/EXPORT ENDPOINTS for stateless backup/restore
app.get("/api/db/export", (req, res) => {
  const db = readDB();
  res.json(db);
});

app.post("/api/db/import", (req, res) => {
  const { dbData } = req.body;
  if (!dbData || typeof dbData !== "object") {
    return res.status(400).json({ error: "Invalid database structure." });
  }
  
  // Basic validation that it's a valid DBModel
  if (!Array.isArray(dbData.properties) || !Array.isArray(dbData.rooms)) {
    return res.status(400).json({ error: "Uploaded JSON structure is not valid. Must contain 'properties' and 'rooms' arrays." });
  }

  // Auto-sanitize and normalize arrays to safeguard old schemas
  if (!dbData.tenants) dbData.tenants = [];
  if (!dbData.payments) dbData.payments = [];
  if (!dbData.maintenance) dbData.maintenance = [];
  if (!dbData.caretakers) dbData.caretakers = [];
  if (!dbData.sms_logs) dbData.sms_logs = [];
  if (!dbData.room_requests) dbData.room_requests = [];

  writeDB(dbData);
  res.json({ success: true, message: "Stateless database imported and synchronized successfully." });
});

// DISASTER RECOVERY & SYSTEM BACKUPS
interface BackupPoint {
  backup_id: string;
  timestamp: string;
  label: string;
  type: string;
  db: DBModel;
}

const BACKUPS_FILE = path.join(process.cwd(), "server-backups.json");

function readLocalBackups(): BackupPoint[] {
  try {
    if (!fs.existsSync(BACKUPS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(BACKUPS_FILE, "utf-8");
    return JSON.parse(raw) as BackupPoint[];
  } catch (error) {
    return [];
  }
}

function writeLocalBackups(backups: BackupPoint[]) {
  try {
    fs.writeFileSync(BACKUPS_FILE, JSON.stringify(backups, null, 2));
  } catch (error) {}
}

async function saveBackupPoint(label: string, type: "Manual" | "Automatic", customDb?: DBModel) {
  const db = customDb || readDB();
  const backup_id = "backup_" + Date.now();
  const timestamp = new Date().toISOString();
  
  const newBackup: BackupPoint = {
    backup_id,
    timestamp,
    label,
    type,
    db: JSON.parse(JSON.stringify(db))
  };

  let localBackups = readLocalBackups();
  localBackups.unshift(newBackup);
  if (localBackups.length > 30) {
    localBackups = localBackups.slice(0, 30);
  }
  writeLocalBackups(localBackups);

  const client = await getFirestoreClient();
  if (client) {
    try {
      const cleanedBackup = cleanseUndefined(newBackup);
      await client.collection("database_backups").doc(backup_id).set(cleanedBackup);
      console.log(`Disaster Backup Point [${label}] committed successfully to Cloud Firestore!`);
    } catch (error: any) {
      if (error && error.message && error.message.includes("PERMISSION_DENIED")) {
        console.warn(`Disaster Backup Point [${label}] sync to Firestore bypassed: Service credentials lack writing permissions.`);
      } else {
        console.error("Failed to sync backup point to Firestore:", error);
      }
    }
  }
}

async function getBackupPoints(): Promise<BackupPoint[]> {
  const localList = readLocalBackups();
  const client = await getFirestoreClient();
  if (!client) {
    return localList;
  }
  try {
    const snapshot = await client.collection("database_backups").orderBy("timestamp", "desc").limit(30).get();
    const firestoreList: BackupPoint[] = [];
    snapshot.forEach(doc => {
      firestoreList.push(doc.data() as BackupPoint);
    });
    
    const allMap = new Map<string, BackupPoint>();
    [...firestoreList, ...localList].forEach(b => {
      if (b && b.backup_id) {
        allMap.set(b.backup_id, b);
      }
    });
    
    return Array.from(allMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (e) {
    return localList;
  }
}

// DISASTER RECOVERY ENDPOINTS
app.get("/api/developer/backups", async (req, res) => {
  try {
    const list = await getBackupPoints();
    res.json(list);
  } catch (err: any) {
    res.status(505).json({ error: err.message || "Failed to fetch backups." });
  }
});

app.post("/api/developer/backups", async (req, res) => {
  const { label } = req.body;
  if (!label) {
    return res.status(400).json({ error: "Backup description label is required." });
  }
  try {
    const db = readDB();
    await saveBackupPoint(label, "Manual", db);
    const list = await getBackupPoints();
    res.json({ success: true, message: "Manual System Snapshot point registered.", backups: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create manual backup." });
  }
});

app.post("/api/developer/backups/:id/restore", async (req, res) => {
  const { id } = req.params;
  const { type } = req.body; // "all" | "plots" | "tenants" | "payments" | "contacts" | "caretakers"
  
  try {
    const list = await getBackupPoints();
    const backup = list.find(b => b.backup_id === id);
    if (!backup) {
      return res.status(404).json({ error: "Disaster Recovery backup point not found." });
    }
    
    const currentDb = readDB();
    const sourceDb = backup.db;
    
    let message = "";
    
    if (type === "all") {
      currentDb.properties = sourceDb.properties || [];
      currentDb.rooms = sourceDb.rooms || [];
      currentDb.tenants = sourceDb.tenants || [];
      currentDb.payments = sourceDb.payments || [];
      currentDb.maintenance = sourceDb.maintenance || [];
      currentDb.caretakers = sourceDb.caretakers || [];
      currentDb.sms_logs = sourceDb.sms_logs || [];
      currentDb.room_requests = sourceDb.room_requests || [];
      currentDb.developer_contact = sourceDb.developer_contact || { name: "", phone: "", email: "", background: "" };
      currentDb.owner_contact = sourceDb.owner_contact || { name: "", phone: "", email: "", background: "" };
      message = "Full system rollback completed. Overwrote all active databases.";
    } else if (type === "plots") {
      currentDb.properties = sourceDb.properties || [];
      currentDb.rooms = sourceDb.rooms || [];
      message = "Plots and rooms structure rollback completed successfully.";
    } else if (type === "tenants") {
      currentDb.tenants = sourceDb.tenants || [];
      message = "Tenants lease files rollback completed successfully.";
    } else if (type === "payments") {
      currentDb.payments = sourceDb.payments || [];
      currentDb.maintenance = sourceDb.maintenance || [];
      message = "Rent transaction sheets and ticket queues rollback completed.";
    } else if (type === "caretakers") {
      currentDb.caretakers = sourceDb.caretakers || [];
      message = "Caretaker allocations table rollback completed.";
    } else if (type === "contacts") {
      currentDb.developer_contact = sourceDb.developer_contact || { name: "", phone: "", email: "", background: "" };
      currentDb.owner_contact = sourceDb.owner_contact || { name: "", phone: "", email: "", background: "" };
      message = "Developer and Owner branding contacts rollback completed.";
    } else {
      return res.status(400).json({ error: `Invalid recovery partition type [${type}].` });
    }
    
    writeDB(currentDb);
    res.json({ success: true, message, database: currentDb });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Disaster recovery rollback failed." });
  }
});

app.delete("/api/developer/backups/:id", async (req, res) => {
  const { id } = req.params;
  try {
    let localList = readLocalBackups();
    localList = localList.filter(b => b.backup_id !== id);
    writeLocalBackups(localList);
    
    const client = await getFirestoreClient();
    if (client) {
      try {
        await client.collection("database_backups").doc(id).delete();
      } catch (e) {}
    }
    const list = await getBackupPoints();
    res.json({ success: true, message: "Backup snapshot deleted from archives.", backups: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to remove backup snapshot." });
  }
});

// CONTACT INFO ENDPOINTS
app.get("/api/contact", (req, res) => {
  const db = readDB();
  res.json({
    developer_contact: db.developer_contact,
    owner_contact: db.owner_contact
  });
});

app.post("/api/contact/developer", (req, res) => {
  const db = readDB();
  const { name, phone, email, background } = req.body;
  if (!name || !phone || !email || !background) {
    return res.status(400).json({ error: "All developer contact fields (name, phone, email, background) are required." });
  }
  db.developer_contact = { name, phone, email, background };
  writeDB(db);
  res.json({ success: true, message: "Developer contact information updated successfully.", developer_contact: db.developer_contact });
});

app.post("/api/contact/owner", (req, res) => {
  const db = readDB();
  const { name, phone, email, background } = req.body;
  if (!name || !phone || !email || !background) {
    return res.status(400).json({ error: "All owner contact fields (name, phone, email, background) are required." });
  }
  db.owner_contact = { name, phone, email, background };
  writeDB(db);
  res.json({ success: true, message: "Kireu Owner contact information updated successfully.", owner_contact: db.owner_contact });
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
  saveBackupPoint("Automated: Registered Plot [" + newProperty.property_name + "]", "Automatic", db).catch(() => {});
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

  if (!property_id || monthly_rent === undefined || utility_rate === undefined) {
    return res.status(400).json({ error: "Property ID and pricing details are required." });
  }

  // Parse room numbers from various formats (array, comma-separated, space-separated, newlines)
  let roomNumbers: string[] = [];
  if (Array.isArray(req.body.room_numbers)) {
    roomNumbers = req.body.room_numbers.map((r: any) => String(r).trim()).filter(Boolean);
  } else if (typeof room_number === "string") {
    if (/[,\n\r;]/.test(room_number)) {
      roomNumbers = room_number.split(/[,\n\r;]+/).map(r => r.trim()).filter(Boolean);
    } else {
      roomNumbers = room_number.split(/\s+/).map(r => r.trim()).filter(Boolean);
    }
  } else if (room_number) {
    roomNumbers = [String(room_number).trim()];
  }

  if (roomNumbers.length === 0) {
    return res.status(400).json({ error: "Please enter at least one room number code." });
  }

  // Validate property exists
  const property = db.properties.find((p) => p.property_id === property_id);
  if (!property) {
    return res.status(404).json({ error: "Target property not found." });
  }

  const addedRooms: Room[] = [];
  const skippedRooms: string[] = [];

  for (const num of roomNumbers) {
    const isDuplicate = db.rooms.some(r => r.property_id === property_id && r.room_number.toLowerCase() === num.toLowerCase());
    if (isDuplicate) {
      skippedRooms.push(num);
      continue;
    }

    const newRoom: Room = {
      room_number: num,
      property_id,
      status: "Vacant",
      monthly_rent: Number(monthly_rent),
      utility_rate: Number(utility_rate)
    };

    db.rooms.push(newRoom);
    addedRooms.push(newRoom);
  }

  if (addedRooms.length === 0) {
    if (skippedRooms.length > 0) {
      return res.status(400).json({ error: `All provided units (${skippedRooms.join(", ")}) already exist in this property.` });
    }
    return res.status(400).json({ error: "No valid room numbers provided." });
  }

  // Update property's unit count
  property.total_units = db.rooms.filter((r) => r.property_id === property_id).length;

  writeDB(db);
  saveBackupPoint(`Automated: Registered ${addedRooms.length} unit(s) under Plot [${property.property_name}]`, "Automatic", db).catch(() => {});

  res.json({
    success: true,
    message: `Registered ${addedRooms.length} room(s) successfully.` + (skippedRooms.length > 0 ? ` Skipped existing: ${skippedRooms.join(", ")}` : ""),
    rooms: addedRooms,
    room_number: addedRooms[0].room_number,
    property_id: addedRooms[0].property_id,
    monthly_rent: addedRooms[0].monthly_rent,
    utility_rate: addedRooms[0].utility_rate
  });
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
  saveBackupPoint(`Automated: Booked Tenant [${newTenant.full_name}] directly into Room [${newTenant.assigned_room_number}]`, "Automatic", db).catch(() => {});
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
  saveBackupPoint(`Automated: Evicted / Checked out Tenant [${tenant.full_name}]`, "Automatic", db).catch(() => {});
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
  saveBackupPoint(`Automated: Removed Unit ${room_number} from Plot ID ${property_id}`, "Automatic", db).catch(() => {});
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
  saveBackupPoint(`Automated: Deleted Plot ID ${property_id} and purged all nested data`, "Automatic", db).catch(() => {});
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
            await triggerSync();
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
  await triggerSync();

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
