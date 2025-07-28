import { Elysia } from "elysia";
import * as dotenv from "dotenv";
import crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const SECRET = process.env.CHANNEL_SECRET!;
const TOKEN = process.env.CHANNEL_ACCESS_TOKEN!;

const app = new Elysia().post("/callback", async ({ request }) => {
  console.log("▶️ Received POST /callback");

  const signature = request.headers.get("x-line-signature");
  if (!signature) {
    console.warn("❌ Missing signature");
    return new Response("Missing signature", { status: 400 });
  }

  const bodyText = await request.text();
  const hash = crypto
    .createHmac("sha256", SECRET)
    .update(bodyText)
    .digest("base64");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash))) {
    console.warn("❌ Invalid signature");
    return new Response("Forbidden", { status: 401 });
  }

  console.log("✅ Signature verified");

  const body = JSON.parse(bodyText);
  console.log("📦 Parsed body:", JSON.stringify(body, null, 2));

  for (const ev of body.events || []) {
    if (ev.type === "message" && ev.message?.type === "image") {
      const msgId = ev.message.id;
      const replyToken = ev.replyToken;
      const userId = ev.source?.userId;

      console.log(`📩 Image from user: ${userId}`);
      console.log(`📎 Message ID: ${msgId}`);
      console.log("🌐 Fetching image...");

      const resp = await fetch(
        `https://api-data.line.me/v2/bot/message/${msgId}/content`,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
          },
        }
      );

      if (!resp.ok) {
        console.error("🚫 Failed to fetch image:", resp.status);
        continue;
      }

      const dir = path.join(".", "slips");
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${msgId}.jpg`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      console.log(`✅ Image saved: ${filePath}`);

      // Send reply
      console.log("💬 Sending reply...");
      const reply = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          replyToken,
          messages: [{ type: "text", text: "received" }],
        }),
      });

      const replyText = await reply.text();
      console.log(`📨 Reply status: ${reply.status}`);
      console.log(`🧾 Reply response: ${replyText}`);
    }
  }

  return new Response("OK");
});

app.listen(8000);
console.log("🚀 Elysia running on http://localhost:8000");
