import { Controller, Get, Res } from '@nestjs/common';
import { type Response } from 'express';
import * as path from 'path';

@Controller()
export class AppController {
  @Get()
  getIndex(@Res() res: Response) {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  }

  @Get('job/:jobId')
  getJob(@Res() res: Response) {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  }
}
