import { getOpenAIResponse, resetTrackTokenUsage, track_token_usage } from "../openai.js";
import { ArchiveEmail } from "../imap.js";
import { retrievePineconeEmbeddings } from "../pinecone.js";
import { API_usage_report } from "../scripts.js";
import { ai_email_generator_instructions, ai_email_generator_JSON, getCategoryUnsubscribe } from "../prompts.js"; // Import the unsubscribe category prompts
import { SaveData } from "../save_to_file.js";

/**
 * Constructs the email prompt for the AI, including the unsubscribe instructions, previous reasoning, and further instructions.
 *
 * @param {Object} category - An object that holds the information related to the category.
 *
 * @returns {Promise<string>} A promise that resolves with the constructed email prompt string.
 */
async function createEmailPrompt(category) {
	const categoryUnsubscribe = getCategoryUnsubscribe();

	return `${categoryUnsubscribe.instructions}\nYour previous reasoning: ${category.explanation}\nINSTRUCTIONS: ${ai_email_generator_instructions}\nJSON: ${ai_email_generator_JSON}`;
}

/**
 * Processes an email for unsubscription: generates a response, generates and reports API usage, saves data, resets token usage, and archives the email.
 *
 * @async
 * @param {Object} emailData - An object that contains various properties of the email including id, html, email, attachments, and uid.
 * @param {Object} category - An object that holds the information related to the category.
 *
 * @throws {Error} If any error occurs during the processing, the function will throw an error and reset the token usage.
 */
async function process_unsubscribe(emailData, category) {
	try {
		const { id, html, email, attachments, uid } = emailData;

		const system_prompt = await createEmailPrompt(category);
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, getCategoryUnsubscribe().top_k);

		const response = await getOpenAIResponse(getCategoryUnsubscribe().preferred_gpt, system_prompt, user_prompt);

		const parsedResponse = JSON.parse(response);

		const generated_response = `Generated subject for this email: ${parsedResponse.subject}\nGenerated response for this email: ${parsedResponse.message}`;
		console.log(generated_response);

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
		console.error(`An error occured in process_unsubscribe: ${error}`);

		await resetTrackTokenUsage(track_token_usage).catch((err) => console.error("Failed to reset token variable:", err));

		throw error;
	}
}

export default process_unsubscribe;
