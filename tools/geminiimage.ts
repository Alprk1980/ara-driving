// Makes one image on Vertex AI, billed to the key in .env.llm. Imagen models take a prompt only; Gemini image models can also
// work from a reference picture.
//   node --env-file=.env.llm tools/geminiimage.ts "<prompt>" out.png [--model gemini-3.1-flash-image] [--aspect 16:9] [--from a.png,b.png]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [prompt, file] = args, model = flag('--model') ?? 'gemini-3.1-flash-image', from = flag('--from'), aspect = flag('--aspect') ?? '16:9', key = process.env.IMAGEN_API_KEY;
if (!prompt || !file || !key) throw new Error('needs a prompt, an output file, and IMAGEN_API_KEY');

const imagen = model.startsWith('imagen'), parts: unknown[] = [{ text: prompt }];
for (const f of from?.split(',') ?? []) parts.push({ inlineData: { mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(f).toString('base64') } });
const res = await fetch(`https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:${imagen ? 'predict' : 'generateContent'}?key=${encodeURIComponent(key)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(imagen ? { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: aspect } } : { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
});
if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 400)}`);
const body = await res.json() as { predictions?: { bytesBase64Encoded?: string }[]; candidates?: { content?: { parts?: { text?: string; inlineData?: { data: string } }[] } }[] };
const data = body.predictions?.[0]?.bytesBase64Encoded ?? body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
if (!data) throw new Error(`no image came back: ${JSON.stringify(body).slice(0, 300)}`);
writeFileSync(file, Buffer.from(data, 'base64'));
console.log(`saved ${file}`);
