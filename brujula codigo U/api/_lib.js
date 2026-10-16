// Utilidades compartidas por las funciones de /api (no es una ruta: empieza por "_").
import crypto from "node:crypto";

export function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

// Lee el cuerpo JSON con un tamaño máximo (Vercel a veces ya lo trae en req.body).
export async function readJSON(req, max = 200_000) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error("too_large"), { status: 413 });
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

// Identificador anónimo por visitante: un hash de su IP, nunca la IP en claro.
export function clientId(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = fwd || req.socket?.remoteAddress || "anon";
  return crypto.createHash("sha256").update("brujula:" + ip).digest("hex").slice(0, 20);
}

export const today = () => new Date().toISOString().slice(0, 10);

export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------- Upstash Redis por REST (sin dependencias) ---------- */
const R_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const hasRedis = () => Boolean(R_URL && R_TOKEN);

// Respaldo en memoria: solo para pruebas locales o si Redis aún no está conectado.
const mem = new Map();
function memCmd([cmd, key, ...args]) {
  switch (String(cmd).toUpperCase()) {
    case "INCR": { const n = (Number(mem.get(key)) || 0) + 1; mem.set(key, n); return n; }
    case "EXPIRE": return 1;
    case "HSET": { const h = mem.get(key) || new Map(); h.set(args[0], args[1]); mem.set(key, h); return 1; }
    case "HGETALL": { const h = mem.get(key); return h ? [...h.entries()].flat() : []; }
    default: throw new Error("comando no soportado en memoria: " + cmd);
  }
}

export async function redis(...cmd) {
  if (!hasRedis()) return memCmd(cmd);
  const r = await fetch(R_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

// Contador diario: devuelve si todavía está dentro del límite.
export async function hit(key, limit, ttlSeconds = 90_000) {
  const n = Number(await redis("INCR", key));
  if (n === 1) await redis("EXPIRE", key, ttlSeconds);
  return { n, ok: n <= limit, left: Math.max(0, limit - n) };
}
