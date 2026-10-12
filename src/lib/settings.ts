import { createClient, isSupabaseConfigured } from "./supabase/server";
import {
  buildWhatsAppLink as buildWhatsAppLinkPure,
  buildImoLink as buildImoLinkPure,
} from "./contact-links";
import type { Locale } from "./i18n";

export interface Brand {
  businessName: string;
  tagline: { en: string; bn: string };
  logoSvg: string | null;
  faviconSvg: string | null;
  primaryColor: string;
  secondaryColor: string;
  defaultLocale: Locale;
}

const FALLBACK_BRAND: Brand = {
  businessName: "VisaBridge Global",
  tagline: { en: "Your Journey. Our Guidance.", bn: "আপনার যাত্রা। আমাদের পথনির্দেশনা।" },
  logoSvg: null,
  faviconSvg: null,
  primaryColor: "#0A1F44",
  secondaryColor: "#C9A227",
  defaultLocale: "en",
};

export interface ContactSettings {
  whatsappNumber: string | null;
  whatsappDefaultMessage: string;
  imoContact: string | null;
  imoMode: "profile_url" | "fallback_notice";
  phoneDisplay: string | null;
  emailDisplay: string | null;
  whatsappButtonLabel: string | null;
  imoButtonLabel: string | null;
}

const FALLBACK_CONTACT: ContactSettings = {
  whatsappNumber: null,
  whatsappDefaultMessage: "Hello, I would like to ask about visa assistance.",
  imoContact: null,
  imoMode: "fallback_notice",
  phoneDisplay: null,
  emailDisplay: null,
  whatsappButtonLabel: null,
  imoButtonLabel: null,
};

export async function getBrand(): Promise<Brand> {
  if (!isSupabaseConfigured()) return FALLBACK_BRAND;
  try {
    const supabase = createClient();
    const { data } = await supabase.from("brand_settings").select("*").eq("id", 1).maybeSingle();
    if (!data) return FALLBACK_BRAND;
    return {
      businessName: data.business_name ?? FALLBACK_BRAND.businessName,
      tagline: {
        en: data.tagline_en ?? FALLBACK_BRAND.tagline.en,
        bn: data.tagline_bn ?? FALLBACK_BRAND.tagline.bn,
      },
      logoSvg: data.logo_svg ?? null,
      faviconSvg: data.favicon_svg ?? null,
      primaryColor: data.primary_color ?? FALLBACK_BRAND.primaryColor,
      secondaryColor: data.secondary_color ?? FALLBACK_BRAND.secondaryColor,
      defaultLocale: data.default_locale === "bn" ? "bn" : "en",
    };
  } catch {
    return FALLBACK_BRAND;
  }
}

export async function getContact(): Promise<ContactSettings> {
  if (!isSupabaseConfigured()) return FALLBACK_CONTACT;
  try {
    const supabase = createClient();
    const { data } = await supabase.from("contact_settings").select("*").eq("id", 1).maybeSingle();
    if (!data) return FALLBACK_CONTACT;
    return {
      whatsappNumber: data.whatsapp_number ?? null,
      whatsappDefaultMessage: data.whatsapp_default_message ?? FALLBACK_CONTACT.whatsappDefaultMessage,
      imoContact: data.imo_contact ?? null,
      imoMode: data.imo_mode === "profile_url" ? "profile_url" : "fallback_notice",
      phoneDisplay: data.phone_display ?? null,
      emailDisplay: data.email_display ?? null,
      whatsappButtonLabel: data.whatsapp_button_label ?? null,
      imoButtonLabel: data.imo_button_label ?? null,
    };
  } catch {
    return FALLBACK_CONTACT;
  }
}

/**
 * Contact deep links — delegation to the pure, dependency-free module
 * (shared with the unit tests). Imported under distinct names and re-exported.
 */
export { buildWhatsAppLink, buildImoLink } from "./contact-links";

export async function getLegal(docKey: string) {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("legal_documents")
      .select("*")
      .eq("doc_key", docKey)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}
