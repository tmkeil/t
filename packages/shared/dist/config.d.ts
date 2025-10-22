export type WorldConfig = {
    FIELD_WIDTH: number;
    FIELD_HEIGHT: number;
    PADDLE_RATIO: number;
    PADDLE_ACC: number;
};
export declare const DEFAULT_WORLD: WorldConfig;
export type Derived = WorldConfig & {
    paddleSize: number;
    paddleSpeed: number;
};
export declare function buildWorld(overrides?: Partial<WorldConfig>): Derived;
