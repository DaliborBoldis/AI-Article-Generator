import { fetchEmails } from "./src/imap.js";
import { ID_Exists } from "./src/save_to_file.js";
import { models } from "./src/openai.js";

import { generatePineconeEmbeddings, retrievePineconeEmbeddings } from "./src/pinecone.js";
import { getOpenAIResponse } from "./src/openai.js";

import process_answers from "./src/email_processing/answers.js";
import { process_nominations } from "./src/email_processing/nominations.js";
import process_questions from "./src/email_processing/questions.js";
import process_unsubscribe from "./src/email_processing/unsubscribe.js";
import process_acknowledgment from "./src/email_processing/acknowledgment.js";
import process_confirmation from "./src/email_processing/confirmation.js";
import process_decline from "./src/email_processing/decline.js";
import process_spam_promotion from "./src/email_processing/spam_or_promotion.js";

import { getCategorizeEmailPrompt } from "./src/prompts.js";

/**
 * checkInbox is an asynchronous function that periodically checks for new emails,
 * processes them and categorizes them using AI. It fetches emails, generates their embeddings,
 * categorizes them and then processes them according to their category.
 * @throws Will throw an error if any issue occurs in fetching or processing the emails.
 */
async function checkInbox() {
	try {
		const emails = await getEmails(); // Fetches emails

		for (let i = 0; i < emails.length; i++) {
			const { id, email } = emails[i]; // Destructure the emails object

			// Checks if the email has already been processed
			if (await ID_Exists(id)) continue;

			const categorizeEmailPrompt = getCategorizeEmailPrompt();
			const systemPrompt = `INSTRUCTIONS: ${categorizeEmailPrompt.instructions}\nJSON: ${categorizeEmailPrompt.json}`;

			// Generates email embeddings
			await generateEmailEmbeddings(email);

			const userPrompt = await getPromptEmbeddings(systemPrompt, categorizeEmailPrompt.top_k);

			console.log("Getting openai to determine category...");

			// Uses AI to determine the category of the email
			const emailCategory = await getEmailCategory(systemPrompt, userPrompt);

			// Processes the email if a category is identified
			if (emailCategory) await processEmail(emails[i], emailCategory);
		}
	} catch (error) {
		console.log(error);
	}
}

/*
In JavaScript, you can use an object key without quotes if it follows the naming conventions for identifiers
(such as starting with a letter, $, or _, and not including spaces or special characters).
Prettier is just removing the unnecessary quotes from the keys that follow this convention.
This doesn't change the functionality or meaning of this code. The keys are still strings, whether they're quoted or not.
In other words, this is perfectly fine and this code will work as expected.
*/
const categoryFunctions = {
	Answers: process_answers,
	Nominations: process_nominations,
	Questions: process_questions,
	"Unsubscribe request": process_unsubscribe,
	Acknowledgment: process_acknowledgment,
	Confirmation: process_confirmation,
	"Decline to Participate": process_decline,
	"Spam or Promotion": process_spam_promotion,
};

/**
 * Asynchronously fetches emails. In case of any error, it logs the error
 * and returns an empty array.
 * @returns {Promise<Array>} A promise that resolves to an array of emails.
 * @throws Will log an error message if the fetch operation fails.
 */
const getEmails = async () =>
	await fetchEmails().catch((err) => {
		console.error("Fetching emails failed. Reason: " + err);
		return [];
	});

/**
 * Asynchronously generates Pinecone embeddings for a given email.
 * In case of any error, it logs the error and returns null.
 * @param {string} email - The email to generate embeddings for.
 * @returns {Promise<null|Object>} A promise that resolves to Pinecone embeddings or null if an error occurs.
 * @throws Will log an error message if the generation of embeddings fails.
 */
const generateEmailEmbeddings = async (email) =>
	await generatePineconeEmbeddings(email).catch((err) => {
		console.error("Generating Pinecone embeddings failed. Reason: " + err);
		return null;
	});

/**
 * Asynchronously retrieves Pinecone embeddings for a given system prompt and top-k selection.
 * In case of any error, it logs the error and returns null.
 * @param {string} systemPrompt - The system prompt to generate embeddings for.
 * @param {number} topK - The top-k selection for the prompt.
 * @returns {Promise<null|Object>} A promise that resolves to Pinecone embeddings or null if an error occurs.
 * @throws Will log an error message if the retrieval of embeddings fails.
 */
const getPromptEmbeddings = async (systemPrompt, topK) =>
	await retrievePineconeEmbeddings(systemPrompt, topK).catch((err) => {
		console.error("Retrieving Pinecone embeddings failed. Reason: " + err);
		return null;
	});

/**
 * Asynchronously retrieves the category of an email using OpenAI's GPT-4 model.
 * The system prompt and user prompt are passed to the model to get a response, which is then parsed as JSON.
 * In case of any error, it logs the error and returns null.
 * @param {string} systemPrompt - The system prompt used to generate the model response.
 * @param {string} userPrompt - The user prompt used to generate the model response.
 * @returns {Promise<null|Object>} A promise that resolves to the email category as JSON, or null if an error occurs.
 * @throws Will log an error message if getting the email category fails.
 */
const getEmailCategory = async (systemPrompt, userPrompt) =>
	await getOpenAIResponse(models.gpt4, systemPrompt, userPrompt)
		.then(JSON.parse)
		.catch((err) => {
			console.error("Getting category failed. Reason: " + err);
			return null;
		});

/**
 * Asynchronously processes an email based on its category.
 * The email data and its category are passed to the process_email function.
 * In case of any error, it logs the error.
 * @param {Object} emailData - The data of the email to be processed.
 * @param {string} email_category - The category of the email.
 * @returns {Promise<void>} A promise that resolves when the email has been processed.
 * @throws Will log an error message if the processing of the email fails.
 */
const processEmail = async (emailData, email_category) =>
	await process_email(emailData, email_category).catch((err) => console.error("Processing email failed. Reason: " + err));

/**
 * Asynchronously processes an email based on its category. It determines the appropriate function
 * to process the email by looking up the category in the categoryFunctions object.
 * @param {Object} emailData - The data of the email to be processed.
 * @param {Object} email_category - The category of the email.
 * @returns {Promise<string>} A promise that resolves to a success message if the email is processed successfully.
 * @throws {Error} Will throw an error if the category does not exist in categoryFunctions object.
 *                 Will also log an error message if any error occurs during the process.
 */
async function process_email(emailData, email_category) {
	console.log(email_category);
	try {
		// Fetches the function associated with the category of the email from the categoryFunctions object.
		const processFunction = categoryFunctions[email_category.category];

		// Throws an error if the category does not exist in the categoryFunctions object.
		if (!processFunction) throw new Error(`Invalid category: ${email_category.category}`);

		// Process the email using the fetched function.
		await processFunction(emailData, email_category);
	} catch (error) {
		console.error(`Processing category failed. Reason: ${error.message}`);
		// Returns an error message.
		return `Processing category failed. Reason: ${error.message}`;
	}
}

checkInbox();
