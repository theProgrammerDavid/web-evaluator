import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { lookup } from 'node:dns/promises';

const PRIVATE_IP_RANGES = [
    /^127\./,                          // loopback
    /^10\./,                           // RFC1918
    /^172\.(1[6-9]|2\d|3[01])\./,     // RFC1918
    /^192\.168\./,                     // RFC1918
    /^169\.254\./,                     // link-local
    /^::1$/,                           // IPv6 loopback
    /^fc00:/i,                         // IPv6 unique local
    /^fe80:/i,                         // IPv6 link-local
];

function isPrivateIp(ip: string): boolean {
    return PRIVATE_IP_RANGES.some(r => r.test(ip));
}

async function isSSRFSafe(rawUrl: string): Promise<boolean> {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname;

    // Block bare IPs that are private
    if (isPrivateIp(hostname)) return false;

    // Resolve hostname and check all returned IPs
    try {
        const { address } = await lookup(hostname);
        if (isPrivateIp(address)) return false;
    } catch {
        return false; // unresolvable hostname
    }

    return true;
}

export const CrawlRequestSchema = z.object({
    url: z.url().refine(
        async (url) => isSSRFSafe(url),
        { message: 'URL resolves to a private or reserved address' }
    ),
    waitMs: z.number().int().nonnegative().max(30_000).default(10_000),
    language: z.string().default('en'),
    useHeatmap: z.boolean().default(false),
});

export class CrawlRequestDto implements z.infer<typeof CrawlRequestSchema> {
    @ApiProperty({ description: 'The URL to crawl' })
    url: string;

    @ApiProperty({ description: 'Time in ms to wait after scrolling before taking a screenshot', default: 10_000 })
    waitMs: number;

    @ApiProperty({ description: 'Language of the page content for spell checking', default: 'en' })
    language: string;

    @ApiProperty({ description: 'If true and a previous crawl exists for this URL, generate a heatmap diff and feed it to the AI rating', default: false })
    useHeatmap: boolean;
}
