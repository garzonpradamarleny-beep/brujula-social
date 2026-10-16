# Brújula Social: versión pública con IA gratuita (Gemini)

Página de práctica de Ciencias Sociales tipo Saber 11 con el búho de Código U. Esta versión funciona en cualquier navegador, **sin cuenta**, y usa el plan gratuito de Gemini (Google) para:

- escribir preguntas nuevas sin límite en la práctica ilimitada;
- dar pistas;
- explicar los errores con otras palabras;
- responder el chat "Pregúntale al búho".

Si la IA no está disponible o se acaba el cupo, la página sigue funcionando con su banco de 24 preguntas.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `public/index.html` | La página completa (diseño, animaciones, casos y banco de preguntas). |
| `api/ai.js` | Servidor que habla con Gemini. Aquí vive la clave, que nunca llega al navegador. Aplica los límites de uso. |
| `api/results.js` | Guarda los resultados de los estudiantes y se los muestra al docente con contraseña. |
| `api/_lib.js` | Utilidades compartidas: base de datos Upstash y contadores. |
| `vercel.json` | Configuración para Vercel. |
| `.env.example` | Lista de variables que debes configurar en Vercel (sin valores). |
| `dev-server.mjs` | Servidor para probar en tu computador antes de publicar. |

## Publicarla en internet (unos 15 minutos, todo gratis)

### 1. Saca tu clave de Gemini
1. Entra a [Google AI Studio](https://aistudio.google.com/) con tu cuenta de Google.
2. Busca **Get API key → Create API key** y copia la clave.
3. **No actives la facturación** (billing) si quieres que siga siendo gratis. Sin facturación, Google solo corta el servicio cuando se acaba el cupo diario; no cobra.

> En el plan gratuito, Google puede usar lo que se escribe para mejorar sus productos. La página avisa a los estudiantes que no escriban datos personales en el chat.

### 2. Sube el proyecto a Vercel
Crea una cuenta gratuita en [vercel.com](https://vercel.com) (puedes entrar con GitHub o con tu correo). Hay dos caminos:

**Opción A: con GitHub (recomendada, permite actualizar fácil)**
1. Crea un repositorio nuevo en [github.com](https://github.com/new), por ejemplo `brujula-social`.
2. Usa **Add file → Upload files** y arrastra **todo el contenido de esta carpeta**.
3. En Vercel: **Add New → Project →** importa ese repositorio. En *Framework Preset* deja **Other** y pulsa **Deploy**.

**Opción B: desde la terminal de tu computador**
Abre una terminal en esta carpeta y ejecuta:

```bash
npx vercel
```

Responde las preguntas; los valores por defecto sirven.

### 3. Configura las variables
En Vercel abre tu proyecto, entra a **Settings → Environment Variables** y agrega:

| Nombre | Valor |
|---|---|
| `GEMINI_API_KEY` | La clave que copiaste en el paso 1. |
| `TEACHER_PASSWORD` | La contraseña que tú inventes para ver los resultados. |

### 4. Conecta la base de datos gratuita (Upstash)
1. En tu proyecto de Vercel, entra a la pestaña **Storage** (o al **Marketplace**) y busca **Upstash → Redis**.
2. Crea una base de datos con el plan **Free** y elige **Connect to project** con este proyecto.
3. Vercel agrega solo las variables que necesita (`KV_REST_API_URL` y `KV_REST_API_TOKEN`, o las de `UPSTASH_REDIS_REST_…`; sirven las dos).

### 5. Vuelve a publicar
Las variables nuevas solo se aplican en una publicación nueva: **Deployments → (los tres puntos de la última) → Redeploy**.

Listo. Comparte el enlace `https://tu-proyecto.vercel.app` con tus conocidos. Para ver los resultados, abre la página, toca **Acceso docente** (abajo, en la pantalla de registro) y escribe tu contraseña.

## Límites para cuidar el cupo gratuito
- **40 usos de IA por persona al día.** Cada pregunta nueva, pista, explicación o mensaje de chat cuenta uno. Al llegar al límite, la persona sigue practicando con el banco.
- **1.000 usos de IA en total al día** para todo el sitio.
- Si Gemini se queda sin cupo, el búho lo avisa y la página sigue con el banco.

Puedes cambiar estos valores con variables opcionales en Vercel:

| Variable | Valor por defecto |
|---|---|
| `AI_DAILY_LIMIT` | `40` |
| `AI_GLOBAL_DAILY_CAP` | `1000` |
| `GEMINI_MODEL` (escribe las preguntas) | `gemini-3.8-flash` |
| `GEMINI_MODEL_FAST` (pistas y chat) | `gemini-3.5-flash-lite` |

Si Google retira algún modelo, la página prueba sola con `gemini-flash-latest`.

## Probar en tu computador antes de publicar
Necesitas [Node.js](https://nodejs.org) 20 o más reciente. En esta carpeta ejecuta:

```bash
npm run dev:mock
```

Abre `http://localhost:3000`. En este modo Gemini es simulado: no gasta cupo ni necesita clave. La contraseña docente de prueba es `prueba`.

Para probar con tu clave real en PowerShell:

```bash
$env:GEMINI_API_KEY="tu-clave"; npm run dev
```

## Privacidad y seguridad
- La clave de Gemini solo existe en las variables de Vercel; nunca está en la página ni en GitHub.
- Para los límites no se guardan IP: solo un código anónimo que se borra al día siguiente.
- Los resultados guardan nombre, curso y respuestas. Solo se pueden ver con la contraseña docente.
- No subas a GitHub ningún archivo `.env` con valores reales (el `.gitignore` ya lo evita).
