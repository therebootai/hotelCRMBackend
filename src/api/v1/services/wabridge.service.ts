import env from "@/config/env";
import { format } from "date-fns";

class WABridgeService {
  private readonly appKey = env.WA_APP_KEY;
  private readonly authKey = env.WA_AUTH_KEY;
  private readonly deviceId = env.WA_DEVICE_ID;
  private readonly apiUrl = env.WA_API_URL;
  private readonly templateCancel = env.WA_TEMPLATE_CANCEL;
  private readonly templateCheckoutReminder = env.WA_TEMPLATE_CHECKOUT_REMINDER;
  private readonly templateCheckin = env.WA_TEMPLATE_CHECKIN;
  private readonly templateBookingConfirmation = env.WA_TEMPLATE_BOOKING_CONFIRMATION;

  /**
   * Formats phone number for WhatsApp API (Removes +, spaces, and ensures country code)
   */
  private formatPhoneNumber(phone: string): string {
    let cleanPhone = phone.replace(/[^0-9]/g, '');

    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    return cleanPhone;
  }

  /**
   * Sends a generic template message using the WABridge Template API
   */
  private async sendTemplate(phone: string, templateId: string, variables: string[]): Promise<void> {
    if (!this.appKey || !this.authKey || !this.apiUrl || !templateId) {
      console.warn(`[WABridge] Missing configuration for template ${templateId}. Message not sent.`);
      return;
    }

    const formattedPhone = this.formatPhoneNumber(phone);

    const payload = {
      'auth-key': this.authKey,
      'app-key': this.appKey,
      destination_number: formattedPhone,
      template_id: templateId,
      device_id: this.deviceId,
      language: 'en',
      variables,
    };

    const isDev = env.ENV === "development";
    try {
      if (!isDev) {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          console.error("[WABridge] API Error Response:", response.status, errorData);
          throw new Error(`WABridge API Error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
      } else {
        console.log(`[WABridge] Dev Mode: Template ${templateId} sent to ${formattedPhone} with vars:`, variables);
      }
    } catch (error) {
      console.error(`[WABridge] Failed to send WhatsApp template:`, error);
      // We don't throw to prevent blocking core flows like booking/checkin
    }
  }

  /**
   * 1. Booking Confirmation
   * Vars: {{1}} Customer Name, {{2}} Booking ID, {{3}} Check-in, {{4}} Check-out
   */
  async sendBookingConfirmation(phone: string, name: string, bookingId: string, checkInDate: Date, checkOutDate: Date): Promise<void> {
    const vars = [
      name || "Guest",
      bookingId,
      format(checkInDate, "dd MMM yyyy"),
      format(checkOutDate, "dd MMM yyyy")
    ];
    await this.sendTemplate(phone, this.templateBookingConfirmation, vars);
  }

  /**
   * 2. Cancellation
   * Vars: {{1}} Customer Name, {{2}} Booking ID
   */
  async sendCancellation(phone: string, name: string, bookingId: string): Promise<void> {
    const vars = [name || "Guest", bookingId];
    await this.sendTemplate(phone, this.templateCancel, vars);
  }

  /**
   * 3. Check-in
   * Vars: {{1}} Customer Name
   */
  async sendCheckIn(phone: string, name: string): Promise<void> {
    const vars = [name || "Guest"];
    await this.sendTemplate(phone, this.templateCheckin, vars);
  }

  /**
   * 4. Checkout Reminder
   * Vars: {{1}} Customer Name, {{2}} Checkout Time
   */
  async sendCheckoutReminder(phone: string, name: string, checkoutDate: Date): Promise<void> {
    const vars = [
      name || "Guest",
      format(checkoutDate, "dd MMM yyyy, 11:00 AM") // assuming 11 AM checkout, or we can use time
    ];
    await this.sendTemplate(phone, this.templateCheckoutReminder, vars);
  }
}

export const waBridgeService = new WABridgeService();
