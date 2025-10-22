export function movePaddles(tempState, inputs, conf) {
    // console.log("Moving paddles with inputs:", inputs);
    const paddleSize = conf.paddleSize;
    const paddleSpeed = conf.paddleSpeed;
    const paddle_acc = conf.PADDLE_ACC;
    const FIELD_HEIGHT = conf.FIELD_HEIGHT;
    const target_p1_spd = inputs.left * paddleSpeed;
    const target_p2_spd = inputs.right * paddleSpeed;
    // Move paddles based on inputs and lerp to smooth the movement by accelerating towards the target speed
    tempState.p1_spd += (target_p1_spd - tempState.p1_spd) * paddle_acc;
    tempState.p2_spd += (target_p2_spd - tempState.p2_spd) * paddle_acc;
    tempState.p1Y += tempState.p1_spd;
    tempState.p2Y += tempState.p2_spd;
    // Clamp paddles within walls
    tempState.p1Y = Math.max(-FIELD_HEIGHT / 2 + paddleSize / 2, Math.min(FIELD_HEIGHT / 2 - paddleSize / 2, tempState.p1Y));
    tempState.p2Y = Math.max(-FIELD_HEIGHT / 2 + paddleSize / 2, Math.min(FIELD_HEIGHT / 2 - paddleSize / 2, tempState.p2Y));
}
export function moveBall(tempState, ballV, conf, realMode) {
    const FIELD_WIDTH = conf.FIELD_WIDTH;
    const FIELD_HEIGHT = conf.FIELD_HEIGHT;
    // Update ball position
    ballV.hspd = Math.max(-1.25, Math.min(1.25, ballV.hspd));
    ballV.vspd = Math.max(-1.25, Math.min(1.25, ballV.vspd));
    tempState.ballX += ballV.hspd;
    tempState.ballY += ballV.vspd;
    tempState.ballX = Math.max(-FIELD_WIDTH / 2, Math.min(FIELD_WIDTH / 2, tempState.ballX));
    tempState.ballY = Math.max(-FIELD_HEIGHT / 2, Math.min(FIELD_HEIGHT / 2, tempState.ballY));
    //	Collision with left paddle
    if (tempState.ballX <= (tempState.p1X + 2 - ballV.hspd)) {
        if (!realMode)
            return;
        //	Goal
        if (tempState.ballY - 1 > (tempState.p1Y + conf.paddleSize / 2)
            || tempState.ballY + 1 < (tempState.p1Y - conf.paddleSize / 2)) {
            tempState.scoreR++;
            tempState.ballX = 0;
            tempState.ballY = 0;
            const v = resetBall();
            ballV.hspd = v.hspd;
            ballV.vspd = v.vspd;
        }
        else //	Block
            ballV.hspd *= -1.01;
    }
    //	Collision with right paddle
    if (tempState.ballX >= (tempState.p2X - 2 - ballV.hspd)) {
        if (!realMode)
            return;
        //	Goal
        if (tempState.ballY - 1 > (tempState.p2Y + conf.paddleSize / 2)
            || tempState.ballY + 1 < (tempState.p2Y - conf.paddleSize / 2)) {
            tempState.scoreL++;
            tempState.ballX = 0;
            tempState.ballY = 0;
            const v = resetBall();
            ballV.hspd = v.hspd;
            ballV.vspd = v.vspd;
        }
        else //	Block
            ballV.hspd *= -1.01;
    }
    //	Bounce off upper and bottom wall
    if (tempState.ballY <= -FIELD_HEIGHT / 2 + 1 || tempState.ballY >= FIELD_HEIGHT / 2 - 1)
        ballV.vspd *= -1;
}
// Reset the ball velocity to a random horizontal direction and a randomized angle between +45 and -45 on the x-axis
// The total speed is constant ~0.3
export function resetBall() {
    const hspd = Math.random() < 0.5 ? -0.5 : 0.5;
    const vspd = Math.random() < 0.5 ? -0.5 : 0.5;
    return { hspd, vspd };
}
