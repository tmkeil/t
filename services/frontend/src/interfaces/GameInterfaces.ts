//	import * as BABYLON from 'babylonjs';

//	Game Status

// room.state:
// p1Y: 0,
// p2Y: 0,
// ballX: 0,
// ballY: 0,
// scoreL: 0,
// scoreR: 0,
// started: false,
// timestamp: null

export interface UserData {
	id: number;
	username: string;
	email: string;
	wins: number;
	losses: number;
	level: number;
	created_at: string;
}

export interface ServerState {
	p1Y: number;
	p2Y: number;
	ballX: number;
	ballY: number;
	scoreL: number;
	scoreR: number;
	started: boolean;
	timestamp: Number | null;
}

export interface GameStatus extends BABYLON.Scene {
	p1Y:	number,
	p2Y:	number,
	ballX:	number,
	ballY:	number,
	scoreL:	number,
	scoreR:	number,
	running:	boolean,
	playing:	boolean,
	timestamp: Number | null;
}

//	Speed values
export interface Speed {
	hspd:	number,
	vspd:	number
}

//	Ball Info
export interface BallMesh extends BABYLON.Mesh {
	speed:		Speed;
	position:	BABYLON.Vector3;
	spd_damp:	number;
}

//	Paddle Info
export interface PaddleMesh extends BABYLON.Mesh {
	speed:		Speed;
	position:	BABYLON.Vector3;
}

//	Game Settings
export interface GameSettings {
	opponent:		'PERSON' | 'REMOTE' | 'AI';
	ai_difficulty:	'EASY' | 'MEDIUM' | 'HARD';
}

export interface GameScene extends BABYLON.Scene {
	//	Game objects
	ball:		BallMesh;
	paddle1:	PaddleMesh;
	paddle2:	PaddleMesh;
	leftWall:	BABYLON.Mesh;
	rightWall:	BABYLON.Mesh;
	upperWall:	BABYLON.Mesh;
	bottomWall:	BABYLON.Mesh;
	scores:		BABYLON.DynamicTexture;

	//	Static scene elements
	ground:		BABYLON.Mesh;
	midline:	BABYLON.Mesh;
	camera:		BABYLON.ArcRotateCamera;

	// Lighting
	defaultLight: BABYLON.Light;
}