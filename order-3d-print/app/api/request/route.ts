import { NextResponse } from "next/server";
import { sendRequestEmail } from "@/lib/email";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim();
    const description = String(form.get("description") || "").trim();
    const link = String(form.get("link") || "").trim();
    const file = form.get("attachment");

    if (!name || !phone || !email) {
      return NextResponse.json(
        { error: "Заповніть ім'я, телефон та email" },
        { status: 400 }
      );
    }

    let attachment:
      | { filename: string; content: Buffer; contentType?: string }
      | undefined;

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "Файл завеликий (макс. 50 МБ)" },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      attachment = {
        filename: file.name || "attachment",
        content: buf,
        contentType: file.type || undefined,
      };
    }

    await sendRequestEmail(
      {
        name,
        phone,
        email,
        description,
        link,
        attachmentName: attachment?.filename,
      },
      attachment
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[request]", e);
    return NextResponse.json(
      { error: "Не вдалося надіслати запит" },
      { status: 500 }
    );
  }
}
