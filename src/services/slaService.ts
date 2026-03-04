import { addHours, differenceInHours, differenceInMinutes, isAfter, isBefore, parseISO, subHours } from 'date-fns';
import {
  CommitmentSlaStatus,
  PurchaseCommitment,
  PurchaseRequestLine,
  SlaConfig,
  SlaPolicy,
  SlaReminderDue,
} from '../types/procurement';

const getDate = (value: string): Date => {
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
};

const resolvePolicyForSupplier = (
  config: SlaConfig,
  supplierId: string,
  supplierRank?: number
): SlaPolicy => {
  const explicitSupplierPolicy = config.policies.find((policy) => policy.supplierIds?.includes(supplierId));
  if (explicitSupplierPolicy) {
    return explicitSupplierPolicy;
  }

  if (typeof supplierRank === 'number') {
    const rankPolicy = config.policies.find((policy) => policy.supplierRanks?.includes(supplierRank));
    if (rankPolicy) {
      return rankPolicy;
    }
  }

  const defaultPolicy = config.policies.find((policy) => policy.id === config.defaultPolicyId);
  if (!defaultPolicy) {
    if (config.policies.length === 0) {
      throw new Error('SLA configuration is missing policies.');
    }
    return config.policies[0];
  }
  return defaultPolicy;
};

const buildReminderSchedule = (policy: SlaPolicy, dueAt: Date, evaluatedAt: Date): SlaReminderDue[] => {
  return policy.reminderRules
    .map<SlaReminderDue>((rule) => {
      const scheduledFor = subHours(dueAt, rule.offsetHours);
      return {
        rule,
        scheduledFor: scheduledFor.toISOString(),
        hasEscalation: Boolean(rule.escalateToEmails?.length || rule.escalateToRoleIds?.length),
      };
    })
    .filter((reminder) => !isBefore(dueAt, evaluatedAt) && !isAfter(reminder.scheduledFor, evaluatedAt.toISOString()))
    .sort((a, b) => getDate(a.scheduledFor).getTime() - getDate(b.scheduledFor).getTime());
};

export class SlaService {
  static getPolicy(config: SlaConfig, line: PurchaseRequestLine, supplierId: string): SlaPolicy {
    const supplierRank = line.supplierRankings.find((ranking) => ranking.supplierId === supplierId)?.rank;
    return resolvePolicyForSupplier(config, supplierId, supplierRank);
  }

  static calculateDueAt(policy: SlaPolicy, referenceIso: string): Date {
    const referenceDate = getDate(referenceIso);
    return addHours(referenceDate, policy.responseHours);
  }

  static evaluateCommitment(
    config: SlaConfig,
    line: PurchaseRequestLine,
    commitment: PurchaseCommitment,
    evaluatedAt: Date = new Date()
  ): CommitmentSlaStatus {
    const policy = this.getPolicy(config, line, commitment.supplierId);
    const referenceIso = commitment.createdAt || line.releasedAt;
    const dueAtDate = this.calculateDueAt(policy, referenceIso);
    const isOverdue = isAfter(evaluatedAt, dueAtDate);

    const hoursRemaining = isOverdue
      ? 0
      : Math.max(
          0,
          differenceInMinutes(dueAtDate, evaluatedAt) / 60
        );
    const hoursPastDue = isOverdue
      ? differenceInHours(evaluatedAt, dueAtDate)
      : 0;

    const remindersDue = buildReminderSchedule(policy, dueAtDate, evaluatedAt);

    return {
      commitmentId: commitment.id,
      lineId: line.id,
      supplierId: commitment.supplierId,
      dueAt: dueAtDate.toISOString(),
      evaluatedAt: evaluatedAt.toISOString(),
      isOverdue,
      hoursRemaining,
      hoursPastDue,
      policyId: policy.id,
      policyName: policy.name,
      remindersDue,
    };
  }
}
