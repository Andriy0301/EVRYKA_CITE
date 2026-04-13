import nodemailer from "nodemailer";

export type RequestPayload = {
  name: string;
  phone: string;
  email: string;
  description: string;
  link: string;
  attachmentName?: string;
};

export async function sendRequestEmail(
  payload: RequestPayload,
  attachment?: { filename: string; content: Buffer; contentType?: string }
): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;
  const to = process.env.MAIL_TO;

  if (!host || !from || !to) {
    console.info("[request] SMTP не налаштовано — мок у консоль:", payload);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to,
    subject: `Запит 3D-друк: ${payload.name}`,
    text: [
      `Ім'я: ${payload.name}`,
      `Телефон: ${payload.phone}`,
      `Email: ${payload.email}`,
      `Посилання: ${payload.link || "—"}`,
      "",
      "Опис:",
      payload.description || "—",
    ].join("\n"),
    attachments: attachment
      ? [
          {
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType,
          },
        ]
      : undefined,
  });
}
