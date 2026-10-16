// Servidor de pruebas local: sirve /public y las funciones de /api como lo haría Vercel.
//   node dev-server.mjs          → usa GEMINI_API_KEY real si existe en el entorno
//   node dev-server.mjs --mock   → simula a Gemini (no gasta cupo ni necesita clave)
// Los resultados se guardan en memoria mientras el servidor esté encendido.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const mock = process.argv.includes("--mock");
process.env.ALLOW_MEMORY_DB ??= "1";
process.env.TEACHER_PASSWORD ??= "prueba";

if (mock) {
  process.env.GEMINI_API_KEY ??= "clave-simulada";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (String(url).includes("generativelanguage") ? fakeGemini(String(url)) : realFetch(url, opts));
}

// Importar después de preparar el entorno: los módulos leen las variables al cargar.
const handlers = {
  "/api/ai": (await import("./api/ai.js")).default,
  "/api/results": (await import("./api/results.js")).default,
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (handlers[pathname]) {
    try { await handlers[pathname](req, res); }
    catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end("error"); } }
    return;
  }
  const file = path.join(root, "public", pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(path.join(root, "public"))) { res.statusCode = 403; return res.end(); }
  try {
    const data = await readFile(file);
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(data);
  } catch { res.statusCode = 404; res.end("No encontrado"); }
}).listen(Number(process.env.PORT || 3000), () => {
  console.log(`Brújula Social en http://localhost:${process.env.PORT || 3000}${mock ? " (Gemini simulado)" : ""}`);
  console.log(`Contraseña docente de prueba: ${process.env.TEACHER_PASSWORD}`);
});

/* ---------- Gemini simulado para pruebas ---------- */
function fakeGemini(url) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (url.includes("streamGenerateContent")) {
    const words = "Piensa en **dónde ocurre** el problema y en quiénes se ven afectados. Relee el segundo párrafo: ¿qué interés tiene cada actor?".split(" ");
    const body = new ReadableStream({
      async start(ctl) {
        const enc = new TextEncoder();
        for (const w of words) {
          await sleep(40);
          ctl.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: w + " " }] } }] })}\r\n\r\n`));
        }
        ctl.close();
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
  const p = "En un municipio del Meta, la alcaldesa propuso convertir un antiguo matadero en una biblioteca pública con sala de internet. Los comerciantes apoyan la idea porque atraería visitantes, pero piden parqueaderos. Un grupo de jóvenes pide una cancha y salones de música. La junta de acción comunal recuerda que el barrio no tiene puesto de salud y prefiere que el dinero se use en eso.";
  const q = {
    tema: "Biblioteca o puesto de salud (simulada)",
    contexto: [p, p, p],
    cita: { autor: "La alcaldesa", texto: "La cultura también es desarrollo." },
    tabla: null,
    enunciado: "¿Entre quiénes se presenta el choque de intereses más directo?",
    opciones: ["Entre la junta de acción comunal y la alcaldía, por el destino del mismo presupuesto.", "Entre los comerciantes y los jóvenes, por el tipo de música del barrio.", "Entre la alcaldesa y los comerciantes, que rechazan la biblioteca.", "Entre los jóvenes y la junta, porque los jóvenes no quieren un puesto de salud."],
    correcta: 0,
    porque: "La junta y la alcaldía quieren usar el mismo dinero para fines distintos: biblioteca o puesto de salud.",
    descartes: ["", "El texto no menciona un conflicto por el tipo de música.", "Los comerciantes apoyan la biblioteca.", "Los jóvenes no se oponen al puesto de salud."],
  };
  return sleep(1200).then(() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(q) }] }, finishReason: "STOP" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
}
