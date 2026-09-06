(() => {
  const intro = document.getElementById('intro');
  const image = intro?.querySelector('img');
  if (!intro || !image) return;

  // The old intro code in app.js used a fixed 350ms timeout. Block only those
  // two legacy callbacks so this controller is the single source of truth.
  const nativeSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay, ...args) {
    if (typeof fn === 'function' && /finishIntro/.test(Function.prototype.toString.call(fn))) {
      return 0;
    }
    return nativeSetTimeout.call(window, fn, delay, ...args);
  };

  const nativeAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = function (type, listener, options) {
    if (type === 'load' && typeof listener === 'function' && /finishIntro/.test(Function.prototype.toString.call(listener))) {
      return;
    }
    return nativeAddEventListener(type, listener, options);
  };

  function gifDuration(buffer) {
    try {
      const b = new Uint8Array(buffer);
      const header = String.fromCharCode(...b.slice(0, 6));
      if (header !== 'GIF87a' && header !== 'GIF89a') return 1000;
      let p = 6;
      const packed = b[p + 4];
      p += 7;
      if (packed & 0x80) p += 3 * (2 ** ((packed & 7) + 1));

      let total = 0;
      while (p < b.length) {
        const marker = b[p++];
        if (marker === 0x3b) break;

        if (marker === 0x21) {
          const label = b[p++];
          if (label === 0xf9) {
            const blockSize = b[p++];
            if (blockSize === 4) {
              p++; // packed fields
              total += (b[p] | (b[p + 1] << 8)) * 10;
              p += 2;
              p += 2; // transparent index + block terminator
            } else {
              p += blockSize;
            }
          } else {
            while (p < b.length) {
              const size = b[p++];
              if (!size) break;
              p += size;
            }
          }
        } else if (marker === 0x2c) {
          if (p + 9 >= b.length) break;
          const imagePacked = b[p + 8];
          p += 9;
          if (imagePacked & 0x80) p += 3 * (2 ** ((imagePacked & 7) + 1));
          p++; // LZW minimum code size
          while (p < b.length) {
            const size = b[p++];
            if (!size) break;
            p += size;
          }
        } else {
          break;
        }
      }
      return Math.max(100, total || 1000);
    } catch {
      return 1000;
    }
  }

  async function run() {
    let duration = 1000;
    try {
      const response = await fetch('assets/1.gif', { cache: 'force-cache' });
      if (response.ok) duration = gifDuration(await response.arrayBuffer());
    } catch {}

    let ready = document.readyState === 'complete';
    let cycleStart = performance.now();
    let finishing = false;

    if (!ready) {
      nativeAddEventListener('load', () => {
        ready = true;
      }, { once: true });
    }

    const frame = () => {
      if (!intro.isConnected || finishing) return;
      const now = performance.now();

      if (now - cycleStart >= duration) {
        if (ready) {
          // Reveal only after a complete GIF cycle has played.
          finishing = true;
          intro.classList.add('hide');
          nativeSetTimeout(() => intro.remove(), 500);
          return;
        }

        // The site is still loading: restart the GIF from frame 1 and loop.
        image.src = `assets/1.gif?intro=${Date.now()}`;
        cycleStart = now;
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  run();
})();
