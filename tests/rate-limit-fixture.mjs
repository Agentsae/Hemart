import {localRateLimits} from '../scripts/local-rate-limits.mjs';
// Business/auth tests isolate the persistent DB limits; security tests exercise
// the actual configured per-minute budgets independently.
export const allowRateLimits=()=>Object.fromEntries(Object.keys(localRateLimits()).map(name=>[name,{limit:async()=>({success:true})}]));
