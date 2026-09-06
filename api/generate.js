export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured.' });
  try {
    const { images, style, size, prompt } = req.body || {};
    if (!Array.isArray(images) || images.length < 1 || images.length > 5) return res.status(400).json({ error: 'Upload between 1 and 5 reference images.' });
    const form = new FormData();
    form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1');
    form.append('prompt', `${prompt || 'Create a high-quality collectible figure from the references.'}\nPhysical size requested: ${size || '10cm'}. Keep the complete subject visible and centered. Do not add text, logos, borders or watermarks.`);
    form.append('size', '1024x1024');
    form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium');
    for (let i = 0; i < images.length; i++) {
      const item = images[i];
      if (!item?.data?.startsWith('data:image/')) continue;
      const match = item.data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) continue;
      const buffer = Buffer.from(match[2], 'base64');
      form.append('image[]', new Blob([buffer], { type: match[1] }), item.name || `reference-${i + 1}.png`);
    }
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'OpenAI image generation failed.' });
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'OpenAI returned no image.' });
    return res.status(200).json({ image: `data:image/png;base64,${b64}`, style, size });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Image generation service failed.' });
  }
}