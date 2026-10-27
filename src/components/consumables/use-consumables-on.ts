import { hiddenNavFrom } from "@/lib/nav-features";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Consumables show for car detailing businesses that haven't switched the menu item
 * off. Off hides the page link, the service section, the job card and the form hint;
 * the data is kept.
 */
export function useConsumablesOn(): boolean {
  const tenant = useTenant();
  if (tenant.business?.industryTemplateKey !== "car_detailing") return false;
  return !hiddenNavFrom(tenant.configuration).has("consumables");
}
