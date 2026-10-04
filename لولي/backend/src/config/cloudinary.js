'use strict';

const cloudinary = require('cloudinary').v2;

const clean = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().replace(/^['"]|['"]$/g, '');
};

const fromUrl = () => {
  const raw = clean(process.env.CLOUDINARY_URL);
  if (!raw) return {};
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'cloudinary:') return {};
    return {
      cloud_name: clean(parsed.hostname),
      api_key: clean(decodeURIComponent(parsed.username || '')),
      api_secret: clean(decodeURIComponent(parsed.password || '')),
    };
  } catch {
    return {};
  }
};

function refreshConfig() {
  const urlConfig = fromUrl();
  const resolved = {
    cloud_name: clean(process.env.CLOUDINARY_CLOUD_NAME) || urlConfig.cloud_name || '',
    api_key: clean(process.env.CLOUDINARY_API_KEY) || urlConfig.api_key || '',
    api_secret: clean(process.env.CLOUDINARY_API_SECRET) || urlConfig.api_secret || '',
  };

  // Only pass values that actually exist. Passing undefined values can wipe
  // Cloudinary's own CLOUDINARY_URL resolution in some runtime setups.
  const config = { secure: true };
  if (resolved.cloud_name) config.cloud_name = resolved.cloud_name;
  if (resolved.api_key) config.api_key = resolved.api_key;
  if (resolved.api_secret) config.api_secret = resolved.api_secret;

  cloudinary.config(config);
  cloudinary.__credentialsState = {
    cloudName: Boolean(resolved.cloud_name),
    apiKey: Boolean(resolved.api_key),
    apiSecret: Boolean(resolved.api_secret),
    source: process.env.CLOUDINARY_URL ? 'CLOUDINARY_URL/vars' : 'vars',
  };
  return cloudinary.__credentialsState;
}

cloudinary.refreshConfig = refreshConfig;
refreshConfig();

module.exports = cloudinary;
