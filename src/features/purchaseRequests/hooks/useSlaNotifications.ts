import { useEffect, useRef } from 'react';
import { SlaService } from '../../../services/slaService';
import { NotificationService } from '../../../services/notificationService';
import {
  CommitmentSlaStatus,
  PurchaseRequestLine,
  SlaConfig,
} from '../../../types/procurement';

interface UseSlaNotificationsParams {
  lines: PurchaseRequestLine[];
  slaConfig: SlaConfig;
}

type ReminderKey = `${string}:${number}:${string}`;

type OverdueKey = `${string}:OVERDUE`;

export const useSlaNotifications = ({ lines, slaConfig }: UseSlaNotificationsParams): void => {
  const reminderDispatchRecord = useRef<Set<ReminderKey>>(new Set());
  const overdueDispatchRecord = useRef<Set<OverdueKey>>(new Set());

  useEffect(() => {
    if (!lines.length) {
      return;
    }

    const now = new Date();

    const handleSlaStatus = async (
      line: PurchaseRequestLine,
      slaStatus: CommitmentSlaStatus
    ): Promise<void> => {
      const commitment = line.commitments.find((item) => item.id === slaStatus.commitmentId);
      if (!commitment) {
        return;
      }

      // Reminder notifications
      for (const reminder of slaStatus.remindersDue) {
        for (const channel of reminder.rule.channels) {
          const reminderKey = `${slaStatus.commitmentId}:${reminder.rule.offsetHours}:${channel}` as ReminderKey;
          if (reminderDispatchRecord.current.has(reminderKey)) {
            continue;
          }
          try {
            await NotificationService.notifyReminder(
              line,
              commitment,
              slaStatus,
              [channel],
              reminder.rule.escalateToEmails ?? []
            );
            reminderDispatchRecord.current.add(reminderKey);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to dispatch SLA reminder', error);
          }
        }
      }

      if (slaStatus.isOverdue) {
        const overdueKey = `${slaStatus.commitmentId}:OVERDUE` as OverdueKey;
        if (overdueDispatchRecord.current.has(overdueKey)) {
          return;
        }
        const lastReminder = slaStatus.remindersDue.at(-1);
        try {
          await NotificationService.notifyBuyerOfOverdue({
            line,
            commitment,
            slaStatus,
            buyerEmail: line.buyer.email,
            additionalRecipients: lastReminder?.rule.escalateToEmails ?? [],
          });
          overdueDispatchRecord.current.add(overdueKey);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to notify buyer of overdue commitment', error);
        }
      }
    };

    lines.forEach((line) => {
      line.commitments.forEach((commitment) => {
        const slaStatus = SlaService.evaluateCommitment(slaConfig, line, commitment, now);
        // If SLA is resolved (supplier responded), skip
        if (commitment.respondedAt && commitment.status !== 'PENDING') {
          return;
        }
        void handleSlaStatus(line, slaStatus);
      });
    });
  }, [lines, slaConfig]);
};
