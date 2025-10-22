import { ws } from "../services/ws.js";
import type { ServerState } from "../interfaces/GameInterfaces.js";
import { GameManager } from "../managers/GameManager.js";
import { Settings } from "../game/GameSettings.js";
import { navigate } from "../router/router.js";

type TournamentState = {
  id: string;
  status: "pending" | "active" | "completed";
  round: number;
  players: {
    id: number;
    username?: string;
    score?: number;
    ready?: boolean
  }[];
  // matches is used to place players in the tournament table.
  // This info is sent every time the tournament state changes.
  matches?: {
    // Match ID. Round1: 0,1. Round2: 2
    id: number;
    // 1 (first round) or 2 (final)
    round: number;
    p1: {
      id: number;
      username?: string
    } | undefined;
    p2: {
      id: number;
      username?: string
    } | undefined;
    status: "pending" | "completed";
    winner?: {
      id: number;
      username?: string
    } | null;
  }[];
};

function setSlot(eid: string, user?: { id: number; username?: string }, root?: HTMLElement) {
  const el = root?.querySelector<HTMLElement>(`#${eid}`)!;
  if (!user) return;
  el.textContent = user.username || `Player ${user.id}`;
  el.dataset.userId = String(user.id);
}

// This renders the users in the tournament table
function renderBracket(state: TournamentState, root: HTMLElement) {

  const bracket_ids = ["r1g1_p1", "r1g1_p2", "r1g2_p1", "r1g2_p2"];
  bracket_ids.forEach(id => {
    const el = root.querySelector<HTMLElement>(`#${id}`)!;
    el.textContent = "Waiting for player to join...";
  });

  const other_ids = ["r2_p1", "r2_p2", "winner"];
  other_ids.forEach(id => {
    const el = root.querySelector<HTMLElement>(`#${id}`)!;
    el.textContent = "";
  });

  // If the tournament did not start yet, the matches are not defined.
  // Just list the players that already joined in the table slots.
  if (!state.matches || state.matches.length === 0) {
    const p = state.players || [];
    setSlot("r1g1_p1", p[0], root);
    setSlot("r1g1_p2", p[1], root);
    setSlot("r1g2_p1", p[2], root);
    setSlot("r1g2_p2", p[3], root);
    return;
  }

  // Once the tournament started, we have matches defined.
  // matches = [
  //  -- round 1 --
  //  { id: 0, round: 1, p1: , p2: , ... }, -> Group 1
  //  { id: 1, round: 1, p1: , p2: , ... }, -> Group 2
  //  -- round 2 --
  //  { id: 2, round: 2, p1: , p2: , ... } -> Final
  // ]

  // Round 1. Filter matches with round 1
  const r1 = state.matches.filter(m => m.round === 1);
  // Group 1
  if (r1[0]) {
    setSlot("r1g1_p1", r1[0].p1, root);
    setSlot("r1g1_p2", r1[0].p2, root);
  }
  // Group 2
  if (r1[1]) {
    setSlot("r1g2_p1", r1[1].p1, root);
    setSlot("r1g2_p2", r1[1].p2, root);
  }

  // Round 2. Filter matches with round 2
  const r2 = state.matches.filter(m => m.round === 2);
  if (r2[0]) {
    setSlot("r2_p1", r2[0].p1, root);
    setSlot("r2_p2", r2[0].p2, root);
  }
}

export const TournamentController = async (root: HTMLElement) => {
  // Initialize settings and game
  const settings = new Settings();
  const game = new GameManager(settings);

  // Get current user
  const user = await fetch(`https://${location.host}/api/me`, {
    method: "GET",
    credentials: "include",
  }).then((r) => r.json());

  if (!user?.id) {
    console.error("User not authenticated");
    return () => { };
  }
  const userId = user.id;

  // Connect websocket
  ws.connect(userId);

  // Ensure inputs are sent remotely
  game.getInputHandler().bindRemoteSender((dir) => {
    if (game.getInputHandler().isInputRemote() && ws) {
      ws.send({ type: "input", direction: dir });
    }
  });

  // --- DOM elements ---
  const startBtn = root.querySelector<HTMLButtonElement>("#startBtn");
  const leaveBtn = root.querySelector<HTMLButtonElement>("#leaveBtn");
  const joinBtn = root.querySelector<HTMLButtonElement>("#joinBtn");
  const statusEl = root.querySelector<HTMLDivElement>("#tournamentStatus");

  // --- WebSocket event handlers ---
  const onJoin = (msg: any) => {
    console.log("Tournament join:", msg);
    game.setConfig(msg.gameConfig);
    game.applyServerState(msg.state);
    game.getInputHandler().setRemote(true);
    settings.setOpponent("REMOTE");
  };

  // When the server sends a tournament update (in case of new round, player ready, joined a match)
  const onTournamentUpdate = (msg: { type: "tournamentUpdate"; state: any }) => {
    if (statusEl) {
      statusEl.textContent = `Tournament ${msg.state.id} — ${msg.state.status} — Round ${msg.state.round}`;
    }
    // Render the users in the tournament table.
    renderBracket(msg.state, root);
  };

  const onState = (m: { type: "state"; state: ServerState }) => {
    game.applyServerState(m.state);
  };

  const onEliminated = () => {
    alert("You have been eliminated from the tournament!");
    navigate("/");
  };

  const onComplete = () => {
    alert("You are the winner of this tournament! Well done!");
    navigate("/");
  };

  const onJoinTournament = (m: { type: "joinedTournament"; t_id: string }) => {
    insertTable(m.t_id);
  };

  const insertTable = (t_id: string) => {
    root.querySelectorAll<HTMLElement>('[data-t_id]').forEach(t => t.dataset.t_id = t_id)
  }

  ws.on("join", onJoin);
  ws.on("tournamentUpdate", onTournamentUpdate);
  ws.on("state", onState);
  ws.on("tournamentEliminated", onEliminated);
  ws.on("tournamentComplete", onComplete);
  ws.on("joinedTournament", onJoinTournament);

  // --- Button handlers ---
  const onStart = () => {
    if (ws) ws.send({ type: "ready", userId });
  };

  const onJoinBtn = () => {
    if (ws && ws.userId) {
      ws.send({ type: "joinTournament", userId: ws.userId });
    }
  };

  const onLeaveBtn = () => {
    if (ws) {
      ws.send({ type: "leave", userId });
      ws.close();
    }
    navigate("/");
  };

  startBtn?.addEventListener("click", onStart);
  joinBtn?.addEventListener("click", onJoinBtn);
  leaveBtn?.addEventListener("click", onLeaveBtn);

  // --- Cleanup ---
  return () => {
    onLeave();

    // remove WS listeners
    ws.off("join", onJoin);
    ws.off("tournamentUpdate", onTournamentUpdate);
    ws.off("state", onState);
    ws.off("tournamentEliminated", onEliminated);
    ws.off("tournamentComplete", onComplete);
    ws.off("joinedTournament", onJoinTournament);
    ws.close();

    // remove button listeners
    startBtn?.removeEventListener("click", onStart);
    joinBtn?.removeEventListener("click", onJoinBtn);
    leaveBtn?.removeEventListener("click", onLeaveBtn);
  };

  function onLeave() {
    try {
      ws.send({ type: "leave", userId });
    } catch {
      ws.close();
    }
  }
};
