
// Run SQL queries with parameters and return a promise
// Code from: https://www.sqlitetutorial.net/sqlite-nodejs/query/
export const fetchAll = async (db, sql, params) => {
	return new Promise((resolve, reject) => {
		db.all(sql, params, (err, rows) => {
			if (err) reject(err);
			resolve(rows || []);
		});
	});
};

// Edits a row in a table (friend_requests, users, messages, settings, friends, blocks) in the db
// Example command:
// UPDATE ${table} SET ${column} = '${colValue}' WHERE ${keys} = '${keyValues}'
// UPDATE friend_requests SET status = 'accepted' WHERE id = 1 AND sender_id = 2
export const updateRowInTable = async (db, table, column, keys, keyValues, colValue) => {
	let keyArray = keys.split(",").map((k) => k.trim());
	let keyValuesArray = keyValues.split(",").map((k) => k.trim());

	console.log(`Updating element in table ${table}, where ${keys} = ${keyValues} to set ${column} = ${colValue}`);
	try {
		if (keyArray.length !== keyValuesArray.length) {
			throw new Error("Keys and keyValues must have the same length");
		}

		let sqlCmd = `UPDATE ${table} SET ${column} = '${String(colValue)}' `;
		keyArray.forEach((element, index) => {
			sqlCmd += (index === 0 ? "WHERE " : " AND ") + `${element} = '${String(keyValuesArray[index])}'`;
		});

		console.log(`Executing SQL: ${sqlCmd}`);
		await db.run(sqlCmd);
	} catch (error) {
		console.error("Error updating element in table: ", error);
	}
}

// Adds a row to a table in the db
// Example command:
// INSERT INTO ${table} (${columns}) VALUES (${values})
// INSERT INTO friend_requests (sender_id, receiver_id) VALUES (1, 2)
export const addRowToTable = async (db, table, columns, values) => {
	try {
		console.log(`Adding row to table ${table}, columns: ${columns}, values: ${values}`);
		// If the table already contains a row with the same unique keys and values, do nothing
		if (!columns || !values) {
			return;
		}
		// Check if the table already contains a row with the same unique keys and values. If so, just return
		// First get the unique columns of the table
		const tableData = await fetchAll(db, `SELECT * FROM ${table}`);
		if (tableData.length !== 0) {
			// Unique columns are all columns except id, created_at
			const uniqueColumns = Object.keys(tableData[0]).filter((col) => col !== "id" && col !== "created_at");
			console.log("Unique columns of table ", table, ": ", uniqueColumns);
			// "sender_id, receiver_id" into ["sender_id", "receiver_id"]
			const columnArray = columns.split(",").map((c) => c.trim()).filter((c) => uniqueColumns.includes(c));
			// "1, 2" into ["1", "2"]
			const valueArray = values.split(",").map((v) => v.trim());
			console.log("Column array: ", columnArray);
			console.log("Value array: ", valueArray);
			// Build a WHERE clause like "sender_id = '1' AND receiver_id = '2'"
			let where = "";
			for (let i = 0; i < columnArray.length; i++) {
				const col = columnArray[i];
				if (where !== "") {
					where += " AND ";
				}
				where += `${col} = '${String(valueArray[i])}'`;
			}
			console.log("WHERE clause: ", where);
			if (where !== "") {
				// Get the existing rows with the same unique keys and values
				const existingRows = await fetchAll(db, `SELECT * FROM ${table} WHERE ${where}`);
				// If there are existing rows, it means we should not insert that same row again
				if (existingRows.length > 0) {
					console.log("Row already exists in table, not adding: ", existingRows);
					return;
				}
			}
		}

		const sqlCmd = `INSERT INTO ${table} (${columns}) VALUES (${values})`;
		console.log(`Executing SQL: ${sqlCmd}`);
		await db.run(sqlCmd);
	} catch (error) {
		console.error("Error adding row to table: ", error);
	}
};

// Removes a row from a table in the db
// Example command:
// DELETE FROM ${table} WHERE ${keys} = '${keyValues}'
// DELETE FROM friend_requests WHERE id = 1 AND sender_id = 2
export const removeRowFromTable = async (db, table, keys, keyValues) => {
	let keyArray = keys.split(",").map((k) => k.trim());
	let keyValuesArray = keyValues.split(",").map((k) => k.trim());

	console.log(`Removing element from table ${table}, where ${keys} = ${keyValues}`);
	try {
		if (keyArray.length !== keyValuesArray.length) {
			throw new Error("Keys and keyValues must have the same length");
		}

		let sqlCmd = `DELETE FROM ${table} `;
		keyArray.forEach((element, index) => {
			sqlCmd += (index === 0 ? "WHERE " : " AND ") + `${element} = '${String(keyValuesArray[index])}'`;
		});

		console.log(`Executing SQL: ${sqlCmd}`);
		await db.run(sqlCmd);
	} catch (error) {
		console.error("Error removing element from table: ", error);
	}
};

// Adds an element to a users table column => (adding friends, blocking users, etc.)
export const addElementToColumn = async (db, column, userId, elementId) => {
	console.log(`Adding element ${elementId} to column ${column} for user ${userId}`);
	try {
		const row = await fetchAll(db, `SELECT ${column} FROM users WHERE id = ?`, [userId]);
		if (row.length === 0) {
			console.log("No user found with id: ", userId);
			return;
		}
		console.log("Row data: ", row);
		console.log("Column data: ", row[0]);
		console.log("Column data for column ", column, ": ", row[0][column]);

		const data = row[0]?.[column];
		if (!data || data === "") {
			// If the column is empty, just set it to the new elementId
			await db.run(`UPDATE users SET ${column} = ? WHERE id = ?`, [String(elementId), userId]);
			console.log("Element added successfully to empty column");
			return;
		}
		// Split "  3, 5,7 " into ["  3", " 5", "7 "] and then into ["3", "5", "7"]
		let oldData = data.split(",").map((id) => id.trim());

		// If the id is already in the list, do nothing
		if (oldData.includes(String(elementId))) {
			console.log("Element already in the list: ", elementId);
			return;
		}

		console.log("Old data: ", oldData);
		// Add the new id to the list
		oldData.push(String(elementId));
		const newData = oldData.join(",");
		console.log("New data: ", newData);
		await db.run(`UPDATE users SET ${column} = ? WHERE id = ?`, [newData, userId]);
		console.log("Element added successfully");
	} catch (err) {
		console.error("Error adding element to table: ", err);
		return;
	}
};

export const removeElementFromColumn = async (db, column, userId, elementId) => {
	console.log(`Removing element ${elementId} from column ${column} for user ${userId}`);
	try {
		const row = await fetchAll(db, `SELECT ${column} FROM users WHERE id = ?`, [userId]);
		if (!row || row.length === 0) {
			console.log("No user found with id: ", userId);
			return;
		}
		console.log("Row data: ", row);
		console.log("Column data: ", row[0]);
		console.log("Column data for column ", column, ": ", row[0][column]);
		const data = row[0]?.[column];

		if (!data || data === "") {
			console.log("Column is empty, nothing to remove");
			return;
		}
		let oldData = data.split(",").map((id) => id.trim());

		// If the id is not in the list, do nothing
		if (!oldData.includes(String(elementId))) {
			console.log("Element not found in the list: ", elementId);
			return;
		}
		console.log("Old data: ", oldData);
		// Remove the id from the list. Keep all elements that are not equal to elementId
		oldData = oldData.filter((id) => id !== String(elementId));
		const newData = oldData.join(",");
		console.log("New data: ", newData);
		await db.run(`UPDATE users SET ${column} = ? WHERE id = ?`, [newData, userId]);
		console.log("Element removed successfully");
	} catch (err) {
		console.error("Error removing element from table: ", err);
		return;
	}
};