import { buildWorld, resetBall } from "@app/shared";

let nextRoomId = 0;
export const rooms = [];
// export const rooms = new Map();

export class Room {
  constructor() {
    this.id = nextRoomId++;
    this.players = new Map();
  // build config first so we can derive paddle X positions
  this.config = buildWorld();
  this.state = this.initState();
  const halfW = this.config.FIELD_WIDTH / 2;
  // Place paddles slightly inside the left/right edges so server physics can detect collisions
  this.tempState = { p1X: -halfW + 1, p1Y: 0, p2X: halfW - 1, p2Y: 0, ballX: 0, ballY: 0, scoreL: 0, scoreR: 0, p1_spd: 0, p2_spd: 0 };
    this.ballV = resetBall();
    this.loopInterval = null;
    this.inputs = { left: 0, right: 0 };
    // As optional parameters to override the default values e.g. buildWorld({ FIELD_WIDTH: 120, FIELD_HEIGHT: 50 })
  }

  initState() {
    return {
      p1X: 0,
      p2X: 0,
      p1Y: 0,
      p2Y: 0,
      ballX: 0,
      ballY: 0,
      scoreL: 0,
      scoreR: 0,
      started: false,
      timestamp: null
    };
  }


  closeRoom(room) {
    if (!room) return;

    // Stop loop if running
    if (room.loopInterval) {
      clearInterval(room.loopInterval);
      room.loopInterval = null;
    }

    // Inform and close all sockets
    for (const [ws] of room.players) {
      if (ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ type: "reset" }));
          ws.close();
        } catch {}
      }
    }

    // Clear player map
    room.players.clear();

    // Remove from global rooms array
    const idx = rooms.findIndex(r => r.id === room.id);
    if (idx !== -1) rooms.splice(idx, 1);

    console.log(`Closed room ${room.id}`);
  }


  addPlayer(userId, ws) {
    // If this player is already in the room, do nothing
    const side = this.players.size % 2 === 0 ? "left" : "right";

    // Avoid using null/undefined as Map keys — create a lightweight placeholder socket object
    let sock = ws;
    if (!sock) {
      sock = {
        // marker so other code can detect placeholder sockets
        _isPlaceholder: true,
        // mimic websocket readyState closed
        readyState: 3,
        // no-op send/close to be safe
        send: () => {},
        close: () => {},
      };
    }

    this.players.set(sock, { id: userId, side: side, ready: false, userId });
    console.log(`User ${userId} added to room ${this.id}`);
    // attach room metadata to the socket placeholder/real socket
    try { sock._roomId = this.id; } catch {}
    try { sock._side = side; } catch {}
  }

  removePlayer(ws) {
    this.players.delete(ws);
    console.log(`Player removed from room ${this.id}`);

    // If this room is part of a tournament, handle automatic win
    if (this.tournamentManager && this.matchId !== undefined) {
      // Find remaining player
      const remainingPlayer = [...this.players.values()][0];
      if (remainingPlayer) {
        // Award remaining player the win
        this.tournamentManager.recordMatchResult(this.matchId, remainingPlayer.id);
      }
    }
  }

  getPlayer(ws) {
    return this.players.get(ws);
  }

  get(roomId) {
    return rooms[roomId];
  }
}

export function getOrCreateRoom() {
  // const index = rooms.findIndex(room => room.id === ws._roomId);
  // const room = rooms[index];
  let room = rooms.length > 0 ? rooms[rooms.length - 1] : null;
  if (!room) {
    room = new Room();
    rooms.push(room);
  }
  return room;
}