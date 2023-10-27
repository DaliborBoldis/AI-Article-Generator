import fs from "fs";
import stream from "stream";
import fs_promise from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Checks whether a directory exists for a given email ID.
 * @param {string} email_ID - The ID of the email for which the existence of a directory is to be checked.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the directory exists.
 */
function ID_Exists(email_ID) {
	return new Promise(async (resolve, reject) => {
		// Prepare the directory path using the email ID
		await prepareDir(email_ID)
			.then((dir) => {
				// Check if the directory exists
				fs.promises
					.access(dir, fs.constants.F_OK)
					.then(() => {
						// Resolve to true if the directory exists
						console.log("This email ID already exists in the data folder.");
						resolve(true);
					})
					.catch(() => {
						// Resolve to false if the directory does not exist or there was an error
						resolve(false);
					});
			})
			.catch((error) => {
				console.error(`Error preparing directory for email ID ${email_ID}: ${error.message}`);

				// Reject the promise if there's an error in preparing the directory
				reject(new Error(`Error preparing directory for email ID ${email_ID}`));
			});
	});
}

/**
 * Saves email data to files in the prepared directory.
 * @param {object} data - An object containing email data to be saved.
 * @throws {string} - If there is an error during the file saving process.
 */
async function SaveData(data) {
	console.log("Saving data...");
	try {
		// Prepare the directory path using the email ID
		let dir = await prepareDir(data.id).catch((error) => {
			throw new Error(`Error preparing directory for email ID ${data.id} + Error message: ${error}`);
		});

		// Create the directory if it doesn't exist
		await CreateFolder(dir).catch((error) => {
			throw new Error(`Error creating directory ${dir} + Error message: ${error}`);
		});

		// Save data properties to files
		if (data.api_usage) await saveToFile(dir, data.api_usage, "api_cost.txt");
		if (data.email) await saveToFile(dir, data.email, "raw_email.txt");
		if (data.html) await saveToFile(dir, data.html, "email_html.html");
		if (data.article) await saveToFile(dir, data.article, "article.html");
		if (data.generated_response) await saveToFile(dir, data.generated_response, "generated_response.txt");
		if (data.NominationsJSON) await saveToFile(dir, data.NominationsJSON, "nominations.txt");
		if (data.ThankYouResponse) await saveToFile(dir, data.ThankYouResponse, "thankyou_note.txt");
		if (data.category) await saveToFile(dir, data.category, "email_category.txt");
		if (data.finalObject) await saveToFile(dir, data.finalObject, "response_object.txt");

		// Save attachments (if any) to the directory
		if (data.attachments) await saveAttachments(dir, data.attachments);

		console.log("All files saved for: " + data.id);
	} catch (error) {
		throw new Error(`From save_to_file.js: : ${error}`); // Throw an error if any saving operation fails
	}
}

/**
 * Saves data to a file in a specified directory. If the data is a Promise, it is awaited to get the actual value.
 * @param {string} dir - The directory where the file will be created.
 * @param {any} obj - The data to be written to the file. If this is a Promise, it will be awaited.
 * @param {string} file_name - The name of the file to be created.
 * @returns {Promise<void>} A promise that resolves when the file is successfully created, or rejects with an error if the file could not be created.
 */
async function saveToFile(dir, obj, file_name) {
	const data = await obj;

	// Write data to a file in the specified directory
	return fs_promise.writeFile(path.join(dir, file_name), data).catch((error) => {
		throw new Error(`Failed to create ${file_name} file: ${error}`);
	});
}

/**
 * Saves the attachments to files in the specified directory.
 * @param {string} dir - The directory where the attachments should be saved.
 * @param {Array} attachments - An array of attachments to be saved.
 * @throws {string} - If there is an error during the file saving process.
 */
async function saveAttachments(dir, attachments) {
	try {
		// Write attachments to files
		for (let attachment of attachments) {
			const output = fs.createWriteStream(dir + "//" + attachment.filename); // The path where you want to save the attachments
			const input = new stream.PassThrough();
			input.end(Buffer.from(attachment.content, "base64")); // Convert base64 encoded content to buffer
			input.pipe(output); // Pipe the input stream to the output stream to save the attachment content to the file
		}
	} catch (error) {
		throw new Error(`Failed to save attachments file: ${error}`); // Throw an error if any saving operation fails
	}
}

/**
 * Creates a folder (directory) at the specified path.
 * If the folder already exists, it will not throw an error.
 * @param {string} dir - The directory path to create.
 * @throws {string} - If there is an error during the directory creation process.
 */
async function CreateFolder(dir) {
	// Create the folder (directory) at the specified path
	await fs_promise.mkdir(dir, { recursive: true }).catch((error) => {
		throw new Error(`Failed to create directory: ${error}`); // Throw an error if the directory creation fails
	});
}

/**
 * Returns a Promise that resolves with the prepared directory path for saving email data based on the provided email ID.
 * Rejects with an error if there is an error during the directory preparation process.
 * @param {string} email_ID - The email ID for which the directory path needs to be prepared.
 * @returns {Promise<string>} - A Promise that resolves with the prepared directory path.
 * @throws {Error} - If there is an error during the directory preparation process.
 */
function prepareDir(email_ID) {
	return new Promise((resolve, reject) => {
		try {
			// Replace invalid characters in the email_ID with underscores
			let folder_id = email_ID.replace(/[<>:"\\/|?*@+=]/g, "_");

			// Get the current directory path
			let dirname = path.dirname(fileURLToPath(import.meta.url));

			// Join the current directory path with the data folder
			let dataFolder = path.join(dirname, "..", "data");

			// Check if the data directory exists, if not, create it
			if (!fs.existsSync(dataFolder)) {
				fs.mkdirSync(dataFolder, { recursive: true });
			}

			// Join the current directory path with the data folder and the email_ID folder
			let dir = path.join(dirname, "..", "data", folder_id);

			resolve(dir); // Resolve the Promise with the prepared directory path
		} catch (error) {
			reject(new Error("Failed to prepare directory: " + error)); // Reject the Promise with an error message if there is an error in the process
		}
	});
}

export { ID_Exists, SaveData };
