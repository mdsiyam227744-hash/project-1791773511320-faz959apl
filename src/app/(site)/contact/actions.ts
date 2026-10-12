"use server";

import { createServiceClient, isServiceConfigured } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * Guest consultation requests. Validated with Zod, stored via the service-role
 * client because anonymous visitors have no session (the public RLS policy
 * intentionally blocks anonymous inserts). No email is sent pretending to be
 * a human reply — response happens through the real contact channels.
 */
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().min(10).max(4000),
});

export type ContactState = { ok?: boolean; error?: string };

export async function submitConsultation(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: "invalid" };

  if (!isServiceConfigured()) {
    // Honest degradation: the message cannot be persisted without a database.
    return { error: "unavailable" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("consultation_requests").insert({
    guest_name: parsed.data.name,
    guest_email: parsed.data.email,
    guest_phone: parsed.data.phone || null,
    message: parsed.data.message,
    status: "new",
  });
  if (error) return { error: "unavailable" };
  return { ok: true };
}
