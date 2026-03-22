import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Test, TestingModule } from '@nestjs/testing';
import { WEBSITE_CRAWL_QUEUE } from 'src/constants';
import { CrawlerController } from './crawler.controller';

const mockQueue = {
  add: jest.fn(),
  getJob: jest.fn(),
  getWaiting: jest.fn(),
  getCompleted: jest.fn(),
  getJobCounts: jest.fn(),
};

describe('CrawlerController', () => {
  let controller: CrawlerController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CrawlerController],
      providers: [
        { provide: getQueueToken(WEBSITE_CRAWL_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    controller = module.get<CrawlerController>(CrawlerController);
  });

  describe('addToCrawlQueue', () => {
    it('adds a job and returns jobId', async () => {
      mockQueue.add.mockResolvedValueOnce({ id: 42 });
      const result = await controller.addToCrawlQueue({
        url: 'https://example.com',
        waitMs: 3000,
        language: 'en',
        useHeatmap: false,
      });
      expect(result).toEqual({ jobId: 42 });
    });
  });

  describe('getStatus', () => {
    it('returns job counts from the queue', async () => {
      const counts = { waiting: 1, active: 2, completed: 5, failed: 0, delayed: 0 };
      mockQueue.getJobCounts.mockResolvedValueOnce(counts);
      expect(await controller.getStatus()).toEqual(counts);
    });
  });

  describe('getCompletedJobs', () => {
    it('returns completed jobs sorted by most recent first', async () => {
      mockQueue.getCompleted.mockResolvedValueOnce([
        { id: 1, data: { url: 'https://a.com' }, finishedOn: 1000 },
        { id: 2, data: { url: 'https://b.com' }, finishedOn: 3000 },
        { id: 3, data: { url: 'https://c.com' }, finishedOn: 2000 },
      ]);
      const result = await controller.getCompletedJobs();
      expect(result.map(j => j.jobId)).toEqual([2, 3, 1]);
    });
  });

  describe('getJobStatus', () => {
    it('throws NotFoundException when job does not exist', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);
      await expect(controller.getJobStatus('99')).rejects.toThrow(NotFoundException);
    });

    it('returns state and result for a completed job', async () => {
      mockQueue.getJob.mockResolvedValueOnce({
        getState: jest.fn().mockResolvedValue('completed'),
        returnvalue: { score: 9 },
        failedReason: undefined,
      });
      const result = await controller.getJobStatus('1');
      expect(result).toEqual({ state: 'completed', result: { score: 9 } });
    });

    it('returns state and failedReason for a failed job', async () => {
      mockQueue.getJob.mockResolvedValueOnce({
        getState: jest.fn().mockResolvedValue('failed'),
        returnvalue: undefined,
        failedReason: 'Connection error.',
      });
      const result = await controller.getJobStatus('2');
      expect(result).toEqual({ state: 'failed', failedReason: 'Connection error.' });
    });

    it('returns state and queue position for a waiting job', async () => {
      mockQueue.getJob.mockResolvedValueOnce({
        getState: jest.fn().mockResolvedValue('waiting'),
        returnvalue: undefined,
        failedReason: undefined,
      });
      mockQueue.getWaiting.mockResolvedValueOnce([
        { id: '5' },
        { id: '3' },
        { id: '7' },
      ]);
      const result = await controller.getJobStatus('3');
      expect(result).toEqual({ state: 'waiting', position: 2 });
    });
  });
});
