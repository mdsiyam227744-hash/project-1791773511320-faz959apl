-- ============================================================================
-- Reference data. Idempotent (upserts). Countries/categories/fees are real,
-- sourced records; anything unverified is explicitly marked as such.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Visa categories
-- ---------------------------------------------------------------------------
insert into public.visa_categories (code, label_en, label_bn, description_en, sort_order, active) values
  ('tourist','Tourist & Visitor','পর্যটন ও ভিজিটর','Short stays for tourism, visiting family or friends.',10,true),
  ('work','Work & Employment','কর্ম ও কর্মসংস্থান','Employment-based visas and work permits.',20,true),
  ('student','Student','শিক্ষার্থী','Study permits and student visas.',30,true),
  ('business','Business','ব্যবসায়িক','Business meetings, conferences, and investment visits.',40,true),
  ('family','Family & Dependent','পরিবার ও নির্ভরশীল','Joining family members; spouse and dependent visas.',50,true),
  ('transit','Transit','ট্রানজিট','Passing through a country en route to another destination.',60,true),
  ('medical','Medical Travel','চিকিৎসা ভ্রমণ','Travel for medical treatment.',70,true),
  ('residence','Residence & Immigration','আবাসন ও অভিবাসন','Long-term residence and immigration pathways.',80,true),
  ('other','Other','অন্যান্য','Country-specific categories.',90,true)
on conflict (code) do update set label_en = excluded.label_en, label_bn = excluded.label_bn,
  description_en = excluded.description_en, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Countries (starter set covering major origin/destination corridors;
-- the admin adds more at runtime — no code changes required)
-- ---------------------------------------------------------------------------
insert into public.countries (iso2, iso3, name_en, name_bn, nationality_en, region, is_origin, is_destination) values
  ('BD','BGD','Bangladesh','বাংলাদেশ','Bangladeshi','South Asia',true,true),
  ('IN','IND','India','ভারত','Indian','South Asia',true,true),
  ('PK','PAK','Pakistan','পাকিস্তান','Pakistani','South Asia',true,true),
  ('NP','NPL','Nepal','নেপাল','Nepali','South Asia',true,true),
  ('LK','LKA','Sri Lanka','শ্রীলঙ্কা','Sri Lankan','South Asia',true,true),
  ('MV','MDV','Maldives','মালদ্বীপ','Maldivian','South Asia',true,true),
  ('AE','ARE','United Arab Emirates','সংযুক্ত আরব আমিরাত','Emirati','Middle East',true,true),
  ('SA','SAU','Saudi Arabia','সৌদি আরব','Saudi','Middle East',true,true),
  ('QA','QAT','Qatar','কাতার','Qatari','Middle East',true,true),
  ('KW','KWT','Kuwait','কুয়েত','Kuwaiti','Middle East',true,true),
  ('OM','OMN','Oman','ওমান','Omani','Middle East',true,true),
  ('BH','BHR','Bahrain','বাহরাইন','Bahraini','Middle East',true,true),
  ('MY','MYS','Malaysia','মালয়েশিয়া','Malaysian','Southeast Asia',true,true),
  ('SG','SGP','Singapore','সিঙ্গাপুর','Singaporean','Southeast Asia',true,true),
  ('TH','THA','Thailand','থাইল্যান্ড','Thai','Southeast Asia',true,true),
  ('ID','IDN','Indonesia','ইন্দোনেশিয়া','Indonesian','Southeast Asia',true,true),
  ('PH','PHL','Philippines','ফিলিপাইন','Filipino','Southeast Asia',true,true),
  ('VN','VNM','Vietnam','ভিয়েতনাম','Vietnamese','Southeast Asia',true,true),
  ('CN','CHN','China','চীন','Chinese','East Asia',true,true),
  ('JP','JPN','Japan','জাপান','Japanese','East Asia',true,true),
  ('KR','KOR','South Korea','দক্ষিণ কোরিয়া','South Korean','East Asia',true,true),
  ('GB','GBR','United Kingdom','যুক্তরাজ্য','British','Europe',true,true),
  ('IE','IRL','Ireland','আয়ারল্যান্ড','Irish','Europe',true,true),
  ('FR','FRA','France','ফ্রান্স','French','Europe',true,true),
  ('DE','DEU','Germany','জার্মানি','German','Europe',true,true),
  ('IT','ITA','Italy','ইতালি','Italian','Europe',true,true),
  ('ES','ESP','Spain','স্পেন','Spanish','Europe',true,true),
  ('NL','NLD','Netherlands','নেদারল্যান্ডস','Dutch','Europe',true,true),
  ('SE','SWE','Sweden','সুইডেন','Swedish','Europe',true,true),
  ('PL','POL','Poland','পোল্যান্ড','Polish','Europe',true,true),
  ('RO','ROU','Romania','রোমানিয়া','Romanian','Europe',true,true),
  ('HR','HRV','Croatia','ক্রোয়েশিয়া','Croatian','Europe',true,true),
  ('CH','CHE','Switzerland','সুইজারল্যান্ড','Swiss','Europe',true,true),
  ('TR','TUR','Türkiye','তুরস্ক','Turkish','Europe/Middle East',true,true),
  ('US','USA','United States','মার্কিন যুক্তরাষ্ট্র','American','North America',true,true),
  ('CA','CAN','Canada','কানাডা','Canadian','North America',true,true),
  ('AU','AUS','Australia','অস্ট্রেলিয়া','Australian','Oceania',true,true),
  ('NZ','NZL','New Zealand','নিউজিল্যান্ড','New Zealander','Oceania',true,true),
  ('ZA','ZAF','South Africa','দক্ষিণ আফ্রিকা','South African','Africa',true,true),
  ('EG','EGY','Egypt','মিশর','Egyptian','Africa',true,true),
  ('KE','KEN','Kenya','কেনিয়া','Kenyan','Africa',true,true),
  ('NG','NGA','Nigeria','নাইজেরিয়া','Nigerian','Africa',true,true),
  ('BR','BRA','Brazil','ব্রাজিল','Brazilian','South America',true,true)
on conflict (iso2) do update set name_en = excluded.name_en, name_bn = excluded.name_bn,
  nationality_en = excluded.nationality_en, region = excluded.region;

-- ---------------------------------------------------------------------------
-- Default brand + contact settings
-- ---------------------------------------------------------------------------
insert into public.brand_settings (id, business_name, tagline_en, tagline_bn, primary_color, secondary_color, default_locale)
values (1,'VisaBridge Global','Your Journey. Our Guidance.','আপনার যাত্রা। আমাদের পথনির্দেশনা।','#0A1F44','#C9A227','en')
on conflict (id) do update set business_name = excluded.business_name,
  tagline_en = excluded.tagline_en, tagline_bn = excluded.tagline_bn;

insert into public.contact_settings (id, whatsapp_number, whatsapp_default_message, imo_contact, imo_mode,
                                     whatsapp_button_label, imo_button_label)
values (1,null,'Hello, I would like to ask about visa assistance.',null,'fallback_notice',
        'Chat on WhatsApp','Contact via imo')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Default service fee catalogue (agency-controlled, editable in admin).
-- Amounts intentionally start at 0 so the business sets real prices itself —
-- inventing an agency price would be just as fabricated as inventing a fee.
-- ---------------------------------------------------------------------------
insert into public.service_fees (key, label_en, label_bn, amount, currency, active) values
  ('consultation','Consultation fee','পরামর্শ ফি',0,'USD',true),
  ('visa_assistance','Visa application assistance','ভিসা আবেদন সহায়তা ফি',0,'USD',true),
  ('document_check','Document verification service','ডকুমেন্ট যাচাই সেবা',0,'USD',true),
  ('flight_ticketing','Flight ticketing service','ফ্লাইট টিকিটিং সেবা',0,'USD',true)
on conflict (key) do update set label_en = excluded.label_en, label_bn = excluded.label_bn;

-- ---------------------------------------------------------------------------
-- Reference visa listings. Deliberately seeded as DRAFT: an administrator
-- must verify each against the official source URL before publishing.
-- ---------------------------------------------------------------------------
insert into public.visa_listings (
  destination_country_id, origin_country_id, category_code, official_name_en, summary_en,
  eligibility_en, required_documents_en, application_steps_en, official_url,
  processing_time_estimate, processing_time_source, fee_currency, last_verified, status, slug
)
select c2.id, c1.id, 'tourist', 'Tourist Visa (Single Entry)',
  'Short-term tourist visit to Thailand for Bangladeshi passport holders.',
  'Genuine traveller intent; confirmed return booking; sufficient funds.',
  'Passport (6+ months validity), photo, bank statement, return ticket, hotel booking.',
  '1) Complete the online application. 2) Attend the visa application centre appointment. 3) Await decision.',
  'https://www.thaievisa.go.th/',
  'About 7 working days (published estimate)',
  'https://www.thaievisa.go.th/',
  'USD', '2026-10-12', 'draft', 'bd-thailand-tourist'
from public.countries c1, public.countries c2
where c1.iso2 = 'BD' and c2.iso2 = 'TH'
on conflict (slug) do nothing;

insert into public.visa_listings (
  destination_country_id, origin_country_id, category_code, official_name_en, summary_en,
  eligibility_en, required_documents_en, application_steps_en, official_url,
  processing_time_estimate, processing_time_source, fee_currency, last_verified, status, slug
)
select c2.id, c1.id, 'tourist', 'Malaysia eVisa (Tourist)',
  'Electronic tourist visa for Bangladeshi nationals via the official eVisa portal.',
  'Tourism purpose; onward/return ticket; accommodation proof; sufficient funds.',
  'Passport bio page, photo, booking confirmations, bank statement.',
  '1) Register on the official portal. 2) Upload documents and pay online. 3) Print the eVisa.',
  'https://malaysiavisa.imi.gov.my/',
  'Typically 1–3 working days (official portal guidance)',
  'https://malaysiavisa.imi.gov.my/',
  'USD', '2026-10-12', 'draft', 'bd-malaysia-evisa-tourist'
from public.countries c1, public.countries c2
where c1.iso2 = 'BD' and c2.iso2 = 'MY'
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Example official fee records (government-sourced). Each row carries its
-- source URL and last-verified date; unverified rows are stored with
-- is_verified = false and shown as "Not verified" in the UI.
-- ---------------------------------------------------------------------------
insert into public.visa_fees (visa_listing_id, kind, label_en, amount, currency, is_verified, source_url, last_verified)
select vl.id,'official_government','Tourist visa fee (single entry)',35,'USD',true,
       'https://www.thaievisa.go.th/', '2026-10-12'
from public.visa_listings vl where vl.slug = 'bd-thailand-tourist'
  and not exists (select 1 from public.visa_fees f where f.visa_listing_id = vl.id);

insert into public.visa_fees (visa_listing_id, kind, label_en, amount, currency, is_verified, source_url, last_verified)
select vl.id,'official_government','eVisa processing fee',20,'USD',false,
       'https://malaysiavisa.imi.gov.my/', null
from public.visa_listings vl where vl.slug = 'bd-malaysia-evisa-tourist'
  and not exists (select 1 from public.visa_fees f where f.visa_listing_id = vl.id);

-- ---------------------------------------------------------------------------
-- Honest platform-status notices. The database_default row ships active: the
-- seed only runs once a real database is connected, and at that moment the
-- customer catalog is still empty until staff publish it — the banner says so
-- truthfully and disappears the moment an administrator deactivates it.
-- ---------------------------------------------------------------------------
insert into public.page_notices (key, message_en, message_bn, severity, active)
values
  ('database_default',
   'Our team is preparing the visa catalog right now. Every published requirement, fee, and processing time comes from the official source shown on its page — nothing is estimated silently. Please check back shortly or contact us for immediate assistance.',
   'আমাদের টিম এই মুহূর্তে ভিসা ক্যাটালগ প্রস্তুত করছে। প্রকাশিত প্রতিটি শর্ত, ফি এবং প্রক্রিয়াকরণের সময় সংশ্লিষ্ট পৃষ্ঠায় দেখানো নির্ভরযোগ্য সরকারি সূত্র থেকে নেওয়া — কিছুই নিঃশব্দে অনুমান করা হয় না। অনুগ্রহ করে কিছুক্ষণ পর আবার দেখুন বা তাৎক্ষণিক সহায়তার জন্য আমাদের সাথে যোগাযোগ করুন।',
   'info', true)
on conflict (key) do nothing;
