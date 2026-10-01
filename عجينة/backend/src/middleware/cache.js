'use strict';

const cacheService = require('../services/cacheService');

/**
 * Express cache middleware.
 * Serves cached JSON on HIT; on MISS intercepts res.json to store the result.
 *
 * @param {string} key    Unique cache key for this route
 * @param {number} ttlMs  Time-to-live in milliseconds
 */
function cacheMiddleware(key, ttlMs) {
  return (req, res, next) => {
    const cached = cacheService.get(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        cacheService.set(key, body, ttlMs);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

module.exports = cacheMiddleware;
