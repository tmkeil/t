
import { fetchAll, addRowToTable, removeRowFromTable } from "./DatabaseUtils.js";

export default async function (fastify, options) {
    const db = options.db;

    // Get all users (without password_hash and totp_secret) from the db
    fastify.get("/api/users", async (request, reply) => {
        let params = [];
        const fields = "id, username, wins, losses, level, created_at, status";
        let sql = `SELECT ${fields} FROM users ORDER BY created_at DESC`;
        try {
            const rows = await fetchAll(db, sql, params);
            console.log("Fetched users: ", rows);
            reply.send(rows);
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Get a user by userId from the db (without password_hash and totp_secret)
    fastify.get("/api/users/:id", async (request, reply) => {
        console.log("Received request for user id:", request.params.id);
        const userId = parseInt(request.params.id);
        if (!userId) {
            return reply.code(400).send({ error: "Invalid user ID" });
        }
        const fields = 'id, username, email, wins, losses, level, created_at, status, mfa_enabled';
        try {
            console.log("Fetching user with fields:", fields);
            const rows = await fetchAll(db, `SELECT ${fields} FROM users WHERE id = ?`, [userId]);
            console.log("Fetched user: ", rows);
            if (!rows) return reply.code(404).send({ error: "User not found" });
            reply.send(rows[0]);
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Accept a friend request by requestId. RequestId is the id of the row in the friend_requests table
    // This will add a new row to the friends table for both users
    // And remove the request row from the friend_requests table
    fastify.post("/api/friendRequests/:id/accept", async (request, reply) => {
        const requestId = parseInt(request.params.id);
        if (!requestId) {
            return reply.code(400).send({ error: "Invalid request ID" });
        }
        try {
            // Get the friend request from the db
            const rows = await fetchAll(db, `SELECT * FROM friend_requests WHERE id = ?`, [requestId]);
            if (!rows) {
                return reply.code(404).send({ error: "Friend request not found" });
            }
            const friendRequest = rows[0];
            const { sender_id, receiver_id } = friendRequest;
            console.log("Accepting friend request from user:", sender_id, "to user:", receiver_id);
            // Add a new row to the friends table for both users
            await addRowToTable(db, "friends", "user_id, friend_id", `${sender_id}, ${receiver_id}`);
            await addRowToTable(db, "friends", "user_id, friend_id", `${receiver_id}, ${sender_id}`);
            // Remove the request from the friend_requests table
            await removeRowFromTable(db, "friend_requests", "id", `${requestId}`);
            reply.send({ success: true });
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Decline a friend request by requestId.
    // This will remove the request row from the friend_requests table
    fastify.post("/api/friendRequests/:id/decline", async (request, reply) => {
        const requestId = parseInt(request.params.id);
        if (!requestId) {
            return reply.code(400).send({ error: "Invalid request ID" });
        }
        try {
            console.log("Declining friend request with request id", requestId);
            await removeRowFromTable(db, "friend_requests", "id", `${requestId}`);
            reply.send({ success: true });
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Get the friend requests for a user by userId from the db
    // It shows the current pending friend requests for this user
    fastify.get("/api/users/:id/friendRequests", async (request, reply) => {
        const userId = parseInt(request.params.id);
        if (!userId) {
            return reply.code(400).send({ error: "Invalid user ID" });
        }
        try {
            const rows = await fetchAll(db, `SELECT * FROM friend_requests WHERE receiver_id = ?`, [userId]);
            console.log("Fetched friend requests: ", rows);
            // If there are no rows, return an empty array
            if (!rows) return reply.send([]);
            reply.send(rows);
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Get the users that the given user has sent friend requests to
    // Its needed to deactivate the friend request button on the frontend
    fastify.get("/api/users/:id/sentFriendRequests", async (request, reply) => {
        const userId = parseInt(request.params.id);
        if (!userId) {
            return reply.code(400).send({ error: "Invalid user ID" });
        }
        try {
            const rows = await fetchAll(db, `SELECT * FROM friend_requests WHERE sender_id = ?`, [userId]);
            console.log("Fetched sent friend requests: ", rows);
            if (!rows) return reply.send([]);
            reply.send(rows);
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // This will send a friend request to another user
    fastify.post("/api/users/:id/sendFriendRequest", async (request, reply) => {
        // Extract userId (the user which is sending the friend request) from the URL parameters
        const userId = parseInt(request.params.id);
        // Extract friendId (where the request should go to) from the request body
        const { friendId } = request.body;
        if (!friendId || !userId) {
            return reply.code(400).send({ error: "Invalid user ID or friend ID" });
        }
        console.log("Sending friend request from user:", userId, "to user:", friendId);
        // Check if there is already a friend request between these two users
        // And if the users are already friends
        // And if userId is blocked by friendId or the other way round
        try {
            const existingRequests = await fetchAll(db, `SELECT * FROM friend_requests WHERE
      (sender_id = ? AND receiver_id = ?) OR
      (sender_id = ? AND receiver_id = ?)`,
                [userId, friendId, friendId, userId]);
            if (existingRequests.length > 0) {
                return reply.code(400).send({ error: "There is already a pending friend request between these users" });
            }
            const existingFriends = await fetchAll(db, `SELECT * FROM friends WHERE
      (user_id = ? AND friend_id = ?) OR
      (user_id = ? AND friend_id = ?)`,
                [userId, friendId, friendId, userId]);
            if (existingFriends.length > 0) {
                return reply.code(400).send({ error: "These users are already friends" });
            }
            const blocks = await fetchAll(db, `SELECT * FROM blocks WHERE
      (user_id = ? AND blocked_user_id = ?) OR
      (user_id = ? AND blocked_user_id = ?)`,
                [userId, friendId, friendId, userId]);
            if (blocks.length > 0) {
                return reply.code(400).send({ error: "Cannot send friend request because one user has blocked the other" });
            }
        } catch (err) {
            return reply.code(500).send({ error: err.message });
        }
        // Add a new row to the friend_requests table
        try {
            await addRowToTable(db, "friend_requests", "sender_id, receiver_id", `${userId}, ${friendId}`);
            reply.send({ success: true });
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // This will unfriend a user by removing the row from the friends table
    // Row 1 (user_id = userId, friend_id = friendId)
    // Row 2 (user_id = friendId, friend_id = userId)
    fastify.post("/api/users/:id/unfriend", async (request, reply) => {
        const userId = parseInt(request.params.id);
        const { friendId } = request.body;
        if (!friendId || !userId) {
            return reply.code(400).send({ error: "Invalid user ID or friend ID" });
        }
        console.log("Unfriending user: ", friendId, "for user: ", userId);
        try {
            await removeRowFromTable(db, "friends", "user_id, friend_id", `${userId}, ${friendId}`);
            await removeRowFromTable(db, "friends", "user_id, friend_id", `${friendId}, ${userId}`);
            reply.send({ success: true });
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Get the friends for a user by userId from the db
    fastify.get("/api/users/:id/friends", async (request, reply) => {
        const userId = parseInt(request.params.id);
        if (!userId) {
            return reply.code(400).send({ error: "Invalid user ID" });
        }
        try {
            const rows = await fetchAll(db, `SELECT * FROM friends WHERE user_id = ?`, [userId]);
            console.log("Fetched friends: ", rows);
            if (!rows) return reply.send([]);
            reply.send(rows);
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Get the blocks for a user by userId from the db
    // users that this user has blocked
    fastify.get("/api/users/:id/blocks", async (request, reply) => {
        const userId = parseInt(request.params.id);
        if (!userId) {
            return reply.code(400).send({ error: "Invalid user ID" });
        }
        try {
            const rows = await fetchAll(db, `SELECT * FROM blocks WHERE user_id = ?`, [userId]);
            console.log("Fetched blocks: ", rows);
            if (!rows) return reply.send([]);
            reply.send(rows);
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Get the users that have blocked this user
    fastify.get("/api/users/:id/blockedBy", async (request, reply) => {
        const userId = parseInt(request.params.id);
        if (!userId) {
            return reply.code(400).send({ error: "Invalid user ID" });
        }
        try {
            const rows = await fetchAll(db, `SELECT * FROM blocks WHERE blocked_user_id = ?`, [userId]);
            console.log("Fetched blockedBy: ", rows);
            if (!rows) return reply.send([]);
            reply.send(rows);
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    // Adding a block Id to the user's block list
    fastify.post("/api/users/:id/block", async (request, reply) => {
        const userId = parseInt(request.params.id);
        const { blockId } = request.body;
        if (!blockId || !userId) {
            return reply.code(400).send({ error: "Invalid user ID or block ID" });
        }
        console.log("Blocking user: ", blockId, "for user: ", userId);
        try {
            console.log("Before adding row to blocks table");
            await addRowToTable(db, "blocks", "user_id, blocked_user_id", `${userId}, ${blockId}`);
            reply.send({ success: true });
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });

    fastify.post("/api/users/:id/unblock", async (request, reply) => {
        const userId = parseInt(request.params.id);
        const { unblockId } = request.body;
        if (!unblockId || !userId) {
            return reply.code(400).send({ error: "Invalid user ID or unblock ID" });
        }
        console.log("Unblocking user: ", unblockId, "for user: ", userId);
        try {
            await removeRowFromTable(db, "blocks", "user_id, blocked_user_id", `${userId}, ${unblockId}`);
            reply.send({ success: true });
        } catch (err) {
            reply.code(500).send({ error: err.message });
        }
    });
};
