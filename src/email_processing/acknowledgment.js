import { getOpenAIResponse, resetTrackTokenUsage, track_token_usage } from "../openai.js";
import { ArchiveEmail } from "../imap.js";
import { retrievePineconeEmbeddings } from "../pinecone.js";
import { API_usage_report } from "../scripts.js";
import { ai_email_generator_instructions, ai_email_generator_JSON, getCategoryAcknowledgment } from "../prompts.js";
import { SaveData } from "../save_to_file.js";

/**
 * Asynchronously creates an email prompt string for a given category.
 *
 * The function takes a category object and constructs an email prompt
 * based on the category's acknowledgment instructions, the user's previous reasoning,
 * and additional AI email generator instructions and JSON.
 *
 * @async
 * @param {object} category - The category object containing the instructions and explanation for the acknowledgment.
 * @returns {string} The email prompt string.
 */
async function createEmailPrompt(category) {
	const categoryAcknowledgment = getCategoryAcknowledgment();

	return `${categoryAcknowledgment.instructions}\nYour previous reasoning: ${category.explanation}\nINSTRUCTIONS: ${ai_email_generator_instructions}\nJSON: ${ai_email_generator_JSON}`;
}

/**
 * Asynchronously processes an acknowledgment email.
 *
 * This function takes email data and a category object as input, generates a response using the OpenAI API
 * based on the acknowledgment email prompt, and saves the data to files. It also resets the API token usage
 * and archives the email after processing.
 *
 * @async
 * @param {object} emailData - The email data object containing details of the email.
 * @param {object} category - The category object with acknowledgment instructions and explanation.
 * @throws {Error} If an error occurs during the process, it will be thrown with an error message.
 */
async function process_acknowledgment(emailData, category) {
	try {
		const { id, html, email, attachments, uid } = emailData;

		const system_prompt = await createEmailPrompt(category);
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, getCategoryAcknowledgment().top_k);

		const response = await getOpenAIResponse(getCategoryAcknowledgment().preferred_gpt, system_prompt, user_prompt);

		const parsedResponse = JSON.parse(response);

		const generated_response = `Generated subject for this email:\n${parsedResponse.subject}\n\nGenerated response for this email:\n${parsedResponse.message}`;

		let api_usage = await API_usage_report(track_token_usage).catch((error) =>
			console.error("Failed to generate usage report:", error)
		);

		const email_data = {
			api_usage,
			id,
			html,
			attachments,
			email,
			generated_response,
			category: JSON.stringify(category),
		};

		await SaveData(email_data);

		await resetTrackTokenUsage(track_token_usage);

		await ArchiveEmail(uid);
	} catch (error) {
		console.error(`An error occurred in process_acknowledgment: ${error}`);

		await resetTrackTokenUsage(track_token_usage).catch((err) => {
			throw new Error(`Failed to reset token variable: ${err}`);
		});

		throw error;
	}
}

export default process_acknowledgment;
