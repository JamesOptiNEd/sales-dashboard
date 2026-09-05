// lib/redis.js — shared Redis client for the social feed + auth session store.
// Uses the standard `redis` npm package against Vercel's native Redis
// integration (Storage tab -> Redis -> Connect), which injects REDIS_URL.
//
// NOTE: this replaced @vercel/kv, which Vercel discontinued in Dec 2024 —
// if you're following older instructions that mention @vercel/kv or a "KV"
// storage option, that product no longer exists; use Redis instead.

import { createClient } from 'redis';

let clientPromise;

export function getRedisClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('Redis Client Error', err));
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}
