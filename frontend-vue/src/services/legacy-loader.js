const EXTERNAL_SCRIPTS = [
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/6.5.10/browser/pixi.min.js',
  'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js'
];

const LEGACY_SCRIPTS = [
  '/legacy/js/services/config.js',
  '/legacy/js/services/i18n.js',
  '/legacy/js/services/asr.js',
  '/legacy/js/services/tts.js',
  '/legacy/js/live2d/loader.js',
  '/legacy/js/services/expression.js'
];

let loadingPromise = null;

function hasScript(src) {
  return Boolean(document.querySelector(`script[src="${src}"]`));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (hasScript(src)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

    document.head.appendChild(script);
  });
}

export async function loadLegacyCore() {
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    for (const src of EXTERNAL_SCRIPTS) {
      await loadScript(src);
    }

    for (const src of LEGACY_SCRIPTS) {
      await loadScript(src);
    }
  })();

  return loadingPromise;
}
