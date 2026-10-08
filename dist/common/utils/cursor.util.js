"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CursorUtil = void 0;
const common_1 = require("@nestjs/common");
class CursorUtil {
    static encode(createdAt, id) {
        const payload = {
            createdAt: createdAt.toISOString(),
            id,
        };
        return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    }
    static decode(cursor) {
        try {
            const decodedJson = Buffer.from(cursor, 'base64url').toString('utf8');
            const payload = JSON.parse(decodedJson);
            if (!payload.createdAt || !payload.id) {
                throw new Error('Missing cursor attributes');
            }
            const date = new Date(payload.createdAt);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid ISO date inside cursor');
            }
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(payload.id)) {
                throw new Error('Invalid UUID inside cursor');
            }
            return {
                createdAt: date,
                id: payload.id,
            };
        }
        catch (error) {
            throw new common_1.BadRequestException(`Malformed pagination cursor: ${error.message}`);
        }
    }
}
exports.CursorUtil = CursorUtil;
//# sourceMappingURL=cursor.util.js.map