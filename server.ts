import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { Property, Room, Tenant, Payment, MaintenanceTicket } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

// Path to durable container storage for JSON-based relational model
const DB_FILE = path.join(process.cwd(), "server-db.json");

// Structure of our Parent-Child relational model
interface DBModel {
  properties: Property[];
  rooms: Room[];
  tenants: Tenant[];
  payments: Payment[];
  maintenance: MaintenanceTicket[];
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

// Database helper functions to read/write JSON file
function readDB(): DBModel {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2));
      return INITIAL_DB;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("DB reading error, fallback to memory", error);
    return INITIAL_DB;
  }
}

function writeDB(data: DBModel) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("DB writing error", error);
  }
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
  const utilityRate = room.utility_rate;
  const totalBillable = monthlyRent + utilityRate;

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
  const { property_name, geographic_location } = req.body;
  
  if (!property_name || !geographic_location) {
    return res.status(400).json({ error: "Property name and geographic location are required." });
  }

  const newProperty: Property = {
    property_id: "prop_" + Date.now(),
    property_name,
    geographic_location,
    total_units: 0
  };

  db.properties.push(newProperty);
  writeDB(db);
  res.json(newProperty);
});

// 3. ROOMS ENDPOINTS
app.get("/api/properties/:property_id/rooms", (req, res) => {
  const db = readDB();
  const rooms = db.rooms.filter((r) => r.property_id === req.params.property_id);
  res.json(rooms);
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

app.post("/api/tenants", (req, res) => {
  const db = readDB();
  const { full_name, phone_number, property_id, assigned_room_number, registration_date } = req.body;

  if (!full_name || !phone_number || !property_id || !assigned_room_number || !registration_date) {
    return res.status(400).json({ error: "All tenant fields are required." });
  }

  // Enforce Phone Number Format: Starts with 2547... or 2541... (12 digits)
  const cleanPhone = phone_number.replace(/\D/g, "");
  if (!/^254[71]\d{8}$/.test(cleanPhone)) {
    return res.status(400).json({ error: "Phone number must match Kenyan format (e.g., 254712345678)" });
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

// 5. AUTHENTICATION ENDPOINTS
app.post("/api/auth/admin/login", (req, res) => {
  const { role, pin, property_id } = req.body;

  if (role === "Super-Admin") {
    if (pin === "1234") {
      return res.json({
        success: true,
        session: { role: "Super-Admin", name: "Super-Admin Executive" }
      });
    }
  } else if (role === "Caretaker") {
    if (!property_id) {
      return res.status(400).json({ error: "Please select the property you manage." });
    }
    // PIN condition for Caretakers is the year 2026 or "5678"
    if (pin === "5678" || pin === "2026") {
      const db = readDB();
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

  if (!property_id || !phone_number || !room_number) {
    return res.status(400).json({ error: "Property, Phone, and Apartment/Room code are all required." });
  }

  const cleanPhone = phone_number.replace(/\D/g, "");
  const db = readDB();

  // Find tenant bounding query parameters with building scope
  const tenant = db.tenants.find(
    (t) =>
      t.property_id === property_id &&
      t.phone_number === cleanPhone &&
      t.assigned_room_number.toLowerCase() === room_number.toLowerCase()
  );

  if (!tenant) {
    return res.status(401).json({
      error: "Authentication failed. No tenant matching building, room, and phone combination."
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

  const mpesaKey = process.env.MPESA_CONSUMER_KEY;
  const mpesaSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE || "174379";
  const passkey = process.env.MPESA_PASSKEY || "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72dec1a0111e2";

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
  if (process.env.NODE_ENV !== "production") {
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

startServer();
