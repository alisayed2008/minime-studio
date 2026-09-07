const HF_SPACE = 'https://prithivmlmods-qwen-image-edit-2511-loras-fast.hf.space';
const MAX_WAIT_MS = 55000;

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function readSSE(response, deadline) {
  if (!response.body) throw new Error('Hugging Face returned no event stream.');
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
      const lines = event.split('\n');
      let eventName = '';
      let dataText = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataText += line.slice(5).trim();
      }
      if (eventName === 'error') {
        let message = dataText || 'Hugging Face inference failed.';
        try {
          const parsed = JSON.parse(dataText);
          message = parsed?.error || parsed?.message || message;
        } catch {}
        throw new Error(message);
      }
      if (eventName !== 'complete' || !dataText) continue;

      let payload;
      try {
        payload = JSON.parse(dataText);
      } catch {
        throw new Error('Invalid response from the free image service.');
      }
      return payload;
    }
  }

  throw new Error('The free image service took too long to respond. Please try again.');
}

function pickImage(result) {
  const values = Array.isArray(result) ? result : [result];
  for (const item of values) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (item.startsWith('data:image/')) return item;
      if (/^https?:\/\//i.test(item)) return item;
      if (/\.(png|jpe?g|webp)(\?|$)/i.test(item)) return item;
    }
    if (typeof item === 'object') {
      const candidates = [item.url, item.path, item.data?.url, item.data?.path];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && (/^https?:\/\//i.test(candidate) || candidate.startsWith('data:image/'))) return candidate;
      }
    }
  }
  return null;
}

async function imageToDataUrl(imageRef) {
  if (imageRef.startsWith('data:image/')) return imageRef;
  const response = await fetch(imageRef);
  if (!response.ok) throw new Error('The image service returned an unreadable image.');
  const mime = response.headers.get('content-type') || 'image/png';
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed.');

  try {
    const { images, style, size, prompt } = req.body || {};
    if (!Array.isArray(images) || images.length < 1 || images.length > 5) {
      return jsonError(res, 400, 'Upload between 1 and 5 reference images.');
    }

    const encodedImages = images
      .filter((item) => typeof item?.data === 'string' && item.data.startsWith('data:image/'))
      .map((item) => item.data);
    if (!encodedImages.length) return jsonError(res, 400, 'No valid reference images were provided.');

    const styleInstruction = {
      figure: 'Turn the subject into a premium collectible 3D figure. Preserve identity, facial structure, hairstyle, clothing, colors, accessories and distinctive details. Realistic vinyl/resin toy proportions, full body, centered, clean studio presentation.',
      funko: 'Turn the subject into a Funko Pop inspired collectible figure. Preserve recognizable identity, hairstyle, clothing colors, accessories and distinctive details. Use an oversized head, simplified facial features and compact toy body, while keeping the person clearly recognizable.',
      voxel: 'Turn the subject into a polished 3D voxel collectible figure. Preserve recognizable identity, hairstyle, clothing colors, accessories and distinctive details using clean cubic geometry and a collectible-toy presentation.'
    }[style] || 'Turn the subject into a premium collectible 3D figure.';

    const finalPrompt = `${styleInstruction}\n${prompt || ''}\nRequested physical size: ${size || '10cm'}. Keep the entire subject visible and centered. Do not add text, logos, borders, watermarks or extra people.`;

    // This public Space exposes a Gradio /infer endpoint whose first parameter
    // accepts JSON-encoded base64 images, so no paid API account is needed.
    // We use 4-step inference for the shortest practical ZeroGPU runtime.
    const queue = await fetch(`${HF_SPACE}/gradio_api/call/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    const queueText = await queue.text();
    if (!queue.ok) {
      let message = queueText || 'Could not queue the free image generation request.';
      try {
        const parsed = JSON.parse(queueText);
        message = parsed?.error || parsed?.message || message;
      } catch {}
      return jsonError(res, queue.status, message);
    }

    let queueData;
    try {
      queueData = JSON.parse(queueText);
    } catch {
      return jsonError(res, 502, 'The free image service returned an invalid queue response.');
    }
    if (!queueData?.event_id) return jsonError(res, 502, 'The free image service did not return a queue id.');

    const deadline = Date.now() + MAX_WAIT_MS;
    const result = await readSSE(
      await fetch(`${HF_SPACE}/gradio_api/call/infer/${encodeURIComponent(queueData.event_id)}`),
      deadline
    );

    const imageRef = pickImage(result);
    if (!imageRef) return jsonError(res, 502, 'The free image service returned no generated image.');

    const image = await imageToDataUrl(imageRef);
    return res.status(200).json({ image, style, size, provider: 'huggingface-zero-gpu' });
  } catch (error) {
    console.error(error);
    return jsonError(res, 500, error?.message || 'Free image generation service failed.');
  }
}
