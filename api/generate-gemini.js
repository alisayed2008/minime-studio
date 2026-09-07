const HF_SPACE = 'https://prithivmlmods-qwen-image-edit-2511-loras-fast.hf.space';
const MAX_WAIT_MS = 55000;

function errorResponse(res, status, error) {
  return res.status(status).json({ error });
}

function hfHeaders() {
  const token = process.env.HF_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readSSE(response, deadline) {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Hugging Face stream failed (${response.status}).`);
  }
  if (!response.body) throw new Error('Free image service returned no event stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      let eventName = '';
      let dataText = '';

      for (const line of event.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataText += line.slice(5).trim();
      }

      if (eventName === 'error') {
        let message = dataText || 'Free image generation failed.';
        try {
          const parsed = JSON.parse(dataText);
          message = parsed?.error || parsed?.message || message;
        } catch {}
        throw new Error(message);
      }

      if (eventName !== 'complete' || !dataText) continue;

      try {
        return JSON.parse(dataText);
      } catch {
        throw new Error('Invalid response from the free image service.');
      }
    }
  }

  throw new Error('The free image service took too long. Please try again.');
}

function findImage(result) {
  const seen = new Set();

  function walk(value) {
    if (!value || seen.has(value)) return null;
    if (typeof value === 'object') seen.add(value);

    if (typeof value === 'string') {
      if (value.startsWith('data:image/')) return value;
      if (/^https?:\/\//i.test(value)) return value;
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    if (typeof value === 'object') {
      for (const key of ['image', 'url', 'path', 'data', 'value']) {
        const found = walk(value[key]);
        if (found) return found;
      }
      for (const item of Object.values(value)) {
        const found = walk(item);
        if (found) return found;
      }
    }

    return null;
  }

  return walk(result);
}

async function toDataUrl(ref) {
  if (ref.startsWith('data:image/')) return ref;

  const response = await fetch(ref, { headers: hfHeaders() });
  if (!response.ok) throw new Error('Could not retrieve the generated image.');

  const mime = response.headers.get('content-type') || 'image/png';
  const body = Buffer.from(await response.arrayBuffer());
  return `data:${mime};base64,${body.toString('base64')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed.');

  try {
    const { images, style, size, prompt } = req.body || {};

    if (!Array.isArray(images) || images.length < 1 || images.length > 5) {
      return errorResponse(res, 400, 'Upload between 1 and 5 reference images.');
    }

    const encodedImages = images
      .filter((item) => typeof item?.data === 'string' && item.data.startsWith('data:image/'))
      .map((item) => item.data);

    if (!encodedImages.length) {
      return errorResponse(res, 400, 'No valid reference images were provided.');
    }

    const styleInstruction = {
      figure: 'Turn the subject into a premium collectible 3D figure. Preserve identity, facial structure, hairstyle, clothing, colors, accessories and distinctive details. Realistic vinyl or resin collectible proportions, full body, centered, clean studio presentation.',
      funko: 'Turn the subject into a Funko Pop inspired collectible figure. Preserve recognizable identity, hairstyle, clothing colors, accessories and distinctive details. Use an oversized head, simplified facial features and compact toy body, while keeping the person clearly recognizable.',
      voxel: 'Turn the subject into a polished 3D voxel collectible figure. Preserve recognizable identity, hairstyle, clothing colors, accessories and distinctive details using clean cubic geometry and a collectible-toy presentation.'
    }[style] || 'Turn the subject into a premium collectible 3D figure.';

    const finalPrompt = `${styleInstruction}\n${prompt || ''}\nRequested physical size: ${size || '10cm'}. Keep the complete subject visible and centered. Do not add text, logos, borders, watermarks or extra people.`;
    const authHeaders = hfHeaders();

    const queued = await fetch(`${HF_SPACE}/gradio_api/call/edit_image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        data: [
          JSON.stringify(encodedImages),
          finalPrompt,
          'Style-Transfer',
          0,
          true,
          1.0,
          4
        ]
      })
    });

    const queuedText = await queued.text();
    if (!queued.ok) {
      let message = queuedText || 'Could not queue the free image generation request.';
      try {
        const parsed = JSON.parse(queuedText);
        message = parsed?.error || parsed?.message || message;
      } catch {}
      return errorResponse(res, queued.status, message);
    }

    let queuedData;
    try {
      queuedData = JSON.parse(queuedText);
    } catch {
      return errorResponse(res, 502, 'The free image service returned an invalid queue response.');
    }

    if (!queuedData?.event_id) {
      return errorResponse(res, 502, 'The free image service did not return a queue id.');
    }

    const resultResponse = await fetch(
      `${HF_SPACE}/gradio_api/call/edit_image/${encodeURIComponent(queuedData.event_id)}`,
      { headers: authHeaders }
    );

    const result = await readSSE(resultResponse, Date.now() + MAX_WAIT_MS);
    const imageRef = findImage(result);

    if (!imageRef) {
      console.error('Hugging Face completed response without image:', JSON.stringify(result).slice(0, 4000));
      return errorResponse(res, 502, 'The free image service returned no generated image.');
    }

    const image = await toDataUrl(imageRef);
    return res.status(200).json({ image, style, size, provider: 'huggingface-zero-gpu' });
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, error?.message || 'Free image generation service failed.');
  }
}
