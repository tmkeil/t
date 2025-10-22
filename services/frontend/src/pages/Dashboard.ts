import { ws } from "../services/ws.js";
import type { ServerState, UserData } from "../interfaces/GameInterfaces.js";
import { GameManager } from "../managers/GameManager.js";
import { Derived } from "@app/shared";
import { Settings } from "../game/GameSettings.js";

type UsersData = {
  id: number;
  username: string;
  wins: number;
  losses: number;
  level: number;
  created_at: string;
  email?: string;
  status: "ok" | "friend" | "blocked" | "blocked_me";
};

type FriendsType = {
  id: number;
  user_id: number;
  friend_id: number;
  created_at: string;
};

type BlocksType = {
  id: number;
  user_id: number;
  blocked_user_id: number;
  created_at: string;
};

const getUsers = async () => {
  const response = await fetch("/api/users");
  if (!response.ok) {
    console.error("Failed to fetch users:", response.statusText);
    return [];
  }

  // Get my userId from the backend
  const myUserRes = await fetch(`https://${location.host}/api/me`, { method: "GET", credentials: "include" });
  if (!myUserRes.ok) {
    console.error("Failed to fetch my user ID:", myUserRes.statusText);
    return [];
  }

  const users: UsersData[] = await response.json();
  const myUserId = (await myUserRes.json()).id;
  if (myUserId === -1) {
    console.error("Failed to fetch my user ID");
    return [];
  }

  // Get myUser from the users list
  const myUser = users.find(u => u.id === myUserId);

  if (!myUser) {
    console.error("Failed to find my user in the users list");
    return [];
  }

  // Users that are my friends
  const friendsRes = await fetch(`/api/users/${myUserId}/friends`);
  if (!friendsRes.ok) {
    console.error("Failed to fetch friends:", friendsRes.statusText);
    return [];
  }
  const friendIds = (await friendsRes.json()).map((f: FriendsType) => f.friend_id);

  // Users that I have blocked
  const blocksRes = await fetch(`/api/users/${myUserId}/blocks`);
  if (!blocksRes.ok) {
    console.error("Failed to fetch blocks:", blocksRes.statusText);
    return [];
  }
  const blockIds = (await blocksRes.json()).map((b: BlocksType) => b.blocked_user_id);

  // Users that have blocked me
  const blockedMeRes = await fetch(`/api/users/${myUserId}/blockedBy`);
  if (!blockedMeRes.ok) {
    console.error("Failed to fetch users that blocked me:", blockedMeRes.statusText);
    return [];
  }
  const blockedMeIds = (await blockedMeRes.json()).map((b: BlocksType) => b.user_id);
  
  console.log("Friends:", friendIds);
  console.log("Blocks:", blockIds);
  console.log("Blocked me:", blockedMeIds);

  for (const user of users) {
    // If the user is myself, set status to "ok"
    if (user.id === myUserId) {
      console.log("This is my user:", user.id);
      user.status = "ok";
    }
    // If the user is in my blocks list, set status to "blocked"
    else if (blockIds.includes(user.id)) {
      console.log("User is blocked:", user.id);
      user.status = "blocked";
    }
    // If the user has blocked me, set status to "blocked_me"
    else if (blockedMeIds.includes(user.id)) {
      console.log("User has blocked me:", user.id);
      user.status = "blocked_me";
    }
    // If the user is in my friends list, set status to "friend"
    else if (friendIds.includes(user.id)) {
      console.log("User is friend:", user.id);
      user.status = "friend";
    }
    // Otherwise, set status to "ok"
    else {
      console.log("User is ok:", user.id);
      user.status = "ok";
    }
  }
  return users;
};

const sendRequest = async (userId: number, myUserId: number | undefined) => {
  const res = await fetch(`/api/users/${myUserId}/sendFriendRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: userId })
  });
  if (!res.ok) {
    console.error("Failed to add friend:", res.statusText);
  }
};

const unfriend = async (userId: number, myUserId: number | undefined) => {
  const res = await fetch(`/api/users/${myUserId}/unfriend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: userId })
  });
  if (!res.ok) {
    console.error("Failed to unfriend user:", res.statusText);
  }
};

const block = async (userId: number, myUserId: number | undefined) => {
  const res = await fetch(`/api/users/${myUserId}/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockId: userId })
  });
  if (!res.ok) {
    console.error("Failed to block user:", res.statusText);
  }
};

const unblock = async (userId: number, myUserId: number | undefined) => {
  console.log("Unblock user function called with:", userId, myUserId);
  const res = await fetch(`/api/users/${myUserId}/unblock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unblockId: userId })
  });
  if (!res.ok) {
    console.error("Failed to unblock user:", res.statusText);
  }
};

export const mountDashboard = async (root: HTMLElement) => {

  // Get the userId from localStorage
  const userId = (await fetch(`https://${location.host}/api/me`, { method: "GET" }).then(r => r.json())).id;
  if (!userId) {
    console.error("User not authenticated");
    return;
  }
  // const userId = Number(localStorage.getItem("userId") || "0");
  // if (userId === 0) {
  //   console.error("No userId found in localStorage");
  //   return;
  // }

  let users: UsersData[] = await getUsers();

  if (users.length === 0) {
    console.error("No users found from the server");
    return;
  }
  const myUser: UsersData | undefined = users.find(u => u.id === userId);
  if (!myUser) {
    console.error("Current user not found in users list");
    return;
  }

  // My Dashboard elements
  const myNameEl = root.querySelector("#my-name") as HTMLDivElement;
  const myLevelEl = root.querySelector("#my-level") as HTMLDivElement;
  const myWinsEl = root.querySelector("#my-wins") as HTMLSpanElement;
  const myLossesEl = root.querySelector("#my-losses") as HTMLSpanElement;
  const myWinrateEl = root.querySelector("#my-winrate") as HTMLSpanElement;
  const myAvatarEl = root.querySelector("#my-avatar") as HTMLDivElement;
  // Update the My Dashboard section with the user's data
  myNameEl.textContent = myUser.username;
  myLevelEl.textContent = `Level ${myUser.level}`;
  myWinsEl.textContent = myUser.wins.toString();
  myLossesEl.textContent = myUser.losses.toString();
  const totalGames = myUser.wins + myUser.losses;
  const winRate = totalGames > 0 ? Math.round((myUser.wins / totalGames) * 100) : 0;
  myWinrateEl.textContent = `${winRate}%`;

  // Function to create a user card element
  const createUserCard = (user: UsersData, myUser: UsersData | undefined) => {
    const li = document.createElement("li");
    const wins = user.wins;
    const losses = user.losses;
    const level = user.level;

    li.innerHTML = `
    <li class="usercard" data-user-id="${user.id}" data-status="${user.status}">
        <div class="usercard_left">
          <div class="avatar">A</div>
          <div class="usercard_meta">
            <div class="usercard_name">${user.username}</div>
            <div class="usercard_level">Level ${level}</div>
          </div>
        </div>

        <div class="usercard_stats">
          Wins: <span data-wins>${wins}</span> | Losses: <span data-losses>${losses}</span>
        </div>

        <div class="badge"></div>

        <div class="usercard_actions">
          <button class="btn btn--primary" data-action="add-friend">Add Friend</button>
          <button class="btn btn--ghost" data-action="unfriend">Unfriend</button>
          <button class="btn btn--ghost" data-action="block">Block</button>
          <button class="btn btn--ghost" data-action="unblock">Unblock</button>
        </div>
      </li>`;

      // Reference the buttons
      const addFriendBtn = li.querySelector('[data-action="add-friend"]') as HTMLButtonElement;
      const unfriendBtn = li.querySelector('[data-action="unfriend"]') as HTMLButtonElement;
      const blockBtn = li.querySelector('[data-action="block"]') as HTMLButtonElement;
      const unblockBtn = li.querySelector('[data-action="unblock"]') as HTMLButtonElement;

      addFriendBtn.addEventListener("click", async () => {
          console.log("Sending friend request to: ", user.id);
          await sendRequest(user.id, myUser?.id);
          users = await getUsers();
          renderUserCards(usersListEl, users, userId, myUser);
      });

      unfriendBtn.addEventListener("click", async () => {
          console.log("Unfriend user: ", user.id);
          await unfriend(user.id, myUser?.id);
          users = await getUsers();
          renderUserCards(usersListEl, users, userId, myUser);
      });

      blockBtn.addEventListener("click", async () => {
          console.log("Block user:", user.id);
          await block(user.id, myUser?.id);
          users = await getUsers();
          renderUserCards(usersListEl, users, userId, myUser);
      });

      unblockBtn.addEventListener("click", async () => {
          console.log("Unblock user:", user.id);
          await unblock(user.id, myUser?.id);
          users = await getUsers();
          renderUserCards(usersListEl, users, userId, myUser);
      });

      return li;
  };

  // Populate the User Dashboard with user cards
  const renderUserCards = (container: HTMLUListElement, users: UsersData[], userId: number, myUser: UsersData | undefined) => {
    console.log("Rendering user cards, total users:", users.length);
    console.log("Users data:", users);
    container.innerHTML = "";
    for (const user of users) {
      if (user.id === userId)
        continue;
      const userCard = createUserCard(user, myUser);
      container.appendChild(userCard);
    }
  };

  // Reference the ul element to append user cards to
  const usersListEl = root.querySelector("#users-list") as HTMLUListElement;
  // Render the user cards
  renderUserCards(usersListEl, users, userId, myUser);

  // User Dashboard elements
  const searchInput = root.querySelector("#user-search") as HTMLInputElement;

  return () => {
    console.log("Unmounting Dashboard");
  };
}
