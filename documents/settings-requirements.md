# RECAVO Settings — requirements and feature inventory for design

This is a complete inventory of what the Settings area does today in the staff portal
(`/settings`), written for a designer who is reworking the layout. It describes every tab, card,
field, control, state, permission gate and piece of copy as the product currently behaves, so the
new design can be checked against it. Where the current behaviour is a constraint rather than a
style choice, it is called out as **Must keep**. Where there is latitude, it is marked **Open to
change**.

Source of truth for behaviour: `src/routes/settings.tsx` and the components it renders
(`src/components/*Setting*.tsx`, `AccountProfileForm.tsx`, `DeleteAccountSection.tsx`,
`BillingPage.tsx`, `SmsCreditsCard.tsx`, `BrandingLogoField.tsx`, `CalendarColoursSetting.tsx`,
`MenuVisibilitySetting.tsx`, `TakePaymentOnlineSetting.tsx`, `BankTransferSetting.tsx`,
`InvoicingSetting.tsx`, `PushNotificationsSetting.tsx`, `BookingRemindersSetting.tsx`,
`MessageTemplatesSetting.tsx`).

---

## 1. Where Settings sits and how people get there

- **Entry point.** Settings lives under the **More** group at the foot of the dashboard menu
  (`More → Settings`). It is not a top-level menu item. Visible to anyone with the
  `business.read` permission (every staff role has this).
- **Route.** `/settings` with an optional `?tab=<key>` search param. Default tab is **Business**
  when no `tab` is given.
- **Deep links that must keep working** (other parts of the app link straight to a tab):
  - `/settings?tab=billing` — from the menu ("Plan & billing" row while on trial), billing banners,
    plan-gate dialogs.
  - `/settings?tab=configuration` — from Invoicing ("Branding", "Tax" links), from the booking page
    editor.
  - `/settings?tab=payments` — from "Take payment online" prompts, the Invoices page ("Invoicing
    settings") and the guides.
  - `/settings?tab=team`, `?tab=business`, `?tab=policies`, `?tab=security`, `?tab=account` — from
    the in-app guides.
  - `/settings?tab=notifications` — from the Reminders page and the messaging guides.
  - `/settings?tab=account` — "Your account" in the dashboard menu's account card.
  - `/settings?tab=policies&assist=1` — opens the Policies tab with the **AI policy assist** card
    expanded (from the setup checklist "Publish your policies" step).
  - `/settings?session_id=…` and `/settings?checkoutAttemptId=…` — legacy Stripe return URLs;
    they redirect to `/billing/success` and never render Settings. (Nothing to design.)
- **Page header.** Title "Settings", subtitle "Configure how RECAVO works for {trading name}."
  Title uses the dashboard display face (Plus Jakarta Sans, 30/34px, weight 800).
- **Loading state.** Stats ghost + table ghost while the business loads.
- **Error / no business.** Empty state titled "Couldn't load your business" with a short
  description.

### Tabs (current order)

| # | Tab | Scope | Who can change things |
|---|-----|-------|-----------------------|
| 1 | Account | The signed-in **person** (same across all their businesses) | The person themselves |
| 2 | Security | The signed-in **person** | The person themselves |
| 3 | Business | This business | `business.update` (Owner, Administrator) |
| 4 | Configuration | This business | `business.update` |
| 5 | Team | This business | `team.invite`, `team.manage_permissions` |
| 6 | Policies | This business | `business.update` |
| 7 | Privacy | This business | `business.update` |
| 8 | Notifications | Mixed: push is per person/device; reminders and templates are per business | `business.update` for reminders/templates |
| 9 | Audit | This business (read-only) | `audit.read` |
| 10 | Payments | This business | `business.update`, `connect.manage` |
| 11 | Billing | This business's RECAVO subscription | Owner, Administrator, Finance, or `billing.manage` |

**Must keep:** the split between *person* settings (Account, Security, push) and *business*
settings. A person with several businesses has one profile/password/2FA but separate business
configuration. The current design signals this only with copy ("Your own account, not this
business's settings"); the new design should make the distinction structural (e.g. two groups,
or a separate "Your account" area).

**Open to change:** tab order, grouping, naming, whether this is tabs at all. Eleven horizontal tabs
overflow on phones today and is the main problem to solve. Any grouping must still provide a
stable URL for each destination above.

### Cross-cutting rules

- **Permission fallbacks.** When someone lacks the permission to edit, the form is shown read-only
  and a small grey line replaces the Save button with "Requires business.update" (or
  `team.invite`, `audit.read`). Audit shows a full empty state "Permission denied — Requires
  audit.read." **Open to change:** the wording is developer-ish; a friendlier pattern ("Only an
  admin can change this — ask {owner}") is welcome, but the read-only form must still be visible
  where it is today.
- **Save model.** Most cards have their own **Save** button, disabled until something changed and
  valid; "Saving…" while pending; success toast on save; API errors toast and, where the API
  returns field errors, the message appears under the field in red. A few controls save
  **immediately** on toggle (Menu visibility, Push, Email preferences, Take payment online, Bank
  transfer On/Off once details are valid). The design should make instant-save controls look
  different from draft-then-save forms, or unify them.
- **Optimistic concurrency.** Business details carry a version; a stale save is rejected by the
  API and shows an error toast. Nothing to design beyond the toast.
- **Status badges.** A shared `StatusBadge` pill (active / draft / published / pending / expired /
  disabled etc.) is used throughout for memberships, invitations, policy docs and subscription
  status.
- **Dark mode** is supported everywhere; every custom colour needs a dark counterpart.
- **Phone.** Everything stacks to one column at < 640px; two-column grids are `sm:` and above.
- **Plan gating.** Some controls depend on plan: Staff menu item (Solo cannot show Staff),
  Invoicing (bolt-on on Solo/Business, included on Growth), Unlimited texts (offer), text credits
  (prepaid bundles). Gated controls stay **visible but locked** with a lock pill and a route to
  upgrade; they are never hidden.
- **Platform holds.** RECAVO can pause online payments for a business ("Online payments are
  switched off" red notice) and Stripe can reject an account ("Stripe has rejected this account").
  These notices appear at the top of the Payments cards and lock the payment switches.
- **Native apps.** The same screens run inside the iOS/Android app. In store builds Billing shows
  store prices and store-managed subscriptions; a store build without in-app purchase shows plan
  state only, with no prices and no "manage on the website" link (App Store rule 3.1.3). See §12.

---

## 2. Account tab (person)

Two-column layout on desktop: profile form left, context + preferences right.

### 2.1 Your profile (card)

Title "Your profile". Subtitle "Your own account, not this business's settings."

| Field | Control | Notes |
|-------|---------|-------|
| Email | Text, **disabled** | Hint: "Your email, password and two-factor settings are part of sign-in, not your profile." |
| Name | Text, placeholder "Alex Morgan" | Max 120. Errors: "Enter a name, or clear the field to remove it." / "Names can be at most 120 characters." |
| Phone | Tel, placeholder "+44 7700 900123" | Optional. Hint "Used to reach you about your own account." Error: "Enter 7–15 digits, optionally starting with +." |
| Language | Select | "Not set" plus en-GB, en-US, en-IE, fr-FR, de-DE, es-ES, it-IT, nl-NL, pt-PT, pl-PL, shown as native language names via `Intl.DisplayNames`. Errors: "That language tag is too long." / "That isn't a recognised language tag." |
| Timezone | Searchable combobox (popover + search) over all IANA zones | Hint: "This device is set to {zone}." when different from saved, or "Saved to your account." Error: "Pick a timezone from the list." |

- Button "Save profile" — disabled until a field changed; "Saving…" while pending.
- Field-level errors come back from the API by code (`REQUIRED`, `TOO_LONG`, `INVALID`) and are
  shown under the field.

### 2.2 How your name appears (card, right column)

Explains where the name is used: "Teammates see this on the Team list. The name clients see is on
your staff record." Shows the current display name and email as a read-only preview.

### 2.3 Emails from RECAVO (card)

One switch, saves instantly:
- "Tips and getting-started emails" — copy: a short note from Rich in the first few weeks, then
  milestones; never more than one a day.
- Footer line: "Billing notices and security emails are always sent."

### 2.4 Delete account (card, destructive)

Title "Delete account", subtitle "Permanently remove your RECAVO account and personal data."
Red/destructive border. Body copy covers: you are signed out everywhere; businesses you solely own
are closed; a 30-day export window applies.

- Button "Delete my account…" opens an **AlertDialog** "Delete your account?":
  - Preview block listing the businesses that will close and "You'll leave N other business(es)".
  - Amber warning when a subscription is billed through the App Store / Google Play: the store
    subscription must be cancelled there separately.
  - Type **DELETE** to enable the confirm button.
  - Buttons: "Keep my account" (cancel) / "Delete account" (destructive).

---

## 3. Security tab (person)

### 3.1 Password (card)

- Title is "Password" when the person has a password, "Set a password" when they only sign in with
  Google.
- Fields: Current password (only if they already have one), New password (min 8, hint "At least 8
  characters."), Confirm new password (inline error "Passwords don't match.").
- Button "Update password" / "Set password". Toasts "Password updated" / "Password set".

### 3.2 Two-factor authentication (card)

Subtitle: "Privileged actions require a code from an authenticator app once this is on."
- **Enrolled:** "An authenticator app is enrolled on this account." + button "Unenrol" → AlertDialog
  "Remove two-factor authentication?" (Cancel / Remove).
- **Not enrolled:** copy recommending Google Authenticator, 1Password or Authy + button
  "Enrol authenticator" (launches the Supabase TOTP enrolment flow: QR code, 6-digit code entry).
  Toast on success: "Two-factor authentication is on".

**Must keep:** some actions elsewhere (refunds, credit adjustments, payouts) demand a fresh 2FA
code; the enrolment and the step-up prompt share visual language.

---

## 4. Business tab

Two cards side by side on desktop.

### 4.1 Business details (card)

Header shows a status badge (active / trial / closed…) and "Industry: {label}" (e.g. Personal
training, Car detailing) — industry is **read-only** here.

| Field | Control | Notes |
|-------|---------|-------|
| Trading name | Text | The name clients see |
| Legal name | Text | Optional |
| Currency | Text (ISO 4217, e.g. GBP) | Validated by the API |
| Timezone | Text (IANA) | Validated by the API |
| Locale | Text (e.g. en-GB) | Validated by the API |

- Button "Save changes" (gated `business.update`; fallback "Requires business.update"). Toast
  "Business profile updated". The save carries the record `version`, so a stale save is rejected
  by the API and surfaces as an error toast rather than overwriting someone else's change.
- **Open to change:** Currency/Timezone/Locale are plain text fields today; a select/combobox
  (like the Account timezone picker) is the obvious upgrade.

### 4.2 Booking page (card)

Title "Booking page". Controls the public booking link slug.
- Input "Public booking link" with a copy button (toast "Booking link copied"); live preview of the
  full public URL beneath, slugified as you type (lowercase, hyphens, max 60 characters).
- Amber warning when changed: "Anywhere you have already shared {old URL} — printed, on social,
  in emails — will stop working."
- Button "Save link" — disabled unless changed and slug ≥ 3 characters. Toast "Booking link
  updated". A taken slug comes back as an API field error under the input.

---

## 5. Configuration tab

The densest tab. Two columns on desktop; a single full-width **"Save configuration"** button at
the bottom saves everything except the cards that save on their own (Calendar colours, Menu,
Take payment online). **Open to change:** splitting this into several smaller destinations is
expected; each card below is independently meaningful.

### 5.1 Terminology (card, left)

Four text fields that rename nouns across the whole product (menu, forms, emails):
Staff label (default "Staff"/"Trainer"), Service label ("Session"/"Service"), Booking label
("Booking"/"Job"), Linked record label ("Vehicle"/"Record"). Helper copy explains that the words
appear everywhere clients and staff see them.

### 5.2 Branding (card, left)

- **Logo** (`BrandingLogoField`): 112×64 preview tile; buttons Upload / Replace / Remove; PNG or
  JPEG up to 1 MB. Error copy: "That file is too large (1 MB max).", "That doesn't look like an
  image.", "That file failed our safety scan.", "Our scanner is busy — try again in a minute.",
  "This business is closed."
- Collapsed `<details>` "Use an image hosted elsewhere instead" → Logo URL (https only).
- **Accent colour**: hex text field + native colour picker. Hint "Buttons and highlights in your
  emails." Error "Must be a #rrggbb value."
- **Email preview** box: logo (or uppercase business name), accent rule, sample heading "Your
  sessions are ready" and a sample button "Book your sessions" in the accent colour. Updates live.

### 5.3 Calendar colours (card, left)

Subtitle: booking bars are coloured by payment status; events have their own colour; blank means
the default.

| Row | Hint |
|-----|------|
| Paid / nothing to collect | Fully paid or free bookings |
| Deposit / part paid | Something still owed |
| Unpaid | Nothing taken yet |
| Events | Group sessions and events (shown hatched in the sample) |

Each row: hex input (placeholder shows the default), native colour picker, "Default" reset chip,
live swatch. Footer: "Save colours", "Reset all to defaults", "Unsaved changes" hint.
The same editor opens as a dialog from the calendar legend.

Also in this card: **Bank holidays** select — "No bank holidays", England & Wales, Scotland,
Northern Ireland. Copy: "Mark the public holidays for where you trade on the calendar. Dates come
from gov.uk."

### 5.4 Menu (card, left) — instant save

One switch per optional menu item (label + hint):
Waitlist, Consumables (car detailing only — "Materials a job uses up"), Packages, Offer links,
Reminders ("Remind clients when they are due back"), Records/Vehicles (only when a record schema
exists), Staff, Messages, Invoices, Reports, Referrals. Calendar, Bookings, Sessions, Clients,
Locations, Payments and Settings always show and are not listed.

- **Staff on Solo plan:** the switch is locked with a "Business plan" lock pill and copy "Solo seats
  one person — you. Upgrade to add a team." Toggling opens a dialog "Staff needs a bigger plan"
  with "Not now" / "See plans" (→ `/billing`).
- Hiding is cosmetic: the page still works if reached by link.

### 5.5 Booking rules (card, right)

- Default hold (minutes) — how long a provisional online booking is held before it expires.
- Cancellation window (hours) — used by policies and the client self-service cancel.
- Embedded **Take payment online** section (see §11.1; same component as on Payments).

### 5.6 Tax (card, right)

- "VAT registered" switch (row style: label left, switch right).
- VAT number (text).
- VAT rate (%) (number, 0–100). Hint: "Applied to taxable invoice lines. Invoices show a VAT
  breakdown only when you're registered and a rate is set." Error: "Enter a rate between 0 and
  100."
- "Prices include VAT" switch with copy: "Your prices are gross — VAT is backed out on invoices."
  / "Your prices are net — VAT is added on top on invoices."

### 5.7 Legal address & retention (card, right)

Address line 1, Address line 2, City, Region, Postal code, Country (ISO-2, e.g. GB), and
"Closure export window (days)" (default 30) — how long data stays exportable after the business
closes.

### 5.8 Save configuration (full width)

Single primary button; disabled while accent colour / logo URL / VAT rate are invalid. Toast
"Configuration saved". Gated `business.update`.

---

## 6. Team tab

### 6.1 Memberships (card)

List of people in the business: name, email · role labels, status badge.
- Owner row shows "Owner role is fixed" instead of a control.
- Other rows: role **Select** (gated `team.manage_permissions`) with the invitable roles:
  Administrator, Manager, Staff, Reception, Finance, Restricted staff. Changing saves at once;
  toast "Role updated".
- Role display names: Owner, Administrator, Manager, Staff, Reception, Finance, Restricted staff,
  Client.

**Open to change:** there is no remove/deactivate member action here today (it is on the Staff
page); the designer can decide whether Team and Staff should merge. Also no role descriptions —
a "what can this role do" affordance is wanted.

### 6.2 Invite teammate (card)

Email (text), Role (select, same six roles, default Staff), button "Send invite" (gated
`team.invite`; fallback "Requires team.invite"). On success the `/invite?token=…` link is copied
to the clipboard and a toast says "Invitation created — Invite link copied." (No email is sent
today — **Must keep** the copy-link flow until that changes.)

### 6.3 Pending invitations (card)

Rows: email, "roles · expires {date}", status badge. Empty: "No pending invitations."
No revoke action today (**Open to change**: should exist).

---

## 7. Policies tab

Legal documents clients accept when booking.

### 7.1 AI policy assist (card; expanded when `?assist=1`, otherwise a small "Draft with AI" button)

Fields prefilled from the business: Business name, Cancellation window (hours), Late cancel /
no-show notes (textarea), Refund / package notes (textarea), Locale, Industry.
- Buttons: "Draft with AI" (pending label "Drafting… up to a minute") and "Seed defaults instead".
- If the AI service is unavailable: a notice and only the seed option.
- Result panel: disclaimer, model name, a **Cancellation policy** draft and a **Terms and
  conditions** draft, each with status + review badges and a "Publish" button; "Publish both";
  once done: "Cancellation and terms are published."

### 7.2 Policy documents (card)

Action button "Seed defaults" (creates RECAVO's template documents as drafts).
List rows: type label, "Version n", description, review badge (e.g. "Needs legal review"), status
badge (draft/published), "Publish" button on drafts. Empty state "No policy documents".

### 7.3 Create draft (card)

- Type select — six types, each with a one-line description:
  Cancellation policy, Terms and conditions, Privacy notice, Consent wording, Package terms,
  Data processing addendum.
- Body textarea (8 rows, Markdown).
- "Publish immediately" switch.
- Button "Create". Toast "Draft created" / "Policy published".

### 7.4 Current document (card, titled by the selected type)

Shows Version, status badge, review badge and the counsel-review note: "Placeholder wording from
the RECAVO template. Have it checked by a solicitor before relying on it." Then the rendered
Markdown body. Empty: "No published document."

---

## 8. Privacy tab

### 8.1 Latest privacy notice (card)

Title · vN, "Published {date time}", rendered body. Empty: "No privacy notice".

### 8.2 Publish new notice (card)

Title (text), Body (textarea, 10 rows), button "Publish" (gated `business.update`). Publishing
creates a new version; clients are asked to re-accept on their next booking.

**Open to change:** this overlaps with the "Privacy notice" policy type in §7 and could be folded
into Policies.

---

## 9. Notifications tab

Three stacked cards.

### 9.1 Push notifications (per device, per person) — instant save

- Hidden entirely when push is not configured for the platform.
- Icon + title "Push notifications" and copy that changes with state:
  - On: "New bookings, package requests, payments and messages buzz this device as they happen."
  - Blocked by OS/browser: "Notifications for RECAVO are blocked in your phone's settings / by this
    browser. Allow them there, then turn this on." (switch disabled)
  - Browser unsupported: "This browser cannot receive push notifications. Add RECAVO to your Home
    Screen from the Share menu, or use the RECAVO app." (iPhone) / "Try Chrome, Edge, Firefox or
    Safari 16+, or use the RECAVO app."
  - Off and possible: "Get told the moment something needs you — a package to confirm, a new
    booking, a payment — even when RECAVO is closed."
- Switch on the right. Card tints mint when on. Toasts "Notifications are on for this device" /
  "Notifications are off for this device".
- **Your devices** list beneath (when any exist): "iPhone app" / "Android app" / "Browser" (or a
  label), right-aligned "last seen 3 Oct" or "turned off" / "no longer reachable" (struck through).
  Heading shows "(N on)".

### 9.2 Booking reminders (per business)

Header: icon, title, pill "N on" (mint) or "Off" (grey). Copy: "Automatic reminders to clients
before each booking. Changes apply to upcoming bookings straight away; reminders already sent are
never repeated."

- Rule rows (up to **5**): `Send [amount] [minutes|hours|days|years before] by [Client's
  preference | Email | SMS]` + trash icon. Labels only on the first row.
- Validation per row: "Enter a whole number.", "Between 5 minutes and 2 years before.",
  "Two reminders can't go at the same time."
- "Add reminder" (outline, disabled at 5 with "Up to 5 reminders.").
- Empty: "No automatic reminders. Add one to remind clients before their booking."
- Explainer: "Client's preference follows each client's contact setting. SMS texts clients who have
  a mobile number and haven't opted out — anyone else gets an email instead."
- Text-credit line in grey / amber (low) / red (empty) with a link "Text credits" or "Buy texts"
  (→ `/billing/sms-credits`).
- Buttons "Save reminders" and, when dirty, "Discard changes". Toast "Reminders saved — 1 day
  before, 2 hours before" or "Automatic reminders are off".
- Read-only fallback lists the saved rules and "An admin can change this."
- The same editor appears as a drawer from the Calendar page.

### 9.3 Message templates (per business)

Title "Message templates" with a long explainer: messages clients receive by email and text;
`{{first_name}}` placeholders filled automatically; `[[ at {{location}}]]` optional segments;
emails get the details table and buttons added under your text; texts get a link at the end.

For **each template** (booking confirmed, reminder, cancelled, package ready, invoice, etc. — list
comes from the API with label + description):
- Two side-by-side editors on desktop, **Email** and **Text message**; tabs below `md` with a dot
  marking a customised channel.
- Each editor: label with icon, pill "Customised" (mint) or "Default" (grey); hint — Email:
  "Subject: {subject}. Your wording sits above the details table and buttons."; SMS: "The whole
  text. A link labelled {label}: is added at the end unless you place {{link}} yourself." or "This
  message has no link."
- Textarea (3 rows email / 4 rows SMS).
- Live **Preview** rendered by the API (debounced), dimmed while stale; "Rendering…" /
  "Couldn't render a preview."
- SMS size line "1 text (92 characters) as sent", turns amber over 306 characters with "texts are
  cut off after 306 characters, so shorten this."; hard error over the max length.
- Unknown-placeholder warning: "{{foo}} isn't recognised and will be left blank."
- Collapsible "Placeholders you can use": each token is a chip that appends itself to the text, with
  a description.
- Buttons "Save email" / "Save text" and ghost "Reset to default".
- Loading: table ghost. Error: "Couldn't load your message templates."
- Read-only fallback: "An admin can change these messages."

---

## 10. Audit tab

Gated `audit.read` (Owner and Administrator by default). Full empty state otherwise.

Card "Audit trail — Newest first". Each row: human action label (e.g. "Credit issued", "Payment
refunded", "Booking cancelled", "Data retention run", "Member role changed"), timestamp in the
business timezone, "Team member · a customer" / "System · a payment" style actor/subject line.
25 per page, "Previous" / "Next" with "Page x of y". No filters or search today (**Open to
change**: filter by actor, type and date is a known ask).

---

## 11. Payments tab

How the business gets paid by clients (not RECAVO's own billing). Two-column grid; most cards
span the full width.

### 11.1 Take payment online (section) — instant save

Whole section tints mint when On and **amber** when Off (icon tile swaps from banknote to warning
triangle). Title "Take payment online" with an **On / Off** pill.
- Copy on: "Priced sessions booked on your public page are paid by card before they are
  confirmed."
- Copy off: "Clients can book priced sessions without paying. You will have to collect payment
  yourself."
- The switch is **locked** (cannot be turned on) until either Stripe is connected with charges
  enabled (and there is no platform hold) or bank transfer is on. Turning it off is always allowed.
  Guidance line when nothing is ready: "Set up a way to get paid first — connect Stripe or add bank
  transfer details. Both are below." (or "…add your bank transfer details. It's below." when Stripe
  is hidden). When already on with nothing ready: "Until Stripe or bank transfer is set up, your
  page takes bookings as pay on the day."
- Toasts: "Online payments are on" / "Online payments are off".
- Read-only fallback: "On — an admin can change this".
- When rendered outside the Payments tab (Booking rules card) an outline button "Payment settings"
  / "Set up payments" points here.

### 11.2 Pay by bank transfer (card)

Header "Pay by bank transfer" with On/Off. Fields: Account name, Sort code (auto-formats
12-34-56, 6 digits), Account number (8 digits), IBAN (optional), BIC (optional). The enable switch
stays locked until the three UK fields are valid. Button "Save bank details". Inline error
"Add your account name, sort code and account number first." These details are printed under
"How to pay" on invoices.

### 11.3 Payment processing (card) — Stripe Connect

Hidden when the platform has hidden Stripe and nothing is connected.
- **Not connected:** platform-hold notice (if any) → empty state "No payout account connected —
  Connect Stripe to take card payments. Recavo never stores your bank details." with button
  "Set up payments" (→ `/payments` onboarding) → **Stripe fees note** ("What Stripe will charge":
  1.5% + 20p UK cards, 2.5% + 20p EEA, 3.25% + 20p international; no monthly fee; Recavo takes no
  cut; link to Stripe UK pricing).
- **Connected:** hold / rejection notices (red, with date), a provider row "Stripe — Charges
  enabled/disabled · Payouts enabled/disabled", the fees note in its "connected" wording, and a
  button "Manage payouts" (or "Open Stripe dashboard") gated `connect.manage`.

### 11.4 Invoicing (card)

Header: icon, title "Invoicing", copy "Numbered PDF invoices, emailed to clients and issued
automatically when a job is marked attended. Included with Growth; a £8/month bolt-on on Solo and
Business." plus "Choose a plan to switch it on." when there is no subscription.

Right-hand **entitlement control**, one of:
- Active badge + "Included in {plan}"
- Active badge + "Bolt-on · £8/month" + "Remove" (AlertDialog "Remove invoicing?" — body explains
  nothing issued is lost and the unused month is credited; "Keep invoicing" / "Remove add-on")
  or "Manage in App Store / Google Play" in store builds
- Button "Add invoicing — £8/month" (web) / store price (store) — states "Adding…", "Waiting for
  App Store…"
- Grey text when the viewer cannot buy: "Not on your plan — ask the owner" / "…add it on the
  website" / "…add it in the iPhone app".

Below, when not entitled: grey note "You can still view and download invoices already issued.
These settings apply once invoicing is on your plan."

Settings (gated `business.update`):
- Switch row "Invoice automatically when a job is completed" with explanation.
- Number prefix (default `INV-`, ≤12 chars, letters/digits/-/_) with live hint "Next invoice:
  INV-0001. Changing this later doesn't renumber existing invoices."
- Payment terms (days) 0–365 with hint "Due on the day it's issued." / "Due 14 days after issue."
- Footer note (textarea, 1000 chars, placeholder "Thank you for your business.", counter).
- Cross-links: bank details come from "Pay by bank transfer"; logo/accent from Branding; VAT from
  Tax (links to Configuration).
- Button "Save invoicing settings".

---

## 12. Billing tab (RECAVO subscription)

Renders the same `BillingPage` as `/billing`. Visible to Owner, Administrator, Finance or anyone
with `billing.manage` / `business.update`; others see the empty state "Ask the owner to
subscribe".

Three variants by surface; the designer should design the **web** one fully and treat the other
two as reductions of it.

### 12.1 Web (Stripe)

Vertical stack:
1. **Discount banner** (green) when a partner/referral coupon is on the subscription: "Discount
   applied: 20% off until {date}. {label}. Plan prices shown on this page are before the discount."
2. **Access line** while locked without a plan: e.g. "Choose a plan to start your 14-day trial.
   We'll take a card now and only charge when the trial ends." / "This workspace is read-only until
   billing is updated." / "Your subscription has ended…".
3. **Payment failed card** (amber, prominent) when the last renewal failed: title "Your payment
   didn't go through", amount owed + attempt count + Stripe's decline reason, grace-period or
   read-only explanation, buttons **"Pay £X now"** (charges card on file), **"Pay with a different
   card"** (Stripe hosted invoice, opens new tab), ghost **"Update card in Stripe"**; polls every
   10 s so paying elsewhere unlocks the page. Small print about which button to press after
   updating the card.
4. **Current plan** card: status badge; "Plan: Business · Access: active"; "Trial ends …" or
   "Period ends …"; amber "Cancels at period end"; buttons **"Upgrade plan" / "Change plan"**
   (scrolls to the chooser), **"Manage in Stripe"** (customer portal), **"Cancel at period end"**
   (AlertDialog "Cancel subscription? Access continues until the current period ends. You can
   resume before then." — "Keep plan" / "Confirm cancel") or **"Resume"** when already cancelling.
   If billed through a store: explanatory text instead of buttons.
5. **Add-ons** card: one row per catalogue add-on — Invoicing, Upsells, Unlimited texts (offer) —
   icon, name, state copy (included / active · price / available copy), and Active badge, "Remove"
   (AlertDialog per add-on) or "Add for £X/month".
6. **Text credits** card: "One credit is one text sent on your behalf, however long. Credits never
   expire…"; big balance "42 texts left", "120 bought · 78 sent"; button "Buy 100 texts (£6)";
   amber "Running low" / red "You're out of text credits. Texts are currently going out as emails"
   notice; "Recent activity" ledger (Bundle purchased / Text sent / Credit returned / Credits added
   by Recavo, with +/- delta and running balance). Unlimited variant shows an Active badge and
   explanatory copy. Non-buyers see "Ask the business owner to buy more".
7. **Change plan / Choose a plan** heading with a Monthly / Yearly select, then three plan cards
   (Solo, Business — "Most popular" with a mint border, Growth): name, tagline (varies by
   industry), big price "/month", feature bullets with ticks (first bullet is capacity, e.g. "Up to
   5 trainers, 2 locations"), and a full-width pill button: "Start free trial" / "Subscribe to
   Business" / "Current plan" (disabled) / "Switch to Growth". Loading shows three pulsing
   placeholders; failure shows "Plans unavailable".
8. **Change preview** card after "Switch to …": "Upgrade, effective {date} (immediately)", "Charge
   now £X · Credit now £Y · Tax £Z", amber "Blockers: staff.active (6/5)" when over a limit,
   buttons "Apply change" / "Dismiss".

### 12.2 Store app (iOS / Android with in-app purchase)

Same stack but prices come from the store, plan cards carry trial text from the store's intro
offer ("14 days free, then £29/month. Renews automatically until cancelled."), buttons "Manage
subscription" (opens store subscription page) and "Restore purchases", a footer with Terms /
Privacy Policy links, and add-ons/text bundles bought through the store. A subscription billed
through Stripe or the *other* store is shown read-only with copy telling them where to manage it.

### 12.3 Store app without in-app purchase

"Current plan" card (plan, access, period/trial end, "Cancels at period end") and the Text
credits balance only. No prices, no links out, and an empty state "Subscription not active" when
there is no live plan.

---

## 13. Components the designer will meet repeatedly

- **Setting card**: rounded 12–16px container, 16–20px padding, optional 40px icon tile (mint
  tint) top-left, title (16px semibold), one-line description (14px muted), content, right-aligned
  actions. Used by Push, Reminders, Templates, Invoicing, Take payment online, Bank transfer.
- **Section card** (`SectionCard`): title + optional description + optional action slot top-right.
  Used across Billing and Policies.
- **On/Off pill** and **"N on" / "Off"** pills; **Customised / Default** pills; **lock pill**
  "Business plan".
- **Switch rows**: label + explanation left, switch right.
- **AlertDialog** for every destructive or billing-affecting action; destructive confirm buttons.
- **Toasts** (sonner) bottom-right on desktop; success/info/error with optional action button
  ("Go to billing").
- **Inline validation**: red 12px text beneath the field; `aria-invalid` on the control.
- **Hints**: grey 12px text beneath the field, swapped for the error when invalid.
- **Ghost loaders**: StatsGhost, TableGhost, PageGhost, pulsing cards.
- **Empty states**: centred title + description + optional primary action.

---

## 14. Accessibility requirements (must keep)

- Every switch and icon-only button has an `aria-label` (e.g. "Push notifications on this device",
  "Remove reminder", "Unit", "Channel").
- Tabs are real tablist/tab/tabpanel with keyboard arrows; the mobile template-channel toggle is a
  tablist too.
- Live regions: previews and status notices use `aria-live="polite"` / `role="status"`; payment
  decline messages use `role="alert"`.
- Focus is visible on all controls; colour is never the only signal (pills carry text, invalid
  fields carry messages).
- Minimum 44px touch targets on phone for switches, chips and row actions.
- Copy is sentence case, British English, second person, no jargon in user-facing text (the
  `Requires business.update` fallbacks are the exception to fix).

---

## 15. Known problems and opportunities for the redesign

1. **Eleven tabs** overflow and hide context on phones; no sense of which are "me" vs "my business".
2. **Configuration** mixes seven unrelated cards under one Save button; people miss that Menu and
   Calendar colours save on their own.
3. **Team** has no member removal, role descriptions, or invitation revoke; invitations are
   copied-link only.
4. **Policies vs Privacy** overlap.
5. **Payments vs Billing** are confused by users ("payments" = client money, "billing" = our
   subscription). Naming and placement should make this unmistakable.
6. **Permission fallbacks** are developer wording.
7. **Audit** has no filters.
8. **Business details** uses free-text for currency/timezone/locale.
9. **Entitlement controls** (Invoicing, Staff lock, texts) each look different; a single
   "plan-gated feature" pattern (lock pill + price + one-tap add) would help.
10. The page has no search; a settings search or at least a left-hand section index on desktop
    would suit the new inset-panel layout.
