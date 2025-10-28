import { ws } from "../services/ws.js";
import type { ServerState } from "../interfaces/GameInterfaces.js";
import { GameManager } from "../managers/GameManager.js";
import { Derived } from "@app/shared";
import { Settings } from "../game/GameSettings.js";
import { navigate } from "../router/router.js";

// Function to dynamically update enable/disable 2FA button depending on the current user's settings.
async function update2FAButton(userId: number, enable2faBtn: HTMLButtonElement, qrContainer: HTMLDivElement, message: HTMLParagraphElement) {
	
	const userDetailsRes = await fetch(`https://${location.host}/api/users/${userId}`);
	const userDetails = await userDetailsRes.json();
	const mfaEnabled = userDetails?.mfa_enabled === 1;

	// Remove previous click listeners
	enable2faBtn.onclick = null;
	const btn = enable2faBtn;
	message.textContent = "";

	if (mfaEnabled) {
		btn.textContent = "Disable 2FA";
		btn.onclick = async () => {
			const code = prompt("Enter your current 2FA code to disable:");
			if (!code) return;
			btn.disabled = true;
			btn.textContent = "Disabling...";
			try {
				const res = await fetch(`https://${location.host}/api/disable-2fa`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ userId, code }),
					credentials: "include"
				});
				if (res.ok) { //FIXME: For some inexplicable reason, even when the response is NOT ok it still goes in this block.
					message.classList.remove("text-pink-500");
					message.classList.add("text-green-500");
					message.textContent = "2FA Diabled";
					//await update2FAButton(userId, btn, qrContainer, message);
				} else {
					message.classList.remove("text-green-500");
					message.classList.add("text-pink-500");
					message.textContent = "Invalid code or error disabling 2FA.";
					btn.textContent = "Disable 2FA";
				}
			} finally {
				btn.disabled = false;
			}
		};
	} else {
		btn.textContent = "Enable 2FA";
		btn.onclick = async () => {
			btn.disabled = true;
			btn.textContent = "Loading...";
			qrContainer.innerHTML = "";
			try {
				const res = await fetch(`https://${location.host}/api/2fa-setup?userId=${userId}`);
				if (res.ok) {
					const { qr } = await res.json();
					qrContainer.innerHTML = `<div class="text-white mb-2">
						Scan this QR code with your Authenticator app:
						</div><img src="${qr}" alt="2FA QR" style="max-width:220px;">`;
          //await update2FAButton(userId, btn, qrContainer, message);
        } else {
          qrContainer.innerHTML = `<div class="text-red-400">Failed to load QR code.</div>`;
        }
      } catch {
        qrContainer.innerHTML = `<div class="text-red-400">Error loading QR code.</div>`;
      }
      btn.disabled = false;
      btn.textContent = "Enable 2FA";
    };
  }
}

type UsersData = {
  id: number;
  username: string;
  wins: number;
  losses: number;
  level: number;
  created_at: string;
  email?: string;
  avatar_selector?: number;
  status: "ok" | "friend" | "blocked" | "blocked_me" | "request_sent";
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

type FriendRequest = {
  id: number; // request id
  sender_id: number; // user who sent the request
  receiver_id: number; // user who received the request (this user)
  created_at: string;
};

type ChatContext = {
  peerId: number;
  peerName: string;
};
let currentChat: ChatContext | null = null;

// When this user sends a friend request to userId inside the users modal
const sendRequest = async (userId: number, myUserId: number | undefined) => {
  const res = await fetch(`/api/users/${myUserId}/sendFriendRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: userId })
  });
  if (!res.ok) {
    console.error("Failed to send friend request:", res.statusText);
  }
};

// When this user unfriends userId inside the users modal
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

// Same as in Dashboard.ts to get the users with their relationship status to render the user cards
const getUsers = async (): Promise<UsersData[]> => {
  // console.log("Fetching users in Home page...");
  const response = await fetch("/api/users");
  if (!response.ok) {
    console.error("Failed to fetch users:", response.statusText);
    return [];
  }

  const myUserRes = await fetch(`https://${location.host}/api/me`, { method: "GET" });
  if (!myUserRes.ok) {
    console.error("Failed to fetch my user ID:", myUserRes.statusText);
    return [];
  }

  const users: UsersData[] = await response.json();
  const myUserId = (await myUserRes.json()).id;
  if (myUserId === -1) {
    console.error("Failed to fetch my user ID in getUsers() in Home.ts");
    return [];
  }

  // console.log("Fetched users in Home.ts:", users);

  const friendsRes = await fetch(`/api/users/${myUserId}/friends`);
  if (!friendsRes.ok) {
    console.error("Failed to fetch friends:", friendsRes.statusText);
    return [];
  }
  const friendIds = (await friendsRes.json()).map((f: FriendsType) => f.friend_id);

  const blocksRes = await fetch(`/api/users/${myUserId}/blocks`);
  if (!blocksRes.ok) {
    console.error("Failed to fetch blocks:", blocksRes.statusText);
    return [];
  }
  const blockIds = (await blocksRes.json()).map((b: BlocksType) => b.blocked_user_id);

  const blockedMeRes = await fetch(`/api/users/${myUserId}/blockedBy`);
  if (!blockedMeRes.ok) {
    console.error("Failed to fetch users that blocked me:", blockedMeRes.statusText);
    return [];
  }
  const blockedMeIds = (await blockedMeRes.json()).map((b: BlocksType) => b.user_id);

  // Users that I have sent friend requests to
  const sentRequestsRes = await fetch(`/api/users/${myUserId}/sentFriendRequests`);
  if (!sentRequestsRes.ok) {
    console.error("Failed to fetch sent friend requests:", sentRequestsRes.statusText);
    return [];
  }
  const sentRequestIds = (await sentRequestsRes.json()).map((r: any) => r.receiver_id);

  // console.log("Friend IDs in Home.ts:", friendIds);
  // console.log("Block IDs in Home.ts:", blockIds);
  // console.log("Blocked Me IDs in Home.ts:", blockedMeIds);
  // console.log("Sent Request IDs in Home.ts:", sentRequestIds);

  for (const user of users) {
    if (user.id === myUserId)
      user.status = "ok";
    else if (blockIds.includes(user.id))
      user.status = "blocked";
    else if (blockedMeIds.includes(user.id))
      user.status = "blocked_me";
    else if (friendIds.includes(user.id))
      user.status = "friend";
    else if (sentRequestIds.includes(user.id))
      user.status = "request_sent";
    else
      user.status = "ok";
  }
  return users;
};

// Get the friend requests (users who sent this user a friend_request) for the current user
// This will be called whenever the requests modal is opened and on page load to show the notify dot
const getFriendRequests = async (myUserId: number): Promise<FriendRequest[]> => {
  try {
    // console.log("Fetching friend requests in Home page for userId", myUserId);
    const res = await fetch(`/api/users/${myUserId}/friendRequests`);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (e) {
    console.warn("Fetching friend requests failed:", e);
    return [];
  }
};

// Accepts a request. It removes the request from the friend_requests table
// So it will not be shown again via getFriendRequests().
const acceptFriendRequest = async (requestId: number) => {
  try {
    // console.log("Accepting friend request with request id", requestId);
    const res = await fetch(`/api/friendRequests/${requestId}/accept`, { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
  } catch (error) {
    console.error("Error accepting friend request:", error);
  }
};

// Decline a request. It removes the request from the friend_requests table.
// So it will not be shown again via getFriendRequests().
const declineFriendRequest = async (requestId: number) => {
  try {
    // console.log("Declining friend request with request id", requestId);
    const res = await fetch(`/api/friendRequests/${requestId}/decline`, { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
  } catch (error) {
    console.error("Error declining friend request:", error);
  }
};

// This sets up the requests modal (hidden by default) to show the friend requests
const setNotifyDot = (show: boolean) => {
  // console.log("Setting notify dot to", show);
  // Get the notif dot element
  const dot = document.getElementById("notify-dot");
  // If dot should be shown (in case there are pending requests), remove the "hidden" class which sets display: none
  if (show) dot?.classList.remove("hidden");
  // Otherwise add the "hidden" class
  else dot?.classList.add("hidden");
};

// This creates the requests modal in the DOM
// It ensures, that the modal can be opened (when clicking the notifications area in the sidebar)
// and closed (clicking outside the modal or on the close button)
const createRequestsModal = (root: HTMLElement) => {
  // If the modal already exists
  if (root.querySelector("#requests-modal")) return;

  // Create the div container
  const modal = document.createElement("div");
  modal.id = "requests-modal";
  modal.className =
    "fixed inset-0 bg-black/60 flex items-center justify-center z-50 hidden";

  // Modal html.
  // Header: Title and close button
  // Body: ul with the requests
  // Footer: Close button
  modal.innerHTML = `
    <div class="bg-gray-800 border-2 border-gray-300 rounded-lg w-[520px] max-h-[70vh] overflow-hidden shadow-xl">
      <header class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 class="text-white text-xl font-semibold">Friend Requests</h3>
        <button class="modal-close1 text-gray-400 hover:text-white">&times;</button>
      </header>
      <div id="requests-body" class="p-4 overflow-y-auto">
        <ul id="request-list-modal" class="space-y-2 text-white"></ul>
      </div>
      <footer class="p-3 border-t border-gray-700 text-right">
        <button class="modal-close2 px-3 py-1 border-2 border-gray-300 rounded bg-gray-700 text-white hover:bg-teal-400 hover:border-teal-400">Close</button>
      </footer>
    </div>
  `;
  // Append the modal to the body to overlay the page
  document.body.appendChild(modal);

  // Function to hide the modal
  const hide = () => {
    modal.classList.add("hidden");
  }

  // If user clicks outside the modal => hide it
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hide();
  });

  // Close button event listeners
  modal.querySelector(".modal-close1")?.addEventListener("click", hide);
  modal.querySelector(".modal-close2")?.addEventListener("click", hide);
};

// This removes the hidden class from the modal to show it
const openRequestsModal = () => {
  const modal = document.getElementById("requests-modal");
  modal?.classList.remove("hidden");
};

// This binds open/close/submit listeners to the chat modal
const prepareChatModal = async () => {
  // Get the DOM elements from the chat modal
  const modal = document.getElementById("chat-modal")! as HTMLDivElement;
  const closeBtn = document.getElementById("chat-close")! as HTMLButtonElement;
  const form = document.getElementById("chat-form")! as HTMLFormElement;

  // Hide it if user clicks the close button
  const hide = () => modal.classList.add("hidden");
  closeBtn.addEventListener("click", hide);

  // If user clicks outside the modal => hide
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hide();
  });

  // Submit btn => Send a message to server. It gets broadcasted from there to the peer via WS.
  // The peer receives it via ws.on("chat", ...) in HomeController
  form.addEventListener("submit", (e) => {
    // Prevent page reload
    e.preventDefault();
    // Get the text element to retrieve the text from it
    const input = document.getElementById("chat-input") as HTMLInputElement;
    const text = input?.value.trim();
    // If user clicked on submit without a text => just return
    if (!text || !currentChat) return;

    // Append it locally (on the right side and green)
    appendChatMsg(text, true);

    // Send a chat message to the server
    try {
      ws.send({ type: "chat", content: text, to: currentChat.peerId });
    } catch (err) {
      console.error("WS send failed:", err);
    }

    input.value = "";
    input.focus();
  });
};

// Appends a chat message to the chat
// Will be called when the user sends a message (mine: true)
// and when a message is received from the server
const appendChatMsg = (text: string, mine?: boolean, fromName?: string) => {
  const history = document.getElementById("chat-history")!;

  // The message container
  const msgContainer = document.createElement("div");
  // Tailwind: margin auto left/right, text align left/right
  msgContainer.className = `${mine ? "ml-auto text-right" : "mr-auto text-left"}`;

  // The message
  // Tailwind: padding x/y, rounded corners, background color, border
  const msg = document.createElement("div");
  msg.className = `inline-block px-3 py-2 rounded-lg border break-words max-w-[50%]
    ${mine ? "bg-teal-600 border-teal-500 text-white" : "bg-gray-700 border-gray-600 text-gray-100"}`;
  msg.textContent = text;

  // This shows the sender's name above the message
  if (!mine) {
    const label = document.createElement("div");
    // small text, gray with margin bottom
    label.className = "text-xs text-gray-400 mb-0.5";
    label.textContent = fromName!;
    // Append the name above the message
    msgContainer.appendChild(label);
  }

  msgContainer.appendChild(msg);
  history.appendChild(msgContainer);
  // Auto scroll to the bottom
  history.scrollTop = history.scrollHeight;
};


// This renders the friend requests in the ul in the modal
const renderFriendRequests = (
  container: HTMLUListElement,
  requests: FriendRequest[],
  usersById: Map<number, UsersData>,
  onAccept: (id: number) => Promise<void>,
  onDecline: (id: number) => Promise<void>
) => {
  // console.log("Rendering friend requests in modal", requests);
  // console.log("Users by ID map:", usersById);
  container.innerHTML = "";
  // If there are no requests:
  if (!requests.length) {
    container.innerHTML =
      `<li class="text-gray-400">No open requests.</li>`;
    return;
  }

  // Render each request
  for (const r of requests) {
    // Get the sender's object from the usersById map, which contains all users
    const u = usersById.get(r.sender_id);
    // Get the name from the user object
    const senderName = u?.username;

    // Create the li element for the request
    const li = document.createElement("li");
    li.className = "flex items-center justify-between border border-gray-600 p-2 rounded bg-gray-700";
    li.dataset.requestId = String(r.id);

    // A request HTML element with the sender's name, created_at timestamp and accept/decline buttons
    li.innerHTML = `
      <div>
        <div class="font-medium">${senderName}</div>
        <div class="text-xs text-gray-300">From: ${new Date(r.created_at).toLocaleString()}</div>
      </div>
      <div class="flex gap-2">
        <button class="px-2 py-1 border border-gray-300 rounded bg-gray-700 hover:bg-teal-400" data-action="accept">Accept</button>
        <button class="px-2 py-1 border border-gray-300 rounded bg-gray-700 hover:bg-gray-600" data-action="decline">Decline</button>
      </div>
    `;

    // Event listener to a data-action attribute ("accept"/"decline") in the li Element to accept the request
    li.querySelector<HTMLButtonElement>('[data-action="accept"]')?.addEventListener("click", async () => {
      // r.id: request id inside the friend_requests table
      await onAccept(r.id);
    });

    // --"-- to decline the request
    li.querySelector<HTMLButtonElement>('[data-action="decline"]')?.addEventListener("click", async () => {
      await onDecline(r.id);
    });

    // Append the li to the container ul
    container.appendChild(li);
  }
};

// This is for showing the hints dynamically in the tooltip area by binding listeners
const attachTooltipListeners = (root: HTMLElement) => {
  // Get the tooltip element where the hints are shown
  const tooltip = root.querySelector<HTMLDivElement>("#home-tooltip");
  if (!tooltip) return;
  // Array with hints for each game mode button
  const hints: Record<string, string> = {
    "local-1v1": "Play locally against a friend on the same device.",
    "online-1v1": "Find matches online and climb the ranks.",
    "tournament": "Join tournaments and collect titles.",
    "singleplayer-ai": "Train against AI with adjustable difficulty levels.",
  };
  // Attach event listeners to all buttons, that have a data-mode attribute
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    const key = btn.dataset.mode!;
    // Show the hint
    btn.addEventListener("mouseenter", () => {
      tooltip.textContent = hints[key] ?? ""
    });
    // Hide the hint
    btn.addEventListener("mouseleave", () => {
      tooltip.textContent = ""
    });
  });
};

export const HomeController = async (root: HTMLElement) => {
  // Game settings like AI difficulty and opponent type (Remote, AI, Person)
  const settings = new Settings();

  // Game Manager to handle the game logic, state (scores, running, playing, paddleY, ballPos)
  // and rendering and to attach the input handler
  const game = new GameManager(settings);

  // Get the my user from the backend by fetching /api/me and sending the cookie to the server
  const myUserRes = await fetch(`/api/me`, { method: "GET" });
  if (!myUserRes.ok) {
    console.error("Failed to fetch my user ID:", myUserRes.statusText);
    return () => { };
  }

  const myUserId = (await myUserRes.json()).id;
  if (myUserId === -1) {
    console.error("Failed to fetch my user ID");
    return () => { };
  }

  // Function to open and populate the Users Modal
  const openUsersModal = (user: UsersData) => {
    const modal = document.getElementById("users-modal") as HTMLDivElement;
    const usernameEl = document.getElementById("users-username") as HTMLHeadingElement;
    const levelEl = document.getElementById("users-level") as HTMLParagraphElement;
    const avatarEl = document.getElementById("users-avatar") as HTMLDivElement;
    const winsEl = document.getElementById("users-wins") as HTMLDivElement;
    const lossesEl = document.getElementById("users-losses") as HTMLDivElement;
    const winrateEl = document.getElementById("users-winrate") as HTMLDivElement;

    // Populate user data
    usernameEl.textContent = user.username;
    levelEl.textContent = `Level ${user.level}`;
    avatarEl.textContent = user.username.charAt(0).toUpperCase();
    winsEl.textContent = user.wins.toString();
    lossesEl.textContent = user.losses.toString();
    
    const totalGames = user.wins + user.losses;
    const winRate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) : 0;
    winrateEl.textContent = `${winRate}%`;

    // Get action buttons and status message
    const addFriendBtn = document.getElementById("users-add-friend") as HTMLButtonElement;
    const unfriendBtn = document.getElementById("users-unfriend") as HTMLButtonElement;
    const statusMessage = document.getElementById("users-status-message") as HTMLDivElement;

    // Hide all elements initially
    addFriendBtn.classList.add("hidden");
    unfriendBtn.classList.add("hidden");
    statusMessage.classList.add("hidden");

    // Show appropriate button or status message based on user status
    switch (user.status) {
      case "ok":
        addFriendBtn.classList.remove("hidden");
        break;
      case "friend":
        unfriendBtn.classList.remove("hidden");
        break;
      case "blocked":
        statusMessage.textContent = "You have blocked this user";
        statusMessage.className = "w-full px-4 py-2 rounded-md bg-red-600 text-white text-center";
        statusMessage.classList.remove("hidden");
        break;
      case "blocked_me":
        statusMessage.textContent = "This user has blocked you";
        statusMessage.className = "w-full px-4 py-2 rounded-md bg-yellow-600 text-white text-center";
        statusMessage.classList.remove("hidden");
        break;
      case "request_sent":
        statusMessage.textContent = "Friend request sent";
        statusMessage.className = "w-full px-4 py-2 rounded-md bg-purple-600 text-white text-center";
        statusMessage.classList.remove("hidden");
        break;
    }

    // Event listeners on the buttons in the users modal
    addFriendBtn.onclick = async () => {
      console.log("Add friend from users modal:", user.id);
      await sendRequest(user.id, myUserId);
      modal.classList.add("hidden");
      // Refresh friends list
      const users = await getUsers();
      renderFriends(friendsListEl, users, myUserId);
    };

    unfriendBtn.onclick = async () => {
      console.log("Unfriend from users modal:", user.id);
      await unfriend(user.id, myUserId);
      modal.classList.add("hidden");
      // Refresh friends list
      const users = await getUsers();
      renderFriends(friendsListEl, users, myUserId);
    };

    // Show the modal
    modal.classList.remove("hidden");
  };

  // This renders the friends list in the container (sidebar). Friends are users with status
  // "friend" to this user (retrieved from getUsers())
  const renderFriends = (container: HTMLUListElement, users: UsersData[], myUserId: number) => {
    // console.log("Rendering friends list in sidebar...");
    container.innerHTML = "";

    // Get the users from users, which are friends to this user
    const friends = users.filter((u) => u.id !== myUserId && u.status === "friend");

    // If there are no friends, show "No friends yet"
    const empty = document.getElementById("friends-empty");
    if (friends.length === 0) empty?.classList.remove("hidden");
    else empty?.classList.add("hidden");

    // Render each friend in the sidebar
    for (const f of friends) {
      const li = document.createElement("li");
      li.className = "flex justify-between items-center text-white";
      li.setAttribute("data-user-id", f.id.toString());

      const friendName = document.createElement("span");
      friendName.className = "friend_name cursor-pointer hover:text-teal-400";
      friendName.textContent = f.username;

      const chatBtn = document.createElement("button");
      chatBtn.className = "friend_chat underline text-sm hover:text-teal-400";
      chatBtn.setAttribute("data-action", "chat");
      chatBtn.textContent = "chat";

      // Add click handlers
      friendName.addEventListener("click", () => {
        console.log("Opening users modal for friend:", f.username);
        openUsersModal(f);
      });

      chatBtn.addEventListener("click", () => {
        console.log("Opening chat with:", f.username);
        openChatModal(f);
      });

      li.appendChild(friendName);
      li.appendChild(chatBtn);
      container.appendChild(li);
    }
  };

  // This will be called when the user clicks the chat button
  // in the friends list which contains the friend's object
  const openChatModal = (friend: UsersData) => {
    currentChat = { peerId: friend.id, peerName: friend.username };

    const modal = document.getElementById("chat-modal") as HTMLDivElement;
    const uname = document.getElementById("chat-username") as HTMLHeadingElement;
    const history = document.getElementById("chat-history") as HTMLDivElement;
    const avatar = document.getElementById("chat-avatar") as HTMLImageElement;
    const input = document.getElementById("chat-input") as HTMLInputElement;

    // Show the friend's name in the modal header
    uname.textContent = friend.username;
    avatar.textContent = friend.username.charAt(0).toUpperCase();

    // Add click handlers to username and avatar to open Users Modal
    const clickHandler = () => {
      console.log("Opening users modal from chat for:", friend.username);
      openUsersModal(friend);
    };
    
    // Remove previous click handlers and add new ones
    uname.onclick = clickHandler;
    avatar.onclick = clickHandler;
    uname.style.cursor = 'pointer';
    avatar.style.cursor = 'pointer';
    uname.classList.add('hover:text-teal-400');
    avatar.classList.add('hover:bg-gray-600');

    // Clear the chat history (for now. For later perhaps load the the chat history.
    // That would also be useful if this user has multiple chat modals open)
    history.innerHTML = "";

    modal.classList.remove("hidden");

    // Focus the input field: It directly sets the cursor there
    input?.focus();
  };

  // If the userId was successfully fetched, connect the WS with the userId
  ws.connect(myUserId);

  // Bind the input handler to the websocket, in case of remote input to make sure that ws.send({type : "input", ...}) is called
  // whenever the input changes (key up/down)
  game.getInputHandler().bindRemoteSender((dir) => {
    if (game.getInputHandler().isInputRemote() && ws)
      ws.send({ type: "input", direction: dir, userId: myUserId });
  });

  // When the ws receives the message type state from the server, subscribe applyServerState to the message type
  const stateSub = (m: { type: "state"; state: ServerState }) => {
    game.applyServerState(m.state);
  };

  const chatSub = (m: { type: "chat"; userId: number; content: string }) => {
    console.log("Received chat message via WS:", m);
    if (currentChat && m.userId === currentChat.peerId) {
      appendChatMsg(m.content, false, currentChat.peerName);
    }
  };

  ws.on("state", stateSub);

  // When the ws receives a type "chat" message from the server
  ws.on("chat", chatSub);

  // Prepare the chat modal in the DOM and bind the open/close click logic
  prepareChatModal();

  // Users Modal close event listeners
  const usersModal = document.getElementById("users-modal") as HTMLDivElement;
  const usersCloseBtn = document.getElementById("users-close") as HTMLButtonElement;
  
  const closeUsersModal = () => {
    usersModal?.classList.add("hidden");
  };
  
  if (usersCloseBtn) {
    usersCloseBtn.addEventListener("click", closeUsersModal);
  }
  
  if (usersModal) {
    usersModal.addEventListener("click", (e) => {
      if (e.target === usersModal) {
        closeUsersModal();
      }
    });
  }

  // UI Elements from the Home page to fill them dynamically
  const myNameEl = root.querySelector<HTMLDivElement>("#my-name")!;
  const myLevelEl = root.querySelector<HTMLDivElement>("#my-level")!;
  const myWinsEl = root.querySelector<HTMLSpanElement>("#my-wins")!;
  const myLossesEl = root.querySelector<HTMLSpanElement>("#my-losses")!;
  const myWinrateEl = root.querySelector<HTMLSpanElement>("#my-winrate")!;
  const friendsListEl = root.querySelector<HTMLUListElement>("#friends-list")!;
  const notifyArea = root.querySelector<HTMLElement>(".notifications");
  const userDashBtn = root.querySelector<HTMLButtonElement>("#user-dashboard-btn");

  // Prepare the modal in the DOM
  createRequestsModal(root);

  // Get the users. They are needed to render the friends list and the friend requests
  // And for filling my user stats (on the left)
  let users: UsersData[] = await getUsers();
  if (users.length && myUserId) {
    const myUser = users.find((u) => u.id === myUserId);
    if (myUser) {
      myNameEl.textContent = myUser.username;
      myLevelEl.textContent = `Level ${myUser.level}`;
      myWinsEl.textContent = String(myUser.wins);
      myLossesEl.textContent = String(myUser.losses);
      const total = myUser.wins + myUser.losses;
      const rate = total > 0 ? Math.round((myUser.wins / total) * 100) : 0;
      myWinrateEl.textContent = `${rate}%`;
    }
  }

  // Render the friends in the sidebar
  renderFriends(friendsListEl, users, myUserId);

  // This refreshes the friend requests in the modal and sidebar and sets the notify dot if there are pending requests
  // Pending requests are fetched from the backend via getFriendRequests(myUserId)
  const refreshFriendRequestsUI = async () => {
    // console.log("");
    // console.log("Refreshing friend requests UI");
    // Get the requests from the backend
    const reqs = await getFriendRequests(myUserId);
    // Show the notify dot, if there are pending requests
    setNotifyDot(reqs.length > 0);

    // Modal befüllen
    const usersById = new Map(users.map((u) => [u.id, u]));
    const listInModal = document.getElementById("request-list-modal") as HTMLUListElement;

    const onAccept = async (id: number) => {
      try {
        await acceptFriendRequest(id);
      } catch (e) {
        console.error("Accept request failed:", e);
      } finally {
        // Get new pending requests and re-render the requests in the modal
        const newReqs = await getFriendRequests(myUserId);
        // Get the new user relations
        const newUsers = await getUsers();
        users = newUsers;
        // Rerender friends list and requests list
        renderFriends(friendsListEl, users, myUserId);
        // users: UsersData[] into a Map of userId -> UsersData to get
        renderFriendRequests(listInModal, newReqs, new Map(users.map((u) => [u.id, u])), onAccept, onDecline);
        // Update the notify dot
        setNotifyDot(newReqs.length > 0);
      }
    };

    const onDecline = async (id: number) => {
      try {
        await declineFriendRequest(id);
      } catch (e) {
        console.error("Decline request failed:", e);
      } finally {
        const newReqs = await getFriendRequests(myUserId);
        renderFriendRequests(listInModal, newReqs, usersById, onAccept, onDecline);
        setNotifyDot(newReqs.length > 0);
      }
    };

    renderFriendRequests(listInModal, reqs, usersById, onAccept, onDecline);
  };

  await refreshFriendRequestsUI();

  // Event listener for the notify area. When clicking => open requests modal
  notifyArea?.addEventListener("click", openRequestsModal);

  async function userDashBtnClick() {
    navigate("/dashboard");
  }

  // Event listener for the dashboard button
  userDashBtn?.addEventListener("click", userDashBtnClick);
	// When the ws receives the message type state from the server, subscribe these callback/lambda functions to the message type via ws.ts
	ws.on("state", (m: { type: "state"; state: ServerState }) => {
		game.applyServerState(m.state);
	});

	const localBnt = root.querySelector<HTMLButtonElement>(".local_play");
	if (localBnt) {
		localBnt.addEventListener('click', () => {
			navigate("/local");
		});
	}

	const AIBnt = root.querySelector<HTMLButtonElement>(".ai_play");
	if (AIBnt) {
		AIBnt.addEventListener('click', () => {
			navigate("/ai");
		});
	}

	const RemoteBnt = root.querySelector<HTMLButtonElement>(".remote_play");
	if (RemoteBnt) {
		RemoteBnt.addEventListener('click', () => {
			navigate("/remote");
		});
	}

	const tournamentBnt = root.querySelector<HTMLButtonElement>(".tournament_play");
	if (tournamentBnt) {
		tournamentBnt.addEventListener('click', () => {
			navigate("/tournament");
		});
	}

	const buttons = root.querySelectorAll<HTMLButtonElement>('.menu button');
	const tooltip = root.querySelector<HTMLDivElement>('.tooltip');
	buttons.forEach(btn => {
		btn.addEventListener('mouseenter', () => {
			if (tooltip)
				tooltip.textContent = btn.getAttribute('data-tooltip') || "";
		});
		btn.addEventListener('mouseleave', () => {
			if (tooltip)
				tooltip.textContent = "";
		});
	});

  // Settings modal logic
	const settingsBtn = root.querySelector<HTMLButtonElement>("#settingsBtn");
	const settingsModal = root.querySelector<HTMLDivElement>("#settingsModal");
	const closeSettingsBtn = root.querySelector<HTMLButtonElement>("#closeSettingsBtn");
	const enable2faBtn = root.querySelector<HTMLButtonElement>("#enable2faBtn");
	const qrContainer = root.querySelector<HTMLDivElement>("#qrContainer");
	const logoutBtn = root.querySelector<HTMLButtonElement>("#logoutBtn");
	const deleteAccountBtn = root.querySelector<HTMLButtonElement>("#deleteAccountBtn");
	const deletionForm = root.querySelector<HTMLFormElement>("#deletionForm");
	const deletePasswordInput = root.querySelector<HTMLInputElement>("#deletePassword");
	const confirmDeleteBtn = root.querySelector<HTMLButtonElement>("#confirmDeleteBtn");
	const mfaToggleMessage = root.querySelector<HTMLParagraphElement>('#mfaToggleMessage');

	if (settingsBtn && settingsModal && closeSettingsBtn && enable2faBtn && qrContainer && logoutBtn
		&& deleteAccountBtn && deletionForm && deletePasswordInput && confirmDeleteBtn && mfaToggleMessage) {

		settingsBtn.addEventListener("click", () => {
			settingsModal.classList.remove("hidden");
			qrContainer.innerHTML = "";
			if (enable2faBtn)
        		update2FAButton(myUserId, enable2faBtn, qrContainer, mfaToggleMessage);
		});

		closeSettingsBtn.addEventListener("click", () => {
			settingsModal.classList.add("hidden");
			qrContainer.innerHTML = "";
		});

		logoutBtn.addEventListener("click", async () => {
			try {
				await fetch("/api/logout", { method: "POST" });
				navigate("/login");
			} catch {}
		});

		deleteAccountBtn.addEventListener("click", () => {
			deletionForm.classList.remove("hidden");
			deletePasswordInput.value = "";
			deletePasswordInput.focus();
		});

		deletionForm.addEventListener("submit", async (event) => {
			event.preventDefault();
			const password = deletePasswordInput.value.trim();
			if (password) {
				try {
					const res = await fetch(`https://${location.host}/api/delete-account`, {
						method: "POST",
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ userId: myUserId, password }),
						credentials: "include"
					});
					if (res.ok)
						navigate("/login");
					deletePasswordInput.value = "";
					deletePasswordInput.placeholder = "Invalid password"
				} catch (err) {
					console.error("Something went wrong");
				}
			} else {
				deletePasswordInput.placeholder = "Please enter your password";
			}
		});

		closeSettingsBtn.addEventListener("click", () => {
			settingsModal.classList.add("hidden");
			qrContainer.innerHTML = "";
			deletionForm.classList.add("hidden");
			deletePasswordInput.value = "";
		});
	}

  // Set up Users Modal close handlers
  const usersModalSetup = document.getElementById("users-modal") as HTMLDivElement;
  const usersCloseBtnSetup = document.getElementById("users-close") as HTMLButtonElement;
  
  if (usersCloseBtnSetup) {
    usersCloseBtnSetup.addEventListener("click", () => {
      usersModalSetup.classList.add("hidden");
    });
  }
  
  if (usersModalSetup) {
    usersModalSetup.addEventListener("click", (e) => {
      if (e.target === usersModalSetup) {
        usersModalSetup.classList.add("hidden");
      }
    });
  }

  // Binds the tooltip listeners
  attachTooltipListeners(root);
  return () => {

    // Unsubscribe from WS messages
    ws.off("state", stateSub);
    ws.off("chat", chatSub);
    
    // Close the WS connection
    ws.close();

    notifyArea?.removeEventListener("click", openRequestsModal);
    userDashBtn?.removeEventListener("click", userDashBtnClick);
  };
};
