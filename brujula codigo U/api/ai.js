// IA del búho con Gemini (plan gratuito). La clave vive solo aquí, en el servidor.
// POST {kind:"question", spec}  -> genera una pregunta tipo Saber 11 (JSON)
// POST {kind:"tutor", input}    -> pistas, explicaciones y chat (texto en vivo)
// GET                            -> {enabled, limit}
import { send, readJSON, clientId, hit, today } from "./_lib.js";

const KEY = process.env.GEMINI_API_KEY;
const MAIN = [process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-flash-latest"];
const FAST = [process.env.GEMINI_MODEL_FAST || "gemini-3.5-flash-lite", ...MAIN];
const PER_DAY = Number(process.env.AI_DAILY_LIMIT || 40);
const GLOBAL_CAP = Number(process.env.AI_GLOBAL_DAILY_CAP || 1000);
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

/* ---------- Guía de estilo para escribir preguntas (propia, inspirada en el formato Saber) ---------- */
const COMP = { PS: "Pensamiento social", IP: "Interpretación y análisis de perspectivas", RS: "Pensamiento reflexivo y sistémico" };
const COMPDESC = {
  PS: "usar conceptos de ciencias sociales, de la Constitución de 1991 y de la historia para comprender una situación",
  IP: "analizar posturas, argumentos, intereses y prejuicios de distintos actores",
  RS: "comprender cómo se relacionan dimensiones y actores en un problema, y evaluar efectos y soluciones",
};
const TIPOS = {
  PS: { "Constitución y participación": "aplicar un principio, derecho o mecanismo de participación de la Constitución de 1991 al caso", "Organización del Estado": "identificar qué institución o rama del poder público tiene una función y si actúa dentro de ella", "Proceso histórico": "relacionar un proceso histórico con sus causas o consecuencias" },
  IP: { "Prejuicio": "identificar un prejuicio o generalización no justificada en lo que dice un actor", "Contradicción": "detectar una contradicción interna en un enunciado, discurso o política", "Argumento a favor": "elegir el argumento que mejor apoya la postura de un actor", "Argumento en contra": "elegir el argumento que mejor cuestiona una propuesta", "Perspectivas": "reconocer la postura o el interés de un actor específico", "Credibilidad de la fuente": "evaluar por qué una fuente o afirmación merece cautela", "Idea central": "reconocer la idea que un actor defiende con más énfasis en su discurso", "Supuesto": "identificar un supuesto implícito en una afirmación" },
  RS: { "Consecuencia": "prever una consecuencia probable de una decisión", "Consecuencia no esperada": "identificar un efecto no buscado de una medida", "Choque de intereses": "identificar entre quiénes y por qué se da el conflicto central", "Dimensiones": "señalar qué dimensiones (política, económica, cultural, ambiental) están presentes", "Compatibilidad de soluciones": "juzgar si varias soluciones propuestas se complementan o se contradicen", "NO explica": "encontrar el enunciado que NO explica un fenómeno descrito" },
};

const QSYS = "Eres un experto en evaluación educativa que diseña preguntas originales para la prueba de Sociales y Ciudadanas del Saber 11 (ICFES, Colombia). Respondes solo con JSON válido.";

const TUTOR_SYS = "Eres el búho guía de «Brújula Social», una actividad de Ciencias Sociales para estudiantes colombianos de grado 10° y 11° que se preparan para el Saber 11 del ICFES. Hablas en español de Colombia, con calidez y claridad, y tuteas al estudiante. Solo ayudas con Ciencias Sociales, competencias ciudadanas y la preparación para el Saber 11: si te piden otra cosa, responde con amabilidad que solo puedes ayudar con eso y redirige. Nunca pidas datos personales. Escribe en párrafos cortos, sin títulos; puedes resaltar una o dos ideas con **negritas**. Sigue las instrucciones de la actividad que vienen en el mensaje.";

function checkSpec(s) {
  if (!s || typeof s !== "object") return null;
  const comp = String(s.comp || "");
  if (!TIPOS[comp]) return null;
  const tipo = String(s.tipo || "");
  if (!TIPOS[comp][tipo]) return null;
  const tema = String(s.tema || "").slice(0, 80);
  if (!tema) return null;
  const dif = s.dif === "alta" ? "alta" : "media";
  const recent = (Array.isArray(s.recent) ? s.recent : []).slice(-15).map((t) => String(t).slice(0, 80));
  return { comp, tipo, tdesc: TIPOS[comp][tipo], tema, dif, recent };
}

function questionPrompt(s) {
  return `Escribe UNA pregunta ORIGINAL de selección múltiple con única respuesta.

OBJETIVO DE ESTA PREGUNTA
- Competencia: ${COMP[s.comp]}: ${COMPDESC[s.comp]}.
- Tipo de tarea: ${s.tipo}: ${s.tdesc}.
- Tema: ${s.tema}.
- Dificultad: ${s.dif}.

CÓMO DEBE SER (sigue todo)
1. Contexto: una situación de 180 a 320 palabras en 3 o 4 párrafos, realista y situada en Colombia (o en otro país si el tema lo pide), con al menos tres actores (personas, grupos o instituciones) que tienen posturas o intereses distintos. Incluye datos concretos: cifras, lugares genéricos ("un municipio del Cauca"), plazos. Si sirve a la tarea, incluye una cita textual de un actor ficticio o una tabla pequeña.
2. Enunciado: debe exigir inferir, comparar perspectivas, evaluar argumentos o prever efectos a partir del contexto. No debe poder responderse copiando una frase del texto ni solo de memoria (en tareas de Constitución, el estudiante aplica un principio constitucional al caso).
3. Opciones: cuatro, de longitud y estilo parecidos, todas plausibles para quien lee rápido, y una sola correcta sin discusión. Construye los distractores con errores típicos: una afirmación verdadera que no responde lo preguntado; una generalización absoluta ("siempre", "solo", "todos"); atribuir una postura al actor equivocado; invertir causa y efecto o confundir medio con fin; un dato que el texto no menciona.
4. ${s.dif === "alta" ? "Dificultad alta: la respuesta correcta exige integrar información de dos o más párrafos y descartar un distractor muy cercano." : "Dificultad media: la respuesta exige una inferencia clara a partir de un párrafo, con distractores plausibles."}

REGLAS
- No uses nombres de personas reales ni atribuyas hechos inventados a personas, empresas o partidos reales; usa cargos genéricos ("la alcaldesa", "una empresa minera") o nombres ficticios comunes.
- Puedes citar con exactitud instituciones y normas reales (Constitución de 1991, Corte Constitucional, Congreso, ICBF).
- No copies ni parafrasees preguntas publicadas por el ICFES.
- Español de Colombia, claro, para estudiantes de grado 10° y 11°.
${s.recent.length ? `- No repitas estos temas recientes: ${s.recent.join("; ")}.` : ""}

FORMATO
Responde solo con un objeto JSON con esta forma exacta:
{"tema":"título corto","contexto":["párrafo 1","párrafo 2","párrafo 3"],"cita":null,"tabla":null,"enunciado":"...","opciones":["...","...","...","..."],"correcta":0,"porque":"por qué la correcta es la correcta (máximo 60 palabras)","descartes":["por qué la opción 1 es incorrecta, o \\"\\" si es la correcta","...","...","..."]}
"cita" puede ser {"autor":"cargo o nombre ficticio","texto":"..."} y "tabla" puede ser {"columnas":["..."],"filas":[["..."]]}. "correcta" es el índice (0 a 3) de la opción correcta.`;
}

// Convierte el texto o la conversación de la página al formato de Gemini, con límites de tamaño.
function toContents(input) {
  if (typeof input === "string") {
    const t = input.trim().slice(0, 12_000);
    return t ? [{ role: "user", parts: [{ text: t }] }] : null;
  }
  if (!Array.isArray(input) || !input.length || input.length > 16) return null;
  const out = [];
  let total = 0;
  for (const m of input) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const text = m.content.slice(0, 12_000);
    total += text.length;
    const role = m.role === "assistant" ? "model" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n\n" + text;
    else out.push({ role, parts: [{ text }] });
  }
  if (total > 20_000 || out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}

async function callGemini(models, payload, stream, signal) {
  let last;
  for (const m of models) {
    const url = BASE + encodeURIComponent(m) + (stream ? ":streamGenerateContent?alt=sse" : ":generateContent");
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify(payload),
      signal,
    });
    if (r.status === 404) { last = r; continue; } // modelo no disponible: probar el siguiente
    return r;
  }
  return last;
}

const textOf = (j) => (j?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");

function upstreamError(res, r) {
  if (r.status === 429) return send(res, 429, { code: "rate_limited" });
  console.error("Gemini respondió", r.status);
  return send(res, 502, { code: "upstream_error" });
}

function parseLoose(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { enabled: Boolean(KEY), limit: PER_DAY });
  if (req.method !== "POST") return send(res, 405, { code: "method_not_allowed" });
  if (!KEY) return send(res, 503, { code: "sampling_disabled" });

  let body;
  try { body = await readJSON(req, 60_000); } catch { return send(res, 413, { code: "prompt_too_large" }); }

  let job;
  if (body.kind === "question") {
    const spec = checkSpec(body.spec);
    if (!spec) return send(res, 400, { code: "invalid_request" });
    job = { models: MAIN, stream: false, payload: { systemInstruction: { parts: [{ text: QSYS }] }, contents: [{ role: "user", parts: [{ text: questionPrompt(spec) }] }], generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json" } } };
  } else if (body.kind === "tutor") {
    const contents = toContents(body.input);
    if (!contents) return send(res, 400, { code: "invalid_request" });
    job = { models: FAST, stream: true, payload: { systemInstruction: { parts: [{ text: TUTOR_SYS }] }, contents, generationConfig: { maxOutputTokens: 2048 } } };
  } else return send(res, 400, { code: "invalid_request" });

  // Límites: por persona al día y total del sitio al día (cuidan el cupo gratuito).
  let left = "";
  try {
    const user = await hit(`ia:u:${clientId(req)}:${today()}`, PER_DAY);
    if (!user.ok) return send(res, 429, { code: "daily_limit", limit: PER_DAY });
    const all = await hit(`ia:g:${today()}`, GLOBAL_CAP);
    if (!all.ok) return send(res, 429, { code: "global_limit" });
    left = String(user.left);
  } catch (e) { console.error("Contador no disponible:", e.message); }

  const ctl = new AbortController();
  // Si el estudiante cierra o cancela antes de terminar, se deja de pedir texto a Gemini.
  res.on?.("close", () => { if (!res.writableEnded) ctl.abort(); });

  let r;
  try { r = await callGemini(job.models, job.payload, job.stream, ctl.signal); }
  catch (e) { if (ctl.signal.aborted) return; console.error(e); return send(res, 502, { code: "upstream_error" }); }
  if (!r.ok) return upstreamError(res, r);

  if (!job.stream) {
    const j = await r.json();
    const fin = j?.candidates?.[0]?.finishReason;
    if (j?.promptFeedback?.blockReason || fin === "SAFETY") return send(res, 422, { code: "refused" });
    const q = parseLoose(textOf(j));
    if (!q) return send(res, 502, { code: "invalid_json" });
    return send(res, 200, { question: q }, { "X-IA-Restantes": left });
  }

  // Texto en vivo: se reenvía tal como llega de Gemini (eventos SSE "data: {...}").
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-IA-Restantes", left);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        try { const t = textOf(JSON.parse(line.slice(5))); if (t) res.write(t); } catch {}
      }
    }
  } catch (e) { if (!ctl.signal.aborted) console.error(e); }
  res.end();
}
