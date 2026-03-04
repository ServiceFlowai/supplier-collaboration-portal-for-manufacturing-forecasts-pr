import { PurchaseRequestLine, SupplierEligibilityResult, SupplierProfile, SourcingPolicy } from '../types/procurement';

const SAFE_DECIMAL_PLACES = 4;

const toFixedNumber = (value: number, fractionDigits = SAFE_DECIMAL_PLACES): number => {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
};

export const getCommittedQuantity = (line: PurchaseRequestLine): number => {
  return line.commitments.reduce((acc, commitment) => {
    if (commitment.status === 'REJECTED') {
      return acc;
    }
    return acc + commitment.committedQuantity;
  }, 0);
};

export const calculateOpenQuantity = (line: PurchaseRequestLine): number => {
  const committed = getCommittedQuantity(line);
  const open = line.quantity - committed;
  return toFixedNumber(open > 0 ? open : 0);
};

const isSupplierInApprovedVendors = (
  supplier: SupplierProfile,
  policy: SourcingPolicy
): boolean => {
  if (!policy.requireApprovedVendor) {
    return true;
  }
  if (!policy.approvedVendorListIds || policy.approvedVendorListIds.length === 0) {
    return false;
  }
  if (!supplier.approvedVendorListIds || supplier.approvedVendorListIds.length === 0) {
    return false;
  }
  return policy.approvedVendorListIds.some((listId) => supplier.approvedVendorListIds?.includes(listId));
};

const isSupplierInAllowedList = (supplier: SupplierProfile, policy: SourcingPolicy): boolean => {
  if (!policy.allowedSuppliers || policy.allowedSuppliers.length === 0) {
    return true;
  }
  return policy.allowedSuppliers.includes(supplier.id);
};

const isSupplierWithinGeography = (supplier: SupplierProfile, policy: SourcingPolicy, plantRegion?: string): boolean => {
  if (!policy.geographicConstraints || policy.geographicConstraints.length === 0) {
    return true;
  }

  const supplierCountries = new Set<string>();
  const supplierRegions = new Set<string>();
  supplier.approvedRegions?.forEach((region) => {
    supplierCountries.add(region.country.toLowerCase());
    if (region.region) {
      supplierRegions.add(region.region.toLowerCase());
    }
  });
  supplier.allowedCountries?.forEach((country) => supplierCountries.add(country.toLowerCase()));
  supplier.allowedRegions?.forEach((region) => supplierRegions.add(region.toLowerCase()));

  return policy.geographicConstraints.some((constraint) => {
    const countryPass = !constraint.countries || constraint.countries.length === 0 || constraint.countries.some((country) => supplierCountries.has(country.toLowerCase()));
    const regionPass = !constraint.regions || constraint.regions.length === 0 || constraint.regions.some((region) => supplierRegions.has(region.toLowerCase()) || (plantRegion && region.toLowerCase() === plantRegion.toLowerCase()));
    return countryPass && regionPass;
  });
};

const evaluateMOQ = (supplier: SupplierProfile, policy: SourcingPolicy, openQuantity: number): boolean => {
  if (policy.minOrderQuantity && openQuantity < policy.minOrderQuantity) {
    return false;
  }
  if (supplier.minimumOrderQuantity && openQuantity < supplier.minimumOrderQuantity) {
    return false;
  }
  return true;
};

const evaluateLeadTime = (supplier: SupplierProfile, policy: SourcingPolicy): boolean => {
  if (!policy.maxLeadTimeDays) {
    return true;
  }
  return supplier.leadTimeDays <= policy.maxLeadTimeDays;
};

const evaluateRank = (
  supplier: SupplierProfile,
  policy: SourcingPolicy,
  line: PurchaseRequestLine
): boolean => {
  if (!policy.maxRankAllowed) {
    return true;
  }
  const ranking = line.supplierRankings.find((r) => r.supplierId === supplier.id);
  if (!ranking) {
    return false;
  }
  return ranking.rank <= policy.maxRankAllowed;
};

const calculateEligibilityScore = (reasons: string[]): number => {
  const denominator = 6; // number of rule factors considered
  const passingCount = denominator - reasons.length;
  return passingCount <= 0 ? 0 : Math.round((passingCount / denominator) * 100);
};

export const evaluateSupplierEligibility = (
  line: PurchaseRequestLine,
  supplier: SupplierProfile,
  policyOverride?: SourcingPolicy
): SupplierEligibilityResult => {
  const policy = policyOverride ?? line.sourcingPolicy;
  const openQuantity = calculateOpenQuantity(line);
  const reasons: string[] = [];

  if (!isSupplierInAllowedList(supplier, policy)) {
    reasons.push('Supplier is not on the sourcing policy approved list.');
  }

  if (!isSupplierInApprovedVendors(supplier, policy)) {
    reasons.push('Supplier is not part of the required approved vendor list.');
  }

  if (!evaluateRank(supplier, policy, line)) {
    reasons.push('Supplier ranking exceeds allowable threshold.');
  }

  if (!evaluateLeadTime(supplier, policy)) {
    reasons.push('Supplier lead time exceeds policy maximum.');
  }

  if (!evaluateMOQ(supplier, policy, openQuantity)) {
    reasons.push('Remaining open quantity does not meet minimum order quantity.');
  }

  if (!isSupplierWithinGeography(supplier, policy, line.plantRegion)) {
    reasons.push('Supplier geography does not align with sourcing constraints.');
  }

  if (supplier.approvedPolicies && !supplier.approvedPolicies.includes(policy.id)) {
    reasons.push('Supplier is not approved for this sourcing policy.');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    policyId: policy.id,
    score: calculateEligibilityScore(reasons),
  };
};
