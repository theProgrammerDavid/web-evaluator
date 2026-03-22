import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { type ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
    constructor(private readonly schema: ZodSchema<T>) {}

    async transform(value: unknown): Promise<T> {
        const result = await this.schema.safeParseAsync(value);
        if (!result.success) {
            throw new BadRequestException(result.error.flatten());
        }
        return result.data;
    }
}
