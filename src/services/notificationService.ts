import {
  CommitmentSlaStatus,
  NotificationChannel,
  NotificationPayload,
  PurchaseCommitment,
  PurchaseRequestLine,
  SupplierProfile,
} from '../types/procurement';

const NOTIFICATION_API_ENDPOINT = '/api/notifications';

const withDefaultMetadata = (
  payload: NotificationPayload,
  defaults: Record<string, unknown>
): NotificationPayload => ({
  ...payload,
  metadata: {
    ...(payload.metadata ?? {}),
    ...defaults,
  },
});

export class NotificationService {
  static async sendNotification(payload: NotificationPayload): Promise<void> {
    const response = await fetch(NOTIFICATION_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to dispatch notification (${response.status}): ${message}`);
    }
  }

  static async sendNotifications(payloads: NotificationPayload[]): Promise<void> {
    await Promise.all(payloads.map((payload) => this.sendNotification(payload)));
  }

  static buildOverdueSubject(line: PurchaseRequestLine): string {
    return `Supplier response overdue - PR ${line.purchaseRequestId} Line ${line.lineNumber}`;
  }

  static buildOverdueBody(
    line: PurchaseRequestLine,
    commitment: PurchaseCommitment,
    slaStatus: CommitmentSlaStatus
  ): string {
    return [
      `Supplier ${commitment.supplierId} has not responded within SLA for PR ${line.purchaseRequestId} line ${line.lineNumber}.`,
      `Material: ${line.materialCode}${line.description ? ` - ${line.description}` : ''}.`,
      `Committed Qty: ${commitment.committedQuantity}.`,
      `SLA Policy: ${slaStatus.policyName}.`,
      `Response was due at ${new Date(slaStatus.dueAt).toLocaleString()}.`,
      slaStatus.isOverdue ? `Currently ${slaStatus.hoursPastDue.toFixed(1)} hours overdue.` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  static buildReminderBody(
    line: PurchaseRequestLine,
    commitment: PurchaseCommitment,
    slaStatus: CommitmentSlaStatus
  ): string {
    return [
      `Reminder: Supplier ${commitment.supplierId} response pending for PR ${line.purchaseRequestId} line ${line.lineNumber}.`,
      `Material: ${line.materialCode}${line.description ? ` - ${line.description}` : ''}.`,
      `Current status: ${commitment.status}.`,
      `SLA deadline: ${new Date(slaStatus.dueAt).toLocaleString()}.`,
      `Time remaining: ${slaStatus.hoursRemaining.toFixed(1)} hours.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  static async notifyBuyerOfOverdue(params: {
    line: PurchaseRequestLine;
    commitment: PurchaseCommitment;
    slaStatus: CommitmentSlaStatus;
    buyerEmail: string;
    channels?: NotificationChannel[];
    additionalRecipients?: string[];
  }): Promise<void> {
    const { line, commitment, slaStatus, buyerEmail, channels = ['IN_APP', 'EMAIL'], additionalRecipients = [] } = params;
    const subject = this.buildOverdueSubject(line);
    const body = this.buildOverdueBody(line, commitment, slaStatus);

    const payloads: NotificationPayload[] = channels.map((channel) =>
      withDefaultMetadata(
        {
          channel,
          recipient: channel === 'EMAIL' ? { email: buyerEmail } : { userId: line.buyer.id },
          subject,
          body,
          linkUrl: `/purchase-requests/${line.purchaseRequestId}/lines/${line.id}`,
        },
        {
          purchaseRequestId: line.purchaseRequestId,
          lineId: line.id,
          commitmentId: commitment.id,
          supplierId: commitment.supplierId,
          slaPolicyId: slaStatus.policyId,
          notificationType: 'SUPPLIER_RESPONSE_OVERDUE',
        }
      )
    );

    additionalRecipients.forEach((email) => {
      payloads.push(
        withDefaultMetadata(
          {
            channel: 'EMAIL',
            recipient: { email },
            subject,
            body,
            linkUrl: `/purchase-requests/${line.purchaseRequestId}/lines/${line.id}`,
          },
          {
            purchaseRequestId: line.purchaseRequestId,
            lineId: line.id,
            commitmentId: commitment.id,
            supplierId: commitment.supplierId,
            slaPolicyId: slaStatus.policyId,
            notificationType: 'SUPPLIER_RESPONSE_OVERDUE_ESCALATION',
          }
        )
      );
    });

    await this.sendNotifications(payloads);
  }

  static async notifyReminder(
    line: PurchaseRequestLine,
    commitment: PurchaseCommitment,
    slaStatus: CommitmentSlaStatus,
    channels: NotificationChannel[],
    escalateToEmails: string[] = []
  ): Promise<void> {
    const subject = `Reminder: Supplier response pending - PR ${line.purchaseRequestId} Line ${line.lineNumber}`;
    const body = this.buildReminderBody(line, commitment, slaStatus);

    const payloads: NotificationPayload[] = channels.map((channel) =>
      withDefaultMetadata(
        {
          channel,
          recipient: channel === 'EMAIL' ? { email: line.buyer.email } : { userId: line.buyer.id },
          subject,
          body,
          linkUrl: `/purchase-requests/${line.purchaseRequestId}/lines/${line.id}`,
        },
        {
          purchaseRequestId: line.purchaseRequestId,
          lineId: line.id,
          commitmentId: commitment.id,
          supplierId: commitment.supplierId,
          slaPolicyId: slaStatus.policyId,
          notificationType: 'SUPPLIER_RESPONSE_REMINDER',
        }
      )
    );

    escalateToEmails.forEach((email) => {
      payloads.push(
        withDefaultMetadata(
          {
            channel: 'EMAIL',
            recipient: { email },
            subject,
            body,
            linkUrl: `/purchase-requests/${line.purchaseRequestId}/lines/${line.id}`,
          },
          {
            purchaseRequestId: line.purchaseRequestId,
            lineId: line.id,
            commitmentId: commitment.id,
            supplierId: commitment.supplierId,
            slaPolicyId: slaStatus.policyId,
            notificationType: 'SUPPLIER_RESPONSE_REMINDER_ESCALATION',
          }
        )
      );
    });

    await this.sendNotifications(payloads);
  }

  static async notifySupplierOfReallocation(
    supplier: SupplierProfile,
    payload: NotificationPayload
  ): Promise<void> {
    if (!supplier.primaryContactEmail && !payload.recipient.email) {
      throw new Error('Supplier notification requires a valid email recipient.');
    }

    const enrichedPayload = withDefaultMetadata(
      {
        ...payload,
        recipient: payload.recipient.email
          ? payload.recipient
          : { email: supplier.primaryContactEmail },
      },
      {
        notificationType: 'REALLOCATION_REQUEST',
      }
    );

    await this.sendNotification(enrichedPayload);
  }
}
