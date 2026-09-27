-- McCluckin's — enum types.
-- Real Postgres enums rather than check constraints, per the Brief's Database section.
-- Adding a value later is `alter type ... add value`; removing one needs a migration
-- that rewrites the dependent columns, which is the intended friction.

create type public.user_role         as enum ('buyer', 'supplier', 'driver', 'admin');
create type public.profile_status    as enum ('pending', 'active', 'suspended');
create type public.app_language      as enum ('en', 'zu', 'st', 'tn');

create type public.business_type     as enum (
  'shisanyama', 'kota_shop', 'tavern', 'caterer', 'butchery',
  'spaza', 'reseller', 'farm', 'transporter', 'other'
);

create type public.bird_type         as enum ('broiler', 'hardbody', 'indigenous');

-- Weight bands the buyer picks from. The Brief names the 2–2.5 kg band explicitly
-- and leaves the rest of the ladder open; these are the bands to launch with.
create type public.weight_band       as enum (
  'under_1_5kg', '1_5_to_2kg', '2_to_2_5kg', '2_5_to_3kg', 'over_3kg'
);

create type public.avian_flu_zone    as enum ('none', 'surveillance', 'controlled');

create type public.vehicle_type      as enum ('bakkie', 'panel_van', 'light_truck', 'truck', 'other');

create type public.document_kind     as enum (
  'pdma', 'cipc', 'tax_pin', 'vat', 'bank_letter', 'ncd_ai_evidence', 'hpai_permit',
  'movement_permit', 'supplier_agreement', 'id', 'licence', 'prdp', 'operator_card',
  'roadworthy', 'insurance', 'contractor_agreement', 'training', 'vehicle_photo'
);
create type public.document_status   as enum ('missing', 'uploaded', 'approved', 'rejected');

create type public.quote_kind        as enum ('instant', 'requested');
create type public.quote_status      as enum ('open', 'accepted', 'expired', 'declined');

create type public.order_status      as enum (
  'placed', 'paid', 'scheduled', 'ready', 'on_the_way',
  'delivered', 'settled', 'cancelled', 'refunded'
);

create type public.allocation_status as enum ('offered', 'accepted', 'declined', 'ready', 'collected');
create type public.trip_status       as enum ('assigned', 'picked_up', 'delivered', 'failed');

create type public.payment_channel   as enum ('card', 'eft', 'capitec_pay', 'qr');
create type public.payment_status    as enum ('pending', 'succeeded', 'failed', 'refunded', 'disputed');

create type public.party_type        as enum ('supplier', 'driver');
create type public.transfer_status   as enum ('queued', 'sent', 'success', 'failed', 'reversed');
create type public.refund_status     as enum ('pending', 'processing', 'succeeded', 'failed');

create type public.case_type         as enum (
  'short_count', 'sick_injured', 'died', 'late', 'failed_delivery', 'payment', 'other'
);
create type public.case_status       as enum ('open', 'in_review', 'awaiting_info', 'resolved', 'closed');
create type public.case_resolution   as enum ('refund', 'credit', 'replacement', 'none');
create type public.case_cost_owner   as enum ('supplier', 'driver', 'mccluckins');
create type public.case_event_kind   as enum ('message', 'status', 'evidence', 'refund');

create type public.rating_thumbs     as enum ('up', 'down');

create type public.pdma_report_status as enum ('draft', 'submitted');

create type public.notification_channel as enum ('whatsapp', 'email', 'sms');
create type public.notification_status  as enum ('queued', 'sent', 'delivered', 'failed');
