export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

  try {
    const { images, style, size, prompt } = req.body || {};
    if (!Array.isArray(images) || images.length < 1 || images.length > 5) {
      return res.status(400).json({ error: 'Upload between 1 and 5 reference images.' });
    }

    const parts = [{
      text: `${prompt || 'Create a high-quality collectible figure from the reference images.'}\nPhysical size requested: ${size || '10cm'}. Keep the complete subject visible and centered. Preserve identity, facial structure, hairstyle, clothing, colors, accessories and distinctive details. Do not add text, logos, borders or watermarks.`
    }];

    for (const item of images) {
      if (!item?.data?.startsWith('data:image/')) continue;
      const match = item.data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) continue;
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }

    if (parts.length === 1) return res.status(400).json({ error: 'No valid reference images were provided.' });

    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          responseFormat: { image: { aspectRatio: '1:1', imageSize: '1K' } }
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Gemini image generation failed.' });

    const responseParts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = responseParts.find((part) => part?.inlineData?.data);
    const b64 = imagePart?.inlineData?.data;
    const mimeType = imagePart?.inlineData?.mimeType || 'image/png';
    if (!b64) return res.status(502).json({ error: 'Gemini returned no image.' });

    return res.status(200).json({ image: `data:${mimeType};base64,${b64}`, style, size });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Image generation service failed.' });
  }
}
