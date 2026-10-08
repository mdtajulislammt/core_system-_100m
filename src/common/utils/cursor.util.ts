import { BadRequestException } from '@nestjs/common';

export interface OrderCursorPayload {
  createdAt: string; // ISO-8601 string representation with millisecond precision
  id: string;        // UUID string
}

export class CursorUtil {
  /**
   * Encodes a database row's timestamp and unique ID into an opaque Base64 cursor string.
   */
  public static encode(createdAt: Date, id: string): string {
    const payload: OrderCursorPayload = {
      createdAt: createdAt.toISOString(),
      id,
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  /**
   * Decodes and validates an opaque Base64 cursor string into typed database seek parameters.
   * Throws BadRequestException on tampering or malformed tokens.
   */
  public static decode(cursor: string): { createdAt: Date; id: string } {
    try {
      const decodedJson = Buffer.from(cursor, 'base64url').toString('utf8');
      const payload: OrderCursorPayload = JSON.parse(decodedJson);

      if (!payload.createdAt || !payload.id) {
        throw new Error('Missing cursor attributes');
      }

      const date = new Date(payload.createdAt);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid ISO date inside cursor');
      }

      // Basic UUID regex validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(payload.id)) {
        throw new Error('Invalid UUID inside cursor');
      }

      return {
        createdAt: date,
        id: payload.id,
      };
    } catch (error) {
      throw new BadRequestException(`Malformed pagination cursor: ${(error as Error).message}`);
    }
  }
}
