// Development/test adapter only. Production always uses Cloudflare bindings.
import { readFileSync } from 'node:fs';
const rules = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url))).ratelimits;
export function localRateLimits(now = Date.now) {
  return Object.fromEntries(
    rules.map((rule) => {
      const counters = new Map();
      let window = -1;
      return [
        rule.name,
        {
          async limit({ key }) {
            const current = Math.floor(now() / (rule.simple.period * 1000));
            if (current !== window) {
              counters.clear();
              window = current;
            }
            if (!counters.has(key) && counters.size >= 10000) return { success: false };
            const hits = (counters.get(key) || 0) + 1;
            counters.set(key, hits);
            return { success: hits <= rule.simple.limit };
          },
        },
      ];
    }),
  );
}
