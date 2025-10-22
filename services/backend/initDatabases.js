// Initialize the database and create tables if they do not exist
// Tabels: users, messages, settings
export function initDb(db) {
	db.serialize(() => {
		// Create users table with id (number), username (unique string), email (unique string), password hash (string),
		// authenticator key (unique string),number of wins (number), number of losses (number), level (number), status (string),
		// if 2fa is enabled (boolean, 0 or 1), and creation date (datetime SQL type).
		db.run(`
			CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			email TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			totp_secret TEXT UNIQUE,
			wins INTEGER DEFAULT 0,
			losses INTEGER DEFAULT 0,
			level INTEGER DEFAULT 1,
			status TEXT DEFAULT 'ok',
			mfa_enabled BOOL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`);
		// Create messages table with id <INTEGER PRIMARY KEY>, userId <INTEGER>, content <TEXT>, timestamp <DATETIME DEFAULT CURRENT_TIMESTAMP>
		db.run(`CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY,
			userId INTEGER,
			content TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(userId) REFERENCES users(id)
			)
		`);
		// Create settings table. Each user has its own settings like: 2FA enabled/disabled, ... (key-value pairs)
		// As soon as we add a user, we need to add default settings for this user
		// id: Id of the setting
		// user_id: Id of the user
		// UNIQUE(key): To make sure, that each setting is only once in the table
		db.run(`CREATE TABLE IF NOT EXISTS settings (
			id INTEGER PRIMARY KEY,
			user_id INTEGER,
			key TEXT NOT NULL,
			value TEXT,
			UNIQUE(key, user_id),
			FOREIGN KEY(user_id) REFERENCES users(id)
			)
		`);

		// Create a friend_requests table to store pending friend requests
		db.run(`CREATE TABLE IF NOT EXISTS friend_requests (
			id INTEGER PRIMARY KEY,
			sender_id INTEGER,
			receiver_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(sender_id) REFERENCES users(id),
			FOREIGN KEY(receiver_id) REFERENCES users(id)
			)
		`);

		// Create a friends table to store friend relationships
		// id: Id of the relationship
		// user_id: Id of the user
		// friend_id: Id of the friend
		// created_at: Timestamp
		// FOREIGN KEY(user_id) ...: To make sure, that user_id exists in users table
		// FOREIGN KEY(friend_id) ...: To make sure, that friend_id exists in users table
		db.run(`CREATE TABLE IF NOT EXISTS friends (
			id INTEGER PRIMARY KEY,
			user_id INTEGER,
			friend_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id),
			FOREIGN KEY(friend_id) REFERENCES users(id)
			)
		`);

		// Create a blocks table to store blocked users
		db.run(`CREATE TABLE IF NOT EXISTS blocks (
			id INTEGER PRIMARY KEY,
			user_id INTEGER,
			blocked_user_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id),
			FOREIGN KEY(blocked_user_id) REFERENCES users(id)
			)
		`);	

		// Insert default settings if they do not exist
		db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [
			"app_name",
			"Fastify WebSocket Example",
		]);
		// Insert default version if it does not exist
		db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [
			"version",
			"1.0.0",
		]);
	});
};
