import { getOpenAIResponse, resetTrackTokenUsage, track_token_usage, models } from "../openai.js";
import { ArchiveEmail } from "../imap.js";
import { createPromptStrings, API_usage_report, delay } from "../scripts.js";
import generateArticle from "./article_generator.js";
import { generate_keywords, keywords_template, getBusinessDetails, getNominations, qa_request } from "../prompts.js";
import { SaveData } from "../save_to_file.js";
import { getMissingBusinessDetails } from "../dynamic_agents/dynamic_agent.js";
import { processNominationsJSON } from "./nominations.js";
import { retrievePineconeEmbeddings } from "../pinecone.js";

/**
 * Asynchronously processes answer emails.
 *
 * The process includes destructuring email data, getting message details,
 * retrieving answers to questions, getting keywords, and business details.
 * It also gets nominations based on business details and category,
 * merges the obtained objects together, and generates the article based on the final object.
 * The function also tracks API usage, saves the processed email data,
 * resets the token usage, and archives the email.
 *
 * @async
 * @param {object} emailData - The email data object.
 * @param {object} category - The category for the email.
 * @throws Will throw an error if the process fails at any step.
 */
async function process_answers(emailData, category) {
	try {
		const { id, html, email, emailHeaders, attachments, uid } = emailData; // Destructure the emails object

		// Get message details from email
		const message_details_Object = {
			original_message: [
				{ From: emailHeaders.from, To: emailHeaders.to, Subject: emailHeaders.subject, Date: emailHeaders.date },
			],
		};

		// Get answers to questions
		const QA_Object = await get_QAObject();

		// Get keywords object
		const keywords_Object = await get_KeywordsObject(QA_Object).catch((error) => {
			console.log(error);
		});

		// Get business details
		const businessDetails_Object = await get_BusinessDetailsObject();

		// Get nominations
		const nominations_Object = await get_Nominations(businessDetails_Object, category).catch((error) => {
			console.log(error);
		});

		// Finally, merge objects together
		let finalObject = {
			...QA_Object,
			...message_details_Object,
			...keywords_Object,
			...businessDetails_Object,
			...nominations_Object,
		};

		let api_usage = await API_usage_report(track_token_usage).catch((error) =>
			console.error("Failed to generate usage report:", error)
		);

		const article = await generateArticle(finalObject);

		const email_data = {
			api_usage,
			id,
			html,
			email: JSON.stringify(email),
			attachments,
			article,
			NominationsJSON: JSON.stringify(nominations_Object),
			finalObject: JSON.stringify(finalObject),
		};

		// Save email data to files
		await SaveData(email_data);

		// Reset API usage tracker
		await resetTrackTokenUsage(track_token_usage);

		// Move email to the "Archive" folder
		await ArchiveEmail(uid);
	} catch (error) {
		console.error(error);
		// Reset API usage tracker
		await resetTrackTokenUsage(track_token_usage).catch((err) => {
			throw new Error("Failed to reset token variable: " + err);
		});
	}
}

/**
 * Asynchronously extracts nominations from an email.
 *
 * The process includes retrieving the nominations, creating a system prompt,
 * retrieving Pinecone embeddings for the prompt, getting OpenAI responses,
 * parsing the response, checking if there are nominations, and updating nominations JSON.
 *
 * @async
 * @param {object} businessDetails_Object - The business details object.
 * @returns {object} The nominations object if there are nominations; otherwise, an error is thrown.
 * @throws Will throw an error if the process fails at any step.
 */
async function get_Nominations(businessDetails_Object) {
	try {
		console.log("Extracting nominations from email...");
		const nominations = getNominations();

		const system_prompt = `INSTRUCTIONS: ${nominations.instructions}\nJSON: ${nominations.json}`;

		// Retrieve Pinecone embeddings for the prompt
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, nominations.top_k);

		const response = await getOpenAIResponse(nominations.preferred_gpt, system_prompt, user_prompt);

		const parsed_response = JSON.parse(response);

		let nominations_object = { nominations: parsed_response };

		const hasNominations = (nom) => {
			return !Object.values(nom.nominations["0"]).every((value) => value === "");
		};

		// Only add nominations_Object if it has values, but ask LLM agent to find missing information first
		if (hasNominations(nominations_object)) {
			console.log("Updating nominations JSON...");

			return await processNominationsJSON(businessDetails_Object, nominations_object);
		} else {
			return nominations_object;
		}
	} catch (error) {
		throw `Failed to extract nominations from email body: ${error}`;
	}
}

/**
 * Asynchronously extracts business details from an email.
 *
 * The process includes retrieving the business details, creating a system prompt,
 * retrieving Pinecone embeddings for the prompt, getting OpenAI responses,
 * parsing the response, and updating the business details object.
 *
 * @async
 * @returns {object} The updated business details object.
 * @throws Will throw an error if the process fails at any step.
 */
async function get_BusinessDetailsObject() {
	try {
		console.log("Extracting business details from email...");
		const business_details = getBusinessDetails();

		const system_prompt = `REQUEST: ${qa_request}\nINSTRUCTIONS:${business_details.instructions}\nJSON: ${business_details.json}`;

		// Retrieve Pinecone embeddings for the prompt
		const user_prompt = await retrievePineconeEmbeddings(system_prompt, business_details.top_k);

		const response = await getOpenAIResponse(business_details.preferred_gpt, system_prompt, user_prompt);

		const parsed_response = JSON.parse(response);

		const business_details_object = { bussines_details: parsed_response };

		// Ask LLM agent to update business details
		const updated_business_details_object = await getMissingBusinessDetails(business_details_object);

		return updated_business_details_object;
	} catch (error) {
		throw `Failed to extract business details from email body: ${error}`;
	}
}

/**
 * Asynchronously generates keywords from the provided answers in the QA_Object.
 *
 * The process includes concatenating the answers to generate keywords from them,
 * creating a system prompt and user prompt, getting OpenAI responses,
 * and returning the keywords as a keywords_object.
 *
 * @async
 * @param {object} QA_Object - An object containing question and answer data.
 * @returns {object} The keywords object containing the generated keywords.
 * @throws Will throw an error if the process fails at any step.
 */
async function get_KeywordsObject(QA_Object) {
	try {
		console.log("Getting keywords with OpenAI...");
		// Concatenate answers to generate keywords from them
		let concatenated_answers = QA_Object.QA.map((qa) => qa.a);

		let system_prompt = `REQUEST: ${generate_keywords}\n KEYWORDS TEMPLATE: ${keywords_template}`;
		let user_prompt = concatenated_answers.join(" ");

		const response = await getOpenAIResponse(models.gpt35, system_prompt, user_prompt);

		let keywords_object = { QA_keywords: response };

		return keywords_object;
	} catch (error) {
		throw `Failed to generate keywords from business answers: ${error}`;
	}
}

/**
 * Asynchronously retrieves the question and answer data from the email body using OpenAI.
 *
 * The process includes creating prompt strings for the email body,
 * making requests to OpenAI API with the prompt strings,
 * and returning the question and answer data as a responseObject.
 *
 * @async
 * @returns {object} The responseObject containing the question and answer data.
 * @throws Will throw an error if the process fails at any step.
 */
async function get_QAObject() {
	try {
		console.log("Getting QA with OpenAI...");
		const promptObjects = await createPromptStrings();

		let responses = [];

		for (let promptObject of promptObjects) {
			try {
				const response = await getOpenAIResponse(
					promptObject.preferred_gpt,
					promptObject.system_prompt,
					promptObject.user_prompt
				);
				const parsedResponse = JSON.parse(response);

				responses.push(parsedResponse);
				await delay(500);
			} catch (error) {
				console.log(error);
			}
		}

		let responseObject = { QA: responses };

		return responseObject;
	} catch (error) {
		throw `Failed to extract QA from email body: ${error}`;
	}
}

export default process_answers;
