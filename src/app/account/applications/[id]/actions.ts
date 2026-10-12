"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const msgSchema = z.object({
  application_id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function sendCustomerMessage(formData: FormData) {
  const user = await requireUser();
  const parsed = msgSchema.safeParse({
    application_id: formData.get("application_id"),
    body: formData.get("body"),
  });
  if (!parsed.success) return;

  const supabase = createClient();
  // RLS: insert allowed only when the application belongs to this customer.
  await supabase.from("messages").insert({
    application_id: parsed.data.application_id,
    sender_id: user.id,
    sender_role: "customer",
    body: parsed.data.body,
  });
  revalidatePath(`/account/applications/${parsed.data.application_id}`);
}

const docSchema = z.object({
  application_id: z.string().uuid(),
  kind: z.string().min(2).max(40),
});

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadDocument(formData: FormData) {
  const user = await requireUser();
  const parsed = docSchema.safeParse({
    application_id: formData.get("application_id"),
    kind: formData.get("kind"),
  });
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File) || file.size === 0) return;
  if (!ALLOWED_MIME.has(file.type)) return;
  if (file.size > MAX_BYTES) return;

  const supabase = createClient();

  // Ownership check: the customer can only attach to their own application.
  const { data: app } = await supabase
    .from("applications")
    .select("id")
    .eq("id", parsed.data.application_id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!app) return;

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
  const path = `${user.id}/${parsed.data.application_id}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("customer-documents")
    .upload(path, file, { contentType: file.type });
  if (upErr) return;

  await supabase.from("application_documents").insert({
    application_id: app.id,
    customer_id: user.id,
    kind: parsed.data.kind,
    file_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: file.type,
    size_bytes: file.size,
    uploaded_by: user.id,
  });
  revalidatePath(`/account/applications/${app.id}`);
}

export async function deleteDocument(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("document_id") ?? "");
  if (!id) return;
  const supabase = createClient();
  const { data: doc } = await supabase
    .from("application_documents")
    .select("id, file_path, application_id")
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!doc) return;
  await supabase.storage.from("customer-documents").remove([doc.file_path]);
  await supabase.from("application_documents").delete().eq("id", doc.id);
  revalidatePath(`/account/applications/${doc.application_id}`);
}
