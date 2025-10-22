// Default WorldConfig values which will be used if no custom config is provided
export const DEFAULT_WORLD = {
    FIELD_WIDTH: 100,
    FIELD_HEIGHT: 40,
    PADDLE_RATIO: 1 / 6,
    PADDLE_ACC: 0.2
};
// This will return a WorldConfig object with default values overridden by provided "overrides"
export function buildWorld(overrides = {}) {
    // The base config is the DEFAULT_WORLD overridden by any provided overrides
    const base = { ...DEFAULT_WORLD, ...overrides };
    return {
        ...base,
        paddleSize: base.FIELD_HEIGHT * base.PADDLE_RATIO,
        paddleSpeed: base.FIELD_HEIGHT / 90,
    };
}
