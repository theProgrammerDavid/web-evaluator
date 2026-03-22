import { jest } from '@jest/globals';
import * as dns from 'node:dns/promises';
import { CrawlRequestSchema } from './crawl-request.dto';

jest.mock('node:dns/promises');
const mockLookup = dns.lookup as jest.MockedFunction<typeof dns.lookup>;

async function isValid(url: string): Promise<boolean> {
    const result = await CrawlRequestSchema.safeParseAsync({ url });
    return result.success;
}

describe('CrawlRequestSchema SSRF protection', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('blocked: private IPs in URL', () => {
        it.each([
            ['loopback',       'http://127.0.0.1/'],
            ['RFC1918 /8',     'http://10.0.0.1/'],
            ['RFC1918 /12',    'http://172.16.0.1/'],
            ['RFC1918 /16',    'http://192.168.1.1/'],
            ['link-local',     'http://169.254.0.1/'],
            ['IPv6 loopback',  'http://[::1]/'],
            ['IPv6 unique local', 'http://[fc00::1]/'],
            ['IPv6 link-local',   'http://[fe80::1]/'],
        ])('blocks %s (%s)', async (_, url) => {
            expect(await isValid(url)).toBe(false);
        });
    });

    describe('blocked: non-http protocols', () => {
        it.each([
            ['ftp://example.com/'],
            ['file:///etc/passwd'],
            ['javascript://x'],
        ])('blocks %s', async (url) => {
            expect(await isValid(url)).toBe(false);
        });
    });

    describe('blocked: hostname resolves to private IP', () => {
        it('blocks a hostname that resolves to 192.168.x.x', async () => {
            mockLookup.mockResolvedValueOnce({ address: '192.168.1.100', family: 4 });
            expect(await isValid('http://internal.example.com/')).toBe(false);
        });

        it('blocks a hostname that resolves to 10.x.x.x', async () => {
            mockLookup.mockResolvedValueOnce({ address: '10.0.0.5', family: 4 });
            expect(await isValid('http://corp.example.com/')).toBe(false);
        });

        it('blocks an unresolvable hostname', async () => {
            mockLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));
            expect(await isValid('http://doesnotexist.invalid/')).toBe(false);
        });
    });

    describe('allowed: public URLs', () => {
        it('allows a public hostname', async () => {
            mockLookup.mockResolvedValueOnce({ address: '93.184.216.34', family: 4 });
            expect(await isValid('https://example.com/')).toBe(true);
        });

        it('allows http (not just https)', async () => {
            mockLookup.mockResolvedValueOnce({ address: '93.184.216.34', family: 4 });
            expect(await isValid('http://example.com/')).toBe(true);
        });
    });

    describe('other field validation', () => {
        beforeEach(() => {
            mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
        });

        it('rejects waitMs above 30000', async () => {
            const result = await CrawlRequestSchema.safeParseAsync({ url: 'https://example.com/', waitMs: 30001 });
            expect(result.success).toBe(false);
        });

        it('applies defaults', async () => {
            const result = await CrawlRequestSchema.safeParseAsync({ url: 'https://example.com/' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.waitMs).toBe(10_000);
                expect(result.data.language).toBe('en');
                expect(result.data.useHeatmap).toBe(false);
            }
        });
    });
});
