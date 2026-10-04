export type ExperienceLocationPrecision =
  | "city"
  | "neighborhood"
  | "venue_area";

export type ExperienceLocationSourceType =
  | "organisation_site"
  | "venue_site"
  | "public_partner_event";

export type ExperienceLocationEvidenceInput = {
  latitude: number;
  longitude: number;
  precision: ExperienceLocationPrecision;
  sourceType: ExperienceLocationSourceType;
  sourceUrl: string;
  consentedAt: Date | string | null;
  consentedByUserId: number | null;
  reviewStatus: "pending" | "verified" | "rejected";
  verifiedAt: Date | string | null;
  verifiedByUserId: number | null;
};

export type PublicVerifiedExperienceLocation = {
  latitude: number;
  longitude: number;
  precision: ExperienceLocationPrecision;
  sourceType: ExperienceLocationSourceType;
  sourceUrl: string;
  verifiedAt: string;
};

export function toPublicVerifiedLocation(
  evidence: ExperienceLocationEvidenceInput | null | undefined,
): PublicVerifiedExperienceLocation | null;