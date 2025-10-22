import { Derived } from './config.js';
type TmpState = {
    p1X: number;
    p1Y: number;
    p2X: number;
    p2Y: number;
    ballX: number;
    ballY: number;
    scoreL: number;
    scoreR: number;
    p1_spd: number;
    p2_spd: number;
};
export declare function movePaddles(tempState: TmpState, inputs: {
    left: number;
    right: number;
}, conf: Readonly<Derived>): void;
export declare function moveBall(tempState: TmpState, ballV: {
    hspd: number;
    vspd: number;
}, conf: Readonly<Derived>, realMode: boolean): void;
export declare function resetBall(): {
    hspd: number;
    vspd: number;
};
export {};
