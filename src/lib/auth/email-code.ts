/**
 * How many digits are in the codes Supabase emails (its "OTP Length" auth
 * setting; the project is on 8). Too few boxes and the last digits have nowhere
 * to go; too many and the field never auto-submits. Set `VITE_EMAIL_CODE_LENGTH`
 * when that setting changes so every code field follows in one place.
 */
const configured = Number(import.meta.env.VITE_EMAIL_CODE_LENGTH);

export const EMAIL_CODE_LENGTH =
  Number.isInteger(configured) && configured >= 6 && configured <= 10 ? configured : 8;
