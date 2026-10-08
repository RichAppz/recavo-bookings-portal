import type { Guide } from "../../lib/guides.ts";
import { SETUP_GUIDES } from "./setup.ts";
import { BOOKING_GUIDES } from "./bookings.ts";
import { CLIENT_GUIDES } from "./clients.ts";
import { MONEY_GUIDES } from "./money.ts";
import { MESSAGE_GUIDES } from "./messages.ts";
import { ACCOUNT_GUIDES } from "./account.ts";

/**
 * Every guide, in the order it appears within its category. Add a guide to the
 * category file it belongs to; `src/lib/guides.test.ts` checks slugs are unique
 * and every screenshot it names exists under `public/guides/`.
 */
export const GUIDES: readonly Guide[] = [
  ...SETUP_GUIDES,
  ...BOOKING_GUIDES,
  ...CLIENT_GUIDES,
  ...MONEY_GUIDES,
  ...MESSAGE_GUIDES,
  ...ACCOUNT_GUIDES,
];
