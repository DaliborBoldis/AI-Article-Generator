import { getOpenAIResponse, resetTrackTokenUsage, track_token_usage } from "../openai.js";
import { ArchiveEmail } from "../imap.js";
import { retrievePineconeEmbeddings } from "../pinecone.js";
import { API_usage_report } from "../scripts.js";
import { ai_email_generator_instructions, ai_email_generator_JSON, getCategoryDecline } from "../prompts.js";
import { SaveData } from "../save_to_file.js";

/**
 * Asynchronously creates an email prompt based on a specific category.
 *
 * @async
 * @param {object} category - An object representing a specific category.
 * @returns {Promise<string>} Returns a promise that resolves to a string representing the email prompt.
 */
async function createEmailPrompt(category) {
	const categoryDecline = getCategoryDecline();

	return `${categoryDecline.instructions}\nYour previous reasoning: ${category.explanation}\nINSTRUCTIONS: ${ai_email_generator_instructions}\nJSON: ${ai_email_generator_JSON}`;
}

/**
 * Asynchronously processes a decline email based on a specific category.
 *
 * @async
 * @param {object} emailData - An object representing the email data.
 * @param {object} category - An object representing a specific category.
 * @throws Will throw an error if the email processing fails.
 */
async function process_decline(emailData, category) {
	try {
		const { id, html, email, attachments, uid } = emailData;

		const system_prompt = await createEmailPrompt(category);
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, getCategoryDecline().top_k);

		const response = await getOpenAIResponse(getCategoryDecline().preferred_gpt, system_prompt, user_prompt);

		const parsedResponse = JSON.parse(response); // Second parse to get the actual JSON object

		let generated_response = `Generated subject for this email: ${parsedResponse.subject}\nGenerated response for this email: ${parsedResponse.message}`;

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
		console.error(`An error occured in process_decline: ${error}`);

		await resetTrackTokenUsage(track_token_usage).catch((err) => console.error("Failed to reset token variable:", err));

		throw error;
	}
}

export default process_decline;
