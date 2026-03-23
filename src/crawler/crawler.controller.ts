import { InjectQueue } from '@nestjs/bull';
import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBody, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { type Queue } from 'bull';
import { WEBSITE_CRAWL_JOB, WEBSITE_CRAWL_QUEUE } from 'src/constants';
import { CrawlRequestDto, CrawlRequestSchema } from './dto/crawl-request.dto';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';

class QueueStatusResponse {
    @ApiProperty() waiting: number;
    @ApiProperty() active: number;
    @ApiProperty() completed: number;
    @ApiProperty() failed: number;
    @ApiProperty() delayed: number;
}

class AddToCrawlQueueResponse {
    @ApiProperty({ description: 'The Bull job ID assigned to this crawl request' })
    jobId: string | number;
}

class CompletedJobSummary {
    @ApiProperty() jobId: string | number;
    @ApiProperty() url: string;
    @ApiProperty() finishedAt: number;
}

class JobStatusResponse {
    @ApiProperty({ example: 'completed', enum: ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'] })
    state: string;

    @ApiProperty({ description: '1-based position in the waiting queue — only present when state is "waiting"', required: false })
    position?: number;

    @ApiProperty({ description: 'The job return value — only present when state is "completed"', required: false })
    result?: unknown;

    @ApiProperty({ description: 'The failure reason — only present when state is "failed"', required: false })
    failedReason?: string;
}

@ApiTags('Crawler')
@Controller('v1/crawler')
export class CrawlerController {
    constructor(
        @InjectQueue(WEBSITE_CRAWL_QUEUE) private readonly websiteInputsQueue: Queue
    ){}

    @Get(':jobId/status')
    @ApiOperation({ summary: 'Get the status of a specific job' })
    @ApiOkResponse({ type: JobStatusResponse })
    @ApiNotFoundResponse({ description: 'Job not found' })
    async getJobStatus(@Param('jobId') jobId: string): Promise<JobStatusResponse> {
        const job = await this.websiteInputsQueue.getJob(jobId);
        if (!job) throw new NotFoundException(`Job ${jobId} not found`);

        const state = await job.getState();

        let position: number | undefined;
        if (state === 'waiting') {
            const waitingJobs = await this.websiteInputsQueue.getWaiting();
            const idx = waitingJobs.findIndex(j => String(j.id) === String(jobId));
            position = idx === -1 ? undefined : idx + 1;
        }

        return {
            state,
            ...(position !== undefined && { position }),
            ...(state === 'completed' && { result: job.returnvalue }),
            ...(state === 'failed' && { failedReason: job.failedReason }),
        };
    }

    @Get('jobs')
    @ApiOperation({ summary: 'Get all completed jobs' })
    @ApiOkResponse({ type: [CompletedJobSummary] })
    async getCompletedJobs(): Promise<CompletedJobSummary[]> {
        const jobs = await this.websiteInputsQueue.getCompleted();
        return jobs
            .map(job => ({
                jobId: job.id,
                url: job.data.url,
                finishedAt: job.finishedOn ?? 0,
            }))
            .sort((a, b) => b.finishedAt - a.finishedAt);
    }

    // @Get('export')
    // @ApiOperation({ summary: 'Export all completed jobs with full results — use this to archive before shutting down' })
    // async exportJobs() {
    //     const jobs = await this.websiteInputsQueue.getCompleted();
    //     return jobs
    //         .sort((a, b) => (a.finishedOn ?? 0) - (b.finishedOn ?? 0))
    //         .map(job => ({
    //             jobId: job.id,
    //             submittedAt: job.timestamp,
    //             finishedAt: job.finishedOn,
    //             input: job.data,
    //             result: job.returnvalue,
    //         }));
    // }

    @Get('status')
    @ApiOperation({ summary: 'Get queue job counts' })
    @ApiOkResponse({ type: QueueStatusResponse })
    async getStatus() {
        return this.websiteInputsQueue.getJobCounts();
    }

    @Post('submit')
    @ApiOperation({ summary: 'Add a URL to the crawl queue' })
    @ApiBody({ type: CrawlRequestDto })
    @ApiOkResponse({ type: AddToCrawlQueueResponse })
    async addToCrawlQueue(@Body(new ZodValidationPipe(CrawlRequestSchema)) body: CrawlRequestDto): Promise<AddToCrawlQueueResponse> {
        const job = await this.websiteInputsQueue.add(WEBSITE_CRAWL_JOB, body);
        return { jobId: job.id };
    }
}
