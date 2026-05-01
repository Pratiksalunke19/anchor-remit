import { twilioConfig } from "../config";
import Twilio from "twilio";

let client: ReturnType<typeof Twilio> | undefined;

function getClient() {
  if (!twilioConfig.sid || !twilioConfig.token) return undefined;
  if (!client) client = Twilio(twilioConfig.sid, twilioConfig.token);
  return client;
}

export async function sendSms(to: string, body: string): Promise<{ ok: boolean; sid?: string; reason?: string }> {
  const c = getClient();
  if (!c || !twilioConfig.from) {
    console.warn(`[sms] disabled (no Twilio creds). Would send to ${to}: ${body}`);
    return { ok: false, reason: "twilio-not-configured" };
  }
  try {
    const msg = await c.messages.create({ to, from: twilioConfig.from, body });
    return { ok: true, sid: msg.sid };
  } catch (err: any) {
    console.error("[sms] send failed", err?.message || err);
    return { ok: false, reason: err?.message || "send-failed" };
  }
}
