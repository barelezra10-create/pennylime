// End-to-end GoACH staging check. Usage:
//   GOACH_API_KEY=... GOACH_ORIGINATOR_UUID=... GOACH_BASE_URL=https://staging.goach.com/api/v1 node scripts/goach-smoke.mjs
const KEY = process.env.GOACH_API_KEY;
const ORIG = process.env.GOACH_ORIGINATOR_UUID;
const BASE = (process.env.GOACH_BASE_URL || "https://staging.goach.com/api/v1").replace(/\/$/, "");
if (!KEY || !ORIG) { console.error("set GOACH_API_KEY and GOACH_ORIGINATOR_UUID"); process.exit(1); }
const H = { Authorization: `Bearer ${KEY}`, Accept: "application/json" };
const form = (o) => new URLSearchParams(o).toString();
async function post(p, o) { const r = await fetch(BASE + p, { method: "POST", headers: { ...H, "Content-Type": "application/x-www-form-urlencoded" }, body: form(o) }); return r.json(); }
async function get(p) { const r = await fetch(BASE + p, { headers: H }); return r.json(); }

const rcv = await post("/receivers", { name: "Smoke Test", email: "smoke@example.com", custom_1: "SMOKE-1" });
console.log("receiver:", rcv.data?.uuid);
const ba = await post("/bank_accounts", { name: "Smoke Checking", receiver_id: rcv.data.uuid, routing_number: "021000021", account_number: "123456789", business: "false", checking: "true" });
console.log("bank:", ba.data?.uuid);
const tx = await post("/ach_transactions", { originator_ach_account_id: ORIG, bank_account_id: ba.data.uuid, amount: "1.00", transaction_type: "Debit", descriptor: "SMOKE PMT" });
console.log("tx:", tx.data?.uuid, tx.data?.current_status, tx.data?.transaction_id);
const back = await get(`/ach_transactions/${tx.data.uuid}`);
console.log("readback status:", back.data?.current_status);
const du = await get("/ach_transactions/daily_update");
console.log("daily_update sample:", JSON.stringify(du.data?.slice(0, 2)), "pointer:", du.details?.new_pointer);
const cx = await post(`/ach_transactions/${tx.data.uuid}/cancel`, {});
console.log("cancel:", cx.data?.current_status);
