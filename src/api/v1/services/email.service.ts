import nodemailer from "nodemailer";
import env from "../../../config/env";

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // true for 465, false for other ports
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  async sendEmailWithAttachment(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachmentBuffer: Buffer,
    filename: string
  ): Promise<void> {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      console.warn("[Email Service] SMTP credentials not configured. Email not sent.");
      return;
    }

    try {
      await this.transporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text,
        html,
        attachments: [
          {
            filename,
            content: attachmentBuffer,
            contentType: "application/pdf",
          },
        ],
      });
      // console.log(`[Email Service] Email sent successfully to ${to}`);
    } catch (error) {
      console.error("[Email Service] Failed to send email:", error);
      throw new Error("Failed to send email");
    }
  }
}

export const emailService = new EmailService();
