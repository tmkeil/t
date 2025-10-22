import { GameSettings } from "../interfaces/GameInterfaces.js";

export class Settings {
	private ai_difficulty: 'EASY' | 'MEDIUM' | 'HARD';
	private opponent: 'PERSON' | 'REMOTE' | 'AI';

	constructor() {
		this.ai_difficulty = 'HARD';
		this.opponent = 'REMOTE';
	}

	public setAiDifficulty(difficulty: 'EASY' | 'MEDIUM' | 'HARD') {
		this.ai_difficulty = difficulty;
	}
	
	public getAiDifficulty() {
		return (this.ai_difficulty);
	}

	public setOpponent(opponent: 'PERSON' | 'REMOTE' | 'AI') {
		this.opponent = opponent;
	}

	public getOpponent() {
		return (this.opponent);
	}
}