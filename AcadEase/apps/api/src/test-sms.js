import "dotenv/config";
import twilio from "twilio";

const sid   = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from  = process.env.TWILIO_FROM;

console.log("SID   :", sid);
console.log("FROM  :", from);
console.log("TOKEN :", token ? token.slice(0, 6) + "..." : "MISSING");

if (!sid || !token || !from) {
  console.error("Missing Twilio env vars");
  process.exit(1);
}

const client = twilio(sid, token);

// 1. Check account status
try {
  const account = await client.api.accounts(sid).fetch();
  console.log("\nAccount status :", account.status);
  console.log("Account type   :", account.type);
} catch (e) {
  console.error("\nAccount fetch failed:", e.message, "| code:", e.code);
  process.exit(1);
}

// 2. List recent messages
try {
  const msgs = await client.messages.list({ limit: 5 });
  console.log("\nRecent messages:", msgs.length);
  msgs.forEach((m) =>
    console.log(`  to=${m.to} status=${m.status} errorCode=${m.errorCode ?? "none"} errorMsg=${m.errorMessage ?? "none"}`)
  );
} catch (e) {
  console.error("List messages failed:", e.message);
}

// 3. Send a test SMS — replace with a real number to test
const TEST_TO = process.argv[2];
if (TEST_TO) {
  console.log(`\nSending test SMS to ${TEST_TO}...`);
  try {
    const msg = await client.messages.create({
      from,
      to: TEST_TO,
      body: "AcadEase test SMS — Twilio is working.",
    });
    console.log("Sent! SID:", msg.sid, "| status:", msg.status);
  } catch (e) {
    console.error("Send failed:", e.message, "| code:", e.code, "| moreInfo:", e.moreInfo);
  }
} else {
  console.log("\nTip: pass a phone number as argument to send a test SMS");
  console.log("  node src/test-sms.js +919876543210");
}
