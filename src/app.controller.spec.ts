import { Test, TestingModule } from '@nestjs/testing';
import * as path from 'path';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  const mockRes = () => {
    const res = { sendFile: jest.fn() };
    return res;
  };

  const expectedPath = path.join(process.cwd(), 'public', 'index.html');

  it('GET / serves index.html', () => {
    const res = mockRes();
    appController.getIndex(res as any);
    expect(res.sendFile).toHaveBeenCalledWith(expectedPath);
  });

  it('GET /job/:jobId serves index.html', () => {
    const res = mockRes();
    appController.getJob(res as any);
    expect(res.sendFile).toHaveBeenCalledWith(expectedPath);
  });
});
