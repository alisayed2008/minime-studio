export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY is not configured.' });
  const to = process.env.ORDER_TO_EMAIL || 'alysayed208@gmail.com';
  const from = process.env.ORDER_FROM_EMAIL;
  if (!from) return res.status(500).json({ error: 'ORDER_FROM_EMAIL is not configured.' });

  try {
    const { name, address, phone, email, payment, size, price, style, generatedImage, annotatedImage } = req.body || {};
    if (!name || !address || !phone || !email || !payment || !generatedImage) return res.status(400).json({ error: 'Complete all order fields first.' });

    const toAttachment = (dataUrl, filename) => {
      if (!dataUrl?.startsWith('data:')) return null;
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      return match ? { filename, content: match[2] } : null;
    };
    const attachments = [
      toAttachment(generatedImage, 'mini-me-generated.png'),
      toAttachment(annotatedImage, 'mini-me-with-notes.png')
    ].filter(Boolean);

    const paymentNames = { instapay: 'InstaPay', vodafone: 'Vodafone Cash', paypal: 'PayPal' };
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

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Mini Me order — ${name} — ${size}`, html, attachments })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.message || data?.error || 'Email service failed.' });
    return res.status(200).json({ ok: true, id: data.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not send the order email.' });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}