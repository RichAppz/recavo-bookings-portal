import { ALL_VERTICALS, applyTerminology, copy, type Copy } from "@/lib/guides";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useStoredState } from "@/lib/use-stored-state";
import type { VerticalKey } from "@/lib/verticals";

function isVertical(key: string | undefined): key is VerticalKey {
  return ALL_VERTICALS.includes(key as VerticalKey);
}

/**
 * Which vertical's guides to show. A business decides for itself; someone with no
 * business (or an unknown template) picks, and the choice is remembered.
 */
export function useGuideVertical(): {
  vertical: VerticalKey;
  /** True when there is no business to decide, so the page offers a switch. */
  canSwitch: boolean;
  setVertical: (v: VerticalKey) => void;
} {
  const tenant = useTenant();
  const fromBusiness = tenant.business?.industryTemplateKey;
  const [chosen, setChosen] = useStoredState<VerticalKey>(
    "recavo.guides.vertical",
    "personal_training",
    ALL_VERTICALS,
  );
  if (isVertical(fromBusiness)) {
    return { vertical: fromBusiness, canSwitch: false, setVertical: setChosen };
  }
  return { vertical: chosen, canSwitch: true, setVertical: setChosen };
}

/** Resolve copy for the vertical and fill in the business's own words. */
export function useGuideCopy(vertical: VerticalKey): (value: Copy) => string {
  const tenant = useTenant();
  const terminology = tenant.terminology;
  return (value) => applyTerminology(copy(value, vertical), terminology);
}
