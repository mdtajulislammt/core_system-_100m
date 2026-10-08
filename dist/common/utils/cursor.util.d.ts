export interface OrderCursorPayload {
    createdAt: string;
    id: string;
}
export declare class CursorUtil {
    static encode(createdAt: Date, id: string): string;
    static decode(cursor: string): {
        createdAt: Date;
        id: string;
    };
}
