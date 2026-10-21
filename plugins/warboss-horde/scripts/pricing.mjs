// warboss-horde pricing — shared by both meters.

// Does key K occur in model id M at a version boundary? The remainder after K
// must be end, '[' (context suffix), '@', or a '-YYYYMMDD' date stamp. Every
// occurrence is checked, not only the first.
function matchesAt(m, k) {
  if (!k) return false;
  let i = m.indexOf(k);
  while (i !== -1) {
    const rest = m.slice(i + k.length);
    if (rest === '' || rest.startsWith('[') || rest.startsWith('@') || /^-\d{8}(?=$|[\[@])/.test(rest)) {
      return true;
    }
    i = m.indexOf(k, i + 1);
  }
  return false;
}

// Match a full model id ('claude-opus-5-20260101') to a pricing entry; longest key wins.
export function priceForModel(pricing, model) {
  if (!model || typeof model !== 'string') return null;
  if (!pricing || typeof pricing !== 'object') return null;
  const m = model.toLowerCase();
  let best = null;
  for (const key of Object.keys(pricing)) {
    if (key.startsWith('$')) continue;
    const k = key.toLowerCase();
    if (!matchesAt(m, k)) continue;
    if (best === null || k.length > best.k.length) best = { k, key };
  }
  if (best === null) return null;
  const p = pricing[best.key];
  return p && typeof p === 'object' ? p : null;
}

// Rates in force for one message: base, or base merged with `above` past the prompt threshold.
export function ratesFor(price, usage) {
  if (!price || typeof price !== 'object') return null;
  const u = usage || {};
  const prompt = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  if (price.above && typeof price.above === 'object' && prompt > price.above.prompt_tokens) {
    return { ...price, ...price.above };
  }
  return price;
}

// Unrounded USD for ONE message; null if the price is unusable.
export function messageUsd(price, usage) {
  if (!price || typeof price !== 'object') return null;
  const u = usage || {};
  const inp = u.input_tokens || 0;
  const out = u.output_tokens || 0;
  const read = u.cache_read_input_tokens || 0;
  const create = u.cache_creation_input_tokens || 0;
  const w1h = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
  const w5m = Math.max(0, create - w1h);
  const rates = ratesFor(price, u);
  for (const f of ['input', 'output', 'cache_read', 'cache_write', 'cache_write_1h']) {
    if (typeof rates[f] !== 'number' || !Number.isFinite(rates[f])) return null;
  }
  return (
    inp * rates.input +
    out * rates.output +
    read * rates.cache_read +
    w5m * rates.cache_write +
    w1h * rates.cache_write_1h
  ) / 1e6;
}
