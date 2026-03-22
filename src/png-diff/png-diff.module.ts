import { Module } from '@nestjs/common';
import { PngDiffService } from './png-diff.service';

@Module({
    providers: [PngDiffService],
    exports: [PngDiffService],
})
export class PngDiffModule {}
