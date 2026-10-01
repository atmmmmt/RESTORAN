'use strict';

/**
 * Durable local store for punches that have not reached the server yet.
 *
 * The terminal keeps its own log, but that is not enough on its own: the log
 * can be cleared from the device menu, can fill up, and dies with the unit.
 * A branch that loses its internet for a day must not depend on nobody
 * touching the terminal in the meantime. So every punch the agent reads is
 * written here first, and only marked sent once the server has accepted it.
 *
 * One JSON file, rewritten atomically (write a temp file, then rename over
 * the original) so a power cut mid-write leaves either the old or the new
 * version on disk — never a truncated file that loses everything.
 */

const fs   = require('fs');
const path = require('path');

/* Sent punches are only kept long enough to recognise them if the terminal
   reports them again; after that they are just weight. */
const KEEP_SENT_MS = 60 * 24 * 60 * 60 * 1000;

function createOutbox(file) {
  let items = {};   // key → { user_id, record_time, sent, seenAt, sentAt }

  function load() {
    try {
      const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
      const data = JSON.parse(raw);
      items = data && typeof data.items === 'object' ? data.items : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        /* A corrupt store must not be silently replaced with an empty one —
           keep it aside for recovery and start fresh. */
        try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* nothing to keep */ }
      }
      items = {};
    }
  }

  function save() {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }));
    fs.renameSync(tmp, file);
  }

  const keyOf = rec => `${rec.user_id}|${rec.record_time}`;

  /** Normalise a terminal record to what the server ingests. */
  function toRecord(rec) {
    const userId = rec.user_id ?? rec.userId ?? rec.uid ?? rec.pin;
    const when   = new Date(rec.record_time ?? rec.timestamp ?? rec.time);
    if (userId === undefined || userId === null || Number.isNaN(when.getTime())) return null;
    return { user_id: String(userId), record_time: when.toISOString() };
  }

  /** Record everything read from the terminal. Returns how many were new. */
  function add(records) {
    let added = 0;
    const now = Date.now();
    for (const r of records || []) {
      const rec = toRecord(r);
      if (!rec) continue;
      const key = keyOf(rec);
      if (items[key]) continue;
      items[key] = { ...rec, sent: false, seenAt: now };
      added++;
    }
    if (added) save();
    return added;
  }

  /** Punches still waiting for the server, oldest first. */
  function pending() {
    return Object.entries(items)
      .filter(([, v]) => !v.sent)
      .sort(([, a], [, b]) => a.record_time.localeCompare(b.record_time))
      .map(([key, v]) => ({ key, user_id: v.user_id, record_time: v.record_time }));
  }

  /** Mark a batch accepted by the server, and drop old sent history. */
  function markSent(keys) {
    const now = Date.now();
    for (const k of keys) if (items[k]) { items[k].sent = true; items[k].sentAt = now; }
    for (const [k, v] of Object.entries(items)) {
      if (v.sent && now - (v.sentAt || now) > KEEP_SENT_MS) delete items[k];
    }
    save();
  }

  load();
  return {
    add, pending, markSent,
    size: () => Object.keys(items).length,
    pendingCount: () => Object.values(items).filter(v => !v.sent).length,
  };
}

module.exports = { createOutbox };
