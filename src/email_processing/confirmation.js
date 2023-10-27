import { getOpenAIResponse, resetTrackTokenUsage, track_token_usage } from "../openai.js";
import { ArchiveEmail } from "../imap.js";
import { retrievePineconeEmbeddings } from "../pinecone.js";
import { API_usage_report } from "../scripts.js";
import { ai_email_generator_instructions, ai_email_generator_JSON, getCategoryConfirmation } from "../prompts.js";
import { SaveData } from "../save_to_file.js";

/**
 * Asynchronously generates an email prompt based on a specific category.
 *
 * @async
 * @param {object} category - An object representing a specific category.
 * @returns {string} The email prompt.
 */
async function createEmailPrompt(category) {
	const categoryConfirmation = getCategoryConfirmation();

	return `${categoryConfirmation.instructions}\nYour previous reasoning: ${category.explanation}\nINSTRUCTIONS: ${ai_email_generator_instructions}\nJSON: ${ai_email_generator_JSON}`;
}

/**
 * Asynchronously processes confirmation emails.
 *
 * The process includes creating an email prompt based on the category,
 * retrieving embeddings for the prompt, obtaining an AI response,
 * parsing the response, and then generating a subject and message for the email.
 * The function also tracks API usage, saves the processed email data,
 * resets the token usage, and archives the email.
 *
 * @async
 * @param {object} emailData - The email data object.
 * @param {object} category - The category for the email.
 * @throws Will throw an error if the process fails at any step.
 */
async function process_confirmation(emailData, category) {
	try {
		const { id, html, email, attachments, uid } = emailData;

		const system_prompt = await createEmailPrompt(category);
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, getCategoryConfirmation().top_k);

		const response = await getOpenAIResponse(getCategoryConfirmation().preferred_gpt, system_prompt, user_prompt);

		const parsedResponse = JSON.parse(response);

		const generated_response = `Generated subject for this email:\n${parsedResponse.subject}\nGenerated response for this email:\n${parsedResponse.message}`;

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
		console.error(`An error occured in process_confirmation: ${error}`);

		await resetTrackTokenUsage(track_token_usage).catch((err) => {
			throw new Error(`Failed to reset token variable: ${err}`);
		});

		throw error;
	}
}

export default process_confirmation;
