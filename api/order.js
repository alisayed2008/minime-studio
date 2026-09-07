import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER || 'alysayed208@gmail.com';
const ORDER_TO_EMAIL = process.env.ORDER_TO_EMAIL || 'alysayed208@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'GMAIL_APP_PASSWORD is not configured.' });
  }

  try {
    const { name, address, phone, email, payment, size, price, style, generatedImage, annotatedImage } = req.body || {};
    if (!name || !address || !phone || !email || !payment || !generatedImage) {
      return res.status(400).json({ error: 'Complete all order fields first.' });
    }

    const toAttachment = (dataUrl, filename) => {
      if (!dataUrl?.startsWith('data:')) return null;
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      return match ? { filename, content: match[2], encoding: 'base64' } : null;
    };

    const attachments = [
      toAttachment(generatedImage, 'mini-me-generated.png'),
      toAttachment(annotatedImage, 'mini-me-with-notes.png')
    ].filter(Boolean);

    const paymentNames = {
      instapay: 'InstaPay',
      vodafone: 'Vodafone Cash',
      paypal: 'PayPal'
    };

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>New Mini Me Studio Order</h2>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Phone:</b> ${escapeHtml(phone)}</p>
        <p><b>Detailed address:</b> ${escapeHtml(address)}</p>
        <p><b>Payment method:</b> ${escapeHtml(paymentNames[payment] || payment)}</p>
        <p><b>Style:</b> ${escapeHtml(style || '')}</p>
        <p><b>Model size:</b> ${escapeHtml(size || '')}</p>
        <p><b>Total price:</b> ${escapeHtml(String(price || ''))} EGP</p>
        <p>The generated model and the annotated version are attached.</p>
      </div>`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: GMAIL_USER,
      to: ORDER_TO_EMAIL,
      replyTo: email,
      subject: `Mini Me order — ${name} — ${size}`,
      html,
      attachments
    });

    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Could not send the order email.' });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}
