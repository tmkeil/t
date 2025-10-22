import { GameLogic } from "./GameLogic.js";
import { GameScene, GameStatus, BallMesh, PaddleMesh } from "../interfaces/GameInterfaces.js";
import { Derived, movePaddles, moveBall } from "@app/shared";
import { Settings } from "./GameSettings.js";

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
}

export class PaddleLogic {
	private scene: GameScene;
	private gameStatus: GameStatus;
	private gameLogic !: GameLogic;
	private keys: { [key: string]: boolean };
	public lastPredictionTime: number[] = [0, 0];
	private paddle_goal_pos: number[] = [0, 0];
	private conf!: Readonly<Derived>;
	private settings: Settings;

	constructor(scene: GameScene, gameStatus: GameStatus, keys: { [key: string]: boolean }, settings: Settings) {
		this.scene = scene;
		this.gameStatus = gameStatus;
		this.keys = keys;
		this.settings = settings;
	}

	public setGameLogic(gameLogic: GameLogic): void {
		this.gameLogic = gameLogic;
	}

	public setConfig(conf: Readonly<Derived>) {
		this.conf = conf;
	}

	public setScene(scene: GameScene): void {
		this.scene = scene;
	}

	//	Player controls left (W:S) or right (Up:Down) paddle
	public playerPaddleControl(paddle: PaddleMesh): number {
		// console.log("Player controlling paddle");
		let move_dir = 0;

		//	Left paddle
		if (paddle.position.x < 0) {
			if (this.keys["w"] || this.keys["W"])
				move_dir = 1;
			else if (this.keys["s"] || this.keys["S"])
				move_dir = -1;
		}

		//	Right Paddle
		if (paddle.position.x > 0) {
			if (this.keys["ArrowUp"])
				move_dir = 1;
			else if (this.keys["ArrowDown"])
				move_dir = -1;
		}

		//	Return direction and speed to move at
		return (move_dir);
	}


	//	Player controls paddle (W:S / Up:Down)
	public dualPaddleControl(paddle: PaddleMesh): number {
		// console.log("Dual controlling paddle");
		let move_dir = 0;

		//	Move paddle
		if (this.keys["w"] || this.keys["W"]
			|| this.keys["ArrowUp"])
			move_dir = 1;
		else if (this.keys["s"] || this.keys["S"]
			|| this.keys["ArrowDown"])
			move_dir = -1;

		//	Return direction and speed to move at
		return (move_dir);
	}

	//	AI paddle Control
	public aiPaddleControl(paddle: PaddleMesh, ai_level: string) : number {
		const	ball = this.scene.ball;
		const	paddleSpeed = this.conf.paddleSpeed;
		const	paddle_side = (paddle.position.x < 0) ? 0 : 1;
	
		//	Update AI's view of the field once per second
		if (performance.now() - this.lastPredictionTime[paddle_side] > 1000)
		{
			//	Update the to new prediction time
			this.lastPredictionTime[paddle_side] = performance.now();

			//	Move to middle
			if ((paddle_side == 0 && ball.speed.hspd > 0)
			|| (paddle_side == 1 && ball.speed.hspd < 0))
			{
				this.paddle_goal_pos[paddle_side] = 0;
				return (Math.sign(0 - paddle.position.z) * paddleSpeed);
			}

			//	Prediction variables
			let	failsafe = this.conf.FIELD_WIDTH * 1.5;
			let	ball_xx = ball.position.x;
			let	ball_zz = ball.position.z;
			let	ball_hh = ball.speed.hspd;
			let	ball_vv = ball.speed.vspd;
			let	ball_damp = ball.spd_damp;
	
			//	Cut prediction path short
			if (ai_level == 'EASY')
				failsafe /= 4.5;
	
			//	Offset ball direciton a bit to make it less accurate on MEDIUM difficulty
			if (ai_level == 'MEDIUM')
			{
				ball.speed.hspd += 0.15 - (Math.random() * 0.3);
				ball.speed.vspd += 0.15 - (Math.random() * 0.3);
			}
	
			//	Simulate ball movement
			if (paddle.position.x < 0)
			{
				while (ball.position.x > paddle.position.x + 2 && failsafe > 0)
				{
					this.gameLogic.updateBall(false);
					failsafe --;
				}
			}
			else if (paddle.position.x > 0)
			{
				while (ball.position.x < paddle.position.x - 2 && failsafe > 0)
				{
					this.gameLogic.updateBall(false);
					failsafe --;
				}
			}
	
			//	Reset ball to original conditions
			this.paddle_goal_pos[paddle_side] = this.scene.ball.position.z;
			this.scene.ball.position.x = ball_xx;
			this.scene.ball.position.z = ball_zz;
			this.scene.ball.speed.hspd = ball_hh;
			this.scene.ball.speed.vspd = ball_vv;
			this.scene.ball.spd_damp = ball_damp;
		}
	
		//	Return direction for paddle to move
		if (Math.abs(this.paddle_goal_pos[paddle_side] - paddle.position.z) > this.conf.paddleSpeed * 0.25)
			return (Math.sign(this.paddle_goal_pos[paddle_side] - paddle.position.z));
	
		//	Paddle is close to goal, don't move
		return (0);
	}
}