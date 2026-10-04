'use strict';

// Cloudinary auto-parses CLOUDINARY_URL while the package is being required.
// A malformed value crashes the whole Node process before our own config runs.
// Hostinger can retain an old/invalid CLOUDINARY_URL even when the three
// explicit CLOUDINARY_* variables are correct, so neutralize only malformed
// values before requiring the SDK.
const rawCloudinaryUrl = String(process.env.CLOUDINARY_URL || '').trim();
if (rawCloudinaryUrl && !rawCloudinaryUrl.toLowerCase().startsWith('cloudinary://')) {
  console.warn('⚠️ Ignoring malformed CLOUDINARY_URL and using explicit Cloudinary variables instead');
  delete process.env.CLOUDINARY_URL;
}

const cloudinary = require('cloudinary').v2;

const clean = (value) => {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
};

const normalizeKey = (key) => String(key || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const readEnv = (...names) => {
  const wanted = new Set(names.map(normalizeKey));

  // Exact names first.
  for (const name of names) {
    const value = clean(process.env[name]);
    if (value) return { value, key: name };
  }

  // Then tolerate accidental spaces, hyphens, zero-width characters, etc.
  for (const [key, raw] of Object.entries(process.env)) {
    if (!wanted.has(normalizeKey(key))) continue;
    const value = clean(raw);
    if (value) return { value, key };
  }

  return { value: '', key: '' };
};

const fromUrl = () => {
  const direct = readEnv('CLOUDINARY_URL');
  const raw = direct.value;
  if (!raw) return {};
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'cloudinary:') return {};
    return {
      cloud_name: clean(parsed.hostname),
      api_key: clean(decodeURIComponent(parsed.username || '')),
      api_secret: clean(decodeURIComponent(parsed.password || '')),
      sourceKey: direct.key,
    };
  } catch {
    return {};
  }
};

function refreshConfig() {
  const urlConfig = fromUrl();

  const cloudNameEnv = readEnv('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_CLOUDNAME');
  const apiKeyEnv = readEnv('CLOUDINARY_API_KEY', 'CLOUDINARY_APIKEY');
  const apiSecretEnv = readEnv(
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_APISECRET',
    'CLOUDINARY_SECRET',
    'CLOUDINARY_SECRET_KEY'
  );

  const resolved = {
    cloud_name: cloudNameEnv.value || urlConfig.cloud_name || '',
    api_key: apiKeyEnv.value || urlConfig.api_key || '',
    api_secret: apiSecretEnv.value || urlConfig.api_secret || '',
  };

  const config = { secure: true };
  if (resolved.cloud_name) config.cloud_name = resolved.cloud_name;
  if (resolved.api_key) config.api_key = resolved.api_key;
  if (resolved.api_secret) config.api_secret = resolved.api_secret;
  cloudinary.config(config);

  cloudinary.__credentialsState = {
    cloudName: Boolean(resolved.cloud_name),
    apiKey: Boolean(resolved.api_key),
    apiSecret: Boolean(resolved.api_secret),
    matchedKeys: {
      cloudName: cloudNameEnv.key || urlConfig.sourceKey || '',
      apiKey: apiKeyEnv.key || urlConfig.sourceKey || '',
      apiSecret: apiSecretEnv.key || urlConfig.sourceKey || '',
    },
  };

  return cloudinary.__credentialsState;
}

cloudinary.refreshConfig = refreshConfig;
refreshConfig();

module.exports = cloudinary;
