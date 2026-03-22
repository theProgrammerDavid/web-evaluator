import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';

export interface DiffImageResult {
    non_zero_diff_found: boolean;
    pixels_changed: number;
    heatmapPath: string;
}

@Injectable()
export class PngDiffService implements OnModuleInit {
    private readonly logger = new Logger(PngDiffService.name);
    private binaryPath: string;
    private ready = false;

    private readonly DOWNLOAD_STUB = 'https://github.com/theProgrammerDavid/png_diff/releases/latest/download';
    private readonly GITHUB_API = 'https://api.github.com/repos/theProgrammerDavid/png_diff/tags';

    async onModuleInit() {
        try {
            await this.init();
            this.ready = true;
            this.logger.log(`png_diff binary ready at ${this.binaryPath}`);
        } catch (err) {
            this.logger.warn(`png_diff unavailable — diffs will be skipped: ${err.message}`);
        }
    }

    private getDownloadUrl(): string {
        switch (process.platform) {
            case 'win32': return `${this.DOWNLOAD_STUB}/png_diff-x86_64-pc-windows-msvc.zip`;
            case 'darwin': return process.arch.includes('arm')
                ? `${this.DOWNLOAD_STUB}/png_diff-aarch64-apple-darwin.tar.gz`
                : `${this.DOWNLOAD_STUB}/png_diff-x86_64-apple-darwin.tar.gz`;
            default: return `${this.DOWNLOAD_STUB}/png_diff-x86_64-unknown-linux-gnu.tar.gz`;
        }
    }

    private getLatestTag(): Promise<string> {
        return new Promise((resolve, reject) => {
            https.get(this.GITHUB_API, { headers: { 'User-Agent': 'web-evaluator' } }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)[0].name); }
                    catch (e) { reject(new Error('Failed to parse GitHub tags response')); }
                });
            }).on('error', reject);
        });
    }

    private downloadFile(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const follow = (u: string) => {
                https.get(u, { headers: { 'User-Agent': 'web-evaluator' } }, res => {
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        return follow(res.headers.location!);
                    }
                    const file = fs.createWriteStream(dest);
                    res.pipe(file);
                    file.on('finish', () => file.close(() => resolve()));
                    file.on('error', reject);
                }).on('error', reject);
            };
            follow(url);
        });
    }

    private exec(cmd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(cmd, (error, stdout, stderr) => {
                if (error) return reject(error);
                resolve(stdout);
            });
        });
    }

    private async init() {
        const tag = await this.getLatestTag();
        const dir = path.resolve(os.tmpdir(), 'png_diff', tag);
        const archive = path.join(dir, 'png_diff.tar.gz');
        this.binaryPath = path.join(dir, 'png_diff');

        if (fs.existsSync(this.binaryPath)) return;

        fs.mkdirSync(dir, { recursive: true });
        await this.downloadFile(this.getDownloadUrl(), archive);
        await this.exec(`tar -xzf ${archive} -C ${dir}`);
        fs.chmodSync(this.binaryPath, 0o755);
    }

    async diff(originalPath: string, newPath: string, heatmapPath: string, opacity = 128): Promise<DiffImageResult> {
        if (!this.ready) throw new Error('png_diff binary is not available');

        const stdout = await this.exec(
            `${this.binaryPath} --intensity ${opacity} --original-image-path "${originalPath}" --new-imagepath "${newPath}" --path-to-heatmap "${heatmapPath}" --stats-output stdout`
        );

        const parsed = JSON.parse(stdout);
        return {
            non_zero_diff_found: parsed.non_zero_diff_found,
            pixels_changed: parsed.pixels_changed,
            heatmapPath,
        };
    }

    isReady() { return this.ready; }
}
