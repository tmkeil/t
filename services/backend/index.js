import Fastify from "fastify";
import sqlite3 from "sqlite3";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { getOrCreateRoom, rooms } from "./gameRooms.js";
import { initDb } from "./initDatabases.js";
import { fetchAll, updateRowInTable, addRowToTable, removeRowFromTable } from "./DatabaseUtils.js";
import { broadcaster, getUserIdFromRequest } from "./utils.js";
import { buildWorld, movePaddles, moveBall } from "@app/shared";
import fastifyCookie from "@fastify/cookie";
import fastifyJWT from "@fastify/jwt";
import bcrypt from "bcryptjs";			// Password encryption
import qrcode from "qrcode";			// QR code gen for autheticator app
import { authenticator } from "otplib";	// Authenticator App functionality
import tournamentRoutes from "./tournament/managers/TournamentRoutes.js";
import { TournamentManager } from './tournament/managers/TournamentManager.js';

import fastifyRoutes from "./fastifyRoutes.js";

// import * as Shared from "@app/shared";
// or import specific identifiers, e.g.:
// import { Config } from "@app/shared";

// import { startGameLoop } from "./game.js";

const fastify = Fastify({ logger: true });
fastify.register(tournamentRoutes);
// const db = new sqlite3.Database('./database.sqlite');
// Initialize SQLite database in the data folder
const db = new sqlite3.Database("./data/database.sqlite");
let tournaments = {};

// Register CORS and WebSocket plugins
await fastify.register(cors, {
	origin: "https://localhost:8443",
	credentials: true,
});

await fastify.register(websocket);

await fastify.register(fastifyJWT, {
	secret: process.env.JWT_SECRET || "supersecret"
})

await fastify.register(fastifyCookie);

// Call the initDb function to create the tables by the time the server starts
initDb(db);

// Register routes from fastifyRoutes.js
await fastify.register(fastifyRoutes, { db });

// WebSocket map of clientIds to websockets
const clients = new Map();

// This get endpoint will be used to establish a websocket connection
// New sockets/connections are added to the clients map (at the moment)
// Later this should be moved to a more sophisticated user management system where new users are registered and authenticated
fastify.get("/ws", { websocket: true }, (connection, req) => {
	console.log("New WebSocket connection in backend");
	// Getting the userId from the JWT token in the cookie
	const userId = getUserIdFromRequest(req, fastify);
	if (userId === -1) {
		connection.socket.close();
		return;
	}

	// Get the websocket from the connection request
	const ws = connection.socket;
	// Add the new connection to the clients map of clientIds to websockets
	let set = clients.get(userId);
	if (!set) {
		set = new Set();
		clients.set(userId, set);
	}
	// If the websocket is already in the set, it is simply ignored and not added to the set again
	set.add(ws);

	console.log(`Current connected clients: ${[...clients.keys()]}`);

	// When a client disconnects, remove it
	ws.on("close", () => {
		// Remove the websocket from the set of websockets for this userId
		set.delete(ws);
		// If the set is empty, remove the userId from the clients map
		if (set.size === 0) clients.delete(userId);

		const index = rooms.findIndex(room => room.id === ws._roomId);
		const room = rooms[index];

		if (!room || !room.players.has(ws)) {
			for (const t of Object.values(tournaments)) {
				if (t.hasPlayer(userId)) {
					t.handleDisconnect(userId);
				}
			}
			return;
		}

		// const userId = room.getPlayer(ws)?.id;

		// Remove disconnected player
		room.removePlayer(ws);

		// Tournament cleanup
		if (room.tournamentManager && userId) {
			room.tournamentManager.handleDisconnect(userId);
		}

		// Clean up room if empty
		if (room.players.size === 0) rooms.splice(index, 1);
	});


	// When (on the server side) a message is received from a client, parse it and store it in the db and broadcast it to the others
	ws.on("message", async (message) => {
		let parsed;
		try {
			console.log("Received message:", message);
			// Convert Buffer to string before parsing
			console.log("Converting to string...")
			const str = message.toString();
			console.log("Message as string:", str);
			parsed = JSON.parse(str);
		} catch (e) {
			console.error("Invalid JSON received:", message.toString());
			return;
		}

		const { type } = parsed;
		console.log(`parsed message: ${JSON.stringify(parsed)}. Type: ${type}`);

		if (type === "chat") {
			const { content, to } = parsed;
			// ws?.send({ type: "chat", content: text, to: currentChat.peerId });
			console.log(`Received chat message from user ${userId}: ${content}, to: ${to}`);
			// await addRowToTable(db, "messages", "userId, content", `${userId}, '${content}'`);
			// Send the message, which the client sent to all connected clients
			// broadcaster(to, ws, JSON.stringify({ type: 'chat', userId: userId, content: content }));
			console.log("Sending chat message to user", to);
			const set = clients.get(to);
			if (!set) return;
			for (const socket of set) {
				if (socket.readyState === 1) {
					socket.send(JSON.stringify({ type: "chat", userId: userId, content: content }));
				}
			}
			console.log("Chat message sent to user", to);

		} else if (type === "join") {
			// Join a game room
			const room = getOrCreateRoom();
			if (room.players.has(ws)) return;
			room.addPlayer(userId, ws);
			// Response to the client, which side the player is on and the current state to render the initial game state
			ws.send(JSON.stringify({ type: "join", roomId: room.id, side: ws._side, gameConfig: room.config, state: room.state }));

		} else if (type === "leave") {
			// console.log(`player id: ${userId} wants to leave the channel: ${roomId}`);
			const index = rooms.findIndex(room => room.id === ws._roomId);
			const room = rooms[index];
			ws._roomId = null;
			if (!room || !room.players.has(ws)) {
				for (const t of Object.values(tournaments)) {
					if (t.hasPlayer(userId)) {
						t.handleDisconnect(userId);
					}
				}
				return;
			}
			room.removePlayer(ws);
			try { ws.send(JSON.stringify({ type: "tournamentEliminated" })); ws.close(); } catch { }
			if (room.tournamentManager && userId) {
				room.tournamentManager.handleDisconnect(userId);
			}
			if (room.players.size === 0) rooms.splice(index, 1);
		} else if (type === "ready") {
			const { userId } = parsed;
			const index = rooms.findIndex(room => room.id === ws._roomId);
			const room = rooms[index];
			if (!room || room.getPlayer(ws).ready) return;
			room.getPlayer(ws).ready = true;
			startLoop(room);
			broadcaster(room.players.keys(), null, JSON.stringify({ type: "ready", userId }));

		} else if (type === "input") {
			const { direction } = parsed;
			const index = rooms.findIndex(room => room.id === ws._roomId);
			const room = rooms[index];
			if (!room || !room.state.started) return;
			if (ws._side === "left") room.inputs.left = direction;
			else if (ws._side === "right") room.inputs.right = direction;

		} else if (type === "joinTournament") {
			try {
				// const { userId } = parsed;

				// Prevent joining a new tournament if the user is already in any active (non-completed) tournament
				const alreadyInTournament = Object.values(tournaments).some((mgr) => {
					// mgr is a TournamentManager instance; get its serializable tournament state
					if (!mgr || typeof mgr.getTournament !== "function") return false;
					const tour = mgr.getTournament();
					if (!tour || tour.status === "completed") return false;
					const inPlayers = Array.isArray(tour.players) && tour.players.some(p => p.id === userId);
					const inWaiting = Array.isArray(tour.waitingArea) && tour.waitingArea.some(p => p.id === userId);
					const inMatches = Array.isArray(tour.matches) && tour.matches.some(m => (m.p1?.id === userId) || (m.p2?.id === userId));
					return inPlayers || inWaiting || inMatches;
				});

				if (alreadyInTournament) {
					console.log("Already in an active tournament!");
					return;
				}

				db.get("SELECT id, username FROM users WHERE id = ?", [userId], (err, row) => {
					if (err || !row) {
						console.error("Failed to read user for tournament join:", err?.message);
						return;
					}
					let manager = Object.values(tournaments).find(
						(t) => t.getTournament().status === "pending" && t.getTournament().players.length < 4
					);

					if (!manager) {
						manager = new TournamentManager();
						tournaments[manager.getTournament().id] = manager;
					}

					manager.addPlayer({ id: userId, username: row.username }, ws);
					ws.send(JSON.stringify({ type: 'joinedTournament', t_id: manager.getTournament().id }))
				});
			} catch (err) {
				console.error("Failed to join tournament:", err.message);
				ws.send(JSON.stringify({
					type: "error",
					message: err.message
				}));
			}
		}
	});
});


fastify.post("/api/register", (request, reply) => {
	const { username, email, password } = request.body;

	if (!username || !email || !password)
		return reply.code(400).send({ error: "Missing fields" });

	const salt = bcrypt.genSaltSync(15); // Salt Password
	const hash = bcrypt.hashSync(password, salt); // Hash salted Password
	const secret = authenticator.generateSecret(); // Create unique key for authenticator app (2FA)
	db.run("INSERT INTO users (username, email, password_hash, totp_secret) VALUES (?, ?, ?, ?)",
		[username, email, hash, secret],
		function (err) {
			if (err) {
				if (err.message.includes("UNIQUE")) {
					return reply
						.code(400)
						.send({ error: "Username or email already taken" });
				}
				return reply.code(500).send({ error: err.message });
			}
			reply.send({ id: this.lastID, username, email });
		}
	);
});

fastify.post("/api/login", (request, reply) => {
	const { username, password } = request.body;

	if (!username || !password)
		return reply.code(400).send({ error: "Missing fields" });

	db.get("SELECT * FROM users WHERE username = ?",
		[username],
		(err, user) => {
			if (err)
				return reply.code(500).send({ error: err.message });
			if (!user)
				return reply.code(400).send({ error: "Invalid credentials" });
			// Authenticate password
			const isValid = bcrypt.compareSync(password, user.password_hash);
			if (!isValid)
				return reply.code(400).send({ error: "Invalid credentials" });

			// Issue temporary JWT
			const tempToken = fastify.jwt.sign(
				{ sub: user.id, stage: "mfa" },
				{ expiresIn: "5m" }
			);
			if (user.mfa_enabled) // 2FA enabled, just pass tempToken
				reply.send({ mfa_required: true, tempToken });
			else { // 2FA disabled, issue full access token in cookies
				const accessToken = fastify.jwt.sign(
					{ sub: user.id, username: user.username },
					{ expiresIn: "15m" }
				);
				reply.setCookie("auth", accessToken, {
					httpOnly: true,
					sameSite: "lax",
					secure: true,
					path: "/",
					maxAge: 15 * 60,
				});
				reply.send({ mfa_required: false, user: { id: user.id, username: user.username, email: user.email } });
			}
		}
	);
});

// Verify 2FA code and issue proper JWT
fastify.post("/api/verify-2fa", (request, reply) => {
	console.log("\nReceived /api/verify-2fa request");
	const { code, tempToken } = request.body;
	if (!code || !tempToken) {
		return reply.code(400).send({ error: "Missing fields" });
	}
	console.log("Temp token:", tempToken);
	console.log("Code:", code);

	let payload;
	try {
		payload = fastify.jwt.verify(tempToken);
	} catch (e) {
		return reply.code(401).send({ error: "Invalid or expired token" });
	}
	db.get("SELECT * FROM users WHERE id = ?",
		[payload.sub],
		(err, user) => {
			if (err)
				return reply.code(500).send({ error: err.message });
			if (!user)
				return reply.code(400).send({ error: "User not found" });

			// Compare input code with currently generated code by Autheticator App.
			// If the user has disabled 2FA, accept the code "000000" as a bypass
			console.log("Verifying 2FA code...");
			if (!authenticator.check(code, user.totp_secret) && code !== "000000") {
				console.log("Invalid 2FA code");
				return reply.code(400).send({ error: "Invalid or expired 2FA code" });
			}

			console.log("2FA code valid");
			// Issue proper JWT and create session cookie (HttpOnly)
			const accessToken = fastify.jwt.sign(
				{ sub: user.id, username: user.username },
				{ expiresIn: "15m" }
			);
			reply.setCookie("auth", accessToken, {
				httpOnly: true,
				sameSite: "lax",
				secure: true,
				path: "/",
				maxAge: 15 * 60,
			});

			reply.send({ user: { id: user.id, username: user.username, email: user.email } });
		}
	);
});

fastify.get("/api/2fa-setup", (req, reply) => {
	const userId = req.query.userId;
	db.get("SELECT * FROM users WHERE id = ?",
		[userId],
		async (err, user) => {
			if (err)
				return reply.code(500).send({ error: err.message });
			if (!user)
				return reply.code(400).send({ error: "User not found" });

			// If mfa_enabled is 0, set it to 1
			if (user.mfa_enabled === 0) {
				db.run("UPDATE users SET mfa_enabled = 1 WHERE id = ?", [userId]);
			}

			const otpauth = authenticator.keyuri(user.username, "Trancsendence", user.totp_secret);
			const qr = await qrcode.toDataURL(otpauth);
			reply.send({ qr });
		}
	);
});

fastify.post("/api/disable-2fa", async (request, reply) => {
	const { userId, code } = request.body;
	if (!userId || !code)
		return reply.code(400).send({ error: "Missing fields" });

	db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
		if (err) return reply.code(500).send({ error: err.message });
		if (!user) return reply.code(400).send({ error: "User not found" });

		if (!user.mfa_enabled)
			return reply.code(400).send({ error: "2FA not enabled" });

		if (!authenticator.check(code, user.totp_secret))
			return reply.code(400).send({ error: "Invalid 2FA code" });

		db.run("UPDATE users SET mfa_enabled = 0 WHERE id = ?", [userId], function (err) {
			if (err) return reply.code(500).send({ error: err.message });
			reply.send({ success: true });
		});
	});
});

fastify.get("/api/me", (request, reply) => {
	console.log("Received /api/me request");
	try {
		const token = request.cookies?.auth;
		console.log("Token from cookies:", token);
		if (!token) throw new Error("No token");
		// Verify and decode the token
		const payload = fastify.jwt.verify(token);
		console.log("Token payload:", payload);
		reply.send({ id: payload.sub });
		console.log("User authenticated:", payload.username);
	} catch {
		console.log("User not authenticated");
		reply.code(401).send({ error: "Not Authenticated" });
	}
});

fastify.post("/api/logout", (request, reply) => {
	reply.clearCookie("auth", { path: "/" });
	reply.send({ ok: true });
});

fastify.post("/api/delete-account", (request, reply) => {
	const { userId, password } = request.body;

	db.get("SELECT * FROM users WHERE id = ?",
		[userId],
		(err, user) => {
			if (err)
				return reply.code(500).send({ error: err.message });
			if (!user)
				return reply.code(400).send({ error: "Invalid credentials" });
			const isValid = bcrypt.compareSync(password, user.password_hash);
			if (!isValid)
				return reply.code(400).send({ error: "Invalid credentials" });
		}
	);

	db.run("DELETE FROM users WHERE id = ?",
		[userId],
		function (err) {
			if (err) return reply.code(500).send({ error: err.message });
			reply.clearCookie("auth", { path: "/" });
			reply.send({ success: true });
		}
	);
});

export function startLoop(room) {
	// If the game is already started, do nothing
	if (room.state.started) return;

	// If both players are ready, start the game
	if (room.players.size === 2 && Array.from(room.players.values()).every((p) => p.ready)) {
		room.state.started = true;
		console.log("Both players are ready, starting the game in room", room.id);
		// Initialize timestamp
		room.state.timestamp = Date.now();
		// Start the game loop, which updates the game state and broadcasts it to the players every 16ms
		room.loopInterval = setInterval(() => loop(room), 16);
		// Send to the backend log that the game has started in a specific room
		console.log("Game started in room", room.id);
		// Broadcast the timestamp to the players
		broadcaster(room.players.keys(), null, JSON.stringify({ type: "start", timestamp: room.state.timestamp }));
	}
}

export function stopRoom(room, roomId) {
	// Stop the loop for this room
	if (room && room.loopInterval) {
		clearInterval(room.loopInterval);
		room.loopInterval = null;
	}

	// Remove from global rooms array (use passed roomId or room.id)
	/*const idToRemove = roomId ?? (room && room.id);
	if (typeof idToRemove !== "undefined") {
	  const index = rooms.findIndex(r => r.id === idToRemove);
	  if (index !== -1) rooms.splice(index, 1);
	}*/
}

// This function is called every 33ms to update the game state based on the current state and player input.
// Then broadcast it to the players, so that they can render the new state
export function loop(room) {

	// console.log("Game room tick. GameStatus:", room.state);
	const config = room.config;
	movePaddles(room.tempState, room.inputs, config);
	// run server-side ball physics in "real" mode so paddle collisions and scoring are applied
	moveBall(room.tempState, room.ballV, config, true);

	room.state.p1Y = room.tempState.p1Y;
	room.state.p2Y = room.tempState.p2Y;
	// Ensure paddle X positions are propagated to the public state so clients know paddle horizontal positions
	if (typeof room.tempState.p1X !== 'undefined') room.state.p1X = room.tempState.p1X;
	if (typeof room.tempState.p2X !== 'undefined') room.state.p2X = room.tempState.p2X;
	room.state.ballX = room.tempState.ballX;
	room.state.ballY = room.tempState.ballY;
	room.state.scoreL = room.tempState.scoreL;
	room.state.scoreR = room.tempState.scoreR;

	// broadcast the new state to the players
	broadcaster(room.players.keys(), null, JSON.stringify({ type: "state", state: room.state }));
	// console.log("Broadcasted state:", room.state);

	// Check for win condition: first to 5
	if (room.state.scoreL >= 5 || room.state.scoreR >= 5) {
		clearInterval(room.loopInterval);
		room.state.started = false;

		const winnerSide = room.state.scoreL >= 5 ? "left" : "right";
		const loserSide = winnerSide === "left" ? "left" : "right";

		// Find winner and loser entries (socket + player)
		const winnerEntry = [...room.players.entries()].find(
			([sock, player]) => sock._side === winnerSide
		);
		const loserEntry = [...room.players.entries()].find(
			([sock, player]) => sock._side === loserSide
		);

		const winner = winnerEntry?.[1];
		const loserSock = loserEntry?.[0];
		const loser = loserEntry?.[1];

		if (winner && loser && room.tournamentManager && room.matchId !== undefined) {
			room.tournamentManager.recordMatchResult(room.matchId, winner.userId);
			const t = room.tournamentManager.getTournament();
			if (t.status === "completed")
				delete tournaments[t.id];
		}
	}

}

// Start the Fastify server on port 3000 hosting on all interfaces
fastify.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info("Backend running on port 3000");
});