import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import OpenAI from 'openai';
import { performance } from 'perf_hooks';

export type SpellCheckResult = { sentence: string; corrected: string };

const stripMarkers = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
const hasRealChange = (result: SpellCheckResult) => stripMarkers(result.corrected) !== result.sentence.trim();
export type ResponsivenessIssue = { element: string; problem: string; fix: string };
export type ResponsivenessRating = { viewport: string; rating: number; summary: string; issues: ResponsivenessIssue[] };

const buildSystemPrompt = (language: string) =>
    `You are a spell checker. Given text in ${language}, identify sentences with spelling or grammar errors.
Rules:
- "sentence" must be the exact original text, copied verbatim with no changes whatsoever — including any errors.
- "corrected" must be the fixed version, with every changed word or phrase wrapped in ** (e.g. if "teh" was fixed to "the", write "**the**").
- Only include entries where at least one change was made. If "sentence" and "corrected" would be identical, omit that entry entirely.
Return JSON: { "results": [{ "sentence": "<exact original>", "corrected": "<fixed with **highlights** around each change>" }] }`;

@Injectable()
export class AiService {
    async rateResponsiveness(screenshotPath: string, viewportName: string, heatmapPath?: string): Promise<ResponsivenessRating> {
        const provider = process.env.AI_PROVIDER ?? 'openai';
        const base64 = fs.readFileSync(screenshotPath).toString('base64');
        const imageUrl = `data:image/png;base64,${base64}`;

        const model = provider === 'ollama'
            ? (process.env.OLLAMA_VISION_MODEL ?? 'llava:7b')
            : 'gpt-4o';

        const ollamaBase = `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/v1`;
        const client = provider === 'ollama'
            ? new OpenAI({ baseURL: ollamaBase, apiKey: 'ollama' })
            : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const hasHeatmap = !!heatmapPath && fs.existsSync(heatmapPath);
        const heatmapBase64 = hasHeatmap ? fs.readFileSync(heatmapPath).toString('base64') : null;
        const heatmapImageUrl = heatmapBase64 ? `data:image/png;base64,${heatmapBase64}` : null;

        const systemPrompt = hasHeatmap
            ? `You are a web responsiveness expert. You are given two images: first the current screenshot of the page, then a heatmap showing what changed since the last crawl (red pixels = changed areas). Use both to identify responsiveness problems and comment on whether the changes appear to have improved or degraded the layout.
Return JSON:
{
  "rating": <1-10>,
  "summary": "<one sentence overall verdict, mentioning whether changes improved or degraded the layout>",
  "issues": [
    {
      "element": "<what element or area>",
      "problem": "<what is wrong>",
      "fix": "<concrete actionable CSS or HTML fix>"
    }
  ]
}
IMPORTANT: Only report issues you can directly and clearly see. Do not hallucinate problems. If the layout looks correct, return an empty issues array and a rating of 8 or higher.`
            : `You are a web responsiveness expert. Analyse the screenshot and identify specific responsiveness problems.
Return JSON:
{
  "rating": <1-10>,
  "summary": "<one sentence overall verdict>",
  "issues": [
    {
      "element": "<what element or area, e.g. 'navigation bar', 'hero image', 'pricing table'>",
      "problem": "<what is wrong, e.g. 'text overflows container on mobile'>",
      "fix": "<concrete actionable CSS or HTML fix, e.g. 'add overflow-x: hidden and reduce font-size to 14px below 768px breakpoint'>"
    }
  ]
}
IMPORTANT: Only report issues you can directly and clearly see in the screenshot. Do not infer, assume, or guess problems that are not visually evident. If the layout looks correct for the viewport, return an empty issues array and a rating of 8 or higher. It is better to under-report than to hallucinate issues.`;

        const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
            { type: 'text', text: `This screenshot was taken at the "${viewportName}" viewport. Rate how well the page is optimised for this screen size.` },
            { type: 'image_url', image_url: { url: imageUrl } },
            ...(heatmapImageUrl ? [
                { type: 'text' as const, text: 'This is the heatmap showing pixel changes since the last crawl. Red areas indicate what changed.' },
                { type: 'image_url' as const, image_url: { url: heatmapImageUrl } },
            ] : []),
        ];

        const t0 = performance.now();

        const response = await client.chat.completions.create({
            model,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
        });

        const t1 = performance.now();

        console.log(`screenshot evaluation took ${t1-t0} ms`);
        const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
        return { viewport: viewportName, rating: parsed.rating, summary: parsed.summary, issues: parsed.issues ?? [] };
    }

    async checkSpelling(text: string, language: string): Promise<SpellCheckResult[]> {
        const provider = process.env.AI_PROVIDER ?? 'openai';
        if (provider === 'openai') return this.checkWithOpenAi(text, language);
        if (provider === 'ollama') return this.checkWithOllama(text, language);
        throw new Error(`AI provider "${provider}" is not yet supported`);
    }

    private async checkWithOllama(text: string, language: string): Promise<SpellCheckResult[]> {
        const t0 = performance.now();
        
        const ollamaBase = `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/v1`;
        const client = new OpenAI({
            baseURL: ollamaBase,
            apiKey: 'ollama',
        });
        const response = await client.chat.completions.create({
            model: process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b-instruct-q4_K_M',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: buildSystemPrompt(language),
                },
                { role: 'user', content: text },
            ],
        });
        const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
        const t1 = performance.now();

        console.log(`ollama text parsing took ${t1-t0}ms`);
        return (parsed.results ?? []).filter(hasRealChange);
    }

    private async checkWithOpenAi(text: string, language: string): Promise<SpellCheckResult[]> {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await client.chat.completions.create({
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: buildSystemPrompt(language),
                },
                { role: 'user', content: text },
            ],
        });
        const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
        return (parsed.results ?? []).filter(hasRealChange);
    }
}
