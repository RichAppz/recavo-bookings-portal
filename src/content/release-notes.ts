import type { ReleaseNote } from "../lib/release-notes.ts";

/**
 * What's shipped, newest first. One entry per release day; add to the top.
 * Speak to the business owner: what they can now see or do. See `src/lib/release-notes.ts`.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: "2026-10-18",
    title: "A way back in when a payment fails",
    items: [
      {
        kind: "fixed",
        text: "If your monthly payment doesn't go through, the Plan page now says so and gets you back in. It shows what is owed and why the card was declined, with Pay now to charge the card Stripe has on file (update it first with Update card in Stripe, if you need to), or Pay with a different card to settle it on Stripe's own page. The moment it goes through your workspace reopens — nothing is removed while it is read-only. Before, this screen offered another free trial, which couldn't be started and left you stuck.",
        where: "Plan",
      },
      {
        kind: "improved",
        text: "The plan buttons say Subscribe rather than Start free trial once you have already had your trial.",
        where: "Plan",
      },
      {
        kind: "new",
        text: "A failed payment now gives you 48 hours of full access before the workspace goes read-only, and we email you at both points: when the card is declined (with the exact time your access would pause and a Pay now link) and again if it does pause. The 48 hours start from the moment we first see the payment has failed, even if Stripe's own notification to us is late, so nobody is locked out without warning. The Plan page and the red banner show the time as well as the date.",
        where: "Plan",
      },
      {
        kind: "new",
        text: "A failed subscription payment now shows in the menu too, next to Text credits: amber with the time your full access runs until, red once the workspace is read-only, and a tap takes you to Pay now.",
        where: "Menu",
      },
      {
        kind: "improved",
        text: "The cards at the foot of the menu — setup progress, payment warnings, Text credits and What's new — fold down to a row of small icons with the Alerts & updates toggle, so the menu stays short. Each icon still opens the same page, and the choice is remembered on this device.",
        where: "Menu",
      },
    ],
  },
  {
    date: "2026-10-17",
    title: "Reminders in the menu, set up in one tap",
    items: [
      {
        kind: "new",
        text: "Follow-ups is now Reminders, and it is where you set them up as well as see who is due. Press Add reminder, pick the service, how often it is due again — every 2 months, every 2 years, or your own number of months — how many days ahead to remind, and what to call it. Every reminder you have is listed at the top of the page; tap one to change or remove it. The same reminders still show on each service under Services, and on a phone the Reminders page is the quick way in.",
        where: "Reminders → Add reminder",
      },
      {
        kind: "new",
        text: "Remind one client, without waiting for a finished job. On Reminders, press Remind a client: pick who, which service, when it was last done (today if you leave it blank), how long until it is due again and how far ahead to remind, and you see the due date and reminder day before you save. Handy for work done before you used RECAVO, or a client you simply want to chase in two months. It then behaves like any other reminder — they and you are told, it shows under Who is due marked “set by you”, and booking the service again closes it. A client's page has the same button under Reminders.",
        where: "Reminders → Remind a client",
      },
      {
        kind: "improved",
        text: "A client's account overview no longer opens with a big “Package request sent” box. The Credits card now tells the whole story in one place: sessions left with “+10 on the way” underneath while a package waits on you; a quiet “0 — your 10 session block is on its way” with Book and pay for a session when they have nothing usable yet; and, if they have no credits at all, a short invitation to see your packages — shown only when you actually sell some.",
        where: "Client account → Overview",
      },
      {
        kind: "improved",
        text: "Service cards on a one-person business no longer carry an “Offered: whenever you're available” line — it said nothing you didn't know. The line still appears when a service is limited to certain days or times.",
        where: "Services",
      },
      {
        kind: "improved",
        text: "Offer links now open in the new booking page design, the same as everything else your clients see. A private link (one that doesn't show your full catalogue) opens on a page that leads with the offer — its sessions and packages at the offer's price, with your about, team, reviews and location underneath — and nothing from the catalogue. Buying a package, from an offer or from your Packages list, is now three short steps in the same style: details, review and pay (or a request you confirm, if you don't take cards online), and a done screen with the way into their account.",
        where: "Offer links → the link you share",
      },
      {
        kind: "improved",
        text: "On a desktop, the Offers section on your booking page now works like Sessions: each offer session or package has a round selector rather than a link, and choosing one fills the calendar and price on the right — pick a session from the catalogue and the offer unselects. Nothing changes on a phone, where a tap still opens the offer.",
        where: "book.recavo.app/your-link?offer=…",
      },
      {
        kind: "improved",
        text: 'In a booking\'s History tab, the "Invoice · Email" row now opens the invoice it sent — tap anywhere on the row to see it, download the PDF or send it again. Nothing extra is stored to make this work: the invoice is already kept and its PDF is produced on demand.',
        where: "Booking → History",
      },
      {
        kind: "fixed",
        text: "Discounted prices on the booking page now always show both pence digits — 10% off £45 reads £40.50, not £40.5.",
        where: "Booking page",
      },
    ],
  },
  {
    date: "2026-10-16",
    title: "A new booking page for your clients, and you decide how it looks",
    items: [
      {
        kind: "new",
        text: "Your public booking page has been rebuilt from the ground up. Clients land on your name, photo and sessions, see the next free time straight away, pick a day and time (Morning, Afternoon, Evening) and a trainer if you have more than one, and book in three short steps. On a phone the whole thing fits in one hand; on a desktop the calendar and times sit beside your page. Share the same link as before — nothing to change.",
        where: "book.recavo.app/your-link",
      },
      {
        kind: "new",
        text: "Booking page is a new area where you choose how that page looks and reads. Pick a theme (Studio, Night or Editorial) and an accent colour, upload a header photo or pick a gradient, write a short intro, and turn sections on or off: about, team, reviews, location. A phone and desktop preview updates as you type, and nothing goes live until you press Publish changes — Discard throws a draft away.",
        where: "Business → Booking page → Design, Content, Sections",
      },
      {
        kind: "new",
        text: "Clients now see their offers on your booking page. Anyone who arrives by an offer link, or signs in and has been given one, gets an Offers section with each offer's sessions and packages at the offer's price, ready to book. It sits just above Sessions to start with; move it wherever you like, or turn it off, under Sections. Nobody else sees it.",
        where: "Booking page → Sections",
      },
      {
        kind: "new",
        text: "Offer links can now open extra times. When you create a link with sessions in it, add times you don't normally offer for each one — every Sunday 10:00 to 14:00, say, or one particular Saturday evening — and only clients who book through that link will see them. Anything already in your diary stays unavailable, and you can change the extra times on a link you have already sent.",
        where: "Offer links → New offer link → Extra times",
      },
      {
        kind: "new",
        text: "Shorten your booking link to something you can say out loud. Old links keep working: anyone using the previous address is taken to the new one.",
        where: "Business → Booking page → Link and sharing",
      },
      {
        kind: "new",
        text: "Connect your Google listing to show your star rating and latest reviews on the booking page. It searches by your business name, you pick the right listing, and the reviews refresh themselves about once a day.",
        where: "Business → Booking page → Content → Google reviews",
      },
      {
        kind: "improved",
        text: "Invoices from a business that hasn't uploaded a logo now carry the RECAVO mark in the header rather than the business name set large. Your own name, address and contact details are still printed in full under From, and as soon as you upload a logo it takes the mark's place on every invoice, including ones you had already started.",
        where: "Invoices → Preview / PDF",
      },
      {
        kind: "improved",
        text: "Automotive businesses no longer see an Occupancy rate card. It measured seats booked against capacity, which only means something for classes — a job is always one car in one slot, so the figure could only ever read 0% or 100%. The Overview and Reports now show Average job value in its place, and Reports drops the seats-vs-capacity chart and talks about jobs, completion rate and job outcomes.",
        where: "Overview and Reports (automotive)",
      },
      {
        kind: "new",
        text: "Invoice lines can carry detail under the heading. Press Enter in a line's description to add up to five more lines — “Paint correction”, then “Bonnet and both front wings” and “Two-stage machine polish” beneath it. The heading prints as before and the detail sits under it in smaller grey type, on the PDF and on the invoice page.",
        where: "Invoices → draft → Lines → Description",
      },
      {
        kind: "improved",
        text: 'Review and pay shows only the ways to pay you have switched on, as a short list to pick from — pay now by card, pay on the day, bank transfer, or a session credit when the client has one. The tick box spells out your cancellation deadline as a real date and time ("Free to cancel until Sun 18 Oct, 15:00") rather than "24 hours before".',
        where: "Booking page → Review and pay",
      },
      {
        kind: "improved",
        text: "The confirmation gives clients everything for the day: add to calendar, directions, what's still to pay and how, and one suggested extra. Managing the booking is one tap into their account.",
        where: "Booking page → You're booked",
      },
      {
        kind: "improved",
        text: "Clients' accounts have a new overview: the next session up front with Pay, Add to calendar, Directions, Move and Cancel; session credits with how many are left and when they run out; everything coming up; and anything they're on the waitlist for. Cancelling or moving tells them exactly what happens to their money before they confirm.",
        where: "Client account → Overview",
      },
      {
        kind: "improved",
        text: "Client sign-in is simpler: one email, one code, no password. Someone arriving from your page gets a Back to {your business} link, and on a phone an Open email app button. The business login lives on its own page so clients and staff don't end up in each other's doors.",
        where: "book.recavo.app → Sign in",
      },
      {
        kind: "improved",
        text: "When a time is taken while someone is choosing it, when their ten-minute hold runs out, or when a day is fully booked, the page says so plainly and offers the nearest times or the waitlist. Times that pass while the page is open simply drop off the list.",
        where: "Booking page → Date and time",
      },
      {
        kind: "improved",
        text: "Take payment online is clearer about what happens before you connect Stripe or add bank details: your page keeps taking bookings as pay on the day rather than turning clients away.",
        where: "Payments → Take payment online",
      },
      {
        kind: "fixed",
        text: "Pay by bank transfer is back where you look for it. The bank details form — account name, sort code, account number and the on/off switch — now sits on the Payments page under your payout account, as well as in Settings → Payments where it was easy to miss at the end of the tab row. Nothing about bank transfer itself changed: clients still choose Bank transfer at Review and pay when it is on, see your details and their reference on the confirmation, and the booking waits as awaiting payment until you mark the money received.",
        where: "Payments → Pay by bank transfer",
      },
      {
        kind: "improved",
        text: "You can clear notifications from the bell: an × on each one, or Clear all at the bottom. Cleared ones stay cleared on every device you sign in on.",
        where: "Top bar → Bell",
      },
      {
        kind: "improved",
        text: "On a desktop or tablet you can tuck the side menu away to give the calendar the full width. Press the hide button at the top of the menu; it slides off and a small handle sits in the bottom-left corner to bring it back. RECAVO remembers your choice on that device.",
        where: "Side menu → Hide menu",
      },
      {
        kind: "fixed",
        text: "On an iPhone, tapping the price box when adding a booking with more than one service zoomed the whole page in and it would not zoom back out. The box (and a couple of other small fields) now use the size Safari leaves alone.",
        where: "Add session → services → price",
      },
      {
        kind: "fixed",
        text: "The × on a pop-up message did nothing while a form was open — worse, on some phones the tap went through and closed the form behind it. Messages can now be closed with the × or swiped away (up or to the right) at any time, and the form stays put.",
        where: "Pop-up messages",
      },
      {
        kind: "improved",
        text: "Invoice previews can be enlarged. Tap the page (or Enlarge) to open it full screen, zoom in to 300% with the text staying sharp, and on a computer open the PDF in a new tab in the browser's own viewer.",
        where: "Invoices → open an invoice → Preview",
      },
      {
        kind: "fixed",
        text: "Typing into the middle of the Vehicle field on an invoice sent the cursor to the far right after the first character. It now stays where you put it.",
        where: "Invoices → draft → Vehicle",
      },
      {
        kind: "fixed",
        text: "The client's saved vehicles offered under the Vehicle field now carry the registration, make and model (“EO76 ZWZ · Audi · RS5”) rather than just the short display name, so what you tap is exactly what the invoice prints. The vehicle filled in from a booking already worked this way; if a draft was made before the registration was added to the car, retype it or pick the chip.",
        where: "Invoices → draft → Vehicle",
      },
      {
        kind: "fixed",
        text: "Preview and Download on a draft invoice now include what you have just typed. They save your edits first (the buttons read “Save & preview” / “Save & download PDF” while there is something unsaved), so the PDF always matches the form. Issuing does the same, so an edit you forgot to save is never left off the final invoice. If a line can't be saved, you're told and taken to it.",
        where: "Invoices → draft → Preview / Download PDF / Issue",
      },
      {
        kind: "fixed",
        text: "Upload your logo and it now appears on invoices you had already started, not just new ones. A draft takes its business details from your current settings when you preview or download it, and an invoice issued before you had a logo prints the one you have now. Logo uploads themselves also work again.",
        where: "Settings → Configuration → Logo, then Invoices → Preview",
      },
      {
        kind: "new",
        text: "A booking with notes on it now says so at the top of its drawer — “Note from the client”, “Internal note” or “Notes on this booking” — next to the status pills; tap it to jump straight to them. What the client typed when booking is shown in its own box on Details, where before only your internal notes were.",
        where: "Calendar → open a booking",
      },
      {
        kind: "new",
        text: "A service can now carry more than one follow-up reminder. Set a maintenance valet after a year and a ceramic top-up after two on the same coating, each with its own notice period and name; every finished job schedules all of them, and when the client books the service again the old reminders close and the clocks start over. Up to five per service, and the card lists them soonest first.",
        where: "Services → edit a service → Follow-up reminders → Add another reminder",
      },
      {
        kind: "improved",
        text: "Recording the last of the money on a job that has already started marks it done in the same step, so it shows up under Job outcomes and the invoice is raised without a second visit to the booking.",
        where: "Bookings → Record payment",
      },
      {
        kind: "improved",
        text: "When the money already received on an invoice is the booking's deposit, the totals now say “Deposit taken” rather than “Paid”, on the PDF and on the invoice page. Once more than the deposit has come in, or the invoice is settled, it reads “Paid” as before.",
        where: "Invoices → PDF",
      },
      {
        kind: "improved",
        text: "Every page you click into — an invoice, a client, a support request, a guide — has a Back that returns you to exactly where you were, including in the desktop and phone apps where there is no browser button.",
        where: "Everywhere",
      },
      {
        kind: "fixed",
        text: "A client giving up an unpaid booking inside your notice window got an error instead of a cancellation. It now cancels cleanly, and only confirmed bookings count as late cancellations.",
        where: "Client account → Cancel",
      },
      {
        kind: "fixed",
        text: "A client who bought a package by bank transfer, or one you sold them in person, saw an empty Purchases page because only card payments were listed. Every package they have bought now appears there with its name, credits and date; card purchases keep their receipt.",
        where: "Client account → Purchases",
      },
      {
        kind: "fixed",
        text: "A booking you had marked paid by bank transfer or cash said “Paid in full” and then “No payments yet” underneath, because only card payments were listed. Money you record by hand now appears there with how it arrived (cash, bank transfer, your card machine) and when, alongside any card payments.",
        where: "Booking → Payments",
      },
    ],
  },
  {
    date: "2026-10-14",
    title: "Several vehicles on one invoice, previews that work on a phone, reminders a year out",
    items: [
      {
        kind: "new",
        text: "Did two cars in one visit? Put them both on the same invoice. The Vehicle field on a draft is now a list: add another vehicle with a tap — the client's saved vehicles are offered so you don't retype a registration — or remove one. Each is printed on its own line on the PDF, and the email names them all. Registrations you type are put in capitals for you.",
        where: "Invoices → open a draft → Vehicle",
      },
      {
        kind: "improved",
        text: "On a booking's Payments tab, the whole invoice row now opens the invoice — you no longer have to hit the number itself. And the Back link at the top of an invoice takes you back to where you came from (the booking, the client's profile, the list), instead of always dropping you on All invoices.",
        where: "Booking → Payments → Invoices",
      },
      {
        kind: "fixed",
        text: "In the app, Download PDF on an invoice did nothing — the phone had nowhere to put the file. It is now Share PDF: the normal share sheet opens so you can save it to Files, AirDrop it, or send it straight to the client on WhatsApp or by email. In a web browser it downloads as before.",
        where: "Invoices → open an invoice → Share PDF",
      },
      {
        kind: "fixed",
        text: "Previewing an invoice on a phone showed a blank white page. The preview is now drawn page by page inside the app, so it looks the same on iPhone, Android and desktop — for you on the invoice page and for clients in their account.",
        where: "Invoices → open an invoice → Preview",
      },
      {
        kind: "new",
        text: "Booking reminders can now be set in years as well as minutes, hours and days — up to 2 years before. Handy for annual work booked a long way ahead: a reminder a year before an MOT or yearly detail. A reminder whose time has already passed when the job is booked is simply skipped.",
        where: "Settings → Notifications → Booking reminders",
      },
      {
        kind: "fixed",
        text: "On a phone, the description box on an invoice line was squeezed to a few characters by the quantity and price beside it. Each line now has its own card: the description runs the full width and grows as you type, with quantity, unit price and VAT underneath.",
        where: "Invoices → open a draft → Lines",
      },
      {
        kind: "improved",
        text: "Switch on a follow-up reminder for a service — a ceramic coating due again in 2 years, say — and it now also covers jobs you'd already marked attended, not just ones from today onwards. A renewal that has recently fallen due is chased straight away; anything more than six months past is left alone.",
        where: "Services → edit a service → Follow-up reminder",
      },
    ],
  },
  {
    date: "2026-10-12",
    title: "Money off through an offer link",
    items: [
      {
        kind: "new",
        text: "An offer link can now carry a discount — a percentage or a fixed amount off — on every session and package it names. Anyone booking through the link sees the full price struck through next to what they'll actually pay, and the saving is taken off the booking or the package checkout for you. Hand the link to a few clients, or to everyone; prices away from the link don't change.",
        where: "Offer links → New link → Discount",
      },
    ],
  },
  {
    date: "2026-10-10",
    title: "A quicker Add booking",
    items: [
      {
        kind: "improved",
        text: "Payment is now a short list to pick from — pay after the job, pay up front, package credit or bank transfer — with the deposit split shown in one line underneath, instead of paragraphs explaining each one.",
        where: "Add booking → Payment method",
      },
      {
        kind: "improved",
        text: "Tick a service that comes in options (small car, large car…) and the options appear right under it in the list, so you can pick one before closing. The option is still on the booking form too if you'd rather change it there.",
        where: "Add booking → Services",
      },
      {
        kind: "improved",
        text: "Tap a day on the calendar that's already held all day and the booking goes straight in as a drop-in: the free times show without asking whether you meant to squeeze one in.",
        where: "Calendar → tap a full day → Booking",
      },
    ],
  },
  {
    date: "2026-10-08",
    title: "Package requests you can't miss, and credits clients can see",
    items: [
      {
        kind: "new",
        text: "A package a client has asked for but nobody has confirmed now sits at the top of Overview and Calendar until you deal with it — who asked, for what, how long ago — with a button straight to that request. No more finding out a fortnight later.",
        where: "Overview and Calendar",
      },
      {
        kind: "fixed",
        text: "Tapping an alert in the bell used to do nothing. It now takes you to the thing it's about: a package request opens that request, a new booking opens the booking, a text-credit warning opens Text credits.",
        where: "Bell menu",
      },
      {
        kind: "improved",
        text: "Clients booking with a package can now see how many credits they have left — under “Book with 1 credit”, in the confirmation, and beside the calendar — so they know when they're running low before the last one goes.",
        where: "Client account → Calendar",
      },
    ],
  },
  {
    date: "2026-10-05",
    title: "A quicker Edit booking, and messages that name every service",
    items: [
      {
        kind: "improved",
        text: "Edit booking now fits on one phone screen: the date, the services, the price and a tick to send the client the new details. Client, vehicle, lift, staff, discount, payment method, deposit and notes are tucked under “More options” — it opens itself when something in there needs a look before you can save, and tells you how many changes are hiding in it.",
        where: "Bookings → open a booking → Edit booking",
      },
      {
        kind: "fixed",
        text: "A job with several services only ever told the client about the first one. Confirmations, reminders and the updated-details message now list every service on the booking, so the message matches what's been charged.",
        where: "Client emails and texts",
      },
      {
        kind: "improved",
        text: "The confirmation message leads with a single line — “Hi Sam, your booking with Shine Valeting on Sat 10 Oct, 8:00pm is all set — £700 in total” — with the details link at the bottom. The text version no longer itemises the job, so it reads like a note from you rather than a receipt.",
        where: "Client emails and texts",
      },
    ],
  },
  {
    date: "2026-10-02",
    title: "Subscribe on Android, and events beside all-day jobs",
    items: [
      {
        kind: "new",
        text: "The Android app now takes subscriptions through Google Play, the same way the iPhone app does through the App Store. A subscription is managed in the store that billed it, and Billing says which one that is.",
        where: "Android app → Billing",
      },
      {
        kind: "fixed",
        text: "You can now put an event — a break, an errand, a half-day — on a day that already holds an all-day job. A holiday that would swallow the whole day the job holds is still refused, as is anything that overlaps timed work.",
        where: "Calendar → Add event",
      },
    ],
  },
  {
    date: "2026-10-01",
    title: "Easier on the phone",
    items: [
      {
        kind: "improved",
        text: "Forms on phones now look and feel like the ones built into your phone: a big bold title, a grey close disc, finger-height inputs, switches and checkboxes, and full-width buttons along the bottom. Nothing changes on a laptop.",
        where: "Every form and dialog on a phone",
      },
      {
        kind: "improved",
        text: "Menu, search, bell, Create and every close button are bigger on phones, and the rows in the menu drawer are finger-height.",
        where: "Phone navigation",
      },
      {
        kind: "fixed",
        text: "Record a payment could lock up on iPhone — the drawer painted in one place and listened in another, so nothing responded. The payment method is now a row of buttons rather than a dropdown and the page puts itself right once the keyboard closes.",
        where: "Bookings → open a booking → Record a payment",
      },
      {
        kind: "fixed",
        text: "Each service in the picker is a full-width, finger-sized row that stays put under your thumb, so taps near the edge or on the second line don't miss.",
        where: "Add booking and Edit booking → Services",
      },
      {
        kind: "fixed",
        text: "Add booking opens on the payment method you used last — including bank transfer — instead of always falling back to “Request payment up front”.",
        where: "Create → Add booking",
      },
      {
        kind: "fixed",
        text: "A dialog that was closing could occasionally leave the page dimmed and unresponsive on iPhone. The app now notices and frees the page itself.",
      },
    ],
  },
  {
    date: "2026-09-30",
    title: "On your own? Set your hours where you set up what clients book",
    items: [
      {
        kind: "new",
        text: "If you're the only person in the business, your availability now lives in the session or service form. Open any one (or create one) and set the hours clients can book you — one set of hours for everything you offer. Start from “Use business hours” to copy your location's opening times. Until hours are set nothing can be booked, so if your booking page has been showing no times, this is the fix.",
        where: "Sessions or Services → Edit → Your availability",
      },
      {
        kind: "improved",
        text: "The second weekly grid, “When this session is offered”, is out of the way for one-person businesses. It's behind a switch — “Only offer this at certain times” — for the odd session or service that really is narrower, like a Saturday-only class. Off, it's offered whenever you're available, and its card says so.",
        where: "Sessions or Services",
      },
      {
        kind: "new",
        text: "Attach screenshots to a support request or a reply — up to five images at a time. They show in the thread once they've been checked, and we can send images back to you the same way.",
        where: "Help & support",
      },
      {
        kind: "fixed",
        text: "When we reply to your support request you now get an email about it, not just a line in the thread.",
        where: "Help & support",
      },
      {
        kind: "new",
        text: "New businesses get a short series of plain emails from Rich over the first month — a welcome, a nudge towards whatever's left to set up, how to get paid and share your booking link. Every one has a “Turn off tips emails” link at the bottom.",
        where: "Your inbox",
      },
      {
        kind: "fixed",
        text: "The Messages badge in the menu was counting unread bell notifications, so it pointed at an empty inbox. The count now sits on the bell where it belongs.",
        where: "Menu",
      },
    ],
  },
  {
    date: "2026-09-29",
    title: "Step-by-step guides, shorten a moved job, and a Help button",
    items: [
      {
        kind: "new",
        text: "Guides: a set of step-by-step walkthroughs with screenshots for everything from opening hours to taking card payments, written for your kind of business — trainers see sessions and clients, detailers see jobs and vehicles — and with pictures that match whether you're on your phone or a computer. Search them from the Guides page or from the search bar.",
        where: "? button beside search → Guides",
      },
      {
        kind: "new",
        text: "Support and Guides sit together under a ? button beside the search bar. The button shows a dot when we've replied to you and you haven't seen it yet. You can also reach both from search.",
        where: "? button beside search → Support",
      },
      {
        kind: "new",
        text: "When you move an all-day job you can now change its last day at the same time. A job booked as two days that only needs one can be moved and shortened in one go — or given an extra day. Leave the last day alone and the job keeps its length as before.",
        where: "Open a booking → Reschedule → Move the day",
      },
      {
        kind: "improved",
        text: "Automotive businesses now start every new booking on “Pay after the job” instead of asking for payment up front. Pick the other option once and it's remembered for next time, exactly as before.",
        where: "Add booking → Payment",
      },
      {
        kind: "new",
        text: "A switch for RECAVO's tips emails under Settings → Account, alongside the unsubscribe link every one of those emails carries.",
        where: "Settings → Account",
      },
    ],
  },
  {
    date: "2026-09-28",
    title: "Every payment counted, and exports your accountant can use",
    items: [
      {
        kind: "fixed",
        text: "Revenue now counts every way you get paid. Cash, bank transfers and payments on your own card machine were missing from the figure, which only ever added up online card payments — so if you take money offline your totals will go up, including for months that have already been and gone.",
        where: "Overview and Reports",
      },
      {
        kind: "new",
        text: "See how you were paid: your takings split by cash, bank transfer, online card and your own card machine, with each one's share of the total. Online card and your own machine are kept apart, so you can check a Stripe payout against the right line.",
        where: "Reports → How you were paid",
      },
      {
        kind: "new",
        text: "Export your payments as a spreadsheet — every payment and refund with how it arrived, who paid, which job it was for and when, with refunds as negative amounts so the column adds up to what you actually took.",
        where: "Reports → Export payments",
      },
      {
        kind: "improved",
        text: "Exports now cover the dates you've picked rather than everything you've ever had, and carry far more than they did. Bookings come with the client and their contact details, the service, who did it, where, what's been paid and what's still owed — as pounds and pence rather than raw numbers.",
        where: "Reports → Export bookings or Export customers",
      },
      {
        kind: "fixed",
        text: "“This month” started on the last day of the previous month through the summer, so your figures quietly included a day that wasn't in the month. A month now begins on the 1st in your own time zone.",
        where: "Overview and Reports",
      },
      {
        kind: "new",
        text: "Change a service's price on a booking that already exists — the same per-service price boxes Add booking has. Charging £150 for a coating that lists at £200 is now a price, not a discount line.",
        where: "Bookings → open a booking → Edit booking",
      },
      {
        kind: "new",
        text: "An “Add another service” bar sits under the services you've picked, so adding a second one is obvious rather than a guess at tapping the summary above.",
        where: "Add booking and Edit booking",
      },
      {
        kind: "improved",
        text: "Today's date is shown beside the date fields, in your business's time zone, so you've a reference point when the phone's picker opens on some other month.",
        where: "Add booking, Reschedule and Edit booking",
      },
      {
        kind: "fixed",
        text: "Adding services that no longer fit an all-day job used to fail with “The request was invalid”. The form now says how many days the job needs and offers to give it them.",
        where: "Edit booking",
      },
      {
        kind: "fixed",
        text: "When something's refused, the message names the field and the reason instead of just “The request was invalid”.",
      },
      {
        kind: "fixed",
        text: "If Stripe rejects your payout account you now see why, with a red Rejected badge, instead of “pending” forever and a Finish onboarding button that couldn't help.",
        where: "Payments · Settings → Payments",
      },
      {
        kind: "fixed",
        text: "Chart hovers are readable in dark mode — no more light-grey text on a white box.",
        where: "Overview and Reports",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "A full week offline, and an Overview in your own words",
    items: [
      {
        kind: "improved",
        text: "Offline mode now covers the whole week ahead, not just today and tomorrow. Open the app with signal once and every job for the next seven days \u2014 with its client, vehicle, payments and history \u2014 is saved to your phone for when you\u2019re out of range.",
        where: "Everywhere \u2014 works automatically in the background",
      },
      {
        kind: "improved",
        text: "The Overview now talks your trade: automotive businesses see jobs, completed work and how full the diary is, rather than sessions, attendance and seats.",
        where: "Overview",
      },
      {
        kind: "new",
        text: "Hide any card you never look at with the eye icon in its corner, and bring it back from the eye menu next to the date range. Your choice is remembered on this device.",
        where: "Overview",
      },
      {
        kind: "fixed",
        text: "The text-credits alert now says “run out” at zero instead of “running low”, and is cleared automatically the moment you buy more.",
        where: "Notifications",
      },
      {
        kind: "new",
        text: "An Events page lists every holiday, break and appointment you've blocked out, with search and filters, and “Add event” is in the Create menu.",
        where: "Events · Create → Add event",
      },
      {
        kind: "new",
        text: "Set or change a booking's deposit after the fact. If a client has already paid one by the time the job is written up, it now has somewhere to go.",
        where: "Bookings → open a booking → Edit booking → Deposit",
      },
      {
        kind: "fixed",
        text: "A client's lifetime spend now counts cash, bank transfers and deposits you've recorded, not just card payments — so a regular who always pays cash no longer shows £0.00.",
        where: "Clients → open a client",
      },
      {
        kind: "fixed",
        text: "Forgot your password? The reset link takes you to a page to choose a new one, then signs you in fresh.",
        where: "Sign in → Forgot password",
      },
    ],
  },
  {
    date: "2026-09-26",
    title: "Works offline, change how a booking is paid, find a client's jobs faster",
    items: [
      {
        kind: "new",
        text: "No signal? The app still opens. Every page you've visited, plus today's and tomorrow's jobs with their clients, vehicles and payments, are kept on your phone and shown from the saved copy.",
        where: "Everywhere — look for the “Offline — showing saved data” pill",
      },
      {
        kind: "new",
        text: "Mark a job done or a no-show, record cash, and confirm a bank transfer without signal. They're saved on the device and sent the moment you're back online; the booking shows “Waiting for signal” until then.",
        where: "Bookings → open a job",
      },
      {
        kind: "improved",
        text: "When a new version ships you get a “Reload” prompt instead of a half-updated app.",
      },
      {
        kind: "new",
        text: "Picked bank transfer by mistake, or the client will pay on the day? Open the booking and change how it's paid — it confirms straight away and the client gets a fresh confirmation instead of the “transfer to confirm” text.",
        where: "Bookings → open a booking → Change how it's paid",
      },
      {
        kind: "improved",
        text: "Search a client's name and their jobs appear right under it — upcoming first, any date.",
        where: "Search (⌘K)",
      },
      { kind: "new", text: "This What's new page, so you can see what has shipped." },
    ],
  },
  {
    date: "2026-09-25",
    title: "Support threads, package requests and unlimited texts",
    items: [
      {
        kind: "new",
        text: "Support page: ask the RECAVO team anything and carry on the conversation in one thread. Replies also land in your inbox.",
        where: "Your name (bottom left) → Contact support",
      },
      {
        kind: "new",
        text: "Clients can request a package even when you don't take card payments; you confirm it once they've paid you.",
        where: "Account page (clients) · Packages (you)",
      },
      {
        kind: "new",
        text: "Unlimited texts bolt-on (£10/month). Once RECAVO offers it to you it appears on Billing to add yourself.",
        where: "Billing",
      },
      {
        kind: "new",
        text: "Search everywhere: press ⌘K / Ctrl K or tap the magnifier to find clients, vehicles, packages, bookings and pages.",
      },
      {
        kind: "new",
        text: "Referrals page with your partner code and stats, plus a banner on Billing when a discount is applied.",
        where: "Referrals · Billing",
      },
      {
        kind: "fixed",
        text: "Calendar events are saved and shown in your business's timezone, not the phone's.",
      },
      {
        kind: "fixed",
        text: "Emailed sign-in links bring you back to the page you asked for.",
      },
    ],
  },
  {
    date: "2026-09-24",
    title: "Clients can manage their own bookings",
    items: [
      {
        kind: "new",
        text: "Clients can move or cancel a booking from their account page on the web, within the rules you've set.",
        where: "Client account page",
      },
      {
        kind: "new",
        text: "Contact support from inside the app.",
      },
    ],
  },
  {
    date: "2026-09-22",
    title: "Offer links and Safari fixes",
    items: [
      {
        kind: "new",
        text: "Preview an offer link's booking page before you share it, and choose whether the link hides the way out to your full booking page.",
        where: "Offer links",
      },
      { kind: "fixed", text: "Editing opening hours no longer crashes Safari." },
      {
        kind: "fixed",
        text: "Dates typed by staff are read in the business's timezone, not the device's.",
      },
    ],
  },
  {
    date: "2026-09-20",
    title: "Price each service on a booking",
    items: [
      {
        kind: "new",
        text: "When adding a booking, edit each service's price before it goes through. A changed price is the price — not a discount.",
        where: "Create → Add booking",
      },
      { kind: "fixed", text: "The calendar's booked total stays visible on phones." },
    ],
  },
  {
    date: "2026-09-19",
    title: "Drop-ins, calendar settings and a tidier menu",
    items: [
      {
        kind: "new",
        text: "Untimed drop-ins: squeeze a job onto a held day without picking a time.",
        where: "Calendar",
      },
      {
        kind: "new",
        text: "Calendar settings: scroll toggle, event colours and UK bank holidays.",
        where: "Settings → Calendar",
      },
      {
        kind: "new",
        text: "Hide menu items you don't use. On Solo, Staff becomes your own availability.",
        where: "Settings",
      },
      { kind: "fixed", text: "Phone layouts respect left/right safe areas (notch, landscape)." },
    ],
  },
];
