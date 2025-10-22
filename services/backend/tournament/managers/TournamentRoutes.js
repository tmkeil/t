import { TournamentManager } from "./TournamentManager.js";

let tournaments = {};

export default async function tournamentRoutes(fastify) {
  // Join tournament
  /*fastify.post("/tournaments/join", async (req, reply) => {
    const { player } = req.body;

    // Look for a pending tournament that isn’t full
    let manager = Object.values(tournaments).find(
      (t) => t.getTournament().status === "pending" && t.getTournament().players.length < 4
    );

    if (!manager) {
      manager = new TournamentManager();
      tournaments[manager.getTournament().id] = manager;
    }

    manager.addPlayer(player, null);
    return manager.getTournament();
  });*/

  // Report result
  fastify.post("/tournaments/:id/matches/:matchId/result", async (req, reply) => {
    const { id, matchId } = req.params;
    const { winnerId } = req.body;

    const manager = tournaments[id];
    manager.recordMatchResult(matchId, winnerId);
    return manager.getTournament();
  });

  // Get tournament state
  fastify.get("/tournaments/:id", async (req, reply) => {
    const { id } = req.params;
    return tournaments[id]?.getTournament();
  });
}