"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const brandSchema = z.object({
  business_name: z.string().trim().min(2).max(120),
  tagline_en: z.string().trim().max(160).optional().or(z.literal("")),
  tagline_bn: z.string().trim().max(160).optional().or(z.literal("")),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  default_locale: z.enum(["en", "bn"]),
  logo_svg: z.string().max(20000).optional().or(z.literal("")),
  favicon_svg: z.string().max(20000).optional().or(z.literal("")),
});

export async function updateBrand(formData: FormData) {
  const { userId } = await requireStaff();
  const parsed = brandSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  await supabase
    .from("brand_settings")
    .update({
      business_name: parsed.data.business_name,
      tagline_en: parsed.data.tagline_en || null,
      tagline_bn: parsed.data.tagline_bn || null,
      primary_color: parsed.data.primary_color,
      secondary_color: parsed.data.secondary_color,
      default_locale: parsed.data.default_locale,
      logo_svg: parsed.data.logo_svg || null,
      favicon_svg: parsed.data.favicon_svg || null,
      updated_by: userId,
    })
    .eq("id", 1);
  revalidatePath("/", "layout");
}

const contactSchema = z.object({
  whatsapp_number: z.string().trim().max(20).optional().or(z.literal("")),
  whatsapp_default_message: z.string().trim().max(300).optional().or(z.literal("")),
  whatsapp_button_label: z.string().trim().max(60).optional().or(z.literal("")),
  imo_contact: z.string().trim().max(300).optional().or(z.literal("")),
  imo_mode: z.enum(["profile_url", "fallback_notice"]),
  imo_button_label: z.string().trim().max(60).optional().or(z.literal("")),
  phone_display: z.string().trim().max(60).optional().or(z.literal("")),
  email_display: z.string().trim().email().optional().or(z.literal("")),
  facebook_url: z.string().trim().max(300).optional().or(z.literal("")),
  whatsapp_enabled: z.enum(["on"]).optional(),
  imo_enabled: z.enum(["on"]).optional(),
  facebook_enabled: z.enum(["on"]).optional(),
});

export async function updateContact(formData: FormData) {
  const { userId } = await requireStaff();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  await supabase
    .from("contact_settings")
    .update({
      whatsapp_number: parsed.data.whatsapp_number || null,
      whatsapp_default_message: parsed.data.whatsapp_default_message || null,
      whatsapp_button_label: parsed.data.whatsapp_button_label || null,
      imo_contact: parsed.data.imo_contact || null,
      imo_mode: parsed.data.imo_mode,
      imo_button_label: parsed.data.imo_button_label || null,
      phone_display: parsed.data.phone_display || null,
      email_display: parsed.data.email_display || null,
      facebook_url:
        parsed.data.facebook_url && parsed.data.facebook_url.startsWith("https://")
          ? parsed.data.facebook_url
          : null,
      whatsapp_enabled: parsed.data.whatsapp_enabled === "on",
      imo_enabled: parsed.data.imo_enabled === "on",
      facebook_enabled: parsed.data.facebook_enabled === "on",
      updated_by: userId,
    })
    .eq("id", 1);
  revalidatePath("/", "layout");
}
