/**
 * Request body for `POST /api/v1/businesses`. Shared by first-run onboarding
 * ({@link CreateFirstBusiness}) and the "Add a business" dialog so both send
 * the same shape: names trimmed, optional fields omitted rather than sent blank.
 */
export type CreateBusinessInput = {
  legalName: string;
  tradingName?: string;
  industryTemplateKey: string;
  referralCode?: string;
};

export type CreateBusinessPayload = {
  legalName: string;
  tradingName?: string;
  industryTemplateKey: string;
  referralCode?: string;
};

export function buildCreateBusinessPayload(input: CreateBusinessInput): CreateBusinessPayload {
  const tradingName = input.tradingName?.trim();
  const referralCode = input.referralCode?.trim();
  return {
    legalName: input.legalName.trim(),
    ...(tradingName ? { tradingName } : {}),
    industryTemplateKey: input.industryTemplateKey,
    ...(referralCode ? { referralCode } : {}),
  };
}
