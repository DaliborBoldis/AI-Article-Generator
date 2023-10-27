import { getOpenAIResponse, resetTrackTokenUsage, track_token_usage } from "../openai.js";
import { ArchiveEmail } from "../imap.js";
import { retrievePineconeEmbeddings } from "../pinecone.js";
import { API_usage_report } from "../scripts.js";
import { ai_email_generator_instructions, ai_email_generator_JSON, getCategoryQuestion } from "../prompts.js";
import { SaveData } from "../save_to_file.js";

/**
 * Creates a prompt for email generation based on the given category.
 *
 * @async
 * @param {Object} category - An object that describes the category and contains an explanation for its use.
 * @returns {string} Returns a formatted string that includes instructions, previous reasoning, and JSON data for the given category.
 */
async function createEmailPrompt(category) {
	const categoryQuestions = getCategoryQuestion();

	return `${categoryQuestions.instructions}\nYour previous reasoning: ${category.explanation}\nINSTRUCTIONS: ${ai_email_generator_instructions}\nJSON: ${ai_email_generator_JSON}`;
}

/**
 * Processes emails of the "questions" category. Generates a response for each email, archives it, and tracks API usage.
 *
 * @async
 * @param {Object} emailData - The data of the email to be processed. Must include 'id', 'html', 'email', 'attachments', and 'uid'.
 * @param {Object} category - The category of the email to be processed, including an explanation for the category's use.
 * @throws {Error} Throws an error if there's a failure in any of the steps in the process.
 */
async function process_questions(emailData, category) {
	try {
		const { id, html, email, attachments, uid } = emailData;

		const system_prompt = await createEmailPrompt(category);
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, getCategoryQuestion().top_k);

		const response = await getOpenAIResponse(getCategoryQuestion().preferred_gpt, system_prompt, user_prompt);

		const parsedResponse = JSON.parse(response);

		const generated_response = `Generated subject for this email:\n${parsedResponse.subject}\nGenerated response for this email:\n${parsedResponse.message}`;
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
		console.error(`An error occurred in process_questions: ${error}`);

		await resetTrackTokenUsage(track_token_usage).catch((err) => {
			throw new Error(`Failed to reset token variable: ${err}`);
		});

		throw error;
	}
}

export default process_questions;
