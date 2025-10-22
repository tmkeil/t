import { GameStatus, GameScene, ServerState } from "../interfaces/GameInterfaces.js";
import { GameLogic,	PaddleLogic, SceneBuilder } from "../game/index.js";
import { InputHandler } from "./InputHandler.js";
import { Derived, WorldConfig, buildWorld } from '@app/shared';
import { Settings } from "../game/GameSettings.js";

export class GameManager {

	private gameStatus!: GameStatus;
	private inputHandler!: InputHandler;
	private gameLogic!: GameLogic;
	private sceneBuilder!: SceneBuilder;
	private scene!: GameScene;
	private paddleLogic!: PaddleLogic;
	private conf!: Readonly<Derived>;
	private settings: Settings;
	private refresh_time: number;

	constructor(settings: Settings) {
		this.settings = settings;
		this.refresh_time = 60;
		this.initialize();
	}

	public async initialize() {
		// Initialize the game status by fetching the initial state from the server to ensure that the game state is consistent between server and client
		this.gameStatus = {
			scoreL: 0,
			scoreR: 0,
			running: true,
			playing: false,
			timestamp: null,
			p1Y: 0,
			p2Y: 0,
			ballX: 0,
			ballY: 0,
		};
		this.conf = buildWorld();
		// Initialize the input handler to manage user inputs. It listens for user actions and updates the given status object accordingly
		// The input handler is also responsible for sending input data to the server in case of remote
		this.inputHandler = new InputHandler(this.gameStatus);
		// Initialize the scene builder to create and manage the 3D scene using Babylon.js
		this.sceneBuilder = new SceneBuilder("gameCanvas", this.conf);
		// Create the 3D scene and store it in the scene property
		this.scene = this.sceneBuilder.createScene();

		// GameLogic: Updates paddles with PaddleLogic and the ball (in case of local players).
		// And updates the scores texture on the game map
		// send the scene for accessing the game objects (ball/paddles)
		// send the game status for accessing scores
		// send the input handler's keys for processing user inputs
		this.gameLogic = new GameLogic(
			this.scene,
			this.gameStatus,
			this.inputHandler.getKeys(),
			this.settings
		);

		// Paddle logic in case of local players (move paddles based on user input or AI)
		// send the scene for accessing ball/paddles objects
		// gameStatus (scores/running/playing) has currently no use in PaddleLogic
		// send the input handlers key object for processing user inputs to move the paddles
		this.paddleLogic = new PaddleLogic(
			this.scene,
			this.gameStatus,
			this.inputHandler.getKeys(),
			this.settings
		);

		// Link the gamelogic to the paddlelogic to access the updateBall() function
		this.paddleLogic.setGameLogic(this.gameLogic);
		// Link the paddlelogic to the gamelogic to access the paddle control functions
		this.gameLogic.setPaddleLogic(this.paddleLogic);
		this.setUpEventListeners();
		// Start the game loop which updates the game state and renders the scene
		this.gameLogic.setConfig(this.conf);
		this.paddleLogic.setConfig(this.conf);
		this.startGameLoop();
	}

	private setUpEventListeners(): void {
		window.addEventListener("resize", () => {
			this.sceneBuilder.getEngine().resize();
		});

		//	Handle page unload/refresh/close
		window.addEventListener("beforeunload", () => {
			this.cleanup();
		});

		//	Backup for older browsers or different scenarios
		window.addEventListener("unload", () => {
			this.cleanup();
		});

		//	Handle page visibility changes (when user switches tabs)
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				//	Pause the game
				console.log("Page hidden - consider pausing game");
			} else {
				//	Resume the game
				console.log("Page visible again");
			}
		});
	}

	private startGameLoop(): void {
		this.sceneBuilder.getEngine().runRenderLoop(() => {
			// Running is set on true, if the game engine is alive
			if (!this.gameStatus.running) return;
			// If both players are ready.
			// In case of a remote player, it is ready, if 2 joined the room and clicked on ready.
			// update() handles the physics (paddles/ball) of non-remote players and Updates the score texture on the game map
			// If its a remote player, the physics comes from the server.
			// console.log("Game playing status:", this.gameStatus.playing);
			this.refresh_time --;
			if (this.refresh_time <= 0 && this.gameStatus.playing) {
				this.gameLogic.update();
				this.refresh_time = 2;
			}
			// Here the scene will be rendered again
			this.scene.render();
		});
	}

	private cleanup(): void {
		console.log("Cleaning up game resources...");

		//	Clean scene objects
		if (this.scene && !this.scene.isDisposed) this.scene.dispose();

		//	CLean engine
		if (
			this.sceneBuilder.getEngine() &&
			!this.sceneBuilder.getEngine().isDisposed
		)
			this.sceneBuilder.getEngine().dispose();

		//	End game
		this.gameStatus.running = false;
	}

	// Function which is triggered, when the server sends a state update (in case of remote players)
	public applyServerState(s: ServerState): void {
		// console.log("Applying server state:", s);
		this.scene.paddle1.position.z = s.p1Y;
		this.scene.paddle2.position.z = s.p2Y;
		this.scene.ball.position.x = s.ballX;
		this.scene.ball.position.z = s.ballY;

		// Update the game status scores and playing state
		this.gameStatus.scoreL = s.scoreL;
		this.gameStatus.scoreR = s.scoreR;
		this.gameStatus.playing = s.started;
		this.gameStatus.ballX = s.ballX;
		this.gameStatus.ballY = s.ballY;
		this.gameStatus.p1Y = s.p1Y;
		this.gameStatus.p2Y = s.p2Y;
	}

	public resetServerState(): void {
		this.scene.paddle1.position.z = 0;
		this.scene.paddle2.position.z = 0;
		this.scene.ball.position.x = 0;
		this.scene.ball.position.z = 0

		// Update the game status scores and playing state
		this.gameStatus.scoreL = 0;
		this.gameStatus.scoreR = 0;
		this.gameStatus.playing = false;
		this.gameStatus.timestamp = null;
		this.gameStatus.ballX = 0;
		this.gameStatus.ballY = 0;
		this.gameStatus.p1Y = 0;
		this.gameStatus.p2Y = 0;
	}

	public getInputHandler(): InputHandler {
		return this.inputHandler;
	}

	public setConfig(config: Readonly<Derived>): void {
		console.log("Trying to set new game config:", config);
		if (!config) return;

		this.conf = config;
		this.scene = this.sceneBuilder.rebuild(this.conf);
		this.gameLogic.setScene(this.scene);
		this.gameLogic.setConfig(this.conf);
		this.paddleLogic.setScene(this.scene);
		this.paddleLogic.setConfig(this.conf);
	}

	// If its not a remote player, game config will be set locally
	public setLocalConfig(overrides?: Partial<WorldConfig>): void {
		const conf = buildWorld(overrides);
		this.setConfig(conf);
	}

	// If the server sent a start signal, the timestamp will be set in the game status
	public setTimestamp(timestamp: Number): void {
		// The timestamp can be used for synchronizing the game start between multiple clients
		console.log("Game started at:", timestamp);
		this.gameStatus.timestamp = timestamp;
	}

	public getGameStatus(): GameStatus {
		return this.gameStatus;
	}

	public stopGame(): void {
		this.resetServerState();
		this.gameLogic.resetTempStates();

		this.gameLogic.updateScores();
		this.scene.render();
	}
}
