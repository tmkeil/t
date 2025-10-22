// WorldConfig parameters
export type WorldConfig = {
    FIELD_WIDTH: number;
    FIELD_HEIGHT: number;
    PADDLE_RATIO: number;
    PADDLE_ACC: number;
};

// Default WorldConfig values which will be used if no custom config is provided
export const DEFAULT_WORLD: WorldConfig = {
    FIELD_WIDTH: 100,
    FIELD_HEIGHT: 40,
    PADDLE_RATIO: 1 / 6,
    PADDLE_ACC: 0.2
};

// Derived WorldConfig which includes paddleSize and paddleSpeed
export type Derived = WorldConfig & {
    paddleSize: number;
    paddleSpeed: number;
};

// This will return a WorldConfig object with default values overridden by provided "overrides"
export function buildWorld(overrides: Partial<WorldConfig> = {}): Derived {
  // The base config is the DEFAULT_WORLD overridden by any provided overrides
  const base = { ...DEFAULT_WORLD, ...overrides };
  return {
    ...base,
    paddleSize: base.FIELD_HEIGHT * base.PADDLE_RATIO,
    paddleSpeed: base.FIELD_HEIGHT / 90,
  };
}