import type { CustomerAddressInput } from "@/lib/api/hooks";
import type { Customer } from "@/lib/api/types";

/** Form state for the optional postal address (RECA-528). Strings only; blanks are dropped on save. */
export type AddressFormState = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
};

export const EMPTY_ADDRESS: AddressFormState = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postcode: "",
  country: "",
};

export function addressToForm(address: Customer["address"] | null | undefined): AddressFormState {
  return {
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    region: address?.region ?? "",
    postcode: address?.postcode ?? "",
    country: address?.country ?? "",
  };
}

/**
 * Converts form state to the API shape. Returns `null` when every part is blank so the
 * server stores "no address" rather than an object of empty strings.
 */
export function formToAddress(form: AddressFormState): CustomerAddressInput | null {
  const trimmed = Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, v.trim() || null]),
  ) as Record<keyof AddressFormState, string | null>;
  return Object.values(trimmed).some(Boolean) ? trimmed : null;
}
