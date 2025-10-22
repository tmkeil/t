import { Settings } from "./GameSettings.js";
import { PaddleLogic } from "./PaddleLogic.js";
import { GameScene, GameStatus/*, BallMesh, PaddleMesh*/ } from "../interfaces/GameInterfaces.js";
import { Derived, movePaddles, moveBall, resetBall } from "@app/shared";

export class GameLogic {
	private scene: GameScene;
	private gameStatus: GameStatus;
	private keys: { [key: string]: boolean };
	private conf!: Readonly<Derived>;
	private paddleLogic !: PaddleLogic;
	private ballV = resetBall();
	private tempState = { p1X: 0, p1Y: 0, p2X: 0, p2Y: 0, ballX: 0, ballY: 0, scoreL: 0, scoreR: 0, p1_spd: 0, p2_spd: 0 };
	private settings: Settings;
	//private shakeTimeout: number | null = null;

	constructor(scene: GameScene, gameStatus: GameStatus, keys: Record<string, boolean>, settings: Settings) {
		this.scene = scene;
		this.gameStatus = gameStatus;
		this.keys = keys;
		this.settings = settings;
		this.tempState = {
			p1X: scene.paddle1.position.x,
			p1Y: scene.paddle1.position.y,
			p2X: scene.paddle2.position.x,
			p2Y: scene.paddle2.position.y,
			ballX: 0, ballY: 0,
			scoreL: 0, scoreR: 0,
			p1_spd: 0, p2_spd: 0
		};	
	}

	public setScene(scene: GameScene): void {
		this.scene = scene;
	}

	public setConfig(conf: Readonly<Derived>) {
		this.conf = conf;
	}

	public setPaddleLogic(paddleLogic: PaddleLogic): void {
		this.paddleLogic = paddleLogic;
	}

	public update(): void
	{
		if (this.settings.getOpponent() === 'REMOTE')
		{
			this.updateScores();
			return;
		}

		// LOCAL/AI: Use direct Babylon.js object manipulation
		console.log(this.scene.ball.speed);
		const p1 = this.settings.getOpponent() === 'AI'
			? this.paddleLogic.dualPaddleControl(this.scene.paddle1)
			: this.paddleLogic.playerPaddleControl(this.scene.paddle1);

		const p2 = this.settings.getOpponent() === 'AI'
			? this.paddleLogic.aiPaddleControl(this.scene.paddle2, this.settings.getAiDifficulty())
			: this.paddleLogic.playerPaddleControl(this.scene.paddle2);

		// Move paddles directly
		const paddleSpeed = this.conf.paddleSpeed;
		const paddleAcc = this.conf.PADDLE_ACC;
		this.scene.paddle1.speed.vspd += ((p1*paddleSpeed) - this.scene.paddle1.speed.vspd) * paddleAcc;
		this.scene.paddle2.speed.vspd += ((p2*paddleSpeed) - this.scene.paddle2.speed.vspd) * paddleAcc;
		this.scene.paddle1.position.z += this.scene.paddle1.speed.vspd;
		this.scene.paddle2.position.z += this.scene.paddle2.speed.vspd;

		// Clamp paddles within field
		const halfField = this.conf.FIELD_HEIGHT / 2;
		const halfPaddle = this.conf.paddleSize / 2;
		this.scene.paddle1.position.z = Math.max(-halfField + halfPaddle, Math.min(halfField - halfPaddle, this.scene.paddle1.position.z));
		this.scene.paddle2.position.z = Math.max(-halfField + halfPaddle, Math.min(halfField - halfPaddle, this.scene.paddle2.position.z));

		this.updateBall(true);
		this.updateScores();
    }


	public updateBall(real_mode: boolean) : void {
		const	ball = this.scene.ball;
		const	paddle1 = this.scene.paddle1;
		const	paddle2 = this.scene.paddle2;
		const	paddleSize = this.conf.paddleSize;

		if (ball.speed.hspd == 0)
			ball.speed.hspd = (Math.random() < 0.5 ? -this.conf.FIELD_WIDTH : this.conf.FIELD_WIDTH) / 150;
		if (ball.speed.vspd == 0)
			ball.speed.vspd = (Math.random() < 0.5 ? -this.conf.FIELD_HEIGHT : this.conf.FIELD_HEIGHT) / 200;


		//	Update ball position based on speed attribute
		ball.position.x = Math.max(-this.conf.FIELD_WIDTH, Math.min(this.conf.FIELD_WIDTH, ball.position.x));
		ball.position.z = Math.max(-this.conf.FIELD_HEIGHT, Math.min(this.conf.FIELD_HEIGHT, ball.position.z));
		ball.speed.hspd = Math.max(-1.25, Math.min(1.25, ball.speed.hspd));
		ball.speed.vspd = Math.max(-1.25, Math.min(1.25, ball.speed.vspd));
		ball.position.x += ball.speed.hspd * ball.spd_damp;
		ball.position.z += ball.speed.vspd * ball.spd_damp;
		if (ball.spd_damp < 1)
			ball.spd_damp += 0.01;

		//	Collision with left paddle
		if (ball.position.x <= (paddle1.position.x - ball.speed.hspd))
		{
			if (!real_mode)
				return;
			
			//	Goal
			if (ball.position.z - 1 > (paddle1.position.z + paddleSize / 2)
			|| ball.position.z + 1 < (paddle1.position.z - paddleSize / 2))
			{
				this.resetBall();
				this.gameStatus.scoreR ++;
			}
			else	//	Block
			{
				ball.speed.hspd *= -1.01;
				this.screenshake(ball.speed.hspd);
			}
		}

		//	Collision with right paddle
		if (ball.position.x >= (paddle2.position.x - ball.speed.hspd))
		{
			if (!real_mode)
				return;
			
			//	Goal
			if (ball.position.z - 1 > (paddle2.position.z + paddleSize / 2)
			|| ball.position.z + 1 < (paddle2.position.z - paddleSize / 2))
			{
				if (!real_mode)
					return;
				this.resetBall();
				this.gameStatus.scoreL ++;
			}
			else	//	Block
			{
				ball.speed.hspd *= -1.01;
				this.screenshake(ball.speed.hspd);
			}
		}

		//	Bounce off upper and bottom wall (reverse vertical speed)
		if ((ball.position.z > (this.scene.upperWall.position.z - ball.speed.vspd - 1) && ball.speed.vspd > 0)
			|| (ball.position.z < (this.scene.bottomWall.position.z - ball.speed.vspd + 1) && ball.speed.vspd < 0))
		{
			if (real_mode)
				this.screenshake(ball.speed.vspd);
			ball.speed.vspd *= -1;
			//	Additional offset to avoid wall-clipping
			ball.position.z += ball.speed.vspd;
		}
	}

	private resetBall() : void {
		const	ball = this.scene.ball;
	
		//	Reset Ball position to origin
		ball.position.x = 0;
		ball.position.z = 0;
		ball.spd_damp = 0;

		//	Randomize direction for next serve
		ball.speed.hspd *= Math.random() < 0.5 ? -1 : 1;
		ball.speed.vspd *= Math.random() < 0.5 ? -1 : 1;

		//	Reset paddle AI cooldowns
		this.paddleLogic.lastPredictionTime[0] = 0;
		this.paddleLogic.lastPredictionTime[1] = 0;

		//	Pause game after score
		// this.gameStatus.playing = false;
	}


	private updateScores(): void {
		this.scene.scores.clear();
		this.scene.scores.drawText(this.gameStatus.scoreL + "    " + this.gameStatus.scoreR, null, 120, "bold 100px Segoe UI, monospace", "white", "#002D2D", true, true);
	}

	private screenshake(force: number): void {
		const camera = this.scene.camera;
		if (!camera)
			return;

		//	Set shake values
		const shakeMagnitude = (force * 0.02) + Math.random() * force * 0.01;
		const shakeDuration = 500;	//in milliseconds
		const startTime = performance.now();

		//	Fade shake until 'shakeDirection' fades
		const animateShake = (now: number) => {
			const progress = Math.min((now - startTime) / shakeDuration, 1);
			const fade = 1 - progress;
			const cam = camera as any;

			if (progress < 1)
			{
				camera.alpha = cam.og_alpha + (Math.random() - 0.5) * shakeMagnitude * fade;
				camera.beta = cam.og_beta + (Math.random() - 0.5) * shakeMagnitude * fade;
				camera.radius = cam.og_radius + (Math.random() - 0.5) * shakeMagnitude * fade;
				requestAnimationFrame(animateShake);
			}
			else
			{
				camera.alpha = cam.og_alpha;
				camera.beta = cam.og_beta;
				camera.radius = cam.og_radius;
			}
		};
		animateShake(startTime);
	}

	public resetTempStates(): void {
		this.ballV = resetBall();
		this.tempState = { p1X: 0, p1Y: 0, p2X: 0, p2Y: 0, ballX: 0, ballY: 0, scoreL: 0, scoreR: 0, p1_spd: 0, p2_spd: 0 };
	}
}