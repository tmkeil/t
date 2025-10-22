import { GameManager } from "../managers/GameManager.js";
import { Settings } from "../game/GameSettings.js";
import { navigate } from "../router/router.js";

export const AIController = (root: HTMLElement) => {
  // --- Game setup ---
  const settings = new Settings();
  const game = new GameManager(settings);

  // By default, play against another local player (can be extended to AI button later)
  settings.setOpponent("AI");
  settings.setAiDifficulty("MEDIUM");
  game.getInputHandler().setRemote(false);

  // --- DOM elements ---
  const startBtn = root.querySelector<HTMLButtonElement>("#startBtn")!;
  const leaveBtn = root.querySelector<HTMLButtonElement>("#leaveBtn")!;
  const easyBtn = root.querySelector<HTMLButtonElement>("#easyBtn")!;
  const mediumBtn = root.querySelector<HTMLButtonElement>("#mediumBtn")!;
  const hardBtn = root.querySelector<HTMLButtonElement>("#hardBtn")!;

  // --- Actions ---
  const onStart = () => {
    if (!game.getGameStatus().playing)
      game.getGameStatus().playing = true;
  };

  const onLeave = () => {
    if (game.getGameStatus().playing)
      game.stopGame();
    navigate("/");
  };

  // --- Button listeners ---
  startBtn.addEventListener("click", onStart);
  leaveBtn.addEventListener("click", onLeave);

  const onEasy = () => {
    if (!game.getGameStatus().playing)
      settings.setAiDifficulty("EASY");
  };
  const onMedium = () => {
    if (!game.getGameStatus().playing)
      settings.setAiDifficulty("MEDIUM");
  };
  const onHard = () => {
    if (!game.getGameStatus().playing)
      settings.setAiDifficulty("HARD");
  };
  // --- Difficulty ---
  easyBtn.addEventListener("click", onEasy);

  mediumBtn.addEventListener("click", onMedium);

  hardBtn.addEventListener("click", onHard);

  // --- Cleanup ---
  return () => {
    // Just stop the game.
    // Don't navigate away again because otherwise it would be an infinite loop =>
    // onLeave calls navigate which calls cleanup which calls onLeave...
    if (game.getGameStatus().playing)
      game.stopGame();
    startBtn.removeEventListener("click", onStart);
    leaveBtn.removeEventListener("click", onLeave);
    easyBtn.removeEventListener("click", onEasy);
    mediumBtn.removeEventListener("click", onMedium);
    hardBtn.removeEventListener("click", onHard);
  };
};
