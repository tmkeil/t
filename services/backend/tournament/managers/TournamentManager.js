import { shufflePlayers } from "../utils/shuffle.js";
import { Room, rooms } from "../../gameRooms.js";
import crypto from 'node:crypto';

export class TournamentManager {
  constructor() {
    this.tournament = {
      id: crypto.randomUUID(),
      size: 4,
      rooms: [],
      players: [],
      matches: [],
      round: 0,
      status: "pending",
      waitingArea: [],
    };
    this.matchCounter = 0;
  }

  hasPlayer(uId) {
    const is = this.tournament.players.find((p) => p.id === uId)
    return (is);
  }

  addPlayer(player, ws) {
    if (this.tournament.players.find((p) => p.id === player.id)) {
      throw new Error("Player already joined this tournament");
    }

    if (this.tournament.players.length >= this.tournament.size) {
      throw new Error("Tournament is already full");
    }

    this.tournament.players.push({ ...player, ws });
    if (this.tournament.players.length === this.tournament.size) {
      this.startTournament(ws);
    }
    this.broadcastTournament();
  }

  startTournament(ws) {
    const shuffled = shufflePlayers(this.tournament.players);
    const matches = [];

    for (let i = 0; i < this.tournament.size; i += 2) {
      const m = this.createMatch(shuffled[i], shuffled[i + 1], 1)
      matches.push(m);
      // ws.send(JSON.stringify({ type: 'tournamentGroup', group: m.id }))
    }

    this.tournament.matches = matches;
    this.tournament.round = 1;
    this.tournament.status = "active";
    this.broadcastTournament();
  }

  cleanup() {
    console.log(`Cleaning up tournament ${this.tournament.id}`);

    // Stop any active rooms
    for (const match of this.tournament.matches) {
      if (match.room) {
        if (match.room.loopInterval) {
          clearInterval(match.room.loopInterval);
          match.room.loopInterval = null;
        }

        // Close sockets
        for (const [ws] of match.room.players) {
          if (ws && ws.readyState === 1) {
            try { ws.send(JSON.stringify({ type: "reset" })); ws.close(); } catch {}
          }
        }

        match.room.players.clear();

        // Remove from global rooms array
        const idx = rooms.findIndex(r => r.id === match.room.id);
        if (idx !== -1) rooms.splice(idx, 1);
      }
    }

    this.tournament.players = [];
    this.tournament.waitingArea = [];
    this.tournament.matches = [];
    this.tournament.status = "completed";
  }


  createMatch(p1, p2, round) {
    const room = new Room();
    rooms.push(room);

    // Add both players into the room (use provided ws if present; gameRooms will make safe placeholders)
    room.addPlayer(p1.id, p1.ws);
    room.addPlayer(p2.id, p2.ws);

    // assign match id and backref so loop/record logic can find the tournament context
    const matchId = this.matchCounter++;
    room.matchId = matchId;
    room.tournamentManager = this;

    // Tell each player they joined (only for real connected sockets)
    for (const [ws, player] of room.players) {
      // only send to actual open websocket connections
      if (ws && typeof ws.send === "function" && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({
            type: "join",
            roomId: room.id,
            side: player.side,
            gameConfig: room.config,
            state: room.state,
          }));
        } catch (err) {
          // ignore send errors for now
          console.warn("Failed to send join to player socket:", err?.message || err);
        }
      }
    }

    return {
      id: matchId,
      round,
      time: Date.now(),
      room,
      p1,
      p2,
      winner: null,
      loser: null,
      status: "pending",
    };
  }


  handleDisconnect(userId) {
    const tournament = this.getTournament();
    if (!tournament) return;

    // CASE 1: Tournament not started yet
    if (tournament.status === "pending") {
      tournament.players = tournament.players.filter(p => p.id !== userId);
      this.broadcastTournament();
      return;
    }

    // CASE 2: Tournament already active
    if (tournament.status === "active") {
      const match = tournament.matches.find(
        m => m.status === "pending" && (m.p1.id === userId || m.p2.id === userId)
      );
      if (match) {
        const winner = match.p1.id === userId ? match.p2 : match.p1;
        if (winner)
          this.recordMatchResult(match.id, winner.id);
      }
    }
  }


  getTournament() {
    return this.tournament;
  }


  broadcastTournament() {
    const tournament = this.getTournament();
    
    // Remove anything non-serializable
    const stateToSend = {
      id: tournament.id,
      status: tournament.status,
      round: tournament.round,
      players: tournament.players.map(p => ({
        id: p.id,
        username: p.username,
        score: p.score || 0,
        ready: p.ready || false
      })),
      matches: tournament.matches.map(m => ({
        id: m.id,
        round: m.round,
        p1: m.p1 ? {
          id: m.p1.id,
          username: m.p1.username
        } : null,
        p2: m.p2 ? {
          id: m.p2.id,
          username: m.p2.username
        } : null,
        status: m.status,
        winner: m.winner ? {
          id: m.winner.id,
          username: m.winner.username
        } : null
      }))
    };

    for (const player of tournament.players) {
      if (player.ws && player.ws.readyState === 1) {
        try {
          player.ws.send(JSON.stringify({
            type: "tournamentUpdate",
            state: stateToSend
          }));
        } catch (err) {
          console.warn("Failed to send tournamentUpdate to player", player.id, err?.message || err);
        }
      }
    }
  }



  recordMatchResult(matchId, winnerId) {
    const match = this.tournament.matches.find((m) => m.id == matchId);
    if (!match) throw new Error("Match not found");

    match.winner = match.p1.id === winnerId ? match.p1 : match.p2;
    match.loser = match.p1.id === winnerId ? match.p2 : match.p1;
    match.status = "completed";

    // Stop the room loop
    if (match.room.loopInterval) {
      clearInterval(match.room.loopInterval);
      match.room.loopInterval = null;
    }

    // Close the room so losers are disconnected
    for (const [ws, player] of match.room.players) {
      if (player.id === match.loser.id) {
        match.room.players.delete(ws);
        if (ws && ws.readyState === 1) {
          try {
            ws.send(JSON.stringify({ type: "tournamentEliminated" }));
            ws.close();
          } catch {}
        }
      }
    }

    // Remove losers from tournament
    this.tournament.players = this.tournament.players.filter(
      (p) => p.id !== match.loser.id
    );

    // Add winner to waiting area
    this.tournament.waitingArea.push(match.winner);

    this.checkRoundReady();
    this.broadcastTournament();
  }


  checkRoundReady() {
    const currentRoundMatches = this.tournament.matches.filter(
      (m) => m.round === this.tournament.round
    );

    if (!currentRoundMatches.every((m) => m.status === "completed")) return;

    const winners = this.tournament.waitingArea;
    const champion = winners[0];

    if (winners.length === 1) {
      this.tournament.status = "completed";
      champion.ws.send(JSON.stringify({ type: "tournamentComplete" }));
      this.cleanup();
      return;
    }

    this.advanceRound();
  }

  advanceRound() {
    const winners = this.tournament.waitingArea;
    this.tournament.size /= 2;
    this.tournament.waitingArea = [];

    const newMatches = [];
    for (let i = 0; i < winners.length; i += 2) {
      newMatches.push(
        this.createMatch(winners[i], winners[i + 1], this.tournament.round + 1)
      );
    }

    this.tournament.matches.push(...newMatches);
    this.tournament.round++;
    this.broadcastTournament();
  }
}