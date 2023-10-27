import { ArchiveEmail } from "../imap.js";

/**
 * Processes an email categorized as spam or promotion by moving it to the "Archive" folder.
 *
 * @async
 * @param {Object} emailData - An object that contains the unique ID (uid) of the email.
 *
 * @throws {Error} If an error occurs during the process, it will be thrown.
 */
async function process_spam_promotion(emailData) {
	try {
		// Destructure the emailData object
		const { uid } = emailData;

		// Move email to the "Archive" folder
		await ArchiveEmail(uid);
	} catch (error) {
		throw error;
	}
}

export default process_spam_promotion;
