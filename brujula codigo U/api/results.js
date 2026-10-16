// Resultados de los estudiantes.
// POST: guarda o actualiza un intento (sin contraseña, con validación y límite diario).
// GET:  devuelve todos los intentos solo con la contraseña docente (encabezado x-clave-docente).
import { send, readJSON, clientId, hit, today, redis, hasRedis, safeEqual } from "./_lib.js";

const s = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : 0);
const bit = (v) => (v ? 1 : 0);

function clean(b) {
  if (!b || typeof b !== "object") return null;
  const id = s(b.id, 32);
  if (!/^[a-z0-9]{4,32}$/i.test(id)) return null;
  const nombre = s(b.nombre, 60);
  if (!nombre) return null;
  const rec = {
    id, nombre,
    curso: b.curso === "11°" ? "11°" : "10°",
    fecha: s(b.fecha, 40) || new Date().toISOString(),
    modo: b.modo === "libre" ? "libre" : "guiado",
    puntaje: num(b.puntaje, 0, 100),
    completado: Boolean(b.completado),
    respuestas: (Array.isArray(b.respuestas) ? b.respuestas : []).slice(0, 6).map((r) => ({
      escala: s(r?.escala, 20),
      dimensiones: (Array.isArray(r?.dimensiones) ? r.dimensiones : []).slice(0, 4).map((x) => s(x, 20)),
      actores: (Array.isArray(r?.actores) ? r.actores : []).slice(0, 5).map((x) => s(x, 60)),
      pregunta: s(r?.pregunta, 2),
      pe: bit(r?.pe), pd: bit(r?.pd), pa: bit(r?.pa), pp: bit(r?.pp),
      pistas: num(r?.pistas, 0, 10),
    })),
  };
  if (rec.modo === "libre") {
    rec.estimado = num(b.estimado, 0, 100);
    rec.nivel = num(b.nivel, 1, 4);
    rec.preguntas = (Array.isArray(b.preguntas) ? b.preguntas : []).slice(-200).map((p) => ({
      tema: s(p?.tema, 80), competencia: s(p?.competencia, 4), tipo: s(p?.tipo, 40), dificultad: s(p?.dificultad, 10),
      eligio: s(p?.eligio, 2), correcta: s(p?.correcta, 2), acierto: Boolean(p?.acierto),
      pistas: num(p?.pistas, 0, 10), origen: s(p?.origen, 10),
    }));
  }
  return rec;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  const dbReady = hasRedis() || process.env.ALLOW_MEMORY_DB === "1";

  if (req.method === "POST") {
    if (!dbReady) return send(res, 503, { code: "no_db" });
    let body;
    try { body = await readJSON(req, 150_000); } catch { return send(res, 413, { code: "too_large" }); }
    const rec = clean(body);
    if (!rec) return send(res, 400, { code: "invalid" });
    try {
      const w = await hit(`res:w:${clientId(req)}:${today()}`, 600);
      if (!w.ok) return send(res, 429, { code: "limit" });
      await redis("HSET", "intentos", rec.id, JSON.stringify(rec));
      return send(res, 200, { ok: true });
    } catch (e) { console.error(e); return send(res, 502, { code: "db_error" }); }
  }

  if (req.method === "GET") {
    const pass = process.env.TEACHER_PASSWORD;
    if (!pass) return send(res, 503, { code: "no_password" });
    if (!dbReady) return send(res, 503, { code: "no_db" });
    try {
      const given = String(req.headers["x-clave-docente"] || "");
      if (!safeEqual(given, pass)) {
        const f = await hit(`res:f:${clientId(req)}:${today()}`, 20);
        await sleep(700);
        return send(res, f.ok ? 401 : 429, { code: f.ok ? "bad_password" : "too_many_attempts" });
      }
      const flat = (await redis("HGETALL", "intentos")) || [];
      const list = [];
      for (let i = 1; i < flat.length; i += 2) { try { list.push(JSON.parse(flat[i])); } catch {} }
      return send(res, 200, { intentos: list });
    } catch (e) { console.error(e); return send(res, 502, { code: "db_error" }); }
  }

  return send(res, 405, { code: "method_not_allowed" });
}
