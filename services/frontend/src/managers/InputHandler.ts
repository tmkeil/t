import { GameStatus } from "../interfaces/GameInterfaces.js";
//import { RemotePlayerManager } from "./RemotePlayerManager.js";

export class InputHandler {
	private keys:		Record<string, boolean> = {};
	private usedKeys:	string[] = ["w", "s", "ArrowUp", "ArrowDown", "W", "S"];
	private game:		GameStatus;

	private isRemote = false;
	private lastDir: -1 | 0 | 1 = 0;
	private sendRemote?: (dir: -1 | 0 | 1) => void;

	constructor (game: GameStatus) {
		// The game status object to update based on user input
		this.game = game;
		// Set up event listeners for key presses and releases
		this.setUpEventListeners();
	}

	public bindRemoteSender(fn: (dir: -1 | 0 | 1) => void): void {
		this.sendRemote = fn;
	}

	public setRemote(isRemote: boolean): void {
		this.isRemote = isRemote;
	}

	public isInputRemote() : boolean {
		return (this.isRemote);
	}

	private setUpEventListeners() : void {
		document.addEventListener("keydown", (ev) => {
			if (!this.usedKeys.includes(ev.key)) return;
			console.log("Key pressed:", ev.key);
			this.keys[ev.key] = true;
			if (this.isRemote) this.sendRemoteInput();
		});

		document.addEventListener("keyup", (ev) => {
			if (!this.usedKeys.includes(ev.key)) return;
			this.keys[ev.key] = false;
			if (this.isRemote) this.sendRemoteInput();
		});
	}

	private sendRemoteInput() : void {
		if (!this.sendRemote) return;

		const up = this.keys["w"] || this.keys["ArrowUp"] || this.keys["W"];
		const down = this.keys["s"] || this.keys["ArrowDown"] || this.keys["S"];
		const dir = up && !down ? 1 : (!up && down ? -1 : 0);
		if (dir !== this.lastDir) {
			this.lastDir = dir;
			this.sendRemote(dir);
		}
	}

	public getKeys() : { [key : string] : boolean } {
		return (this.keys);
	}
}
