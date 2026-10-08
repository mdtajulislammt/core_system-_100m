import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaginationDirection {
  FORWARD = 'FORWARD',
  BACKWARD = 'BACKWARD',
}

export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(PaginationDirection)
  direction: PaginationDirection = PaginationDirection.FORWARD;
}
