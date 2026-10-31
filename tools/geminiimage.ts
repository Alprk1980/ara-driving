// Makes one image with Gemini, billed to the key in .env.llm.
//   node --env-file=.env.llm tools/geminiimage.ts "<prompt>" out.png [--model gemini-3.1-flash-image] [--from reference.png]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [prompt, file] = args, model = flag('--model') ?? 'gemini-3.1-flash-image', from = flag('--from'), key = process.env.IMAGEN_API_KEY;
if (!prompt || !file || !key) throw new Error('needs a prompt, an output file, and IMAGEN_API_KEY');

const parts: unknown[] = [{ text: prompt }];
if (from) parts.push({ inlineData: { mimeType: from.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(from).toString('base64') } });
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
  body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
});
if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
const body = await res.json() as { candidates?: { content?: { parts?: { text?: string; inlineData?: { data: string } }[] } }[]; usageMetadata?: unknown };
let saved = false;
for (const part of body.candidates?.[0]?.content?.parts ?? []) {
  if (part.inlineData) { writeFileSync(file, Buffer.from(part.inlineData.data, 'base64')); console.log(`saved ${file}`); saved = true; }
  else if (part.text) console.log(`model note: ${part.text}`);
}
if (!saved) throw new Error('no image came back');
console.log('usage:', JSON.stringify(body.usageMetadata));
